import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  validasiSeri, kelompokPerJenis, contohNomor, type SeriRingkas,
} from '../../lib/penomoran.js'

/**
 * PENOMORAN DOKUMEN (F1) — pengaturan seri nomor.
 *
 * ── Yang TIDAK disediakan rute ini, dengan sengaja
 *
 * MEMUNDURKAN `last_number`. Nomor dokumen yang sudah terbit tak boleh lahir
 * kembali, bahkan kalau dokumennya dibatalkan — lubang pada urutan nomor
 * adalah perilaku yang benar (migrasi 135).
 *
 * Satu-satunya alasan orang ingin memundurkannya adalah "supaya rapi kembali",
 * dan hasilnya nomor kembar pada dokumen yang sudah terkirim ke pihak ketiga.
 * Jadi tak ada endpoint-nya sama sekali — bukan endpoint bergerbang izin, yang
 * cepat atau lambat akan diberikan ke seseorang.
 *
 * MEMBUAT seri baru juga tidak: seri lahir sendiri saat dokumen pertama jenis
 * itu dinomori (`ON CONFLICT DO UPDATE` di `next_document_number`). Seri yang
 * dibuat tangan berisiko salah `doc_type`, dan seri yatim tak terlihat siapa
 * pun sampai nomornya bertabrakan.
 *
 * ── Tenancy
 *
 * `document_number_series` kategori B — `company_id` langsung.
 */
export default async function penomoranRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'

  // ── GET /api/v1/penomoran ────────────────────────────────────────────────
  app.get(
    '/api/v1/penomoran',
    { preHandler: [authenticate, requirePermission('penomoran:view')] },
    async (request, reply) => {
      const db = request.db!

      const { data, error } = await db.unsafe('document_number_series', ALASAN)
        .select('doc_type, period, prefix, padding, last_number, updated_at')
        .eq('company_id', request.companyId!)
        .order('doc_type')
      if (error) return reply.status(500).send({ error: error.message })

      const baris = (data ?? []) as unknown as SeriRingkas[]
      const jenis = kelompokPerJenis(baris)

      // Contoh nomor BERIKUTNYA dihitung DI SINI, bukan dengan memanggil
      // `next_document_number_full()`. Fungsi itu MENAIKKAN counter — memakainya
      // untuk pratinjau membakar satu nomor tiap kali halaman dibuka, dan
      // lubang pada urutan nomor karena orang melihat-lihat adalah cacat yang
      // sulit dijelaskan.
      const hasil = jenis.map((j) => ({
        ...j,
        contoh_berikutnya: j.terbaru
          ? contohNomor({
              prefix: j.prefix,
              periode: j.terbaru.period,
              padding: j.padding,
              urut: Number(j.terbaru.last_number) + 1,
            })
          : null,
      }))

      return reply.send({ penomoran: hasil })
    },
  )

  // ── PATCH /api/v1/penomoran/:docType ─────────────────────────────────────
  //
  // Mengubah prefix & lebar nomor untuk SELURUH periode jenis itu.
  //
  // Kenapa seluruh periode, bukan periode terbaru saja: prefix adalah identitas
  // dokumen perusahaan, bukan keputusan per-bulan. Mengubahnya hanya pada
  // periode berjalan membuat invoice Agustus berprefix baru sementara September
  // — yang serinya belum lahir — kembali ke prefix lama, karena baris barunya
  // dibuat dengan prefix '' oleh fungsi counter.
  app.patch<{
    Params: { docType: string }
    Body: { prefix?: string; padding?: number | string }
  }>(
    '/api/v1/penomoran/:docType',
    { preHandler: [authenticate, requirePermission('penomoran:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const { docType } = request.params
      const b = request.body ?? {}

      const v = validasiSeri({ prefix: b.prefix, padding: b.padding })
      if (!v.ok) return reply.status(400).send({ error: v.galat })

      // Seri WAJIB sudah ada. Rute ini tak membuat seri baru (lihat header):
      // `docType` salah ketik akan diam-diam membuat seri yatim yang tak
      // pernah dipakai siapa pun, dan tak ada galat yang menandainya.
      const { data: adaSeri, error: errBaca } = await db.unsafe('document_number_series', ALASAN)
        .select('doc_type, period, prefix, padding, last_number')
        .eq('company_id', request.companyId!)
        .eq('doc_type', docType)
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!adaSeri || adaSeri.length === 0) {
        return reply.status(404).send({
          error: `Belum ada seri nomor untuk "${docType}". Seri lahir sendiri saat `
            + 'dokumen pertama jenis itu diterbitkan.',
        })
      }

      const sebelum = adaSeri.map((s) => {
        const r = s as Record<string, unknown>
        return { period: r.period, prefix: r.prefix, padding: r.padding }
      })

      const { data, error } = await db.unsafe('document_number_series', ALASAN)
        .update({ prefix: v.prefix, padding: v.padding, updated_at: new Date().toISOString() })
        .eq('company_id', request.companyId!)
        .eq('doc_type', docType)
        .select('doc_type, period, prefix, padding, last_number')
      if (error) {
        // CHECK basis menegakkan hal yang sama dengan `validasiSeri` — importer
        // dan psql menulis ke sini juga. Sampai di sini berarti keduanya
        // berselisih, dan pesan basisnya lebih dipercaya daripada 500 kosong.
        if (/check_violation|violates check/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({
          error: 'Seri berubah dari tempat lain. Muat ulang halaman.',
        })
      }

      // Prefix menentukan bentuk nomor dokumen yang KELUAR ke pihak ketiga —
      // perubahannya dicatat dengan nilai lama, supaya pertanyaan "kenapa
      // invoice Juli berprefix lain" punya jawaban.
      void logAuditEvent(request, {
        tableName: 'document_number_series', recordId: docType,
        action: 'penomoran.ubah',
        actorId: request.currentUser!.id,
        oldValues: { seri: sebelum },
        newValues: { doc_type: docType, prefix: v.prefix, padding: v.padding },
        severity: 'critical',
      })

      const terbaru = [...(data as unknown as SeriRingkas[])]
        .sort((a, b2) => b2.period.localeCompare(a.period))[0]

      return reply.send({
        penomoran: data,
        contoh_berikutnya: terbaru
          ? contohNomor({
              prefix: v.prefix,
              periode: terbaru.period,
              padding: v.padding,
              urut: Number(terbaru.last_number) + 1,
            })
          : null,
        pesan: `Prefix ${docType} diubah untuk ${data.length} periode. `
          + 'Nomor yang sudah terbit TIDAK berubah — hanya yang berikutnya.',
      })
    },
  )
}

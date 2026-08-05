import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluasiKonfirmasi, jalurTindakLanjut,
  type BentukPerintah, type StatusInstruksi,
} from '../../lib/instruksi-lapangan.js'

/**
 * INSTRUKSI LAPANGAN — terutama PERINTAH LISAN (INTI #6 · migrasi 186).
 *
 * ── Bedanya dari `surat.ts` (185)
 *
 * Surat mengandaikan ADA dokumennya. Instruksi lapangan lahir dari perintah
 * yang TAK PERNAH tertulis: pengawas datang, menyuruh membongkar pekerjaan
 * yang sudah jadi, lalu pergi. Enam bulan kemudian saat ditagih:
 * *"kami tidak pernah menyuruh."*
 *
 * Produk modul ini bukan pencatatannya — melainkan KONFIRMASI BALIK-nya.
 * Catatan sepihak bukan bukti; ia versi kita.
 *
 * ── Izin: `projects:edit`
 *
 * Instruksi lapangan dicatat oleh orang lapangan (PM, pengawas, mandor senior),
 * dan mereka sudah memegang izin itu untuk mencatat progres. Menambah izin baru
 * berarti tiap tenant harus mengonfigurasinya dulu — dan modul yang tak bisa
 * dipakai sampai ada yang mengonfigurasi izin adalah modul yang tak dipakai.
 */
export default async function instruksiLapanganRoutes(app: FastifyInstance) {

  const sekarangISO = () => new Date().toISOString()

  // ── GET /api/v1/projects/:projectId/field-instructions ─────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/field-instructions',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', request.params.projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('field_instructions', request.params.projectId)
        .select('*')
        .order('diterima_pada', { ascending: false })
      if (error) {
        request.log.error({ err: error }, 'gagal memuat instruksi lapangan')
        return reply.status(500).send({ error: 'Gagal memuat instruksi lapangan' })
      }

      const kini = sekarangISO()
      type BarisInstruksi = Record<string, unknown> & {
        bentuk_perintah?: string; status?: string
        diterima_pada?: string; dikonfirmasi_pada?: string | null
        berdampak_biaya?: boolean; berdampak_waktu?: boolean
        klaim_id?: string | null
      }

      const daftar = ((data ?? []) as BarisInstruksi[]).map((i) => ({
        ...i,
        // Dihitung saat dibaca, bukan disimpan: mendesaknya berubah tiap jam
        // berjalan, dan kolom yang perlu di-refresh tiap jam pasti basi.
        konfirmasi: evaluasiKonfirmasi({
          bentuk: (i.bentuk_perintah ?? 'lisan') as BentukPerintah,
          status: (i.status ?? 'dicatat') as StatusInstruksi,
          diterimaPada: String(i.diterima_pada),
          dikonfirmasiPada: i.dikonfirmasi_pada ?? null,
          sekarang: kini,
        }),
        tindak_lanjut: jalurTindakLanjut({
          berdampakBiaya: Boolean(i.berdampak_biaya),
          berdampakWaktu: Boolean(i.berdampak_waktu),
        }),
      }))

      return reply.send({
        data: daftar,
        ringkas: {
          jumlah: daftar.length,
          // Perintah lisan yang batas konfirmasinya LEWAT — utang bukti yang
          // makin lama makin sulit ditagih.
          konfirmasi_lewat: daftar.filter((i) => i.konfirmasi.keadaan === 'lewat').length,
          // Masih dalam batas — ini yang bisa diselamatkan HARI INI.
          konfirmasi_mendesak: daftar.filter((i) => i.konfirmasi.keadaan === 'mendesak').length,
          // Sudah jadi sengketa; butuh bukti lain, bukan konfirmasi.
          disangkal: daftar.filter((i) => i.konfirmasi.keadaan === 'disangkal').length,
          // Instruksi berdampak yang BELUM punya klaim — uang yang belum ditagih.
          berdampak_tanpa_klaim: daftar.filter((i) =>
            i.berdampak_biaya && !i.klaim_id).length,
        },
      })
    },
  )

  // ── POST /api/v1/projects/:projectId/field-instructions ────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/field-instructions',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const nomor = String(b.nomor ?? '').trim()
      const isi = String(b.isi_instruksi ?? '').trim()
      const bentuk = String(b.bentuk_perintah ?? '') as BentukPerintah

      if (!nomor) return reply.status(400).send({ error: 'Nomor instruksi wajib diisi' })
      if (!['lisan', 'telepon', 'whatsapp', 'rapat', 'tertulis'].includes(bentuk)) {
        return reply.status(400).send({
          error: 'Bentuk perintah wajib: lisan, telepon, whatsapp, rapat, atau tertulis',
        })
      }
      if (isi.length < 10) {
        // "bongkar" bukan instruksi. Setahun kemudian yang membaca harus tahu
        // APA yang diperintahkan tanpa bertanya ke siapa pun.
        return reply.status(400).send({
          error: 'Isi instruksi wajib diisi, minimal 10 karakter — setahun lagi ' +
                 'ini yang dibaca untuk tahu apa yang diperintahkan',
        })
      }
      if (!String(b.pemberi_nama ?? '').trim() || !String(b.pemberi_pihak ?? '').trim()) {
        return reply.status(400).send({
          error: 'Nama dan pihak pemberi perintah wajib diisi — tanpa itu, ' +
                 'instruksi tak bisa dikonfirmasi ke siapa pun',
        })
      }
      if (!b.diterima_pada) {
        return reply.status(400).send({ error: 'Waktu instruksi diterima wajib diisi' })
      }

      // Estimasi tanpa dampaknya ditandai = angka yang ikut terhitung sebagai
      // potensi klaim yang tak pernah ada. Constraint DB menjaga hal yang sama,
      // tetapi pesan di sini bisa dibaca pemakai.
      const berdampakBiaya = Boolean(b.berdampak_biaya)
      const berdampakWaktu = Boolean(b.berdampak_waktu)
      if (b.estimasi_biaya != null && !berdampakBiaya) {
        return reply.status(422).send({
          error: 'Estimasi biaya hanya berlaku bila instruksi ditandai berdampak biaya',
        })
      }
      if (b.estimasi_hari != null && !berdampakWaktu) {
        return reply.status(422).send({
          error: 'Estimasi hari hanya berlaku bila instruksi ditandai berdampak waktu',
        })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', request.params.projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('field_instructions', request.params.projectId)
        .insert({
          project_id: request.params.projectId,
          nomor,
          pemberi_nama: String(b.pemberi_nama).trim(),
          pemberi_jabatan: (b.pemberi_jabatan as string) ?? null,
          pemberi_pihak: String(b.pemberi_pihak).trim(),
          bentuk_perintah: bentuk,
          isi_instruksi: isi,
          lokasi: (b.lokasi as string) ?? null,
          diterima_pada: String(b.diterima_pada),
          penerima_id: (b.penerima_id as string) ?? request.currentUser!.id,
          berdampak_biaya: berdampakBiaya,
          berdampak_waktu: berdampakWaktu,
          estimasi_biaya: b.estimasi_biaya ?? null,
          estimasi_hari: b.estimasi_hari ?? null,
          work_scope_id: (b.work_scope_id as string) ?? null,
          status: 'dicatat',
          catatan: (b.catatan as string) ?? null,
          dicatat_oleh: request.currentUser!.id,
        })
        .select().single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: 'Nomor instruksi sudah dipakai di proyek ini' })
        }
        request.log.error({ err: error }, 'gagal mencatat instruksi lapangan')
        return reply.status(500).send({ error: 'Gagal mencatat instruksi lapangan' })
      }

      void logAuditEvent(request, {
        tableName: 'field_instructions', recordId: data.id, action: 'instruksi.catat',
        actorId: request.currentUser!.id, newValues: data,
        // Perintah LISAN yang berdampak biaya adalah calon sengketa. Dinaikkan
        // supaya terlihat di audit tanpa harus dicari.
        severity: (bentuk === 'lisan' || bentuk === 'telepon') && berdampakBiaya
          ? 'critical' : undefined,
      })

      return reply.status(201).send({
        data,
        konfirmasi: evaluasiKonfirmasi({
          bentuk, status: 'dicatat',
          diterimaPada: String(b.diterima_pada),
          dikonfirmasiPada: null,
          sekarang: sekarangISO(),
        }),
        tindak_lanjut: jalurTindakLanjut({
          berdampakBiaya, berdampakWaktu,
        }),
      })
    },
  )

  // ── PATCH /api/v1/field-instructions/:id/konfirmasi ────────────────────────
  //
  // Endpoint TERSENDIRI, bukan PATCH umum — konfirmasi adalah peristiwa yang
  // menentukan nilai bukti seluruh instruksi, dan memberinya jalur sendiri
  // membuat jejak auditnya tak tercampur perubahan biasa.
  app.patch<{ Params: { id: string } }>(
    '/api/v1/field-instructions/:id/konfirmasi',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>

      // ⚠️ Kategori C — `project_id` WAJIB diketahui lebih dulu (preseden
      // `contract_claims` 184 & `project_letters` 185). Endpoint ini hanya
      // menerima id instruksi, jadi project_id diminta di body dan divalidasi.
      const projectId = String(b.project_id ?? '').trim()
      if (!projectId) {
        return reply.status(400).send({
          error: 'project_id wajib disertakan — instruksi mewarisi tenancy lewat proyek',
        })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: lamaRows, error: bacaErr } = await request.db!
        .viaProject('field_instructions', projectId)
        .select('*')
        .eq('id', request.params.id)
      if (bacaErr) {
        request.log.error({ err: bacaErr }, 'gagal membaca instruksi')
        return reply.status(500).send({ error: 'Gagal membaca instruksi' })
      }
      const lama = ((lamaRows ?? []) as Array<Record<string, unknown>>)[0]
      if (!lama) return reply.status(404).send({ error: 'Instruksi tidak ditemukan' })

      const via = String(b.dikonfirmasi_via ?? '').trim()
      if (!via) {
        // "Sudah dikonfirmasi" tanpa menyebut CARANYA adalah klaim tanpa bukti
        // — persis keadaan yang modul ini dibuat untuk menghindarinya.
        return reply.status(422).send({
          error: 'Cara konfirmasi wajib disebut (mis. "surat 012/PP/VIII", ' +
                 '"email 4 Agu", "BA rapat mingguan") — tanpa itu, "sudah ' +
                 'dikonfirmasi" hanyalah klaim tanpa bukti',
        })
      }

      const pada = String(b.dikonfirmasi_pada ?? new Date().toISOString())
      const cek = evaluasiKonfirmasi({
        bentuk: String(lama.bentuk_perintah) as BentukPerintah,
        status: 'dikonfirmasi',
        diterimaPada: String(lama.diterima_pada),
        dikonfirmasiPada: pada,
        sekarang: sekarangISO(),
      })
      if (cek.keadaan === 'tak_terbaca') {
        return reply.status(422).send({ error: cek.pesan })
      }

      const { data, error } = await request.db!
        .viaProject('field_instructions', projectId)
        .update({
          status: 'dikonfirmasi',
          dikonfirmasi_pada: pada,
          dikonfirmasi_via: via,
          surat_id: (b.surat_id as string) ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.params.id)
        .select().single()
      if (error) {
        request.log.error({ err: error }, 'gagal menyimpan konfirmasi')
        return reply.status(500).send({ error: 'Gagal menyimpan konfirmasi' })
      }

      void logAuditEvent(request, {
        tableName: 'field_instructions', recordId: data.id, action: 'instruksi.konfirmasi',
        actorId: request.currentUser!.id, oldValues: lama, newValues: data,
        severity: 'critical',
      })
      // Hasilnya disertakan supaya pemakai langsung tahu apakah konfirmasinya
      // masih bernilai penuh atau sudah terlambat — bukan sekadar "tersimpan".
      return reply.send({ data, konfirmasi: cek })
    },
  )
}

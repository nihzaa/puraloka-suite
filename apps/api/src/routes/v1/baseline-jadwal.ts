import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  bandingkan, ringkas, periksaBaseline,
  type ItemBaseline, type ItemSekarang,
} from '../../lib/baseline-jadwal.js'

/**
 * BASELINE JADWAL (G6b) — pembanding yang tidak ikut bergeser.
 *
 * ── Kenapa endpoint ini ada
 *
 * `spi = ev / pv`, dan PV diturunkan dari `planned_start/end` yang bisa
 * digeser kapan saja. Tanpa baseline, SPI selalu mendekati 1 — proyek yang
 * terlambat tiga bulan menampilkan 0,98, dan tak ada satu pun galat.
 *
 * ── Yang TIDAK disediakan: PATCH
 *
 * Baseline sengaja tak punya endpoint sunting. Itu bukan kelalaian:
 * pembanding yang bisa diubah bukan pembanding. Yang boleh dilakukan —
 * menetapkan baseline BARU, dan yang lama tetap ada sebagai riwayat.
 * Ditegakkan trigger `trg_baseline_item_append_only`, bukan hanya di sini.
 */

const KEPALA = `
  id, project_id, nomor, nama, alasan, dasar_dokumen,
  aktif, ditetapkan_oleh, ditetapkan_pada
`

export default async function baselineJadwalRoutes(app: FastifyInstance) {
  // ── GET /proyek/:id/baseline — daftar ────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/proyek/:id/baseline',
    { preHandler: [authenticate, requirePermission('projects:baseline:view')] },
    async (request, reply) => {
      const { id } = request.params

      const { data, error } = await request.db!
        .viaProject('baseline_jadwal', id)
        .select(KEPALA)
        .order('nomor', { ascending: false })
        .limit(50)
      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat baseline')
        return reply.status(500).send({ error: 'Gagal memuat baseline' })
      }

      return reply.send({ baseline: data })
    },
  )

  // ── GET /proyek/:id/baseline/pergeseran — inti modul ini ─────────────────
  app.get<{ Params: { id: string }; Querystring: { baseline?: string } }>(
    '/api/v1/proyek/:id/baseline/pergeseran',
    { preHandler: [authenticate, requirePermission('projects:baseline:view')] },
    async (request, reply) => {
      const { id } = request.params

      // Baseline yang dipakai: yang diminta, atau yang AKTIF.
      let q = request.db!.viaProject('baseline_jadwal', id).select(KEPALA)
      q = request.query.baseline
        ? q.eq('id', request.query.baseline)
        : q.eq('aktif', true)

      const { data: bl, error: eBl } = await q.maybeSingle()
      if (eBl) {
        request.log.error({ err: eBl, id }, 'gagal memuat baseline aktif')
        return reply.status(500).send({ error: 'Gagal memuat baseline' })
      }

      // 200 dengan `baseline: null`, bukan 404 — proyek tanpa baseline adalah
      // keadaan sah yang layar harus bisa menyatakan, bukan galat.
      if (!bl) {
        return reply.send({
          baseline: null,
          pergeseran: [],
          ringkas: null,
          alasan: 'Proyek ini belum punya baseline jadwal. Sampai ditetapkan, '
            + 'SPI dihitung terhadap tanggal rencana yang bisa ikut bergeser — '
            + 'dan angkanya akan selalu terlihat sehat.',
        })
      }

      // ⚠ `baseline_jadwal_item` kategori C lewat `baseline_id`, dan
      // `viaProject` menuntut id proyek. Disaring lewat `baseline_id` milik
      // baseline yang SUDAH terbukti milik proyek ini di query atas.
      const { data: item, error: eItem } = await request.db!
        .unsafe('baseline_jadwal_item', 'disaring ke baseline yang sudah terbukti milik proyek ini')
        .select('rab_item_id, uraian, planned_start, planned_end, weight_pct')
        .eq('baseline_id', bl.id)
        .limit(2000)
      if (eItem) {
        request.log.error({ err: eItem, id }, 'gagal memuat item baseline')
        return reply.status(500).send({ error: 'Gagal memuat item baseline' })
      }

      const { data: kini, error: eKini } = await request.db!
        .viaProject('rab_items', id)
        .select('id, name, planned_start, planned_end, weight_pct, progress_pct')
        .limit(2000)
      if (eKini) {
        request.log.error({ err: eKini, id }, 'gagal memuat item RAB')
        return reply.status(500).send({ error: 'Gagal memuat item RAB' })
      }

      const p = bandingkan(
        item as unknown as ItemBaseline[],
        kini as unknown as ItemSekarang[])

      return reply.send({ baseline: bl, pergeseran: p, ringkas: ringkas(p) })
    },
  )

  // ── POST /proyek/:id/baseline — tetapkan baseline baru ───────────────────
  app.post<{
    Params: { id: string }
    Body: { nama?: string; alasan?: string; dasar_dokumen?: string }
  }>(
    '/api/v1/proyek/:id/baseline',
    { preHandler: [authenticate, requirePermission('projects:baseline:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body ?? {}

      const { data: proyek, error: eProy } = await request.db!
        .from('projects').select('id').eq('id', id).maybeSingle()
      if (eProy) return reply.status(500).send({ error: eProy.message })
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      // Item yang akan disalin: HANYA yang punya tanggal rencana. Item tanpa
      // jadwal tak bisa dibandingkan, dan memasukkannya hanya menambah baris
      // yang selalu "tak bergeser".
      const { data: kini, error: eKini } = await request.db!
        .viaProject('rab_items', id)
        .select('id, name, planned_start, planned_end, weight_pct')
        .not('planned_start', 'is', null)
        .limit(2000)
      if (eKini) {
        request.log.error({ err: eKini, id }, 'gagal memuat item RAB')
        return reply.status(500).send({ error: 'Gagal memuat item RAB' })
      }

      const daftar = (kini ?? []) as Array<Record<string, unknown>>

      const p = periksaBaseline(b.nama, b.alasan, daftar.length)
      if (p) return reply.status(400).send({ error: p })

      // Nomor berikutnya. Bukan `count + 1`: baseline yang pernah dihapus
      // membuat hitungan itu menabrak `uq_baseline_nomor`.
      const { data: tertinggi, error: eNomor } = await request.db!
        .viaProject('baseline_jadwal', id)
        .select('nomor')
        .order('nomor', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (eNomor) {
        request.log.error({ err: eNomor, id }, 'gagal membaca nomor baseline')
        return reply.status(500).send({ error: 'Gagal membaca nomor baseline' })
      }
      const nomor = ((tertinggi?.nomor as number | undefined) ?? 0) + 1

      // Baseline lama dinonaktifkan LEBIH DULU — `uq_baseline_satu_aktif`
      // menolak dua yang aktif, dan urutan sebaliknya membuat penetapan
      // baseline kedua selalu gagal.
      // `.select('id')` bukan kerapian: tanpa itu, "nol baris berubah" tak
      // bisa dibedakan dari "satu baris berubah". Di sini nol adalah keadaan
      // SAH (baseline pertama, belum ada yang aktif), jadi yang diperiksa
      // bukan jumlahnya melainkan bahwa query-nya benar-benar berjalan —
      // dan hasilnya dicatat supaya penonaktifan yang tak terjadi terlihat
      // di log kalau `uq_baseline_satu_aktif` menolak insert berikutnya.
      const { data: nonaktif, error: eNonaktif } = await request.db!
        .viaProject('baseline_jadwal', id)
        .update({ aktif: false })
        .eq('aktif', true)
        .select('id')
      if (eNonaktif) {
        request.log.error({ err: eNonaktif, id }, 'gagal menonaktifkan baseline lama')
        return reply.status(500).send({ error: 'Gagal menonaktifkan baseline lama' })
      }
      request.log.info(
        { id, dinonaktifkan: (nonaktif ?? []).length },
        'baseline lama dinonaktifkan sebelum penetapan baru')

      const { data: bl, error: eBl } = await request.db!
        .viaProject('baseline_jadwal', id)
        .insert({
          project_id: id,
          nomor,
          nama: b.nama!.trim(),
          alasan: b.alasan!.trim(),
          dasar_dokumen: b.dasar_dokumen?.trim() || null,
          ditetapkan_oleh: request.currentUser!.id,
          aktif: true,
        })
        .select(KEPALA)
        .single()
      if (eBl) {
        request.log.error({ err: eBl, id }, 'gagal membuat baseline')
        return reply.status(400).send({ error: eBl.message })
      }

      const { error: eItem } = await request.db!
        .unsafe('baseline_jadwal_item', 'mewarisi tenancy dari baseline yang baru dibuat di atas')
        .insert(daftar.map((r) => ({
          baseline_id: bl!.id,
          rab_item_id: r.id,
          // Nama DISALIN — item bisa di-rename, dan laporan yang menyebut
          // nama baru untuk baseline lama membingungkan pembacanya.
          uraian: r.name ?? null,
          planned_start: r.planned_start,
          planned_end: r.planned_end,
          weight_pct: r.weight_pct,
        })))

      if (eItem) {
        // ⚠ CABANG INI TIDAK TERTUTUP TEST — dinyatakan, bukan disembunyikan.
        //
        // Mutasi "baseline kosong tak dibersihkan" LOLOS: membuang seluruh
        // blok ini tak membuat satu test pun merah. Sebabnya jujur — cabang
        // ini hanya berjalan kalau INSERT item gagal, dan lewat rute itu tak
        // bisa dipicu tanpa mematikan basis di tengah permintaan.
        //
        // Yang dijaganya tetap nyata: baseline kepala tanpa item adalah
        // pernyataan kosong yang terlihat sah di daftar dan menghasilkan
        // "nol pergeseran" untuk proyek apa pun — kesimpulan yang selalu
        // benar dan karena itu tak berguna.
        //
        // Hasil penghapusannya DIPERIKSA (`audit-tulis-tanpa-periksa`), dan
        // kalau pembersihan pun gagal, nomornya disebut supaya bisa dicari.
        const { data: terbuang, error: eBersih } = await request.db!
          .viaProject('baseline_jadwal', id).delete().eq('id', bl!.id).select('id')
        if (eBersih || (terbuang ?? []).length === 0) {
          request.log.error(
            { err: eBersih, baseline: bl!.nomor },
            'baseline kosong gagal dibersihkan — perlu dihapus manual')
          return reply.status(500).send({
            error: `Item baseline gagal ditulis, dan pembatalannya juga gagal. `
              + `Baseline #${bl!.nomor} kini KOSONG dan harus dihapus manual — `
              + `sampai itu, perbandingan pergeseran akan selalu menunjukkan nol.`,
          })
        }
        request.log.error({ err: eItem, id }, 'item baseline gagal; kepala dihapus')
        return reply.status(500).send({
          error: 'Item baseline gagal ditulis. Baseline dibatalkan supaya tak '
            + 'ada pembanding kosong yang terlihat sah.',
        })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'baseline_jadwal',
        recordId: bl!.id as string,
        newValues: { ...bl, jumlah_item: daftar.length } as Record<string, unknown>,
      })

      return reply.status(201).send({ baseline: bl, jumlah_item: daftar.length })
    },
  )
}

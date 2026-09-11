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
  /*
    ── GET /proyek/:id/kurva-s — rencana vs aktual ──────────────────────────

    Ditambahkan 2026-09-11. Sebelumnya TIDAK ADA rute kurva S di repo ini,
    meski entri menu menjanjikannya ("Jadwal — Milestone & kurva S").

    ⚠ Tiga rute bernama mirip yang BUKAN ini, dan ketiganya sempat dikira
    ini saat merencanakan gelombang mobile:

        /api/v1/jadwal                penjadwal OTOMASI (tugas cron)
        /api/v1/jadwal-cpm/*          dependensi & lintasan kritis
        /api/v1/proyek/:id/baseline   perbandingan tanggal, bukan kurva

    Nama yang mirip pada hal yang berbeda adalah cara tercepat membangun
    layar yang jalan dan memperlihatkan hal yang keliru.

    ── Dua sumber, dan kenapa keduanya perlu

      RENCANA  baseline_jadwal_item — bobot per item + tanggal rencana.
               Kurva rencana dibangun dari bobot yang terakumulasi pada
               tanggal planned_end tiap item.

      AKTUAL   progress_logs.pct_overall — progres yang dilaporkan
               lapangan, diambil nilai TERAKHIR per tanggal.

    Kurva S tanpa salah satunya bukan kurva S: rencana saja adalah jadwal,
    aktual saja adalah grafik progres. Yang bermakna justru JARAKNYA.

    ── Kenapa titik AKTUAL berhenti di laporan terakhir

    Rencana membentang sampai akhir proyek; aktual tidak. Menarik garis
    aktual ke depan (mis. mengulang nilai terakhir) membuatnya terlihat
    "datar tapi ada" di masa depan — dan itu terbaca sebagai proyek yang
    berhenti, bukan sebagai masa depan yang memang belum terjadi.

    ── Tenancy

    baseline_jadwal_item dan progress_logs keduanya kategori C.
    viaProject dipakai untuk yang punya project_id langsung;
    baseline_jadwal_item mewarisi lewat baseline_id, jadi disaring
    terhadap baseline milik proyek itu — dan baseline-nya sendiri sudah
    lewat viaProject.
  */
  app.get<{ Params: { id: string } }>(
    '/api/v1/proyek/:id/kurva-s',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const { id } = request.params
      const db = request.db!

      const { data: proyek, error: eProy } = await db
        .from('projects')
        .select('id, name, start_date, end_date')
        .eq('id', id)
        .maybeSingle()
      if (eProy) {
        request.log.error({ err: eProy, id }, 'gagal memuat proyek untuk kurva-s')
        return reply.status(500).send({ error: 'Gagal memuat proyek' })
      }
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      // ── RENCANA: baseline aktif + itemnya ────────────────────────────────
      const { data: baseline, error: eBase } = await db
        .viaProject('baseline_jadwal', id)
        .select('id, nomor, nama, ditetapkan_pada')
        .eq('aktif', true)
        .maybeSingle()
      if (eBase) {
        request.log.error({ err: eBase, id }, 'gagal memuat baseline')
        return reply.status(500).send({ error: 'Gagal memuat baseline' })
      }

      let rencana: Array<{ tanggal: string; pct: number }> = []
      if (baseline) {
        const { data: item, error: eItem } = await db
          .unsafe(
            'baseline_jadwal_item',
            'kategori C lewat baseline_id; disaring eq(baseline_id) ke baseline yang sudah lewat viaProject',
          )
          .select('planned_end, weight_pct')
          .eq('baseline_id', baseline.id)
          .order('planned_end', { ascending: true })
        if (eItem) {
          request.log.error({ err: eItem, id }, 'gagal memuat item baseline')
          return reply.status(500).send({ error: 'Gagal memuat item baseline' })
        }

        /*
          Bobot DIAKUMULASI per tanggal, bukan per item.

          Dua item yang selesai di tanggal sama menghasilkan satu titik,
          bukan dua titik bertumpuk — dan grafik dengan titik bertumpuk
          membuat garisnya patah tegak lurus di tempat yang tak berarti.
        */
        const perTanggal = new Map<string, number>()
        for (const it of (item ?? []) as Array<Record<string, unknown>>) {
          const t = it.planned_end ? String(it.planned_end).slice(0, 10) : null
          if (!t) continue
          perTanggal.set(t, (perTanggal.get(t) ?? 0) + (Number(it.weight_pct) || 0))
        }
        let kumulatif = 0
        rencana = [...perTanggal.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([tanggal, bobot]) => {
            kumulatif += bobot
            /*
              Dijepit 100. Bobot baseline SEHARUSNYA berjumlah 100, tetapi
              baseline yang disusun sebagian bisa melebihinya — dan kurva
              yang menembus 100% membuat skalanya salah untuk seluruh
              grafik, termasuk garis aktual yang benar.
            */
            return { tanggal, pct: Math.round(Math.min(100, kumulatif) * 100) / 100 }
          })
      }

      // ── AKTUAL: progres terakhir per tanggal ─────────────────────────────
      /*
        ⚠ HANYA mode 'daily' — dan ini cacat yang nyaris lolos.

        `progress_logs` menyimpan DUA jenis laporan dalam satu tabel:

            mode 'daily'   pct_overall terisi   progres KESELURUHAN proyek
            mode 'detail'  pct_overall NULL     progres per item RAB
                                                (`rab_item_id` + `pct_completion`)

        Diukur pada proyek contoh: 71 baris daily, 173 baris detail — jadi
        yang NULL justru MAYORITAS, dan semuanya bertanggal paling akhir.

        Versi pertama rute ini menyaring dengan `Number.isFinite(pct)`.
        Itu tidak cukup: `Number(null)` adalah **0**, dan `isFinite(0)`
        true — jadi 173 baris detail lolos sebagai "progres 0%", menimpa
        nilai daily yang benar pada tanggal yang sama.

        Akibatnya kurva aktual berakhir di **0%** setelah sempat 2% —
        proyek yang terlihat mundur ke nol. Nol galat, dan angkanya
        terlihat seperti data sungguhan.

        Disaring di SERVER (`.eq('mode','daily')`), bukan di klien: setiap
        konsumen baru akan mengulangi kesalahan yang sama kalau
        penyaringannya diserahkan ke sana.
      */
      const { data: log, error: eLog } = await db
        .viaProject('progress_logs', id)
        .select('logged_at, pct_overall')
        .eq('mode', 'daily')
        .not('pct_overall', 'is', null)
        .order('logged_at', { ascending: true })
        .limit(1000)
      if (eLog) {
        request.log.error({ err: eLog, id }, 'gagal memuat progress log')
        return reply.status(500).send({ error: 'Gagal memuat progres' })
      }

      /*
        Nilai TERAKHIR per tanggal, bukan rata-rata atau maksimum.

        Satu hari bisa punya beberapa laporan (pagi & sore, atau koreksi).
        Yang berlaku laporan terakhir — persis seperti yang dilihat orang di
        layar progres. Rata-rata menghasilkan angka yang tak pernah
        dilaporkan siapa pun.
      */
      const aktualPerTanggal = new Map<string, number>()
      for (const l of (log ?? []) as Array<Record<string, unknown>>) {
        const t = l.logged_at ? String(l.logged_at).slice(0, 10) : null
        if (!t) continue
        /*
          `l.pct_overall == null` diperiksa SEBELUM Number().

          `Number(null)` adalah 0, bukan NaN — jadi `isFinite` saja
          meloloskannya. Pemeriksaan ini bertahan meski saringan `mode`
          di query kelak diubah; dua lapis untuk kesalahan yang sama
          bukan berlebihan di sini, sebab gejalanya adalah angka yang
          terlihat sah.
        */
        if (l.pct_overall == null) continue
        const pct = Number(l.pct_overall)
        if (!Number.isFinite(pct)) continue
        aktualPerTanggal.set(t, Math.round(Math.max(0, Math.min(100, pct)) * 100) / 100)
      }
      const aktual = [...aktualPerTanggal.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([tanggal, pct]) => ({ tanggal, pct }))

      /*
        DEVIASI dihitung di server terhadap tanggal aktual TERAKHIR.

        Membandingkan "aktual hari ini" dengan "rencana hari ini" menuntut
        mencari titik rencana yang berlaku pada tanggal itu — dan pencarian
        yang ditulis ulang di tiap klien pasti berselisih suatu saat. Di
        sini sekali, dan angkanya sama untuk semua pembaca.
      */
      const terakhir = aktual.length > 0 ? aktual[aktual.length - 1] : null
      let rencanaPadaTanggalItu: number | null = null
      if (terakhir && rencana.length > 0) {
        const sebelum = rencana.filter((r) => r.tanggal <= terakhir.tanggal)
        rencanaPadaTanggalItu = sebelum.length > 0 ? sebelum[sebelum.length - 1].pct : 0
      }

      return reply.send({
        proyek: {
          id: proyek.id,
          nama: proyek.name,
          mulai: proyek.start_date,
          selesai: proyek.end_date,
        },
        /*
          baseline: null DIBEDAKAN dari baseline kosong.

          Proyek tanpa baseline tak punya kurva rencana sama sekali — dan
          itu keadaan yang sah, bukan kesalahan. Klien perlu bisa berkata
          "belum ada baseline" alih-alih menggambar garis rencana datar di
          nol, yang terbaca sebagai rencana nol persen.
        */
        baseline: baseline
          ? { id: baseline.id, nomor: baseline.nomor, nama: baseline.nama }
          : null,
        rencana,
        aktual,
        deviasi:
          terakhir && rencanaPadaTanggalItu != null
            ? {
                tanggal: terakhir.tanggal,
                aktual_pct: terakhir.pct,
                rencana_pct: rencanaPadaTanggalItu,
                selisih_pct: Math.round((terakhir.pct - rencanaPadaTanggalItu) * 100) / 100,
              }
            : null,
      })
    },
  )

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

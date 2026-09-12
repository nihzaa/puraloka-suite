import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  ringkasKomitmen,
  hitungPosisi,
  type BarisPO,
  type BarisPosisi,
} from '../../lib/komitmen.js'

/**
 * KOMITMEN BIAYA — uang yang sudah terikat PO tetapi belum jadi biaya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RUTE INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Triase founder 2026-08-01 menempatkan *commitment tracking* di kelompok
 * **cost control** — kelompok yang disebutnya sendiri "yang membedakan ERP
 * kontraktor dari aplikasi pencatat biasa".
 *
 * ⚠⚠ KOMITMEN SUDAH ADA SEBELUM BERKAS INI. BACA DULU SEBELUM MENAMBAH.
 *
 * Ditemukan 2026-09-12 SESUDAH rute ini ditulis — saya membangunnya tanpa
 * memeriksa lebih dulu, dan itu kesalahan yang persis diperingatkan
 * CLAUDE.md §8a.4 ("sebelum menyatakan sesuatu belum dikerjakan, UKUR dulu
 * ke kode").
 *
 * Yang sudah ada:
 *
 *     routes/v1/cost-control.ts:788   PO_MENGIKAT -> commitmentTotal
 *     lib/varians-cost-code.ts        exposure = commitment + actual
 *     app/(dashboard)/estimasi/varians  kolom "Komitmen" di layar
 *
 * Dan rancangannya LEBIH BAIK daripada dugaan pertama saya: ia melaporkan
 * komitmen sebagai TOTAL PROYEK, bukan per cost code, karena pemetaan
 * material↔cost-code belum ada. Komentarnya menyebut alasannya dengan
 * tepat: *"menaruhnya di baris cost code mana pun = menebak, dan tebakan
 * di angka uang adalah kegagalan yang tak berbunyi"*.
 *
 * ── Lalu kenapa berkas ini TETAP ADA
 *
 * Yang sudah ada itu **per-proyek**, di dalam rute varians. Diukur: satu-
 * satunya endpoint lintas-proyek (`/cost-analytics/portfolio`) TIDAK
 * memuat komitmen sama sekali.
 *
 * Jadi pertanyaan "berapa total uang perusahaan yang sedang terikat PO?"
 * — dan "proyek MANA yang posisinya paling ketat?" — belum bisa dijawab
 * tanpa membuka proyek satu per satu.
 *
 * Itu lubang yang ditutup di sini, dan HANYA itu.
 *
 * ⚠ Perbedaan definisi yang HARUS diketahui sebelum membandingkan angkanya:
 *
 *     cost-control.ts   sent · confirmed · partially_received · fully_received
 *     berkas ini        sent · confirmed  (fully_received dipisah)
 *
 * Keduanya disengaja dan keduanya sah. Yang pertama menjawab "berapa yang
 * sudah tak bisa dipakai untuk hal lain" (termasuk barang yang sudah
 * datang tetapi belum tertagih). Yang kedua menjawab "berapa yang masih
 * DI JALAN" — dan karena itu `nilaiTerpenuhi` dipisah, bukan dibuang.
 *
 * **Jangan menyatukan keduanya tanpa memutuskan definisi mana yang menang.**
 * Dua angka "komitmen" yang berbeda di dua layar, tanpa penjelasan, adalah
 * cacat yang lebih mahal daripada tak punya salah satunya.
 *
 * Aturan hitungnya ada di `lib/komitmen.ts` (13 test, terbukti bisa merah
 * lewat mutasi). Rute ini hanya mengambil data dan memanggilnya.
 *
 * ── Kenapa dua bentuk keluaran
 *
 * `/ringkas`   satu angka per perusahaan — untuk kartu KPI
 * `/posisi`    per proyek — untuk tabel yang bisa ditindaklanjuti
 *
 * Menyatukannya jadi satu rute berarti layar KPI menarik seluruh tabel
 * hanya untuk menampilkan tiga angka.
 *
 * ── BATAS YANG JUJUR
 *
 * 1. **Anggaran & realisasi diambil dari `rap_realisasi`, BUKAN dihitung
 *    ulang di sini.** Itu keputusan penting, dan versi pertama rute ini
 *    salah: ia menjumlahkan `rap_budget.total_budget` dan
 *    `project_expenses.amount` — DUA KOLOM YANG TAK ADA. `rap_budget`
 *    hanya tabel kepala (tanpa nilai), dan kolom uang di
 *    `project_expenses` bernama `total_amount`.
 *
 *    Diukur ke basis 2026-09-12 sebelum sebaris query dijalankan.
 *
 *    `rap_realisasi` sudah memulangkan `pagu` + `nilai_terealisasi` per
 *    baris RAP, sudah direkonsiliasi. Menghitungnya lagi dari tabel
 *    mentah berarti definisi KEEMPAT untuk angka yang sama — dan dua
 *    definisi yang menyimpang untuk "realisasi proyek" adalah cacat yang
 *    tak pernah mengeluarkan galat, hanya dua laporan yang tak cocok.
 *
 * 2. **Cakupannya MATERIAL, bukan seluruh biaya proyek.** `rap_realisasi`
 *    bersandar pada `rap_material_line`. Itu justru yang dikehendaki:
 *    komitmen PO adalah soal PENGADAAN, dan mencampur upah/kasbon
 *    membuat "sisa anggaran pengadaan" dipotong biaya yang tak pernah
 *    lewat PO.
 *
 *    ⚠ Karena itu angka di sini TIDAK sebanding dengan `reports/wip`,
 *    yang sengaja memakai lima sumber biaya. Keduanya benar untuk
 *    pertanyaannya masing-masing.
 *
 * 3. **Celah antara "barang diterima" dan "tagihan dicatat" TIDAK
 *    ditutup.** PO `fully_received` keluar dari komitmen seketika, tetapi
 *    biayanya baru muncul di realisasi saat tagihannya masuk. Di sela itu
 *    posisinya terlihat lebih longgar daripada kenyataan.
 *
 *    Menutupnya butuh pencocokan tiga arah (PO → GR → invoice), dan itu
 *    modul tersendiri (`gr-matching` sudah ada sebagai otomasi). Dicatat
 *    supaya angkanya tak dibaca lebih tegas daripada haknya.
 */
export default async function komitmenRoutes(app: FastifyInstance) {

  // ── GET /api/v1/komitmen/ringkas ─────────────────────────────────────────
  app.get(
    '/api/v1/komitmen/ringkas',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const db = request.db!
      const idProyek = await db.projectIds()

      /*
        GAGAL-TERTUTUP. Tenant tanpa satu pun proyek memulangkan nol, bukan
        seluruh isi tabel — `.in('project_id', [])` pada larik kosong adalah
        cara paling mudah membocorkan data lintas tenant.
      */
      if (idProyek.length === 0) {
        return reply.send({
          jumlahPo: 0, nilaiKomitmen: 0, nilaiTerpenuhi: 0,
          nilaiDraf: 0, jumlahDraf: 0,
        })
      }

      const { data, error } = await db
        .unsafe('purchase_orders', 'ringkas lintas-proyek; disaring dengan projectIds')
        .select('id, project_id, status, total_amount')
        .in('project_id', idProyek)

      if (error) {
        request.log.error({ err: error }, 'gagal memuat PO untuk komitmen')
        return reply.status(500).send({ error: 'Gagal memuat data pesanan' })
      }

      return reply.send(ringkasKomitmen((data ?? []) as unknown as BarisPO[]))
    },
  )

  // ── GET /api/v1/komitmen/posisi ──────────────────────────────────────────
  app.get(
    '/api/v1/komitmen/posisi',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const db = request.db!
      const idProyek = await db.projectIds()
      if (idProyek.length === 0) {
        return reply.send({ data: [], meta: { jumlahLewat: 0, totalKomitmen: 0 } })
      }

      const { data: proyek, error: e1 } = await db
        .unsafe('projects', 'daftar lintas-proyek; disaring dengan projectIds')
        .select('id, name')
        .in('id', idProyek)
      if (e1) {
        request.log.error({ err: e1 }, 'gagal memuat proyek untuk posisi komitmen')
        return reply.status(500).send({ error: 'Gagal memuat data proyek' })
      }

      const { data: po, error: e2 } = await db
        .unsafe('purchase_orders', 'daftar lintas-proyek; disaring dengan projectIds')
        .select('id, project_id, status, total_amount')
        .in('project_id', idProyek)
      if (e2) {
        request.log.error({ err: e2 }, 'gagal memuat PO untuk posisi komitmen')
        return reply.status(500).send({ error: 'Gagal memuat data pesanan' })
      }

      /*
        SATU sumber untuk anggaran DAN realisasi.

        `rap_realisasi` memulangkan `pagu` + `nilai_terealisasi` per baris
        RAP dan sudah direkonsiliasi. Mengambil keduanya dari tabel mentah
        berarti definisi keempat untuk angka yang sama — lihat batas #1 di
        kepala berkas.
      */
      const { data: rap, error: e3 } = await db
        .unsafe('rap_realisasi', 'daftar lintas-proyek; disaring dengan projectIds')
        .select('project_id, pagu, nilai_terealisasi')
        .in('project_id', idProyek)
      if (e3) {
        request.log.error({ err: e3 }, 'gagal memuat RAP untuk posisi komitmen')
        return reply.status(500).send({ error: 'Gagal memuat data anggaran' })
      }

      /*
        Dikelompokkan per proyek DI SINI, bukan lewat empat query per
        proyek. Dengan 15 proyek itu 60 perjalanan ke basis untuk data
        yang muat dalam empat.
      */
      const poPer = new Map<string, BarisPO[]>()
      for (const b of (po ?? []) as unknown as BarisPO[]) {
        const k = b.project_id
        if (!k) continue
        const a = poPer.get(k)
        if (a) a.push(b)
        else poPer.set(k, [b])
      }

      const angka = (v: unknown): number => {
        if (v == null) return 0
        const n = Number(v)
        return Number.isFinite(n) ? n : 0
      }

      const anggaranPer = new Map<string, number>()
      const biayaPer = new Map<string, number>()
      for (const b of (rap ?? []) as unknown as Array<{
        project_id: string | null
        pagu: number | string | null
        nilai_terealisasi: number | string | null
      }>) {
        if (!b.project_id) continue
        anggaranPer.set(b.project_id, (anggaranPer.get(b.project_id) ?? 0) + angka(b.pagu))
        biayaPer.set(
          b.project_id,
          (biayaPer.get(b.project_id) ?? 0) + angka(b.nilai_terealisasi),
        )
      }

      const baris: BarisPosisi[] = ((proyek ?? []) as unknown as Array<{
        id: string; name: string
      }>).map((p) => {
        const r = ringkasKomitmen(poPer.get(p.id) ?? [])
        return hitungPosisi({
          projectId: p.id,
          nama: p.name,
          anggaran: anggaranPer.get(p.id) ?? 0,
          realisasi: biayaPer.get(p.id) ?? 0,
          komitmen: r.nilaiKomitmen,
        })
      })

      /* Yang LEWAT lebih dulu — layar ini untuk ditindaklanjuti, bukan dibaca. */
      baris.sort((a, b) => {
        if (a.lewat !== b.lewat) return a.lewat ? -1 : 1
        return a.sisa - b.sisa
      })

      /*
        `tanpaAnggaran` DILAPORKAN, bukan didiamkan.

        Diukur 2026-09-12: hanya 1 dari 25 proyek punya baris
        `rap_realisasi`. Sisanya memulangkan `anggaran: 0`, dan pada
        anggaran nol `lewat` MUSTAHIL bernilai true.

        Tanpa pencacah ini, layar yang menampilkan "0 proyek lewat
        anggaran" terbaca sebagai kabar baik — padahal artinya
        "24 proyek tak punya anggaran untuk dilampaui". Nol yang salah
        tak bisa dibedakan dari nol yang benar; itu kelas cacat yang
        sudah menggigit di dashboard mobile (`?? 0` menelan 15 proyek).
      */
      const tanpaAnggaran = baris.filter((b) => b.anggaran <= 0).length

      return reply.send({
        data: baris,
        meta: {
          jumlahLewat: baris.filter((b) => b.lewat).length,
          totalKomitmen: baris.reduce((s, b) => s + b.komitmen, 0),
          tanpaAnggaran,
          /*
            Peringatan yang bisa dibaca manusia, bukan cuma angka —
            layar boleh menampilkannya apa adanya.
          */
          catatan:
            tanpaAnggaran > 0
              ? `${tanpaAnggaran} dari ${baris.length} proyek belum punya RAP; "lewat anggaran" tak bisa dinilai untuk proyek itu.`
              : null,
        },
      })
    },
  )
}

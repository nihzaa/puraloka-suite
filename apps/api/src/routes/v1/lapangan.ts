/**
 * LAPANGAN — ikhtisar LINTAS-PROYEK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ENDPOINT INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `apps/web/app/(dashboard)/lapangan/page.tsx` menulis alasannya sendiri, dan
 * berkas ini adalah jawabannya:
 *
 *   *"Seluruh modul lapangan HANYA dilayani rute bersarang per-proyek …
 *    Menghitungnya untuk seluruh perusahaan berarti N permintaan untuk N
 *    proyek dari peramban … Menghidupkannya butuh satu endpoint agregat baru
 *    (mis. `GET /api/v1/lapangan/ringkasan`) dengan pola yang sudah terbukti
 *    di `/api/v1/dashboard/fokus`."*
 *
 * Tiga KPI yang dijanjikan `ARAH-VISUAL-2026` §5c (punch belum tutup, NCR
 * aktif, inspeksi menunggu) selama ini DIHILANGKAN dari halaman — bukan
 * diperkirakan — karena tak ada bentuk lintas-proyeknya. Sekarang ada.
 *
 * ── Tenancy: `db.unsafe()` dengan alasan, BUKAN `supabase` mentah
 *
 * Hampir semua tabel di sini berkategori C — tenancy diwarisi lewat
 * `project_id`, tak punya `company_id` sendiri. `db.from()` menolaknya di
 * titik `from()`, dan `viaProject()` menuntut SATU projectId sementara ini
 * layar lintas-proyek.
 *
 * Jadi pintunya `db.unsafe(tabel, alasan)` lalu `.in('project_id', idProyek)`.
 * Persis pola `/dashboard/fokus`, dan sengaja: pemakaian yang melewati pintu
 * aman harus meninggalkan jejak yang bisa ditinjau. `supabase` mentah tak
 * meninggalkan jejak apa pun — itulah sebabnya ia bukan pilihan.
 *
 * Kalau saringan `.in()` hilang, angkanya menghitung pekerjaan perusahaan
 * LAIN dan tetap terlihat masuk akal. Kebocoran tanpa gejala adalah yang
 * paling lama tak ketahuan.
 *
 * ── Galat TIDAK ditelan
 *
 * Tiap query diperiksa `if (x.error)` secara eksplisit, satu per satu, bukan
 * lewat loop. Bukan gaya: penjaga `audit-kegagalan-senyap.mjs` membaca
 * bentuknya secara statis, dan `Object.entries(...).forEach` membuatnya buta.
 * Saya sudah pernah membuat penjaga itu merah dengan cara yang sama.
 */
import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { susunLaporanHarian, ringkasRentang } from '../../lib/laporan-harian.js'

/** Alasan wajib untuk `db.unsafe()` — dicatat, bisa ditinjau. */
const ALASAN =
  'ikhtisar lapangan lintas-proyek milik company; seluruh query disaring .in("project_id", idProyek) dari db.projectIds()'

/** Hari ini dalam YYYY-MM-DD, zona WIB. */
function hariIniWIB(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
}

export default async function lapanganRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/lapangan/ringkasan
   *
   * Satu permintaan, seluruh angka halaman ikhtisar Lapangan.
   *
   * Bentuk jawabannya mengikuti referensi BuildAxis "Site Progress": KPI
   * strip · progres harian · milestone · tenaga kerja · punch/NCR/inspeksi.
   * Yang TIDAK ditiru: angka ramalan AI ("Delay Prediction 9.5 days"). Di
   * sini yang dikirim hanya hasil hitungan dari baris nyata — kalau kelak ada
   * proyeksi, ia akan diberi nama yang menyatakan dirinya proyeksi.
   */
  app.get('/api/v1/lapangan/ringkasan', {
    /*
      `projects:view`, bukan `projects:read`.

      Percobaan pertama memakai `projects:read` dan langsung 403: key itu
      memang muncul di beberapa berkas, tetapi tak pernah di-seed ke tabel
      permissions. Yang benar-benar ada dan dipakai modul lain `projects:view`.

      Permission key adalah kontrak publik (ADR-004) — mengarangnya membuat
      endpoint yang tak bisa diakses siapa pun, dan gejalanya 403 yang
      terbaca seperti masalah peran pemakai.
    */
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const db = request.db!
    const hariIni = hariIniWIB()

    /*
      DUA jendela, dan itu perlu — bukan kemalasan menyeragamkan.

      ABSENSI  30 hari. Kehadiran adalah keadaan SEKARANG; tren tiga bulan
               lalu tak mengubah keputusan hari ini.

      PROGRES  180 hari. `progress_logs` di basis ini berhenti 15 Juni,
               sementara absensi berjalan sampai kemarin — jendela 30 hari
               membuat grafik progres KOSONG, dan grafik kosong terbaca
               sebagai "sistem rusak", bukan "belum ada laporan bulan ini".

      Diukur, bukan diasumsikan: dengan 30 hari `progres_harian` mengembalikan
      array kosong padahal ada 271 baris di tabelnya. Menyeragamkan kedua
      jendela di 30 hari akan membuang seluruh data progres yang ada.
    */
    const sejakAbsensi = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const sejakProgres = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)

    const [idProyek, idScope] = await Promise.all([db.projectIds(), db.workScopeIds()])

    // Company tanpa proyek: `.in('project_id', [])` mengembalikan nol baris,
    // yang benar. Tapi keluar lebih awal menghemat delapan query yang sudah
    // pasti kosong.
    if (idProyek.length === 0) {
      return reply.send({
        kpi: {
          progres_rata: 0, proyek_aktif: 0, milestone_selesai: 0,
          milestone_total: 0, punch_terbuka: 0, ncr_aktif: 0,
          inspeksi_menunggu: 0, tukang_hadir_hari_ini: 0, tukang_aktif: 0,
        },
        progres_harian: [], milestone: [], proyek: [],
        tenaga_kerja: { per_tipe: [], hadir_30_hari: [] },
        temuan: { punch_per_status: [], ncr_per_severity: [], inspeksi_per_status: [] },
        punch_terbaru: [], ncr_terbaru: [],
      })
    }

    const [
      proyek, milestone, progresLog, punch, ncr, inspeksi, absensi, tukang,
    ] = await Promise.all([
      db.from('projects')
        .select('id, name, status, progress_pct, start_date, end_date, location')
        .neq('status', 'cancelled'),

      /*
        ⚠️ NAMA KOLOM DIPERIKSA KE SCHEMA, bukan ditebak.

        Percobaan pertama memakai `milestones.progress_pct` dan
        `progress_logs.tanggal`/`progress_pct` — ketiganya TIDAK ADA, dan
        endpoint balas 500. Yang benar:

          milestones     tak punya kolom progres sama sekali (status saja)
          progress_logs  `logged_at` (timestamptz) + `pct_overall`
                         + `worker_count` (bonus: jumlah pekerja per laporan)

        Nama kolom di repo ini campuran Indonesia/Inggris per-tabel, jadi
        menebak dari tabel tetangga hampir selalu meleset.
      */
      db.unsafe('milestones', ALASAN)
        .select('id, project_id, title, target_date, status, completed_at')
        .in('project_id', idProyek),

      db.unsafe('progress_logs', ALASAN)
        .select('id, project_id, logged_at, pct_overall, worker_count')
        .in('project_id', idProyek)
        .gte('logged_at', sejakProgres),

      db.unsafe('punch_items', ALASAN)
        .select('id, project_id, nomor, judul, lokasi, severity, status, target_selesai')
        .in('project_id', idProyek),

      db.unsafe('ncr_items', ALASAN)
        .select('id, project_id, nomor, judul, severity, status, biaya_dampak, target_selesai')
        .in('project_id', idProyek),

      db.unsafe('inspection_requests', ALASAN)
        .select('id, project_id, nomor, judul, status, diminta_untuk')
        .in('project_id', idProyek),

      // Absensi bertumpu pada `scope_id`, bukan `project_id` — jadi
      // saringannya `idScope`, bukan `idProyek`. Salah pilih daftar di sini
      // menghasilkan nol baris tanpa error apa pun.
      db.unsafe('absensi_harian', ALASAN)
        .select('id, scope_id, worker_id, tanggal, porsi_hari, jam_lembur')
        .in('scope_id', idScope)
        .gte('tanggal', sejakAbsensi),

      // Kategori B — punya company_id sendiri, jadi `db.from()` cukup.
      db.from('workers').select('id, name, tipe, is_active').eq('is_active', true),
    ])

    /*
      Delapan pemeriksaan eksplisit, satu per query.

      Terlihat berulang, dan memang. Tapi `audit-kegagalan-senyap.mjs`
      membaca bentuk `if (x.error)` secara STATIS — sebuah loop
      `for (const r of [a,b,c]) if (r.error)` lolos dari pembacaannya, dan
      penjaga yang buta lebih buruk daripada tak ada penjaga. Saya pernah
      membuatnya merah (189>186) dengan `Object.entries().forEach` yang
      sebenarnya benar secara logika.
    */
    if (proyek.error) throw proyek.error
    if (milestone.error) throw milestone.error
    if (progresLog.error) throw progresLog.error
    if (punch.error) throw punch.error
    if (ncr.error) throw ncr.error
    if (inspeksi.error) throw inspeksi.error
    if (absensi.error) throw absensi.error
    if (tukang.error) throw tukang.error

    const barisProyek = proyek.data ?? []
    const barisMilestone = milestone.data ?? []
    const barisProgres = progresLog.data ?? []
    const barisPunch = punch.data ?? []
    const barisNcr = ncr.data ?? []
    const barisInspeksi = inspeksi.data ?? []
    const barisAbsensi = absensi.data ?? []
    const barisTukang = tukang.data ?? []

    const aktif = barisProyek.filter((p: { status: string }) => p.status === 'active')

    /*
      Progres rata-rata: rerata sederhana dari proyek AKTIF, dan itu memang
      yang dimaksud "berapa persen pekerjaan kita berjalan".

      Sengaja TIDAK ditimbang nilai kontrak. Rerata tertimbang menjawab
      pertanyaan berbeda ("berapa persen NILAI yang sudah dikerjakan"), dan
      mencampur keduanya di satu angka membuat tak ada yang tahu mana yang
      sedang dibaca. Kalau versi tertimbang dibutuhkan, ia jadi field sendiri
      dengan nama yang menyatakan bobotnya.
    */
    const progresRata = aktif.length === 0 ? 0
      : Math.round(
        aktif.reduce((s: number, p: { progress_pct: number | null }) =>
          s + (Number(p.progress_pct) || 0), 0) / aktif.length)

    /*
      Progres harian: rerata `pct_overall` per tanggal, 30 hari.

      `logged_at` bertipe timestamptz, jadi dipotong ke 10 huruf pertama untuk
      mendapat tanggalnya. Pemotongan string, bukan konversi zona — dan itu
      disengaja: mengelompokkan per hari-UTC konsisten dengan cara `sejak`
      dihitung, sehingga batas jendelanya tak bergeser setengah hari.
    */
    const perTanggal = new Map<string, { jml: number; n: number; pekerja: number }>()
    for (const l of barisProgres as Array<{ logged_at: string; pct_overall: number | null; worker_count: number | null }>) {
      if (!l.logged_at) continue
      const k = String(l.logged_at).slice(0, 10)
      const s = perTanggal.get(k) ?? { jml: 0, n: 0, pekerja: 0 }
      s.jml += Number(l.pct_overall) || 0
      s.n += 1
      s.pekerja += Number(l.worker_count) || 0
      perTanggal.set(k, s)
    }
    const progresHarian = [...perTanggal.entries()]
      .map(([tanggal, s]) => ({
        tanggal,
        progres: Math.round((s.jml / s.n) * 10) / 10,
        jml_log: s.n,
        pekerja: s.pekerja,
      }))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal))

    // ── Kehadiran per hari. `porsi_hari` dijumlahkan, bukan dihitung barisnya:
    //    setengah hari adalah setengah orang-hari, dan menghitungnya sebagai
    //    satu membuat angka tenaga kerja selalu lebih besar dari kenyataan.
    const perHari = new Map<string, { orang: number; porsi: number; lembur: number }>()
    for (const a of barisAbsensi as Array<{ tanggal: string; porsi_hari: string | number; jam_lembur: string | number }>) {
      const k = String(a.tanggal).slice(0, 10)
      const s = perHari.get(k) ?? { orang: 0, porsi: 0, lembur: 0 }
      s.orang += 1
      s.porsi += Number(a.porsi_hari) || 0
      s.lembur += Number(a.jam_lembur) || 0
      perHari.set(k, s)
    }
    const hadir30Hari = [...perHari.entries()]
      .map(([tanggal, s]) => ({
        tanggal, orang: s.orang,
        orang_hari: Math.round(s.porsi * 10) / 10,
        jam_lembur: Math.round(s.lembur * 10) / 10,
      }))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal))

    const hadirHariIni = perHari.get(hariIni)?.orang ?? 0

    const perTipe = new Map<string, number>()
    for (const w of barisTukang as Array<{ tipe: string | null }>) {
      const k = w.tipe ?? 'lainnya'
      perTipe.set(k, (perTipe.get(k) ?? 0) + 1)
    }

    // ── Penghitung status. Dipisah jadi fungsi supaya tiga pemakaiannya tak
    //    bisa menyimpang bentuk keluarannya.
    const hitung = <T extends Record<string, unknown>>(baris: T[], kolom: keyof T) => {
      const m = new Map<string, number>()
      for (const b of baris) {
        const k = String(b[kolom] ?? 'lainnya')
        m.set(k, (m.get(k) ?? 0) + 1)
      }
      return [...m.entries()].map(([nama, jml]) => ({ nama, jml })).sort((a, b) => b.jml - a.jml)
    }

    const PUNCH_SELESAI = new Set(['ditutup', 'ditolak'])
    const NCR_SELESAI = new Set(['ditutup', 'dibatalkan'])
    const INSPEKSI_MENUNGGU = new Set(['diminta', 'dijadwalkan'])

    const punchTerbuka = barisPunch.filter(
      (p: { status: string }) => !PUNCH_SELESAI.has(p.status)).length
    const ncrAktif = barisNcr.filter(
      (n: { status: string }) => !NCR_SELESAI.has(n.status)).length
    const inspeksiMenunggu = barisInspeksi.filter(
      (i: { status: string }) => INSPEKSI_MENUNGGU.has(i.status)).length

    const namaProyek = new Map(
      barisProyek.map((p: { id: string; name: string }) => [p.id, p.name]))

    return reply.send({
      kpi: {
        progres_rata: progresRata,
        proyek_aktif: aktif.length,
        milestone_selesai: barisMilestone.filter(
          (m: { status: string }) => m.status === 'completed').length,
        milestone_total: barisMilestone.length,
        punch_terbuka: punchTerbuka,
        ncr_aktif: ncrAktif,
        inspeksi_menunggu: inspeksiMenunggu,
        tukang_hadir_hari_ini: hadirHariIni,
        tukang_aktif: barisTukang.length,
      },

      progres_harian: progresHarian,

      // Milestone mendatang + yang terlambat. Diurutkan tanggal, dipotong 8:
      // kartunya di layar hanya muat segitu, dan mengirim 39 baris untuk
      // menampilkan 8 adalah muatan yang dibuang.
      milestone: barisMilestone
        .filter((m: { status: string }) => m.status !== 'completed')
        .sort((a: { target_date: string }, b: { target_date: string }) =>
          String(a.target_date ?? '').localeCompare(String(b.target_date ?? '')))
        .slice(0, 8)
        .map((m: { id: string; project_id: string; title: string; target_date: string; status: string }) => ({
          id: m.id, judul: m.title, tanggal: m.target_date, status: m.status,
          /*
            TAK ADA field `progres` di sini, dan itu bukan kelalaian:
            `milestones` memang tidak punya kolom progres. Referensi
            menampilkan bar persentase per milestone ("Foundation Work 100%");
            mengarang angkanya di sini akan membuat bar itu berbohong.

            Yang bisa dikatakan jujur cuma statusnya — dan itu yang dikirim.
          */
          proyek: namaProyek.get(m.project_id) ?? null,
          terlambat: Boolean(m.target_date && String(m.target_date) < hariIni),
        })),

      proyek: aktif
        .sort((a: { progress_pct: number | null }, b: { progress_pct: number | null }) =>
          (Number(a.progress_pct) || 0) - (Number(b.progress_pct) || 0))
        .map((p: { id: string; name: string; progress_pct: number | null; end_date: string | null; location: string | null }) => ({
          id: p.id, nama: p.name,
          progres: Number(p.progress_pct) || 0,
          tenggat: p.end_date,
          lokasi: p.location,
          lewat_tenggat: Boolean(p.end_date && String(p.end_date) < hariIni),
        })),

      tenaga_kerja: {
        per_tipe: [...perTipe.entries()].map(([nama, jml]) => ({ nama, jml })),
        hadir_30_hari: hadir30Hari,
      },

      temuan: {
        punch_per_status: hitung(barisPunch as Array<Record<string, unknown>>, 'status'),
        ncr_per_severity: hitung(barisNcr as Array<Record<string, unknown>>, 'severity'),
        inspeksi_per_status: hitung(barisInspeksi as Array<Record<string, unknown>>, 'status'),
      },

      punch_terbaru: barisPunch
        .filter((p: { status: string }) => !PUNCH_SELESAI.has(p.status))
        .sort((a: { target_selesai: string }, b: { target_selesai: string }) =>
          String(a.target_selesai ?? '9999').localeCompare(String(b.target_selesai ?? '9999')))
        .slice(0, 6)
        .map((p: { id: string; project_id: string; nomor: string; judul: string; lokasi: string | null; severity: string; status: string; target_selesai: string | null }) => ({
          id: p.id, nomor: p.nomor, judul: p.judul, lokasi: p.lokasi,
          severity: p.severity, status: p.status, target: p.target_selesai,
          proyek: namaProyek.get(p.project_id) ?? null,
        })),

      ncr_terbaru: barisNcr
        .filter((n: { status: string }) => !NCR_SELESAI.has(n.status))
        .sort((a: { severity: string }, b: { severity: string }) => {
          const bobot: Record<string, number> = { kritis: 0, major: 1, minor: 2 }
          return (bobot[a.severity] ?? 9) - (bobot[b.severity] ?? 9)
        })
        .slice(0, 6)
        .map((n: { id: string; project_id: string; nomor: string; judul: string; severity: string; status: string; biaya_dampak: string | null }) => ({
          id: n.id, nomor: n.nomor, judul: n.judul,
          severity: n.severity, status: n.status,
          // Nominal dikirim sebagai string apa adanya dari `numeric` — tak
          // pernah dilewatkan Number(). Konversi ke float di sini akan
          // membuang presisi diam-diam (CLAUDE.md §5.4).
          biaya_dampak: n.biaya_dampak,
          proyek: namaProyek.get(n.project_id) ?? null,
        })),
    })
  })

  // ── GET /api/v1/lapangan/laporan-harian ──────────────────────────────────
  //
  // B1. Diukur 2026-08-12: `progress_logs` berisi 271 baris, 98 di antaranya
  // bermode `daily` dengan cuaca, jumlah pekerja, dan catatan kendala yang
  // ditulis mandor lewat portal setiap hari.
  //
  // Yang tak ada: layar yang membacanya sebagai LAPORAN. Dashboard hanya
  // menampilkan tanggal update terakhir, `/lapangan` menampilkan rerata.
  // Catatan kendala yang ditulis mandor tak pernah terbaca siapa pun.
  //
  // ── Kenapa lintas proyek, bukan per proyek
  //
  // `GET /projects/:id/progress-logs` sudah ada dan mengembalikan satu
  // proyek. Yang belum bisa dijawab: "apa yang terjadi di SELURUH proyek
  // kemarin" — pertanyaan yang dibuka orang kantor tiap pagi.
  app.get<{ Querystring: { dari?: string; sampai?: string; project_id?: string } }>(
    '/api/v1/lapangan/laporan-harian',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      const idProyek = await db.projectIds()
      if (idProyek.length === 0) {
        return reply.send({ hari: [], ringkasan: ringkasRentang([]), proyek: [] })
      }

      // Rentang bawaan 90 hari.
      //
      // BUKAN 30: `progress_logs` di basis ini berhenti 16 Juni sementara
      // hari ini Agustus — jendela 30 hari mengembalikan daftar KOSONG, dan
      // layar kosong terbaca sebagai "sistem rusak", bukan "belum ada
      // laporan bulan ini". Pelajaran yang sama sudah tertulis di
      // `/lapangan/ringkasan` di atas.
      const sampai = q.sampai ?? new Date().toISOString().slice(0, 10)
      const dari = q.dari ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)

      // Proyek disaring di dalam daftar yang boleh dilihat — bukan dipakai
      // apa adanya dari query. Tanpa itu, `?project_id=` milik tenant lain
      // akan lolos.
      const proyekDipilih = q.project_id && idProyek.includes(q.project_id)
        ? [q.project_id]
        : idProyek

      const [logs, proyek] = await Promise.all([
        db.unsafe('progress_logs', ALASAN)
          .select(`
            id, project_id, mode, logged_at, pct_overall, weather, worker_count, notes,
            reporter:users!progress_logs_reported_by_fkey ( id, name )
          `)
          .in('project_id', proyekDipilih)
          .gte('logged_at', dari)
          // `sampai` + 1 hari: `logged_at` bertipe timestamptz, dan
          // `lte('2026-06-16')` memotong tepat di tengah malam sehingga
          // seluruh laporan hari itu HILANG. Cacat yang tak menimbulkan
          // galat — hanya satu hari yang lenyap dari laporan.
          .lt('logged_at', new Date(Date.parse(sampai) + 86_400_000).toISOString().slice(0, 10))
          .order('logged_at', { ascending: false }),
        db.from('projects').select('id, name').in('id', proyekDipilih),
      ])

      if (logs.error) return reply.status(500).send({ error: logs.error.message })
      if (proyek.error) return reply.status(500).send({ error: proyek.error.message })

      const hari = susunLaporanHarian((logs.data ?? []) as never[])
      return reply.send({
        hari,
        ringkasan: ringkasRentang(hari),
        proyek: proyek.data ?? [],
        rentang: { dari, sampai },
      })
    },
  )
}

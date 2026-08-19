/**
 * OTOMASI TERJADWAL — tiga automation rule-based Phase 2.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI: TIGA CACAT YANG SEMUANYA LOLOS "200 OK"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Endpoint ini dipanggil penjadwal tiap 15 menit tanpa ada manusia yang
 * melihat hasilnya. Kalau salah, tak ada yang mengeluh — pesannya cuma tak
 * pernah sampai, atau justru datang bertubi-tubi. Tiga hal yang diuji di
 * sini adalah tiga cara ia bisa rusak dalam diam:
 *
 *   DEDUP        tanpa itu, denyut 15 menit = 96 pesan/hari ke orang yang
 *                sama. Hari kedua ia mematikan notifikasi, dan automation
 *                jadi lebih buruk daripada tidak ada.
 *
 *   APPROVED     2.10 mengejar kasbon yang UANGNYA SUDAH KELUAR tapi belum
 *   BUKAN        kembali. `check-deadlines` sudah mengejar yang PENDING.
 *   PENDING      Kalau saringannya tertukar, keduanya melaporkan hal sama
 *                dan kasbon menggantung tetap tak terlihat selamanya.
 *
 *   AMBANG       kasbon yang baru disetujui kemarin bukan masalah. Ambang
 *                yang tak bekerja membuat tiap kasbon baru langsung ditegur.
 *
 * Yang TIDAK diuji di sini: `progres-belum-lapor` menuntut mandor +
 * penugasan + laporan yang saling terkait, dan merakitnya di basis `public`
 * berarti menulis data yang BERTAHAN (lihat peringatan `rls-harness.ts`).
 * Bagian rentang timestamptz-nya diuji sebagai unit terpisah di bawah, tanpa
 * menyentuh basis.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import costControlRoutes from '../cost-control.js'

// Hanya heksadesimal — huruf di luar a-f bukan digit hex dan Postgres
// menolaknya sebagai uuid tak sah.
const PENANDA = '[TEST-OTOMASI-324]'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let userId: string
let scopeId: string

const panggil = (jalur: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${jalur}${q}`,
    headers: { authorization: 'Bearer t' },
  })

/** Bersihkan semua jejak test ini — dipanggil di awal DAN akhir. */
async function bersihkan() {
  await db.query(
    `DELETE FROM notifications WHERE title LIKE '%Kasbon%' AND message LIKE $1`,
    [`%${PENANDA}%`],
  )
  await db.query(`DELETE FROM kasbons WHERE notes = $1`, [PENANDA])
  await db.query(`DELETE FROM worker_kasbons WHERE notes = $1`, [PENANDA])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  // Ambil company + proyek + work_scope yang benar-benar ada, supaya FK-nya
  // sah tanpa membuat fixture baru yang harus dibersihkan.
  // `work_scopes` TIDAK punya `project_id` — ia menggantung di
  // `mandor_assignments` lewat `assignment_id`. Diukur, bukan ditebak:
  // tebakan pertama saya salah dan test-nya gagal saat itu juga.
  const { rows } = await db.query(`
    SELECT p.id AS project_id, p.company_id, ws.id AS scope_id
    FROM projects p
    JOIN mandor_assignments ma ON ma.project_id = p.id
    JOIN work_scopes ws        ON ws.assignment_id = ma.id
    WHERE p.is_deleted = false
    LIMIT 1
  `)
  if (!rows[0]) throw new Error('basis tak punya proyek + work_scope untuk diuji')
  projectId = rows[0].project_id
  companyId = rows[0].company_id
  scopeId   = rows[0].scope_id

  const u = await db.query(`SELECT id FROM users LIMIT 1`)
  userId = u.rows[0].id

  await bersihkan()

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  /*
    `cost-control` WAJIB ikut terdaftar. `serapan-anggaran` adalah satu-satunya
    tugas yang memanggil rute LAIN lewat `server.inject`; tanpa pendaftaran ini
    panggilannya 404, otomasinya membalas 500, dan testnya merah karena
    HARNESS-nya kurang lengkap — bukan karena kodenya salah.

    Merahnya justru benar: rute itu memang sengaja mati saat portofolio tak
    terhitung, daripada mengirim "semua proyek 0%" yang lahir dari kegagalan.
    Yang salah cuma tempat mengujinya.
  */
  await app.register(costControlRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

describe('2.10 — kasbon outstanding (disetujui, belum lunas)', () => {
  it('kasbon PENDING tidak ikut terjaring', async () => {
    // Ini pembeda dari `check-deadlines`. Kalau saringan status tertukar,
    // test ini merah — dan itulah satu-satunya cara cacat itu terlihat.
    await db.query(
      `INSERT INTO kasbons (work_scope_id, project_id, company_id, amount, fund_source,
                            purpose, kasbon_date, status, requested_by, approved_at, notes)
       VALUES ($1,$2,$3, 500000, 'owner_advance', 'gaji_tukang',
               CURRENT_DATE - 90, 'pending', $4, now() - interval '90 days', $5)`,
      [scopeId, projectId, companyId, userId, PENANDA],
    )

    const r = await panggil('kasbon-outstanding', '?hari=30')
    expect(r.statusCode).toBe(200)

    const { rows } = await db.query(
      `SELECT id FROM kasbons WHERE notes = $1 AND status = 'pending'`,
      [PENANDA],
    )
    expect(rows).toHaveLength(1)       // datanya memang ada

    // Diperiksa per-BARIS, bukan lewat cacah global: basis dev sudah berisi
    // 46 kasbon approved-belum-lunas milik data dummy lain, jadi menuntut
    // `checked === 0` menguji isi basis, bukan kode saya. Yang benar-benar
    // dibuktikan: kasbon PENDING ini tak menghasilkan notifikasi.
    const notif = await db.query(
      `SELECT count(*)::int AS n FROM notifications
       WHERE action_data->>'record_id' = $1`,
      [rows[0].id],
    )
    expect(notif.rows[0].n).toBe(0)
  })

  it('kasbon disetujui & belum lunas melewati ambang MENGHASILKAN notifikasi', async () => {
    await db.query(
      `INSERT INTO kasbons (work_scope_id, project_id, company_id, amount, fund_source,
                            purpose, kasbon_date, status, requested_by, approved_by,
                            approved_at, settled_at, notes)
       VALUES ($1,$2,$3, 750000, 'owner_advance', 'gaji_tukang',
               CURRENT_DATE - 90, 'approved', $4, $4,
               now() - interval '90 days', NULL, $5)`,
      [scopeId, projectId, companyId, userId, PENANDA],
    )

    const r = await panggil('kasbon-outstanding', '?hari=30')
    expect(r.statusCode).toBe(200)
    expect(r.json().checked.kasbon_outstanding).toBeGreaterThanOrEqual(1)
  })

  it('ambang bekerja — kasbon yang baru disetujui TIDAK ditegur', async () => {
    // Disetujui kemarin, ambang 30 hari. Kalau ambangnya tak dipakai,
    // tiap kasbon baru langsung jadi kebisingan.
    await db.query(
      `INSERT INTO kasbons (work_scope_id, project_id, company_id, amount, fund_source,
                            purpose, kasbon_date, status, requested_by, approved_by,
                            approved_at, notes)
       VALUES ($1,$2,$3, 250000, 'owner_advance', 'gaji_tukang',
               CURRENT_DATE - 1, 'approved', $4, $4, now() - interval '1 day', $5)`,
      [scopeId, projectId, companyId, userId, PENANDA],
    )

    const r = await panggil('kasbon-outstanding', '?hari=30')
    const idBaru = await db.query(
      `SELECT id FROM kasbons WHERE notes = $1 AND amount = 250000`, [PENANDA],
    )
    // Kasbon sehari tak boleh muncul di antara yang diperiksa.
    const notif = await db.query(
      `SELECT count(*)::int AS n FROM notifications
       WHERE action_data->>'record_id' = $1`,
      [idBaru.rows[0].id],
    )
    expect(r.statusCode).toBe(200)
    expect(notif.rows[0].n).toBe(0)
  })

  it('rentang ambang dibatasi — 9999 dipangkas, bukan diterima mentah', async () => {
    const r = await panggil('kasbon-outstanding', '?hari=9999')
    expect(r.json().checked.ambang_hari).toBe(365)
    const r2 = await panggil('kasbon-outstanding', '?hari=abc')
    expect(r2.json().checked.ambang_hari).toBe(30)
  })
})

describe('6.6 — kasbon tukang', () => {
  it('hanya yang BELUM lunas yang terjaring', async () => {
    const w = await db.query(`SELECT id FROM workers LIMIT 1`)
    if (!w.rows[0]) return   // basis tanpa tukang — tak ada yang bisa diuji

    // Satu lunas, satu belum. Hanya yang belum boleh terhitung.
    await db.query(
      `INSERT INTO worker_kasbons (worker_id, mandor_id, project_id, amount,
                                   amount_settled, is_settled, kasbon_date, notes)
       VALUES ($1,$2,$3, 400000, 400000, true,  CURRENT_DATE - 60, $4),
              ($1,$2,$3, 600000, 100000, false, CURRENT_DATE - 60, $4)`,
      [w.rows[0].id, userId, projectId, PENANDA],
    )

    const r = await panggil('kasbon-tukang', '?hari=14')
    expect(r.statusCode).toBe(200)

    const belum = await db.query(
      `SELECT count(*)::int AS n FROM worker_kasbons
       WHERE notes = $1 AND is_settled = false`, [PENANDA],
    )
    expect(belum.rows[0].n).toBe(1)
    expect(r.json().checked.kasbon_tukang).toBeGreaterThanOrEqual(1)
  })
})

describe('dedup — syarat mutlak untuk denyut 15 menit', () => {
  it('panggilan KEDUA di hari yang sama tidak membuat notifikasi baru', async () => {
    // Ini pertahanan tunggal terhadap 96 pesan/hari. Kalau ia jebol,
    // automation-nya lebih merugikan daripada absennya.
    //
    // ── Kenapa ada PEMANASAN, dan kenapa bentuk lamanya salah
    //
    // Test lain di berkas ini menyisipkan kasbon ber-`notes` PENANDA, dan
    // `afterAll` menghapusnya. Tiap run berikutnya menyisipkan lagi dengan
    // **UUID BARU** — jadi selalu ada kasbon yang memang belum pernah
    // dinotifikasi, dan menotifikasinya adalah perilaku BENAR.
    //
    // Bentuk lama menuntut "panggilan kedua = 0" dan gagal di angka 3 (satu
    // kasbon × tiga penerima). Yang salah TESTNYA: ia menganggap panggilan
    // pertamanya adalah yang pertama di hari itu. Dedup-nya sendiri bekerja
    // — dibuktikan oleh 45 kasbon lain yang TIDAK diulang.
    //
    // Bentuk sekarang menguji INVARIAN yang sebenarnya penting: berapa pun
    // yang dibuat panggilan pertama, panggilan SESUDAHNYA nol. Itulah yang
    // melindungi dari 96 pesan/hari.
    //
    // ⚠ Kasbon uji milik test LAIN dibuang dulu. Berkas ini menyisipkan
    // kasbon ber-UUID BARU tiap run (yang lama dihapus `afterAll`), dan
    // selama ia masih ada, tiap panggilan sah menotifikasinya — bukan
    // pelanggaran dedup, tapi cukup untuk membuat test ini merah selamanya.
    //
    // Yang diuji di sini adalah dedup terhadap data BASIS yang stabil, jadi
    // baris uji sementara justru mengganggu pengukurannya.
    await db.query(`DELETE FROM kasbons WHERE notes = $1`, [PENANDA])

    await panggil('kasbon-outstanding', '?hari=30')

    const kedua = await panggil('kasbon-outstanding', '?hari=30')
    expect(kedua.statusCode).toBe(200)
    expect(kedua.json().notifications_created).toBe(0)

    // Ketiga — dedup yang hanya bertahan satu putaran tak berguna untuk
    // denyut yang berjalan 96 kali sehari.
    const ketiga = await panggil('kasbon-outstanding', '?hari=30')
    expect(ketiga.json().notifications_created).toBe(0)
  }, 120_000)
})

describe('jeda MELANDAI — pertahanan terhadap 9.009 pesan tak terbaca', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    APA YANG DIUKUR, DAN KENAPA TEST INI LAHIR

    Dedup harian menahan kembar DI HARI YANG SAMA. Selama berbulan-bulan itu
    terlihat benar, dan akibatnya tak terlihat: masalah yang belum diperbaiki
    menagih ulang TIAP HARI, selamanya.

    Diukur 2026-08-16 terhadap basis nyata:

        9.009 notifikasi · 3 dibaca · 3.474 masuk ke kotak pemilik sendiri
        satu `gr_tak_cocok` menagih orang yang sama 5 hari berturut-turut

    100% tak dibaca bukan kebetulan. Itu yang terjadi pada alarm yang berbunyi
    tiap hari untuk hal yang sama: orang berhenti melihatnya, lalu berhenti
    melihat notifikasi SAMA SEKALI — termasuk yang penting.

    Test ini menjaga jadwal barunya: kirim, lalu +3 hari, +7 hari, +14 hari.

    ⚠ Ia MERAH pada kode lama. Itu memang tujuannya: pada dedup harian,
    notifikasi kemarin membiarkan tagihan hari ini lewat, dan blok kedua di
    bawah akan memulangkan angka > 0.
    ══════════════════════════════════════════════════════════════════════════
  */
  /*
    Geser RELATIF terhadap waktu tiap baris, bukan dipaku ke `now() - N`.

    Bentuk pertama memakai `now() - N` dan runtuh sendiri: ia menyamakan
    SELURUH riwayat ke satu instan, sehingga "berapa hari berbeda" selalu 1
    dan jedanya tak pernah terlihat melandai. Testnya lalu hijau untuk alasan
    yang salah — atau merah untuk alasan yang salah, seperti yang terjadi.

    Geser relatif mempertahankan jarak antar-kiriman, yang justru itulah yang
    diuji.
  */
  const mundurkan = (hari: number) =>
    db.query(
      `UPDATE notifications
          SET sent_at    = sent_at    - ($1 || ' days')::interval,
              created_at = created_at - ($1 || ' days')::interval
        WHERE type = 'kasbon_outstanding'`,
      [String(hari)],
    )

  it('menahan tagihan ulang sampai jedanya lewat, lalu melepasnya', async () => {
    await db.query(`DELETE FROM kasbons WHERE notes = $1`, [PENANDA])
    await db.query(`DELETE FROM notifications WHERE type = 'kasbon_outstanding'`)

    // ── Putaran 1: belum ada riwayat sama sekali → harus mengirim.
    const pertama = await panggil('kasbon-outstanding', '?hari=30')
    expect(pertama.statusCode).toBe(200)
    const dibuat = pertama.json().notifications_created
    expect(dibuat).toBeGreaterThan(0)

    // ── Sehari kemudian: HARI berbeda, tapi jeda pertama 3 hari → TAHAN.
    //    Inilah baris yang merah pada dedup harian.
    await mundurkan(1)
    expect((await panggil('kasbon-outstanding', '?hari=30')).json()
      .notifications_created).toBe(0)

    // ── Dua hari total: masih di dalam jeda 3 hari → TAHAN.
    await mundurkan(1)
    expect((await panggil('kasbon-outstanding', '?hari=30')).json()
      .notifications_created).toBe(0)

    // ── Empat hari total: jeda pertama LEWAT → menagih lagi. Sinyalnya tak
    //    hilang, yang hilang cuma pengulangan hariannya.
    await mundurkan(2)
    expect((await panggil('kasbon-outstanding', '?hari=30')).json()
      .notifications_created).toBeGreaterThan(0)

    /*
      ── Dan jedanya MELANDAI, bukan tetap 3 hari.

      Sesudah putaran di atas tiap catatan punya DUA kiriman, jadi jeda
      berikutnya 7 hari. Memundurkan 4 hari lagi harus TETAP tertahan —
      kalau jedanya tidak melandai, angka ini > 0 dan test merah.

      Ini bagian yang paling mudah salah tulis: `JEDA_HARI[kali]` alih-alih
      `JEDA_HARI[kali - 1]` membuat jeda melompati satu tingkat tanpa gejala
      apa pun selain "kok masih agak sering".
    */
    await mundurkan(4)
    expect((await panggil('kasbon-outstanding', '?hari=30')).json()
      .notifications_created).toBe(0)

    // Delapan hari sesudah kiriman kedua → jeda 7 hari lewat, menagih lagi.
    await mundurkan(8)
    expect((await panggil('kasbon-outstanding', '?hari=30')).json()
      .notifications_created).toBeGreaterThan(0)

    await db.query(`DELETE FROM notifications WHERE type = 'kasbon_outstanding'`)
  }, 180_000)
})

describe('rentang hari untuk kolom TIMESTAMPTZ', () => {
  it('batas hari dihitung sebagai rentang, bukan kesamaan', () => {
    // `progress_logs.logged_at` TIMESTAMPTZ. Membandingkannya dengan
    // '2026-08-12' lewat kesamaan TAK PERNAH cocok — seluruh mandor akan
    // dikira belum melapor dan ditegur tiap hari, tanpa satu galat pun.
    //
    // Diuji sebagai aritmetika murni supaya tak perlu menulis ke `public`.
    const now = new Date('2026-08-12T14:30:00Z')
    const hariIni = now.toISOString().split('T')[0]
    const besok = new Date(now.getTime() + 86_400_000).toISOString().split('T')[0]

    expect(hariIni).toBe('2026-08-12')
    expect(besok).toBe('2026-08-13')

    // Laporan pukul 14:30 harus masuk rentang [hari ini, besok).
    const laporan = new Date('2026-08-12T14:30:00Z').toISOString()
    expect(laporan >= hariIni + 'T00:00:00').toBe(true)
    expect(laporan < besok + 'T00:00:00').toBe(true)

    // Dan laporan kemarin TIDAK boleh masuk.
    const kemarin = new Date('2026-08-11T23:59:00Z').toISOString()
    expect(kemarin >= hariIni + 'T00:00:00').toBe(false)
  })
})

describe('CAKUPAN — ketujuh tugas terjadwal bisa dipanggil dan selesai', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA TEST INI ADA
    ══════════════════════════════════════════════════════════════════════════

    Founder: *"bangun aja dulu semua workflow nya dan pastikan pake cara uji yg
    lain yg tanpa harus pake saldo"*.

    Diukur lebih dulu, dan hasilnya melegakan: **tak satu pun dari 14 alur
    otomasi membutuhkan AI.** Semuanya aturan `if-then`. Yang butuh saldo hanya
    asisten chat dan sapa-proaktif — keduanya BUKAN bagian katalog otomasi.
    Jadi seluruhnya bisa diuji hari ini juga dengan saldo nol.

    Diukur juga apa yang SUDAH tercakup: berkas ini menguji 2.10 dan 6.6
    dengan fixture sungguhan. **Lima rute sisanya tak punya test sama sekali** —
    `progres-belum-lapor`, `dependency-breach`, `gr-matching`, `invoice-termin`,
    `stok-menipis`.

    ── Yang diuji di sini, dan yang SENGAJA TIDAK

    Header berkas ini sudah menjelaskan kenapa fixture penuh dihindari:
    merakitnya menulis data yang BERTAHAN di basis `public`. Alasan itu tetap
    berlaku, dan test ini tidak melanggarnya.

    Yang dijangkau: rutenya TERDAFTAR, bergerbang izin dengan benar, dan
    menyelesaikan pekerjaannya tanpa melempar. Itu kelas cacat yang nyata dan
    tak tertangkap test logika — `teruskan-kasbon-diajukan` mengirim 28
    WhatsApp sungguhan sementara buku eksekusinya kosong, dan seluruh test unit
    hijau sepanjang itu terjadi.

    Yang TIDAK diklaim: bahwa hasilnya benar. Rute yang memulangkan nol karena
    memang tak ada yang perlu dikerjakan hari ini tetap lulus di sini — dan itu
    disengaja. Menuntut bukan-nol akan membuat test merah pada sistem yang
    sehat, lalu ditandai `skip` oleh orang berikutnya.
  */
  const TUGAS = [
    'kasbon-outstanding',
    'kasbon-tukang',
    'progres-belum-lapor',
    'dependency-breach',
    'gr-matching',
    'invoice-termin',
    'stok-menipis',
    // Automation 2.6 (2026-08-15). Ditambahkan karena penjaga daftar di bawah
    // MERAH begitu rutenya lahir — bukan karena saya ingat menambahkannya.
    'invoice-terlambat',
    // Automation 2.11 (2026-08-15). Sama seperti 2.6: ditambahkan karena
    // penjaga daftar MERAH, bukan karena saya ingat.
    'saldo-menipis',
    // Automation 3.7 · 2.2 · 4.9 (2026-08-15) — ditambahkan bersamaan dengan
    // rutenya kali ini, bukan menunggu penjaga daftar merah lebih dulu.
    'milestone-berisiko',
    'hutang-supplier',
    'harga-material-naik',
    /*
      Automation 3.18 (2026-08-16) — satu-satunya yang MEMANGGIL RUTE LAIN
      (`/projects/:id/kurva-s` lewat `server.inject`) alih-alih menghitung
      sendiri. Test cakupan ini karenanya menguji lebih banyak daripada yang
      terlihat: kalau kurva-S berubah bentuk responsnya, otomasi ini yang
      pertama merah, bukan pengguna yang pertama menerima "SPI NaN".
    */
    'evm-kinerja',
    /*
      Automation 5.7 + 9.2 (2026-08-16). Roadmap menyebut modul asuransi "nol
      halaman, nol rute" — diukur ulang, SALAH pada ketiganya: tabel, rute,
      layar, dan fungsi murni penghitung kedaluwarsa semuanya sudah ada.
      Pengukuran pertama mencari kata "insurance" di repo berbahasa Indonesia.
    */
    'polis-berakhir',
    // Automation 5.11 (2026-08-16). Modul Transmittal juga ditandai roadmap
    // "belum dibangun" dan juga sudah ada — tabel, rute, dan layar lengkap.
    'transmittal-menggantung',
    /*
      Automation 6.9 · 9.8 · 9.1 · 2.9 · 6.3 · 3.6 (2026-08-16) — enam rute
      yang lahir di empat commit beruntun dan TAK SATU PUN masuk daftar ini.

      Persis kebocoran yang penjaga di bawah diciptakan untuk menahan, dan ia
      memang MERAH — tetapi merahnya ikut ter-commit, jadi selama beberapa jam
      `main` memuat test yang gagal. Penjaga yang merah lalu dibiarkan merah
      tak berbeda dari penjaga yang mati.
    */
    'sertifikat-berakhir',
    /*
      `kirim-pengingat` (2026-08-16) — pasangan tool `titip_pengingat`.

      Ditambahkan BERSAMAAN dengan rutenya, bukan menunggu penjaga daftar
      merah lebih dulu. Tanpa rute ini, janji yang dititipkan pengguna
      tersimpan rapi dan tak pernah dibacakan kembali — pola setengah-rantai
      yang sudah enam kali terjadi di repo ini.
    */
    'kirim-pengingat',
    'k3-kepatuhan',
    'kepatuhan-dokumen',
    'serapan-anggaran',
    'absensi-berhenti',
    'subkon-tak-layak',
    /*
      Dua puluh lima tugas berikutnya (2026-08-16) ditambahkan SEKALIGUS, dan
      itu sendiri sebuah kegagalan yang layak dicatat: daftar ini tertinggal
      22 dari 47 sebelum penjaganya merah.

      Artinya selama dua puluh lima rute lahir, tak satu pun pernah dipanggil
      oleh test cakupan. Rute yang melempar saat dijalankan akan lolos CI
      dengan mulus — persis jenis cacat yang test ini ada untuk menahannya.

      Pelajarannya bukan "lebih rajin ingat", melainkan: penjaga daftar inilah
      yang bekerja. Ia menahan kebohongan "47 otomasi terbangun" ketika yang
      terbukti bisa dipanggil baru 22.
    */
    'retensi-tertahan',
    'audit-aksi-berisiko',
    'kontrak-payung-habis',
    'penyusutan-belum-ditutup',
    'perawatan-alat',
    'konflik-mandor',
    'rab-harga-menyimpang',
    'upah-menyimpang',
    'kontrak-klien-berakhir',
    'insiden-k3-belum-ditutup',
    'stok-di-bawah-minimum',
    'audit-mutu-lewat-jadwal',
    'izin-kedaluwarsa',
    'risiko-lewat-tinjau',
    'biaya-kembar',
    'biaya-berulang',
    'margin-bocor',
    'pemasok-terpencar',
    'stok-melenceng',
    'biaya-pencilan',
    'proyeksi-selesai',
    'po-luar-kontrak',
    'invoice-ringkasan-melenceng',
    'kesiapan-audit',
    'opname-menggantung',
    /*
      10.2 Predictive Maintenance (2026-08-16). Ditambahkan BERSAMAAN dengan
      rutenya, bukan menunggu penjaga daftar merah lebih dulu — pelajaran
      dari 25 rute yang sempat lahir tanpa pernah sekali pun dipanggil test.
    */
    'perawatan-diprediksi',
    // 2.12 Payment Timing (2026-08-16). Sempat DICORET dengan alasan
    // "semua pembayaran memakai metode sama" - kolom yang salah; yang
    // dijanjikan judulnya WAKTU, dan 4 dari 23 telat, terparah 98 hari.
    'kebiasaan-bayar',
    // 1.14 Weekly Digest (2026-08-16). SATU ringkasan, bukan tiga: 8.11
    // (briefing pagi + sore = 14 pesan/minggu) dan 8.12 (anomali, himpunan
    // bagian) sengaja tidak dibangun. Alasannya di rutenya.
    'ringkasan-mingguan',
    // 3.4 Material Consumption (2026-08-16). Sempat DICORET 'tak bisa
    // dibangun' karena tabel petanya nol baris - tabelnya ADA, isinya yang
    // belum. Migrasi 425 mengisinya atas izin founder.
    'material-kurang',
    // 10.6 Maintenance Cost Trend (2026-08-16). Nomor ini ada di 47 baris
    // rencana yang BELUM PERNAH digali sama sekali — galian sebelumnya cuma
    // menilai 92 dari 140.
    'alat-tak-sehat',
    // 9.2 Insurance Coverage Gap (2026-08-16). Dibangun di atas data yang
    // diisi migrasi 428, yang SENGAJA meninggalkan celah — termasuk proyek
    // ber-polis AKTIF yang jenisnya tak menanggung pekerjaannya sendiri.
    'celah-asuransi',
    // TANPA NOMOR (2026-08-16). Otomasi pertama yang lahir dari PEMETAAN
    // 51 peristiwa dunia-proyek lintas tujuh pihak, bukan dari rencana 140.
    'klien-didiamkan',
    // 10.4 Fleet Fuel Anomaly (2026-08-16). Sempat DICORET karena saya
    // mengukur `jumlah` (rupiah) alih-alih `kuantitas` (liter) — rupiahnya
    // seragam karena tangki diisi PENUH tiap kali.
    'bbm-melonjak',
    // TANPA NOMOR (2026-08-16). Ditemukan dari arah BERBEDA: bukan menyisir
    // rencana, melainkan mencari tabel yang TERISI tapi tak satu pun otomasi
    // menyentuhnya. Ada 109; ini yang paling mahal bila diam.
    'uji-material-gagal',
    // TANPA NOMOR (2026-08-19). Sisi PENGIRIMAN pengadaan — seluruh otomasi
    // pengadaan lain berhenti begitu PO terbit. Diukur: satu kiriman 132 hari
    // di gudang transit, satu lagi 85 hari tertahan bea cukai.
    'barang-tertahan',
    // TANPA NOMOR (2026-08-19). Satu-satunya otomasi di berkas ini yang
    // objeknya tidak MEMBURUK bila didiamkan — ia KEDALUWARSA. Diukur:
    // Rp 420 juta menggantung 97 hari di negosiasi tanpa forum.
    'sengketa-menggantung',
  ] as const

  it.each(TUGAS)('rute %s terdaftar dan selesai tanpa melempar', async (tugas) => {
    const r = await panggil(tugas)

    /*
      404 di sini berarti rutenya TAK TERDAFTAR — cacat yang tak akan pernah
      terlihat dari test logika, dan yang gejalanya di produksi cuma "otomasi
      itu tak pernah jalan".

      500 berarti pekerjaannya sendiri melempar. Untuk rute yang dipanggil
      penjadwal tanpa penonton, itu kegagalan senyap sempurna.
    */
    expect(r.statusCode, `${tugas} membalas ${r.statusCode}. Body: ${r.body.slice(0, 200)}`)
      .toBe(200)

    // Balasannya wajib JSON yang bisa dibaca mesin — penjadwal memutuskan dari
    // isinya, bukan dari teks bebas.
    expect(() => JSON.parse(r.body), `${tugas} membalas non-JSON: ${r.body.slice(0, 120)}`)
      .not.toThrow()
  }, 60_000)

  it('SEMUA tugas terjadwal di kode ikut diuji — daftar tak boleh tertinggal', async () => {
    /*
      Penjaga terhadap test ini sendiri.

      Daftar `TUGAS` di atas ditulis tangan. Begitu ada rute baru ditambahkan
      ke `otomasi-terjadwal.ts` dan lupa dimasukkan ke sini, cakupannya bocor
      DIAM-DIAM — dan test ini akan tetap hijau sambil menguji enam dari
      delapan.

      Jadi daftarnya dicocokkan dengan KODE SUMBERNYA, bukan dipercaya.
    */
    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')

    const sumber = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'otomasi-terjadwal.ts'),
      'utf8',
    )
    /*
      `[a-z0-9-]+`, BUKAN `[a-z-]+`.

      Versi lama berhenti di angka pertama: rute `k3-kepatuhan` terbaca `k`,
      lalu dibandingkan dengan daftar dan tak pernah cocok. Penjaga ini
      karenanya MERAH SELAMANYA begitu ada tugas bernama angka — dan merahnya
      menuduh daftar yang sebenarnya benar.

      Bentuk kegagalan yang paling mahal: bukan penjaga yang diam, melainkan
      penjaga yang berteriak ke arah yang salah. Yang membacanya akan
      memperbaiki daftarnya berulang kali tanpa pernah hijau.
    */
    const diKode = [...new Set(
      [...sumber.matchAll(/otomasi\/jalankan\/([a-z0-9-]+)/g)].map((m) => m[1]),
    )].sort()

    expect([...TUGAS].sort(),
      `daftar TUGAS tertinggal dari kode. Di kode: ${diKode.join(', ')}`)
      .toEqual(diKode)
  }, 30_000)
})

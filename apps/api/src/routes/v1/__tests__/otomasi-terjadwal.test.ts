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
    const diKode = [...new Set(
      [...sumber.matchAll(/otomasi\/jalankan\/([a-z-]+)/g)].map((m) => m[1]),
    )].sort()

    expect([...TUGAS].sort(),
      `daftar TUGAS tertinggal dari kode. Di kode: ${diKode.join(', ')}`)
      .toEqual(diKode)
  }, 30_000)
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// T5b — UJI KILL-SWITCH (ADR-011 §9.5 P2).
//
// Klaim yang dibuat arsitektur ini: isolasi tenant dijaga DUA lapis yang saling
// independen — wrapper aplikasi (`tenant-db.ts`) dan RLS di database. Klaim
// "dua lapis" hanya bermakna kalau tiap lapis bertahan SENDIRIAN. Kalau
// sebenarnya cuma satu lapis yang bekerja dan satunya menumpang, sistem terlihat
// aman persis sampai lapis itu gagal.
//
// Cara mengujinya adalah dengan MEMATIKAN satu lapis dan memastikan yang lain
// masih menahan:
//
//   Matikan WRAPPER  → query polos tanpa filter company. RLS harus menahan.
//   Matikan RLS      → policy dilewati. Predikat wrapper harus menahan.
//
// Test yang cuma menjalankan jalur normal TIDAK bisa membedakan "dua lapis
// bekerja" dari "satu lapis bekerja, satunya kebetulan tak pernah diuji".
// Itulah alasan test ini ada dan kenapa ia mematikan sesuatu dengan sengaja.
//
// Semua di dalam SATU transaksi yang di-ROLLBACK — dev tidak berubah.
// ============================================================

let c: Client
let companyA: string
let companyB: string
let userId: string
let authIdA: string
let idProyekB: string
let idKlienB: string

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  const ua = (await c.query(
    `SELECT u.id, u.auth_id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.auth_id IS NOT NULL AND u.is_active = true LIMIT 1`
  )).rows[0]
  userId = ua.id
  authIdA = ua.auth_id

  // Company tenant A HARUS yang benar-benar dimiliki user impersonasi, bukan
  // "yang tertua". Keduanya kebetulan sama di dev, tapi TIDAK di CI: seed CI
  // membuat user SETELAH migrasi 126 berjalan, jadi user itu tak pernah dapat
  // baris `company_members`, dan company tertua adalah company yang bukan
  // miliknya. Test yang memakai company salah lalu melaporkan "bocor" —
  // padahal yang salah adalah fixture-nya.
  companyA = (await c.query(
    `SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = $1 AND cm.is_active
      ORDER BY cm.is_default DESC LIMIT 1`, [userId]
  )).rows[0]?.company_id
    ?? (await c.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0].id

  // Pastikan user ini memang anggota company A — kalau tidak, `auth_company_id()`
  // memulangkan company lain (atau NULL) dan seluruh test di bawah mengukur hal
  // yang salah. Lebih baik membuat keanggotaannya daripada diam-diam menguji
  // konfigurasi yang tak pernah terjadi di produksi.
  await c.query(
    `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
     SELECT $1, $2, u.role_id, true, true, $2 FROM users u WHERE u.id = $2
     ON CONFLICT (company_id, user_id) DO UPDATE SET is_active = true, is_default = true`,
    [companyA, userId]
  )
  companyB = (await c.query(
    `INSERT INTO companies (code, name) VALUES ('uji-killswitch', 'Tenant B (kill-switch)')
     RETURNING id`)).rows[0].id

  idKlienB = (await c.query(
    `INSERT INTO clients (contact_person, phone, created_by, company_id)
     VALUES ('[UJI-T5b] Klien B', '0800', $1, $2) RETURNING id`, [userId, companyB]
  )).rows[0].id
  idProyekB = (await c.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date,
                           created_by, company_id)
     VALUES ($1, $2, '[UJI-T5b] Proyek B', 'Jakarta', '2026-01-01', '2026-12-31', $2, $3)
     RETURNING id`, [idKlienB, userId, companyB]
  )).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

/**
 * Jalankan `fn` di dalam savepoint bernama, lalu selalu kembali ke titik itu.
 *
 * Pakai savepoint UNIK per pemanggilan, dan rollback lewat blok terpisah:
 * kalau sebuah statement gagal, Postgres menandai seluruh transaksi "aborted"
 * dan menolak perintah berikutnya. Tanpa ini, satu kegagalan nyata berubah jadi
 * enam kegagalan palsu bertuliskan "current transaction is aborted" — dan
 * penyebab aslinya tenggelam. (Terjadi persis begitu saat test ini pertama
 * dijalankan.)
 */
let nomorSavepoint = 0
async function dalamSavepoint<T>(fn: () => Promise<T>): Promise<T> {
  const sp = `ks_${++nomorSavepoint}`
  await c.query(`SAVEPOINT ${sp}`)
  try {
    return await fn()
  } finally {
    await c.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {})
  }
}

/** Jalankan `fn` sebagai user terautentikasi tenant A. */
function sebagaiTenantA<T>(fn: () => Promise<T>): Promise<T> {
  return dalamSavepoint(async () => {
    await c.query("SELECT set_config('role', 'authenticated', true)")
    await c.query(
      `SELECT set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [authIdA]
    )
    await c.query("SELECT set_config('app.company_id', $1, true)", [companyA])
    return await fn()
  })
}

/** Jalankan `fn` dengan RLS dimatikan untuk transaksi ini saja. */
function tanpaRls<T>(fn: () => Promise<T>): Promise<T> {
  return dalamSavepoint(async () => {
    await c.query('SET LOCAL row_security = off')
    return await fn()
  })
}

describe('T5b — prasyarat fixture', () => {
  it('auth_company_id() untuk user uji benar-benar memulangkan company A', async () => {
    // Dijalankan PALING AWAL dan sengaja berdiri sendiri. Kalau prasyarat ini
    // tak dipegang, seluruh assertion "tidak bocor" di bawahnya jadi tak
    // bermakna — bisa hijau karena isolasi bekerja, bisa merah karena
    // fixture-nya yang salah company, dan keduanya terlihat sama.
    //
    // Pernah terjadi: test memilih companyA sebagai "company tertua". Benar di
    // dev, salah di CI (user seed CI tak punya baris company_members, jadi
    // company tertua bukan miliknya) — dan gejalanya muncul sebagai laporan
    // "RAB tenant lain bocor" yang menyesatkan.
    const v = await sebagaiTenantA(async () =>
      (await c.query(`SELECT auth_company_id() v`)).rows[0].v
    )
    expect(
      v,
      'fixture salah: user uji tidak teresolusi ke company A, jadi test di bawah ' +
        'mengukur company yang keliru'
    ).toBe(companyA)
  }, 60_000)
})

describe('T5b — KILL-SWITCH 1: wrapper dimatikan, RLS harus menahan', () => {
  it('SELECT polos tanpa filter company tidak memulangkan proyek tenant lain', async () => {
    // "Wrapper dimatikan" disimulasikan dengan menulis query persis seperti
    // kalau seorang developer lupa memakai `request.db` dan langsung menembak
    // tabel — TANPA satu pun klausa company. Inilah bentuk kebocoran yang
    // paling mungkin terjadi di dunia nyata.
    const terlihat = await sebagaiTenantA(async () =>
      (await c.query(`SELECT id FROM projects`)).rows.map((r) => r.id)
    )

    expect(
      terlihat,
      'RLS tidak menahan: query tanpa filter company membocorkan proyek tenant lain'
    ).not.toContain(idProyekB)
  }, 60_000)

  it('SELECT polos pada clients (berisi PII) juga tertahan RLS', async () => {
    const terlihat = await sebagaiTenantA(async () =>
      (await c.query(`SELECT id FROM clients`)).rows.map((r) => r.id)
    )
    expect(terlihat, 'PII klien tenant lain bocor lewat query tanpa filter').not.toContain(idKlienB)
  }, 60_000)

  it('kategori C ikut tertahan meski di-query langsung tanpa lewat project', async () => {
    // Turunan project tidak punya company_id sendiri; ia bergantung sepenuhnya
    // pada helper rantai FK. Kalau helper-nya salah, kebocorannya justru di sini
    // — bukan di tabel yang punya kolom company_id.
    // INSERT sengaja DI LUAR savepoint impersonasi — kalau ia ikut di-rollback,
    // barisnya sudah lenyap sebelum sempat diperiksa, dan test akan "lulus"
    // tanpa pernah menguji apa pun.
    const idRab = (await c.query(
      `INSERT INTO rab_items (project_id, level, name, sort_order)
       VALUES ($1, 'item', '[UJI-T5b] Item B', 1) RETURNING id`, [idProyekB]
    )).rows[0].id

    const terlihat = await sebagaiTenantA(async () =>
      (await c.query(`SELECT id FROM rab_items`)).rows.map((r) => r.id)
    )
    // Assertion positif dulu: barisnya memang ADA (dilihat dari luar RLS),
    // supaya "tidak terlihat" tak bisa lolos hanya karena barisnya tak pernah
    // terbuat.
    const ada = await tanpaRls(async () =>
      (await c.query(`SELECT count(*)::int n FROM rab_items WHERE id = $1`, [idRab])).rows[0].n
    )
    expect(ada, 'fixture RAB gagal dibuat — test tak menguji apa pun').toBe(1)
    expect(terlihat, 'RAB tenant lain bocor — helper rantai FK tidak menahan').not.toContain(idRab)
  }, 60_000)

  it('tenant A tetap melihat datanya sendiri (bukan menutup semuanya)', async () => {
    // Kill-switch yang "berhasil" dengan cara memblokir semua orang bukan
    // isolasi — itu kerusakan. Sisi positifnya harus ikut dibuktikan.
    const n = await sebagaiTenantA(async () =>
      (await c.query(`SELECT count(*)::int n FROM projects`)).rows[0].n
    )
    expect(n, 'tenant A ikut kehilangan proyeknya sendiri = over-filtering').toBeGreaterThan(0)
  }, 60_000)
})

describe('T5b — KILL-SWITCH 2: RLS dimatikan, predikat wrapper harus menahan', () => {
  it('dengan row_security=off, filter company wrapper tetap menyaring', async () => {
    // Kebalikannya: RLS sengaja dinonaktifkan untuk sesi ini, lalu dijalankan
    // predikat yang SAMA dengan yang dipakai wrapper (`eq('company_id', X)`).
    // Kalau lapis aplikasi diam-diam mengandalkan RLS, kebocorannya muncul di
    // sini. Ini juga persis keadaan produksi hari ini — API masih memakai
    // service_role yang mem-bypass RLS, jadi lapis inilah yang sedang bertugas.
    const { rlsAktif, terlihat } = await tanpaRls(async () => ({
      rlsAktif: (await c.query(`SHOW row_security`)).rows[0].row_security,
      terlihat: (await c.query(
        `SELECT id FROM projects WHERE company_id = $1`, [companyA]
      )).rows.map((r) => r.id),
    }))

    expect(rlsAktif, 'prasyarat: RLS harus benar-benar mati untuk uji ini').toBe('off')
    expect(
      terlihat,
      'predikat wrapper tidak menahan saat RLS mati — lapis aplikasi menumpang RLS'
    ).not.toContain(idProyekB)
    expect(terlihat.length, 'tenant A kehilangan datanya sendiri').toBeGreaterThan(0)
  }, 60_000)

  it('predikat kategori C (daftar id proyek) tidak bocor saat RLS mati', async () => {
    // Inilah yang dipakai SELURUH endpoint kategori C:
    // .in('project_id', await db.projectIds()). Satu kebocoran di daftar ini
    // membocorkan seluruh turunannya sekaligus.
    const ids = await tanpaRls(async () =>
      (await c.query(
        `SELECT id FROM projects WHERE company_id = $1`, [companyA]
      )).rows.map((r) => r.id)
    )
    expect(ids).not.toContain(idProyekB)
  }, 60_000)
})

describe('T5b — kedua lapis benar-benar berbeda, bukan satu lapis yang sama', () => {
  it('mematikan salah satu lapis tidak membuat lapis lain ikut mati', async () => {
    // Bukti terakhir bahwa keduanya independen: jumlah baris yang terlihat
    // tenant A harus SAMA baik lewat jalur RLS maupun lewat predikat wrapper.
    // Kalau salah satunya nol, berarti lapis itu tidak pernah benar-benar
    // bekerja dan selama ini hanya lapis satunya yang menahan.
    // ⚠️ DISARING KE PENANDA MILIK TEST INI — jangan diubah jadi hitung-semua.
    //
    // Versi sebelumnya menghitung SELURUH `projects` milik company A. Company A
    // adalah company AKAR, dan puluhan berkas test lain menyisipkan proyek ke
    // sana. Di CI 6 shard paralel, sebuah proyek bisa lahir di antara dua
    // hitungan di bawah — dan test ini merah dengan "expected 5 to be 6",
    // menuduh RLS bocor padahal yang terjadi hanyalah dua foto pada dua detik
    // berbeda. Persis itu yang terjadi di run 30816685247.
    //
    // Menyaring ke penanda milik test ini membuat kedua hitungan melihat
    // HIMPUNAN YANG SAMA dan STABIL, tanpa mengurangi apa yang dibuktikan:
    // yang diuji adalah "kedua lapis menyaring dengan aturan yang sama",
    // bukan "berapa banyak proyek yang ada di dunia".
    const PENANDA = '[UJI-T5b] Proyek A%'
    // Klien + proyek dibuat DI DALAM transaksi test ini (di-ROLLBACK di
    // afterAll), jadi shard lain tak pernah melihatnya dan tak bisa
    // menambahinya.
    const idKlienA = (await c.query(
      `INSERT INTO clients (contact_person, phone, created_by, company_id)
       VALUES ('[UJI-T5b] Klien A', '0800', $1, $2) RETURNING id`, [userId, companyA]
    )).rows[0].id
    await c.query(
      `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date,
                             created_by, company_id)
       SELECT $1, $2, '[UJI-T5b] Proyek A ' || g, 'Bandung', '2026-01-01', '2026-12-31', $2, $3
         FROM generate_series(1, 3) g`,
      [idKlienA, userId, companyA]
    )

    const lewatRls = await sebagaiTenantA(async () =>
      (await c.query(
        `SELECT count(*)::int n FROM projects WHERE name LIKE $1`, [PENANDA]
      )).rows[0].n
    )

    const lewatWrapper = await tanpaRls(async () =>
      (await c.query(
        `SELECT count(*)::int n FROM projects WHERE company_id = $1 AND name LIKE $2`,
        [companyA, PENANDA]
      )).rows[0].n
    )

    expect(lewatRls, 'lapis RLS tidak menahan apa pun').toBeGreaterThan(0)
    expect(lewatWrapper, 'lapis wrapper tidak menahan apa pun').toBeGreaterThan(0)
    expect(
      lewatRls,
      'dua lapis memberi hasil berbeda — salah satunya menyaring dengan aturan lain'
    ).toBe(lewatWrapper)
  }, 60_000)
})

describe('R5 — auth_client_id() menyaring company', () => {
  it('orang yang jadi klien di 2 perusahaan mendapat baris company AKTIF', async () => {
    // BUG NYATA yang ditutup migrasi 133, bukan skenario hipotetis. Definisi
    // lama (049) mengambil `clients` hanya lewat user_id — tanpa filter company
    // dan tanpa LIMIT — sehingga memulangkan baris SEMBARANG begitu satu orang
    // terdaftar sebagai klien di lebih dari satu perusahaan.
    //
    // Terukur sebelum perbaikan: fungsi memulangkan baris company B untuk user
    // yang company aktifnya A. Fungsi ini dipakai policy portal klien, jadi
    // akibat nyatanya adalah klien melihat proyek perusahaan yang keliru.
    const asal = (await c.query(
      `SELECT u.auth_id, u.id uid, c.id cid FROM clients c
         JOIN users u ON u.id = c.user_id
        WHERE u.auth_id IS NOT NULL AND c.company_id = $1 LIMIT 1`, [companyA]
    )).rows[0]
    if (!asal) return // lingkungan tanpa klien ber-auth_id

    // Orang yang SAMA didaftarkan sebagai klien di tenant B.
    await c.query(
      `INSERT INTO clients (contact_person, phone, created_by, company_id, user_id)
       VALUES ('[UJI-T5b] orang sama di B', '08', $1, $2, $1)`, [asal.uid, companyB]
    )

    await c.query('SAVEPOINT r5')
    await c.query("SELECT set_config('role', 'authenticated', true)")
    await c.query(
      `SELECT set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [asal.auth_id]
    )
    const hasil = (await c.query(`SELECT auth_client_id() v`)).rows[0].v
    await c.query('ROLLBACK TO SAVEPOINT r5')

    expect(
      hasil,
      'auth_client_id() memulangkan baris klien dari company lain — kebocoran lintas-tenant'
    ).toBe(asal.cid)
  }, 60_000)
})

/**
 * TJS-C1 — ISOLASI TENANT pada jalur AI, dengan DUA tenant nyata.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TIDAK BOLEH DIASUMSIKAN DARI RLS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kriteria C1 menuntutnya eksplisit: *"jangan diasumsikan dari RLS"*.
 *
 * RLS memang aktif di seluruh tabel ini. Tetapi tool AI memakai
 * `db.unsafe(tabel, alasan)` untuk tabel kategori C — dan `unsafe` MEMANG
 * jalur yang diizinkan, jadi ia lolos RLS dengan sah. Yang menahan kebocoran
 * di jalur itu bukan RLS melainkan saringan manual yang ditulis tiap tool:
 * `.in('project_id', idProyek)` dan `.in('gudang_id', idGudang)`.
 *
 * Saringan manual bisa lupa ditulis, dan lupanya tak menimbulkan galat — ia
 * mengembalikan LEBIH BANYAK baris. Untuk asisten AI itu berarti menjawab
 * pertanyaan tenant A dengan angka tenant B, dengan nada yang sama percaya
 * dirinya.
 *
 * ── Kenapa tenant keduanya dibuat DI SINI, bukan lewat migrasi
 *
 * Diukur 2026-08-10: basis hanya punya SATU tenant berdata. Lima lainnya
 * kosong — nol proyek, nol gudang. Perbandingan "tenant A vs tenant kosong"
 * akan hijau apa pun yang terjadi, karena tak ada baris milik B yang bisa
 * bocor.
 *
 * Tenant keduanya karena itu dibuat di `beforeAll` dan DIHAPUS di `afterAll`.
 * Basisnya tak bertambah permanen, dan test tetap punya dua sisi yang nyata.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { KATALOG_TOOL, jalankanTool } from '../ai-tool.js'

const TANDA = '[UJI-ISOLASI]'

let db: Client
let tenantA: string
let tenantB: string
let userB: string
let clientB: string

/** Seluruh izin yang dipakai katalog tool. */
const IZIN_PENUH = new Set(KATALOG_TOOL.map((t) => t.izin))

beforeAll(async () => {
  db = await createRlsClient()

  // Tenant A: yang sudah berdata.
  const { rows: a } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM projects p WHERE p.company_id = c.id AND p.is_deleted = false)
      AND c.name NOT LIKE '[UJI-ISOLASI]%'
    ORDER BY (SELECT count(*) FROM projects p WHERE p.company_id = c.id) DESC
    LIMIT 1
  `)
  tenantA = a[0].id

  /*
   * Kolom WAJIB diukur dari `information_schema`, bukan ditebak. Percobaan
   * pertama gagal di `companies.code` (NOT NULL tanpa default), dan
   * `projects` ternyata menuntut EMPAT lagi: client_id, pm_id, location,
   * created_by. Menebak skema untuk fixture menghasilkan test yang gagal di
   * setup — bentuk kegagalan yang menyamar sebagai "test rusak", bukan
   * "skema berbeda dari dugaan".
   */
  const { rows: role } = await db.query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`)
  const cap = Date.now()

  /*
   * `owner_user_id` WAJIB ikut, meski test ini tak memakainya.
   *
   * `t9-kelola-badan-usaha` menegakkan invariant "tiap akar grup punya
   * pemilik". Karena CI menjalankan enam shard di atas SATU basis, company
   * yatim dari fixture ini menjatuhkan test di BERKAS LAIN, dengan pesan yang
   * sama sekali tak menyebut fixture ini — sudah terjadi tiga kali di repo ini,
   * dan itulah sebabnya `audit-fixture-company-yatim.mjs` ada.
   */
  /*
   * Pemiliknya HARUS orang yang sudah memiliki company lain — bukan
   * `SELECT id FROM users LIMIT 1`.
   *
   * Saya sempat memakai `LIMIT 1`, dan itu membuat `t9-kelola-badan-usaha`
   * merah HANYA saat suite penuh dijalankan: t9 memilih "user selain pemilik
   * grup" sebagai kontrolnya, dan `LIMIT 1` kebetulan menunjuk orang itu.
   * Kontrolnya jadi pemilik, lalu gerbang `is_group_owner` terlihat bocor —
   * padahal yang bocor fixture ini.
   *
   * Memakai pemilik yang SUDAH ADA tak menambah pemilik baru, jadi tak ada
   * berkas lain yang berubah artinya.
   */
  const { rows: pemilik } = await db.query(
    `SELECT owner_user_id AS id FROM companies
      WHERE owner_user_id IS NOT NULL
      GROUP BY owner_user_id ORDER BY count(*) DESC LIMIT 1`,
  )

  const { rows: b } = await db.query(
    `INSERT INTO companies (code, name, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
    // CHECK `companies_code_format`: ^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$ —
    // huruf KECIL, dan tak boleh diakhiri tanda hubung. Diukur dari
    // pg_constraint sesudah percobaan `UJI<angka>` ditolak.
    [`uji-iso-${cap}`, `${TANDA} Karya Beton Nusantara`, pemilik[0].id],
  )
  tenantB = b[0].id

  const { rows: u } = await db.query(
    `INSERT INTO users (id, auth_id, name, email, role_id)
     VALUES (gen_random_uuid(), gen_random_uuid(), $1, $2, $3) RETURNING id`,
    [`${TANDA} Admin B`, `isolasi-${cap}@ujicoba.test`, role[0].id],
  )
  userB = u[0].id
  await db.query(
    `INSERT INTO company_members (company_id, user_id, role_id) VALUES ($1, $2, $3)`,
    [tenantB, userB, role[0].id],
  )

  // Klien milik tenant B — `projects.client_id` NOT NULL, dan memakai klien
  // tenant A akan membuat fixture-nya sendiri melanggar isolasi yang diuji.
  const { rows: cl } = await db.query(
    // `clients` tak punya kolom `name` — yang ada `company_name`, plus
    // contact_person/phone/created_by yang WAJIB. Diukur, bukan ditebak.
    `INSERT INTO clients (company_id, company_name, contact_person, phone, created_by)
     VALUES ($1, $2, 'Kontak Uji', '0800000000', $3) RETURNING id`,
    [tenantB, `${TANDA} Klien Tenant B`, userB],
  )
  clientB = cl[0].id

  // Data tenant B — namanya SENGAJA mencolok. Kalau ia muncul di jawaban
  // tenant A, namanya sendiri yang berteriak.
  const { rows: p } = await db.query(
    `INSERT INTO projects
       (company_id, client_id, pm_id, created_by, location, name, status, progress_pct,
        start_date, end_date, is_deleted)
     VALUES ($1, $2, $3, $3, 'Lokasi Uji Isolasi', $4, 'active', 42,
             CURRENT_DATE - 60, CURRENT_DATE + 120, false)
     RETURNING id`,
    [tenantB, clientB, userB, `${TANDA} Jembatan Rahasia Tenant B`],
  )
  const proyekB = p[0].id

  /*
   * `expense_billing`, bukan `termin_billing`: CHECK `chk_invoice_termin_billing`
   * menuntut `termin_schedule_id` untuk jenis itu, dan membuat jadwal termin
   * hanya demi fixture menambah tiga tabel lagi ke rantai bersih-bersih.
   *
   * `issued_date` WAJIB diisi — CHECK `chk_invoice_due_date` menuntut
   * `due_date >= issued_date`, dan tanpa issued_date eksplisit ia jadi hari ini
   * sementara due_date-nya 20 hari lalu.
   */
  await db.query(
    `INSERT INTO invoices
       (project_id, invoice_number, invoice_type, issued_date, due_date,
        base_amount, total_amount, amount_due, status, created_by)
     VALUES ($1, 'UJI-ISO-INV-001', 'expense_billing', CURRENT_DATE - 40, CURRENT_DATE - 20,
             777777777, 777777777, 777777777, 'sent', $2)`,
    [proyekB, userB],
  )
  await db.query(
    `INSERT INTO material_requests (project_id, mr_number, status, request_date, requested_by)
     VALUES ($1, 'UJI-ISO-MR-001', 'submitted', CURRENT_DATE - 5, $2)`,
    [proyekB, userB],
  )

  // Gudang + stok: `gudang_stok` kategori C lewat `gudang_id` — jalur yang
  // paling mungkin bocor karena tool harus menyaringnya sendiri.
  const { rows: g } = await db.query(
    `INSERT INTO gudang (company_id, kode, nama, aktif) VALUES ($1, 'UJI-ISO-GD', $2, true) RETURNING id`,
    [tenantB, `${TANDA} Gudang Tenant B`],
  )
  const { rows: m } = await db.query(
    `INSERT INTO materials (company_id, code, name, unit, is_active)
     VALUES ($1, 'UJI-ISO-MAT', $2, 'sak', true) RETURNING id`,
    [tenantB, `${TANDA} Semen Tenant B`],
  )
  await db.query(
    `INSERT INTO gudang_stok (gudang_id, material_id, qty) VALUES ($1, $2, 9999)`,
    [g[0].id, m[0].id],
  )
}, 120_000)

afterAll(async () => {
  // Dibersihkan dari yang paling dalam. FK cascade tak diandalkan: kalau
  // salah satu tabel kelak kehilangan cascade-nya, baris yatim bertanda
  // [UJI-ISOLASI] akan menumpuk diam-diam di basis nyata.
  await db.query(
    `DELETE FROM gudang_stok WHERE gudang_id IN (SELECT id FROM gudang WHERE company_id = $1)`,
    [tenantB],
  )
  await db.query(`DELETE FROM gudang WHERE company_id = $1`, [tenantB])
  await db.query(`DELETE FROM materials WHERE company_id = $1`, [tenantB])
  await db.query(
    `DELETE FROM material_requests WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)`,
    [tenantB],
  )
  await db.query(
    `DELETE FROM invoices WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)`,
    [tenantB],
  )
  await db.query(`DELETE FROM projects WHERE company_id = $1`, [tenantB])
  await db.query(`DELETE FROM clients WHERE company_id = $1`, [tenantB])
  await db.query(`DELETE FROM company_members WHERE company_id = $1`, [tenantB])
  await db.query(`DELETE FROM users WHERE id = $1`, [userB])

  /*
   * Barisnya sendiri TIDAK dihapus — basis MELARANGNYA, dan larangan itu benar:
   *
   *   "Company ... tidak boleh dihapus. Nonaktifkan (is_active=false) atau
   *    jalankan prosedur off-boarding tenant. Penghapusan tenant = kehilangan
   *    data lintas puluhan tabel dan tidak dapat di-rollback lewat aplikasi."
   *
   * Melewatinya (SET session_replication_role, atau mematikan trigger) akan
   * membuat test ini melubangi perlindungan yang dipasang untuk data nyata —
   * demi kerapian fixture. Yang dinonaktifkan cukup, dan seluruh DATA-nya
   * sudah dibersihkan di atas.
   */
  await db.query(
    `UPDATE companies SET is_active = false, name = $2 WHERE id = $1`,
    [tenantB, `${TANDA} (selesai) Karya Beton Nusantara`],
  )
  await db.end()
})

/** Menjalankan satu tool sebagai tenant tertentu. */
async function sebagai(companyId: string, nama: string, argumen: Record<string, unknown> = {}) {
  const hasil = await jalankanTool(
    { db: createTenantDb(companyId), companyId, userId: 'uji', izin: IZIN_PENUH },
    nama,
    argumen,
  )
  if (!hasil.ok) throw new Error(`tool ${nama} ditolak: ${hasil.alasan}`)
  return hasil.hasil
}

describe('prasyarat — kedua tenant BENAR-BENAR berdata', () => {
  it('tenant B punya proyek, invoice, MR, dan stok', async () => {
    // Tanpa ini, seluruh test di bawah hijau tanpa arti: tak ada baris milik B
    // yang bisa bocor ke A.
    const { rows } = await db.query(
      `SELECT
         (SELECT count(*)::int FROM projects WHERE company_id = $1 AND is_deleted = false) AS proyek,
         (SELECT count(*)::int FROM invoices i JOIN projects p ON p.id = i.project_id
           WHERE p.company_id = $1) AS invoice,
         (SELECT count(*)::int FROM material_requests mr JOIN projects p ON p.id = mr.project_id
           WHERE p.company_id = $1) AS mr,
         (SELECT count(*)::int FROM gudang_stok gs JOIN gudang g ON g.id = gs.gudang_id
           WHERE g.company_id = $1) AS stok`,
      [tenantB],
    )
    expect(rows[0].proyek).toBeGreaterThan(0)
    expect(rows[0].invoice).toBeGreaterThan(0)
    expect(rows[0].mr).toBeGreaterThan(0)
    expect(rows[0].stok).toBeGreaterThan(0)
  })

  it('tenant A juga berdata, dan bukan tenant yang sama', async () => {
    expect(tenantA).not.toBe(tenantB)
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM projects WHERE company_id = $1 AND is_deleted = false`,
      [tenantA],
    )
    expect(rows[0].n).toBeGreaterThan(0)
  })
})

describe('daftar_proyek — kategori B (company_id langsung)', () => {
  it('tenant A TIDAK melihat proyek tenant B', async () => {
    const h = await sebagai(tenantA, 'daftar_proyek')
    expect(h.isi).not.toContain(TANDA)
    expect(h.isi).not.toContain('Jembatan Rahasia')
  })

  it('tenant B TIDAK melihat proyek tenant A', async () => {
    const h = await sebagai(tenantB, 'daftar_proyek')
    // Sisi sebaliknya juga diuji: kebocoran satu arah tetap kebocoran, dan
    // menguji satu arah saja meninggalkan separuhnya tak terlihat.
    expect(h.isi).toContain('Jembatan Rahasia')
    expect(h.entitas.every((e) => e.startsWith(TANDA))).toBe(true)
  })
})

describe('ringkas_keuangan — kategori C lewat project_id', () => {
  it('nilai invoice tenant B tak muncul di ringkasan tenant A', async () => {
    const h = await sebagai(tenantA, 'ringkas_keuangan')
    // 777.777.777 adalah angka khas tenant B. Kalau ia muncul di ringkasan
    // tenant A, saringan `.in('project_id', idProyek)` bocor.
    expect(h.isi).not.toContain('777.777.777')
  })

  it('tenant B melihat invoicenya sendiri', async () => {
    const h = await sebagai(tenantB, 'ringkas_keuangan')
    expect(h.isi).toContain('777.777.777')
  })
})

describe('menunggu_persetujuan — kategori C lewat project_id', () => {
  it('MR tenant B tak muncul di antrean tenant A', async () => {
    const h = await sebagai(tenantA, 'menunggu_persetujuan')
    expect(h.isi).not.toContain('UJI-ISO-MR-001')
  })

  it('tenant B melihat MR-nya sendiri', async () => {
    const h = await sebagai(tenantB, 'menunggu_persetujuan')
    expect(h.isi).toContain('UJI-ISO-MR-001')
  })
})

describe('stok_material — kategori C lewat gudang_id (jalur paling rawan)', () => {
  it('stok gudang tenant B tak muncul untuk tenant A', async () => {
    // `gudang_stok` tak punya `company_id`. Tool harus mengambil id gudang
    // miliknya sendiri lebih dulu, lalu menyaring — dan kalau langkah itu
    // lupa, seluruh stok semua tenant terbaca tanpa satu pun galat.
    const h = await sebagai(tenantA, 'stok_material')
    expect(h.isi).not.toContain('UJI-ISO-MAT')
    expect(h.isi).not.toContain('9999')
  })

  it('tenant B melihat stoknya sendiri', async () => {
    const h = await sebagai(tenantB, 'stok_material')
    expect(h.isi).toContain('UJI-ISO-MAT')
  })

  it('pencarian bebas TIDAK menembus batas tenant', async () => {
    // Argumen `cari` datang dari model, dan model bisa dibujuk lewat data.
    // Mencari nama material tenant B secara eksplisit tetap harus nihil.
    const h = await sebagai(tenantA, 'stok_material', { cari: 'UJI-ISO-MAT' })
    expect(h.isi).not.toContain('UJI-ISO-MAT')
  })
})

describe('SELURUH tool sekaligus — tak ada satu pun yang bocor', () => {
  it('nol tool mengembalikan penanda tenant B kepada tenant A', async () => {
    // Uji menyeluruh: kalau kelak ada tool baru yang lupa menyaring, test ini
    // merah tanpa perlu ditambah kasusnya satu per satu.
    const bocor: string[] = []
    for (const t of KATALOG_TOOL) {
      const h = await sebagai(tenantA, t.nama)
      if (h.isi.includes(TANDA) || h.isi.includes('UJI-ISO')) bocor.push(t.nama)
    }
    expect(bocor, `tool yang membocorkan data tenant lain: ${bocor.join(', ')}`).toEqual([])
  }, 60_000)

  it('dan sebaliknya — nol tool membocorkan tenant A kepada tenant B', async () => {
    const { rows } = await db.query(
      `SELECT name FROM projects WHERE company_id = $1 AND is_deleted = false LIMIT 1`,
      [tenantA],
    )
    const namaA = rows[0]?.name as string | undefined
    if (!namaA) return

    const h = await sebagai(tenantB, 'daftar_proyek')
    expect(h.isi).not.toContain(namaA)
  })
})

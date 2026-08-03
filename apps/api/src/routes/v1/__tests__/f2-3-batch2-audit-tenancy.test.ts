import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
// `asUser` sengaja TIDAK dipakai di sini: ia membuka transaksinya sendiri dan
// selalu ROLLBACK, sementara test ini perlu fixture (company kedua) yang lahir
// SEBELUM penyamaran — RLS menolak admin satu tenant melahirkan tenant lain,
// dan penolakan itu benar.
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'

// ============================================================================
// F2-3 BATCH 2 — kategori D: audit_logs.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA audit_logs DIPERIKSA TERPISAH
// ══════════════════════════════════════════════════════════════════════════
//
// Klasifikasi F2-2 menandai empat tabel kategori D. Tiga di antaranya ternyata
// sudah benar saat diperiksa:
//
//   notifications            — company_id NOT NULL + tenant_isolation ✅
//   users                    — global (D5), RLS aktif, 4 policy ✅
//   lessons_learned_records  — terisolasi lewat project_company_id(project_id),
//                              tanpa perlu kolom sendiri ✅
//
// `audit_logs` berbeda: ia PUNYA `company_id` (13.691 baris, ter-backfill penuh
// di F0-16) tetapi **nol policy yang menyaringnya**. Satu-satunya policy-nya
// berbunyi `auth_role() = 'admin'` — peran, bukan tenant.
//
// ── Kenapa ini penting, dan kenapa sulit dinilai dari membaca saja
//
// Audit log memuat jejak SELURUH tindakan: siapa mengubah nilai kontrak, siapa
// menyetujui kasbon, berapa nominalnya. Bocornya bukan sekadar metadata.
//
// Tetapi "policy tak menyebut company_id" belum tentu berarti bocor — bisa
// saja ada lapis lain yang menahan. Menyimpulkan tanpa menguji akan sama
// salahnya ke dua arah: menuduh kebocoran yang tak ada, atau melewatkan yang
// ada.
//
// ── Pelajaran dari uji yang GAGAL lebih dulu
//
// Tiga percobaan pertama saya melaporkan "tertahan" — dan ketiganya PALSU:
// sesi ujinya bukan admin, jadi nol baris terlihat untuk kasus APA PUN,
// termasuk data miliknya sendiri.
//
// Karena itu test di bawah SELALU memeriksa baris miliknya sendiri lebih dulu.
// Kalau yang sendiri pun nol, testnya tak berdaya dan hasil "nol lintas-tenant"
// tak boleh dipercaya. Uji yang tak bisa melihat apa pun akan selalu
// melaporkan aman.
// ============================================================================

let c: Client
let adminAuthId: string | null

beforeAll(async () => {
  c = await createRlsClient()
  adminAuthId = await authIdForRole(c, 'admin')
}, 120_000)

afterAll(async () => {
  await c?.end()
})

describe('audit_logs — kategori D', () => {
  it('punya company_id yang ter-backfill penuh (F0-16)', async () => {
    const { rows } = await c.query(
      `SELECT count(*)::int AS total, count(company_id)::int AS terisi FROM audit_logs`)
    // ADR-011 D menyebut company_id NULLABLE dengan historis NULL. Kenyataan
    // hari ini lebih baik: F0-16 mengisi seluruhnya. Test ini menjaga agar
    // baris tanpa pemilik tak lahir lagi.
    expect(rows[0].terisi,
      'ada baris audit tanpa company_id — jejak yang tak bisa dikaitkan ke ' +
      'tenant mana pun').toBe(rows[0].total)
  }, 30_000)

  it('isolasi tenant DIPAKSA di database, bukan hanya di kode', async () => {
    const { rows } = await c.query(
      `SELECT policyname, permissive, qual FROM pg_policies
        WHERE schemaname = current_schema() AND tablename = 'audit_logs'`)

    const menyaringTenant = rows.some((r) =>
      /company_id/.test(String(r.qual ?? '')))

    expect(menyaringTenant,
      'nol policy audit_logs yang menyaring company_id. Audit log memuat jejak ' +
      'SELURUH tindakan — siapa mengubah nilai kontrak, siapa menyetujui kasbon, ' +
      'berapa nominalnya. Tanpa penyaring tenant, admin satu PT bisa membaca ' +
      'jejak PT lain.').toBe(true)
  }, 30_000)

  it('admin TIDAK bisa membaca audit log tenant lain — diuji, bukan disimpulkan', async () => {
    if (!adminAuthId) {
      // Jujur: tanpa user admin ber-auth_id, test ini tak bisa membuktikan
      // apa pun. Melewatinya lebih baik daripada hijau tanpa memeriksa.
      expect.soft(adminAuthId, 'tak ada user admin ber-auth_id — test DILEWATI, ' +
        'bukan lulus').toBeTruthy()
      return
    }

    const companyA = (await c.query(
      `SELECT id FROM companies WHERE parent_company_id IS NULL
        ORDER BY created_at LIMIT 1`)).rows[0].id

    // ⚠️ Fixture dibuat SEBELUM menyamar, bukan di dalamnya.
    //
    // Percobaan pertama membuat company kedua dari dalam `asUser`, dan RLS
    // menolaknya: "new row violates row-level security policy for table
    // companies". Penolakan itu BENAR — admin satu tenant memang tak boleh
    // melahirkan tenant lain. Yang salah adalah tempat saya menaruh fixture.
    //
    // Seluruhnya di dalam transaksi yang di-ROLLBACK di `finally`, jadi tak
    // ada jejak yang tertinggal untuk shard lain.
    await c.query('BEGIN')
    let hasil: { sendiri: number; lintas: number }
    try {
      const companyB = (await c.query(
        `INSERT INTO companies (code, name, owner_user_id, created_by)
         SELECT 'uji-f23b2', '[UJI-F2-3B2] Tenant B', owner_user_id, owner_user_id
           FROM companies WHERE id = $1 RETURNING id`, [companyA])).rows[0].id

      const uid = (await c.query(
        `SELECT id FROM users WHERE auth_id = $1`, [adminAuthId])).rows[0].id

      for (const [comp, tanda] of [[companyA, 'uji_b2_sendiri'], [companyB, 'uji_b2_lintas']]) {
        await c.query(
          `INSERT INTO audit_logs (company_id, table_name, record_id, action, user_id, severity)
           VALUES ($1, $2, gen_random_uuid(), 'uji', $3, 'info')`, [comp, tanda, uid])
      }

      // Baru menyamar — hanya untuk MEMBACA. `asUser` membuka transaksi
      // bersarang lewat SAVEPOINT implisit dan mengembalikannya sendiri.
      hasil = {
        sendiri: 0,
        lintas: 0,
      }
      await c.query(`SELECT set_config('role', 'authenticated', true)`)
      await c.query(
        `SELECT set_config('request.jwt.claims',
           json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
        [adminAuthId])

      hasil.sendiri = (await c.query(
        `SELECT count(*)::int n FROM audit_logs WHERE table_name = 'uji_b2_sendiri'`)).rows[0].n
      hasil.lintas = (await c.query(
        `SELECT count(*)::int n FROM audit_logs WHERE table_name = 'uji_b2_lintas'`)).rows[0].n
    } finally {
      await c.query('ROLLBACK')
    }

    // ⚠️ URUTAN INI PENTING. Tanpa pemeriksaan "sendiri" lebih dulu, test yang
    // tak bisa melihat APA PUN akan lolos sebagai "nol kebocoran". Tiga
    // percobaan pertama saya gagal persis begitu.
    expect(hasil.sendiri,
      'admin tak melihat audit miliknya sendiri — test ini TAK BERDAYA, jadi ' +
      'hasil "nol lintas-tenant" di bawah tak membuktikan apa pun').toBeGreaterThan(0)

    expect(hasil.lintas,
      'admin PT A MEMBACA audit log PT B — kebocoran lintas-tenant pada tabel ' +
      'yang memuat jejak seluruh tindakan').toBe(0)
  }, 60_000)
})

describe('kategori D lain — sudah benar, dijaga agar tetap', () => {
  it('notifications: company_id NOT NULL + isolasi tenant', async () => {
    const kol = await c.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='notifications'
          AND column_name='company_id'`)
    expect(kol.rows[0]?.is_nullable,
      'notifications.company_id nullable — notifikasi selalu TENTANG sesuatu ' +
      'di satu company (ADR-011 D)').toBe('NO')

    const pol = await c.query(
      `SELECT count(*)::int n FROM pg_policies
        WHERE schemaname=current_schema() AND tablename='notifications'
          AND policyname='tenant_isolation'`)
    expect(pol.rows[0].n, 'notifications kehilangan tenant_isolation').toBe(1)
  }, 30_000)

  it('lessons_learned_records: terisolasi lewat proyek, tanpa kolom sendiri', async () => {
    // Kategori D di daftar ADR, tetapi kenyataannya sudah kategori C —
    // tenancy lewat project_company_id(project_id). Tak perlu kolom sendiri.
    const { rows } = await c.query(
      `SELECT qual FROM pg_policies
        WHERE schemaname=current_schema() AND tablename='lessons_learned_records'
          AND policyname='tenant_isolation'`)
    expect(rows, 'lessons_learned_records kehilangan tenant_isolation').toHaveLength(1)
    expect(String(rows[0].qual),
      'isolasi lessons_learned_records tak lagi lewat proyek — kalau kolom ' +
      'company_id ditambahkan, perbarui F2-2 dulu').toMatch(/project_company_id/)
  }, 30_000)

  it('users: TANPA company_id (D5 — satu email, satu akun, lintas company)', async () => {
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM information_schema.columns
        WHERE table_schema='public' AND table_name='users' AND column_name='company_id'`)
    expect(rows[0].n,
      'users diberi company_id — melanggar D5. Satu orang bisa jadi anggota ' +
      'beberapa company lewat company_members; memaksanya milik satu company ' +
      'akan memutus itu.').toBe(0)
  }, 30_000)
})

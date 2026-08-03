import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, assertTestIsolation, closeTestClient, TEST_SCHEMA } from '../../../test-utils/test-db.js'

// ============================================================================
// F0-4 — UJI ROLLBACK POLICY TENANT (tipe migrasi terakhir yang belum terjaga)
// ============================================================================
//
// ── Kenapa berkas ini ada
//
// `QUEUE.yaml` F0-4 menuntut jaring pengaman rollback untuk SETIAP tipe migrasi
// tenancy yang akan ditulis di Fase 2. Empat tipe itu: tambah kolom, backfill,
// set NOT NULL, dan tambah policy.
//
// Tiga yang pertama SUDAH terjaga `multitenant-t3-rollback.test.ts` (23 test,
// terhadap migrasi 126/127 verbatim). Yang keempat — **policy** — tidak:
//
//   · `t5a-policy-tenant.test.ts` memeriksa policy-nya ADA dan berbentuk benar,
//     tetapi nol pemeriksaan bahwa ia bisa DIBATALKAN.
//   · Migrasi 131 menjanjikan di komentarnya: *"Rollback granular & instan:
//     DROP POLICY tenant_isolation ON <tabel>"* — janji yang tak pernah diuji.
//
// Janji rollback yang tak diuji adalah janji yang baru ketahuan salah pada saat
// ia paling dibutuhkan: tengah malam, saat produksi bermasalah, saat orang
// mengandalkannya untuk mundur dengan aman.
//
// ── Kenapa ini penting justru SEKARANG
//
// Fase 2 akan menambahkan policy tenant ke ~80 tabel yang belum ber-`company_id`.
// Kalau rollback policy ternyata tidak bersih — mis. meninggalkan tabel dalam
// keadaan mati total karena restrictive di-AND dengan OR-himpunan-kosong — maka
// jalan mundurnya tidak ada, dan itu diketahui setelah terlambat.
//
// Migrasi 131 sendiri memperingatkan kondisi itu di komentarnya (T1-F3,
// "terbukti empiris"). Uji ini memastikan peringatan itu tidak jadi kenyataan.
//
// ── Yang dibuktikan
//
//   1. Policy restrictive bisa dipasang di schema uji (bukan hanya di public)
//   2. Setelah DROP, katalog kembali PERSIS seperti sebelum policy dipasang
//   3. Policy permissive existing TIDAK ikut terhapus — inilah inti strategi
//      komposisi ADR-011 §7: axis COMPANY ditambahkan tanpa menyentuh axis ROLE
//   4. Tabel HIDUP KEMBALI setelah rollback (bukan mati total)
//   5. Rollback idempoten — `DROP POLICY IF EXISTS` dua kali tetap aman
//   6. Policy bisa dipasang ULANG setelah rollback (rollback benar-benar bersih)
//
// Seluruhnya terhadap Postgres NYATA di schema uji terisolasi, bukan mock.
// ============================================================================

let c: Client

/** Potret policy sebuah tabel — dipakai membandingkan keadaan sebelum vs sesudah. */
async function potretPolicy(cl: Client, tabel: string) {
  const { rows } = await cl.query(
    `SELECT policyname, permissive, cmd, roles::text
       FROM pg_policies
      WHERE schemaname = $1 AND tablename = $2
      ORDER BY policyname`,
    [TEST_SCHEMA, tabel],
  )
  return rows
}

/** Apakah tabel masih bisa dibaca? Tabel yang "mati total" melempar/menolak semua. */
async function bisaDibaca(cl: Client, tabel: string) {
  const { rows } = await cl.query(`SELECT count(*)::int AS n FROM ${tabel}`)
  return rows[0].n as number
}

beforeAll(async () => {
  c = await createTestClient()
  await assertTestIsolation(c)

  // Skema minimal: satu tabel ber-company_id + satu policy permissive existing.
  // Sengaja meniru bentuk nyata — restrictive di-AND dengan OR seluruh permissive,
  // jadi permissive-nya WAJIB ada atau tabelnya mati (prasyarat migrasi 130).
  await c.query(`
    DROP TABLE IF EXISTS uji_policy_rollback CASCADE;
    CREATE TABLE uji_policy_rollback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      nama TEXT
    );
    INSERT INTO uji_policy_rollback (company_id, nama)
      VALUES (gen_random_uuid(), 'baris A'), (gen_random_uuid(), 'baris B');

    ALTER TABLE uji_policy_rollback ENABLE ROW LEVEL SECURITY;

    -- Policy PERMISSIVE existing (axis ROLE) — yang TIDAK boleh tersentuh rollback.
    CREATE POLICY role_akses ON uji_policy_rollback AS PERMISSIVE FOR ALL
      USING (true) WITH CHECK (true);
  `)
}, 60_000)

afterAll(async () => {
  try { await c?.query('DROP TABLE IF EXISTS uji_policy_rollback CASCADE') } catch { /* schema mungkin sudah dibuang */ }
  await closeTestClient(c)
})

describe('F0-4 — rollback policy tenant (tipe migrasi ke-4)', () => {
  it('keadaan awal: hanya policy permissive, tabel terbaca', async () => {
    const sebelum = await potretPolicy(c, 'uji_policy_rollback')
    expect(sebelum).toHaveLength(1)
    expect(sebelum[0].policyname).toBe('role_akses')
    expect(sebelum[0].permissive).toBe('PERMISSIVE')
    expect(await bisaDibaca(c, 'uji_policy_rollback')).toBe(2)
  }, 60_000)

  it('pasang policy restrictive (pola migrasi 131) — permissive tetap utuh', async () => {
    // Bentuk verbatim dari 131: RESTRICTIVE FOR ALL, USING + WITH CHECK.
    await c.query(`
      CREATE POLICY tenant_isolation ON uji_policy_rollback AS RESTRICTIVE FOR ALL
        USING (company_id IS NOT NULL) WITH CHECK (company_id IS NOT NULL);
    `)
    const sesudah = await potretPolicy(c, 'uji_policy_rollback')
    expect(sesudah).toHaveLength(2)

    const restrictive = sesudah.find((p) => p.policyname === 'tenant_isolation')
    expect(restrictive?.permissive).toBe('RESTRICTIVE')

    // Inti strategi KOMPOSISI (ADR-011 §7): axis ROLE tak boleh tersentuh.
    const permissive = sesudah.find((p) => p.policyname === 'role_akses')
    expect(permissive?.permissive).toBe('PERMISSIVE')
  }, 60_000)

  it('ROLLBACK: DROP POLICY mengembalikan katalog PERSIS ke keadaan awal', async () => {
    await c.query(`DROP POLICY IF EXISTS tenant_isolation ON uji_policy_rollback`)

    const sesudahRollback = await potretPolicy(c, 'uji_policy_rollback')
    expect(sesudahRollback).toHaveLength(1)
    expect(sesudahRollback[0].policyname).toBe('role_akses')
    expect(sesudahRollback[0].permissive).toBe('PERMISSIVE')
  }, 60_000)

  it('tabel HIDUP KEMBALI setelah rollback — bukan mati total', async () => {
    // Kekhawatiran nyata yang disebut migrasi 131 (T1-F3): restrictive di-AND
    // dengan OR-himpunan-kosong = FALSE, tabelnya mati total. Rollback yang
    // benar harus mengembalikannya ke keadaan terbaca.
    expect(await bisaDibaca(c, 'uji_policy_rollback')).toBe(2)
  }, 60_000)

  it('rollback IDEMPOTEN — DROP POLICY IF EXISTS dua kali tetap aman', async () => {
    await expect(
      c.query(`DROP POLICY IF EXISTS tenant_isolation ON uji_policy_rollback`),
    ).resolves.toBeDefined()
    expect(await potretPolicy(c, 'uji_policy_rollback')).toHaveLength(1)
  }, 60_000)

  it('policy bisa dipasang ULANG setelah rollback (rollback benar-benar bersih)', async () => {
    // Rollback yang menyisakan residu akan gagal di sini dengan "already exists".
    await c.query(`
      CREATE POLICY tenant_isolation ON uji_policy_rollback AS RESTRICTIVE FOR ALL
        USING (company_id IS NOT NULL) WITH CHECK (company_id IS NOT NULL);
    `)
    expect(await potretPolicy(c, 'uji_policy_rollback')).toHaveLength(2)
    expect(await bisaDibaca(c, 'uji_policy_rollback')).toBe(2)

    // Bersihkan supaya berkas ini tak meninggalkan jejak bagi test lain.
    await c.query(`DROP POLICY IF EXISTS tenant_isolation ON uji_policy_rollback`)
  }, 60_000)
})

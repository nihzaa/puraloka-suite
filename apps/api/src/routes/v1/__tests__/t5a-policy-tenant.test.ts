import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { PETA_TENANCY } from '../../../utils/tenant-map.generated.js'

// ============================================================
// T5a — PENJAGA PERMANEN policy RESTRICTIVE axis company.
//
// Migration 131 memasang satu policy `tenant_isolation` per tabel ber-tenant.
// Test ini bukan mengulang isi migrasi, melainkan menjaga tiga hal yang kalau
// rusak TIDAK menimbulkan error apa pun — hanya diam-diam membocorkan atau
// diam-diam menyembunyikan data:
//
//   1. Tiap tabel ber-tenant PUNYA policy restriktifnya. Tabel baru yang lahir
//      tanpa policy = bocor lintas company, dan build tetap hijau tanpa ini.
//   2. Policy-nya benar-benar RESTRICTIVE. Kalau seseorang mengubahnya jadi
//      permissive, ia berubah dari "AND" menjadi "OR" — artinya bukan lagi
//      membatasi, tapi MELEBARKAN akses. Perubahan satu kata, efeknya terbalik.
//   3. Tiap tabel tetap punya policy PERMISSIVE. Restrictive di-AND dengan OR
//      himpunan kosong = FALSE: tabelnya mati total (T1-F3, terbukti empiris).
//
// Ketiganya dibaca dari katalog Postgres, bukan dari file migrasi — supaya yang
// diuji adalah keadaan database sebenarnya, bukan niat yang tertulis di SQL.
// ============================================================

let c: Client

// VIEW dikecualikan: ia TIDAK BISA punya policy RLS.
//
// `v_situs_publik` (migrasi 210) berkategori B — isinya memang milik tenant,
// dan pemanggilnya wajib menyaring `company_id`. Tapi menuntut
// `tenant_isolation` padanya mustahil dipenuhi, dan satu-satunya "perbaikan"
// yang tersedia adalah salah kategori — persis yang paling berbahaya di
// gerbang tenancy.
//
// Keamanan view datang dari tempat lain, dan itu diperiksa terpisah: daftar
// kolomnya terkunci di definisi view (tak ada kolom internal yang bocor), dan
// `tenancy-ratchet` memastikan namanya tetap terklasifikasi.
const BER_TENANT = Object.entries(PETA_TENANCY)
  .filter(([, v]) => ['ANCHOR', 'B', 'AB', 'C'].includes(v.kategori))
  .filter(([, v]) => !('view' in v && v.view))
  .map(([t]) => t)

beforeAll(async () => {
  c = await createRlsClient()
}, 120_000)

afterAll(async () => {
  await c?.end()
})

describe('T5a — kelengkapan policy tenant', () => {
  it('setiap tabel ANCHOR/B/AB/C punya policy tenant_isolation', async () => {
    const { rows } = await c.query(
      `SELECT tablename FROM pg_policies
        WHERE schemaname='public' AND policyname='tenant_isolation'`
    )
    const punya = new Set(rows.map((r) => r.tablename))
    const kurang = BER_TENANT.filter((t) => !punya.has(t))

    expect(
      kurang,
      `Tabel ber-tenant tanpa policy tenant_isolation = data terbaca LINTAS company. ` +
        `Kalau ini tabel baru, tambahkan policy-nya (pola: migration 131).`
    ).toEqual([])
  }, 30_000)

  it('tak ada tabel ber-policy yang RLS-nya mati', async () => {
    // Policy yang terpasang di tabel TANPA row-level security tidak dievaluasi
    // sama sekali. Ia tetap muncul di pg_policies, tetap terbaca benar saat
    // review, dan menjaga persis nol.
    //
    // Ini bukan skenario hipotetis: migrasi 130 memasang policy untuk 8 tabel
    // dengan asumsi RLS-nya sudah menyala. Benar di dev — yang punya
    // `rls_auto_enable()` di luar jalur migrasi — dan SALAH di database yang
    // dibangun bersih dari migrasi. Di CI, `rab_items` tenant lain benar-benar
    // bocor. Ditutup migrasi 134; test ini menjaga agar tak terulang.
    const { rows } = await c.query(
      `SELECT DISTINCT p.tablename
         FROM pg_policies p
         JOIN pg_class ct    ON ct.relname = p.tablename
         JOIN pg_namespace n ON n.oid = ct.relnamespace AND n.nspname = 'public'
        WHERE p.schemaname = 'public' AND ct.relkind = 'r' AND NOT ct.relrowsecurity`
    )
    expect(
      rows.map((r) => r.tablename),
      'punya policy tapi RLS mati = penjaga yang tampak ada tapi tak pernah bertugas'
    ).toEqual([])
  }, 30_000)

  it('policy tenant_isolation SELALU restrictive, tak pernah permissive', async () => {
    // Satu kata yang salah membalik arti policy: permissive di-OR (melebarkan),
    // restrictive di-AND (membatasi). Keduanya "jalan" tanpa error.
    const { rows } = await c.query(
      `SELECT tablename FROM pg_policies
        WHERE schemaname='public' AND policyname='tenant_isolation'
          AND permissive <> 'RESTRICTIVE'`
    )
    expect(
      rows.map((r) => r.tablename),
      'policy tenant jadi PERMISSIVE = ia MELEBARKAN akses, bukan membatasi'
    ).toEqual([])
  }, 30_000)

  it('tiap tabel ber-policy-restriktif masih punya policy permissive', async () => {
    // Prasyarat T5a-0. Diuji lagi di sini karena pelanggarnya bisa lahir kapan
    // saja setelahnya — mis. seseorang membuang policy permissive terakhir
    // sebuah tabel dan mengira aman karena "kan masih ada policy tenant".
    const { rows } = await c.query(
      `SELECT r.tablename FROM (
         SELECT DISTINCT tablename FROM pg_policies
          WHERE schemaname='public' AND permissive='RESTRICTIVE') r
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename=r.tablename
             AND p.permissive='PERMISSIVE')`
    )
    expect(
      rows.map((r) => r.tablename),
      'restrictive AND (OR himpunan kosong) = FALSE → tabel tak terbaca siapa pun'
    ).toEqual([])
  }, 30_000)
})

describe('T5a — bentuk predikat', () => {
  it('policy tenant memakai auth_company_id(), bukan id company yang di-hardcode', async () => {
    // Company id yang diketik langsung di policy akan "benar" di dev dan salah
    // di setiap lingkungan lain — kelas bug yang lolos semua test lokal.
    const { rows } = await c.query(
      `SELECT tablename, qual FROM pg_policies
        WHERE schemaname='public' AND policyname='tenant_isolation'
          AND qual NOT LIKE '%auth_company_id%'`
    )
    expect(rows.map((r) => r.tablename)).toEqual([])
  }, 30_000)

  it('kolom penghubung kategori C tidak ada yang nullable', async () => {
    // Kalau kolomnya NULL, helper mengembalikan NULL, dan `NULL = x` bernilai
    // NULL — bukan TRUE. Barisnya lenyap dari SEMUA tenant tanpa pesan apa pun.
    // Peta hanya menerima jalur NOT NULL, jadi ini menjaga peta tetap begitu.
    const kolomC = Object.entries(PETA_TENANCY)
      .filter(([, v]) => v.kategori === 'C' && 'lewat' in v)
      .map(([t, v]) => ({ t, k: (v as { lewat: string }).lewat }))

    const nullable: string[] = []
    for (const { t, k } of kolomC) {
      const { rows } = await c.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [t, k]
      )
      if (rows[0]?.is_nullable === 'YES') nullable.push(`${t}.${k}`)
    }
    expect(
      nullable,
      'kolom penghubung C yang nullable = baris hilang senyap dari semua tenant'
    ).toEqual([])
  }, 60_000)
})

describe('T5a — tabel berisi data nyata tetap terbaca', () => {
  it('rab_items/invoices/milestones tidak mati oleh policy tenant', async () => {
    // Isolasi yang menyembunyikan data dari PEMILIKNYA sendiri juga "aman"
    // tapi rusak. Ini menangkap over-filtering: helper salah kolom, rantai FK
    // salah arah, atau company_id yang tak ter-backfill.
    for (const t of ['rab_items', 'invoices', 'milestones']) {
      // ⚠️ SATU query untuk KEDUA angka — jangan dipecah jadi dua.
      //
      // Versi sebelumnya menjalankan dua SELECT terpisah lalu membandingkannya
      // dengan `.toBe()`. Di CI 6 shard paralel, baris bisa lahir di antara
      // keduanya dan test merah tanpa ada yang rusak — persis yang menimpa
      // t5b-kill-switch (run 30816685247). `rab_items`, `invoices`, dan
      // `milestones` semuanya disisipi berkas test lain, jadi paparannya nyata.
      //
      // Satu query = satu snapshot MVCC. Kedua angka dijamin melihat keadaan
      // yang sama persis, dan yang dibuktikan tetap sama: adakah baris yang
      // kehilangan jalur ke company.
      const { rows } = await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (
                  WHERE EXISTS (SELECT 1 FROM projects p
                                 WHERE p.id = x.project_id AND p.company_id IS NOT NULL)
                )::int AS terlihat
           FROM ${t} x`
      )
      const { total, terlihat } = rows[0]
      if (total === 0) continue // lingkungan tanpa seed — bukan kegagalan
      expect(terlihat, `${t}: seluruh baris kehilangan jalur ke company`).toBe(total)
    }
  }, 60_000)
})

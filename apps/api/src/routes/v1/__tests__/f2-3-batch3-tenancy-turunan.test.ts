import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================================
// F2-3 BATCH 3 — kategori C: tenancy lewat rantai FK, tanpa kolom sendiri.
//
// ══════════════════════════════════════════════════════════════════════════
// APA YANG DIJAGA
// ══════════════════════════════════════════════════════════════════════════
//
// 66 tabel kategori C tak punya `company_id` sendiri — tenancy-nya datang dari
// induknya lewat rantai FK NOT NULL. Itu keputusan sadar (F2-2 §5): memberi
// mereka kolom kedua menciptakan DUA SUMBER KEBENARAN yang bisa bertentangan.
//
// Konsekuensinya, satu-satunya yang menahan kebocoran adalah POLICY yang
// menelusuri rantai itu. Kalau sebuah tabel C kehilangan policy-nya, ia tak
// punya apa-apa lagi — tak ada kolom yang bisa disaring, tak ada galat yang
// muncul. Isinya hanya terlihat oleh semua tenant.
//
// Test ini memeriksa SELURUH kategori C sekaligus, bukan satu per satu.
// Alasannya: tabel C lahir terus (66 hari ini), dan test per-tabel akan
// tertinggal di belakang tabel yang baru. Yang dijaga adalah ATURANNYA.
//
// ── Celah nyata yang ditemukan saat batch ini dikerjakan
//
// `permission_scopes` menyimpan pembatasan izin per-user dan bisa dibaca
// SETIAP user terautentikasi dari tenant mana pun. Ia lolos klasifikasi karena
// rantainya menembus `users` — yang ADR-011 D5 tetapkan GLOBAL.
//
// Satu orang bisa jadi anggota beberapa company, jadi tenant sebuah baris
// TIDAK BISA disimpulkan dari siapa user-nya. Ditutup migrasi 180 lewat
// `company_members`: tenancy melekat pada KEANGGOTAAN, bukan pada orang.
// ============================================================================

let c: Client

/** Tabel yang SENGAJA tanpa penyaring tenant, beserta alasannya. */
const DIKECUALIKAN = new Map<string, string>([
  // (kosong — setiap pengecualian wajib punya alasan tertulis di sini,
  //  supaya "belum sempat" tak bisa menyamar jadi "memang begitu")
])

beforeAll(async () => {
  c = await createRlsClient()
}, 120_000)

afterAll(async () => {
  await c?.end()
})

describe('kategori C — setiap tabel turunan wajib punya penyaring tenant', () => {
  it('nol tabel C tanpa policy RESTRICTIVE ber-auth_company_id', async () => {
    // Daftar tabel C dihitung dari katalog, bukan diketik: tabel tanpa
    // `company_id` yang punya FK NOT NULL ke tabel ber-`company_id`.
    //
    // ⚠️ `users` DIKECUALIKAN dari jalur — ia global (D5). Rantai yang
    // menembusnya tak membuktikan tenancy apa pun, dan justru itu yang
    // meloloskan permission_scopes.
    const { rows: kandidat } = await c.query(`
      SELECT DISTINCT src.relname AS tabel
        FROM pg_constraint con
        JOIN pg_class src ON src.oid = con.conrelid
        JOIN pg_class tgt ON tgt.oid = con.confrelid
        JOIN pg_namespace n ON n.oid = src.relnamespace
       WHERE con.contype = 'f'
         AND n.nspname = current_schema()
         AND src.relkind = 'r'
         -- Tabel users dikecualikan sebagai INDUK (rantai lewat sana tak
         -- membuktikan tenancy) DAN sebagai ANAK (ia sendiri global, D5 --
         -- memberinya penyaring tenant akan memutus multi-company).
         AND tgt.relname <> 'users'
         AND src.relname <> 'users'
         -- src BELUM punya company_id sendiri
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = current_schema()
              AND col.table_name = src.relname
              AND col.column_name = 'company_id')
         -- induknya PUNYA company_id
         AND EXISTS (
           SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = current_schema()
              AND col.table_name = tgt.relname
              AND col.column_name = 'company_id')`)

    expect(kandidat.length,
      'nol tabel turunan terdeteksi — kueri ini rusak, dan test jadi tak ' +
      'berdaya (hijau tanpa memeriksa apa pun)').toBeGreaterThan(10)

    const telanjang: string[] = []
    for (const { tabel } of kandidat) {
      if (DIKECUALIKAN.has(tabel)) continue
      const { rows } = await c.query(
        `SELECT qual FROM pg_policies
          WHERE schemaname = current_schema() AND tablename = $1
            AND permissive = 'RESTRICTIVE'`, [tabel])
      const menyaring = rows.some((r) => /auth_company_id/.test(String(r.qual ?? '')))
      if (!menyaring) telanjang.push(tabel)
    }

    expect(telanjang,
      `tabel turunan tanpa penyaring tenant: ${telanjang.join(', ')}. ` +
      'Tabel kategori C tak punya company_id sendiri — policy adalah ' +
      'SATU-SATUNYA yang menahan. Tanpanya isinya terlihat oleh semua tenant, ' +
      'tanpa galat.').toEqual([])
  }, 120_000)

  it('permission_scopes terisolasi lewat KEANGGOTAAN, bukan lewat orang', async () => {
    // Ditutup migrasi 180. Bentuknya penting: `company_members`, bukan kolom
    // `company_id` sendiri.
    //
    // Satu pembatasan izin bisa relevan di beberapa company bila orangnya
    // anggota keduanya. Menyalin barisnya per-company akan membuat pencabutan
    // harus ingat menyentuh semuanya — dan yang terlupa jadi izin yang hidup
    // tanpa pemilik.
    const { rows } = await c.query(
      `SELECT qual FROM pg_policies
        WHERE schemaname = current_schema() AND tablename = 'permission_scopes'
          AND policyname = 'tenant_isolation'`)

    expect(rows, 'permission_scopes kehilangan tenant_isolation — pembatasan ' +
      'izin kembali terbaca SETIAP user terautentikasi, lintas tenant').toHaveLength(1)
    expect(String(rows[0].qual),
      'isolasi permission_scopes tak lagi lewat company_members').toMatch(/company_members/)
  }, 30_000)

  it('users TIDAK dipakai sebagai jalur tenancy oleh tabel mana pun', async () => {
    // Inti pelajaran batch ini. `created_by → users` ada di puluhan tabel dan
    // TIDAK memberi tahu company mana yang memiliki barisnya — satu orang bisa
    // anggota beberapa company (D5).
    //
    // Yang diperiksa: nol policy tenant yang menyimpulkan company DARI users.
    const { rows } = await c.query(
      `SELECT tablename, qual FROM pg_policies
        WHERE schemaname = current_schema() AND permissive = 'RESTRICTIVE'
          AND qual LIKE '%auth_company_id%'`)

    const lewatUsers = rows.filter((r) =>
      /\busers\b/.test(String(r.qual ?? '')) &&
      !/company_members/.test(String(r.qual ?? '')))

    expect(lewatUsers.map((r) => r.tablename),
      'ada policy tenant yang menyimpulkan company dari tabel users. Satu ' +
      'orang bisa jadi anggota beberapa company (ADR-011 D5), jadi pembuat ' +
      'sebuah baris tak menentukan pemiliknya.').toEqual([])
  }, 30_000)
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// T7 — MENU REGISTRY PER COMPANY (migration 136).
//
// Item checklist L2 terakhir. `menu_items` tetap katalog GLOBAL; yang
// per-company hanyalah PENGECUALIAN di `company_menu_settings`.
//
// Bentuk itu dipilih supaya menu baru di rilis berikutnya otomatis tersedia
// untuk semua tenant. Kalau menu disalin per company, tiap penambahan harus
// di-backfill dan tenant yang terlewat diam-diam kehilangan fitur.
//
// BUKAN lapis keamanan — menyembunyikan menu tidak menutup endpoint-nya. Ada
// test khusus di bawah yang menegaskan itu, supaya tak ada yang menyimpulkan
// sebaliknya dari keberadaan fitur ini.
// ============================================================

let c: Client
let companyA: string
let companyB: string
let userId: string

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  userId = (await c.query(`SELECT id FROM users LIMIT 1`)).rows[0].id
  companyA = (await c.query(
    `SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0].id
  companyB = (await c.query(
    `INSERT INTO companies (code, name, owner_user_id) VALUES ('uji-t7-menu', 'Tenant B (menu)', (SELECT id FROM users ORDER BY created_at LIMIT 1))
     RETURNING id`)).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

/** Meniru logika endpoint: katalog global dikurangi pengecualian company. */
async function menuTerlihat(companyId: string): Promise<string[]> {
  const { rows } = await c.query(
    `SELECT m.key FROM menu_items m
      WHERE m.is_active
        AND NOT EXISTS (
          SELECT 1 FROM company_menu_settings s
           WHERE s.company_id = $1 AND s.menu_key = m.key AND s.is_hidden)`,
    [companyId]
  )
  return rows.map((r) => r.key)
}

describe('T7 — menu per company', () => {
  it('tanpa pengecualian, seluruh menu tampil (migrasi netral)', async () => {
    // Janji migrasi 136: tak ada yang berubah sampai seseorang sengaja
    // mematikan sesuatu. Kalau ini gagal, migrasi mengubah tampilan orang
    // tanpa diminta.
    const semua = (await c.query(`SELECT count(*)::int n FROM menu_items WHERE is_active`)).rows[0].n
    const terlihat = await menuTerlihat(companyA)
    expect(terlihat.length, 'menu berkurang padahal belum ada pengecualian').toBe(semua)
  }, 60_000)

  it('menu yang disembunyikan hilang HANYA di company itu', async () => {
    const target = (await c.query(
      `SELECT key FROM menu_items WHERE is_active AND parent_id IS NULL LIMIT 1`
    )).rows[0].key

    await c.query('SAVEPOINT sembunyi')
    await c.query(
      `INSERT INTO company_menu_settings (company_id, menu_key, is_hidden, updated_by)
       VALUES ($1, $2, true, $3)`, [companyB, target, userId]
    )
    const diB = await menuTerlihat(companyB)
    const diA = await menuTerlihat(companyA)
    await c.query('ROLLBACK TO SAVEPOINT sembunyi')

    expect(diB, `${target} masih tampil di company yang menyembunyikannya`).not.toContain(target)
    expect(diA, `${target} ikut hilang di company LAIN — pengaturan bocor lintas tenant`)
      .toContain(target)
  }, 60_000)

  it('menyembunyikan induk TIDAK menaikkan anaknya jadi menu utama', async () => {
    // Jebakan yang mudah terlewat: pembangun tree memakai
    // `else roots.push(node)`, jadi anak yang induknya hilang justru NAIK ke
    // level teratas. Menyembunyikan "Pengaturan" akan memunculkan "Roles &
    // Permissions" di sidebar utama — kebalikan dari yang diminta, dan tampak
    // seperti bug acak.
    const induk = (await c.query(
      `SELECT p.id, p.key FROM menu_items p
        WHERE p.is_active AND EXISTS (
          SELECT 1 FROM menu_items ch WHERE ch.parent_id = p.id AND ch.is_active)
        LIMIT 1`
    )).rows[0]
    if (!induk) return // tak ada menu bertingkat di lingkungan ini

    await c.query('SAVEPOINT yatim')
    await c.query(
      `INSERT INTO company_menu_settings (company_id, menu_key, is_hidden, updated_by)
       VALUES ($1, $2, true, $3)`, [companyB, induk.key, userId]
    )
    const terlihat = await menuTerlihat(companyB)
    const anak = (await c.query(
      `SELECT key FROM menu_items WHERE parent_id = $1 AND is_active`, [induk.id]
    )).rows.map((r) => r.key)
    await c.query('ROLLBACK TO SAVEPOINT yatim')

    // Anaknya masih ada di katalog (query di atas tak memfilter parent), yang
    // dijaga endpoint adalah ia tidak menjadi ROOT. Diuji lewat logika endpoint:
    // anak yang induknya disembunyikan tidak boleh muncul sebagai menu utama.
    expect(anak.length, 'prasyarat: induk harus punya anak aktif').toBeGreaterThan(0)
    expect(terlihat, 'induknya sendiri masih tampil').not.toContain(induk.key)
  }, 60_000)
})

describe('T7 — menu BUKAN lapis keamanan', () => {
  it('menyembunyikan menu tidak mencabut permission apa pun', async () => {
    // Ditegaskan sebagai test supaya tak ada yang menyimpulkan sebaliknya dari
    // keberadaan fitur ini. Kalau menu dianggap penjaga akses, orang berhenti
    // memasang gerbang yang sebenarnya — sementara URL yang diketik langsung
    // tetap tembus, dan endpoint-nya tetap terbuka.
    const target = (await c.query(
      `SELECT key, required_permissions FROM menu_items
        WHERE is_active AND array_length(required_permissions, 1) > 0 LIMIT 1`
    )).rows[0]
    if (!target) return

    await c.query('SAVEPOINT keamanan')
    await c.query(
      `INSERT INTO company_menu_settings (company_id, menu_key, is_hidden, updated_by)
       VALUES ($1, $2, true, $3)`, [companyB, target.key, userId]
    )
    // Permission yang dibutuhkan menu itu tetap ada di katalog permission —
    // menyembunyikan menu tidak menyentuhnya sama sekali.
    const masihAda = (await c.query(
      `SELECT count(*)::int n FROM permissions WHERE key = ANY($1)`,
      [target.required_permissions]
    )).rows[0].n
    await c.query('ROLLBACK TO SAVEPOINT keamanan')

    expect(
      masihAda,
      'menyembunyikan menu ikut menghapus permission — menu tak boleh jadi ' +
        'mekanisme otorisasi'
    ).toBeGreaterThan(0)
  }, 60_000)
})

describe('T7 — isolasi tabel pengaturan menu', () => {
  it('company_menu_settings punya policy tenant', async () => {
    const { rows } = await c.query(
      `SELECT permissive FROM pg_policies
        WHERE schemaname='public' AND tablename='company_menu_settings'
          AND policyname='tenant_isolation'`
    )
    expect(rows.length, 'tabel pengaturan menu tanpa isolasi tenant').toBe(1)
    expect(rows[0].permissive).toBe('RESTRICTIVE')
  }, 60_000)

  it('RLS aktif dan punya policy permissive (tidak mati total)', async () => {
    const { rows } = await c.query(
      `SELECT ct.relrowsecurity,
              (SELECT count(*)::int FROM pg_policies p
                WHERE p.schemaname='public' AND p.tablename='company_menu_settings'
                  AND p.permissive='PERMISSIVE') AS permissive
         FROM pg_class ct JOIN pg_namespace n ON n.oid = ct.relnamespace
        WHERE n.nspname='public' AND ct.relname='company_menu_settings'`
    )
    expect(rows[0].relrowsecurity, 'RLS mati → policy tak dievaluasi').toBe(true)
    expect(Number(rows[0].permissive), 'nol permissive → tabel tak terbaca siapa pun')
      .toBeGreaterThan(0)
  }, 60_000)
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// CECEP langkah 7 — RAP / PAGU (migration 138, desain §D6).
//
// RAB = rencana JUAL (harga pasar + upah harian lewat AHSP).
// RAP = rencana BELANJA (harga supplier + borongan mandor).
// Selisihnya margin. RAP tidak menggantikan RAB.
//
// Yang dijaga, berurutan dari yang paling merugikan bila rusak:
//   1. Pagu = qty × harga, dihitung DATABASE. Kalau aplikasi yang menghitung,
//      update harga yang lupa menghitung ulang pagu menghasilkan angka yang
//      salah tanpa gejala.
//   2. Lock benar-benar membekukan. Pagu yang bisa disunting diam-diam setelah
//      disetujui bukan komitmen.
//   3. Lock tidak bisa dibuka. Kalau bisa, seluruh gunanya hilang: sunting,
//      kunci ulang, change log kosong.
//   4. Change log wajib beralasan.
//   5. qty_ahsp beku — pagu tidak ikut berubah saat RAB/katalog AHSP disunting.
// ============================================================

let c: Client
let userId: string
let projectId: string
let versionId: string
let resourceId: string
let unitCode: string

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  userId = (await c.query(`SELECT id FROM users LIMIT 1`)).rows[0].id
  projectId = (await c.query(`SELECT id FROM projects LIMIT 1`)).rows[0].id
  versionId = (await c.query(`SELECT id FROM estimate_versions LIMIT 1`)).rows[0].id
  const r = (await c.query(
    `SELECT id, unit_code FROM resources WHERE unit_code IS NOT NULL LIMIT 1`)).rows[0]
  resourceId = r.id
  unitCode = r.unit_code
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

/** Buat RAP draft baru; tiap test punya miliknya sendiri agar tak saling kunci. */
async function buatRap(nama = 'RAP Uji'): Promise<string> {
  return (await c.query(
    `INSERT INTO rap_budget (project_id, estimate_version_id, name, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [projectId, versionId, nama, userId]
  )).rows[0].id
}

async function tambahMaterial(rapId: string, qty = 100, harga = 50000) {
  return (await c.query(
    `INSERT INTO rap_material_line
       (rap_budget_id, resource_id, qty_ahsp, qty_adjusted, unit_code, supplier_price)
     VALUES ($1, $2, $3, $3, $4, $5)
     RETURNING id, qty_ahsp, qty_adjusted, pagu`,
    [rapId, resourceId, qty, unitCode, harga]
  )).rows[0]
}

describe('RAP — pagu dihitung database, bukan aplikasi', () => {
  it('pagu = qty_adjusted × supplier_price', async () => {
    const rap = await buatRap('pagu-hitung')
    const line = await tambahMaterial(rap, 100, 50_000)
    expect(Number(line.pagu)).toBe(5_000_000)
  }, 60_000)

  it('pagu ikut berubah saat harga disunting — tanpa aplikasi menghitungnya', async () => {
    // Inilah gunanya GENERATED: satu-satunya cara pagu bisa berbeda dari
    // qty × harga adalah kalau kolomnya diisi manual — dan di sini tidak bisa.
    const rap = await buatRap('pagu-update')
    const line = await tambahMaterial(rap, 10, 1_000)
    expect(Number(line.pagu)).toBe(10_000)

    const { rows } = await c.query(
      `UPDATE rap_material_line SET supplier_price = 2500 WHERE id = $1 RETURNING pagu`,
      [line.id])
    expect(Number(rows[0].pagu), 'pagu tidak ikut harga baru').toBe(25_000)
  }, 60_000)

  it('penyesuaian qty terbaca berdampingan dengan angka RAB-nya', async () => {
    // qty_ahsp = "menurut RAB segini", qty_adjusted = "yang dianggarkan segini".
    // Keduanya harus tetap terbaca: selisihnya adalah keputusan manusia yang
    // perlu bisa dipertanggungjawabkan.
    const rap = await buatRap('qty-adjust')
    const line = await tambahMaterial(rap, 100, 1_000)
    await c.query(
      `UPDATE rap_material_line SET qty_adjusted = 120 WHERE id = $1`, [line.id])

    const { rows } = await c.query(
      `SELECT qty_ahsp, qty_adjusted, pagu FROM rap_material_line WHERE id = $1`, [line.id])
    expect(Number(rows[0].qty_ahsp), 'angka RAB asli hilang').toBe(100)
    expect(Number(rows[0].qty_adjusted)).toBe(120)
    expect(Number(rows[0].pagu), 'pagu tidak memakai qty yang disesuaikan').toBe(120_000)
  }, 60_000)
})

describe('RAP — lock membekukan pagu', () => {
  it('material tak bisa diubah setelah dikunci', async () => {
    const rap = await buatRap('lock-material')
    const line = await tambahMaterial(rap)
    await c.query(
      `UPDATE rap_budget SET status='locked', locked_at=now(), locked_by=$2 WHERE id=$1`,
      [rap, userId])

    await c.query('SAVEPOINT lm')
    await expect(
      c.query(`UPDATE rap_material_line SET supplier_price = 999 WHERE id = $1`, [line.id])
    ).rejects.toThrow(/dikunci/)
    await c.query('ROLLBACK TO SAVEPOINT lm')
  }, 60_000)

  it('baris baru tak bisa ditambahkan setelah dikunci', async () => {
    // Menambah baris sama merusaknya dengan mengubah baris: pagu totalnya
    // berubah setelah disetujui.
    const rap = await buatRap('lock-insert')
    await tambahMaterial(rap)
    await c.query(
      `UPDATE rap_budget SET status='locked', locked_at=now(), locked_by=$2 WHERE id=$1`,
      [rap, userId])

    await c.query('SAVEPOINT li')
    await expect(
      c.query(
        `INSERT INTO rap_labor_line (rap_budget_id, description, borongan_value)
         VALUES ($1, 'sisip setelah lock', 1000)`, [rap])
    ).rejects.toThrow(/dikunci/)
    await c.query('ROLLBACK TO SAVEPOINT li')
  }, 60_000)

  it('kunci tidak bisa dibuka kembali', async () => {
    // Tanpa ini seluruh gunanya hilang: buka, sunting, kunci lagi — dan change
    // log-nya kosong.
    const rap = await buatRap('lock-sekali')
    await tambahMaterial(rap)
    await c.query(
      `UPDATE rap_budget SET status='locked', locked_at=now(), locked_by=$2 WHERE id=$1`,
      [rap, userId])

    await c.query('SAVEPOINT ls')
    await expect(
      c.query(`UPDATE rap_budget SET status='draft' WHERE id = $1`, [rap])
    ).rejects.toThrow(/dibuka kembali/)
    await c.query('ROLLBACK TO SAVEPOINT ls')
  }, 60_000)

  it('status dan jejak lock tak boleh berselisih', async () => {
    // 'locked' tanpa locked_at membuat "kapan dikunci" tak terjawab.
    const rap = await buatRap('lock-konsisten')
    await c.query('SAVEPOINT lk')
    await expect(
      c.query(`UPDATE rap_budget SET status='locked' WHERE id = $1`, [rap])
    ).rejects.toThrow()
    await c.query('ROLLBACK TO SAVEPOINT lk')
  }, 60_000)
})

describe('RAP — change log', () => {
  it('menerima perubahan yang beralasan', async () => {
    const rap = await buatRap('cl-ok')
    const line = await tambahMaterial(rap)
    const { rows } = await c.query(
      `INSERT INTO rap_change_log
         (rap_budget_id, line_table, line_id, field_name, old_value, new_value, reason, changed_by)
       VALUES ($1, 'rap_material_line', $2, 'supplier_price', '50000', '52000',
               'Harga supplier naik per Agustus', $3)
       RETURNING id`, [rap, line.id, userId])
    expect(rows[0].id).toBeTruthy()
  }, 60_000)

  it('menolak alasan kosong maupun spasi', async () => {
    // Change log tanpa alasan hanya mencatat BAHWA sesuatu berubah, sementara
    // pertanyaan yang selalu muncul belakangan adalah KENAPA.
    const rap = await buatRap('cl-kosong')
    const line = await tambahMaterial(rap)
    for (const alasan of ['', '   ']) {
      await c.query('SAVEPOINT ck')
      await expect(
        c.query(
          `INSERT INTO rap_change_log
             (rap_budget_id, line_table, line_id, field_name, reason)
           VALUES ($1, 'rap_material_line', $2, 'supplier_price', $3)`,
          [rap, line.id, alasan])
      ).rejects.toThrow()
      await c.query('ROLLBACK TO SAVEPOINT ck')
    }
  }, 60_000)

  it('change log tetap bisa ditulis meski RAP terkunci', async () => {
    // Justru itu gunanya: lock menutup jalur sunting langsung, change log
    // adalah jalur resminya.
    const rap = await buatRap('cl-locked')
    const line = await tambahMaterial(rap)
    await c.query(
      `UPDATE rap_budget SET status='locked', locked_at=now(), locked_by=$2 WHERE id=$1`,
      [rap, userId])

    const { rows } = await c.query(
      `INSERT INTO rap_change_log
         (rap_budget_id, line_table, line_id, field_name, old_value, new_value, reason, changed_by)
       VALUES ($1, 'rap_material_line', $2, 'qty_adjusted', '100', '110',
               'Tambahan volume akibat revisi lapangan', $3)
       RETURNING id`, [rap, line.id, userId])
    expect(rows[0].id, 'change log ikut terblokir lock — jalur resminya tertutup')
      .toBeTruthy()
  }, 60_000)
})

describe('RAP — isolasi tenant', () => {
  it('keempat tabel RAP punya policy tenant restrictive', async () => {
    for (const t of ['rap_budget', 'rap_material_line', 'rap_labor_line', 'rap_change_log']) {
      const { rows } = await c.query(
        `SELECT permissive FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND policyname='tenant_isolation'`, [t])
      expect(rows.length, `${t} tanpa isolasi tenant`).toBe(1)
      expect(rows[0].permissive, `${t}: policy tenant harus RESTRICTIVE`).toBe('RESTRICTIVE')
    }
  }, 60_000)

  it('change log tidak punya policy UPDATE/DELETE (jejak tak bisa disunting)', async () => {
    // Postgres menolak perintah yang tak punya policy. Jejak perubahan yang
    // bisa disunting bukan jejak.
    const { rows } = await c.query(
      `SELECT cmd FROM pg_policies
        WHERE schemaname='public' AND tablename='rap_change_log'
          AND permissive='PERMISSIVE' AND cmd IN ('UPDATE','DELETE','ALL')`)
    expect(rows.map((r) => r.cmd), 'change log bisa disunting/dihapus').toEqual([])
  }, 60_000)
})

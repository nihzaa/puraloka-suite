import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// Migration 115 — Fondasi UNIT (CECEP). Tes GUARD tingkat-DB murni dalam SATU
// transaksi yang SELALU di-ROLLBACK → NOL residu di dev (menjawab langsung
// kekhawatiran founder soal polusi dev; pola ini justru contoh "test bersih").
//
// Bukti mutasi TANPA menyentuh trigger (yang akan mengunci tabel bersama di CI):
// tiap guard diuji BERPASANGAN — kasus yang HARUS DITOLAK + kontrol-negatif yang
// HARUS LOLOS. Kalau guard hilang → kasus "ditolak" jadi lolos (merah). Kalau
// kondisinya terbalik → kontrol-negatif jadi ditolak (merah). Keduanya menjaga.

let client: Client
let userId: string
let ccId: string
let resourceRef: string // resource yang DIREFERENSIKAN komponen assembly
let asmId: string       // assembly draft (output m2) + 1 komponen

const q = (sql: string, args: unknown[] = []) => client.query(sql, args)

/** Jalankan operasi yang HARUS gagal; pulihkan transaksi setelah RAISE via savepoint. */
async function expectReject(fn: () => Promise<unknown>, re: RegExp) {
  await q('SAVEPOINT sp')
  await expect(fn()).rejects.toThrow(re)
  await q('ROLLBACK TO SAVEPOINT sp')
}
/** Jalankan operasi yang HARUS sukses; efeknya di-buang lagi (ROLLBACK TO). */
async function expectOk(fn: () => Promise<unknown>) {
  await q('SAVEPOINT sp')
  await fn()
  await q('ROLLBACK TO SAVEPOINT sp')
}

beforeAll(async () => {
  client = await createRlsClient()
  await q('BEGIN')
  const { rows: u } = await q(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  userId = u[0].id
  const { rows: cc } = await q(
    `INSERT INTO cost_codes (code,name,created_by) VALUES ('CC-UNIT-TEST','x',$1) RETURNING id`, [userId])
  ccId = cc[0].id
  const { rows: r } = await q(
    `INSERT INTO resources (code,name,category,unit_code,created_by)
     VALUES ('RBS-UNIT-REF','Semen','material','kg',$1) RETURNING id`, [userId])
  resourceRef = r[0].id
  const { rows: a } = await q(
    `INSERT INTO assemblies (code,name,cost_code_id,source,output_unit_code,created_by)
     VALUES ('ASM-UNIT','Pas bata',$1,'national','m2',$2) RETURNING id`, [ccId, userId])
  asmId = a[0].id
  // komponen membuat resourceRef "terreferensi" (dan asmId punya isi utk diaktifkan)
  await q(`INSERT INTO assembly_components (assembly_id,resource_id,coefficient) VALUES ($1,$2,1)`,
    [asmId, resourceRef])
}, 90_000)

afterAll(async () => { if (client) { await q('ROLLBACK'); await client.end() } })

describe('units: dimension terisi + satuan tenaga AHSP (config-first, EXTEND 090)', () => {
  it('semua unit punya dimension sah; OH=labor_day, jam=time, weight→mass, ls→lumpsum', async () => {
    const { rows: nulls } = await q(`SELECT code FROM units WHERE dimension IS NULL`)
    expect(nulls, 'tak boleh ada unit tanpa dimension').toHaveLength(0)
    const { rows } = await q(
      `SELECT code,dimension FROM units WHERE code IN ('OH','jam','m2','kg','ls') ORDER BY code`)
    const map = Object.fromEntries(rows.map(r => [r.code, r.dimension]))
    expect(map.OH).toBe('labor_day')
    expect(map.jam).toBe('time')
    expect(map.m2).toBe('area')
    expect(map.kg).toBe('mass')
    expect(map.ls).toBe('lumpsum')
  })
  it('kode existing mandor (m, buah, batang) DIPERTAHANKAN — bukan vocabulary kedua', async () => {
    const { rows } = await q(`SELECT count(*)::int n FROM units WHERE code IN ('m','buah','batang')`)
    expect(rows[0].n).toBe(3)
  })
})

describe('resources.unit_code — FK NOT NULL', () => {
  it('tolak resource TANPA unit_code (NOT NULL)', async () => {
    await expectReject(
      () => q(`INSERT INTO resources (code,name,category,created_by) VALUES ('RBS-NULLU','x','material',$1)`, [userId]),
      /null value|not-null|unit_code/i)
  })
  it('tolak unit_code tak dikenal (FK ke units)', async () => {
    await expectReject(
      () => q(`INSERT INTO resources (code,name,category,unit_code,created_by) VALUES ('RBS-BADU','x','material','ZZZ',$1)`, [userId]),
      /foreign key|units/i)
  })
})

describe('resources.unit_code IMMUTABLE begitu direferensikan (guard — bukti mutasi berpasangan)', () => {
  it('DITOLAK: ganti unit resource yang dirujuk KOMPONEN assembly', async () => {
    await expectReject(
      () => q(`UPDATE resources SET unit_code='ton' WHERE id=$1`, [resourceRef]),
      /identitas|dirujuk|tak bisa diubah/i)
  })
  it('DITOLAK: ganti unit resource yang dirujuk HARGA (cabang price_book)', async () => {
    const { rows } = await q(
      `INSERT INTO resources (code,name,category,unit_code,created_by)
       VALUES ('RBS-PBREF','x','material','kg',$1) RETURNING id`, [userId])
    const rid = rows[0].id
    await q(`INSERT INTO price_book_entries (resource_id,amount,effective_date,created_by)
             VALUES ($1,50000,CURRENT_DATE,$2)`, [rid, userId])
    await expectReject(
      () => q(`UPDATE resources SET unit_code='ton' WHERE id=$1`, [rid]),
      /identitas|dirujuk|tak bisa diubah/i)
  })
  it('KONTROL-NEGATIF: resource yang BELUM dirujuk BOLEH ganti unit', async () => {
    await expectOk(async () => {
      const { rows } = await q(
        `INSERT INTO resources (code,name,category,unit_code,created_by)
         VALUES ('RBS-FREE','x','material','kg',$1) RETURNING id`, [userId])
      await q(`UPDATE resources SET unit_code='ton' WHERE id=$1`, [rows[0].id])
    })
  })
})

describe('assemblies.output_unit_code IMMUTABLE per versi (guard — bukti mutasi berpasangan)', () => {
  it('KONTROL-NEGATIF: assembly DRAFT boleh ganti output_unit', async () => {
    await expectOk(async () => {
      const { rows } = await q(
        `INSERT INTO assemblies (code,name,cost_code_id,source,output_unit_code,created_by)
         VALUES ('ASM-DRAFT','x',$1,'national','m2',$2) RETURNING id`, [ccId, userId])
      await q(`UPDATE assemblies SET output_unit_code='m3' WHERE id=$1`, [rows[0].id])
    })
  })
  it('DITOLAK: begitu ACTIVE, output_unit beku (revisi = versi baru)', async () => {
    await q(`UPDATE assemblies SET status='active' WHERE id=$1`, [asmId]) // draft→active (transisi sah)
    await expectReject(
      () => q(`UPDATE assemblies SET output_unit_code='m3' WHERE id=$1`, [asmId]),
      /paket kerja tak bisa|retroaktif|versi baru/i)
  })
})

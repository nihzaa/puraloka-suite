import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { siapkanRantaiApproval } from '../../../utils/approval.js'

// ============================================================================
// F7-1 — "tenant baru sekali klik".
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TEST INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-07: company kedua di basis ini punya **0 dari 7** jenis
// rantai approval. Ia lahir tanpa satu pun, dan tak ada yang tahu sampai
// `submittal-aturan.test.ts` merah — itu pun hanya untuk SATU jenis dari
// tujuh, karena hanya `submittal` yang punya test.
//
// Enam sisanya akan gagal SENYAP: pengajuan masuk, lalu tak pernah bisa
// diputuskan siapa pun karena tak ada rantai yang menentukan siapa berwenang.
// Tak ada galat, tak ada log — hanya antrean yang tak pernah bergerak.
//
// Untuk produk yang dijual per-tenant, itu berarti pelanggan kedua mendapati
// alur persetujuannya mati sejak hari pertama.
//
// ── Yang diuji: helper-nya, bukan endpoint-nya
//
// `POST /api/v1/companies` butuh `requireGroupOwner` dan menciptakan company
// nyata yang TAK BISA DIHAPUS (penjaga repo melarangnya). Menguji lewat
// endpoint berarti meninggalkan sampah permanen tiap run.
//
// Helper-nya yang memikul seluruh logika, dan itu yang dijaga di sini.
// Bahwa endpoint MEMANGGILNYA dijaga terpisah oleh
// `audit-pendirian-tenant.mjs` (statis, tak butuh basis).
// ============================================================================

let client: Client
let idUji: string | null = null

beforeAll(async () => {
  client = await createRlsClient()
}, 120_000)

afterAll(async () => {
  if (idUji) {
    // Urutan penting: langkah dulu (FK), baru rantainya.
    await client.query(
      `DELETE FROM approval_steps WHERE chain_id IN
         (SELECT id FROM approval_chains WHERE company_id = $1)`, [idUji]).catch(() => {})
    await client.query(`DELETE FROM approval_chains WHERE company_id = $1`, [idUji]).catch(() => {})
    await client.query(`UPDATE companies SET is_active = false WHERE id = $1`, [idUji]).catch(() => {})
  }
  await client?.end()
})

describe('F7-1 · tenant baru lahir dengan alur persetujuan yang hidup', () => {
  it('menyalin SELURUH jenis rantai, lengkap dengan langkahnya', async () => {
    // Company uji: dibuat langsung (bukan lewat endpoint) supaya test ini tak
    // bergantung pada auth, dan dinonaktifkan di akhir — penjaga repo melarang
    // MENGHAPUS company.
    const kode = 'uji-f71-' + Math.random().toString(16).slice(2, 8)
    const { rows } = await client.query(
      `INSERT INTO companies (code, name, owner_user_id, created_by, is_active)
       SELECT $1, '[UJI] Tenant F7-1', owner_user_id, created_by, true
         FROM companies WHERE is_active ORDER BY created_at LIMIT 1
       RETURNING id`, [kode])
    idUji = rows[0].id

    // Acuan: berapa jenis rantai yang company lain punya.
    const { rows: acuan } = await client.query(
      `SELECT count(DISTINCT entity_type)::int n FROM approval_chains WHERE company_id <> $1`,
      [idUji])
    expect(acuan[0].n, 'basis tak punya rantai contoh — test tak bermakna').toBeGreaterThan(0)

    const hasil = await siapkanRantaiApproval(idUji!)
    expect(hasil.ok, hasil.error).toBe(true)
    expect(hasil.disalin).toBe(acuan[0].n)

    // Jumlah jenis harus SAMA, bukan sekadar "lebih dari nol".
    const { rows: punya } = await client.query(
      `SELECT count(DISTINCT entity_type)::int n FROM approval_chains WHERE company_id = $1`,
      [idUji])
    expect(punya[0].n).toBe(acuan[0].n)

    // Dan tiap rantai harus BERLANGKAH. Rantai kosong lebih buruk daripada
    // tak ada rantai: ia membuat pemeriksaan "punya rantai?" lolos sementara
    // pengajuannya tetap tak punya siapa pun yang berwenang memutuskan.
    const { rows: kosong } = await client.query(
      `SELECT ac.entity_type FROM approval_chains ac
        WHERE ac.company_id = $1
          AND NOT EXISTS (SELECT 1 FROM approval_steps st WHERE st.chain_id = ac.id)`,
      [idUji])
    expect(kosong.map((r) => r.entity_type), 'ada rantai TANPA langkah').toEqual([])
  }, 120_000)

  it('level dan permission tiap langkah ikut tersalin, bukan cuma jumlahnya', async () => {
    // Rantai `change_order` punya dua level di company acuan, dan level 2
    // memakai permission yang berbeda — ia ada supaya perubahan kontrak yang
    // menggerakkan uang tak bisa diputuskan sendirian. Menyalin jumlahnya
    // saja tanpa permission-nya akan menghasilkan rantai yang terlihat benar
    // dan menyetujui hal yang salah.
    const { rows } = await client.query(
      `SELECT st.level, st.required_permission
         FROM approval_chains ac JOIN approval_steps st ON st.chain_id = ac.id
        WHERE ac.company_id = $1 AND ac.entity_type = 'change_order'
        ORDER BY st.level`, [idUji])

    const { rows: asal } = await client.query(
      `SELECT st.level, st.required_permission
         FROM approval_chains ac JOIN approval_steps st ON st.chain_id = ac.id
        WHERE ac.company_id <> $1 AND ac.entity_type = 'change_order'
        ORDER BY ac.created_at, st.level`, [idUji])

    expect(rows.length).toBeGreaterThan(0)
    expect(rows).toEqual(asal.slice(0, rows.length))
  }, 60_000)

  it('idempoten — dijalankan dua kali tidak menggandakan', async () => {
    const sebelum = await client.query(
      `SELECT count(*)::int n FROM approval_chains WHERE company_id = $1`, [idUji])

    const ulang = await siapkanRantaiApproval(idUji!)
    expect(ulang.ok).toBe(true)

    const sesudah = await client.query(
      `SELECT count(*)::int n FROM approval_chains WHERE company_id = $1`, [idUji])
    expect(sesudah.rows[0].n).toBe(sebelum.rows[0].n)
  }, 60_000)
})

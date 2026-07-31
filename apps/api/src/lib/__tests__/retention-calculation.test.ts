import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, ensureTestSchema, closeTestClient } from '../../test-utils/test-db'
import {
  setupRetentionProbeTable,
  teardownRetentionProbeTable,
  insertRetentionProbe,
} from '../retention-calculation'

// Task 1.2.4 — integration test (BUKAN unit test), karena logic retensi ada
// di trigger database, bukan TypeScript. Test case wajib per
// Phase1/06-test-strategy.md § Unit Test poin 4: "berbagai retention_pct".

describe('retention calculation (trigger database, via probe table di schema test)', () => {
  let client: Client

  beforeAll(async () => {
    await ensureTestSchema()
    client = await createTestClient()
    await setupRetentionProbeTable(client)
  })

  afterAll(async () => {
    await teardownRetentionProbeTable(client)
    await closeTestClient(client)
  })

  it('retention_pct default (5%) — trigger menghitung otomatis saat insert', async () => {
    const row = await insertRetentionProbe(client, 1000000, 5)
    expect(Number(row.retention_amount)).toBe(50000)
  })

  it('retention_pct 10% — proporsional terhadap contract_value', async () => {
    const row = await insertRetentionProbe(client, 2000000, 10)
    expect(Number(row.retention_amount)).toBe(200000)
  })

  it('retention_pct 0% — retention_amount = 0, bukan error', async () => {
    const row = await insertRetentionProbe(client, 5000000, 0)
    expect(Number(row.retention_amount)).toBe(0)
  })

  it('retention_pct 100% — retention_amount = contract_value penuh', async () => {
    const row = await insertRetentionProbe(client, 750000, 100)
    expect(Number(row.retention_amount)).toBe(750000)
  })

  it('membulatkan ke 2 desimal (ROUND di trigger, bukan truncate)', async () => {
    const row = await insertRetentionProbe(client, 333333.33, 5)
    // 333333.33 * 5 / 100 = 16666.6665 -> ROUND ke 16666.67 (bukan 16666.66)
    expect(Number(row.retention_amount)).toBe(16666.67)
  })

  it('trigger re-fire saat UPDATE contract_value — retention_amount ikut ter-update', async () => {
    const row = await insertRetentionProbe(client, 1000000, 5)
    const { rows: updated } = await client.query(
      'UPDATE projects_retention_probe SET contract_value = $1 WHERE id = $2 RETURNING *',
      [2000000, row.id]
    )
    expect(Number(updated[0].retention_amount)).toBe(100000)
  })

  it('UPDATE contract_value ke nilai yang sama — trigger tetap fire (kolom termasuk watch list), hasil tidak berubah', async () => {
    const row = await insertRetentionProbe(client, 1000000, 5)
    const { rows: unchanged } = await client.query(
      'UPDATE projects_retention_probe SET contract_value = contract_value WHERE id = $1 RETURNING *',
      [row.id]
    )
    expect(Number(unchanged[0].retention_amount)).toBe(50000)
  })
})

describe('anti-drift: salinan trigger vs migrasi asli', () => {
  // Seluruh test di atas menguji SALINAN trigger (probe table di schema `test`),
  // bukan trigger produksi. Itu keputusan sadar — schema `public` berisi data
  // proyek asli dan tak boleh disentuh test.
  //
  // Tapi konsekuensinya: kalau formula di `010_triggers.sql` diubah dan
  // salinannya tidak, KETUJUH test di atas TETAP HIJAU sementara produksi
  // menghitung retensi dengan rumus yang berbeda. `retention-calculation.ts`
  // sendiri mengakui ini — "MUST direfleksikan di sini secara manual" — tapi
  // "manual" berarti bergantung pada seseorang ingat, dan retensi adalah uang
  // yang ditahan dari pembayaran ke klien.
  //
  // Test ini membandingkannya secara mekanis, jadi drift = CI merah, bukan
  // selisih rupiah yang baru ketahuan saat rekonsiliasi.

  /** Ambil badan fungsi PL/pgSQL, dinormalkan supaya beda spasi tak dianggap drift. */
  function badanFungsi(sql: string, namaFungsi: string): string | null {
    // ⚠️ Escape GANDA wajib di sini. Pola ini dibangun dari template string,
    // bukan regex literal — di dalam string, `\s` adalah escape JavaScript yang
    // menghasilkan huruf "s" biasa, sehingga polanya mencari teks harfiah
    // alih-alih spasi. Versi pertama test ini gagal karena itu, dan gejalanya
    // menyesatkan: ia melapor "fungsi tak ditemukan di 010_triggers.sql"
    // seolah berkasnya yang salah, padahal berkasnya benar.
    const re = new RegExp(
      `CREATE OR REPLACE FUNCTION ${namaFungsi}\\s*(?:\\([^)]*\\))?[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$`,
      'i',
    )
    const m = sql.match(re)
    return m ? m[1].replace(/\s+/g, ' ').trim() : null
  }

  it('formula di salinan IDENTIK dengan migrasi 010', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')

    const migrasi = readFileSync(
      join(import.meta.dirname, '..', '..', '..', '..', '..', 'db', 'migrations', '010_triggers.sql'),
      'utf8')
    const salinan = readFileSync(
      join(import.meta.dirname, '..', 'retention-calculation.ts'), 'utf8')

    const asli = badanFungsi(migrasi, 'trigger_calc_retention_amount')
    const copy = badanFungsi(salinan, 'trigger_calc_retention_amount_probe')

    expect(asli, 'fungsi tak ditemukan di 010_triggers.sql').not.toBeNull()
    expect(copy, 'fungsi probe tak ditemukan di retention-calculation.ts').not.toBeNull()
    expect(copy).toBe(asli)
  })

  it('kondisi trigger (BEFORE INSERT OR UPDATE OF ...) juga identik', async () => {
    // Formula benar tapi trigger tak menyala pada kolom yang sama = sama
    // rusaknya. Kalau `retention_pct` dihapus dari daftar UPDATE OF, mengubah
    // persentase retensi TIDAK akan menghitung ulang nominalnya.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const migrasi = readFileSync(
      join(import.meta.dirname, '..', '..', '..', '..', '..', 'db', 'migrations', '010_triggers.sql'),
      'utf8')
    const salinan = readFileSync(
      join(import.meta.dirname, '..', 'retention-calculation.ts'), 'utf8')

    const kondisi = (s: string, nama: string) => {
      // Escape ganda, alasan sama dengan badanFungsi() di atas.
      const m = s.match(new RegExp(`CREATE TRIGGER ${nama}\\s+([\\s\\S]*?)FOR EACH ROW`, 'i'))
      return m ? m[1].replace(/\s+/g, ' ').replace(/ON \S+/i, 'ON <tabel>').trim() : null
    }

    expect(kondisi(salinan, 'calc_retention_amount_probe'))
      .toBe(kondisi(migrasi, 'calc_retention_amount'))
  })
})

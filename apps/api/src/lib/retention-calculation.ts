import type { Client } from 'pg'

/**
 * Retention calculation TIDAK diekstrak sebagai pure function TypeScript —
 * logic-nya berada di trigger database (`trigger_calc_retention_amount`,
 * db/migrations/010_triggers.sql:67-77), bukan kode aplikasi. Tidak ada
 * satu pun kalkulasi retensi ulang di apps/api/src/ (dikonfirmasi grep),
 * konsisten Phase1/06-test-strategy.md § Unit Test poin 4: "meski ini
 * logic di level database trigger, bukan TypeScript, tetap perlu test
 * INTEGRATION (bukan unit)."
 *
 * File ini berisi helper setup/teardown tabel probe di schema `test`
 * (Task 1.1.2) — BUKAN tabel produksi, murni untuk memverifikasi trigger
 * yang sudah ada di schema `public` berperilaku benar, tanpa menyentuh
 * data proyek asli. Trigger di sini adalah SALINAN identik untuk keperluan
 * pembuktian, bukan definisi baru yang menggantikan yang di production.
 */

const PROBE_TABLE = 'projects_retention_probe'

/**
 * Trigger disalin PERSIS dari db/migrations/010_triggers.sql:67-73 —
 * formula: retention_amount = ROUND(contract_value * retention_pct / 100, 2).
 * Perubahan pada formula asli MUST direfleksikan di sini secara manual
 * (bukan otomatis) karena ini bukan migration yang di-reference, melainkan
 * salinan untuk keperluan test — didokumentasikan eksplisit di sini
 * supaya drift antara kode asli dan test ini mudah terdeteksi saat review.
 */
export async function setupRetentionProbeTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (
      id SERIAL PRIMARY KEY,
      contract_value NUMERIC(15,2) NOT NULL DEFAULT 0,
      retention_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
      retention_amount NUMERIC(15,2) NOT NULL DEFAULT 0
    )
  `)

  await client.query(`
    CREATE OR REPLACE FUNCTION trigger_calc_retention_amount_probe()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.retention_amount = ROUND((NEW.contract_value * NEW.retention_pct / 100), 2);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  await client.query(`DROP TRIGGER IF EXISTS calc_retention_amount_probe ON ${PROBE_TABLE}`)
  await client.query(`
    CREATE TRIGGER calc_retention_amount_probe
      BEFORE INSERT OR UPDATE OF contract_value, retention_pct ON ${PROBE_TABLE}
      FOR EACH ROW EXECUTE FUNCTION trigger_calc_retention_amount_probe();
  `)
}

export async function teardownRetentionProbeTable(client: Client): Promise<void> {
  await client.query(`DROP TABLE IF EXISTS ${PROBE_TABLE}`)
  await client.query(`DROP FUNCTION IF EXISTS trigger_calc_retention_amount_probe()`)
}

export interface RetentionProbeRow {
  id: number
  contract_value: string
  retention_pct: string
  retention_amount: string
}

export async function insertRetentionProbe(
  client: Client,
  contractValue: number,
  retentionPct: number
): Promise<RetentionProbeRow> {
  const { rows } = await client.query<RetentionProbeRow>(
    `INSERT INTO ${PROBE_TABLE} (contract_value, retention_pct) VALUES ($1, $2) RETURNING *`,
    [contractValue, retentionPct]
  )
  return rows[0]
}

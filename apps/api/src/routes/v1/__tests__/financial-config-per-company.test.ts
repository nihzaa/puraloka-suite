import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient } from '../../../test-utils/test-db'

// ============================================================
// financial_config — anti-overlap harus PER-COMPANY (migrasi 145).
//
// ── Cacat yang dijaga di sini
//
// `no_overlap_financial_config` (migrasi 086) mengunci `(key, daterange)` saja.
// Benar saat ditulis: sistem berisi satu perusahaan. Migrasi 127 lalu menambah
// `company_id NOT NULL` — tapi constraint-nya tak ikut diperbarui.
//
// Akibatnya badan usaha KEDUA tak bisa menetapkan tarif pajaknya sendiri:
// perusahaan pertama sudah memegang rentang tanggalnya, dan karena company_id
// tak ikut dibandingkan, keduanya dianggap bertabrakan. Dibuktikan di dev
// sebelum diperbaiki (transaksi di-rollback): 23P01 exclusion_violation.
//
// ── Kenapa ini diuji di DB, bukan lewat API
//
// Yang dijamin adalah HARD GUARD-nya, dan justru jalur non-API (skrip, seed,
// tooling, migrasi lain) yang perlu dipastikan tak bisa menembusnya. Menguji
// lewat HTTP hanya membuktikan endpoint-nya sopan, bukan datanya aman.
//
// ── Kenapa ini kelas cacat yang mahal
//
// Ia TAK BERGEJALA pada satu tenant — nol test merah, nol error di log, nol
// keluhan pengguna — lalu menggigit tepat saat tenant kedua lahir, yaitu ketika
// memperbaikinya paling mahal karena sudah ada data operasional. Persis yang
// dimaksud tripwire multi-company di docs/KEPUTUSAN-MULTI-COMPANY.md.
// ============================================================

const MIGRASI_145 = join(
  import.meta.dirname, '../../../../../../db/migrations/145_financial_config_per_company.sql')

let client: Client
let companyA: string
let companyB: string

/**
 * Prasyarat dibangun MANUAL & sempit, mengikuti pola `multitenant-core.test.ts`:
 * yang diuji adalah constraint 145, bukan seluruh sejarah skema. Menjalankan
 * rantai 086→126→127 di sini akan menyeret puluhan migrasi lain (RLS, RBAC,
 * helper auth) yang tak ada hubungannya dengan anti-overlap — lambat, dan
 * kegagalannya menunjuk ke tempat yang salah.
 *
 * Bentuk tabelnya disalin dari 086 + kolom company_id dari 127, termasuk
 * constraint LAMA-nya. Jadi test ini benar-benar menjalankan 145 sebagai
 * MIGRASI — bukan membuat constraint versi baru dari nol.
 */
async function bootstrapPrasyarat(cl: Client) {
  await cl.query(`
    CREATE TABLE companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT);
    CREATE TABLE financial_config (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key            TEXT NOT NULL,
      value          JSONB NOT NULL,
      value_type     TEXT NOT NULL CHECK (value_type IN ('number','string','boolean','json')),
      effective_from DATE NOT NULL,
      effective_to   DATE,
      note           TEXT,
      updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      company_id     UUID NOT NULL REFERENCES companies(id),
      CONSTRAINT chk_effective_order CHECK (effective_to IS NULL OR effective_to > effective_from),
      -- Constraint LAMA (086) — persis yang diperbaiki 145.
      CONSTRAINT no_overlap_financial_config EXCLUDE USING gist (
        key WITH =,
        daterange(effective_from, effective_to, '[)') WITH &&));
  `)
}

/** Sisipkan config; memulangkan error Postgres (atau null bila berhasil). */
async function coba(
  key: string, companyId: string, from: string, to: string | null, value = '0.11',
): Promise<{ code?: string; constraint?: string } | null> {
  try {
    await client.query(
      `INSERT INTO financial_config (key, value, value_type, effective_from, effective_to, company_id)
       VALUES ($1, $2::jsonb, 'number', $3, $4, $5)`,
      [key, value, from, to, companyId],
    )
    return null
  } catch (e) {
    const err = e as { code?: string; constraint?: string }
    return { code: err.code, constraint: err.constraint }
  }
}

beforeAll(async () => {
  // Urutannya penting: resetTestSchema() membuka koneksinya SENDIRI dan
  // men-DROP schema . Memanggilnya SESUDAH createTestClient() membuat
  // klien kita menunjuk schema yang sudah dihapus.
  await resetTestSchema()
  client = await createTestClient()
  await bootstrapPrasyarat(client)

  const a = await client.query(
    `INSERT INTO companies (code, name) VALUES ('uji-a', '[UJI] PT A') RETURNING id`)
  const b = await client.query(
    `INSERT INTO companies (code, name) VALUES ('uji-b', '[UJI] CV B') RETURNING id`)
  companyA = a.rows[0].id
  companyB = b.rows[0].id

  // BUKTI CACAT: dengan constraint LAMA, company B ditolak. Ini dijalankan
  // SEBELUM 145 supaya test ini membuktikan migrasinya benar-benar mengubah
  // sesuatu — bukan sekadar hijau di dunia yang sudah benar.
  await client.query(
    `INSERT INTO financial_config (key, value, value_type, effective_from, effective_to, company_id)
     VALUES ('bukti.rate','0.11','number','2020-01-01',NULL,$1)`, [companyA])
  const sebelum = await coba('bukti.rate', companyB, '2020-01-01', null, '0.12')
  if (sebelum?.code !== '23P01') {
    throw new Error(
      `Prasyarat test tak valid: constraint lama seharusnya MENOLAK company B ` +
      `(23P01), tapi hasilnya ${JSON.stringify(sebelum)}. ` +
      `Kalau ini terjadi, test di bawah tak lagi membuktikan apa pun.`)
  }
  await client.query(`DELETE FROM financial_config WHERE key = 'bukti.rate'`)

  // Baru jalankan migrasi yang diuji.
  await client.query(readFileSync(MIGRASI_145, 'utf-8'))
}, 120_000)

afterAll(async () => { await closeTestClient(client) })

describe('anti-overlap per-company', () => {
  it('dua PERUSAHAAN boleh punya tarif untuk rentang tanggal yang SAMA', async () => {
    // Inilah yang SEBELUM migrasi 145 gagal dengan 23P01 — dan yang membuat
    // badan usaha kedua mustahil dikonfigurasi.
    expect(await coba('tax.ppn_rate', companyA, '2020-01-01', null, '0.11')).toBeNull()
    expect(await coba('tax.ppn_rate', companyB, '2020-01-01', null, '0.12')).toBeNull()
  })

  it('SATU perusahaan TETAP tak boleh punya dua nilai bertumpang tindih', async () => {
    // Anti-overlap-nya sendiri wajib dipertahankan: dua tarif PPN berlaku pada
    // tanggal yang sama untuk satu perusahaan = angka yang tak bisa dihitung
    // (mana yang dipakai saat menerbitkan invoice?). Yang diperbaiki migrasi
    // 145 adalah LINGKUP-nya, bukan aturannya — kalau test ini ikut hijau saat
    // dilonggarkan, berarti perbaikannya kebablasan.
    const err = await coba('tax.ppn_rate', companyA, '2020-06-01', null, '0.99')
    expect(err?.code).toBe('23P01')
    expect(err?.constraint).toBe('no_overlap_financial_config')
  })

  it('rentang tak bertumpang tindih tetap boleh dalam satu perusahaan', async () => {
    // Half-open [) — 2019 berakhir TEPAT saat 2020 mulai, jadi tak bertabrakan.
    expect(await coba('tax.pph_final_rate', companyA, '2019-01-01', '2020-01-01')).toBeNull()
    expect(await coba('tax.pph_final_rate', companyA, '2020-01-01', null)).toBeNull()
  })

  it('constraint benar-benar menyertakan company_id', async () => {
    // Penjaga bentuk: kalau suatu saat ada yang membuat ulang constraint dari
    // definisi 086 yang lama (mis. saat menyalin migrasi), test perilaku di
    // atas akan gagal — tapi pesan errornya membingungkan. Ini menyebut
    // penyebabnya langsung.
    // `conrelid` disaring: nama constraint hanya unik per-TABEL. Schema
    // `public` punya financial_config-nya sendiri dengan constraint bernama
    // sama, jadi query tanpa saringan ini bisa membaca milik schema LAIN —
    // kesalahan yang benar-benar terjadi saat test ini pertama ditulis, dan
    // yang membuat verifikasi di migrasi 145 sempat melapor gagal padahal
    // DDL-nya sudah benar.
    const { rows } = await client.query(
      `SELECT pg_get_constraintdef(oid) d FROM pg_constraint
        WHERE conname = 'no_overlap_financial_config'
          AND conrelid = to_regclass('financial_config')`)
    expect(rows[0]?.d).toContain('company_id')
  })
})

describe('setFinancialConfig() menyaring company saat MENULIS', () => {
  // Test di atas menjaga constraint DB. Yang TIDAK bisa dijaganya: kode
  // aplikasi yang lupa menyaring company saat menutup rentang lama.
  //
  // Kegagalannya senyap dan merusak: `UPDATE ... SET effective_to = X WHERE
  // key = 'tax.ppn_rate' AND effective_to IS NULL` tanpa filter company akan
  // menutup tarif berlaku milik SEMUA perusahaan. Perusahaan lain tak error —
  // ia hanya kehilangan tarifnya dan diam-diam jatuh ke fallback statis, yang
  // berarti invoice-nya terbit dengan pajak yang salah.
  //
  // Constraint anti-overlap tak menangkap ini sama sekali: menutup rentang
  // adalah UPDATE yang sah menurut aturan DB. Karena itu diuji terpisah, di
  // level SQL yang sama dengan yang dijalankan kode.

  it('penutupan rentang HANYA menyentuh company yang dimaksud', async () => {
    await client.query(`DELETE FROM financial_config WHERE key = 'tutup.rate'`)
    // Dua perusahaan sama-sama punya tarif berlaku (open-ended).
    await coba('tutup.rate', companyA, '2020-01-01', null, '0.11')
    await coba('tutup.rate', companyB, '2020-01-01', null, '0.12')

    // SQL yang identik dengan `setFinancialConfig` sesudah perbaikan.
    await client.query(
      `UPDATE financial_config SET effective_to = $1
        WHERE company_id = $2 AND key = 'tutup.rate'
          AND effective_to IS NULL AND effective_from < $1`,
      ['2021-01-01', companyA])

    const { rows } = await client.query(
      `SELECT company_id, effective_to FROM financial_config WHERE key = 'tutup.rate'`)
    const a = rows.find((r) => r.company_id === companyA)
    const b = rows.find((r) => r.company_id === companyB)

    expect(a.effective_to).not.toBeNull()      // A ditutup — memang diminta
    expect(b.effective_to).toBeNull()          // B UTUH — inilah intinya
  })

  it('kode sumber setFinancialConfig menyaring company_id di KEDUA statement', async () => {
    // Penjaga sumber, bukan pengganti uji perilaku di atas. Alasannya: yang
    // dijalankan produksi adalah supabase-js (bukan SQL mentah), dan ia tak
    // bisa dijalankan terhadap schema `test`. Jadi perilakunya dibuktikan
    // lewat SQL setara, sementara BENTUK kodenya dikunci di sini — supaya
    // menghapus filternya tak bisa lolos diam-diam.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const isi = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'utils', 'financial-config.ts'), 'utf8')
    const badan = isi.slice(isi.indexOf('export async function setFinancialConfig'))

    expect(badan).toMatch(/\.eq\('company_id',\s*companyId\)/)  // UPDATE ter-scope
    expect(badan).toMatch(/company_id:\s*companyId/)            // INSERT membawa tenant
    expect(badan).toMatch(/companyId: string/)                  // WAJIB, bukan opsional
  })
})


describe('feature_flags juga unik per-company (migrasi 146)', () => {
  // Pola cacat yang SAMA dengan financial_config, ditemukan beberapa jam
  // sesudahnya di tabel berbeda: `UNIQUE (key)` global padahal tabelnya
  // kategori AB (bersama + override per-perusahaan).
  //
  // Dua kali kejadian yang sama bukan kebetulan — keduanya tabel yang lahir
  // PRA-multi-tenant lalu diberi `company_id` di migrasi 127, tanpa
  // constraint-nya ikut ditinjau. Karena itu yang diuji di sini bukan cuma
  // hasilnya, tapi juga BENTUK indexnya (`NULLS NOT DISTINCT`), yang mudah
  // hilang saat seseorang membuat ulang index dari ingatan.

  it('migrasi 146 memakai (company_id, key) + NULLS NOT DISTINCT', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sql = readFileSync(
      join(import.meta.dirname, '../../../../../../db/migrations/146_feature_flags_per_company.sql'),
      'utf8')

    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS feature_flags_key_key/)
    expect(sql).toMatch(/\(company_id,\s*key\)/)
    // NULLS NOT DISTINCT wajib: tanpa itu baris BERSAMA (company_id NULL) bisa
    // dobel, dan pembacaan flag jadi bergantung urutan baris.
    //
    // ⚠️ Dicocokkan pada DEFINISI INDEX-nya, bukan di mana pun dalam berkas.
    // Versi pertama assertion ini hanya `/NULLS NOT DISTINCT/`, dan uji mutasi
    // membuktikannya tak berguna: menghapus frasa itu dari CREATE INDEX tetap
    // hijau, karena frasa yang sama masih tertulis di komentar penjelas di
    // atasnya. Penjaga yang bisa dipuaskan komentar tidak menjaga apa pun.
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}?\(company_id,\s*key\)\s*NULLS NOT DISTINCT/)
  })

  it('endpoint feature-flags menyaring & menulis per-company', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const isi = readFileSync(join(import.meta.dirname, '..', 'modules.ts'), 'utf8')

    // GET: baris bersama + milik sendiri saja.
    expect(isi).toMatch(/company_id\.is\.null,company_id\.eq\.\$\{request\.companyId\}/)
    // PUT: upsert membawa company_id DAN onConflict per-company. Kalau
    // `onConflict` tertinggal di 'key' saja, upsert menimpa baris tenant lain.
    expect(isi).toMatch(/company_id: request\.companyId/)
    expect(isi).toMatch(/onConflict: 'company_id,key'/)
  })
})

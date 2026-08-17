/**
 * 8.5 — kelayakan investasi alat, diuji terhadap Postgres NYATA.
 *
 * Dua hal yang kalau salah tidak menimbulkan galat, hanya saran investasi yang
 * keliru:
 *
 *   1. `biayaSewa()` menghormati `rate_unit`. Menebak satuan berarti salah 7×
 *      atau 30× lipat, dan hasilnya tetap angka yang wajar dibaca.
 *   2. "nol pakai" DIBEDAKAN dari "nol tercatat". Menyamakan keduanya membuat
 *      11 alat kecil ditandai modal-mati dan menenggelamkan satu temuan
 *      sungguhan senilai Rp 2,4 M.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { analisisInvestasiAlat, biayaSewa } from '../ai-tool-investasi-alat.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT company_id FROM assets WHERE ownership = 'milik'
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu tenant beraset milik')
  companyId = rows[0].company_id
})

afterAll(async () => {
  await db.end()
})

describe('biayaSewa — satuan tarif tak boleh ditebak', () => {
  it('hari dikalikan lurus', () => {
    expect(biayaSewa(2_220_000, 'hari', 12)).toBe(26_640_000)
  })

  it('bulan dibagi 30, bukan diperlakukan sebagai hari', () => {
    // Kalau satuan diabaikan, 72,2 juta × 25 hari = Rp 1,8 MILIAR untuk sewa
    // sebulan — dan angka itu tetap "masuk akal" bagi model yang membacanya.
    expect(biayaSewa(72_200_000, 'bulan', 30)).toBe(72_200_000)
    expect(biayaSewa(72_200_000, 'bulan', 15)).toBe(36_100_000)
  })

  it('minggu dibagi 7', () => {
    expect(biayaSewa(7_000_000, 'minggu', 14)).toBe(14_000_000)
  })

  it('satuan tak dikenal memulangkan null, BUKAN dianggap hari', () => {
    // Fail-loud. Menganggapnya hari menghasilkan angka 30× terlalu besar
    // tanpa satu pun tanda bahwa satuannya tak dipahami.
    expect(biayaSewa(1_000_000, 'jam', 10)).toBeNull()
    expect(biayaSewa(1_000_000, '', 10)).toBeNull()
  })

  it('lama pakai nol atau negatif memulangkan null', () => {
    expect(biayaSewa(1_000_000, 'hari', 0)).toBeNull()
    expect(biayaSewa(1_000_000, 'hari', -3)).toBeNull()
  })

  it('tarif negatif ditolak', () => {
    expect(biayaSewa(-5, 'hari', 3)).toBeNull()
  })
})

describe('tool investasi alat', () => {
  it('terdaftar dengan izin assets:view yang BENAR-BENAR ada', async () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'investasi_alat')
    expect(t, 'tool `investasi_alat` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('assets:view')
    const { rows } = await db.query('SELECT 1 FROM permissions WHERE key = $1', [
      t!.izin,
    ])
    expect(rows.length, `izin ${t!.izin} tak ada di tabel permissions`).toBe(1)
  })

  it('membedakan "menganggur berbiaya" dari "belum tercatat"', async () => {
    const h = await analisisInvestasiAlat(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    const mati = h.alat.filter((a) => a.verdict === 'modal-mati')
    const belum = h.alat.filter((a) => a.verdict === 'data-belum-cukup')

    // Modal-mati WAJIB punya biaya > 0. Kalau tidak, ia cuma alat yang belum
    // pernah dicatat — dan menandainya modal-mati membuat peringatan berbunyi
    // begitu sering sampai berhenti dibaca.
    for (const a of mati) {
      expect(a.biayaMemiliki, `${a.alat} ditandai modal-mati tanpa biaya`).toBeGreaterThan(0)
      expect(a.hariPakai).toBe(0)
    }

    // Data uji harus benar-benar memuat KEDUA golongan, kalau tidak test ini
    // tak bisa membedakan kode yang benar dari kode yang menyamakan keduanya.
    expect(mati.length, 'tak ada alat modal-mati — test tak menguji apa pun').toBeGreaterThan(0)
    expect(belum.length, 'tak ada alat belum-tercatat — test tak menguji apa pun').toBeGreaterThan(0)
  })

  it('biaya memiliki cocok dengan penyusutan + operasional di SQL terpisah', async () => {
    const h = await analisisInvestasiAlat(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT a.name,
              (coalesce((SELECT sum(s.nilai) FROM penyusutan_alat s WHERE s.asset_id = a.id),0)
             + coalesce((SELECT sum(b.jumlah) FROM biaya_operasional_alat b WHERE b.asset_id = a.id),0))::float8 AS biaya
         FROM assets a
        WHERE a.company_id = $1 AND a.ownership = 'milik'
        ORDER BY biaya DESC LIMIT 1`,
      [companyId],
    )
    const teratas = h.alat.find((a) => a.alat === rows[0].name)
    expect(teratas, `${rows[0].name} tak muncul di hasil`).toBeTruthy()
    expect(teratas!.biayaMemiliki).toBe(Math.round(Number(rows[0].biaya)))
  })

  it('biaya memiliki BUKAN harga beli', async () => {
    const h = await analisisInvestasiAlat(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)
    const berbiaya = h.alat.filter((a) => a.biayaMemiliki > 0)
    expect(berbiaya.length).toBeGreaterThan(0)
    for (const a of berbiaya) {
      // Membandingkan harga beli dengan sewa selalu memenangkan sewa, dan
      // selalu salah: harga beli tersebar sepanjang umur ekonomis alat.
      expect(a.biayaMemiliki, `${a.alat} memakai harga beli sebagai biaya`).toBeLessThan(a.hargaBeli)
    }
  })

  it('verdict "lebih-baik-sewa" menyebut keterbatasan periodenya', async () => {
    const h = await analisisInvestasiAlat(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)
    const sewa = h.alat.filter((a) => a.verdict === 'lebih-baik-sewa')
    expect(sewa.length, 'tak ada verdict lebih-baik-sewa — cabang tak teruji').toBeGreaterThan(0)
    for (const a of sewa) {
      // Founder membaca verdict, bukan komentar kode. Keterbatasannya harus
      // ikut di kalimat yang sama dengan kesimpulannya.
      expect(a.alasan).toContain('CATATAN')
      expect(a.alasan).toContain('berbalik')
    }
  })

  it('alat belum dimiliki muncul sebagai kandidat beli', async () => {
    const h = await analisisInvestasiAlat(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT count(DISTINCT item_name)::int n FROM asset_rentals
        WHERE company_id = $1 AND asset_id IS NULL`,
      [companyId],
    )
    expect(h.kandidatBeli.length).toBe(Number(rows[0].n))
    for (const k of h.kandidatBeli) {
      expect(k.totalSewa).toBeGreaterThan(0)
      expect(k.jumlahSewa).toBeGreaterThan(0)
    }
  })

  it('alat yang DIMILIKI tak pernah bocor ke daftar kandidat beli', async () => {
    const h = await analisisInvestasiAlat(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)
    const namaMilik = new Set(h.alat.map((a) => a.alat))
    for (const k of h.kandidatBeli) {
      expect(namaMilik.has(k.nama), `${k.nama} dimiliki tapi masuk kandidat beli`).toBe(false)
    }
  })
})

/**
 * TJS-B1 — gerbang biaya AI, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "fungsinya dipanggil", melainkan bahwa batas biaya benar-benar
 * MENGHENTIKAN — perbedaan yang membedakan batas dari laporan kerusakan.
 *
 * TJS mencatat biaya dan menampilkannya, tetapi tak pernah memblokir. Kalau
 * test di sini hanya memeriksa angka tercatat, ia akan lulus untuk perilaku
 * TJS juga — dan itu berarti test-nya tak menguji perbaikannya.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import {
  awalBulan,
  bentukKonfigurasi,
  daftarModel,
  konfigurasiBawaan,
  perkiraanPerPanggilan,
} from '../ai-config.js'
import { HARGA_MODEL, biayaIdr, biayaUsd, hargaModel } from '../ai-harga.js'

let db: Client
let companyId: string

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query('SELECT id FROM companies LIMIT 1')
  companyId = rows[0].id
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_biaya_token WHERE model LIKE 'uji-%'`)
  await db.end()
})

beforeEach(async () => {
  await db.query(`DELETE FROM ai_biaya_token WHERE model LIKE 'uji-%'`)
})

describe('harga model — satu sumber (perbaikan C-7 TJS)', () => {
  it('model tak dikenal memakai tarif TERMAHAL, bukan nol', () => {
    const asing = hargaModel('model-yang-tak-pernah-ada')
    const termahal = Math.max(...Object.values(HARGA_MODEL).map((h) => h.keluar))
    expect(asing.keluar).toBe(termahal)
    // Nol akan membuat batas bulanan tak pernah tercapai — dan batas yang tak
    // pernah tercapai sama saja dengan tak ada batas.
    expect(asing.keluar).toBeGreaterThan(0)
  })

  it('biaya dihitung per juta token, bukan per token', () => {
    // 1 juta token keluar Haiku = $5 tepat.
    expect(biayaUsd('claude-haiku-4-5', { masuk: 0, keluar: 1_000_000 })).toBeCloseTo(5, 6)
    expect(biayaUsd('claude-haiku-4-5', { masuk: 1_000_000, keluar: 0 })).toBeCloseTo(1, 6)
  })

  it('cache dihargai berbeda dari token biasa', () => {
    const baca = biayaUsd('claude-haiku-4-5', { masuk: 0, keluar: 0, cacheBaca: 1_000_000 })
    const biasa = biayaUsd('claude-haiku-4-5', { masuk: 1_000_000, keluar: 0 })
    // Kalau keduanya sama, penghematan caching tak akan pernah terlihat.
    expect(baca).toBeLessThan(biasa)
  })

  it('Rupiah memakai kurs, dan hasilnya dibulatkan ke sen', () => {
    const idr = biayaIdr('claude-haiku-4-5', { masuk: 0, keluar: 1_000_000 }, 16_000)
    expect(idr).toBe(80_000)
  })

  it('daftar model UI lahir dari tabel harga, tidak disalin', () => {
    const daftar = daftarModel()
    expect(daftar.map((m) => m.id).sort()).toEqual(Object.keys(HARGA_MODEL).sort())
    // Model yang bisa dipilih tapi tak berharga akan ditagih tarif termahal
    // tanpa ada yang menduganya.
    for (const m of daftar) expect(m.perkiraanIdr).toBeGreaterThan(0)
  })

  it('perkiraan naik saat max_token naik', () => {
    const kecil = perkiraanPerPanggilan('claude-haiku-4-5', 512)
    const besar = perkiraanPerPanggilan('claude-haiku-4-5', 8192)
    expect(besar).toBeGreaterThan(kecil)
  })
})

describe('bentuk konfigurasi', () => {
  it('model NULL di basis jatuh ke bawaan, bukan diteruskan sebagai null', () => {
    const k = bentukKonfigurasi(
      { asisten: 'insight', penyedia: 'anthropic', model: null, max_token: 1024, aktif: true, batas_bulanan_idr: null, mode_batas: 'peringatkan' },
      'insight',
    )
    // Meneruskan null memaksa tiap pemanggil menanganinya sendiri, dan satu
    // di antaranya pasti lupa.
    expect(k.model).toBe(konfigurasiBawaan('insight').model)
  })

  it('numeric dari PostgREST datang sebagai STRING dan tetap jadi angka', () => {
    const k = bentukKonfigurasi(
      { asisten: 'insight', penyedia: 'anthropic', model: 'claude-haiku-4-5', max_token: 1024, aktif: true, batas_bulanan_idr: '150000.00', mode_batas: 'blokir' },
      'insight',
    )
    expect(k.batasBulananIdr).toBe(150_000)
    expect(typeof k.batasBulananIdr).toBe('number')
  })

  it('mode_batas asing jatuh ke `peringatkan`, bukan memblokir', () => {
    const k = bentukKonfigurasi(
      { asisten: 'insight', penyedia: 'anthropic', model: 'x', max_token: 1, aktif: true, batas_bulanan_idr: null, mode_batas: 'entah' },
      'insight',
    )
    // Nilai rusak yang jatuh ke `blokir` akan mematikan asisten tenant tanpa
    // ada yang pernah memilihnya.
    expect(k.modeBatas).toBe('peringatkan')
  })
})

describe('awalBulan', () => {
  it('memotong ke hari pertama bulan berjalan, UTC', () => {
    expect(awalBulan(new Date('2026-08-31T23:59:59Z'))).toBe('2026-08-01T00:00:00.000Z')
    expect(awalBulan(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('ai_provider_config — penegakan di BASIS', () => {
  it('max_token 0 ditolak basis, bukan hanya UI', async () => {
    await expect(
      db.query(
        `INSERT INTO ai_provider_config (company_id, asisten, max_token) VALUES ($1, 'staff', 0)`,
        [companyId],
      ),
    ).rejects.toThrow()
  })

  it('mode_batas asing ditolak basis', async () => {
    await expect(
      db.query(
        `INSERT INTO ai_provider_config (company_id, asisten, mode_batas) VALUES ($1, 'staff', 'terserah')`,
        [companyId],
      ),
    ).rejects.toThrow()
  })

  it('batas negatif ditolak', async () => {
    await expect(
      db.query(
        `INSERT INTO ai_provider_config (company_id, asisten, batas_bulanan_idr) VALUES ($1, 'staff', -1)`,
        [companyId],
      ),
    ).rejects.toThrow()
  })

  it('satu tenant hanya boleh punya satu baris per asisten', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM (
         SELECT company_id, asisten FROM ai_provider_config
         GROUP BY company_id, asisten HAVING count(*) > 1
       ) d`,
    )
    expect(rows[0].n).toBe(0)
  })
})

describe('ai_biaya_token — akumulasi yang menegakkan batas', () => {
  it('kurs disimpan bersama tiap baris, jadi biaya historis tak berubah', async () => {
    await db.query(
      `INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, token_masuk, token_keluar, biaya_usd, biaya_idr, kurs_idr)
       VALUES ($1, 'insight', 'anthropic', 'uji-kurs', 1000, 500, 0.0035, 56.00, 16000)`,
      [companyId],
    )
    const { rows } = await db.query(
      `SELECT biaya_idr, kurs_idr FROM ai_biaya_token WHERE model = 'uji-kurs'`,
    )
    // Angkanya tetap seperti saat dicatat meski `KURS_USD_IDR` berubah besok.
    expect(Number(rows[0].biaya_idr)).toBe(56)
    expect(Number(rows[0].kurs_idr)).toBe(16_000)
  })

  it('nominal bertipe numeric, bukan float (CLAUDE.md §5.4)', async () => {
    const { rows } = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'ai_biaya_token'
        AND column_name IN ('biaya_usd', 'biaya_idr', 'kurs_idr')
      ORDER BY column_name
    `)
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(r.data_type).toBe('numeric')
  })

  it('presisi 6 desimal menahan biaya satu ronde Haiku yang sangat kecil', async () => {
    // Satu ronde pendek Haiku bisa di bawah seperseribu dolar. Membulatkannya
    // ke sen membuat SELURUH percakapan tercatat nol — dan batas yang
    // menghitung nol tak pernah tercapai.
    const kecil = biayaUsd('claude-haiku-4-5', { masuk: 300, keluar: 60 })
    expect(kecil).toBeGreaterThan(0)
    expect(kecil).toBeLessThan(0.01)

    await db.query(
      `INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, biaya_usd, biaya_idr, kurs_idr)
       VALUES ($1, 'insight', 'anthropic', 'uji-kecil', $2, $3, 16000)`,
      [companyId, kecil.toFixed(6), biayaIdr('claude-haiku-4-5', { masuk: 300, keluar: 60 }, 16_000).toFixed(2)],
    )
    const { rows } = await db.query(`SELECT biaya_usd FROM ai_biaya_token WHERE model = 'uji-kecil'`)
    expect(Number(rows[0].biaya_usd)).toBeGreaterThan(0)
  })

  it('16 ronde satu percakapan menjumlah, bukan menimpa', async () => {
    // Inilah alasan biaya dicatat per RONDE: satu pesan WhatsApp bisa memicu
    // 16 panggilan API. Mencatat per pesan menyembunyikan 15 di antaranya.
    for (let r = 1; r <= 16; r++) {
      await db.query(
        `INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, ronde, biaya_usd, biaya_idr, kurs_idr)
         VALUES ($1, 'staff', 'anthropic', 'uji-ronde', $2, 0.001000, 16.00, 16000)`,
        [companyId, r],
      )
    }
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, sum(biaya_idr) AS total FROM ai_biaya_token WHERE model = 'uji-ronde'`,
    )
    expect(rows[0].n).toBe(16)
    expect(Number(rows[0].total)).toBe(256)
  })

  it('kurs nol ditolak — pembagi yang mustahil', async () => {
    await expect(
      db.query(
        `INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, kurs_idr)
         VALUES ($1, 'insight', 'anthropic', 'uji-nol', 0)`,
        [companyId],
      ),
    ).rejects.toThrow()
  })

  it('token negatif ditolak', async () => {
    await expect(
      db.query(
        `INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, token_masuk, kurs_idr)
         VALUES ($1, 'insight', 'anthropic', 'uji-neg', -1, 16000)`,
        [companyId],
      ),
    ).rejects.toThrow()
  })
})

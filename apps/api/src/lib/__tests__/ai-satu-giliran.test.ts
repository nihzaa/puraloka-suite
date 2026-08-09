/**
 * TJS-C1 — SATU GILIRAN PER USER (C-4).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KUNCINYA DI BASIS, BUKAN DI MEMORI PROSES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kriteria: *"dua pesan bersamaan tak saling menimpa"*.
 *
 * Godaan pertamanya menyimpan `Set<userId>` di memori — murah, dan bekerja
 * sempurna di satu instance. Begitu API berjalan di dua instance (yang memang
 * tujuan SaaS ini), dua memori itu tak saling tahu, dan dua pesan bersamaan
 * lolos keduanya.
 *
 * Karena itu kuncinya `ai_percakapan.giliran_terkunci_pada`, diambil lewat
 * UPDATE BERSYARAT — bukan "baca lalu tulis". Dua permintaan yang sama-sama
 * membaca "tidak terkunci" akan sama-sama mengunci; satu pernyataan UPDATE
 * dengan syarat di dalamnya tidak punya celah itu.
 *
 * ── Yang diuji di sini adalah PERLOMBAANNYA, bukan fungsinya
 *
 * Dua UPDATE dijalankan BERSAMAAN lewat `Promise.all` pada dua koneksi
 * berbeda. Menjalankannya berurutan akan hijau bahkan pada implementasi
 * baca-lalu-tulis yang rusak — dan test yang hijau pada kode rusak lebih buruk
 * daripada tak ada test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'

const GILIRAN_KEDALUWARSA_MS = 2 * 60_000

let db: Client
let db2: Client
let companyId: string
let userId: string
let percakapanId: string

beforeAll(async () => {
  // DUA koneksi: perlombaan di satu koneksi diserialkan Postgres, jadi
  // testnya tak akan pernah melihat tabrakan yang hendak dibuktikan.
  db = await createRlsClient()
  db2 = await createRlsClient()

  const { rows: c } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = c[0].id

  const { rows: u } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
  userId = u[0].user_id

  const { rows: p } = await db.query(
    `INSERT INTO ai_percakapan (company_id, user_id, asisten, kanal)
     VALUES ($1, $2, 'staff', 'web') RETURNING id`,
    [companyId, userId],
  )
  percakapanId = p[0].id
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_pesan WHERE percakapan_id = $1`, [percakapanId])
  await db.query(`DELETE FROM ai_percakapan WHERE id = $1`, [percakapanId])
  await db.end()
  await db2.end()
})

/** UPDATE bersyarat — SAMA PERSIS dengan yang dipakai rute chat. */
async function ambilGiliran(klien: Client): Promise<boolean> {
  const batas = new Date(Date.now() - GILIRAN_KEDALUWARSA_MS).toISOString()
  const { rows } = await klien.query(
    `UPDATE ai_percakapan
        SET giliran_terkunci_pada = now()
      WHERE id = $1
        AND (giliran_terkunci_pada IS NULL OR giliran_terkunci_pada < $2)
      RETURNING id`,
    [percakapanId, batas],
  )
  return rows.length > 0
}

describe('kunci giliran', () => {
  it('percakapan baru TIDAK terkunci', async () => {
    await db.query(
      `UPDATE ai_percakapan SET giliran_terkunci_pada = NULL WHERE id = $1`, [percakapanId])
    expect(await ambilGiliran(db)).toBe(true)
  })

  it('giliran kedua DITOLAK selama yang pertama belum lepas', async () => {
    await db.query(
      `UPDATE ai_percakapan SET giliran_terkunci_pada = now() WHERE id = $1`, [percakapanId])
    expect(await ambilGiliran(db)).toBe(false)
  })

  it('sesudah dilepas, giliran bisa diambil lagi', async () => {
    await db.query(
      `UPDATE ai_percakapan SET giliran_terkunci_pada = NULL WHERE id = $1`, [percakapanId])
    expect(await ambilGiliran(db)).toBe(true)
  })
})

describe('PERLOMBAAN NYATA — dua permintaan bersamaan', () => {
  it('hanya SATU yang menang, dari dua koneksi berbeda', async () => {
    await db.query(
      `UPDATE ai_percakapan SET giliran_terkunci_pada = NULL WHERE id = $1`, [percakapanId])

    // `Promise.all`, bukan berurutan. Implementasi baca-lalu-tulis akan hijau
    // pada versi berurutan dan MERAH di sini — itulah gunanya.
    const [a, b] = await Promise.all([ambilGiliran(db), ambilGiliran(db2)])

    // Kalau keduanya true, dua jawaban akan ditulis ke percakapan yang sama
    // dan saling menimpa urutannya.
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('LIMA permintaan bersamaan tetap hanya satu yang menang', async () => {
    await db.query(
      `UPDATE ai_percakapan SET giliran_terkunci_pada = NULL WHERE id = $1`, [percakapanId])

    // Dua koneksi bergantian, lima percobaan. Menambah jumlahnya menaikkan
    // peluang menangkap celah yang lolos pada dua percobaan.
    const hasil = await Promise.all([
      ambilGiliran(db), ambilGiliran(db2), ambilGiliran(db),
      ambilGiliran(db2), ambilGiliran(db),
    ])
    expect(hasil.filter(Boolean)).toHaveLength(1)
  })
})

describe('kedaluwarsa — proses yang mati tak mengunci selamanya', () => {
  it('kunci yang LEWAT batas bisa diambil alih', async () => {
    // Tanpa ini, satu proses yang mati di tengah membuat percakapan itu
    // tak bisa dipakai lagi SELAMANYA, dan penggunanya melihat 409 tanpa
    // sebab yang terlihat.
    await db.query(
      `UPDATE ai_percakapan SET giliran_terkunci_pada = now() - interval '5 minutes'
        WHERE id = $1`,
      [percakapanId],
    )
    expect(await ambilGiliran(db)).toBe(true)
  })

  it('kunci yang BARU SAJA diambil belum kedaluwarsa', async () => {
    await db.query(
      `UPDATE ai_percakapan SET giliran_terkunci_pada = now() - interval '30 seconds'
        WHERE id = $1`,
      [percakapanId],
    )
    // 30 detik < 2 menit: masih terkunci. Kalau ini true, batas kedaluwarsanya
    // terlalu pendek dan dua pesan berturut-turut bisa tabrakan.
    expect(await ambilGiliran(db)).toBe(false)
  })
})

describe('kolomnya ADA dan bertipe waktu yang benar', () => {
  it('giliran_terkunci_pada bertipe timestamptz', async () => {
    const { rows } = await db.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'ai_percakapan' AND column_name = 'giliran_terkunci_pada'
    `)
    // `timestamp without time zone` akan membuat perbandingan kedaluwarsa
    // salah sejauh selisih zona waktu server — dan salahnya hanya muncul di
    // produksi yang zonanya berbeda dari mesin pengembang (CLAUDE.md §5.4).
    expect(rows[0]?.data_type).toBe('timestamp with time zone')
  })
})

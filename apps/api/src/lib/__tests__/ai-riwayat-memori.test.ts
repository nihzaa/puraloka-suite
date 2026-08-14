/**
 * ASISTEN INGAT PESAN SEBELUMNYA — di percakapan yang sama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUTUH TEST SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-14: `OpsiJalan.riwayat` ADA dan sudah tersambung ke pesan
 * yang dikirim ke model — dan **tak satu pun pemanggil mengisinya**. Asisten
 * lupa kalimat barusan, di jendela chat yang riwayatnya terpampang di layar.
 *
 * Kolom yang ditulis tapi tak pernah dibaca adalah bentuk cacat yang paling
 * sunyi: penyimpanannya bekerja, tabelnya terisi, halaman riwayat menampilkan
 * isinya — dan modelnya tak pernah melihat satu pun.
 *
 * Yang dibuktikan di sini:
 *
 *   1. riwayat benar-benar terbaca dari `ai_pesan`
 *   2. urutannya LAMA→BARU (bukan terbalik)
 *   3. yang diambil EKOR, bukan kepala — pesan terakhir yang menentukan arti
 *   4. batasnya benar-benar menahan (biaya: tiap pesan dikirim ulang TIAP ronde)
 *   5. percakapan WhatsApp dipakai ulang selama hangat, bukan dibuat tiap pesan
 *   6. galat baca TIDAK melempar — asisten lupa lebih baik daripada asisten mati
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { MAKS_PESAN_RIWAYAT, bacaRiwayat } from '../ai-riwayat-baca.js'
import { UMUR_HANGAT_MS, ambilAtauBuatPercakapanWa } from '../ai-percakapan-wa.js'
import { createTenantDb } from '../../utils/tenant-db.js'

let db: Client
let companyId: string
let userId: string
let percakapanId: string
/** Urutan pesan uji — unik lintas test (ai_pesan_unik_urutan). */
let urut = 100

beforeAll(async () => {
  db = await createRlsClient()
  const { rows: co } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = co[0].id

  const { rows: us } = await db.query(
    `SELECT m.user_id FROM company_members m WHERE m.company_id = $1 LIMIT 1`,
    [companyId],
  )
  userId = us[0].user_id

  const { rows: p } = await db.query(
    `INSERT INTO ai_percakapan (company_id, user_id, asisten, kanal)
     VALUES ($1, $2, 'web', 'web') RETURNING id`,
    [companyId, userId],
  )
  percakapanId = p[0].id

  // 12 pesan — LEBIH banyak dari batas, supaya pemotongannya benar-benar diuji.
  for (let i = 0; i < 12; i += 1) {
    await db.query(
      `INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, teks, blok, ronde, ada_galat_tool)
       VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, 1, false)`,
      [companyId, percakapanId, i % 2 === 0 ? 'user' : 'assistant', i, `pesan-${i}`],
    )
  }
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_pesan WHERE percakapan_id = $1`, [percakapanId])
  await db.query(`DELETE FROM ai_percakapan WHERE id = $1`, [percakapanId])
  await db.query(
    `DELETE FROM ai_percakapan WHERE company_id = $1 AND kanal = 'ai_whatsapp' AND user_id = $2`,
    [companyId, userId],
  )
  await db.end()
})

describe('riwayat benar-benar TERBACA (bukan kolom yang cuma ditulis)', () => {
  it('mengembalikan pesan, bukan array kosong', async () => {
    const r = await bacaRiwayat(createTenantDb(companyId), percakapanId)
    expect(r.length).toBeGreaterThan(0)
  })

  it('dibatasi MAKS_PESAN_RIWAYAT — tiap pesan ditagih ulang tiap ronde', async () => {
    const r = await bacaRiwayat(createTenantDb(companyId), percakapanId)
    expect(r).toHaveLength(MAKS_PESAN_RIWAYAT)
  })

  it('mengambil EKOR (paling baru), bukan kepala', async () => {
    // Yang menentukan arti "tadi maksudnya yang mana?" adalah pesan terakhir.
    // `limit` pada urutan menaik akan mengambil pembukaan obrolan — asisten
    // ingat sapaan pertama sambil melupakan kalimat barusan.
    const r = await bacaRiwayat(createTenantDb(companyId), percakapanId)
    expect(r[r.length - 1].isi).toBe('pesan-11')
    expect(r.map((x) => x.isi)).not.toContain('pesan-0')
  })

  it('urut LAMA→BARU', async () => {
    const r = await bacaRiwayat(createTenantDb(companyId), percakapanId)
    const angka = r.map((x) => Number(x.isi.replace('pesan-', '')))
    expect(angka).toEqual([...angka].sort((a, b) => a - b))
  })

  it('peran dipetakan; apa pun selain assistant jadi user', async () => {
    const r = await bacaRiwayat(createTenantDb(companyId), percakapanId)
    for (const p of r) expect(['user', 'assistant']).toContain(p.peran)
  })

  it('batas bisa diturunkan pemanggil', async () => {
    const r = await bacaRiwayat(createTenantDb(companyId), percakapanId, { maks: 3 })
    expect(r).toHaveLength(3)
    expect(r[r.length - 1].isi).toBe('pesan-11')
  })

  it('percakapan TAK DIKENAL mengembalikan kosong, tidak melempar', async () => {
    // Asisten yang lupa jauh lebih baik daripada asisten yang mati karena
    // tabel riwayatnya bermasalah.
    const r = await bacaRiwayat(
      createTenantDb(companyId),
      '00000000-0000-0000-0000-000000000000',
    )
    expect(r).toEqual([])
  })
})

describe('percakapan WhatsApp — satu yang berjalan, bukan satu per pesan', () => {
  it('membuat percakapan baru saat belum ada', async () => {
    const h = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    expect(h.ok).toBe(true)
    expect(h.id).toBeTruthy()
  })

  it('MEMAKAI ULANG percakapan yang masih hangat', async () => {
    // Kalau tiap pesan membuat baris sendiri, riwayatnya selalu kosong —
    // persis keadaan sebelum ini ada, hanya dengan lebih banyak baris.
    const a = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    // Hangat diukur dari PESAN terakhir, jadi percakapan tanpa pesan memang
    // belum hangat — pertukaran pertamanya disimpan lebih dulu.
    await db.query(
      `INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, teks, blok,
                             ronde, ada_galat_tool)
       VALUES ($1, $2, 'user', $3, 'halo', '[]'::jsonb, 1, false)`,
      [companyId, a.id, (urut += 1)],
    )
    const b = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    expect(b.id).toBe(a.id)
  })

  it('percakapan DINGIN tidak dipakai ulang', async () => {
    // Percakapan WA milik user ini dibersihkan lebih dulu: test sebelumnya
    // meninggalkan pesan BARU, dan yang baru membuat percakapannya tetap
    // hangat — kasus ini jadi menguji keadaan yang salah.
    await db.query(
      `DELETE FROM ai_pesan WHERE percakapan_id IN (
         SELECT id FROM ai_percakapan
          WHERE company_id = $1 AND user_id = $2 AND kanal = 'ai_whatsapp')`,
      [companyId, userId],
    )
    await db.query(
      `DELETE FROM ai_percakapan
        WHERE company_id = $1 AND user_id = $2 AND kanal = 'ai_whatsapp'`,
      [companyId, userId],
    )

    const a = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    // Pesannya diberi stempel LAMA. Sengaja `ai_pesan`, bukan
    // `ai_percakapan.diperbarui_pada`: yang kedua dipaksa `now()` oleh
    // trigger `trg_ai_percakapan_sentuh`, jadi ia hanya bisa MAJU. Versi
    // pertama test ini memundurkannya di sana dan selalu gagal — dan
    // kegagalan itulah yang menemukan bahwa jendela hangatnya memang tak
    // pernah bisa kedaluwarsa.
    await db.query(
      `INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, teks, blok,
                             ronde, ada_galat_tool, dibuat_pada)
       VALUES ($1, $2, 'user', $4, 'lama', '[]'::jsonb, 1, false,
               now() - interval '1 hour' * $3)`,
      [companyId, a.id, UMUR_HANGAT_MS / 3_600_000 + 1, (urut += 1)],
    )
    const b = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    expect(b.id).not.toBe(a.id)
  })

  it('percakapan dengan pesan BARU tetap dipakai ulang', async () => {
    const a = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    await db.query(
      `INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, teks, blok,
                             ronde, ada_galat_tool)
       VALUES ($1, $2, 'user', $3, 'baru', '[]'::jsonb, 1, false)`,
      [companyId, a.id, (urut += 1)],
    )
    const b = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    expect(b.id).toBe(a.id)
  })

  it('kanal tersimpan sebagai ai_whatsapp', async () => {
    const h = await ambilAtauBuatPercakapanWa(
      createTenantDb(companyId), companyId, userId, 'staff',
    )
    const { rows } = await db.query(`SELECT kanal FROM ai_percakapan WHERE id = $1`, [h.id])
    expect(rows[0].kanal).toBe('ai_whatsapp')
  })
})

describe('kedua kanal MENGISI riwayat — bukan cuma menyimpannya', () => {
  // Pola `fileURLToPath` yang sama dengan `ai-perilaku.test.ts`. `URL.pathname`
  // di Windows menghasilkan "/E:/..." dan `resolve` menempelkannya ke drive
  // lagi — jalur yang tak pernah ada, dengan galat yang menyesatkan.
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

  it('ai-chat.ts dan wa-webhook.ts sama-sama meneruskan `riwayat`', () => {
    for (const berkas of ['routes/v1/ai-chat.ts', 'routes/v1/wa-webhook.ts']) {
      const isi = readFileSync(resolve(SRC, berkas), 'utf8')
      // Kolom yang ada tapi tak diteruskan = asisten tetap lupa, tanpa gejala.
      expect(isi).toMatch(/\briwayat,/)
    }
  })
})

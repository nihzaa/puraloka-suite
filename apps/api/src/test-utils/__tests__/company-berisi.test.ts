import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../rls-harness.js'

/**
 * `companyBerisi` — pemilih company untuk fixture test.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HELPER INI PUNYA TEST SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ia dipakai `beforeAll` berkas test lain. Kalau ia salah memilih, yang muncul
 * BUKAN kegagalan yang menunjuk dirinya — melainkan galat fixture di berkas
 * lain yang menuduh SEED ("butuh tiga worker di company ini"), padahal seednya
 * baik-baik saja.
 *
 * Itu persis yang terjadi 2026-08-16: 16 test `tender-subkon` dilewati
 * seluruhnya, di berkas yang tak seorang pun menyentuhnya hari itu.
 *
 * ── Kenapa urutan saja TIDAK CUKUP, dan ini diukur bukan diasumsikan
 *
 * Uji mutasi mengosongkan `tabelBerisi` menjadi `[]` — dan `tender-subkon`
 * TETAP HIJAU, karena keanggotaan PERTAMA akun uji hari ini kebetulan yang
 * berisi. Jadi `ORDER BY` yang menyelamatkannya, bukan pemeriksaan isi.
 *
 * "Kebetulan" itulah yang berbahaya: urutan keanggotaan bisa berubah kapan
 * saja seseorang menambahkan company baru, dan test yang bergantung padanya
 * akan merah tanpa satu baris kode pun berubah.
 *
 * Test di bawah menguji pemeriksaan isinya SECARA LANGSUNG, tidak lewat
 * kebetulan urutan — supaya jaminannya nyata, bukan numpang nasib baik.
 */

let db: Client
let auth: string

beforeAll(async () => {
  db = await createRlsClient()
  const a = await authIdForRole(db, 'admin')
  if (!a) throw new Error('tak ada pengguna ber-role admin berkeanggotaan')
  auth = a
}, 60_000)

afterAll(async () => { await db?.end() })

describe('companyBerisi', () => {
  it('memilih company yang punya isi tabel yang diminta', async () => {
    const co = await companyBerisi(db, auth, ['workers', 'projects'])
    const { rows: w } = await db.query(
      'SELECT count(*)::int n FROM workers WHERE company_id = $1', [co])
    const { rows: p } = await db.query(
      'SELECT count(*)::int n FROM projects WHERE company_id = $1', [co])
    expect(w[0].n, 'company terpilih tak punya workers').toBeGreaterThan(0)
    expect(p[0].n, 'company terpilih tak punya projects').toBeGreaterThan(0)
  })

  it('MELEWATI company kosong yang lebih dulu dalam urutan', async () => {
    // Inti helper ini — dan yang PALING SULIT dibuktikan.
    //
    // Uji mutasi mengungkap kenapa: dengan akun uji hari ini, keanggotaan
    // PERTAMA kebetulan yang berisi, jadi "pertama" dan "benar" menunjuk
    // company yang sama. Mencopot pemeriksaan isi TIDAK membuat test merah —
    // ia hijau karena nasib baik, bukan karena kodenya benar.
    //
    // Karena itu keadaannya DIBUAT, bukan ditunggu: satu company kosong
    // disisipkan sebagai keanggotaan PALING AWAL (created_at mundur setahun),
    // sehingga urutan dan kebenaran menunjuk arah BERBEDA. Kalau pemeriksaan
    // isi dicopot, test ini merah.
    //
    // Barisnya dihapus di `finally` — berkas ini menulis ke `public` bersama.
    const { rows: u } = await db.query(
      'SELECT id FROM users WHERE auth_id = $1', [auth])
    const userId = u[0].id

    const { rows: kosongRows } = await db.query(
      `SELECT c.id FROM companies c
        WHERE NOT EXISTS (SELECT 1 FROM workers w WHERE w.company_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM company_members m
                           WHERE m.user_id = $1 AND m.company_id = c.id)
        LIMIT 1`, [userId])

    if (!kosongRows.length) {
      console.warn('⚠ tak ada company kosong non-anggota untuk disisipkan')
      return
    }
    const coKosong = kosongRows[0].id

    // `role_id` NOT NULL — diukur saat insert versi pertama ditolak basis.
    // Dipinjam dari keanggotaan yang sudah ada supaya tak mengarang peran.
    const { rows: peran } = await db.query(
      'SELECT role_id FROM company_members WHERE user_id = $1 LIMIT 1', [userId])

    await db.query(
      `INSERT INTO company_members (user_id, company_id, role_id, created_at)
       VALUES ($1, $2, $3, now() - interval '1 year')`,
      [userId, coKosong, peran[0].role_id])
    try {
      const co = await companyBerisi(db, auth, ['workers'])
      expect(co, 'company KOSONG terpilih hanya karena ia paling awal')
        .not.toBe(coKosong)

      const { rows: w } = await db.query(
        'SELECT count(*)::int n FROM workers WHERE company_id = $1', [co])
      expect(w[0].n).toBeGreaterThan(0)
    } finally {
      await db.query(
        'DELETE FROM company_members WHERE user_id = $1 AND company_id = $2',
        [userId, coKosong])
    }
  })

  it('tanpa syarat tabel, tetap mengembalikan company yang sah', async () => {
    const co = await companyBerisi(db, auth, [])
    expect(co).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('pengguna tanpa keanggotaan GAGAL KERAS, bukan mengembalikan undefined', async () => {
    // Pengguna yatim (`isolasi-…@ujicoba.test`) pernah membuat seluruh
    // suite mati dengan "Cannot read properties of undefined" — galat yang
    // tak menyebut sebabnya sama sekali. Sekarang sebabnya yang bicara.
    const { rows } = await db.query(
      `SELECT u.auth_id FROM users u
        WHERE u.auth_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.user_id = u.id)
        LIMIT 1`)
    if (!rows.length) {
      console.warn('⚠ tak ada pengguna yatim di basis — cabang ini tak teruji')
      return
    }
    await expect(companyBerisi(db, rows[0].auth_id, []))
      .rejects.toThrow(/tak punya keanggotaan/i)
  })

  it('nama tabel tak wajar DITOLAK — bukan disambung ke query', async () => {
    await expect(companyBerisi(db, auth, ['workers; DROP TABLE users --']))
      .rejects.toThrow(/tak wajar/i)
  })
})

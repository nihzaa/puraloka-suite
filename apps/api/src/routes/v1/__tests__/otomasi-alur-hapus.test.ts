/**
 * ALUR OTOMASI — menghapus dan menonaktifkan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA CACAT YANG DITUTUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * HAPUS TAK ADA      `otomasi-alur.ts` punya POST (daftar/ubah) dan POST
 *                    jalankan — tak ada DELETE sama sekali. Alur salah ketik,
 *                    sisa percobaan, atau workflow n8n yang sudah dibuang
 *                    menetap selamanya. Satu-satunya jalan keluar: SQL
 *                    langsung ke basis.
 *
 * TOGGLE TAK SAMPAI  Kolom `aktif` ada dan API MENERIMANYA sejak awal
 *                    (`otomasi-alur.ts:132`), tapi `alur-form-modal.tsx`
 *                    tak pernah menampilkan kendalinya. Jadi menonaktifkan
 *                    alur juga mustahil dari layar.
 *
 * Keduanya bentuk yang sama: satu ujung ada, ujung lainnya tidak, dan tak
 * satu pun mengeluarkan galat.
 *
 * Yang diuji di sini adalah ujung API-nya. Yang diuji BUKAN tombolnya —
 * itu tak bisa dibuktikan dari sini, dan mengklaimnya akan berlebihan.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiAlurRoutes from '../otomasi-alur.js'

const PREFIKS = 'uji-hapus-324-'

let app: FastifyInstance
let db: Client

const hdr = { authorization: 'Bearer t' }

/** Daftarkan satu alur uji, kembalikan id-nya. */
async function daftarkan(kode: string, nama: string): Promise<string> {
  const r = await app.inject({
    method: 'POST', url: '/api/v1/otomasi/alur', headers: hdr,
    payload: { kode, nama, kategori: 'umum', pemicu: 'manual' },
  })
  expect(r.statusCode).toBe(201)
  return r.json().id
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  await db.query(`DELETE FROM otomasi_alur WHERE kode LIKE $1`, [`${PREFIKS}%`])

  app = Fastify()
  await app.register(otomasiAlurRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM otomasi_alur WHERE kode LIKE $1`, [`${PREFIKS}%`])
  await app.close()
  await db.end()
})

describe('DELETE /api/v1/otomasi/alur/:id', () => {
  it('menghapus alur yang ada, dan barisnya benar-benar hilang', async () => {
    const id = await daftarkan(`${PREFIKS}satu`, 'Alur uji satu')

    const r = await app.inject({ method: 'DELETE', url: `/api/v1/otomasi/alur/${id}`, headers: hdr })
    expect(r.statusCode).toBe(200)

    // Jawaban 200 tidak membuktikan apa-apa sendirian — basis yang membuktikan.
    const { rows } = await db.query(`SELECT id FROM otomasi_alur WHERE id = $1`, [id])
    expect(rows).toHaveLength(0)
  }, 60_000)

  it('id yang tak ada menjawab 404, bukan 200 palsu', async () => {
    // Nol baris terhapus BUKAN keberhasilan. Tanpa pemeriksaan ini,
    // penghapusan yang ditolak RLS terbaca sukses, dan barisnya muncul lagi
    // begitu halaman disegarkan — pengguna menyimpulkan aplikasinya rusak.
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/v1/otomasi/alur/00000000-0000-0000-0000-0000000000ff',
      headers: hdr,
    })
    expect(r.statusCode).toBe(404)
  }, 60_000)

  it('jejak jalan ikut terhapus (FK CASCADE), tak jadi yatim', async () => {
    const id = await daftarkan(`${PREFIKS}dua`, 'Alur uji dua')

    // Satu baris jejak buatan — cukup untuk membuktikan CASCADE-nya hidup.
    const { rows: co } = await db.query(
      `SELECT company_id FROM otomasi_alur WHERE id = $1`, [id],
    )
    await db.query(
      `INSERT INTO otomasi_jalan (company_id, alur_id, status, sumber, dimulai_pada)
       VALUES ($1, $2, 'sukses', 'uji', now())`,
      [co[0].company_id, id],
    )

    await app.inject({ method: 'DELETE', url: `/api/v1/otomasi/alur/${id}`, headers: hdr })

    // Jejak milik alur yang tak ada tak bisa dibaca siapa pun — ia hanya
    // membesarkan tabel dan mengacaukan hitungan.
    const { rows } = await db.query(`SELECT id FROM otomasi_jalan WHERE alur_id = $1`, [id])
    expect(rows).toHaveLength(0)
  }, 60_000)

  it('penghapusan tercatat di audit log — "siapa menghapus apa" tetap terjawab', async () => {
    const id = await daftarkan(`${PREFIKS}tiga`, 'Alur uji tiga')
    await app.inject({ method: 'DELETE', url: `/api/v1/otomasi/alur/${id}`, headers: hdr })

    // Audit ditulis fire-and-forget (`void logAuditEvent`), jadi diberi
    // waktu singkat. Kalau tak muncul, jejaknya memang tak ada — bukan
    // sekadar terlambat.
    await new Promise(r => setTimeout(r, 1500))
    const { rows } = await db.query(
      `SELECT action FROM audit_logs WHERE record_id = $1 AND action = 'otomasi.alur.hapus'`,
      [id],
    )
    expect(rows.length).toBeGreaterThanOrEqual(1)
  }, 60_000)
})

describe('menonaktifkan lewat POST (toggle yang kini punya kendali di UI)', () => {
  it('aktif:false tersimpan, dan alurnya TIDAK terhapus', async () => {
    const id = await daftarkan(`${PREFIKS}empat`, 'Alur uji empat')

    const r = await app.inject({
      method: 'POST', url: '/api/v1/otomasi/alur', headers: hdr,
      payload: { id, aktif: false },
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await db.query(`SELECT aktif FROM otomasi_alur WHERE id = $1`, [id])
    // Nonaktif ≠ hapus. Riwayatnya tetap ada dan bisa dinyalakan lagi —
    // itulah bedanya dengan DELETE, dan alasan keduanya disediakan.
    expect(rows).toHaveLength(1)
    expect(rows[0].aktif).toBe(false)
  }, 60_000)

  it('dinyalakan lagi kembali aktif', async () => {
    const id = await daftarkan(`${PREFIKS}lima`, 'Alur uji lima')

    await app.inject({
      method: 'POST', url: '/api/v1/otomasi/alur', headers: hdr,
      payload: { id, aktif: false },
    })
    await app.inject({
      method: 'POST', url: '/api/v1/otomasi/alur', headers: hdr,
      payload: { id, aktif: true },
    })

    const { rows } = await db.query(`SELECT aktif FROM otomasi_alur WHERE id = $1`, [id])
    expect(rows[0].aktif).toBe(true)
  }, 60_000)
})

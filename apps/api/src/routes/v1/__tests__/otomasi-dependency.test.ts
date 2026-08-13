/**
 * 3.10 — DEPENDENCY BREACH: rutenya hidup, bukan cuma pustakanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI TIPIS, DAN KENAPA ITU DISENGAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ATURAN dependency sudah diuji tuntas sebagai fungsi murni di
 * `lib/__tests__/gantt-dependency.test.ts` (17 test, tanpa basis). Yang TIDAK
 * bisa dibuktikan di sana: apakah rutenya benar-benar memanggil pustaka itu,
 * apakah `viaProject` menyaring tenant, dan apakah bentuk jawabannya seperti
 * yang diharapkan penjadwal.
 *
 * ⚠ Basis dev saat ini punya NOL `rab_items` ber-`gantt_dep_rules` (diukur
 * 2026-08-12). Artinya test yang menuntut "ada notifikasi terbit" akan hijau
 * tanpa memeriksa apa pun — hijau karena kosong, bukan karena benar. Itu
 * kelas cacat yang sama dengan yang dikejar `audit-jadwal-punya-pembaca`.
 *
 * Jadi yang diuji di sini adalah yang MEMANG bisa dibuktikan hari ini:
 * rutenya terdaftar, terjaga izin, menjawab bentuk yang benar, dan tidak
 * meledak saat datanya kosong. Sisanya dijaga test pustaka.
 *
 * Begitu ada data dependency sungguhan, test ini yang ditambah — dan
 * catatan ini yang dihapus.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { KATALOG_TUGAS } from '../jadwal.js'

let app: FastifyInstance
let db: Client

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await app.close()
  await db.end()
})

describe('rute dependency-breach', () => {
  it('menjawab 200 dengan bentuk yang dibaca penjadwal', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/otomasi/jalankan/dependency-breach',
      headers: { authorization: 'Bearer t' },
    })

    // Status DAN badan digabung dalam satu assertion supaya saat merah,
    // pesan galatnya ikut terlihat — bukan cuma "expected 500 to be 200"
    // yang memaksa penyelidikan ulang dari nol.
    expect(`${r.statusCode} ${r.statusCode === 200 ? '' : r.body.slice(0, 250)}`.trim())
      .toBe('200')
    const j = r.json()
    expect(j.success).toBe(true)
    // Penjadwal tak membaca isi `checked`, tapi UI /sistem membacanya —
    // dan bentuk yang berubah diam-diam membuat kolomnya kosong.
    expect(typeof j.notifications_created).toBe('number')
    expect(typeof j.checked.proyek).toBe('number')
    expect(typeof j.checked.pelanggaran).toBe('number')
  }, 60_000)

  it('data dependency kosong TIDAK menghasilkan notifikasi palsu', async () => {
    // Basis hari ini nol dep_rules. Yang dibuktikan: ketiadaan aturan
    // menghasilkan nol, bukan galat dan bukan peringatan karangan.
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/otomasi/jalankan/dependency-breach',
      headers: { authorization: 'Bearer t' },
    })
    expect(r.json().checked.pelanggaran).toBe(0)
    expect(r.json().notifications_created).toBe(0)
  }, 60_000)

  it('tanpa token ditolak, bukan dijalankan diam-diam', async () => {
    // Endpoint yang memicu notifikasi ke banyak orang tak boleh terbuka.
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/otomasi/jalankan/dependency-breach',
    })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
  })
})

describe('katalog tugas', () => {
  it('keempat automation terdaftar dan jalurnya cocok dengan rutenya', () => {
    // Tugas yang terdaftar dengan jalur salah ketik akan tampak "terjadwal"
    // di UI tapi gagal tiap kali dijalankan — persis kelas cacat yang
    // katalog ini ada untuk mencegahnya.
    for (const kunci of [
      'kasbon-outstanding', 'kasbon-tukang', 'progres-belum-lapor', 'dependency-breach',
    ]) {
      expect(KATALOG_TUGAS[kunci]).toBeDefined()
      expect(KATALOG_TUGAS[kunci].jalur).toBe(`/api/v1/otomasi/jalankan/${kunci}`)
    }
  })
})

/**
 * TJS-P4 — gerbang SoD DI RUTE HTTP, bukan di fungsinya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA, PADAHAL SUDAH ADA DUA TEST SoD LAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/__tests__/sod.test.ts`      → aturannya benar.
 * `__tests__/sod-gerbang.test.ts`  → basisnya menjaga bentuk barisnya.
 *
 * Dua-duanya HIJAU meski rutenya tak pernah memanggil `periksaGerbangSod`.
 * Itu bukan kekhawatiran teoretis: sebelum hari ini repo ini punya penanda
 * `saya_pengajunya` yang benar dan tombol yang disembunyikan dengan benar,
 * dan tetap tak menghentikan apa pun — karena tak ada yang memanggil
 * pemeriksaan di jalur yang menulis.
 *
 * Kesalahan "menguji lapisan yang salah" sudah saya ulangi berkali-kali
 * (G1e, G1f, G2e, G3, G5, TJS-P1: test race yang menangkap permintaan kedua
 * di lapisan aplikasi, sehingga klausa WHERE-nya tak pernah dijalankan).
 * Test ini menembak lapisan yang benar: HTTP masuk, 403 keluar.
 *
 * ── Kenapa data aslinya dipulihkan di `finally`
 *
 * Test G6b sesi ini MERUSAK data nyata: ia membuat baseline uji yang
 * menonaktifkan baseline asli, lalu menghapus yang uji — meninggalkan yang
 * asli nonaktif. Di sini pengaju MR nyata diubah sementara, jadi pemulihannya
 * wajib berjalan bahkan saat test gagal.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import procurementRoutes from '../procurement.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let adminUserId: string
let mrId: string
let pengajuAsli: string | null = null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const approve = (body: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH',
    url: `/api/v1/procurement/material-requests/${mrId}/approve`,
    headers: { authorization: 'Bearer t' },
    payload: { action: 'approve', ...body },
  })

beforeAll(async () => {
  db = await createRlsClient()

  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [adminAuth])
  adminUserId = u[0].id

  // MR yang MENUNGGU keputusan. Dipilih berdasarkan syaratnya, bukan posisi —
  // test yang mengambil "baris pertama" hijau/merah tergantung isi basis.
  const { rows: mr } = await db.query(
    `SELECT id, requested_by FROM material_requests WHERE status = 'submitted' LIMIT 1`,
  )
  if (!mr.length) throw new Error('tak ada MR berstatus submitted untuk diuji')
  mrId = mr[0].id
  pengajuAsli = mr[0].requested_by

  // Admin dijadikan PENGAJU-nya, supaya ia menyetujui miliknya sendiri.
  await db.query('UPDATE material_requests SET requested_by = $1 WHERE id = $2', [adminUserId, mrId])

  app = Fastify()
  await app.register(procurementRoutes)
  await app.ready()
  actAs(adminAuth)
}, 90_000)

afterAll(async () => {
  // Pemulihan WAJIB jalan meski test gagal.
  if (mrId) {
    await db.query('UPDATE material_requests SET requested_by = $1 WHERE id = $2', [pengajuAsli, mrId])
    await db.query('ALTER TABLE sod_override DISABLE TRIGGER trg_sod_override_immutable')
    await db.query('DELETE FROM sod_override WHERE entity_id = $1', [mrId])
    await db.query('ALTER TABLE sod_override ENABLE TRIGGER trg_sod_override_immutable')
    // Jejak approval dari uji override dibersihkan supaya MR-nya kembali ke
    // keadaan semula — kalau tidak, MR nyata ini terlihat sudah disetujui
    // sebagian oleh orang yang tak pernah menyetujuinya.
    await db.query(
      `DELETE FROM approval_progress WHERE entity_type = 'material_request' AND entity_id = $1`,
      [mrId],
    )
    await db.query(`UPDATE material_requests SET status = 'submitted' WHERE id = $1`, [mrId])
  }
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('PATCH .../material-requests/:id/approve — gerbang SoD', () => {
  it('MENOLAK 403 saat pengaju menyetujui MR-nya sendiri', async () => {
    const res = await approve({})
    expect(res.statusCode).toBe(403)
    // Pesannya diperiksa, bukan hanya kodenya: 403 juga muncul dari "tak
    // berwenang", dan dua-duanya hijau kalau hanya kode yang dicek — padahal
    // yang satu berarti gerbang SoD bekerja dan yang lain berarti test ini
    // tak pernah sampai ke gerbangnya.
    expect(res.json().error).toMatch(/pengajuan Anda sendiri/i)
  })

  it('MENOLAK 403 saat override dicoba dengan alasan kosong', async () => {
    const res = await approve({ alasan_override: '   ' })
    expect(res.statusCode).toBe(403)
  })

  it('tak meninggalkan baris sod_override saat ditolak', async () => {
    // Kalau baris ditulis SEBELUM keputusan, daftar overridenya akan penuh
    // percobaan yang gagal — dan angka "berapa kali SoD dilewati" jadi bohong.
    const { rows } = await db.query('SELECT count(*)::int AS n FROM sod_override WHERE entity_id = $1', [mrId])
    expect(rows[0].n).toBe(0)
  })
})

/**
 * TJS-A3b — inbox approval terpusat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI: KELENGKAPAN, BUKAN SEKADAR "ADA ISINYA"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Inbox yang tak lengkap LEBIH BERBAHAYA daripada tak ada inbox: approver
 * belajar bahwa antrean kosong berarti tak ada pekerjaan, lalu berhenti
 * memeriksa modul yang tak pernah muncul. Dan modul yang tak pernah muncul
 * tak menimbulkan keluhan — dokumennya tertahan, pengajunya menunggu, dan tak
 * seorang pun tahu sebabnya.
 *
 * Karena itu test terpenting di sini bukan "inbox mengembalikan baris",
 * melainkan **`dilewati` kosong** — bukti bahwa ketujuh jenis benar-benar
 * TERBACA, bukan diam-diam gagal.
 *
 * Bukti itu nyata: saat pertama dijalankan, dua jenis masuk `dilewati` karena
 * saya salah menebak nama status (`pending` untuk `project_expense`, yang
 * enum-nya tak punya nilai itu) dan salah menebak jalur tenancy
 * (`estimate_versions.project_id` yang tak ada). Keduanya TIDAK menghasilkan
 * baris kosong — mereka menghasilkan galat yang terlihat.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import approvalInboxRoutes from '../approval-inbox.js'
import { SUMBER_INBOX } from '../../../lib/inbox-approval.js'

let app: FastifyInstance
let client: Client
let adminAuth = ''
let mandorAuth = ''

function actAs(a: string) {
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
}

const ambil = () =>
  app.inject({ method: 'GET', url: '/api/v1/approval/inbox', headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(approvalInboxRoutes)
  await app.ready()
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''
  mandorAuth = (await authIdForRole(client, 'mandor')) ?? ''
}, 60_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => { await app.close(); await client.end() })

describe('inbox — kelengkapan', () => {
  it('SELURUH jenis terbaca: `dilewati` kosong', async () => {
    actAs(adminAuth)
    const r = await ambil()
    expect(r.statusCode).toBe(200)
    const b = JSON.parse(r.body)

    // Inilah test terpenting berkas ini. Jenis yang masuk `dilewati` TIDAK
    // muncul di antrean — dan pengguna tak punya cara tahu kecuali membaca
    // peringatannya.
    expect(b.dilewati, `dilewati: ${JSON.stringify(b.dilewati)}`).toEqual([])
  })

  it('katalog memuat SEMUA jenis yang punya rantai approval', async () => {
    const { rows } = await client.query(
      `SELECT DISTINCT entity_type FROM approval_chains ORDER BY entity_type`,
    )
    const diBasis = rows.map((r) => r.entity_type as string)
    const diKatalog = SUMBER_INBOX.map((s) => s.jenis)

    const hilang = diBasis.filter((j) => !diKatalog.includes(j))
    expect(hilang, `jenis dengan rantai tapi tak ada di inbox: ${hilang.join(', ')}`).toEqual([])
  })

  it('tiap jenis di ringkasan punya angka — bukan undefined', async () => {
    actAs(adminAuth)
    const b = JSON.parse((await ambil()).body)
    // Jenis yang tak muncul di `ringkas` berarti loopnya keluar lebih awal
    // tanpa jejak — persis kegagalan senyap yang inbox ini ada untuk cegah.
    for (const j of Object.keys(b.ringkas)) {
      expect(typeof b.ringkas[j], `ringkas.${j}`).toBe('number')
    }
    expect(Object.keys(b.ringkas).length).toBeGreaterThan(0)
  })
})

describe('inbox — bentuk data', () => {
  it('total cocok dengan jumlah baris', async () => {
    actAs(adminAuth)
    const b = JSON.parse((await ambil()).body)
    expect(b.total).toBe(b.data.length)
  })

  it('diurutkan dari yang PALING LAMA menunggu', async () => {
    actAs(adminAuth)
    const b = JSON.parse((await ambil()).body)
    const tanggal = b.data.map((x: { dibuat_pada: string }) => x.dibuat_pada)
    // Approver dengan waktu terbatas harus melihat yang paling tertahan lebih
    // dulu; pengurutan menurut jenis akan menyembunyikannya di bawah.
    expect([...tanggal].sort()).toEqual(tanggal)
  })

  it('tiap baris membawa jalur UI untuk membukanya', async () => {
    actAs(adminAuth)
    const b = JSON.parse((await ambil()).body)
    for (const baris of b.data) {
      expect(baris.jalur_ui, `${baris.jenis} tanpa jalur_ui`).toMatch(/^\//)
    }
  })

  it('menandai pengajuan milik sendiri (SoD)', async () => {
    actAs(adminAuth)
    const b = JSON.parse((await ambil()).body)
    for (const baris of b.data) {
      expect(typeof baris.saya_pengajunya).toBe('boolean')
    }
  })
})

describe('inbox — otorisasi', () => {
  it('tanpa autentikasi ditolak', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/approval/inbox' })
    expect([401, 403]).toContain(r.statusCode)
  })

  it('peran tanpa hak approval melihat antrean yang lebih sempit', async () => {
    if (!mandorAuth) return   // basis dev tak selalu punya mandor
    actAs(mandorAuth)
    const rMandor = await ambil()
    expect(rMandor.statusCode).toBe(200)
    const bMandor = JSON.parse(rMandor.body)

    actAs(adminAuth)
    const bAdmin = JSON.parse((await ambil()).body)

    // Yang boleh dilihat ditentukan `canParticipateInChain` per jenis —
    // menampilkan jenis yang tak bisa ia putuskan berarti memberi daftar
    // pekerjaan yang bukan miliknya.
    expect(Object.keys(bMandor.ringkas).length).toBeLessThanOrEqual(
      Object.keys(bAdmin.ringkas).length,
    )
  })
})

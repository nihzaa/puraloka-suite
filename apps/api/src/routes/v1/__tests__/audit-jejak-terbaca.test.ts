import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import auditRoutes from '../audit.js'

// ============================================================================
// F6-1 kriteria 1 — "event dapat dibaca ulang".
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TEST INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `logAuditEvent` sudah lama mengisi `reason`, `severity`, dan
// `correlation_id`. Diukur 2026-08-07: ketiganya ADA di skema, dan
// `correlation_id` benar-benar terisi untuk event yang lewat helper.
//
// Tapi endpoint `GET /api/v1/audit` **tidak mengambil ketiganya**, dan tak
// punya saringan untuk keduanya. Konsekuensinya:
//
//   • `correlation_id` tersimpan tapi tak bisa dipakai — satu request
//     menghasilkan banyak event, dan tak ada cara merunutnya sebagai satu
//     rangkaian. Yang terbaca cuma daftar datar 21 ribu baris.
//   • `reason` tak pernah sampai ke layar, jadi "kenapa keputusan ini
//     diambil" tak terjawab meski jawabannya ada di basis.
//
// Kolom yang terisi dan tak pernah terbaca sama saja dengan kolom kosong —
// hanya lebih menyesatkan, karena pemeriksaan skema melaporkannya "ada".
//
// ── Kenapa lewat endpoint, bukan kueri langsung
//
// Yang dijaga di sini adalah KONTRAK yang dilihat pembacanya. Kueri langsung
// ke `audit_logs` akan hijau bahkan saat endpoint-nya membuang kolomnya —
// dan itu persis cacat yang test ini ada untuk menangkap.
// ============================================================================

let app: FastifyInstance
let client: Client
let adminAuth: string
let idKorelasi: string

// UNIK per-run. Baris uji tak bisa dihapus (append-only), jadi run kedua akan
// menemukan baris run pertama — dan asersi "tepat 2 baris" gagal karena
// datanya menumpuk, bukan karena kodenya salah.
const JEJAK = Math.random().toString(16).slice(2, 10)
const KORELASI = `00000000-0000-4000-8000-0000${JEJAK.slice(0, 8)}`
const TANDA = `[TEST-F61-${JEJAK}]`

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never,
  )
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

// TIDAK ADA pembersihan — dan itu disengaja.
//
// `audit_logs` append-only (Ember [C]): DELETE ditolak trigger, dan itu
// benar. Percobaan pertama test ini memanggil DELETE di `afterAll`, lalu
// gagal dengan "audit_logs bersifat append-only" — penjaganya bekerja persis
// seperti seharusnya.
//
// Jadi fixture dibuat agar TAK MENGGANGGU, bukan dibersihkan: tiap run
// memakai `correlation_id` sendiri (`KORELASI`), dan tiap asersi menyaring
// `action` berprefiks `TANDA`. Baris uji menumpuk di dev — itu harga yang
// dibayar untuk jejak yang benar-benar tak bisa dihapus siapa pun.

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' LIMIT 1`)
  const { rows: co } = await client.query(
    `SELECT id FROM companies WHERE is_active ORDER BY created_at LIMIT 1`)

  // Tiga event: DUA berbagi correlation_id (satu request), SATU tidak.
  //
  // Bentuk ini yang membuat saringan bisa dibuktikan. Kalau ketiganya
  // sekorelasi, saringan yang DIABAIKAN pun mengembalikan tiga baris — dan
  // test-nya hijau tanpa menguji apa pun.
  const { rows } = await client.query(
    `INSERT INTO audit_logs (company_id, user_id, table_name, record_id, action,
                             reason, severity, correlation_id)
     VALUES
       ($1, $2, 'projects', gen_random_uuid(), $3, 'Lingkup berubah di lapangan', 'critical', $5),
       ($1, $2, 'projects', gen_random_uuid(), $4, 'Menyusul perubahan lingkup',  'info',     $5),
       ($1, $2, 'projects', gen_random_uuid(), $6, NULL,                          'info',     NULL)
     RETURNING id`,
    [co[0].id, u[0].id, TANDA + '.ditolak', TANDA + '.dicatat', KORELASI, TANDA + '.lepas'])
  idKorelasi = rows[0].id

  app = Fastify()
  await app.register(auditRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app?.close()
  await client?.end()
})

describe('F6-1 · jejak audit bisa dibaca ulang lewat endpoint', () => {
  it('balasan memuat `reason`, `severity`, dan `correlation_id`', async () => {
    actAs(adminAuth)
    const r = await get(`/api/v1/audit?action=${encodeURIComponent(TANDA + '.ditolak')}`)
    expect(r.statusCode).toBe(200)

    const baris = r.json().logs?.[0]
    expect(baris, 'event uji tak terbaca endpoint').toBeTruthy()

    // Ketiganya DINYATAKAN satu per satu, bukan diperiksa lewat
    // `toMatchObject`: yang perlu dijaga adalah tiap kolom hadir, dan
    // pemeriksaan gabungan menyembunyikan kolom mana yang hilang.
    expect(baris.reason, 'kolom `reason` tak ikut di balasan').toBe('Lingkup berubah di lapangan')
    expect(baris.severity, 'kolom `severity` tak ikut di balasan').toBe('critical')
    expect(baris.correlation_id, 'kolom `correlation_id` tak ikut di balasan').toBe(KORELASI)
  }, 60_000)

  it('saringan `correlation_id` merunut satu rangkaian, bukan seluruh daftar', async () => {
    actAs(adminAuth)
    const r = await get(`/api/v1/audit?correlation_id=${KORELASI}&limit=100`)
    expect(r.statusCode).toBe(200)

    const logs = r.json().logs as Array<{ action: string; correlation_id: string }>
    const punyaKita = logs.filter((l) => l.action.startsWith(TANDA))

    // DUA, bukan tiga: event ketiga sengaja tanpa correlation_id. Angka tiga
    // berarti saringannya diabaikan.
    expect(punyaKita).toHaveLength(2)
    expect(punyaKita.every((l) => l.correlation_id === KORELASI)).toBe(true)
  }, 60_000)

  it('saringan `severity` memisahkan yang kritis dari yang biasa', async () => {
    actAs(adminAuth)
    const r = await get(`/api/v1/audit?severity=critical&limit=100`)
    expect(r.statusCode).toBe(200)

    const logs = r.json().logs as Array<{ action: string; severity: string }>
    const punyaKita = logs.filter((l) => l.action.startsWith(TANDA))

    expect(punyaKita).toHaveLength(1)
    expect(punyaKita[0].action).toBe(TANDA + '.ditolak')
    // Tak ada yang lolos dengan severity lain — kalau ada, saringannya tak
    // bekerja dan angka "berapa kejadian kritis" jadi salah.
    expect(logs.every((l) => l.severity === 'critical')).toBe(true)
  }, 60_000)

  it('event tanpa alasan tetap terbaca, dengan `reason` null — bukan hilang', async () => {
    actAs(adminAuth)
    const r = await get(`/api/v1/audit?action=${encodeURIComponent(TANDA + '.lepas')}`)
    const baris = r.json().logs?.[0]

    // Membuang baris tanpa alasan akan membuat "berapa keputusan yang tak
    // beralasan" tak bisa dihitung — dan itu justru angka yang paling perlu.
    expect(baris).toBeTruthy()
    expect(baris.reason).toBeNull()
    expect(idKorelasi).toBeTruthy()
  }, 60_000)
})

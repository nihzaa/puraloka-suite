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

// ─────────────────────────────────────────────────────────────────────────
// Task 8 — filter proyek-milik-PM.
//
// `canParticipateInChain` menyaring by PERMISSION ("apakah user punya salah
// satu permission di rantai approval jenis ini"), TAPI TIDAK menyaring
// berdasarkan apakah `project_id` baris itu adalah proyek yang di-PM-i user.
// Pembatasan proyek baru terjadi di endpoint approve/reject masing-masing
// (mis. kasbons.ts mengecek `project.pm_id !== user.id`) — jadi PM bisa
// MELIHAT antrean approval proyek yang bukan tanggung jawabnya (termasuk
// nominal & nama pemohon), meski ditolak saat mencoba menyetujuinya.
//
// Entitas yang dipilih: KASBON (tenancy 'B', yang cocok dengan `project_id`
// langsung di baris — celahnya paling gamblang untuk jenis ini).
describe('inbox — filter proyek milik PM (Task 8)', () => {
  let pmAuth = ''
  let pmUserId = ''
  let pmLainUserId = ''
  let companyId = ''
  let clientId = ''
  let projectAId = ''
  let projectBId = ''
  let kasbonAId = ''
  let kasbonBId = ''

  /** Hapus SEMUA artefak test berprefiks [TEST-T8] beserta yang menahannya. */
  async function purgeTestProjects(): Promise<void> {
    const { rows } = await client.query(
      `SELECT id FROM projects WHERE name LIKE '[TEST-T8]%'`)
    if (rows.length === 0) return
    const ids = rows.map((r) => r.id)
    await client.query(
      `DELETE FROM approval_progress
        WHERE entity_type = 'kasbon'
          AND entity_id IN (SELECT id FROM kasbons WHERE project_id = ANY($1))`, [ids])
    await client.query(`DELETE FROM kasbons WHERE project_id = ANY($1)`, [ids])
    await client.query(`DELETE FROM notifications WHERE project_id = ANY($1)`, [ids])
    await client.query(`DELETE FROM projects WHERE id = ANY($1)`, [ids])
  }

  beforeAll(async () => {
    pmAuth = (await authIdForRole(client, 'pm')) ?? ''
    if (!pmAuth) return // basis dev tak selalu punya PM — test SKIP di dalam `it`

    const { rows: pmRow } = await client.query(
      `SELECT id FROM users WHERE auth_id = $1`, [pmAuth])
    pmUserId = pmRow[0].id

    const { rows: cm } = await client.query(
      `SELECT company_id FROM company_members WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
      [pmUserId])
    companyId = cm[0].company_id

    const { rows: cl } = await client.query(
      `SELECT id FROM clients WHERE company_id = $1 LIMIT 1`, [companyId])
    clientId = cl[0].id

    // PM lain: siapa saja berbeda dari pmUserId untuk jadi pm_id proyek B.
    //
    // ⚠️ TANPA fallback ke pmUserId. Versi sebelumnya jatuh ke
    // `?? pmUserId` — kalau basis cuma punya SATU user aktif, proyek B jadi
    // milik PM UJI SENDIRI, dan test pertama LULUS PALSU: ia mengklaim
    // menguji "PM tak melihat proyek orang lain" padahal kedua proyek
    // kebetulan miliknya. Lulus semacam itu tak membuktikan apa pun tentang
    // filter — dan diam-diam menurunkan cakupan test tanpa ada yang tahu.
    // Wajib GAGAL dengan pesan jelas kalau prasyaratnya tak terpenuhi
    // (pola `wajibAda` di rls-harness.ts), bukan mengarang fallback.
    const { rows: lain } = await client.query(
      `SELECT id FROM users WHERE id <> $1 AND is_active = true ORDER BY created_at LIMIT 1`,
      [pmUserId])
    if (!lain[0]) {
      throw new Error(
        'Prasyarat test tak terpenuhi: butuh minimal 2 user aktif di basis ' +
        '(PM uji + satu user lain untuk jadi pm_id proyek B). Tanpa itu ' +
        '"PM lain" akan jatuh ke PM uji sendiri dan test filter proyek-PM ' +
        'lulus tanpa menguji apa pun.'
      )
    }
    pmLainUserId = lain[0].id

    await purgeTestProjects()

    const { rows: pr } = await client.query(
      `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
       VALUES
         ($1, $2, $3, '[TEST-T8] Proyek A (milik PM uji)', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $3),
         ($1, $2, $4, '[TEST-T8] Proyek B (milik PM lain)', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $3)
       RETURNING id, name`,
      [companyId, clientId, pmUserId, pmLainUserId])
    projectAId = pr.find((r) => r.name.includes('Proyek A')).id
    projectBId = pr.find((r) => r.name.includes('Proyek B')).id

    const { rows: kb } = await client.query(
      `INSERT INTO kasbons (company_id, project_id, amount, fund_source, purpose, requested_by, status)
       VALUES
         ($4, $1, 500000, 'owner_advance', '[TEST-T8] kasbon proyek A', $3, 'pending'),
         ($4, $2, 500000, 'owner_advance', '[TEST-T8] kasbon proyek B', $3, 'pending')
       RETURNING id, project_id`,
      [projectAId, projectBId, pmLainUserId, companyId])
    kasbonAId = kb.find((r) => r.project_id === projectAId).id
    kasbonBId = kb.find((r) => r.project_id === projectBId).id
  }, 60_000)

  afterAll(async () => {
    if (!pmAuth) return
    await purgeTestProjects()
  })

  it('PM hanya melihat baris approval dari proyek yang di-PM-inya', async () => {
    if (!pmAuth) return // basis dev tak selalu punya PM
    // Prasyarat fixture: proyek B WAJIB milik user LAIN, bukan PM uji sendiri
    // — kalau tidak, test ini lulus tanpa menguji filternya sama sekali.
    expect(pmLainUserId).not.toBe(pmUserId)
    expect(projectAId).not.toBe(projectBId)
    actAs(pmAuth)
    const r = await ambil()
    expect(r.statusCode).toBe(200)
    const b = JSON.parse(r.body)
    const kasbonIdsMuncul = new Set(
      (b.data as Array<{ jenis: string; id: string }>)
        .filter((x) => x.jenis === 'kasbon')
        .map((x) => x.id),
    )
    const projectIdsMuncul = new Set(
      (b.data as Array<{ jenis: string; project_id: string | null }>)
        .filter((x) => x.jenis === 'kasbon')
        .map((x) => x.project_id),
    )
    expect(kasbonIdsMuncul.has(kasbonAId)).toBe(true)
    expect(kasbonIdsMuncul.has(kasbonBId)).toBe(false)
    expect(projectIdsMuncul.has(projectAId)).toBe(true)
    expect(projectIdsMuncul.has(projectBId)).toBe(false)
  })

  it('role selain PM (mis. admin) tetap melihat semua proyek company', async () => {
    if (!pmAuth) return
    actAs(adminAuth)
    const r = await ambil()
    expect(r.statusCode).toBe(200)
    const b = JSON.parse(r.body)
    const projectIdsMuncul = new Set(
      (b.data as Array<{ jenis: string; project_id: string | null }>)
        .filter((x) => x.jenis === 'kasbon')
        .map((x) => x.project_id),
    )
    expect(projectIdsMuncul.has(projectAId)).toBe(true)
    expect(projectIdsMuncul.has(projectBId)).toBe(true)
  })

  // ── Fail-closed: PM TANPA proyek sama sekali ─────────────────────────────
  //
  // Jalur `pmProjectIds = []` (bukan `null`) adalah yang PALING berbahaya
  // untuk lolos tanpa test: kalau kelak seseorang "menyederhanakan" guard
  // `if (pmProjectIds !== null)` di approval-inbox.ts jadi
  // `if (pmProjectIds?.length)`, filternya akan DILEWATI persis saat
  // pmProjectIds kosong — dan PM tanpa proyek mendadak melihat SELURUH
  // company, bukan nol baris. Sebelumnya jalur ini hanya "terbukti" lewat
  // membaca kode + verifikasi SQL manual, bukan test yang benar-benar
  // menjalankan endpoint.
  //
  // ⚠️ Memindahkan HANYA dua proyek [TEST-T8] TIDAK CUKUP: PM uji di basis
  // dev ini (`Rizky Firmansyah`) sudah memegang proyek seed asli lain di
  // luar fixture (diukur langsung: 6 proyek). `pmProjectIds` hasil query
  // sungguhan jadi tetap non-kosong walau kedua proyek fixture dipindah —
  // dan mutasi guard `!== null` → `?.length` TIDAK terdeteksi test, karena
  // array 6-elemen itu tetap truthy. Ditemukan lewat uji mutasi sengaja
  // (lihat report), bukan diasumsikan aman.
  //
  // Diperbaiki: pindahkan SEMUA proyek yang pm_id-nya = pmUserId (fixture
  // MAUPUN seed asli) ke pmLainUserId untuk sesaat, verifikasi pmProjectIds
  // benar-benar [] dari sisi DB, panggil endpoint, lalu KEMBALIKAN utuh ke
  // pemilik semula satu-per-satu (bukan "semua ke pmUserId lagi" — sebagian
  // proyek yang dipindah TADINYA bukan milik pmUserId sama sekali kalau
  // suatu saat data seed berubah, jadi dicatat map asal→pemilik, bukan
  // ditebak).
  it('PM tanpa proyek sama sekali mendapat NOL baris ber-project — bukan semua', async () => {
    if (!pmAuth) return
    expect(pmLainUserId).not.toBe(pmUserId) // prasyarat sama seperti test pertama

    const { rows: milikPm } = await client.query(
      `SELECT id FROM projects WHERE pm_id = $1`, [pmUserId])
    const idProyekMilikPm = milikPm.map((r) => r.id as string)
    // Fixture sendiri wajib ikut ketahuan di sini — kalau tidak, prasyarat
    // test-test lain di describe ini sudah salah.
    expect(idProyekMilikPm).toContain(projectAId)

    await client.query(
      `UPDATE projects SET pm_id = $1 WHERE id = ANY($2)`,
      [pmLainUserId, idProyekMilikPm],
    )
    try {
      // Buktikan prasyaratnya benar-benar terpasang DARI SISI DB sebelum
      // menilai endpoint — persis pelajaran temuan review sebelumnya
      // (fixture yang diam-diam tak sesuai klaim membuat test lulus palsu).
      const { rows: cek } = await client.query(
        `SELECT id FROM projects WHERE pm_id = $1`, [pmUserId])
      expect(cek, 'pmUserId harus benar-benar NOL proyek sekarang').toEqual([])

      actAs(pmAuth)
      const r = await ambil()
      expect(r.statusCode).toBe(200)
      const b = JSON.parse(r.body)
      const kasbonRows = (b.data as Array<{ jenis: string; project_id: string | null }>)
        .filter((x) => x.jenis === 'kasbon')
      const projectIdsMuncul = new Set(kasbonRows.map((x) => x.project_id))

      // NOL baris ber-project — bukan "semua company" seperti perilaku
      // sebelum fix (dan seperti mutasi `?.length` yang dicoba sengaja).
      expect(kasbonRows.length, `harus 0 baris kasbon, dapat: ${JSON.stringify(kasbonRows)}`).toBe(0)
      expect(projectIdsMuncul.has(projectAId)).toBe(false)
      expect(projectIdsMuncul.has(projectBId)).toBe(false)
    } finally {
      // Kembalikan SATU PER SATU ke pmUserId — semuanya memang berasal dari
      // pmUserId (dibuktikan query di atas), jadi restore-nya simetris.
      if (idProyekMilikPm.length > 0) {
        await client.query(
          `UPDATE projects SET pm_id = $1 WHERE id = ANY($2)`,
          [pmUserId, idProyekMilikPm],
        )
      }
    }
  })
})

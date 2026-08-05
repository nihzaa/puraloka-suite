import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { tungguAudit } from '../../../test-utils/tunggu-audit.js'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import financeRoutes from '../finance.js'

// ════════════════════════════════════════════════════════════════════════════
// IPC — GERBANG PROGRES TERMIN, DIUJI LEWAT ENDPOINT NYATA (INTI #2 · F5-1)
// ════════════════════════════════════════════════════════════════════════════
//
// `lib/ipc-progres.test.ts` sudah menguji keputusannya sebagai fungsi murni.
// Berkas ini menguji hal yang BERBEDA dan tak bisa digantikan olehnya:
// apakah gerbang itu benar-benar TERPASANG di jalur pembuatan invoice.
//
// Bedanya penting. Fungsi yang benar tapi tak pernah dipanggil terlihat persis
// sama hijaunya di test unit — dan repo ini sudah punya preseden pahitnya:
// `trigger_pct` tersimpan bertahun-tahun tanpa pernah sekali pun dibaca.
//
// Yang dibuktikan di sini, terhadap Postgres nyata:
//   1. termin on_progress di bawah ambang  → DITOLAK (422), invoice TIDAK dibuat
//   2. termin on_progress di atas ambang   → dibuat
//   3. termin on_sign (DP)                 → tak tersentuh gerbang ini
//   4. progres proyek NULL                 → DITOLAK (fail-closed)
//
// ── Penjaga berdaya
//
// Kasus (2) bukan pelengkap. Tanpa satu kasus yang BERHASIL, "nol invoice
// dibuat" bisa berarti gerbangnya bekerja ATAU seluruh endpointnya rusak —
// dan keduanya terlihat sama hijau.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let clientId: string
let companyId: string

const PREFIX = '[TEST-IPC]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  // Trigger dimatikan HANYA di sesi ini — perilaku produksi tak tersentuh.
  // Polanya diambil dari ahsp-endpoint.test.ts.
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(
      `DELETE FROM invoices WHERE project_id IN (SELECT id FROM projects WHERE name LIKE $1)`,
      [`${PREFIX}%`])
    await client.query(
      `DELETE FROM termin_schedules WHERE project_id IN (SELECT id FROM projects WHERE name LIKE $1)`,
      [`${PREFIX}%`])
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${PREFIX}%`])
    await client.query(`DELETE FROM clients WHERE contact_person LIKE $1`, [`${PREFIX}%`])
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

/**
 * Proyek + termin sekali pakai. Progres & ambang jadi parameter ujinya.
 *
 * `progresPct` bukan `| null` — `projects.progress_pct` NOT NULL DEFAULT 0
 * (diukur, lihat komentar di test 'belum dimulai'). Menuliskannya nullable
 * akan menjanjikan skenario yang tak bisa dibuat.
 */
async function buatSkenario(opts: {
  nama: string
  progresPct: number
  pemicu: 'on_sign' | 'on_progress' | 'on_retention'
  ambangPct: number | null
}) {
  // `company_id` eksplisit — alasannya di komentar `beforeAll`.
  const { rows: p } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date,
                           progress_pct, contract_value, created_by)
     VALUES ($5, $1, $2, $3, 'Bandung', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days',
             $4, 1000000000, $2) RETURNING id`,
    [clientId, adminUserId, `${PREFIX} ${opts.nama}`, opts.progresPct, companyId])
  const projectId = p[0].id as string

  const { rows: t } = await client.query(
    `INSERT INTO termin_schedules (project_id, termin_number, label, amount,
                                   pct_of_contract, trigger_type, trigger_pct, status)
     VALUES ($1, 1, 'Termin uji', 100000000, 10, $2, $3, 'pending') RETURNING id`,
    [projectId, opts.pemicu, opts.ambangPct])

  return { projectId, terminId: t[0].id as string }
}

const bodyTermin = (projectId: string, terminId: string) => ({
  project_id: projectId,
  termin_schedule_id: terminId,
  invoice_type: 'termin_billing',
  base_amount: 100000000,
  due_date: '2027-01-31',
})

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  adminUserId = u[0].id

  // ⚠️ `company_id` DIISI EKSPLISIT — jangan mengandalkan trigger.
  //
  // Versi pertama fixture ini mengabaikannya dan HIJAU DI DEV, MERAH DI CI:
  //
  //     null value in column "company_id" of relation "clients"
  //     violates not-null constraint
  //
  // Sebabnya bukan test yang rapuh. `fn_isi_company_id()` mengisi otomatis
  // hanya bila ada TEPAT SATU company, dan MENOLAK MENEBAK saat ambigu.
  // Database dev punya satu; CI punya beberapa. Jadi dev-lah yang menyesatkan,
  // bukan CI yang rewel — dan trigger itu memang tak boleh dilonggarkan
  // (pelajaran F0-14, dan alasannya tetap berlaku untuk multi-tenant).
  const { rows: co } = await client.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`)
  companyId = co[0].id

  const { rows: c } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ($1, $2, '081200000000', $3) RETURNING id`,
    [companyId, `${PREFIX} Klien`, adminUserId])
  clientId = c[0].id

  app = Fastify()
  await app.register(financeRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await purge()
  await app?.close()
  await client?.end()
})

async function jumlahInvoice(projectId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int n FROM invoices WHERE project_id = $1`, [projectId])
  return rows[0].n
}

describe('IPC — gerbang progres BENAR-BENAR terpasang di endpoint', () => {
  it('PENJAGA BERDAYA: termin on_progress di ATAS ambang berhasil dibuat', async () => {
    // Kasus ini WAJIB ada dan wajib lebih dulu. Tanpanya, "nol invoice dibuat"
    // di kasus-kasus berikutnya bisa berarti gerbang bekerja ATAU endpoint
    // rusak total — dan keduanya sama hijaunya.
    actAs(adminAuth)
    const s = await buatSkenario({
      nama: 'lolos', progresPct: 55, pemicu: 'on_progress', ambangPct: 40,
    })

    const res = await post('/api/v1/finance/invoices', bodyTermin(s.projectId, s.terminId))

    expect(res.statusCode,
      `endpoint menolak kasus yang SEHARUSNYA lolos (progres 55% >= ambang 40%) — ` +
      `body: ${res.body.slice(0, 300)}`).toBe(201)
    expect(await jumlahInvoice(s.projectId)).toBe(1)
  })

  it('termin on_progress di BAWAH ambang DITOLAK, dan invoice tidak dibuat', async () => {
    actAs(adminAuth)
    const s = await buatSkenario({
      nama: 'kurang', progresPct: 12, pemicu: 'on_progress', ambangPct: 40,
    })

    const res = await post('/api/v1/finance/invoices', bodyTermin(s.projectId, s.terminId))

    expect(res.statusCode,
      'termin syarat 40% lolos di progres 12% — kontraktor menagih owner untuk ' +
      'uang yang menurut kontrak belum berhak ditagih').toBe(422)

    const b = res.json()
    expect(b.alasan).toBe('progres_kurang')
    expect(b.progres_pct).toBe(12)
    expect(b.ambang_pct).toBe(40)

    expect(await jumlahInvoice(s.projectId),
      'invoice tetap tercipta padahal gerbang menolak — penolakannya hanya kosmetik').toBe(0)
  })

  it('proyek yang BELUM dimulai (progres 0) tetap DITOLAK', async () => {
    // ⚠️ Test ini awalnya menguji `progress_pct = NULL`, dan GAGAL — bukan
    // karena kodenya salah, melainkan karena skenarionya MUSTAHIL:
    //
    //   projects.progress_pct  numeric  NOT NULL  DEFAULT 0
    //
    // Diukur, bukan diduga. Jadi cabang `progres_tak_diketahui` di
    // `lib/ipc-progres.ts` tak bisa dicapai lewat kolom ini hari ini.
    //
    // Cabang itu SENGAJA DIPERTAHANKAN dan tetap diuji di test unit: kalau
    // kelak sumber progres berpindah (mis. ke opname lapangan yang boleh
    // kosong), fail-closed sudah ada di tempatnya. Menghapusnya sekarang
    // berarti mewariskan celah yang terbuka diam-diam saat sumbernya berubah.
    //
    // Yang diuji di sini adalah kenyataannya: proyek baru berprogres 0, dan
    // termin bersyarat 40% harus menolaknya.
    actAs(adminAuth)
    const s = await buatSkenario({
      nama: 'belum-mulai', progresPct: 0, pemicu: 'on_progress', ambangPct: 40,
    })

    const res = await post('/api/v1/finance/invoices', bodyTermin(s.projectId, s.terminId))

    expect(res.statusCode,
      'termin syarat 40% lolos di proyek yang BELUM DIKERJAKAN SAMA SEKALI — ' +
      'ini bentuk paling telanjang dari menagih uang yang belum berhak ditagih').toBe(422)
    expect(res.json().alasan).toBe('progres_kurang')
    expect(res.json().progres_pct).toBe(0)
    expect(await jumlahInvoice(s.projectId)).toBe(0)
  })

  it('ambang NULL pada termin on_progress DITOLAK — syaratnya yang hilang', async () => {
    actAs(adminAuth)
    const s = await buatSkenario({
      nama: 'ambang-null', progresPct: 90, pemicu: 'on_progress', ambangPct: null,
    })

    const res = await post('/api/v1/finance/invoices', bodyTermin(s.projectId, s.terminId))

    expect(res.statusCode,
      'ambang hilang diperlakukan sebagai "tanpa syarat" — termin bersyarat ' +
      'berubah jadi tak bersyarat tanpa seorang pun memutuskannya').toBe(422)
    expect(res.json().alasan).toBe('ambang_tak_diketahui')
  })

  it('termin on_sign (invoice DP) TIDAK tersentuh gerbang ini', async () => {
    // Invoice DP ditagih saat tanda tangan kontrak — progres memang 0, dan
    // itu benar. Kalau gerbang ikut berlaku di sini, DP jadi mustahil ditagih.
    actAs(adminAuth)
    const s = await buatSkenario({
      nama: 'dp', progresPct: 0, pemicu: 'on_sign', ambangPct: null,
    })

    const res = await post('/api/v1/finance/invoices', bodyTermin(s.projectId, s.terminId))

    expect(res.statusCode,
      `gerbang progres ikut memblokir invoice DP — DP ditagih saat progres 0% ` +
      `secara sah, jadi memblokirnya membuat uang muka mustahil ditagih. ` +
      `body: ${res.body.slice(0, 300)}`).toBe(201)
    expect(await jumlahInvoice(s.projectId)).toBe(1)
  })
})

describe('SERTIFIKAT — progres yang diakui tercatat di audit log', () => {
  it('invoice termin on_progress mencatat progres & ambang saat penagihan', async () => {
    actAs(adminAuth)
    const s = await buatSkenario({
      nama: 'sertifikat', progresPct: 62.5, pemicu: 'on_progress', ambangPct: 40,
    })

    const res = await post('/api/v1/finance/invoices', bodyTermin(s.projectId, s.terminId))
    expect(res.statusCode).toBe(201)
    const invoiceId = res.json().invoice?.id ?? res.json().id

    // Audit ditulis via `void logAuditEvent(...)` — sengaja tak di-await supaya
    // tak menahan respons.
    //
    // `sleep(700)` TIDAK cukup: di CI, enam shard berbagi satu database dan
    // insert audit bisa selesai jauh setelah itu. Gejalanya hijau lokal,
    // merah di CI, dan yang merah berpindah tiap jalan — paling mudah salah
    // disimpulkan sebagai "CI rewel" lalu di-retry sampai kebetulan lolos.
    // `tungguAudit` menunggu barisnya MUNCUL, bukan menebak berapa lama.
    const rows = await tungguAudit(client, {
      tabel: 'invoices', recordId: invoiceId, action: 'invoice.amount',
    })

    expect(rows.length,
      'tak ada jejak audit untuk invoice termin — nilai tagihan berubah tanpa ' +
      'catatan siapa dan kapan').toBe(1)

    const v = rows[0].new_values
    expect(Number(v.ipc_progres_pct),
      'progres yang diakui TIDAK tercatat — enam bulan lagi, saat owner ' +
      'menyengketakan tagihan, tak seorang pun bisa menjawab "waktu itu ' +
      'progresnya berapa?"').toBe(62.5)
    expect(Number(v.ipc_ambang_pct)).toBe(40)
  })

  it('invoice on_sign TIDAK mencatat angka IPC — tak ada yang bermakna dicatat', async () => {
    actAs(adminAuth)
    const s = await buatSkenario({
      nama: 'sertifikat-dp', progresPct: 0, pemicu: 'on_sign', ambangPct: null,
    })

    const res = await post('/api/v1/finance/invoices', bodyTermin(s.projectId, s.terminId))
    expect(res.statusCode).toBe(201)
    const invoiceId = res.json().invoice?.id ?? res.json().id

    const rows = await tungguAudit(client, {
      tabel: 'invoices', recordId: invoiceId, action: 'invoice.amount',
    })

    // Dua kegagalan berbeda, dipisah supaya pesannya menjelaskan yang
    // sebenarnya terjadi. Sebelumnya `rows[0].new_values` langsung diakses:
    // saat auditnya belum masuk (bukan saat isinya salah), galatnya berbunyi
    // "Cannot read properties of undefined" — yang tak menyebutkan apa pun
    // tentang IPC, dan mengirim pembacanya menelusuri arah yang keliru.
    expect(rows.length,
      'jejak audit invoice DP tak ditemukan — tanpa itu, pertanyaan apakah ' +
      'angka IPC ikut tercatat tak bisa dijawab sama sekali').toBe(1)

    expect(rows[0].new_values.ipc_progres_pct,
      'invoice DP mencatat angka IPC — angka yang tak bermakna di sertifikat ' +
      'melatih pembacanya mengabaikan seluruh isinya').toBeUndefined()
  })
})

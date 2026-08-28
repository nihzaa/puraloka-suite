import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, wajibAda } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import procurementRoutes from '../procurement.js'

// ============================================================================
// PO TIDAK BOLEH TERKIRIM KE VENDOR TANPA LEWAT RANTAI APPROVAL
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TEST INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-14, saat hendak membangun automation 4.6:
//
//     entitas dengan rantai approval : 12  (kasbon, MR, change order, …)
//     purchase_order                 : TIDAK ADA
//     gerbang PO                     : satu `procurement:po:manage`
//     PO terbesar di basis dev       : Rp 40.200.000
//
// Siapa pun yang punya izin kelola PO bisa memindahkannya ke `sent` —
// terkirim ke vendor — tanpa satu pun persetujuan. Kasbon Rp 1 juta lewat
// rantai; PO Rp 40 juta tidak.
//
// Jalur itu tak pernah gagal, tak pernah melempar galat, tak pernah menulis
// apa pun ke log. Ia cuma tak pernah bertanya. Ketahuan karena automation 4.6
// MENUNTUT adanya jalur lambat untuk dipercepat, dan ternyata tak ada.
//
// ── Yang dikunci di sini
//
//   1. Rute `→ sent` benar-benar MEMANGGIL engine (bukan sekadar tabelnya
//      terdaftar). Kalau `evaluateEntityApproval` tercabut saat refactor,
//      test ini merah — sementara test procurement lama tetap hijau.
//
//   2. Transisi LAIN (`confirmed`, `cancelled`) TIDAK ikut tergerbang. Itu
//      mencatat apa yang sudah terjadi di dunia nyata; menahannya di belakang
//      approval berarti basis menolak mencatat kenyataan.
//
//   3. Klaim atomik: dua pengiriman bersamaan tak boleh dua-duanya berhasil.
//      PO terkirim dua kali ke vendor bukan cacat data — itu dua pesanan.
//
// Berjalan terhadap dev `public` (bukan schema `test`) karena handler memakai
// klien service_role, dan `approval_chains` hanya hidup di sana — sama seperti
// `approval-chain-berjenjang.test.ts`.
// ============================================================================

const TANDA = '[TEST-POA]'

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
/** Pembuat PO — WAJIB orang lain, lihat R-022 di bawah. */
let pembuatUserId: string
let projectId: string
let supplierId: string
let poId: string

const actAsAdmin = () => {
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: adminAuth } }, error: null } as never)
}

const setStatus = (id: string, status: string) =>
  app.inject({
    method: 'PATCH', url: `/api/v1/procurement/purchase-orders/${id}/status`,
    payload: { status } as never, headers: { authorization: 'Bearer t' },
  })

/** Buat PO baru berstatus draft. Dipakai per-test supaya tak saling menodai. */
async function buatPo(nominal: number): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO purchase_orders (po_number, project_id, supplier_id, status,
                                  total_amount, order_date, created_by)
     VALUES ($1, $2, $3, 'draft', $4, CURRENT_DATE, $5) RETURNING id`,
    [`${TANDA}-${Date.now()}-${Math.floor(nominal)}`, projectId, supplierId, nominal, pembuatUserId],
  )
  return rows[0].id as string
}

async function bersihkan(): Promise<void> {
  // Jejak approval dibersihkan LEBIH DULU — ia menunjuk PO lewat entity_id,
  // dan yang tertinggal membuat test berikutnya membaca "sudah disetujui".
  await client.query(
    `DELETE FROM approval_progress
      WHERE entity_type = 'purchase_order'
        AND entity_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`,
    [`${TANDA}%`],
  )
  await client.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, [`${TANDA}%`])
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = wajibAda(await authIdForRole(client, 'admin'), "pengguna ber-role 'admin' dengan auth_id")

  const { rows: u } = await client.query('SELECT id FROM users WHERE auth_id = $1', [adminAuth])
  adminUserId = wajibAda(u[0]?.id, 'baris users untuk admin')

  /*
    R-022 (founder, 2026-08-29) — pembuat PO tak boleh mengirimkannya sendiri.

    Sebelum aturan itu, fixture ini membuat PO ber-`created_by = adminUserId`
    lalu MENGIRIMNYA sebagai admin yang sama. Begitu SoD dipasang, tiga test
    di berkas ini merah dengan "Anda tidak bisa menyetujui pengajuan Anda
    sendiri" — bukan karena gerbangnya salah, melainkan karena fixture-nya
    memang memerankan pelanggaran.

    Jadi PO dibuat atas nama ORANG LAIN di perusahaan yang sama. Kalau tak ada
    orang kedua, test BERHENTI dengan sebabnya — bukan lulus diam-diam atas
    skenario yang tak lagi menguji apa pun.
  */

  /*
    Proyek & supplier dipilih menurut SYARAT, bukan `LIMIT 1` atas urutan yang
    kebetulan — pelajaran migrasi 328, dan cacat yang memakan waktu hari ini
    juga (`audit-mutu` mencari NCR di proyek yang tak punya).
  */
  const { rows: p } = await client.query(
    `SELECT p.id FROM projects p
      WHERE p.company_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM company_members m
                     WHERE m.user_id = $1 AND m.company_id = p.company_id AND m.is_active)
      ORDER BY p.created_at LIMIT 1`,
    [adminUserId],
  )
  projectId = wajibAda(p[0]?.id, 'proyek milik company si admin')

  const { rows: s } = await client.query(`SELECT id FROM suppliers LIMIT 1`)
  supplierId = wajibAda(s[0]?.id, 'supplier mana pun')

  // Orang KEDUA di perusahaan yang sama — lihat R-022 di atas.
  const { rows: lain } = await client.query(
    `SELECT u.id FROM users u
       JOIN company_members m ON m.user_id = u.id AND m.is_active
      WHERE m.company_id = (SELECT company_id FROM projects WHERE id = $1)
        AND u.id <> $2
      ORDER BY u.id LIMIT 1`,
    [projectId, adminUserId],
  )
  pembuatUserId = wajibAda(
    lain[0]?.id,
    'pengguna KEDUA di company yang sama (R-022: pembuat PO tak boleh pengirimnya)',
  )

  /*
    Prasyarat yang menentukan sahih-tidaknya seluruh berkas ini: rantai
    `purchase_order` harus BENAR-BENAR ADA (migrasi 381). Tanpa itu
    `loadSteps` fail-closed dan SEMUA test di bawah merah karena 403 —
    merah yang menunjuk ke tempat yang salah.
  */
  const { rows: ch } = await client.query(
    `SELECT count(*)::int n FROM approval_chains WHERE entity_type = 'purchase_order' AND is_active`)
  if (ch[0].n === 0) {
    throw new Error(
      'prasyarat gagal: nol rantai approval `purchase_order` aktif. '
      + 'Jalankan migrasi 381 lebih dulu — tanpa rantai, engine fail-closed '
      + 'dan menolak SEMUA pengiriman PO dengan 403.',
    )
  }

  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(procurementRoutes as never)
  await app.ready()

  await bersihkan()
}, 120_000)

afterEach(() => { vi.restoreAllMocks() })

afterAll(async () => {
  await bersihkan().catch(() => { /* pembersihan best-effort */ })
  await app?.close()
  await client?.end()
})

describe('Gerbang approval pada pengiriman PO ke vendor', () => {
  it('prasyarat: rantai purchase_order terpasang dan LONGGAR (seed 381)', async () => {
    const { rows } = await client.query(
      `SELECT st.min_amount, st.max_amount, st.required_permission
         FROM approval_chains ch JOIN approval_steps st ON st.chain_id = ch.id
        WHERE ch.entity_type = 'purchase_order'`)
    expect(rows.length, 'rantai purchase_order tanpa langkah — engine akan fail-closed')
      .toBeGreaterThan(0)

    // Seed WAJIB longgar: memilih ambang nominal adalah kebijakan tenant lewat
    // UI, bukan keputusan migrasi. Kalau ini merah, ada yang menyelundupkan
    // kebijakan lewat kode.
    for (const r of rows) {
      expect(r.min_amount, 'seed memasang ambang nominal — itu keputusan tenant, bukan migrasi').toBeNull()
      expect(r.max_amount, 'seed memasang ambang nominal — itu keputusan tenant, bukan migrasi').toBeNull()
    }
  }, 60_000)

  it('PO draft → sent BERHASIL dengan rantai longgar (perilaku lama tak berubah)', async () => {
    actAsAdmin()
    poId = await buatPo(5_000_000)
    const r = await setStatus(poId, 'sent')

    // Inti seed longgar: siapa yang tadinya bisa mengirim PO, tetap bisa.
    // Kalau ini merah, migrasi 381 mengubah kebijakan diam-diam.
    expect(r.statusCode, `pengiriman PO tertahan padahal rantainya longgar. Body: ${r.body}`).toBe(200)

    const { rows } = await client.query(`SELECT status, sent_at FROM purchase_orders WHERE id = $1`, [poId])
    expect(rows[0].status).toBe('sent')
    expect(rows[0].sent_at, '`sent_at` tak terisi — jejak kapan PO dikirim hilang').not.toBeNull()
  }, 60_000)

  /*
    R-022 (founder, 2026-08-29) — inti keputusannya, dan test yang membedakan
    "aturannya terdaftar di tabel" dari "gerbangnya benar-benar menahan".

    Sebelum ini PO adalah SATU-SATUNYA dari 13 jenis approval tanpa SoD: staf
    yang membuat PO bisa langsung mengirimkannya sendiri ke vendor, nominal
    berapa pun — sementara kasbon Rp 1 juta lewat rantai.
  */
  it('R-022: PEMBUAT PO tak bisa mengirimkannya sendiri ke vendor', async () => {
    // PO dibuat atas nama si ADMIN — lalu admin yang sama mencoba mengirim.
    const { rows } = await client.query(
      `INSERT INTO purchase_orders (po_number, project_id, supplier_id, status,
                                    total_amount, order_date, created_by)
       VALUES ($1, $2, $3, 'draft', $4, CURRENT_DATE, $5) RETURNING id`,
      [`${TANDA}-SENDIRI-${Date.now()}`, projectId, supplierId, 9_000_000, adminUserId],
    )
    const poSendiri = rows[0].id as string

    actAsAdmin()
    const r = await setStatus(poSendiri, 'sent')

    expect(
      r.statusCode,
      'pembuat PO berhasil mengirimkannya SENDIRI ke vendor — SoD tak menahan. '
      + `Body: ${r.body}`,
    ).toBe(403)
    expect(r.body, 'pesannya tak menyebut sebabnya, jadi stafnya menebak').toMatch(/sendiri/i)

    // Dan yang paling penting: PO-nya BENAR-BENAR tak terkirim.
    const { rows: cek } = await client.query(
      `SELECT status, sent_at FROM purchase_orders WHERE id = $1`, [poSendiri])
    expect(cek[0].status, 'status berubah padahal permintaannya ditolak').toBe('draft')
    expect(cek[0].sent_at, 'sent_at terisi padahal PO tak pernah dikirim').toBeNull()
  }, 60_000)

  it('WIRING: rute benar-benar memanggil engine — jejak persetujuan tercatat', async () => {
    /*
      Ini yang membedakan "tabel terdaftar" dari "gerbang bekerja".

      Tanpa test ini, `evaluateEntityApproval` bisa tercabut saat refactor —
      bersama import yang "tak terpakai" — dan PO kembali terkirim tanpa
      approval sementara seluruh test procurement lain tetap hijau. Kelas
      cacat yang sudah berulang di repo ini: logika benar, wiring putus.
    */
    const { rows } = await client.query(
      `SELECT count(*)::int n FROM approval_progress
        WHERE entity_type = 'purchase_order' AND entity_id = $1`, [poId])
    expect(rows[0].n,
      'nol jejak persetujuan untuk PO yang baru dikirim — rutenya TIDAK memanggil '
      + 'engine approval, jadi gerbangnya cuma ada di tabel')
      .toBeGreaterThan(0)
  }, 60_000)

  it('transisi LAIN tidak ikut tergerbang — confirmed mencatat kenyataan', async () => {
    /*
      `confirmed` dan `cancelled` mencatat apa yang SUDAH terjadi di dunia
      nyata. Menahannya di belakang approval berarti basis menolak mencatat
      kenyataan — dan data yang menolak kenyataan lebih berbahaya daripada
      data yang longgar.
    */
    actAsAdmin()
    const r = await setStatus(poId, 'confirmed')
    expect(r.statusCode, `transisi 'confirmed' ikut tergerbang. Body: ${r.body}`).toBe(200)
  }, 60_000)

  it('DUA pengiriman BERSAMAAN: PO tak terkirim dua kali ke vendor', async () => {
    actAsAdmin()
    const id = await buatPo(7_500_000)

    const [a, b] = await Promise.all([setStatus(id, 'sent'), setStatus(id, 'sent')])
    const kode = [a.statusCode, b.statusCode].sort()

    /*
      Yang dijamin: tak pernah dua-duanya berhasil. PO terkirim dua kali bukan
      cacat data — itu DUA PESANAN ke vendor yang sama.

      Tidak menuntut `[200, 409]` mati-matian: kalau keduanya terserialisasi,
      yang kedua membaca status `sent` dan gagal klaim atomiknya — tetap 409,
      tetapi bentuk lombanya tak dijamin terjadi. Pelajaran dari tiga test
      konkurensi yang diperbaiki hari ini juga.
    */
    expect(kode.filter(k => k === 200).length,
      `dua pengiriman sama-sama berhasil — PO terkirim DUA KALI ke vendor. ${a.body} | ${b.body}`)
      .toBe(1)

    const { rows } = await client.query(`SELECT status FROM purchase_orders WHERE id = $1`, [id])
    expect(rows[0].status).toBe('sent')
  }, 60_000)
})

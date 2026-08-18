/**
 * E1 — Surat Perintah Kerja, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan aturannya benar; ia hijau meski rutenya tak terdaftar.
 *
 *   • cache `work_scopes.contract_status` benar-benar tersinkron — lima kolom
 *     kontrak yang sejak 2024 tak pernah terisi
 *   • SPK bertanda tangan penuh TAK BISA diubah nilainya
 *   • pembatalan mengembalikan cache, TAPI tak menghapus status kontrak
 *     induknya bila ada SPK lain yang masih berlaku
 *   • peringatan SPK ganda muncul tanpa MENOLAK (addendum sah)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import spkRoutes from '../spk.js'
import { teksPdf } from '../../../test-utils/teks-pdf.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let companyId: string
let scopeId: string
let statusScopeAsli: string | null = null
/** Tender milik company LAIN — dibuat di sini, bukan diharapkan ada. */
let tenderAsing: string | null = null
const dibuat: string[] = []

const TANDA = '[TEST-SPK]'

const buat = (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: '/api/v1/spk',
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const ubah = (id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH', url: `/api/v1/spk/${id}/status`,
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const isiSah = (o: Record<string, unknown> = {}) => ({
  work_scope_id: scopeId,
  tanggal_terbit: '2026-08-01',
  lingkup_kerja: `${TANDA} Pekerjaan struktur`,
  nilai_kontrak: 50_000_000,
  tanggal_mulai: '2026-09-01',
  tanggal_selesai: '2026-11-30',
  ...o,
})

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: adminAuth } }, error: null } as never)

  // Company dipilih yang BENAR-BENAR punya work_scope.
  //
  // Versi sebelumnya memakai `company_members ... LIMIT 1` tanpa ORDER BY,
  // menyerahkan pilihannya ke Postgres. Akun uji anggota TIGA company, dan
  // begitu yang terpilih adalah yang tanpa lingkup kerja, SELURUH berkas ini
  // mati di setup dengan pesan "tak ada work_scope untuk diuji" — pesan yang
  // menuduh SEED, padahal seednya baik.
  //
  // `companyBerisi` tak bisa dipakai apa adanya di sini: ia memeriksa kolom
  // `company_id`, sedangkan `work_scopes` baru sampai ke company lewat
  // mandor_assignments → projects. Jadi dipilih dengan JOIN-nya sendiri.
  const { rows: ws } = await db.query(
    `SELECT ws.id, ws.contract_status, p.company_id
       FROM work_scopes ws
       JOIN mandor_assignments ma ON ma.id = ws.assignment_id
       JOIN projects p ON p.id = ma.project_id
       JOIN company_members cm ON cm.company_id = p.company_id
       JOIN users u ON u.id = cm.user_id
      WHERE u.auth_id = $1
      ORDER BY ws.created_at, ws.id
      LIMIT 1`, [adminAuth])
  if (!ws.length) {
    throw new Error('akun uji tak punya SATU pun work_scope di company mana pun — '
      + 'periksa keanggotaan/seed, bukan berkas ini')
  }
  companyId = ws[0].company_id
  scopeId = ws[0].id
  // Status asli DISIMPAN — test ini mengubahnya lewat trigger, dan data
  // nyata tak boleh tertinggal dalam keadaan yang bukan miliknya.
  statusScopeAsli = ws[0].contract_status

  // ── Tender milik company LAIN ─────────────────────────────────────────
  //
  // UUID acak TIDAK cukup menguji saringan tenant: id yang tak ada di tabel
  // mana pun membuat `maybeSingle()` mengembalikan null dengan atau tanpa
  // saringan, jadi testnya tetap hijau saat saringannya dibuang. Terbukti
  // lewat mutasi — versi pertama test ini LOLOS.
  //
  // Jadi tendernya harus benar-benar ADA, dan benar-benar milik orang lain.
  const { rows: pAsing } = await db.query(
    `SELECT p.id FROM projects p WHERE p.company_id <> $1 LIMIT 1`, [companyId])
  if (pAsing.length) {
    const { rows: t } = await db.query(
      `INSERT INTO tender_subkon (project_id, nomor, judul, status)
       VALUES ($1, $2, $3, 'selesai') RETURNING id`,
      [pAsing[0].id, `TND-ASING-${Date.now()}`, `${TANDA} tender tenant lain`])
    tenderAsing = t[0].id
  }

  app = Fastify({ logger: false })
  await app.register(spkRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  // Addendum dihapus LEBIH DULU. `spk_addendum.spk_id` ber-ON DELETE
  // RESTRICT dengan sengaja (migrasi 454): SPK yang punya addendum tak boleh
  // lenyap dan meninggalkan addendum yatim yang menunjuk kertas yang tak ada.
  //
  // Konsekuensinya urutan pembersihan test JUGA harus menghormatinya —
  // versi pertama berkas ini menghapus SPK lebih dulu dan seluruh suite mati
  // di `afterAll` dengan galat FK yang tak menyebut test mana penyebabnya.
  await db.query(
    `DELETE FROM spk_addendum WHERE spk_id IN (
       SELECT id FROM surat_perintah_kerja WHERE lingkup_kerja LIKE '${TANDA}%')`)
  for (const id of dibuat) {
    await db.query('DELETE FROM spk_addendum WHERE spk_id = $1', [id])
    await db.query('DELETE FROM surat_perintah_kerja WHERE id = $1', [id])
  }
  await db.query(`DELETE FROM surat_perintah_kerja WHERE lingkup_kerja LIKE '${TANDA}%'`)
  // Pulihkan cache yang tersentuh trigger.
  if (statusScopeAsli !== null) {
    await db.query('UPDATE work_scopes SET contract_status = $2 WHERE id = $1',
      [scopeId, statusScopeAsli])
  }
  if (tenderAsing) {
    await db.query('DELETE FROM tender_subkon WHERE id = $1', [tenderAsing])
  }
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('validasi masukan', () => {
  it('menolak tanggal selesai yang mendahului mulai', async () => {
    const r = await buat(isiSah({ tanggal_mulai: '2026-11-30', tanggal_selesai: '2026-09-01' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/mendahului/i)
  })

  it('menolak nilai kontrak nol', async () => {
    const r = await buat(isiSah({ nilai_kontrak: 0 }))
    expect(r.statusCode).toBe(400)
  })

  it('menolak lingkup kerja milik tenant lain', async () => {
    const r = await buat(isiSah({ work_scope_id: '00000000-0000-0000-0000-0000000000ff' }))
    expect(r.statusCode).toBe(404)
  })

  // ── Asal-usul tender: diverifikasi, bukan diterima ────────────────────
  //
  // `tender_id`/`penawaran_id` hanya DITAMPILKAN, tak dipakai menghitung —
  // jadi id milik tenant lain tersimpan tanpa satu pun galat, dan jejak
  // asal-usul yang menunjuk dokumen orang lain terlihat seperti bukti.
  it('menolak tender milik tenant lain', async () => {
    // Tender NYATA milik company lain — bukan UUID acak. Bedanya menentukan:
    // dengan UUID acak, membuang saringan `project_id` tak membuat test ini
    // merah sama sekali.
    if (!tenderAsing) throw new Error('fixture tender asing tak terbentuk')
    const r = await buat(isiSah({ tender_id: tenderAsing }))
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/tender tidak ditemukan/i)
  })

  it('menolak penawaran_id tanpa tender_id', async () => {
    // Penawaran yang tak diketahui tendernya tak bisa ditelusuri ke tenant
    // mana pun — menerimanya berarti menyimpan rujukan yang tak terverifikasi.
    const r = await buat(isiSah({ penawaran_id: '00000000-0000-0000-0000-0000000000ff' }))
    expect(r.statusCode, r.body).toBe(400)
    expect(r.json().error).toMatch(/tanpa tender_id/i)
  })

  it('menolak batas denda tanpa tarif harian', async () => {
    const r = await buat(isiSah({ denda_maks_pct: 5 }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak ada yang bisa dihitung/i)
  })
})

describe('menerbitkan SPK', () => {
  it('membuat dengan nomor urut, status draf', async () => {
    const r = await buat(isiSah({ denda_per_hari: 500_000, denda_maks_pct: 5 }))
    expect(r.statusCode, r.body).toBe(201)
    const j = r.json()
    expect(j.spk.nomor).toMatch(/^SPK-2026-\d{4}$/)
    expect(j.spk.status).toBe('draf')
    dibuat.push(j.spk.id)
  })

  it('draf TIDAK menyentuh cache work_scopes', async () => {
    // Trigger hanya bekerja pada `ditandatangani`/`dibatalkan`. Draf yang
    // mengubah status kontrak akan membuat lingkup kerja terlihat berkontrak
    // padahal belum ada yang menandatangani apa pun.
    const { rows } = await db.query(
      'SELECT contract_status FROM work_scopes WHERE id = $1', [scopeId])
    expect(rows[0].contract_status).toBe(statusScopeAsli)
  })
})

describe('alur status', () => {
  it('draf → ditandatangani DITOLAK (harus terbit dulu)', async () => {
    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/diterbitkan lebih dulu/i)
  })

  it('draf → diterbitkan berhasil', async () => {
    const r = await ubah(dibuat[0], { status: 'diterbitkan' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().spk.status).toBe('diterbitkan')
  })

  it('tanpa tanda tangan, ditandatangani ditolak dengan menyebut yang kurang', async () => {
    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/kedua tanda tangan/i)
  })

  it('satu tanda tangan saja masih ditolak', async () => {
    const t = await ubah(dibuat[0], { ttd_url: 'penerbit.png', pihak: 'penerbit' })
    expect(t.statusCode, t.body).toBe(200)

    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    // SPK bertanda tangan satu pihak adalah pemberitahuan, bukan kesepakatan.
    expect(r.json().error).toMatch(/tanda tangan pelaksana/i)
  })

  it('dua tanda tangan → ditandatangani, dan cache work_scopes TERSINKRON', async () => {
    await ubah(dibuat[0], { ttd_url: 'pelaksana.png', pihak: 'pelaksana' })
    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode, r.body).toBe(200)

    // INI yang ditutup: lima kolom kontrak yang sejak 2024 tak pernah terisi.
    const { rows } = await db.query(
      `SELECT contract_status, contract_signed_at, pm_signature_url, mandor_signature_url
         FROM work_scopes WHERE id = $1`, [scopeId])
    expect(rows[0].contract_status).toBe('signed')
    expect(rows[0].contract_signed_at).not.toBeNull()
    expect(rows[0].pm_signature_url).toBe('penerbit.png')
    expect(rows[0].mandor_signature_url).toBe('pelaksana.png')
  })
})

describe('kunci sesudah ditandatangani', () => {
  it('nilai kontrak TAK BISA diubah', async () => {
    await expect(
      db.query('UPDATE surat_perintah_kerja SET nilai_kontrak = 999 WHERE id = $1', [dibuat[0]]),
    ).rejects.toThrow(/tak bisa diubah/i)
  })

  it('lingkup kerja TAK BISA diubah', async () => {
    await expect(
      db.query(`UPDATE surat_perintah_kerja SET lingkup_kerja = 'x' WHERE id = $1`, [dibuat[0]]),
    ).rejects.toThrow(/tak bisa diubah/i)
  })

  it('tanda tangan TAK BISA dibubuhkan lagi sesudah ditandatangani penuh', async () => {
    // Tanpa `.in('status', ['draf','diterbitkan'])` di rutenya, tanda tangan
    // pelaksana bisa ditimpa sesudah SPK mengikat — dan yang tercatat sebagai
    // penerima perintah berubah tanpa siapa pun menyetujuinya.
    //
    // Mutasi yang mencabut klausa itu LOLOS sebelum test ini ada: seluruh
    // test lain membubuhkan ttd saat statusnya masih `diterbitkan`.
    const r = await ubah(dibuat[0], { ttd_url: 'orang-lain.png', pihak: 'pelaksana' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/draf atau yang sudah diterbitkan/i)

    // Dan tanda tangan aslinya utuh.
    const { rows } = await db.query(
      'SELECT ttd_pelaksana_url FROM surat_perintah_kerja WHERE id = $1', [dibuat[0]])
    expect(rows[0].ttd_pelaksana_url).toBe('pelaksana.png')
  })

  it('syarat khusus MASIH boleh diubah — bukan bagian yang mengikat nilai', async () => {
    // Kunci dibatasi pada nilai, lingkup, jangka waktu, dan denda. Mengunci
    // seluruh baris akan menghalangi hal yang tak mengubah kesepakatan (mis.
    // melampirkan PDF hasil pindai).
    const r = await db.query(
      `UPDATE surat_perintah_kerja SET pdf_url = 'scan.pdf' WHERE id = $1 RETURNING id`,
      [dibuat[0]])
    expect(r.rowCount).toBe(1)
  })
})

describe('SPK ganda & pembatalan', () => {
  it('SPK kedua DIPERINGATKAN, bukan ditolak — addendum sah', async () => {
    const r = await buat(isiSah({ lingkup_kerja: `${TANDA} Addendum tambah kolom` }))
    expect(r.statusCode).toBe(201)
    expect(r.json().peringatan).toMatch(/sudah punya SPK aktif/i)
    dibuat.push(r.json().spk.id)
  })

  it('pembatalan wajib beralasan', async () => {
    const r = await ubah(dibuat[1], { status: 'dibatalkan' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/wajib beralasan/i)
  })

  it('membatalkan yang KEDUA tak menghapus status kontrak induknya', async () => {
    // Tanpa syarat "tak ada SPK lain yang berlaku" di trigger, membatalkan
    // addendum akan mengembalikan `contract_status` jadi `unsigned` —
    // menghapus jejak kontrak induk yang masih sah.
    const r = await ubah(dibuat[1], { status: 'dibatalkan', alasan: 'salah lingkup' })
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      'SELECT contract_status FROM work_scopes WHERE id = $1', [scopeId])
    expect(rows[0].contract_status).toBe('signed')
  })

  it('yang sudah dibatalkan tak bisa diubah lagi', async () => {
    const r = await ubah(dibuat[1], { status: 'diterbitkan' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah dibatalkan/i)
  })
})

describe('denda dihitung saat baca', () => {
  it('SPK terlambat menampilkan denda beserta batasnya', async () => {
    // Disimpan, denda jadi basi diam-diam: keterlambatan bertambah tiap hari
    // dan tak ada yang menjalankan ulang perhitungannya.
    const { rows: p } = await db.query(
      `SELECT project_id FROM work_scopes ws
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
        WHERE ws.id = $1`, [scopeId])

    const { rows: ins } = await db.query(
      `INSERT INTO surat_perintah_kerja
         (company_id, project_id, work_scope_id, nomor, tanggal_terbit, lingkup_kerja,
          nilai_kontrak, tanggal_mulai, tanggal_selesai, denda_per_hari, denda_maks_pct,
          diterbitkan_oleh, status, ttd_penerbit_url, ttd_pelaksana_url)
       VALUES ($1, $2, $3, $4, '2025-01-01', $5, 100000000, '2025-01-01', '2025-02-01',
               1000000, 5, (SELECT id FROM users WHERE auth_id = $6),
               'ditandatangani', 'a.png', 'b.png')
       RETURNING id`,
      [companyId, p[0].project_id, scopeId, `${TANDA}-LAMBAT`, `${TANDA} terlambat`, adminAuth])
    dibuat.push(ins[0].id)

    const r = await app.inject({
      method: 'GET', url: `/api/v1/spk?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)
    const lambat = (r.json().spk as Array<Record<string, unknown>>)
      .find((s) => String(s.nomor).includes('LAMBAT'))
    expect(lambat).toBeTruthy()

    const d = lambat!.denda as Record<string, number | boolean>
    expect(d.hariTerlambat).toBeGreaterThan(300)
    // Batas 5% dari 100 jt = 5 jt, jauh di bawah denda kotornya.
    expect(d.dendaTerbatas).toBe(5_000_000)
    expect(d.terkenaBatas).toBe(true)
  })
})

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MENCETAK SPK — apa yang ADA DI KERTAS, bukan apa yang ada di basis
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-17: seluruh rantai SPK sudah ada — tabel, rute, layar, test,
 * bahkan kolom `pdf_url`. Yang tak ada: dokumennya. `pdf_url` tersimpan tapi
 * tak satu baris pun pernah mengisinya.
 *
 * Selama SPK cuma baris di basis, yang diserahkan ke subkontraktor tetap
 * kertas yang diketik di Word — dan begitu itu terjadi, angka di layar dan
 * angka di kertas berhenti dijamin sama.
 *
 * Yang diperiksa di sini ISI PDF-nya. Status 200 tetap keluar meski nilainya
 * tak pernah digambar.
 */
describe('mencetak SPK', () => {
  const cetak = (id: string) => app.inject({
    method: 'GET', url: `/api/v1/spk/${id}.pdf`, headers: { authorization: 'Bearer t' },
  })

  it('terbit sebagai PDF ber-nama berkas', async () => {
    const r = await cetak(dibuat[0])
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
    expect(r.headers['content-type']).toContain('application/pdf')
    expect(String(r.headers['content-disposition'])).toContain('SPK-')
  })

  it('nilai kontrak tercetak sebagai ANGKA dan HURUF', async () => {
    // Nominal berangka bisa bergeser satu digit tanpa terlihat; huruf tidak.
    // Itu sebabnya surat resmi memuat keduanya — dan kenapa yang dipegang
    // saat keduanya berbeda adalah hurufnya.
    const r = await cetak(dibuat[0])
    const isi = teksPdf(r.rawPayload)
    const { rows } = await db.query(
      'SELECT nilai_kontrak FROM surat_perintah_kerja WHERE id = $1', [dibuat[0]])
    const n = Number(rows[0].nilai_kontrak)
    expect(n).toBeGreaterThan(0)

    // Frasa PENDEK: teks PDF dirakit ulang dari pecahan operator TJ, dan
    // kalimat panjang bisa terpotong di tengah kata.
    expect(isi, 'kata "Terbilang" tak tercetak — nilai hanya berangka').toContain('Terbilang')
    expect(isi, 'nilai berangka tak tercetak').toContain('NILAI PEKERJAAN')
  })

  it('denda yang TIDAK diperjanjikan tercetak sebagai kalimat, bukan kolom hilang', async () => {
    // Kolom denda yang hilang terbaca seperti kelalaian penyusun, dan pihak
    // yang dirugikan belakangan akan memperdebatkan apakah dendanya memang
    // tak disepakati.
    const r0 = await buat(isiSah({ denda_per_hari: null, denda_maks_pct: null }))
    expect(r0.statusCode, r0.body).toBe(201)
    const tanpaDenda = r0.json().spk.id as string
    dibuat.push(tanpaDenda)

    const isi = teksPdf((await cetak(tanpaDenda)).rawPayload)
    expect(isi).toContain('DENDA KETERLAMBATAN')
    expect(isi, 'denda kosong dilewati diam-diam').toContain('Tidak diperjanjikan')
  })

  it('DRAF bertanda di kepala dan TANPA blok tanda tangan', async () => {
    // Kolom tanda tangan di atas kertas adalah undangan untuk
    // menandatanganinya. Draf yang menyediakannya akan ditandatangani
    // sebelum diterbitkan — dan kertas draf yang tak bisa dibedakan dari
    // kertas final adalah kertas yang ditandatangani orang tanpa sadar.
    const r0 = await buat(isiSah({ denda_per_hari: 100_000 }))
    expect(r0.statusCode, r0.body).toBe(201)
    const draf = r0.json().spk.id as string
    dibuat.push(draf)

    const isi = teksPdf((await cetak(draf)).rawPayload)
    expect(isi, 'draf tak bertanda — tak bisa dibedakan dari dokumen final').toContain('DRAF')
    expect(isi, 'draf menyediakan blok tanda tangan').not.toContain('Pelaksana Pekerjaan,')
  })

  it('yang SUDAH diterbitkan mendapat blok tanda tangan', async () => {
    // Kebalikan test di atas — tanpa ini, "draf tak punya tanda tangan"
    // tetap hijau meski TAK ADA dokumen yang pernah punya.
    const { rows } = await db.query(
      `SELECT id FROM surat_perintah_kerja
        WHERE id = ANY($1) AND status IN ('diterbitkan','ditandatangani') LIMIT 1`,
      [dibuat])
    if (!rows.length) return
    const isi = teksPdf((await cetak(rows[0].id)).rawPayload)
    expect(isi).toContain('Pelaksana Pekerjaan,')
    expect(isi).not.toContain('DRAF')
  })

  it('SPK tenant LAIN tidak bisa dicetak', async () => {
    // UUID acak tak cukup: id yang tak ada di tabel mana pun memulangkan 404
    // dengan ATAU tanpa saringan tenant, jadi testnya tetap hijau saat
    // saringannya dibuang. Barisnya harus benar-benar ADA, milik orang lain.
    // ── Lingkup kerja asing DIBUAT, bukan diharapkan ada ───────────────
    //
    // Versi pertama test ini MENCARI work_scope milik company lain lalu
    // `return` diam-diam kalau tak ketemu. Diukur: hanya SATU company yang
    // punya work_scope sama sekali — jadi test ini tak pernah menjalankan
    // assertion-nya, dan tetap hijau saat saringan tenant dicopot.
    // Terbukti lewat mutasi: 55 passed dengan `.eq(company_id)` dibuang.
    //
    // Test yang melewati dirinya sendiri lebih buruk daripada test yang
    // tak ada: yang kedua terlihat sebagai lubang, yang pertama terlihat
    // sebagai penjagaan.
    const { rows: pAsing } = await db.query(
      'SELECT id, company_id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!pAsing.length) throw new Error('basis uji tak punya company kedua — saringan tenant mustahil diuji')

    // Rantainya dibangun utuh: assignment → work_scope → SPK, semuanya
    // milik company asing.
    const { rows: mandorAsing } = await db.query(
      `SELECT id FROM users WHERE id IN (SELECT user_id FROM company_members
        WHERE company_id = $1) LIMIT 1`, [pAsing[0].company_id])
    if (!mandorAsing.length) throw new Error('company kedua tanpa anggota — rantai uji tak bisa dibangun')

    // Assignment DIPAKAI ULANG bila sudah ada: pasangan (project, mandor)
    // unik, dan memaksa yang baru hanya menabrak batasan tanpa menguji
    // apa pun. Yang dibuat sendiri dicatat supaya dibersihkan; yang
    // dipinjam TIDAK boleh ikut terhapus.
    const { rows: maAda } = await db.query(
      'SELECT id FROM mandor_assignments WHERE project_id = $1 LIMIT 1', [pAsing[0].id])
    let maBuatan: string | null = null
    let maId: string
    if (maAda.length) {
      maId = maAda[0].id
    } else {
      const { rows: maBaru } = await db.query(
        `INSERT INTO mandor_assignments (project_id, mandor_id, status, assigned_by)
         VALUES ($1, $2, 'active', $3) RETURNING id`,
        [pAsing[0].id, mandorAsing[0].id, mandorAsing[0].id])
      maId = maBaru[0].id
      maBuatan = maId
    }
    const { rows: wsAsing } = await db.query(
      `INSERT INTO work_scopes (assignment_id, scope_name, payment_system,
                                borongan_value, status)
       VALUES ($1, $2, 'borongan', 1000000, 'active') RETURNING id`,
      [maId, `${TANDA} scope tenant lain`])

    const { rows: ins } = await db.query(
      `INSERT INTO surat_perintah_kerja
         (company_id, project_id, work_scope_id, nomor, lingkup_kerja,
          nilai_kontrak, tanggal_terbit, tanggal_mulai, tanggal_selesai,
          status, diterbitkan_oleh)
       VALUES ($1, $2, $3, $4, $5, 1000000, CURRENT_DATE, CURRENT_DATE,
               CURRENT_DATE + 30, 'diterbitkan', $6) RETURNING id`,
      [pAsing[0].company_id, pAsing[0].id, wsAsing[0].id,
        `${TANDA}-ASING-${Date.now()}`, `${TANDA} milik tenant lain`, mandorAsing[0].id])

    try {
      const r = await cetak(ins[0].id)
      expect(r.statusCode, 'SPK tenant lain BISA dicetak — kebocoran dokumen').toBe(404)
    } finally {
      await db.query('DELETE FROM surat_perintah_kerja WHERE id = $1', [ins[0].id])
      await db.query('DELETE FROM work_scopes WHERE id = $1', [wsAsing[0].id])
      // Hanya yang DIBUAT di sini yang dihapus.
      if (maBuatan) await db.query('DELETE FROM mandor_assignments WHERE id = $1', [maBuatan])
    }
  })
})

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ADDENDUM — mengubah SPK yang sudah ditandatangani, secara sah
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SPK bertanda tangan terkunci, dan itu benar. Tapi lingkup di lapangan
 * MEMANG berubah — dan tanpa jalur addendum yang sah, orang menerbitkan SPK
 * KEDUA untuk lingkup yang sama (dua kertas yang sama-sama terlihat sah)
 * atau menyunting basis langsung.
 *
 * Yang dijaga blok ini: SPK induk TIDAK PERNAH berubah. Nilai efektif
 * dihitung, bukan disimpan — kolom tersimpan basi tiap kali addendum
 * ditambah, dan yang menemukan selisihnya adalah orang yang membayar
 * menurut angka lama.
 */
describe('addendum SPK', () => {
  let spkTtd: string | null = null

  const daftarAdd = (id: string) => app.inject({
    method: 'GET', url: `/api/v1/spk/${id}/addendum`, headers: { authorization: 'Bearer t' },
  })
  const buatAdd = (id: string, body: Record<string, unknown>) => app.inject({
    method: 'POST', url: `/api/v1/spk/${id}/addendum`,
    headers: { authorization: 'Bearer t' }, payload: body,
  })

  beforeAll(async () => {
    // `diterbitkan_oleh` FK ke `users.id`, BUKAN `auth_id` — kesalahan yang
    // sama pernah terjadi di uji kebocoran antar-tenant di berkas ini.
    const { rows: u } = await db.query(
      'SELECT id FROM users WHERE auth_id = $1', [adminAuth])
    const penerbitId = u[0]?.id ?? null
    if (!penerbitId) throw new Error('users.id untuk akun uji tak ditemukan')

    // SPK bertanda tangan dibuat LANGSUNG di basis: jalur endpoint menuntut
    // dua tanda tangan berurutan, dan yang diuji di sini addendumnya —
    // bukan alur tanda tangan yang sudah punya test sendiri di atas.
    const { rows } = await db.query(
      `INSERT INTO surat_perintah_kerja
         (company_id, project_id, work_scope_id, nomor, lingkup_kerja, nilai_kontrak,
          tanggal_terbit, tanggal_mulai, tanggal_selesai, status,
          ttd_penerbit_url, ttd_pelaksana_url, diterbitkan_oleh)
       SELECT $1, ma.project_id, $2, $3, $4, 100000000,
              CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 30, 'ditandatangani',
              'a.png', 'b.png', $5
         FROM work_scopes ws
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
        WHERE ws.id = $2
       RETURNING id`,
      [companyId, scopeId, `${TANDA}-ADD`, `${TANDA} induk addendum`, penerbitId])
    spkTtd = rows[0]?.id ?? null
    if (spkTtd) dibuat.push(spkTtd)
  })

  afterAll(async () => {
    if (spkTtd) await db.query('DELETE FROM spk_addendum WHERE spk_id = $1', [spkTtd])
  })

  it('alasan KOSONG ditolak — perubahan nilai kontrak tanpa alasan tak bisa dipertanggungjawabkan', async () => {
    const r = await buatAdd(spkTtd!, { alasan: '   ', nilai_delta: 5_000_000 })
    expect(r.statusCode).toBe(400)
    expect(String(r.json().error)).toMatch(/alasan wajib/i)
  })

  it('addendum yang tak mengubah APA PUN ditolak', async () => {
    const r = await buatAdd(spkTtd!, { alasan: 'Cuma catatan' })
    expect(r.statusCode).toBe(400)
    expect(String(r.json().error)).toMatch(/mengubah sesuatu/i)
  })

  it('delta POSITIF menaikkan nilai efektif — induk TIDAK berubah', async () => {
    const r = await buatAdd(spkTtd!, {
      alasan: 'Tambah pekerjaan plafon', nilai_delta: 15_000_000, hari_delta: 7,
    })
    expect(r.statusCode, r.body.slice(0, 250)).toBe(201)

    const d = (await daftarAdd(spkTtd!)).json()
    expect(d.efektif.nilai).toBe(115_000_000)
    expect(d.efektif.delta_hari).toBe(7)

    // Yang paling penting: INDUKNYA utuh. Kalau induk ikut berubah, kertas
    // yang ditandatangani dan kertas yang tersimpan berbeda bunyi.
    expect(d.spk.nilai_induk, 'nilai SPK induk ikut berubah').toBe(100_000_000)
    const { rows } = await db.query(
      'SELECT nilai_kontrak FROM surat_perintah_kerja WHERE id = $1', [spkTtd])
    expect(Number(rows[0].nilai_kontrak)).toBe(100_000_000)
  })

  it('delta NEGATIF sah — pekerjaan kurang itu nyata', async () => {
    const r = await buatAdd(spkTtd!, { alasan: 'Lingkup taman dicoret', nilai_delta: -10_000_000 })
    expect(r.statusCode, r.body.slice(0, 250)).toBe(201)

    const d = (await daftarAdd(spkTtd!)).json()
    expect(d.efektif.nilai).toBe(105_000_000)
    expect(d.efektif.jumlah_berlaku).toBe(2)
  })

  it('addendum yang MENGOSONGKAN nilai ditolak — itu pembatalan yang menyamar', async () => {
    // SPK bernilai nol bukan "SPK yang dikurangi habis" — ia SPK yang
    // seharusnya DIBATALKAN, dan keduanya berbeda di mata hukum.
    const r = await buatAdd(spkTtd!, { alasan: 'Dikurangi habis', nilai_delta: -200_000_000 })
    expect(r.statusCode).toBe(422)
    expect(String(r.json().error)).toMatch(/batalkan SPK/i)
  })

  it('urutan & nomornya menurunkan nomor SPK induk', async () => {
    const d = (await daftarAdd(spkTtd!)).json()
    const a = d.addendum as Array<{ urutan: number; nomor: string }>
    expect(a[0].urutan).toBe(1)
    expect(a[1].urutan).toBe(2)
    // "Addendum ke-2 dari SPK-…" adalah cara orang menyebutnya di lapangan.
    expect(a[1].nomor).toContain('/ADD-2')
  })

  it('SPK yang BELUM ditandatangani menolak addendum, dengan sebabnya', async () => {
    /*
      SPK draf DIBUAT sendiri, bukan dipungut dari `dibuat`.

      Versi pertama memungut "yang bukan spkTtd" — dan test alur status di
      atas sudah menandatangani sebagiannya, jadi yang terpungut ternyata
      SUDAH bertanda tangan dan addendumnya sah (201).

      Test yang bergantung pada keadaan yang diubah test LAIN akan lulus atau
      gagal menurut urutan jalannya, bukan menurut benar-salahnya kode.
    */
    const { rows } = await db.query(
      `INSERT INTO surat_perintah_kerja
         (company_id, project_id, work_scope_id, nomor, lingkup_kerja, nilai_kontrak,
          tanggal_terbit, tanggal_mulai, tanggal_selesai, status, diterbitkan_oleh)
       SELECT $1, ma.project_id, $2, $3, $4, 50000000,
              CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 30, 'draf', $5
         FROM work_scopes ws
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
        WHERE ws.id = $2
       RETURNING id`,
      [companyId, scopeId, `${TANDA}-DRAF-ADD`, `${TANDA} draf untuk uji addendum`,
        (await db.query('SELECT id FROM users WHERE auth_id = $1', [adminAuth])).rows[0].id])
    const draf = rows[0].id as string
    dibuat.push(draf)

    const r = await buatAdd(draf, { alasan: 'Coba', nilai_delta: 1_000_000 })
    expect(r.statusCode, r.body.slice(0, 250)).toBe(409)
    expect(String(r.json().error)).toMatch(/sudah ditandatangani/i)
  })

  it('yang DIBATALKAN tak ikut dihitung, tapi TETAP terlihat', async () => {
    // Addendum batal yang hilang dari daftar membuat orang bertanya-tanya
    // ke mana perginya nomor urut yang loncat.
    const d0 = (await daftarAdd(spkTtd!)).json()
    const target = (d0.addendum as Array<{ id: string; nilai_delta: string }>)
      .find((x) => Number(x.nilai_delta) < 0)
    expect(target, 'addendum negatif tak ditemukan untuk dibatalkan').toBeTruthy()

    const r = await app.inject({
      method: 'PATCH', url: `/api/v1/spk/addendum/${target!.id}/status`,
      headers: { authorization: 'Bearer t' }, payload: { status: 'dibatalkan' },
    })
    expect(r.statusCode, r.body.slice(0, 250)).toBe(200)

    const d = (await daftarAdd(spkTtd!)).json()
    // Nilainya kembali naik karena yang negatif tak lagi dihitung…
    expect(d.efektif.nilai).toBe(115_000_000)
    expect(d.efektif.jumlah_berlaku).toBe(1)
    // …tapi barisnya tetap ada di daftar.
    expect((d.addendum as unknown[]).length).toBe(2)
  })

  it('addendum SPK tenant LAIN tidak terbaca', async () => {
    const { rows: pAsing } = await db.query(
      'SELECT id, company_id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!pAsing.length) return
    const r = await daftarAdd(pAsing[0].id)
    // Id proyek bukan id SPK — yang penting ia TIDAK memulangkan 200 berisi.
    expect(r.statusCode).toBe(404)
  })
})

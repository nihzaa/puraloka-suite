/**
 * Kesiapan audit (9.9) · opname bersama menggantung (tanpa nomor).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. Yang diperiksa KELENGKAPAN JENIS, bukan jumlah berkas. Proyek dengan
 *      tiga puluh foto progres dan tanpa satu pun kontrak lebih tak siap
 *      diaudit daripada proyek dengan empat berkas yang tepat.
 *
 *   2. Berita acara TIDAK dituntut pada proyek yang belum rampung. Menuntutnya
 *      adalah menuntut bukti serah terima untuk pekerjaan yang belum
 *      diserahkan — dan daftar yang selalu penuh berhenti dibaca.
 *
 *   3. Opname `disengketakan` bertenggang NOL. Itu bukan keterlambatan proses
 *      melainkan ketidaksepakatan; yang dibutuhkan orang ketiga yang
 *      memutuskan, sejak hari sengketanya dicatat.
 *
 *   4. Opname `diverifikasi` tak pernah ditegur.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-AUOP'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let akhirAsli: string | null = null
let statusAsli = ''
let lingkupId: string
let olehId: string
let verifikatorId: string

const panggil = (rute: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${rute}${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tgl(mundur: number): string {
  const d = new Date()
  d.setDate(d.getDate() - mundur)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM documents WHERE title LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM opname_bersama WHERE nomor LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE company_id = $1
      AND type IN ('kesiapan_audit', 'opname_menggantung', 'opname_disengketakan')`,
    [companyId])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id

  /*
    Proyek uji harus memenuhi DUA syarat, dan keduanya ditemukan lewat
    kegagalan:

      punya lingkup kerja aktif   opname butuh `work_scope_id`; meminjam
                                  lingkup proyek lain membuat notifikasinya
                                  menunjuk proyek yang salah

      BELUM punya dokumen         penyemai `_seed-dokumen-opname.mjs` mengisi
                                  tiga proyek pertama sampai lengkap. Kalau
                                  test meminjam salah satunya, berkas yang
                                  disisipkan test tak mengubah apa pun dan
                                  test lulus/gagal karena isi seed, bukan
                                  karena kodenya.
  */
  const { rows: p } = await db.query(`
    SELECT ma.project_id, ws.id AS scope_id, pr.status, pr.end_date
      FROM work_scopes ws
      JOIN mandor_assignments ma ON ma.id = ws.assignment_id
      JOIN projects pr ON pr.id = ma.project_id
     WHERE pr.company_id = $1 AND ws.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.project_id = pr.id)
     LIMIT 1`, [companyId])
  if (!p[0]) throw new Error('tak ada proyek berlingkup aktif yang belum punya dokumen')
  proyek = p[0].project_id
  lingkupId = p[0].scope_id
  statusAsli = p[0].status
  akhirAsli = p[0].end_date

  // Dua pengguna: `opname_bersama_check2` melarang pemverifikasi = pengukur.
  const { rows: u } = await db.query(`
    SELECT u.id FROM users u
     WHERE u.is_active AND EXISTS (SELECT 1 FROM company_members m
        WHERE m.user_id = u.id AND m.company_id = $1) LIMIT 2`, [companyId])
  if (u.length < 2) throw new Error('butuh dua pengguna')
  olehId = u[0].id
  verifikatorId = u[1].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  // Status dan tanggal proyek dikembalikan persis seperti semula.
  await db.query(
    `UPDATE projects SET status = $1::project_status, end_date = $2 WHERE id = $3`,
    [statusAsli, akhirAsli, proyek])
  await app.close()
  await db.end()
})

async function buatDokumen(jenis: string) {
  await db.query(`
    INSERT INTO documents (project_id, title, doc_type, file_url, uploaded_by, uploaded_at)
    VALUES ($1,$2,$3::document_type,$4,$5,now())
  `, [proyek, `${TANDA} ${jenis}`, jenis, `https://uji.invalid/${jenis}.pdf`, olehId])
}

async function kurangnya(): Promise<string[] | null> {
  const { rows } = await db.query(
    `SELECT action_data FROM notifications
      WHERE type = 'kesiapan_audit' AND company_id = $1
        AND action_data->>'record_id' = $2 LIMIT 1`, [companyId, proyek])
  if (!rows[0]) return null
  return (rows[0].action_data as { kurang?: string[] }).kurang ?? []
}

/** Header ditulis `diajukan` dulu, item masuk, BARU statusnya dinaikkan. */
async function buatOpname(suffix: string, opsi: {
  status: string; mundur: number; alasan?: string
}) {
  const { rows: o } = await db.query(`
    INSERT INTO opname_bersama
      (company_id, project_id, work_scope_id, nomor, tanggal_opname,
       diukur_oleh, status, alasan_sengketa)
    VALUES ($1,$2,$3,$4,$5,$6,
            (CASE WHEN $7::text = 'diverifikasi' THEN 'diajukan' ELSE $7::text END)::opname_status,
            $8)
    RETURNING id`,
    [companyId, proyek, lingkupId, `${TANDA}-${suffix}`, tgl(opsi.mundur), olehId,
     opsi.status, opsi.alasan ?? null])

  await db.query(`
    INSERT INTO opname_bersama_item
      (opname_id, uraian, satuan, volume_rencana, volume_terukur, pct_selesai, urutan)
    VALUES ($1,$2,'m²',100,90,90,1)`, [o[0].id, `${TANDA} pengukuran`])

  if (opsi.status === 'diverifikasi') {
    await db.query(`
      UPDATE opname_bersama SET status = 'diverifikasi',
             diverifikasi_oleh = $2, diverifikasi_pada = now()
       WHERE id = $1`, [o[0].id, verifikatorId])
  }
  return o[0].id as string
}

async function ditegur(tipe: string, id: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, id])
  return (rows[0].n as number) > 0
}

describe('9.9 — kesiapan audit berkas proyek', () => {
  it('yang diperiksa KELENGKAPAN JENIS, bukan jumlah berkas', async () => {
    /*
      Lima berkas — semuanya foto progres. Proyek ini punya lebih banyak
      dokumen daripada proyek yang cuma punya satu kontrak, tetapi jauh lebih
      tak siap diaudit.

      Otomasi yang menghitung "punya dokumen atau tidak" akan meloloskannya.
    */
    await bersihkan()
    await db.query(`UPDATE projects SET status = 'active', end_date = $1 WHERE id = $2`,
      [tgl(-90), proyek])
    for (let i = 0; i < 5; i++) await buatDokumen('foto_progress')

    const r = await panggil('kesiapan-audit')
    expect(r.statusCode, r.body).toBe(200)

    const kurang = await kurangnya()
    expect(kurang, 'proyek berisi lima foto progres saja diloloskan').not.toBeNull()
    expect(kurang, 'jenis wajib yang hilang tak terdaftar lengkap')
      .toEqual(expect.arrayContaining(['kontrak', 'SPK', 'gambar kerja']))
  }, 120_000)

  it('berita acara TIDAK dituntut pada proyek yang belum rampung', async () => {
    /*
      Menuntutnya adalah menuntut bukti serah terima untuk pekerjaan yang
      belum diserahkan. Tiap proyek baru akan langsung "tidak siap audit", dan
      daftar yang selalu penuh berhenti dibaca.

      `end_date` disetel 90 hari ke DEPAN — jelas belum rampung.
    */
    await bersihkan()
    await db.query(`UPDATE projects SET status = 'active', end_date = $1 WHERE id = $2`,
      [tgl(-90), proyek])
    await buatDokumen('kontrak')
    await buatDokumen('spk')
    await buatDokumen('gambar_kerja')

    await panggil('kesiapan-audit')
    expect(await kurangnya(),
      'proyek yang belum rampung dituntut berita acara — bukti serah terima '
      + 'untuk pekerjaan yang belum diserahkan')
      .toBeNull()
  }, 120_000)

  it('berita acara DITUNTUT begitu tanggal selesainya lewat', async () => {
    /*
      Pasangan wajib dari test di atas. Tanpa ini, "tak dituntut" bisa berarti
      benar atau berarti pemeriksaannya mati sama sekali.
    */
    await bersihkan()
    await db.query(`UPDATE projects SET status = 'active', end_date = $1 WHERE id = $2`,
      [tgl(30), proyek])
    await buatDokumen('kontrak')
    await buatDokumen('spk')
    await buatDokumen('gambar_kerja')

    await panggil('kesiapan-audit')
    expect(await kurangnya(),
      'proyek yang tanggal selesainya sudah lewat TIDAK dituntut berita acara')
      .toEqual(['berita acara'])
  }, 120_000)
})

describe('opname bersama menggantung', () => {
  it('yang DISENGKETAKAN ditegur seketika, tanpa menunggu tenggang', async () => {
    /*
      Sengketa bukan keterlambatan proses melainkan ketidaksepakatan antara
      pengukur dan mandor. Menunggu tujuh hari untuk itu berarti membiarkan
      dua orang berselisih tanpa ada yang menengahi.

      Umurnya SATU hari — jauh di bawah tenggang bawaan 7.
    */
    await bersihkan()
    const s = await buatOpname('SENGKETA', {
      status: 'disengketakan', mundur: 1,
      alasan: 'Mandor menghitung sampai as, pengawas sampai muka.',
    })

    const r = await panggil('opname-menggantung')
    expect(r.statusCode, r.body).toBe(200)
    expect(await ditegur('opname_disengketakan', s),
      'sengketa berumur 1 hari menunggu tenggang — dua orang dibiarkan '
      + 'berselisih tanpa ada yang menengahi')
      .toBe(true)
  }, 120_000)

  it('yang DIVERIFIKASI tidak pernah ditegur', async () => {
    await bersihkan()
    const v = await buatOpname('VERIF', { status: 'diverifikasi', mundur: 90 })

    await panggil('opname-menggantung')
    expect(await ditegur('opname_menggantung', v),
      'opname yang sudah diverifikasi ikut ditegur — daftarnya tak akan '
      + 'pernah bisa dikosongkan')
      .toBe(false)
  }, 120_000)

  it('tenggang benar-benar menyaring yang belum diverifikasi', async () => {
    await bersihkan()
    const baru = await buatOpname('BARU', { status: 'diajukan', mundur: 2 })
    const lama = await buatOpname('LAMA', { status: 'diajukan', mundur: 25 })

    await panggil('opname-menggantung')
    expect(await ditegur('opname_menggantung', lama),
      'opname 25 hari tak ditegur pada tenggang bawaan 7')
      .toBe(true)
    expect(await ditegur('opname_menggantung', baru),
      'opname 2 hari ikut ditegur — tenggangnya tak dipakai menyaring')
      .toBe(false)

    await panggil('opname-menggantung', '?hari=1')
    expect(await ditegur('opname_menggantung', baru),
      'tenggang 1 tak berpengaruh — nilainya tak dipakai')
      .toBe(true)
  }, 120_000)

  it('pesan sengketa tak berakhir titik ganda', async () => {
    /*
      Alasannya diketik orang dan sering sudah berakhiran titik. Menambah satu
      lagi menghasilkan ".." yang terbaca seperti teks terpotong — dan terjadi
      sungguhan di basis dev sebelum ini diperbaiki.
    */
    await bersihkan()
    await buatOpname('TITIK', {
      status: 'disengketakan', mundur: 3,
      alasan: 'Perbedaan cara ukur.',
    })

    await panggil('opname-menggantung')
    const { rows } = await db.query(
      `SELECT message FROM notifications
        WHERE type = 'opname_disengketakan' AND company_id = $1 LIMIT 1`, [companyId])
    expect(String(rows[0]?.message ?? ''), 'pesan memuat titik ganda')
      .not.toMatch(/\.\./)
  }, 120_000)
})

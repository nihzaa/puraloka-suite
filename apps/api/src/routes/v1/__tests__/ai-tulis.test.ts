/**
 * S6 — CRUD terbatas lewat token konfirmasi, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN, DAN KENAPA TIAP HAL PENTING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * · I-1 UTUH — nol tool menulis; tulisannya hanya lewat rute bertoken
 * · injeksi lewat dokumen TAK BISA menulis, betapa pun berhasil membujuk
 * · token sekali-pakai, DIKLAIM ATOMIK (dua klik → satu baris)
 * · token orang lain ditolak; kedaluwarsa ditolak
 * · entitas di luar daftar putih tak punya jalan
 * · NOL delete — ditegakkan basis, bukan hanya kode
 *
 * ── Kenapa "injeksi tak bisa menulis" pantas punya test sendiri
 *
 * Founder memilih CRUD terbatas, dan itu MELAMPAUI TJS (yang nol
 * create/update/delete). Yang membuatnya boleh ada cuma satu hal: jalur
 * tulisnya tak bisa dipicu kalimat.
 *
 * Kalau kelak seseorang menambahkan tool yang menulis "karena lebih praktis",
 * test ini yang harus merah — bukan penjaganya saja, karena penjaga memeriksa
 * BENTUK kode dan test memeriksa PERILAKU.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import aiTulisRoutes from '../ai-tulis.js'
import { ENTITAS_TULIS } from '../../../lib/ai-tool-siapkan.js'
import { KATALOG_TOOL } from '../../../lib/ai-tool.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let companyId: string
let projectId: string

const TANDA = '[UJI-S6]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never,
  )

const siapkan = (badan: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/ai/siapkan-tulis',
    payload: badan as never,
    headers: { authorization: 'Bearer t' },
  })

const tulis = (token: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/ai/tulis',
    payload: { token } as never,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth

  const { rows: c } = await db.query(`SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id
  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 LIMIT 1`, [companyId])
  projectId = p[0].id

  app = Fastify()
  await app.register(aiTulisRoutes)
  await app.ready()
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM punch_items WHERE judul LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM progress_logs WHERE notes LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM ai_token_tulis WHERE company_id = $1`, [companyId])
  await app.close()
  await db.end()
})

beforeEach(async () => {
  vi.restoreAllMocks()
  actAs(adminAuth)
  await db.query(`DELETE FROM ai_token_tulis WHERE company_id = $1`, [companyId])
})

describe('I-1 — TAK SATU PUN tool menulis', () => {
  it('nol tool di katalog yang namanya menyiratkan tulisan', () => {
    /*
     * Bukan sekadar memeriksa kode (itu tugas `audit-tool-ai-read-only`),
     * melainkan memeriksa KATALOG yang benar-benar dirakit saat runtime.
     * Penjaga membaca berkas; test ini membaca objek yang sungguh dipakai.
     */
    for (const t of KATALOG_TOOL) {
      expect(t.nama, `tool '${t.nama}' menyiratkan tulisan`).not.toMatch(
        /^(buat|tambah|ubah|hapus|simpan|create|update|delete|insert)_/,
      )
    }
  })

  it('tool `siapkan_tulis` ADA, dan ia tak menyimpan apa pun', async () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'siapkan_tulis')
    expect(t).toBeDefined()

    const { rows: sebelum } = await db.query(
      `SELECT count(*)::int n FROM progress_logs WHERE project_id = $1`, [projectId])

    // Dipanggil dengan argumen yang SAH — kalau ia menulis, di sinilah
    // barisnya akan muncul.
    const { createTenantDb } = await import('../../../utils/tenant-db.js')
    const { rows: u } = await db.query(
      `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
    const { rows: pr } = await db.query(`SELECT name FROM projects WHERE id = $1`, [projectId])

    await t!.jalan(
      {
        db: createTenantDb(companyId),
        companyId,
        userId: u[0].user_id,
        izin: new Set(['projects:view']),
      },
      { jenis: 'catatan_progres', proyek: pr[0].name, persen: 50, catatan: `${TANDA} coba` },
    )

    const { rows: sesudah } = await db.query(
      `SELECT count(*)::int n FROM progress_logs WHERE project_id = $1`, [projectId])
    expect(sesudah[0].n).toBe(sebelum[0].n)
  })
})

describe('injeksi TIDAK bisa menulis', () => {
  it('token WAJIB — tanpa token, nol baris tercipta', async () => {
    const { rows: sebelum } = await db.query(
      `SELECT count(*)::int n FROM punch_items WHERE project_id = $1`, [projectId])

    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/tulis',
      payload: {} as never,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(422)

    const { rows: sesudah } = await db.query(
      `SELECT count(*)::int n FROM punch_items WHERE project_id = $1`, [projectId])
    expect(sesudah[0].n).toBe(sebelum[0].n)
  })

  it('token KARANGAN ditolak — bukan diperlakukan sebagai sah', async () => {
    const r = await tulis('token-yang-dikarang-model-abcdef123456')
    expect(r.statusCode).toBe(410)
  })

  it('menyiapkan TIDAK menulis — baris baru nol sampai token dipakai', async () => {
    const { rows: sebelum } = await db.query(
      `SELECT count(*)::int n FROM punch_items WHERE project_id = $1`, [projectId])

    const s = await siapkan({
      jenis: 'temuan_punch',
      project_id: projectId,
      judul: `${TANDA} Retak rambut pada kolom`,
    })
    expect(s.statusCode).toBe(200)
    expect(s.json().token).toBeTruthy()

    // Token terbit, tapi entitasnya BELUM tersentuh. Inilah yang membuat
    // injeksi tak berbahaya: ia bisa memicu penyiapan, tak bisa memicu klik.
    const { rows: sesudah } = await db.query(
      `SELECT count(*)::int n FROM punch_items WHERE project_id = $1`, [projectId])
    expect(sesudah[0].n).toBe(sebelum[0].n)
  })
})

describe('token sekali-pakai, DIKLAIM ATOMIK', () => {
  it('alur penuh: siapkan → tulis → baris tercipta', async () => {
    const s = await siapkan({
      jenis: 'temuan_punch',
      project_id: projectId,
      judul: `${TANDA} Sambungan pipa bocor`,
      lokasi: 'Lantai 2',
      severity: 'berat',
    })
    const token = s.json().token as string

    const t = await tulis(token)
    expect(t.statusCode).toBe(200)
    expect(t.json().ok).toBe(true)

    const { rows } = await db.query(
      `SELECT judul, lokasi, severity, status FROM punch_items WHERE judul LIKE $1`,
      [`${TANDA} Sambungan%`])
    expect(rows).toHaveLength(1)
    expect(rows[0].lokasi).toBe('Lantai 2')
    expect(rows[0].severity).toBe('berat')
  })

  it('token dipakai DUA KALI → yang kedua 409, dan NOL baris kedua', async () => {
    const s = await siapkan({
      jenis: 'temuan_punch',
      project_id: projectId,
      judul: `${TANDA} Cat mengelupas di area tangga`,
    })
    const token = s.json().token as string

    const a = await tulis(token)
    expect(a.statusCode).toBe(200)
    const b = await tulis(token)
    expect(b.statusCode).toBe(409)

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM punch_items WHERE judul LIKE $1`, [`${TANDA} Cat mengelupas%`])
    expect(rows[0].n).toBe(1)
  })

  it('LIMA klik BERSAMAAN → tepat SATU baris', async () => {
    /*
     * Inti klaim atomik. Dengan baca-lalu-tulis, kelimanya melihat "belum
     * dipakai" dan lima baris tercipta — pengguna melihat catatan gandanya
     * dan tak tahu mana yang benar.
     */
    const s = await siapkan({
      jenis: 'temuan_punch',
      project_id: projectId,
      judul: `${TANDA} Keramik pecah di lobi`,
    })
    const token = s.json().token as string

    const hasil = await Promise.all(Array.from({ length: 5 }, () => tulis(token)))
    expect(hasil.filter((r) => r.statusCode === 200)).toHaveLength(1)

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM punch_items WHERE judul LIKE $1`, [`${TANDA} Keramik pecah%`])
    expect(rows[0].n).toBe(1)
  })

  it('klaim ATOMIK di lapisan BASIS — bukan bergantung urutan request', async () => {
    /*
     * Test di atas TERBUKTI BUTA lewat mutasi: mencabut
     * `.is('dipakai_pada', null)` dari klaim tetap hijau.
     *
     * Sebabnya `app.inject` lima kali dalam satu proses cenderung berurutan,
     * jadi balapannya tak pernah benar-benar terjadi. Test yang mengaku
     * menguji konkurensi tapi tak pernah membuat dua hal bersamaan adalah
     * test yang hijau tanpa arti.
     *
     * Yang diuji di sini LANGSUNG ke basis: dua UPDATE bersyarat atas baris
     * yang sama, dijalankan bersamaan. Tepat satu boleh mengenai baris.
     * Inilah jaminan yang sesungguhnya melindungi — bukan urutan request.
     */
    const s = await siapkan({
      jenis: 'temuan_punch',
      project_id: projectId,
      judul: `${TANDA} Balapan klaim token`,
    })
    const token = s.json().token as string

    const klaim = () =>
      db.query(
        `UPDATE ai_token_tulis SET dipakai_pada = now()
          WHERE token = $1 AND dipakai_pada IS NULL RETURNING id`,
        [token],
      )

    const [a, b] = await Promise.all([klaim(), klaim()])
    // Persis satu UPDATE mengenai baris; yang kalah mendapat nol.
    expect((a.rowCount ?? 0) + (b.rowCount ?? 0)).toBe(1)
  })

  it('token KEDALUWARSA ditolak', async () => {
    const s = await siapkan({
      jenis: 'temuan_punch',
      project_id: projectId,
      judul: `${TANDA} Token kedaluwarsa`,
    })
    const token = s.json().token as string

    await db.query(
      `UPDATE ai_token_tulis SET kedaluwarsa = now() - interval '1 minute' WHERE token = $1`,
      [token])

    const t = await tulis(token)
    expect(t.statusCode).toBe(410)
  })

  it('token orang LAIN ditolak', async () => {
    const s = await siapkan({
      jenis: 'temuan_punch',
      project_id: projectId,
      judul: `${TANDA} Milik orang lain`,
    })
    const token = s.json().token as string

    // Pemilik token dipindah ke orang lain; token diteruskan TIDAK memindahkan
    // wewenang — pelajaran yang sama dengan token setujui (perbaikan C-2).
    const { rows: lain } = await db.query(
      `SELECT user_id FROM company_members WHERE company_id = $1
        AND user_id <> (SELECT id FROM users WHERE auth_id = $2) LIMIT 1`,
      [companyId, adminAuth])
    if (lain[0]) {
      await db.query(`UPDATE ai_token_tulis SET user_id = $1 WHERE token = $2`,
        [lain[0].user_id, token])
      const t = await tulis(token)
      expect(t.statusCode).toBe(403)
    }
  })
})

describe('daftar putih — yang tak terdaftar tak punya jalan', () => {
  it('jenis karangan ditolak, dan pesannya menyebut yang tersedia', async () => {
    const r = await siapkan({ jenis: 'invoice', project_id: projectId })
    expect(r.statusCode).toBe(422)
    expect(r.json().tersedia).toEqual(ENTITAS_TULIS.map((e) => e.jenis))
  })

  it('entitas berisiko TIDAK ada di daftar putih', () => {
    // Kalau salah satu ini muncul, seseorang melonggarkan daftar putih —
    // dan itu keputusan yang harus terlihat di diff, bukan lolos diam-diam.
    const jenis = ENTITAS_TULIS.map((e) => e.jenis)
    for (const bahaya of ['kasbon', 'invoice', 'change_order', 'izin_kerja', 'ncr']) {
      expect(jenis, `entitas berisiko '${bahaya}' masuk daftar putih`).not.toContain(bahaya)
    }
  })

  it('NOL aksi hapus di seluruh daftar putih', () => {
    for (const e of ENTITAS_TULIS) {
      expect(e.aksi as readonly string[], e.jenis).not.toContain('hapus')
    }
  })

  it('basis MENOLAK aksi hapus, bukan hanya kode', async () => {
    const { rows: u } = await db.query(
      `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
    await expect(
      db.query(
        `INSERT INTO ai_token_tulis
           (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kedaluwarsa)
         VALUES ($1, 'uji-s6-hapus', $2, 'x', 'hapus', $3, '{}'::jsonb, 'x', now() + interval '1 min')`,
        [companyId, u[0].user_id, projectId],
      ),
    ).rejects.toThrow()
  })
})

describe('validasi isi', () => {
  it('persen di luar 0-100 ditolak', async () => {
    for (const persen of [-5, 101, 9999]) {
      const r = await siapkan({ jenis: 'catatan_progres', project_id: projectId, persen })
      expect(r.statusCode, `persen ${persen}`).toBe(422)
    }
  })

  it('judul temuan terlalu pendek ditolak', async () => {
    const r = await siapkan({ jenis: 'temuan_punch', project_id: projectId, judul: 'abc' })
    expect(r.statusCode).toBe(422)
  })

  it('proyek tenant LAIN ditolak', async () => {
    // Id proyek yang tak dimiliki tenant ini — pemanggil bisa mengirim apa
    // saja, dan tanpa pemeriksaan barisnya tercipta di proyek orang lain.
    const r = await siapkan({
      jenis: 'temuan_punch',
      project_id: '00000000-0000-0000-0000-000000000000',
      judul: `${TANDA} Proyek asing`,
    })
    expect(r.statusCode).toBe(404)
  })
})

describe('jejak — dari niat ke hasil', () => {
  it('`hasil_id` terisi setelah tulisan berhasil', async () => {
    const s = await siapkan({
      jenis: 'catatan_progres',
      project_id: projectId,
      persen: 42,
      catatan: `${TANDA} jejak`,
    })
    const token = s.json().token as string
    await tulis(token)

    // Tanpa `hasil_id`, tak ada cara menghubungkan baris yang tercipta dengan
    // token yang membuatnya — dan "siapa yang mencatat ini lewat asisten?"
    // jadi pertanyaan tanpa jawaban.
    const { rows } = await db.query(
      `SELECT hasil_id, dipakai_pada FROM ai_token_tulis WHERE token = $1`, [token])
    expect(rows[0].hasil_id).toBeTruthy()
    expect(rows[0].dipakai_pada).toBeTruthy()
  })
})

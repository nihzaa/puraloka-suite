/**
 * F2 — Template WBS, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • struktur BENAR-BENAR tersalin dengan hierarki utuh — parent_id yang
 *     baru menunjuk baris yang baru, bukan yang lama
 *   • RAB proyek benar-benar terbentuk, dan levelnya diturunkan dari kedalaman
 *   • proyek yang sudah ber-RAB DITOLAK, dan RAB-nya tak tersentuh
 *   • template tenant lain tak terlihat maupun tersalin
 *   • trigger lama (`fn_cbs_node_guard`) benar-benar mengunci template aktif
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole , companyBerisi } from "../../../test-utils/rls-harness.js"
import { supabaseAuth } from '../../../utils/supabase.js'
import templateWbsRoutes from '../template-wbs.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectKosong: string
let projectBerRab: string
let templateAsing: string | null = null

const TANDA = 'UJI-F2'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

/** Bersihkan fixture — node lebih dulu, dan lewat replica karena template bisa aktif. */
async function bersihkan() {
  await db.query(`SET session_replication_role = 'replica'`)
  try {
    await db.query(
      `DELETE FROM rab_items WHERE project_id = $1 AND name LIKE $2`,
      [projectKosong, `${TANDA}%`])
    await db.query(
      `DELETE FROM cbs_nodes WHERE template_id IN (SELECT id FROM cbs_templates WHERE code LIKE $1)`,
      [`${TANDA}%`])
    await db.query('DELETE FROM cbs_templates WHERE code LIKE $1', [`${TANDA}%`])
  } finally {
    await db.query(`SET session_replication_role = 'origin'`)
  }
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: _u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  // Company dipilih yang BENAR-BENAR berisi data yang dibutuhkan.
  //
  // Menuntut proyek YANG PUNYA RAB. Diukur: dari 4 company ber-proyek, hanya SATU punya rab_items.
  // `LIMIT 1` tanpa ORDER BY menyerahkan pilihannya ke Postgres, dan yang
  // terpilih salah membuat test membalas "tidak ditemukan" — pesan yang
  // menuduh RUTE, padahal rutenya benar dan fixture-nya yang menunjuk
  // company kosong.
  companyId = await companyBerisi(db, auth, ['projects', 'rab_items'])

  /*
    ── Residu smoke test DIBERSIHKAN LEBIH DULU (2026-08-14)

    Berkas ini gagal di `beforeAll` pada suite penuh:

        Error: tak ada proyek tanpa RAB untuk diuji

    Diukur: company uji punya 16 proyek, **0 kosong** — tetapi **14 kosong**
    kalau residu `'Uji pasca-apply'` diabaikan. Dua puluh delapan baris
    `rab_items` (14 proyek × 2) menyumbat seluruh stok fixture.

    Residu itu bukan milik berkas ini. Namanya diturunkan dari
    `cost_codes.name` — cost code `CC-SMOKE-RETIRED`, dibuat 2026-07-25 dan
    sudah `deprecated`. Itulah kenapa string `'Uji pasca-apply'` **nol
    kemunculan di seluruh repo**: ia tak pernah ditulis sebagai literal.

    Penulisnya belum teridentifikasi — delapan test yang menyentuh
    `rab_items` sudah diuji satu per satu dan tak satu pun menambah baris
    (28 → 28 pada kedelapan). Yang pasti terukur: barisnya berhenti tumbuh,
    seluruhnya bercost-code smoke, nol dirujuk `progress_logs`, dan
    menghapusnya mengembalikan tepat 14 proyek ke keadaan kosong.

    ── Kenapa MEMBERSIHKAN, bukan melonggarkan syarat fixture

    Pada `price-book-triase` (cacat sejenis hari ini) jawabannya justru
    kebalikan: syaratnya yang dilonggarkan. Di sini itu SALAH — "proyek belum
    ber-RAB" bukan sekadar bahan fixture, ia BAGIAN DARI YANG DIUJI. Test di
    bawah menuntut penerapan KEDUA ditolak 422 justru karena proyeknya kini
    sudah ber-RAB. Melonggarkan syarat akan membalik arti testnya sendiri.

    Cacat yang sama bisa menuntut perbaikan yang berlawanan arah; yang
    menentukan adalah apa yang sedang dijamin, bukan bentuk gejalanya.
  */
  await db.query(
    `DELETE FROM rab_items
      WHERE name = 'Uji pasca-apply' AND category_code = 'CC-SMOKE-RETIRED'`)

  // Fixture dipilih menurut SYARAT, bukan LIMIT 1 — pelajaran migrasi 328.
  const { rows: kosong } = await db.query(
    `SELECT p.id FROM projects p
      WHERE p.company_id = $1
        AND NOT EXISTS (SELECT 1 FROM rab_items r WHERE r.project_id = p.id)
      LIMIT 1`, [companyId])
  if (!kosong.length) throw new Error('tak ada proyek tanpa RAB untuk diuji')
  projectKosong = kosong[0].id

  const { rows: berRab } = await db.query(
    `SELECT p.id, count(r.id)::int n FROM projects p
       JOIN rab_items r ON r.project_id = p.id
      WHERE p.company_id = $1 GROUP BY p.id ORDER BY 2 DESC LIMIT 1`, [companyId])
  if (!berRab.length) throw new Error('tak ada proyek ber-RAB untuk diuji')
  projectBerRab = berRab[0].id

  // Template milik company LAIN — id yang BENAR-BENAR ADA. UUID acak tak
  // cukup: `maybeSingle()` mengembalikan null dengan atau tanpa saringan,
  // jadi testnya tetap hijau saat saringannya dibuang (terbukti di E1).
  const { rows: coLain } = await db.query(
    'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
  if (coLain.length) {
    const { rows: t } = await db.query(
      `INSERT INTO cbs_templates (code, name, source, version_number, status, company_id)
       VALUES ($1, 'template tenant lain', 'company', 1, 'draft', $2) RETURNING id`,
      [`${TANDA}-ASING`, coLain[0].id])
    templateAsing = t[0].id
    await db.query(
      `INSERT INTO cbs_nodes (template_id, name, sort_order, company_id)
       VALUES ($1, 'RAHASIA TENANT LAIN', 1, $2)`,
      [templateAsing, coLain[0].id])
  }

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(templateWbsRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  if (templateAsing) {
    await db.query(`SET session_replication_role = 'replica'`)
    await db.query('DELETE FROM cbs_nodes WHERE template_id = $1', [templateAsing])
    await db.query('DELETE FROM cbs_templates WHERE id = $1', [templateAsing])
    await db.query(`SET session_replication_role = 'origin'`)
  }
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('membuat template', () => {
  it('menolak kode kosong', async () => {
    const r = await post('/api/v1/template-wbs', { name: 'x' })
    expect(r.statusCode).toBe(400)
  })

  it('membuat draf versi 1, kode dijadikan huruf besar', async () => {
    const r = await post('/api/v1/template-wbs', {
      code: `${TANDA}-rumah`, name: 'Rumah tinggal 2 lantai',
    })
    expect(r.statusCode, r.body).toBe(201)
    const t = r.json().template
    expect(t.code).toBe(`${TANDA}-RUMAH`)
    expect(t.version_number).toBe(1)
    expect(t.status).toBe('draft')
  })

  it('kode SAMA menghasilkan versi BERIKUTNYA, bukan galat', async () => {
    const r = await post('/api/v1/template-wbs', {
      code: `${TANDA}-RUMAH`, name: 'Rumah tinggal 2 lantai (revisi)',
    })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().template.version_number).toBe(2)
  })

  it('menolak menyalin template milik tenant LAIN', async () => {
    if (!templateAsing) throw new Error('fixture template asing tak terbentuk')
    const r = await post('/api/v1/template-wbs', {
      code: `${TANDA}-CURI`, name: 'coba salin', salin_dari: templateAsing,
    })
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/sumber tidak ditemukan/i)

    // Dan tak ada baris yang terbuat — penolakan sebelum menulis apa pun.
    const { rows } = await db.query(
      'SELECT count(*)::int n FROM cbs_templates WHERE code = $1', [`${TANDA}-CURI`])
    expect(rows[0].n).toBe(0)
  })
})

describe('daftar & isolasi', () => {
  // Catatan jujur tentang saringan `.or(company_id.eq…)` pada GET daftar:
  //
  // Test di bawah HIJAU dengan atau tanpa saringan itu — diverifikasi lewat
  // mutasi. Yang benar-benar menahan template tenant lain adalah RLS
  // (`tenant_isolation`), dan sejak migrasi 335 ia ber-FORCE sehingga bahkan
  // service-role tunduk padanya.
  //
  // Saringan aplikasinya TETAP ADA sebagai lapis kedua, dan dicatat sebagai
  // TAK TERBUKTI lewat mutasi — bukan dihapus. Menghapusnya berarti seluruh
  // isolasi bergantung pada satu policy yang bisa ikut terhapus saat seseorang
  // menyederhanakan RLS; membiarkannya tanpa catatan berarti mengaku ia
  // terbukti padahal tidak.
  //
  // Yang test ini BUKTIKAN: hasil akhirnya benar, apa pun yang menjaganya.
  it('template tenant lain TIDAK muncul di daftar', async () => {
    const r = await get('/api/v1/template-wbs')
    expect(r.statusCode, r.body).toBe(200)
    const kode = r.json().template.map((t: { code: string }) => t.code)
    expect(kode).not.toContain(`${TANDA}-ASING`)
  })

  it('RLS-nya sendiri yang menahan — dibuktikan langsung ke basis', async () => {
    // Kalau `tenant_isolation` dilemahkan, test di atas tetap hijau selama
    // saringan aplikasi utuh, dan sebaliknya. Ini yang menguji policy-nya
    // sendiri: FORCE RLS menyala, dan bentuknya memisahkan baca dari tulis.
    const { rows } = await db.query(
      `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'cbs_templates'`)
    expect(rows[0].relforcerowsecurity,
      'FORCE RLS mati — pemilik tabel melewati gerbang sepenuhnya').toBe(true)

    const { rows: pol } = await db.query(
      `SELECT with_check FROM pg_policies
        WHERE tablename = 'cbs_templates' AND policyname = 'tenant_isolation'`)
    expect(pol[0].with_check,
      'WITH CHECK masih mengizinkan company_id NULL — tenant mana pun bisa ' +
      'membuat baris yang terlihat seluruh tenant lain')
      .not.toMatch(/company_id IS NULL/i)
  })

  it('template sendiri muncul dengan jumlah node', async () => {
    const r = await get('/api/v1/template-wbs')
    const t = r.json().template.find((x: { code: string }) => x.code === `${TANDA}-RUMAH`)
    expect(t).toBeTruthy()
    expect(t.jumlahNode).toBe(0)
  })

  it('detail template tenant lain ditolak 404', async () => {
    if (!templateAsing) throw new Error('fixture template asing tak terbentuk')
    const r = await get(`/api/v1/template-wbs/${templateAsing}`)
    expect(r.statusCode, r.body).toBe(404)
  })
})

describe('mengaktifkan', () => {
  let idV1: string

  beforeAll(async () => {
    const { rows } = await db.query(
      `SELECT id FROM cbs_templates WHERE code = $1 AND version_number = 1`,
      [`${TANDA}-RUMAH`])
    idV1 = rows[0].id
  })

  it('template TANPA node ditolak — proyeknya akan lahir dengan RAB kosong', async () => {
    const r = await patch(`/api/v1/template-wbs/${idV1}/status`, { status: 'active' })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/RAB kosong/i)
  })

  it('sesudah diberi struktur, aktivasi berhasil', async () => {
    await db.query(
      `INSERT INTO cbs_nodes (template_id, name, sort_order, company_id)
       VALUES ($1, $2, 1, $3)`,
      [idV1, `${TANDA} PEKERJAAN PERSIAPAN`, companyId])
    const { rows: akar } = await db.query(
      `SELECT id FROM cbs_nodes WHERE template_id = $1 LIMIT 1`, [idV1])
    await db.query(
      `INSERT INTO cbs_nodes (template_id, parent_id, name, sort_order, company_id)
       VALUES ($1, $2, $3, 1, $4)`,
      [idV1, akar[0].id, `${TANDA} Bouwplank`, companyId])

    const r = await patch(`/api/v1/template-wbs/${idV1}/status`, { status: 'active' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().template.status).toBe('active')
  })

  it('struktur template AKTIF terkunci — dijaga trigger yang sudah ada', async () => {
    // `fn_cbs_node_guard` lahir jauh sebelum F2. Diperiksa di sini karena F2
    // bergantung padanya: jaminan yang dipakai tanpa diperiksa bisa hilang
    // tanpa disadari.
    await expect(
      db.query(
        `INSERT INTO cbs_nodes (template_id, name, sort_order, company_id)
         VALUES ($1, 'sisipan', 9, $2)`, [idV1, companyId]),
    ).rejects.toThrow(/draft/i)
  })

  it('mengaktifkan versi KEDUA ditolak selama v1 masih aktif', async () => {
    const { rows } = await db.query(
      `SELECT id FROM cbs_templates WHERE code = $1 AND version_number = 2`,
      [`${TANDA}-RUMAH`])
    await db.query(
      `INSERT INTO cbs_nodes (template_id, name, sort_order, company_id)
       VALUES ($1, $2, 1, $3)`,
      [rows[0].id, `${TANDA} struktur v2`, companyId])

    const r = await patch(`/api/v1/template-wbs/${rows[0].id}/status`, { status: 'active' })
    expect(r.statusCode,
      'dua versi aktif berkode sama — template mana yang dipakai jadi tak tentu').toBe(409)
  })

  it('transisi mundur ditolak', async () => {
    const r = await patch(`/api/v1/template-wbs/${idV1}/status`, { status: 'draft' })
    expect(r.statusCode).toBe(400)
  })
})

describe('menyalin struktur', () => {
  it('hierarki utuh — parent_id baru menunjuk baris BARU', async () => {
    const { rows: asal } = await db.query(
      `SELECT id FROM cbs_templates WHERE code = $1 AND version_number = 1`,
      [`${TANDA}-RUMAH`])

    const r = await post('/api/v1/template-wbs', {
      code: `${TANDA}-SALIN`, name: 'hasil salinan', salin_dari: asal[0].id,
    })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().node_tersalin).toBe(2)

    const idBaru = r.json().template.id
    const { rows: node } = await db.query(
      `SELECT id, parent_id, name FROM cbs_nodes WHERE template_id = $1 ORDER BY sort_order`,
      [idBaru])
    expect(node).toHaveLength(2)

    const akar = node.find((n) => n.parent_id === null)
    const anak = node.find((n) => n.parent_id !== null)
    expect(akar).toBeTruthy()
    expect(anak).toBeTruthy()
    // Induk anak menunjuk akar yang BARU, bukan node template asal.
    expect(anak!.parent_id,
      'parent_id menunjuk node template ASAL — dua template saling menunjuk')
      .toBe(akar!.id)

    // Dan node barunya bercompany, bukan NULL.
    const { rows: co } = await db.query(
      `SELECT DISTINCT company_id FROM cbs_nodes WHERE template_id = $1`, [idBaru])
    expect(co[0].company_id).toBe(companyId)
  })
})

describe('menerapkan ke proyek', () => {
  let idAktif: string

  beforeAll(async () => {
    const { rows } = await db.query(
      `SELECT id FROM cbs_templates WHERE code = $1 AND version_number = 1`,
      [`${TANDA}-RUMAH`])
    idAktif = rows[0].id
  })

  it('menolak proyek milik tenant lain', async () => {
    const { rows } = await db.query(
      'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!rows.length) return
    const r = await post(`/api/v1/template-wbs/${idAktif}/terapkan`, { project_id: rows[0].id })
    expect(r.statusCode, r.body).toBe(404)
  })

  it('proyek yang SUDAH ber-RAB ditolak, dan RAB-nya TAK tersentuh', async () => {
    const { rows: sebelum } = await db.query(
      'SELECT count(*)::int n FROM rab_items WHERE project_id = $1', [projectBerRab])

    const r = await post(`/api/v1/template-wbs/${idAktif}/terapkan`, { project_id: projectBerRab })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/tak bisa dibatalkan/i)

    const { rows: sesudah } = await db.query(
      'SELECT count(*)::int n FROM rab_items WHERE project_id = $1', [projectBerRab])
    expect(sesudah[0].n,
      'RAB proyek ikut berubah meski penerapan ditolak').toBe(sebelum[0].n)
  })

  it('proyek kosong: RAB terbentuk dengan hierarki dan level yang benar', async () => {
    const r = await post(`/api/v1/template-wbs/${idAktif}/terapkan`, { project_id: projectKosong })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().dibuat).toBe(2)

    const { rows } = await db.query(
      `SELECT id, parent_id, level, name, unit_price, qty
         FROM rab_items WHERE project_id = $1 AND name LIKE $2 ORDER BY sort_order`,
      [projectKosong, `${TANDA}%`])
    expect(rows).toHaveLength(2)

    const akar = rows.find((x) => x.parent_id === null)!
    const anak = rows.find((x) => x.parent_id !== null)!
    expect(akar.level).toBe('category')
    expect(anak.level).toBe('subcategory')
    expect(anak.parent_id).toBe(akar.id)

    // Harga & volume SENGAJA kosong — template membawa struktur, bukan angka.
    expect(akar.unit_price).toBeNull()
    expect(akar.qty).toBeNull()
  })

  it('menerapkan KEDUA kali ditolak — proyeknya kini sudah ber-RAB', async () => {
    const r = await post(`/api/v1/template-wbs/${idAktif}/terapkan`, { project_id: projectKosong })
    expect(r.statusCode, r.body).toBe(422)
  })

  it('template DRAF tak bisa diterapkan', async () => {
    const { rows } = await db.query(
      `SELECT id FROM cbs_templates WHERE code = $1 AND status = 'draft' LIMIT 1`,
      [`${TANDA}-SALIN`])
    const r = await post(`/api/v1/template-wbs/${rows[0].id}/terapkan`, {
      project_id: projectKosong,
    })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/aktifkan lebih dulu/i)
  })
})

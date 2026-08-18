import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import costControlRoutes from '../cost-control.js'

/**
 * CVR terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 20 test di `lib/__tests__/cvr.test.ts`
 * (10 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai `work_scopes`/`weekly_wage_reports` → `mandor_assignments`
 *     benar-benar menempuh jalannya. Kalau putus: nol scope, dan layar CVR
 *     yang kosong terbaca sebagai "tidak ada selisih" — kabar baik palsu
 *     tentang angka yang paling menentukan untung-rugi.
 *   • upah `draft`/`submitted` TIDAK ikut biaya — aturan yang sama dengan
 *     `belanja-aktual`, karena dua angka biaya berbeda di dua layar untuk
 *     proyek yang sama menghancurkan kepercayaan pemakai
 *   • `meta.cakupan` selalu dibawa: CVR ini hanya upah borongan
 *   • endpoint TIDAK MENULIS apa pun
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let assignmentId: string
let scopeUji: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM weekly_wage_reports WHERE notes LIKE '[TEST]%'`)
  await client.query(`DELETE FROM work_scopes WHERE scope_name LIKE '[TEST]%'`)
  // Biaya uji cakupan kedua. Dibersihkan di SINI, bukan hanya di afterAll:
  // baris yang mengendap sesudah test gagal membuat jalan berikutnya gagal
  // karena alasan yang sama sekali berbeda (totalnya berlipat).
  await client.query(`DELETE FROM project_expenses WHERE description LIKE '[TEST]%'`)
  // Kategori dihapus SESUDAH biayanya — FK-nya menahan urutan sebaliknya, dan
  // galatnya akan muncul di test yang sama sekali lain.
  await client.query(`DELETE FROM project_expense_categories WHERE name LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  /*
    ORDER BY WAJIB — `LIMIT 1` tanpa urutan bukan pilihan, ia kebetulan.

    Selama jumlah barisnya tetap, Postgres memulangkan baris yang sama tiap
    kali dan ini tak pernah terlihat salah. Ia berhenti benar begitu ada baris
    ditambah atau dihapus: fixture bergeser ke proyek lain, dan test gagal
    dengan pesan yang menuduh KODE padahal yang salah pilihan datanya.

    Sudah memakan delapan berkas di repo ini (`spk`, `kontrak-pdf-kop`,
    `wa-webhook`, `back-charge`, `co-billing-mode`, `opname-bersama`,
    `sod-gerbang`, `tulis-absensi`) — tiap kali gejalanya menuduh hal lain.

    Sekaligus: proyek yang dipilih WAJIB punya kategori RAB, karena test
    kategori di bawah menuntutnya. Syarat itu kini dinyatakan di query, bukan
    diharapkan kebetulan.
  */
  const { rows: p } = await client.query(
    `SELECT ma.project_id, ma.id AS assignment_id
       FROM mandor_assignments ma
       JOIN projects pr ON pr.id = ma.project_id
      WHERE pr.company_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM rab_items ri
                     WHERE ri.project_id = ma.project_id AND ri.level = 'category')
      ORDER BY ma.created_at, ma.id
      LIMIT 1`)
  if (!p[0]) throw new Error('tak ada penugasan mandor di proyek berkategori RAB untuk diuji')
  projectId = p[0].project_id
  assignmentId = p[0].assignment_id

  await purge()

  // Scope RUGI yang disengaja: nilai terpasang Rp 50 juta (100jt × 50%),
  // upah terbayar Rp 60 juta. Rugi Rp 10 juta harus TERLIHAT.
  const { rows: sc } = await client.query(
    `INSERT INTO work_scopes
       (assignment_id, scope_name, payment_system, borongan_value, progress_pct_done, status)
     VALUES ($1, '[TEST] Scope Rugi', 'borongan', 100000000, 50, 'active')
     RETURNING id`, [assignmentId])
  scopeUji = sc[0].id

  await client.query(
    `INSERT INTO weekly_wage_reports
       (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
     VALUES ($1, $2, CURRENT_DATE - 7, CURRENT_DATE, 'paid', 60000000, 0, 60000000, '[TEST] upah cvr')`,
    [assignmentId, scopeUji])

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(costControlRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /projects/:id/cvr', () => {
  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await get('/api/v1/projects/00000000-0000-0000-0000-0000000000ff/cvr')
    expect(r.statusCode).toBe(404)
  })

  // INVARIAN TERPENTING. Kalau rantai tenancy putus, hasilnya nol scope —
  // dan layar CVR kosong terbaca sebagai "tidak ada selisih", bukan "belum
  // ada data". Itu kabar baik palsu tentang untung-rugi.
  it('scope benar-benar terbaca lewat rantai tenancy-nya', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    expect(j.meta.jumlah_scope).toBeGreaterThan(0)
    expect(j.baris.some((b: { scope_id: string }) => b.scope_id === scopeUji)).toBe(true)
  })

  it('scope RUGI dihitung benar dan diurutkan paling atas', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const uji = j.baris.find((b: { scope_id: string }) => b.scope_id === scopeUji)
    expect(uji.nilai_terpasang).toBe(50_000_000)
    expect(uji.terpakai).toBe(60_000_000)
    expect(uji.selisih).toBe(-10_000_000)
    expect(uji.keadaan).toBe('rugi')
    // Yang rugi naik ke atas — daftar yang menaruhnya di bawah membuatnya
    // tak pernah dibaca.
    expect(j.baris[0].keadaan).toBe('rugi')
  })

  // Aturan yang SAMA dengan `belanja-aktual.ts`. Dua angka biaya berbeda di
  // dua layar untuk proyek yang sama adalah cara tercepat kehilangan
  // kepercayaan pemakai.
  it('upah DRAFT tidak menaikkan biaya', async () => {
    const sebelum = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const uji0 = sebelum.baris.find((b: { scope_id: string }) => b.scope_id === scopeUji)

    await client.query(
      `INSERT INTO weekly_wage_reports
         (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
       VALUES ($1, $2, CURRENT_DATE - 14, CURRENT_DATE - 7, 'draft', 20000000, 0, 20000000, '[TEST] upah draft cvr')`,
      [assignmentId, scopeUji])

    const sesudah = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const uji1 = sesudah.baris.find((b: { scope_id: string }) => b.scope_id === scopeUji)
    expect(uji1.terpakai).toBe(uji0.terpakai)
  })

  // Cakupan DINYATAKAN. Pembaca yang mengira ini mencakup seluruh biaya
  // proyek akan salah menyimpulkan, dan salahnya di angka untung-rugi.
  it('membawa meta.cakupan dan keterbatasannya', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    expect(j.meta.cakupan).toMatch(/upah borongan/i)
    expect(j.meta.keterbatasan).toMatch(/material/i)
  })

  // `borongan_value_override` adalah nilai yang BENAR-BENAR disepakati;
  // `borongan_value` jadi angka rencana yang tertinggal. Memakai yang salah
  // menggeser seluruh perhitungan untung-rugi scope itu.
  it('borongan_value_override MENANG atas borongan_value', async () => {
    const { rows: sc } = await client.query(
      `INSERT INTO work_scopes
         (assignment_id, scope_name, payment_system, borongan_value,
          borongan_value_override, progress_pct_done, status)
       VALUES ($1, '[TEST] Scope Override', 'borongan', 100000000, 40000000, 100, 'active')
       RETURNING id`, [assignmentId])

    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const b = j.baris.find((x: { scope_id: string }) => x.scope_id === sc[0].id)
    // 40 juta (override), bukan 100 juta.
    expect(b.nilai_terpasang).toBe(40_000_000)
  })

  // Postgres `numeric` MENERIMA NaN — terbukti di repo ini. Satu baris NaN
  // meracuni seluruh scope, dan angka untung-rugi yang berbunyi "NaN" di
  // layar jauh lebih baik daripada angka salah yang terlihat wajar; yang
  // dilakukan: baris NaN DILEWATI, sisanya tetap benar.
  it('upah bernilai NaN tidak meracuni biaya scope', async () => {
    const { rows: sc } = await client.query(
      `INSERT INTO work_scopes
         (assignment_id, scope_name, payment_system, borongan_value, progress_pct_done, status)
       VALUES ($1, '[TEST] Scope NaN', 'borongan', 50000000, 100, 'active')
       RETURNING id`, [assignmentId])

    await client.query(
      `INSERT INTO weekly_wage_reports
         (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
       VALUES ($1, $2, CURRENT_DATE - 7, CURRENT_DATE, 'paid', 0, 0, 'NaN'::numeric, '[TEST] upah nan'),
              ($1, $2, CURRENT_DATE - 14, CURRENT_DATE - 7, 'paid', 0, 0, 5000000, '[TEST] upah waras')`,
      [assignmentId, sc[0].id])

    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const b = j.baris.find((x: { scope_id: string }) => x.scope_id === sc[0].id)
    expect(Number.isNaN(b.terpakai)).toBe(false)
    expect(b.terpakai).toBe(5_000_000)
    expect(Number.isNaN(b.selisih)).toBe(false)
  })

  it('TIDAK MENULIS apa pun', async () => {
    const hitung = async () => {
      const { rows } = await client.query(`SELECT count(*)::int n FROM work_scopes`)
      return rows[0].n as number
    }
    const sebelum = await hitung()
    await get(`/api/v1/projects/${projectId}/cvr`)
    await get(`/api/v1/projects/${projectId}/cvr`)
    expect(await hitung()).toBe(sebelum)
  })

  it('meneruskan rab_category_id — kekosongannya harus TERLIHAT', async () => {
    // Diukur 2026-08-13: 0 dari 20 scope berkategori, dan itulah yang
    // membatasi CVR ke upah borongan saja. Menyembunyikan kolomnya membuat
    // batas cakupan terbaca sebagai sifat modul — padahal ia keadaan data
    // yang bisa diperbaiki dalam beberapa klik.
    const r = await get(`/api/v1/projects/${projectId}/cvr`)
    expect(r.statusCode, r.body).toBe(200)

    const baris = r.json().baris as Array<Record<string, unknown>>
    if (baris.length === 0) throw new Error('proyek uji tak punya scope — fixture tak terbentuk')

    for (const b of baris) {
      expect(b, 'rab_category_id tak diteruskan ke UI').toHaveProperty('rab_category_id')
    }

    // Kuncinya ada saja TIDAK cukup: `lib/cvr.ts` mengisi `?? null`, jadi
    // kunci tetap muncul meski rutenya lupa mengambil kolomnya — dan mutasi
    // "kolom tak diambil rute" LOLOS karenanya sampai versi ini.
    //
    // Yang dibandingkan: nilai yang dikirim vs nilai di BASIS. Satu scope
    // sengaja diberi kategori supaya perbandingannya bermakna; nilai awalnya
    // dikembalikan sesudahnya.
    const { rows: kat } = await client.query(
      `SELECT id FROM rab_items WHERE project_id = $1 AND level = 'category' LIMIT 1`, [projectId])
    if (!kat.length) throw new Error('proyek uji tak punya kategori RAB — fixture tak terbentuk')

    const idScope = baris[0].scope_id as string
    const { rows: awal } = await client.query(
      'SELECT rab_category_id FROM work_scopes WHERE id = $1', [idScope])
    try {
      await client.query('UPDATE work_scopes SET rab_category_id = $1 WHERE id = $2',
        [kat[0].id, idScope])

      const r2 = await get(`/api/v1/projects/${projectId}/cvr`)
      const b2 = (r2.json().baris as Array<Record<string, unknown>>)
        .find((x) => x.scope_id === idScope)
      expect(b2?.rab_category_id,
        'nilai kategori tak sampai ke UI — rutenya tak mengambil kolomnya').toBe(kat[0].id)
    } finally {
      await client.query('UPDATE work_scopes SET rab_category_id = $1 WHERE id = $2',
        [awal[0].rab_category_id, idScope])
    }
  })

  /**
   * ══════════════════════════════════════════════════════════════════════
   * CAKUPAN KEDUA — berapa besar yang TIDAK ikut dihitung
   * ══════════════════════════════════════════════════════════════════════
   *
   * Diukur 2026-08-19: tiga proyek punya biaya `approved` puluhan juta dan
   * NOL upah borongan. Di CVR sebelum hari ini mereka tampil seolah tak
   * punya biaya sama sekali — layarnya tak pernah menyebut berapa besar yang
   * di luar jangkauannya, jadi pembaca menganggap sisanya nol.
   *
   *   Dapur & KM Pak Hendra   upah 0   biaya lain 80,3 jt
   *   Gudang — Gedebage       upah 0   biaya lain 48,7 jt
   *   Bu Sari — Dago          upah 0   biaya lain 46,2 jt
   *
   * Yang dibuktikan di sini bukan aritmetikanya (itu di `lib/__tests__/cvr`)
   * melainkan RANTAINYA: biaya sungguhan di basis sampai ke respons, dan
   * TIDAK menyentuh satu pun angka margin.
   */
  it('biaya di luar scope sampai ke respons — dan TIDAK menggeser margin', async () => {
    const sebelum = await get(`/api/v1/projects/${projectId}/cvr`)
    expect(sebelum.statusCode, sebelum.body).toBe(200)
    const m0 = sebelum.json()

    /*
      Kategori dibuat SENDIRI, tidak dipinjam.

      Diukur 2026-08-19: `project_expenses.category_id` **NOT NULL**, dan
      kesepuluh kategori yang ada milik satu proyek saja. Meminjam kategori
      proyek lain melanggar tenancy; memakai NULL melanggar constraint. Versi
      pertama test ini melakukan yang kedua dan gagal dengan galat basis, bukan
      dengan kalimat — persis kegagalan yang menuduh kode padahal fixture-nya.

      Sekaligus catatan untuk yang membaca `lib/cvr.ts`: cabang "Tanpa
      kategori" di sana TAK BISA lahir dari tabel ini karena kolomnya NOT NULL.
      Ia tetap ada dan tetap diuji di level pustaka — sebagai pertahanan kalau
      constraint itu suatu hari dilonggarkan, karena saat itu terjadi
      kesalahannya berupa total yang menyusut diam-diam, bukan galat.
    */
    const { rows: kat } = await client.query(
      // `type` NOT NULL dan ber-enum. Nilainya DIUKUR ke basis (`material`
      // dipakai kesepuluh kategori yang ada), bukan ditebak dari ingatan —
      // tebakan `'pending'` pada enum lain sudah memakan satu putaran di repo
      // ini, dan gejalanya galat basis yang menuduh kode.
      `INSERT INTO project_expense_categories (project_id, name, type)
       VALUES ($1, '[TEST] Material uji CVR', 'material')
       RETURNING id, name`, [projectId])

    // Biaya `approved` Rp 88,3 juta — angka Pak Andi yang sesungguhnya.
    // Ditambah biaya `draft` yang HARUS diabaikan: ia belum tentu jadi uang
    // keluar, dan memasukkannya membuat angka layar ini berbeda dari
    // /belanja-aktual untuk proyek yang sama.
    /*
      Kolom wajibnya DIUKUR sekaligus, bukan ditemukan satu per satu lewat
      galat berturut-turut:

        SELECT column_name FROM information_schema.columns
         WHERE table_name='project_expenses'
           AND is_nullable='NO' AND column_default IS NULL

      → project_id, category_id, description, unit_price, total_amount,
        submitted_by

      Menemukannya lewat gagal-perbaiki-gagal memakan satu putaran per kolom,
      dan tiap galatnya berbunyi seperti kerusakan kode.
    */
    const { rows: pengaju } = await client.query(
      `SELECT id FROM users ORDER BY created_at, id LIMIT 1`)

    for (const [jumlah, status] of [[88300000, 'approved'], [9000000, 'draft']] as const) {
      await client.query(
        // `expense_source` DINYATAKAN, tak dibiarkan bawaan: bawaannya
        // `petty_cash`, dan CHECK `chk_petty_cash_source` lalu menuntut
        // `petty_cash_id` terisi. Ke-88 baris nyata memakai `client_fund`.
        `INSERT INTO project_expenses
           (project_id, category_id, description, expense_date,
            qty, unit_price, total_amount, status, submitted_by, expense_source)
         VALUES ($1, $2, '[TEST] cvr cakupan kedua', CURRENT_DATE,
                 1, $3, $3, $4, $5, 'client_fund')`,
        [projectId, kat[0].id, jumlah, status, pengaju[0].id])
    }

    const r = await get(`/api/v1/projects/${projectId}/cvr`)
    expect(r.statusCode, r.body).toBe(200)
    const m = r.json()

    // 1. Sampai ke respons, dan HANYA yang approved.
    expect(m.biaya_luar_scope.total - m0.biaya_luar_scope.total).toBe(88_300_000)

    // 2. Rinciannya menjumlah PERSIS ke totalnya. Rincian yang tak menjumlah
    //    lebih buruk daripada tak ada rincian: pembaca menemukan selisih dan
    //    tak punya cara tahu mana yang benar.
    const rincian = m.biaya_luar_scope.per_kategori as { kategori: string; total: number }[]
    expect(rincian.reduce((x, k) => x + k.total, 0)).toBe(m.biaya_luar_scope.total)

    /*
      NAMA kategorinya dibandingkan, bukan hanya jumlahnya — dan itu perbaikan
      sesudah mutasi yang LOLOS.

      Versi pertama test ini cuma memeriksa rincian menjumlah ke totalnya.
      Mutasi yang merusak penanganan bentuk relasi PostgREST
      (`Array.isArray(k) ? k[0]?.name : k?.name` → selalu `undefined` untuk
      larik) tetap HIJAU: begitu semua nama hilang, seluruh biaya berkumpul di
      satu ember "Tanpa kategori" — dan ember tunggal tetap menjumlah persis ke
      totalnya.

      Yang lolos itu bukan cacat sepele. PostgREST memulangkan relasi to-one
      bisa sebagai objek ATAU larik satu unsur tergantung bagaimana ia
      menyimpulkan kardinalitas; kalau bentuknya berubah, layar menampilkan
      "Tanpa kategori Rp 88 juta" tanpa satu pun galat — persis kebutaan yang
      cakupan kedua ini dibangun untuk mengakhiri.
    */
    const material = rincian.find((k) => k.kategori === '[TEST] Material uji CVR')
    expect(material, 'nama kategori tak sampai ke UI — bentuk relasi PostgREST tak tertangani')
      .toBeDefined()
    expect(material!.total).toBe(88_300_000)

    // 3. INTI-nya: ketiga angka margin TAK BERGESER SEDIKIT PUN.
    //    Kalau salah satu berubah, biaya material sudah bocor ke hitungan
    //    untung-rugi — dan "rugi" yang muncul cuma kesalahan aritmetika:
    //    nilai terpasang yang diadu hanya nilai borongan UPAH.
    expect(m.total_terpakai).toBe(m0.total_terpakai)
    expect(m.total_nilai_terpasang).toBe(m0.total_nilai_terpasang)
    expect(m.total_selisih).toBe(m0.total_selisih)

    // 4. Keterbatasannya menyebut sebabnya yang BENAR. Kalimat lama berbunyi
    //    "belum bisa dipecah karena tak menyimpan cost code" — itu keliru dan
    //    menyesatkan: ia mengesankan cukup mengisi data. Diukur ke
    //    pg_constraint, taksonomi biaya dan taksonomi RAB tak saling menunjuk
    //    sama sekali, jadi mengisi kategori RAB pun tak mengubah apa pun.
    expect(m.meta.keterbatasan).toMatch(/tak saling menunjuk/i)
  })

})

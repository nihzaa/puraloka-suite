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
  /*
    Proyek dipilih menurut SYARAT, bukan `LIMIT 1` atas urutan yang kebetulan.

    Test pengeluaran di bawah menyebut kategori "Beton". Kategori pengeluaran
    hidup PER PROYEK (`project_expense_categories`), dan diukur 2026-08-30
    hanya SATU proyek yang punya katalog lengkap — sisanya nol atau dua
    kategori saja.

    Dengan `LIMIT 1` telanjang, fixture ini memilih proyek tanpa "Beton", lalu
    rute menolak dengan 422 "Kategori tak dikenali dari Beton" — pesan yang
    BENAR, dan gejala yang menuduh RUTE padahal fixture-nya yang salah pilih.
  */
  const { rows: p } = await db.query(
    `SELECT pr.id FROM projects pr
      WHERE pr.company_id = $1
        AND EXISTS (SELECT 1 FROM project_expense_categories c
                     WHERE c.project_id = pr.id AND c.name ILIKE '%beton%')
      ORDER BY pr.created_at LIMIT 1`, [companyId])
  if (!p.length) {
    throw new Error(
      'prasyarat gagal: nol proyek punya kategori pengeluaran ber-"beton". ' +
      'Test kategori di bawah tak bisa menguji apa pun tanpa itu.')
  }
  projectId = p[0].id

  app = Fastify()
  await app.register(aiTulisRoutes)
  await app.ready()
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM punch_items WHERE judul LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM progress_logs WHERE notes LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM project_expenses WHERE description LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM material_requests WHERE notes LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM kasbons WHERE purpose LIKE $1`, [`${TANDA}%`])
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
    /*
      Kalau salah satu ini muncul, seseorang melonggarkan daftar putih — dan
      itu keputusan yang harus terlihat di diff, bukan lolos diam-diam.

      ── `kasbon` DIKELUARKAN dari daftar ini 2026-08-15, dan itu bukan
         pelemahan test

      Test ini semula juga melarang `kasbon`. Ia merah begitu founder meminta
      pengajuan kasbon lewat WhatsApp, dan godaannya jelas: hapus satu kata,
      hijau lagi.

      Yang salah bukan kata itu melainkan APA yang test ini kira ia jaga.
      Daftarnya menyamakan dua hal yang berbeda:

        · `invoice`, `change_order` — dokumen yang MENGIKAT saat dibuat
        · `izin_kerja` — gerbang keselamatan yang berlaku saat terbit
        · `ncr` — dasar klaim, dan tak punya trigger penomor
        · `kasbon` — PERMINTAAN yang lahir `pending` dan tak mengikat apa pun

      Keempat yang pertama punya akibat pada saat penciptaan. Kasbon tidak:
      akibatnya menempel pada PERSETUJUAN, dan persetujuan tetap menuntut
      manusia menekan tombol.

      Jadi yang dijaga sekarang bukan nama, melainkan sifatnya — lihat test
      berikutnya, yang melarang entitas ber-trigger uang saat INSERT masuk
      daftar putih. Itu menangkap `invoice` juga kalau kelak ada yang
      menambahkannya, tanpa perlu seseorang mengingat menuliskan namanya di
      sini.
    */
    const jenis = ENTITAS_TULIS.map((e) => e.jenis)
    for (const bahaya of ['invoice', 'change_order', 'izin_kerja', 'ncr']) {
      expect(jenis, `entitas berisiko '${bahaya}' masuk daftar putih`).not.toContain(bahaya)
    }
  })

  it('NOL entitas daftar putih yang punya trigger INSERT penggerak uang', async () => {
    /*
      Pengganti yang sesungguhnya untuk larangan-berdasar-nama di atas.

      Daftar nama melindungi dari kesalahan yang sudah terpikirkan. Ini
      melindungi dari yang belum: entitas APA PUN yang ditambahkan kelak
      diperiksa BENTUKNYA — kalau menyentuhnya menggerakkan uang pada saat
      baris lahir, ia tak boleh bisa lahir dari kalimat.

      Trigger diperiksa terhadap basis yang sesungguhnya, bukan terhadap daftar
      di kode — supaya migrasi yang mengubah `AFTER UPDATE` jadi
      `AFTER INSERT OR UPDATE` memerahkan test ini, bukan lolos karena tak ada
      yang ingat memperbarui daftarnya.
    */
    const tabel = ENTITAS_TULIS.map((e) => e.tabel)

    const { rows } = await db.query(
      `SELECT c.relname AS tabel, t.tgname, pg_get_triggerdef(t.oid) AS def
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname = ANY($1::text[])`,
      [tabel])

    /*
      ── Kenapa yang diperiksa ISI FUNGSINYA, bukan namanya

      Versi pertama test ini mencocokkan nama trigger dengan /cash|balance|…/
      dan langsung merah — pada entitas LAMA, bukan pada kasbon:

          project_expenses.trg_expense_petty_cash_balance
          AFTER INSERT OR UPDATE OF status

      Fungsinya (`fn_update_petty_cash_on_expense`, dibaca dari `pg_proc`)
      memang memindahkan saldo saat INSERT — tetapi hanya di bawah SYARAT:

          TG_OP = 'INSERT' AND NEW.status = 'approved'
                          AND NEW.expense_source = 'petty_cash'

      Jalur asisten tak memenuhi syarat itu: ia memaku `expense_source` ke
      `main_cash` dan tak pernah mengisi `status`. Jadi merahnya bukan cacat
      yang sedang terjadi.

      Tapi mengubah test jadi hijau dengan mengecualikan `project_expenses`
      akan melewatkan hal yang sesungguhnya penting: keamanannya bersandar pada
      DUA BARIS di rute, bukan pada bentuk trigger. Ganti `main_cash` jadi
      `petty_cash` di `ai-tulis.ts` — satu kata, terlihat seperti perbaikan —
      dan uang bergerak dari kalimat tanpa satu pun test merah.

      Jadi yang dijaga bukan "adakah trigger uang", melainkan "apakah
      SYARATNYA masih yang kami andalkan". Kalau seseorang membuang syarat
      `status = 'approved'` dari fungsinya, test ini merah — dan itulah satu-
      satunya perubahan yang benar-benar membahayakan.
    */
    const MENGGERAKKAN_UANG = /UPDATE\s+cash_accounts|UPDATE\s+cash_transfers/i

    for (const t of rows) {
      if (!/\bINSERT\b/.test(t.def as string)) continue

      const { rows: fn } = await db.query(
        `SELECT p.prosrc FROM pg_proc p
           JOIN pg_trigger tg ON tg.tgfoid = p.oid
          WHERE tg.tgname = $1`, [t.tgname])
      const src = (fn[0]?.prosrc ?? '') as string
      if (!MENGGERAKKAN_UANG.test(src)) continue

      /*
        Ia menggerakkan uang DAN bisa menyala saat INSERT. Boleh, asal cabang
        INSERT-nya BERSYARAT sesuatu yang jalur asisten tak pernah penuhi.

        ── DUA bentuk syarat, bukan satu (diperluas 2026-08-16)

        Sampai hari ini hanya satu bentuk yang dikenal: `status='approved'`,
        yang menahan `project_expenses` dan `kasbons` — keduanya lahir
        `pending`/`draft`.

        `payments` menuntut bentuk kedua, dan bukan karena longgar. Tabel itu
        TAK PUNYA kolom `status` sama sekali (diukur ke information_schema),
        jadi syarat approval mustahil ada di sana. Yang menahannya:

            IF NEW.cash_account_id IS NOT NULL THEN
              UPDATE cash_accounts SET balance = balance + NEW.amount_paid …

        Jalur asisten memaku `cash_account_id: null` (`lib/tulis-klaim.ts`),
        jadi cabang itu tak pernah tercapai — pembayaran TERCATAT, saldo TIDAK
        bergerak, dan rekonsiliasi tetap pekerjaan orang keuangan.

        ── Kenapa ini BUKAN pelemahan penjaga

        Yang dijaga dari awal bukan kata "approved", melainkan pertanyaan:
        *apakah cabang INSERT-nya masih bersyarat sesuatu yang kalimat tak bisa
        penuhi?* Menambahkan bentuk kedua menjawab pertanyaan yang sama untuk
        tabel yang bentuknya berbeda.

        Yang tetap merah kalau dilanggar:
          · seseorang membuang syarat `status='approved'` dari fungsi lama
          · seseorang membuat trigger uang yang INSERT-nya TANPA syarat
          · seseorang mengisi `cash_account_id` dari kalimat — dijaga
            `tulis-pembayaran.test.ts`, termasuk muatan yang menyelundupkannya
      */
      const BERSYARAT_APPROVAL = /TG_OP\s*=\s*'INSERT'[\s\S]{0,200}?status\s*=\s*'approved'/i
      const BERSYARAT_REKENING =
        /TG_OP\s*=\s*'INSERT'[\s\S]{0,200}?cash_account_id\s+IS\s+NOT\s+NULL/i

      expect(
        BERSYARAT_APPROVAL.test(src) || BERSYARAT_REKENING.test(src),
        `${t.tabel}.${t.tgname} memindahkan uang saat INSERT TANPA syarat apa pun `
          + "(bukan status='approved', bukan cash_account_id IS NOT NULL) — "
          + 'entitas ini tak aman ditulis lewat percakapan',
      ).toBe(true)
    }
  }, 60_000)

  it("jalur pengeluaran TIDAK memakai petty_cash — syarat yang menahan trigger saldo", async () => {
    /*
      Sisi lain dari test di atas, dan pasangannya yang tak boleh dipisah.

      Test itu menjaga syarat di BASIS (`status='approved'`); ini menjaga
      syarat di RUTE (`expense_source='main_cash'`). Keamanan jalur pengeluaran
      butuh keduanya: melonggarkan salah satunya cukup untuk membuat kalimat
      WhatsApp memindahkan saldo kas kecil.

      Dibaca dari berkas sumber, bukan dari perilaku — perilakunya baru berbeda
      kalau ada baris yang benar-benar memakai `petty_cash`, dan pada saat itu
      uangnya sudah berpindah.
    */
    /*
      Berkasnya PINDAH 2026-08-16, dan test ini ikut pindah bersamanya.

      Logika klaim (~230 baris) dipindah dari handler rute ke
      `lib/tulis-klaim.ts` supaya WhatsApp bisa memanggilnya tanpa `request`.
      Test ini sempat merah karena masih membaca `ai-tulis.ts` — dan merahnya
      BENAR: kalau ia dibiarkan menunjuk berkas lama, ia akan hijau selamanya
      tanpa memeriksa apa pun, persis kelas penjaga-buta yang sudah empat kali
      terjadi di repo ini.

      Kedua jalur penerbitan diperiksa sekaligus: rute web dan penerbit
      WhatsApp. Yang kedua ada supaya WhatsApp tak jadi pintu yang lebih
      longgar daripada web.
    */
    const { readFile } = await import('node:fs/promises')
    const klaim = await readFile(new URL('../../../lib/tulis-klaim.ts', import.meta.url), 'utf8')

    expect(klaim, 'tulis-klaim.ts tak lagi memaku expense_source — cek trigger petty cash')
      .toMatch(/expense_source:\s*'main_cash'/)
    expect(klaim, 'tulis-klaim.ts menyebut petty_cash — saldo bisa bergerak saat INSERT')
      .not.toMatch(/expense_source:\s*'petty_cash'/)

    // Penerbit token WhatsApp: batas nominalnya wajib SAMA dengan rute web.
    const wa = await readFile(
      new URL('../../../lib/tulis-konfirmasi-wa.ts', import.meta.url),
      'utf8',
    )
    expect(wa, 'penerbit WA menyebut petty_cash — saldo bisa bergerak lewat kalimat')
      .not.toMatch(/petty_cash/)
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

describe('Automation 1.1 — pencatatan pengeluaran lewat percakapan', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA JENIS INI PALING KETAT DIUJI
    ══════════════════════════════════════════════════════════════════════════

    Dua jenis lain mencatat pekerjaan (progres, temuan). Yang ini mencatat
    UANG — dan lahir dari kalimat, bukan formulir.

    Tiga pagar yang diuji di bawah semuanya menutup cara berbeda uang bisa
    salah tercatat, dan tak satu pun akan berbunyi kalau jebol:

      NOMINAL     `Number('')` = 0 dan `Number('abc')` = NaN. Keduanya lolos
                  pemeriksaan yang ceroboh, dan menghasilkan pengeluaran Rp 0
                  yang terlihat sah di daftar.

      BATAS       salah ketik nol adalah kekeliruan paling mudah lewat
                  percakapan. Tanpa pagar, "lima juta" yang jadi 50 juta
                  masuk pembukuan dengan tenang.

      KATEGORI    id-nya diselesaikan saat MENYIAPKAN, bukan saat menulis.
                  Kalau ditunda, "kategori tak ditemukan" muncul sesudah token
                  habis — dan pengguna kehilangan penyiapannya untuk kesalahan
                  yang bisa diberitahukan sejak awal.
  */

  it('alur penuh: siapkan → tulis → pengeluaran tercipta dengan kategori yang cocok', async () => {
    const s = await siapkan({
      jenis: 'pengeluaran',
      project_id: projectId,
      jumlah: 1_500_000,
      keperluan: `${TANDA} semen 20 sak untuk lantai 2`,
      kategori: 'Beton',
    })
    expect(s.statusCode, s.body).toBe(200)

    const t = await tulis(s.json().token as string)
    expect(t.statusCode, t.body).toBe(200)

    const { rows } = await db.query(
      `SELECT pe.description, pe.total_amount, pe.unit_price, pe.status, c.name AS kategori
         FROM project_expenses pe
         JOIN project_expense_categories c ON c.id = pe.category_id
        WHERE pe.description LIKE $1`,
      [`${TANDA}%`])

    expect(rows).toHaveLength(1)
    expect(Number(rows[0].total_amount)).toBe(1_500_000)
    expect(String(rows[0].kategori).toLowerCase()).toContain('beton')

    /*
      Status awalnya BUKAN 'approved'.

      Ini pagar yang paling mahal kalau jebol: pengeluaran yang lahir dari
      percakapan tetap harus lewat rantai approval yang sama dengan pengajuan
      lewat halaman biasa. Menuliskannya `approved` di rute berarti AI
      mengeluarkan uang tanpa satu pun persetujuan.
    */
    expect(rows[0].status).not.toBe('approved')
  }, 60_000)

  it('nominal NOL dan bukan-angka DITOLAK — bukan tersimpan sebagai Rp 0', async () => {
    for (const jumlah of [0, -5000, Number.NaN, 'abc' as unknown as number]) {
      const r = await siapkan({
        jenis: 'pengeluaran',
        project_id: projectId,
        jumlah,
        keperluan: `${TANDA} percobaan nominal tak sah`,
      })
      expect(r.statusCode, `jumlah ${String(jumlah)} lolos: ${r.body}`).toBe(422)
    }

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM project_expenses WHERE description LIKE $1`,
      [`${TANDA} percobaan%`])
    expect(rows[0].n, 'ada baris tercipta dari nominal tak sah').toBe(0)
  }, 60_000)

  it('di atas batas jalur DITOLAK — salah ketik nol tak masuk pembukuan', async () => {
    const r = await siapkan({
      jenis: 'pengeluaran',
      project_id: projectId,
      jumlah: 50_000_000,
      keperluan: `${TANDA} lima juta yang jadi lima puluh juta`,
    })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/halaman Pengeluaran/i)
  }, 60_000)

  it('keperluan terlalu pendek DITOLAK — approver memutuskan dari kalimat ini', async () => {
    const r = await siapkan({
      jenis: 'pengeluaran',
      project_id: projectId,
      jumlah: 250_000,
      keperluan: 'cat',
    })
    expect(r.statusCode, r.body).toBe(422)
  }, 60_000)

  it('kategori tak dikenali DITOLAK SEKARANG, bukan saat token diklaim', async () => {
    /*
      Yang diuji: kegagalannya muncul di TAHAP PENYIAPAN.

      Kalau id kategori baru dicari saat menulis, permintaan ini akan 200 di
      sini dan gagal belakangan — sesudah token habis. Pengguna kehilangan
      penyiapannya untuk kesalahan yang sudah bisa diketahui sejak awal.
    */
    const r = await siapkan({
      jenis: 'pengeluaran',
      project_id: projectId,
      jumlah: 300_000,
      keperluan: `${TANDA} pembelian barang tanpa padanan kategori`,
      kategori: 'zzz-kategori-yang-tak-ada',
    })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/kategori/i)
  }, 60_000)
})

describe('Permintaan material (MR) lewat percakapan', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA MR, BUKAN PO
    ══════════════════════════════════════════════════════════════════════════

    Founder: *"mau po material dan lain lain"*. Yang dibuat MR, dan itu bukan
    penyederhanaan melainkan urutan yang benar:

      MR  "saya butuh 50 sak semen di proyek A"     ← yang tahu orang lapangan
      PO  "beli dari supplier X, harga Y, kirim Z"  ← yang tahu tim pengadaan

    Meminta asisten membuat PO dari kalimat berarti menebak `supplier_id` dan
    `total_amount` — dokumen pengadaan berisi angka yang tak seorang pun
    putuskan. MR-nya mengalir ke jalur yang sudah ada: approval → RFQ → PO,
    dengan gerbang approval PO yang dibangun kemarin tetap berlaku penuh.
  */

  it('alur penuh: siapkan → tulis → MR tercipta dengan nomor otomatis', async () => {
    const s = await siapkan({
      jenis: 'permintaan_material',
      project_id: projectId,
      kebutuhan: `${TANDA} 50 sak semen untuk cor lantai 2`,
      dibutuhkan_tanggal: '2026-09-01',
    })
    expect(s.statusCode, s.body).toBe(200)

    const t = await tulis(s.json().token as string)
    expect(t.statusCode, t.body).toBe(200)

    const { rows } = await db.query(
      `SELECT mr_number, notes, needed_date, status, requested_by
         FROM material_requests WHERE notes LIKE $1`,
      [`${TANDA}%`])

    expect(rows).toHaveLength(1)

    /*
      Nomor MR terisi TRIGGER, bukan oleh rute.

      Kalau ini kosong, artinya `trg_generate_mr_number` tak berjalan — dan
      MR tanpa nomor tak bisa dirujuk di dokumen pengadaan mana pun.
    */
    expect(rows[0].mr_number, 'mr_number kosong — trigger penomor tak berjalan')
      .toBeTruthy()

    /*
      Dibandingkan sebagai TANGGAL, bukan sebagai teks.

      Driver `pg` memulangkan kolom `date` sebagai objek `Date`, jadi
      `String(...)` menghasilkan "Tue Sep 01 2026 00:00:00 GMT+0700" — bukan
      "2026-09-01". Assertion pertama saya membandingkan teks dan merah untuk
      data yang sebenarnya benar.

      `toISOString()` juga salah di sini: ia menggeser ke UTC, dan tanggal
      lokal 1 September pukul 00:00 WIB menjadi 31 Agustus 17:00Z. Cacat yang
      sama pernah merusak data seed di repo ini (`berlaku_sejak` 2026-01-01 →
      2025-12-30).
    */
    const tgl = rows[0].needed_date as Date
    expect(
      `${tgl.getFullYear()}-${String(tgl.getMonth() + 1).padStart(2, '0')}-${String(tgl.getDate()).padStart(2, '0')}`,
    ).toBe('2026-09-01')

    // Status awal BUKAN approved: MR dari percakapan tetap lewat antrean yang
    // sama dengan pengajuan lewat halaman biasa.
    expect(rows[0].status).not.toBe('approved')
  }, 60_000)

  it('kebutuhan terlalu pendek DITOLAK — pengadaan memutuskan dari kalimat ini', async () => {
    const r = await siapkan({
      jenis: 'permintaan_material',
      project_id: projectId,
      kebutuhan: 'semen',
    })
    expect(r.statusCode, r.body).toBe(422)
  }, 60_000)

  it('tanggal berbentuk kata DITOLAK saat menyiapkan, bukan saat menulis', async () => {
    /*
      `new Date('besok')` menghasilkan `Invalid Date`, dan menuliskannya ke
      kolom `date` gagal SESUDAH token habis. Model bisa saja meneruskan kata
      seperti itu apa adanya dari kalimat pengguna.
    */
    const r = await siapkan({
      jenis: 'permintaan_material',
      project_id: projectId,
      kebutuhan: `${TANDA} pasir 3 kubik`,
      dibutuhkan_tanggal: 'besok',
    })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/YYYY-MM-DD/i)
  }, 60_000)
})

describe('Kasbon lewat percakapan — kategori B, dan uang yang TIDAK bergerak', () => {
  /*
    Founder meminta pengajuan kasbon lewat WhatsApp (2026-08-15).

    Yang diuji di sini bukan "apakah barisnya tersimpan" — itu bagian termudah
    dan paling tak penting. Yang diuji: KLAIM yang membuat kasbon boleh masuk
    daftar putih sama sekali.

    Klaimnya berbunyi: kasbon dari percakapan tak menggerakkan satu rupiah pun,
    karena yang menggerakkan uang adalah PERSETUJUANNYA. Kalau klaim itu salah,
    seluruh alasan memasukkan `kasbons` runtuh — dan runtuhnya tak akan terbaca
    dari kode, hanya dari saldo yang berubah.

    Jadi test pertama memeriksa `cash_balances` SEBELUM dan SESUDAH.
  */

  it('alur penuh: kasbon tercipta PENDING dan saldo kas tak bergerak', async () => {
    const { rows: saldoSebelum } = await db.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM cash_accounts WHERE company_id = $1`,
      [companyId])

    const s = await siapkan({
      jenis: 'kasbon',
      project_id: projectId,
      jumlah: 2_500_000,
      keperluan: `${TANDA} gaji tukang minggu ini`,
    })
    expect(s.statusCode, s.body).toBe(200)

    const t = await tulis(s.json().token as string)
    expect(t.statusCode, t.body).toBe(200)

    const { rows } = await db.query(
      `SELECT amount, purpose, status, fund_source, project_id, company_id, requested_by
         FROM kasbons WHERE purpose LIKE $1`,
      [`${TANDA}%`])

    expect(rows).toHaveLength(1)

    /*
      `pending` — inti dari seluruh pembenaran.

      Bukan "bukan approved" seperti test MR di atas, melainkan nilai PERSIS.
      Kasbon berstatus apa pun selain `pending` berarti ia melewati antrean,
      dan status yang lolos diam-diam adalah cara paling sunyi uang berpindah
      tanpa ada yang memutuskan.
    */
    expect(rows[0].status).toBe('pending')

    // `company_id` diisi TRIGGER (`trg_kasbons_isi_company`), bukan oleh rute.
    // Kosong di sini berarti barisnya tak tersaring tenant mana pun.
    expect(rows[0].company_id).toBe(companyId)

    expect(Number(rows[0].amount)).toBe(2_500_000)
    expect(rows[0].fund_source).toBe('owner_advance')
    expect(rows[0].project_id).toBe(projectId)

    /*
      Saldo TIDAK bergerak.

      `trg_kasbon_approved_create_expense` dan `trg_update_cash_on_kasbon_approved`
      keduanya berjalan saat DISETUJUI. Kalau salah satunya ternyata menyala
      saat INSERT, angka di bawah berbeda — dan itulah satu-satunya bukti yang
      berarti bahwa daftar putih ini aman.
    */
    const { rows: saldoSesudah } = await db.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM cash_accounts WHERE company_id = $1`,
      [companyId])
    expect(Number(saldoSesudah[0].total)).toBe(Number(saldoSebelum[0].total))
  }, 60_000)

  it('kedua trigger uang bertipe AFTER UPDATE — insert TAK BISA memicunya', async () => {
    /*
      Test saldo di atas membuktikan uang tak bergerak SEKALI, untuk satu
      baris. Ini membuktikan kenapa ia tak akan bergerak untuk baris mana pun.

      Bedanya menentukan. Saldo yang tak berubah bisa saja kebetulan — misalnya
      trigger menyala tetapi menemukan akun kas yang cocok nol. Bentuk
      trigger-nya tidak bisa kebetulan: `AFTER UPDATE` tak punya jalan untuk
      dipicu `INSERT`.

      Dan kalau seseorang kelak mengubah salah satunya jadi `INSERT OR UPDATE`
      — perubahan yang tampak tak berbahaya di migrasi — test ini merah SEBELUM
      ada kasbon percakapan yang menggerakkan uang tanpa disetujui. Test saldo
      saja tak akan menangkapnya sampai kejadian.
    */
    const { rows } = await db.query(
      `SELECT tgname, pg_get_triggerdef(oid) AS def
         FROM pg_trigger
        WHERE tgrelid = 'kasbons'::regclass AND NOT tgisinternal
          AND tgname IN ('trg_kasbon_approved_create_expense',
                         'trg_update_cash_on_kasbon_approved')
        ORDER BY tgname`)

    expect(rows, 'trigger uang kasbon hilang — asumsi daftar putih tak berlaku lagi')
      .toHaveLength(2)

    for (const t of rows) {
      expect(t.def, `${t.tgname} bukan AFTER UPDATE murni`).toMatch(/AFTER UPDATE/)
      expect(t.def, `${t.tgname} ikut menyala saat INSERT`).not.toMatch(/INSERT/)
    }
  }, 60_000)

  it('nominal di atas batas kanal DITOLAK saat menyiapkan', async () => {
    /*
      Salah ketik nol adalah kekeliruan termudah lewat percakapan. Di atas
      ambang, orang mengajukannya lewat halaman yang menampilkan angkanya
      besar-besar.
    */
    const r = await siapkan({
      jenis: 'kasbon',
      project_id: projectId,
      jumlah: 500_000_000,
      keperluan: `${TANDA} borongan`,
    })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/halaman Kasbon/i)
  }, 60_000)

  it('sumber_dana di luar enum DITOLAK saat menyiapkan, bukan saat menulis', async () => {
    /*
      Kalau ini lolos, galat enum muncul SESUDAH token habis — dan penggunanya
      kehilangan penyiapan untuk kesalahan yang bisa diberitahukan sejak awal.
      Pola kegagalan yang sudah dua kali diperbaiki di rute ini.
    */
    const r = await siapkan({
      jenis: 'kasbon',
      project_id: projectId,
      jumlah: 1_000_000,
      keperluan: `${TANDA} operasional`,
      sumber_dana: 'dana_pribadi',
    })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/owner_advance/)
  }, 60_000)

  it('jumlah nol atau negatif DITOLAK', async () => {
    for (const jumlah of [0, -50_000]) {
      const r = await siapkan({
        jenis: 'kasbon',
        project_id: projectId,
        jumlah,
        keperluan: `${TANDA} percobaan`,
      })
      expect(r.statusCode, `jumlah ${jumlah} lolos`).toBe(422)
    }
  }, 60_000)
})

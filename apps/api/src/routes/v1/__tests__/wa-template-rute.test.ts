/**
 * S4 — rute template WhatsApp: yang menjawab "tersimpan" HARUS menyimpan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `wa-template.test.ts` mengunci perenderan (fungsi murni + basis). Yang TIDAK
 * dikunci di sana adalah rutenya, dan di situlah cacat sebenarnya ditemukan:
 *
 *     const { error } = await db.from('wa_template').update({ isi }).eq('id', id)
 *     if (error) return 500
 *     return { ok: true }        // ← nol baris tersentuh juga sampai di sini
 *
 * `error` hanya terisi kalau QUERY-nya gagal. Id milik tenant lain, atau id
 * yang barisnya sudah hilang, menghasilkan NOL BARIS tanpa satu pun galat —
 * dan rutenya menjawab `{ ok: true }`.
 *
 * Akibatnya bukan soal kerapian: yang menyunting isi pesan melihat
 * "tersimpan", menutup halaman, dan teks LAMA tetap yang terkirim ke
 * pelanggan. Tak ada satu pun tanda bahwa suntingannya tak pernah ada.
 *
 * Penjaga `audit-tulis-tanpa-periksa.mjs` (ambang kedua) sekarang menahan
 * bentuk itu di seluruh repo. Berkas ini menahannya di RUTE INI secara
 * spesifik — penjaga menghitung bentuk, test membuktikan perilaku.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import { waTemplateRoutes } from '../wa-nomor.js'

let app: FastifyInstance
let db: Client
let companyId: string

const put = (payload: unknown) =>
  app.inject({
    method: 'PUT',
    url: '/api/v1/wa/template',
    payload: payload as never,
    headers: { authorization: 'Bearer t' },
  })
const get = () =>
  app.inject({ method: 'GET', url: '/api/v1/wa/template', headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  /*
    Company diambil dari keanggotaan DEFAULT admin sesi, bukan company
    beranggota mana pun.

    Versi sebelumnya memakai `LIMIT 1` tanpa ORDER BY atas SELURUH
    companies yang punya anggota — dan basis ini punya banyak. RLS
    `wa_template` menyaring `company_id = auth_company_id()`, dan
    `auth_company_id()` datang dari keanggotaan DEFAULT. Begitu keduanya
    berbeda, baris yang BARU SAJA disisipkan test tak terlihat oleh rute:

        AssertionError: expected 404 to be 200

    ⚠ Yang membuatnya bertahan lama: test yang MENGHARAPKAN 404 tetap
    hijau — mereka lulus karena alasan yang salah. Komentar di berkas ini
    sendiri sudah memperingatkannya: "penjaga yang hanya membuktikan
    'menolak yang salah' bisa hijau dengan menolak SEMUANYA".

    Pola diambil dari `ai-chat.test.ts` yang sudah diperbaiki lebih dulu.
  */
  const { rows } = await db.query(
    `SELECT m.company_id AS id
       FROM company_members m
       JOIN users u ON u.id = m.user_id
      WHERE u.auth_id = $1 AND m.is_default AND m.is_active
      LIMIT 1`,
    [auth],
  )
  if (!rows.length) throw new Error('admin uji tak punya keanggotaan default')
  companyId = rows[0].id

  app = Fastify()
  await app.register(waTemplateRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM wa_template WHERE kode LIKE 'uji-rute%'`)
  await app.close()
  await db.end()
})

describe('izin — fitur yang tak bisa dicapai siapa pun sama dengan tak ada', () => {
  it('peran admin MEMEGANG settings:wa:template', async () => {
    /*
     * Ini bukan test tentang RBAC; ini test tentang MIGRASI 271.
     *
     * Migrasi 270 membuat permission-nya tetapi tak memberikannya ke peran
     * mana pun. Fiturnya utuh, typecheck bersih, test hijau — dan mati:
     * UI menyembunyikan seluruh kontrolnya, API membalas 403, dan tak ada
     * satu pun galat yang menunjuk sebabnya. Ketahuannya dari TANGKAPAN
     * LAYAR, bukan dari test — jadi sekarang ada testnya.
     */
    const { rows } = await db.query(
      `SELECT 1 FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         JOIN roles r ON r.id = rp.role_id
        WHERE p.key = 'settings:wa:template' AND r.name = 'admin'`)
    expect(
      rows.length,
      'settings:wa:template yatim — panel template tak bisa dipakai SIAPA PUN, ' +
        'termasuk founder, dan tanpa satu pun galat',
    ).toBeGreaterThan(0)
  })
})

describe('PUT — nol baris BUKAN keberhasilan', () => {
  /*
   * Dua test pertama menjaga GERBANG BACA, bukan gerbang tulis — dan saya
   * sempat salah mengira sebaliknya. Mutasi yang membuktikannya: pemeriksaan
   * nol-baris pada update saya cabut, dan keduanya TETAP HIJAU, karena rute
   * berhenti lebih dulu di `maybeSingle()` yang sudah tersaring tenant.
   *
   * Keduanya tetap dipertahankan — gerbang baca juga pantas dikunci — tetapi
   * yang menguji gerbang TULIS hanya satu: "baris yang LENYAP".
   */
  it('id yang tak ada dibalas 404, bukan { ok: true }', async () => {
    const r = await put({
      id: '00000000-0000-0000-0000-000000000000',
      isi: 'apa saja',
    })
    expect(
      r.statusCode,
      'id tak ada menjawab 2xx = yang menyunting melihat "tersimpan" padahal ' +
        'tak ada yang berubah, dan teks lama tetap terkirim ke pelanggan',
    ).toBe(404)
  })

  it('template milik TENANT LAIN tak bisa diubah, dan tak dilaporkan berhasil', async () => {
    const { rows: pemilik } = await db.query(
      `SELECT owner_user_id FROM companies WHERE id = $1`, [companyId])
    const { rows: lain } = await db.query(
      `INSERT INTO companies (code, name, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
      [`uji-rute-${Date.now()}`, '[UJI-RUTE] Tenant Lain', pemilik[0].owner_user_id],
    )
    const { rows: tpl } = await db.query(
      `INSERT INTO wa_template (company_id, kode, label, isi)
       VALUES ($1, 'uji-rute-milik-lain', 'Milik lain', 'ASLI') RETURNING id`,
      [lain[0].id],
    )

    const r = await put({ id: tpl[0].id, isi: 'DIUBAH PENYUSUP' })
    expect(r.statusCode, 'menulis ke tenant lain dijawab 2xx').toBe(404)

    // Dan yang paling penting: isinya BENAR-BENAR tak berubah. Status 404
    // yang benar sambil tulisannya tetap mendarat adalah kegagalan yang
    // lebih buruk daripada 200 yang jujur.
    const { rows: sesudah } = await db.query(
      `SELECT isi FROM wa_template WHERE id = $1`, [tpl[0].id])
    expect(sesudah[0].isi).toBe('ASLI')

    await db.query(`DELETE FROM wa_template WHERE company_id = $1`, [lain[0].id])
    await db.query(`UPDATE companies SET is_active = false WHERE id = $1`, [lain[0].id])
  })

  it('penyimpanan yang SAH tetap berhasil dan benar-benar mengubah', async () => {
    /*
     * Pasangan wajib untuk dua test di atas. Penjaga yang hanya membuktikan
     * "menolak yang salah" bisa hijau dengan menolak SEMUANYA — dan fitur yang
     * menolak semuanya lolos tanpa satu pun test merah.
     */
    const { rows } = await db.query(
      `INSERT INTO wa_template (company_id, kode, label, isi, variabel)
       VALUES ($1, 'uji-rute-sah', 'Uji sah', 'awal {{kode}}', ARRAY['kode'])
       RETURNING id`,
      [companyId],
    )
    const r = await put({ id: rows[0].id, isi: 'berubah {{kode}}' })
    expect(r.statusCode).toBe(200)

    const { rows: sesudah } = await db.query(
      `SELECT isi FROM wa_template WHERE id = $1`, [rows[0].id])
    expect(sesudah[0].isi).toBe('berubah {{kode}}')
  })

  it('variabel tak terdaftar ditolak 422 SEBELUM tersimpan', async () => {
    const { rows } = await db.query(
      `INSERT INTO wa_template (company_id, kode, label, isi, variabel)
       VALUES ($1, 'uji-rute-asing', 'Uji asing', 'awal', ARRAY['kode'])
       RETURNING id`,
      [companyId],
    )
    const r = await put({ id: rows[0].id, isi: 'Halo {{nma}}' })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toContain('nma')

    const { rows: sesudah } = await db.query(
      `SELECT isi FROM wa_template WHERE id = $1`, [rows[0].id])
    expect(sesudah[0].isi, 'ditolak tapi tetap tersimpan').toBe('awal')
  })

  it('baris yang LENYAP antara pembacaan dan penulisan dibalas 404', async () => {
    /*
     * Inilah satu-satunya jalan yang benar-benar menguji pemeriksaan nol baris.
     *
     * Dua test di atas — id tak ada, dan id milik tenant lain — TIDAK
     * mengujinya, dan saya sempat mengira sebaliknya. Mutasi membuktikan
     * kekeliruan itu: pemeriksaannya saya cabut, dan ketujuh test tetap HIJAU.
     *
     * Sebabnya: rute membaca dulu dengan `maybeSingle()` lewat `request.db`
     * yang sudah tersaring tenant. Id yang tak ada DAN id milik tenant lain
     * sama-sama berhenti di 404 pembacaan — `update`-nya tak pernah dijalankan.
     * Yang mereka buktikan adalah gerbang BACA, bukan gerbang TULIS.
     *
     * Jadi barisnya harus ADA saat dibaca, lalu HILANG sebelum ditulis. Itu
     * bukan kasus karangan: dua sesi yang menyunting template yang sama, atau
     * penghapusan yang datang di sela-sela, menghasilkan urutan yang persis
     * ini — dan tanpa pemeriksaannya, yang kalah balapan tetap diberi tahu
     * "tersimpan".
     */
    const { rows } = await db.query(
      `INSERT INTO wa_template (company_id, kode, label, isi)
       VALUES ($1, 'uji-rute-lenyap', 'Uji lenyap', 'awal') RETURNING id`,
      [companyId],
    )
    const id = rows[0].id as string

    /*
     * Barisnya dihapus SESUDAH rute membacanya, lewat trigger sekali-pakai di
     * basis. Bukan lewat mock: `request.db` dibuat di dalam `authenticate`
     * (`plugins/auth.ts:190`) dengan panggilan langsung ke `createTenantDb`,
     * jadi tak ada modul yang bisa disadap dari luar untuk menyisip di antara
     * baca dan tulis. Basisnya sendiri yang menjadi kaitnya.
     *
     * Triggernya menyalak pada UPDATE, membatalkan baris yang mau ditulis
     * (`RETURN NULL`), lalu menghapusnya — persis keadaan "ada saat dibaca,
     * hilang saat ditulis" yang mau dibuktikan.
     */
    await db.query(`
      CREATE OR REPLACE FUNCTION uji_rute_lenyap() RETURNS trigger AS $fn$
      BEGIN
        DELETE FROM wa_template WHERE id = OLD.id;
        RETURN NULL;
      END $fn$ LANGUAGE plpgsql;

      CREATE TRIGGER uji_rute_lenyap_trg
        BEFORE UPDATE ON wa_template
        FOR EACH ROW WHEN (OLD.kode = 'uji-rute-lenyap')
        EXECUTE FUNCTION uji_rute_lenyap();
    `)

    try {
      const r = await put({ id, isi: 'berubah' })
      expect(
        r.statusCode,
        'baris lenyap sebelum ditulis dijawab 2xx — yang menyunting diberi ' +
          'tahu "tersimpan" untuk tulisan yang tak pernah mendarat',
      ).toBe(404)
    } finally {
      await db.query(`
        DROP TRIGGER IF EXISTS uji_rute_lenyap_trg ON wa_template;
        DROP FUNCTION IF EXISTS uji_rute_lenyap();
      `)
    }
  })

  it('mengubah isi TIDAK ikut menonaktifkan template', async () => {
    /*
     * Versi sebelumnya menulis `aktif: b.aktif ?? undefined`, yang bergantung
     * pada JSON.stringify membuang kunci `undefined` — benar hari ini, tetapi
     * kebenaran yang letaknya dua lapis di bawah rute ini.
     *
     * Kalau lapisan itu berubah, tiap penyimpanan isi diam-diam menulis
     * `aktif = null`, dan template yang sengaja dimatikan hidup kembali tanpa
     * ada yang menyentuhnya.
     *
     * ⚠️ JUJUR TENTANG APA YANG TEST INI BUKTIKAN.
     *
     * Ia diuji-mutasi dan TETAP HIJAU saat muatannya dikembalikan ke bentuk
     * lama — karena hari ini kedua bentuk memang berperilaku sama. Jadi test
     * ini TIDAK membuktikan perbaikan itu perlu; ia mengunci PERILAKUNYA
     * ("menyimpan isi tak mengubah status aktif") supaya perubahan di lapisan
     * mana pun — serialisasi, klien basis, atau rute ini sendiri — yang
     * merusaknya jadi terlihat.
     *
     * Dicatat di sini karena test hijau yang tak bisa merah mudah disalahbaca
     * sebagai bukti, dan yang membacanya besok berhak tahu bedanya.
     */
    const { rows } = await db.query(
      `INSERT INTO wa_template (company_id, kode, label, isi, aktif)
       VALUES ($1, 'uji-rute-aktif', 'Uji aktif', 'awal', false) RETURNING id`,
      [companyId],
    )
    const r = await put({ id: rows[0].id, isi: 'berubah' })
    expect(r.statusCode).toBe(200)

    const { rows: sesudah } = await db.query(
      `SELECT aktif FROM wa_template WHERE id = $1`, [rows[0].id])
    expect(sesudah[0].aktif, 'menyimpan isi ikut mengubah status aktif').toBe(false)
  })
})

describe('GET — template tenant lain tak ikut terbaca', () => {
  it('hanya template milik tenant sendiri yang keluar', async () => {
    const r = await get()
    expect(r.statusCode).toBe(200)
    const data = r.json().data as Array<{ kode: string }>
    expect(data.some((t) => t.kode === 'verifikasi_nomor')).toBe(true)
    expect(data.some((t) => t.kode === 'uji-rute-milik-lain')).toBe(false)
  })
})

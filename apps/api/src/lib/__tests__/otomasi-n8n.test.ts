/**
 * S7 — pustaka n8n: konfigurasi, jejak jalan, dan kesehatan turunan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN, DAN KENAPA JUSTRU INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * · baris jejak ditulis SEBELUM panggilan, bukan sesudah — supaya alur yang
 *   mungkin sudah jalan di n8n tak terlihat "tak pernah dipicu" saat proses
 *   kita mati di tengah. Yang tak terlihat akan dipicu lagi oleh orang.
 * · kesehatan DIHITUNG ULANG dari jejak, bukan counter yang ditambah — persis
 *   pelajaran yang TJS tulis sendiri: increment per callback "rawan drift".
 * · slash di ujung base URL dibuang; `//api/...` dijawab 404 oleh sebagian
 *   proxy, dan galat itu menunjuk ke tempat yang salah.
 * · isolasi tenant: jejak milik tenant lain tak ikut terhitung.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import {
  konfigurasiN8n,
  jalankanAlur,
  segarkanKesehatanAlur,
  type FetchSeperti,
} from '../otomasi-n8n.js'

/**
 * `fetch` palsu yang DISUNTIKKAN, bukan mengganti global.
 *
 * `vi.stubGlobal('fetch', …)` dicoba lebih dulu dan MERUSAK basis: klien
 * Supabase memakai fetch global juga, jadi memalsukan n8n ikut memalsukan
 * setiap query. Gejalanya menyesatkan — insert "berhasil" tanpa galat dan
 * tanpa baris, persis seperti bug tenancy. Butuh satu putaran penelusuran
 * untuk menemukan bahwa yang rusak adalah alat ujinya, bukan kodenya.
 */
const palsu = (status: number, badan: unknown): FetchSeperti =>
  async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof badan === 'string' ? badan : JSON.stringify(badan)),
    json: async () => badan,
  })

let db: Client
let companyId: string
let alurId: string

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT c.id FROM companies c
     WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1`)
  companyId = rows[0].id

  const { rows: a } = await db.query(
    `INSERT INTO otomasi_alur (company_id, kode, nama, n8n_id, jalur_webhook)
     VALUES ($1, 'uji-s7', 'Uji S7', 'wf-uji', 'uji/s7') RETURNING id`,
    [companyId],
  )
  alurId = a[0].id
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM otomasi_alur WHERE kode LIKE 'uji-s7%'`)
  await db.end()
})

describe('konfigurasi', () => {
  it('slash di ujung base URL DIBUANG', async () => {
    const cfg = await konfigurasiN8n(async (k) =>
      k === 'N8N_BASE_URL' ? 'https://n8n.contoh.id///' : null)
    // `${base}/api/v1/...` dengan slash ganda dijawab 404 oleh sebagian proxy,
    // dan galatnya menunjuk ke "rute tak ada" — tempat yang salah sama sekali.
    expect(cfg?.baseUrl).toBe('https://n8n.contoh.id')
  })

  it('tanpa base URL → null, BUKAN galat', async () => {
    // Tenant yang belum memakai n8n tetap harus bisa membuka halamannya.
    expect(await konfigurasiN8n(async () => null)).toBeNull()
  })

  it('apiKey opsional — instance tanpa auth tetap terkonfigurasi', async () => {
    const cfg = await konfigurasiN8n(async (k) =>
      k === 'N8N_BASE_URL' ? 'https://n8n.contoh.id' : '')
    expect(cfg).not.toBeNull()
    expect(cfg?.apiKey).toBeNull()
  })
})

describe('menjalankan alur', () => {
  it('tanpa konfigurasi → ditolak, dan TAK menulis jejak', async () => {
    const { rows: sebelum } = await db.query(
      `SELECT count(*)::int AS n FROM otomasi_jalan WHERE alur_id = $1`, [alurId])

    const h = await jalankanAlur({
      db: createTenantDb(companyId),
      companyId,
      cfg: null,
      alur: { id: alurId, kode: 'uji-s7', nama: 'Uji S7', n8n_id: 'wf-uji', jalur_webhook: 'uji/s7' },
      sumber: 'manual',
      oleh: null,
    })

    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('tak_terkonfigurasi')

    // Jejak untuk sesuatu yang TAK PERNAH dicoba adalah jejak palsu — ia
    // membuat "berapa kali alur ini dipicu" jadi angka yang salah.
    const { rows: sesudah } = await db.query(
      `SELECT count(*)::int AS n FROM otomasi_jalan WHERE alur_id = $1`, [alurId])
    expect(sesudah[0].n).toBe(sebelum[0].n)
  })

  it('alur tanpa n8n_id DAN tanpa webhook → ditolak sebelum memanggil', async () => {
    const h = await jalankanAlur({
      db: createTenantDb(companyId),
      companyId,
      cfg: { baseUrl: 'https://n8n.contoh.id', apiKey: null },
      alur: { id: alurId, kode: 'uji-s7', nama: 'Uji S7', n8n_id: null, jalur_webhook: null },
      sumber: 'manual',
      oleh: null,
    })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('tak_terkonfigurasi')
  })

  it('panggilan GAGAL tetap MENINGGALKAN jejak berstatus gagal', async () => {
    /*
     * Inti berkas ini.
     *
     * Kalau jejaknya baru ditulis saat berhasil, kegagalan jadi tak terlihat —
     * dan halaman "kenapa ini tidak jalan?" tak punya apa pun untuk
     * ditunjukkan justru pada kasus yang paling butuh dijawab.
     */
    const h = await jalankanAlur({
      db: createTenantDb(companyId),
      companyId,
      cfg: { baseUrl: 'https://n8n.contoh.id', apiKey: null },
      alur: { id: alurId, kode: 'uji-s7', nama: 'Uji S7', n8n_id: 'wf-uji', jalur_webhook: 'uji/s7' },
      sumber: 'manual',
      oleh: null,
      ambil: palsu(502, 'tak terjangkau'),
    })

    expect(h.ok).toBe(false)

    const { rows } = await db.query(
      `SELECT status, pesan, durasi_ms FROM otomasi_jalan
        WHERE alur_id = $1 ORDER BY dimulai_pada DESC LIMIT 1`, [alurId])
    expect(rows[0].status).toBe('gagal')
    expect(rows[0].pesan).toContain('502')
    expect(rows[0].durasi_ms).not.toBeNull()
  })

  it('panggilan BERHASIL menutup jejaknya dengan status sukses', async () => {
    const h = await jalankanAlur({
      db: createTenantDb(companyId),
      companyId,
      cfg: { baseUrl: 'https://n8n.contoh.id', apiKey: null },
      alur: { id: alurId, kode: 'uji-s7', nama: 'Uji S7', n8n_id: 'wf-uji', jalur_webhook: 'uji/s7' },
      sumber: 'manual',
      oleh: null,
      ambil: palsu(200, { executionId: 'exec-123' }),
    })

    expect(h.ok).toBe(true)
    const { rows } = await db.query(
      `SELECT status, n8n_jalan_id FROM otomasi_jalan
        WHERE alur_id = $1 ORDER BY dimulai_pada DESC LIMIT 1`, [alurId])
    expect(rows[0].status).toBe('sukses')
    // Id eksekusi n8n disimpan supaya jejak di sini bisa ditelusuri ke sana.
    expect(rows[0].n8n_jalan_id).toBe('exec-123')
  })

  it("jejak sudah ADA berstatus 'jalan' SELAGI panggilan berlangsung", async () => {
    /*
     * Ini yang sesungguhnya membedakan "tulis dulu" dari "tulis di akhir",
     * dan test-test di atas TIDAK membuktikannya — saya mengira sebaliknya
     * sampai mutasi menunjukkan sebaliknya: status awal diubah jadi 'sukses'
     * dan kesebelas test tetap hijau, karena baris itu SELALU ditimpa
     * sebelum siapa pun sempat membacanya.
     *
     * Jadi barisnya dibaca DARI DALAM panggilan — satu-satunya saat "sedang
     * berjalan" benar-benar ada. Kalau prosesnya mati di sini (deploy, mesin
     * restart), inilah keadaan yang tertinggal di basis, dan ia harus
     * mengatakan "sedang jalan", bukan "sukses" untuk sesuatu yang belum
     * tentu terjadi, dan bukan tak ada sama sekali.
     */
    let statusSaatTerbang: string | null = null
    const intip: FetchSeperti = async () => {
      const { rows } = await db.query(
        `SELECT status FROM otomasi_jalan WHERE alur_id = $1
          ORDER BY dimulai_pada DESC LIMIT 1`, [alurId])
      statusSaatTerbang = rows[0]?.status ?? null
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) }
    }

    await db.query(`DELETE FROM otomasi_jalan WHERE alur_id = $1`, [alurId])
    await jalankanAlur({
      db: createTenantDb(companyId),
      companyId,
      cfg: { baseUrl: 'https://n8n.contoh.id', apiKey: null },
      alur: { id: alurId, kode: 'uji-s7', nama: 'Uji S7', n8n_id: 'wf-uji', jalur_webhook: 'uji/s7' },
      sumber: 'manual',
      oleh: null,
      ambil: intip,
    })

    expect(
      statusSaatTerbang,
      'saat panggilan berlangsung, jejaknya tak ada — proses yang mati di ' +
        'tengah tak meninggalkan bukti bahwa alurnya MUNGKIN sudah jalan',
    ).toBe('jalan')
  })

  it('badan galat RAKSASA dipotong sebelum masuk basis', async () => {
    // n8n bisa memulangkan jejak tumpukan panjang. Menyimpannya utuh membuat
    // tabel jejak membengkak karena galat yang berulang tiap menit.
    await jalankanAlur({
      db: createTenantDb(companyId),
      companyId,
      cfg: { baseUrl: 'https://n8n.contoh.id', apiKey: null },
      alur: { id: alurId, kode: 'uji-s7', nama: 'Uji S7', n8n_id: 'wf-uji', jalur_webhook: 'uji/s7' },
      sumber: 'manual',
      oleh: null,
      ambil: palsu(500, 'x'.repeat(50_000)),
    })

    const { rows } = await db.query(
      `SELECT length(pesan) AS n FROM otomasi_jalan
        WHERE alur_id = $1 ORDER BY dimulai_pada DESC LIMIT 1`, [alurId])
    expect(Number(rows[0].n)).toBeLessThan(400)
  })
})

describe('kesehatan — dihitung ULANG, bukan ditambah', () => {
  it('mengikuti jalan TERAKHIR, bukan akumulasi', async () => {
    const tdb = createTenantDb(companyId)

    await db.query(`DELETE FROM otomasi_jalan WHERE alur_id = $1`, [alurId])
    await db.query(
      `INSERT INTO otomasi_jalan (company_id, alur_id, status, dimulai_pada)
       VALUES ($1,$2,'sukses', now() - interval '2 hour'),
              ($1,$2,'gagal',  now() - interval '1 hour')`,
      [companyId, alurId],
    )
    await segarkanKesehatanAlur(tdb, alurId)

    let { rows } = await db.query(
      `SELECT kesehatan, sukses_terakhir, gagal_terakhir FROM otomasi_alur WHERE id = $1`,
      [alurId])
    // Sukses yang LEBIH LAMA tak boleh menutupi kegagalan terbaru.
    expect(rows[0].kesehatan).toBe('gagal')
    expect(rows[0].sukses_terakhir).not.toBeNull()
    expect(rows[0].gagal_terakhir).not.toBeNull()

    // Dan ia PULIH saat jalan berikutnya berhasil — inilah yang tak bisa
    // dilakukan counter yang hanya bertambah.
    await db.query(
      `INSERT INTO otomasi_jalan (company_id, alur_id, status) VALUES ($1,$2,'sukses')`,
      [companyId, alurId])
    await segarkanKesehatanAlur(tdb, alurId)
    ;({ rows } = await db.query(
      `SELECT kesehatan, pesan_gagal FROM otomasi_alur WHERE id = $1`, [alurId]))
    expect(rows[0].kesehatan).toBe('sehat')
    // Pesan gagal LAMA wajib hilang: pesan yang tertinggal membuat alur sehat
    // terbaca seperti masih rusak.
    expect(rows[0].pesan_gagal).toBeNull()
  })

  it('menghitung ulang BOLEH diulang — hasilnya sama', async () => {
    const tdb = createTenantDb(companyId)
    await segarkanKesehatanAlur(tdb, alurId)
    const { rows: a } = await db.query(
      `SELECT kesehatan, jalan_terakhir FROM otomasi_alur WHERE id = $1`, [alurId])
    await segarkanKesehatanAlur(tdb, alurId)
    const { rows: b } = await db.query(
      `SELECT kesehatan, jalan_terakhir FROM otomasi_alur WHERE id = $1`, [alurId])
    expect(b[0].kesehatan).toBe(a[0].kesehatan)
    expect(b[0].jalan_terakhir).toEqual(a[0].jalan_terakhir)
  })

  it('jejak tenant LAIN tak ikut terhitung', async () => {
    const { rows: pemilik } = await db.query(
      `SELECT owner_user_id FROM companies WHERE id = $1`, [companyId])
    const { rows: lain } = await db.query(
      `INSERT INTO companies (code, name, owner_user_id) VALUES ($1,$2,$3) RETURNING id`,
      [`uji-s7-${Date.now()}`, '[UJI-S7] Tenant Lain', pemilik[0].owner_user_id])

    const { rows: alurLain } = await db.query(
      `INSERT INTO otomasi_alur (company_id, kode, nama) VALUES ($1,'uji-s7-lain','Lain')
       RETURNING id`, [lain[0].id])
    await db.query(
      `INSERT INTO otomasi_jalan (company_id, alur_id, status) VALUES ($1,$2,'gagal')`,
      [lain[0].id, alurLain[0].id])

    // Disegarkan dari tenant KITA — alur milik tenant lain tak boleh tersentuh.
    await segarkanKesehatanAlur(createTenantDb(companyId), alurLain[0].id)
    const { rows } = await db.query(
      `SELECT kesehatan FROM otomasi_alur WHERE id = $1`, [alurLain[0].id])
    expect(rows[0].kesehatan).toBe('belum_diketahui')

    await db.query(`DELETE FROM otomasi_alur WHERE company_id = $1`, [lain[0].id])
    await db.query(`UPDATE companies SET is_active = false WHERE id = $1`, [lain[0].id])
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { buatKunci } from '../../../lib/api-key.js'
import otomasiUmpanRoutes from '../otomasi-umpan.js'

/**
 * UMPAN n8n — pintu masuk read-only untuk workflow otomasi.
 *
 * Yang dijaga di sini bukan bentuk JSON-nya, melainkan tiga hal yang kalau
 * salah TIDAK menghasilkan galat apa pun:
 *
 *   1. Kunci API benar-benar jadi gerbang. Rute yang lupa `requireApiKey`
 *      tetap menjawab 200 — dan seluruh data tenant terbuka ke siapa saja
 *      yang tahu URL-nya.
 *
 *   2. Kolom yang di-`.select()` BENAR-BENAR ADA. Versi pertama berkas rute
 *      menyaring `company_id` pada `invoices`/`milestones`/`progress_logs` —
 *      ketiganya tak punya kolom itu. Gejalanya bukan crash, melainkan umpan
 *      kosong permanen: alur n8n "berhasil" tiap hari tanpa mengirim apa pun.
 *
 *   3. Jenis karangan ditolak. Alur yang salah ketik harus tahu sebabnya,
 *      bukan menerima daftar kosong yang terlihat sah.
 */

const PENANDA = `__uji_umpan_${process.pid}__`

let app: FastifyInstance
let db: Client
let kunciSah: string
let idKunci: string
let companyId: string

const panggil = (jenis: string, kunci?: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/umpan/${jenis}`,
    headers: kunci ? { 'x-api-key': kunci } : {},
  })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register(otomasiUmpanRoutes)
  await app.ready()

  db = await createRlsClient()

  const { rows } = await db.query(
    `SELECT c.id FROM companies c
      WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1`,
  )
  companyId = rows[0].id

  const k = buatKunci()
  kunciSah = k.kunci
  const ins = await db.query(
    `INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, izin, kedaluwarsa_pada)
     VALUES ($1,$2,$3,$4,$5,$6, now() + interval '1 day') RETURNING id`,
    // `keperluan` wajib >= 10 karakter (`chk_api_key_keperluan`) — kunci
    // tanpa alasan yang bisa dibaca adalah kunci yang tak berani dicabut
    // siapa pun nanti.
    [companyId, PENANDA, 'kunci uji otomatis untuk umpan n8n', k.hash, k.awalan, ['otomasi:umpan:baca']],
  )
  idKunci = ins.rows[0].id
}, 60_000)

afterAll(async () => {
  if (idKunci) await db.query('DELETE FROM api_key WHERE id=$1', [idKunci])
  await db?.end()
  await app?.close()
})

describe('Gerbang kunci API', () => {
  it('tanpa header X-API-Key ditolak 401', async () => {
    const r = await panggil('ringkasan-harian')
    expect(r.statusCode).toBe(401)
  }, 30_000)

  it('kunci karangan ditolak 401 — dan TIDAK membocorkan sebabnya', async () => {
    const r = await panggil('ringkasan-harian', 'plk_kunci_yang_tidak_pernah_ada')
    expect(r.statusCode).toBe(401)
    // Pesan penolakan seragam: membedakan "tak dikenal" dari "kedaluwarsa"
    // sudah mengkonfirmasi kunci itu pernah ada.
    expect(JSON.parse(r.body).error).not.toMatch(/kedaluwarsa|dicabut/i)
  }, 30_000)

  it('kunci yang DICABUT ditolak meski bentuknya benar', async () => {
    // Kunci SENDIRI, bukan `kunciSah`.
    //
    // Percobaan pertama mencabut `kunciSah` lalu menghidupkannya kembali, dan
    // basis menolak: trigger membuat pencabutan TAK BISA dibatalkan ("Kunci
    // yang sudah dicabut tak bisa dihidupkan kembali"). Itu perilaku yang
    // benar — kunci yang bisa dihidupkan ulang berarti pencabutan bukan
    // jaminan apa pun. Test yang menyesuaikan diri, bukan basisnya.
    //
    // Akibat percobaan itu: sembilan test lain ikut merah karena kunci
    // bersamanya tinggal mati. Kunci sekali-pakai menutup ketergantungan itu.
    const k = buatKunci()
    const ins = await db.query(
      `INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, izin, kedaluwarsa_pada)
       VALUES ($1,$2,$3,$4,$5,$6, now() + interval '1 day') RETURNING id`,
      [companyId, `${PENANDA}_cabut`, 'kunci sekali-pakai untuk uji pencabutan',
        k.hash, k.awalan, ['otomasi:umpan:baca']],
    )
    const idSekaliPakai = ins.rows[0].id

    try {
      // Sah dulu — supaya 401 sesudahnya terbukti berasal dari pencabutan,
      // bukan dari kunci yang memang tak pernah sah.
      expect((await panggil('ringkasan-harian', k.kunci)).statusCode).toBe(200)

      // `alasan_cabut` wajib ikut (`chk_api_key_cabut_beralasan`).
      await db.query(
        `UPDATE api_key SET dicabut_pada=now(), alasan_cabut=$2 WHERE id=$1`,
        [idSekaliPakai, 'dicabut oleh test gerbang kunci'],
      )
      expect((await panggil('ringkasan-harian', k.kunci)).statusCode).toBe(401)
    } finally {
      await db.query('DELETE FROM api_key WHERE id=$1', [idSekaliPakai])
    }
  }, 30_000)
})

describe('Jenis umpan', () => {
  it('jenis karangan ditolak 404 dan MENYEBUT yang tersedia', async () => {
    const r = await panggil('jenis-yang-tak-pernah-ada', kunciSah)
    expect(r.statusCode).toBe(404)
    const b = JSON.parse(r.body)
    expect(Array.isArray(b.tersedia)).toBe(true)
    expect(b.tersedia.length).toBeGreaterThan(0)
  }, 30_000)

  /**
   * Inilah test yang menangkap cacat kolom-karangan.
   *
   * Query dengan kolom yang tak ada SELALU gagal di PostgREST. Rute melempar,
   * jadi statusnya BUKAN 200 — dan itu yang diperiksa di sini untuk KELIMA
   * jenis sekaligus. Memeriksa satu jenis saja tak cukup: tiap jenis menyentuh
   * tabel berbeda dengan bentuk tenancy yang berbeda pula.
   */
  it.each([
    'invoice-terlambat',
    'persetujuan-tertahan',
    'ncr-belum-ditutup',
    'milestone-terlambat',
    'ringkasan-harian',
  ])('umpan %s menjawab 200 dengan bentuk yang dibaca n8n', async (jenis) => {
    const r = await panggil(jenis, kunciSah)
    expect(r.statusCode, r.body).toBe(200)

    const b = JSON.parse(r.body)
    expect(b.jenis).toBe(jenis)
    expect(typeof b.jml).toBe('number')
    expect(Array.isArray(b.baris)).toBe(true)
    // `jml` HARUS cocok dengan panjang baris. Kalau tidak, simpul "Susun
    // pesan" di n8n berhenti pada `!d.jml` padahal ada isinya — alur diam
    // tanpa satu pun galat.
    expect(b.jml).toBe(b.baris.length)
  }, 30_000)

  it('umpan berjenjang membawa TINGKAT eskalasi, bukan cuma umur', async () => {
    const r = await panggil('invoice-terlambat', kunciSah)
    expect(r.statusCode).toBe(200)
    const b = JSON.parse(r.body)
    // Ambang eskalasi adalah KEBIJAKAN dan harus diputuskan di sini, bukan di
    // n8n — kalau `tingkat` hilang, alur n8n terpaksa menghitung sendiri, dan
    // dua tempat yang memutuskan hal sama akan berselisih diam-diam.
    for (const baris of b.baris) {
      expect(['pic', 'manajer', 'direktur']).toContain(baris.tingkat)
      expect(typeof baris.umur_hari).toBe('number')
    }
  }, 30_000)
})

describe('Isolasi tenant', () => {
  /**
   * Kunci menentukan tenant — bukan sesi manusia, karena tak ada manusia di
   * jalur ini. Kalau saringan tenant hilang dari salah satu query, tenant A
   * menerima daftar tagihan tenant B lewat WhatsApp, tanpa galat apa pun.
   */
  it('umpan hanya memuat proyek milik company pemegang kunci', async () => {
    const r = await panggil('milestone-terlambat', kunciSah)
    expect(r.statusCode).toBe(200)
    const b = JSON.parse(r.body)
    if (b.jml === 0) return

    const { rows } = await db.query(
      `SELECT p.name FROM projects p WHERE p.company_id=$1 AND p.is_deleted=false`,
      [companyId],
    )
    const namaSah = new Set(rows.map((x: { name: string }) => x.name))
    for (const baris of b.baris) {
      if (baris.proyek) expect(namaSah.has(baris.proyek)).toBe(true)
    }
  }, 30_000)

  /**
   * Test di atas TIDAK CUKUP, dan itu dibuktikan dengan mutasi.
   *
   * Menghapus saringan tenant dari sebuah umpan membuatnya memuat SELURUH
   * tenant — dan test di atas tetap hijau, karena tenant lain di basis dev
   * kebetulan tak punya baris yang memenuhi syarat. "Kebetulan tak ada data"
   * adalah dasar yang rapuh untuk menyatakan isolasi bekerja.
   *
   * Test ini MENANAM datanya sendiri: satu kasbon tertahan milik company
   * LAIN. Kalau saringan tenant hilang, baris itu ikut muncul dan test ini
   * merah.
   *
   * ── Kenapa kasbon, bukan milestone
   *
   * `milestones` menempel ke tenant lewat `projects`, dan `projects.client_id`
   * NOT NULL menyeret `clients` yang sendiri menuntut `client_type` +
   * `created_by`. Menanam satu baris jadi menuntut empat tabel, dan test yang
   * menyentuh empat tabel master lebih mungkin gagal karena setup-nya sendiri
   * daripada karena cacat yang diburunya.
   *
   * `kasbons` punya `company_id` LANGSUNG — satu insert, satu tabel.
   */
  it('kasbon tertahan milik company LAIN tidak pernah ikut terbawa', async () => {
    const { rows: lain } = await db.query(
      'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId],
    )
    if (!lain[0]) return // basis satu-tenant: tak ada yang bisa bocor

    const keperluanPenanda = `${PENANDA}_kasbon_tenant_lain`
    let idKasbonLain: string | null = null

    try {
      // `requested_by` NOT NULL → dipinjam dari user mana pun yang ada.
      // Nilainya tak diperiksa umpan; yang diuji hanyalah company-nya.
      const { rows: u } = await db.query('SELECT id FROM users LIMIT 1')
      if (!u[0]) return

      const k = await db.query(
        `INSERT INTO kasbons
           (company_id, amount, purpose, fund_source, requested_by, status, kasbon_date, created_at)
         VALUES ($1, 12345, $2, 'owner_advance', $3, 'pending', current_date, now() - interval '10 days')
         RETURNING id`,
        [lain[0].id, keperluanPenanda, u[0].id],
      )
      idKasbonLain = k.rows[0].id

      const r = await panggil('persetujuan-tertahan', kunciSah)
      expect(r.statusCode, r.body).toBe(200)
      const b = JSON.parse(r.body)
      const bocor = (b.baris as Array<{ keperluan?: string }>)
        .filter((x) => x.keperluan === keperluanPenanda)
      expect(bocor, 'kasbon tenant lain ikut terbawa ke umpan').toHaveLength(0)
    } finally {
      if (idKasbonLain) await db.query('DELETE FROM kasbons WHERE id=$1', [idKasbonLain])
    }
  }, 30_000)
})

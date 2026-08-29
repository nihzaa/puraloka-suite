/**
 * Triase harga draft — 81 baris yang sebenarnya SATU keputusan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAWAB ENDPOINT INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `RATIFIKASI.md` E10 mencatat "81 harga draft" menunggu founder. Alasannya
 * benar — harga yang diaktifkan dipakai menawar pekerjaan nyata. Angkanya yang
 * menyesatkan.
 *
 * Diukur 2026-08-13: 78 identik dengan yang sudah aktif, 2 belum punya harga
 * aktif (keduanya beton yang sama), 1 benar-benar berbeda.
 *
 * Yang membuat E10 terasa berat bukan jumlah putusannya, melainkan tak adanya
 * cara melihat mana yang perlu diputuskan.
 *
 * Yang diuji di sini: PENGGOLONGANNYA benar, dan endpoint ini TIDAK MENULIS
 * apa pun — harga yang diaktifkan mesin diam-diam tak pernah terlihat salah
 * sampai penawarannya kalah, atau menang dengan margin negatif.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import priceBookRoutes from '../price-book.js'

let app: FastifyInstance
let db: Client
let companyId: string
let userId: string
let resSama: string
let resBeda: string
let resBaru: string

const TANDA = 'UJI-TRIASE'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  // ── Harga AKTIF sengaja TAK BISA dibersihkan, dan itu benar ──────────────
  //
  // Dua trigger menolaknya, keduanya beralasan:
  //   • 104 — "berstatus active tidak boleh dihapus, Estimate Item mungkin
  //     merujuknya. Expire-kan, jangan hapus."
  //   • transisi status maju-saja: draft→verified→active→expired
  //
  // Versi pertama test ini mencoba menghapus, lalu mencoba menurunkan status,
  // dan gagal keras di keduanya. Yang salah asumsi test-nya.
  //
  // Jalan yang dipakai sekarang: harga uji ditinggalkan sebagai `expired` —
  // status akhir yang sah, tak dipakai `price-resolver.ts` (hanya `active`),
  // dan tak mengganggu triase (hanya `draft`). Draft-nya sendiri boleh dihapus.
  await db.query(
    `DELETE FROM price_book_entries WHERE supplier = $1 AND status = 'draft'`, [TANDA])
  await db.query(
    `UPDATE price_book_entries SET status = 'expired'
      WHERE supplier = $1 AND status = 'active'`, [TANDA])
}

/**
 * Resource yang dipinjam — yang tak punya harga `active` MAUPUN `draft`.
 *
 * ── Kenapa BUKAN "belum punya harga apa pun" (diperbaiki 2026-08-14)
 *
 * Versi sebelumnya menuntut resource yang perawan: `NOT EXISTS (… p.resource_id
 * = r.id)`, tanpa memandang status. Syarat itu tak pernah bisa dipenuhi dua
 * kali oleh resource yang sama, karena `bersihkan()` meninggalkan harga uji
 * sebagai `expired` — dan trigger 104 melarang menghapusnya (hanya `draft`
 * yang boleh dibuang; entry ter-verify mengemban attestation dan jejak harga
 * historis).
 *
 * Jadi setiap run menelan tiga resource secara permanen. Diukur 2026-08-14:
 * 79 baris `UJI-TRIASE` tertinggal, dan resource aktif tanpa harga tinggal
 * **0 dari 2.830**. Test-nya berhenti dengan "fixture tak terbentuk" — bukan
 * karena kodenya salah, melainkan karena ia menghabiskan bahan bakunya sendiri
 * selama berhari-hari, tanpa satu pun galat sampai stoknya benar-benar nol.
 *
 * ── Kenapa pelonggaran ini SAHIH, bukan sekadar membuat merah jadi hijau
 *
 * Yang diuji endpoint ini adalah penggolongan draft terhadap harga AKTIF:
 * `duplikat` (draft = aktif), `berbeda` (draft ≠ aktif), `baru` (tak ada
 * aktif). Harga `expired` tak masuk hitungan mana pun — `price-resolver.ts`
 * hanya membaca `active`, dan triase hanya membaca `draft`.
 *
 * Maka resource dengan sisa `expired` adalah papan tulis yang bersih untuk
 * ketiga golongan itu. Yang WAJIB dijauhi hanya `active` (mengacaukan
 * pembanding) dan `draft` (masuk ke daftar triase sebagai baris asing).
 *
 * Efek sampingnya: stok jadi berdaur ulang — resource yang dipinjam run
 * sebelumnya memenuhi syarat lagi. Diukur sesudah perbaikan: 80 resource
 * memenuhi, hampir seluruhnya justru yang dulu terpakai.
 *
 * Membersihkan residunya lewat migrasi sempat dicoba dan DITOLAK oleh trigger
 * 104 — pagarnya benar dan tak dilemahkan demi kenyamanan test (Ember [C]).
 */
async function pinjamResource(lewati: string[]): Promise<string> {
  const { rows } = await db.query(
    `SELECT r.id FROM resources r
      WHERE r.status = 'active'
        AND NOT (r.id = ANY($1::uuid[]))
        AND NOT EXISTS (
          SELECT 1 FROM price_book_entries p
           WHERE p.resource_id = r.id AND p.status IN ('active', 'draft'))
      LIMIT 1`, [lewati])
  if (!rows.length) {
    throw new Error(
      'tak ada resource tanpa harga active/draft — fixture tak terbentuk. ' +
      'Kalau ini muncul, periksa apakah ada test lain yang meninggalkan draft.',
    )
  }
  return rows[0].id as string
}

async function buatHarga(resourceId: string, amount: number, status: string) {
  // `supplier` dipakai sebagai penanda milik test — itu satu-satunya kolom
  // teks bebas yang tak mengubah arti harganya.
  // `verified_by`/`verified_at` WAJIB untuk status non-draft — CHECK
  // `price_book_verified_trace`. Pagar yang benar: harga yang dipakai
  // menghitung penawaran harus bisa ditelusuri siapa yang mengesahkannya.
  const verified = status === 'draft' ? [null, null] : [userId, new Date().toISOString()]
  await db.query(
    `INSERT INTO price_book_entries (resource_id, amount, currency, version_number,
                                     effective_date, status, supplier, company_id, created_by,
                                     verified_by, verified_at)
     VALUES ($1, $2, 'IDR', 1, '2026-01-01', $3, $4, $5, $6, $7, $8)`,
    [resourceId, amount, status, TANDA, companyId, userId, verified[0], verified[1]])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  userId = u[0].id
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 AND is_default AND is_active LIMIT 1', [userId])
  companyId = co[0].company_id

  await bersihkan()

  // Tiga keadaan yang HARUS dibedakan — dibuat sendiri, bukan mengandalkan
  // data dev yang bisa berubah.
  resSama = await pinjamResource([])
  await buatHarga(resSama, 100_000, 'active')
  await buatHarga(resSama, 100_000, 'draft')

  resBeda = await pinjamResource([resSama])
  await buatHarga(resBeda, 100_000, 'active')
  await buatHarga(resBeda, 150_000, 'draft')

  resBaru = await pinjamResource([resSama, resBeda])
  await buatHarga(resBaru, 75_000, 'draft')

  app = Fastify({ logger: false })
  await app.register(priceBookRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

type BarisTriase = {
  id: string
  resource: { id: string; code: string; name: string } | null
  draft_amount: number
  aktif_amount: number | null
  selisih_pct: number | null
}

/** Cari baris milik satu resource. Melempar bila tak ada — `undefined` yang
 *  diteruskan diam-diam membuat kegagalan berikutnya membingungkan. */
const cari = (daftar: BarisTriase[], id: string, perihal: string): BarisTriase => {
  const b = daftar.find((x) => x.resource?.id === id)
  if (!b) throw new Error(`${perihal}: baris untuk resource ${id} tak ditemukan`)
  return b
}

describe('penggolongan draft', () => {
  it('draft yang SAMA dengan aktif masuk `duplikat`', async () => {
    const r = await get('/api/v1/cecep/price-book/draft-triase')
    expect(r.statusCode, r.body).toBe(200)

    const j = r.json()
    const b = cari(j.duplikat, resSama, 'draft identik tak digolongkan duplikat')
    expect(b.draft_amount).toBe(100_000)
    expect(b.aktif_amount).toBe(100_000)
    expect(b.selisih_pct).toBe(0)
  })

  it('draft yang BERBEDA masuk `berbeda`, beserta selisih persennya', async () => {
    const j = (await get('/api/v1/cecep/price-book/draft-triase')).json()
    const b = cari(j.berbeda, resBeda, 'draft berbeda tak digolongkan berbeda')
    expect(b.draft_amount).toBe(150_000)
    expect(b.aktif_amount).toBe(100_000)
    // +50% — dihitung di server supaya UI tak mengulang rumus, dan pembagi
    // nol dijaga di satu tempat.
    expect(b.selisih_pct).toBe(50)
  })

  it('draft yang resource-nya BELUM punya harga aktif masuk `baru`', async () => {
    const j = (await get('/api/v1/cecep/price-book/draft-triase')).json()
    const b = cari(j.baru, resBaru, 'draft tanpa pembanding tak digolongkan baru')
    // `null`, BUKAN nol: tak ada pembanding berbeda dari pembanding bernilai
    // nol, dan UI harus bisa membedakannya.
    expect(b.aktif_amount).toBeNull()
    expect(b.selisih_pct).toBeNull()
  })

  it('tiga golongan itu SALING LEPAS — satu draft tak muncul dua kali', async () => {
    const j = (await get('/api/v1/cecep/price-book/draft-triase')).json()
    const semua = [...j.duplikat, ...j.baru, ...j.berbeda].map((x: { id: string }) => x.id)
    expect(new Set(semua).size, 'ada draft yang tergolong ganda').toBe(semua.length)
    expect(semua.length).toBe(j.total)
  })

  it('ringkas cocok dengan panjang daftarnya', async () => {
    const j = (await get('/api/v1/cecep/price-book/draft-triase')).json()
    expect(j.ringkas.duplikat).toBe(j.duplikat.length)
    expect(j.ringkas.baru).toBe(j.baru.length)
    expect(j.ringkas.berbeda).toBe(j.berbeda.length)
  })

  it('`berbeda` diurut selisih TERBESAR lebih dulu', async () => {
    // Yang paling menyimpang paling mungkin salah ketik, dan paling mahal
    // kalau lolos.
    const resJauh = await pinjamResource([resSama, resBeda, resBaru])
    await buatHarga(resJauh, 100_000, 'active')
    await buatHarga(resJauh, 900_000, 'draft')

    const j = (await get('/api/v1/cecep/price-book/draft-triase')).json()
    expect(j.berbeda.length).toBeGreaterThanOrEqual(2)

    // Yang BARU dibuat menyimpang +800% — jauh di atas +50% milik `resBeda`.
    // Ia HARUS di posisi pertama, bukan sekadar "urutannya tidak menurun":
    // versi pertama test ini memakai `>=` antar dua baris berdekatan, dan
    // mutasi yang MEMBALIK urutan tetap lolos karenanya.
    const teratas = j.berbeda[0]
    expect(Math.abs(teratas.selisih_pct),
      'yang paling menyimpang tak di urutan teratas').toBe(800)

    // Dan seluruh daftar memang menurun.
    for (let i = 1; i < j.berbeda.length; i++) {
      expect(Math.abs(j.berbeda[i - 1].selisih_pct ?? 0))
        .toBeGreaterThanOrEqual(Math.abs(j.berbeda[i].selisih_pct ?? 0))
    }
  })
})

describe('tidak menulis apa pun', () => {
  it('status draft TETAP draft sesudah dipanggil berkali-kali', async () => {
    // Endpoint yang menggolongkan tak boleh diam-diam menerapkan: harga yang
    // diaktifkan mesin dipakai menawar pekerjaan, dan salahnya baru terlihat
    // saat penawaran kalah — atau menang dengan margin negatif.
    const hitung = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n FROM price_book_entries
          WHERE supplier = $1 AND status = 'draft'`, [TANDA])
      return rows[0].n as number
    }
    const sebelum = await hitung()

    await get('/api/v1/cecep/price-book/draft-triase')
    await get('/api/v1/cecep/price-book/draft-triase')

    expect(await hitung(), 'endpoint triase mengubah status draft').toBe(sebelum)
  })
})

describe('harga USANG — yang menang atas harga baru', () => {
  it('menandai harga berlokasi yang usang sebagai `menang_atas_umum`', async () => {
    // Inti endpoint ini. Harga LOKAL yang tua MENANG atas harga umum yang
    // baru (`price-resolver.ts:8-10` — lokasi persis menang, tanggal hanya
    // tie-break). Jadi harga Bandung 2019 mengalahkan harga umum 2026, dan
    // gejalanya penawaran yang terlalu murah — bukan galat.
    const r = await get('/api/v1/cecep/price-book/usang?tahun=2020')
    expect(r.statusCode, r.body).toBe(200)

    const j = r.json()
    expect(j.ambang_tahun).toBe(2020)
    expect(Array.isArray(j.per_lokasi)).toBe(true)

    const lokal = j.per_lokasi.filter((x: { lokasi: string }) => x.lokasi !== '(umum)')
    for (const l of lokal) {
      expect(l.menang_atas_umum,
        `lokasi "${l.lokasi}" tak ditandai menang atas umum`).toBe(true)
    }
    const umum = j.per_lokasi.find((x: { lokasi: string }) => x.lokasi === '(umum)')
    if (umum) expect(umum.menang_atas_umum).toBe(false)
  })

  it('ambang tahun benar-benar menyaring', async () => {
    const luas = (await get('/api/v1/cecep/price-book/usang?tahun=2030')).json()
    const sempit = (await get('/api/v1/cecep/price-book/usang?tahun=2000')).json()

    expect(luas.total).toBeGreaterThanOrEqual(sempit.total)

    // Ambang 2000 harus menyaring HABIS: nol harga di basis ini berlaku
    // sebelum tahun 2000. Versi pertama test ini cuma membandingkan dua
    // angka satu sama lain, jadi mutasi yang MENGHAPUS saringannya tetap
    // lolos — keduanya jadi sama besar, dan `>=` menerima itu.
    expect(sempit.total, 'saringan tahun tak berlaku').toBe(0)
    expect(luas.total, 'ambang longgar seharusnya menemukan harga usang')
      .toBeGreaterThan(0)
  })

  it('per_lokasi diurut jumlah TERBANYAK lebih dulu', async () => {
    const j = (await get('/api/v1/cecep/price-book/usang?tahun=2030')).json()
    for (let i = 1; i < j.per_lokasi.length; i++) {
      expect(j.per_lokasi[i - 1].jumlah).toBeGreaterThanOrEqual(j.per_lokasi[i].jumlah)
    }
  })

  it('TIDAK menulis apa pun', async () => {
    const hitung = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n FROM price_book_entries WHERE status = 'active'`)
      return rows[0].n as number
    }
    const sebelum = await hitung()
    await get('/api/v1/cecep/price-book/usang?tahun=2030')
    expect(await hitung(), 'endpoint usang mengubah data').toBe(sebelum)
  })
})

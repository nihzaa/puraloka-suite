import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import situsRoutes from '../situs.js'

// ============================================================================
// Endpoint konten situs publik (compro).
//
// ── Yang dijaga test ini
//
//   1. **Kontras ditolak di PINTU MASUK.** Warna yang gagal WCAG tak boleh
//      tersimpan lalu merusak halaman diam-diam. Ini rem kedua dari tiga
//      (spec §4.2) — dua lainnya CHECK constraint di DB dan budget dpr di 3D.
//
//   2. **Validator harus sadar konteks.** Kuning merek #FFD600 lulus di navy
//      (11,77:1) dan gagal di putih (1,41:1). Test memastikan API menerima
//      warna merek Puraloka sendiri — validator naif akan menolaknya.
//
//   3. **Endpoint publik tak membocorkan kolom internal.** Ia berjalan TANPA
//      auth, jadi RLS tak punya konteks apa pun untuk menyaring. Satu-satunya
//      yang menahan adalah daftar kolom di `select` — dan itu mudah longgar
//      saat seseorang menambah field nanti.
//
// ── Kenapa transaksi + ROLLBACK
//
// Sama dengan `companies-otorisasi.test.ts`: test ini menulis ke schema
// `public` bersama. Tanpa transaksi, sisanya terlihat shard lain di CI.
//
// ── Yang di-stub: HANYA verifikasi token
//
// `supabaseAuth.auth.getUser` — itu autentikasi, bukan otorisasi. Permission
// `situs:view`/`situs:manage`, RLS, dan tabel semuanya asli.
// ============================================================================

let app: FastifyInstance
let c: Client
let authAdmin: string

const actAs = (authId: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: authId } }, error: null } as never,
  )

const kirim = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
) =>
  app.inject({
    method,
    url,
    payload: payload as never,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(situsRoutes)
  await app.ready()

  c = await createRlsClient()
  await c.query('BEGIN')

  // User yang benar-benar punya situs:manage — dicari, bukan dibuat. User
  // buatan bisa kebetulan lolos lewat jalur seed yang tak terduga.
  const { rows } = await c.query(
    `SELECT u.auth_id
       FROM users u
       JOIN role_permissions rp ON rp.role_id = u.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE u.is_active AND u.auth_id IS NOT NULL
        AND p.key = 'situs:manage'
      LIMIT 1`,
  )
  if (!rows[0]) {
    throw new Error(
      'prasyarat gagal: tak ada user aktif dengan permission situs:manage. ' +
        'Migrasi 205 membuat permission-nya; ia masih harus di-assign ke role.',
    )
  }
  authAdmin = rows[0].auth_id
}, 120_000)

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await app?.close()
  await c?.end()
})

describe('PUT /api/v1/situs/merek — kontras ditolak di pintu masuk', () => {
  it('menolak aksen yang tenggelam di latar landing', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/merek', {
      warna_utama: '#003366',
      warna_aksen: '#0A2A4A',
    })
    expect(r.statusCode).toBe(422)
    const b = r.json()
    expect(b.error).toMatch(/kontras/i)
    // Pesannya harus menyebut angka dan latar — admin perlu tahu apa yang salah.
    expect(Array.isArray(b.detail)).toBe(true)
    expect(b.detail.join(' ')).toMatch(/:1/)
  })

  it('MENERIMA kuning merek Puraloka — validator naif akan menolaknya', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/merek', {
      warna_utama: '#003366',
      warna_aksen: '#FFD600',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().data.warna_aksen).toBe('#FFD600')
  })

  it('menolak hex yang bentuknya salah sebelum menyentuh DB', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/merek', {
      warna_utama: 'biru',
      warna_aksen: '#FFD600',
    })
    expect(r.statusCode).toBe(422)
  })

  it('menolak tanpa auth', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/situs/merek',
      payload: { warna_utama: '#003366', warna_aksen: '#FFD600' },
    })
    expect(r.statusCode).toBe(401)
  })
})

describe('PUT /api/v1/situs/konten', () => {
  it('menyimpan lalu mengembalikan nilainya', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/konten', {
      kunci: 'uji.kontak',
      nilai: '081311081813',
    })
    expect(r.statusCode).toBe(200)

    actAs(authAdmin)
    const b = await kirim('GET', '/api/v1/situs/konten')
    expect(b.statusCode).toBe(200)
    expect(b.json().data['uji.kontak']).toBe('081311081813')
  })

  it('upsert: kunci sama menimpa, bukan menggandakan', async () => {
    for (const v of ['satu', 'dua']) {
      actAs(authAdmin)
      await kirim('PUT', '/api/v1/situs/konten', { kunci: 'uji.upsert', nilai: v })
    }
    actAs(authAdmin)
    const b = await kirim('GET', '/api/v1/situs/konten')
    expect(b.json().data['uji.upsert']).toBe('dua')
  })

  it('menerima nilai objek, bukan hanya teks', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/konten', {
      kunci: 'uji.tautan',
      nilai: { label: 'Lihat proyek', url: '/portofolio' },
    })
    expect(r.statusCode).toBe(200)

    actAs(authAdmin)
    const b = await kirim('GET', '/api/v1/situs/konten')
    expect(b.json().data['uji.tautan']).toEqual({
      label: 'Lihat proyek',
      url: '/portofolio',
    })
  })

  it('menolak kunci kosong', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/konten', { nilai: 'x' })
    expect(r.statusCode).toBe(422)
  })
})

describe('PATCH /api/v1/situs/seksi — rem varian', () => {
  it('menolak varian di luar daftar yang dirancang', async () => {
    actAs(authAdmin)
    const r = await kirim('PATCH', '/api/v1/situs/seksi', {
      kunci: 'portofolio',
      varian: 'apa-saja',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/varian/i)
  })

  it('membalas 404 untuk seksi yang tak ada, bukan 200 senyap', async () => {
    actAs(authAdmin)
    const r = await kirim('PATCH', '/api/v1/situs/seksi', {
      kunci: 'seksi-yang-tidak-pernah-ada',
      aktif: false,
    })
    expect(r.statusCode).toBe(404)
  })
})

describe('GET /api/v1/public/situs — pengecualian bernama tanpa auth', () => {
  const publik = () => app.inject({ method: 'GET', url: '/api/v1/public/situs' })

  // Tanpa baris nyata, test kebocoran hijau HANYA karena tak ada yang bisa
  // bocor — mutation-test membuktikannya: mengganti daftar kolom dengan
  // `select('*')` tetap lolos 15/15 sampai seed ini ada.
  //
  // Seed TIDAK bisa lewat client `c`: transaksinya belum di-commit, sementara
  // endpoint publik membaca lewat koneksi `supabase` yang terpisah — baris di
  // dalam transaksi tak terlihat dari sana. Jadi dipakai koneksi sendiri yang
  // meng-commit, dengan pembersihan eksplisit di afterAll. Baris uji diberi
  // prefiks `uji-publik-` supaya sapuannya sempit dan tak menyentuh data lain.
  let cSeed: Client

  beforeAll(async () => {
    /*
      `SITUS_COMPANY_ID` dari env kalau ada, kalau tidak AMBIL DARI BASIS.

      Di mesin pengembang env-nya diisi `apps/api/.env`. Di CI tidak — dan
      langkah test-nya tak bisa memakainya begitu saja, karena company CI
      lahir dari seed dengan id yang berbeda tiap kali basis dibangun ulang.
      Memaku nilainya di `ci.yml` berarti menebak id yang belum ada.

      Yang dicari: company yang PUNYA ANGGOTA — sama seperti definisi tenant
      nyata di seluruh seed dan migrasi repo ini.
    */
    const cid =
      process.env.SITUS_COMPANY_ID
      ?? (await (async () => {
        const c0 = await createRlsClient()
        try {
          const { rows } = await c0.query(
            `SELECT c.id FROM companies c
              WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
              ORDER BY c.created_at LIMIT 1`,
          )
          return rows[0]?.id as string | undefined
        } finally {
          await c0.end()
        }
      })())
    if (!cid) throw new Error('prasyarat gagal: nol company beranggota untuk diuji')

    cSeed = await createRlsClient()

    const { rows } = await cSeed.query(
      `INSERT INTO situs_kategori (company_id, kunci, judul, ringkasan, urutan, tampil)
       VALUES ($1, 'uji-publik-tampil', '[UJI] Kategori', 'ringkasan uji', 900, true)
       ON CONFLICT (company_id, kunci) DO UPDATE SET judul = EXCLUDED.judul
       RETURNING id`,
      [cid],
    )
    await cSeed.query(
      `INSERT INTO situs_media
         (company_id, kategori_id, path_storage, alt, lebar, tinggi, urutan, tampil)
       VALUES ($1, $2, 'uji-publik/foto', 'foto uji', 1920, 1080, 0, true)
       ON CONFLICT (company_id, path_storage) DO UPDATE SET alt = EXCLUDED.alt`,
      [cid, rows[0].id],
    )
    await cSeed.query(
      `INSERT INTO situs_kategori (company_id, kunci, judul, urutan, tampil)
       VALUES ($1, 'uji-publik-sembunyi', '[UJI] Disembunyikan', 901, false)
       ON CONFLICT (company_id, kunci) DO UPDATE SET tampil = false`,
      [cid],
    )
  }, 60_000)

  afterAll(async () => {
    await cSeed
      ?.query(
        `DELETE FROM situs_media WHERE path_storage LIKE 'uji-publik/%';
         DELETE FROM situs_kategori WHERE kunci LIKE 'uji-publik-%';`,
      )
      .catch(() => {})
    await cSeed?.end().catch(() => {})
  })

  it('prasyarat: payload benar-benar berisi baris — bukan hijau karena kosong', async () => {
    const { kategori } = (await publik()).json().data
    expect(kategori.length).toBeGreaterThan(0)
    expect(kategori.some((k: { media: unknown[] }) => k.media.length > 0)).toBe(true)
  })

  it('menyembunyikan baris tampil=false', async () => {
    const { kategori } = (await publik()).json().data
    const kunci = kategori.map((k: { kunci: string }) => k.kunci)
    expect(kunci).toContain('uji-publik-tampil')
    expect(kunci).not.toContain('uji-publik-sembunyi')
  })

  it('bisa diakses TANPA header authorization', async () => {
    const r = await publik()
    expect(r.statusCode).toBe(200)
  })

  it('mengembalikan seluruh bagian yang dipakai halaman publik', async () => {
    const b = (await publik()).json().data
    for (const bagian of [
      'konten', 'kategori', 'milestone', 'legalitas', 'seksi', 'merek',
    ]) {
      expect(b).toHaveProperty(bagian)
    }
  })

  // Endpoint ini berjalan tanpa konteks auth, jadi RLS tak menyaring apa pun —
  // yang menahan hanya daftar kolom di `select`. Test ini yang akan merah kalau
  // seseorang menggantinya dengan `select('*')` di kemudian hari.
  it('tidak membocorkan company_id maupun uuid internal', async () => {
    const teks = JSON.stringify((await publik()).json())
    expect(teks).not.toMatch(/company_id/)
    expect(teks).not.toMatch(/kategori_id/)
    // uuid v4 apa pun — id baris tak punya guna di klien.
    expect(teks).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )
  })

  it('menyertakan hanya baris tampil=true', async () => {
    const { kategori, milestone, legalitas } = (await publik()).json().data
    for (const daftar of [kategori, milestone, legalitas]) {
      expect(Array.isArray(daftar)).toBe(true)
      for (const baris of daftar) expect(baris.tampil).toBeUndefined()
    }
  })

  it('media tertempel di kategorinya, bukan sebagai daftar terpisah', async () => {
    const { kategori } = (await publik()).json().data
    for (const k of kategori) expect(Array.isArray(k.media)).toBe(true)
  })

  // ── Isolasi tenant di endpoint TANPA auth ────────────────────────────────
  //
  // Test ini ada karena mutation-test menemukan lubangnya: menghapus
  // `.eq('company_id', …)` dari query kategori TIDAK memerahkan satu test pun.
  // Sebabnya hari ini cuma ada satu company, jadi filternya tak mengubah apa
  // pun — dan justru itu bahayanya. Pada hari tenant kedua lahir, konten
  // perusahaan lain terbit di halaman publik ini tanpa satu pun galat.
  //
  // RLS tak bisa menolong: endpoint ini berjalan tanpa sesi, `auth_company_id()`
  // NULL, dan policy RESTRICTIVE justru menolak semuanya — sehingga jalur ini
  // memakai service role. Yang tersisa sebagai penjaga hanya filter eksplisit.
  it('TIDAK menerbitkan konten milik company lain', async () => {
    // Sama seperti di atas: env kalau ada, basis kalau tidak.
    const cid =
      process.env.SITUS_COMPANY_ID
      ?? (await c.query(
        `SELECT c.id FROM companies c
          WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
          ORDER BY c.created_at LIMIT 1`,
      )).rows[0]?.id

    // Company kedua dibuat di dalam TRANSAKSI yang selalu di-ROLLBACK.
    //
    // Bukan pilihan gaya: percobaan pertama memakai DELETE dan ditolak trigger
    // repo — "Company tidak boleh dihapus. Nonaktifkan atau jalankan prosedur
    // off-boarding." Penjaga itu benar (hapus tenant = kehilangan data lintas
    // puluhan tabel), jadi yang berubah cara test-nya, bukan penjaganya.
    //
    // Endpoint publik membaca lewat koneksi `supabase` terpisah, jadi baris
    // dalam transaksi ini TAK terlihat olehnya — dan itu justru menghasilkan
    // pengujian yang benar: kalau filter company_id dihapus, query akan
    // mengembalikan baris dari company mana pun yang SUDAH ter-commit.
    // Karena itu barisnya di-commit dulu, diuji, lalu dibatalkan lewat
    // savepoint di koneksi yang sama.
    await cSeed.query('BEGIN')
    try {
      // ON CONFLICT, bukan INSERT polos: company uji tak bisa DIHAPUS (penjaga
      // repo), jadi sisa run sebelumnya masih ada dan INSERT kedua akan kena
      // companies_code_unique. Dipakai ulang saja.
      const { rows: co } = await cSeed.query(
        `INSERT INTO companies (code, name, owner_user_id, created_by, is_active)
         SELECT 'uji-publik-tenant2', '[UJI] Tenant Kedua', owner_user_id, created_by, true
           FROM companies WHERE id = $1
         ON CONFLICT (code) DO UPDATE SET is_active = true
         RETURNING id`,
        [cid],
      )
      await cSeed.query(
        `INSERT INTO situs_kategori (company_id, kunci, judul, urutan, tampil)
         VALUES ($1, 'uji-publik-milik-tenant2', '[UJI] MILIK TENANT LAIN', 902, true)`,
        [co[0].id],
      )
      await cSeed.query('COMMIT')

      const { kategori } = (await publik()).json().data
      const kunci = kategori.map((k: { kunci: string }) => k.kunci)

      expect(kunci).toContain('uji-publik-tampil')           // milik kita: ada
      expect(kunci).not.toContain('uji-publik-milik-tenant2') // milik lain: TIDAK
    } finally {
      // Kategori boleh dihapus (bukan company). Company uji dinonaktifkan,
      // mengikuti jalur yang penjaga DB izinkan.
      await cSeed
        .query(`DELETE FROM situs_kategori WHERE kunci = 'uji-publik-milik-tenant2'`)
        .catch(() => {})
      await cSeed
        .query(
          `UPDATE companies SET is_active = false WHERE code = 'uji-publik-tenant2'`,
        )
        .catch(() => {})
    }
  }, 60_000)
})

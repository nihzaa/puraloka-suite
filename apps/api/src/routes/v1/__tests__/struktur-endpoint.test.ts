import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import strukturRoutes from '../struktur.js'

/**
 * ANALISA STRUKTUR — rute terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 *
 * Aritmetikanya sudah dikunci 344 test pure di `lib/__tests__/struktur-*` —
 * mengulangnya di sini hanya menambah waktu tanpa menambah bukti. Yang tersisa
 * dan TIDAK bisa dijawab test pure:
 *
 *   • gerbang tenant: rute memakai klien service-role yang MELEWATI RLS, jadi
 *     pemeriksaan tenant ditulis tangan — dan yang ditulis tangan bisa lupa.
 *   • kolom `basi` GENERATED: benar-benar menyala saat input diubah sesudah
 *     dihitung, dan padam sesudah dihitung ulang.
 *   • rekap MENGECUALIKAN elemen basi — angka yang dijumlahkan dari ringkasan
 *     usang salah tanpa gejala.
 *   • elemen yang GAGAL dihitung dilaporkan beserta alasannya, tidak dilewati
 *     diam-diam ("berhasil 18 dari 20" tanpa menyebut yang dua = laporan palsu).
 *   • gambar & volume menghitung batang yang SAMA — selisih antara gambar kerja
 *     dan RAP baru ketahuan di lapangan.
 *
 * Fixture berkode [TEST-ST] dan dibersihkan di awal & akhir.
 * ══════════════════════════════════════════════════════════════════════════════
 */

let app: FastifyInstance
let db: Client
let projectId: string
let companyId: string

const H = { authorization: 'Bearer t' }
const get = (url: string) => app.inject({ method: 'GET', url, headers: H })
const post = (url: string, payload?: Record<string, unknown>) =>
  app.inject({ method: 'POST', url, payload: (payload ?? {}) as never, headers: H })
const patch = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: H })
const del = (url: string) => app.inject({ method: 'DELETE', url, headers: H })

/** Input balok yang lulus semua pemeriksaan — dipakai sebagai dasar. */
const BALOK = {
  bMm: 300, hMm: 520, panjangM: 6, selimutMm: 30,
  dUtamaMm: 16, nTarik: 5, dSengkangMm: 8, jarakSengkangMm: 150,
  mutu: { fcMpa: 25, fyMpa: 400, fysMpa: 240 },
  muKnm: 120, vuKn: 90,
}

async function purge() {
  await db.query(`DELETE FROM struktur_elemen WHERE kode LIKE '[TEST-ST]%'`)
}

/** Buat elemen langsung di basis — melewati rute, untuk menyiapkan keadaan. */
async function seedElemen(
  kode: string, jenis: string, input: Record<string, unknown>, jumlah = 1,
): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO struktur_elemen (company_id, project_id, kode, jenis, jumlah, input)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [companyId, projectId, kode, jenis, jumlah, JSON.stringify(input)],
  )
  return rows[0].id as string
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  /*
    Proyek diambil dari company yang benar-benar punya anggota — bukan dibuat
    baru. `seedProjectContext` tidak menyetel `company_id` proyek, dan trigger
    `fn_struktur_elemen_tenant_cocok` menolak elemen yang company-nya tak sama
    dengan pemilik proyek. Memakai proyek yang sudah utuh menghindari
    menyiapkan tenancy dari nol hanya untuk menguji perhitungan.
  */
  const { rows } = await db.query(`
    SELECT p.id, p.company_id FROM projects p
    WHERE p.company_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = p.company_id)
    LIMIT 1
  `)
  if (!rows.length) throw new Error('tak ada proyek ber-company untuk diuji')
  projectId = rows[0].id
  companyId = rows[0].company_id

  await purge()

  app = Fastify()
  await app.register(strukturRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  try { await purge() } finally {
    await app?.close()
    await db?.end()
  }
})

describe('POST /projects/:id/struktur — buat elemen', () => {
  it('elemen sah dibuat, dan bisa dibaca kembali', async () => {
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] B1', nama: 'Balok induk', jenis: 'balok', input: BALOK,
    })
    expect(r.statusCode).toBe(201)
    const id = r.json().id as string

    const baca = await get(`/api/v1/struktur/${id}`)
    expect(baca.statusCode).toBe(200)
    expect(baca.json().elemen.kode).toBe('[TEST-ST] B1')
    expect(baca.json().hasil.volume.betonM3).toBeCloseTo(0.3 * 0.52 * 6, 9)
  })

  it('input yang tak bisa dihitung DITOLAK sebelum disimpan', async () => {
    /*
      Menyimpan input rusak berarti menaruh baris yang meledak saat dibuka.
      Pesannya harus menyebut medannya — "nTarik minimal 2" bisa ditindak,
      "undefined is not a number" tidak.
    */
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] RUSAK', jenis: 'balok', input: { ...BALOK, nTarik: 1 },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/minimal 2/)

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM struktur_elemen WHERE kode = '[TEST-ST] RUSAK'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('jenis di luar daftar ditolak dengan menyebut yang sah', async () => {
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] X', jenis: 'jembatan', input: BALOK,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/balok/)
  })

  it('kode ganda menjawab 409 dengan kalimat yang bisa dibaca estimator', async () => {
    await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] KEMBAR', jenis: 'balok', input: BALOK,
    })
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] KEMBAR', jenis: 'balok', input: BALOK,
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah dipakai/)
    // "duplicate key value violates unique constraint" bukan kalimat manusia.
    expect(r.json().error).not.toMatch(/duplicate key/)
  })

  it('jumlah nol atau pecahan ditolak', async () => {
    for (const jumlah of [0, -1, 2.5]) {
      const r = await post(`/api/v1/projects/${projectId}/struktur`, {
        kode: `[TEST-ST] J${jumlah}`, jenis: 'balok', input: BALOK, jumlah,
      })
      expect(r.statusCode).toBe(400)
    }
  })
})

describe('gerbang tenant — klien service-role MELEWATI RLS', () => {
  it('proyek milik tenant lain menjawab 404, bukan daftar kosong', async () => {
    /*
      404 dan bukan 403: keberadaan proyek milik orang lain pun bukan
      informasi yang boleh bocor.
    */
    const { rows } = await db.query(`
      SELECT p.id FROM projects p
      WHERE p.company_id IS NOT NULL AND p.company_id <> $1 LIMIT 1
    `, [companyId])
    if (!rows.length) return // tak ada tenant kedua di basis ini

    const r = await get(`/api/v1/projects/${rows[0].id}/struktur`)
    expect(r.statusCode).toBe(404)
  })

  it('elemen milik tenant lain tak bisa dibaca lewat UUID-nya', async () => {
    const { rows } = await db.query(`
      SELECT p.id, p.company_id FROM projects p
      WHERE p.company_id IS NOT NULL AND p.company_id <> $1 LIMIT 1
    `, [companyId])
    if (!rows.length) return

    const { rows: el } = await db.query(
      `INSERT INTO struktur_elemen (company_id, project_id, kode, jenis, jumlah, input)
       VALUES ($1, $2, '[TEST-ST] LAIN', 'balok', 1, $3) RETURNING id`,
      [rows[0].company_id, rows[0].id, JSON.stringify(BALOK)],
    )
    const r = await get(`/api/v1/struktur/${el[0].id}`)
    expect(r.statusCode).toBe(404)
  })
})

describe('kolom `basi` — ringkasan yang tak lagi sesuai inputnya', () => {
  it('menyala saat input diubah sesudah dihitung, padam sesudah dihitung ulang', async () => {
    const id = await seedElemen('[TEST-ST] BASI', 'balok', BALOK)

    // Belum pernah dihitung → basi (dihitung_pada NULL).
    let { rows } = await db.query(`SELECT basi, aman FROM struktur_elemen WHERE id = $1`, [id])
    expect(rows[0].basi).toBe(true)
    expect(rows[0].aman).toBeNull()

    expect((await post(`/api/v1/struktur/${id}/hitung`)).statusCode).toBe(200)
    rows = (await db.query(`SELECT basi, aman FROM struktur_elemen WHERE id = $1`, [id])).rows
    expect(rows[0].basi).toBe(false)
    expect(rows[0].aman).toBe(true)

    // Input diubah → ringkasan lama tak lagi berlaku.
    expect((await patch(`/api/v1/struktur/${id}`, {
      input: { ...BALOK, nTarik: 8 },
    })).statusCode).toBe(200)
    rows = (await db.query(`SELECT basi FROM struktur_elemen WHERE id = $1`, [id])).rows
    expect(rows[0].basi).toBe(true)

    expect((await post(`/api/v1/struktur/${id}/hitung`)).statusCode).toBe(200)
    rows = (await db.query(`SELECT basi FROM struktur_elemen WHERE id = $1`, [id])).rows
    expect(rows[0].basi).toBe(false)
  })

  it('rekap di daftar MENGECUALIKAN elemen basi', async () => {
    await purge()
    const segar = await seedElemen('[TEST-ST] SEGAR', 'balok', BALOK)
    const basi = await seedElemen('[TEST-ST] BASI2', 'balok', BALOK)

    await post(`/api/v1/struktur/${segar}/hitung`)
    await post(`/api/v1/struktur/${basi}/hitung`)
    // Yang kedua dibuat basi lagi dengan mengubah inputnya.
    await patch(`/api/v1/struktur/${basi}`, { input: { ...BALOK, panjangM: 9 } })

    const r = await get(`/api/v1/projects/${projectId}/struktur`)
    const rekap = r.json().rekap
    expect(rekap.jumlahElemen).toBe(2)
    expect(rekap.jumlahBasi).toBe(1)
    /*
      Beton yang dijumlah HANYA milik elemen segar. Kalau yang basi ikut
      terjumlah, angkanya jadi 2× — dan tak ada apa pun di layar yang
      memberi tahu bahwa separuhnya dihitung dari input yang sudah diganti.
    */
    expect(rekap.betonM3).toBeCloseTo(0.3 * 0.52 * 6, 6)
  })
})

describe('POST hitung-semua — kegagalan dilaporkan, bukan dilewati', () => {
  it('menyebut kode DAN alasan tiap elemen yang gagal', async () => {
    await purge()
    await seedElemen('[TEST-ST] OK1', 'balok', BALOK)
    await seedElemen('[TEST-ST] OK2', 'balok', BALOK)
    // Ditanam lewat basis supaya bisa rusak — rute menolaknya di POST.
    await seedElemen('[TEST-ST] GAGAL', 'balok', { ...BALOK, nTarik: 1 })

    const r = await post(`/api/v1/projects/${projectId}/struktur/hitung-semua`)
    expect(r.statusCode).toBe(200)
    expect(r.json().berhasil).toBe(2)
    expect(r.json().gagal).toHaveLength(1)
    expect(r.json().gagal[0].kode).toBe('[TEST-ST] GAGAL')
    expect(r.json().gagal[0].alasan).toMatch(/minimal 2/)
  })
})

describe('GET rekap-volume — angka yang dipakai RAP', () => {
  it('besi dirinci per diameter, bukan hanya totalnya', async () => {
    await purge()
    await seedElemen('[TEST-ST] R1', 'balok', BALOK)
    await seedElemen('[TEST-ST] R2', 'kolom', {
      bMm: 400, hMm: 400, tinggiM: 3.5, selimutMm: 40,
      dUtamaMm: 19, nBarisX: 3, nBarisY: 3, dSengkangMm: 10, jarakSengkangMm: 150,
      mutu: { fcMpa: 30, fyMpa: 400, fysMpa: 240 },
      puKn: 1500, muKnm: 80, sengkang: 'sengkang' as const,
    })

    const r = await get(`/api/v1/projects/${projectId}/struktur/rekap-volume`)
    expect(r.statusCode).toBe(200)
    const rekap = r.json().rekap
    expect(rekap.besiTotalKg).toBeGreaterThan(0)
    /*
      Rincian per diameter adalah SATUAN YANG DIBELI. Total kilogram saja tak
      bisa dipesan ke supplier — D16 dan D19 harganya berbeda.
    */
    const diameter = rekap.besi.map((b: { diameterMm: number }) => b.diameterMm)
    expect(new Set(diameter).size).toBeGreaterThan(1)
    expect(rekap.besi.every((b: { totalKg: number }) => b.totalKg > 0)).toBe(true)
  })

  it('MEMBAWA catatan batas — angka yang 26% kurang tak boleh dikirim polos', async () => {
    /*
      Volume besi Fase 1 tak menghitung panjang penyaluran, kait, dan
      sambungan lewatan. Diukur pada balok 300×520 L=6m: BBS memberi 1,26×
      (terpasang) sampai 1,41× (dibeli).

      Endpoint ini yang dipakai RAP. Angka yang kurang segitu tanpa satu
      kalimat pun keterangan adalah cara paling rapi membuat orang salah:
      terlihat wajar, tak ada galat, dan selisihnya baru ketahuan saat besi
      di lapangan kurang.
    */
    await purge()
    await seedElemen('[TEST-ST] CAT', 'balok', BALOK)

    const r = await get(`/api/v1/projects/${projectId}/struktur/rekap-volume`)
    const catatan = r.json().catatan as string[]
    expect(catatan.length).toBeGreaterThan(0)
    expect(catatan.join(' ')).toMatch(/penyaluran/i)
    expect(catatan.join(' ')).toMatch(/BBS|Bar Bending/i)
  })

  it('catatan yang sama dari banyak elemen muncul SEKALI', async () => {
    await purge()
    await seedElemen('[TEST-ST] C1', 'balok', BALOK)
    await seedElemen('[TEST-ST] C2', 'balok', BALOK)
    await seedElemen('[TEST-ST] C3', 'balok', BALOK)

    const r = await get(`/api/v1/projects/${projectId}/struktur/rekap-volume`)
    const catatan = r.json().catatan as string[]
    // 3 balok, catatan identik → tetap sejumlah catatan unik, bukan 3×.
    expect(new Set(catatan).size).toBe(catatan.length)
  })

  it('DIHITUNG ULANG dari input — kebal terhadap ringkasan basi', async () => {
    await purge()
    const id = await seedElemen('[TEST-ST] RB', 'balok', BALOK)
    await post(`/api/v1/struktur/${id}/hitung`)
    // Panjang digandakan; ringkasan tersimpan masih memakai 6 m.
    await patch(`/api/v1/struktur/${id}`, { input: { ...BALOK, panjangM: 12 } })

    const r = await get(`/api/v1/projects/${projectId}/struktur/rekap-volume`)
    // 12 m, bukan 6 m — rekap membaca input, bukan kolom ringkasan.
    expect(r.json().rekap.betonM3).toBeCloseTo(0.3 * 0.52 * 12, 6)
  })
})

describe('gambar kerja — batang yang tergambar = batang yang ditimbang', () => {
  it('penampang hanya keluar bila diminta', async () => {
    await purge()
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] G1', jenis: 'balok', input: BALOK,
    })
    const id = r.json().id as string

    expect((await get(`/api/v1/struktur/${id}`)).json().gambar).toBeUndefined()

    const dg = await get(`/api/v1/struktur/${id}?gambar=1`)
    expect(dg.json().gambar.penampang).toMatch(/^<svg/)
  })

  it('jumlah lingkaran tulangan di SVG = nTarik + nTekan', async () => {
    /*
      Cacat yang ditangkap test ini: versi pertama menggambar
      `nTarik >= 2 ? 2 : 0` batang atas — angka yang tak muncul di
      perhitungan mana pun. Estimator memesan besi DARI GAMBAR; batang yang
      tergambar tapi tak terhitung adalah selisih yang baru ketahuan setelah
      besinya kurang di lapangan.
    */
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] G2', jenis: 'balok', input: { ...BALOK, nTarik: 5, nTekan: 3 },
    })
    const id = r.json().id as string
    const svg = (await get(`/api/v1/struktur/${id}?gambar=1`)).json().gambar.penampang as string

    // Tulangan digambar sebagai <circle>; sengkang sebagai path/rect.
    const lingkaran = (svg.match(/<circle/g) ?? []).length
    expect(lingkaran).toBe(8)

    // Dan volume menimbang jumlah yang sama.
    const hasil = (await get(`/api/v1/struktur/${id}`)).json().hasil
    const utama = hasil.volume.besi.find((b: { peran: string }) => b.peran === 'utama')
    expect(utama.jumlahBatang).toBe(8)
  })
})

describe('DELETE & PATCH — baris yang lenyap tidak dilaporkan sebagai sukses', () => {
  it('hapus dua kali: yang kedua 404', async () => {
    await purge()
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] D1', jenis: 'balok', input: BALOK,
    })
    const id = r.json().id as string
    expect((await del(`/api/v1/struktur/${id}`)).statusCode).toBe(200)
    expect((await del(`/api/v1/struktur/${id}`)).statusCode).toBe(404)
  })

  it('PATCH ke elemen yang sudah terhapus menjawab 404', async () => {
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] D2', jenis: 'balok', input: BALOK,
    })
    const id = r.json().id as string
    await del(`/api/v1/struktur/${id}`)
    expect((await patch(`/api/v1/struktur/${id}`, { nama: 'baru' })).statusCode).toBe(404)
  })

  it('elemen LENYAP di antara baca dan tulis → 404, bukan 200 palsu', async () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      TEST INI ADA KARENA MUTASI LOLOS.

      Melepas `if (!terubah?.length) → 404` dari PATCH dan dari /hitung
      TIDAK memerahkan satu test pun. Sebabnya: test di atas menghapus
      elemen LEBIH DULU, jadi `ambilElemen` sudah memulangkan null dan
      404-nya datang dari sana — cek nol-baris tak pernah ikut diuji.

      Keadaan yang benar-benar diuji cek itu adalah BALAPAN: baris masih ada
      saat dibaca, sudah hilang saat ditulis. Tanpa cek nol-baris, `{ error }`
      kosong dan rute membalas 200 "tersimpan" atas angka yang tak mendarat
      di mana pun.

      Balapannya dibuat di BASIS, bukan lewat mock: `request.db` dibangun di
      dalam `authenticate`, jadi tak ada modul yang bisa disadap dari luar
      untuk menyisip di antara baca dan tulis. Trigger sekali-pakai
      membatalkan UPDATE (`RETURN NULL`) lalu menghapus barisnya — persis
      keadaan yang mau dibuktikan.
      ══════════════════════════════════════════════════════════════════════
    */
    const r = await post(`/api/v1/projects/${projectId}/struktur`, {
      kode: '[TEST-ST] LENYAP', jenis: 'balok', input: BALOK,
    })
    const id = r.json().id as string

    await db.query(`
      CREATE OR REPLACE FUNCTION uji_struktur_lenyap() RETURNS trigger AS $fn$
      BEGIN
        DELETE FROM struktur_elemen WHERE id = OLD.id;
        RETURN NULL;
      END $fn$ LANGUAGE plpgsql;

      CREATE TRIGGER uji_struktur_lenyap_trg
        BEFORE UPDATE ON struktur_elemen
        FOR EACH ROW WHEN (OLD.kode = '[TEST-ST] LENYAP')
        EXECUTE FUNCTION uji_struktur_lenyap();
    `)

    try {
      expect((await patch(`/api/v1/struktur/${id}`, { nama: 'baru' })).statusCode).toBe(404)

      // Jalur /hitung punya cek yang sama dan harus ikut terjaga.
      const r2 = await post(`/api/v1/projects/${projectId}/struktur`, {
        kode: '[TEST-ST] LENYAP', jenis: 'balok', input: BALOK,
      })
      expect((await post(`/api/v1/struktur/${r2.json().id}/hitung`)).statusCode).toBe(404)
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS uji_struktur_lenyap_trg ON struktur_elemen`)
      await db.query(`DROP FUNCTION IF EXISTS uji_struktur_lenyap()`)
    }
  })
})

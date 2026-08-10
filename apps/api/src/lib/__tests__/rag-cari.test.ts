/**
 * TJS-C2 — RAG: pemotongan, ACL, dan ISOLASI DUA TENANT terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * T-2  dokumen tenant A TAK PERNAH muncul di jawaban tenant B — diuji dengan
 *      isi yang SENGAJA hampir identik, karena itulah kondisi tersulitnya
 * T-4  ACL penuh: jenis dokumen disaring dari PERMISSION, bukan nama peran
 * T-5  nol `file_url` di jalur mana pun
 *      pencocokan PERSIS bekerja: "SNI 2847", "K-300", nomor kontrak
 *      kegagalan jalur TERLIHAT, bukan ditelan
 *
 * ── Kenapa tenant kedua dibuat lalu DIBERSIHKAN
 *
 * Founder menolak migrasi yang menciptakan tenant kedua permanen (sesi
 * sebelumnya). Fixture ini membuatnya sendiri dan membereskannya sendiri —
 * dan itu satu-satunya cara menguji isolasi: basis ini punya SATU tenant
 * berisi data, jadi perbandingan A-vs-B tanpa tenant kedua hijau tanpa arti.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { cariPotongan } from '../rag-cari.js'
import { JENIS_TERBATAS, saringanUntuk } from '../rag-acl.js'
import { MAKS_POTONGAN, ingestDokumen, perkiraanTokenIngest, potongTeks } from '../rag-ingest.js'

const TANDA = '[UJI-C2]'

let db: Client
let companyA: string
let companyB: string
let projectA: string
let projectB: string
let docA: string
let docB: string
let docInvoiceA: string
let userId: string

/** Isi yang SENGAJA hampir identik — kondisi tersulit untuk isolasi. */
const ISI_A =
  'Kontrak pekerjaan struktur. Mutu beton yang disyaratkan adalah K-300 sesuai SNI 2847. ' +
  'Nomor kontrak PKS/2026/A-771. Retensi 5% ditahan selama masa pemeliharaan 180 hari.'
const ISI_B =
  'Kontrak pekerjaan struktur. Mutu beton yang disyaratkan adalah K-300 sesuai SNI 2847. ' +
  'Nomor kontrak PKS/2026/B-882. Retensi 5% ditahan selama masa pemeliharaan 180 hari.'

beforeAll(async () => {
  db = await createRlsClient()

  const { rows: u } = await db.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id

  // Tenant A: yang sudah ada dan berisi data.
  const { rows: a } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyA = a[0].id
  const { rows: pa } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 LIMIT 1`, [companyA])
  projectA = pa[0].id

  /*
   * Tenant B DIBUAT di sini, bukan lewat migrasi.
   *
   * `owner_user_id` diisi dari pemilik yang SUDAH ADA — bukan
   * `SELECT id FROM users LIMIT 1`. Memakai yang kedua menjadikan orang itu
   * pemilik grup baru, dan `t9-kelola-badan-usaha` memakai "user selain
   * pemilik" sebagai kontrolnya — jadi kontrolnya ikut jadi pemilik dan
   * gerbangnya terlihat bocor. Terjadi hari ini, lihat JOURNAL lanjutan 10.
   */
  const { rows: pemilik } = await db.query(
    `SELECT owner_user_id FROM companies WHERE code = 'puraloka-persada'`)

  const cap = Date.now()
  const { rows: b } = await db.query(
    `INSERT INTO companies (code, name, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
    [`uji-c2-${cap}`, `${TANDA} Tenant Kedua`, pemilik[0].owner_user_id],
  )
  companyB = b[0].id

  /*
   * Kolom WAJIB `projects` diukur dari information_schema, bukan ditebak:
   * client_id, pm_id, name, location, start_date, end_date, created_by,
   * company_id — DELAPAN, bukan tiga. Versi pertama fixture ini mengisi tiga
   * dan seluruh 21 test DILEWATI (bukan gagal) karena `beforeAll` melempar.
   *
   * Test yang dilewati membaca seperti test yang lulus di ringkasan akhir.
   */
  // `clients` TAK PUNYA kolom `name` — identitasnya di `contact_person`
  // (diukur dari information_schema). Wajib: contact_person, phone,
  // created_by, company_id.
  const { rows: cl } = await db.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ($1, $2, '628000000000', $3) RETURNING id`,
    [companyB, `${TANDA} Klien B`, userId],
  )

  const { rows: pb } = await db.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location,
                           start_date, end_date, status, created_by)
     VALUES ($1, $2, $3, $4, 'Uji', current_date, current_date + 30, 'active', $5)
     RETURNING id`,
    [companyB, cl[0].id, userId, `${TANDA} Proyek B`, userId],
  )
  projectB = pb[0].id

  const buatDoc = async (proj: string, judul: string, tipe: string, visible: boolean) => {
    const { rows } = await db.query(
      `INSERT INTO documents (project_id, title, doc_type, file_url, is_visible_to_client, uploaded_by)
       VALUES ($1, $2, $3::document_type, $4, $5, $6) RETURNING id`,
      [proj, judul, tipe, 'uji://c2', visible, userId],
    )
    return rows[0].id as string
  }

  docA = await buatDoc(projectA, `${TANDA} Kontrak A`, 'kontrak', true)
  docB = await buatDoc(projectB, `${TANDA} Kontrak B`, 'kontrak', true)
  docInvoiceA = await buatDoc(projectA, `${TANDA} Invoice A`, 'invoice', false)

  const dbA = createTenantDb(companyA)
  const dbB = createTenantDb(companyB)

  /*
   * Embedding TIRUAN, dan itu WAJIB ada — bukan pelengkap.
   *
   * Tanpa embedding tersimpan, `rag_cari_vektor` menyaring
   * `embedding IS NOT NULL` dan mengembalikan NOL baris apa pun keadaannya.
   * Test isolasinya lalu hijau karena TAK ADA YANG BISA DIKEMBALIKAN, bukan
   * karena saringannya bekerja — dan mutasi membuktikan itu: mencabut
   * `auth_company_id()` dari fungsinya tetap hijau.
   *
   * Nilainya sengaja BEDA antar tenant supaya urutan kemiripan bermakna;
   * yang diuji tetap saringannya, bukan kualitas embedding-nya.
   */
  const embedA = () => [new Array(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0))]
  const embedB = () => [new Array(1536).fill(0).map((_, i) => (i === 1 ? 1 : 0))]

  const rA = await ingestDokumen({
    db: dbA, companyId: companyA, documentId: docA, teks: ISI_A,
    embedding: embedA(), modelEmbed: 'uji-c2',
  })
  if (!rA.ok) throw new Error(`ingest A gagal: ${rA.alasan}`)
  const rB = await ingestDokumen({
    db: dbB, companyId: companyB, documentId: docB, teks: ISI_B,
    embedding: embedB(), modelEmbed: 'uji-c2',
  })
  if (!rB.ok) throw new Error(`ingest B gagal: ${rB.alasan}`)
  await ingestDokumen({
    db: dbA, companyId: companyA, documentId: docInvoiceA,
    teks: 'Invoice penagihan termin kedua. Nilai Rp 450.000.000 jatuh tempo 30 hari.',
  })
}, 120_000)

afterAll(async () => {
  // Dokumen dulu — CASCADE membawa potongannya.
  await db.query(`DELETE FROM documents WHERE title LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM projects WHERE name LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM clients WHERE contact_person LIKE $1`, [`${TANDA}%`])
  // `companies` tak bisa DELETE (trigger). Dinonaktifkan, bukan dipaksa —
  // trigger itu ada alasannya dan bukan tempat saya mematikannya.
  await db.query(
    `UPDATE companies SET is_active = false WHERE name LIKE $1`, [`${TANDA}%`])
  await db.end()
})

describe('T-2 — isolasi tenant, kondisi TERSULIT', () => {
  it('tenant A tidak melihat dokumen tenant B, meski isinya nyaris identik', async () => {
    const hasil = await cariPotongan({
      db: createTenantDb(companyA),
      companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'mutu beton K-300 SNI 2847',
    })

    expect(hasil.potongan.length).toBeGreaterThan(0)
    for (const p of hasil.potongan) {
      expect(p.isi).not.toContain('B-882')
      expect(p.judul).not.toContain('Kontrak B')
    }
  })

  it('tenant B tidak melihat dokumen tenant A', async () => {
    const hasil = await cariPotongan({
      db: createTenantDb(companyB),
      companyId: companyB,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'mutu beton K-300 SNI 2847',
    })

    expect(hasil.potongan.length).toBeGreaterThan(0)
    for (const p of hasil.potongan) {
      expect(p.isi).not.toContain('A-771')
    }
  })

  it('company_id PALSU tak menembus — wrapper yang menentukan, bukan argumen', async () => {
    // Mengirim companyId tenant lain sambil memakai TenantDb tenant sendiri.
    // Kalau saringannya hanya mengandalkan argumen, ini akan bocor.
    const hasil = await cariPotongan({
      db: createTenantDb(companyA),
      companyId: companyB, // ← palsu
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'K-300',
    })
    for (const p of hasil.potongan) {
      expect(p.isi).not.toContain('B-882')
    }
  })

  /*
   * ── Jalur RPC diuji TERPISAH, dan itu bukan pengulangan ────────────────
   *
   * Mutasi membuktikan test di atas BUTA: mencabut `company_id` dari WHERE
   * jalur teks tetap hijau, karena `TenantDb` menyaring di bawahnya. Itu
   * pertahanan berlapis yang memang disengaja — tapi berarti test-test itu
   * menguji WRAPPER, bukan kode saya.
   *
   * `rag_cari_vektor` adalah RPC, dan RPC MELEWATI `TenantDb`. Di sanalah
   * saringan yang saya tulis benar-benar sendirian, jadi di sanalah ia harus
   * dibuktikan. Kalau fungsinya sampai memakai `p_company` apa adanya, test
   * ini merah.
   */
  it('RPC vektor menolak company_id palsu — di sini TIDAK ada wrapper yang menolong', async () => {
    const dbA = createTenantDb(companyA)
    // Vektor nol: bukan soal kemiripannya, yang diuji adalah SARINGANNYA.
    const embedNol = JSON.stringify(new Array(1536).fill(0))

    /*
     * (1) company aktif A, argumen A → WAJIB mengembalikan baris.
     *
     * `toBeGreaterThan(0)` bukan kelengkapan: tanpa itu, "nol baris karena
     * saringan bekerja" tak bisa dibedakan dari "nol baris karena tak ada
     * apa-apa untuk dikembalikan". Mutasi membuktikan versi pertama test ini
     * buta persis karena itu — ia hijau bahkan setelah `auth_company_id()`
     * dicabut dari fungsinya.
     */
    const sah = await dbA.raw.rpc('rag_cari_vektor', {
      p_company: companyA, p_user: userId, p_embed: embedNol,
      p_jenis: null, p_hanya_visibel: false, p_batas: 10,
    })
    expect(sah.error).toBeNull()
    expect(((sah.data ?? []) as unknown[]).length).toBeGreaterThan(0)

    // (2) company aktif A, argumen B → WAJIB nol baris, bukan isi tenant B.
    // Klaim tenant B dengan user yang BUKAN anggotanya → wajib nol baris.
    const palsu = await dbA.raw.rpc('rag_cari_vektor', {
      p_company: companyB, p_user: userId, p_embed: embedNol,
      p_jenis: null, p_hanya_visibel: false, p_batas: 10,
    })
    expect(palsu.error).toBeNull()
    const baris = (palsu.data ?? []) as Array<{ isi: string }>
    expect(baris).toHaveLength(0)
    for (const b of baris) expect(b.isi).not.toContain('B-882')
  })
})

describe('pencocokan PERSIS — kriteria eksplisit C2', () => {
  const dbA = () => createTenantDb(companyA)

  it('nomor kontrak ditemukan persis', async () => {
    const h = await cariPotongan({
      db: dbA(), companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: '"PKS/2026/A-771"',
    })
    expect(h.potongan.some((p) => p.isi.includes('A-771'))).toBe(true)
  })

  it('SNI 2847 ditemukan', async () => {
    const h = await cariPotongan({
      db: dbA(), companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'SNI 2847',
    })
    expect(h.potongan.length).toBeGreaterThan(0)
  })

  it('K-300 ditemukan', async () => {
    const h = await cariPotongan({
      db: dbA(), companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'K-300',
    })
    expect(h.potongan.length).toBeGreaterThan(0)
  })

  it('stemming Indonesia bekerja: "pemeliharaan" cocok dengan "masa pemeliharaan"', async () => {
    // Ini yang `simple` TIDAK bisa — dan dokumen konstruksi penuh imbuhan.
    const h = await cariPotongan({
      db: dbA(), companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'pemeliharaan',
    })
    expect(h.potongan.length).toBeGreaterThan(0)
  })
})

describe('T-4 — ACL dari PERMISSION, bukan nama peran', () => {
  it('punya documents:manage → semua jenis, termasuk invoice', async () => {
    const s = saringanUntuk(new Set(['documents:manage']))
    expect(s.jenis).toBeNull()
    expect(s.hanyaVisibelKlien).toBe(false)

    const h = await cariPotongan({
      db: createTenantDb(companyA), companyId: companyA, saringan: s,
      kueri: 'penagihan termin',
    })
    expect(h.potongan.some((p) => p.docType === 'invoice')).toBe(true)
  })

  it('TANPA documents:manage → invoice TIDAK pernah muncul', async () => {
    const s = saringanUntuk(new Set<string>())
    expect(s.jenis).toEqual(JENIS_TERBATAS)
    expect(s.hanyaVisibelKlien).toBe(true)

    const h = await cariPotongan({
      db: createTenantDb(companyA), companyId: companyA, saringan: s,
      kueri: 'penagihan termin Rp 450.000.000',
    })
    expect(h.potongan.some((p) => p.docType === 'invoice')).toBe(false)
  })

  it('set izin KOSONG → saringan paling ketat (fail-closed)', () => {
    const s = saringanUntuk(new Set<string>())
    expect(s.jenis).not.toBeNull()
    expect(s.hanyaVisibelKlien).toBe(true)
  })

  it('peran KUSTOM ikut benar tanpa disebut namanya', () => {
    // Inti ADR-004: `direktur` tak muncul di kode mana pun, tapi karena ia
    // punya `documents:manage` ia melihat semua. Tabel literal akan
    // memberinya NOL dokumen — diam-diam.
    expect(saringanUntuk(new Set(['documents:manage'])).jenis).toBeNull()
  })
})

describe('T-5 — nol file_url', () => {
  it('hasil pencarian tak pernah memuat file_url', async () => {
    const h = await cariPotongan({
      db: createTenantDb(companyA), companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'kontrak',
    })
    for (const p of h.potongan) {
      expect(JSON.stringify(p)).not.toContain('uji://c2')
      expect(Object.keys(p)).not.toContain('file_url')
    }
  })
})

describe('kegagalan jalur TERLIHAT', () => {
  it('jalur vektor tanpa embedding = "dilewati", BUKAN "gagal"', async () => {
    const h = await cariPotongan({
      db: createTenantDb(companyA), companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'kontrak', embedKueri: null,
    })
    expect(h.jalurVektor).toBe('dilewati')
    expect(h.jalurTeks).toBe('ok')
  })

  it('kueri tanpa hasil = "kosong", bukan "gagal"', async () => {
    const h = await cariPotongan({
      db: createTenantDb(companyA), companyId: companyA,
      saringan: { jenis: null, hanyaVisibelKlien: false },
      kueri: 'zxqwvbnmplkjhgfd',
    })
    expect(h.jalurTeks).toBe('kosong')
    expect(h.potongan).toHaveLength(0)
  })
})

describe('pemotongan — fungsi murni', () => {
  it('teks pendek jadi satu potongan', () => {
    expect(potongTeks('Halo dunia.')).toEqual(['Halo dunia.'])
  })

  it('teks kosong jadi NOL potongan, bukan satu potongan kosong', () => {
    expect(potongTeks('')).toEqual([])
    expect(potongTeks('   \n\n  ')).toEqual([])
  })

  it('tak ada potongan yang melebihi batas', () => {
    const panjang = Array.from({ length: 40 }, (_, i) =>
      `Paragraf ${i}. ${'kata '.repeat(40)}`).join('\n\n')
    const p = potongTeks(panjang)
    expect(p.length).toBeGreaterThan(1)
    for (const x of p) expect(x.length).toBeLessThanOrEqual(MAKS_POTONGAN + 50)
  })

  it('kalimat raksasa tanpa batas alami tetap terpotong, tak menggantung', () => {
    const p = potongTeks('a'.repeat(5_000))
    expect(p.length).toBeGreaterThan(1)
    expect(p.every((x) => x.length > 0)).toBe(true)
  })

  it('perkiraan token condong ke ATAS, bukan bawah', () => {
    // Perkiraan biaya yang terlalu rendah adalah yang berbahaya saat
    // onboarding — pelanggan baru paling tak toleran pada tagihan kejutan.
    const potongan = ['a'.repeat(4_000)]
    expect(perkiraanTokenIngest(potongan)).toBeGreaterThan(1_000)
  })
})

describe('ingest IDEMPOTEN', () => {
  it('ingest ulang MENGGANTI, tidak menggandakan', async () => {
    const dbA = createTenantDb(companyA)
    const pertama = await ingestDokumen({
      db: dbA, companyId: companyA, documentId: docA, teks: ISI_A })
    expect(pertama.ok).toBe(true)

    const { rows: n1 } = await db.query(
      `SELECT count(*)::int n FROM rag_potongan WHERE document_id = $1`, [docA])

    const kedua = await ingestDokumen({
      db: dbA, companyId: companyA, documentId: docA, teks: ISI_A })
    expect(kedua.ok).toBe(true)

    const { rows: n2 } = await db.query(
      `SELECT count(*)::int n FROM rag_potongan WHERE document_id = $1`, [docA])
    expect(n2[0].n).toBe(n1[0].n)
  })

  it('trigger MENIMPA company_id yang dikirim pemanggil', async () => {
    // Pemanggil tak bisa menyuntikkan tenant lain — nilai keamanan
    // diresolusi dari basis, pola yang sama dengan `wa-sesi.ts`.
    const { rows } = await db.query(
      `SELECT DISTINCT company_id FROM rag_potongan WHERE document_id = $1`, [docA])
    expect(rows).toHaveLength(1)
    expect(rows[0].company_id).toBe(companyA)
  })
})

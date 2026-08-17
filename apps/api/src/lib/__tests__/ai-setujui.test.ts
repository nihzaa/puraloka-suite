/**
 * TJS-E1 — preview → setujui, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * P-3  token sekali-pakai, DIKLAIM ATOMIK — klaim kedua 409, dan lima klaim
 *      bersamaan hanya satu yang menang
 * P-4  batas melekat pada USER: token orang lain ditolak meski tokennya sah
 * P-6  batas dicek DUA KALI, dan nominal tak diketahui = Infinity (BUKAN nol,
 *      BUKAN null) — inilah perbaikan C-10 yang paling menentukan
 *
 * Terhadap basis sungguhan karena yang dijamin di sini adalah perilaku
 * `UPDATE ... WHERE`, dan mock tak menjamin apa pun tentang itu.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import {
  JENIS_DIDUKUNG,
  batasPengguna,
  klaimToken,
  nominalEntitas,
  siapkanPreview,
  sumberUntuk,
} from '../ai-setujui.js'
import { SUMBER_INBOX } from '../inbox-approval.js'

let db: Client
let companyId: string
let userId: string
let userLain: string
let tdb: ReturnType<typeof createTenantDb>

const TANDA = 'uji-e1-'

beforeAll(async () => {
  db = await createRlsClient()
  /*
   * Tenant uji WAJIB punya MINIMAL DUA anggota — P-4 (token satu orang tak
   * bisa dipakai orang lain) mustahil diuji dengan satu orang.
   *
   * Versi sebelumnya `LIMIT 1` tanpa `ORDER BY` dan tanpa syarat itu, jadi PT
   * mana yang terpilih ditentukan urutan fisik baris. Begitu dua PT anak
   * disemai 2026-08-16 — masing-masing beranggota SATU orang — keduanya
   * terpilih lebih dulu dan `u[1]` menjadi undefined, membuat seluruh berkas
   * ini gagal dimuat.
   *
   * Syaratnya sekarang eksplisit, jadi kegagalannya (kalau terjadi lagi)
   * menyebut sebabnya alih-alih melempar "cannot read properties of undefined".
   */
  const { rows: c } = await db.query(`
    SELECT c.id FROM companies c
    WHERE (SELECT count(*) FROM company_members m WHERE m.company_id = c.id) >= 2
    ORDER BY c.created_at LIMIT 1
  `)
  if (c.length === 0) throw new Error('Butuh satu tenant dengan >= 2 anggota')
  companyId = c[0].id

  // Dua pengguna BERBEDA — P-4 tak bisa diuji dengan satu orang.
  const { rows: u } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1
      ORDER BY created_at LIMIT 2`, [companyId])
  if (u.length < 2) throw new Error('Tenant uji punya < 2 anggota')
  userId = u[0].user_id
  userLain = u[1].user_id

  tdb = createTenantDb(companyId)
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_token_setujui WHERE token LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM ai_batas_setujui WHERE company_id = $1`, [companyId])
  await db.end()
})

beforeEach(async () => {
  await db.query(`DELETE FROM ai_token_setujui WHERE company_id = $1`, [companyId])
  await db.query(`DELETE FROM ai_batas_setujui WHERE company_id = $1`, [companyId])
})

/** Menyisipkan token langsung — memisahkan uji KLAIM dari uji PREVIEW. */
async function buatToken(opsi: {
  pemilik?: string
  nominal?: number | null
  umurMs?: number
  dipakai?: boolean
} = {}): Promise<string> {
  const token = `${TANDA}${Math.random().toString(36).slice(2)}${Date.now()}`
  await db.query(
    `INSERT INTO ai_token_setujui
       (company_id, token, user_id, jenis, entity_id, nominal, kanal, kedaluwarsa, dipakai_pada)
     VALUES ($1,$2,$3,'kasbon',gen_random_uuid(),$4,'web',$5,$6)`,
    [
      companyId, token, opsi.pemilik ?? userId,
      opsi.nominal === undefined ? 1000 : opsi.nominal,
      new Date(Date.now() + (opsi.umurMs ?? 900_000)).toISOString(),
      opsi.dipakai ? new Date().toISOString() : null,
    ],
  )
  return token
}

async function setBatas(n: number | null, siapa = userId) {
  await db.query(
    `INSERT INTO ai_batas_setujui (company_id, user_id, batas_idr) VALUES ($1,$2,$3)
     ON CONFLICT (company_id, user_id) DO UPDATE SET batas_idr = EXCLUDED.batas_idr`,
    [companyId, siapa, n],
  )
}

describe('P-6 / C-10 — nominal BERTIPE, tak diketahui = Infinity', () => {
  it('jenis dengan kolomNominal null → Infinity, BUKAN nol', async () => {
    /*
     * Inti perbaikan C-10. TJS menebak nominal dari empat nama field; nama
     * kelima menghasilkan null, dan batas terlewati diam-diam.
     *
     * Di sini ketiadaan kolom nominal menghasilkan Infinity — yang melampaui
     * SEMUA ambang, jadi dokumennya tak bisa disetujui lewat asisten sama
     * sekali. Data hilang MENAMBAH pengawasan.
     */
    const submittal = SUMBER_INBOX.find((s) => s.jenis === 'submittal')!
    expect(submittal.kolomNominal).toBeNull()
    const n = await nominalEntitas(tdb, submittal, '00000000-0000-0000-0000-000000000000')
    expect(n).toBe(Number.POSITIVE_INFINITY)
    expect(n).not.toBe(0)
  })

  it('entitas tak ada → Infinity, bukan nol (gangguan basis bukan izin lewat)', async () => {
    const kasbon = SUMBER_INBOX.find((s) => s.jenis === 'kasbon')!
    const n = await nominalEntitas(tdb, kasbon, '00000000-0000-0000-0000-000000000000')
    expect(n).toBe(Number.POSITIVE_INFINITY)
  })

  it('Infinity SELALU melebihi batas berapa pun — termasuk yang sangat besar', () => {
    // Bukti aritmetik dari konvensinya. Kalau ini pernah gagal, seluruh
    // pengaman nominal-tak-diketahui runtuh tanpa gejala lain.
    for (const batas of [0, 1, 1e9, Number.MAX_SAFE_INTEGER]) {
      expect(Number.POSITIVE_INFINITY > batas).toBe(true)
      expect(Number.POSITIVE_INFINITY <= batas).toBe(false)
    }
  })

  it('null DIPAKSA jadi 0 oleh JS — sebabnya konvensinya Infinity, bukan null', () => {
    // Ini yang membuat usul "kembalikan null saja" berbahaya: pemanggil yang
    // lupa memeriksa null akan melihat perbandingannya LOLOS.
    expect((null as unknown as number) <= 500).toBe(true)
    expect(Number.POSITIVE_INFINITY <= 500).toBe(false)
  })
})

describe('P-4 — batas melekat pada PENGGUNA (perbaikan C-2)', () => {
  it('tanpa baris batas → NOL, bukan tak terbatas', async () => {
    expect(await batasPengguna(tdb, userId)).toBe(0)
  })

  it('batas NULL → NOL (fail-closed)', async () => {
    await setBatas(null)
    expect(await batasPengguna(tdb, userId)).toBe(0)
  })

  it('batas satu pengguna TIDAK berlaku untuk pengguna lain', async () => {
    await setBatas(5_000_000, userId)
    expect(await batasPengguna(tdb, userId)).toBe(5_000_000)
    expect(await batasPengguna(tdb, userLain)).toBe(0)
  })

  it('token milik orang lain DITOLAK meski tokennya sah dan belum dipakai', async () => {
    // Meneruskan token tak memindahkan wewenang — sebabnya batas melekat pada
    // user, bukan pada kanal atau nomor seperti di TJS.
    await setBatas(9_000_000, userLain)
    const token = await buatToken({ pemilik: userId, nominal: 1000 })
    const hasil = await klaimToken({ db: tdb, userId: userLain, token })
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.alasan).toBe('bukan_pemilik_token')
  })
})

describe('P-3 — token sekali-pakai, DIKLAIM ATOMIK', () => {
  it('klaim pertama berhasil, klaim kedua ditolak', async () => {
    await setBatas(5_000)
    const token = await buatToken({ nominal: 1000 })

    const a = await klaimToken({ db: tdb, userId, token })
    expect(a.ok).toBe(true)

    const b = await klaimToken({ db: tdb, userId, token })
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.alasan).toBe('token_sudah_dipakai')
  })

  it('LIMA klaim BERSAMAAN → tepat satu menang', async () => {
    /*
     * Inti P-3. Dengan SELECT-lalu-UPDATE, kelimanya melihat "belum dipakai"
     * dan kelimanya menyetujui — untuk kasbon berarti uang keluar lima kali,
     * tanpa satu pun galat.
     */
    await setBatas(5_000)
    const token = await buatToken({ nominal: 1000 })

    const hasil = await Promise.all(
      Array.from({ length: 5 }, () => klaimToken({ db: tdb, userId, token })),
    )
    expect(hasil.filter((h) => h.ok)).toHaveLength(1)
    expect(hasil.filter((h) => !h.ok)).toHaveLength(4)
  })

  it('token kedaluwarsa ditolak', async () => {
    await setBatas(5_000)
    const token = await buatToken({ nominal: 1000, umurMs: -1000 })
    const hasil = await klaimToken({ db: tdb, userId, token })
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.alasan).toBe('token_kedaluwarsa')
  })

  it('token tak dikenal ditolak', async () => {
    const hasil = await klaimToken({ db: tdb, userId, token: 'tidak-pernah-ada' })
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.alasan).toBe('token_tak_dikenal')
  })
})

describe('P-6 — batas dicek DUA KALI (preview DAN klaim)', () => {
  it('plafon DITURUNKAN sesudah token terbit → klaim tetap ditolak', async () => {
    /*
     * Pemeriksaan kedua yang membuatnya bukan sekadar pengulangan: token yang
     * terlanjur terbit tak boleh jadi kekebalan terhadap keputusan admin yang
     * lebih baru.
     */
    await setBatas(2_000_000)
    const token = await buatToken({ nominal: 1_500_000 })

    await setBatas(1_000_000) // admin menurunkan plafon

    const hasil = await klaimToken({ db: tdb, userId, token })
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.alasan).toBe('melebihi_batas')
  })

  it('nominal NULL di basis dibaca kembali sebagai Infinity → ditolak', async () => {
    await setBatas(Number.MAX_SAFE_INTEGER)
    const token = await buatToken({ nominal: null })
    const hasil = await klaimToken({ db: tdb, userId, token })
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.alasan).toBe('melebihi_batas')
  })

  it('token yang SUDAH ditandai dipakai tak bisa diklaim', async () => {
    await setBatas(5_000)
    const token = await buatToken({ nominal: 1000, dipakai: true })
    const hasil = await klaimToken({ db: tdb, userId, token })
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.alasan).toBe('token_sudah_dipakai')
  })
})

describe('preview — menghitung tanpa mengubah', () => {
  it('jenis tak didukung ditolak, dan submittal memang tak didukung', async () => {
    expect(sumberUntuk('submittal')).toBeUndefined()
    expect(sumberUntuk('material_request')).toBeUndefined()
    const hasil = await siapkanPreview({
      db: tdb, companyId, userId, jenis: 'submittal',
      entityId: '00000000-0000-0000-0000-000000000000', kanal: 'web',
    })
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.alasan).toBe('jenis_tak_didukung')
  })

  it('preview yang GAGAL tidak meninggalkan token', async () => {
    // Token yang terbit dari preview gagal adalah persetujuan yang menunggu
    // dipakai tanpa pernah lolos gerbang.
    await siapkanPreview({
      db: tdb, companyId, userId, jenis: 'kasbon',
      entityId: '00000000-0000-0000-0000-000000000000', kanal: 'web',
    })
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM ai_token_setujui WHERE company_id = $1`, [companyId])
    expect(rows[0].n).toBe(0)
  })

  it('setiap JENIS_DIDUKUNG benar-benar ada di katalog inbox', () => {
    // Kalau sebuah jenis didaftarkan tapi katalognya tak punya barisnya,
    // preview-nya akan selalu gagal dengan pesan yang membingungkan.
    for (const j of JENIS_DIDUKUNG) {
      expect(SUMBER_INBOX.some((s) => s.jenis === j), `jenis '${j}' tak ada di katalog`).toBe(true)
    }
  })
})

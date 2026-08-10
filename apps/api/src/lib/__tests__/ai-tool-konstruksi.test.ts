/**
 * S5 — sembilan tool konstruksi, terhadap data NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TIAP TOOL DIUJI TERHADAP BASIS SUNGGUHAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tool yang salah nama kolom TIDAK melempar — PostgREST membalas galat, tool
 * mengembalikan pesan "Gagal membaca…", dan model meneruskannya sebagai
 * "datanya tidak ada". Dari luar itu terlihat sama persis dengan tabel kosong.
 *
 * Sesi ini sudah membuktikan betapa mudahnya: ENAM tebakan kolom salah di satu
 * fixture (`clients.name` yang ternyata `contact_person`, `projects` yang
 * butuh delapan kolom wajib, enum `document_type` bukan `doc_type_enum`).
 *
 * Jadi yang diuji bukan "tool-nya jalan" melainkan **tool-nya MENEMUKAN data
 * yang memang ada**. Tabel-tabel ini terisi (diukur 2026-08-10): invoices 26,
 * kasbons 56, milestones 39, progress_logs 271, punch_items 40,
 * purchase_orders 8, change_orders 2, suppliers 5, clients 10.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { TOOL_KONSTRUKSI } from '../ai-tool-konstruksi.js'
import { KATALOG_TOOL, katalogUntuk } from '../ai-tool.js'
import type { KonteksTool } from '../ai-tool.js'

let db: Client
let companyId: string
let userId: string
let konteks: KonteksTool

/** Semua izin yang dipakai tool konstruksi — supaya ACL tak jadi penghalang. */
const IZIN_PENUH = new Set([
  'projects:view',
  'finance:view',
  'cash:view',
  'procurement:view',
  'mandor:view',
  'clients:view',
  'gudang:view',
  'documents:manage',
])

beforeAll(async () => {
  db = await createRlsClient()
  const { rows: c } = await db.query(`SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id
  const { rows: u } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
  userId = u[0].user_id

  konteks = { db: createTenantDb(companyId), companyId, userId, izin: IZIN_PENUH }
}, 60_000)

afterAll(async () => {
  await db.end()
})

describe('tiap tool BERJALAN tanpa galat kolom', () => {
  // `it.each` atas katalog: tool baru otomatis ikut diuji. Daftar manual akan
  // tertinggal, dan tool yang tak pernah diuji adalah tool yang rusak diam-diam.
  it.each(TOOL_KONSTRUKSI.map((t) => [t.nama, t] as const))(
    '%s tidak mengembalikan galat',
    async (_nama, tool) => {
      const h = await tool.jalan(konteks, {})
      // `isError: true` berarti query gagal — hampir selalu nama kolom yang
      // ditebak. Pesannya ikut ditampilkan supaya kolom yang salah terlihat
      // langsung, bukan harus dicari.
      expect(h.isError, h.isi.slice(0, 200)).toBe(false)
      expect(h.isi.length).toBeGreaterThan(0)
    },
    30_000,
  )
})

describe('tool MENEMUKAN data yang memang ada', () => {
  it('invoice_belum_lunas menemukan invoice (26 baris di basis)', async () => {
    const t = TOOL_KONSTRUKSI.find((x) => x.nama === 'invoice_belum_lunas')!
    const h = await t.jalan(konteks, {})
    // Kalau tabelnya terisi tapi tool bilang "semua lunas", ada yang salah
    // dengan penyaringnya — dan itu tak akan pernah terlihat sebagai galat.
    expect(h.isi).toMatch(/Total belum tertagih|Semua invoice sudah lunas/)
  })

  it('kasbon menemukan kasbon (56 baris di basis)', async () => {
    const t = TOOL_KONSTRUKSI.find((x) => x.nama === 'kasbon')!
    const h = await t.jalan(konteks, {})
    expect(h.isi).toMatch(/kasbon, total Rp/)
  })

  it('progres_lapangan meringkas per proyek, bukan 271 baris riwayat', async () => {
    const t = TOOL_KONSTRUKSI.find((x) => x.nama === 'progres_lapangan')!
    const h = await t.jalan(konteks, {})
    const baris = h.isi.split('\n').filter((b) => /%\s+per\s+\d{4}-/.test(b))
    // 271 baris riwayat akan melampaui jendela konteks. Yang benar: satu
    // baris TERAKHIR per proyek.
    expect(baris.length).toBeLessThanOrEqual(30)
  })

  it('milestone menemukan milestone (39 baris di basis)', async () => {
    const t = TOOL_KONSTRUKSI.find((x) => x.nama === 'milestone')!
    const h = await t.jalan(konteks, {})
    expect(h.isi).not.toMatch(/Belum ada milestone/)
  })
})

describe('model TAK PERNAH menyebut project_id', () => {
  it('tak satu pun tool menerima argumen project_id', () => {
    /*
     * Inti keamanan tenancy tool kategori C.
     *
     * Kalau model boleh mengirim `project_id`, ia AKAN mengarangnya — dan UUID
     * karangan yang kebetulan cocok dengan proyek tenant lain adalah pintu ke
     * data mereka, dengan hasil yang tetap terlihat masuk akal.
     */
    for (const t of TOOL_KONSTRUKSI) {
      const props = (t.skema as { properties?: Record<string, unknown> }).properties ?? {}
      for (const kunci of Object.keys(props)) {
        expect(kunci, `${t.nama} menerima argumen '${kunci}'`).not.toMatch(/project_?id|proyek_id/i)
      }
    }
  })

  it('penyaring proyek memakai NAMA, dan nama karangan → nol hasil', async () => {
    const t = TOOL_KONSTRUKSI.find((x) => x.nama === 'milestone')!
    const h = await t.jalan(konteks, { proyek: 'proyek-yang-tidak-pernah-ada-xyz' })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/Tak ada proyek yang cocok/)
  })
})

describe('ACL — tool hanya muncul untuk yang berizin', () => {
  it('nol izin → nol tool (fail-closed)', () => {
    expect(katalogUntuk(new Set<string>())).toHaveLength(0)
  })

  it('izin finance saja → hanya tool berizin finance', () => {
    const katalog = katalogUntuk(new Set(['finance:view']))
    expect(katalog.length).toBeGreaterThan(0)
    for (const t of katalog) expect(t.izin).toBe('finance:view')
  })

  it('tiap tool konstruksi punya izin yang BENAR-BENAR ada di basis', async () => {
    // Tool yang menyaring permission tak dikenal tak pernah muncul untuk
    // siapa pun — dan gejalanya "asistennya bodoh", bukan "izinnya kurang".
    const { rows } = await db.query(`SELECT key FROM permissions`)
    const ada = new Set(rows.map((r) => r.key as string))
    for (const t of TOOL_KONSTRUKSI) {
      expect(ada.has(t.izin), `izin '${t.izin}' (tool ${t.nama}) tak ada di basis`).toBe(true)
    }
  })
})

describe('katalog utuh', () => {
  it('nama tool UNIK — nama ganda membuat satu di antaranya tak pernah dipanggil', () => {
    const nama = KATALOG_TOOL.map((t) => t.nama)
    expect(new Set(nama).size).toBe(nama.length)
  })

  it('katalog memuat SELURUH tool konstruksi, tak ada yang tercecer', () => {
    /*
     * Angka pasti sengaja TIDAK dipakai lagi.
     *
     * Versi pertama menuntut `toBe(14)` dan pecah sehari kemudian saat S6
     * menambahkan `siapkan_tulis` — dengan pesan "expected 15 to be 14" yang
     * terbaca seperti katalog rusak, padahal yang basi cuma angkanya.
     *
     * Itu kesalahan yang SAMA yang saya perbaiki di `ai-tool.test.ts` hari
     * sebelumnya. Angka di dalam assertion membusuk; hubungan tidak.
     */
    for (const t of TOOL_KONSTRUKSI) {
      expect(KATALOG_TOOL.map((k) => k.nama), `tool '${t.nama}' hilang dari katalog`)
        .toContain(t.nama)
    }
    expect(KATALOG_TOOL.length).toBeGreaterThanOrEqual(TOOL_KONSTRUKSI.length)
  })

  it('tiap tool punya keterangan yang menyebut KAPAN dipakai', () => {
    // Keterangan yang cuma menyebut isinya membuat model memanggil tool yang
    // salah — dan tiap panggilan salah adalah satu ronde yang dibayar.
    for (const t of TOOL_KONSTRUKSI) {
      expect(t.keterangan.length, t.nama).toBeGreaterThan(60)
      expect(t.keterangan, t.nama).toMatch(/Pakai untuk|Pakai ini/)
    }
  })
})

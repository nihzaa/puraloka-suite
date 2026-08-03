import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// BATAS KASBON — jalur PENGAMBILAN DATA-nya, bukan keputusannya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA, PADAHAL lib/kasbon-limit.ts SUDAH 100%
// ══════════════════════════════════════════════════════════════════════════
//
// Keputusannya (`lib/kasbon-limit.ts`) sudah diuji penuh: diberi angka, ia
// menjawab boleh/tidak dengan benar. Yang TIDAK pernah diuji adalah bagaimana
// angka-angka itu DIDAPAT — dan di sanalah seluruh risikonya.
//
// Terukur sebelum berkas ini: `utils/kasbon-limit.ts` 5,26% baris, **0%
// fungsi**. Nol. Fungsi yang menentukan boleh-tidaknya uang cair tak pernah
// sekali pun dijalankan oleh test.
//
// ── Yang membuat jalur ini berbahaya
//
// `enforceKasbonLimit` punya EMPAT jalan keluar lebih awal, dan masing-masing
// mengembalikan `{ allowed: true }` — artinya UANG BOLEH CAIR:
//
//   1. toggle OFF                      → boleh (disengaja: fitur opt-in)
//   2. kasbon tanpa work_scope_id      → boleh (kasbon umum tak dibatasi)
//   3. scope bukan progress_pct        → boleh (harian/borongan tak dibatasi)
//   4. scope tak ditemukan             → boleh (fail-open)
//
// Empat jalur "boleh" berarti empat cara batas ini mati tanpa suara. Sebuah
// bug yang membuat salah satunya kepilih terlalu sering TIDAK akan menimbulkan
// galat, tidak akan muncul di log, dan hanya terlihat sebagai "kasbon kok
// lolos terus". Itulah kelas cacat yang paling mahal di sistem ini.
//
// ── Kenapa Supabase di-mock, padahal repo ini melarang mock untuk DB
//
// Aturan repo: integration test terhadap Postgres NYATA (`CLAUDE.md` §3).
// Aturan itu ada karena yang paling sering rusak adalah RLS, constraint, dan
// trigger — dan mock menyembunyikan ketiganya.
//
// Di sini yang diuji BUKAN itu. Yang diuji adalah PERCABANGAN di kode aplikasi
// ketika data datang dalam bentuk tertentu — termasuk bentuk yang sulit
// dihadirkan di DB nyata tanpa merusaknya (mis. `work_scopes` yang lenyap
// sementara kasbon-nya masih menunjuk ke sana).
//
// Sisi DB-nya sudah dijaga terpisah oleh test integrasi kasbon yang ada.
// Berkas ini melengkapi, bukan menggantikan.
// ============================================================================

/**
 * Mock klien Supabase.
 *
 * ⚠️ `single()` dan await-langsung mengembalikan BENTUK YANG BERBEDA, dan
 * membedakannya bukan detail: `enforceKasbonLimit` memanggil `.reduce()` atas
 * hasil await-langsung (daftar kasbon approved). Mock yang mengembalikan objek
 * di kedua jalur membuat kode produksi mati dengan "reduce is not a function"
 * — dan itu kegagalan MOCK-nya, bukan kode yang diuji. Terjadi persis begitu
 * saat berkas ini pertama dijalankan.
 *
 *   .single()/.maybeSingle()  → satu baris (objek) atau null
 *   await q                   → ARRAY baris
 */
const bikinQuery = (satu: unknown, daftar: unknown[]) => {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) q[m] = () => q
  q.single = () => Promise.resolve({ data: satu, error: null })
  q.maybeSingle = () => Promise.resolve({ data: satu, error: null })
  q.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: daftar, error: null }).then(res)
  return q
}

/** Peta: nama tabel → satu baris. `kasbons_daftar` khusus untuk hasil array. */
let peta: Record<string, unknown> = {}
let kasbonApproved: unknown[] = []
vi.mock('../supabase.js', () => ({
  supabase: {
    from: (t: string) =>
      bikinQuery(peta[t] ?? null, t === 'kasbons' ? kasbonApproved : []),
  },
}))

const { enforceKasbonLimit } = await import('../kasbon-limit.js')

beforeEach(() => { peta = {}; kasbonApproved = [] })

describe('enforceKasbonLimit — empat jalan keluar yang semuanya MENGIZINKAN', () => {
  it('toggle OFF → diizinkan (default opt-in, nol perubahan perilaku)', async () => {
    // `company_settings` mengembalikan null → dianggap OFF.
    expect(await enforceKasbonLimit('k1', 999_000_000)).toEqual({ allowed: true })
  })

  it('toggle ON tapi kasbon TANPA work_scope_id → diizinkan (kasbon umum)', async () => {
    peta = {
      company_settings: { value: true },
      kasbons: { work_scope_id: null, project_id: 'p1' },
    }
    // Kasbon umum memang tak dibatasi. Kalau ini berubah jadi `false`, seluruh
    // kasbon non-scope akan tertolak — kerusakan, bukan pengetatan.
    expect(await enforceKasbonLimit('k1', 5_000_000)).toEqual({ allowed: true })
  })

  it('scope BUKAN progress_pct → diizinkan (harian/borongan tak dibatasi)', async () => {
    peta = {
      company_settings: { value: true },
      kasbons: { work_scope_id: 's1', project_id: 'p1' },
      work_scopes: { payment_system: 'harian', borongan_value: 0, progress_pct_done: 0 },
    }
    expect(await enforceKasbonLimit('k1', 5_000_000)).toEqual({ allowed: true })
  })

  it('scope TIDAK DITEMUKAN → diizinkan (fail-open yang disengaja)', async () => {
    peta = {
      company_settings: { value: true },
      kasbons: { work_scope_id: 's-hilang', project_id: 'p1' },
      work_scopes: null,
    }
    // FAIL-OPEN, bukan fail-closed — dan itu keputusan sadar (lihat komentar
    // pada `enforceKasbonLimit`): batas kasbon adalah fitur opt-in, bukan
    // gerbang keamanan. Data tak lengkap tak boleh memblokir approval yang
    // hari ini sah.
    //
    // ⚠️ Ini SATU-SATUNYA tempat di repo ini yang fail-open disengaja. Kalau
    // suatu hari batas kasbon dinaikkan jadi kontrol keamanan, baris ini yang
    // harus ditinjau lebih dulu.
    expect(await enforceKasbonLimit('k1', 5_000_000)).toEqual({ allowed: true })
  })
})

describe('enforceKasbonLimit — perhitungan yang benar-benar membatasi', () => {
  const dasar = {
    company_settings: { value: true },
    kasbons: { work_scope_id: 's1', project_id: 'p1' },
    projects: { kasbon_limit_pct: 80 },
  }

  it('di BAWAH batas → diizinkan', async () => {
    peta = {
      ...dasar,
      // earned = 100jt × 50% = 50jt; batas 80% = 40jt
      work_scopes: { payment_system: 'progress_pct', borongan_value: 100_000_000, progress_pct_done: 50 },
    }
    expect(await enforceKasbonLimit('k1', 10_000_000)).toEqual({ allowed: true })
  })

  it('MELEBIHI batas → DITOLAK, dan alasannya menyebut angkanya', async () => {
    peta = {
      ...dasar,
      work_scopes: { payment_system: 'progress_pct', borongan_value: 100_000_000, progress_pct_done: 50 },
    }
    const h = await enforceKasbonLimit('k1', 45_000_000) // 45jt > batas 40jt
    expect(h.allowed, 'kasbon melebihi batas LOLOS — batas tidak menahan').toBe(false)
    if (h.allowed === false) {
      // Pesan wajib memuat angkanya. Penolakan tanpa angka memaksa pengguna
      // menebak berapa yang boleh, dan mereka akan mencoba berulang kali.
      expect(h.reason).toMatch(/80%/)
      expect(h.limit).toBe(40_000_000)
      expect(h.wouldBe).toBe(45_000_000)
    }
  })

  it('progress 0% → batas 0, kasbon sekecil apa pun ditolak', async () => {
    peta = {
      ...dasar,
      work_scopes: { payment_system: 'progress_pct', borongan_value: 100_000_000, progress_pct_done: 0 },
    }
    // Belum ada pekerjaan selesai = belum ada yang bisa ditarik. Ini bukan
    // kasus tepi buatan: ia terjadi tiap kali scope baru dibuat.
    const h = await enforceKasbonLimit('k1', 1)
    expect(h.allowed, 'kasbon di scope tanpa progress LOLOS').toBe(false)
  })

  it('kasbon approved SEBELUMNYA ikut dihitung — bukan hanya yang baru', async () => {
    peta = {
      ...dasar,
      work_scopes: { payment_system: 'progress_pct', borongan_value: 100_000_000, progress_pct_done: 50 },
    }
    // Batas 40jt. Sudah ada 35jt approved; permintaan 10jt SENDIRIAN jauh di
    // bawah batas — jadi test ini HANYA bisa merah/hijau berdasarkan apakah
    // akumulasi benar-benar dihitung.
    kasbonApproved = [{ amount: 20_000_000 }, { amount: 15_000_000 }]

    const h = await enforceKasbonLimit('k1', 10_000_000)   // 35 + 10 = 45 > 40
    expect(h.allowed,
      'akumulasi kasbon approved TIDAK dihitung — seseorang bisa menarik ' +
      'berulang kali dan tiap kalinya "lolos", menguras earned value tanpa ' +
      'satu pun penolakan').toBe(false)
    if (h.allowed === false) expect(h.wouldBe).toBe(45_000_000)
  })

  it('limit_pct dari proyek dipakai, bukan angka dipaku', async () => {
    peta = {
      ...dasar,
      projects: { kasbon_limit_pct: 50 },   // proyek ini lebih ketat
      work_scopes: { payment_system: 'progress_pct', borongan_value: 100_000_000, progress_pct_done: 50 },
    }
    // earned 50jt × 50% = 25jt. Jumlah yang tadi LOLOS di 80% kini ditolak.
    // Ini membuktikan angkanya benar-benar dibaca dari proyek — kalau 80
    // dipaku di kode, test ini hijau padahal salah.
    const h = await enforceKasbonLimit('k1', 30_000_000)
    expect(h.allowed, 'kasbon_limit_pct proyek TIDAK dipakai').toBe(false)
  })

  it('proyek tanpa kasbon_limit_pct → jatuh ke 80%', async () => {
    peta = {
      ...dasar,
      projects: null,
      work_scopes: { payment_system: 'progress_pct', borongan_value: 100_000_000, progress_pct_done: 50 },
    }
    expect((await enforceKasbonLimit('k1', 10_000_000)).allowed).toBe(true)   // < 40jt
    expect((await enforceKasbonLimit('k1', 45_000_000)).allowed).toBe(false)  // > 40jt
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// DENDA KETERLAMBATAN — RESOLUSI angkanya, bukan rumusnya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Rumus dendanya (`lib/penalty.ts`) sudah diuji. Yang TIDAK pernah diuji
// adalah dari mana angka-angka yang masuk ke rumus itu berasal.
//
// Terukur sebelum berkas ini: `utils/penalty.ts` 4,23% baris, **0% fungsi**.
//
// ── Kenapa bagian ini yang paling berbahaya
//
// Rumus yang benar atas DASAR yang salah menghasilkan angka yang terlihat
// masuk akal dan tetap keliru. Denda 2‰/hari dari Rp 500 juta dan dari Rp 5
// miliar sama-sama "berhasil dihitung" — keduanya bilangan wajar, dan tak ada
// galat yang muncul. Yang membedakan hanya benar atau tidaknya, dan itu tak
// terlihat sampai klien memprotes.
//
// Dua fungsi diuji di sini:
//
//   resolvePenaltyBase       — memilih DASAR: nilai invoice / nilai kontrak /
//                              tunggakan proyek. Salah pilih = denda salah
//                              berlipat, bukan salah sedikit.
//   resolveProjectPenaltyTerms — menggabungkan setelan global dengan override
//                              per-proyek. Override yang diam-diam tak
//                              terpakai = kesepakatan kontrak diabaikan.
//
// ── Kenapa Supabase di-mock
//
// Yang diuji adalah PERCABANGAN atas bentuk data, bukan RLS/constraint/trigger
// (yang memang wajib diuji terhadap Postgres nyata dan sudah dijaga test
// integrasi finance). Beberapa bentuk di sini — invoice berstatus campuran,
// override sebagian — jauh lebih murah dihadirkan sebagai fixture daripada
// sebagai baris nyata yang harus dibersihkan lagi.
// ============================================================================

let invoiceRows: unknown[] = []
let nilaiFinansial: Record<string, unknown> = {}

const bikinQuery = (daftar: unknown[]) => {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit']) q[m] = () => q
  q.single = () => Promise.resolve({ data: null, error: null })
  q.maybeSingle = () => Promise.resolve({ data: null, error: null })
  q.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: daftar, error: null }).then(res)
  return q
}

vi.mock('../supabase.js', () => ({
  supabase: { from: () => bikinQuery(invoiceRows) },
}))

vi.mock('../financial-config.js', () => ({
  getEffectiveFinancialValue: (kunci: string) =>
    Promise.resolve(nilaiFinansial[kunci] ?? null),
}))

const { resolvePenaltyBase, resolveProjectPenaltyTerms } = await import('../penalty.js')

beforeEach(() => {
  invoiceRows = []
  nilaiFinansial = {}
})

describe('resolvePenaltyBase — memilih DASAR denda', () => {
  it('invoice_telat → nilai invoice itu sendiri', async () => {
    const n = await resolvePenaltyBase('invoice_telat', {
      invoiceTotal: 500_000_000, projectId: 'p1', contractValue: 9_000_000_000,
    })
    // Kalau ini pernah tertukar dengan contractValue, dendanya melonjak 18x
    // tanpa satu pun galat. Angka sengaja dibuat berjauhan supaya tertukarnya
    // tak bisa lolos sebagai "beda sedikit".
    expect(n).toBe(500_000_000)
  })

  it('kontrak_total → nilai kontrak, bukan invoice', async () => {
    const n = await resolvePenaltyBase('kontrak_total', {
      invoiceTotal: 500_000_000, projectId: 'p1', contractValue: 9_000_000_000,
    })
    expect(n).toBe(9_000_000_000)
  })

  it('kontrak_total tanpa nilai kontrak → 0, bukan NaN', async () => {
    // NaN akan menjalar diam-diam ke seluruh perhitungan dan muncul sebagai
    // kolom kosong di UI, bukan sebagai galat. Nol setidaknya jujur.
    const n = await resolvePenaltyBase('kontrak_total', {
      invoiceTotal: 500_000_000, projectId: 'p1', contractValue: null,
    })
    expect(n).toBe(0)
    expect(Number.isNaN(n), 'basis menjadi NaN — akan menjalar senyap').toBe(false)
  })

  it('outstanding_proyek → menjumlahkan tunggakan, MELEWATI yang lunas', async () => {
    invoiceRows = [
      { amount_due: 100_000_000, status: 'sent' },
      { amount_due: 250_000_000, status: 'overdue' },
      { amount_due: 900_000_000, status: 'paid' },   // ⚠️ HARUS dilewati
    ]
    const n = await resolvePenaltyBase('outstanding_proyek', {
      invoiceTotal: 1, projectId: 'p1', contractValue: null,
    })
    // Yang lunas dibuat JAUH lebih besar dari jumlah sisanya: kalau saringan
    // 'paid' pernah hilang, hasilnya 1,25M vs 350jt — mustahil lolos sebagai
    // selisih pembulatan.
    expect(n, "invoice berstatus 'paid' ikut terhitung sebagai tunggakan").toBe(350_000_000)
  })

  it('outstanding_proyek tanpa projectId → 0', async () => {
    invoiceRows = [{ amount_due: 999_000_000, status: 'sent' }]
    const n = await resolvePenaltyBase('outstanding_proyek', {
      invoiceTotal: 1, projectId: null, contractValue: null,
    })
    // Tanpa proyek, tak ada tunggakan yang bisa diklaim. Mengembalikan angka
    // apa pun selain 0 berarti mendenda atas dasar yang tak terhubung.
    expect(n).toBe(0)
  })

  it('amount_due null diperlakukan 0, tidak merusak penjumlahan', async () => {
    invoiceRows = [
      { amount_due: 100_000_000, status: 'sent' },
      { amount_due: null, status: 'sent' },
    ]
    const n = await resolvePenaltyBase('outstanding_proyek', {
      invoiceTotal: 1, projectId: 'p1', contractValue: null,
    })
    expect(n).toBe(100_000_000)
  })
})

describe('resolveProjectPenaltyTerms — override proyek vs setelan global', () => {
  it('tanpa override → memakai setelan global apa adanya', async () => {
    nilaiFinansial = {
      'penalty.enabled': true,
      'penalty.basis': 'invoice_telat',
      'penalty.rate_per_day': 2,
      'penalty.cap_pct': 5,
      'penalty.grace_days': 7,
    }
    const t = await resolveProjectPenaltyTerms(null, '2026-01-01')
    expect(t.enabled).toBe(true)
    expect(t.ratePerDay).toBe(2)
    expect(t.capPct).toBe(5)
    expect(t.graceDays).toBe(7)
  })

  it('override proyek MENANG atas global — per-field, bukan semua-atau-tak-ada', async () => {
    nilaiFinansial = {
      'penalty.enabled': true,
      'penalty.basis': 'invoice_telat',
      'penalty.rate_per_day': 2,
      'penalty.cap_pct': 5,
      'penalty.grace_days': 7,
    }
    // Hanya rate & grace yang di-override; cap dibiarkan mengikuti global.
    const t = await resolveProjectPenaltyTerms(
      { penalty_rate_per_day: 1, penalty_grace_days: 14 }, '2026-01-01')

    expect(t.ratePerDay, 'override rate proyek DIABAIKAN — kesepakatan kontrak tak terpakai').toBe(1)
    expect(t.graceDays, 'override grace proyek DIABAIKAN').toBe(14)
    // Bagian yang TIDAK di-override wajib tetap dari global. Kalau override
    // parsial diam-diam mengosongkan sisanya, cap denda hilang dan denda bisa
    // tumbuh tanpa batas.
    expect(t.capPct, 'field tanpa override ikut hilang — cap denda lenyap').toBe(5)
  })

  it('proyek mematikan denda meski global menyalakan', async () => {
    nilaiFinansial = { 'penalty.enabled': true, 'penalty.basis': 'invoice_telat' }
    const t = await resolveProjectPenaltyTerms({ penalty_enabled: false }, '2026-01-01')
    // Arah ini yang paling penting: proyek dengan kesepakatan "tanpa denda"
    // tak boleh terdenda hanya karena setelan global menyala.
    expect(t.enabled, 'proyek bebas-denda TETAP terdenda').toBe(false)
  })

  it('global kosong → jatuh ke nilai bawaan, bukan NaN/undefined', async () => {
    nilaiFinansial = {}   // financial_config belum diisi sama sekali
    const t = await resolveProjectPenaltyTerms(null, '2026-01-01')
    expect(t.enabled).toBe(false)                       // aman: mati bila tak diatur
    expect(Number.isFinite(t.ratePerDay), 'ratePerDay bukan angka').toBe(true)
    expect(Number.isFinite(t.capPct), 'capPct bukan angka').toBe(true)
    expect(Number.isInteger(t.graceDays), 'graceDays bukan bilangan bulat').toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { hitungBacklog, type BidRingkas } from '../bid-backlog'

// Dua angka di sini menentukan keputusan bisnis nyata:
//   · backlog → dipakai memutuskan ambil tender baru atau tidak
//   · selisih harga → membedakan "kalah karena harga" dari "kalah karena syarat"
// Salah sedikit di keduanya mengarahkan keputusan ke arah yang salah, dan
// grafiknya tetap "kelihatan masuk akal". Karena itu diuji sebagai ANGKA.

const bid = (
  status: string,
  bid_value: number | null = null,
  winner_value: number | null = null,
  project_id: string | null = null,
): BidRingkas => ({
  id: Math.random().toString(36).slice(2),
  status, bid_value, winner_value, project_id,
  submitted_at: null, decided_at: null,
})

describe('backlog', () => {
  it('hanya menghitung yang MENANG dan proyeknya belum selesai', () => {
    const r = hitungBacklog([
      bid('menang', 500_000_000, null, 'p1'),
      bid('menang', 300_000_000, null, 'p2'),
      bid('kalah', 200_000_000),
      bid('diajukan', 100_000_000),
    ], new Set(['p2']))          // p2 sudah selesai
    expect(r.backlogJumlah).toBe(1)
    expect(r.backlogNilai).toBe(500_000_000)
  })

  it('menang TANPA project_id tetap dihitung backlog', () => {
    // Tender menang yang belum dibuatkan proyeknya tetap beban kapasitas —
    // justru itu yang paling mudah terlupa saat memutuskan ambil kerja.
    const r = hitungBacklog([bid('menang', 250_000_000)])
    expect(r.backlogJumlah).toBe(1)
    expect(r.backlogNilai).toBe(250_000_000)
  })

  it('proyek selesai TIDAK dihitung — kapasitas jangan terlihat penuh padahal lowong', () => {
    const r = hitungBacklog([bid('menang', 900_000_000, null, 'p1')], new Set(['p1']))
    expect(r.backlogJumlah).toBe(0)
    expect(r.backlogNilai).toBe(0)
  })

  it('pipeline = yang masih menunggu keputusan, terpisah dari backlog', () => {
    const r = hitungBacklog([
      bid('prospek', 100), bid('go', 200), bid('diajukan', 300),
      bid('menang', 999),
    ])
    expect(r.pipelineJumlah).toBe(3)
    expect(r.pipelineNilai).toBe(600)
    expect(r.backlogNilai).toBe(999)
  })
})

describe('win rate', () => {
  it('menang ÷ (menang + kalah)', () => {
    const r = hitungBacklog([bid('menang'), bid('menang'), bid('menang'), bid('kalah')])
    expect(r.winRatePct).toBe(75)
  })

  it('no_go & batal TIDAK menghukum win-rate', () => {
    // Memasukkan keputusan untuk TIDAK ikut ke win-rate akan menghukum
    // kedisiplinan memilih tender — persis kebalikan dari yang diinginkan.
    const r = hitungBacklog([bid('menang'), bid('no_go'), bid('batal'), bid('kalah')])
    expect(r.winRatePct).toBe(50)
  })

  it('belum ada yang diputuskan → null, BUKAN 0', () => {
    // "belum pernah ikut" ≠ "selalu kalah". 0% akan terbaca sebagai yang kedua.
    expect(hitungBacklog([bid('prospek'), bid('go')]).winRatePct).toBeNull()
    expect(hitungBacklog([]).winRatePct).toBeNull()
  })
})

describe('selisih harga vs pemenang', () => {
  it('positif = penawaran kita lebih mahal', () => {
    const r = hitungBacklog([bid('kalah', 110, 100)])
    expect(r.selisihHargaRataPct).toBe(10)
    expect(r.kalahDenganPembanding).toBe(1)
  })

  it('negatif = kita lebih murah tapi tetap kalah → BUKAN soal harga', () => {
    // Ini temuan paling berguna dari angka ini: kalau kita lebih murah dan
    // masih kalah, menurunkan harga di tender berikutnya membuang margin
    // tanpa menambah peluang.
    const r = hitungBacklog([bid('kalah', 90, 100)])
    expect(r.selisihHargaRataPct).toBe(-10)
  })

  it('dirata-rata dari yang punya pembanding saja', () => {
    const r = hitungBacklog([
      bid('kalah', 120, 100),   // +20%
      bid('kalah', 110, 100),   // +10%
      bid('kalah', 500, null),  // tak ada pembanding — diabaikan
    ])
    expect(r.selisihHargaRataPct).toBe(15)
    expect(r.kalahDenganPembanding).toBe(2)
    expect(r.kalah).toBe(3)      // tetap dihitung sebagai kalah
  })

  it('nilai nol/null tak menghasilkan −100% palsu', () => {
    // Membandingkan terhadap nol menghasilkan angka ekstrem yang tampak
    // seperti temuan padahal cuma data kosong.
    const r = hitungBacklog([bid('kalah', 0, 100), bid('kalah', 100, 0), bid('kalah', null, null)])
    expect(r.selisihHargaRataPct).toBeNull()
    expect(r.kalahDenganPembanding).toBe(0)
  })

  it('nol tender kalah → null', () => {
    expect(hitungBacklog([bid('menang', 100)]).selisihHargaRataPct).toBeNull()
  })
})

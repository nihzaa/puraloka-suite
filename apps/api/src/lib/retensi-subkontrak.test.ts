import { describe, it, expect } from 'vitest'
import { hitungPotonganRetensi, validasiPencairanRetensi } from './retensi-subkontrak.js'

// ════════════════════════════════════════════════════════════════════════════
// RETENSI SUBKONTRAK — dua arah kebocoran, dua-duanya uang nyata
// ════════════════════════════════════════════════════════════════════════════
//
//   TIDAK DIPOTONG → kontraktor menahan retensi dari owner tapi membayar penuh
//                    ke mandor. Selisihnya ia tanggung sendiri, dan saat ada
//                    cacat yang harus diperbaiki, tak ada uang tertahan untuk
//                    memaksa mandor kembali — itu seluruh guna retensi.
//
//   TIDAK DICAIRKAN → mandor sudah dipotong tapi uangnya tak pernah kembali.
//                     Dirugikan diam-diam, tanpa satu pun laporan yang
//                     menunjukkannya.
//
// Titik paling mudah salah: URUTAN POTONGAN. Retensi dari nilai KOTOR, kasbon
// sesudahnya. Kalau dibalik, besarnya retensi jadi bergantung pada utang
// mandor — dan itu bukan kesepakatan siapa pun.

describe('potongan retensi — urutan menentukan', () => {
  it('retensi dihitung dari BRUTO, bukan dari nilai sesudah kasbon', () => {
    // bruto 10jt, retensi 5% = 500rb, kasbon 2jt → neto 7,5jt
    // Kalau salah urutan: (10jt − 2jt) × 5% = 400rb → mandor tertahan 100rb
    // lebih sedikit untuk pekerjaan yang persis sama.
    const h = hitungPotonganRetensi({ bruto: 10_000_000, retensiPct: 5, potonganKasbon: 2_000_000 })

    expect(h.ok).toBe(true)
    expect(h.retensi,
      'retensi dihitung setelah kasbon — besarnya jaminan jadi bergantung pada ' +
      'UTANG mandor, bukan pada nilai pekerjaannya').toBe(500_000)
    expect(h.neto).toBe(7_500_000)
  })

  it('tanpa kasbon: neto = bruto − retensi', () => {
    const h = hitungPotonganRetensi({ bruto: 10_000_000, retensiPct: 5, potonganKasbon: 0 })
    expect(h.retensi).toBe(500_000)
    expect(h.neto).toBe(9_500_000)
  })

  it('retensiPct null = scope tanpa kesepakatan retensi → nol, dan itu SAH', () => {
    const h = hitungPotonganRetensi({ bruto: 10_000_000, retensiPct: null, potonganKasbon: 0 })
    expect(h.ok).toBe(true)
    expect(h.retensi).toBe(0)
    expect(h.neto).toBe(10_000_000)
  })

  it('pembulatan ke sen — kolomnya numeric(15,2)', () => {
    // 3.333.333 × 5% = 166.666,65
    const h = hitungPotonganRetensi({ bruto: 3_333_333, retensiPct: 5, potonganKasbon: 0 })
    expect(h.retensi).toBe(166_666.65)
    expect(h.neto).toBe(3_166_666.35)
  })

  it('retensi 100% menahan seluruhnya — sah meski tak lazim', () => {
    const h = hitungPotonganRetensi({ bruto: 1_000_000, retensiPct: 100, potonganKasbon: 0 })
    expect(h.ok).toBe(true)
    expect(h.retensi).toBe(1_000_000)
    expect(h.neto).toBe(0)
  })
})

describe('FAIL-CLOSED — angka rusak MENOLAK, bukan jadi nol', () => {
  it('persen di luar 0–100 DITOLAK', () => {
    expect(hitungPotonganRetensi({ bruto: 1_000_000, retensiPct: 150, potonganKasbon: 0 }).ok).toBe(false)
    expect(hitungPotonganRetensi({ bruto: 1_000_000, retensiPct: -5, potonganKasbon: 0 }).ok).toBe(false)
  })

  it('persen NaN DITOLAK — bukan diperlakukan sebagai 0', () => {
    const h = hitungPotonganRetensi({ bruto: 1_000_000, retensiPct: NaN, potonganKasbon: 0 })

    expect(h.ok,
      'persen rusak diperlakukan sebagai nol — retensi yang GAGAL DIBACA ' +
      'terlihat persis sama dengan retensi yang memang tak disepakati, dan ' +
      'yang pertama adalah kebocoran uang').toBe(false)
  })

  it('bruto negatif DITOLAK', () => {
    expect(hitungPotonganRetensi({ bruto: -1, retensiPct: 5, potonganKasbon: 0 }).ok).toBe(false)
  })

  it('kasbon negatif DITOLAK — potongan negatif = menambah bayaran diam-diam', () => {
    expect(hitungPotonganRetensi({ bruto: 1_000_000, retensiPct: 5, potonganKasbon: -500_000 }).ok).toBe(false)
  })

  it('potongan MELEBIHI tagihan DITOLAK, tidak dipaksa jadi 0', () => {
    // bruto 1jt, retensi 5% = 50rb, kasbon 2jt → neto −1.050.000
    const h = hitungPotonganRetensi({ bruto: 1_000_000, retensiPct: 5, potonganKasbon: 2_000_000 })

    expect(h.ok,
      'pembayaran bernilai negatif dipaksa jadi 0 diam-diam — sisa kasbon ' +
      'lenyap dari pembukuan tanpa seorang pun memutuskannya').toBe(false)
    expect(h.galat).toContain('melebihi')
  })

  it('neto tepat 0 karena potongan pas — LOLOS, bukan ditolak', () => {
    const h = hitungPotonganRetensi({ bruto: 1_000_000, retensiPct: 10, potonganKasbon: 900_000 })
    expect(h.ok).toBe(true)
    expect(h.neto).toBe(0)
  })
})

describe('pencairan retensi — tak boleh melebihi yang tertahan', () => {
  it('pencairan dalam batas LOLOS', () => {
    const v = validasiPencairanRetensi({ ditahan: 5_000_000, sudahDicairkan: 1_000_000, diminta: 2_000_000 })
    expect(v.ok).toBe(true)
    expect(v.tersedia).toBe(4_000_000)
  })

  it('pencairan TEPAT sebesar sisa LOLOS', () => {
    const v = validasiPencairanRetensi({ ditahan: 5_000_000, sudahDicairkan: 1_000_000, diminta: 4_000_000 })
    expect(v.ok, 'sisa persis ditolak — retensi terakhir mandor tak pernah bisa cair').toBe(true)
  })

  it('pencairan MELEBIHI sisa DITOLAK', () => {
    const v = validasiPencairanRetensi({ ditahan: 5_000_000, sudahDicairkan: 1_000_000, diminta: 4_000_001 })

    expect(v.ok,
      'pencairan melebihi yang pernah ditahan — uang keluar dari pembukuan ' +
      'tanpa pernah masuk').toBe(false)
    expect(v.tersedia).toBe(4_000_000)
  })

  it('yang SUDAH dicairkan diperhitungkan — bukan hanya total ditahan', () => {
    // Sudah cair 5jt dari 5jt: sisa nol, permintaan sekecil apa pun ditolak.
    const v = validasiPencairanRetensi({ ditahan: 5_000_000, sudahDicairkan: 5_000_000, diminta: 1 })

    expect(v.ok,
      'riwayat pencairan diabaikan — retensi yang sama bisa dicairkan ' +
      'BERKALI-KALI, dan tiap kali uang keluar sungguhan').toBe(false)
    expect(v.tersedia).toBe(0)
  })

  it('pencairan 0 atau negatif DITOLAK', () => {
    expect(validasiPencairanRetensi({ ditahan: 5_000_000, sudahDicairkan: 0, diminta: 0 }).ok).toBe(false)
    expect(validasiPencairanRetensi({ ditahan: 5_000_000, sudahDicairkan: 0, diminta: -1 }).ok).toBe(false)
  })

  it('toleransi 1 sen dihormati — pembulatan numeric(15,2), bukan kelonggaran bisnis', () => {
    const v = validasiPencairanRetensi({ ditahan: 1_000_000, sudahDicairkan: 0, diminta: 1_000_000.005 })
    expect(v.ok).toBe(true)
  })

  it('angka rusak DITOLAK', () => {
    expect(validasiPencairanRetensi({ ditahan: NaN, sudahDicairkan: 0, diminta: 1 }).ok).toBe(false)
  })
})

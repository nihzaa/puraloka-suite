import { describe, it, expect } from 'vitest'
import {
  susunTender,
  AMBANG_TERLALU_RENDAH_PCT,
  type BarisPenawaranSubkon,
} from '../tender-subkon.js'

// ═════════════════════════════════════════════════════════════════════════════
// TENDER SUBKON — angka yang MEMILIH PELAKSANA borongan ratusan juta.
//
// Diukur: 20 lingkup kerja Rp 15jt–280jt, semuanya `unsigned`, tanpa jejak
// bagaimana mandornya dipilih.
//
// Dua arah salah, keduanya mahal dan keduanya TIDAK melempar error:
//
//   termurah salah hitung  → borongan jatuh ke mandor yang keliru
//   terlalu rendah dipuji  → mandor kabur di tengah, pekerjaan mangkrak
// ═════════════════════════════════════════════════════════════════════════════

const P = (o: Partial<BarisPenawaranSubkon> & Pick<BarisPenawaranSubkon, 'id' | 'nilai_penawaran'>): BarisPenawaranSubkon => ({
  worker_id: 'w' + o.id, worker_name: 'Mandor ' + o.id, ...o,
})

describe('susunTender — dasar', () => {
  it('penawar termurah ditandai, selisih dihitung terhadapnya', () => {
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 100_000_000 }),
      P({ id: 'b', nilai_penawaran: 120_000_000 }),
    ])
    expect(h.nilai_termurah).toBe(100_000_000)
    expect(h.penawaran[0].penilaian).toBe('termurah')
    expect(h.penawaran[1].selisih_termurah_pct).toBe(20)
    expect(h.rentang_pct).toBe(20)
  })

  it('rentang null bila hanya SATU penawar', () => {
    // "Rentang 0%" terbaca "harganya seragam" — padahal tak ada pembanding.
    const h = susunTender([P({ id: 'a', nilai_penawaran: 100_000_000 })])
    expect(h.rentang_pct).toBeNull()
    expect(h.jumlah_menawar).toBe(1)
  })
})

describe('susunTender — jalan di mana pelaksana salah bisa terpilih', () => {
  it('yang TIDAK MENAWAR tak pernah jadi termurah', () => {
    // Kalau `tidak_menawar` diperlakukan sebagai 0, ia SELALU menang — dan
    // borongan jatuh ke mandor yang tak pernah mengajukan harga.
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 100_000_000 }),
      P({ id: 'b', nilai_penawaran: 0, tidak_menawar: true }),
    ])
    expect(h.nilai_termurah).toBe(100_000_000)
    const b = h.penawaran.find((p) => p.id === 'b')!
    expect(b.nilai).toBeNull()
    expect(b.penilaian).toBe('tidak_menawar')
    expect(h.jumlah_tidak_menawar).toBe(1)
  })

  it('NUMERIC berupa STRING dibandingkan sebagai ANGKA', () => {
    // Sebagai TEKS, "100000000" < "99000000" — penawar termahal menang.
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: '100000000' }),
      P({ id: 'b', nilai_penawaran: '99000000' }),
    ])
    expect(h.nilai_termurah).toBe(99_000_000)
    expect(h.penawaran[0].id).toBe('b')
  })

  it('penawaran jauh DI BAWAH perkiraan ditandai, bukan dipuji', () => {
    // Ini inti modulnya: termurah 40% di bawah perkiraan biasanya berarti ada
    // lingkup yang tak dihitung — dan itu kembali sebagai klaim tambah atau
    // pekerjaan mangkrak. Menandainya "termurah" saja membuat yang paling
    // berbahaya terlihat paling menarik.
    const h = susunTender(
      [
        P({ id: 'murah', nilai_penawaran: 60_000_000 }),
        P({ id: 'wajar', nilai_penawaran: 98_000_000 }),
      ],
      100_000_000)
    const murah = h.penawaran.find((p) => p.id === 'murah')!
    expect(murah.selisih_perkiraan_pct).toBe(-40)
    expect(murah.penilaian).toBe('terlalu_rendah')
    expect(murah.penilaian).not.toBe('termurah')
    expect(h.jumlah_terlalu_rendah).toBe(1)
    expect(AMBANG_TERLALU_RENDAH_PCT).toBe(20)
  })

  it('penawaran jauh DI ATAS perkiraan juga ditandai', () => {
    const h = susunTender([P({ id: 'a', nilai_penawaran: 150_000_000 })], 100_000_000)
    expect(h.penawaran[0].selisih_perkiraan_pct).toBe(50)
    expect(h.penawaran[0].penilaian).toBe('terlalu_tinggi')
  })

  it('tanpa perkiraan, penilaian jatuh ke termurah/wajar', () => {
    // Perkiraan kosong ≠ semuanya wajar. Yang benar: tak bisa dinilai
    // terhadap perkiraan, jadi hanya perbandingan antar penawar yang berlaku.
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 10_000_000 }),
      P({ id: 'b', nilai_penawaran: 90_000_000 }),
    ])
    expect(h.penawaran[0].selisih_perkiraan_pct).toBeNull()
    expect(h.penawaran[0].penilaian).toBe('termurah')
    expect(h.jumlah_terlalu_rendah).toBe(0)
  })

  it('yang GUGUR tak ikut perbandingan harga', () => {
    // Penawar gugur tak memenuhi syarat; harganya tak relevan. Membiarkannya
    // ikut membuat "termurah" jatuh ke penawar yang memang tak bisa dipakai.
    const h = susunTender([
      P({ id: 'gugur', nilai_penawaran: 50_000_000, status: 'gugur' }),
      P({ id: 'sah', nilai_penawaran: 100_000_000 }),
    ])
    expect(h.nilai_termurah).toBe(100_000_000)
    expect(h.jumlah_menawar).toBe(1)
    // …tapi tetap DITAMPILKAN, di urutan bawah — supaya terlihat bahwa ia
    // pernah mengajukan dan kenapa tak dipakai.
    expect(h.penawaran.some((p) => p.id === 'gugur')).toBe(true)
    expect(h.penawaran[h.penawaran.length - 1].id).toBe('gugur')
  })
})

describe('susunTender — pemenang bukan termurah WAJIB terlihat', () => {
  it('pemenang bukan-termurah ditandai beserta selisihnya', () => {
    // Sering ada alasan sah (rekam jejak, kapasitas, waktu). Tapi alasan itu
    // tak pernah ditanyakan kalau tak ada yang menandainya.
    const h = susunTender([
      P({ id: 'murah', nilai_penawaran: 100_000_000, status: 'kalah' }),
      P({ id: 'menang', nilai_penawaran: 115_000_000, status: 'menang' }),
    ])
    expect(h.pemenang?.id).toBe('menang')
    expect(h.pemenang_bukan_termurah).toBe(true)
    expect(h.selisih_pemenang_termurah).toBe(15_000_000)
  })

  it('pemenang YANG termurah tidak ditandai', () => {
    const h = susunTender([
      P({ id: 'menang', nilai_penawaran: 100_000_000, status: 'menang' }),
      P({ id: 'kalah', nilai_penawaran: 120_000_000, status: 'kalah' }),
    ])
    expect(h.pemenang_bukan_termurah).toBe(false)
    expect(h.selisih_pemenang_termurah).toBe(0)
  })

  it('belum ada pemenang → null, bukan penawar pertama', () => {
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 100_000_000 }),
      P({ id: 'b', nilai_penawaran: 120_000_000 }),
    ])
    expect(h.pemenang).toBeNull()
    expect(h.pemenang_bukan_termurah).toBe(false)
  })
})

describe('susunTender — jalan lain di mana angkanya bisa menyesatkan', () => {
  it('null/undefined tak membuat NaN mengalir', () => {
    const h = susunTender([P({ id: 'a', nilai_penawaran: null as unknown as number })])
    expect(Number.isNaN(h.penawaran[0].nilai ?? 0)).toBe(false)
    expect(h.penawaran[0].nilai).toBe(0)
  })

  it('nol penawar sama sekali: termurah null, bukan 0', () => {
    const h = susunTender([])
    expect(h.nilai_termurah).toBeNull()
    expect(h.rentang_pct).toBeNull()
    expect(h.pemenang).toBeNull()
  })

  it('semua tidak menawar: termurah null', () => {
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 0, tidak_menawar: true }),
      P({ id: 'b', nilai_penawaran: 0, tidak_menawar: true }),
    ])
    expect(h.nilai_termurah).toBeNull()
    expect(h.jumlah_menawar).toBe(0)
    expect(h.jumlah_tidak_menawar).toBe(2)
  })

  it('urutan: termurah di atas, tak-menawar lalu gugur di bawah', () => {
    const h = susunTender([
      P({ id: 'gugur', nilai_penawaran: 10_000_000, status: 'gugur' }),
      P({ id: 'takmenawar', nilai_penawaran: 0, tidak_menawar: true }),
      P({ id: 'mahal', nilai_penawaran: 200_000_000 }),
      P({ id: 'murah', nilai_penawaran: 100_000_000 }),
    ])
    expect(h.penawaran.map((p) => p.id)).toEqual(['murah', 'mahal', 'takmenawar', 'gugur'])
  })

  it('perkiraan NOL tidak menghasilkan Infinity', () => {
    const h = susunTender([P({ id: 'a', nilai_penawaran: 100_000_000 })], 0)
    expect(h.penawaran[0].selisih_perkiraan_pct).toBeNull()
    expect(h.penawaran[0].penilaian).toBe('termurah')
  })
})

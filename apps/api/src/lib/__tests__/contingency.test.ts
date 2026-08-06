import { describe, it, expect } from 'vitest'
import {
  hitungContingency,
  AMBANG_MENIPIS_PCT,
  AMBANG_KRITIS_PCT,
  type BarisPos,
  type BarisPenggunaan,
} from '../contingency.js'

// ═════════════════════════════════════════════════════════════════════════════
// CONTINGENCY — angka yang menentukan "boleh ambil lagi atau tidak".
//
// Sisa cadangan yang salah hitung punya dua arah, keduanya mahal:
//
//   terlalu BESAR  → pengeluaran berikutnya disetujui padahal bantalannya habis
//   terlalu KECIL  → pekerjaan tertahan padahal dananya masih ada
//
// Tak satu pun melempar error. Keduanya menghasilkan angka rupiah yang rapi.
// ═════════════════════════════════════════════════════════════════════════════

const P = (o: Partial<BarisPos> & Pick<BarisPos, 'id' | 'nilai'>): BarisPos => ({
  project_id: 'p1', project_name: 'Proyek Uji', nama: 'Cadangan Umum', ...o,
})

const G = (o: Partial<BarisPenggunaan> & Pick<BarisPenggunaan, 'pos_id' | 'nilai'>): BarisPenggunaan => ({
  id: 'g' + Math.random().toString(36).slice(2, 7),
  tanggal: '2026-05-01', alasan: 'uji', ...o,
})

describe('hitungContingency — dasar', () => {
  it('pos tanpa penarikan = aman, sisa penuh', () => {
    const h = hitungContingency([P({ id: 'a', nilai: 50_000_000 })], [])
    expect(h.pos[0].terpakai).toBe(0)
    expect(h.pos[0].sisa).toBe(50_000_000)
    expect(h.pos[0].terpakai_pct).toBe(0)
    expect(h.pos[0].status).toBe('aman')
    expect(h.pos[0].jumlah_penarikan).toBe(0)
  })

  it('penarikan dijumlahkan, sisa dihitung', () => {
    const h = hitungContingency(
      [P({ id: 'a', nilai: 50_000_000 })],
      [G({ pos_id: 'a', nilai: 10_000_000 }), G({ pos_id: 'a', nilai: 5_000_000 })])
    expect(h.pos[0].terpakai).toBe(15_000_000)
    expect(h.pos[0].sisa).toBe(35_000_000)
    expect(h.pos[0].terpakai_pct).toBe(30)
    expect(h.pos[0].jumlah_penarikan).toBe(2)
  })

  it('porsi terhadap kontrak dihitung', () => {
    // CO-001 Rp 50jt pada kontrak Rp 570jt — data nyata yang melahirkan modul ini.
    const h = hitungContingency(
      [P({ id: 'a', nilai: 28_500_000, contract_value: 570_000_000 })], [])
    expect(h.pos[0].porsi_kontrak_pct).toBe(5)
  })
})

describe('hitungContingency — jalan di mana angkanya menyesatkan', () => {
  it('sisa NEGATIF dipertahankan, TIDAK di-floor ke 0', () => {
    // Meratakan defisit ke nol menyembunyikan kejadian yang paling mahal:
    // uang sudah keluar melebihi cadangan, dan tak ada yang tahu.
    const h = hitungContingency(
      [P({ id: 'a', nilai: 50_000_000 })],
      [G({ pos_id: 'a', nilai: 60_000_000 })])
    expect(h.pos[0].sisa).toBe(-10_000_000)
    expect(h.pos[0].sisa).toBeLessThan(0)
    expect(h.total_sisa).toBe(-10_000_000)
  })

  it('terpakai melebihi cadangan = "terlampaui", BUKAN "kritis"', () => {
    // 120% adalah defisit, bukan "nyaris habis". Menyamakannya membuat yang
    // sudah lewat batas tampak sama gawatnya dengan yang belum.
    const h = hitungContingency(
      [P({ id: 'a', nilai: 50_000_000 })],
      [G({ pos_id: 'a', nilai: 60_000_000 })])
    expect(h.pos[0].terpakai_pct).toBe(120)
    expect(h.pos[0].status).toBe('terlampaui')
    expect(h.pos[0].status).not.toBe('kritis')
    expect(h.jumlah_terlampaui).toBe(1)
    expect(h.jumlah_kritis).toBe(0)
  })

  it('NUMERIC berupa STRING dijumlahkan sebagai angka', () => {
    // Sebagai teks, "10000000" + "5000000" = "100000005000000".
    const h = hitungContingency(
      [P({ id: 'a', nilai: '50000000' })],
      [G({ pos_id: 'a', nilai: '10000000' }), G({ pos_id: 'a', nilai: '5000000' })])
    expect(h.pos[0].terpakai).toBe(15_000_000)
    expect(h.pos[0].sisa).toBe(35_000_000)
  })

  it('nilai kontrak TAK DIKETAHUI → porsi null, BUKAN 0', () => {
    // 0 terbaca "cadangannya nol persen dari kontrak"; null menyatakan
    // "tak bisa dihitung".
    const h = hitungContingency([P({ id: 'a', nilai: 50_000_000, contract_value: null })], [])
    expect(h.pos[0].porsi_kontrak_pct).toBeNull()
  })

  it('pos DITUTUP tak ikut total cadangan', () => {
    // Cadangan yang sudah ditutup bukan bantalan yang tersedia. Menjumlahkannya
    // membuat perusahaan tampak punya cadangan yang tak bisa dipakai.
    const h = hitungContingency(
      [
        P({ id: 'aktif', nilai: 30_000_000 }),
        P({ id: 'tutup', nama: 'Cadangan Lama', nilai: 100_000_000, status: 'ditutup' }),
      ], [])
    expect(h.total_cadangan).toBe(30_000_000)
    expect(h.pos.find((p) => p.id === 'tutup')!.status).toBe('ditutup')
  })

  it('ambang menipis & kritis diterapkan pada persentase', () => {
    const h = hitungContingency(
      [
        P({ id: 'aman', nama: 'A', nilai: 100 }),
        P({ id: 'menipis', nama: 'B', nilai: 100 }),
        P({ id: 'kritis', nama: 'C', nilai: 100 }),
      ],
      [
        G({ pos_id: 'aman', nilai: 50 }),
        G({ pos_id: 'menipis', nilai: 70 }),
        G({ pos_id: 'kritis', nilai: 95 }),
      ])
    expect(h.pos.find((p) => p.id === 'aman')!.status).toBe('aman')
    expect(h.pos.find((p) => p.id === 'menipis')!.status).toBe('menipis')
    expect(h.pos.find((p) => p.id === 'kritis')!.status).toBe('kritis')
    expect(AMBANG_MENIPIS_PCT).toBe(60)
    expect(AMBANG_KRITIS_PCT).toBe(90)
  })

  it('terpakai TEPAT 100% = kritis, bukan terlampaui', () => {
    // Habis persis bukan defisit. Bedanya menentukan apakah orang mencari
    // sumber dana lain atau sekadar berhenti menarik.
    const h = hitungContingency(
      [P({ id: 'a', nilai: 50_000_000 })],
      [G({ pos_id: 'a', nilai: 50_000_000 })])
    expect(h.pos[0].sisa).toBe(0)
    expect(h.pos[0].status).toBe('kritis')
    expect(h.pos[0].status).not.toBe('terlampaui')
  })

  it('nilai cadangan NOL tak menghasilkan Infinity', () => {
    const h = hitungContingency(
      [P({ id: 'a', nilai: 0 })], [G({ pos_id: 'a', nilai: 1_000 })])
    expect(Number.isFinite(h.pos[0].terpakai_pct)).toBe(true)
    expect(h.pos[0].terpakai_pct).toBe(0)
    expect(h.pos[0].status).toBe('terlampaui')   // sisanya negatif
  })

  it('null/undefined tak membuat NaN mengalir ke total', () => {
    const h = hitungContingency(
      [P({ id: 'a', nilai: null as unknown as number })],
      [G({ pos_id: 'a', nilai: null as unknown as number })])
    expect(Number.isNaN(h.total_cadangan)).toBe(false)
    expect(Number.isNaN(h.total_sisa)).toBe(false)
  })

  it('penarikan untuk pos yang tak ada diabaikan, tak jadi NaN', () => {
    const h = hitungContingency(
      [P({ id: 'a', nilai: 50_000_000 })],
      [G({ pos_id: 'entah', nilai: 999_000_000 })])
    expect(h.pos[0].terpakai).toBe(0)
    expect(h.total_terpakai).toBe(0)
  })
})

describe('hitungContingency — yang tak boleh hilang dari laporan', () => {
  it('proyek TANPA pos cadangan dinyatakan', () => {
    // "Nol pos kritis" terbaca "semuanya aman" — padahal bisa jadi tak ada
    // cadangannya sama sekali.
    const h = hitungContingency(
      [P({ id: 'a', nilai: 10_000_000, project_id: 'p1' })],
      [],
      [{ project_id: 'p1', project_name: 'Punya' }, { project_id: 'p2', project_name: 'Tanpa Cadangan' }])
    expect(h.jumlah_kritis).toBe(0)
    expect(h.proyek_tanpa_pos).toHaveLength(1)
    expect(h.proyek_tanpa_pos[0].project_name).toBe('Tanpa Cadangan')
  })

  it('yang TERLAMPAUI diurutkan paling atas — walau nilainya kecil', () => {
    // Pos defisit adalah masalah yang sedang berjalan, bukan catatan.
    const h = hitungContingency(
      [
        P({ id: 'besar-aman', nama: 'Besar Aman', nilai: 500_000_000 }),
        P({ id: 'kecil-defisit', nama: 'Kecil Defisit', nilai: 1_000_000 }),
      ],
      [G({ pos_id: 'kecil-defisit', nilai: 1_500_000 })])
    expect(h.pos[0].id).toBe('kecil-defisit')
    expect(h.pos[0].status).toBe('terlampaui')
  })

  it('urutan menimbang STATUS lebih dulu daripada persentase terpakai', () => {
    // ⚠️ Uji di atas lulus lewat pemecah seri `terpakai_pct` (150% > 0%),
    // BUKAN lewat status — mutasi "buang urutan status" LOLOS (2026-08-07).
    // Pola yang sama sudah terjadi di register asuransi hari yang sama.
    //
    // Di sini yang KRITIS sengaja diberi persentase LEBIH TINGGI daripada
    // yang terlampaui. Kalau urutannya tak lagi menimbang status, si kritis
    // akan naik ke atas.
    //
    //   kritis     terpakai 99%   (belum defisit)
    //   terlampaui terpakai 101%  (sudah defisit)  ← harus di ATAS
    const h = hitungContingency(
      [
        P({ id: 'kritis-99', nama: 'Kritis', nilai: 100 }),
        P({ id: 'defisit-101', nama: 'Defisit', nilai: 100 }),
      ],
      [G({ pos_id: 'kritis-99', nilai: 99 }), G({ pos_id: 'defisit-101', nilai: 101 })])

    expect(h.pos[0].status).toBe('terlampaui')
    expect(h.pos[0].id).toBe('defisit-101')
    expect(h.pos[1].status).toBe('kritis')

    // Pasangan di atas BELUM membuktikan apa pun: 101% > 99%, jadi urutannya
    // sama saja entah ditentukan status atau persentase.
    //
    // Yang benar-benar memisahkan keduanya adalah pos DITUTUP. Statusnya
    // berperingkat TERAKHIR, tapi persentase terpakainya bisa yang TERTINGGI
    // — dua sinyal yang saling berlawanan. Kalau urutannya tak menimbang
    // status, pos ditutup yang terpakai 200% akan naik ke puncak dan
    // menenggelamkan pos aktif yang benar-benar perlu ditindak.
    const balik = hitungContingency(
      [
        P({ id: 'tutup-200', nama: 'Ditutup', nilai: 100, status: 'ditutup' }),
        P({ id: 'aktif-menipis', nama: 'Aktif Menipis', nilai: 100 }),
      ],
      [
        G({ pos_id: 'tutup-200', nilai: 200 }),        // 200% — TERTINGGI
        G({ pos_id: 'aktif-menipis', nilai: 70 }),     //  70% — menipis
      ])
    expect(balik.pos[0].status).toBe('menipis')        // aktif menang…
    expect(balik.pos[0].terpakai_pct).toBeLessThan(balik.pos[1].terpakai_pct)
    expect(balik.pos[1].status).toBe('ditutup')        // …walau persentasenya jauh lebih kecil
  })

  it('penarikan terakhir dicatat — cadangan yang sedang aktif dipakai', () => {
    const h = hitungContingency(
      [P({ id: 'a', nilai: 50_000_000 })],
      [
        G({ pos_id: 'a', nilai: 1_000_000, tanggal: '2026-03-01' }),
        G({ pos_id: 'a', nilai: 2_000_000, tanggal: '2026-07-15' }),
        G({ pos_id: 'a', nilai: 1_000_000, tanggal: '2026-05-20' }),
      ])
    expect(h.pos[0].penarikan_terakhir).toBe('2026-07-15')
  })
})

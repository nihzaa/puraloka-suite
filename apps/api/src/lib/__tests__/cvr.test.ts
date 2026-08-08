import { describe, it, expect } from 'vitest'
import { hitungCvr, ringkasCvr, type BarisScope } from '../cvr.js'

/**
 * CVR — Cost Value Reconciliation, per SCOPE BORONGAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA, DAN KENAPA PER SCOPE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * CVR adalah 🔴 terakhir di taksonomi yang bukan "jangan dibangun", dan
 * F5-1 menyebutnya *"inilah yang membedakan ERP kontraktor dari pencatat
 * biaya"*. Ia mengadu **biaya terpakai** vs **nilai terpasang**.
 *
 * Penundaannya (2026-08-07) beralasan: sisi biaya kosong. Diukur ulang
 * 2026-08-08 — separuhnya sudah tidak berlaku:
 *
 *   • sisi BIAYA sudah ada (`belanja-aktual.ts`, Rp 168 juta terbukti)
 *   • per COST CODE masih terblokir: `work_scopes.rab_category_id` 0 dari 20
 *   • per SCOPE BORONGAN **datanya lengkap**: `weekly_wage_reports.scope_id`
 *     50/50 terisi, `work_scopes.borongan_value` + `progress_pct_done` ada
 *
 * Jadi yang dibangun adalah CVR yang bisa dijawab jujur hari ini —
 * per scope borongan mandor, bukan per cost code. Ruang lingkupnya
 * dinyatakan, bukan disamarkan.
 *
 * ── Nilai TERPASANG, bukan nilai kontrak
 *
 * Yang diadu bukan "nilai borongan" mentah, melainkan **bagian yang sudah
 * dikerjakan**: `borongan × progres`. Membandingkan biaya-sampai-hari-ini
 * dengan nilai-kontrak-penuh membuat SETIAP scope terlihat untung besar
 * sampai pekerjaan hampir selesai — lalu tiba-tiba rugi di akhir, saat sudah
 * terlambat berbuat apa pun.
 *
 * ── Rugi harus TERLIHAT
 *
 * Diukur pada data nyata: "Renovasi Total" 70% selesai, nilai terpasang
 * Rp 98 juta, upah terpakai Rp 102 juta — **rugi Rp 4 juta**. Meratakannya
 * ke nol, atau menyembunyikannya di balik total proyek yang masih untung,
 * menghapus satu-satunya sinyal yang bisa ditindaklanjuti selagi pekerjaan
 * masih berjalan.
 */

const s = (o: Partial<BarisScope>): BarisScope => ({
  scope_id: 'x', scope_name: 'Uji', borongan_value: 100_000_000,
  progress_pct: 50, terpakai: 40_000_000, jumlah_laporan: 3, ...o,
})

describe('hitungCvr — nilai terpasang', () => {
  it('nilai terpasang = borongan × progres', () => {
    const h = hitungCvr(s({ borongan_value: 100_000_000, progress_pct: 60 }))
    expect(h.nilai_terpasang).toBe(60_000_000)
  })

  it('progres 100% memberi nilai borongan penuh', () => {
    const h = hitungCvr(s({ borongan_value: 85_000_000, progress_pct: 100 }))
    expect(h.nilai_terpasang).toBe(85_000_000)
  })

  it('progres nol memberi nilai terpasang nol, bukan nilai kontrak', () => {
    expect(hitungCvr(s({ progress_pct: 0 })).nilai_terpasang).toBe(0)
  })

  // Progres > 100 nyata terjadi (salah input, atau pekerjaan tambah yang
  // belum masuk kontrak). Dibatasi 100: nilai terpasang tak boleh melebihi
  // yang disepakati, karena kelebihannya bukan hak yang bisa ditagih.
  it('progres di atas 100 dibatasi 100', () => {
    const h = hitungCvr(s({ borongan_value: 50_000_000, progress_pct: 130 }))
    expect(h.nilai_terpasang).toBe(50_000_000)
  })

  it('progres negatif diperlakukan nol', () => {
    expect(hitungCvr(s({ progress_pct: -10 })).nilai_terpasang).toBe(0)
  })
})

describe('hitungCvr — selisih dan artinya', () => {
  it('nilai terpasang di atas biaya = UNTUNG', () => {
    const h = hitungCvr(s({ borongan_value: 85_000_000, progress_pct: 100, terpakai: 55_300_100 }))
    expect(h.selisih).toBe(29_699_900)
    expect(h.keadaan).toBe('untung')
  })

  // INVARIAN INTI. Rugi yang diratakan ke nol menghapus satu-satunya sinyal
  // yang bisa ditindaklanjuti selagi pekerjaan masih berjalan.
  it('biaya melampaui nilai terpasang = RUGI, dan angkanya negatif', () => {
    const h = hitungCvr(s({ borongan_value: 140_000_000, progress_pct: 70, terpakai: 102_000_000 }))
    expect(h.nilai_terpasang).toBe(98_000_000)
    expect(h.selisih).toBe(-4_000_000)
    expect(h.keadaan).toBe('rugi')
  })

  // Impas persis. Dibedakan dari untung/rugi karena ia BUKAN kabar baik pada
  // pekerjaan yang belum selesai: margin nol di tengah jalan berarti sisa
  // pekerjaannya dikerjakan tanpa cadangan sama sekali.
  it('selisih nol adalah IMPAS, bukan untung', () => {
    const h = hitungCvr(s({ borongan_value: 100_000_000, progress_pct: 50, terpakai: 50_000_000 }))
    expect(h.selisih).toBe(0)
    expect(h.keadaan).toBe('impas')
  })

  it('margin dinyatakan dalam persen terhadap nilai terpasang', () => {
    const h = hitungCvr(s({ borongan_value: 100_000_000, progress_pct: 50, terpakai: 40_000_000 }))
    expect(h.margin_pct).toBeCloseTo(20, 5)
  })

  // Nilai terpasang nol → margin tak bisa dihitung. `null`, BUKAN 0:
  // nol persen berarti "impas", dan itu klaim yang tak dimiliki datanya.
  it('margin null saat nilai terpasang nol, bukan 0%', () => {
    expect(hitungCvr(s({ progress_pct: 0, terpakai: 5_000_000 })).margin_pct).toBeNull()
  })
})

describe('hitungCvr — keadaan yang MENCURIGAKAN, bukan menguntungkan', () => {
  // Diukur pada data nyata: "Renovasi 2 Kamar Mandi" 80% progres, NOL upah
  // tercatat. Selisihnya besar dan positif — dan itu justru tanda bahaya:
  // pekerjaan berjalan tanpa biaya tercatat berarti biayanya ada di suatu
  // tempat yang tak terlihat laporan ini.
  it('progres berjalan tapi NOL biaya ditandai mencurigakan', () => {
    const h = hitungCvr(s({ borongan_value: 32_000_000, progress_pct: 80, terpakai: 0, jumlah_laporan: 0 }))
    expect(h.keadaan).toBe('tanpa_biaya')
    // Selisihnya tetap dihitung apa adanya — yang berubah hanya BACAANNYA.
    expect(h.selisih).toBe(25_600_000)
  })

  it('progres nol dan biaya nol adalah BELUM MULAI, bukan mencurigakan', () => {
    const h = hitungCvr(s({ progress_pct: 0, terpakai: 0, jumlah_laporan: 0 }))
    expect(h.keadaan).toBe('belum_mulai')
  })

  // Borongan nol = scope harian, bukan borongan. Nilai terpasangnya tak bisa
  // diturunkan dari progres, jadi CVR tak berlaku — dinyatakan, bukan
  // dihitung jadi angka yang menyesatkan.
  it('scope tanpa nilai borongan dinyatakan TAK BERLAKU', () => {
    const h = hitungCvr(s({ borongan_value: 0, progress_pct: 50, terpakai: 10_000_000 }))
    expect(h.keadaan).toBe('tak_berlaku')
    expect(h.margin_pct).toBeNull()
  })
})

describe('hitungCvr — angka dari Postgres', () => {
  it('numeric berbentuk string dihitung sebagai angka', () => {
    const h = hitungCvr(s({
      borongan_value: '85000000.00' as never,
      progress_pct: '100.00' as never,
      terpakai: '55300100.00' as never,
    }))
    expect(h.selisih).toBe(29_699_900)
  })

  // Postgres `numeric` MENERIMA NaN — satu baris meracuni SUM seluruh
  // laporan. Yang tak terbaca jadi 0 pada biaya (aman: menaikkan selisih
  // yang akan terlihat mencurigakan) dan menonaktifkan margin.
  it('nilai NaN tidak menghasilkan NaN di keluaran', () => {
    const h = hitungCvr(s({ terpakai: 'NaN' as never }))
    expect(Number.isNaN(h.selisih)).toBe(false)
    expect(Number.isNaN(h.nilai_terpasang)).toBe(false)
  })
})

describe('ringkasCvr — portofolio scope', () => {
  const daftar = [
    s({ scope_id: 'a', borongan_value: 85_000_000, progress_pct: 100, terpakai: 55_300_100 }),
    s({ scope_id: 'b', borongan_value: 140_000_000, progress_pct: 70, terpakai: 102_000_000 }),
    s({ scope_id: 'c', borongan_value: 32_000_000, progress_pct: 80, terpakai: 0, jumlah_laporan: 0 }),
  ]

  it('menjumlahkan nilai terpasang dan biaya seluruh scope', () => {
    const r = ringkasCvr(daftar)
    expect(r.total_nilai_terpasang).toBe(85_000_000 + 98_000_000 + 25_600_000)
    expect(r.total_terpakai).toBe(157_300_100)
  })

  // Yang RUGI naik ke atas. Itu satu-satunya baris yang menuntut tindakan,
  // dan daftar yang mengurutkannya di bawah membuatnya tak pernah dibaca.
  it('scope RUGI diurutkan paling atas', () => {
    const r = ringkasCvr(daftar)
    expect(r.baris[0].keadaan).toBe('rugi')
  })

  it('menghitung berapa scope yang rugi', () => {
    expect(ringkasCvr(daftar).jumlah_rugi).toBe(1)
  })

  it('menghitung berapa scope yang berjalan tanpa biaya tercatat', () => {
    expect(ringkasCvr(daftar).jumlah_tanpa_biaya).toBe(1)
  })

  // Ditemukan dari LAYAR 2026-08-08, bukan dari test: proyek Pak Andi
  // menampilkan "Pekerjaan merugi 0" di sebelah "Selisih −Rp 2.600.100"
  // berwarna merah, dengan keterangan "seluruh pekerjaan di atas biayanya".
  //
  // Sebabnya dua scope HARIAN menyumbang Rp 46,6 juta biaya tanpa nilai
  // terpasang. Perhitungannya benar; totalnya yang mencampur dua hal yang
  // tak bisa dijumlahkan.
  it('scope HARIAN tidak ikut total — ia tak punya nilai terpasang', () => {
    const r = ringkasCvr([
      s({ scope_id: 'a', borongan_value: 100_000_000, progress_pct: 100, terpakai: 60_000_000 }),
      s({ scope_id: 'h', borongan_value: 0, progress_pct: 70, terpakai: 46_600_000 }),
    ])
    expect(r.total_nilai_terpasang).toBe(100_000_000)
    expect(r.total_terpakai).toBe(60_000_000)
    // Untung Rp 40 juta — BUKAN −Rp 6,6 juta yang lahir dari mencampur.
    expect(r.total_selisih).toBe(40_000_000)
  })

  // Biaya harian TIDAK dibuang: ia nyata dan harus terlihat. Membuangnya
  // diam-diam membuat total biaya di layar ini berbeda dari `/belanja-aktual`
  // untuk proyek yang sama.
  it('biaya scope harian dilaporkan terpisah, bukan dihilangkan', () => {
    const r = ringkasCvr([
      s({ scope_id: 'h', borongan_value: 0, progress_pct: 70, terpakai: 46_600_000 }),
    ])
    expect(r.terpakai_harian).toBe(46_600_000)
    expect(r.jumlah_tak_berlaku).toBe(1)
  })

  it('daftar kosong tidak melempar', () => {
    const r = ringkasCvr([])
    expect(r.baris).toEqual([])
    expect(r.total_terpakai).toBe(0)
  })
})

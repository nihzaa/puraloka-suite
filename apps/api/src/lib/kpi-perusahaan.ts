/**
 * KPI PERUSAHAAN (C1) — lima angka yang menjawab "bagaimana keadaan kita".
 *
 * ── Yang diukur 2026-08-12
 *
 * Kelima angkanya SUDAH dihitung, masing-masing di lib-nya sendiri dan dipakai
 * satu rute:
 *
 *   CPI & SPI       `lib/evm-calculation.ts`   → dipakai `kurva-s.ts` per proyek
 *   Margin          `lib/cvr.ts`               → dipakai `cost-control.ts` per proyek
 *   Umur piutang    `lib/ar-register.ts`       → dipakai `finance.ts`
 *   Backlog         `lib/bid-backlog.ts`       → dipakai `bids.ts`
 *
 * Yang tak ada: satu tempat yang membacanya BERSAMAAN. Untuk menjawab
 * "bagaimana keadaan perusahaan", seseorang harus membuka empat layar dan
 * menjumlahkan sendiri di kepala.
 *
 * ── Kenapa memanggil lib yang ada, bukan menghitung ulang
 *
 * Menyalin rumusnya ke sini akan membuat dua sumber kebenaran untuk angka
 * yang sama. Cepat atau lambat salah satunya diperbaiki dan yang lain tidak,
 * lalu dashboard dan halaman proyek melaporkan CPI yang berbeda untuk proyek
 * yang sama — tanpa satu pun galat.
 *
 * Berkas ini HANYA menentukan cara meringkas dari per-proyek jadi
 * per-perusahaan. Itulah keputusan yang belum ada di mana pun.
 */
import { calculateEVM } from './evm-calculation.js'

export interface ProyekUntukKpi {
  id: string
  name: string
  /** Budget At Completion — pagu RAP, atau RAB, atau nilai kontrak. */
  bac: number
  /** Actual Cost — serapan kas aktual. */
  ac: number
  /** Persen progres fisik yang dilaporkan. */
  progresPct: number
  /** Persen rencana pada tanggal acuan. Null = tak punya baseline. */
  rencanaPct: number | null
}

export interface KpiProyek {
  id: string
  name: string
  cpi: number | null
  spi: number | null
  bac: number
  ac: number
}

export interface KpiPerusahaan {
  /**
   * CPI & SPI perusahaan — DITIMBANG nilai kontrak, bukan dirata-rata polos.
   *
   * Rata-rata polos memberi bobot sama pada proyek Rp 50 juta dan Rp 5 miliar.
   * Satu proyek kecil yang bermasalah akan menenggelamkan angka perusahaan,
   * dan sebaliknya: lima proyek kecil yang sehat bisa menyembunyikan satu
   * proyek besar yang berdarah.
   *
   * Ditimbang BAC karena itulah ukuran "berapa besar taruhannya".
   */
  cpi: number | null
  spi: number | null
  /** Proyek yang ikut dihitung — bukan semua proyek punya data lengkap. */
  proyekDihitung: number
  proyekTotal: number
  /** Proyek terburuk per indeks — yang perlu dilihat lebih dulu. */
  cpiTerendah: KpiProyek | null
  spiTerendah: KpiProyek | null
  totalBac: number
  totalAc: number
  perProyek: KpiProyek[]
}

/** Membulatkan ke 4 desimal — indeks EVM, bukan rupiah. */
const bulat4 = (n: number) => Math.round(n * 10_000) / 10_000

/**
 * Susun CPI & SPI perusahaan dari daftar proyek.
 *
 * Proyek yang `bac <= 0` DIBUANG, bukan dihitung sebagai nol: BAC nol berarti
 * proyeknya belum punya anggaran sama sekali, dan memasukkannya ke penimbangan
 * hanya menambah pembagi tanpa menambah informasi.
 */
export function hitungKpiEvm(proyek: ProyekUntukKpi[]): KpiPerusahaan {
  const perProyek: KpiProyek[] = []
  let totalBac = 0
  let totalAc = 0

  // Penimbangan dikumpulkan terpisah: sebuah proyek bisa punya CPI tanpa SPI
  // (belum ada baseline jadwal), dan memakai satu pembagi untuk keduanya
  // membuat SPI perusahaan ikut turun tiap kali ada proyek tanpa baseline.
  let bobotCpi = 0
  let jumlahCpi = 0
  let bobotSpi = 0
  let jumlahSpi = 0

  for (const p of proyek) {
    if (!(p.bac > 0)) continue

    const ev = p.bac * (p.progresPct || 0) / 100
    // `rencanaPct` null → PV nol → `calculateEVM` memulangkan SPI null.
    // Itu benar: proyek tanpa baseline tak punya jadwal untuk dibandingkan,
    // dan menganggapnya SPI 1,0 ("tepat jadwal") adalah kebohongan.
    const pv = p.rencanaPct === null ? 0 : p.bac * p.rencanaPct / 100

    const { cpi, spi } = calculateEVM({ bac: p.bac, ac: p.ac, ev, pv })

    perProyek.push({ id: p.id, name: p.name, cpi, spi, bac: p.bac, ac: p.ac })
    totalBac += p.bac
    totalAc += p.ac

    if (cpi !== null) { bobotCpi += p.bac; jumlahCpi += cpi * p.bac }
    if (spi !== null) { bobotSpi += p.bac; jumlahSpi += spi * p.bac }
  }

  // Terendah = yang paling perlu dilihat. `null` diabaikan, bukan dianggap
  // terburuk — tak punya data bukan berarti bermasalah.
  const denganCpi = perProyek.filter(p => p.cpi !== null)
  const denganSpi = perProyek.filter(p => p.spi !== null)

  return {
    cpi: bobotCpi > 0 ? bulat4(jumlahCpi / bobotCpi) : null,
    spi: bobotSpi > 0 ? bulat4(jumlahSpi / bobotSpi) : null,
    proyekDihitung: perProyek.length,
    proyekTotal: proyek.length,
    cpiTerendah: denganCpi.length
      ? denganCpi.reduce((a, b) => (b.cpi! < a.cpi! ? b : a))
      : null,
    spiTerendah: denganSpi.length
      ? denganSpi.reduce((a, b) => (b.spi! < a.spi! ? b : a))
      : null,
    totalBac: Math.round(totalBac * 100) / 100,
    totalAc: Math.round(totalAc * 100) / 100,
    perProyek,
  }
}

export interface StatusKpi {
  /** 'baik' | 'perhatian' | 'buruk' | 'tak_ada_data' */
  keadaan: 'baik' | 'perhatian' | 'buruk' | 'tak_ada_data'
  /** Kalimat yang menjelaskan artinya bagi orang yang tak hafal EVM. */
  arti: string
}

/**
 * Terjemahkan indeks EVM jadi keadaan + kalimat.
 *
 * ── Kenapa ambangnya 0,95 dan 1,00 — bukan 1,00 saja
 *
 * CPI 0,99 secara harfiah "di atas anggaran", tetapi selisih 1% pada proyek
 * konstruksi berada di dalam derau pengukuran: progres fisik dilaporkan
 * manusia dengan pembulatan 5%, dan biaya masuk terlambat beberapa hari.
 *
 * Menandainya merah membuat layar hampir selalu merah, dan layar yang selalu
 * merah berhenti dibaca. Ambang 0,95 memisahkan "derau" dari "gejala".
 */
export function statusIndeks(nilai: number | null, jenis: 'cpi' | 'spi'): StatusKpi {
  if (nilai === null) {
    return {
      keadaan: 'tak_ada_data',
      arti: jenis === 'cpi'
        ? 'Belum ada biaya aktual yang tercatat.'
        : 'Belum ada baseline jadwal untuk dibandingkan.',
    }
  }
  if (nilai >= 1) {
    return {
      keadaan: 'baik',
      arti: jenis === 'cpi'
        ? 'Biaya masih di dalam anggaran.'
        : 'Pekerjaan berjalan sesuai jadwal atau lebih cepat.',
    }
  }
  if (nilai >= 0.95) {
    return {
      keadaan: 'perhatian',
      arti: jenis === 'cpi'
        ? 'Sedikit di atas anggaran — masih dalam batas wajar, tapi pantau.'
        : 'Sedikit tertinggal dari jadwal — masih bisa dikejar.',
    }
  }
  return {
    keadaan: 'buruk',
    arti: jenis === 'cpi'
      ? `Biaya melampaui anggaran: tiap Rp 1 yang dikeluarkan menghasilkan Rp ${nilai.toFixed(2)} nilai pekerjaan.`
      : `Tertinggal dari jadwal: baru ${Math.round(nilai * 100)}% dari yang seharusnya selesai saat ini.`,
  }
}

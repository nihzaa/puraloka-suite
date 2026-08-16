/**
 * KESEHATAN PERAWATAN ALAT — kapan sebuah alat berhenti layak diperbaiki.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIJAWAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "alat mana yang jatuh tempo servis" — itu 10.7 (`perawatan-alat`) dan
 * 10.2 (`perawatan-diprediksi`), keduanya sudah ada.
 *
 * Yang ini: **"alat mana yang mulai lebih sering RUSAK daripada dirawat?"**
 *
 * Bedanya tindakan. Yang pertama menjadwalkan bengkel. Yang ini memutuskan
 * apakah alat itu masih layak dipertahankan, atau lebih murah disewa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA TANDA, DAN YANG KEDUA JAUH LEBIH TAJAM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16 pada basis nyata:
 *
 *   DTR-002 Dump Truck    Rp 19,85 jt / Rp 780 jt  = 2,54%   4 dari 6 TAK TERJADWAL
 *   TRK-004 Truk Mixer    Rp  6,70 jt / Rp 950 jt  = 0,71%   0 dari 2 tak terjadwal
 *   EXC-001 Excavator     Rp  6,43 jt / Rp 1,85 M  = 0,35%   1 dari 3 tak terjadwal
 *
 * Angka rupiahnya saja sudah membedakan. Tetapi yang benar-benar menceritakan
 * keadaannya adalah kolom terakhir: uraian keenam servis Dump Truck berbunyi
 * *turun mesin sebagian, ganti kopling set, perbaikan rem angin, ganti gardan
 * belakang*. Itu bukan alat yang mahal dirawat — itu alat yang RUSAK BERUNTUN.
 *
 * Rasio biaya bisa tinggi karena satu servis besar yang wajar (overhaul
 * terjadwal). Porsi TAK TERJADWAL tak bisa: tiap satu berarti alat berhenti
 * bekerja di tengah pekerjaan.
 *
 * Karena itu keduanya diperiksa TERPISAH, bukan digabung jadi satu skor.
 * Menggabungkannya membuat alat yang sering mogok tersembunyi di balik alat
 * yang sekali kena servis mahal.
 */

export interface RiwayatServis {
  biaya: number
  /** `true` = kerusakan, bukan servis terjadwal. */
  takTerjadwal: boolean
}

export interface HasilKesehatan {
  servis: number
  totalBiaya: number
  /** Biaya kumulatif sebagai persen harga beli. `null` bila harga tak diketahui. */
  persenHarga: number | null
  takTerjadwal: number
  /** Porsi servis yang tak terjadwal, 0..1. */
  porsiRusak: number
  perlu: boolean
  sebab: 'sehat' | 'kurang_sampel' | 'biaya_tinggi' | 'sering_rusak'
}

/**
 * @param hargaBeli     harga perolehan; `null`/0 mematikan jalur rasio biaya
 * @param minServis     jumlah servis minimum sebelum disimpulkan
 * @param ambangPersen  biaya kumulatif (% harga beli) yang dianggap tinggi
 * @param ambangPorsi   porsi servis tak terjadwal (0..1) yang dianggap sering
 */
export function nilaiKesehatanPerawatan(
  riwayat: RiwayatServis[],
  hargaBeli: number | null,
  minServis: number,
  ambangPersen: number,
  ambangPorsi: number,
): HasilKesehatan {
  const sah = riwayat.filter((r) => Number.isFinite(r.biaya))
  const n = sah.length

  const totalBiaya = sah.reduce((a, r) => a + r.biaya, 0)
  const takTerjadwal = sah.filter((r) => r.takTerjadwal).length

  /*
    Harga beli 0 atau NULL MEMATIKAN jalur rasio, bukan menghasilkan Infinity.

    `total / 0` menghasilkan Infinity, dan `Infinity >= ambang` bernilai true —
    jadi SETIAP alat yang harga belinya tak tercatat akan dilaporkan "biaya
    perawatan tinggi". Alat sewa dan alat hibah biasanya tak punya harga beli,
    dan justru itulah yang paling banyak di daftar aset.
  */
  const harga = Number(hargaBeli)
  const persenHarga = Number.isFinite(harga) && harga > 0
    ? Math.round((totalBiaya / harga) * 10000) / 100
    : null

  const porsiRusak = n > 0 ? takTerjadwal / n : 0

  const dasar = {
    servis: n,
    totalBiaya,
    persenHarga,
    takTerjadwal,
    porsiRusak: Math.round(porsiRusak * 100) / 100,
  }

  if (n < Math.max(1, minServis)) {
    return { ...dasar, perlu: false, sebab: 'kurang_sampel' }
  }

  /*
    DUA JALUR TERPISAH, dan yang KEDUA diperiksa lebih dulu.

    Alat yang sering mogok lebih mendesak daripada alat yang sekadar mahal
    dirawat: tiap kerusakan tak terjadwal berarti pekerjaan berhenti di
    lapangan, bukan sekadar uang keluar.

    Kalau urutannya dibalik, alat yang memenuhi KEDUANYA akan dilaporkan
    dengan sebab "biaya_tinggi" — dan yang membacanya menyimpulkan masalah
    anggaran, padahal masalahnya alat itu berhenti bekerja.
  */
  if (porsiRusak >= ambangPorsi) {
    return { ...dasar, perlu: true, sebab: 'sering_rusak' }
  }
  if (persenHarga != null && persenHarga >= ambangPersen) {
    return { ...dasar, perlu: true, sebab: 'biaya_tinggi' }
  }
  return { ...dasar, perlu: false, sebab: 'sehat' }
}

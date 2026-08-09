/**
 * DERET MODUL — bentuk jawaban `/api/v1/deret/:modul` + helper penyajiannya.
 *
 * Dipakai `components/shell/grafik-modul.tsx` untuk empat halaman ikhtisar
 * sekaligus. Bentuk jawabannya identik apa pun modulnya — itu yang membuat
 * satu komponen bisa melayani semuanya.
 */

export interface TitikDeret {
  /** `YYYY-MM`. */
  bulan: string
  /** Nominal `numeric` sebagai STRING (§5.4) — jangan ubah jadi number di tipe. */
  nilai: string
}

export interface IrisKomposisi {
  nama: string
  nilai: string
  jumlah: number
}

export interface DeretModul {
  deret: TitikDeret[]
  komposisi: IrisKomposisi[]
  label_deret: string
  label_komposisi: string
  satuan: string
}

/**
 * Warna irisan donat.
 *
 * `--aksen` SENGAJA tidak ada di daftar ini. Ia berdekatan dengan `--navy` di
 * mode terang — cukup untuk dibedakan pada teks, tidak pada irisan donat kecil
 * yang bersebelahan. Cacat itu sudah terjadi sekali (donat kasbon di
 * `/keuangan`, dua irisan pertama tampak sewarna) dan ketahuan dari tangkapan
 * layar.
 */
export const WARNA_DERET = [
  'var(--navy)',
  'var(--warning)',
  'var(--success)',
  'var(--danger)',
  'var(--text-muted)',
] as const

const NAMA_BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/**
 * `2026-06` → `Jun 26`.
 *
 * Tahun ikut karena jendelanya 12 bulan: tanpa itu, "Jan" di ujung kiri dan
 * "Jan" tahun berikutnya tak bisa dibedakan pada rentang yang melewati
 * pergantian tahun.
 */
export function labelBulanPendek(nilai: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(nilai ?? ''))
  if (!m) return String(nilai ?? '')
  const i = Number(m[2]) - 1
  if (i < 0 || i > 11) return String(nilai)
  return `${NAMA_BULAN[i]} ${m[1].slice(2)}`
}

/**
 * Nominal → bentuk pendek untuk label sumbu & legenda.
 *
 * "Rp 1.972.965.000" tak muat di label sumbu mana pun; memaksanya membuat
 * labelnya terpotong — dan angka sumbu yang terpotong lebih buruk daripada
 * tak ada sumbu, karena ia terbaca sebagai nilai.
 */
export function ringkasNilai(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const tanda = n < 0 ? '-' : ''
  if (abs >= 1e9) return `${tanda}${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)} M`
  if (abs >= 1e6) return `${tanda}${Math.round(abs / 1e6)} jt`
  if (abs >= 1e3) return `${tanda}${Math.round(abs / 1e3)} rb`
  return `${tanda}${Math.round(abs)}`
}

/**
 * Nilai enum DB → kata yang dibaca orang.
 *
 * Satu kamus untuk EMPAT modul, jadi nilainya bercampur (status proyek,
 * tujuan kasbon, status PO, status laporan upah). Itu disengaja: memisahnya
 * per modul berarti komponen grafik harus tahu ia sedang menggambar apa, dan
 * seluruh keuntungan "satu komponen untuk empat halaman" hilang.
 *
 * Yang tak dikenal dikembalikan dengan garis bawah jadi spasi — kategori yang
 * hilang dari legenda terbaca sebagai data yang tak ada.
 */
export function labelKomposisi(nilai: string): string {
  const KAMUS: Record<string, string> = {
    // status proyek
    active: 'Aktif', completed: 'Selesai', on_hold: 'Ditunda',
    draft: 'Draft', cancelled: 'Batal',
    // tujuan kasbon
    gaji_tukang: 'Upah tukang', uang_makan: 'Uang makan',
    pembelian_alat: 'Pembelian alat', operasional: 'Operasional',
    lain_lain: 'Lain-lain',
    // status PO
    confirmed: 'Dikonfirmasi', partially_received: 'Diterima sebagian',
    fully_received: 'Diterima penuh', closed: 'Ditutup',
    // status laporan upah
    submitted: 'Diajukan', approved: 'Disetujui', paid: 'Dibayar',
    rejected: 'Ditolak', settled: 'Lunas',
  }
  if (KAMUS[nilai]) return KAMUS[nilai]
  const bersih = String(nilai ?? '').replace(/_/g, ' ').trim()
  if (!bersih) return '—'
  return bersih.charAt(0).toUpperCase() + bersih.slice(1)
}

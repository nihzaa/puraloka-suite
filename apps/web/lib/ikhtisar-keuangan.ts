/**
 * IKHTISAR KEUANGAN — bentuk jawaban `/api/v1/keuangan/ikhtisar` + helper
 * penyajiannya.
 *
 * ── Kenapa helper-nya dipisah dari komponen
 *
 * Dua fungsi di sini menentukan apa yang terbaca di layar, dan keduanya mudah
 * salah tanpa gejala:
 *
 *   `ringkasJt`   nominal rupiah besar → bentuk pendek untuk sumbu & lencana
 *   `labelBulan`  "2026-06" → "Jun 26"
 *
 * Di dalam JSX keduanya tak bisa diuji tanpa merender halaman beserta
 * panggilan jaringannya. Di sini keduanya fungsi murni dengan test.
 *
 * ── Nominal SELALU datang sebagai string
 *
 * Server mengirim `numeric` apa adanya lewat `.toFixed(2)` (§5.4). Tipe di
 * bawah menuliskannya `string`, dan itu bukan kelalaian — mengubahnya jadi
 * `number` akan mengundang orang berikutnya menjumlahkannya dengan float.
 */

export interface KpiKeuangan {
  nilai_kontrak: string
  tertagih: string
  terbayar: string
  piutang: string
  kasbon_beredar: string
  invoice_lewat_tempo: number
  proyek_aktif: number
}

export interface TitikBulanan {
  /** `YYYY-MM`. */
  bulan: string
  tagih: string
  bayar: string
}

export interface IrisKasbon {
  kunci: string
  nama: string
  nilai: string
  jumlah: number
}

export interface EmberUmur {
  nama: string
  nilai: string
  jumlah: number
}

export interface BarisProyekKeuangan {
  id: string
  nama: string
  status: string
  kontrak: string
  tertagih: string
  terbayar: string
  piutang: string
  pct_tertagih: number
  progres: number
}

export interface InvoiceTertunggak {
  id: string
  nomor: string
  proyek: string | null
  jatuh_tempo: string
  hari_lewat: number
  sisa: string
}

export interface IkhtisarKeuangan {
  kpi: KpiKeuangan
  bulanan: TitikBulanan[]
  komposisi_kasbon: IrisKasbon[]
  umur_piutang: EmberUmur[]
  per_proyek: BarisProyekKeuangan[]
  invoice_tertunggak: InvoiceTertunggak[]
}

/**
 * Warna irisan donat kasbon.
 *
 * Token CSS, bukan hex mentah: warna hex tak ikut berbalik saat mode gelap,
 * sehingga donat yang cantik di mode terang jadi buram di gelap. Dijaga juga
 * oleh `uji-token-grafik-bukan-teks.mjs`.
 *
 * ── `--aksen` DIBUANG dari daftar ini
 *
 * Percobaan pertama memakai urutan navy → aksen → warning → success → danger,
 * dan hasilnya terlihat di tangkapan layar: irisan pertama dan kedua tampak
 * WARNA YANG SAMA. `--aksen` dan `--navy` memang berdekatan di mode terang —
 * cukup untuk dibedakan pada teks, tak cukup pada irisan donat kecil yang
 * bersebelahan.
 *
 * Legenda pun tak menolong: kalau dua kotak warnanya sama, legenda justru
 * membuat orang mengira ia salah baca.
 *
 * Urutan sekarang memaksimalkan jarak antar-warna berurutan (biru gelap →
 * oranye → hijau → merah → abu). Irisan terbesar selalu dapat `--navy`
 * karena datanya sudah diurutkan menurun di server.
 */
export const WARNA_KASBON = [
  'var(--navy)',
  'var(--warning)',
  'var(--success)',
  'var(--danger)',
  'var(--text-muted)',
] as const

/**
 * Nominal rupiah → bentuk pendek.
 *
 * "Rp 1.972.965.000" tak muat di label sumbu mana pun; memaksanya membuat
 * labelnya terpotong — cacat yang persis terjadi di grafik lapangan
 * (sumbu "9%" alih-alih "100%") sebelum diperbaiki.
 *
 * Ambangnya MILIAR lebih dulu, baru juta: mengurutkannya terbalik membuat
 * 2 miliar tampil sebagai "2000 jt", yang secara teknis benar tetapi tak
 * terbaca sebagai besaran.
 */
export function ringkasJt(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const tanda = n < 0 ? '-' : ''
  if (abs >= 1e9) return `${tanda}${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)} M`
  if (abs >= 1e6) return `${tanda}${Math.round(abs / 1e6)} jt`
  if (abs >= 1e3) return `${tanda}${Math.round(abs / 1e3)} rb`
  return `${tanda}${Math.round(abs)}`
}

const NAMA_BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/**
 * `2026-06` → `Jun 26`.
 *
 * Tahun ikut ditampilkan (dua digit) karena jendelanya 12 bulan: tanpa tahun,
 * "Jan" di ujung kiri dan "Jan" tahun berikutnya tak bisa dibedakan pada
 * rentang yang melewati pergantian tahun.
 *
 * Masukan yang tak berbentuk `YYYY-MM` dikembalikan apa adanya — lebih baik
 * menampilkan string mentah daripada label kosong yang membuat sumbu terlihat
 * rusak.
 */
export function labelBulan(nilai: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(nilai ?? ''))
  if (!m) return String(nilai ?? '')
  const idx = Number(m[2]) - 1
  if (idx < 0 || idx > 11) return String(nilai)
  return `${NAMA_BULAN[idx]} ${m[1].slice(2)}`
}

/**
 * BUAT CEPAT — daftar aksi "+" di topbar, dan penyaringnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DAFTARNYA DI SINI, BUKAN DI KOMPONEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua hal yang bisa salah di menu ini keduanya SUNYI, dan keduanya baru
 * ketahuan oleh pemakai:
 *
 *   1. **Tujuan yang tak ada.** Menu yang mengirim orang ke 404 lebih buruk
 *      daripada tak ada menu. Sudah pernah terjadi di rail beranda:
 *      `/kontrak/klaim` dan `/lapangan/instruksi` ternyata tak pernah ada.
 *   2. **Aksi yang tak boleh dilakukan.** Menawarkan "Kasbon baru" kepada
 *      orang tanpa `mandor:kasbon:create` berarti ia menempuh dua klik untuk
 *      menemukan tombol yang tak ada di ujung sana.
 *
 * Keduanya bisa diuji — tapi hanya kalau daftarnya berupa DATA, bukan JSX.
 * `buat-cepat.test.ts` memeriksa tiap `href` ke DISK dan tiap `izin` ke
 * katalog permission, jadi rute yang dihapus kelak akan MERAH di CI alih-alih
 * diam-diam jadi 404.
 *
 * ── Kenapa menuju halaman DAFTAR, bukan `/baru`
 *
 * Aplikasi ini tak punya rute `/proyek/baru` dan sejenisnya: pembuatan terjadi
 * lewat modal DI ATAS halaman daftar. Jadi "Proyek baru" mengantar ke
 * `/proyek`, tempat tombol "Tambah" berada. Membuat rute `/baru` khusus untuk
 * menu ini berarti membangun jalur kedua untuk pekerjaan yang sama.
 */

export interface AksiBuat {
  /** Label di menu. Kata benda dulu ("Proyek baru"), bukan kata kerja. */
  label: string
  /** Tujuan navigasi — WAJIB rute yang benar-benar ada di disk. */
  href: string
  /** Permission yang menentukan boleh-tidaknya; diperiksa ke katalog di test. */
  izin: string
  /** Nama ikon lucide; dipetakan di komponen supaya berkas ini bebas JSX. */
  ikon: 'Building2' | 'FileText' | 'Wallet' | 'Coins' | 'ShoppingCart' | 'Users'
}

/**
 * Delapan aksi tak muat; enam sudah banyak untuk menu yang dibuka sekilas.
 * Yang dipilih adalah yang paling sering DIBUAT, bukan yang paling penting —
 * menu ini soal frekuensi, bukan bobot.
 */
export const AKSI_BUAT: readonly AksiBuat[] = [
  { label: 'Proyek baru',      href: '/proyek',              izin: 'projects:create',      ikon: 'Building2' },
  { label: 'Invoice baru',     href: '/keuangan/invoice',    izin: 'finance:invoice:create', ikon: 'FileText' },
  { label: 'Pengeluaran baru', href: '/kas/pengeluaran',     izin: 'cash:expense:create',  ikon: 'Wallet' },
  { label: 'Kasbon baru',      href: '/mandor/kasbon',       izin: 'mandor:kasbon:create', ikon: 'Coins' },
  { label: 'Permintaan barang', href: '/procurement/permintaan', izin: 'procurement:mr:manage', ikon: 'ShoppingCart' },
  { label: 'Klien baru',       href: '/klien',               izin: 'clients:manage',       ikon: 'Users' },
] as const

/**
 * Menyaring aksi menurut permission yang dimiliki.
 *
 * Menerima fungsi pemeriksa, bukan memanggil `hasPermission` langsung: itu
 * membaca localStorage, dan fungsi yang membaca localStorage tak bisa diuji
 * tanpa memalsukan browser.
 */
export function saringAksi(
  punyaIzin: (kunci: string) => boolean,
  daftar: readonly AksiBuat[] = AKSI_BUAT,
): AksiBuat[] {
  if (typeof punyaIzin !== 'function') return []
  return daftar.filter((a) => {
    try {
      return punyaIzin(a.izin) === true
    } catch {
      // Pemeriksa yang melempar diperlakukan sebagai TIDAK BOLEH.
      // Menawarkan aksi karena pemeriksanya rusak adalah gagal-terbuka, dan
      // di menu aksi itu arah kegagalan yang salah (CLAUDE.md §5.3).
      return false
    }
  })
}

// ============================================================================
// LAYOUT KONTRAK — sengaja TIDAK memuat navigasi.
//
// Sampai 2026-08-08 layout ini merender `NavBagian`: deretan tab yang href-nya
// SAMA PERSIS dengan link sidebar. Diukur di enam layout: 38 dari 39 tab
// adalah duplikat sidebar.
//
// Dua navigasi dengan nama sama, tampil bersamaan, masing-masing dengan
// penanda "Anda di sini" sendiri. Founder menanyakannya langsung: "kalo di
// sidebar jadi submenu ya di sidebar aja ngga usah ada tab lagi?" — dan
// angkanya membenarkan itu.
//
// Yang tersisa hanya pass-through. Layout ini dipertahankan (bukan dihapus)
// karena Next.js memakainya sebagai batas segmen, dan menghapusnya mengubah
// perilaku loading/error boundary yang tak diminta.
// ============================================================================

export default function KontrakLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

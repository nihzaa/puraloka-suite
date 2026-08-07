// ============================================================================
// SATU ATURAN "RUTE INI SEDANG AKTIF" — dipakai seluruh navigasi.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Sampai 2026-08-07 ada TIGA aturan berbeda yang menjawab pertanyaan yang sama:
//
//   sidebar.tsx:511    pathname === href || pathname.startsWith(href + "/")
//   sidebar.tsx:783    href === "/pengaturan" ? pathname === href
//                                             : pathname.startsWith(href)
//   nav-bagian.tsx:61  cocok-persis bila href satu segmen, startsWith sisanya
//
// Yang pertama benar. Dua sisanya memakai `startsWith` MENTAH — tanpa `+ "/"`.
//
// ── Kenapa `startsWith` mentah adalah cacat, bukan sekadar gaya berbeda
//
// `"/pengaturan/situs-lama".startsWith("/pengaturan/situs")` bernilai `true`.
// Jadi membuka halaman "Situs Lama" akan menyalakan menu "Situs" — dua item
// menyala sekaligus, dan yang menyala bukan yang sedang dibuka.
//
// Hari ini belum menggigit karena kebetulan tak ada pasangan href yang satu
// jadi awalan yang lain. "Kebetulan tak ada" bukan jaminan; ia hanya berarti
// cacatnya menunggu halaman berikutnya ditambahkan.
//
// Perbaikan yang sama sudah pernah dilakukan sadar di `sidebar.tsx` (mencegah
// `/proyek` menyalakan `/proyeksi-kas`) dan di `middleware.ts:64` (`cocokRute`).
// Tiga tempat, satu aturan, dan dua di antaranya tertinggal — itu yang selalu
// terjadi pada logika yang disalin alih-alih dibagikan.
// ============================================================================

/**
 * Apakah `href` adalah rute yang sedang dibuka?
 *
 * Cocok bila sama persis, ATAU bila `pathname` adalah anaknya — dan "anak"
 * diukur di **batas segmen**, bukan batas karakter:
 *
 *     rutenyaAktif("/proyek",        "/proyek")         → true   (sama)
 *     rutenyaAktif("/proyek/12",     "/proyek")         → true   (anak)
 *     rutenyaAktif("/proyeksi-kas",  "/proyek")         → false  (saudara!)
 *     rutenyaAktif("/pengaturan/situs-lama", "/pengaturan/situs") → false
 *
 * @param pathname rute yang sedang dibuka (`usePathname()`)
 * @param href     rute yang diperiksa
 */
export function rutenyaAktif(pathname: string, href: string): boolean {
  if (!href) return false;
  if (pathname === href) return true;
  // Rute akar TIDAK punya anak dalam pengertian navigasi.
  //
  // Versi pertama melewatkan ini: `href = "/"` sudah berakhiran garis miring,
  // jadi cabang di bawah memakainya apa adanya — dan SETIAP pathname diawali
  // "/". Beranda akan menyala di seluruh halaman. Ditemukan oleh test, bukan
  // oleh saya membaca ulang.
  if (href === "/") return false;
  // `href + "/"` inilah bedanya dengan `startsWith` mentah. Tanpa garis miring,
  // "/proyeksi-kas" dianggap anak dari "/proyek".
  return pathname.startsWith(href.endsWith("/") ? href : href + "/");
}

/**
 * Varian untuk halaman induk yang PUNYA isinya sendiri.
 *
 * `/pengaturan` bukan sekadar wadah — ia halaman profil perusahaan. Kalau ia
 * memakai aturan biasa, membuka `/pengaturan/roles` akan menyalakan induknya
 * DAN anaknya sekaligus, dan pengguna tak tahu mana yang sedang dibuka.
 *
 * Dipisahkan sebagai fungsi bernama, bukan ditulis inline di satu tempat:
 * pemanggil berikutnya akan mencari nama ini, bukan menemukan ternary di
 * tengah JSX lalu menyalinnya.
 */
export function rutenyaAktifPersis(pathname: string, href: string): boolean {
  return pathname === href;
}

// ════════════════════════════════════════════════════════════════════════════
// SATU-SATUNYA tempat tenant ditentukan di aplikasi ini.
//
// Janji yang ditulis versi lama: *"saat multi-tenant tiba, yang berubah HANYA
// di sini — resolusi dari hostname permintaan."*
//
// Multi-tenant tiba 2026-09-04. Ditepati SEBAGIAN: `ambilKonten()` ikut
// berubah karena hostname harus DIKIRIM ke API. Yang benar-benar ditepati:
// nol KOMPONEN berubah — seluruh halaman tetap memanggil `ambilKonten()`
// tanpa tahu tenant itu apa.
//
// ── Dua jalur alamat, permintaan founder
//
//   default   `porto.<slug>.duckdns.org`   diberikan saat provisioning
//   opsional  `ptmakmur.co.id`             dibawa pelanggan sendiri
//
// Keduanya baris `situs_domain` (migrasi 564).
//
// ⚠ BERKAS INI TAK BOLEH MENGIMPOR `next/headers`.
//
// Diukur 2026-09-04: versi pertama mengimpornya, dan `next build` GAGAL —
// `konten.ts` ikut tertarik ke Client Component lewat `Proses.tsx` (yang cuma
// butuh `teks` dan sebuah tipe), dan `next/headers` tak ada di browser.
//
// `tsc --noEmit` HIJAU selama itu: typecheck tak menjalankan bundler, jadi ia
// tak tahu apa-apa soal batas server/klien. Keluarga yang sama dengan mobile
// yang `tsc` hijau tapi Metro gagal (CLAUDE.md §7a).
//
// Pengambilan hostname pindah ke `tenant-server.ts`, yang hanya diimpor dari
// jalur server.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Membersihkan hostname mentah jadi bentuk yang dipakai `situs_domain`.
 *
 * Murni — tak menyentuh permintaan, jadi aman di mana pun dan bisa diuji
 * tanpa memalsukan `next/headers`.
 *
 * ⚠ Port DIBUANG. `localhost:3200` dan `localhost` adalah situs yang sama;
 * membiarkan portnya membuat pencarian gagal senyap saat pengembangan — dan
 * gagalnya terlihat seperti "situsnya belum dibuat".
 */
export function rapikanHost(mentah: string | null | undefined): string {
  return (mentah ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
}

/**
 * Company id dari env — JALUR CADANGAN, bukan jalur utama.
 *
 * ⚠ Hidup HANYA di luar produksi: pengembangan lokal memakai `localhost`,
 * yang belum tentu terdaftar di `situs_domain`.
 *
 * Di produksi, host tak terdaftar HARUS gagal. Situs yang menyajikan profil
 * perusahaan A di alamat perusahaan B adalah kebocoran, dan jatuhan env
 * adalah cara paling mudah membuatnya terjadi tanpa satu pun gejala.
 */
export function tenantCadangan(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  return process.env.SITUS_COMPANY_ID?.trim() || null
}

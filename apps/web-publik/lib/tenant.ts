import { headers } from 'next/headers'

// ════════════════════════════════════════════════════════════════════════════
// SATU-SATUNYA tempat tenant ditentukan di aplikasi ini.
//
// Janji yang ditulis versi sebelumnya: *"saat multi-tenant tiba, yang berubah
// HANYA di sini — resolusi dari hostname permintaan — bukan satu pun
// pemanggilnya."*
//
// Multi-tenant tiba 2026-09-04. Janji itu ditepati SEBAGIAN, dan bagian yang
// meleset layak dicatat: `ambilKonten()` ikut berubah karena hostname harus
// DIKIRIM ke API, dan pengiriman itu tak bisa disembunyikan di balik fungsi
// yang tak dipanggil siapa-siapa.
//
// Yang benar-benar ditepati: nol KOMPONEN berubah. Seluruh halaman dan
// komponen tetap memanggil `ambilKonten()` tanpa tahu tenant itu apa.
//
// ── Dua jalur alamat, permintaan founder
//
//   default   `porto.<slug>.duckdns.org`   diberikan otomatis saat provisioning
//   opsional  `ptmakmur.co.id`             dibawa pelanggan sendiri
//
// Keduanya baris di `situs_domain` (migrasi 564). Yang membedakan cuma
// `jenis` dan apakah kepemilikannya perlu dibuktikan.
//
// ── Kenapa hostname DIKIRIM, bukan diresolusi di sini
//
// Godaan yang wajar: panggil `situs_company_dari_host()` langsung dari sini.
// Tapi situs publik tak punya — dan tak boleh punya — kredensial basis. Ia
// mengirim hostnya ke API, dan API yang menyimpulkan miliknya siapa.
//
// Satu tempat yang boleh memetakan host → company adalah tempat yang juga
// menyaring datanya. Memisahkan keduanya berarti dua sumber kebenaran yang
// pelan-pelan berbeda.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hostname permintaan yang sedang berjalan, sudah dibersihkan.
 *
 * ⚠ Port DIBUANG. `localhost:3200` dan `localhost` adalah situs yang sama;
 * membiarkan portnya membuat pencarian di `situs_domain` gagal senyap saat
 * pengembangan — dan gagalnya terlihat seperti "situsnya belum dibuat".
 *
 * ⚠ `x-forwarded-host` didahulukan. Di balik nginx, `host` berisi nama
 * internal kontainer, bukan alamat yang diketik pengunjung.
 */
export async function resolveHost(): Promise<string> {
  const h = await headers()
  const mentah = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const host = mentah.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')

  if (!host) {
    throw new Error(
      'Hostname permintaan kosong. Situs publik tidak tahu konten milik siapa.',
    )
  }
  return host
}

/**
 * Company id dari env — JALUR CADANGAN, bukan jalur utama.
 *
 * ⚠ Sengaja dipertahankan untuk satu keadaan saja: pengembangan lokal, tempat
 * hostnya `localhost` dan belum tentu terdaftar di `situs_domain`.
 *
 * Di produksi, host yang tak terdaftar HARUS gagal — bukan diam-diam jatuh ke
 * satu company tertentu. Situs yang menyajikan profil perusahaan A di alamat
 * perusahaan B adalah kebocoran, dan jatuhan env adalah cara paling mudah
 * membuatnya terjadi tanpa gejala.
 */
export function tenantCadangan(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  return process.env.SITUS_COMPANY_ID?.trim() || null
}

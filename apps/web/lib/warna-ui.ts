/**
 * WARNA UI — alias singkat untuk token CSS, dipakai di `style={{}}`.
 *
 * ── Kenapa ada
 *
 * Diukur 2026-08-05: `const C = { ... }` disalin di **67 berkas**, dengan
 * **45 varian berbeda**. Semuanya menggambarkan hal yang sama — "warna
 * teks", "warna bahaya" — tapi tiap halaman memilih sendiri kuncinya:
 * `red` / `danger`, `mid` / `secondary`, `blueBg` / `infoBg`.
 *
 * Akibatnya bukan sekadar duplikasi. Halaman terasa tidak menyatu karena
 * memang tidak: satu halaman memakai `blue` untuk info, tetangganya
 * memakai `info`, dan yang ketiga tak punya keduanya lalu menulis hex.
 * Menambah token baru berarti menyunting 67 tempat — jadi tak ada yang
 * melakukannya, dan hex mati tumbuh sebagai gantinya.
 *
 * ── Kenapa alias, bukan langsung `var(--token)`
 *
 * Bisa saja setiap komponen menulis `"var(--danger)"` langsung, dan untuk
 * kode baru itu memang yang dianjurkan. Berkas ini ada supaya 67 berkas
 * yang sudah memakai `C.red` bisa berpindah tanpa menyunting ribuan baris
 * pemakaian — cukup ganti deklarasinya jadi impor.
 *
 * ── Aturan
 *
 * Nilainya SELALU `var(--token)`, tak pernah hex. Kalau sebuah warna belum
 * punya token, tambahkan tokennya di `globals.css` — jangan menaruh hex di
 * sini. `hex-ratchet.mjs` menjaga aturan itu.
 */

export const C = {
  // ── Merek ──────────────────────────────────────────────────────────────
  navy: "var(--navy)",
  /**
   * Teks/ikon yang duduk DI ATAS `--navy`.
   *
   * WAJIB dipakai alih-alih `"#fff"`. Di mode gelap `--navy` berbalik jadi
   * biru TERANG (`#4D9FFF`), sehingga putih di atasnya cuma 2,72:1 — jauh di
   * bawah ambang WCAG AA 4,5:1. Diukur lewat axe di 7 halaman.
   *
   * Tokennya berbalik sendiri: `#FFFFFF` di terang, `#0F1117` di gelap.
   */
  onNavy: "var(--on-navy)",
  navyLight: "var(--navy-light)",
  aksen: "var(--aksen)",
  /**
   * Teks/ikon DI ATAS `aksen`. Sama seperti `onNavy`: tokennya berbalik
   * sendiri (`#FFFFFF` di terang, `#0F1117` di gelap).
   *
   * Tokennya sudah ada di `globals.css` sejak lama, tetapi tak pernah
   * diekspor di sini — jadi halaman memakukan `"#fff"`. Di mode gelap
   * `--aksen` jadi `#7ABDFF`/`#4D9FFF`, dan putih di atasnya terukur
   * **2,72 : 1** (AA butuh 4,5). Cacatnya tak terlihat sama sekali di mode
   * terang, dan hanya tertangkap `audit-a11y-runtime --gelap`.
   */
  onAksen: "var(--on-aksen)",
  aksenTerang: "var(--aksen-terang)",

  // ── Teks ───────────────────────────────────────────────────────────────
  text: "var(--text-primary)",
  mid: "var(--text-secondary)",
  muted: "var(--text-muted)",

  // ── Permukaan ──────────────────────────────────────────────────────────
  bg: "var(--bg)",
  surface: "var(--surface)",
  subtle: "var(--surface-subtle)",
  hover: "var(--surface-hover)",
  border: "var(--border)",
  white: "var(--surface)",

  // ── Semantik ───────────────────────────────────────────────────────────
  //
  // Dua penamaan hidup berdampingan di sini dengan sengaja: `red`/`green`
  // (dipakai 60 berkas) dan `danger`/`success` (nama semantik yang benar).
  // Keduanya menunjuk token yang SAMA, jadi tak mungkin menyimpang.
  //
  // Kode baru pakai nama semantik — "merah" adalah tampilan, "bahaya"
  // adalah maksud, dan hanya yang kedua tetap benar kalau paletnya berubah.
  green: "var(--success)", greenBg: "var(--success-bg)",
  greenBorder: "var(--success-border)", greenLight: "var(--success-bg)",
  success: "var(--success)", successBg: "var(--success-bg)",
  successBorder: "var(--success-border)",
  /** Teks di ATAS latar sukses — lebih pekat dari `success`. */
  onSuccessBg: "var(--on-success-bg)",

  red: "var(--danger)", redBg: "var(--danger-bg)",
  redBorder: "var(--danger-border)", redLight: "var(--danger-bg)",
  danger: "var(--danger)", dangerBg: "var(--danger-bg)",
  dangerBorder: "var(--danger-border)",
  onDangerBg: "var(--on-danger-bg)",

  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  yellowBorder: "var(--warning-border)", yellowLight: "var(--warning-bg)",
  amber: "var(--warning)", amberBg: "var(--warning-bg)",
  amberBorder: "var(--warning-border)",
  warning: "var(--warning)", warningBg: "var(--warning-bg)",
  warningBorder: "var(--warning-border)",
  onWarningBg: "var(--on-warning-bg)",

  blue: "var(--info)", blueBg: "var(--info-bg)",
  blueBorder: "var(--info-border)", blueLight: "var(--info-bg)",
  info: "var(--info)", infoBg: "var(--info-bg)",
  infoBorder: "var(--info-border)",
  onInfoBg: "var(--on-info-bg)",

  // ── Kategori (bukan status) ────────────────────────────────────────────
  //
  // `orange` dulu dipakai untuk "kategori lain", dan `purple` untuk
  // "operasional". Keduanya diarahkan ke deret data, bukan ke warna
  // semantik: kategori BUKAN status, dan mewarnainya seperti peringatan
  // membuat baris biasa terbaca sebagai masalah.
  //
  // `purple` khususnya: ungu bukan warna merek Puraloka. Ia sisa desain
  // lama yang sudah disapu dari 9 halaman; alias ini menampung pemakaian
  // yang tertinggal supaya mereka ikut memakai palet yang benar.
  // ⚠️ `orange` menunjuk `--data-5`, dan `--data-5` adalah warna DERET GRAFIK:
  // ambangnya 3:1 sebagai komponen non-teks. Sebagai warna TEKS di atas
  // `orangeBg` ia menghasilkan 3,43:1 — gagal WCAG AA 4,5:1. Diukur, bukan
  // ditaksir.
  //
  // Alias itu tetap dipertahankan untuk PENANDA (ikon, titik, isi bar), yang
  // memang cuma butuh 3:1. Untuk TEKS pakai `orangeTeks` di bawah.
  //
  // Pemisahan ini lahir dari empat perbaikan berulang di tempat berbeda —
  // /audit, keuangan/arus-kas, piutang, lalu proyek/[id] — yang semuanya
  // cacat yang sama. Selama satu alias melayani dua ambang yang berbeda,
  // kesalahan yang sama akan lahir lagi di tempat kelima.
  orange: "var(--data-5)", orangeBg: "var(--warning-bg)",
  orangeLight: "var(--warning-bg)",
  /** Varian TEKS dari `orange` — memenuhi 4,5:1 di atas `orangeBg`. */
  orangeTeks: "var(--warning)",
  purple: "var(--data-3)", purpleBg: "var(--surface-subtle)",
  purpleBorder: "var(--border)",

  // ── Deret data grafik ──────────────────────────────────────────────────
  // Diuji pada penglihatan normal, deutan, dan protan — lihat
  // `scripts/uji-deret-data.mjs`. Jangan menambah deret keenam tanpa
  // menjalankan uji itu: deret yang tampak berbeda bagi mata normal bisa
  // runtuh jadi satu warna bagi ~8% pria.
  data1: "var(--data-1)", data2: "var(--data-2)", data3: "var(--data-3)",
  data4: "var(--data-4)", data5: "var(--data-5)",
  dataDiam: "var(--data-diam)",
} as const

/** Kartu standar — dipakai bersama `C` di hampir setiap halaman. */
export const kartu: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
}

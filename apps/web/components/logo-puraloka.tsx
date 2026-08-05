/**
 * LOGO PURALOKA — lambang perusahaan, dipakai di sidebar, login, dan favicon.
 *
 * ── Kenapa SVG sebaris, bukan <img src="/puraloka-lambang.svg">
 *
 * Lambang ini harus berganti warna mengikuti tempatnya berdiri: navy di
 * sidebar terang, biru terang di sidebar gelap, putih di atas kartu
 * bergradasi. `<img>` tak bisa mewarisi `color`, jadi tiap warna butuh
 * berkasnya sendiri — dan berkas yang terpisah selalu lupa diperbarui
 * bersama-sama.
 *
 * Berkas `/puraloka-lambang.svg` tetap ada untuk favicon dan tautan luar,
 * dan keduanya digambar dari path yang sama persis.
 *
 * ── Kenapa `currentColor`
 *
 * Pemanggil menentukan lewat `color`, jadi lambangnya otomatis benar di mode
 * gelap tanpa satu pun cabang kondisi. Hex mati di sini akan mengulangi
 * kelas cacat yang baru saja dibersihkan dari 55 berkas.
 */

export function LogoPuraloka({
  size = 28,
  className,
  title = "Puraloka Persada",
}: {
  size?: number
  className?: string
  /** Kosongkan (`""`) bila lambang hanya hiasan di sebelah teks yang sudah
   *  menyebut nama perusahaan — pembaca layar tak perlu mendengarnya dua kali. */
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 120 152"
      width={size}
      height={(size * 152) / 120}
      className={className}
      fill="currentColor"
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* Badan: pilar 1 (terpendek) → pilar 4 (tertinggi, dipotong miring) */}
      <path d="M6 58 a13 13 0 0 1 13-13 h2 v58 a32 32 0 0 1-15-5 z" />
      <path d="M32 44 a13 13 0 0 1 13-13 h2 v72 a42 42 0 0 1-15-2 z" />
      <path d="M58 28 a13 13 0 0 1 13-13 h2 v83 a50 50 0 0 1-15 5 z" />
      <path d="M84 15 a13 13 0 0 1 13-13 h2 v73 a54 54 0 0 1-15 16 z" />
      {/* Alas — tepi atasnya memantulkan lengkung dasar pilar */}
      <path d="M6 112 a38 38 0 0 0 15 6 v34 H6 z" />
      <path d="M32 118 a46 46 0 0 0 15 2 v32 H32 z" />
      <path d="M58 120 a50 50 0 0 0 15-5 v37 H58 z" />
      <path d="M84 115 a54 54 0 0 0 15-16 v53 H84 z" />
    </svg>
  )
}

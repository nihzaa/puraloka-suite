/**
 * GAMBAR HERO — siluet konstruksi, digambar sebagai GEOMETRI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN ILUSTRASI KARTUN SEPERTI REFERENSI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi memakai ilustrasi orang berhelm bergaya stok. `ARAH-VISUAL-2026.md`
 * §11a melarangnya, dan alasannya bukan selera: gambar yang jelas bukan milik
 * perusahaan ini merusak persis hal yang sedang dijual — bahwa pekerjaannya
 * nyata. `craft-floor` menyebutnya lebih tajam: *"real illustration or none"*,
 * dan menggolongkan figur berbayang sebagai "picture" walau bergaya garis.
 *
 * Yang TETAP first-class di aturan yang sama: **geometri** — bentuk vektor
 * tegas, diagram, garis teknis. Itu yang dipakai di sini: siluet crane, rangka
 * gedung, dan garis blueprint. Semuanya bentuk yang bisa disebutkan tepat,
 * bukan pemandangan yang digambar.
 *
 * ── Kenapa ini justru lebih tepat untuk Puraloka
 *
 * Garis blueprint dan rangka baja adalah bahasa visual yang DIPAKAI kontraktor
 * setiap hari. Ilustrasi kartun bukan — ia bahasa halaman pemasaran perangkat
 * lunak. Yang satu terlihat seperti milik industrinya, yang lain seperti
 * templat yang kebetulan dipasang di sini.
 *
 * ── Warna
 *
 * Seluruhnya `currentColor` dengan opasitas berjenjang, jadi ia ikut warna
 * induknya dan otomatis benar di mode gelap. Tak ada satu pun hex — kalau ada,
 * `hex-ratchet` akan merahkannya, dan itu benar.
 */

export function GambarHero({ tinggi = 190 }: { tinggi?: number }) {
  return (
    <svg
      viewBox="0 0 420 190"
      height={tinggi}
      width="100%"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", maxWidth: 420, color: "currentColor" }}
    >
      {/* Garis kisi blueprint — latar teknis, bukan tekstur hiasan. */}
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.16">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={i * 52} y1="0" x2={i * 52} y2="190" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 47} x2="420" y2={i * 47} />
        ))}
      </g>

      {/* Gedung latar — massa polos, menjauh */}
      <g fill="currentColor" opacity="0.20">
        <rect x="18" y="96" width="52" height="94" rx="2" />
        <rect x="330" y="78" width="62" height="112" rx="2" />
      </g>

      {/* Gedung utama + kisi jendela: rangka, bukan gambar */}
      <g fill="currentColor" opacity="0.28">
        <rect x="86" y="62" width="96" height="128" rx="2" />
      </g>
      <g fill="currentColor" opacity="0.45">
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 4 }, (_, c) => (
            <rect key={`w${r}-${c}`} x={96 + c * 21} y={74 + r * 22} width="12" height="12" rx="1" />
          )),
        )}
      </g>

      {/* Menara crane — siluet garis, penanda paling khas konstruksi */}
      <g stroke="currentColor" fill="none" strokeWidth="2.5" opacity="0.70" strokeLinecap="round">
        <line x1="248" y1="190" x2="248" y2="34" />
        <line x1="196" y1="34" x2="322" y2="34" />
        {/* Rangka batang — segitiga selang-seling, bentuk rangka baja sungguhan */}
        <g strokeWidth="1.2" opacity="0.75">
          {Array.from({ length: 6 }, (_, i) => (
            <path key={`t${i}`} d={`M${200 + i * 21},34 L${210 + i * 21},26 L${221 + i * 21},34`} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`m${i}`} x1="244" y1={54 + i * 26} x2="252" y2={68 + i * 26} />
          ))}
        </g>
        {/* Kabel + kait — satu garis tegak lurus, memberi arah baca ke bawah */}
        <line x1="288" y1="34" x2="288" y2="88" strokeWidth="1.2" />
        <path d="M283,88 h10 v7 h-10 z" strokeWidth="1.2" />
      </g>

      {/* Garis tanah — mengakhiri komposisi, bukan sekadar batas */}
      <line x1="0" y1="189" x2="420" y2="189" stroke="currentColor" strokeWidth="1.5" opacity="0.40" />
    </svg>
  );
}

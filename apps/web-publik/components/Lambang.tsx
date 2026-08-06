/**
 * Lambang Puraloka Persada.
 *
 * Path-nya disalin apa adanya dari `apps/web/public/puraloka-lambang.svg` —
 * digambar ulang dari `LOGO PURALOKA PERSADA.pdf` dengan proporsi yang sudah
 * disetel banding aslinya. Jangan digambar ulang.
 *
 * Inline (bukan <img src>) supaya `currentColor` bekerja: di landing lambang
 * tampil PUTIH di atas navy (16,62:1), sementara di dashboard ia navy di atas
 * putih. Satu berkas, dua konteks — itu sebabnya aslinya memakai currentColor
 * dan bukan hex mati.
 */
export function Lambang({
  tinggi = 40,
  warna = 'var(--pada-navy)',
}: {
  tinggi?: number
  warna?: string
}) {
  return (
    <svg
      viewBox="0 0 120 152"
      height={tinggi}
      width={(tinggi * 120) / 152}
      role="img"
      aria-label="Puraloka Persada"
      style={{ color: warna, flexShrink: 0 }}
    >
      <g fill="currentColor">
        <path d="M6 58 a13 13 0 0 1 13-13 h2 v58 a32 32 0 0 1-15-5 z" />
        <path d="M32 44 a13 13 0 0 1 13-13 h2 v72 a42 42 0 0 1-15-2 z" />
        <path d="M58 28 a13 13 0 0 1 13-13 h2 v83 a50 50 0 0 1-15 5 z" />
        <path d="M84 15 a13 13 0 0 1 13-13 h2 v73 a54 54 0 0 1-15 16 z" />
      </g>
      <g fill="currentColor">
        <path d="M6 112 a38 38 0 0 0 15 6 v34 H6 z" />
        <path d="M32 118 a46 46 0 0 0 15 2 v32 H32 z" />
        <path d="M58 120 a50 50 0 0 0 15-5 v37 H58 z" />
        <path d="M84 115 a54 54 0 0 0 15-16 v53 H84 z" />
      </g>
    </svg>
  )
}

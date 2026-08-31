"use client";

/**
 * GEMBOK MODUL — penanda menu yang tak termasuk paket perusahaan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIGEMBOK, BUKAN DISEMBUNYIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Godaannya menyembunyikan menu modul yang tertutup — sidebar jadi rapi, dan
 * tak ada yang mengklik sesuatu yang tak bisa dibuka.
 *
 * Itu keliru. Yang disembunyikan tak pernah diketahui ADA: pengguna
 * menyimpulkan produk ini tak punya modul akuntansi, lalu mencari produk lain
 * yang punya. Menyembunyikan mengubah peluang menjual jadi alasan berhenti
 * berlangganan.
 *
 * Ini terutama berlaku untuk pengguna produk ini. CLAUDE.md §8a.3 mencatat
 * banyak pengguna berliterasi digital rendah — merekalah yang paling tak
 * mungkin menebak bahwa ada sesuatu yang tersembunyi dan bisa dibeli.
 *
 * ── Ini BUKAN lapis keamanan
 *
 * Gembok tidak menutup apa pun. Menunya tetap bisa diklik, dan URL-nya tetap
 * bisa diketik. Yang menutup `requireModul` di API (402). Kalau gembok ini
 * dianggap penjaga, orang berhenti memasang gerbang yang sebenarnya sementara
 * URL yang diketik langsung tetap tembus — kekeliruan yang sama sudah
 * diperingatkan pada penyembunyian menu per-company di `menu.ts`.
 *
 * ── Kenapa ikon, bukan badge teks
 *
 * Alasan yang sama dengan `TitikKesiapan`: sidebar hanya 196px, dan badge
 * "Upgrade" memakan ruang yang memotong nama menu tepat di bagian yang
 * membedakannya. Gembok 11px tak mengubah tinggi baris.
 *
 * ── Warna BUKAN satu-satunya pembawa makna (WCAG 1.4.1)
 *
 * Bentuk gemboknya sendiri sudah membawa arti, dan `aria-label` menyebutnya
 * dengan kata — termasuk nama paketnya, supaya pembaca layar mendapat
 * informasi yang sama dengan yang melihat.
 */
export function GembokModul({
  terkunci,
  paketNama,
}: {
  terkunci?: boolean;
  paketNama?: string | null;
}) {
  if (!terkunci) return null;

  // Kalimatnya menyebut PAKET-nya bila diketahui. Pesan generik ("tidak
  // tersedia") membuat pengguna menyimpulkan produknya rusak, bukan bahwa ada
  // sesuatu yang bisa dibeli.
  const kata = paketNama
    ? `Tidak termasuk paket ${paketNama} — klik untuk melihat cara membukanya`
    : "Tidak termasuk paket Anda — klik untuk melihat cara membukanya";

  return (
    <span
      title={kata}
      aria-label={kata}
      role="img"
      style={{
        marginLeft: "auto",
        display: "inline-flex",
        flexShrink: 0,
        color: "var(--text-muted)",
        lineHeight: 0,
      }}
    >
      {/* SVG sebaris, bukan lucide: ikon sidebar dimuat lewat peta ikon yang
          dikunci ke nama menu, dan menambahkan satu ikon di luar peta itu
          lebih murah daripada menyelundupkan cabang ke dalamnya. */}
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </span>
  );
}

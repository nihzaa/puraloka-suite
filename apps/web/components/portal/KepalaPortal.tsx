import type { ReactNode } from "react";

/**
 * KEPALA HALAMAN PORTAL — satu `<h1>` untuk semua layar portal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dashboard punya `<KepalaHalaman>`; portal tidak, karena shell-nya berbeda
 * (tak ada sidebar, lebar 390px, judul menempel di atas isi). Akibatnya tiap
 * halaman portal menulis `<h1>`-nya sendiri.
 *
 * Diukur 2026-08-27: **129 dari 143** `<h1>` tangan di repo ini ada di portal.
 * Angkanya besar, tetapi kekacauannya TIDAK — 87 di antaranya identik sampai
 * karakter terakhir:
 *
 *     <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
 *
 * Jadi yang ada bukan 129 gaya berbeda, melainkan satu konvensi yang belum
 * pernah dijadikan komponen. Sisanya menyimpang tipis: enam memakai 18px, dua
 * sudah memakai token.
 *
 * Enam yang 18px itulah kerugian nyatanya. Selisih 2px tak terlihat saat
 * menatap satu halaman, dan langsung terasa saat berpindah — persis pola yang
 * `judul-ratchet` dibangun untuk menahan.
 *
 * ── Kenapa `--t-judul`, bukan `--t-halaman`
 *
 * `--t-judul` (20px) yang dipakai 87 halaman itu, bukan `--t-halaman` (26px).
 * Di layar 390px, 26px memakan seperempat lebar sebelum satu kata pun terbaca.
 * Menyeragamkan ke atas akan "membenarkan token" sambil merusak layarnya.
 */
export default function KepalaPortal({
  judul,
  keterangan,
  aksi,
}: {
  judul: ReactNode;
  /** Satu kalimat di bawah judul. Opsional. */
  keterangan?: ReactNode;
  /** Tombol/tautan di kanan judul — sejajar, bukan di bawahnya. */
  aksi?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: "var(--t-judul)",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {judul}
        </h1>
        {keterangan && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--text-secondary)",
            }}
          >
            {keterangan}
          </p>
        )}
      </div>
      {/*
        `flexShrink: 0` — tanpa itu tombol aksi menyusut saat judulnya panjang,
        dan sasaran sentuh 44px yang sudah dijaga di tempat lain hilang di sini
        tanpa gejala.
      */}
      {aksi && <div style={{ flexShrink: 0 }}>{aksi}</div>}
    </header>
  );
}

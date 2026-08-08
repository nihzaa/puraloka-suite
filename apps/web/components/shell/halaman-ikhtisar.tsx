"use client";

/**
 * HALAMAN IKHTISAR — konten utama + rail kanan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN DIPASANG DI `(dashboard)/layout.tsx`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rail hanya hidup di halaman IKHTISAR (dashboard, detail proyek, ringkasan
 * laporan) dan sengaja MATI di halaman tabel. Menaruhnya di layout berarti
 * setiap halaman harus ikut memutuskan "rail saya kosong atau tidak" — dan
 * halaman yang lupa akan menyisakan kolom kosong selebar 300px.
 *
 * Dengan membungkus di tingkat HALAMAN, halaman tabel tak perlu tahu rail
 * pernah ada. Itu juga yang membuatnya bukan "mode": tak ada keadaan global
 * yang bisa salah.
 *
 * ── Lebar
 *
 * `--w-luas` dipakai untuk KESELURUHAN (konten + rail), bukan konten saja —
 * kalau rail ditambahkan di luar batas itu, halaman jadi lebih lebar daripada
 * halaman lain dan shell terasa bergeser saat berpindah menu.
 *
 * ── Perilaku sempit — ambangnya 1280px, dan angkanya bukan selera
 *
 * `ARAH-VISUAL-2026.md` §4a menetapkan `--w-page` mulai dari 1280px. Di bawah
 * itu, dua kolom berarti konten utama menyempit di bawah ~950px — cukup untuk
 * meremas grid KPI dashboard jadi berdesakan. Jadi di bawah 1280px rail TURUN
 * KE BAWAH, bukan hilang: informasinya tetap terjangkau, lebar tabel tak
 * dikorbankan.
 *
 * Kolomnya diatur kelas `.ikhtisar-grid` di `globals.css`, bukan gaya sebaris:
 * gaya sebaris tak bisa menyatakan breakpoint sama sekali. Yang tetap di sini
 * hanyalah yang tak bergantung lebar layar (padding, lebar maksimum, jarak).
 */

import type { ReactNode } from "react";

export function HalamanIkhtisar({
  children,
  rail,
}: {
  children: ReactNode;
  /**
   * Isi rail kanan. Tak diisi = halaman satu kolom, dan itu bukan kekurangan:
   * halaman tabel memang tak seharusnya punya rail.
   */
  rail?: ReactNode;
}) {
  if (!rail) {
    return (
      <div style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      }}>
        {children}
      </div>
    );
  }

  return (
    <div
      className="ikhtisar-grid"
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
        display: "grid",
        gap: "var(--gap-bagian)",
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>{children}</div>
      {rail}
    </div>
  );
}

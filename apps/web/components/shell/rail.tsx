"use client";

/**
 * RAIL KANAN — kolom kontekstual di halaman IKHTISAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU SLOT, BUKAN MODE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keputusan founder 2026-08-08 (`DESIGN-BRIEF.md` §C.0a): rail bukan sesuatu
 * yang dinyalakan pengguna, melainkan **prop yang diisi halaman**.
 *
 *     halaman IKHTISAR  <Rail>…</Rail>   dashboard · detail proyek · laporan
 *     halaman TABEL     tak dipasang     RAB · buku besar · daftar upah · admin
 *
 * Bedanya dengan "mode kepadatan" yang DITOLAK: satu halaman selalu punya satu
 * bentuk, ditentukan saat halaman ditulis. Tak ada kombinasi baru yang harus
 * diuji — inilah alasan slot diterima dan mode ditolak.
 *
 * ── Kenapa halaman tabel tak dapat rail
 *
 * Argumen founder, dan ia benar: 300px yang disandera rail tak berarti apa-apa
 * di dashboard, tetapi di halaman tabel 12 kolom pada layar 1366px — laptop
 * kantor yang sebenarnya — ia memotong pekerjaan utama.
 *
 * ── Perilaku sempit
 *
 * Di bawah 1280px rail TURUN KE BAWAH konten, bukan hilang. Menghilangkannya
 * berarti informasi yang sama lenyap tergantung lebar layar, dan orang yang
 * bekerja di laptop kecil tak pernah tahu ia ada. Turun ke bawah menjaga
 * isinya tetap terjangkau tanpa memakan lebar tabel.
 *
 * `<aside>` dipakai supaya pembaca layar bisa melompatinya — isinya pelengkap,
 * bukan isi utama halaman.
 */

import type { ReactNode } from "react";

export function Rail({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Panel ringkasan"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--gap-bagian)",
        minWidth: 0,
      }}
    >
      {children}
    </aside>
  );
}

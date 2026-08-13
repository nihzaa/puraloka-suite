"use client";

import { createContext, useContext, useState, useEffect } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  /** true = ciut karena layar sempit, bukan karena user memilihnya.
   *  Dipakai UI untuk menyembunyikan tombol toggle yang tak akan berfungsi. */
  dipaksaCiut: boolean;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
  dipaksaCiut: false,
});

/**
 * Di bawah lebar ini sidebar penuh (220px) memakan terlalu banyak layar
 * sehingga isi halaman tak lagi terpakai — diukur: pada layar 360px area isi
 * tersisa hanya 68px. Angka 900 dipilih karena di situlah area isi turun ke
 * ~600px, batas praktis tabel dua-tiga kolom masih terbaca.
 *
 * Ini bukan "breakpoint HP": ia juga menyala pada jendela desktop yang
 * disempitkan, yang memang perilaku yang benar — yang menentukan adalah ruang
 * tersedia, bukan jenis perangkat.
 */
const LEBAR_CIUT_OTOMATIS = 900;

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  /** Layar sempit MEMAKSA ciut — pilihan manual user tak berlaku di sini. */
  const [dipaksaCiut, setDipaksaCiut] = useState(false);

  /*
    ── Kenapa efek, dan BUKAN inisialisasi lazy `useState(() => …)`
    ───────────────────────────────────────────────────────────────────────
    Membaca `localStorage` langsung di inisialisasi memang menghapus render
    kedua (`react-hooks/set-state-in-effect`) DAN kedipan sidebar. Saya
    mencobanya, lalu mengukurnya di peramban:

        lebar sesudah reload, tersimpan=ciut : 64  ← benar, tanpa kedip
        galat hidrasi : "A tree hydrated but some attributes of the server
                         rendered HTML didn't match the client properties."

    HTML server tak punya `localStorage`, jadi ia selalu merender sidebar
    LEBAR. Klien yang langsung membaca "ciut" menghasilkan pohon yang
    berbeda, dan React menyatakan ketidakcocokan itu tak bisa ditambal.

    Menukar satu render tambahan dengan hydration mismatch adalah pertukaran
    yang salah: yang pertama pemborosan kecil, yang kedua berarti sebagian
    atribut DOM ditinggalkan dalam keadaan tak terdefinisi.

    Jalan keluar yang benar bukan di sini melainkan di `<html>` — skrip
    penyetel kelas sebelum React jalan, seperti yang dilakukan `next-themes`
    untuk mode gelap. Itu perubahan pada dokumen dasar, bukan pembersihan
    lint, jadi ia TIDAK dikerjakan bersamaan dengan ini.

    Peringatan lint ini SENGAJA DIBIARKAN BERBUNYI — tidak di-`eslint-disable`.

    Komentar penonaktif akan menurunkan angka ratchet tanpa memperbaiki apa
    pun: hutangnya tetap ada, hanya jadi tak terlihat, dan lantai yang turun
    karenanya membuat penjaga berbohong tentang seberapa besar sisanya.
    Melemahkan penjaga lewat pintu belakang persis yang dilarang G-5.

    Lihat JOURNAL 2026-08-13.
  */

  useEffect(() => {
    // `matchMedia`, bukan listener `resize`: ia hanya berbunyi saat ambangnya
    // benar-benar terlampaui, bukan pada tiap piksel pergerakan — jauh lebih
    // murah, dan tak perlu debounce sendiri.
    const mq = window.matchMedia(`(max-width: ${LEBAR_CIUT_OTOMATIS}px)`);
    const ikuti = () => setDipaksaCiut(mq.matches);
    ikuti();
    mq.addEventListener("change", ikuti);
    return () => mq.removeEventListener("change", ikuti);
  }, []);

  function toggle() {
    // Di layar sempit tombolnya tak berpengaruh — membiarkannya "berhasil"
    // lalu diam-diam ditimpa `dipaksaCiut` akan terasa seperti tombol rusak.
    if (dipaksaCiut) return;
    setCollapsed((v) => {
      const next = !v;
      // best-effort: `localStorage` melempar di mode privat/penyimpanan penuh.
      // Sidebar tetap terlipat untuk sesi ini, hanya tak diingat — dan itu
      // konsekuensi yang benar; membatalkan lipatannya justru lebih buruk.
      try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0"); } catch { /* best-effort: preferensi tampilan, bukan data */ }
      return next;
    });
  }

  return (
    // `collapsed` yang dipakai konsumen = pilihan user ATAU paksaan layar
    // sempit. Digabung di sini, bukan di tiap konsumen, supaya sidebar dan
    // shell tak mungkin berbeda pendapat soal lebarnya.
    <SidebarContext.Provider value={{ collapsed: collapsed || dipaksaCiut, toggle, dipaksaCiut }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

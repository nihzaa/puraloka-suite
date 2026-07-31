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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed");
      if (saved === "1") setCollapsed(true);
    } catch {}
  }, []);

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
      try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0"); } catch {}
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

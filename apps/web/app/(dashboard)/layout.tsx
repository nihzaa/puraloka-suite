"use client";

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ToastProvider } from "@/components/toast";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { PenyediaRail, useIsiRail } from "@/lib/rail-context";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  // Token, bukan angka telanjang: lebar yang sama dipakai sidebar (fixed) DAN
  // margin shell di sini. Dua angka terpisah pasti berbeda suatu saat, dan
  // gejalanya halus — konten tertimpa sidebar atau ada celah kosong.
  // `collapsed` di sini sudah termasuk paksaan layar sempit (sidebar-context).
  const sidebarW = collapsed ? "var(--sidebar-w-ciut)" : "var(--sidebar-w)";

  return (
    <div
      style={{
        display: "flex",
        /*
          `height: 100dvh` + `overflow: hidden`, BUKAN `minHeight: 100vh`.

          Ini yang membuat rail bisa diam. Dengan `minHeight`, shell boleh
          tumbuh melebihi layar; `<main>` ikut setinggi isinya, `overflowY:
          auto` tak pernah aktif, dan yang scroll adalah SELURUH DOKUMEN —
          membawa rail ikut naik. Diukur sebelum perbaikan: `main.clientHeight`
          2811px pada viewport 1000px, dan rail setinggi 2811px juga.

          `dvh` bukan `vh`: di peramban ponsel, `vh` mengabaikan bilah alamat
          yang muncul-hilang, sehingga 100vh lebih tinggi daripada layar yang
          benar-benar terlihat dan bagian bawah shell terpotong.
        */
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--text-primary)",
      }}
    >
      {/*
        `Sidebar` menanggung batas Suspense-nya SENDIRI — lihat catatan di
        `components/sidebar.tsx`. Ia memanggil `useSearchParams()`, dan tanpa
        batas itu build Next gagal di halaman yang kebetulan diprerender lebih
        dulu, bukan di berkas yang bersalah.

        Sengaja TIDAK dibungkus lagi di sini: dua batas untuk satu komponen
        membuat pemilik tanggung jawabnya kabur, dan yang di layout paling
        mudah terlupa saat shell dirombak (UIR-4). Dijaga `suspense-ratchet.mjs`.
      */}
      <Sidebar />
      <div
        style={{
          marginLeft: sidebarW,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          // `minHeight: 0` menggantikan `minHeight: 100vh` (lihat induk).
          // Tanpa ini anak flex menolak menyusut di bawah tinggi isinya, dan
          // batas tinggi dari induk tak pernah sampai ke `<main>`.
          minHeight: 0,
          transition: "margin-left 0.2s ease",
          minWidth: 0,
        }}
      >
        <Topbar />
        {/*
          KONTEN + RAIL bersebelahan, dan RAIL DI LUAR `<main>`.

          Itu yang membuat rail bisa diam saat halaman digulung: `sticky` hanya
          menempel di dalam wadah scroll-nya sendiri, jadi selama rail berada
          DI DALAM `<main>` yang scroll, ia ikut bergerak. Founder minta ia
          tetap di tempat — maka ia harus jadi saudara `<main>`, bukan anaknya.

          `minHeight: 0` pada pembungkus flex ini WAJIB. Tanpa itu anak flex
          menolak menyusut di bawah tinggi isinya, `overflowY: auto` pada
          `<main>` tak pernah aktif, dan yang scroll justru seluruh halaman —
          membawa rail ikut naik. Gejalanya persis "sticky tidak bekerja",
          padahal penyebabnya di sini.
        */}
        <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
          <main style={{ flex: 1, overflowY: "auto", position: "relative", minWidth: 0 }}>
            {children}
          </main>
          <RailShell />
        </div>
      </div>
    </div>
  );
}

/**
 * Kolom rail — dirender HANYA bila ada halaman yang mengisinya.
 *
 * Halaman tanpa rail tak menyisakan kolom kosong 300px; itu aturan yang sama
 * dengan `HalamanIkhtisar` sebelumnya, cuma pindah tempat.
 */
function RailShell() {
  const isi = useIsiRail();
  if (!isi) return null;

  return (
    <aside
      aria-label="Panel ringkasan"
      // Kelas menangani breakpoint (gaya sebaris tak bisa), sisanya di sini.
      className="rail-shell"
      style={{
        width: "var(--rail-w)",
        flexShrink: 0,
        // Rail punya scroll SENDIRI: isinya (kalender + tugas + notifikasi +
        // AI + pengingat) lebih tinggi daripada layar, dan tanpa ini bagian
        // bawahnya tak pernah bisa dijangkau.
        overflowY: "auto",
        borderLeft: "1px solid var(--border)",
        background: "var(--surface-subtle)",
        padding: "var(--pad-kartu)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--gap-bagian)",
      }}
    >
      {isi}
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ToastProvider>
        {/*
          `PenyediaRail` membungkus shell, bukan sebaliknya: `RailShell` di
          dalam `DashboardShell` harus bisa MEMBACA isi yang dipasang halaman,
          dan halaman berada di bawah keduanya.
        */}
        <PenyediaRail>
          <DashboardShell>{children}</DashboardShell>
        </PenyediaRail>
      </ToastProvider>
    </SidebarProvider>
  );
}

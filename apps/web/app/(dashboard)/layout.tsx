"use client";

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ToastProvider } from "@/components/toast";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";

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
        minHeight: "100vh",
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
          minHeight: "100vh",
          transition: "margin-left 0.2s ease",
          minWidth: 0,
        }}
      >
        <Topbar />
        <main style={{ flex: 1, overflowY: "auto", position: "relative" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ToastProvider>
        <DashboardShell>{children}</DashboardShell>
      </ToastProvider>
    </SidebarProvider>
  );
}

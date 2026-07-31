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

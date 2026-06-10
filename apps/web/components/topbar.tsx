"use client";

import { usePathname } from "next/navigation";
import { Search, Bell } from "lucide-react";

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/proyek": "Proyek",
  "/keuangan": "Keuangan",
  "/mandor": "Mandor",
  "/laporan": "Laporan",
  "/pengaturan": "Pengaturan",
};

function getPageTitle(pathname: string): string {
  for (const [prefix, label] of Object.entries(breadcrumbMap)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return label;
  }
  return "Dashboard";
}

export function Topbar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        flexShrink: 0,
        background: "#FFFFFF",
        borderBottom: "1px solid #E5E7EB",
        boxShadow: "0 1px 0 #E5E7EB",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#9CA3AF" }}>Puraloka Suite</span>
        <span style={{ fontSize: 13, color: "#D1D5DB" }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{title}</span>
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <IconBtn title="Cari">
          <Search size={15} />
        </IconBtn>
        <div style={{ position: "relative" }}>
          <IconBtn title="Notifikasi">
            <Bell size={15} />
          </IconBtn>
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#003366",
              border: "1.5px solid #FFFFFF",
            }}
          />
        </div>
      </div>
    </header>
  );
}

function IconBtn({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <button
      title={title}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "#6B7280",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#F3F4F6";
        e.currentTarget.style.color = "#111827";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#6B7280";
      }}
    >
      {children}
    </button>
  );
}

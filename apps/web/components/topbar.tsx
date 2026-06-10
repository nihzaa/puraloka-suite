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
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        flexShrink: 0,
        background: "rgba(8,12,20,0.8)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: "rgba(232,236,244,0.25)" }}>Puraloka Suite</span>
        <span style={{ fontSize: 12, color: "rgba(232,236,244,0.15)" }}>/</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(232,236,244,0.6)" }}>{title}</span>
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
              background: "#40a0ff",
              border: "1.5px solid rgba(8,12,20,0.9)",
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
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "rgba(232,236,244,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(64,160,255,0.08)";
        e.currentTarget.style.color = "#40a0ff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "rgba(232,236,244,0.35)";
      }}
    >
      {children}
    </button>
  );
}

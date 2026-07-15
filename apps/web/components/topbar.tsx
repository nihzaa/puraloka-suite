"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Command } from "lucide-react";
import { NotificationPanel } from "@/components/notification-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";

const breadcrumbMap: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/proyek":       "Proyek",
  "/keuangan":     "Keuangan",
  "/kas":          "Kas",
  "/mandor":       "Mandor",
  "/laporan":      "Laporan",
  "/klien":        "Klien",
  "/procurement":  "Pengadaan",
  "/users":        "User",
  "/audit":        "Audit Trail",
  "/kalender":     "Kalender",
  "/sistem":       "Sistem",
  "/notifications":"Notifikasi",
  "/pengaturan":   "Pengaturan",
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleCountChange = useCallback((count: number) => setUnreadCount(count), []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          flexShrink: 0,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 1px 0 var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Puraloka Suite</span>
          <span style={{ fontSize: 13, color: "var(--border-strong)" }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Search trigger — looks like an input bar */}
          <button
            onClick={() => setPaletteOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              height: 34, padding: "0 10px 0 12px",
              borderRadius: 8,
              background: "var(--surface-subtle)",
              border: "1px solid var(--border)",
              cursor: "pointer", color: "var(--text-muted)",
              fontSize: 13, transition: "all 0.15s",
              minWidth: 180,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "var(--navy)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Cari...</span>
            <kbd style={{
              display: "flex", alignItems: "center", gap: 2,
              padding: "1px 5px", borderRadius: 4,
              background: "var(--surface)", border: "1px solid var(--border)",
              fontSize: 10, color: "var(--text-muted)", flexShrink: 0,
            }}>
              <Command size={9} /> K
            </kbd>
          </button>

          <ThemeToggle />
          <NotificationPanel
            unreadCount={unreadCount}
            onCountChange={handleCountChange}
          />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

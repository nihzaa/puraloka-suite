"use client";

// ============================================================================
// PortalShell — kerangka bersama 3 portal (mandor, PM, klien).
//
// Header navy sticky + konten scrollable + bottom nav fixed dengan safe-area
// (notch/home-indicator perangkat modern). Bottom nav mengurasi maksimal 4
// item utama; kalau `navItems` lebih dari 4, item ke-5-dst dipindah ke
// halaman "Lainnya" lewat `lainnyaHref` (rute nyata per-portal, BUKAN anchor
// placeholder — anchor mati tidak berfungsi sebagai navigasi).
// ============================================================================

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, MoreHorizontal, type LucideIcon } from "lucide-react";
import StatusAntrean from "@/components/StatusAntrean";
import type { PuralokaUser } from "@/lib/api";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface PortalShellProps {
  user: PuralokaUser;
  portalLabel: string;
  navItems: NavItem[];
  onLogout: () => void;
  /** Tujuan tombol "Lainnya" saat navItems > 4. Rute nyata per-portal (Task 6/9/12). */
  lainnyaHref?: string;
  modeSwitcher?: React.ReactNode;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export default function PortalShell({
  user,
  portalLabel,
  navItems,
  onLogout,
  lainnyaHref,
  modeSwitcher,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const primaryItems = navItems.slice(0, 4);
  const hasMore = navItems.length > 4;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--portal-canvas)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "var(--grad-merek)",
          padding: "max(env(safe-area-inset-top), 16px) 20px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "var(--portal-shadow-navy)",
        }}
      >
        <div>
          <div
            style={{
              color: "var(--on-merek)",
              fontWeight: 800,
              fontSize: 15,
              fontFamily: "var(--font-display, inherit)",
            }}
          >
            Puraloka Suite
          </div>
          <div
            style={{
              color: "var(--on-merek-lembut)",
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {portalLabel}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {modeSwitcher}
          <StatusAntrean />
          <button
            type="button"
            onClick={onLogout}
            aria-label="Keluar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: "var(--portal-radius-pill)",
              border: "1px solid var(--on-merek-redup)",
              background: "rgba(255,255,255,0.1)",
              color: "var(--on-merek)",
              cursor: "pointer",
            }}
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "20px 16px", paddingBottom: 96 }}>
        {children}
      </main>

      <nav
        aria-label="Navigasi utama"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {primaryItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                minHeight: 56,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "8px 4px",
                color: active ? "var(--navy)" : "var(--text-secondary)",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
              }}
            >
              <item.icon size={22} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
        {hasMore && (
          <Link
            href={lainnyaHref ?? navItems[4]?.href ?? "#"}
            style={{
              flex: 1,
              minHeight: 56,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "8px 4px",
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            <MoreHorizontal size={22} aria-hidden="true" />
            Lainnya
          </Link>
        )}
      </nav>
    </div>
  );
}

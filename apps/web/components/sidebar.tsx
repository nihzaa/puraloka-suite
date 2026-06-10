"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Wallet,
  HardHat,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { getStoredUser, logout, type PuralokaUser } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/proyek", label: "Proyek", icon: FolderKanban },
  { href: "/keuangan", label: "Keuangan", icon: Wallet },
  { href: "/mandor", label: "Mandor", icon: HardHat },
  { href: "/laporan", label: "Laporan", icon: BarChart3 },
];

const roleLabel: Record<string, string> = {
  admin: "Administrator",
  pm: "Project Manager",
  mandor: "Mandor",
  client: "Klien",
};

function navLink(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 14px",
    margin: "1px 8px",
    height: 38,
    borderRadius: 6,
    fontSize: 14,
    fontWeight: active ? 500 : 400,
    textDecoration: "none",
    transition: "all 0.15s",
    borderLeft: active ? "3px solid #003366" : "3px solid transparent",
    color: active ? "#003366" : "#6B7280",
    background: active ? "#EBF2FF" : "transparent",
    position: "relative",
  };
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside
      style={{
        width: 220,
        background: "#FFFFFF",
        borderRight: "1px solid #E5E7EB",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: "20px 16px 16px",
        borderBottom: "1px solid #E5E7EB",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "#003366",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(0,51,102,0.3)",
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "#FFFFFF" }}>P</span>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#111827", lineHeight: 1, letterSpacing: "-0.3px" }}>
            Puraloka
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, letterSpacing: "0.05em" }}>Suite</div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, paddingTop: 8, paddingBottom: 8 }}>
        <div style={{
          padding: "16px 16px 6px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#9CA3AF",
        }}>
          Menu
        </div>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={navLink(active)}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "#111827";
                  e.currentTarget.style.background = "#F3F4F6";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "#6B7280";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{label}</span>
              {active && (
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#003366", flexShrink: 0 }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid #E5E7EB" }}>
        <Link
          href="/pengaturan"
          style={navLink(pathname.startsWith("/pengaturan"))}
          onMouseEnter={(e) => {
            if (!pathname.startsWith("/pengaturan")) {
              e.currentTarget.style.color = "#111827";
              e.currentTarget.style.background = "#F3F4F6";
            }
          }}
          onMouseLeave={(e) => {
            if (!pathname.startsWith("/pengaturan")) {
              e.currentTarget.style.color = "#6B7280";
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          <Settings size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Pengaturan</span>
          {pathname.startsWith("/pengaturan") && (
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#003366", flexShrink: 0 }} />
          )}
        </Link>

        {user && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            marginTop: 8,
            borderRadius: 10,
            background: "#F9FAFB",
            border: "1px solid #E5E7EB",
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#EBF2FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "#003366",
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
              </div>
              <div style={{
                display: "inline-block", marginTop: 3,
                fontSize: 10, textTransform: "uppercase", letterSpacing: "0.03em",
                background: "#EBF2FF", color: "#003366",
                borderRadius: 4, padding: "1px 6px", fontWeight: 600,
              }}>
                {roleLabel[user.role] ?? user.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              style={{ padding: 6, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", flexShrink: 0, display: "flex", alignItems: "center" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#B91C1C";
                e.currentTarget.style.background = "#FEF2F2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#9CA3AF";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

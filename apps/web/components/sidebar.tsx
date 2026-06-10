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
    gap: 10,
    padding: "8px 14px",
    margin: "1px 8px",
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: active ? 500 : 400,
    textDecoration: "none",
    transition: "all 0.15s",
    borderLeft: active ? "3px solid #40a0ff" : "3px solid transparent",
    color: active ? "#40a0ff" : "rgba(232,236,244,0.45)",
    background: active ? "rgba(64,160,255,0.08)" : "transparent",
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
        background: "rgba(0,10,30,0.95)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRight: "1px solid rgba(0,51,102,0.35)",
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
        borderBottom: "1px solid rgba(0,51,102,0.25)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "#003366",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 0 16px rgba(64,160,255,0.3), 0 0 4px rgba(64,160,255,0.15)",
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "#40a0ff" }}>P</span>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#e8ecf4", lineHeight: 1 }}>
            Puraloka
          </div>
          <div style={{ fontSize: 10, color: "rgba(64,160,255,0.7)", marginTop: 2 }}>Suite</div>
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
          color: "rgba(232,236,244,0.2)",
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
                  e.currentTarget.style.color = "rgba(232,236,244,0.75)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "rgba(232,236,244,0.45)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(0,51,102,0.25)" }}>
        <Link
          href="/pengaturan"
          style={navLink(pathname.startsWith("/pengaturan"))}
          onMouseEnter={(e) => {
            if (!pathname.startsWith("/pengaturan")) {
              e.currentTarget.style.color = "rgba(232,236,244,0.75)";
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }
          }}
          onMouseLeave={(e) => {
            if (!pathname.startsWith("/pengaturan")) {
              e.currentTarget.style.color = "rgba(232,236,244,0.45)";
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          <Settings size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span>Pengaturan</span>
        </Link>

        {user && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            marginTop: 8,
            borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
          }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#003366",
              border: "1px solid rgba(64,160,255,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 700,
              color: "#40a0ff",
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(232,236,244,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
              </div>
              <div style={{ fontSize: 10, color: "rgba(232,236,244,0.3)", marginTop: 1 }}>
                {roleLabel[user.role] ?? user.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              style={{ padding: 6, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", color: "rgba(232,236,244,0.25)", flexShrink: 0, display: "flex", alignItems: "center" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#f87171";
                e.currentTarget.style.background = "rgba(248,113,113,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(232,236,244,0.25)";
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

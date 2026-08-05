"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import { FolderKanban, Bell, LogOut, User } from "lucide-react";

import { C } from "@/lib/warna-ui";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    if (u.role !== "client") { router.replace("/dashboard"); return; }
    setUser(u);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/portal") return pathname === "/portal";
    return pathname.startsWith(href);
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--surface)", borderBottom: `1px solid ${C.border}`,
        padding: "0 20px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6, background: C.navy,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: C.onNavy, fontWeight: 800, fontSize: 15 }}>P</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text, lineHeight: 1 }}>Puraloka Suite</div>
            <div style={{ fontSize: 11, color: C.mid, marginTop: 1 }}>Portal Klien</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{user.name}</div>
            <div style={{ fontSize: 11, color: C.mid }}>Klien</div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              cursor: "pointer", fontSize: 13, color: C.mid,
            }}
          >
            <LogOut size={14} />
            <span style={{ display: "none" }} className="sm-show">Keluar</span>
          </button>
        </div>
      </header>

      {/* Desktop nav (hidden on mobile) */}
      <nav style={{
        background: "var(--surface)", borderBottom: `1px solid ${C.border}`,
        padding: "0 20px", display: "flex", gap: 4,
      }} className="desktop-nav">
        {[
          { href: "/portal", label: "Proyek Saya", icon: <FolderKanban size={15} /> },
          { href: "/portal/notifikasi", label: "Notifikasi", icon: <Bell size={15} /> },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "12px 12px", fontSize: 13, fontWeight: isActive(item.href) ? 600 : 400,
              color: isActive(item.href) ? C.navy : C.mid,
              borderBottom: isActive(item.href) ? `2px solid ${C.navy}` : "2px solid transparent",
              textDecoration: "none", transition: "all 0.15s",
            }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: "20px", paddingBottom: 80 }}>
        {children}
      </main>

      {/* Bottom nav (mobile only) */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "var(--surface)", borderTop: `1px solid ${C.border}`,
        display: "flex", zIndex: 50,
      }} className="mobile-nav">
        {[
          { href: "/portal", label: "Proyek", icon: <FolderKanban size={20} /> },
          { href: "/portal/notifikasi", label: "Notifikasi", icon: <Bell size={20} /> },
          { href: "/portal/profil", label: "Profil", icon: <User size={20} /> },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 2, padding: "10px 0",
              color: isActive(item.href) ? C.navy : C.mid,
              textDecoration: "none", fontSize: 11, fontWeight: isActive(item.href) ? 600 : 400,
            }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      <style>{`
        @media (min-width: 640px) {
          .desktop-nav { display: flex !important; }
          .mobile-nav { display: none !important; }
          .sm-show { display: inline !important; }
          main { padding-bottom: 20px !important; }
        }
        @media (max-width: 639px) {
          .desktop-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}

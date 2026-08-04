"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import { LayoutDashboard, FolderKanban, Wallet, HardHat, LogOut, ChevronDown } from "lucide-react";

import { C } from "@/lib/warna-ui";

const NAV_ITEMS = [
  { href: "/pm-portal", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/pm-portal/proyek", label: "Proyek", icon: FolderKanban, exact: false },
  { href: "/pm-portal/mandor", label: "Mandor", icon: HardHat, exact: false },
  { href: "/pm-portal/keuangan", label: "Keuangan", icon: Wallet, exact: false },
];

export default function PMPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PuralokaUser | null>(null);
  const [isMandor, setIsMandor] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    // Izinkan role "pm" DAN role "mandor" yang punya akses PM di proyek
    if (u.role === "admin") { router.replace("/dashboard"); return; }
    if (u.role === "client") { router.replace("/portal"); return; }
    setUser(u);
    if (u.role === "mandor") {
      setIsMandor(true);
      // Verifikasi mandor ini memang punya proyek sebagai PM
      api.get("/api/v1/projects").then((res) => {
        const projects: any[] = res.data?.projects ?? [];
        const asPM = projects.some((p) => p.pm_id === u.id || p.pm?.id === u.id);
        if (!asPM) router.replace("/mandor-portal");
      }).catch(() => router.replace("/mandor-portal"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(item: { href: string; exact: boolean }) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>P</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1 }}>Puraloka Suite</div>
            <div style={{ fontSize: 11, color: C.mid, marginTop: 1 }}>Portal PM</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Mode switcher — hanya tampil kalau user adalah mandor yang masuk mode PM */}
          {isMandor && (
            <div ref={modeMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowModeMenu((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.navy}`, background: C.navyLight, cursor: "pointer", fontSize: 12, color: C.navy, fontWeight: 600 }}
              >
                <FolderKanban size={13} />
                Mode PM
                <ChevronDown size={13} />
              </button>
              {showModeMenu && (
                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "var(--surface)", borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, zIndex: 100, overflow: "hidden" }}>
                  <div style={{ padding: "8px 0" }}>
                    <div style={{ padding: "8px 16px 4px", fontSize: 11, color: C.mid, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ganti Mode</div>
                    <button
                      onClick={() => { setShowModeMenu(false); router.push("/mandor-portal"); }}
                      style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <HardHat size={16} color={C.mid} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Mode Mandor</div>
                        <div style={{ fontSize: 11, color: C.mid }}>Scope & progress kerja</div>
                      </div>
                    </button>
                    <button
                      style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, background: C.navyLight, border: "none", cursor: "default", textAlign: "left" }}
                    >
                      <FolderKanban size={16} color={C.navy} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Mode PM</div>
                        <div style={{ fontSize: 11, color: C.mid }}>Kelola proyek & kasbon</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{user.name}</div>
            <div style={{ fontSize: 11, color: C.mid }}>{isMandor ? "Mandor / PM" : "Project Manager"}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}
          >
            <LogOut size={14} />
            <span className="sm-show" style={{ display: "none" }}>Keluar</span>
          </button>
        </div>
      </header>

      {/* Desktop nav */}
      <nav style={{ background: "var(--surface)", borderBottom: `1px solid ${C.border}`, padding: "0 20px", display: "flex", gap: 4 }} className="desktop-nav">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link key={item.href} href={item.href} style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", fontSize: 14, fontWeight: active ? 600 : 400, color: active ? C.navy : C.mid, borderBottom: active ? `2px solid ${C.navy}` : "2px solid transparent", textDecoration: "none", transition: "all 0.15s" }}>
              <item.icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Main */}
      <main style={{ flex: 1, padding: "20px", paddingBottom: 80 }}>
        {children}
      </main>

      {/* Bottom nav mobile */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 50 }} className="mobile-nav">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link key={item.href} href={item.href} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "10px 4px", color: active ? C.navy : C.mid, textDecoration: "none", fontSize: 10, fontWeight: active ? 600 : 400 }}>
              <item.icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <style>{`
        @media (min-width: 640px) {
          .desktop-nav { display: flex !important; }
          .mobile-nav { display: none !important; }
          .sm-show { display: inline !important; }
          main { padding-bottom: 20px !important; }
        }
        @media (max-width: 639px) { .desktop-nav { display: none !important; } }
      `}</style>
    </div>
  );
}

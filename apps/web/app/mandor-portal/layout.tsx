"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import StatusAntrean from "@/components/StatusAntrean";
import {
  LayoutDashboard, Briefcase, Wallet, ClipboardList, LogOut,
  ChevronDown, HardHat, FolderKanban, Users, CreditCard, Receipt, BarChart2,
} from "lucide-react";

import { C } from "@/lib/warna-ui";

export default function MandorPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PuralokaUser | null>(null);
  const [isPM, setIsPM] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [hasHarian, setHasHarian] = useState(false);
  const [hasProgressPct, setHasProgressPct] = useState(false);
  // ⚠️ TIDAK ADA `hasBorongan` — dan itu BENAR, bukan kelupaan.
  //
  // Dua saudaranya masing-masing membuka satu menu (`hasHarian` → Laporan Upah,
  // `hasProgressPct` → Penagihan Progress), jadi ketiadaan pasangannya tampak
  // seperti fitur yang hilang. Bukan.
  //
  // Settlement borongan adalah PENCAIRAN, bukan pengajuan: endpoint
  // `POST /mandor/borongan-settlements` dijaga `requirePermission(
  // 'mandor:kasbon:approve')` — wewenang admin/PM, yang mandor memang tak
  // punya. UI-nya sudah hidup di tempat yang benar: `SettlementBoronganModal`
  // di halaman `/mandor` (dashboard admin/PM).
  //
  // Mandor melihat HASILNYA lewat "Riwayat Pembayaran" dan "Rekapitulasi",
  // yang keduanya sudah ada di daftar menu di bawah. Menambahkan menu
  // "settlement" di portal mandor akan menjanjikan wewenang yang API-nya
  // tolak — persis pola yang ADR-004 lawan, hanya arahnya terbalik.
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    if (u.role !== "mandor") { router.replace("/dashboard"); return; }
    setUser(u);

    // Fetch assignments untuk cek payment_system
    api.get("/api/v1/mandor/assignments").then((res) => {
      const assignments: any[] = res.data?.assignments ?? [];
      const allScopes = assignments.flatMap((a: any) => a.work_scopes ?? []);
      setHasHarian(allScopes.some((s: any) => s.payment_system === "harian"));
      setHasProgressPct(allScopes.some((s: any) => s.payment_system === "progress_pct"));
    }).catch(() => {});

    // Cek apakah mandor ini juga PM
    api.get("/api/v1/projects").then((res) => {
      const projects: any[] = res.data?.projects ?? [];
      setIsPM(projects.some((p) => p.pm_id === u.id || p.pm?.id === u.id));
    }).catch(() => {});
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

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  if (!user) return null;

  // Nav items dikondisikan berdasarkan payment_system yang dimiliki
  const navItems = [
    { href: "/mandor-portal", label: "Dashboard", icon: LayoutDashboard, exact: true, always: true },
    { href: "/mandor-portal/scope", label: "Scope & Progress", icon: Briefcase, exact: false, always: true },
    { href: "/mandor-portal/laporan-upah", label: "Laporan Upah", icon: ClipboardList, exact: false, always: false, show: hasHarian },
    { href: "/mandor-portal/kasbon", label: "Kasbon Saya", icon: Wallet, exact: false, always: true },
    { href: "/mandor-portal/kasbon-tukang", label: "Kasbon Tukang", icon: CreditCard, exact: false, always: true },
    { href: "/mandor-portal/tukang", label: "Daftar Tukang", icon: Users, exact: false, always: true },
    { href: "/mandor-portal/penagihan", label: "Penagihan Progress", icon: Receipt, exact: false, always: false, show: hasProgressPct },
    { href: "/mandor-portal/pembayaran", label: "Riwayat Pembayaran", icon: ClipboardList, exact: false, always: true },
    { href: "/mandor-portal/rekapitulasi", label: "Rekapitulasi", icon: BarChart2, exact: false, always: true },
  ].filter((item) => item.always || item.show);

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
            <div style={{ fontSize: 11, color: C.mid, marginTop: 1 }}>Portal Mandor</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isPM && (
            <div ref={modeMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowModeMenu((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6,
                  border: `1px solid ${C.navy}`, background: C.navyLight,
                  cursor: "pointer", fontSize: 12, color: C.navy, fontWeight: 600,
                }}
              >
                <HardHat size={13} />
                Mode Mandor
                <ChevronDown size={13} />
              </button>
              {showModeMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0,
                  background: "var(--surface)", borderRadius: 10, border: `1px solid ${C.border}`,
                  boxShadow: "var(--naik-2)", minWidth: 200, zIndex: 100, overflow: "hidden",
                }}>
                  <div style={{ padding: "8px 0" }}>
                    <div style={{ padding: "8px 16px 4px", fontSize: 11, color: C.mid, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Ganti Mode
                    </div>
                    <button style={{ width: "100%", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, background: C.navyLight, border: "none", cursor: "default", textAlign: "left" }}>
                      <HardHat size={16} color={C.navy} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Mode Mandor</div>
                        <div style={{ fontSize: 11, color: C.mid }}>Scope & progress kerja</div>
                      </div>
                    </button>
                    <button
                      onClick={() => { setShowModeMenu(false); router.push("/pm-portal"); }}
                      style={{ width: "100%", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <FolderKanban size={16} color={C.mid} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Mode PM</div>
                        <div style={{ fontSize: 11, color: C.mid }}>Kelola proyek & kasbon</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* F4-3 — pemicu sinkron antrean offline. Ia diam (tak merender apa
              pun) selama antrean kosong, dan hanya muncul saat ada kiriman
              yang tertahan. Letaknya di layout, bukan per-halaman, supaya
              antrean tetap terkirim dari halaman mana pun mandor berada. */}
          <StatusAntrean />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{user.name}</div>
            <div style={{ fontSize: 11, color: C.mid }}>{isPM ? "Mandor / PM" : "Mandor"}</div>
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
            <span className="sm-show" style={{ display: "none" }}>Keluar</span>
          </button>
        </div>
      </header>

      {/* Desktop nav */}
      <nav style={{
        background: "var(--surface)", borderBottom: `1px solid ${C.border}`,
        padding: "0 20px", display: "flex", gap: 4, overflowX: "auto",
      }} className="desktop-nav">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "12px 12px", fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? C.navy : C.mid, whiteSpace: "nowrap",
                borderBottom: active ? `2px solid ${C.navy}` : "2px solid transparent",
                textDecoration: "none", transition: "all 0.15s",
              }}
            >
              <item.icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: "20px", paddingBottom: 80 }}>
        {children}
      </main>

      {/* Bottom nav (mobile) — tampilkan 5 item pertama saja */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "var(--surface)", borderTop: `1px solid ${C.border}`,
        display: "flex", zIndex: 50,
      }} className="mobile-nav">
        {navItems.slice(0, 5).map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 2, padding: "8px 4px",
                color: active ? C.navy : C.mid,
                textDecoration: "none", fontSize: 10, fontWeight: active ? 600 : 400,
              }}
            >
              <item.icon size={20} />
              {item.label.split(" ")[0]}
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
        @media (max-width: 639px) {
          .desktop-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}

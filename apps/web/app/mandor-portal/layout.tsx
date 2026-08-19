"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import {
  LayoutDashboard, Briefcase, Wallet, ClipboardList, HardHat,
  FolderKanban, ChevronDown,
} from "lucide-react";

export default function MandorPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);
  const [isPM, setIsPM] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  // ⚠️ TIDAK ADA `hasHarian`/`hasProgressPct` di sini — dan itu BENAR, bukan
  // regresi dari file lama. Bottom nav sekarang 5 item TETAP (Beranda/Scope/
  // Kasbon/Progress/Lainnya), jadi tak ada lagi nav item kondisional yang
  // butuh kedua flag itu di layout. Kondisionalnya pindah ke halaman
  // "Lainnya" (grid modul lengkap), yang mengambil sendiri datanya di sana —
  // lihat `app/mandor-portal/lainnya/page.tsx`.
  //
  // ⚠️ TIDAK ADA `hasBorongan` — dan itu BENAR, bukan kelupaan (dipertahankan
  // dari catatan file lama). Settlement borongan adalah PENCAIRAN, bukan
  // pengajuan: endpoint `POST /mandor/borongan-settlements` dijaga
  // `requirePermission('mandor:kasbon:approve')` — wewenang admin/PM, yang
  // mandor memang tak punya. UI-nya sudah hidup di tempat yang benar:
  // `SettlementBoronganModal` di halaman `/mandor` (dashboard admin/PM).
  // Mandor melihat HASILNYA lewat "Riwayat Bayar" dan "Rekapitulasi" di
  // halaman Lainnya. Menambahkan menu "settlement" di portal mandor akan
  // menjanjikan wewenang yang API-nya tolak — persis pola yang ADR-004
  // lawan, hanya arahnya terbalik.
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    if (u.role !== "mandor") { router.replace("/dashboard"); return; }
    setUser(u);

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

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navItems: NavItem[] = [
    { href: "/mandor-portal", label: "Beranda", icon: LayoutDashboard, exact: true },
    { href: "/mandor-portal/scope", label: "Scope", icon: Briefcase },
    { href: "/mandor-portal/kasbon", label: "Kasbon", icon: Wallet },
    { href: "/mandor-portal/progress", label: "Progress", icon: ClipboardList },
    { href: "/mandor-portal/lainnya", label: "Lainnya", icon: FolderKanban },
  ];

  const modeSwitcher = isPM ? (
    <div ref={modeMenuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setShowModeMenu((v) => !v)}
        aria-expanded={showModeMenu}
        aria-label="Ganti mode Mandor/PM"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: "var(--portal-radius-pill)",
          border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)",
          cursor: "pointer", fontSize: 11, color: "var(--on-merek)", fontWeight: 700,
        }}
      >
        <HardHat size={13} aria-hidden="true" />
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {showModeMenu && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)",
            boxShadow: "var(--portal-shadow-navy)", minWidth: 200, zIndex: 100, overflow: "hidden",
          }}
        >
          <button
            style={{
              width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
              background: "var(--navy-light)", border: "none", cursor: "default", textAlign: "left",
            }}
          >
            <HardHat size={16} color="var(--navy)" aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>Mode Mandor</span>
          </button>
          <button
            onClick={() => { setShowModeMenu(false); router.push("/pm-portal"); }}
            style={{
              width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}
          >
            <FolderKanban size={16} color="var(--text-secondary)" aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Mode PM</span>
          </button>
        </div>
      )}
    </div>
  ) : undefined;

  return (
    <PortalShell
      user={user}
      portalLabel="Portal Mandor"
      navItems={navItems}
      onLogout={handleLogout}
      lainnyaHref="/mandor-portal/lainnya"
      modeSwitcher={modeSwitcher}
    >
      {children}
    </PortalShell>
  );
}

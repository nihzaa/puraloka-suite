"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Wallet,
  PiggyBank,
  Receipt,
  HardHat,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Users,
  Contact,
  ShoppingCart,
  Building2,
  ShieldCheck,
  Landmark,
  Ruler,
  Layers,
  Coins,
  CalendarDays,
  Menu,
} from "lucide-react";
import { getStoredUser, logout, api, type PuralokaUser } from "@/lib/api";
import { useSidebar } from "@/lib/sidebar-context";

const roleLabel: Record<string, string> = {
  admin: "Administrator",
  pm: "Project Manager",
  mandor: "Mandor",
  client: "Klien",
};

// ── Menu Registry (Sub-Fase 1B.2): struktur menu dari DB (GET /api/v1/menu) ──────
// Nama icon (string di DB) → komponen lucide. ADDITIVE-FIRST: hanya sumber struktur
// yang pindah ke DB; visibility TETAP di client via perms.has() match-ANY, styling
// & interaksi (collapse/tooltip/dropdown) identik dengan versi hardcode sebelumnya.
const ICONS: Record<string, React.ElementType> = {
  LayoutDashboard, FolderKanban, Wallet, PiggyBank, Receipt, HardHat,
  BarChart3, Settings, Users, Contact, ShoppingCart, Building2,
  ShieldCheck, CalendarDays, Landmark, Ruler, Layers, Coins,
};
function iconFor(name: string): React.ElementType {
  return ICONS[name] ?? FolderKanban;
}

interface MenuNode {
  id: string;
  key: string;
  label: string;
  href: string | null;
  icon: string;
  required_permissions: string[];
  sort_order: number;
  section: string;
  children: MenuNode[];
}

const MENU_CACHE_KEY = "puraloka_menu";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();
  const [user, setUser] = useState<PuralokaUser | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuNode[]>([]);
  const [keuanganOpen, setKeuanganOpen] = useState(false);
  const [pengaturanOpen, setPengaturanOpen] = useState(false);

  const W = collapsed ? 64 : 220;

  useEffect(() => {
    setUser(getStoredUser());
    setPerms(new Set(
      (() => {
        try {
          const raw = localStorage.getItem("puraloka_permissions");
          return raw ? (JSON.parse(raw) as string[]) : [];
        } catch { return []; }
      })()
    ));

    // Menu: pakai cache dulu (render instan), lalu revalidate dari API.
    try {
      const cached = localStorage.getItem(MENU_CACHE_KEY);
      if (cached) setMenu(JSON.parse(cached) as MenuNode[]);
    } catch {}
    api.get<{ menu: MenuNode[] }>("/api/v1/menu")
      .then(({ data }) => {
        setMenu(data.menu);
        try { localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(data.menu)); } catch {}
      })
      .catch(() => { /* pakai cache; sidebar tidak boleh gagal render */ });
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/keuangan") || pathname.startsWith("/kas")) {
      setKeuanganOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/pengaturan")) {
      setPengaturanOpen(true);
    }
  }, [pathname]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  // Match-ANY: tampil jika tanpa permission (array kosong) ATAU punya salah satu.
  function canSee(node: MenuNode): boolean {
    if (!node.required_permissions || node.required_permissions.length === 0) return true;
    return node.required_permissions.some(p => perms.has(p));
  }

  const keuanganActive = isActive("/keuangan") || isActive("/kas");

  const mainMenu = menu.filter(m => m.section === "main");
  const bottomMenu = menu.filter(m => m.section === "bottom");
  const pengaturanNode = bottomMenu.find(m => m.key === "pengaturan");

  function navStyle(active: boolean): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: collapsed ? 0 : 8,
      padding: collapsed ? "0" : "0 14px",
      justifyContent: collapsed ? "center" : "flex-start",
      margin: "1px 6px",
      height: 38,
      borderRadius: 8,
      fontSize: 14,
      fontWeight: active ? 500 : 400,
      textDecoration: "none",
      transition: "all 0.15s",
      borderLeft: collapsed ? "none" : (active ? "3px solid var(--navy)" : "3px solid transparent"),
      color: active ? "var(--navy)" : "var(--text-secondary)",
      background: active ? "var(--navy-light)" : "transparent",
      position: "relative",
      flexShrink: 0,
      overflow: "hidden",
      whiteSpace: "nowrap",
    };
  }

  function subStyle(active: boolean): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: 7,
      padding: "0 14px 0 34px",
      margin: "1px 6px",
      height: 34,
      borderRadius: 8,
      fontSize: 13,
      fontWeight: active ? 500 : 400,
      textDecoration: "none",
      transition: "all 0.15s",
      color: active ? "var(--navy)" : "var(--text-secondary)",
      background: active ? "var(--navy-light)" : "transparent",
      borderLeft: active ? "3px solid var(--navy)" : "3px solid transparent",
      whiteSpace: "nowrap",
      overflow: "hidden",
    };
  }

  const onHover = (e: React.MouseEvent<HTMLElement>, active: boolean) => {
    if (!active) {
      (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
    }
  };
  const offHover = (e: React.MouseEvent<HTMLElement>, active: boolean) => {
    if (!active) {
      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
      (e.currentTarget as HTMLElement).style.background = "transparent";
    }
  };

  return (
    <aside
      style={{
        width: W,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "hidden",
        overflowX: "hidden",
        zIndex: 50,
        transition: "width 0.2s ease",
      }}
    >
      {/* Logo + toggle */}
      <div style={{
        padding: collapsed ? "16px 0" : "16px 12px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        gap: 8,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "var(--navy)", display: "flex",
              alignItems: "center", justifyContent: "center",
              flexShrink: 0, boxShadow: "0 2px 8px var(--navy-glow)",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "#fff" }}>P</span>
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", lineHeight: 1, letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
                Puraloka
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.05em" }}>Suite</div>
            </div>
          </div>
        )}

        {collapsed && (
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: "var(--navy)", display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px var(--navy-glow)",
          }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "#fff" }}>P</span>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={toggle}
            title={collapsed ? "Buka sidebar" : "Tutup sidebar"}
            style={{
              padding: 6, borderRadius: 6, background: "transparent", border: "none",
              cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
              display: "flex", alignItems: "center",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <Menu size={16} />
          </button>
        )}
      </div>

      {/* Tombol expand saat collapsed */}
      {collapsed && (
        <div style={{ padding: "8px 0 4px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <button
            onClick={toggle}
            title="Buka sidebar"
            style={{
              padding: 7, borderRadius: 8, background: "transparent", border: "none",
              cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <Menu size={16} />
          </button>
        </div>
      )}

      {/* Navigation — struktur dari menu_items (section='main') */}
      <nav style={{ flex: 1, paddingTop: collapsed ? 4 : 8, paddingBottom: 8, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {!collapsed && (
          <div style={{ padding: "12px 14px 6px", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            Menu
          </div>
        )}

        {mainMenu.map(node => {
          if (!canSee(node)) return null;

          // Node dropdown (punya children) — mis. Keuangan.
          if (node.children.length > 0) {
            const visibleChildren = node.children.filter(canSee);
            if (visibleChildren.length === 0) return null;

            // Expanded: dropdown collapsible. Collapsed: tampilkan children sebagai ikon langsung.
            if (!collapsed) {
              return (
                <div key={node.key}>
                  <button
                    onClick={() => setKeuanganOpen(o => !o)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "0 14px", margin: "1px 6px", height: 38,
                      borderRadius: 8, fontSize: 14, fontWeight: keuanganActive ? 500 : 400,
                      background: "transparent", border: "none",
                      borderLeft: keuanganActive ? "3px solid var(--navy)" : "3px solid transparent",
                      color: keuanganActive ? "var(--navy)" : "var(--text-secondary)",
                      cursor: "pointer", width: "calc(100% - 12px)", textAlign: "left",
                      transition: "all 0.15s", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => { if (!keuanganActive) { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--surface-hover)"; } }}
                    onMouseLeave={e => { if (!keuanganActive) { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; } }}
                  >
                    {(() => { const Icon = iconFor(node.icon); return <Icon size={16} strokeWidth={keuanganActive ? 2.5 : 1.75} style={{ flexShrink: 0 }} />; })()}
                    <span style={{ flex: 1 }}>{node.label}</span>
                    <ChevronDown size={14} style={{ flexShrink: 0, transform: keuanganOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: keuanganActive ? "var(--navy)" : "var(--text-muted)" }} />
                  </button>
                  <div style={{ overflow: "hidden", maxHeight: keuanganOpen ? "100px" : "0px", transition: "max-height 0.2s ease" }}>
                    <div style={{ paddingTop: 2, paddingBottom: 4 }}>
                      {visibleChildren.map(child => {
                        const ChildIcon = iconFor(child.icon);
                        const active = isActive(child.href ?? "");
                        return (
                          <Link key={child.key} href={child.href ?? "#"} style={subStyle(active)} onMouseEnter={e => onHover(e, active)} onMouseLeave={e => offHover(e, active)}>
                            <ChildIcon size={14} strokeWidth={active ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            // Collapsed: children sebagai NavItem ikon langsung (tanpa dropdown).
            return (
              <div key={node.key}>
                {visibleChildren.map(child => (
                  <NavItem key={child.key} href={child.href ?? "#"} label={child.label} icon={iconFor(child.icon)} active={isActive(child.href ?? "")} collapsed={collapsed} onHover={onHover} offHover={offHover} navStyle={navStyle} />
                ))}
              </div>
            );
          }

          // Node biasa (link tunggal).
          return (
            <NavItem key={node.key} href={node.href ?? "#"} label={node.label} icon={iconFor(node.icon)} active={isActive(node.href ?? "")} collapsed={collapsed} onHover={onHover} offHover={offHover} navStyle={navStyle} />
          );
        })}
      </nav>

      {/* Bottom — struktur dari menu_items (section='bottom') */}
      <div style={{ padding: collapsed ? "8px 4px" : "10px 8px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        {/* Pengaturan: dropdown jika punya children yang boleh dilihat (users:roles:manage);
            selain itu link tunggal ke href parent. */}
        {pengaturanNode && (() => {
          const visibleChildren = pengaturanNode.children.filter(canSee);
          const hasDropdown = visibleChildren.length > 0;
          const pengaturanHref = pengaturanNode.href ?? "/pengaturan";
          const PIcon = iconFor(pengaturanNode.icon);

          if (!collapsed && hasDropdown) {
            return (
              <div>
                <button
                  onClick={() => setPengaturanOpen(o => !o)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "0 14px", margin: "1px 6px", height: 38,
                    borderRadius: 8, fontSize: 14, fontWeight: pathname.startsWith("/pengaturan") ? 500 : 400,
                    background: "transparent", border: "none",
                    borderLeft: pathname.startsWith("/pengaturan") ? "3px solid var(--navy)" : "3px solid transparent",
                    color: pathname.startsWith("/pengaturan") ? "var(--navy)" : "var(--text-secondary)",
                    cursor: "pointer", width: "calc(100% - 12px)", textAlign: "left",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { if (!pathname.startsWith("/pengaturan")) { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--surface-hover)"; } }}
                  onMouseLeave={e => { if (!pathname.startsWith("/pengaturan")) { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; } }}
                >
                  <PIcon size={16} strokeWidth={pathname.startsWith("/pengaturan") ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{pengaturanNode.label}</span>
                  <ChevronDown size={14} style={{ flexShrink: 0, transform: pengaturanOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: pathname.startsWith("/pengaturan") ? "var(--navy)" : "var(--text-muted)" }} />
                </button>
                <div style={{ overflow: "hidden", maxHeight: pengaturanOpen ? "80px" : "0px", transition: "max-height 0.2s ease" }}>
                  <div style={{ paddingTop: 2, paddingBottom: 2 }}>
                    {visibleChildren.map(child => {
                      const ChildIcon = iconFor(child.icon);
                      const childHref = child.href ?? "#";
                      // Active: exact untuk /pengaturan (profil), startsWith untuk /pengaturan/roles.
                      const active = childHref === "/pengaturan" ? pathname === "/pengaturan" : pathname.startsWith(childHref);
                      return (
                        <Link key={child.key} href={childHref} style={subStyle(active)} onMouseEnter={e => onHover(e, active)} onMouseLeave={e => offHover(e, active)}>
                          <ChildIcon size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          if (!collapsed) {
            return (
              <Link href={pengaturanHref} style={navStyle(pathname.startsWith("/pengaturan"))} onMouseEnter={e => onHover(e, pathname.startsWith("/pengaturan"))} onMouseLeave={e => offHover(e, pathname.startsWith("/pengaturan"))}>
                <PIcon size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{pengaturanNode.label}</span>
              </Link>
            );
          }

          return (
            <NavItem href={pengaturanHref} label={pengaturanNode.label} icon={PIcon} active={pathname.startsWith("/pengaturan")} collapsed={collapsed} onHover={onHover} offHover={offHover} navStyle={navStyle} />
          );
        })()}

        {/* User info */}
        {user && !collapsed && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", marginTop: 6,
            borderRadius: 10, background: "var(--surface-subtle)", border: "1px solid var(--border)",
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "var(--navy-light)", display: "flex",
              alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--navy)",
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
              </div>
              <div style={{
                display: "inline-block", marginTop: 2,
                fontSize: 10, textTransform: "uppercase", letterSpacing: "0.03em",
                background: "var(--navy-light)", color: "var(--navy)",
                borderRadius: 4, padding: "1px 5px", fontWeight: 600,
              }}>
                {roleLabel[user.role] ?? user.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              style={{ padding: 5, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0, display: "flex", alignItems: "center" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "var(--danger-bg)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut size={13} />
            </button>
          </div>
        )}

        {/* Collapsed: logout icon saja */}
        {user && collapsed && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 4 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "var(--navy-light)", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600, color: "var(--navy)",
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              style={{ padding: 6, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "var(--danger-bg)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Reusable nav item ──────────────────────────────────────────────────────────
function NavItem({
  href, label, icon: Icon, active, collapsed, onHover, offHover, navStyle,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
  onHover: (e: React.MouseEvent<HTMLElement>, active: boolean) => void;
  offHover: (e: React.MouseEvent<HTMLElement>, active: boolean) => void;
  navStyle: (active: boolean) => React.CSSProperties;
}) {
  const [tooltipTop, setTooltipTop] = useState(0);
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!collapsed) {
    return (
      <Link
        href={href}
        style={navStyle(active)}
        onMouseEnter={e => onHover(e, active)}
        onMouseLeave={e => offHover(e, active)}
      >
        <Icon size={16} strokeWidth={active ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {active && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--navy)", flexShrink: 0 }} />}
      </Link>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <Link
        href={href}
        style={navStyle(active)}
        onMouseEnter={e => {
          const rect = wrapRef.current?.getBoundingClientRect();
          if (rect) setTooltipTop(rect.top + rect.height / 2);
          setHovered(true);
          onHover(e, active);
        }}
        onMouseLeave={e => { setHovered(false); offHover(e, active); }}
      >
        <Icon size={16} strokeWidth={active ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
      </Link>

      {/* Custom tooltip rendered at fixed position */}
      <div
        style={{
          position: "fixed",
          left: 70,
          top: tooltipTop,
          transform: hovered ? "translateY(-50%) translateX(0)" : "translateY(-50%) translateX(-6px)",
          pointerEvents: "none",
          zIndex: 9999,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s ease, transform 0.15s ease",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Arrow */}
        <div style={{
          width: 0, height: 0,
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
          borderRight: "5px solid #1F2937",
          flexShrink: 0,
        }} />
        <div style={{
          background: "#1F2937",
          color: "#F9FAFB",
          fontSize: 12,
          fontWeight: 500,
          padding: "5px 10px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          letterSpacing: "0.01em",
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

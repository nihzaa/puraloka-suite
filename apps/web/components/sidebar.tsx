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
  GitBranch,
  BellRing,
  CalendarDays,
  Menu,
  Database,
  Gavel,
  FileSignature,
  CalendarRange,
  Calculator,
  Package,
  ClipboardList,
  BadgeCheck,
  ShieldAlert,
  Truck,
  FolderOpen,
  AlertTriangle,
  Smartphone,
  Dot,
} from "lucide-react";
import { getStoredUser, logout, api, type PuralokaUser } from "@/lib/api";
import { SidebarFokus } from "@/components/sidebar-fokus";
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
  ShieldCheck, CalendarDays, Landmark, Ruler, Layers, Coins, GitBranch, BellRing,
  // 19 ikon grup peta menu (migrasi 153) + `Dot` untuk seluruh sub-menu.
  // Sub-menu SENGAJA seragam: 202 ikon berbeda justru menghapus fungsi ikon
  // sebagai penanda — saat semuanya bergambar, tak ada yang menonjol.
  Database, Gavel, FileSignature, CalendarRange, Calculator, Package,
  ClipboardList, BadgeCheck, ShieldAlert, Truck, FolderOpen, AlertTriangle,
  Smartphone, Dot,
};
/**
 * Nama ikon (string dari DB) → komponen lucide.
 *
 * ⚠️ Mengembalikan REFERENSI dari tabel `ICONS`, tak pernah membuat komponen
 * baru. Bila fungsi ini sampai mengembalikan `() => <X/>` — bahkan sebagai
 * pembungkus kecil — React akan menganggapnya komponen berbeda tiap render,
 * meng-unmount lalu mount ulang seluruh ikon sidebar tiap kali menu berubah.
 * Gejalanya halus: ikon berkedip, dan pada daftar panjang terasa seperti lag.
 * Dijaga `react-hooks/static-components`.
 */
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

/**
 * Ikon menu, didefinisikan di TINGKAT MODUL.
 *
 * ⚠️ Sebelumnya ditulis `const Icon = iconFor(...)` di dalam badan komponen,
 * lalu dipakai `<Icon />`. React membaca itu sebagai komponen yang lahir saat
 * render: tiap render ia dianggap tipe baru, sehingga ikon di-unmount lalu
 * mount ulang. Pada sidebar 20 grup gejalanya terlihat — ikon berkedip tiap
 * kali menu dibuka. Dijaga `react-hooks/static-components`.
 *
 * Dengan bentuk ini, tipe komponennya tetap (`IkonGrup`) dan yang berubah
 * hanya prop-nya — itulah yang membuat React bisa mempertahankan node DOM.
 */
function IkonGrup({ nama, aktif }: { nama: string; aktif: boolean }) {
  const Ikon = ICONS[nama] ?? FolderKanban;
  return <Ikon size={16} strokeWidth={aktif ? 2.5 : 1.75} style={{ flexShrink: 0 }} />;
}

function IkonAnak({ nama, aktif }: { nama: string; aktif: boolean }) {
  const Ikon = ICONS[nama] ?? FolderKanban;
  return <Ikon size={14} strokeWidth={aktif ? 2.5 : 1.75} style={{ flexShrink: 0 }} />;
}

/**
 * Satu grup menu yang bisa dibuka-tutup.
 *
 * ── Kenapa tingginya DIUKUR, bukan ditulis
 *
 * Versi sebelumnya memakai `maxHeight: "140px"` — angka mati yang kebetulan
 * cukup untuk 4 submenu Keuangan. Dengan 20 grup dan sampai 18 submenu, angka
 * itu memotong isinya diam-diam: submenu ke-6 dan seterusnya tak terlihat,
 * tanpa scrollbar, tanpa gejala apa pun. Orang akan menyimpulkan menunya
 * memang belum ada.
 *
 * `scrollHeight` mengukur tinggi isi sebenarnya, jadi grup berapa pun panjang
 * isinya terbuka penuh. Diukur ulang saat isinya berubah (mis. permission
 * berubah menyembunyikan sebagian anak).
 *
 * ── Kenapa max-height, bukan height:auto
 *
 * CSS tak bisa men-transisi ke `auto`. `max-height` bisa, dengan satu syarat:
 * nilainya harus mendekati tinggi nyata. Terlalu besar → animasi menutup
 * terasa "menggantung" karena melewati rentang kosong lebih dulu. Karena itu
 * diukur, bukan diberi angka besar sembarang.
 *
 * ── Gerak
 *
 * 200ms buka / 150ms tutup. Keluar lebih cepat daripada masuk (±70%) adalah
 * pola Material Motion: menutup terasa responsif, membuka terasa halus.
 * `ease-out` untuk masuk — cepat di awal lalu melambat, seperti benda yang
 * berhenti karena gesekan.
 *
 * `prefers-reduced-motion` dihormati: sebagian orang benar-benar mual oleh
 * gerakan, dan sidebar yang dipakai puluhan kali sehari adalah tempat
 * terburuk untuk mengabaikannya.
 */
function GrupCollapsible({
  node, anak, aktif, terbuka, onToggle, isActive, subStyle, onHover, offHover,
}: {
  node: MenuNode;
  anak: MenuNode[];
  aktif: boolean;
  terbuka: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
  subStyle: (active: boolean) => React.CSSProperties;
  onHover: (e: React.MouseEvent<HTMLElement>, active: boolean) => void;
  offHover: (e: React.MouseEvent<HTMLElement>, active: boolean) => void;
}) {
  const isiRef = useRef<HTMLDivElement>(null);
  const [tinggi, setTinggi] = useState(0);
  const [kurangiGerak, setKurangiGerak] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ikuti = () => setKurangiGerak(mq.matches);
    ikuti();
    mq.addEventListener("change", ikuti);
    return () => mq.removeEventListener("change", ikuti);
  }, []);

  useEffect(() => {
    if (isiRef.current) setTinggi(isiRef.current.scrollHeight);
  }, [anak.length]);

  const durasi = kurangiGerak ? 0 : terbuka ? 200 : 150;
  const idPanel = `grup-${node.key}`;

  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={terbuka}
        aria-controls={idPanel}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 14px", margin: "1px 6px", height: 38,
          borderRadius: 8, fontSize: 14, fontWeight: aktif ? 500 : 400,
          background: "transparent", border: "none",
          borderLeft: aktif ? "3px solid var(--navy)" : "3px solid transparent",
          color: aktif ? "var(--navy)" : "var(--text-secondary)",
          cursor: "pointer", width: "calc(100% - 12px)", textAlign: "left",
          transition: "all 0.15s", whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => { if (!aktif) { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--surface-hover)"; } }}
        onMouseLeave={(e) => { if (!aktif) { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; } }}
      >
        <IkonGrup nama={node.icon} aktif={aktif} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{node.label}</span>
        {/* Jumlah submenu: memberi tahu ada berapa SEBELUM dibuka. Dengan 20
            grup, tanpa ini orang membuka satu per satu untuk mencari. */}
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)",
          fontVariantNumeric: "tabular-nums", minWidth: 16, textAlign: "right",
        }}>{anak.length}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            transform: terbuka ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform ${durasi}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            color: aktif ? "var(--navy)" : "var(--text-muted)",
          }}
        />
      </button>
      <div
        id={idPanel}
        style={{
          overflow: "hidden",
          maxHeight: terbuka ? `${tinggi}px` : "0px",
          // Opacity ikut beranimasi supaya submenu tidak "muncul mendadak"
          // di tengah gerakan tinggi — dua sifat yang berubah bersamaan
          // terbaca sebagai satu gerakan, bukan dua kejadian.
          opacity: terbuka ? 1 : 0,
          transition: `max-height ${durasi}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${durasi}ms ease`,
        }}
      >
        <div ref={isiRef} style={{ paddingTop: 2, paddingBottom: 4 }}>
          {anak.map((child) => {
            const active = isActive(child.href ?? "");
            return (
              <Link
                key={child.key}
                href={child.href ?? "#"}
                style={subStyle(active)}
                // Saat tertutup, submenu masih ada di DOM (untuk diukur) tapi
                // tak boleh bisa di-Tab. Tanpa ini, keyboard "menghilang" ke
                // dalam grup tertutup dan pemakai kehilangan fokus.
                tabIndex={terbuka ? 0 : -1}
                aria-hidden={!terbuka}
                onMouseEnter={(e) => onHover(e, active)}
                onMouseLeave={(e) => offHover(e, active)}
              >
                <IkonAnak nama={child.icon} aktif={active} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{child.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle, dipaksaCiut } = useSidebar();
  const [user, setUser] = useState<PuralokaUser | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuNode[]>([]);
  /**
   * Grup mana yang sedang terbuka.
   *
   * ⚠️ Sebelumnya ini DUA state hardcode (`keuanganOpen`, `pengaturanOpen`)
   * dengan `maxHeight` angka mati — 140px dan 80px. Dua cacat yang menunggu:
   * grup KETIGA takkan bisa dibuka sama sekali (tak punya state), dan submenu
   * ke-6 akan terpotong diam-diam karena melewati 140px. Dengan 20 grup dan
   * sampai 18 submenu, keduanya pasti menggigit.
   *
   * Set, bukan satu string: beberapa grup boleh terbuka bersamaan. Memaksa
   * hanya satu (accordion) membuat perbandingan antar-grup mustahil — dan di
   * ERP orang memang sering membuka Keuangan sambil melihat Pengadaan.
   */
  const [grupTerbuka, setGrupTerbuka] = useState<Set<string>>(new Set());

  // Token yang SAMA dengan margin shell di (dashboard)/layout.tsx. Kalau
  // keduanya jadi angka terpisah, salah satunya akan berubah sendiri suatu
  // hari dan gejalanya halus: konten tertimpa sidebar, atau ada celah kosong.
  const W = collapsed ? "var(--sidebar-w-ciut)" : "var(--sidebar-w)";

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

  /**
   * Buka sendiri grup yang memuat halaman yang sedang dibuka.
   *
   * Dengan 20 grup tertutup, tanpa ini pemakai kehilangan orientasi: ia tahu
   * sedang di halaman apa, tapi tak tahu di bagian mana sistem. Pola yang sama
   * dipakai SAP Fiori & Odoo.
   *
   * Menambah, tidak mengganti — grup yang sengaja dibuka pemakai tetap terbuka.
   */
  useEffect(() => {
    const memuatHalamanIni = menu
      .filter((n) => n.children.some((c) => c.href && isActive(c.href)))
      .map((n) => n.key);
    if (memuatHalamanIni.length === 0) return;
    setGrupTerbuka((s) => {
      const baru = new Set(s);
      let berubah = false;
      for (const k of memuatHalamanIni) if (!baru.has(k)) { baru.add(k); berubah = true; }
      // Kembalikan set LAMA bila tak ada yang berubah — set baru yang isinya
      // sama tetap memicu render ulang, dan effect ini jalan tiap pathname.
      return berubah ? baru : s;
    });
    // `isActive` sengaja tak jadi dependency: ia fungsi baru tiap render dan
    // akan membuat effect ini berjalan tanpa henti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, menu]);

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

  /**
   * Grup dianggap aktif bila salah satu anaknya adalah halaman yang dibuka.
   *
   * ⚠️ Sebelumnya ini konstanta `keuanganActive` yang menyebut tiga rute secara
   * harfiah — grup lain apa pun takkan pernah menyala, dan itu tak akan
   * berbunyi: menunya tetap muncul, hanya penanda posisinya yang hilang.
   */
  function grupAktif(node: MenuNode): boolean {
    return node.children.some((c) => c.href && isActive(c.href));
  }

  function toggleGrup(key: string) {
    setGrupTerbuka((s) => {
      const baru = new Set(s);
      if (baru.has(key)) baru.delete(key); else baru.add(key);
      return baru;
    });
  }

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
          <button aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
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
      {/* Saat ciut karena layar sempit, tombol ini SENGAJA disembunyikan:
          `toggle()` memang tak berfungsi di lebar itu, dan tombol yang ditekan
          lalu tak terjadi apa-apa terbaca sebagai aplikasi rusak. */}
      {collapsed && !dipaksaCiut && (
        <div style={{ padding: "8px 0 4px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <button aria-label="Buka sidebar"
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
              const aktif = grupAktif(node);
              const terbuka = grupTerbuka.has(node.key);
              return (
                <GrupCollapsible
                  key={node.key}
                  node={node}
                  anak={visibleChildren}
                  aktif={aktif}
                  terbuka={terbuka}
                  onToggle={() => toggleGrup(node.key)}
                  isActive={isActive}
                  subStyle={subStyle}
                  onHover={onHover}
                  offHover={offHover}
                />
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
            // Memakai komponen yang SAMA dengan grup lain. Sebelumnya blok ini
            // menyalin seluruh markup dropdown dengan state & maxHeight-nya
            // sendiri (80px, cukup untuk 2 submenu — padahal Pengaturan sudah
            // punya 8). Duplikasi seperti itu berarti tiap perbaikan harus
            // dikerjakan dua kali, dan yang kedua selalu terlupa.
            return (
              <GrupCollapsible
                node={pengaturanNode}
                anak={visibleChildren}
                aktif={pathname.startsWith("/pengaturan")}
                terbuka={grupTerbuka.has(pengaturanNode.key)}
                onToggle={() => toggleGrup(pengaturanNode.key)}
                // `/pengaturan` sendiri adalah halaman profil, jadi ia harus
                // cocok PERSIS — kalau tidak, seluruh submenu ikut menyala.
                isActive={(href) => (href === "/pengaturan" ? pathname === "/pengaturan" : pathname.startsWith(href))}
                subStyle={subStyle}
                onHover={onHover}
                offHover={offHover}
              />
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

        {/* Fokus hari ini — tepat DI ATAS kartu sesi.
            Posisinya sengaja: mata berhenti di sudut kiri-bawah saat mencari
            "siapa saya", dan angka yang menunggu keputusan ikut terbaca di
            perjalanan itu. Widget ini hadir di setiap halaman, jadi yang
            mendesak ditemukan saat sedang mengerjakan hal lain. */}
        {user && <SidebarFokus collapsed={collapsed} />}

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
            <button aria-label="Keluar"
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
            <button aria-label="Keluar"
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
          color: "var(--surface-subtle)",
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

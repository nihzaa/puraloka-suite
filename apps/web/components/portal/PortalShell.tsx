"use client";

// ============================================================================
// PortalShell — kerangka bersama 3 portal (mandor, PM, klien), ADAPTIF.
//
//   < 1024px  header navy sticky + konten + bottom nav (safe-area notch)
//   >= 1024px sidebar navy kiri + konten lebar, TANPA bottom nav
//
// ── Kenapa CSS, bukan `matchMedia` di React
//
// Deteksi lebar lewat JavaScript baru tahu jawabannya SESUDAH hidrasi. Di
// layar lebar itu berarti bottom-nav sempat tergambar lalu hilang — kedipan
// yang terlihat di tiap muat halaman, dan pada koneksi lambat bertahan cukup
// lama untuk diklik.
//
// Media query dievaluasi browser sebelum cat pertama. Tak ada kedipan, tak ada
// state, dan tak ada perbedaan antara render server dan klien.
//
// ── Kenapa 1024px
//
// Bukan 768px. Tablet potret (768-1023) masih dipegang satu tangan di lapangan,
// dan bottom-nav di situ lebih mudah dijangkau ibu jari daripada sidebar.
// 1024px adalah lebar saat perangkat berhenti dipegang dan mulai diletakkan.
//
// ── Bottom nav mengurasi maksimal 4 item
//
// Kalau `navItems` > 4, item ke-5-dst dipindah ke halaman "Lainnya" lewat
// `lainnyaHref` (rute nyata per-portal, BUKAN anchor placeholder — anchor mati
// tidak berfungsi sebagai navigasi). Sidebar TIDAK mengurasi: ruang vertikal
// di layar lebar cukup untuk seluruh menu, dan menyembunyikan item di sana
// hanya menambah satu ketukan tanpa alasan.
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
  /*
    `user` sengaja TIDAK di-destructure di sini.

    Ia tetap ada di `PortalShellProps` — pemanggil mengirimnya, dan
    membuangnya dari tipe akan memutus ketiga portal sekaligus. Tetapi
    komponen ini tak memakainya: identitas ditampilkan komponen anak, bukan
    di kerangka.

    Menghapusnya dari destructuring, bukan dari tipe, adalah perbedaan antara
    "prop ini tak dipakai di sini" dan "prop ini tak ada" — yang kedua akan
    membuat pemanggil gagal typecheck tanpa alasan yang sebenarnya.
  */
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
      className="portal-shell"
      style={{
        minHeight: "100dvh",
        background: "var(--portal-canvas)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/*
        Aturan adaptif ditulis sebagai CSS, bukan sebagai cabang React.

        Yang berubah di >= 1024px:
          · kerangka jadi dua kolom (sidebar | konten)
          · header navy berhenti sticky-horizontal, jadi kolom kiri tetap
          · bottom nav disembunyikan — item lengkapnya sudah ada di sidebar
          · konten dibatasi lebarnya supaya baris teks tak melar melewati
            ~90 karakter, yang membuat mata kehilangan awal baris berikutnya

        `[hidden]`-style disembunyikan dengan `display:none`, bukan
        `visibility`, supaya elemennya keluar dari urutan fokus keyboard —
        tombol tak terlihat yang masih bisa di-Tab adalah jebakan a11y.
      */}
      {/*
        `!important` DIPERLUKAN, dan alasannya bukan kemalasan.

        Kerangka ini memakai inline `style` (pola seluruh komponen portal),
        dan inline style SELALU menang atas selector CSS berapa pun
        spesifisitasnya. Media query di bawah karena itu tak berlaku sama
        sekali sampai `!important` dipasang.

        Ketahuan hanya lewat MEMOTRET: `tsc` hijau, CSS-nya ada di halaman,
        `.portal-shell` ada di DOM — dan `getComputedStyle` tetap memulangkan
        `display: flex` di layar 1440px. Tanpa potret, ini akan lolos sebagai
        "sudah dikerjakan".

        Alternatif yang lebih bersih adalah memindahkan seluruh gaya ke kelas
        CSS. Itu menyentuh tiga portal sekaligus dan bukan pekerjaan commit
        ini — dicatat sebagai utang, bukan disamarkan.
      */}
      <style>{`
        @media (min-width: 1024px) {
          .portal-shell {
            display: grid !important;
            grid-template-columns: 264px 1fr !important;
            grid-template-rows: 100dvh;
          }
          .portal-shell > .portal-kepala {
            position: sticky !important;
            top: 0 !important;
            height: 100dvh !important;
            /*
              Tiga baris: identitas · menu · aksi. Tanpa ini tombol keluar
              menggantung persis di bawah judul portal — terbaca seperti
              tombol nyasar, bukan aksi akun. Di sidebar, aksi akun tempatnya
              di DASAR; itu konvensi yang orang bawa dari aplikasi lain.
            */
            display: grid !important;
            grid-template-rows: auto 1fr auto !important;
            align-items: stretch !important;
            gap: 0 !important;
            padding: 26px 16px 20px !important;
            overflow-y: auto !important;
          }
          /* Baris aksi (logout, status antrean, mode) turun ke dasar. */
          /*
            Tombol di baris aksi diberi latar & border yang TERBACA di atas
            navy gelap. Nilai bawaannya (rgba putih 0.10, border 'redup')
            dirancang untuk header terang di HP; di sidebar navy ia nyaris
            hilang — potret pertama menunjukkan lingkaran hitam tanpa ikon
            yang terlihat.
          */
          .portal-shell > .portal-kepala > .portal-aksi button {
            background: rgba(255,255,255,0.14) !important;
            border-color: rgba(255,255,255,0.28) !important;
          }
          .portal-shell > .portal-kepala > .portal-aksi {
            grid-row: 3 !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
            gap: 8px !important;
            padding-top: 16px !important;
            border-top: 1px solid rgba(255,255,255,0.12) !important;
          }
          .portal-shell > .portal-kepala > .portal-sidebar-nav {
            grid-row: 2 !important;
            align-content: start !important;
            margin-top: 22px !important;
          }
          .portal-shell > .portal-isi {
            overflow-y: auto !important;
            padding: 32px 40px 40px !important;
          }
          /*
            Dipusatkan, bukan rata kiri. Pada 1440px konten selebar 1176px
            yang menempel ke kiri meninggalkan pita kosong di kanan — mata
            membaca itu sebagai halaman yang belum selesai dimuat.
          */
          .portal-shell > .portal-isi > * {
            max-width: 1180px !important;
            margin-inline: auto !important;
          }
          .portal-shell > .portal-bawah { display: none !important; }
          .portal-sidebar-nav { display: flex !important; }
        }
        .portal-sidebar-nav { display: none; }
      `}</style>
      <header
        className="portal-kepala"
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
        <div className="portal-aksi" style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

        {/*
          Navigasi sidebar — HANYA tampil >= 1024px (`.portal-sidebar-nav`
          default `display:none`, dinyalakan media query di atas).

          Dua hal yang membedakannya dari bottom nav:

          · SELURUH item ditampilkan, tanpa kurasi 4 + "Lainnya". Ruang
            vertikal di layar lebar cukup, dan menyembunyikan item di sana
            hanya menambah satu ketukan tanpa alasan.
          · label di samping ikon, bukan di bawahnya — di sidebar sempit yang
            dibaca adalah kata, bukan piktogram.

          `aria-label` dibedakan dari bottom nav supaya pembaca layar tak
          mengumumkan dua "Navigasi utama" pada halaman yang sama. Hanya satu
          yang tergambar pada satu waktu, tetapi keduanya ada di DOM — dan
          `display:none` memang mengeluarkannya dari pohon aksesibilitas,
          jadi ini kehati-hatian untuk pembaca yang mengabaikan CSS.
        */}
        <nav
          aria-label="Navigasi portal"
          className="portal-sidebar-nav"
          style={{ flexDirection: "column", gap: 2, marginTop: 20 }}
        >
          {navItems.map((item) => {
            const aktif = isActive(pathname, item.href, item.exact);
            const Ikon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={aktif ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: aktif ? 600 : 500,
                  /*
                    Yang aktif dibedakan LATAR, bukan hanya warna teks.
                    Perbedaan warna teks saja tak cukup untuk WCAG 1.4.1
                    (jangan menyampaikan informasi lewat warna semata) dan
                    hilang sama sekali di mode kontras tinggi.
                  */
                  background: aktif ? "rgba(255,255,255,0.14)" : "transparent",
                  color: aktif ? "var(--on-merek)" : "var(--on-merek-lembut)",
                }}
              >
                <Ikon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="portal-isi" style={{ flex: 1, padding: "20px 16px", paddingBottom: 96 }}>
        {children}
      </main>

      <nav
        aria-label="Navigasi utama"
        className="portal-bawah"
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
        {hasMore && (() => {
          const lainnyaTarget = lainnyaHref ?? navItems[4]?.href ?? "#";
          // href "#" berarti tak ada tujuan nyata — jangan pernah ditandai aktif,
          // sekalipun pathname kebetulan cocok secara string.
          const active = lainnyaTarget !== "#" && isActive(pathname, lainnyaTarget);
          return (
            <Link
              href={lainnyaTarget}
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
              <MoreHorizontal size={22} aria-hidden="true" />
              Lainnya
            </Link>
          );
        })()}
      </nav>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rutenyaAktifPenuh } from "@/lib/rute-aktif";
import { tujuanGrup } from "@/lib/tujuan-grup";
import { TitikKesiapan } from "@/components/titik-kesiapan";
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
  Bot,
} from "lucide-react";
import {
  getStoredUser, logout, api, MENU_CACHE_KEY, MENU_ETAG_KEY,
  type PuralokaUser,
} from "@/lib/api";
import { SidebarFokus } from "@/components/sidebar-fokus";
import { LogoPuraloka } from "@/components/logo-puraloka";
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
  // `Bot` untuk menu Asisten (migrasi 253). Tanpa entri di sini, `iconFor`
  // jatuh ke `FolderKanban` — dan asisten AI tampil bergambar folder,
  // penanda yang keliru dan tak menimbulkan galat apa pun.
  Bot,
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
  /** `hidup` | `sebagian` | `rencana` — migrasi 241. Ditampilkan sebagai titik. */
  kesiapan?: string;
  children: MenuNode[];
}

/**
 * Cache menu + ETag-nya. Kuncinya didefinisikan di `lib/api.ts` karena
 * `logout()` di sana wajib membuang keduanya — lihat catatan di sana.
 *
 * Katalog menu ~57 KB, muatan terbesar di aplikasi ini, dan sidebar
 * merevalidasinya tiap kali dimuat. Server membalas 304 untuk `If-None-Match`
 * yang cocok, tapi axios tidak mengirim header itu sendiri: tanpa itu 57 KB
 * tetap diunduh utuh dan ETag di server tak menghemat sebyte pun.
 */

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
  node, anak, aktif, terbuka, onToggle, isActive, belumAdaHalamanSendiri,
  subStyle, onHover, offHover,
}: {
  node: MenuNode;
  anak: MenuNode[];
  aktif: boolean;
  terbuka: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
  /**
   * Item ini belum punya halamannya sendiri — jangan disorot, redupkan.
   *
   * Diterima sebagai prop karena penilaiannya harus LINTAS GRUP:
   * menghitung per-grup memperbaiki /estimasi tapi menyisakan empat item
   * menyala di /proyek, masing-masing satu-satunya pemakai `/proyek` di
   * grupnya sendiri. Aturan lengkap + test: `lib/menu-berbagi-href.ts`.
   */
  belumAdaHalamanSendiri: (href: string | null | undefined, key?: string) => boolean;
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

  /*
    SATU KLIK = BUKA HALAMAN + EXPAND.

    Founder 2026-08-09: *"klik menu itu harusnya bisa sekaligus link halaman
    dan expand, ngga dipisah"*. Sebelumnya baris ini murni toggle, sehingga
    `/keuangan` — halaman yang sudah lama jadi — hanya bisa dicapai lewat dua
    klik: buka grup, lalu klik anak "Ringkasan Keuangan".

    Tujuannya DIPINJAM dari anak, bukan href baru untuk induk. Alasan lengkap
    di `lib/tujuan-grup.ts`; ringkasnya: memberi induk href sendiri melanggar
    migrasi 232 R-1 ("satu route = tepat satu link") dan menghidupkan lagi
    cacat "dua link aktif sekaligus" yang justru dibereskan migrasi itu.

    `null` = grup ini memang tak punya halaman ringkasan (mis. Gudang, yang
    semua anaknya halaman kerja). Barisnya tetap `<button>` toggle seperti
    semula — tidak menebak, tidak mengirim orang ke halaman acak.
  */
  /*
    `anak`, BUKAN `node.children`.

    `anak` sudah disaring izin oleh pemanggil (`visibleChildren`);
    `node.children` belum. Memakai yang belum disaring berarti baris induk bisa
    mengarahkan orang ke halaman yang tak boleh ia buka — gagal-terbuka, dan
    jenis kebocoran yang tak terlihat sampai ada pemakai berperan terbatas
    yang mencobanya.
  */
  const tujuan = tujuanGrup({ children: anak });

  const isiBaris = (
    <>
      <IkonGrup nama={node.icon} aktif={aktif} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{node.label}</span>
      {/* Jumlah submenu: memberi tahu ada berapa SEBELUM dibuka. Dengan 20
          grup, tanpa ini orang membuka satu per satu untuk mencari. */}
      <span style={{
        fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
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
    </>
  );

  const gayaBaris: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "0 14px", margin: "2px 6px", height: 40,
    borderRadius: 8, fontSize: 13, fontWeight: aktif ? 600 : 400,
    // Tombol grup TIDAK diberi pill navy pekat, hanya teks navy.
    //
    // Sengaja berbeda dari `navStyle`/`subStyle`: yang aktif di sini
    // berarti "salah satu ANAK saya sedang dibuka", bukan "inilah
    // halaman yang Anda lihat". Memberi pill penuh pada keduanya
    // membuat DUA blok navy menyala sekaligus — grup dan anaknya —
    // dan pemakai tak lagi tahu mana yang sebenarnya halaman aktif.
    background: "transparent", border: "none",
    color: aktif ? "var(--navy)" : "var(--text-secondary)",
    cursor: "pointer", width: "calc(100% - 12px)", textAlign: "left",
    transition: "all 0.15s", whiteSpace: "nowrap",
    textDecoration: "none",
  };

  const masuk = (e: React.MouseEvent<HTMLElement>) => {
    if (!aktif) { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--surface-hover)"; }
  };
  const keluar = (e: React.MouseEvent<HTMLElement>) => {
    if (!aktif) { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; }
  };

  return (
    <div>
      {tujuan ? (
        /*
          `<Link>`, bukan `<button onClick={router.push}>`: navigasi harus
          tetap bekerja dengan klik-tengah, Ctrl+klik, dan "buka di tab baru".
          Tombol ber-handler membuang ketiganya diam-diam.

          `onClick` di SINI hanya meng-expand — navigasinya urusan `<Link>`.
          Keduanya berjalan pada klik yang sama, dan itulah yang diminta:
          "sekaligus link halaman dan expand, ngga dipisah".

          Sengaja hanya MEMBUKA, tak pernah menutup: kalau klik yang sama juga
          bisa menutup, orang yang mengklik "Keuangan" saat grupnya sudah
          terbuka akan pindah halaman DAN kehilangan daftar anaknya sekaligus.
          Menutupnya tetap bisa lewat klik saat grup itu bukan grup aktif.
        */
        <Link
          href={tujuan}
          onClick={() => { if (!terbuka) onToggle(); }}
          aria-expanded={terbuka}
          aria-controls={idPanel}
          style={gayaBaris}
          onMouseEnter={masuk}
          onMouseLeave={keluar}
        >
          {isiBaris}
        </Link>
      ) : (
        <button
          onClick={onToggle}
          aria-expanded={terbuka}
          aria-controls={idPanel}
          style={gayaBaris}
          onMouseEnter={masuk}
          onMouseLeave={keluar}
        >
          {isiBaris}
        </button>
      )}
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
        {/*
          GARIS VERTIKAL sepanjang grup yang terbuka.

          Founder 2026-08-09 menunjuk pola ini di proyeknya yang lain (TJS
          Command Center): *"ada garis memanjang kebawah sepanjang
          sidebarnya"*.

          Yang dikerjakannya bukan hiasan. Dengan 17 grup dan grup terpanjang
          berisi 14 anak (Keuangan), satu-satunya penanda hubungan induk-anak
          selama ini adalah INDENTASI — dan indentasi berhenti terbaca begitu
          daftarnya melewati tinggi layar: orang yang men-scroll ke tengah
          grup Keuangan tak lagi melihat induknya, jadi tak tahu ia sedang di
          dalam apa. Garis menempel sepanjang grup, jadi ia selalu terlihat.

          `marginInlineStart: 19px` menaruhnya persis di bawah pusat ikon
          grup (padding 14 + setengah ikon 16px ≈ 22, dikurangi lebar garis).
          Angkanya disamakan dengan TJS karena di sana sudah terbukti sejajar.

          Submenu TETAP memakai titik, bukan ikon sendiri-sendiri. Catatan di
          `ICONS` menolak 202 ikon berbeda dengan alasan yang masih berlaku
          pada 102: saat semuanya bergambar, mata berhenti memakai ikon
          sebagai pembeda dan kembali membaca teks — ikonnya jadi tinta tanpa
          informasi. Founder memilih garis-saja setelah alasan itu disampaikan.
        */}
        <div
          ref={isiRef}
          style={{
            paddingTop: 2, paddingBottom: 4,
            marginInlineStart: 19,
            borderInlineStart: "1.5px solid var(--border)",
          }}
        >
          {anak.map((child) => {
            /**
             * Sub-menu yang BELUM punya halamannya sendiri.
             *
             * Diukur di database: 23 item menunjuk `/proyek`, 14 ke
             * `/mandor`, 13 ke `/procurement`, 13 ke `/estimasi`. Itu
             * bukan kesalahan data — sub-menu yang belum digarap memang
             * sengaja dialihkan ke halaman induknya (triase F5-1).
             *
             * Tapi akibatnya di layar nyata: membuka /estimasi membuat
             * DUA BELAS item menyala serentak, karena semuanya cocok
             * dengan pathname yang sama. Penanda posisi jadi tak
             * menunjukkan posisi apa pun — dan orang yang mengklik
             * "Cost Baseline (BAC)" mendarat di halaman Proyek biasa
             * tanpa satu pun penjelasan kenapa.
             *
             * Diturunkan dari data (href sama dengan induk), bukan dari
             * daftar tulis-tangan. Daftar tulis-tangan akan membusuk
             * begitu satu sub-menu digarap dan tak ada yang ingat
             * mencoretnya dari sini.
             */
            const belumAdaHalaman = belumAdaHalamanSendiri(child.href, child.key);

            // Item yang belum punya halaman JANGAN ikut menyala — kalau
            // tidak, seluruh grup tersorot sekaligus dan penandanya
            // berhenti berarti.
            const active = !belumAdaHalaman && isActive(child.href ?? "");
            return (
              <Link
                key={child.key}
                href={child.href ?? "#"}
                aria-current={active ? "page" : undefined}
                title={belumAdaHalaman
                  ? `${child.label} belum punya halaman sendiri — tautannya membuka halaman bersama grup ini.`
                  : undefined}
                style={{
                  ...subStyle(active),
                  // ⚠️ JANGAN pakai `opacity` untuk meredupkan teks di sini.
                  //
                  // Versi pertama memakai `opacity: 0.55`, dan audit axe-core
                  // menemukannya sebagai 213 pelanggaran kontras di 37 halaman
                  // — pelanggaran terbanyak di seluruh aplikasi, dari satu
                  // baris kode.
                  //
                  // Diukur: teks `#5A616B` di latar `#F8FAFC` punya kontras
                  // 5,98:1. Dengan opacity 0.55 ia menjadi 2,34:1 — jauh di
                  // bawah ambang WCAG AA 4,5:1. Bahkan 0.85 pun gagal (4,25:1),
                  // jadi ini bukan soal memilih angka yang lebih besar:
                  // opacity SAMA SEKALI bukan alat yang tepat untuk ini.
                  //
                  // Penanda "belum ada halaman" dipindahkan ke titik kecil di
                  // sisi kiri (lihat di bawah) — ia membawa arti yang sama
                  // tanpa menyentuh keterbacaan labelnya.
                  position: "relative",
                }}
                // Saat tertutup, submenu masih ada di DOM (untuk diukur) tapi
                // tak boleh bisa di-Tab. Tanpa ini, keyboard "menghilang" ke
                // dalam grup tertutup dan pemakai kehilangan fokus.
                tabIndex={terbuka ? 0 : -1}
                aria-hidden={!terbuka}
                onMouseEnter={(e) => onHover(e, active)}
                onMouseLeave={(e) => offHover(e, active)}
              >
                {/* Titik penanda "belum punya halaman sendiri".
                    Dekoratif — maknanya disampaikan lewat `title` dan
                    keterangan `sr-only` di bawah, jadi ia tak perlu
                    memenuhi kontras teks. */}
                {belumAdaHalaman && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute", left: 18, top: "50%",
                      width: 4, height: 4, borderRadius: "50%",
                      transform: "translateY(-50%)",
                      background: "var(--text-muted)", opacity: 0.5,
                    }}
                  />
                )}
                <IkonAnak nama={child.icon} aktif={active} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{child.label}</span>
                {/*
                  Titik kesiapan halaman (migrasi 241). Hanya muncul untuk
                  `sebagian`/`rencana` — 90 dari 102 menu berstatus hidup, dan
                  sembilan puluh titik hijau akan menenggelamkan dua belas
                  yang benar-benar berarti. Alasan lengkap di komponennya.
                */}
                <TitikKesiapan kesiapan={child.kesiapan} />
                {/* `title` tidak terbaca andal oleh pembaca layar dan sama
                    sekali tak terjangkau lewat keyboard. Keterangan ini
                    dibaca, tapi tak menambah kebisingan visual. */}
                {belumAdaHalaman && (
                  <span className="sr-only">
                    {" "}— belum punya halaman sendiri, membuka halaman bersama grup ini
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SidebarIsi() {
  const pathname = usePathname();
  // Query IKUT menentukan menu aktif: migrasi 233 membuat "Transmittal" dan
  // "Notulen Rapat" dua link ke halaman yang sama, dibedakan `?bagian=`.
  const params = useSearchParams();
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
    let etagTersimpan: string | null = null;
    try {
      const cached = localStorage.getItem(MENU_CACHE_KEY);
      if (cached) {
        setMenu(JSON.parse(cached) as MenuNode[]);
        // ETag hanya dikirim kalau muatannya BENAR-BENAR ada di tangan.
        // Mengirimnya tanpa muatan berarti meminta 304 lalu tak punya apa pun
        // untuk ditampilkan — sidebar kosong tanpa satu pun pesan galat.
        etagTersimpan = localStorage.getItem(MENU_ETAG_KEY);
      }
    } catch {}

    api.get<{ menu: MenuNode[] }>("/api/v1/menu", {
      headers: etagTersimpan ? { "If-None-Match": etagTersimpan } : undefined,
      // Tanpa ini axios memperlakukan 304 sebagai galat dan jatuh ke `.catch`.
      // Perilakunya tetap benar (cache dipakai), tapi lewat jalur penanganan
      // galat — dan revalidasi yang berhasil tak boleh terlihat seperti gagal.
      validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
    })
      .then(({ status, data, headers }) => {
        // 304 = yang dipegang masih mutakhir. Tak ada badan untuk dibaca;
        // menyentuh `data.menu` di sini akan melempar dan mengosongkan menu.
        if (status === 304) return;
        setMenu(data.menu);
        try {
          localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(data.menu));
          const etag = headers?.etag ?? (headers as Record<string, string>)?.["etag"];
          if (etag) localStorage.setItem(MENU_ETAG_KEY, etag);
          else localStorage.removeItem(MENU_ETAG_KEY);
        } catch {}
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

  /**
   * Href yang dipakai oleh LEBIH DARI SATU item menu.
   *
   * Diukur di database: 23 item menunjuk `/proyek`, 14 ke `/mandor`,
   * 13 ke `/procurement`, 13 ke `/estimasi`. Itu bukan data rusak —
   * sub-menu yang belum digarap sengaja dialihkan ke halaman induknya
   * (triase F5-1).
   *
   * Akibatnya di layar: membuka /proyek menyalakan 23 item sekaligus,
   * jadi penanda posisi berhenti menunjukkan posisi. Dan orang yang
   * mengklik "Cost Baseline (BAC)" mendarat di halaman Proyek biasa
   * tanpa satu pun penjelasan kenapa.
   *
   * Diturunkan dari data, bukan dari daftar tulis-tangan — daftar
   * tulis-tangan akan membusuk begitu satu sub-menu digarap dan tak
   * ada yang ingat mencoretnya.
   */
  // Aturannya di `lib/menu-berbagi-href.ts` — bukan di sini. Logika ini
  // butuh tiga percobaan untuk benar (semua perwakilan, tak ada
  // perwakilan, perwakilan yang bernama salah), jadi ia diangkat ke
  // fungsi murni supaya bisa dikunci test.
  /**
   * Sesudah migrasi 232 tak ada lagi href yang dipakai lebih dari satu link,
   * dan tak ada lagi menu yang menunjuk halaman "segera hadir" — keduanya
   * dijaga di tingkat data oleh verifikasi migrasi itu sendiri.
   *
   * `lib/menu-berbagi-href.ts` (100 baris + 9 test) DIHAPUS bersamanya. Ia
   * menyelesaikan gejalanya dengan baik: saat satu href dipakai 22 item, ia
   * memilih satu wakil untuk disorot dan meredupkan sisanya. Tapi gejalanya
   * kini tak ada, dan kode yang menjaga keadaan mustahil hanya membuat
   * pembaca berikutnya mengira keadaan itu masih mungkin.
   */
  const belumAdaHalamanSendiri = useCallback(() => false, []);

  /**
   * Cocok DI BATAS SEGMEN, bukan `startsWith` mentah.
   *
   * `startsWith` membocorkan sorotan ke rute yang kebetulan berawalan sama:
   * membuka `/procurement/rfq` menyalakan SETIAP menu ber-href `/procurement`
   * — dan ada 12 di antaranya, tersebar di lima grup berbeda (Master Data,
   * Pengadaan, Gudang & Material, Keuangan). Akibatnya grup yang menyala
   * adalah yang kebetulan ditemukan lebih dulu, bukan yang benar: membuka
   * RFQ menyalakan "Master Data".
   *
   * Cacat yang sama sudah diperbaiki di `middleware.ts` dengan `cocokRute`
   * (`/proyek` vs `/proyeksi-kas`). Ini penerapan gagasan yang sama di
   * sidebar.
   *
   * Yang cocok: href itu sendiri (`/procurement`) dan anaknya
   * (`/procurement/rfq`). Yang tidak: saudara berawalan sama
   * (`/procurement-lama`).
   */
  /**
   * SATU aturan, tanpa cabang: cocok PERSIS.
   *
   * Sebelum migrasi 232, sidebar memakai aturan "anak menyalakan induk"
   * (`pathname.startsWith(href + "/")`). Itu perlu ketika satu route bisa
   * dicapai dari beberapa link — induk jadi penanda "Anda ada di bagian ini".
   *
   * Sesudah 232 aturannya satu route = satu link, jadi tiap halaman SUDAH
   * punya linknya sendiri. Aturan-anak kini justru merugikan: membuka
   * `/procurement/pesanan` menyalakan "Ringkasan Pengadaan" DAN "Purchase
   * Order" sekaligus — dua link menyala, persis yang dikeluhkan founder.
   *
   * Kelompok induk tak ikut dihitung: ia tak punya href sama sekali (R-2),
   * dan keterbukaannya diatur efek terpisah yang membuka kelompok yang
   * memuat halaman aktif.
   */
  function isActive(href: string) {
    return rutenyaAktifPenuh(pathname, params, href);
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
      margin: "2px 6px",
      height: 40,
      borderRadius: 8,
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      textDecoration: "none",
      transition: "all 0.15s",
      // Pill navy pekat — sama persis dengan `subStyle`. Kalau kedua tingkat
      // memakai perlakuan berbeda, sidebar terbaca dari dua sistem: itu yang
      // dihindari kandidat B. Alasan token `--on-navy`: lihat `subStyle`.
      color: active ? "var(--on-navy)" : "var(--text-secondary)",
      background: active ? "var(--navy)" : "transparent",
      position: "relative",
      flexShrink: 0,
      overflow: "hidden",
      whiteSpace: "nowrap",
    };
  }

  /**
   * Item aktif = PILL NAVY PEKAT + teks `--on-navy`, tanpa garis kiri.
   *
   * Diputuskan founder 2026-08-08 dari perbandingan berdampingan
   * (`scripts/banding-shell.mjs`, kandidat B), bukan dari daftar perbedaan
   * di teks — aturan `ARAH-VISUAL-2026.md` §10 sesudah pelajaran indigo.
   *
   * Sebelumnya: `--navy-light` + teks navy + `borderLeft` 3px. Itu sorotan
   * yang lembut; yang dipilih adalah sorotan yang tegas seperti referensi.
   *
   * `--on-navy`, BUKAN `--on-merek`: keduanya putih di mode terang (jadi
   * salah pilih tak bergejala di sana), tetapi hanya `--on-navy` yang ikut
   * berbalik jadi teks GELAP di mode gelap tempat `--navy` menjadi biru
   * terang. Diukur: 12,61:1 terang · 6,94:1 gelap — keduanya lulus AA.
   */
  function subStyle(active: boolean): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: 6,
      // Padding kiri turun 34 → 30 karena garis 3px hilang; ikon anak tetap
      // sejajar dengan ikon grup di atasnya.
      padding: "0 14px 0 30px",
      margin: "2px 6px",
      // 34 → 36: "jarak antar item lebih lega" bagian dari kandidat B.
      height: 36,
      borderRadius: 8,
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      textDecoration: "none",
      transition: "all 0.15s",
      color: active ? "var(--on-navy)" : "var(--text-secondary)",
      background: active ? "var(--navy)" : "transparent",
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
      {/*
        Logo + toggle — TINGGINYA DIPATOK 56px, sama persis dengan topbar.

        Founder 2026-08-09: *"ketinggian topbar dan area logo di sidebar ini
        berasa kurang menyatu"*. Diukur, dan ia benar: topbar 56px, kepala
        sidebar 65px. Selisih 9px membuat garis bawah keduanya tak sejajar —
        cukup untuk terasa salah, terlalu kecil untuk langsung ketahuan
        sebabnya.

        Dipatok `height`, bukan diatur lewat padding: padding menghasilkan
        tinggi TURUNAN dari isinya, jadi ia akan menyimpang lagi begitu ukuran
        logo atau font berubah. Tinggi eksplisit membuat kedua sisi shell
        terikat pada satu angka yang sama.
      */}
      <div style={{
        height: 56,
        padding: collapsed ? "0" : "0 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        gap: 8,
        flexShrink: 0,
      }}>
        {/* Lambang perusahaan — menggantikan huruf "P" yang selama ini jadi
            penampung sementara. Aplikasi yang memakai inisial alih-alih
            logonya sendiri terbaca sebagai belum jadi. */}
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: "var(--grad-aksen)", display: "flex",
              alignItems: "center", justifyContent: "center",
              flexShrink: 0, boxShadow: "0 2px 8px var(--navy-glow)",
              color: "var(--on-aksen)",
            }}>
              <LogoPuraloka size={17} title="" />
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)", lineHeight: 1, letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
                Puraloka
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.05em" }}>Suite</div>
            </div>
          </div>
        )}

        {collapsed && (
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--grad-aksen)", display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px var(--navy-glow)",
            color: "var(--on-aksen)",
          }}>
            {/* Saat ciut, lambang ini SATU-SATUNYA penanda aplikasi —
                jadi di sini ia bukan hiasan dan wajib punya nama. */}
            <LogoPuraloka size={17} />
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
              padding: 6, borderRadius: 6, background: "transparent", border: "none",
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
          <div style={{ padding: "12px 12px 6px", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
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
                  belumAdaHalamanSendiri={belumAdaHalamanSendiri}
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
                // Aturan yang SAMA dengan isActive utama: cocok persis.
                //
                // Sesudah migrasi 232 tiap route punya tepat satu link, jadi
                // tak ada lagi alasan induk menyala saat anaknya dibuka.
                // Sebelumnya blok ini memakai aturan berbeda dari sidebar
                // utama di berkas yang sama — dan `/pengaturan/roles`
                // menyalakan dua link sekaligus.
                isActive={(href) => rutenyaAktifPenuh(pathname, params, href)}
                belumAdaHalamanSendiri={belumAdaHalamanSendiri}
                subStyle={subStyle}
                onHover={onHover}
                offHover={offHover}
              />
            );
          }

          if (!collapsed) {
            return (
              <Link href={pengaturanHref} style={navStyle(pathname.startsWith("/pengaturan"))} aria-current={pathname === pengaturanHref ? "page" : undefined} onMouseEnter={e => onHover(e, pathname.startsWith("/pengaturan"))} onMouseLeave={e => offHover(e, pathname.startsWith("/pengaturan"))}>
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
            padding: "8px 8px", marginTop: 6,
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
                borderRadius: 6, padding: "0px 4px", fontWeight: 600,
              }}>
                {roleLabel[user.role] ?? user.role}
              </div>
            </div>
            <button aria-label="Keluar"
              onClick={handleLogout}
              title="Keluar"
              style={{ padding: 4, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0, display: "flex", alignItems: "center" }}
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

/**
 * Batas Suspense DITANGGUNG DI SINI, bukan di `(dashboard)/layout.tsx`.
 *
 * `SidebarIsi` memanggil `useSearchParams()` — menu aktif dibedakan `?bagian=`
 * sejak migrasi 233 — dan Next 16 menolak prerender halaman mana pun yang
 * memuatnya tanpa batas Suspense.
 *
 * Kenapa di komponen, bukan di layout: sidebar dipakai layout yang membungkus
 * SELURUH halaman dashboard. Saat batasnya hilang, build gagal di halaman yang
 * kebetulan diprerender lebih dulu (`/procurement/lanjutan`,
 * `/keuangan/contingency`) — dua berkas yang tak memakai `useSearchParams`
 * sama sekali. Penunjuk yang salah alamat itu sempat membuat cacatnya tercatat
 * sebagai "masalah dua halaman", padahal satu titik.
 *
 * Ditanggung komponen = tak ada pemanggil yang bisa lupa. Pola yang sama
 * dipakai `judul-bagian.tsx`, dan dijaga `scripts/suspense-ratchet.mjs`.
 *
 * Fallback selebar sidebar aslinya: shell memesan `marginLeft` sebesar
 * `--sidebar-w`, jadi rangka yang lebih sempit membuat halaman melompat saat
 * hidrasi.
 */
export function Sidebar() {
  const { collapsed } = useSidebar();
  return (
    <Suspense
      fallback={
        <aside
          aria-hidden
          style={{
            width: collapsed ? "var(--sidebar-w-ciut)" : "var(--sidebar-w)",
            position: "fixed",
            insetBlock: 0,
            insetInlineStart: 0,
            background: "var(--surface)",
            borderInlineEnd: "1px solid var(--border)",
          }}
        />
      }
    >
      <SidebarIsi />
    </Suspense>
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
        // `aria-current="page"` bukan hiasan. Halaman aktif ditandai lewat
        // warna latar dan titik kecil — keduanya TAK TERLIHAT bagi pemakai
        // pembaca layar. Tanpa atribut ini, sidebar (navigasi UTAMA aplikasi)
        // tak pernah menyebutkan di mana orang sedang berada.
        //
        // `nav-bagian.tsx:71` sudah memakainya sejak awal; sidebar tertinggal.
        //
        // Dibuktikan bisa hilang: mencabut baris ini membuat Beranda yang
        // sedang dibuka melaporkan `aria-current=page : 0` — halaman aktif
        // berhenti diumumkan sama sekali.
        aria-current={active ? "page" : undefined}
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
        aria-current={active ? "page" : undefined}
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
          background: "var(--text-primary)",
          color: "var(--surface-subtle)",
          fontSize: 12,
          fontWeight: 500,
          padding: "4px 8px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          boxShadow: "var(--naik-2)",
          letterSpacing: "0.01em",
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

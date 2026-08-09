"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ResponsiveGridLayout: RGLResponsive } = require("react-grid-layout");
// Cast to avoid @types/react-grid-layout v1 vs react-grid-layout v2 prop mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResponsiveGridLayout = RGLResponsive as React.ComponentType<any>;
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, EyeOff, Eye, LayoutGrid } from "lucide-react";

// Inline layout types — avoids @types/react-grid-layout namespace conflicts
interface Layout  { i: string; x: number; y: number; w: number; h: number; isResizable?: boolean; isDraggable?: boolean }
type Layouts = Record<string, Layout[]>;

// ─── Widget registry ──────────────────────────────────────────────────────────

export const WIDGET_DEFS: Record<string, { label: string; defaultH: number }> = {
  kpi:       { label: "KPI Cards",             defaultH: 3 },
  serapan:   { label: "Serapan Anggaran",       defaultH: 6 },
  cashflow:  { label: "Grafik Arus Kas",        defaultH: 5 },
  status:    { label: "Status & Progress",      defaultH: 5 },
  pintasan:  { label: "Pintasan",               defaultH: 2 },
  kabar:      { label: "Kabar Lapangan",        defaultH: 5 },
  peringatan: { label: "Peringatan Kritis",     defaultH: 5 },
  tenggat:    { label: "Tenggat Mendatang",     defaultH: 5 },
  invoice:   { label: "Invoice Belum Lunas",    defaultH: 5 },
  kasbon:    { label: "Kasbon Pending",         defaultH: 4 },
  tax:       { label: "Ringkasan Pajak",        defaultH: 3 },
};

export type WidgetKey = keyof typeof WIDGET_DEFS;

/**
 * Id elemen tempat tombol "Sesuaikan" dititipkan lewat portal.
 *
 * Diekspor supaya halaman yang menyediakan wadahnya memakai konstanta yang
 * SAMA, bukan mengetik ulang string-nya. Salah ketik satu huruf berarti
 * `getElementById` mengembalikan null dan tombolnya diam-diam kembali ke atas
 * grid — tanpa error, tanpa peringatan, dan itu jenis kegagalan yang baru
 * ketahuan berbulan-bulan kemudian.
 */
export const ID_WADAH_KONTROL = "wadah-kontrol-dashboard";

// ─── Default layouts ──────────────────────────────────────────────────────────

const DEFAULT_LAYOUTS: Layouts = {
  lg: [
    /*
      `h: 3` = 3x60 + 2x14 margin = 208px, dan strip KPI terukur 176px.
      Bukan tebakan: `h: 2` hanya 148px dan MENGGUNTING baris keterangan;
      `h: 5` (percobaan sebelumnya) menyisakan ~150px ruang kosong karena
      kartu sudah diramping-kan. Angka ini diukur ulang di peramban setiap
      kali tinggi kartu berubah.
    */
    { i: "kpi",       x: 0, y: 0,  w: 12, h: 3, isResizable: false },
    /*
      BARIS TIGA WIDGET — bentuk referensi (Budget · Timeline · Site-wise).
      Di sini isinya: serapan anggaran · arus kas · status per proyek.

      `h: 6`, bukan 5. Dengan 5, isi widget arus kas (grafik 200px +
      legenda + tiga metrik ringkasan) melebihi wadahnya 46px dan baris
      "Pemasukan · Pengeluaran est. · Selisih" TERGUNTING — diukur di
      peramban, bukan ditaksir. Ketiganya disamakan supaya sejajar.
    */
    { i: "serapan",   x: 0, y: 3,  w: 4,  h: 6 },
    { i: "cashflow",  x: 4, y: 3,  w: 4,  h: 6 },
    { i: "status",    x: 8, y: 3,  w: 4,  h: 6 },
    /*
      PINTASAN sesudah baris tiga widget — urutan referensi, dan urutan itu
      masuk akal: pintasan adalah tempat PERGI sesudah membaca keadaan, bukan
      sebelum. Sebelumnya ia bagian tetap di atas KPI.

      `h: 2` (148px): pil mendatar setinggi 38px + judul + padding. Ubin
      bertumpuk yang lama butuh `h: 3`.
    */
    { i: "pintasan",  x: 0, y: 9,  w: 12, h: 2 },
    /*
      BARIS TIGA KARTU BAWAH — persis referensi:
      Recent Project Updates · Critical Issue Alerts · Upcoming Deadlines.

      Catatan sebelumnya di sini menyatakan alerts & deadlines "sudah punya
      rumahnya" (spanduk + rail) jadi tak perlu diduplikasi. Itu SALAH BACA:
      referensi tak punya spanduk sama sekali — alerts di sana memang kartu
      di baris ini. Spanduknya dibuang 2026-08-09 dan digantikan kartu ini.
    */
    { i: "kabar",      x: 0, y: 11, w: 4, h: 5 },
    { i: "peringatan", x: 4, y: 11, w: 4, h: 5 },
    { i: "tenggat",    x: 8, y: 11, w: 4, h: 5 },
    { i: "invoice",   x: 0, y: 16, w: 12, h: 5 },
    { i: "kasbon",    x: 0, y: 21, w: 12, h: 4 },
    { i: "tax",       x: 0, y: 25, w: 12, h: 3 },
  ],
  md: [
    /*
      ⚠️ INILAH BREAKPOINT YANG AKTIF DI BERANDA, bukan `lg`.

      Rail kanan (300px) menyempitkan wadah RGL jadi 992px pada layar 1600px —
      di bawah ambang `lg: 1100`. Jadi seluruh penyetelan tinggi yang ditulis di
      blok `lg` TIDAK PERNAH berlaku di halaman yang punya rail.

      Ini menghabiskan beberapa putaran: `DEFAULT_LAYOUTS.lg` benar, localStorage
      benar, profil peramban bersih sama saja, build produksi sama saja — karena
      yang dibaca memang blok yang berbeda.

      Pelajarannya: sesudah menambah rail, ambang breakpoint harus diperiksa
      ulang terhadap lebar wadah SEBENARNYA, bukan lebar layar.
    */
    /*
      `h: 3` (208px), bukan 4 — diukur ulang 2026-08-09.

      Strip KPI diramping-kan jadi enam kartu sebaris; isinya berhenti di
      ~187px sementara wadah `h: 4` memberi 282px. 95px kosong di bawah kartu
      terbaca sebagai halaman yang belum selesai dimuat.
    */
    { i: "kpi",       x: 0, y: 0,  w: 10, h: 3, isResizable: false },
    /*
      TINGGI SERAPAN DIUKUR, BUKAN DITAKSIR — dan saya salah dua kali dulu.

      Isi widget (judul + donat 110px + tiga baris angka + tautan) berhenti
      di 228px. `h: 5` (356px) menyisakan ~130px kosong; `h: 3` (208px)
      justru MENGGUNTING 20px. `h: 4` (282px) pas, dengan napas.

      Ruang kosongnya tak terbaca sebagai bug saat dilihat sekilas: tautan
      ber-`marginTop:auto` menempel ke dasar, jadi celahnya menganga di
      TENGAH, bukan di bawah. Cacat serupa pernah terjadi pada widget KPI
      di v5→v6 — dan sekali lagi yang menemukannya adalah mengukur.

      Lebar `w: 4` (~380px pada wadah 992px): cukup untuk donat + angka,
      dan menyisakan `w: 6` bagi arus kas di sampingnya. Jadi baris
      tiga-widget referensi tetap terwujud, hanya pembagiannya 4/6/4
      (serapan · arus kas · status) alih-alih 4/4/4 — wadah `md` di beranda
      992px, sementara referensi punya ~1180px karena tak memakai rail.
    */
    { i: "serapan",   x: 0, y: 4,  w: 4,  h: 4 },
    { i: "cashflow",  x: 4, y: 4,  w: 6,  h: 6 },
    /*
      `h: 7` untuk status, bukan 6. Diukur: isinya 487px sementara wadah
      `h: 6` hanya 430px — 57px TERGUNTING, dan yang hilang adalah baris
      progres proyek paling bawah. Cacat ini sudah ada SEBELUM perubahan
      hari ini (widget status memang selalu `h: 6`); ketahuan justru karena
      pengukuran dijalankan untuk menyetel widget baru di sebelahnya.
    */
    { i: "status",    x: 0, y: 7,  w: 4,  h: 7 },
    /*
      `h: 2` (148px) — diukur ulang 2026-08-09.

      Catatan lama di sini menulis `h: 3` "karena tujuh pil membungkus jadi
      dua baris". Itu benar SAAT ditulis, tetapi Pintasan kini kisi 4 kolom
      × 2 baris tetap (delapan pil), bukan `flex-wrap` — tingginya tak lagi
      bergantung panjang label. Isinya berhenti di ~115px; `h: 3` menyisakan
      93px kosong.
    */
    { i: "pintasan",  x: 0, y: 13, w: 10, h: 2 },
    /*
      Wadah `md` cuma 992px (rail memakan 300px), jadi tiga kartu sebaris
      berarti ~320px per kartu — judul "Peringatan Kritis" + lencana
      "Tinggi" sudah berdesakan di sana. Dibagi 5/5 lalu satu di bawah:
      bentuk referensi tetap terbaca tanpa memaksa isi yang tak muat.
    */
    /*
      TINGGI DIUKUR ULANG 2026-08-09 — sebelumnya semuanya `h: 5` (356px)
      tanpa memeriksa isinya:

        Peringatan Kritis  isi 241px  → 115px kosong
        Tenggat Mendatang  isi 300px  →  56px kosong
        Invoice Belum Lunas isi 317px →  39px kosong
        Kabar Lapangan     isi 356px  →   0px  (pas)

      Peringatan turun ke `h: 4` (282px); Kabar TETAP `h: 5` karena isinya
      memang penuh. Menyeragamkan tinggi empat kartu ini terlihat rapi di
      kode dan justru TIDAK rapi di layar — dua kartu bersebelahan dengan
      tinggi sama tetapi satu setengah kosong terbaca sebagai data yang
      hilang, bukan sebagai kisi yang rapi.
    */
    { i: "kabar",      x: 0, y: 16, w: 5, h: 5 },
    { i: "peringatan", x: 5, y: 16, w: 5, h: 4 },
    { i: "tenggat",    x: 0, y: 21, w: 5, h: 5 },
    { i: "invoice",    x: 5, y: 21, w: 5, h: 5 },
    { i: "kasbon",    x: 0, y: 26, w: 10, h: 4 },
    { i: "tax",       x: 0, y: 30, w: 10, h: 3 },
  ],
  sm: [
    { i: "kpi",       x: 0, y: 0,  w: 6, h: 8, isResizable: false },
    { i: "serapan",   x: 0, y: 8,  w: 6, h: 6 },
    { i: "cashflow",  x: 0, y: 14, w: 6, h: 6 },
    { i: "status",    x: 0, y: 20, w: 6, h: 5 },
    { i: "pintasan",  x: 0, y: 25, w: 6, h: 4 },
    { i: "kabar",      x: 0, y: 29, w: 6, h: 5 },
    { i: "peringatan", x: 0, y: 34, w: 6, h: 5 },
    { i: "tenggat",    x: 0, y: 39, w: 6, h: 5 },
    { i: "invoice",   x: 0, y: 44, w: 6, h: 5 },
    { i: "kasbon",    x: 0, y: 49, w: 6, h: 4 },
    { i: "tax",       x: 0, y: 53, w: 6, h: 3 },
  ],
};

const BREAKPOINTS = { lg: 1100, md: 768, sm: 480 };
const COLS = { lg: 12, md: 10, sm: 6 };
/**
 * Kunci BERVERSI, dan versinya dinaikkan saat tata letak bawaan berubah.
 *
 * Tata letak tersimpan di localStorage per-pemakai. Tanpa menaikkan
 * versi, orang yang pernah membuka dashboard akan terus memakai tata
 * letak lamanya — jadi perbaikan tinggi widget arus kas (v2 → v3, di
 * mana `h: 5` menggunting tiga metrik ringkasan) tak akan pernah sampai
 * ke mereka. Yang paling parah justru pemakai LAMA: mereka yang paling
 * sering melihat dashboard.
 *
 * Ongkosnya: penyesuaian tata letak yang dibuat sendiri ikut hilang.
 * Itu sepadan — cacat yang diperbaiki adalah isi yang tergunting, dan
 * mempertahankan tata letak yang menggunting isi bukan pilihan.
 */
/*
 * v8 → v9 (2026-08-08): `pintasan` masuk grid sebagai widget, dan posisinya
 * pindah dari ATAS KPI ke BAWAH baris tiga widget — urutan referensi.
 *
 * Bentuknya juga berubah: ubin bertumpuk 112px jadi pil mendatar 38px.
 *
 * v7 → v8 (2026-08-08): widget `serapan` DITAMBAHKAN (baris tiga-sebaris
 * referensi: serapan · arus kas · status).
 *
 * Wajib naik versi, dan alasannya kebalikan dari kasus `milestone` di v4→v5:
 * `loadLayouts()` menolak tata letak tersimpan yang KEKURANGAN kunci, jadi
 * pemakai lama sebenarnya akan otomatis jatuh ke bawaan. Tapi mengandalkan
 * itu berarti bergantung pada perilaku yang tak pernah diuji untuk kasus ini,
 * dan kalau kelak pemeriksaannya dilonggarkan, widget baru diam-diam tak
 * pernah tampil bagi pemakai lama — yaitu orang yang paling sering membuka
 * dashboard. Naikkan versinya; ongkosnya cuma tata letak buatan sendiri.
 *
 * v5 → v6 (2026-08-08): tinggi widget KPI berubah mengikuti kartu yang
 * diramping-kan (159px → ~92px, enam sebaris). Tanpa naik versi, pemakai lama
 * terkunci di tinggi lama dan kartunya mengambang di ruang kosong.
 *
 * v4 → v5 (2026-08-08, rombak dashboard).
 *
 * `milestone` DIHAPUS dari registry: isinya pindah ke rail kanan, dan widget
 * tengahnya menampilkan daftar yang sama dua kali dalam satu halaman.
 *
 * Kenapa versinya HARUS naik, bukan sekadar entrinya dibuang: `loadLayouts()`
 * hanya menolak tata letak tersimpan bila ada kunci yang HILANG — kunci
 * BERLEBIH lolos. Jadi tanpa naik versi, pemakai yang pernah membuka
 * dashboard tetap membawa slot `milestone` di localStorage-nya, dan RGL
 * memesan ruang untuk widget yang tak pernah dirender. Cacatnya sunyi: satu
 * lubang di tata letak, tanpa galat apa pun.
 *
 * Ongkosnya sama seperti v3 → v4: penyesuaian tata letak buatan pemakai
 * hilang. Tetap sepadan — lubang di tata letak lebih buruk.
 */
/*
  v11 → v12 (2026-08-09): tinggi KPI, Pintasan, dan Peringatan Kritis diukur
  ulang dan diturunkan (95px + 93px + 115px ruang kosong).

  Wajib naik versi. `loadLayouts()` memakai tata letak tersimpan apa adanya
  selama kuncinya lengkap, jadi tanpa ini pemakai lama terkunci di tinggi
  LAMA — dan merekalah yang paling sering membuka dashboard, jadi merekalah
  yang paling lama melihat ruang kosongnya.

  Ongkosnya: penyesuaian tata letak buatan sendiri ikut hilang. Sepadan.
*/
const STORAGE_KEY = "puraloka_dashboard_layout_v12";
const HIDDEN_KEY  = "puraloka_dashboard_hidden_v12";

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadLayouts(): Layouts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUTS;
    const parsed = JSON.parse(raw) as Layouts;
    const requiredKeys = Object.keys(WIDGET_DEFS);
    const lgKeys = (parsed.lg ?? []).map((l: Layout) => l.i);
    if (!requiredKeys.every(k => lgKeys.includes(k))) return DEFAULT_LAYOUTS;
    return parsed;
  } catch { return DEFAULT_LAYOUTS; }
}

function saveLayouts(layouts: Layouts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts)); } catch { /* best-effort: tata letak dashboard, bukan data. Gagal simpan = tak diingat lintas sesi, dan itu konsekuensi yang benar. */ }
}

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveHidden(hidden: Set<string>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch { /* best-effort: tata letak dashboard, bukan data. Gagal simpan = tak diingat lintas sesi, dan itu konsekuensi yang benar. */ }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardGridProps {
  widgets: Partial<Record<WidgetKey, React.ReactNode>>;
}

// ─── Drag handle ──────────────────────────────────────────────────────────────

function WidgetShell({
  title,
  children,
  hidden,
  onToggleHide,
}: {
  title: string;
  children: React.ReactNode;
  hidden: boolean;
  onToggleHide: () => void;
}) {
  const areaGulir = useRef<HTMLDivElement>(null);
  const [adaLagi, setAdaLagi] = useState(false);

  /**
   * Adakah isi yang belum terlihat di bawah?
   *
   * Toleransi 2px, bukan `> 0`: pembulatan sub-piksel pada layar retina
   * membuat `scrollHeight` kadang 0,5px lebih besar dari tinggi terlihat
   * meski sudah mentok bawah — tanpa toleransi, bayangannya tak pernah
   * hilang dan justru jadi kebohongan permanen.
   */
  const periksaGulir = useCallback(() => {
    const el = areaGulir.current;
    if (!el) return;
    const sisa = (n: Element) => n.scrollHeight - n.scrollTop - n.clientHeight;

    // Diperiksa pada `el` DAN pada keturunannya yang menggulir sendiri.
    //
    // Sebagian widget menggulir di dalam dirinya (milestone: `overflowY`
    // pada pembungkusnya sendiri; status: pada bagian "Progress Aktif"),
    // sehingga `el` tak pernah meluap dan penandanya takkan menyala kalau
    // hanya `el` yang diperiksa — persis kegagalan percobaan pertama.
    if (sisa(el) > 2) { setAdaLagi(true); return; }
    for (const anak of el.querySelectorAll("*")) {
      const g = getComputedStyle(anak).overflowY;
      if ((g === "auto" || g === "scroll") && sisa(anak) > 2) { setAdaLagi(true); return; }
    }
    setAdaLagi(false);
  }, []);

  // Widget bisa diubah ukurannya lewat drag, dan isinya datang belakangan
  // dari API — jadi "muat/tak muat" berubah SESUDAH render pertama.
  // ResizeObserver menangkap keduanya; memeriksa sekali saat mount saja
  // akan salah pada setiap widget yang datanya masih dimuat.
  useEffect(() => {
    const el = areaGulir.current;
    if (!el) return;
    periksaGulir();

    const pengamat = new ResizeObserver(periksaGulir);
    pengamat.observe(el);

    // MutationObserver, bukan hanya ResizeObserver pada anak pertama.
    //
    // Percobaan pertama mengamati `el.firstElementChild` dan TIDAK PERNAH
    // menyala. Sebabnya: isi tiap widget membungkus dirinya dengan
    // `height: "100%"`, jadi anak pertama selalu setinggi areanya — yang
    // meluap adalah CUCUNYA. Tingginya tak pernah berubah, jadi tak ada
    // yang diamati.
    //
    // Yang menandai data tiba adalah perubahan pohon DOM (kerangka memuat
    // diganti daftar sungguhan), bukan perubahan ukuran.
    const pengintai = new MutationObserver(periksaGulir);
    pengintai.observe(el, { childList: true, subtree: true, characterData: true });

    return () => { pengamat.disconnect(); pengintai.disconnect(); };
  }, [periksaGulir]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "var(--naik-1)",
        overflow: "hidden",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      {/* Drag handle bar */}
      <div
        className="drag-handle"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-subtle)",
          cursor: "grab",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <GripVertical size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
          {title}
        </span>
        <button aria-label="Sembunyikan widget"
          onClick={e => { e.stopPropagation(); onToggleHide(); }}
          title="Sembunyikan widget"
          style={{
            display: "flex", alignItems: "center",
            padding: "2px 4px", borderRadius: 6,
            border: "none", background: "none",
            cursor: "pointer", color: "var(--text-muted)",
          }}
        >
          <EyeOff size={12} />
        </button>
      </div>

      {/* Widget content.
          `tabIndex={0}` bukan hiasan: area yang bisa di-scroll TAPI tak bisa
          difokus keyboard membuat isinya tak terjangkau sama sekali bagi orang
          yang tak memakai tetikus — konten yang berada di bawah lipatan widget
          praktis tidak ada. Terdeteksi axe (`scrollable-region-focusable`).
          `role="group"` + nama dari judul widget supaya pembaca layar
          menyebutnya sebagai sesuatu, bukan "grup" kosong. */}
      {/* `role="region"`, BUKAN `"group"`: keduanya memberi nama, tapi hanya
          `region` yang diakui `jsx-a11y/no-noninteractive-tabindex` sebagai
          alasan sah untuk `tabIndex`. Dengan `group`, dua aturan saling
          bertabrakan — axe menuntut area scroll bisa difokus, eslint melarang
          tabIndex di elemen non-interaktif. `region` memenuhi keduanya, dan
          secara semantik memang lebih tepat: ini bagian halaman yang berdiri
          sendiri dan punya judul. */}
      {/* DUA ATURAN BERTABRAKAN DI SATU ELEMEN, dan ini pilihan sadar:
          · axe (`scrollable-region-focusable`) MENUNTUT area yang bisa di-scroll
            juga bisa difokus keyboard — kalau tidak, isi yang berada di bawah
            lipatan widget tak terjangkau sama sekali tanpa tetikus.
          · rule ini MELARANG `tabIndex` di elemen non-interaktif, karena
            biasanya itu memang menambah perhentian tab yang tak berguna.
          Di sini larangan itu tidak berlaku: perhentian tab-nya JUSTRU yang
          membuat kontennya terbaca. axe mencerminkan dampak ke pengguna nyata,
          jadi ia yang dimenangkan — dimatikan satu baris, bukan rule-nya. */}
      {/* ── Penanda gulir ────────────────────────────────────────────────
          Widget yang isinya melebihi tingginya memotong baris terakhir di
          TENGAH HURUF. Tanpa tanda apa pun, itu terbaca sebagai halaman
          rusak — bukan sebagai "ada lagi di bawah". Terlihat jelas di
          tangkapan layar dashboard 2026-08-07: "Tambah Ruang Pak Andi —
          Cicendo 80%" dan "Finishing & cat selesai" keduanya terpenggal.

          Bayangan ini hanya muncul saat memang ada isi tersembunyi, dan
          hilang begitu digulir sampai bawah. Penanda yang selalu tampak
          akan berbohong pada widget yang isinya sudah muat.

          `pointer-events: none` supaya ia tak pernah mencegat klik pada
          isi di bawahnya. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        <div
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          role="region"
          aria-label={title}
          ref={areaGulir}
          // `onScrollCapture`, bukan `onScroll`: event scroll TIDAK
          // menggelembung, jadi gulir di dalam widget yang punya area
          // gulirnya sendiri (milestone, progress aktif) tak akan pernah
          // sampai ke sini lewat handler biasa — dan bayangannya akan
          // tertinggal menyala setelah pemakai sampai di dasar.
          onScrollCapture={periksaGulir}
          style={{ flex: 1, overflow: "auto", minHeight: 0 }}
        >
          {children}
        </div>
        {adaLagi && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0, height: 28,
              // Ke `--surface`, bukan putih: di mode gelap putih akan
              // menyala seperti garis terang di dasar setiap widget.
              background: "linear-gradient(to bottom, transparent, var(--surface))",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Lebar kontainer ──────────────────────────────────────────────────────────

/**
 * Lebar wadah grid, DIAMATI terus — bukan diukur sekali saat pasang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN `useContainerWidth` BAWAAN react-grid-layout
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hook bawaannya mengukur wadah pada render pertama dan menyimpan angkanya.
 * `ResponsiveGridLayout` menempatkan tiap widget dengan lebar piksel MUTLAK
 * yang dihitung dari angka itu, jadi begitu wadahnya berubah sesudah render
 * pertama, seluruh widget tertinggal di lebar lama — dan tak ada satu pun
 * pesan galat, karena secara teknis tak ada yang gagal.
 *
 * Diukur di peramban pada 2026-08-08, layar 2560×1440, tata letak BAWAAN
 * (localStorage sudah dikosongkan, jadi ini bukan sisa percobaan):
 *
 *     wadah `.react-grid-layout`   2128px
 *     tiap widget (w:12 = penuh)   1280px   ← 848px menganggur
 *
 * 1280 itu lebar wadah SEBELUM `--w-luas` melebar ke 2200px. Halaman
 * memuat, hook mengukur 1280, CSS lebar baru menyusul, wadah melebar —
 * dan RGL tak pernah diberi tahu. Menggeser-ubah ukuran jendela pun tak
 * memperbaikinya: angkanya tidak pernah diukur ulang.
 *
 * Gejalanya persis keluhan founder ("kanan kirinya ada jarak yg lumayan
 * banyak"), tapi SEBABNYA berbeda dari halaman lain: di sana batas
 * `max-width` yang terlalu kecil, di sini lebar yang basi. Melebarkan token
 * CSS saja tak menyentuh dashboard sama sekali.
 *
 * `ResizeObserver` menutup keduanya: ia menyala pada perubahan ukuran apa
 * pun — CSS termuat belakangan, sidebar menciut, jendela digeser — tanpa
 * satu pun media query atau pendengar `resize` global.
 */
function useLebarKontainer(siap: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);

  // `siap` WAJIB ada di daftar kebergantungan.
  //
  // `DashboardGrid` menahan render dengan `if (!mounted) return null` sampai
  // tata letak selesai dibaca dari localStorage. Efek ini menyala lebih dulu,
  // menemukan `containerRef.current === null`, lalu berhenti — dan tanpa
  // `siap` di sini ia TAK PERNAH dijalankan lagi sesudah div-nya benar-benar
  // ada. Akibatnya `width` abadi `undefined` dan RGL memakai lebar cadangan
  // 1200px di layar selebar apa pun.
  //
  // Ini kegagalan diam-diam yang khas: tak ada galat, halaman tampil utuh,
  // hanya lebarnya salah — dan salahnya masuk akal, jadi mudah dikira sengaja.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Pembulatan ke bawah: lebar pecahan (2128.44px) membuat RGL menghitung
    // posisi widget terakhir melewati tepi wadah beberapa sub-piksel, dan
    // itu memunculkan geser mendatar yang sulit dilacak asalnya.
    const ukur = () => setWidth(Math.floor(el.getBoundingClientRect().width));

    ukur();
    const pengamat = new ResizeObserver(ukur);
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, [siap]);

  return { containerRef, width };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardGrid({ widgets }: DashboardGridProps) {
  const [mounted, setMounted] = useState(false);
  const [layouts, setLayouts] = useState<Layouts>(DEFAULT_LAYOUTS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCustomizer, setShowCustomizer] = useState(false);
  const customizerRef = useRef<HTMLDivElement>(null);
  const { containerRef, width } = useLebarKontainer(mounted);

  /*
    Wadah tujuan portal untuk tombol "Sesuaikan" — elemen di dalam hero.
    `null` berarti halaman ini tak menyediakannya, dan tombol jatuh kembali ke
    tempat lamanya di atas grid.

    Dicari lewat `useState` + efek, BUKAN `document.getElementById` langsung
    saat render: elemennya milik komponen lain, jadi pada render pertama ia
    belum tentu sudah ada di DOM. Membacanya saat render juga memecah SSR —
    `document` tak ada di server.
  */
  const [wadahKontrol, setWadahKontrol] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setLayouts(loadLayouts());
    setHidden(loadHidden());
    setMounted(true);
    setWadahKontrol(document.getElementById(ID_WADAH_KONTROL));
  }, []);

  // Close customizer on outside click
  useEffect(() => {
    if (!showCustomizer) return;
    function handler(e: MouseEvent) {
      if (customizerRef.current && !customizerRef.current.contains(e.target as Node)) {
        setShowCustomizer(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCustomizer]);

  /*
   * Tinggi widget yang TIDAK boleh diubah pemakai dipulihkan dari
   * `DEFAULT_LAYOUTS` sebelum disimpan.
   *
   * KENAPA. `kpi` bertanda `isResizable: false`, tapi RGL tetap MENULIS ulang
   * tingginya di `onLayoutChange` — dan handler ini menyimpan apa pun yang
   * ditulisnya. Akibatnya `h` bawaan kita tertimpa pada render PERTAMA, lalu
   * nilai tertimpa itu dimuat lagi di kunjungan berikutnya.
   *
   * Gejalanya menipu: `DEFAULT_LAYOUTS` benar, localStorage bahkan sempat
   * berisi nilai yang benar, tetapi yang dirender selalu tinggi lama. Ditelusuri
   * dengan mengesampingkan cache dev, build produksi, dan profil peramban bersih
   * — ketiganya sama — sampai tersisa satu-satunya jalan yang menulis: handler
   * ini sendiri.
   */
  const onLayoutChange = useCallback(
    (_: Layout[], allLayouts: Layouts) => {
      const dikunci = new Set(
        DEFAULT_LAYOUTS.lg.filter((l) => l.isResizable === false).map((l) => l.i),
      );
      const dipulihkan: Layouts = Object.fromEntries(
        Object.entries(allLayouts).map(([bp, items]) => [
          bp,
          (items as Layout[]).map((l) => {
            if (!dikunci.has(l.i)) return l;
            const bawaan = (DEFAULT_LAYOUTS[bp] ?? []).find((d) => d.i === l.i);
            return bawaan ? { ...l, h: bawaan.h } : l;
          }),
        ]),
      );
      setLayouts(dipulihkan);
      saveLayouts(dipulihkan);
    },
    []
  );

  function toggleHide(key: string) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveHidden(next);
      return next;
    });
  }

  function resetLayout() {
    setLayouts(DEFAULT_LAYOUTS);
    setHidden(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HIDDEN_KEY);
    } catch { /* noop */ }
  }

  if (!mounted) return null;

  const visibleWidgets = Object.entries(widgets).filter(
    ([key]) => !hidden.has(key)
  ) as [WidgetKey, React.ReactNode][];

  const filteredLayouts: Layouts = Object.fromEntries(
    Object.entries(layouts).map(([bp, items]) => [
      bp,
      (items as Layout[]).filter(l => !hidden.has(l.i)),
    ])
  );

  /*
   * Pemicu "Sesuaikan" + menunya, sebagai satu satuan.
   *
   * Diekstrak jadi variabel supaya bisa dirender di DUA tempat tanpa
   * digandakan: di dalam hero lewat portal (keadaan normal), atau di atas
   * grid kalau wadah hero tak ada. Menyalinnya jadi dua blok JSX berarti
   * dua tempat yang harus diubah setiap kali menunya bertambah.
   *
   * `position: relative` di pembungkus TIDAK boleh dilepas — menu
   * dropdown di dalamnya memakai `position: absolute` terhadapnya.
   */
  const pemicuSesuaikan = (
    <div style={{ position: "relative" }} ref={customizerRef}>
        <button
          onClick={() => setShowCustomizer(p => !p)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            /*
              Bentuknya MENGIKUTI pil saringan periode di sebelahnya —
              `borderRadius: 999`, latar transparan, garis tepi tipis. Sesudah
              pindah ke dalam hero, gaya lamanya (kotak putih `--surface` +
              `--border`) akan terbaca sebagai tempelan asing di atas gradasi
              navy: satu-satunya kotak putih di seluruh hero.

              `--on-merek`, bukan `--on-navy`: teks ini duduk di atas gradasi
              merek, bukan di atas pil navy. Salah pilih di antara keduanya
              LOLOS di mode terang (keduanya putih) dan baru gagal di mode
              gelap — cacat yang persis pernah terjadi pada pil periode ini,
              tercatat beberapa baris di bawah di `dashboard/page.tsx`.
            */
            padding: "4px 12px", borderRadius: 999,
            border: "1px solid color-mix(in srgb, var(--on-merek) 30%, transparent)",
            background: "transparent",
            fontSize: 11, color: "var(--on-merek)", cursor: "pointer",
            fontWeight: 500,
          }}
        >
          <LayoutGrid size={13} /> Sesuaikan
          {hidden.size > 0 && (
            <span style={{
              marginLeft: 2, padding: "0px 4px", borderRadius: 99,
              background: "var(--navy)", color: "var(--on-navy)", fontSize: 10, fontWeight: 700,
            }}>
              {hidden.size}
            </span>
          )}
        </button>

        {showCustomizer && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, boxShadow: "var(--naik-2)",
            padding: 12, zIndex: 100, minWidth: 220,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Widget
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(WIDGET_DEFS).map(([key, def]) => {
                const isHidden = hidden.has(key);
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleHide(key)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()   // Spasi jangan menggulir dashboard
                        toggleHide(key)
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                      background: isHidden ? "var(--surface-subtle)" : "transparent",
                      border: "1px solid var(--border)",
                      opacity: isHidden ? 0.6 : 1,
                      transition: "all 0.1s",
                    }}
                  >
                    <span style={{ color: isHidden ? "var(--text-muted)" : "var(--navy)" }}>
                      {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>
                      {def.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <button
                onClick={resetLayout}
                style={{
                  width: "100%", padding: "6px 0", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--surface-subtle)",
                  fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
                }}
              >
                Reset ke Default
              </button>
            </div>
          </div>
        )}
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/*
        PEMICU "SESUAIKAN" — pindah ke dalam hero.

        Founder 2026-08-09: *"tombol sesuaikan disana agak mengganggu"*.
        Diukur: baris pembungkusnya memakai tinggi penuh + `marginBottom: 10`
        semata-mata untuk satu tombol 24px, dan ia duduk persis di antara hero
        dan KPI — tempat mata jatuh pertama kali sesudah membaca sapaan.

        Halaman ini sudah pernah memutuskan hal yang sama untuk saringan
        periode (lihat `dashboard/page.tsx`: *"saringan periode DI DALAM hero,
        bukan melayang di atasnya"*). Tombol ini melanggar aturan itu, jadi
        yang diperbaiki adalah konsistensinya.

        Kenapa BUKAN topbar: "Sesuaikan" hanya berlaku di dashboard, sedangkan
        topbar hadir di 105 halaman. Kontrol khusus satu halaman yang dipasang
        di topbar akan mati di 104 halaman lain.

        TIGA percobaan MENGAMBANGKAN tombol ini gagal lebih dulu, dan ketiganya
        ketahuan dari tangkapan layar — bukan dari menghitung di kepala:

          `top:-34` kanan   menabrak tepi bawah kartu "Kesehatan portofolio"
          `top:-26` kanan   masih menempel di sudut kartu yang sama
          `top:-28` kiri    menabrak sudut kiri-bawah hero

        Kesimpulannya bukan "koordinatnya belum pas" melainkan **tak ada ruang
        mengambang yang benar-benar kosong di sini**. Setiap posisi bertetangga
        dengan sesuatu, karena hero dan kartu Kesehatan mengisi seluruh lebar
        tepat di atas grid.

        Jadi tombolnya tidak lagi mengambang: ia DIPINDAHKAN ke dalam hero
        lewat portal (`wadahKontrol`), duduk sebaris dengan saringan periode —
        satu-satunya baris kontrol yang memang sudah ada di halaman ini.
        Halaman ini pernah mengambil keputusan yang sama persis untuk saringan
        periode: *"DI DALAM hero, bukan melayang di atasnya"*.

        Portal, bukan mengangkat state ke halaman: seluruh keadaan customizer
        (menu terbuka, daftar widget tersembunyi, penyimpanan localStorage)
        hidup di komponen ini. Portal memindah TEMPAT RENDER tanpa memindah
        kepemilikan state — perubahan satu baris, bukan bedah komponen.

        Kalau wadahnya tak ada (halaman lain memakai grid ini tanpa hero),
        tombol jatuh kembali ke tempat lamanya di atas grid. Fail-safe, bukan
        hilang diam-diam.
      */}
      {wadahKontrol
        ? createPortal(pemicuSesuaikan, wadahKontrol)
        : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            {pemicuSesuaikan}
          </div>
        )}

      {/* Grid */}
      <ResponsiveGridLayout
        className="layout"
        width={width ?? 1200}
        layouts={filteredLayouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={60}
        draggableHandle=".drag-handle"
        onLayoutChange={onLayoutChange}
        margin={[14, 14]}
        containerPadding={[0, 0]}
        useCSSTransforms
        isResizable
        isDraggable
      >
        {visibleWidgets.map(([key, node]) => (
          <div key={key}>
            <WidgetShell
              title={WIDGET_DEFS[key]?.label ?? key}
              hidden={hidden.has(key)}
              onToggleHide={() => toggleHide(key)}
            >
              {node}
            </WidgetShell>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}

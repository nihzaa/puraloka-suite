"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { useRouter } from "next/navigation";
import { api, getStoredUser, makeAbortController } from "@/lib/api";
import { KartuKPI, Kosong } from "@/components/ui-dasar";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Building2, TrendingUp, FileText, BarChart2,
  AlertTriangle, CheckCircle2, Clock, CheckCheck,
  X, RefreshCw, Landmark, Target,
  ChevronRight, Coins, Wallet, ShoppingCart, HardHat, Users,
} from "lucide-react";
import { DashboardGrid, ID_WADAH_KONTROL } from "@/components/dashboard-grid";
import { Tabel } from "@/components/dasar";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIs {
  active_projects: number;
  total_contract_value: number;
  invoice_outstanding: number;
  income_this_month: number;
  kasbon_active_total: number;
  net_cash_estimate: number;
}
interface CashflowWeek { week_label: string; income: number; expense: number }
interface StatusDist   { status: string; count: number }
interface ActiveProgress {
  id: string; name: string; progress_pct: number;
  end_date: string | null; contract_value: number;
}
interface Invoice {
  id: string; invoice_number: string; amount_due: number;
  due_date: string; status: string;
  projects: { name: string; clients: { contact_person: string } | null } | null;
}
interface Kasbon {
  id: string; amount: number; kasbon_date: string; purpose: string; status: string;
  /** Peminta kasbon — `requested_by` NOT NULL, jadi selalu ada. */
  pemohon?: { id: string; name: string } | null;
  /**
   * Proyek dari kolom `project_id` langsung, bukan lewat work scope.
   *
   * Sebelumnya bernama `project?` — field yang API TIDAK PERNAH kirim,
   * jadi cadangan `?? k.project?.name` selalu `undefined` dan tak pernah
   * menolong. Cadangan yang tak pernah jalan lebih buruk daripada tak
   * ada: ia membuat kode terlihat sudah menangani kasus itu.
   */
  proyek_langsung?: { id: string; name: string } | null;
  work_scopes: {
    mandor_assignments: {
      mandor: { name: string } | null;
      projects: { name: string } | null;
    } | null;
  } | null;
}
interface Milestone {
  id: string; title: string; target_date: string;
  projects: { id: string; name: string } | null;
}
/** Jawaban `GET /api/v1/dashboard/deret` — riwayat 8 bulan per metrik (UIR-4B). */
interface JawabanDeret {
  bulan: number;
  mulai: string;
  deret: {
    proyek_aktif: number[];
    nilai_kontrak: number[];
    invoice_belum_lunas: number[];
    kas_masuk: number[];
    kasbon: number[];
  };
}

/**
 * Satu catatan progres lapangan — "Recent Project Updates" di referensi.
 *
 * `logged_at` DIPAKAI dan ditampilkan, bukan diabaikan: server kini mengirim
 * 10 catatan TERAKHIR tanpa batas 7 hari (kartunya dulu kosong permanen
 * begitu lapangan berhenti melapor seminggu). Tanpa tanggalnya, catatan
 * berumur dua bulan akan terbaca seolah baru terjadi.
 */
interface AktivitasLapangan {
  id: string;
  pct_overall: number | null;
  notes: string | null;
  logged_at: string | null;
  projects: { id: string; name: string } | null;
  reporter: { name: string } | null;
}

interface DashboardData {
  kpis: KPIs;
  today_activity: AktivitasLapangan[];
  alerts: { kasbon_pending: number; invoice_overdue: number; milestone_late: number };
  cashflow_8w: CashflowWeek[];
  status_distribution: StatusDist[];
  active_progress: ActiveProgress[];
  outstanding_invoices: Invoice[];
  pending_kasbons: Kasbon[];
  upcoming_milestones: Milestone[];
  tax_summary: { reported_count: number; pending_count: number; total_pph: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = formatRupiah;

const fmtShort = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".0", "")} M`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)} Jt`;
  if (n >= 1_000)         return `${Math.round(n / 1_000)} Rb`;
  return String(n);
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);

// ─── Design tokens ─────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";
import { namaSapaan } from "@/lib/nama-sapaan";
import { formatRupiah, formatPersen, formatTanggalPanjang, formatRelatif } from "@/lib/format";
import { HalamanIkhtisar } from "@/components/shell/halaman-ikhtisar";
import { RailFokus } from "@/components/shell/rail-fokus";
import { hitungDelta } from "@/lib/deret";
import { GambarHero } from "@/components/shell/gambar-hero";
import { RailIsi } from "@/components/shell/rail-isi";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { susunPeringatan } from "@/lib/peringatan";
import { usePasangRail } from "@/lib/rail-context";
import { RailKalender } from "@/components/shell/rail-kalender";
import { WidgetSerapan } from "@/components/shell/widget-serapan";
import { KartuKesehatan } from "@/components/shell/kartu-kesehatan";

/**
 * Pintasan beranda — tujuh tempat yang paling sering dituju DARI sini.
 *
 * Tiap `href` DIPERIKSA ke disk 2026-08-08. Pintasan yang mengirim orang ke
 * 404 lebih buruk daripada tak ada pintasan sama sekali — persis cacat yang
 * sudah tertangkap di rail (`/kontrak/klaim` dan `/lapangan/instruksi`
 * ternyata tak pernah ada).
 */
const PINTASAN: { href: string; label: string; ikon: React.ReactNode }[] = [
  { href: "/proyek",            label: "Proyek",      ikon: <Building2 size={16} /> },
  { href: "/keuangan/invoice",  label: "Invoice",     ikon: <FileText size={16} /> },
  { href: "/kas/pengeluaran",   label: "Pengeluaran", ikon: <Wallet size={16} /> },
  { href: "/mandor/kasbon",     label: "Kasbon",      ikon: <Coins size={16} /> },
  { href: "/procurement",       label: "Pengadaan",   ikon: <ShoppingCart size={16} /> },
  { href: "/lapangan",          label: "Lapangan",    ikon: <HardHat size={16} /> },
  { href: "/laporan",           label: "Laporan",     ikon: <BarChart2 size={16} /> },
  /*
    DELAPAN, bukan tujuh — dan itu bukan kebetulan.

    Founder 2026-08-09: *"bagian ini kurang simetris"*. Penyebabnya jumlah
    ganjil di kisi 4 kolom: tiga pil di baris kedua menyisakan satu sel kosong
    yang terbaca sebagai kesalahan tata letak. Ditambah satu tujuan yang
    memang sering dibuka dari beranda (bukan pengisi), kisinya jadi 4×2 penuh.

    Kalau daftar ini diubah lagi, jaga jumlahnya kelipatan 4 — atau kisinya
    akan ragged lagi.
  */
  { href: "/klien",             label: "Klien",       ikon: <Users size={16} /> },
];

const STATUS_COLOR: Record<string, string> = {
  active: C.navy, completed: C.green, on_hold: C.yellow,
  draft: C.muted, cancelled: C.red,
};
const STATUS_LABEL: Record<string, string> = {
  active: "Aktif", completed: "Selesai", on_hold: "Ditunda",
  draft: "Draft", cancelled: "Batal",
};
const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Upah tukang", uang_makan: "Uang makan",
  pembelian_alat: "Beli alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

const ttStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 6, color: "var(--text-primary)", fontSize: 12,
  boxShadow: "var(--naik-2)",
};

// ─── Primitives ────────────────────────────────────────────────────────────────

function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6,
      background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s ease-in-out infinite",
    }} />
  );
}

function SectionHeader({
  title, linkLabel, linkHref, count,
}: { title: string; linkLabel?: string; linkHref?: string; count?: number }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 3, height: 16, background: C.navy, borderRadius: 0, flexShrink: 0 }} />
        <h2 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
        {count !== undefined && count > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, background: C.navy, color: C.onNavy, borderRadius: 99, padding: "0px 6px" }}>{count}</span>
        )}
      </div>
      {linkHref && linkLabel && (
        <button
          onClick={() => router.push(linkHref)}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.navy, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
        >
          {linkLabel} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Batang progres.
 *
 * Isian bergradasi PEKAT→TERANG searah pertumbuhan (R-012): mata mengikuti
 * perjalanannya, bukan sekadar membaca panjangnya. Arahnya sama dengan donat
 * dan grafik lain, jadi pemakai belajar membacanya sekali.
 */
function ProgressBar({ pct, color = "var(--grad-aksen)" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "var(--surface-hover)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: "width 0.5s cubic-bezier(0.16,1,0.3,1)" }} />
    </div>
  );
}

// ─── Period filter ─────────────────────────────────────────────────────────────

type Period = "last_30_days" | "last_3_months" | "last_6_months" | "this_year" | "all_time";
const PERIODS: { label: string; value: Period }[] = [
  { label: "30 Hari",    value: "last_30_days"  },
  { label: "3 Bulan",    value: "last_3_months" },
  { label: "6 Bulan",    value: "last_6_months" },
  { label: "Tahun Ini",  value: "this_year"     },
  { label: "Semua",      value: "all_time"      },
];
const PERIOD_LABEL: Record<Period, string> = {
  last_30_days: "30 hari terakhir", last_3_months: "3 bulan terakhir",
  last_6_months: "6 bulan terakhir", this_year: "tahun ini", all_time: "semua waktu",
};

// ─── Root: hydration guard ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <DashboardContent />;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter();
  const user = getStoredUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("last_3_months");
  const [kasbonBusy, setKasbonBusy] = useState<string | null>(null);
  const [deret, setDeret] = useState<JawabanDeret | null>(null);

  useEffect(() => { fetchData(period); }, [period]);

  /*
   * Deret DIPISAH dari muatan utama, dan itu disengaja.
   *
   * Sparkline adalah pelengkap: kalau `/deret` gagal, kartu KPI harus tetap
   * tampil dengan angkanya — hanya tanpa garis. Menggabungkannya ke
   * `fetchData` membuat satu kegagalan kecil menjatuhkan SELURUH dashboard.
   *
   * Ia juga tak bergantung `period`: deretnya selalu 8 bulan terakhir, karena
   * yang ditanyakan sparkline adalah "arahnya ke mana", bukan "berapa pada
   * rentang yang sedang dipilih".
   */
  useEffect(() => {
    const ac = makeAbortController();
    api.get<JawabanDeret>("/api/v1/dashboard/deret", { signal: ac.signal })
      .then((r) => setDeret(r.data))
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        // Sengaja tidak menampilkan galat: kartu tanpa sparkline sudah
        // menyampaikan keadaannya sendiri, dan pesan merah untuk hiasan yang
        // hilang justru mengalihkan perhatian dari angka yang penting.
        setDeret(null);
      });
    return () => ac.abort();
  }, []);

  async function fetchData(p: Period) {
    setLoading(true); setError("");
    try {
      const { data: res } = await api.get<DashboardData>(`/api/v1/dashboard?period=${p}`);
      setData(res);
    } catch {
      setError("Gagal memuat data. Pastikan API server berjalan.");
    } finally {
      setLoading(false);
    }
  }

  async function handleKasbon(id: string, status: "approved" | "rejected") {
    setKasbonBusy(id);
    try {
      await api.patch(`/api/v1/kasbons/${id}/status`, { status });
      await fetchData(period);
    } finally { setKasbonBusy(null); }
  }

  const alerts = data?.alerts;
  const totalAlerts = alerts ? alerts.kasbon_pending + alerts.invoice_overdue + alerts.milestone_late : 0;

  // ── Widget nodes ─────────────────────────────────────────────────────────────

  // ── KPI — arah visual 2026 (R-012) ────────────────────────────────────────
  //
  // Empat kartu, dan HANYA SATU bergradasi. Yang disorot dipilih dinamis:
  // kalau ada invoice lewat jatuh tempo, itulah yang paling menentukan hari
  // ini; kalau tidak, kas bersih yang menonjol.
  //
  // Kalau keempatnya bergradasi, tak ada yang menonjol — dan halaman kembali
  // monoton dengan warna yang berbeda. Itu justru yang sedang diperbaiki.
  const adaOverdue = (alerts?.invoice_overdue ?? 0) > 0;
  const kasBersih = data?.kpis.net_cash_estimate ?? 0;

  // Tren 8 minggu dari data yang SUDAH ADA — tak ada endpoint baru.
  const sparkBersih = (data?.cashflow_8w ?? []).map((w) => w.income - w.expense);

  /*
   * Deret BULANAN per metrik (UIR-4B) — `GET /api/v1/dashboard/deret`.
   *
   * Berbeda dari `sparkBersih` di atas, yang berasal dari `cashflow_8w` —
   * arus kas mingguan. Itu tren yang BENAR untuk kartu kas, tetapi salah
   * untuk "Proyek aktif" dan "Nilai kontrak": keduanya tak punya hubungan
   * dengan arus kas mingguan sama sekali.
   *
   * `delta` sengaja dihitung dari deret yang SAMA dengan sparkline-nya. Kalau
   * berbeda sumber, garis bisa menanjak sementara deltanya merah — dan tak
   * ada pemakai yang bisa menebak mana yang benar.
   */
  const d = deret?.deret;
  /** Persen delta, atau `null` bila tak bisa dihitung jujur. Diuji di `lib/deret.test.ts`. */
  const deltaDari = (n: number[] | undefined) => hitungDelta(n ?? [])?.persen ?? null;

  /*
   * Rata-rata progres fisik — DIHITUNG di sini dari `active_progress`, bukan
   * diminta ke server.
   *
   * Ini rata-rata SEDERHANA, bukan tertimbang nilai kontrak. Disengaja: yang
   * ditanyakan kartu ini "seberapa jauh pekerjaan berjalan", bukan "berapa
   * persen nilai proyek yang sudah jadi" — dan menimbangnya dengan nilai
   * kontrak membuat satu proyek besar menenggelamkan lima proyek kecil yang
   * mandek. Untuk pertanyaan itu sudah ada kartu Serapan Anggaran.
   */
  const proyekBerjalan = data?.active_progress ?? [];
  const rataProgres = proyekBerjalan.length
    ? proyekBerjalan.reduce((s, p) => s + (Number(p.progress_pct) || 0), 0) / proyekBerjalan.length
    : 0;

  const kpiWidget = (
    <div className="kpi-strip" style={{
      padding: "var(--pad-kartu)",
      display: "grid", gap: "var(--gap-grid)",
      /*
        Enam kolom DIPAKSA, bukan `auto-fit`.

        `auto-fit minmax(180px, …)` menghitung sendiri berapa kolom yang muat,
        dan di konten 992px (rail memakan 300px) ia memilih LIMA — kartu
        keenam turun ke baris kedua, dan dua baris itulah yang membuat
        halaman terasa longgar dan tak seperti referensi.

        Layar sempit diurus media query `.kpi-strip` di globals.css, bukan
        `auto-fit` — supaya titik pembungkusannya diputuskan, bukan ditebak.
      */
      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      /*
        `alignItems: start` — TANPA ini kartu diregangkan setinggi wadahnya.
        Diukur: kartu jadi 152px padahal isinya cuma ~100px, dan sisanya ruang
        kosong di dalam kartu. `height: 100%` dibuang karena justru itu yang
        menyuruh strip mengisi tinggi widget.
      */
      /*
        `alignItems: stretch` (bawaan) DIPERTAHANKAN supaya keenam kartu
        SAMA TINGGI — diukur, isinya bervariasi 105-152px karena jumlah baris
        keterangan berbeda, dan tepi bawah yang bergerigi terbaca sebagai
        tak dirawat.

        Yang dibuang cuma `height: 100%` pada wadahnya: itu yang dulu
        menyuruh strip mengisi seluruh tinggi widget, bukan setinggi isinya.
      */
      alignContent: "start",
    }}>
      {/*
        `spark` & `delta` per METRIK (UIR-4B) — dari `/api/v1/dashboard/deret`.

        `naikBagus` WAJIB diisi sadar, bukan dibiarkan default: invoice belum
        lunas yang NAIK bukan kabar baik, dan menghijaukannya memberi rasa aman
        yang salah pada angka yang justru memburuk (brief §3.4).
      */}
      <KartuKPI
        label="Proyek aktif"
        nilai={loading ? "—" : String(data?.kpis.active_projects ?? 0)}
        nilaiAngka={loading ? undefined : data?.kpis.active_projects ?? 0}
        keterangan="sedang berjalan"
        ikon={<Building2 size={15} />}
        spark={d?.proyek_aktif}
        delta={deltaDari(d?.proyek_aktif)}
        naikBagus
        onClick={() => router.push("/proyek")}
      />
      <KartuKPI
        label="Nilai kontrak"
        nilai={loading ? "—" : `Rp ${fmtShort(data?.kpis.total_contract_value ?? 0)}`}
        keterangan={PERIOD_LABEL[period]}
        ikon={<TrendingUp size={15} />}
        spark={d?.nilai_kontrak}
        delta={deltaDari(d?.nilai_kontrak)}
        naikBagus
        onClick={() => router.push("/proyek")}
      />
      <KartuKPI
        label="Invoice belum lunas"
        nilai={loading ? "—" : `Rp ${fmtShort(data?.kpis.invoice_outstanding ?? 0)}`}
        keterangan={adaOverdue
          ? `${alerts!.invoice_overdue} lewat jatuh tempo`
          : "semua masih dalam tenggat"}
        ikon={<FileText size={15} />}
        spark={d?.invoice_belum_lunas}
        delta={deltaDari(d?.invoice_belum_lunas)}
        // Piutang yang MENUMPUK itu buruk — turun berarti tertagih.
        naikBagus={false}
        sorot={adaOverdue}
        onClick={() => router.push("/keuangan")}
      />
      <KartuKPI
        label="Estimasi kas bersih"
        nilai={loading ? "—" : `Rp ${fmtShort(Math.abs(kasBersih))}`}
        keterangan={kasBersih >= 0 ? "surplus" : "defisit"}
        ikon={<BarChart2 size={15} />}
        // Kas bersih memang paling tepat dibaca dari arus kas MINGGUAN, bukan
        // deret bulanan — jadi sumber lamanya dipertahankan dengan sengaja.
        spark={sparkBersih.length > 1 ? sparkBersih : undefined}
        delta={deltaDari(d?.kas_masuk)}
        naikBagus
        // Disorot hanya bila TAK ada yang lebih mendesak — satu sorot per layar.
        sorot={!adaOverdue}
        onClick={() => router.push("/kas")}
      />
      {/*
        KPI ke-5 & ke-6 (UIR-5). Referensi memakai 6 kartu; kita sempat 4.
        Keduanya dari data yang SUDAH dimuat — nol permintaan tambahan.
      */}
      <KartuKPI
        label="Kasbon beredar"
        nilai={loading ? "—" : `Rp ${fmtShort(data?.kpis.kasbon_active_total ?? 0)}`}
        keterangan={(alerts?.kasbon_pending ?? 0) > 0
          ? `${alerts!.kasbon_pending} menunggu persetujuan`
          : "tak ada yang menunggu"}
        ikon={<Coins size={15} />}
        spark={d?.kasbon}
        delta={deltaDari(d?.kasbon)}
        // Kasbon yang MENUMPUK itu buruk — uang perusahaan di tangan mandor.
        naikBagus={false}
        onClick={() => router.push("/mandor/kasbon")}
      />
      <KartuKPI
        label="Rata-rata progres fisik"
        nilai={loading ? "—" : formatPersen(rataProgres, { sudahPersen: true, desimal: 0 })}
        nilaiAngka={loading ? undefined : rataProgres}
        keterangan={`dari ${data?.active_progress.length ?? 0} proyek berjalan`}
        ikon={<Target size={15} />}
        naikBagus
        onClick={() => router.push("/proyek")}
      />
    </div>
  );

  const cashflowWidget = (
    <div style={{ padding: "20px 20px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* `SectionHeader` mengatur jaraknya sendiri lewat `space-between`,
          tapi di sini ia jadi anak flex yang menyusut ke lebar isinya —
          sehingga "Arus Kas" dan "Lihat detail" menempel tanpa spasi.
          `flex: 1` mengembalikan ruang yang dibutuhkannya. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionHeader title="Arus Kas" linkLabel="Lihat detail" linkHref="/kas" />
        </div>
        <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{PERIOD_LABEL[period]}</span>
      </div>
      <div style={{ display: "flex", gap: "var(--gap-grid)", marginBottom: 12 }}>
        <LegendDot color={C.navy} label="Pemasukan" />
        <LegendDot color={C.red}  label="Pengeluaran" />
      </div>
      {loading ? <Skeleton h={200} /> : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data?.cashflow_8w ?? []} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
            <defs>
              {/* ── Gradasi area (R-012) ────────────────────────────────
                  Sebelumnya opacity 0,12 → 0: nyaris tak terlihat, jadi
                  garisnya melayang tanpa bobot. Referensi memakai isian
                  yang jelas pekat di puncak lalu memudar — itu yang membuat
                  "berapa banyak" terbaca dari LUASNYA, bukan hanya dari
                  ketinggian garisnya.

                  Tetap memudar ke 0 di dasar supaya garis kisi di belakang
                  tak tertutup. */}
              <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="var(--aksen)" stopOpacity={0.42} />
                <stop offset="55%" stopColor="var(--aksen)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--aksen)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor={C.red} stopOpacity={0.26} />
                <stop offset="60%" stopColor={C.red} stopOpacity={0.07} />
                <stop offset="100%" stopColor={C.red} stopOpacity={0} />
              </linearGradient>
              {/* Garis pemasukan ikut bergradasi mendatar — pekat di kiri
                  (masa lalu) ke terang di kanan (terkini), searah dengan
                  cara orang membaca waktu. */}
              <linearGradient id="garis-masuk" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="var(--aksen-pekat)" />
                <stop offset="100%" stopColor="var(--aksen-terang)" />
              </linearGradient>
            </defs>
            <XAxis dataKey="week_label" stroke="transparent" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis stroke="transparent" tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickFormatter={v => fmtShort(v)} width={44} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={ttStyle} formatter={((v: number, name: string) => [fmt(v), name === "income" ? "Pemasukan" : "Pengeluaran"]) as never} />
            <Area type="monotone" dataKey="income"  stroke="url(#garis-masuk)" strokeWidth={2.5} fill="url(#ig)" dot={false} />
            <Area type="monotone" dataKey="expense" stroke={C.red}  strokeWidth={2} fill="url(#eg)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      {data && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <MiniMetric label="Pemasukan" value={`Rp ${fmtShort(data.kpis.income_this_month)}`} color={C.navy} />
          <MiniMetric label="Pengeluaran est." value={`Rp ${fmtShort(data.kpis.kasbon_active_total)}`} color={C.red} />
          <MiniMetric
            label="Selisih"
            value={`${data.kpis.net_cash_estimate >= 0 ? "+" : "−"}Rp ${fmtShort(Math.abs(data.kpis.net_cash_estimate))}`}
            color={data.kpis.net_cash_estimate >= 0 ? C.green : C.red}
          />
        </div>
      )}
    </div>
  );

  const statusWidget = (
    <div style={{ padding: "var(--pad-kartu-lega)", height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <SectionHeader title="Status Proyek" />
        {loading ? <Skeleton h={120} /> : (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gap-grid)" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <PieChart width={110} height={110}>
                {/* ── Gradasi HANYA pada irisan "aktif" (R-012) ───────────
                    Pie ini menampilkan STATUS, dan status memang harus
                    berbeda warna — menggradasikan semuanya justru menghapus
                    maknanya: hijau-selesai jadi tak terbedakan dari
                    kuning-ditunda.

                    Yang bergradasi hanya irisan yang paling menentukan
                    (proyek AKTIF), persis seperti satu batang tersorot di
                    grafik batang. Itu yang membuatnya menonjol tanpa
                    merusak kode warna status. */}
                <defs>
                  <linearGradient id="pie-aktif" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%"   stopColor="var(--aksen-pekat)" />
                    <stop offset="60%"  stopColor="var(--aksen)" />
                    <stop offset="100%" stopColor="var(--aksen-terang)" />
                  </linearGradient>
                </defs>
                <Pie data={data?.status_distribution ?? []} dataKey="count" cx={55} cy={55} innerRadius={34} outerRadius={52} paddingAngle={3} strokeWidth={0}>
                  {(data?.status_distribution ?? []).map((e, i) => (
                    <Cell
                      key={i}
                      fill={e.status === "active"
                        ? "url(#pie-aktif)"
                        : STATUS_COLOR[e.status] ?? C.muted}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={ttStyle} formatter={((v: number) => [v, ""]) as never} />
              </PieChart>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>
                  {(data?.status_distribution ?? []).reduce((s, e) => s + e.count, 0)}
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>Proyek</div>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {(data?.status_distribution ?? []).map(e => (
                <div key={e.status} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[e.status] ?? C.muted, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: C.mid, flex: 1 }}>{STATUS_LABEL[e.status] ?? e.status}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{e.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* `minHeight: 0` + `overflowY: auto` — 2026-08-07.
          Tanpa `minHeight: 0`, anak flex menolak menyusut di bawah tinggi
          isinya, jadi daftar proyek memanjang melewati dasar widget dan
          proyek terakhir terpotong DI TENGAH HURUF. Terlihat jelas di
          tangkapan layar: "Tambah Ruang Pak Andi — Cicendo 80%".

          Itu bukan cuma jelek — ia berbohong. Baris terpenggal terbaca
          sebagai halaman rusak, bukan sebagai "ada proyek lain di bawah",
          jadi orang berhenti menggulir dan mengira daftarnya sampai situ.
          Dengan keduanya, sisanya bisa dicapai dan `WidgetShell` memberi
          bayangan penanda. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionHeader title="Progress Aktif" linkLabel="Semua" linkHref="/proyek" />
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map(i => <Skeleton key={i} h={36} />)}
          </div>
        ) : !data?.active_progress.length ? (
          // "Tidak ada proyek aktif." saja ambigu — bisa berarti belum
          // pernah ada proyek, atau semuanya sudah selesai. Dua keadaan
          // itu menuntut tindakan yang berlawanan, jadi sebabnya disebut.
          <Kosong
            judul="Tidak ada proyek aktif"
            sebab="Yang dihitung hanya proyek berstatus aktif. Proyek selesai dan ditunda tidak muncul di sini."
            aksi={
              <Link href="/proyek" style={{
                fontSize: 12, fontWeight: 600, color: C.navy, textDecoration: "none",
              }}>Lihat semua proyek →</Link>
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.active_progress.slice(0, 5).map(p => {
              const days = p.end_date ? daysUntil(p.end_date) : null;
              const urgent = days !== null && days >= 0 && days <= 7;
              const overdue = days !== null && days < 0;
              // `<Link>`, bukan `<div onClick>`: bisa difokus & ditekan Enter,
              // DAN bisa dibuka di tab baru / disalin tautannya — tiga hal yang
              // hilang sekaligus kalau navigasi ditulis sebagai klik.
              return (
                <Link
                  key={p.id}
                  href={`/proyek/${p.id}`}
                  style={{ cursor: "pointer", display: "block", color: "inherit", textDecoration: "none" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, flexShrink: 0 }}>{p.progress_pct}%</span>
                  </div>
                  <ProgressBar pct={p.progress_pct} />
                  {(urgent || overdue) && (
                    <div style={{ fontSize: 10, color: overdue ? C.red : C.yellow, marginTop: 3, fontWeight: 500 }}>
                      {overdue ? `${Math.abs(days!)}h terlambat` : `selesai ${days}h lagi`}
                    </div>
                  )}
                </Link>
              );
            })}
            {(data.active_progress.length > 5) && (
              <button onClick={() => router.push("/proyek")} style={{ fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                +{data.active_progress.length - 5} proyek lainnya →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const invoiceWidget = (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 0" }}>
        <SectionHeader title="Invoice Belum Lunas" linkLabel="Ke Keuangan" linkHref="/keuangan" count={data?.outstanding_invoices.length} />
      </div>
      {loading ? <div style={{ padding: "0 20px 20px" }}><Skeleton h={140} /></div> :
       !data?.outstanding_invoices.length ? (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <CheckCircle2 size={20} style={{ color: "var(--border)", marginBottom: 6 }} />
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Semua invoice sudah lunas.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", flex: 1 }}>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). `<th scope="row">`
              pada nomor invoice sekarang dijamin komponen, bukan diingat
              per-halaman — alasannya tetap sama: tanpa itu pembaca layar
              membacakan sisa tagihan tanpa menyebut invoice mana.

              Pembungkus luar `overflowX: auto` SENGAJA dipertahankan meski
              `Tabel` punya pembungkusnya sendiri: div itu juga memuat tombol
              "+N invoice lainnya" di bawah tabel dan memegang `flex: 1` yang
              membuat widget mengisi tingginya. Menghapusnya merusak tata
              letak widget, bukan sekadar menghilangkan satu overflow.

              Garis kiri tebal penanda telat/mendesak tak bisa lewat
              `tandaiBaris` (itu hanya latar), jadi dipindah ke dalam sel
              nomor invoice sebagai batas kiri — penandanya tetap di tepi
              kiri baris dan tetap terbaca. */}
          <Tabel<Invoice>
            caption="Invoice yang menunggu pembayaran: nomor, proyek dan klien, sisa tagihan, dan jatuh tempo."
            data={data.outstanding_invoices.slice(0, 5)}
            kunciBaris={inv => inv.id}
            tandaiBaris={inv => {
              const days = daysUntil(inv.due_date);
              return days < 0 ? C.redBg : days <= 3 ? C.yellowBg : undefined;
            }}
            kolom={[
              {
                kunci: "invoice", judul: "Invoice", kepalaBaris: true,
                render: inv => {
                  const days = daysUntil(inv.due_date);
                  const overdue = days < 0, urgent = days >= 0 && days <= 3;
                  return (
                    <span style={{
                      display: "inline-block",
                      borderLeft: overdue ? `3px solid ${C.red}` : urgent ? `3px solid ${C.yellow}` : "3px solid transparent",
                      paddingLeft: 8,
                      color: C.navy, fontSize: 11, fontWeight: 600,
                    }}>{inv.invoice_number}</span>
                  );
                },
              },
              {
                kunci: "proyek", judul: "Proyek · Klien",
                render: inv => (
                  <>
                    <div style={{ fontWeight: 500 }}>{inv.projects?.name ?? "—"}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{inv.projects?.clients?.contact_person ?? "—"}</div>
                  </>
                ),
              },
              {
                kunci: "sisa", judul: "Sisa", rata: "kanan",
                render: inv => <span style={{ fontWeight: 600 }}>{`Rp ${fmtShort(inv.amount_due)}`}</span>,
              },
              {
                kunci: "tempo", judul: "Jatuh Tempo", rata: "kanan",
                render: inv => {
                  const days = daysUntil(inv.due_date);
                  const overdue = days < 0, urgent = days >= 0 && days <= 3;
                  return (
                    <span style={{
                      fontSize: 11,
                      color: overdue ? C.red : urgent ? C.yellow : C.muted,
                      fontWeight: overdue || urgent ? 600 : 400,
                    }}>
                      {overdue ? `${Math.abs(days)}h lalu` : days === 0 ? "Hari ini" : fmtDate(inv.due_date)}
                    </span>
                  );
                },
              },
            ]}
          />
          {data.outstanding_invoices.length > 5 && (
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)" }}>
              <button onClick={() => router.push("/keuangan")} style={{ fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                +{data.outstanding_invoices.length - 5} invoice lainnya →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  /*
   * `milestoneWidget` DIHAPUS 2026-08-08 (UIR-4).
   *
   * Isinya pindah ke rail kanan (`KartuRail` "Milestone mendatang"). Diperiksa
   * di layar: dengan rail terisi, widget ini menampilkan DAFTAR YANG SAMA dua
   * kali dalam satu halaman — duplikasi yang tak terlihat dari kode dan baru
   * muncul begitu rail dipasang.
   *
   * Yang dipertahankan versi rail: daftar vertikal pendek memang bentuk yang
   * pas untuk kolom 300px, dan lebar tengah dibebaskan untuk grafik & tabel.
   */

  const kasbonWidget = (loading || (data?.pending_kasbons.length ?? 0) > 0) ? (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 0" }}>
        <SectionHeader title="Kasbon Menunggu Persetujuan" linkLabel="Ke Mandor" linkHref="/mandor" count={data?.pending_kasbons.length} />
      </div>
      {loading ? <div style={{ padding: "0 20px 20px" }}><Skeleton h={100} /></div> : (
        <div style={{ overflowX: "auto", flex: 1 }}>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Enam kolom di dalam
              widget sempit — pembungkus overflow-x yang dijamin komponen
              justru paling terasa di sini. Pembungkus luar tetap ada karena
              memegang `flex: 1` dan tombol "+N kasbon lainnya".

              Mandor jadi kepala baris: yang disetujui di sini adalah uang
              untuk SESEORANG, dan tombol Setuju/Tolak tak boleh dibacakan
              tanpa menyebut siapa. */}
          <Tabel<Kasbon>
            caption="Kasbon menunggu persetujuan: mandor, proyek, tujuan, jumlah, tanggal pengajuan, dan aksi."
            data={data!.pending_kasbons.slice(0, 5)}
            kunciBaris={k => k.id}
            kolom={[
              {
                kunci: "mandor", judul: "Mandor", kepalaBaris: true,
                // Kasbon tanpa work scope memutus seluruh rantai
                // `work_scopes → mandor_assignments`, jadi mandor DAN proyek
                // sama-sama kosong — dan tombol "Setuju" tetap muncul untuk
                // pengeluaran yang tak diketahui siapa peminta dan untuk apa.
                //
                // Cadangannya dari kolom langsung di `kasbons`: `requested_by`
                // NOT NULL di skema, `project_id` biasanya terisi. Pemohon
                // ditandai supaya tak tertukar dengan mandor penerima —
                // keduanya bisa berbeda orang.
                render: k => (
                  <span style={{ fontWeight: 500 }}>
                    {k.work_scopes?.mandor_assignments?.mandor?.name ??
                      (k.pemohon?.name ? `${k.pemohon.name} (pemohon)` : "—")}
                  </span>
                ),
              },
              {
                kunci: "proyek", judul: "Proyek",
                render: k => (
                  <span style={{ color: C.mid }}>
                    {k.work_scopes?.mandor_assignments?.projects?.name ??
                      k.proyek_langsung?.name ?? "—"}
                  </span>
                ),
              },
              {
                kunci: "tujuan", judul: "Tujuan",
                render: k => <span style={{ color: C.mid }}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</span>,
              },
              {
                kunci: "jumlah", judul: "Jumlah", rata: "kanan",
                render: k => <span style={{ color: C.yellow, fontWeight: 700 }}>{`Rp ${fmtShort(k.amount)}`}</span>,
              },
              {
                kunci: "tgl", judul: "Tgl Ajuan", rata: "kanan",
                render: k => <span style={{ color: C.muted }}>{fmtDate(k.kasbon_date)}</span>,
              },
              {
                kunci: "aksi", judul: "Aksi", rata: "kanan",
                render: k => (
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <ActionBtn
                      disabled={kasbonBusy === k.id}
                      bg="var(--success-bg)" color="var(--success)" border="var(--success-border)"
                      onClick={() => handleKasbon(k.id, "approved")}
                    >
                      <CheckCheck size={11} /> Setuju
                    </ActionBtn>
                    <ActionBtn
                      disabled={kasbonBusy === k.id}
                      bg="var(--danger-bg)" color="var(--danger)" border="var(--danger-border)"
                      onClick={() => handleKasbon(k.id, "rejected")}
                    >
                      <X size={11} /> Tolak
                    </ActionBtn>
                  </div>
                ),
              },
            ]}
          />
          {data!.pending_kasbons.length > 5 && (
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)" }}>
              <button onClick={() => router.push("/mandor")} style={{ fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                +{data!.pending_kasbons.length - 5} kasbon lainnya →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  /*
    ── KABAR LAPANGAN — "Recent Project Updates" referensi ────────────────────

    Bagian terakhir referensi yang belum ada di sini. Sumbernya
    `today_activity` (catatan progres lapangan), yang SUDAH dikirim endpoint
    dashboard — nol permintaan baru.

    Tanggalnya ditampilkan dan tidak disembunyikan. Server mengirim 10 catatan
    TERAKHIR tanpa batas 7 hari, jadi isinya bisa berumur berminggu-minggu; itu
    fakta yang berguna ("lapangan sudah lama tak melapor"), bukan sesuatu yang
    perlu ditutupi dengan menghilangkan kartunya.
  */
  const kabarWidget = (
    <div style={{ padding: "var(--pad-kartu-lega)" }}>
      <SectionHeader title="Kabar Lapangan" />
      {loading ? (
        <Skeleton h={140} />
      ) : (data?.today_activity?.length ?? 0) === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: C.mid, lineHeight: 1.5 }}>
          Belum ada catatan progres dari lapangan.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {(data?.today_activity ?? []).slice(0, 4).map((a, i) => (
            <div
              key={a.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 0",
                borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
              }}
            >
              <span aria-hidden="true" style={{
                display: "grid", placeItems: "center", flexShrink: 0,
                width: 26, height: 26, borderRadius: "var(--rad-kecil)",
                background: "var(--navy-light)", color: "var(--navy)",
              }}>
                <HardHat size={13} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: C.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {a.projects?.name ?? "Proyek tak dikenal"}
                </div>
                {/*
                  PELAPOR DIPISAH dari catatan, bukan disambung dengan " · ".

                  Diukur 2026-08-09: versi lama menyambung keduanya dalam satu
                  baris ber-`nowrap` + `ellipsis`, dan karena `notes` lapangan
                  panjang ("Progress terkini: finishing 50%. Keramik 15%, cat
                  belum dimulai, san…"), nama pelapor SELALU terpotong lebih
                  dulu — tak pernah sekali pun terbaca.

                  Alat ukur mencatatnya sebagai teks yang berakhir 108px di
                  luar tepi kartu. Yang salah bukan lebarnya melainkan
                  menggabungkan dua hal berbeda ke dalam satu ruang sempit:
                  catatan boleh dipotong (isinya masih bisa dibuka di halaman
                  progres), nama pelapor tidak — ia justru penanda siapa yang
                  bisa ditanya.
                */}
                <div style={{
                  fontSize: 11, color: C.mid, marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {a.notes?.trim() || `Progres ${Number(a.pct_overall ?? 0).toFixed(1)}%`}
                </div>
                {a.reporter?.name && (
                  <div style={{
                    fontSize: 11, color: C.muted, marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {a.reporter.name}
                  </div>
                )}
              </div>
              <span style={{
                fontSize: 11, color: C.muted, flexShrink: 0, whiteSpace: "nowrap",
              }}>
                {formatRelatif(a.logged_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /*
    ── PERINGATAN KRITIS — "Critical Issue Alerts" referensi ──────────────────

    Menggantikan tiga spanduk yang dulu menghabiskan ~150px di atas KPI.
    Bentuknya mengikuti referensi: satu kartu, daftar baris, tiap baris punya
    tingkat kepentingan di kanan.

    Isinya sama persis dengan spanduk sebelumnya — tak ada informasi yang
    hilang, hanya wadahnya yang berubah dari tiga blok berwarna jadi satu
    daftar yang bisa tumbuh.

    ── Kenapa "Tinggi/Sedang", bukan warna saja

    WCAG 1.4.1: warna tak boleh jadi satu-satunya pembawa makna. Aturan yang
    sama sudah dipakai halaman aset dan lapangan, dan alasannya nyata di sini —
    beranda dibuka di HP di bawah sinar matahari, tempat merah dan kuning
    praktis sama.
  */
  /*
    Daftarnya disusun `lib/peringatan.ts`, BUKAN di sini.

    Founder 2026-08-09 minta peringatan tetap ada di tengah *"tapi tetep bisa
    langsung ke notice juga"* — artinya ia tampil di dua tempat. Dua tempat
    yang menghitung sendiri-sendiri pasti menyimpang cepat atau lambat, dan
    saat menyimpang tak ada yang tahu mana yang benar. Aturannya (termasuk
    URUTAN mendesak) hidup di satu fungsi ber-test.
  */
  const peringatan = susunPeringatan(alerts);

  const peringatanWidget = (
    /*
      `id` DIPAKAI: kartu ringkas di rail menaut ke `#peringatan`. Kalau id ini
      dihapus, tautan itu diam-diam jadi tak berfungsi — tak ada 404, cuma klik
      yang tak melakukan apa-apa. `scrollMarginTop` supaya judulnya tidak
      tersembunyi di balik topbar 56px saat dilompati.
    */
    <div id="peringatan" style={{ padding: "var(--pad-kartu-lega)", scrollMarginTop: 72 }}>
      <SectionHeader title="Peringatan Kritis" />
      {loading ? (
        <Skeleton h={140} />
      ) : peringatan.length === 0 ? (
        /*
          Nol adalah KABAR BAIK, dan harus terlihat begitu. Kartu yang
          menghilang saat kosong membuat orang bertanya apakah ia rusak —
          aturan yang sama dipakai `SidebarFokus` dan `RailFokus`.
        */
        <p style={{ margin: 0, fontSize: 13, color: C.mid, lineHeight: 1.5 }}>
          Tak ada yang mendesak saat ini.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {peringatan.map((p, i) => (
            <Link
              key={p.id}
              href={p.href}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 0", textDecoration: "none",
                borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
              }}
            >
              <span aria-hidden="true" style={{
                flexShrink: 0, marginTop: 1,
                color: p.tingkat === "tinggi" ? "var(--danger)" : "var(--warning)",
              }}>
                <AlertTriangle size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: "block", fontSize: 13, fontWeight: 600, color: C.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.judul}
                </span>
                <span style={{
                  display: "block", fontSize: 11, color: C.mid, marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.sub}
                </span>
              </span>
              {/* Teks, bukan cuma warna — WCAG 1.4.1. */}
              <span style={{
                flexShrink: 0, fontSize: 10, fontWeight: 700,
                padding: "2px 7px", borderRadius: "var(--rad-pil)",
                background: p.tingkat === "tinggi" ? C.redBg : C.yellowBg,
                color: p.tingkat === "tinggi" ? "var(--danger)" : "var(--warning)",
              }}>
                {p.tingkat === "tinggi" ? "Tinggi" : "Sedang"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  /*
    ── TENGGAT MENDATANG — "Upcoming Deadlines" referensi ─────────────────────

    Kartu ketiga di baris bawah. Ia MENGULANG daftar yang ada di rail, dan itu
    disengaja dengan syarat yang jelas: rail HILANG di bawah 1280px
    (`.rail-shell`, globals.css), jadi di laptop kecil kartu ini satu-satunya
    tempat tenggat terlihat.

    Bedanya dengan rail bukan cuma tempat: di sini sisa harinya ditulis dengan
    nada — merah untuk yang sudah lewat — karena kolom tengah punya ruang untuk
    itu sementara rail 300px tidak.
  */
  const tenggatWidget = (
    <div style={{ padding: "var(--pad-kartu-lega)" }}>
      <SectionHeader title="Tenggat Mendatang" />
      {loading ? (
        <Skeleton h={140} />
      ) : (data?.upcoming_milestones?.length ?? 0) === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: C.mid, lineHeight: 1.5 }}>
          Tak ada tenggat milestone dalam waktu dekat.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {(data?.upcoming_milestones ?? []).slice(0, 4).map((m, i) => {
            const sisa = daysUntil(m.target_date);
            const lewat = sisa < 0;
            return (
              <Link
                key={m.id}
                href={m.projects?.id ? `/proyek/${m.projects.id}` : "/kalender"}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 0", textDecoration: "none",
                  borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                }}
              >
                <span aria-hidden="true" style={{
                  display: "grid", placeItems: "center", flexShrink: 0,
                  width: 26, height: 26, borderRadius: "var(--rad-kecil)",
                  background: "var(--navy-light)", color: "var(--navy)",
                }}>
                  <Target size={13} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: "block", fontSize: 13, fontWeight: 600, color: C.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.title}
                  </span>
                  <span style={{
                    display: "block", fontSize: 11, color: C.mid, marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.projects?.name ?? "—"}
                  </span>
                </span>
                <span style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                  color: lewat ? "var(--danger)" : C.mid,
                }}>
                  {lewat ? `${Math.abs(sisa)}h lewat` : `${sisa}h lagi`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  const taxWidget = (
    <div style={{ padding: "var(--pad-kartu-lega)" }}>
      <SectionHeader title="Ringkasan Pajak (PPh Final)" />
      <TaxDeadlineBanner />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <TaxCard label="Sudah Dilaporkan"  value={loading ? null : String(data?.tax_summary.reported_count ?? 0)} sub="transaksi" color={C.green}  icon={<CheckCircle2 size={15} />} />
        <TaxCard label="Belum Dilaporkan"  value={loading ? null : String(data?.tax_summary.pending_count ?? 0)}  sub="transaksi" color={data?.tax_summary.pending_count ? C.yellow : C.muted} icon={<Clock size={15} />} />
        <TaxCard label="Total PPh Tahun Ini" value={loading ? null : `Rp ${fmtShort(data?.tax_summary.total_pph ?? 0)}`} sub="tarif 2%" color={C.navy} icon={<Landmark size={15} />} />
      </div>
    </div>
  );

  /*
    RAIL DIPASANG LEWAT KONTEKS, bukan prop.

    Founder 2026-08-08: rail harus menempel di kanan setinggi layar dan TIDAK
    ikut ter-scroll. Itu mustahil selama ia anak halaman — `sticky` cuma
    menempel di dalam wadah scroll-nya sendiri. Jadi kolomnya hidup di
    `layout.tsx` dan halaman mengisinya dari sini (`lib/rail-context.tsx`).

    Rail tetap HANYA di halaman dashboard: 300px yang tak berarti apa-apa di
    sini akan memotong tabel 12 kolom di laptop 1366px.
  */
  usePasangRail(
    <RailIsi
      tanggalTenggat={(data?.upcoming_milestones ?? []).map((m) => m.target_date)}
      konteks={
        <>
          {/*
            "Perlu keputusan" TETAP SATU BARIS di puncak.

            Founder 2026-08-09: *"yg warning ini paling atas ajaa taronya
            semua"*, lalu *"bikin 1 baris aja, gausah kasih detail isinya apa
            aja nya"*. Kartu ini memang cukup satu angka: rinciannya per-jenis
            tak menambah keputusan apa pun yang tak bisa diambil dari totalnya.
          */}
          <RailFokus />

          {/*
            Kalender — kartu kedua referensi.

            Notifikasi dan "Milestone mendatang" DIBUANG atas permintaan
            founder 2026-08-09 (*"milestone dan notifikasi hilangkan aja
            deh"*), dan keduanya memang yang paling lemah di kolom ini:
            notifikasi kosong pada data uji sehingga cuma menyumbang satu
            strip tipis, dan milestone mengulang informasi yang sudah dijawab
            kalender persis di atasnya.
          */}
          <RailKalender
            tanggalPenting={(data?.upcoming_milestones ?? []).map((m) => m.target_date)}
          />

          {/*
            PERINGATAN KRITIS — DIBUKA, dan letaknya DI BAWAH kalender.

            Dua koreksi founder 2026-08-09 sekaligus: *"peringatan kritis itu
            dibuka aja biar ga kosong, buka dibawah kalender"*.

            Kenapa yang ini dibuka sementara "Perlu keputusan" tetap satu baris:
            di bawah kalender tersisa ruang kosong yang cukup besar, dan satu
            baris "3 hal mendesak" di sana membuat rail terlihat berhenti
            separuh jalan. Kartu ini juga yang paling pantas diurai — tiga
            peringatannya menuju TIGA halaman berbeda, jadi rinciannya bukan
            sekadar hiasan melainkan tiga sasaran klik yang berbeda. "Perlu
            keputusan" sebaliknya bermuara ke satu tautan yang sama.

            Isinya `susunPeringatan()` yang sama dengan kartu tengah, jadi
            angkanya tak bisa berbeda.
          */}
          <KartuRail judul="Peringatan kritis" kosong="Tak ada yang mendesak saat ini.">
            {peringatan.map((p, i) => (
              <BarisRail
                key={p.id}
                pertama={i === 0}
                utama={p.judul}
                sub={p.sub}
                href={p.href}
              />
            ))}
          </KartuRail>

          {/*
            "Progres proyek aktif" DICABUT dari rail 2026-08-09.

            Bukan karena kartunya jelek, melainkan karena ia menampilkan
            `active_progress.slice(0, 5)` — LIMA PROYEK YANG SAMA PERSIS yang
            sudah dirender widget progres di kolom tengah. Dua salinan daftar
            yang identik, terlihat bersamaan tanpa perlu scroll.

            Yang memaksa keputusan ini: sesudah kalender diperbaiki (tak lagi
            digepengkan jadi 2px, kembali ke 301px penuh), isi rail menjadi
            1082px di kolom setinggi 944px — Asisten dan Pengingat terdorong
            keluar layar pada 1600x1000, padahal keduanya justru yang founder
            minta SELALU ada. Sesuatu harus pergi, dan yang paling pantas
            pergi adalah satu-satunya kartu yang tak menyampaikan apa pun baru.
          */}
        </>
      }
    />,
    [data],
  );

  return (
    <HalamanIkhtisar>

      {/*
        ── HERO ──────────────────────────────────────────────────────────────

        Bentuknya mengikuti referensi (sapaan + gambar + kartu ringkas di
        kanan), dengan tiga penyimpangan yang disengaja:

        1. GAMBAR GEOMETRIS, bukan ilustrasi kartun. `ARAH-VISUAL` §11a dan
           `craft-floor` sama-sama melarang stok/figur; geometri justru
           first-class. Lihat `components/shell/gambar-hero.tsx`.

        2. KARTU KANAN DILABELI JUJUR. Referensi menulis "AI Project Insights
           — 78/100 Project Success Probability". Angka itu karangan. Yang di
           sini DIHITUNG dari data nyata (proyek telat vs total), jadi ia
           "Peringatan Sistem" — bukan AI. Wadah AI-nya menyusul saat modelnya
           benar-benar ada (`API-GAPS.md`, KEPUTUSAN-SCOPE-ERP-AI §4).

        3. TANPA CUACA. Referensi menampilkannya; kita belum punya sumbernya,
           dan mengarang suhu di alat kerja adalah kebohongan kecil yang
           merusak kepercayaan pada angka di sebelahnya.
      */}
      <div className="hero-baris" style={{
        display: "grid", gap: "var(--gap-grid)",
        alignItems: "stretch", marginBottom: "var(--gap-bagian)",
      }}>
      <section className="rise" style={{
        display: "grid", gridTemplateColumns: "minmax(0,1fr) auto",
        gap: "var(--gap-grid)", alignItems: "stretch",
        background: "var(--grad-merek)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        overflow: "hidden",
        minWidth: 0,
      }}>
        {/*
          Teks memakai `--on-merek`, BUKAN `C.text`.

          Percobaan pertama memakai warna teks biasa di atas `--grad-merek` —
          dan seluruh sapaan JADI TAK TERBACA: navy gelap di atas gradasi navy
          gelap. Ketahuan hanya karena tangkapan layar diperiksa; tak satu pun
          penjaga statis bisa melihatnya, karena keduanya token yang sah.

          `--on-merek` ada persis untuk ini, dan ia berpasangan dengan
          gradasinya — jadi ia ikut benar di mode gelap.
        */}
        {/*
          ISI HERO DIPERBESAR 2026-08-09.

          Founder: *"isi di hero nya kayanya bisa di bikin lebih besar?"* — dan
          diukur, ia benar: wadah hero 386px sementara isinya hanya ~200px.
          Tingginya bukan ditentukan hero, melainkan kartu Kesehatan di
          sebelahnya (kolom grid meregang menyamai yang tertinggi).

          Dua sisi dikerjakan: kartu itu diringkas (footer empat baris jadi satu
          tautan), dan teks di sini dinaikkan supaya proporsinya benar. Yang
          naik adalah HIERARKINYA, bukan semuanya — tanggal tetap kecil, judul
          dan ringkasan yang membesar.
        */}
        <div style={{ padding: "var(--pad-kartu-lega)", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
          <p style={{ fontSize: 12, color: "var(--on-merek)", opacity: 0.75, margin: "0 0 8px" }}>
            {formatTanggalPanjang(new Date())}
          </p>
          <h1 style={{
            fontFamily: "var(--font-display)",
            // `clamp` bukan angka mati: hero ikut menyempit saat rail hadir,
            // dan ukuran tetap akan membungkus nama panjang jadi tiga baris.
            fontSize: "clamp(28px, 3.2vw, 40px)",
            fontWeight: 700, letterSpacing: "-0.02em",
            color: "var(--on-merek)", lineHeight: 1.12, margin: "0 0 10px",
          }}>
            Selamat datang{user && <>, {namaSapaan(user.name)}</>}
          </h1>
          {loading ? <Skeleton h={16} w={300} /> : data && (
            <p style={{ fontSize: 15, color: "var(--on-merek)", opacity: 0.88, margin: 0, lineHeight: 1.5 }}>
              {data.kpis.active_projects} proyek aktif · nilai kontrak {fmtShort(data.kpis.total_contract_value)}
              {totalAlerts > 0 && (
                <span style={{ fontWeight: 700 }}> · {totalAlerts} perlu perhatian</span>
              )}
            </p>
          )}

          {/*
            Saringan periode DI DALAM hero, bukan melayang di atasnya.

            Sebelumnya ia baris tersendiri — memakan tinggi penuh hanya untuk
            lima pil kecil, dan mendorong seluruh isi halaman ke bawah.
            Referensi menaruh kontrolnya sebaris dengan judul; ini padanannya.
          */}
          {/*
            Satu baris kontrol: saringan periode + tombol "Sesuaikan".

            Tombol Sesuaikan tidak dirender di sini — ia dititipkan
            `DashboardGrid` lewat portal ke `#wadah-kontrol-dashboard` di
            ujung baris ini. Founder 2026-08-09: *"tombol sesuaikan disana
            agak mengganggu"*, dan tiga percobaan mengambangkannya di atas
            grid semuanya menabrak tetangganya (lihat catatan panjang di
            `dashboard-grid.tsx`).

            Di sini ia punya rumah: baris yang memang untuk kontrol, sejajar
            dengan saringan periode, di dalam hero — persis aturan yang sudah
            dipakai saringan periode sendiri.
          */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginTop: 12, flexWrap: "wrap",
          }}>
          <div role="group" aria-label="Rentang waktu" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {PERIODS.map(opt => {
              const active = period === opt.value;
              return (
                <button key={opt.value} onClick={() => setPeriod(opt.value)} aria-pressed={active} style={{
                  padding: "4px 12px", borderRadius: 999, fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  /*
                    Pil aktif memakai pasangan `--navy` / `--on-navy`, BUKAN
                    `--on-merek` / `--navy`.

                    Percobaan pertama menaruh teks `--navy` di atas latar
                    `--on-merek` (putih) — dan di MODE GELAP `--navy` berbalik
                    jadi biru TERANG, sehingga terang-di-atas-terang.
                    axe-core menangkapnya sebagai color-contrast serious; mode
                    terang lolos, jadi ia tak akan ketahuan tanpa audit dua mode.
                  */
                  border: `1px solid ${active ? "transparent" : "color-mix(in srgb, var(--on-merek) 30%, transparent)"}`,
                  background: active ? "var(--navy)" : "transparent",
                  color: active ? "var(--on-navy)" : "var(--on-merek)",
                  cursor: "pointer", transition: "all 0.12s",
                }}>
                  {opt.label}
                </button>
              );
            })}
          </div>

            {/*
              Wadah portal. `marginInlineStart: auto` mendorongnya ke ujung
              kanan baris, jadi saringan periode dan tombol Sesuaikan berada
              di dua ujung — bukan berdempet dan terbaca sebagai satu grup.
            */}
            <div id={ID_WADAH_KONTROL} style={{ marginInlineStart: "auto" }} />
          </div>
        </div>

        {/* Gambar memakai `--on-merek` supaya garisnya terbaca di atas gradasi. */}
        <div style={{ display: "flex", alignItems: "flex-end", paddingInlineEnd: 4, color: "var(--on-merek)" }}>
          <GambarHero />
        </div>
      </section>

      {/*
        Kartu kesehatan DI SAMPING hero — posisi kartu "AI Insights" referensi.
        Angkanya dihitung (`lib/kesehatan.ts`), bukan dikarang; lihat catatan
        di `components/shell/kartu-kesehatan.tsx`.
      */}
      <KartuKesehatan masukan={{
        invoiceLewatTempo: alerts?.invoice_overdue ?? 0,
        milestoneTelat: alerts?.milestone_late ?? 0,
        proyek: proyekBerjalan,
      }} />
      </div>

      {/*
        ── SPANDUK PERINGATAN DIBUANG 2026-08-09 ──────────────────────────────

        Founder: *"kayanya spanduk yg diatas apakah ngga lebih baik jadi
        critical alerts aja kaya di referensi? jadi lebih clean"* — lalu
        menunjuk referensinya langsung. Dan referensi memang TIDAK punya
        spanduk sama sekali: "Critical Issue Alerts" di sana adalah KARTU di
        baris paling bawah, sejajar Recent Updates dan Upcoming Deadlines.

        Diukur sebelum dibuang: tiga spanduk 38px + jarak = ~150px, memakai
        tiga warna yang berteriak bersamaan (merah · kuning · biru). Saat
        semuanya menonjol, tak ada yang menonjol — dan bentuk itu tak bisa
        tumbuh: enam jenis peringatan berarti 300px.

        ── Yang menjaga hal mendesak tetap terlihat

        Membuang spanduk hanya aman karena urgensi punya DUA jalur lain yang
        tak ikut hilang:

          SIDEBAR  `SidebarFokus` — "3 lewat tenggat · 3 menunggu putusan",
                   hadir di SETIAP halaman, bukan cuma beranda.
          RAIL     "Perlu keputusan" — rinciannya, di halaman dashboard.

        Kalau kelak salah satunya dicabut, peringatan mendesak kehilangan
        tempat terakhirnya yang selalu terlihat. Itu yang harus diperiksa
        sebelum menyentuh keduanya.
      */}

      {error && (
        <div style={{ background: C.redBg, border: `1px solid var(--danger-border)`, borderRadius: 10, padding: "8px 16px", color: C.red, fontSize: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          {error}
          <button onClick={() => fetchData(period)} style={{ color: C.navy, background: "none", border: "none", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            <RefreshCw size={11} /> Coba lagi
          </button>
        </div>
      )}

      {/*
        ── Draggable widget grid ─────────────────────────────────────────────

        `milestone` SENGAJA TIDAK DIDAFTARKAN LAGI di sini.

        Diperiksa di layar 2026-08-08: "Milestone Mendatang" tampil DUA KALI —
        satu di rail kanan, satu sebagai widget lebar-setengah di tengah,
        dengan isi yang persis sama. Duplikasi ini tak terlihat dari kode; ia
        baru muncul begitu rail diisi.

        Yang dipertahankan versi RAIL: isinya daftar vertikal pendek — bentuk
        yang memang pas untuk kolom 300px, dan membebaskan lebar tengah untuk
        grafik & tabel yang benar-benar membutuhkannya.
      */}
      {/*
        PINTASAN sekarang jadi WIDGET di dalam grid, bukan bagian tetap di
        atasnya — lihat `pintasanWidget` di bawah dan posisinya di
        `dashboard-grid.tsx`. Referensi menaruh "Quick Links" SESUDAH baris
        tiga widget, dan urutan itu masuk akal: pintasan adalah tempat pergi
        SESUDAH membaca keadaan, bukan sebelum.
      */}

      <DashboardGrid widgets={{
        kpi:       kpiWidget,
        // Widget serapan memuat datanya SENDIRI (`/cost-analytics/portfolio`),
        // jadi ia tak menunggu `data` halaman ini dan tak menjatuhkannya kalau
        // gagal — kelambatan satu endpoint tak boleh menahan seluruh dashboard.
        serapan:   <WidgetSerapan />,
        cashflow:  cashflowWidget,
        status:    statusWidget,
        pintasan:  <PintasanWidget />,
        kabar:     kabarWidget,
        peringatan: peringatanWidget,
        tenggat:   tenggatWidget,
        invoice:   invoiceWidget,
        ...(kasbonWidget ? { kasbon: kasbonWidget } : {}),
        tax:       taxWidget,
      }} />

    </HalamanIkhtisar>
  );
}

/**
 * PINTASAN — "Quick Links" referensi, sebagai widget grid.
 *
 * Isinya BUKAN salinan menu sidebar: sidebar sudah memuat semuanya, jadi
 * mengulanginya di sini cuma menambah baris tanpa menambah kemampuan. Yang
 * dipilih tujuh tempat yang paling sering dituju DARI beranda, dan tiap satu
 * punya halaman nyata (diperiksa ke disk oleh test) — pintasan yang mengirim
 * orang ke 404 lebih buruk daripada tak ada pintasan.
 */
function PintasanWidget() {
  return (
      <div style={{
        padding: "var(--pad-kartu)", height: "100%",
      }}>
        {/*
          BENTUK REFERENSI: pil MENDATAR berbingkai — ikon dan label
          BERDAMPINGAN, bukan ubin bertumpuk.

          Sebelumnya tiap pintasan adalah ubin 112px dengan ikon di atas label.
          Bedanya bukan selera: ubin bertumpuk memaksa tinggi ~70px dan
          menghabiskan sebaris penuh untuk tujuh tautan, sementara pil mendatar
          setinggi 38px menyampaikan hal yang sama dalam separuh ruang — dan
          ruang di beranda adalah barang langka yang justru sedang diperebutkan
          hero, KPI, dan tiga widget.

          ── KISI TETAP, bukan `flexWrap` (diubah 2026-08-09)

          Versi sebelumnya memakai `flex-wrap` dengan alasan yang terdengar
          benar: pil selebar labelnya lebih mudah dipindai daripada pil yang
          diregangkan. Yang tak diperhitungkan: lebar yang berbeda-beda berarti
          TAK ADA kolom, sehingga ujung kanan tiap baris berhenti di tempat
          acak. Founder menyebutnya *"kurang simetris"*, dan penyebabnya persis
          itu — bukan jarak, bukan padding.

          `1fr` empat kolom memulihkan tepi kiri DAN kanan yang lurus. Harga
          yang dibayar (pil "Klien" selebar pil "Pengeluaran") jauh lebih murah
          daripada kisi yang terlihat miring.

          `minmax(0,1fr)`, bukan `1fr` telanjang: tanpa `min` nol, label panjang
          memaksa kolom melebar dan keempatnya berhenti sama lebar.
        */}
        <nav aria-label="Pintasan" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
        }}>
          {PINTASAN.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              style={{
                /*
                  `flex`, bukan `inline-flex`: di dalam sel kisi, `inline-flex`
                  menyusut ke lebar isinya sehingga selnya lurus tetapi PIL-nya
                  tidak — persis cacat yang sedang diperbaiki, hanya berpindah
                  satu lapis ke dalam.
                */
                display: "flex", alignItems: "center", gap: 8,
                minWidth: 0,
                height: 38, padding: "0 12px 0 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--rad-sedang)",
                background: "var(--surface)",
                textDecoration: "none",
                transition: "border-color 150ms ease, background 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--navy)";
                e.currentTarget.style.background = "var(--surface-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--surface)";
              }}
            >
              <span aria-hidden="true" style={{
                display: "grid", placeItems: "center", flexShrink: 0,
                width: 24, height: 24, borderRadius: "var(--rad-kecil)",
                background: "var(--navy-light)", color: "var(--navy)",
              }}>
                {p.ikon}
              </span>
              <span style={{
                fontSize: 12.5, fontWeight: 600, color: C.text,
                whiteSpace: "nowrap",
                /*
                  Dipotong, tidak dibungkus: pil setinggi 38px tak muat dua
                  baris, dan label yang membungkus akan mendorong tinggi satu
                  pil saja sehingga barisnya tak lagi rata — cacat yang sama
                  lagi, dari arah lain.
                */
                overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
              }}>
                {p.label}
              </span>
            </Link>
          ))}
        </nav>
      </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

// KPICard DIHAPUS 2026-08-04 (R-012) — digantikan <KartuKPI> di
// components/ui-dasar.tsx. Yang berbeda bukan cuma tampilannya: KartuKPI
// mendukung delta, sparkline, gradasi sorot, dan hitung-naik — dan dipakai
// bersama SELURUH halaman, bukan hanya dashboard.

// AlertBanner DIHAPUS 2026-08-09 — tiga spanduk peringatan di atas KPI
// digantikan kartu "Peringatan Kritis" di baris bawah, mengikuti referensi
// yang memang tak punya spanduk sama sekali. Komponennya ikut dibuang, bukan
// ditinggal menganggur: komponen tanpa pemakai adalah kode yang tetap harus
// dibaca dan dipelihara setiap kali seseorang menelusuri berkas ini.

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", flex: 1 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ActionBtn({ disabled, bg, color, border, onClick, children }: {
  disabled: boolean; bg: string; color: string; border: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500,
        background: bg, color, border: `1px solid ${border}`,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function TaxCard({ label, value, sub, color, icon }: {
  label: string; value: string | null; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 16px", boxShadow: "var(--naik-1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</span>
        <span style={{ color, opacity: 0.5 }}>{icon}</span>
      </div>
      {value === null
        ? <Skeleton h={24} w={60} />
        : <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{value}</div>
      }
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function TaxDeadlineBanner() {
  const today = new Date();
  const deadline = new Date(today.getFullYear(), today.getMonth() + 1, 10);
  const days = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
  if (days > 14) return null;
  return (
    <div style={{
      background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
      borderRadius: 6, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
    }}>
      <Landmark size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "var(--on-warning-bg)" }}>
        Batas setor PPh Final: <strong style={{ color: "var(--warning)" }}>10 {deadline.toLocaleDateString("id-ID", { month: "long" })}</strong> ({days} hari lagi)
      </span>
    </div>
  );
}

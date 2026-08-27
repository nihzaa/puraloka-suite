"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { useTabUrl } from "@/lib/use-tab-url";
import { KpiPerusahaan } from "@/components/kpi-perusahaan";
import { TabBagian } from "@/components/tab-bagian";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { dapatDitekan } from "@/lib/dapat-ditekan";
import { api, makeAbortController, hasPermission } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import {
  FileText, BarChart3, Users, TrendingDown, Activity,
  ChevronDown, RefreshCw, Calendar, Building2, AlertTriangle,
  CheckCircle2, Clock, ArrowDownLeft, ArrowUpRight, Layers,
  Image as ImageIcon, X, Download,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ─── Design tokens ────────────────────────────────────────────────────────────
import { C } from "@/lib/warna-ui";
import { TombolUnduh } from "@/components/tombol-unduh";
// UI-0-4: kelima tabel halaman ini memakai primitif bersama, termasuk delapan
// yang dulu lewat wrapper `DataTable` lokal. `Tabel` menjamin caption sr-only,
// kolom pertama <th scope="row">, tabular-nums, dan pembungkus overflow-x.
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { formatRupiah } from "@/lib/format";
import { GAYA_KARTU } from "@/components/ui-dasar";


// ─── Types ────────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; location: string; status: string; contract_model: string; contract_value: number; start_date: string; end_date: string; pm_id: string; }

interface ProjectSummaryData {
  project: { id: string; name: string; location: string; status: string; contract_model: string; contract_value: number; start_date: string; end_date: string; description: string; clients: { id: string; contact_person: string; phone: string } | null; pm: { id: string; name: string } | null };
  summary: { totalInvoiced: number; totalPaid: number; totalDue: number; totalExpense: number; totalKasbon: number; totalWage: number; totalOutflow: number; latestProgress: number; serapan: number };
  termin: TerminSchedule[] | null;
  invoices: Invoice[];
  milestones: Milestone[];
  progressLogs: ProgressLog[];
  expenses: Expense[];
  mandorAssignments: MandorAssignment[];
  kasbons: Kasbon[];
  wages: WageReport[];
  photos: Photo[];
  documents: Document[];
  kurvaSPoints: KurvaSPoint[];
}

interface FinancialData {
  period: { dateFrom: string; dateTo: string };
  summary: { totalInvoiced: number; totalPaid: number; totalOutstanding: number; overdueCount: number };
  byProject: { id: string; name: string; invoiced: number; paid: number; due: number; count: number }[];
  invoices: Invoice[];
  payments: Payment[];
}

interface CashflowData {
  period: { dateFrom: string; dateTo: string };
  summary: { totalIn: number; totalExpense: number; totalWage: number; totalKasbon: number; totalOut: number; netFlow: number };
  byMonth: { period: string; label: string; masuk: number; keluar: number; net: number }[];
  payments: Payment[];
  expenses: Expense[];
  wages: WageReport[];
  kasbons: Kasbon[];
}

interface MandorReportData {
  period: { dateFrom: string; dateTo: string };
  summary: { totalMandor: number; grandTotalWage: number; grandTotalKasbon: number };
  mandorReport: {
    assignment: MandorAssignment;
    totalWage: number;
    totalKasbon: number;
    wages: WageReport[];
    kasbons: Kasbon[];
  }[];
}

interface ExpensesData {
  period: { dateFrom: string; dateTo: string };
  summary: { total: number; count: number };
  byCategory: { name: string; total: number; count: number; subs: { name: string; total: number; count: number }[] }[];
  byProject: { id: string; name: string; total: number; count: number }[];
  expenses: Expense[];
}

interface ProgressData {
  project: { id: string; name: string; location: string; start_date: string; end_date: string };
  milestones: Milestone[];
  progressLogs: ProgressLog[];
  latestProgress: number;
}

interface TerminSchedule { id: string; termin_number: number; label: string; percentage: number; amount: number; due_days: number; status: string; }
interface Invoice { id: string; invoice_number: string; invoice_type: string; total_amount: number; amount_paid: number; amount_due: number; status: string; issued_date: string; due_date: string; }
interface Milestone { id: string; title: string; target_date: string; status: string; notes: string | null; }
interface ProgressLog { id: string; pct_overall: number; notes: string | null; logged_at: string; logger: { id: string; name: string } | null; project_photos?: Photo[]; }
interface Expense { id: string; description: string; total_amount: number; expense_date: string; vendor_name: string | null; category: { id: string; name: string; type: string; parent_id: string | null } | null; category_label?: string; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface MandorAssignment { id: string; project_id: string; mandor: { id: string; name: string; phone: string } | null; projects: { id: string; name: string } | null; work_scopes: any[]; }
interface Kasbon { id: string; amount: number; purpose: string; status: string; approved_at: string | null; }
interface WageReport { id: string; net_amount: number; week_start: string; week_end: string; paid_at: string; }
interface Payment { id: string; amount_paid: number; paid_at: string; payment_method: string; }
interface Photo { id: string; url: string; caption: string | null; taken_at: string; }
interface Document { id: string; name: string; document_type: string; file_url: string; created_at: string; }
interface KurvaSPoint { week_number: number; plan_pct: number; actual_pct: number; }

type TabKey = "kpi" | "ringkasan" | "keuangan" | "cashflow" | "mandor" | "pengeluaran" | "progress" | "pajak" | "portofolio" | "wip";

// Nilai sah untuk `?tab=`. Diturunkan dari tipe di atas supaya keduanya tak
// bisa berselisih diam-diam saat salah satu disunting.
const TAB_SAH = ["kpi", "ringkasan", "keuangan", "cashflow", "mandor", "pengeluaran",
                 "progress", "pajak", "portofolio", "wip"] as const;

interface TaxRecord {
  id: string; tax_type: string; tax_scheme: string; base_amount: number;
  rate_pct: number; tax_amount: number; efaktur_number: string | null;
  period_month: string; status: string; notes: string | null; created_at: string;
  invoice: {
    id: string; invoice_number: string; issued_date: string; total_amount: number;
    project: { id: string; name: string; client: { contact_person: string; company_name: string | null; npwp: string | null } | null } | null;
  } | null;
}
interface TaxData {
  records: TaxRecord[];
  summary_by_month: { period: string; pph: number; ppn: number; total: number; count: number; pending: number; reported: number }[];
  totals: { pph_final: number; ppn: number; grand_total: number; pending_count: number; reported_count: number; record_count: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = formatRupiah;

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return fmt(n);
};

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

const CONTRACT_MODEL: Record<string, string> = { termin: "Termin", komisi: "Komisi" };
const STATUS_PROJECT: Record<string, { label: string; color: string; bg: string }> = {
  planning:    { label: "Perencanaan", color: C.blue,   bg: C.blueBg },
  in_progress: { label: "Berjalan",    color: C.green,  bg: C.greenBg },
  on_hold:     { label: "Ditunda",     color: C.yellow, bg: C.yellowBg },
  completed:   { label: "Selesai",     color: C.muted,  bg: "var(--surface-hover)" },
};
const MILESTONE_STATUS: Record<string, { label: string; color: string }> = {
  pending:     { label: "Belum", color: C.muted },
  in_progress: { label: "Berjalan", color: C.blue },
  completed:   { label: "Selesai", color: C.green },
  overdue:     { label: "Terlambat", color: C.red },
};
const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
  pembelian_alat: "Pembelian Alat", operasional: "Operasional", lain_lain: "Lain-lain",
};
const PIE_COLORS = ["var(--navy)", "var(--aksen-terang)", "var(--success)", "var(--danger)", "var(--warning)", "var(--info)", "var(--aksen-terang)", "#F472B6"];

function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: 6, background: "var(--surface-hover)" }} />;
}

function KpiCard({ label, value, sub, icon, accent, border }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent?: string; border?: string }) {
  return (
    <div
      style={{ flex: 1, minWidth: 160, background: "var(--surface)", borderRadius: 10, padding: "var(--pad-kartu-lega)", border: `1px solid ${border ?? C.border}`, display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--naik-1)", transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,51,102,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: accent ? `${accent}18` : C.navyLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, color: C.muted, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
        <p style={{ fontSize: "var(--teks-kpi)", fontWeight: 800, color: accent ?? C.text, margin: "0 0 1px", fontFamily: "var(--font-display)", lineHeight: 1.1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, fontFamily: "var(--font-display)" }}>{title}</h3>
    </div>
  );
}

function ProgressBar({ pct, color = C.navy, height = 8 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ width: "100%", background: "var(--surface-hover)", borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

function StatusBadge({ label, color, bg, border }: { label: string; color: string; bg: string; border?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 600, color, background: bg, border: `1px solid ${border ?? bg}`, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />{label}
    </span>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 12, boxShadow: "var(--naik-2)" }}>
      <p style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--gap-bagian)", marginBottom: 3 }}>
          <span style={{ color: C.mid }}>{p.name}</span>
          <span style={{ fontWeight: 600, color: p.color }}>{fmtCompact(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

/**
 * `DataTable` DIHAPUS 2026-08-07 (UI-0-4) — delapan pemakainya kini memakai
 * `<Tabel>` dari `@/components/dasar`.
 *
 * Wrapper lokal ini sudah benar soal caption wajib dan `scope="col"`, tapi ia
 * pustaka tabel KEDUA: ia tak pernah memberi `scope="row"` pada kolom pertama,
 * dan barisnya ditulis pemanggil sebagai `<tr><td>` mentah — jadi tiap pemakai
 * tetap menentukan sendiri padding, perataan, dan `tabular-nums` per sel.
 * Itulah sebabnya delapan tabel di berkas ini punya delapan ritme sel yang
 * sedikit berbeda meski lewat "wrapper bersama".
 *
 * Keadaan kosong yang dulu dirender sebagai `<td colSpan>` di dalam `<tbody>`
 * ikut hilang bersamanya: pembaca layar membacakannya seolah "Tidak ada data"
 * adalah nama sebuah baris. Prop `kosong` milik `Tabel` menggantikannya.
 */

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LaporanPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  // `useTabUrl` memakai `useSearchParams`, yang memaksa render sisi klien —
  // Next menuntut batas Suspense untuk itu, kalau tidak `pnpm build` gagal
  // saat prerender.
  return (
    <Suspense fallback={null}>
      <LaporanContent />
    </Suspense>
  );
}

function LaporanContent() {
  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.
  const canViewFinance = useIzin("finance:tax:view");

  // Filter state
  const today = new Date().toISOString().split("T")[0];
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];

  const [projects, setProjects]       = useState<Project[]>([]);
  const [projectId, setProjectId]     = useState("");
  const [dateFrom, setDateFrom]       = useState(yearStart);
  const [dateTo, setDateTo]           = useState(today);
  // Tab hidup di URL: itu yang membuat sub-menu "WIP / PSAK", "PPN & PPh",
  // dan "Portofolio Biaya" bisa menunjuk tab yang mereka janjikan, alih-alih
  // sama-sama mendarat di Ringkasan.
  const [tab, setTab] = useTabUrl<TabKey>(TAB_SAH, "ringkasan");
  const [loading, setLoading]         = useState(false);
  const [pdfLoading, setPdfLoading]   = useState(false);

  // Data state per tab
  const [summaryData, setSummaryData]   = useState<ProjectSummaryData | null>(null);
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [cashflowData, setCashflowData] = useState<CashflowData | null>(null);
  const [mandorData, setMandorData]     = useState<MandorReportData | null>(null);
  const [expenseData, setExpenseData]   = useState<ExpensesData | null>(null);
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [taxData, setTaxData]           = useState<TaxData | null>(null);
  const [taxStatusUpdating, setTaxStatusUpdating] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load project list on mount
  useEffect(() => {
    const ctrl = makeAbortController();
    api.get<{ projects: Project[] }>("/api/v1/reports/projects", { signal: ctrl.signal })
      .then(r => {
        setProjects(r.data.projects);
        if (r.data.projects.length > 0) setProjectId(r.data.projects[0].id);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Load data when filter changes — pass current values explicitly to avoid stale closure
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadTabData(tab, projectId, dateFrom, dateTo), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [tab, projectId, dateFrom, dateTo]);

  async function loadTabData(
    currentTab: TabKey, currentProjectId: string, currentDateFrom: string, currentDateTo: string
  ) {
    if (currentTab === "ringkasan" && !currentProjectId) return;
    if (currentTab === "progress" && !currentProjectId) return;

    abortRef.current?.abort();
    abortRef.current = makeAbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    const params: Record<string, string> = { date_from: currentDateFrom, date_to: currentDateTo };
    if (currentProjectId) params.project_id = currentProjectId;

    try {
      if (currentTab === "ringkasan") {
        const r = await api.get<ProjectSummaryData>("/api/v1/reports/project-summary", { params, signal });
        setSummaryData(r.data);
      } else if (currentTab === "keuangan") {
        const r = await api.get<FinancialData>("/api/v1/reports/financial", { params, signal });
        setFinancialData(r.data);
      } else if (currentTab === "cashflow") {
        const r = await api.get<CashflowData>("/api/v1/reports/cashflow", { params, signal });
        setCashflowData(r.data);
      } else if (currentTab === "mandor") {
        const r = await api.get<MandorReportData>("/api/v1/reports/mandor", { params, signal });
        setMandorData(r.data);
      } else if (currentTab === "pengeluaran") {
        const r = await api.get<ExpensesData>("/api/v1/reports/expenses", { params, signal });
        setExpenseData(r.data);
      } else if (currentTab === "progress") {
        const r = await api.get<ProgressData>("/api/v1/reports/progress", { params, signal });
        setProgressData(r.data);
      } else if (currentTab === "pajak") {
        const taxParams: Record<string, string> = { from: currentDateFrom, to: currentDateTo };
        if (currentProjectId) taxParams.project_id = currentProjectId;
        const r = await api.get<TaxData>("/api/v1/reports/rekap-pajak", { params: taxParams, signal });
        setTaxData(r.data);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "CanceledError") return;
    } finally { setLoading(false); }
  }

  const selectedProject = projects.find(p => p.id === projectId);

  async function handleExportPdf() {
    const pdfType = tab === "ringkasan" || tab === "progress" ? "project"
      : tab === "mandor" ? "mandor"
      : "financial";

    if (pdfType === "project" && !projectId) return;

    setPdfLoading(true);
    try {
      const params: Record<string, string> = { type: pdfType, date_from: dateFrom, date_to: dateTo };
      if (projectId) params.project_id = projectId;
      const res = await api.get("/api/v1/reports/export-pdf", { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-${pdfType}-${dateFrom}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — PDF download is best-effort
    } finally {
      setPdfLoading(false);
    }
  }

  // Tabs visible per role
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; requiresProject?: boolean; requireFinance?: boolean }[] = ([
    // KPI Perusahaan PALING DEPAN — pertanyaan yang paling sering dibuka
    // ("bagaimana keadaan kita") harus jadi yang pertama terlihat. Ia juga
    // satu-satunya tab yang tak menuntut memilih proyek lebih dulu.
    { key: "kpi"        as TabKey, label: "KPI Perusahaan",   icon: <Activity size={12} />,      requireFinance: true },
    { key: "ringkasan"   as TabKey, label: "Ringkasan Proyek", icon: <Layers size={12} />,       requiresProject: true },
    { key: "keuangan"   as TabKey, label: "Keuangan",          icon: <FileText size={12} />,      requireFinance: true },
    { key: "cashflow"   as TabKey, label: "Arus Kas",           icon: <BarChart3 size={12} />,     requireFinance: true },
    { key: "mandor"     as TabKey, label: "Mandor & Upah",      icon: <Users size={12} />,         requireFinance: true },
    { key: "pengeluaran" as TabKey, label: "Pengeluaran",       icon: <TrendingDown size={12} />,  requireFinance: true },
    { key: "progress"   as TabKey, label: "Progress & Foto",    icon: <Activity size={12} />,      requiresProject: true },
    { key: "pajak"      as TabKey, label: "Rekap Pajak",         icon: <FileText size={12} />,      requireFinance: true },
    // Portofolio SENGAJA tanpa `requiresProject`: justru pertanyaannya
    // lintas-proyek ("dari 15 proyek, mana yang menggerus margin?"), jadi
    // memaksanya memilih satu proyek dulu akan menghilangkan gunanya.
    { key: "portofolio" as TabKey, label: "Portofolio Biaya",   icon: <BarChart3 size={12} />,     requireFinance: true },
    { key: "wip"        as TabKey, label: "WIP / Pengakuan",  icon: <Layers size={12} />,        requireFinance: true },
  ] as { key: TabKey; label: string; icon: React.ReactNode; requiresProject?: boolean; requireFinance?: boolean }[]).filter(t => !t.requireFinance || canViewFinance);

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>

      {/* Header */}
      <KepalaHalaman
        judul="Laporan"
        keterangan="Ringkasan, keuangan, arus kas, mandor, pengeluaran, dan dokumentasi progress proyek"
              ikon={<BarChart3 size={19} />}
      />

      {/* Filter Bar */}
      <div className="rise rise-1" style={{ ...GAYA_KARTU, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label htmlFor="project-id" style={{ fontSize: 10, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Proyek</label>
          <div style={{ position: "relative" }}>
            <select id="project-id" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)}
              style={{ padding: "8px 32px 8px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 220, appearance: "none" }}>
              {(tab === "keuangan" || tab === "cashflow" || tab === "mandor" || tab === "pengeluaran") && (
                <option value="">Semua Proyek</option>
              )}
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={12} color={C.muted} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          </div>
        </div>
        <div>
          <label htmlFor="date-from" style={{ fontSize: 10, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Dari Tanggal</label>
          <input id="date-from" aria-label="Tanggal mulai" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: "8px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
        </div>
        <div>
          <label htmlFor="date-to" style={{ fontSize: 10, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sampai Tanggal</label>
          <input id="date-to" aria-label="Tanggal akhir" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: "8px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
        </div>
        {selectedProject?.start_date && (() => {
          const isFromStart = dateFrom === selectedProject.start_date;
          return (
            <button aria-label={`Set tanggal mulai ke ${selectedProject.start_date}`}
              onClick={() => setDateFrom(selectedProject.start_date)}
              title={`Set tanggal mulai ke ${selectedProject.start_date}`}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${isFromStart ? C.navy : C.border}`,
                background: isFromStart ? C.navyLight : "var(--surface)",
                color: isFromStart ? C.navy : C.mid,
                whiteSpace: "nowrap",
              }}
            >
              <Calendar size={12} />
              Dari awal proyek
            </button>
          );
        })()}
        <button onClick={() => loadTabData(tab, projectId, dateFrom, dateTo)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 12, fontWeight: 600, color: C.mid, cursor: "pointer" }}>
          <RefreshCw size={13} /> Refresh
        </button>
        {canViewFinance && (
          <button
            onClick={handleExportPdf}
            disabled={pdfLoading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${C.navy}`, background: pdfLoading ? C.navyLight : C.navy,
              color: pdfLoading ? C.navy : "var(--surface)", cursor: pdfLoading ? "default" : "pointer",
              opacity: pdfLoading ? 0.7 : 1,
            }}
          >
            <Download size={13} /> {pdfLoading ? "Memproses..." : "Export PDF"}
          </button>
        )}
        {selectedProject && (
          <div style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 6, background: C.navyLight, fontSize: 11, color: C.navy, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Building2 size={12} /> {selectedProject.name}
            <span style={{ color: C.muted, fontWeight: 400 }}>· {selectedProject.location}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="rise rise-2" style={{ ...GAYA_KARTU }}>
        {/* Komponen BERSAMA `TabBagian` — gaya tab tak lagi ditulis ulang
            per halaman. Sampai 2026-08-08 halaman ini punya `TabBtn` sendiri,
            akuntansi punya tombol berkotak, dan /dokumen/kendali punya bentuk
            ketiga. Tiga bentuk visual untuk hal yang sama. */}
        <div style={{ padding: "0 8px" }}>
          <TabBagian
            label="Bagian laporan"
            aktif={tab}
            onPilih={setTab}
            bagian={tabs.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon }))}
          />
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: "var(--pad-kartu)" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              {[1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 80, borderRadius: 10, background: "var(--surface-hover)" }} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3,4,5].map(i => <Skeleton key={i} h={44} />)}
            </div>
          </div>
        )}

        {/* ── Tab: Ringkasan Proyek ── */}
        {tab === "kpi" && <KpiPerusahaan />}

        {!loading && tab === "ringkasan" && (
          <div style={{ padding: "var(--pad-kartu)" }}>
            {!projectId ? (
              <EmptyState icon={<Building2 size={32} color={C.muted} />} title="Pilih proyek" desc="Pilih proyek dari filter di atas untuk melihat ringkasan" />
            ) : !summaryData ? (
              <EmptyState icon={<RefreshCw size={32} color={C.muted} />} title="Memuat data..." desc="" />
            ) : (
              <TabRingkasan data={summaryData} canViewFinance={canViewFinance} />
            )}
          </div>
        )}

        {/* ── Tab: Keuangan ── */}
        {!loading && tab === "keuangan" && (
          <div style={{ padding: "var(--pad-kartu)" }}>
            {!financialData ? (
              <EmptyState icon={<RefreshCw size={32} color={C.muted} />} title="Memuat data..." desc="" />
            ) : (
              <TabKeuangan data={financialData} />
            )}
          </div>
        )}

        {/* ── Tab: Arus Kas ── */}
        {!loading && tab === "cashflow" && (
          <div style={{ padding: "var(--pad-kartu)" }}>
            {!cashflowData ? (
              <EmptyState icon={<RefreshCw size={32} color={C.muted} />} title="Memuat data..." desc="" />
            ) : (
              <TabCashflow data={cashflowData} />
            )}
          </div>
        )}

        {/* ── Tab: Mandor & Upah ── */}
        {!loading && tab === "mandor" && (
          <div style={{ padding: "var(--pad-kartu)" }}>
            {!mandorData ? (
              <EmptyState icon={<RefreshCw size={32} color={C.muted} />} title="Memuat data..." desc="" />
            ) : (
              <TabMandor data={mandorData} />
            )}
          </div>
        )}

        {/* ── Tab: Pengeluaran ── */}
        {!loading && tab === "pengeluaran" && (
          <div style={{ padding: "var(--pad-kartu)" }}>
            {!expenseData ? (
              <EmptyState icon={<RefreshCw size={32} color={C.muted} />} title="Memuat data..." desc="" />
            ) : (
              <TabPengeluaran data={expenseData} />
            )}
          </div>
        )}

        {/* ── Tab: Progress & Foto ── */}
        {!loading && tab === "progress" && (
          <div style={{ padding: "var(--pad-kartu)" }}>
            {!projectId ? (
              <EmptyState icon={<Building2 size={32} color={C.muted} />} title="Pilih proyek" desc="Pilih proyek dari filter di atas untuk melihat progress" />
            ) : !progressData ? (
              <EmptyState icon={<RefreshCw size={32} color={C.muted} />} title="Memuat data..." desc="" />
            ) : (
              <TabProgress data={progressData} />
            )}
          </div>
        )}

        {/* ── Tab: Rekap Pajak ── */}
        {!loading && tab === "pajak" && (
          <div style={{ padding: "var(--pad-kartu)", display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
            {!taxData ? (
              <EmptyState icon={<RefreshCw size={32} color={C.muted} />} title="Memuat data pajak..." desc="" />
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <KpiCard label="PPh Final 4(2)" value={fmtCompact(taxData.totals.pph_final)} icon={<FileText size={20} color={C.navy} />} accent={C.navy} />
                  <KpiCard label="PPN" value={fmtCompact(taxData.totals.ppn)} icon={<FileText size={20} color={C.blue} />} accent={C.blue} />
                  <KpiCard label="Total Pajak" value={fmtCompact(taxData.totals.grand_total)} icon={<TrendingDown size={20} color={C.red} />} accent={C.red} border={C.redBorder} />
                  <KpiCard label="Sudah Lapor" value={String(taxData.totals.reported_count)} icon={<CheckCircle2 size={20} color={C.green} />} accent={C.green} border={C.greenBorder} />
                  <KpiCard label="Belum Lapor" value={String(taxData.totals.pending_count)} icon={<Clock size={20} color={C.yellow} />} accent={C.yellow} />
                </div>

                {taxData.summary_by_month.length > 0 && (
                  <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "0 0 14px" }}>Rekap per Bulan</p>
                    {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Komponen menjamin
                        caption sr-only, kolom pertama <th scope="row">, tabular-nums,
                        dan pembungkus overflow-x — empat hal yang tabel mentah harus
                        ingat sendiri tiap kali, dan yang riwayat repo ini menunjukkan
                        TIDAK diingat.

                        `kepalaBaris` jatuh ke Periode: itu yang menamai barisnya.
                        Sisanya angka; tak ada kolom lain yang bisa dipakai pembaca
                        layar untuk menyebut baris mana yang sedang dibacakan.

                        Belang ganjil-genap yang dulu ada di sini SENGAJA hilang —
                        `Tabel` memilih garis tipis + sorot hover, karena pada tabel
                        padat belang menambah kebisingan tanpa menambah keterbacaan. */}
                    <Tabel<TaxData["summary_by_month"][number]>
              berpermukaan
                      caption="Rekap pajak per periode: PPh final, PPN, total pajak, jumlah invoice, serta berapa yang sudah dan belum dilaporkan."
                      data={taxData.summary_by_month}
                      kunciBaris={m => m.period}
                      kolom={[
                        { kunci: "periode", judul: "Periode", kepalaBaris: true, render: m => m.period },
                        { kunci: "pph", judul: "PPh Final", rata: "kanan", render: m => <span style={{ color: C.navy }}>{fmtCompact(m.pph)}</span> },
                        { kunci: "ppn", judul: "PPN", rata: "kanan", render: m => <span style={{ color: C.blue }}>{fmtCompact(m.ppn)}</span> },
                        { kunci: "total", judul: "Total Pajak", rata: "kanan", render: m => <span style={{ fontWeight: 700 }}>{fmtCompact(m.total)}</span> },
                        { kunci: "count", judul: "Jumlah Invoice", rata: "kanan", render: m => <span style={{ color: C.muted }}>{m.count}</span> },
                        { kunci: "reported", judul: "Sudah Lapor", rata: "kanan", render: m => <span style={{ color: C.green }}>{m.reported}</span> },
                        { kunci: "pending", judul: "Belum Lapor", rata: "kanan", render: m => <span style={{ color: m.pending > 0 ? C.yellow : C.muted }}>{m.pending}</span> },
                      ]}
                    />
                  </div>
                )}

                <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>
                      Detail Pajak <span style={{ color: C.muted, fontWeight: 400 }}>({taxData.totals.record_count} record)</span>
                    </p>
                    <button
                      aria-label="Unduh detail pajak sebagai Excel"
                      onClick={async () => {
                        try {
                          const XLSX = await import("xlsx");
                          const rows = taxData.records.map((r: TaxRecord) => ({
                            "Periode": r.period_month?.slice(0, 7),
                            "Proyek": r.invoice?.project?.name ?? "—",
                            "Klien": r.invoice?.project?.client?.contact_person ?? "—",
                            "NPWP Klien": r.invoice?.project?.client?.npwp ?? "—",
                            "No Invoice": r.invoice?.invoice_number ?? "—",
                            "Tgl Invoice": fmtDate(r.invoice?.issued_date ?? null),
                            "Jenis Pajak": r.tax_type === "pph_final" ? "PPh Final 4(2)" : "PPN",
                            "Skema": r.tax_scheme,
                            "DPP": r.base_amount,
                            "Tarif %": r.rate_pct,
                            "Pajak Terutang": r.tax_amount,
                            "No e-Faktur": r.efaktur_number ?? "",
                            "Status": r.status === "reported" ? "Sudah Lapor" : "Belum Lapor",
                          }));
                          const ws = XLSX.utils.json_to_sheet(rows);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Rekap Pajak");
                          XLSX.writeFile(wb, `rekap-pajak-${dateFrom}-${dateTo}.xlsx`);
                        } catch { /* */ }
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: "var(--grad-aksen)", border: "none", color: C.onNavy, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      <Download size={12} /> Export Excel
                    </button>
                  </div>

                  {/* Ekspor SERVER — berbeda maksud dari tombol Excel di atas.

                      Yang di atas menyalin apa yang SEDANG TAMPIL di layar,
                      dibangun di peramban. Yang di sini diambil dari server:
                      ia menyertakan kolom yang tak muat di layar, memakai
                      kop identitas tenant untuk PDF, dan yang terpenting —
                      dua di antaranya berformat WAJIB DJP yang tak boleh
                      disusun ulang di klien.

                      Bupot & e-Faktur sengaja hanya CSV: keduanya berkas
                      IMPOR untuk aplikasi DJP, dan PDF-nya tak akan diterima
                      siapa pun. Menawarkan format yang pasti gagal adalah
                      cara paling cepat membuat orang berhenti percaya
                      seluruh menu unduhan. */}
                  <div style={{
                    padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", flexDirection: "column", gap: 12,
                  }}>
                    <TombolUnduh
                      label="Rekap pajak"
                      jalur={`/api/v1/reports/rekap-pajak/ekspor?date_from=${dateFrom}&date_to=${dateTo}`}
                      namaBerkas={`rekap-pajak-${dateFrom}-${dateTo}`}
                      format={["csv", "xlsx", "pdf"]}
                    />
                    <TombolUnduh
                      label="Bukti potong (unggah ke e-Bupot DJP)"
                      jalur={`/api/v1/reports/rekap-pajak/bupot.csv?date_from=${dateFrom}&date_to=${dateTo}`}
                      namaBerkas={`bupot-${dateFrom}-${dateTo}`}
                      format={["csv"]}
                    />
                    <TombolUnduh
                      label="Faktur Pajak (impor ke e-Faktur DJP)"
                      jalur={`/api/v1/reports/rekap-pajak/efaktur.csv?date_from=${dateFrom}&date_to=${dateTo}`}
                      namaBerkas={`efaktur-${dateFrom}-${dateTo}`}
                      format={["csv"]}
                    />
                  </div>
                  {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                      scope="row", tabular-nums, dan overflow-x dijamin komponen.

                      `kepalaBaris` PINDAH dari Periode (kolom pertama semula) ke
                      No Invoice, dan urutan kolomnya ikut ditukar. Periode "2026-07"
                      berulang di puluhan baris — dipakai sebagai nama baris, pembaca
                      layar mengumumkan sepuluh baris berturut bernama sama dan tak
                      ada yang bisa dibedakan. Nomor invoice unik, dan itu yang
                      dicari orang saat mencocokkan setoran pajak ke tagihannya.
                      Preseden yang sama: akuntansi (Kode akun → Nama Akun),
                      gudang/material-klien (Tanggal → Material).

                      Keadaan kosong pindah ke prop `kosong`: sebagai <td colSpan>
                      di <tbody> ia dibacakan seolah nama sebuah baris data. */}
                  <Tabel<TaxRecord>
              berpermukaan
                    caption="Rincian pajak per invoice: nomor invoice, periode, proyek, jenis pajak, DPP, tarif, nilai pajak, nomor e-Faktur, dan status."
                    data={taxData.records}
                    kunciBaris={r => r.id}
                    kosong={<div style={{ padding: 40, textAlign: "center", color: C.muted }}>Tidak ada data pajak di periode ini</div>}
                    kolom={[
                      { kunci: "invoice", judul: "No Invoice", kepalaBaris: true, render: r => <span style={{ color: C.navy, fontWeight: 500 }}>{r.invoice?.invoice_number ?? "—"}</span> },
                      { kunci: "periode", judul: "Periode", render: r => <span style={{ color: C.muted, whiteSpace: "nowrap" }}>{r.period_month?.slice(0, 7)}</span> },
                      { kunci: "proyek", judul: "Proyek", render: r => <span style={{ display: "block", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.invoice?.project?.name ?? "—"}</span> },
                      { kunci: "jenis", judul: "Jenis", render: r => (
                        <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: r.tax_type === "pph_final" ? C.navyLight : C.blueBg, color: r.tax_type === "pph_final" ? C.navy : C.blue }}>
                          {r.tax_type === "pph_final" ? "PPh Final" : "PPN"}
                        </span>
                      ) },
                      { kunci: "dpp", judul: "DPP", rata: "kanan", render: r => fmtCompact(r.base_amount) },
                      { kunci: "tarif", judul: "Tarif", rata: "tengah", render: r => <span style={{ color: C.muted }}>{r.rate_pct}%</span> },
                      { kunci: "pajak", judul: "Pajak", rata: "kanan", render: r => <span style={{ fontWeight: 700 }}>{fmtCompact(r.tax_amount)}</span> },
                      { kunci: "efaktur", judul: "No e-Faktur", render: r => <span style={{ color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{r.efaktur_number ?? "—"}</span> },
                      { kunci: "status", judul: "Status", render: r => (
                        <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: r.status === "reported" ? C.greenBg : C.yellowBg, color: r.status === "reported" ? C.green : C.yellow }}>
                          {r.status === "reported" ? "Lapor" : "Pending"}
                        </span>
                      ) },
                      { kunci: "aksi", judul: "Aksi", render: r => (
                        r.status === "pending" && hasPermission("finance:tax:submit") ? (
                          <button
                            aria-label="Tandai catatan pajak ini sudah dilaporkan"
                            disabled={taxStatusUpdating === r.id}
                            onClick={async () => {
                              setTaxStatusUpdating(r.id);
                              try {
                                await api.patch(`/api/v1/reports/rekap-pajak/${r.id}/status`, { status: "reported" });
                                setTaxData(prev => prev ? {
                                  ...prev,
                                  records: prev.records.map(rec => rec.id === r.id ? { ...rec, status: "reported" } : rec),
                                  totals: { ...prev.totals, pending_count: prev.totals.pending_count - 1, reported_count: prev.totals.reported_count + 1 },
                                } : prev);
                              } catch { /* */ } finally { setTaxStatusUpdating(null); }
                            }}
                            style={{ padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.green}`, background: "transparent", color: C.green, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                          >
                            {taxStatusUpdating === r.id ? "..." : "Tandai Lapor"}
                          </button>
                        ) : null
                      ) },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {tab === "portofolio" && <PortofolioTab />}
        {tab === "wip" && <WipTab />}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted }}>
      <div style={{ marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.mid, marginBottom: 4 }}>{title}</div>
      {desc && <div style={{ fontSize: 12 }}>{desc}</div>}
    </div>
  );
}

// ─── Tab: Ringkasan Proyek ────────────────────────────────────────────────────
function TabRingkasan({ data, canViewFinance }: { data: ProjectSummaryData; canViewFinance: boolean }) {
  const { project, summary } = data;
  const statusMeta = STATUS_PROJECT[project.status] ?? { label: project.status, color: C.muted, bg: "var(--surface-hover)" };
  const contractPct = project.contract_value > 0 ? (summary.totalInvoiced / Number(project.contract_value)) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>

      {/* Project header card */}
      <div style={{ padding: "20px 24px", borderRadius: 10, border: `1px solid ${C.border}`, // `#fff` yang dipaku membuat kartu ini tetap PUTIH TERANG di mode
        // gelap, sementara teks di atasnya ikut menjadi terang — nama proyek
        // di sisi kanan nyaris tak terbaca. `--surface` punya varian gelapnya
        // sendiri, jadi gradasinya ikut berbalik.
        background: "linear-gradient(135deg, var(--surface-subtle) 0%, var(--surface) 100%)", display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <StatusBadge label={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} />
            <span style={{ fontSize: 11, color: C.muted }}>{CONTRACT_MODEL[project.contract_model] ?? project.contract_model}</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 4px", fontFamily: "var(--font-display)" }}>{project.name}</h2>
          <p style={{ fontSize: 13, color: C.mid, margin: "0 0 12px" }}>{project.location}</p>
          <div style={{ display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap" }}>
            {project.clients && <div style={{ fontSize: 11 }}><span style={{ color: C.muted }}>Klien: </span><span style={{ fontWeight: 600, color: C.text }}>{project.clients.contact_person}</span></div>}
            {project.pm && <div style={{ fontSize: 11 }}><span style={{ color: C.muted }}>PM: </span><span style={{ fontWeight: 600, color: C.text }}>{project.pm.name}</span></div>}
            {project.start_date && <div style={{ fontSize: 11 }}><span style={{ color: C.muted }}>Mulai: </span><span style={{ fontWeight: 600 }}>{fmtDate(project.start_date)}</span></div>}
            {project.end_date && <div style={{ fontSize: 11 }}><span style={{ color: C.muted }}>Target: </span><span style={{ fontWeight: 600 }}>{fmtDate(project.end_date)}</span></div>}
          </div>
        </div>
        {canViewFinance && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Nilai Kontrak</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.navy, fontFamily: "var(--font-display)" }}>{fmtCompact(Number(project.contract_value))}</div>
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard label="Progress Fisik" value={`${summary.latestProgress.toFixed(0)}%`} sub="dari progress log terbaru" icon={<Activity size={20} color={C.green} />} accent={C.green} border={C.greenBorder} />
        <KpiCard label="Serapan Anggaran" value={`${summary.serapan.toFixed(0)}%`} sub={fmtCompact(summary.totalExpense) + " dari kontrak"} icon={<TrendingDown size={20} color={C.blue} />} accent={C.blue} border={C.blueBorder} />
        {canViewFinance && <>
          <KpiCard label="Total Tagihan" value={fmtCompact(summary.totalInvoiced)} sub={`${contractPct.toFixed(0)}% dari kontrak`} icon={<FileText size={20} color={C.navy} />} accent={C.navy} />
          <KpiCard label="Piutang" value={fmtCompact(summary.totalDue)} sub="belum terbayar" icon={<Clock size={20} color={C.yellow} />} accent={C.yellow} border={C.yellowBorder} />
          <KpiCard label="Total Keluar" value={fmtCompact(summary.totalOutflow)} sub={`Mandor ${fmtCompact(summary.totalWage + summary.totalKasbon)}`} icon={<ArrowUpRight size={20} color={C.red} />} accent={C.red} border={C.redBorder} />
        </>}
      </div>

      {/* Progress bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-grid)" }}>
        <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Progress Fisik</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{summary.latestProgress.toFixed(1)}%</span>
          </div>
          <ProgressBar pct={summary.latestProgress} color={C.green} height={10} />
        </div>
        <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Serapan Anggaran</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.blue }}>{summary.serapan.toFixed(1)}%</span>
          </div>
          <ProgressBar pct={summary.serapan} color={C.blue} height={10} />
        </div>
      </div>

      {/* Kurva S */}
      {data.kurvaSPoints && data.kurvaSPoints.length > 0 && (
        <div>
          <SectionTitle icon={<BarChart3 size={15} color={C.navy} />} title="Kurva S" />
          <div style={{ background: "var(--surface-subtle)", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 8px 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data.kurvaSPoints} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-hover)" />
                <XAxis dataKey="week_number" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} label={{ value: "Minggu", position: "insideBottom", offset: -2, fontSize: 10, fill: C.muted }} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="plan_pct" name="Rencana" stroke={C.blue} strokeWidth={2} strokeDasharray="5 3" dot={false} />
                <Line dataKey="actual_pct" name="Realisasi" stroke={C.green} strokeWidth={2.5} dot={{ r: 3, fill: C.green }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Milestones */}
      {data.milestones && data.milestones.length > 0 && (
        <div>
          <SectionTitle icon={<CheckCircle2 size={15} color={C.navy} />} title="Milestone" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.milestones.map(m => {
              const sm = MILESTONE_STATUS[m.status] ?? { label: m.status, color: C.muted };
              const isOverdue = m.status !== "completed" && new Date(m.target_date) < new Date();
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 6, border: `1px solid ${isOverdue ? C.redBorder : C.border}`, background: isOverdue ? C.redBg : "var(--surface)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOverdue ? C.red : sm.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: isOverdue ? C.red : C.muted }}>{fmtDate(m.target_date)}</div>
                  <StatusBadge label={isOverdue ? "Terlambat" : sm.label} color={isOverdue ? C.red : sm.color} bg={isOverdue ? C.redBg : "var(--surface-hover)"} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mandor Assignments */}
      {data.mandorAssignments && data.mandorAssignments.length > 0 && (
        <div>
          <SectionTitle icon={<Users size={15} color={C.navy} />} title="Mandor & Scope Pekerjaan" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.mandorAssignments.map(a => (
              <div key={a.id} style={{ padding: "12px var(--pad-kartu-lega)", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{a.mandor?.name ?? "—"}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{a.mandor?.phone}</span>
                </div>
                {a.work_scopes?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {a.work_scopes.map((s: { id: string; scope_name: string; payment_system: string; progress_pct_done: number }) => (
                      <div key={s.id} style={{ padding: "4px 8px", borderRadius: 6, background: C.navyLight, fontSize: 11, color: C.navy, fontWeight: 600 }}>
                        {s.scope_name} <span style={{ color: C.muted, fontWeight: 400 }}>· {s.progress_pct_done ?? 0}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice & Termin (keuangan sensitif) */}
      {canViewFinance && data.invoices && data.invoices.length > 0 && (
        <div>
          <SectionTitle icon={<FileText size={15} color={C.navy} />} title="Invoice & Pembayaran" />
          {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).
              `kepalaBaris` di No Invoice — nomor tagihanlah yang menamai barisnya,
              dan itu pula yang dicocokkan orang ke bukti setoran. */}
          <Tabel<Invoice>
              berpermukaan
            caption="Ringkasan invoice: nomor, tipe, total tagihan, jumlah terbayar, sisa, dan status pembayaran."
            data={data.invoices}
            kunciBaris={inv => inv.id}
            kolom={[
              { kunci: "nomor", judul: "No Invoice", kepalaBaris: true, render: inv => <span style={{ fontWeight: 600, color: C.navy }}>{inv.invoice_number}</span> },
              { kunci: "tipe", judul: "Tipe", render: inv => <span style={{ fontSize: 11, color: C.mid }}>{inv.invoice_type === "termin_billing" ? "Termin" : inv.invoice_type}</span> },
              { kunci: "total", judul: "Total", rata: "kanan", render: inv => fmtCompact(Number(inv.total_amount)) },
              { kunci: "terbayar", judul: "Terbayar", rata: "kanan", render: inv => <span style={{ color: C.green }}>{fmtCompact(Number(inv.amount_paid))}</span> },
              { kunci: "sisa", judul: "Sisa", rata: "kanan", render: inv => <span style={{ color: Number(inv.amount_due) > 0 ? C.yellow : C.green }}>{fmtCompact(Number(inv.amount_due))}</span> },
              { kunci: "status", judul: "Status", render: inv => {
                const isPaid = inv.status === "paid";
                return <StatusBadge label={isPaid ? "Lunas" : "Belum Lunas"} color={isPaid ? C.green : C.yellow} bg={isPaid ? C.greenBg : C.yellowBg} />;
              } },
            ]}
          />
        </div>
      )}

      {/* Foto dokumentasi */}
      {data.photos && data.photos.length > 0 && (
        <div>
          <SectionTitle icon={<ImageIcon size={15} color={C.navy} />} title={`Dokumentasi Foto (${data.photos.length})`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {data.photos.slice(0, 12).map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}`, aspectRatio: "4/3", background: "var(--surface-hover)", position: "relative" }}>
                  <img src={p.url} alt={p.caption ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                  {p.caption && (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.6))", padding: "16px 8px 6px", fontSize: 10, color: "var(--surface)", fontWeight: 500 }}>
                      {p.caption}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
          {data.photos.length > 12 && <p style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: "center" }}>+{data.photos.length - 12} foto lainnya — lihat tab Progress & Foto</p>}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Keuangan ────────────────────────────────────────────────────────────
function TabKeuangan({ data }: { data: FinancialData }) {
  const { summary, byProject, invoices } = data;
  const collectionRate = summary.totalInvoiced > 0 ? (summary.totalPaid / summary.totalInvoiced) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {/* KPI */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard label="Total Tagihan" value={fmtCompact(summary.totalInvoiced)} sub={`${invoices.length} invoice`} icon={<FileText size={20} color={C.navy} />} accent={C.navy} />
        <KpiCard label="Terbayar" value={fmtCompact(summary.totalPaid)} sub={`Collection rate ${collectionRate.toFixed(0)}%`} icon={<ArrowDownLeft size={20} color={C.green} />} accent={C.green} border={C.greenBorder} />
        <KpiCard label="Outstanding" value={fmtCompact(summary.totalOutstanding)} sub={`${summary.overdueCount} invoice overdue`} icon={<Clock size={20} color={C.yellow} />} accent={C.yellow} border={C.yellowBorder} />
      </div>

      {/* Collection rate bar */}
      <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Collection Rate</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: collectionRate >= 80 ? C.green : C.yellow }}>{collectionRate.toFixed(1)}%</span>
        </div>
        <ProgressBar pct={collectionRate} color={collectionRate >= 80 ? C.green : C.yellow} height={10} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: C.muted }}>
          <span>Terbayar {fmtCompact(summary.totalPaid)}</span>
          <span>Outstanding {fmtCompact(summary.totalOutstanding)}</span>
        </div>
      </div>

      {/* Per Proyek */}
      {byProject.length > 0 && (
        <div>
          <SectionTitle icon={<Building2 size={15} color={C.navy} />} title="Rekap per Proyek" />
          {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).
              `kepalaBaris` di Proyek — nama proyek yang menamai barisnya. */}
          <Tabel<FinancialData["byProject"][number]>
              berpermukaan
            caption="Piutang per proyek: invoice, total tagihan, terbayar, outstanding, dan persentase pelunasan."
            data={byProject}
            kunciBaris={p => p.id}
            kolom={[
              { kunci: "nama", judul: "Proyek", kepalaBaris: true, render: p => <span style={{ fontWeight: 600 }}>{p.name}</span> },
              { kunci: "count", judul: "Invoice", rata: "tengah", render: p => <span style={{ fontSize: 11, color: C.mid }}>{p.count}</span> },
              { kunci: "invoiced", judul: "Total Tagih", rata: "kanan", render: p => fmtCompact(p.invoiced) },
              { kunci: "paid", judul: "Terbayar", rata: "kanan", render: p => <span style={{ color: C.green }}>{fmtCompact(p.paid)}</span> },
              { kunci: "due", judul: "Outstanding", rata: "kanan", render: p => <span style={{ color: p.due > 0 ? C.yellow : C.green }}>{fmtCompact(p.due)}</span> },
              { kunci: "pct", judul: "%", lebar: 100, render: p => {
                const pct = p.invoiced > 0 ? (p.paid / p.invoiced) * 100 : 0;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1 }}><ProgressBar pct={pct} color={pct >= 80 ? C.green : C.yellow} height={6} /></div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.mid, width: 30, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              } },
            ]}
          />
        </div>
      )}

      {/* Invoice list */}
      <div>
        <SectionTitle icon={<FileText size={15} color={C.navy} />} title="Daftar Invoice" />
        {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).
            Sorotan baris jatuh tempo pindah ke `tandaiBaris` — komponen memakainya
            sebagai latar tetap, jadi hover tak menghapus penandanya seperti dulu.
            Pesan "Tidak ada data" yang dulu <td colSpan> di <tbody> pindah ke prop
            `kosong`: di dalam <tbody> pembaca layar membacakannya seolah itu nama
            sebuah baris data. */}
        <Tabel<Invoice>
              berpermukaan
          caption="Daftar seluruh invoice: nomor, proyek, total, terbayar, sisa, jatuh tempo, dan status."
          data={invoices}
          kunciBaris={inv => inv.id}
          kosong={<div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 12 }}>Tidak ada data</div>}
          tandaiBaris={inv => (
            inv.status !== "paid" && inv.status !== "cancelled" && new Date(inv.due_date) < new Date()
              ? "var(--surface-subtle)" : undefined
          )}
          kolom={[
            { kunci: "nomor", judul: "No Invoice", kepalaBaris: true, render: inv => <span style={{ fontWeight: 600, color: C.navy }}>{inv.invoice_number}</span> },
            { kunci: "proyek", judul: "Proyek", render: inv => <span style={{ fontSize: 11, color: C.mid }}>{(inv as unknown as { projects?: { name: string } }).projects?.name ?? "—"}</span> },
            { kunci: "total", judul: "Total", rata: "kanan", render: inv => fmtCompact(Number(inv.total_amount)) },
            { kunci: "terbayar", judul: "Terbayar", rata: "kanan", render: inv => <span style={{ color: C.green }}>{fmtCompact(Number(inv.amount_paid))}</span> },
            { kunci: "sisa", judul: "Sisa", rata: "kanan", render: inv => <span style={{ color: Number(inv.amount_due) > 0 ? C.yellow : C.green }}>{fmtCompact(Number(inv.amount_due))}</span> },
            { kunci: "tempo", judul: "Jatuh Tempo", render: inv => {
              const overdue = inv.status !== "paid" && inv.status !== "cancelled" && new Date(inv.due_date) < new Date();
              return <span style={{ fontSize: 11, color: overdue ? C.red : C.mid }}>{fmtDate(inv.due_date)}</span>;
            } },
            { kunci: "status", judul: "Status", render: inv => {
              const overdue = inv.status !== "paid" && inv.status !== "cancelled" && new Date(inv.due_date) < new Date();
              return overdue
                ? <StatusBadge label="Overdue" color={C.red} bg={C.redBg} />
                : inv.status === "paid"
                  ? <StatusBadge label="Lunas" color={C.green} bg={C.greenBg} />
                  : <StatusBadge label="Belum Lunas" color={C.yellow} bg={C.yellowBg} />;
            } },
          ]}
        />
      </div>
    </div>
  );
}

// ─── Tab: Cashflow ────────────────────────────────────────────────────────────
function TabCashflow({ data }: { data: CashflowData }) {
  const { summary, byMonth } = data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {/* KPI */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard label="Total Masuk" value={fmtCompact(summary.totalIn)} sub="pembayaran klien" icon={<ArrowDownLeft size={20} color={C.green} />} accent={C.green} border={C.greenBorder} />
        <KpiCard label="Pengeluaran" value={fmtCompact(summary.totalExpense)} sub="pengeluaran proyek" icon={<TrendingDown size={20} color={C.red} />} accent={C.red} border={C.redBorder} />
        <KpiCard label="Upah Mandor" value={fmtCompact(summary.totalWage)} sub="dibayarkan" icon={<Users size={20} color={C.blue} />} accent={C.blue} border={C.blueBorder} />
        <KpiCard label="Kasbon" value={fmtCompact(summary.totalKasbon)} sub="disetujui" icon={<Calendar size={20} color={C.yellow} />} accent={C.yellow} border={C.yellowBorder} />
        <div style={{ flex: 1, minWidth: 160, padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${summary.netFlow >= 0 ? C.greenBorder : C.redBorder}`, background: summary.netFlow >= 0 ? C.greenBg : C.redBg, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, margin: "0 0 4px", textTransform: "uppercase" }}>Net Flow</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: summary.netFlow >= 0 ? C.green : C.red, margin: 0, fontFamily: "var(--font-display)" }}>{summary.netFlow >= 0 ? "+" : ""}{fmtCompact(summary.netFlow)}</p>
        </div>
      </div>

      {/* Chart */}
      {byMonth.length > 0 && (
        <div>
          <SectionTitle icon={<BarChart3 size={15} color={C.navy} />} title="Trend Bulanan" />
          <div style={{ background: "var(--surface-subtle)", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 8px 8px" }}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={byMonth} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-hover)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} />
                <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={72} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="masuk" name="Masuk" fill="var(--success)" fillOpacity={0.85} radius={[4,4,0,0]} />
                <Bar dataKey="keluar" name="Keluar" fill="var(--danger)" fillOpacity={0.85} radius={[4,4,0,0]} />
                <Line dataKey="net" name="Net" stroke={C.navy} strokeWidth={2} dot={{ r: 3, fill: C.navy }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Tabel bulanan */}
          <div style={{ marginTop: 12 }}>
            {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).
                `kepalaBaris` di Periode: di tabel arus kas, periodelah yang menamai
                barisnya — tiga kolom sisanya angka murni. Berbeda dari tabel pajak
                di atas, label periode di sini unik per baris.

                Baris total DITAMBAHKAN lewat prop `total` (jadi <tfoot>): angkanya
                sudah dihitung server di `summary`, tapi dulu hanya tampil sebagai
                KPI di atas grafik dan tak pernah menutup kolomnya sendiri. */}
            <Tabel<CashflowData["byMonth"][number]>
              berpermukaan
              caption="Arus kas per periode: uang masuk, uang keluar, dan selisih bersihnya."
              data={byMonth}
              kunciBaris={row => row.period}
              kolom={[
                { kunci: "label", judul: "Periode", kepalaBaris: true, render: row => <span style={{ fontWeight: 600 }}>{row.label}</span> },
                { kunci: "masuk", judul: "Masuk", rata: "kanan", render: row => <span style={{ color: C.green }}>{fmtCompact(row.masuk)}</span> },
                { kunci: "keluar", judul: "Keluar", rata: "kanan", render: row => <span style={{ color: C.red }}>{fmtCompact(row.keluar)}</span> },
                { kunci: "net", judul: "Net", rata: "kanan", render: row => (
                  <span style={{ fontWeight: 700, color: row.net >= 0 ? C.green : C.red }}>{row.net >= 0 ? "+" : ""}{fmtCompact(row.net)}</span>
                ) },
              ]}
              total={[
                { kunci: "label", isi: "Total periode" },
                { kunci: "masuk", isi: fmtCompact(summary.totalIn), rata: "kanan" },
                { kunci: "keluar", isi: fmtCompact(summary.totalOut), rata: "kanan" },
                { kunci: "net", isi: `${summary.netFlow >= 0 ? "+" : ""}${fmtCompact(summary.netFlow)}`, rata: "kanan" },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Mandor ──────────────────────────────────────────────────────────────
function TabMandor({ data }: { data: MandorReportData }) {
  const { summary, mandorReport } = data;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {/* KPI */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard label="Total Mandor" value={String(summary.totalMandor)} sub="assignment aktif" icon={<Users size={20} color={C.navy} />} accent={C.navy} />
        <KpiCard label="Total Upah" value={fmtCompact(summary.grandTotalWage)} sub="dibayarkan di periode ini" icon={<ArrowUpRight size={20} color={C.blue} />} accent={C.blue} border={C.blueBorder} />
        <KpiCard label="Total Kasbon" value={fmtCompact(summary.grandTotalKasbon)} sub="disetujui di periode ini" icon={<Calendar size={20} color={C.yellow} />} accent={C.yellow} border={C.yellowBorder} />
      </div>

      {/* Mandor list */}
      {mandorReport.length === 0 ? (
        <EmptyState icon={<Users size={32} color={C.muted} />} title="Tidak ada data mandor"
          desc="Laporan ini disusun dari penugasan mandor pada proyek. Tak ada penugasan yang jatuh di rentang tanggal yang dipilih — coba longgarkan periodenya, atau tambahkan penugasan lewat menu Mandor." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mandorReport.map(mr => {
            const expanded = expandedId === mr.assignment.id;
            const mandorName = mr.assignment.mandor?.name ?? "—";
            const projectName = mr.assignment.projects?.name ?? "—";
            const scopes = mr.assignment.work_scopes ?? [];

            return (
              <div key={mr.assignment.id} style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)", overflow: "hidden" }}>
                {/* Header */}
                <div {...dapatDitekan(
                  () => setExpandedId(expanded ? null : mr.assignment.id),
                  `${expanded ? "Tutup" : "Buka"} rincian ${mr.assignment.mandor?.name ?? "mandor"}`,
                  { terbuka: expanded },
                )}
                  style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: expanded ? "var(--surface-subtle)" : "var(--surface)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Users size={16} color={C.navy} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{mandorName}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{projectName} · {mr.assignment.mandor?.phone ?? "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>{fmtCompact(mr.totalWage)} <span style={{ fontWeight: 400, color: C.muted }}>upah</span></div>
                    <div style={{ fontSize: 11, color: C.yellow }}>{fmtCompact(mr.totalKasbon)} kasbon</div>
                  </div>
                  <ChevronDown size={14} color={C.muted} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </div>

                {/* Expanded */}
                {expanded && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Scopes */}
                    {scopes.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8, textTransform: "uppercase" }}>Scope Pekerjaan</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {scopes.map((s: { id: string; scope_name: string; payment_system: string; progress_pct_done: number; status: string }) => (
                            <div key={s.id} style={{ padding: "4px 8px", borderRadius: 6, background: "var(--surface-hover)", fontSize: 11 }}>
                              <span style={{ fontWeight: 600, color: C.text }}>{s.scope_name}</span>
                              <span style={{ color: C.muted }}> · {s.payment_system} · {s.progress_pct_done ?? 0}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Laporan Upah */}
                    {mr.wages.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8, textTransform: "uppercase" }}>Laporan Upah ({mr.wages.length})</div>
                        {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).
                            `kepalaBaris` di Minggu — rentang minggunya yang menamai
                            baris upah; "Dibayar" juga tanggal, tapi ia jawaban, bukan
                            identitas. Total ditambahkan supaya kolom jumlah punya
                            penutup di <tfoot>, bukan hanya angka di kepala kartu. */}
                        <Tabel<WageReport>
              berpermukaan
                          caption="Upah per minggu: jumlah yang diajukan dan status pembayarannya."
                          data={mr.wages}
                          kunciBaris={w => w.id}
                          kolom={[
                            { kunci: "minggu", judul: "Minggu", kepalaBaris: true, render: w => <span style={{ fontSize: 11 }}>{fmtDate(w.week_start)} – {fmtDate(w.week_end)}</span> },
                            { kunci: "jumlah", judul: "Jumlah", rata: "kanan", render: w => <span style={{ fontWeight: 700, color: C.blue }}>{fmtCompact(Number(w.net_amount))}</span> },
                            { kunci: "dibayar", judul: "Dibayar", render: w => <span style={{ fontSize: 11, color: C.muted }}>{fmtDate(w.paid_at)}</span> },
                          ]}
                          total={[
                            { kunci: "label", isi: "Total upah" },
                            { kunci: "jumlah", isi: fmtCompact(mr.totalWage), rata: "kanan" },
                            { kunci: "sisa", isi: "" },
                          ]}
                        />
                      </div>
                    )}

                    {/* Kasbon */}
                    {mr.kasbons.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8, textTransform: "uppercase" }}>Kasbon ({mr.kasbons.length})</div>
                        {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).
                            `kepalaBaris` di Keperluan — itu yang menamai kasbonnya
                            ("Gaji Tukang", "Uang Makan"); tanggal persetujuan tidak. */}
                        <Tabel<Kasbon>
              berpermukaan
                          caption="Kasbon per keperluan: jumlah yang diajukan dan status persetujuannya."
                          data={mr.kasbons}
                          kunciBaris={k => k.id}
                          kolom={[
                            { kunci: "keperluan", judul: "Keperluan", kepalaBaris: true, render: k => <span style={{ fontSize: 11 }}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</span> },
                            { kunci: "jumlah", judul: "Jumlah", rata: "kanan", render: k => <span style={{ fontWeight: 700, color: C.yellow }}>{fmtCompact(Number(k.amount))}</span> },
                            { kunci: "disetujui", judul: "Disetujui", render: k => <span style={{ fontSize: 11, color: C.muted }}>{fmtDate(k.approved_at)}</span> },
                          ]}
                          total={[
                            { kunci: "label", isi: "Total kasbon" },
                            { kunci: "jumlah", isi: fmtCompact(mr.totalKasbon), rata: "kanan" },
                            { kunci: "sisa", isi: "" },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Pengeluaran ─────────────────────────────────────────────────────────
function TabPengeluaran({ data }: { data: ExpensesData }) {
  const { summary, byCategory, byProject, expenses } = data;
  const [expandedCat, setExpandedCat] = React.useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {/* KPI */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard label="Total Pengeluaran" value={fmtCompact(summary.total)} sub={`${summary.count} transaksi`} icon={<TrendingDown size={20} color={C.red} />} accent={C.red} border={C.redBorder} />
        <KpiCard label="Kategori Terbesar" value={byCategory[0]?.name ?? "—"} sub={byCategory[0] ? fmtCompact(byCategory[0].total) : ""} icon={<Layers size={20} color={C.blue} />} accent={C.blue} border={C.blueBorder} />
      </div>

      {/* Breakdown per kategori + pie */}
      {byCategory.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-grid)" }}>
          <div>
            <SectionTitle icon={<Layers size={15} color={C.navy} />} title="Per Kategori" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byCategory.map((c, i) => {
                const pct = summary.total > 0 ? (c.total / summary.total) * 100 : 0;
                const isOpen = expandedCat === c.name;
                const hasSubs = c.subs && c.subs.length > 0;
                return (
                  <div key={i} style={{ borderRadius: 6, border: `1px solid ${isOpen ? C.navy : C.border}`, background: "var(--surface)", overflow: "hidden", transition: "border-color 0.15s" }}>
                    <div
                      role={hasSubs ? "button" : undefined}
                      tabIndex={hasSubs ? 0 : undefined}
                      aria-expanded={hasSubs ? isOpen : undefined}
                      onClick={() => hasSubs && setExpandedCat(isOpen ? null : c.name)}
                      onKeyDown={e => {
                        if (hasSubs && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault()   // Spasi jangan menggulir laporan
                          setExpandedCat(isOpen ? null : c.name)
                        }
                      }}
                      style={{ padding: "8px 12px", cursor: hasSubs ? "pointer" : "default", userSelect: "none" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {hasSubs && (
                            <ChevronDown size={14} color={C.navy} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{c.name}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>{fmtCompact(c.total)}</span>
                      </div>
                      <ProgressBar pct={pct} color={PIE_COLORS[i % PIE_COLORS.length]} height={6} />
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{pct.toFixed(1)}% · {c.count} transaksi{hasSubs ? ` · ${c.subs.length} sub-kategori` : ""}</div>
                    </div>
                    {isOpen && hasSubs && (
                      <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
                        {c.subs.map((s, si) => {
                          const subPct = c.total > 0 ? (s.total / c.total) * 100 : 0;
                          return (
                            <div key={si} style={{ padding: "8px 12px 8px 32px", borderBottom: si < c.subs.length - 1 ? `1px solid ${C.border}` : "none" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: C.text }}>{s.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.red, fontFamily: "monospace" }}>{fmtCompact(s.total)}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                                  <div style={{ width: `${subPct}%`, height: "100%", background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 0 }} />
                                </div>
                                <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{subPct.toFixed(0)}% · {s.count} transaksi</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <SectionTitle icon={<BarChart3 size={15} color={C.navy} />} title="Distribusi" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byCategory} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtCompact(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per proyek */}
      {byProject.length > 1 && (
        <div>
          <SectionTitle icon={<Building2 size={15} color={C.navy} />} title="Per Proyek" />
          {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).
              `kepalaBaris` di Proyek. Baris total ditambahkan lewat prop `total`:
              angkanya sudah ada di `summary`, dan kolom "Total" yang tak pernah
              dijumlahkan mengundang orang menjumlahkannya sendiri di kepala. */}
          <Tabel<ExpensesData["byProject"][number]>
              berpermukaan
            caption="Pengeluaran per proyek: jumlah transaksi, total nilai, dan porsinya terhadap keseluruhan."
            data={byProject}
            kunciBaris={p => p.id}
            kolom={[
              { kunci: "nama", judul: "Proyek", kepalaBaris: true, render: p => <span style={{ fontWeight: 600 }}>{p.name}</span> },
              { kunci: "count", judul: "Transaksi", rata: "tengah", render: p => <span style={{ color: C.muted, fontSize: 11 }}>{p.count}</span> },
              { kunci: "total", judul: "Total", rata: "kanan", render: p => <span style={{ color: C.red }}>{fmtCompact(p.total)}</span> },
              { kunci: "pct", judul: "%", lebar: 100, render: p => {
                const pct = summary.total > 0 ? (p.total / summary.total) * 100 : 0;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1 }}><ProgressBar pct={pct} color={C.red} height={6} /></div>
                    <span style={{ fontSize: 10, width: 28, textAlign: "right", color: C.muted }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              } },
            ]}
            total={[
              { kunci: "label", isi: "Seluruh proyek", rentang: 2 },
              { kunci: "total", isi: fmtCompact(summary.total), rata: "kanan" },
              { kunci: "pct", isi: "100%", rata: "kanan" },
            ]}
          />
        </div>
      )}

      {/* Detail transaksi */}
      <div>
        <SectionTitle icon={<FileText size={15} color={C.navy} />} title={`Detail Pengeluaran (${expenses.length})`} />
        {/* Dipindahkan dari DataTable lokal ke <Tabel> bersama 2026-08-07 (UI-0-4).

            Urutan kolom DITUKAR: Deskripsi naik ke depan, Tanggal turun ke kedua,
            dan `kepalaBaris` jatuh ke Deskripsi. Tanggal tidak menamai apa pun —
            selusin pengeluaran bisa jatuh di hari yang sama, dan pembaca layar
            akan membacakan dua belas baris yang semuanya bernama "3 Agu 2026".
            Deskripsi ("Semen 50 sak", "Sewa molen") itulah yang dicari orang saat
            mencocokkan nota. Preseden yang sama sudah diambil di
            gudang/material-klien (Tanggal → Material).

            Baris total ditambahkan lewat prop `total`. */}
        <Tabel<Expense>
              berpermukaan
          caption="Rincian pengeluaran: deskripsi, tanggal, kategori, vendor, dan jumlah."
          data={expenses}
          kunciBaris={e => e.id}
          kosong={<div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 12 }}>Tidak ada data</div>}
          kolom={[
            { kunci: "deskripsi", judul: "Deskripsi", kepalaBaris: true, render: e => (
              <span style={{ display: "block", fontWeight: 500, maxWidth: 240 }}>{e.description}</span>
            ) },
            { kunci: "tanggal", judul: "Tanggal", render: e => <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{fmtDate(e.expense_date)}</span> },
            { kunci: "kategori", judul: "Kategori", render: e => <span style={{ fontSize: 11, color: C.mid }}>{e.category_label ?? e.category?.name ?? "—"}</span> },
            { kunci: "vendor", judul: "Vendor", render: e => <span style={{ fontSize: 11, color: C.muted }}>{e.vendor_name ?? "—"}</span> },
            { kunci: "jumlah", judul: "Jumlah", rata: "kanan", render: e => <span style={{ fontWeight: 700, color: C.red }}>{fmtCompact(Number(e.total_amount))}</span> },
          ]}
          total={expenses.length > 0 ? [
            { kunci: "label", isi: `Total ${summary.count} transaksi`, rentang: 4 },
            { kunci: "jumlah", isi: fmtCompact(summary.total), rata: "kanan" },
          ] : undefined}
        />
      </div>
    </div>
  );
}

// ─── Tab: Progress & Foto ─────────────────────────────────────────────────────
function TabProgress({ data }: { data: ProgressData }) {
  const { project, milestones, progressLogs, latestProgress } = data;
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Esc adalah konvensi yang orang harapkan dari lightbox mana pun; tanpa ini
  // satu-satunya jalan keluar adalah menemukan tombol X dengan tetikus.
  useTutupEsc(lightboxUrl ? () => setLightboxUrl(null) : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {/* KPI */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard label="Progress Terkini" value={`${latestProgress.toFixed(0)}%`} sub={`${progressLogs.length} entri log`} icon={<Activity size={20} color={C.green} />} accent={C.green} border={C.greenBorder} />
        <KpiCard label="Milestone Selesai" value={`${milestones.filter(m => m.status === "completed").length} / ${milestones.length}`} sub="" icon={<CheckCircle2 size={20} color={C.navy} />} accent={C.navy} />
        <KpiCard label="Milestone Terlambat" value={String(milestones.filter(m => m.status !== "completed" && new Date(m.target_date) < new Date()).length)} sub="" icon={<AlertTriangle size={20} color={C.red} />} accent={C.red} border={C.redBorder} />
      </div>

      {/* Progress bar */}
      <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Progress Fisik — {project.name}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.green }}>{latestProgress.toFixed(1)}%</span>
        </div>
        <ProgressBar pct={latestProgress} color={C.green} height={12} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: C.muted }}>
          <span>Mulai: {fmtDate(project.start_date)}</span>
          <span>Target: {fmtDate(project.end_date)}</span>
        </div>
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <div>
          <SectionTitle icon={<CheckCircle2 size={15} color={C.navy} />} title="Milestone" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {milestones.map(m => {
              const isOverdue = m.status !== "completed" && new Date(m.target_date) < new Date();
              const sm = MILESTONE_STATUS[m.status] ?? { label: m.status, color: C.muted };
              return (
                <div key={m.id} style={{ display: "flex", gap: 12, padding: "8px 12px", borderRadius: 6, border: `1px solid ${isOverdue ? C.redBorder : C.border}`, background: isOverdue ? C.redBg : "var(--surface)" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: isOverdue ? C.red : m.status === "completed" ? C.green : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    {m.status === "completed" && <CheckCircle2 size={12} color="var(--surface)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{m.title}</div>
                    {m.notes && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{m.notes}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: isOverdue ? C.red : C.muted }}>{fmtDate(m.target_date)}</div>
                    <StatusBadge label={isOverdue ? "Terlambat" : sm.label} color={isOverdue ? C.red : sm.color} bg={isOverdue ? C.redBg : "var(--surface-hover)"} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log Progress + Foto */}
      {progressLogs.length > 0 && (
        <div>
          <SectionTitle icon={<Activity size={15} color={C.navy} />} title={`Log Progress (${progressLogs.length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {progressLogs.map(log => {
              const photos = log.project_photos ?? [];
              return (
                <div key={log.id} style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ padding: "12px var(--pad-kartu-lega)", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: C.navyLight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.navy, fontFamily: "var(--font-display)" }}>{Number(log.pct_overall).toFixed(0)}</span>
                      <span style={{ fontSize: 10, color: C.mid }}>%</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{log.logger?.name ?? "—"}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{fmtDate(log.logged_at)}</span>
                      </div>
                      {log.notes && <p style={{ fontSize: 12, color: C.mid, margin: 0 }}>{log.notes}</p>}
                    </div>
                  </div>
                  {photos.length > 0 && (
                    <div style={{ padding: "0 14px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                      {photos.map(p => (
                        <button
                          key={p.id} type="button"
                          onClick={() => setLightboxUrl(p.url)}
                          aria-label={`Lihat foto${p.caption ? `: ${p.caption}` : ""} ukuran penuh`}
                          style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}`, aspectRatio: "4/3", cursor: "pointer", background: "var(--surface-hover)", padding: 0, display: "block", width: "100%" }}>
                          {/* `alt` diisi teks bermakna, bukan `""`. Alt kosong
                              berarti "gambar dekoratif, abaikan" — untuk foto
                              bukti lapangan itu justru menyembunyikannya. */}
                          <img src={p.url} alt={p.caption ?? "Foto progres lapangan"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        // Latar lightbox: menutup saat diklik adalah kenyamanan tetikus.
        // Jalan keluar papan tiknya lewat Esc (`useTutupEsc` di atas) dan
        // tombol X di dalamnya — jadi latarnya TIDAK dijadikan tombol:
        // menambah perhentian Tab untuk area kosong justru memperpanjang
        // jalan menuju tombol yang sebenarnya.
        //
        // `aria-hidden` juga TIDAK dipakai di sini. Versi pertama memasangnya
        // dan itu keliru: ia menyembunyikan seluruh ISI lightbox — tombol
        // tutup dan fotonya sekaligus — dari pembaca layar.
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          {/*
            Backdrop jadi `<button>` SAUDARA di belakang isi, bukan `<div
            onClick>` yang membungkusnya — alasan lengkapnya di
            components/progress-log-list.tsx.

            `tabIndex={-1}` + `aria-hidden` menjaga janji komentar di atas:
            ia tetap tak menambah perhentian Tab. Yang berubah cuma bahwa
            klik-untuk-tutup kini melekat pada elemen yang memang bisa
            diklik, dan gambar tak perlu lagi menahan gelembung.
          */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => setLightboxUrl(null)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", padding: 0, cursor: "zoom-out" }}
          />
          <button aria-label="Tutup pratinjau" onClick={() => setLightboxUrl(null)}
            style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" , zIndex: 2 }}>
            <X size={18} color="var(--surface)" />
          </button>
          <img src={lightboxUrl} alt="Foto lapangan ukuran penuh" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 6, position: "relative", zIndex: 1 }} />
        </div>
      )}
    </div>
  );
}

/**
 * PORTOFOLIO BIAYA — agregasi lintas proyek (ROADMAP #18).
 *
 * ── Keputusan tampilan
 *
 * KETERBATASAN ditampilkan DI ATAS tabel, bukan sebagai catatan kaki. ROADMAP
 * #18 mensyaratkannya eksplisit: angka di sini belum diadu ke realisasi
 * belanja per-material. Angka yang terlihat rapi tanpa peringatan justru yang
 * paling berbahaya — ia mengundang keputusan yang datanya belum sanggup
 * menopang, dan catatan kaki tak pernah dibaca sebelum keputusan diambil.
 *
 * DASAR PEMBANDING ikut ditampilkan per baris. Dua proyek dengan "serapan 40%"
 * bisa berarti hal yang sangat berbeda: satu dibanding rencana BELANJA (RAP),
 * satunya dibanding harga JUAL (RAB) — yang kedua terlihat lebih hemat dari
 * kenyataan. Tanpa kolom ini keduanya tampak setara.
 */
function PortofolioTab() {
  const [data, setData] = useState<{
    projectId: string; nama: string; status: string;
    pagu: number; serapan: number; progressPct: number;
    dasarPembanding: string; serapanPct: number | null;
    deviasiPoin: number | null; sisaPagu: number | null;
  }[]>([]);
  const [meta, setMeta] = useState<{
    jumlahProyek: number; totalKontrak: number; totalPagu: number; totalSerapan: number;
    lewatPagu: number; serapanMendahului: number; tanpaPagu: number; keterbatasan: string[];
  } | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: typeof data; meta: NonNullable<typeof meta> }>("/api/v1/cost-analytics/portfolio")
      .then(r => { setData(r.data.data ?? []); setMeta(r.data.meta); })
      .catch(() => setGalat("Gagal memuat portofolio biaya"))
      .finally(() => setMemuat(false));
  }, []);

  const DASAR_LABEL: Record<string, string> = {
    rap_locked: "RAP (belanja)",
    rab: "RAB (jual)",
    contract_value: "Nilai kontrak",
    tak_ada: "— tak ada",
  };

  if (memuat) return <div style={{ padding: "var(--pad-kartu)", color: C.mid, fontSize: 13 }}>Memuat portofolio…</div>;
  if (galat) return <div style={{ padding: "var(--pad-kartu)", color: C.red, fontSize: 13 }}>{galat}</div>;

  return (
    <div style={{ padding: "var(--pad-kartu)", display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {meta && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard label="Total pagu" value={fmtCompact(meta.totalPagu)}
            sub={`${meta.jumlahProyek} proyek`} icon={<Layers size={20} color={C.navy} />} accent={C.navy} />
          <KpiCard label="Total serapan" value={fmtCompact(meta.totalSerapan)}
            sub="pengeluaran approved" icon={<TrendingDown size={20} color={C.blue} />} accent={C.blue} />
          <KpiCard label="Lewat pagu" value={String(meta.lewatPagu)}
            sub="serapan melampaui rencana" icon={<AlertTriangle size={20} color={meta.lewatPagu > 0 ? C.red : C.green} />}
            accent={meta.lewatPagu > 0 ? C.red : C.green} />
          <KpiCard label="Uang mendahului kerja" value={String(meta.serapanMendahului)}
            sub="serapan > progres +10 poin" icon={<Activity size={20} color={meta.serapanMendahului > 0 ? C.yellow : C.green} />}
            accent={meta.serapanMendahului > 0 ? C.yellow : C.green} />
        </div>
      )}

      {/* Keterbatasan DI ATAS tabel — syarat eksplisit ROADMAP #18. */}
      {meta && meta.keterbatasan.length > 0 && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
          fontSize: 12, color: C.yellow,
        }}>
          <strong>Baca angkanya dengan batas ini:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {meta.keterbatasan.map((k, i) => <li key={i} style={{ marginBottom: 4 }}>{k}</li>)}
          </ul>
        </div>
      )}

      {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Yang dijamin komponen:
          caption sr-only, kolom pertama <th scope="row">, tabular-nums pada kolom
          rata kanan, dan pembungkus overflow-x.

          `kepalaBaris` jatuh ke Proyek — nama proyek yang menamai barisnya bagi
          pembaca layar. Kolom lain semuanya angka; "40%" tanpa nama proyek tak
          memberi tahu apa pun.

          Keadaan kosong pindah ke prop `kosong`, jadi `EmptyState` tak lagi perlu
          percabangan terpisah di sini. */}
      <Tabel<(typeof data)[number]>
              berpermukaan
        caption="Serapan anggaran per proyek: dasar pagu, nilai pagu, serapan, persentase serapan, progres fisik, deviasi, dan sisa pagu."
        data={data}
        kunciBaris={d => d.projectId}
        kosong={
          <EmptyState icon={<Layers size={32} color={C.muted} />} title="Belum ada proyek"
            desc="Serapan anggaran dihitung dari pagu tiap proyek dibandingkan biaya yang sudah keluar. Tabel ini terisi sendiri begitu ada proyek dengan RAB — tak ada yang perlu disiapkan di sini." />
        }
        kolom={[
          { kunci: "nama", judul: "Proyek", kepalaBaris: true, render: d => <span style={{ fontWeight: 600 }}>{d.nama}</span> },
          // Dasar pagu ditulis, bukan disembunyikan: "serapan 40%" berarti berbeda
          // kalau pembandingnya harga jual vs rencana belanja.
          { kunci: "dasar", judul: "Dasar pagu", render: d => (
            <span style={{ fontSize: 11, color: d.dasarPembanding === "rap_locked" ? C.green : C.mid }}>
              {DASAR_LABEL[d.dasarPembanding] ?? d.dasarPembanding}
            </span>
          ) },
          { kunci: "pagu", judul: "Pagu", rata: "kanan", render: d => (d.pagu > 0 ? fmtCompact(d.pagu) : "—") },
          { kunci: "serapan", judul: "Serapan", rata: "kanan", render: d => fmtCompact(d.serapan) },
          { kunci: "serapanPct", judul: "Serapan %", rata: "kanan", render: d => (
            <span style={{ fontWeight: 600, color: d.serapanPct == null ? C.muted : d.serapanPct > 100 ? C.red : C.text }}>
              {d.serapanPct == null ? "—" : `${d.serapanPct}%`}
            </span>
          ) },
          { kunci: "progres", judul: "Progres %", rata: "kanan", render: d => <span style={{ color: C.mid }}>{d.progressPct}%</span> },
          { kunci: "deviasi", judul: "Deviasi", rata: "kanan", render: d => (
            <span style={{ fontWeight: 600, color: d.deviasiPoin == null ? C.muted : d.deviasiPoin > 10 ? C.red : d.deviasiPoin < 0 ? C.green : C.text }}>
              {d.deviasiPoin == null ? "—" : `${d.deviasiPoin > 0 ? "+" : ""}${d.deviasiPoin}`}
            </span>
          ) },
          { kunci: "sisa", judul: "Sisa pagu", rata: "kanan", render: d => (
            <span style={{ color: d.sisaPagu == null ? C.muted : d.sisaPagu < 0 ? C.red : C.text }}>
              {d.sisaPagu == null ? "—" : fmtCompact(d.sisaPagu)}
            </span>
          ) },
        ]}
      />
    </div>
  );
}

/**
 * WIP / PENGAKUAN PENDAPATAN — PSAK 72 (ROADMAP #15).
 *
 * ── Kenapa tab ini ada
 *
 * Termin ditentukan negosiasi, bukan kemajuan pekerjaan. Tanpa WIP, laporan
 * bulanan bergerigi tanpa arti: bulan ber-termin besar terlihat sangat untung,
 * bulan berikutnya terlihat rugi — padahal pekerjaannya berjalan sama.
 *
 * ── Yang paling dijaga di tampilan
 *
 * **BIE ditonjolkan, bukan disembunyikan di kolom terakhir.** BIE adalah uang
 * yang sudah diterima untuk pekerjaan yang BELUM ADA — utang, bukan kas. Inilah
 * sebabnya kontraktor merasa kaya di tengah proyek lalu kehabisan uang di
 * akhir. Menaruhnya sejajar angka lain membuatnya tak terbaca sebagai peringatan.
 *
 * **Keterbatasan di ATAS tabel, bukan catatan kaki.** Catatan kaki tak pernah
 * dibaca sebelum keputusan diambil — pola sama dengan tab Portofolio.
 */
function WipTab() {
  const [data, setData] = useState<{
    projectId: string; nama: string; status: string;
    nilaiKontrak: number; biayaTerjadi: number; totalDitagih: number;
    persenCostToCost: number | null; persenFisik: number;
    metode: string; persenDipakai: number | null;
    pendapatanDiakui: number | null; labaDiakui: number | null; marginPct: number | null;
    cie: number; bie: number; selisihMetodePoin: number | null; peringatan: string[];
  }[]>([]);
  const [meta, setMeta] = useState<{
    jumlahProyek: number; totalKontrak: number; totalPendapatanDiakui: number;
    totalBiaya: number; totalLaba: number; totalCIE: number; totalBIE: number;
    proyekRugi: number; proyekTanpaEstimasiBiaya: number; keterbatasan: string[];
  } | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: typeof data; meta: NonNullable<typeof meta> }>("/api/v1/reports/wip")
      .then(r => { setData(r.data.data ?? []); setMeta(r.data.meta); })
      .catch(() => setGalat("Gagal memuat laporan WIP"))
      .finally(() => setMemuat(false));
  }, []);

  if (memuat) return <div style={{ padding: "var(--pad-kartu)", color: C.mid, fontSize: 13 }}>Memuat laporan WIP…</div>;
  if (galat) return <div style={{ padding: "var(--pad-kartu)", color: C.red, fontSize: 13 }}>{galat}</div>;

  return (
    <div style={{ padding: "var(--pad-kartu)", display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {meta && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <KpiCard label="Pendapatan diakui" value={fmtCompact(meta.totalPendapatanDiakui)}
              sub={`${meta.jumlahProyek} proyek · kontrak ${fmtCompact(meta.totalKontrak)}`}
              icon={<Layers size={20} color={C.navy} />} accent={C.navy} />
            <KpiCard label="Laba diakui" value={fmtCompact(meta.totalLaba)}
              sub={meta.proyekRugi > 0 ? `${meta.proyekRugi} proyek RUGI` : "tak ada proyek rugi"}
              icon={<TrendingDown size={20} color={meta.totalLaba >= 0 ? C.green : C.red} />}
              accent={meta.totalLaba >= 0 ? C.green : C.red} />
            <KpiCard label="CIE — aset" value={fmtCompact(meta.totalCIE)}
              sub="pekerjaan sudah jalan, belum ditagih"
              icon={<FileText size={20} color={C.green} />} accent={C.green} />
            {/* BIE ditonjolkan: ini utang pekerjaan yang terlihat seperti kas. */}
            <KpiCard label="BIE — LIABILITAS" value={fmtCompact(meta.totalBIE)}
              sub="sudah ditagih, pekerjaannya belum ada"
              icon={<TrendingDown size={20} color={C.red} />} accent={C.red} />
          </div>

          {/* Keterbatasan DI ATAS tabel — catatan kaki tak pernah dibaca
              sebelum keputusan diambil. */}
          <div style={{
            padding: "12px var(--pad-kartu-lega)", borderRadius: 10,
            background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 }}>
              Yang harus diketahui sebelum memakai angka ini
            </div>
            {meta.keterbatasan.map((k, i) => (
              <div key={i} style={{ fontSize: 12, color: C.mid, marginTop: 3, lineHeight: 1.5 }}>• {k}</div>
            ))}
          </div>
        </>
      )}

      {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only, scope="row",
          tabular-nums, dan overflow-x dijamin komponen.

          `kepalaBaris` jatuh ke Proyek: nama proyeklah yang menamai barisnya.
          Delapan kolom sisanya angka pengakuan pendapatan — dibacakan tanpa nama
          proyek, tak satu pun bisa ditempatkan.

          Baris proyek RUGI tetap disorot, lewat `tandaiBaris` — komponen memakai
          latarnya sebagai penanda permanen (bukan hover), persis perilaku lama.

          `minWidth: 900` yang dulu dipaku di sini DILEPAS: pembungkus overflow-x
          milik komponen sudah menggeser tabel lebar tanpa mendorong halaman, dan
          lebar minimum yang dipaku justru memaksa scroll horizontal di layar
          sempit meski isinya muat. */}
      <Tabel<(typeof data)[number]>
              berpermukaan
        caption="Pengakuan pendapatan per proyek: metode, persentase penyelesaian, nilai kontrak, pendapatan diakui, biaya, laba, CIE, dan BIE."
        data={data}
        kunciBaris={w => w.projectId}
        tandaiBaris={w => ((w.labaDiakui ?? 0) < 0 ? "var(--danger-bg)" : undefined)}
        kolom={[
          { kunci: "nama", judul: "Proyek", kepalaBaris: true, render: w => (
            <>
              {w.nama}
              {w.peringatan.length > 0 && (
                <span style={{ display: "block", fontSize: 10, color: C.mid, marginTop: 2 }}>
                  {w.peringatan[0]}
                </span>
              )}
            </>
          ) },
          // Metode dibedakan TEKS, bukan warna saja — WCAG 1.4.1.
          // "fisik" lebih lemah di mata auditor, jadi harus terbaca.
          { kunci: "metode", judul: "Metode", render: w => (
            <span style={{
              display: "inline-block", whiteSpace: "nowrap",
              padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
              color: w.metode === "cost_to_cost" ? C.green : C.mid,
              background: w.metode === "cost_to_cost" ? "var(--success-bg)" : "var(--surface-subtle)",
              border: `1px solid ${w.metode === "cost_to_cost" ? "var(--success-border)" : C.border}`,
            }}>
              {w.metode === "cost_to_cost" ? "cost-to-cost" : w.metode === "fisik" ? "fisik" : "—"}
            </span>
          ) },
          { kunci: "persen", judul: "%", render: w => (
            <span style={{ whiteSpace: "nowrap" }}>{w.persenDipakai == null ? "—" : `${w.persenDipakai}%`}</span>
          ) },
          { kunci: "kontrak", judul: "Kontrak", rata: "kanan", render: w => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{fmtCompact(w.nilaiKontrak)}</span>
          ) },
          { kunci: "diakui", judul: "Diakui", rata: "kanan", render: w => (
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{w.pendapatanDiakui == null ? "—" : fmtCompact(w.pendapatanDiakui)}</span>
          ) },
          { kunci: "biaya", judul: "Biaya", rata: "kanan", render: w => (
            <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{fmtCompact(w.biayaTerjadi)}</span>
          ) },
          { kunci: "laba", judul: "Laba", rata: "kanan", render: w => (
            <span style={{ fontWeight: 700, whiteSpace: "nowrap", color: (w.labaDiakui ?? 0) < 0 ? C.red : C.text }}>
              {w.labaDiakui == null ? "—" : fmtCompact(w.labaDiakui)}
            </span>
          ) },
          { kunci: "cie", judul: "CIE", rata: "kanan", render: w => (
            <span style={{ color: w.cie > 0 ? C.green : C.muted, whiteSpace: "nowrap" }}>{w.cie > 0 ? fmtCompact(w.cie) : "—"}</span>
          ) },
          { kunci: "bie", judul: "BIE", rata: "kanan", render: w => (
            <span style={{ whiteSpace: "nowrap", fontWeight: w.bie > 0 ? 700 : 400, color: w.bie > 0 ? C.red : C.muted }}>
              {w.bie > 0 ? fmtCompact(w.bie) : "—"}
            </span>
          ) },
        ]}
      />
    </div>
  );
}

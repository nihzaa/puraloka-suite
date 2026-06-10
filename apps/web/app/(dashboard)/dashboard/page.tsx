"use client";

import { useEffect, useReducer, useState } from "react";
import { api, getStoredUser } from "@/lib/api";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Building2,
  TrendingUp,
  FileText,
  Wallet,
  ArrowDownLeft,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudRain,
  Sun,
  Cloud,
  Users,
  CheckCheck,
  X,
  RefreshCw,
  Landmark,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIs {
  active_projects: number;
  total_contract_value: number;
  invoice_outstanding: number;
  income_this_month: number;
  kasbon_active_total: number;
  net_cash_estimate: number;
}
interface CashflowWeek { week_label: string; income: number; expense: number }
interface StatusDist { status: string; count: number }
interface ActiveProgress { id: string; name: string; progress_pct: number }
interface Invoice {
  id: string; invoice_number: string; amount_due: number;
  due_date: string; status: string;
  projects: { name: string; clients: { contact_person: string } | null } | null;
}
interface Kasbon {
  id: string; amount: number; kasbon_date: string; purpose: string; status: string;
  work_scopes: {
    mandor_assignments: {
      mandor: { name: string } | null;
      projects: { name: string } | null;
    } | null;
  } | null;
}
interface ActivityLog {
  id: string; pct_overall: number; weather: string | null;
  worker_count: number | null; notes: string | null;
  projects: { name: string } | null;
}
interface Milestone {
  id: string; title: string; target_date: string;
  projects: { name: string } | null;
}
interface WorkScope {
  status: string; progress_pct_done: number;
  kasbons: { status: string; amount: number }[];
}
interface MandorAssignment {
  id: string;
  mandor: { name: string } | null;
  projects: { name: string } | null;
  work_scopes: WorkScope[];
}
interface Project {
  id: string; name: string; location: string; status: string;
  progress_pct: number; contract_value: number; end_date: string | null;
  clients: { contact_person: string } | null;
  pm: { name: string } | null;
}
interface TaxSummary {
  reported_count: number; pending_count: number; total_pph: number;
}
interface DashboardData {
  kpis: KPIs;
  alerts: { kasbon_pending: number; invoice_overdue: number; milestone_late: number };
  cashflow_8w: CashflowWeek[];
  status_distribution: StatusDist[];
  active_progress: ActiveProgress[];
  outstanding_invoices: Invoice[];
  pending_kasbons: Kasbon[];
  today_activity: ActivityLog[];
  upcoming_milestones: Milestone[];
  mandor_overview: MandorAssignment[];
  projects_list: Project[];
  tax_summary: TaxSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}jt`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}rb`;
  return String(n);
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "#003366",
  navyMid: "#0050A0",
  navyLight: "#EBF2FF",
  text: "#111827",
  mid: "#6B7280",
  muted: "#9CA3AF",
  border: "#E5E7EB",
  surface: "#FFFFFF",
  bg: "#F8F9FA",
  green: "#15803d",
  greenBg: "#F0FDF4",
  greenBorder: "#BBF7D0",
  red: "#B91C1C",
  redBg: "#FEF2F2",
  redBorder: "#FECACA",
  yellow: "#D97706",
  yellowBg: "#FFFBEB",
  yellowBorder: "#FDE68A",
  blue: "#1D4ED8",
  blueBg: "#EFF6FF",
  blueBorder: "#BFDBFE",
};

const STATUS_COLOR: Record<string, string> = {
  active: C.navy,
  completed: C.green,
  on_hold: C.yellow,
  draft: C.muted,
  cancelled: C.red,
  sent: C.blue,
  partial: C.yellow,
  overdue: C.red,
};
const STATUS_LABEL: Record<string, string> = {
  active: "Aktif", completed: "Selesai", on_hold: "Ditunda",
  draft: "Draft", cancelled: "Batal", sent: "Terkirim",
  partial: "Sebagian", overdue: "Overdue",
};
const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Upah tukang", uang_makan: "Uang makan",
  pembelian_alat: "Beli alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

// ─── Card primitive ───────────────────────────────────────────────────────────

const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  transition: "all 0.15s ease",
  ...extra,
});

const ttStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  color: "#111827",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

function Dot({ color }: { color: string }) {
  return (
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${Math.min(pct, 100)}%`,
        background: `linear-gradient(90deg, #003366, #0066CC)`,
        borderRadius: 4,
        transition: "width 0.5s cubic-bezier(0.16,1,0.3,1)",
      }} />
    </div>
  );
}

function ThinBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 3, background: "#F3F4F6", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg, #003366, #0050A0)`, borderRadius: 99 }} />
    </div>
  );
}

function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 8,
      background: "linear-gradient(90deg, #F3F4F6 0%, #E5E7EB 50%, #F3F4F6 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s ease-in-out infinite",
    }} />
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ ...card({ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }) }}>
      <span style={{ color: C.border }}>{icon}</span>
      <p style={{ fontSize: 12, color: C.muted }}>{text}</p>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>
      <span style={{ width: 3, height: 16, background: C.navy, borderRadius: 2, flexShrink: 0 }} />
      {children}
    </h2>
  );
}

// ─── Period filter ────────────────────────────────────────────────────────────

type Period = "last_30_days" | "last_3_months" | "last_6_months" | "this_year" | "all_time";

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "30 Hari", value: "last_30_days" },
  { label: "3 Bulan", value: "last_3_months" },
  { label: "6 Bulan", value: "last_6_months" },
  { label: "Tahun Ini", value: "this_year" },
  { label: "Semua", value: "all_time" },
];

const PERIOD_LABEL: Record<Period, string> = {
  last_30_days: "30 hari terakhir",
  last_3_months: "3 bulan terakhir",
  last_6_months: "6 bulan terakhir",
  this_year: "tahun ini",
  all_time: "semua waktu",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;

  return <DashboardContent />;
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectTab, setProjectTab] = useState("all");
  const [kasbonBusy, setKasbonBusy] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("last_3_months");

  useEffect(() => {
    fetchData(period);
  }, [period]);

  async function fetchData(p: Period) {
    setLoading(true);
    setError("");
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
    } finally {
      setKasbonBusy(null);
    }
  }

  const alerts = data?.alerts;
  const totalAlerts = alerts ? alerts.kasbon_pending + alerts.invoice_overdue + alerts.milestone_late : 0;
  const filteredProjects = !data ? [] :
    projectTab === "all" ? data.projects_list :
    data.projects_list.filter(p => p.status === projectTab);

  return (
    <div style={{ padding: "32px 36px 64px", width: "100%" }}>

      {/* ── 1. Header ──────────────────────────────────────────────────────────── */}
      <div className="rise" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 24 }}>
        <div>
          <p style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.1, marginBottom: 6 }}>
            {(() => {
              const u = getStoredUser();
              return <>Selamat datang{u && <span style={{ color: C.navy }}>, {u.name.split(" ")[0]}</span>}</>;
            })()}
          </h1>
          {loading ? (
            <Skeleton h={14} w={280} />
          ) : data ? (
            <p style={{ fontSize: 12, color: C.mid }}>
              {data.kpis.active_projects} proyek aktif · nilai kontrak {fmtShort(data.kpis.total_contract_value)}
              {totalAlerts > 0 && <span style={{ color: C.yellow, fontWeight: 500 }}> · {totalAlerts} perlu perhatian</span>}
            </p>
          ) : null}
        </div>

        {/* Period filter */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0, alignSelf: "flex-end", paddingBottom: 2 }}>
          {PERIOD_OPTIONS.map(opt => {
            const active = period === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  border: active ? "1px solid rgba(0,51,102,0.3)" : "1px solid #E5E7EB",
                  background: active ? C.navyLight : "#FFFFFF",
                  color: active ? C.navy : C.mid,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = C.text; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = C.mid; } }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Alert Banners ───────────────────────────────────────────────────── */}
      {alerts && (alerts.invoice_overdue > 0 || alerts.kasbon_pending > 0) && (
        <div className="rise rise-1" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {alerts.invoice_overdue > 0 && (
            <div style={{
              background: C.redBg,
              borderLeft: `3px solid ${C.red}`,
              border: `1px solid ${C.redBorder}`,
              borderRadius: 8,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: "#991B1B", flex: 1 }}>
                <span style={{ fontWeight: 700 }}>{alerts.invoice_overdue} invoice overdue</span>
                {" "}· segera tindak lanjuti pembayaran
              </p>
              <span style={{
                background: C.red, color: "#fff", borderRadius: "50%",
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{alerts.invoice_overdue}</span>
            </div>
          )}
          {alerts.kasbon_pending > 0 && (
            <div style={{
              background: C.yellowBg,
              borderLeft: `3px solid ${C.yellow}`,
              border: `1px solid ${C.yellowBorder}`,
              borderRadius: 8,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <AlertTriangle size={16} style={{ color: C.yellow, flexShrink: 0 }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: "#92400E", flex: 1 }}>
                <span style={{ fontWeight: 700 }}>{alerts.kasbon_pending} kasbon menunggu persetujuan</span>
              </p>
              <span style={{
                background: C.yellow, color: "#fff", borderRadius: "50%",
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{alerts.kasbon_pending}</span>
            </div>
          )}
        </div>
      )}

      {/* ── 3. KPI Grid ────────────────────────────────────────────────────────── */}
      <div className="rise rise-2" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
        <KPICard
          icon={<Building2 size={18} />}
          label="Proyek Aktif"
          value={loading ? "—" : String(data?.kpis.active_projects ?? 0)}
          accent={C.navy}
        />
        <KPICard
          icon={<TrendingUp size={18} />}
          label="Total Nilai Kontrak"
          value={loading ? "—" : fmtShort(data?.kpis.total_contract_value ?? 0)}
          accent={C.text}
        />
        <KPICard
          icon={<FileText size={18} />}
          label="Invoice Outstanding"
          value={loading ? "—" : fmtShort(data?.kpis.invoice_outstanding ?? 0)}
          accent={data?.alerts.invoice_overdue ? C.yellow : C.green}
        />
        <KPICard
          icon={<ArrowDownLeft size={18} />}
          label="Uang Masuk Periode Ini"
          value={loading ? "—" : fmtShort(data?.kpis.income_this_month ?? 0)}
          accent={C.green}
        />
        <KPICard
          icon={<Wallet size={18} />}
          label="Kasbon Berjalan"
          value={loading ? "—" : fmtShort(data?.kpis.kasbon_active_total ?? 0)}
          accent={C.text}
        />
        <KPICard
          icon={<BarChart2 size={18} />}
          label="Estimasi Kas Bersih"
          value={loading ? "—" : fmtShort(data?.kpis.net_cash_estimate ?? 0)}
          accent={(data?.kpis.net_cash_estimate ?? 0) >= 0 ? C.green : C.red}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "10px 16px", color: C.red, fontSize: 12, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
          {error}
          <button onClick={() => fetchData(period)} style={{ color: C.navy, background: "none", border: "none", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            <RefreshCw size={11} /> Coba lagi
          </button>
        </div>
      )}

      {/* ── 4. Cashflow Chart ──────────────────────────────────────────────────── */}
      <div className="rise rise-3" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <H2>Arus Kas</H2>
          <span style={{ fontSize: 11, color: C.muted }}>{PERIOD_LABEL[period]}</span>
        </div>
        <div style={{ ...card({ padding: "24px 20px 20px" }) }}>
          <div style={{ display: "flex", gap: 18, marginBottom: 16, paddingLeft: 2 }}>
            <LegendDot color={C.navy} label="Pemasukan" />
            <LegendDot color={C.red} label="Kasbon Keluar" />
          </div>
          {loading ? <Skeleton h={240} /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data?.cashflow_8w ?? []} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.navy} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={C.navy} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.red} stopOpacity={0.08} />
                    <stop offset="95%" stopColor={C.red} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week_label" stroke="transparent" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="transparent" tick={{ fill: "#9CA3AF", fontSize: 11 }} tickFormatter={fmtShort} width={44} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttStyle} formatter={((v: number, name: string) => [fmt(v), name === "income" ? "Pemasukan" : "Kasbon Keluar"]) as never} />
                <Area type="monotone" dataKey="income" stroke={C.navy} strokeWidth={2.5} fill="url(#incomeGrad)" dot={false} />
                <Area type="monotone" dataKey="expense" stroke={C.red} strokeWidth={2.5} fill="url(#expenseGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {data && (
            <div style={{ display: "flex", gap: 12, padding: "16px 0 0", borderTop: "1px solid #F3F4F6", marginTop: 12 }}>
              <ChartMetric label={`Pemasukan (${PERIOD_LABEL[period]})`} value={fmt(data.kpis.income_this_month)} color={C.navy} />
              <ChartMetric label="Kasbon aktif" value={fmt(data.kpis.kasbon_active_total)} color={C.red} />
              <ChartMetric label="Selisih" value={fmt(data.kpis.net_cash_estimate)} color={data.kpis.net_cash_estimate >= 0 ? C.green : C.red} />
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Donut + Progress ────────────────────────────────────────────────── */}
      <div className="rise rise-3" style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 16, marginBottom: 20 }}>
        {/* Donut */}
        <div style={{ ...card({ padding: 24 }) }}>
          <H2>Distribusi Status</H2>
          {loading ? <Skeleton h={160} /> : (
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <PieChart width={148} height={148}>
                  <Pie
                    data={data?.status_distribution ?? []}
                    dataKey="count"
                    cx={74} cy={74}
                    innerRadius={46} outerRadius={68}
                    paddingAngle={3} strokeWidth={0}
                  >
                    {(data?.status_distribution ?? []).map((e, i) => (
                      <Cell key={i} fill={STATUS_COLOR[e.status] ?? C.muted} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={ttStyle} formatter={((v: number) => [v, ""]) as never} />
                </PieChart>
                <div style={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center", pointerEvents: "none",
                }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1 }}>
                    {(data?.status_distribution ?? []).reduce((s, e) => s + e.count, 0)}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Proyek</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {(data?.status_distribution ?? []).map(e => (
                  <div key={e.status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Dot color={STATUS_COLOR[e.status] ?? C.muted} />
                    <span style={{ fontSize: 12, color: C.mid, flex: 1 }}>{STATUS_LABEL[e.status] ?? e.status}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Progress bars */}
        <div style={{ ...card({ padding: 24 }) }}>
          <H2>Progress Proyek Aktif</H2>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[1,2,3].map(i => <Skeleton key={i} h={40} />)}
            </div>
          ) : !data?.active_progress.length ? (
            <p style={{ fontSize: 12, color: C.muted }}>Tidak ada proyek aktif.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data.active_progress.map((p, idx) => (
                <div key={p.id} style={{
                  paddingTop: idx === 0 ? 0 : 14,
                  paddingBottom: 14,
                  borderBottom: idx < data.active_progress.length - 1 ? "1px solid #F3F4F6" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 12 }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.navy, flexShrink: 0, minWidth: 40, textAlign: "right" }}>{p.progress_pct}%</span>
                  </div>
                  <ProgressBar pct={p.progress_pct} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 6. Invoice Table ───────────────────────────────────────────────────── */}
      <div className="rise rise-4" style={{ marginBottom: 20 }}>
        <H2>Invoice Belum Lunas</H2>
        {loading ? <Skeleton h={160} /> :
         !data?.outstanding_invoices.length ? <Empty icon={<CheckCircle2 size={22} />} text="Semua invoice sudah lunas." /> : (
          <div style={{ ...card({ overflow: "hidden", padding: 0 }) }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  {["No. Invoice", "Proyek", "Klien", "Sisa Tagihan", "Jatuh Tempo", "Status"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: i >= 3 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.outstanding_invoices.map(inv => {
                  const days = daysUntil(inv.due_date);
                  const overdue = days < 0, urgent = days >= 0 && days <= 3;
                  return (
                    <tr key={inv.id}
                      style={{
                        borderLeft: overdue ? `2px solid ${C.red}` : urgent ? `2px solid ${C.yellow}` : "2px solid transparent",
                        background: overdue ? C.redBg : urgent ? C.yellowBg : "transparent",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={e => { if (!overdue && !urgent) e.currentTarget.style.background = "#FAFBFF"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = overdue ? C.redBg : urgent ? C.yellowBg : "transparent"; }}
                    >
                      <td style={{ padding: "14px 16px", color: C.navy, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td style={{ padding: "14px 16px", color: C.text }}>{inv.projects?.name ?? "—"}</td>
                      <td style={{ padding: "14px 16px", color: C.mid }}>{inv.projects?.clients?.contact_person ?? "—"}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "monospace" }}>{fmt(inv.amount_due)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", color: overdue ? C.red : urgent ? C.yellow : C.mid, fontSize: 11 }}>
                        <Clock size={10} style={{ display: "inline", marginRight: 3 }} />{fmtDate(inv.due_date)}
                        {overdue && <span style={{ marginLeft: 4, fontSize: 9.5 }}>({Math.abs(days)}h lalu)</span>}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 7. Kasbon Pending ──────────────────────────────────────────────────── */}
      <div className="rise rise-4" style={{ marginBottom: 20 }}>
        <H2>Kasbon Menunggu Persetujuan</H2>
        {loading ? <Skeleton h={130} /> :
         !data?.pending_kasbons.length ? <Empty icon={<CheckCheck size={22} />} text="Tidak ada kasbon pending." /> : (
          <div style={{ ...card({ overflow: "hidden", padding: 0 }) }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  {["Mandor", "Proyek", "Tujuan", "Jumlah", "Tanggal", "Aksi"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: i >= 3 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pending_kasbons.map(k => {
                  const mandor = k.work_scopes?.mandor_assignments?.mandor?.name ?? "—";
                  const project = k.work_scopes?.mandor_assignments?.projects?.name ?? "—";
                  return (
                    <tr key={k.id}
                      style={{ transition: "background 0.12s", borderBottom: "1px solid #F3F4F6" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#FAFBFF"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "14px 16px", color: C.text, fontWeight: 500 }}>{mandor}</td>
                      <td style={{ padding: "14px 16px", color: C.mid }}>{project}</td>
                      <td style={{ padding: "14px 16px", color: C.mid }}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", color: C.yellow, fontWeight: 600, fontFamily: "monospace" }}>{fmt(k.amount)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", color: C.muted, fontSize: 11 }}>{fmtDate(k.kasbon_date)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <ApproveBtn disabled={kasbonBusy === k.id} onClick={() => handleKasbon(k.id, "approved")}>
                            <CheckCheck size={11} />Setuju
                          </ApproveBtn>
                          <RejectBtn disabled={kasbonBusy === k.id} onClick={() => handleKasbon(k.id, "rejected")}>
                            <X size={11} />Tolak
                          </RejectBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 8. Today Activity ──────────────────────────────────────────────────── */}
      <div className="rise rise-5" style={{ marginBottom: 20 }}>
        <H2>Aktivitas Lapangan Hari Ini</H2>
        {loading ? (
          <div style={{ display: "flex", gap: 12 }}>{[1,2,3].map(i => <Skeleton key={i} h={100} w={220} />)}</div>
        ) : !data?.today_activity.length ? <Empty icon={<Sun size={22} />} text="Belum ada laporan hari ini." /> : (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {data.today_activity.map(log => (
              <div key={log.id} style={{ ...card({ borderRadius: 10, padding: "14px 16px", minWidth: 220, flexShrink: 0 }) }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {log.projects?.name ?? "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: C.navy, fontFamily: "var(--font-display)" }}>{log.pct_overall}%</span>
                  <div>
                    {log.weather && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, color: C.muted, fontSize: 10.5 }}>
                        {log.weather === "Cerah" ? <Sun size={12} /> : log.weather === "Hujan" ? <CloudRain size={12} /> : <Cloud size={12} />}
                        {log.weather}
                      </div>
                    )}
                    {log.worker_count !== null && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, color: C.muted, fontSize: 10.5 }}>
                        <Users size={11} />{log.worker_count} pekerja
                      </div>
                    )}
                  </div>
                </div>
                {log.notes && (
                  <p style={{ fontSize: 10.5, color: C.mid, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {log.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 9. Projects Table ──────────────────────────────────────────────────── */}
      <div className="rise rise-5" style={{ marginBottom: 20 }}>
        <H2>Daftar Proyek</H2>
        <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
          {["all", "active", "on_hold", "draft", "completed"].map(tab => {
            const active = projectTab === tab;
            return (
              <button key={tab} onClick={() => setProjectTab(tab)}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: active ? 600 : 400,
                  border: "none", borderBottom: active ? `2px solid ${C.navy}` : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.12s",
                  background: "transparent",
                  color: active ? C.navy : C.mid,
                  borderRadius: "4px 4px 0 0",
                }}
              >
                {tab === "all" ? "Semua" : STATUS_LABEL[tab]}
                {data && (
                  <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.65 }}>
                    {tab === "all" ? data.projects_list.length : data.projects_list.filter(p => p.status === tab).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {loading ? <Skeleton h={200} /> :
         !filteredProjects.length ? <Empty icon={<Building2 size={22} />} text="Tidak ada proyek." /> : (
          <div style={{ ...card({ overflow: "hidden", padding: 0 }) }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  {["Nama Proyek", "Klien", "PM", "Status", "Progress", "Nilai Kontrak", "Tenggat"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: i >= 4 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(p => (
                  <tr key={p.id}
                    style={{ transition: "background 0.12s", borderBottom: "1px solid #F3F4F6" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FAFBFF"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 500, color: C.text }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{p.location}</div>
                    </td>
                    <td style={{ padding: "14px 16px", color: C.mid }}>{p.clients?.contact_person ?? "—"}</td>
                    <td style={{ padding: "14px 16px", color: C.mid }}>{p.pm?.name ?? "—"}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <StatusBadge status={p.status} />
                    </td>
                    <td style={{ padding: "14px 16px", minWidth: 120 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}><ThinBar pct={Number(p.progress_pct)} /></div>
                        <span style={{ fontSize: 11, color: C.navy, flexShrink: 0, fontWeight: 600 }}>{p.progress_pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "monospace" }}>{fmt(p.contract_value)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right", color: C.muted, fontSize: 11 }}>{p.end_date ? fmtDate(p.end_date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 10. Milestones Timeline ────────────────────────────────────────────── */}
      <div className="rise rise-6" style={{ marginBottom: 20 }}>
        <H2>Milestone 14 Hari ke Depan</H2>
        {loading ? <Skeleton h={140} /> :
         !data?.upcoming_milestones.length ? <Empty icon={<CheckCircle2 size={22} />} text="Tidak ada milestone mendatang." /> : (
          <div style={{ paddingLeft: 16, position: "relative" }}>
            <div style={{ position: "absolute", left: 19, top: 8, bottom: 8, width: 2, background: "#E5E7EB" }} />
            {data.upcoming_milestones.map(m => {
              const days = daysUntil(m.target_date);
              const overdue = days < 0, urgent = !overdue && days <= 3;
              const c = overdue ? C.red : urgent ? C.yellow : C.green;
              return (
                <div key={m.id} style={{ display: "flex", gap: 16, paddingBottom: 14, position: "relative" }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: c,
                    flexShrink: 0, marginTop: 8, position: "relative", zIndex: 1,
                    border: "2px solid #F8F9FA",
                  }} />
                  <div
                    style={{ ...card({ borderRadius: 10, padding: "10px 16px", flex: 1 }) }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{m.title}</div>
                        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{m.projects?.name ?? "—"}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: c, fontWeight: 600 }}>
                          {overdue ? `${Math.abs(days)}h terlambat` : days === 0 ? "Hari ini" : `${days} hari lagi`}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>{fmtDate(m.target_date)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 11. Mandor Overview ────────────────────────────────────────────────── */}
      <div className="rise rise-6" style={{ marginBottom: 20 }}>
        <H2>Overview Mandor Aktif</H2>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {[1,2,3].map(i => <Skeleton key={i} h={140} />)}
          </div>
        ) : !data?.mandor_overview.length ? <Empty icon={<Users size={22} />} text="Tidak ada mandor aktif." /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {data.mandor_overview.map(ma => {
              const scopes = ma.work_scopes ?? [];
              const activeScopes = scopes.filter(s => s.status === "active");
              const kasbonTotal = scopes
                .flatMap(s => s.kasbons ?? [])
                .filter(k => ["pending","approved"].includes(k.status))
                .reduce((s, k) => s + Number(k.amount ?? 0), 0);
              const avgPct = activeScopes.length
                ? Math.round(activeScopes.reduce((s, sc) => s + Number(sc.progress_pct_done ?? 0), 0) / activeScopes.length)
                : 0;
              return (
                <div key={ma.id}
                  style={{ ...card({ borderRadius: 12, padding: 16 }) }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: C.navyLight,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 13, fontWeight: 700, color: C.navy,
                    }}>
                      {(ma.mandor?.name ?? "?").charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ma.mandor?.name ?? "—"}</div>
                      <div style={{ fontSize: 10.5, color: C.muted }}>{ma.projects?.name ?? "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 18, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 9.5, color: C.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Kasbon</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: kasbonTotal > 0 ? C.yellow : C.mid }}>{fmtShort(kasbonTotal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, color: C.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Scope Aktif</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{activeScopes.length}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 9.5, color: C.muted, marginBottom: 5 }}>Progress rata-rata</div>
                  <ProgressBar pct={avgPct} />
                  <div style={{ fontSize: 11, color: C.navy, marginTop: 4, textAlign: "right", fontWeight: 600 }}>{avgPct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 12. Tax Summary ────────────────────────────────────────────────────── */}
      <div className="rise rise-6">
        <H2>Ringkasan Pajak (PPh Final)</H2>
        <TaxDeadlineBanner />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          <TaxMetricCard
            label="Sudah Dilaporkan"
            value={loading ? "—" : String(data?.tax_summary.reported_count ?? 0)}
            sub="transaksi"
            color={C.green}
            icon={<CheckCircle2 size={16} />}
          />
          <TaxMetricCard
            label="Belum Dilaporkan"
            value={loading ? "—" : String(data?.tax_summary.pending_count ?? 0)}
            sub="transaksi"
            color={data?.tax_summary.pending_count ? C.yellow : C.muted}
            icon={<Clock size={16} />}
          />
          <TaxMetricCard
            label="Total PPh Tahun Ini"
            value={loading ? "—" : fmtShort(data?.tax_summary.total_pph ?? 0)}
            sub="tarif 2%"
            color={C.navy}
            icon={<Landmark size={16} />}
          />
        </div>
      </div>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "all 0.15s ease",
        cursor: "default",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,51,102,0.10)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 8 }}>{label}</span>
        <span style={{ color: "rgba(0,51,102,0.25)", marginTop: 2 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 11, color: "#6B7280" }}>{label}</span>
    </div>
  );
}

function ChartMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#F9FAFB", border: "1px solid #E5E7EB",
      borderRadius: 8, padding: "8px 14px", flex: 1,
    }}>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    sent:      { background: "#EFF6FF", color: "#1D4ED8" },
    overdue:   { background: "#FEF2F2", color: "#B91C1C" },
    partial:   { background: "#FFFBEB", color: "#D97706" },
    active:    { background: "#EBF2FF", color: "#003366" },
    completed: { background: "#F0FDF4", color: "#15803d" },
    on_hold:   { background: "#FFFBEB", color: "#D97706" },
    draft:     { background: "#F9FAFB", color: "#6B7280" },
    cancelled: { background: "#FEF2F2", color: "#B91C1C" },
  };
  const s = styles[status] ?? { background: "#F3F4F6", color: "#6B7280" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 500,
      ...s,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.color }} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ApproveBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
        background: "#F0FDF4", color: "#15803d", border: "1px solid #BBF7D0",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.12s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "#DCFCE7"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#F0FDF4"; }}
    >
      {children}
    </button>
  );
}

function RejectBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
        background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.12s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "#FEE2E2"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#FEF2F2"; }}
    >
      {children}
    </button>
  );
}

function TaxMetricCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #E5E7EB",
      borderRadius: 12,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</span>
        <span style={{ color, opacity: 0.5 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "#111827" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function TaxDeadlineBanner() {
  const today = new Date();
  const deadline = new Date(today.getFullYear(), today.getMonth() + 1, 10);
  const days = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
  if (days > 14) return null;
  return (
    <div style={{
      background: "#FFFBEB",
      border: "1px solid #FDE68A",
      borderRadius: 8,
      padding: "8px 14px",
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    }}>
      <Landmark size={12} style={{ color: "#D97706", flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "#92400E" }}>
        Batas setor PPh Final:{" "}
        <strong style={{ color: "#D97706" }}>
          10 {deadline.toLocaleDateString("id-ID", { month: "long" })}
        </strong>{" "}
        ({days} hari lagi)
      </span>
    </div>
  );
}

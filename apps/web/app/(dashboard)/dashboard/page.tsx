"use client";

import Link from "next/link";
import { dapatDitekan } from "@/lib/dapat-ditekan";
import { useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { KartuKPI } from "@/components/ui-dasar";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Building2, TrendingUp, FileText, BarChart2,
  AlertTriangle, CheckCircle2, Clock, CheckCheck,
  X, RefreshCw, Landmark, ArrowRight, Target,
  ChevronRight,
} from "lucide-react";
import { DashboardGrid } from "@/components/dashboard-grid";

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
  project?: { id: string; name: string } | null;
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
interface DashboardData {
  kpis: KPIs;
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

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

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
          <span style={{ fontSize: 11, fontWeight: 700, background: C.navy, color: "#fff", borderRadius: 99, padding: "0px 6px" }}>{count}</span>
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
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
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

  useEffect(() => { fetchData(period); }, [period]);

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
  const sparkMasuk = (data?.cashflow_8w ?? []).map((w) => w.income);
  const sparkBersih = (data?.cashflow_8w ?? []).map((w) => w.income - w.expense);

  const kpiWidget = (
    <div style={{
      padding: "var(--pad-kartu-lega)",
      display: "grid", gap: "var(--gap-grid)",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      height: "100%", alignContent: "start",
    }}>
      <KartuKPI
        label="Proyek aktif"
        nilai={loading ? "—" : String(data?.kpis.active_projects ?? 0)}
        nilaiAngka={loading ? undefined : data?.kpis.active_projects ?? 0}
        keterangan="sedang berjalan"
        ikon={<Building2 size={15} />}
        onClick={() => router.push("/proyek")}
      />
      <KartuKPI
        label="Nilai kontrak"
        nilai={loading ? "—" : `Rp ${fmtShort(data?.kpis.total_contract_value ?? 0)}`}
        keterangan={PERIOD_LABEL[period]}
        ikon={<TrendingUp size={15} />}
        onClick={() => router.push("/proyek")}
      />
      <KartuKPI
        label="Invoice belum lunas"
        nilai={loading ? "—" : `Rp ${fmtShort(data?.kpis.invoice_outstanding ?? 0)}`}
        keterangan={adaOverdue
          ? `${alerts!.invoice_overdue} lewat jatuh tempo`
          : "semua masih dalam tenggat"}
        ikon={<FileText size={15} />}
        spark={sparkMasuk.length > 1 ? sparkMasuk : undefined}
        sorot={adaOverdue}
        onClick={() => router.push("/keuangan")}
      />
      <KartuKPI
        label="Estimasi kas bersih"
        nilai={loading ? "—" : `Rp ${fmtShort(Math.abs(kasBersih))}`}
        keterangan={kasBersih >= 0 ? "surplus" : "defisit"}
        ikon={<BarChart2 size={15} />}
        spark={sparkBersih.length > 1 ? sparkBersih : undefined}
        // Disorot hanya bila TAK ada yang lebih mendesak — satu sorot per layar.
        sorot={!adaOverdue}
        onClick={() => router.push("/kas")}
      />
    </div>
  );

  const cashflowWidget = (
    <div style={{ padding: "20px 20px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionHeader title="Arus Kas" linkLabel="Lihat detail" linkHref="/kas" />
        <span style={{ fontSize: 11, color: C.muted }}>{PERIOD_LABEL[period]}</span>
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
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
    <div style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <SectionHeader title="Status Proyek" />
        {loading ? <Skeleton h={120} /> : (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
      <div style={{ flex: 1 }}>
        <SectionHeader title="Progress Aktif" linkLabel="Semua" linkHref="/proyek" />
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map(i => <Skeleton key={i} h={36} />)}
          </div>
        ) : !data?.active_progress.length ? (
          <p style={{ fontSize: 12, color: C.muted }}>Tidak ada proyek aktif.</p>
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                {["Invoice", "Proyek · Klien", "Sisa", "Jatuh Tempo"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: i >= 2 ? "right" : "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: C.muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.outstanding_invoices.slice(0, 5).map(inv => {
                const days = daysUntil(inv.due_date);
                const overdue = days < 0, urgent = days >= 0 && days <= 3;
                return (
                  <tr key={inv.id} style={{
                    background: overdue ? C.redBg : urgent ? C.yellowBg : "transparent",
                    borderLeft: overdue ? `3px solid ${C.red}` : urgent ? `3px solid ${C.yellow}` : "3px solid transparent",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <td style={{ padding: "12px 16px", color: C.navy, fontSize: 11, fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ color: C.text, fontWeight: 500 }}>{inv.projects?.name ?? "—"}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{inv.projects?.clients?.contact_person ?? "—"}</div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: C.text, fontWeight: 600 }}>{`Rp ${fmtShort(inv.amount_due)}`}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <span style={{ fontSize: 11, color: overdue ? C.red : urgent ? C.yellow : C.muted, fontWeight: overdue || urgent ? 600 : 400 }}>
                        {overdue ? `${Math.abs(days)}h lalu` : days === 0 ? "Hari ini" : fmtDate(inv.due_date)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

  const milestoneWidget = (
    <div style={{ padding: 20, height: "100%" }}>
      <SectionHeader title="Milestone Mendatang" linkLabel="Kalender" linkHref="/kalender" />
      {loading ? <Skeleton h={160} /> :
       !data?.upcoming_milestones.length ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <CheckCircle2 size={20} style={{ color: "var(--border)", marginBottom: 6 }} />
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Tidak ada milestone mendatang.</p>
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 14 }}>
          <div style={{ position: "absolute", left: 3, top: 6, bottom: 0, width: 2, background: "var(--border)" }} />
          {data.upcoming_milestones.slice(0, 6).map(m => {
            const days = daysUntil(m.target_date);
            const overdue = days < 0, urgent = !overdue && days <= 3;
            const c = overdue ? C.red : urgent ? C.yellow : C.green;
            return (
              <Link
                key={m.id}
                href={m.projects?.id ? `/proyek/${m.projects.id}#sec-milestone` : "#"}
                style={{ display: "flex", gap: 8, paddingBottom: 14, cursor: "pointer", color: "inherit", textDecoration: "none" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0, marginTop: 4, position: "relative", zIndex: 1, border: "2px solid var(--bg)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{m.projects?.name ?? "—"}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: c, marginTop: 2 }}>
                    {overdue ? `${Math.abs(days)}h terlambat` : days === 0 ? "Hari ini" : `${days}h lagi`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  const kasbonWidget = (loading || (data?.pending_kasbons.length ?? 0) > 0) ? (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 0" }}>
        <SectionHeader title="Kasbon Menunggu Persetujuan" linkLabel="Ke Mandor" linkHref="/mandor" count={data?.pending_kasbons.length} />
      </div>
      {loading ? <div style={{ padding: "0 20px 20px" }}><Skeleton h={100} /></div> : (
        <div style={{ overflowX: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                {["Mandor", "Proyek", "Tujuan", "Jumlah", "Tgl Ajuan", "Aksi"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: i >= 3 ? "right" : "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: C.muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data!.pending_kasbons.slice(0, 5).map(k => {
                const mandor  = k.work_scopes?.mandor_assignments?.mandor?.name ?? "—";
                const project = k.work_scopes?.mandor_assignments?.projects?.name ?? k.project?.name ?? "—";
                return (
                  <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 500, color: C.text }}>{mandor}</td>
                    <td style={{ padding: "12px 16px", color: C.mid }}>{project}</td>
                    <td style={{ padding: "12px 16px", color: C.mid }}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: C.yellow, fontWeight: 700 }}>{`Rp ${fmtShort(k.amount)}`}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: C.muted }}>{fmtDate(k.kasbon_date)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

  const taxWidget = (
    <div style={{ padding: 20 }}>
      <SectionHeader title="Ringkasan Pajak (PPh Final)" />
      <TaxDeadlineBanner />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <TaxCard label="Sudah Dilaporkan"  value={loading ? null : String(data?.tax_summary.reported_count ?? 0)} sub="transaksi" color={C.green}  icon={<CheckCircle2 size={15} />} />
        <TaxCard label="Belum Dilaporkan"  value={loading ? null : String(data?.tax_summary.pending_count ?? 0)}  sub="transaksi" color={data?.tax_summary.pending_count ? C.yellow : C.muted} icon={<Clock size={15} />} />
        <TaxCard label="Total PPh Tahun Ini" value={loading ? null : `Rp ${fmtShort(data?.tax_summary.total_pph ?? 0)}`} sub="tarif 2%" color={C.navy} icon={<Landmark size={15} />} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rise" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 16 }}>
        <div>
          <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1.1, margin: "0 0 4px" }}>
            Selamat datang{user && <span style={{ color: C.navy }}>, {user.name.split(" ")[0]}</span>}
          </h1>
          {loading
            ? <Skeleton h={13} w={260} />
            : data && (
              <p style={{ fontSize: 12, color: C.mid, margin: 0 }}>
                {data.kpis.active_projects} proyek aktif · nilai kontrak {fmtShort(data.kpis.total_contract_value)}
                {totalAlerts > 0 && <span style={{ color: C.yellow, fontWeight: 600 }}> · {totalAlerts} perlu perhatian</span>}
              </p>
            )
          }
        </div>

        {/* Period pills */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {PERIODS.map(opt => {
            const active = period === opt.value;
            return (
              <button key={opt.value} onClick={() => setPeriod(opt.value)} style={{
                padding: "4px 12px", borderRadius: 999, fontSize: 11,
                fontWeight: active ? 600 : 400,
                border: active ? "1px solid rgba(0,51,102,0.25)" : "1px solid var(--border)",
                background: active ? C.navyLight : "var(--surface)",
                color: active ? C.navy : C.mid,
                cursor: "pointer", transition: "all 0.12s",
              }}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Alert banners ──────────────────────────────────────────────────── */}
      {alerts && (alerts.invoice_overdue > 0 || alerts.kasbon_pending > 0 || alerts.milestone_late > 0) && (
        <div className="rise rise-1" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {alerts.invoice_overdue > 0 && (
            <AlertBanner color={C.red} bg={C.redBg} borderColor="var(--danger-border)" onClick={() => router.push("/keuangan")}>
              <AlertTriangle size={14} />
              <strong>{alerts.invoice_overdue} invoice overdue</strong> · segera tindak lanjuti pembayaran
              <ArrowRight size={12} style={{ marginLeft: "auto" }} />
            </AlertBanner>
          )}
          {alerts.kasbon_pending > 0 && (
            <AlertBanner color={C.yellow} bg={C.yellowBg} borderColor="var(--warning-border)" onClick={() => router.push("/mandor")}>
              <AlertTriangle size={14} />
              <strong>{alerts.kasbon_pending} kasbon</strong> menunggu persetujuan
              <ArrowRight size={12} style={{ marginLeft: "auto" }} />
            </AlertBanner>
          )}
          {alerts.milestone_late > 0 && (
            <AlertBanner color={C.blue} bg={C.blueBg} borderColor="var(--info-border,var(--info-border))" onClick={() => router.push("/kalender")}>
              <Target size={14} />
              <strong>{alerts.milestone_late} milestone</strong> terlambat
              <ArrowRight size={12} style={{ marginLeft: "auto" }} />
            </AlertBanner>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: C.redBg, border: `1px solid var(--danger-border)`, borderRadius: 10, padding: "8px 16px", color: C.red, fontSize: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          {error}
          <button onClick={() => fetchData(period)} style={{ color: C.navy, background: "none", border: "none", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            <RefreshCw size={11} /> Coba lagi
          </button>
        </div>
      )}

      {/* ── Draggable widget grid ───────────────────────────────────────────── */}
      <DashboardGrid widgets={{
        kpi:       kpiWidget,
        cashflow:  cashflowWidget,
        status:    statusWidget,
        invoice:   invoiceWidget,
        milestone: milestoneWidget,
        ...(kasbonWidget ? { kasbon: kasbonWidget } : {}),
        tax:       taxWidget,
      }} />


    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

// KPICard DIHAPUS 2026-08-04 (R-012) — digantikan <KartuKPI> di
// components/ui-dasar.tsx. Yang berbeda bukan cuma tampilannya: KartuKPI
// mendukung delta, sparkline, gradasi sorot, dan hitung-naik — dan dipakai
// bersama SELURUH halaman, bukan hanya dashboard.

function AlertBanner({ children, color, bg, borderColor, onClick, label }: {
  children: React.ReactNode; color: string; bg: string; borderColor: string;
  onClick?: () => void; label?: string;
}) {
  return (
    <div
      {...dapatDitekan(onClick, label ?? "Buka rincian peringatan")}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px", borderRadius: 6,
        background: bg, border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${color}`,
        color, fontSize: 13, fontWeight: 400,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}

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

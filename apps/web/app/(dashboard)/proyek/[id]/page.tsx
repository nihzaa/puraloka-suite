"use client";

import { useEffect, useReducer, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  MapPin, Calendar, ChevronLeft, RefreshCw,
  User, TrendingUp,
  Clock, CloudRain, Sun, Cloud, Users,
  CheckCircle2, AlertCircle,
  Wallet, Receipt,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client { id: string; contact_person: string; phone: string; email: string; address: string | null; client_type: string }
interface PM { id: string; name: string; email: string; phone: string }
interface TerminSchedule {
  id: string; termin_number: number; label: string; amount: number;
  pct_of_contract: number; target_date: string | null;
  status: "pending" | "billed" | "paid"; notes: string | null;
}
interface Milestone {
  id: string; title: string; description: string | null;
  target_date: string; completed_at: string | null;
  status: "pending" | "on_track" | "at_risk" | "overdue" | "completed";
  sort_order: number;
}
interface Kasbon {
  id: string; amount: number; fund_source: string; purpose: string;
  kasbon_date: string; status: string; notes: string | null;
}
interface BoronganSettlement {
  id: string; borongan_value: number; total_kasbon: number;
  remaining_balance: number; settled_at: string;
}
interface WorkScope {
  id: string; scope_name: string; description: string | null;
  payment_system: "harian" | "borongan" | "progress_pct";
  borongan_value: number | null; progress_pct_done: number; status: string;
  start_date: string | null; end_date: string | null;
  kasbons: Kasbon[];
  borongan_settlements: BoronganSettlement[];
}
interface MandorAssignment {
  id: string; status: string; assigned_at: string; notes: string | null;
  mandor: { id: string; name: string; phone: string } | null;
  work_scopes: WorkScope[];
}
interface ProgressLog {
  id: string; pct_overall: number; weather: string | null;
  worker_count: number | null; notes: string | null; logged_at: string;
  reporter: { id: string; name: string } | null;
}
interface Invoice {
  id: string; invoice_number: string; invoice_type: string;
  base_amount: number; total_amount: number; amount_paid: number;
  amount_due: number; issued_date: string; due_date: string;
  paid_date: string | null; status: string; notes: string | null;
}
interface Project {
  id: string; name: string; description: string | null; location: string;
  contract_model: "termin" | "komisi"; tax_scheme: "pph_final" | "ppn";
  contract_value: number; commission_pct: number | null;
  retention_pct: number; retention_amount: number;
  start_date: string; end_date: string; actual_end_date: string | null;
  status: string; progress_pct: number; notes: string | null;
  clients: Client | null; pm: PM | null;
  termin_schedules: TerminSchedule[];
  milestones: Milestone[];
  mandor_assignments: MandorAssignment[];
  progress_logs: ProgressLog[];
  invoices: Invoice[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const daysSince = (d: string) =>
  Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

const initials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "#003366",
  navyLight: "#EBF2FF",
  text: "#111827",
  mid: "#6B7280",
  muted: "#9CA3AF",
  border: "#E5E7EB",
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
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  // project statuses
  active:      { label: "Aktif",       color: C.navy,    bg: C.navyLight },
  in_progress: { label: "Berlangsung", color: C.navy,    bg: C.navyLight },
  completed:   { label: "Selesai",     color: C.green,   bg: C.greenBg },
  on_hold:     { label: "Ditunda",     color: C.yellow,  bg: C.yellowBg },
  draft:       { label: "Draft",       color: C.muted,   bg: "#F3F4F6" },
  cancelled:   { label: "Batal",       color: C.red,     bg: C.redBg },
  // termin statuses
  pending:     { label: "Pending",     color: C.muted,   bg: "#F3F4F6" },
  billed:      { label: "Ditagih",     color: "#1D4ED8", bg: "#EFF6FF" },
  paid:        { label: "Lunas",       color: C.green,   bg: C.greenBg },
  // milestone statuses
  on_track:    { label: "On Track",    color: C.green,   bg: C.greenBg },
  at_risk:     { label: "Berisiko",    color: C.yellow,  bg: C.yellowBg },
  overdue:     { label: "Terlambat",   color: C.red,     bg: C.redBg },
  // kasbon/invoice/assignment statuses
  approved:    { label: "Disetujui",   color: C.green,   bg: C.greenBg },
  rejected:    { label: "Ditolak",     color: C.red,     bg: C.redBg },
  settled:     { label: "Lunas",       color: C.green,   bg: C.greenBg },
  sent:        { label: "Terkirim",    color: "#1D4ED8", bg: "#EFF6FF" },
  partial:     { label: "Sebagian",    color: C.yellow,  bg: C.yellowBg },
  assigned:    { label: "Ditugaskan",  color: C.navy,    bg: C.navyLight },
  inactive:    { label: "Nonaktif",    color: C.muted,   bg: "#F3F4F6" },
};

const PAYMENT_SYSTEM_LABEL: Record<string, string> = {
  harian: "Harian", borongan: "Borongan", progress_pct: "Progress %",
};
const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Upah tukang", uang_makan: "Uang makan",
  pembelian_alat: "Beli alat", operasional: "Operasional", lain_lain: "Lain-lain",
};
const INVOICE_TYPE_LABEL: Record<string, string> = {
  termin_billing: "Termin", commission_billing: "Komisi", retention_release: "Retensi",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function Badge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: C.muted, bg: "#F3F4F6" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: m.color, background: m.bg,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.color }} />
      {m.label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16 }}>
      <span style={{ width: 3, height: 16, background: C.navy, borderRadius: 2, flexShrink: 0 }} />
      {children}
    </h2>
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: C.navyLight, color: C.navy,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

function ProgressBar({ pct, height = 8 }: { pct: number; height?: number }) {
  return (
    <div style={{ height, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${Math.min(pct, 100)}%`,
        background: "linear-gradient(90deg, #003366, #0066CC)",
        borderRadius: 4, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

function InfoRow({ icon, label, value, valueColor }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #F9FAFB" }}>
      <span style={{ color: C.muted, marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: valueColor ?? C.text }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Progress ring ────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={128} height={128} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={64} cy={64} r={r} fill="none" stroke="#F3F4F6" strokeWidth={10} />
        <circle
          cx={64} cy={64} r={r} fill="none"
          stroke="url(#pgRing)" strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="pgRing" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#003366" />
            <stop offset="100%" stopColor="#0066CC" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ textAlign: "center", marginTop: -100, marginBottom: 68 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, color: C.navy }}>{pct}%</div>
        <div style={{ fontSize: 11, color: C.muted }}>Progress</div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <ProjectDetailContent />;
}

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (id) fetchProject(); }, [id]);

  async function fetchProject() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<{ project: Project }>(`/api/v1/projects/${id}`);
      setProject(data.project);
    } catch {
      setError("Proyek tidak ditemukan atau gagal memuat.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "32px 36px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Skeleton h={32} w={300} />
          <div style={{ ...card, padding: 24 }}><div style={{ display: "flex", flexDirection: "column", gap: 12 }}><Skeleton h={24} w="50%" /><Skeleton h={16} w="30%" /><Skeleton h={100} /></div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ ...card, padding: 24 }}><Skeleton h={200} /></div>
            <div style={{ ...card, padding: 24 }}><Skeleton h={200} /></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ padding: "32px 36px" }}>
        <div style={{ ...card, padding: "48px 32px", textAlign: "center" }}>
          <AlertCircle size={40} style={{ color: "#FECACA", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>{error || "Proyek tidak ditemukan"}</p>
          <button onClick={fetchProject} style={{ color: C.navy, background: "none", border: "none", cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            <RefreshCw size={13} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  const p = project;
  const daysLeft = daysUntil(p.end_date);
  const isOverdue = p.status !== "completed" && daysLeft < 0;

  // Aggregate kasbon across all work scopes
  const allKasbons = p.mandor_assignments.flatMap(ma =>
    (ma.work_scopes ?? []).flatMap(ws =>
      (ws.kasbons ?? []).map(k => ({ ...k, mandorName: ma.mandor?.name ?? "—", scopeName: ws.scope_name }))
    )
  );
  const kasbonPending = allKasbons.filter(k => k.status === "pending").reduce((s, k) => s + Number(k.amount), 0);
  const kasbonApproved = allKasbons.filter(k => k.status === "approved").reduce((s, k) => s + Number(k.amount), 0);
  const kasbonSettled = allKasbons.filter(k => k.status === "settled").reduce((s, k) => s + Number(k.amount), 0);

  return (
    <div style={{ padding: "32px 36px 64px", width: "100%" }}>

      {/* ── Breadcrumb ── */}
      <div className="rise" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: C.muted }}>Puraloka Suite</span>
        <span style={{ color: "#D1D5DB", fontSize: 13 }}>/</span>
        <button
          onClick={() => router.push("/proyek")}
          style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: C.mid, fontSize: 13, padding: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.mid; e.currentTarget.style.textDecoration = "none"; }}
        >
          Proyek
        </button>
        <span style={{ color: "#D1D5DB", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</span>
      </div>

      {/* ── Header card ── */}
      <div className="rise rise-1" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Badge status={p.status} />
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 4,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                background: "#F3F4F6", color: C.mid,
              }}>
                {p.contract_model === "termin" ? "TERMIN" : "KOMISI"}
              </span>
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 4,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                background: C.navyLight, color: C.navy,
              }}>
                {p.tax_scheme === "pph_final" ? "PPh Final" : "PPN"}
              </span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8, lineHeight: 1.2 }}>
              {p.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={13} style={{ color: C.muted }} />
              <span style={{ fontSize: 13, color: C.muted }}>{p.location}</span>
            </div>
            {p.description && (
              <p style={{ fontSize: 13, color: C.mid, marginTop: 10, lineHeight: 1.6, maxWidth: 560 }}>{p.description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <ActionBtn>Edit</ActionBtn>
            <ActionBtn>Lihat Invoice</ActionBtn>
            <ActionBtn navy>Bagikan ke Klien</ActionBtn>
          </div>
        </div>
      </div>

      {/* ── Quick stats bar ── */}
      <div className="rise rise-2" style={{ ...card, padding: "16px 24px", marginBottom: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
        <QuickStat label="Hari Berjalan" value={`${daysSince(p.start_date)} hari`} />
        <QuickStat
          label="Hari Tersisa"
          value={isOverdue ? `${Math.abs(daysLeft)} hari terlambat` : `${daysLeft} hari`}
          valueColor={isOverdue ? C.red : undefined}
          divider
        />
        <QuickStat
          label="Invoice Terbayar"
          value={fmt((p.invoices ?? []).filter(i => i.status === "paid" || Number(i.amount_paid) > 0).reduce((s, i) => s + Number(i.amount_paid), 0))}
          divider
        />
        <QuickStat
          label="Total Kasbon"
          value={fmt(allKasbons.reduce((s, k) => s + Number(k.amount), 0))}
          divider
        />
      </div>

      {/* ── Info grid + Progress ring ── */}
      <div className="rise rise-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Left: project info */}
        <div style={{ ...card, padding: 24 }}>
          <SectionTitle>Informasi Proyek</SectionTitle>
          <InfoRow icon={<User size={14} />} label="Klien" value={
            <div>
              <div>{p.clients?.contact_person ?? "—"}</div>
              {p.clients?.phone && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{p.clients.phone}</div>}
              {p.clients?.email && <div style={{ fontSize: 12, color: C.muted }}>{p.clients.email}</div>}
            </div>
          } />
          <InfoRow icon={<User size={14} />} label="Project Manager" value={
            <div>
              <div>{p.pm?.name ?? "—"}</div>
              {p.pm?.phone && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{p.pm.phone}</div>}
            </div>
          } />
          <InfoRow icon={<Calendar size={14} />} label="Tanggal Mulai" value={fmtDate(p.start_date)} />
          <InfoRow
            icon={<Calendar size={14} />}
            label="Tenggat Selesai"
            value={fmtDate(p.end_date)}
            valueColor={isOverdue ? C.red : undefined}
          />
          {p.actual_end_date && (
            <InfoRow icon={<CheckCircle2 size={14} />} label="Tanggal Selesai Aktual" value={fmtDate(p.actual_end_date)} valueColor={C.green} />
          )}
          <InfoRow icon={<Receipt size={14} />} label="Nilai Kontrak" value={
            <span style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>{fmt(Number(p.contract_value))}</span>
          } />
          {p.retention_pct > 0 && (
            <InfoRow icon={<Wallet size={14} />} label={`Retensi (${p.retention_pct}%)`} value={fmt(Number(p.retention_amount))} valueColor={C.yellow} />
          )}
          {p.commission_pct && (
            <InfoRow icon={<TrendingUp size={14} />} label="Komisi" value={`${p.commission_pct}%`} />
          )}
        </div>

        {/* Right: progress + days */}
        <div style={{ ...card, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <SectionTitle>Status Progress</SectionTitle>
          <ProgressRing pct={Number(p.progress_pct)} />
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 15, fontWeight: 600,
              color: isOverdue ? C.red : p.status === "completed" ? C.green : C.text,
              marginBottom: 4,
            }}>
              {p.status === "completed"
                ? `Selesai${p.actual_end_date ? " " + fmtDateShort(p.actual_end_date) : ""}`
                : isOverdue
                  ? `${Math.abs(daysLeft)} hari terlambat`
                  : daysLeft === 0
                    ? "Jatuh tempo hari ini"
                    : `${daysLeft} hari tersisa`}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {fmtDateShort(p.start_date)} — {fmtDateShort(p.end_date)}
            </div>
          </div>
          {/* Mini progress breakdown */}
          <div style={{ width: "100%", padding: "16px", background: "#F9FAFB", borderRadius: 10, border: "1px solid #F3F4F6" }}>
            <ProgressBar pct={Number(p.progress_pct)} height={10} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: C.muted }}>0%</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{p.progress_pct}% selesai</span>
              <span style={{ fontSize: 11, color: C.muted }}>100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Termin schedules ── */}
      {p.contract_model === "termin" && (p.termin_schedules?.length ?? 0) > 0 && (
        <div className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Jadwal Termin</SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                {["No", "Label", "Nilai", "% Kontrak", "Target", "Status"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...(p.termin_schedules ?? [])]
                .sort((a, b) => a.termin_number - b.termin_number)
                .map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #F3F4F6" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FAFBFF"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "12px 14px", color: C.muted, fontWeight: 600 }}>{t.termin_number}</td>
                    <td style={{ padding: "12px 14px", color: C.text, fontWeight: 500 }}>{t.label}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(t.amount))}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: C.mid }}>{t.pct_of_contract}%</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: C.mid }}>
                      {t.target_date ? fmtDateShort(t.target_date) : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <Badge status={t.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mandor + Work scopes ── */}
      {(p.mandor_assignments?.length ?? 0) > 0 && (
        <div className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Mandor & Pekerjaan</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(p.mandor_assignments ?? []).map(ma => (
              <div key={ma.id} style={{ border: "1px solid #F3F4F6", borderRadius: 10, overflow: "hidden" }}>
                {/* Mandor header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#F9FAFB" }}>
                  <Avatar name={ma.mandor?.name ?? "?"} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{ma.mandor?.name ?? "—"}</div>
                    {ma.mandor?.phone && <div style={{ fontSize: 12, color: C.muted }}>{ma.mandor.phone}</div>}
                  </div>
                  <Badge status={ma.status} />
                </div>

                {/* Work scopes */}
                {(ma.work_scopes?.length ?? 0) > 0 && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {(ma.work_scopes ?? []).map((ws, idx) => (
                      <div key={ws.id} style={{
                        paddingTop: 14, paddingBottom: 14,
                        borderBottom: idx < (ma.work_scopes?.length ?? 0) - 1 ? "1px solid #F3F4F6" : "none",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ws.scope_name}</span>
                            <span style={{
                              marginLeft: 8, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                              padding: "2px 7px", borderRadius: 4, background: C.navyLight, color: C.navy,
                            }}>
                              {PAYMENT_SYSTEM_LABEL[ws.payment_system]}
                            </span>
                            {ws.description && (
                              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{ws.description}</div>
                            )}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{ws.progress_pct_done}%</div>
                            {ws.borongan_value && (
                              <div style={{ fontSize: 11, color: C.muted }}>{fmt(Number(ws.borongan_value))}</div>
                            )}
                          </div>
                        </div>
                        <ProgressBar pct={Number(ws.progress_pct_done)} height={6} />
                        {(ws.borongan_settlements?.length ?? 0) > 0 && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: C.greenBg, borderRadius: 8, border: `1px solid ${C.greenBorder}` }}>
                            <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>
                              Settled: {fmt(Number(ws.borongan_settlements?.[0]?.borongan_value))} · Sisa: {fmt(Number(ws.borongan_settlements?.[0]?.remaining_balance))}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Kasbon summary ── */}
      {allKasbons.length > 0 && (
        <div className="rise rise-4" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Ringkasan Kasbon</SectionTitle>

          {/* Summary pills */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            <KasbonPill label="Disetujui" value={kasbonApproved} color={C.green} bg={C.greenBg} border={C.greenBorder} />
            <KasbonPill label="Menunggu" value={kasbonPending} color={C.yellow} bg={C.yellowBg} border={C.yellowBorder} />
            <KasbonPill label="Lunas" value={kasbonSettled} color={C.muted} bg="#F9FAFB" border={C.border} />
          </div>

          {/* Kasbon list */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                {["Mandor", "Scope", "Tujuan", "Jumlah", "Tanggal", "Status"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: i >= 3 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allKasbons.slice(0, 10).map(k => (
                <tr key={k.id} style={{ borderBottom: "1px solid #F3F4F6" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#FAFBFF"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{ padding: "11px 14px", color: C.text, fontWeight: 500 }}>{(k as any).mandorName}</td>
                  <td style={{ padding: "11px 14px", color: C.mid, fontSize: 12 }}>{(k as any).scopeName}</td>
                  <td style={{ padding: "11px 14px", color: C.mid }}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", color: k.status === "approved" ? C.text : k.status === "settled" ? C.green : C.yellow, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(k.amount))}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", color: C.muted, fontSize: 12 }}>{fmtDateShort(k.kasbon_date)}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}><Badge status={k.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {allKasbons.length > 10 && (
            <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 12 }}>
              + {allKasbons.length - 10} kasbon lainnya
            </p>
          )}
        </div>
      )}

      {/* ── Progress logs ── */}
      <div className="rise rise-4" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <SectionTitle>Log Progress Lapangan</SectionTitle>
        {(p.progress_logs?.length ?? 0) === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>
            Belum ada log progress untuk proyek ini.
          </div>
        ) : (
          <div style={{ paddingLeft: 16, position: "relative" }}>
            <div style={{ position: "absolute", left: 19, top: 8, bottom: 8, width: 2, background: "#E5E7EB" }} />
            {(p.progress_logs ?? []).map(log => (
              <div key={log.id} style={{ display: "flex", gap: 16, paddingBottom: 16, position: "relative" }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: C.navy,
                  flexShrink: 0, marginTop: 8, position: "relative", zIndex: 1,
                  border: "2px solid #F8F9FA",
                }} />
                <div style={{ ...card, borderRadius: 10, padding: "12px 16px", flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: C.navy }}>{log.pct_overall}%</span>
                      <div>
                        {log.weather && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted }}>
                            {log.weather === "Cerah" ? <Sun size={11} /> : log.weather === "Hujan" ? <CloudRain size={11} /> : <Cloud size={11} />}
                            {log.weather}
                          </div>
                        )}
                        {log.worker_count !== null && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted }}>
                            <Users size={11} /> {log.worker_count} pekerja
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: C.muted }}>{fmtDateTime(log.logged_at)}</div>
                      {log.reporter && <div style={{ fontSize: 11, color: C.navy, marginTop: 2 }}>oleh {log.reporter.name}</div>}
                    </div>
                  </div>
                  {log.notes && (
                    <p style={{ fontSize: 12, color: C.mid, lineHeight: 1.5 }}>{log.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Milestones ── */}
      {(p.milestones?.length ?? 0) > 0 && (
        <div className="rise rise-5" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Milestones</SectionTitle>
          <div style={{ paddingLeft: 20, position: "relative" }}>
            <div style={{ position: "absolute", left: 23, top: 12, bottom: 12, width: 2, background: "#E5E7EB" }} />
            {[...(p.milestones ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(m => {
              const days = daysUntil(m.target_date);
              const isActuallyOverdue = days < 0 && m.status !== "completed";
              const msColor =
                m.status === "completed" ? C.green :
                m.status === "overdue" || isActuallyOverdue ? C.red :
                m.status === "in_progress" ? C.navy :
                m.status === "at_risk" || days <= 7 ? C.yellow :
                C.muted;
              const msBg =
                m.status === "completed" ? C.greenBg :
                m.status === "overdue" || isActuallyOverdue ? C.redBg :
                m.status === "in_progress" ? C.navyLight :
                m.status === "at_risk" || days <= 7 ? C.yellowBg :
                "#F9FAFB";
              const msLabel =
                m.status === "completed" ? "Selesai" :
                m.status === "in_progress" ? "Berlangsung" :
                m.status === "overdue" || isActuallyOverdue ? "Terlambat" :
                m.status === "at_risk" ? "Berisiko" :
                "Menunggu";
              return (
                <div key={m.id} style={{ display: "flex", gap: 16, paddingBottom: 16, position: "relative" }}>
                  {/* Colored dot on timeline */}
                  <div style={{
                    width: 12, height: 12, borderRadius: "50%", background: msColor,
                    flexShrink: 0, marginTop: 14, position: "relative", zIndex: 1,
                    border: "2px solid #FFFFFF", boxShadow: `0 0 0 2px ${msColor}33`,
                  }} />
                  <div style={{ ...card, borderRadius: 10, padding: "12px 16px", flex: 1 }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: m.description ? 4 : 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.title}</span>
                          {/* Colored status chip */}
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                            color: msColor, background: msBg, letterSpacing: "0.03em",
                          }}>
                            {msLabel}
                          </span>
                        </div>
                        {m.description && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{m.description}</div>}
                        {/* Target date prominently */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                          <Calendar size={11} style={{ color: msColor }} />
                          <span style={{ fontSize: 11, fontWeight: 500, color: msColor }}>
                            Target: {fmtDateShort(m.target_date)}
                            {m.status === "completed" && m.completed_at ? ` · Selesai ${fmtDateShort(m.completed_at)}` : ""}
                            {isActuallyOverdue ? ` · ${Math.abs(days)} hari terlambat` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Invoices ── */}
      {(p.invoices?.length ?? 0) > 0 && (
        <div className="rise rise-5" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Invoice</SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                {["No Invoice", "Tipe", "Total", "Dibayar", "Sisa", "Jatuh Tempo", "Status"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(p.invoices ?? []).map(inv => {
                const invDays = daysUntil(inv.due_date);
                const invOverdue = inv.status !== "paid" && invDays < 0;
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #F3F4F6", background: invOverdue ? "#FEF2F2" : "transparent" }}
                    onMouseEnter={e => { if (!invOverdue) e.currentTarget.style.background = "#FAFBFF"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = invOverdue ? "#FEF2F2" : "transparent"; }}
                  >
                    <td style={{ padding: "12px 14px", color: C.navy, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: "12px 14px", color: C.mid }}>{INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(inv.total_amount))}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: C.green, fontFamily: "monospace" }}>{fmt(Number(inv.amount_paid))}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: Number(inv.amount_due) > 0 ? C.yellow : C.green, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(inv.amount_due))}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: invOverdue ? C.red : C.mid, fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                        <Clock size={10} />{fmtDateShort(inv.due_date)}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}><Badge status={inv.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notes ── */}
      {p.notes && (
        <div className="rise rise-6" style={{ ...card, padding: 24 }}>
          <SectionTitle>Catatan</SectionTitle>
          <p style={{ fontSize: 13, color: C.mid, lineHeight: 1.7 }}>{p.notes}</p>
        </div>
      )}

    </div>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function ActionBtn({ children, navy }: { children: React.ReactNode; navy?: boolean }) {
  return (
    <button
      style={{
        padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
        cursor: "pointer", transition: "all 0.12s",
        border: navy ? "none" : "1px solid #E5E7EB",
        background: navy ? "#003366" : "#FFFFFF",
        color: navy ? "#FFFFFF" : "#374151",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = navy ? "#002244" : "#F9FAFB";
        e.currentTarget.style.borderColor = navy ? "#002244" : "#D1D5DB";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = navy ? "#003366" : "#FFFFFF";
        e.currentTarget.style.borderColor = navy ? "#003366" : "#E5E7EB";
      }}
    >
      {children}
    </button>
  );
}

function KasbonPill({ label, value, color, bg, border }: {
  label: string; value: number; color: string; bg: string; border: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "var(--font-display)" }}>{
        new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value)
      }</div>
    </div>
  );
}

function QuickStat({ label, value, valueColor, divider }: {
  label: string; value: string; valueColor?: string; divider?: boolean;
}) {
  return (
    <div style={{
      paddingLeft: divider ? 24 : 0,
      borderLeft: divider ? "1px solid #E5E7EB" : "none",
    }}>
      <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor ?? "#111827", fontFamily: "var(--font-display)", lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

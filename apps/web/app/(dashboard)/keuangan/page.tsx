"use client";

import React, { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, getStoredUser } from "@/lib/api";
import {
  Wallet, Receipt, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Clock, Search, RefreshCw, Plus, X, ExternalLink,
  ChevronDown, Banknote, ArrowDownLeft, ArrowUpRight, Filter,
  FileText, CreditCard, Building2, PieChart, Activity, ArrowRightLeft,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
};

const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid #E5E7EB",
  borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  // Period info
  dateFrom: string; dateTo: string; periodLabel: string;
  // AR / Invoice
  totalInvoiced: number; totalPaid: number;
  totalOutstanding: number; totalOverdue: number;
  overdueCount: number; paidThisMonth: number;
  // Kasbon alerts
  kasbonPendingCount: number; kasbonPendingTotal: number;
  // Kas saldo
  totalKas: number; totalKasMain: number; totalKasCollector: number; totalKasPetty: number;
  cashAccounts: CashAccount[];
  // Biaya keluar (kasbon TIDAK masuk)
  totalKeluar: number;
  laborCost: number; wageThisMonth: number; progressThisMonth: number; settlementThisMonth: number; laborExpenseCost: number;
  materialCost: number; equipmentCost: number; operationalCost: number; otherCost: number; nonLaborCost: number; totalExpense: number;
  // Advance beredar
  advanceBeredar: number; kasbonSettledPeriod: number;
  // Upah pending
  wagePendingTotal: number; wagePendingCount: number;
  // Legacy
  keluarThisMonth: number; expenseThisMonth: number; kasbonThisMonth: number;
}

interface Invoice {
  id: string; invoice_number: string; invoice_type: string;
  base_amount: number; total_amount: number; amount_paid: number; amount_due: number;
  tax_amount: number; commission_amount: number;
  retensi_amount: number | null; retensi_pct: number | null;
  description: string | null;
  issued_date: string; due_date: string; paid_date: string | null; status: string; notes: string | null;
  projects: { id: string; name: string; location: string; contract_model: string } | null;
  termin_schedules: { id: string; label: string; termin_number: number } | null;
  payments: Payment[];
}

interface Payment {
  id: string; amount_paid: number; payment_method: string;
  paid_at: string; ref_number: string | null; bank_name: string | null;
  notes: string | null; proof_url: string | null;
  invoices?: { id: string; invoice_number: string; invoice_type: string; total_amount: number; projects: { id: string; name: string } | null } | null;
  recorder?: { id: string; name: string } | null;
  cash_account?: { id: string; name: string; type: string } | null;
}

interface CashAccount {
  id: string; name: string; type: "main" | "collector" | "petty_cash"; balance: number;
}

interface Kasbon {
  id: string; amount: number; fund_source: string; purpose: string;
  kasbon_date: string; status: string; notes: string | null; created_at: string;
  work_scopes: {
    id: string; scope_name: string;
    mandor_assignments: {
      id: string;
      mandor: { id: string; name: string; phone: string } | null;
      projects: { id: string; name: string } | null;
    }[];
  } | null;
  requester: { id: string; name: string } | null;
  approver: { id: string; name: string } | null;
  approved_at: string | null;
  cash_account: { id: string; name: string; type: string } | null;
}

interface WorkerKasbon {
  id: string; amount: number; purpose: string; kasbon_date: string;
  notes: string | null; amount_settled: number; is_settled: boolean; created_at: string;
  worker: { id: string; name: string; phone: string | null } | null;
  mandor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  scope: { id: string; scope_name: string } | null;
}

interface CashflowPoint { label: string; masuk: number; keluar: number; net: number; keluarKasbon: number; keluarExpense: number; keluarUpah: number; }

interface Project { id: string; name: string; contract_model: string; contract_value: number; commission_pct: number | null; retention_pct: number; tax_scheme: string }

interface TerminSchedule { id: string; termin_number: number; label: string; amount: number; pct_of_contract: number; status: string; target_date: string | null; trigger_type?: string | null }

interface ProjectDetail extends Project {
  termin_schedules: TerminSchedule[];
  clients: { id: string; contact_person: string } | null;
  pm: { id: string; name: string } | null;
}

interface MandorScope {
  id: string; scope_name: string; payment_system: string;
  assignment: { id: string; project: { id: string; name: string } | null; mandor: { id: string; name: string } | null } | null;
}

interface KasbonMandorSummary {
  mandorId: string; mandorName: string; projectCount: number;
  total: number; totalApproved: number; totalPending: number; totalSettled: number;
  byPurpose: Record<string, number>;
  byProject: { name: string; total: number }[];
  kasbonCount: number;
}

interface KasbonSummaryData {
  summary: KasbonMandorSummary[];
  grandByPurpose: Record<string, number>;
  totalKasbons: number;
}

interface CashflowTransaction {
  id: string; type: string; direction: "in" | "out";
  date: string; amount: number; label: string;
  project: { id: string; name: string } | null;
  category: { id: string; name: string; parent_name: string | null } | null;
  sub_label: string;
  meta: Record<string, unknown>;
}
interface ArusKasData {
  totalIn: number; totalOut: number; netFlow: number;
  byType: { payment: number; expense: number; wage: number; kasbon: number; progress_payment?: number; settlement_borongan?: number };
  transactions: CashflowTransaction[];
}
interface ArusKasChartPoint { period: string; label: string; masuk: number; keluar: number; net: number; }
interface ExpenseCategory { id: string; name: string; parent_id: string | null; parent?: { id: string; name: string } | null; }

type TabKey = "overview" | "invoice" | "pembayaran" | "kasbon" | "aruskas" | "profitabilitas";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return fmt(n);
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const INVOICE_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",     color: C.muted,   bg: "var(--surface-hover)",   border: "var(--border)" },
  sent:      { label: "Terkirim",  color: C.blue,    bg: C.blueBg,    border: C.blueBorder },
  partial:   { label: "Parsial",   color: C.yellow,  bg: C.yellowBg,  border: C.yellowBorder },
  paid:      { label: "Lunas",     color: C.green,   bg: C.greenBg,   border: C.greenBorder },
  overdue:   { label: "Jatuh Tempo", color: C.red,   bg: C.redBg,     border: C.redBorder },
  cancelled: { label: "Batal",     color: C.muted,   bg: "var(--surface-hover)",   border: "var(--border)" },
};

const KASBON_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:  { label: "Menunggu",  color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  approved: { label: "Disetujui", color: C.green,  bg: C.greenBg,  border: C.greenBorder },
  rejected: { label: "Ditolak",   color: C.red,    bg: C.redBg,    border: C.redBorder },
  settled:  { label: "Settled",   color: C.muted,  bg: "var(--surface-hover)",  border: "var(--border)" },
};

const INVOICE_TYPE_LABEL: Record<string, string> = {
  termin_billing: "Termin", commission_billing: "Komisi", retention_release: "Retensi",
};

const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
  pembelian_alat: "Pembelian Alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

const FUND_SOURCE_LABEL: Record<string, string> = {
  owner_advance: "Dana Owner", client_fund: "Dana Klien",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; color: string; bg: string; border: string }> }) {
  const m = map[status] ?? { label: status, color: C.muted, bg: "var(--surface-hover)", border: "var(--border)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function KpiCard({ label, value, sub, icon, accent, border }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  accent?: string; border?: string;
}) {
  return (
    <div
      style={{
        flex: 1, minWidth: 180, background: "var(--surface)", borderRadius: 12,
        padding: "16px 18px", border: `1px solid ${border ?? "var(--border)"}`,
        display: "flex", alignItems: "center", gap: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,51,102,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: accent ? `${accent}18` : C.navyLight,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, color: C.muted, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </p>
        <p style={{ fontSize: 20, fontWeight: 800, color: accent ?? C.text, margin: "0 0 1px", fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
          {value}
        </p>
        {sub && <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{sub}</p>}
      </div>
    </div>
  );
}

function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: 8, background: "linear-gradient(90deg, #F3F4F6 0%, #E9EAEB 50%, #F3F4F6 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />;
}

// ─── Custom tooltip untuk cashflow chart ──────────────────────────────────────
function CashflowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", minWidth: 180 }}>
      <p style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
          <span style={{ color: C.mid }}>{p.name}</span>
          <span style={{ fontWeight: 600, color: p.color }}>{fmtCompact(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "10px 18px",
        background: "transparent", border: "none", borderBottom: `2px solid ${active ? C.navy : "transparent"}`,
        fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? C.navy : C.mid, cursor: "pointer",
        transition: "all 0.15s", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = C.text; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = C.mid; } }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 700,
          background: active ? C.navyLight : "var(--surface-hover)",
          color: active ? C.navy : C.muted,
          padding: "1px 6px", borderRadius: 99,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Invoice row ──────────────────────────────────────────────────────────────
function InvoiceRow({ inv, onPayClick, onPdfClick, loadingPdf, canEdit }: { inv: Invoice; onPayClick: (inv: Invoice) => void; onPdfClick: (inv: Invoice) => void; loadingPdf: boolean; canEdit: boolean }) {
  const days = daysUntil(inv.due_date);
  const overdue = inv.status !== "paid" && inv.status !== "cancelled" && days < 0;
  const dueSoon = !overdue && inv.status !== "paid" && inv.status !== "cancelled" && days >= 0 && days <= 7;
  const [dendaOpen, setDendaOpen] = useState(false);

  return (
    <>
    <tr
      style={{ borderBottom: "1px solid #F3F4F6", background: overdue ? "#FEF9F9" : "transparent" }}
      onMouseEnter={e => { if (!overdue) e.currentTarget.style.background = "#FAFBFF"; }}
      onMouseLeave={e => { e.currentTarget.style.background = overdue ? "#FEF9F9" : "transparent"; }}
    >
      <td style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, fontFamily: "var(--font-display)", marginBottom: 2 }}>
          {inv.invoice_number}
        </div>
        <div style={{ fontSize: 10, color: C.muted }}>
          {INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}
          {inv.termin_schedules && ` · Termin ${inv.termin_schedules.termin_number}`}
        </div>
      </td>
      <td style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{inv.projects?.name ?? "—"}</div>
        {inv.projects?.location && <div style={{ fontSize: 11, color: C.muted }}>{inv.projects.location}</div>}
      </td>
      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.text }}>
        {fmt(Number(inv.total_amount))}
      </td>
      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.green }}>
        {fmt(Number(inv.amount_paid))}
      </td>
      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: Number(inv.amount_due) > 0 ? C.yellow : C.green }}>
        {fmt(Number(inv.amount_due))}
      </td>
      <td style={{ padding: "12px 14px", textAlign: "right" }}>
        <div style={{ fontSize: 12, color: overdue ? C.red : dueSoon ? C.yellow : C.mid, fontWeight: overdue || dueSoon ? 600 : 400 }}>
          {fmtDate(inv.due_date)}
        </div>
        {overdue && <div style={{ fontSize: 10, color: C.red }}>{Math.abs(days)}h lewat</div>}
        {dueSoon && <div style={{ fontSize: 10, color: C.yellow }}>{days}h lagi</div>}
      </td>
      <td style={{ padding: "12px 14px", textAlign: "center" }}>
        <StatusBadge status={overdue ? "overdue" : inv.status} map={INVOICE_STATUS} />
      </td>
      <td style={{ padding: "12px 14px", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          {canEdit && inv.status !== "paid" && inv.status !== "cancelled" && (
            <button
              onClick={() => onPayClick(inv)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "5px 11px", borderRadius: 6, border: "none",
                background: C.navyLight, color: C.navy,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = "var(--surface)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navyLight; e.currentTarget.style.color = C.navy; }}
            >
              <Banknote size={12} /> Bayar
            </button>
          )}
          {inv.status === "paid" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.green }}>
              <CheckCircle2 size={13} /> Lunas
            </span>
          )}
          {/* PDF Download button */}
          <button aria-label="Download PDF"
            onClick={() => onPdfClick(inv)}
            disabled={loadingPdf}
            title="Download PDF"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 9px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: loadingPdf ? "var(--surface-hover)" : "var(--surface)",
              color: loadingPdf ? C.muted : C.mid, fontSize: 11, cursor: loadingPdf ? "not-allowed" : "pointer",
              transition: "all 0.15s", whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { if (!loadingPdf) { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.text; } }}
            onMouseLeave={e => { if (!loadingPdf) { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = C.mid; } }}
          >
            <FileText size={11} /> {loadingPdf ? "..." : "PDF"}
          </button>
          {/* Denda: estimasi/otoritatif + pemutihan. Muncul utk invoice belum lunas telat / lunas. */}
          {inv.status !== "cancelled" && (
            <button aria-label="Denda keterlambatan" onClick={() => setDendaOpen(true)} title="Denda keterlambatan"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: overdue ? C.red : C.mid, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
              <AlertTriangle size={11} /> Denda
            </button>
          )}
        </div>
      </td>
    </tr>
    {dendaOpen && createPortal(<PenaltyModal invoiceId={inv.id} invoiceNumber={inv.invoice_number} onClose={() => setDendaOpen(false)} />, document.body)}
    </>
  );
}

// ─── Denda invoice: estimasi on-read (dilabeli) + angka otoritatif + pemutihan ──
interface PenaltyInfo {
  waived: boolean; waived_reason: string | null;
  authoritative: { penalty_amount: number; days_late: number; base_amount: number; anchor_date: string; basis: string } | null;
  estimate: { estimate: true; as_of: string; enabled: boolean; applicable: boolean; reason: string; daysLate: number; baseAmount: number; penaltyAmount: number; basis: string };
}
function PenaltyModal({ invoiceId, invoiceNumber, onClose }: { invoiceId: string; invoiceNumber: string; onClose: () => void }) {
  const [info, setInfo] = useState<PenaltyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canWaive = (() => { try { return (JSON.parse(localStorage.getItem("puraloka_permissions") || "[]") as string[]).includes("finance:penalty:waive"); } catch { return false; } })();
  const fmtIdr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  const BASIS: Record<string, string> = { invoice_telat: "nilai invoice telat", outstanding_proyek: "sisa outstanding", kontrak_total: "nilai kontrak" };

  const loadInfo = () => {
    setLoading(true);
    api.get<PenaltyInfo>(`/api/v1/finance/invoice/${invoiceId}/penalty`)
      .then(({ data }) => setInfo(data))
      .catch((e) => setErr(e?.response?.data?.error ?? "Gagal memuat denda"))
      .finally(() => setLoading(false));
  };
  useEffect(loadInfo, [invoiceId]);

  async function submitWaive(waived: boolean) {
    if (!reason.trim()) { setErr("Alasan wajib diisi"); return; }
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/v1/finance/invoice/${invoiceId}/waive-penalty`, { waived, reason: reason.trim() });
      setReason(""); loadInfo();
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setBusy(false); }
  }

  const auth = info?.authoritative;
  const est = info?.estimate;
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Denda Keterlambatan</h2>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{invoiceNumber}</div>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {loading ? <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Memuat…</div> : (
            <>
              {info?.waived && (
                <div style={{ padding: "10px 12px", borderRadius: 9, background: "var(--warning-bg)", border: "1px solid #FDE68A", fontSize: 12.5, color: "var(--text-primary)" }}>
                  <b>Denda diputihkan.</b> {info.waived_reason && <span style={{ color: "var(--text-secondary)" }}>Alasan: {info.waived_reason}</span>}
                </div>
              )}
              {!est?.enabled && !auth && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Denda keterlambatan <b>nonaktif</b> untuk invoice ini. Aktifkan di Konfigurasi Keuangan atau atur per proyek.</div>
              )}
              {auth ? (
                <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>Denda resmi (tercatat)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--danger)", fontFamily: "var(--font-display)" }}>{fmtIdr(Number(auth.penalty_amount))}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{auth.days_late} hari telat · basis {BASIS[auth.basis] ?? auth.basis} {fmtIdr(Number(auth.base_amount))} · per {auth.anchor_date}</div>
                </div>
              ) : est?.enabled && (
                <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px dashed var(--border)" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>Estimasi per {est.as_of} · belum final</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: est.applicable ? "var(--warning)" : "var(--text-muted)", fontFamily: "var(--font-display)" }}>{fmtIdr(Number(est.penaltyAmount))}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    {est.applicable ? `${est.daysLate} hari telat · basis ${BASIS[est.basis] ?? est.basis} ${fmtIdr(Number(est.baseAmount))}` : est.reason === "not_late" ? "Belum jatuh tempo / belum telat" : est.reason === "waived" ? "Diputihkan" : "Tidak berlaku"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Estimasi tampilan — angka resmi dihitung saat invoice lunas.</div>
                </div>
              )}
              {err && <div style={{ fontSize: 12.5, color: "var(--danger)" }}>{err}</div>}
              {canWaive && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{info?.waived ? "Batalkan pemutihan" : "Putihkan denda invoice ini"}</div>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (wajib — tercatat di audit)"
                    style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }} />
                  <button onClick={() => submitWaive(!info?.waived)} disabled={busy || !reason.trim()}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: busy || !reason.trim() ? "#94A3B8" : (info?.waived ? "var(--navy)" : "var(--danger)"), color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy || !reason.trim() ? "not-allowed" : "pointer" }}>
                    {busy ? "Menyimpan…" : info?.waived ? "Batalkan pemutihan" : "Putihkan denda"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KeuanganPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  if (!mounted) return null;
  return <KeuanganContent />;
}

function KeuanganContent() {
  const currentUser = getStoredUser();
  const canEdit = currentUser?.role === "admin" || currentUser?.role === "pm";

  const [tab, setTab] = useState<TabKey>("overview");

  // Overview period filter
  const [overviewPeriod, setOverviewPeriod] = useState<"this_month" | "last_3_months" | "last_6_months" | "this_year" | "custom">("this_month");
  const [overviewFrom, setOverviewFrom] = useState("");
  const [overviewTo, setOverviewTo] = useState("");

  // Summary
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashflow, setCashflow] = useState<CashflowPoint[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [invStatusFilter, setInvStatusFilter] = useState("all");
  const [invSearch, setInvSearch] = useState("");
  const [invSearchInput, setInvSearchInput] = useState("");
  const invDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Payments
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPay, setLoadingPay] = useState(false);
  const [payMonth, setPayMonth] = useState("");

  // Kasbons
  const [kasbons, setKasbons] = useState<Kasbon[]>([]);
  const [loadingKasbon, setLoadingKasbon] = useState(false);
  const [kasbonStatusFilter, setKasbonStatusFilter] = useState("all");
  const [kasbonSubTab, setKasbonSubTab] = useState<"daftar" | "summary">("daftar");
  const [kasbonSummary, setKasbonSummary] = useState<KasbonSummaryData | null>(null);
  // Kasbon tukang
  const [kasbonType, setKasbonType] = useState<"mandor" | "tukang">("mandor");
  const [workerKasbons, setWorkerKasbons] = useState<WorkerKasbon[]>([]);
  const [loadingWorkerKasbon, setLoadingWorkerKasbon] = useState(false);
  const [workerKasbonFilter, setWorkerKasbonFilter] = useState("all");

  // Modals
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [showAddKasbon, setShowAddKasbon] = useState(false);
  const [loadingPdfId, setLoadingPdfId] = useState<string | null>(null);

  // Load summary + cashflow on mount and when period changes
  useEffect(() => {
    const { from, to } = computePeriodDates(overviewPeriod, overviewFrom, overviewTo);
    loadSummary(from, to);
    loadCashflowForOverview(from, to);
  }, [overviewPeriod, overviewFrom, overviewTo]);

  // Load tab data when tab changes
  useEffect(() => {
    if (tab === "invoice" && invoices.length === 0) loadInvoices();
    if (tab === "pembayaran" && payments.length === 0) loadPayments();
    if (tab === "kasbon" && kasbons.length === 0) loadKasbons();
  }, [tab]);

  // Reload invoices when filter changes
  useEffect(() => { if (tab === "invoice") loadInvoices(); }, [invStatusFilter, invSearch]);
  useEffect(() => { if (tab === "pembayaran") loadPayments(); }, [payMonth]);
  useEffect(() => { if (tab === "kasbon") loadKasbons(); }, [kasbonStatusFilter]);
  // Worker kasbon: load when switching to tukang sub, or filter changes
  useEffect(() => { if (tab === "kasbon" && kasbonType === "tukang") loadWorkerKasbons(); }, [kasbonType, workerKasbonFilter]);

  async function handleDownloadPDF(inv: Invoice) {
    setLoadingPdfId(inv.id);
    try {
      const [{ pdf }, { InvoicePDF }, QRCode] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/invoice-pdf"),
        import("qrcode"),
      ]);

      const [companyRes, qrDataUrl] = await Promise.all([
        api.get<{ company: import("@/components/invoice-pdf").CompanyProfile }>("/api/v1/settings/company"),
        QRCode.toDataURL(`https://puraloka.app/verify/invoice/${inv.id}`, { width: 200, margin: 1 }),
      ]);
      const company = companyRes.data.company;

      // Fetch line items jika expense_billing atau commission_fee
      let lineItems: import("@/components/invoice-pdf").InvoiceLineItem[] | undefined;
      if (inv.invoice_type === "expense_billing" || inv.invoice_type === "commission_fee") {
        try {
          const lineRes = await api.get<{ line_items: import("@/components/invoice-pdf").InvoiceLineItem[] }>(
            `/api/v1/finance/invoice-line-items/${inv.id}`
          );
          lineItems = lineRes.data.line_items;
        } catch {
          lineItems = [];
        }
      }

      const invoiceData: import("@/components/invoice-pdf").InvoiceData = {
        ...inv,
        retensi_amount: inv.retensi_amount ?? undefined,
        retensi_pct: inv.retensi_pct ?? undefined,
        commission_amount: inv.commission_amount,
        tax_amount: inv.tax_amount,
        description: inv.description ?? undefined,
        line_items: lineItems,
      };

      const React = await import("react");
      const blob = await pdf(
        React.createElement(InvoicePDF, { invoice: invoiceData, company, qrDataUrl }) as any
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${inv.invoice_number.replace(/\//g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed", err);
    } finally {
      setLoadingPdfId(null);
    }
  }

  function computePeriodDates(period: string, customFrom: string, customTo: string) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (period === "this_month") {
      const from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const to   = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from, to };
    }
    if (period === "last_3_months") {
      const from = isoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      const to   = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from, to };
    }
    if (period === "last_6_months") {
      const from = isoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
      const to   = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from, to };
    }
    if (period === "this_year") {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    // custom
    return { from: customFrom, to: customTo };
  }

  async function loadSummary(from?: string, to?: string) {
    setLoadingSummary(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      const res = await api.get<Summary>("/api/v1/finance/summary", { params });
      setSummary(res.data);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadCashflowForOverview(from?: string, to?: string) {
    try {
      const params: Record<string, string> = {
        type: "payment,expense,wage,progress_payment,settlement_borongan",
      };
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      const res = await api.get<{ chartData: ArusKasChartPoint[] }>("/api/v1/finance/cashflow-chart", { params });
      // Map ArusKasChartPoint to CashflowPoint shape for backward-compat with chart
      setCashflow(res.data.chartData.map(p => ({
        label: p.label, masuk: p.masuk, keluar: p.keluar, net: p.net,
        keluarKasbon: 0, keluarExpense: 0, keluarUpah: 0,
      })));
    } catch {}
  }

  async function loadInvoices() {
    setLoadingInv(true);
    try {
      const params: Record<string, string> = { limit: "200" };
      if (invStatusFilter !== "all") params.status = invStatusFilter;
      const res = await api.get<{ invoices: Invoice[] }>("/api/v1/finance/invoices", { params });
      const data = res.data.invoices;
      const q = invSearch.toLowerCase();
      setInvoices(q ? data.filter(i =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.projects?.name ?? "").toLowerCase().includes(q)
      ) : data);
    } finally {
      setLoadingInv(false);
    }
  }

  async function loadPayments() {
    setLoadingPay(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      if (payMonth) params.month = payMonth;
      const res = await api.get<{ payments: Payment[] }>("/api/v1/finance/payments", { params });
      setPayments(res.data.payments);
    } finally {
      setLoadingPay(false);
    }
  }

  async function loadKasbons() {
    setLoadingKasbon(true);
    try {
      const params: Record<string, string> = { limit: "200" };
      if (kasbonStatusFilter !== "all") params.status = kasbonStatusFilter;
      const [listRes, summaryRes] = await Promise.all([
        api.get<{ kasbons: Kasbon[] }>("/api/v1/finance/kasbons", { params }),
        api.get<KasbonSummaryData>("/api/v1/finance/kasbon-summary"),
      ]);
      setKasbons(listRes.data.kasbons);
      setKasbonSummary(summaryRes.data);
    } finally {
      setLoadingKasbon(false);
    }
  }

  async function loadWorkerKasbons() {
    setLoadingWorkerKasbon(true);
    try {
      const params: Record<string, string> = {};
      if (workerKasbonFilter === "settled") params.is_settled = "true";
      if (workerKasbonFilter === "active") params.is_settled = "false";
      const res = await api.get<{ kasbons: WorkerKasbon[] }>("/api/v1/mandor/worker-kasbons", { params });
      setWorkerKasbons(res.data.kasbons);
    } catch { setWorkerKasbons([]); }
    finally { setLoadingWorkerKasbon(false); }
  }

  async function handleKasbonAction(id: string, action: "approved" | "rejected", cashAccountId?: string) {
    try {
      await api.patch(`/api/v1/kasbons/${id}/status`, { status: action, cash_account_id: cashAccountId || undefined });
      loadKasbons();
      loadSummary();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg) alert(msg);
    }
  }

  const [approvingKasbonId, setApprovingKasbonId] = useState<string | null>(null);
  const [kasbonCashAccountId, setKasbonCashAccountId] = useState("");
  const [kasbonCashAccounts, setKasbonCashAccounts] = useState<CashAccount[]>([]);

  function openKasbonApprove(id: string) {
    setApprovingKasbonId(id);
    if (kasbonCashAccounts.length === 0) {
      api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts").then(r => {
        setKasbonCashAccounts(r.data.accounts);
        const main = r.data.accounts.find(a => a.type === "main");
        if (main) setKasbonCashAccountId(main.id);
      }).catch(() => {});
    }
  }

  function handleInvSearchChange(val: string) {
    setInvSearchInput(val);
    if (invDebounce.current) clearTimeout(invDebounce.current);
    invDebounce.current = setTimeout(() => setInvSearch(val), 300);
  }

  // ── Arus Kas state ──
  const now = new Date();
  const defaultArusFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const defaultArusTo   = now.toISOString().split("T")[0];

  const [arusFrom, setArusFrom] = useState(defaultArusFrom);
  const [arusTo,   setArusTo]   = useState(defaultArusTo);
  const [arusProjectId, setArusProjectId] = useState("");
  const [arusTypes, setArusTypes] = useState<string[]>(["payment", "expense", "wage", "kasbon", "progress_payment", "settlement_borongan"]);
  const [arusCategoryId, setArusCategoryId] = useState("");
  const [arusCategoryName, setArusCategoryName] = useState("");

  const [arusViewMode, setArusViewMode] = useState<"mutasi" | "chart">("mutasi");
  const [arusData, setArusData] = useState<ArusKasData | null>(null);
  const [arusChart, setArusChart] = useState<ArusKasChartPoint[]>([]);
  const [arusLoading, setArusLoading] = useState(false);
  const [arusChartLoading, setArusChartLoading] = useState(false);
  const [arusProjectList, setArusProjectList] = useState<Project[]>([]);
  const [arusCategories, setArusCategories] = useState<ExpenseCategory[]>([]);
  const [arusExpandedId, setArusExpandedId] = useState<string | null>(null);

  const arusDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Profitabilitas state ──
  interface ProfitProject {
    id: string; name: string; contract_model: string; contract_value: number;
    revenue: number; paid: number; outstanding: number;
    labor_cost: number; material_cost: number; non_labor_cost: number; total_cost: number;
    gross_profit: number; gross_margin_pct: number; advance_outstanding: number;
  }
  interface ProfitTotals { revenue: number; paid: number; labor_cost: number; material_cost: number; non_labor_cost: number; total_cost: number; gross_profit: number; advance_outstanding: number; }

  const [profitData, setProfitData] = useState<{ projects: ProfitProject[]; totals: ProfitTotals } | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitProjectFilter, setProfitProjectFilter] = useState("");
  const [profitFrom, setProfitFrom] = useState("");
  const [profitTo, setProfitTo] = useState("");

  useEffect(() => {
    if (tab === "aruskas") {
      if (arusProjectList.length === 0) {
        api.get<{ projects: Project[] }>("/api/v1/projects").then(r => setArusProjectList(r.data.projects)).catch(() => {});
      }
      loadArusKas(arusFrom, arusTo, arusProjectId, arusTypes, arusCategoryId, arusCategoryName);
    }
  }, [tab]);

  // Re-fetch kategori dropdown saat project filter berubah
  useEffect(() => {
    if (tab !== "aruskas") return;
    const url = arusProjectId
      ? `/api/v1/cash/categories?project_id=${arusProjectId}`
      : "/api/v1/cash/categories";
    api.get<{ categories: ExpenseCategory[] }>(url)
      .then(r => {
        setArusCategories(r.data.categories);
        setArusCategoryId("");
        setArusCategoryName("");
      })
      .catch(() => {});
  }, [tab, arusProjectId]);

  useEffect(() => {
    if (tab !== "aruskas") return;
    if (arusDebounce.current) clearTimeout(arusDebounce.current);
    arusDebounce.current = setTimeout(
      () => loadArusKas(arusFrom, arusTo, arusProjectId, arusTypes, arusCategoryId, arusCategoryName),
      300
    );
    return () => { if (arusDebounce.current) clearTimeout(arusDebounce.current); };
  }, [arusFrom, arusTo, arusProjectId, arusTypes, arusCategoryId, arusCategoryName]);

  async function loadArusKas(
    from: string, to: string, projectId: string, types: string[],
    catId: string, catName: string,
  ) {
    setArusLoading(true);
    setArusChartLoading(true);
    try {
      const params: Record<string, string> = {
        date_from: from, date_to: to,
        type: types.join(","),
      };
      if (projectId) params.project_id = projectId;
      if (catId && projectId) {
        params.category_id = catId;
      } else if (catName) {
        params.category_name = catName;
      }

      const [txRes, chartRes] = await Promise.all([
        api.get<ArusKasData>("/api/v1/finance/cashflow-transactions", { params }),
        api.get<{ chartData: ArusKasChartPoint[] }>("/api/v1/finance/cashflow-chart", { params }),
      ]);
      setArusData(txRes.data);
      setArusChart(chartRes.data.chartData);
    } catch {
      setArusData(null);
    } finally {
      setArusLoading(false);
      setArusChartLoading(false);
    }
  }

  async function loadProfitability(from?: string, to?: string, pid?: string) {
    setProfitLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      if (pid)  params.project_id = pid;
      const res = await api.get("/api/v1/finance/profitability", { params });
      setProfitData(res.data);
    } catch { setProfitData(null); }
    finally { setProfitLoading(false); }
  }

  useEffect(() => {
    if (tab === "profitabilitas") loadProfitability(profitFrom, profitTo, profitProjectFilter);
  }, [tab, profitFrom, profitTo, profitProjectFilter]);

  function toggleArusType(t: string) {
    setArusTypes(prev =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) : [...prev, t]
    );
  }

  const overdueInvoices = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled" && daysUntil(i.due_date) < 0);

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div className="rise" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Keuangan
          </h1>
          <p style={{ fontSize: 13, color: C.mid }}>
            Invoice, pembayaran, kasbon, dan cashflow proyek
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreateInvoice(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#002244"; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
          >
            <Plus size={15} /> Buat Invoice
          </button>
        )}
      </div>

      {/* ── KPI Cards Row 1: Kas & Arus ── */}
      <div className="rise rise-1" style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {loadingSummary ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ flex: 1, minWidth: 160, ...card, padding: "16px 18px", display: "flex", gap: 14, alignItems: "center" }}>
              <Skeleton h={44} w={44} />
              <div style={{ flex: 1 }}><Skeleton h={12} w="60%" /><div style={{ marginTop: 8 }} /><Skeleton h={20} /></div>
            </div>
          ))
        ) : summary ? (
          <>
            <KpiCard label="Total Kas" value={fmtCompact(summary.totalKas)} sub={`Utama ${fmtCompact(summary.totalKasMain)} · Kolektor ${fmtCompact(summary.totalKasCollector)}`} icon={<Wallet size={20} color={C.navy} />} accent={C.navy} />
            <KpiCard label="Pendapatan Diterima" value={fmtCompact(summary.paidThisMonth)} sub={`periode ${summary.periodLabel ?? "ini"}`} icon={<TrendingUp size={20} color={C.green} />} accent={C.green} border={C.greenBorder} />
            <KpiCard label="Biaya Keluar" value={fmtCompact(summary.totalKeluar ?? summary.keluarThisMonth)} sub={`Labor ${fmtCompact(summary.laborCost ?? 0)} · Material ${fmtCompact(summary.materialCost ?? 0)}`} icon={<TrendingDown size={20} color={C.red} />} accent={C.red} border={C.redBorder} />
            <KpiCard label="Advance Beredar" value={fmtCompact(summary.advanceBeredar ?? 0)} sub="kasbon belum dilunasi" icon={<ArrowUpRight size={20} color={C.yellow} />} accent={C.yellow} border={C.yellowBorder} />
            <KpiCard label="Outstanding Invoice" value={fmtCompact(summary.totalOutstanding)} sub={`${summary.overdueCount > 0 ? `${summary.overdueCount} overdue` : "semua on-track"}`} icon={<Clock size={20} color={C.blue} />} accent={C.blue} border={C.blueBorder} />
            <KpiCard label="Upah Pending Bayar" value={fmtCompact(summary.wagePendingTotal)} sub={`${summary.wagePendingCount} laporan disetujui`} icon={<Banknote size={20} color="#7C3AED" />} accent="#7C3AED" border="#DDD6FE" />
          </>
        ) : null}
      </div>

      {/* ── Tabs ── */}
      <div className="rise rise-2" style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
          <Tab label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
          <Tab label="Invoice" active={tab === "invoice"} onClick={() => { setTab("invoice"); }} count={invoices.length || undefined} />
          <Tab label="Pembayaran Masuk" active={tab === "pembayaran"} onClick={() => setTab("pembayaran")} count={payments.length || undefined} />
          <Tab label="Kasbon" active={tab === "kasbon"} onClick={() => setTab("kasbon")} count={kasbons.filter(k => k.status === "pending").length || undefined} />
          <Tab label="Arus Kas" active={tab === "aruskas"} onClick={() => setTab("aruskas")} />
          <Tab label="Profitabilitas" active={tab === "profitabilitas"} onClick={() => setTab("profitabilitas")} />
        </div>

        {/* ── Tab: Overview ── */}
        {tab === "overview" && (
          <div style={{ padding: 24 }}>

            {/* Period filter bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {(["this_month", "last_3_months", "last_6_months", "this_year", "custom"] as const).map(p => {
                  const labels: Record<string, string> = {
                    this_month: "Bulan Ini", last_3_months: "3 Bulan",
                    last_6_months: "6 Bulan", this_year: "Tahun Ini", custom: "Kustom",
                  };
                  const active = overviewPeriod === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setOverviewPeriod(p)}
                      style={{
                        padding: "6px 14px", borderRadius: 99, border: `1px solid ${active ? C.navy : C.border}`,
                        background: active ? C.navy : "var(--surface)", color: active ? "var(--surface)" : C.mid,
                        fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {labels[p]}
                    </button>
                  );
                })}
                {overviewPeriod === "custom" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                    <input aria-label="Tanggal mulai"
                      type="date"
                      value={overviewFrom}
                      onChange={e => setOverviewFrom(e.target.value)}
                      style={{ padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, outline: "none" }}
                    />
                    <span style={{ color: C.muted, fontSize: 12 }}>–</span>
                    <input aria-label="Tanggal akhir"
                      type="date"
                      value={overviewTo}
                      onChange={e => setOverviewTo(e.target.value)}
                      style={{ padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, outline: "none" }}
                    />
                  </div>
                )}
                {summary?.periodLabel && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: C.muted, fontStyle: "italic" }}>
                    Menampilkan: {summary.periodLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Alert strip */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {summary && summary.overdueCount > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: C.redBg, border: `1px solid ${C.redBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.red, flex: 1 }}>
                    {summary.overdueCount} invoice jatuh tempo · Total {fmtCompact(summary.totalOverdue)}
                  </span>
                  <button onClick={() => { setTab("invoice"); setInvStatusFilter("overdue"); }}
                    style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: "var(--surface)", color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Lihat →
                  </button>
                </div>
              )}
              {summary && summary.kasbonPendingCount > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <Clock size={16} color={C.yellow} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.yellow, flex: 1 }}>
                    {summary.kasbonPendingCount} kasbon menunggu persetujuan · {fmtCompact(summary.kasbonPendingTotal)}
                  </span>
                  <button onClick={() => setTab("kasbon")}
                    style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.yellowBorder}`, background: "var(--surface)", color: C.yellow, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Review →
                  </button>
                </div>
              )}
              {summary && summary.wagePendingCount > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: C.blueBg, border: `1px solid ${C.blueBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <Banknote size={16} color={C.blue} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.blue, flex: 1 }}>
                    {summary.wagePendingCount} laporan upah mandor siap dibayar · {fmtCompact(summary.wagePendingTotal)}
                  </span>
                </div>
              )}
            </div>

            {/* Saldo per akun kas */}
            {summary && summary.cashAccounts.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Wallet size={14} color={C.navy} /> Saldo Kas Real-time
                </h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {summary.cashAccounts.map(acc => {
                    const typeColor = acc.type === "main" ? C.navy : acc.type === "collector" ? "#7C3AED" : C.green;
                    const typeBg = acc.type === "main" ? C.navyLight : acc.type === "collector" ? "#F5F3FF" : C.greenBg;
                    const typeLabel = acc.type === "main" ? "Kas Utama" : acc.type === "collector" ? "Kolektor" : "Kas Kecil";
                    return (
                      <div key={acc.id} style={{ flex: 1, minWidth: 160, padding: "14px 16px", borderRadius: 12, border: `1px solid ${typeBg === C.navyLight ? "var(--info-border)" : typeBg === "#F5F3FF" ? "#DDD6FE" : C.greenBorder}`, background: "var(--surface)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: typeBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Wallet size={13} color={typeColor} />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{acc.name}</div>
                            <div style={{ fontSize: 10, color: typeColor, fontWeight: 600 }}>{typeLabel}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: acc.balance < 0 ? C.red : C.text, fontFamily: "var(--font-display)" }}>
                          {fmtCompact(Number(acc.balance))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Breakdown biaya — 3 semantic group cards */}
            {summary && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                  Rincian Biaya — {summary.periodLabel ?? "Periode ini"}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

                  {/* Group 1: Biaya Tenaga Kerja */}
                  <div style={{ padding: "16px 18px", borderRadius: 12, border: `1px solid ${C.blueBorder}`, background: C.blueBg }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 5 }}>
                      <Banknote size={12} color={C.blue} /> Biaya Tenaga Kerja
                    </h4>
                    {[
                      { label: "Upah Mandor Dibayar", value: summary.wageThisMonth },
                      { label: "Bayar Progress %", value: summary.progressThisMonth ?? 0 },
                      { label: "Settlement Borongan", value: summary.settlementThisMonth ?? 0 },
                      { label: "Expense Labor", value: summary.laborExpenseCost ?? 0 },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(191,219,254,0.5)" }}>
                        <span style={{ fontSize: 12, color: C.text }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: row.value > 0 ? C.blue : C.muted, fontFamily: "monospace" }}>
                          {row.value > 0 ? fmtCompact(row.value) : "—"}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.blueBorder}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>Total Labor</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.blue, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.laborCost ?? 0)}</span>
                    </div>
                  </div>

                  {/* Group 2: Material & Operasional */}
                  <div style={{ padding: "16px 18px", borderRadius: 12, border: `1px solid ${C.redBorder}`, background: C.redBg }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 5 }}>
                      <Receipt size={12} color={C.red} /> Material & Operasional
                    </h4>
                    {[
                      { label: "Material", value: summary.materialCost ?? 0 },
                      { label: "Equipment / Sewa Alat", value: summary.equipmentCost ?? 0 },
                      { label: "Operasional", value: summary.operationalCost ?? 0 },
                      { label: "Lain-lain", value: summary.otherCost ?? 0 },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(254,202,202,0.5)" }}>
                        <span style={{ fontSize: 12, color: C.text }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: row.value > 0 ? C.red : C.muted, fontFamily: "monospace" }}>
                          {row.value > 0 ? fmtCompact(row.value) : "—"}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.redBorder}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>Total Non-Labor</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.nonLaborCost ?? 0)}</span>
                    </div>
                  </div>

                  {/* Group 3: Advance Mandor */}
                  <div style={{ padding: "16px 18px", borderRadius: 12, border: `1px solid ${C.yellowBorder}`, background: C.yellowBg }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: C.yellow, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 5 }}>
                      <ArrowUpRight size={12} color={C.yellow} /> Advance Mandor (Uang Muka)
                    </h4>
                    <div style={{ padding: "5px 0", borderBottom: "1px solid rgba(253,230,138,0.5)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: C.text }}>Kasbon Beredar (aktif)</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: "monospace" }}>{fmtCompact(summary.advanceBeredar ?? 0)}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>approved, belum dilunasi</div>
                    </div>
                    <div style={{ padding: "5px 0", borderBottom: "1px solid rgba(253,230,138,0.5)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: C.text }}>Dilunasi Periode Ini</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.green, fontFamily: "monospace" }}>
                          {(summary.kasbonSettledPeriod ?? 0) > 0 ? `−${fmtCompact(summary.kasbonSettledPeriod ?? 0)}` : "—"}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>settled di periode ini</div>
                    </div>
                    <div style={{ padding: "8px 0 0" }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>
                        Advance mandor adalah uang muka (aset lancar), bukan biaya langsung. Biaya terjadi saat settlement.
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.yellowBorder}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.yellow }}>Net Advance</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.yellow, fontFamily: "var(--font-display)" }}>
                        {fmtCompact(Math.max(0, (summary.advanceBeredar ?? 0) - (summary.kasbonSettledPeriod ?? 0)))}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Total baris bawah */}
                <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: "var(--surface)", border: `1px solid ${C.border}`, display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Total Biaya Nyata:</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.totalKeluar ?? summary.keluarThisMonth)}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>(labor + material + ops)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Advance Beredar:</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: C.yellow, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.advanceBeredar ?? 0)}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>(tidak termasuk biaya)</span>
                  </div>
                </div>

                {/* Ringkasan Invoice di bawah breakdown */}
                <div style={{ marginTop: 14, padding: "14px 18px", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                  <h4 style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
                    Ringkasan Invoice
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Total Ditagih", value: summary.totalInvoiced, color: C.navy },
                      { label: "Sudah Lunas", value: summary.totalPaid, color: C.green },
                      { label: "Belum Lunas", value: summary.totalOutstanding, color: C.yellow },
                      { label: "Jatuh Tempo", value: summary.totalOverdue, color: C.red },
                    ].map(row => (
                      <div key={row.label} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#FAFAFA" }}>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{row.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: row.color, fontFamily: "var(--font-display)" }}>{fmtCompact(row.value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Cashflow Chart */}
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Activity size={14} color={C.navy} /> Cashflow — {summary?.periodLabel ?? "Periode ini"}
            </h3>
            {cashflow.length === 0 ? (
              <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13, background: "#FAFAFA", borderRadius: 12, border: `1px solid ${C.border}` }}>
                {loadingSummary ? "Memuat data cashflow..." : "Tidak ada data cashflow untuk periode ini."}
              </div>
            ) : (
              <div style={{ background: "#FAFAFA", borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 8px 8px" }}>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={cashflow} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-hover)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} />
                    <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={72} />
                    <Tooltip content={<CashflowTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="masuk" name="Masuk" fill="#22C55E" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="keluar" name="Keluar" fill="#F87171" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                    <Line dataKey="net" name="Net" stroke={C.navy} strokeWidth={2.5} dot={{ r: 4, fill: C.navy, strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Invoice ── */}
        {tab === "invoice" && (
          <div style={{ padding: 24 }}>
            {/* Filter bar */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                <input
                  value={invSearchInput}
                  onChange={e => handleInvSearchChange(e.target.value)}
                  placeholder="Cari no. invoice atau nama proyek..."
                  style={{ width: "100%", padding: "8px 12px 8px 30px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box" }}
                  onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.08)"; }}
                  onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <select
                aria-label="Saring invoice menurut status"
                value={invStatusFilter}
                onChange={e => setInvStatusFilter(e.target.value)}
                style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none" }}
              >
                <option value="all">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Terkirim</option>
                <option value="partial">Parsial</option>
                <option value="paid">Lunas</option>
                <option value="overdue">Jatuh Tempo</option>
                <option value="cancelled">Batal</option>
              </select>
              <button onClick={loadInvoices} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            {loadingInv ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}><Skeleton h={14} /></div>)}
              </div>
            ) : invoices.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
                <Receipt size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Tidak ada invoice</p>
                <p>Coba ubah filter atau buat invoice baru.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                      {["No Invoice", "Proyek", "Total", "Terbayar", "Sisa", "Jatuh Tempo", "Status", "Aksi"].map((h, i) => (
                        <th key={i} style={{ padding: "10px 14px", textAlign: i >= 2 && i !== 7 ? "right" : i === 7 ? "center" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <InvoiceRow key={inv.id} inv={inv} onPayClick={setPayingInvoice} onPdfClick={handleDownloadPDF} loadingPdf={loadingPdfId === inv.id} canEdit={canEdit} />
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: C.muted, textAlign: "right", paddingTop: 12 }}>
                  {invoices.length} invoice ditampilkan
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Pembayaran ── */}
        {tab === "pembayaran" && (
          <div style={{ padding: 24 }}>
            {/* Filter */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, whiteSpace: "nowrap" }}>Bulan:</label>
              <input
                type="month"
                value={payMonth}
                onChange={e => setPayMonth(e.target.value)}
                style={{ padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, outline: "none" }}
              />
              {payMonth && (
                <button onClick={() => setPayMonth("")} style={{ padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <X size={12} /> Reset
                </button>
              )}
              <button onClick={loadPayments} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Refresh
              </button>
              {payments.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: C.green }}>
                  Total: {fmt(payments.reduce((s, p) => s + Number(p.amount_paid), 0))}
                </span>
              )}
            </div>

            {loadingPay ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}><Skeleton h={14} /></div>)}
              </div>
            ) : payments.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
                <ArrowDownLeft size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Tidak ada pembayaran</p>
                <p>{payMonth ? "Tidak ada pembayaran di bulan ini." : "Belum ada history pembayaran."}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {payments.map(p => (
                  <div key={p.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 140px 100px",
                    alignItems: "center", gap: 16,
                    padding: "14px 16px", borderRadius: 10,
                    border: `1px solid ${C.border}`, background: "#FAFAFA",
                  }}>
                    {/* Invoice info */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 2, fontFamily: "var(--font-display)" }}>
                        {(p.invoices as any)?.invoice_number ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: C.mid }}>
                        {(p.invoices as any)?.projects?.name ?? "—"}
                      </div>
                    </div>
                    {/* Metode + ref */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 2 }}>
                        {p.payment_method === "transfer_bank" ? "Transfer Bank"
                          : p.payment_method === "cash" ? "Tunai"
                          : p.payment_method.toUpperCase()}
                        {p.bank_name && <span style={{ color: C.muted }}> · {p.bank_name}</span>}
                      </div>
                      {p.ref_number && <div style={{ fontSize: 11, color: C.muted }}>{p.ref_number}</div>}
                      {p.cash_account ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, marginTop: 2, padding: "2px 7px", borderRadius: 4, background: C.navyLight, color: C.navy, fontWeight: 600 }}>
                          <Wallet size={10} /> {p.cash_account.name}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Tidak tercatat ke kas</div>
                      )}
                      {p.recorder && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>oleh {p.recorder.name}</div>}
                    </div>
                    {/* Tanggal */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: C.mid }}>{fmtDate(p.paid_at)}</div>
                      {p.proof_url && (
                        <a href={p.proof_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: C.navy, marginTop: 3 }}>
                          <ExternalLink size={10} /> Lihat bukti
                        </a>
                      )}
                    </div>
                    {/* Nominal */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.green, fontFamily: "var(--font-display)" }}>
                        {fmtCompact(Number(p.amount_paid))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Kasbon ── */}
        {tab === "kasbon" && (
          <div style={{ padding: 24 }}>

            {/* Kasbon type switcher: Mandor vs Tukang */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                {(["mandor", "tukang"] as const).map(kt => (
                  <button
                    key={kt}
                    onClick={() => setKasbonType(kt)}
                    style={{
                      padding: "7px 18px", border: "none", cursor: "pointer",
                      background: kasbonType === kt ? C.navy : "var(--surface)",
                      color: kasbonType === kt ? "var(--surface)" : C.mid,
                      fontSize: 13, fontWeight: kasbonType === kt ? 700 : 400,
                      transition: "all 0.15s",
                    }}
                  >
                    {kt === "mandor" ? "Kasbon Mandor" : "Kasbon Tukang"}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>
                {kasbonType === "mandor" ? "Advance operasional mandor (dari kas proyek)" : "Advance upah tukang (dipotong dari gaji)"}
              </span>
              <div style={{ flex: 1 }} />
              {canEdit && kasbonType === "mandor" && (
                <button onClick={() => setShowAddKasbon(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#002244"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}>
                  <Plus size={13} /> Tambah Kasbon
                </button>
              )}
            </div>

            {/* ── Kasbon Mandor ── */}
            {kasbonType === "mandor" && (<>
            {/* Sub-tab bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
              {(["daftar", "summary"] as const).map(st => (
                <button key={st} onClick={() => setKasbonSubTab(st)} style={{
                  padding: "8px 18px", border: "none", background: "transparent", cursor: "pointer",
                  fontSize: 13, fontWeight: kasbonSubTab === st ? 600 : 400,
                  color: kasbonSubTab === st ? C.navy : C.mid,
                  borderBottom: `2px solid ${kasbonSubTab === st ? C.navy : "transparent"}`,
                  marginBottom: -1, transition: "all 0.15s",
                }}>
                  {st === "daftar" ? "Daftar Transaksi" : "Summary per Mandor"}
                </button>
              ))}
            </div>

            {/* Pending alert banner */}
            {kasbons.filter(k => k.status === "pending").length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
                <Clock size={15} color={C.yellow} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.yellow, flex: 1 }}>
                  {kasbons.filter(k => k.status === "pending").length} kasbon menunggu persetujuan Anda
                  {" · "}{fmt(kasbons.filter(k => k.status === "pending").reduce((s, k) => s + Number(k.amount), 0))}
                </span>
                <button onClick={() => { setKasbonSubTab("daftar"); setKasbonStatusFilter("pending"); }}
                  style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.yellowBorder}`, background: "var(--surface)", color: C.yellow, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Review →
                </button>
              </div>
            )}

            {/* ── Sub-tab: Daftar ── */}
            {kasbonSubTab === "daftar" && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <select aria-label="Saring status kasbon" value={kasbonStatusFilter} onChange={e => setKasbonStatusFilter(e.target.value)}
                    style={{ padding: "7px 11px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none" }}>
                    <option value="all">Semua Status</option>
                    <option value="pending">Menunggu Persetujuan</option>
                    <option value="approved">Disetujui</option>
                    <option value="rejected">Ditolak</option>
                    <option value="settled">Settled</option>
                  </select>
                  <button onClick={loadKasbons} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                    <RefreshCw size={13} /> Refresh
                  </button>
                  {kasbons.length > 0 && (
                    <span style={{ fontSize: 12, color: C.mid }}>
                      {kasbons.length} kasbon · Total <strong style={{ color: C.text }}>{fmt(kasbons.reduce((s, k) => s + Number(k.amount), 0))}</strong>
                    </span>
                  )}
                </div>

                {loadingKasbon ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[1,2,3].map(i => <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}><Skeleton h={14} /></div>)}
                  </div>
                ) : kasbons.length === 0 ? (
                  <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
                    <Banknote size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                    <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Tidak ada kasbon</p>
                    <p>Belum ada kasbon yang tercatat.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {kasbons.map(k => {
                      const ma = k.work_scopes?.mandor_assignments?.[0];
                      const project = ma?.projects;
                      const mandor = ma?.mandor;
                      return (
                        <div key={k.id} style={{
                          padding: "14px 16px", borderRadius: 12,
                          border: `1px solid ${k.status === "pending" ? C.yellowBorder : C.border}`,
                          background: k.status === "pending" ? C.yellowBg : "#FAFAFA",
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                                <StatusBadge status={k.status} map={KASBON_STATUS} />
                                <span style={{ fontSize: 11, color: C.muted, background: "var(--surface-hover)", padding: "2px 8px", borderRadius: 4 }}>
                                  {FUND_SOURCE_LABEL[k.fund_source] ?? k.fund_source}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.navy, background: C.navyLight, padding: "2px 8px", borderRadius: 4 }}>
                                  {PURPOSE_LABEL[k.purpose] ?? k.purpose}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                                {mandor?.name ?? k.requester?.name ?? "—"}
                                {project && <span style={{ fontSize: 12, color: C.mid, fontWeight: 400 }}> · {project.name}</span>}
                              </div>
                              {k.work_scopes && (
                                <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Scope: {k.work_scopes.scope_name}</div>
                              )}
                              <div style={{ fontSize: 11, color: C.muted, display: "flex", gap: 12 }}>
                                <span>{fmtDate(k.kasbon_date)}</span>
                                {k.requester && <span>oleh {k.requester.name}</span>}
                                {k.approver && k.status === "approved" && <span style={{ color: C.green }}>✓ disetujui {k.approver.name}</span>}
                              </div>
                              {k.cash_account && k.status === "approved" && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, marginTop: 4, padding: "2px 8px", borderRadius: 4, background: C.navyLight, color: C.navy, fontWeight: 600 }}>
                                  <Wallet size={10} /> {k.cash_account.name}
                                </div>
                              )}
                              {k.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>"{k.notes}"</div>}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: k.status === "pending" ? C.yellow : C.text, fontFamily: "var(--font-display)", marginBottom: 8 }}>
                                {fmt(Number(k.amount))}
                              </div>
                              {canEdit && k.status === "pending" && approvingKasbonId !== k.id && (
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button onClick={() => handleKasbonAction(k.id, "rejected")}
                                    style={{ padding: "5px 11px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                    Tolak
                                  </button>
                                  <button onClick={() => openKasbonApprove(k.id)}
                                    style={{ padding: "5px 11px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                    ✓ Setujui
                                  </button>
                                </div>
                              )}
                              {canEdit && k.status === "pending" && approvingKasbonId === k.id && (
                                <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: C.greenBg, border: `1px solid ${C.greenBorder}`, textAlign: "left", minWidth: 230 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: C.green, marginBottom: 6 }}>Potong dari kas:</div>
                                  <select aria-label="Sumber kas pembayaran kasbon" value={kasbonCashAccountId} onChange={e => setKasbonCashAccountId(e.target.value)}
                                    style={{ width: "100%", padding: "7px 9px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, background: "var(--surface)", outline: "none", marginBottom: 8, boxSizing: "border-box" }}>
                                    <option value="">— Tanpa potong kas —</option>
                                    {kasbonCashAccounts.map(a => (
                                      <option key={a.id} value={a.id}>{a.name} · {fmtCompact(Number(a.balance))}</option>
                                    ))}
                                  </select>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => setApprovingKasbonId(null)}
                                      style={{ flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 11, cursor: "pointer" }}>Batal</button>
                                    <button onClick={() => { handleKasbonAction(k.id, "approved", kasbonCashAccountId || undefined); setApprovingKasbonId(null); }}
                                      style={{ flex: 2, padding: "6px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Konfirmasi Setuju</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── Sub-tab: Summary per Mandor ── */}
            {kasbonSubTab === "summary" && (
              <div>
                {loadingKasbon ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 100, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={100} /></div>)}
                  </div>
                ) : !kasbonSummary || kasbonSummary.summary.length === 0 ? (
                  <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
                    <PieChart size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                    <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Belum ada data kasbon</p>
                  </div>
                ) : (
                  <>
                    {/* Grand total per kategori */}
                    <div style={{ marginBottom: 20, padding: "16px 18px", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                        <PieChart size={13} color={C.navy} /> Total Kasbon per Kategori (Semua Mandor)
                      </h3>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {Object.entries(kasbonSummary.grandByPurpose).sort((a,b) => b[1]-a[1]).map(([purpose, total]) => {
                          const purposeColors: Record<string, string> = {
                            gaji_tukang: C.navy, uang_makan: C.green,
                            pembelian_alat: C.yellow, operasional: "#7C3AED", lain_lain: C.mid,
                          };
                          const col = purposeColors[purpose] ?? C.mid;
                          return (
                            <div key={purpose} style={{ flex: "1 1 140px", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#FAFAFA" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                                {PURPOSE_LABEL[purpose] ?? purpose}
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>
                                {fmtCompact(total)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Per mandor */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {kasbonSummary.summary.map(m => {
                        const pct = m.totalApproved / (m.total || 1) * 100;
                        return (
                          <div key={m.mandorId} style={{ padding: "16px 18px", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{m.mandorName}</div>
                                <div style={{ fontSize: 11, color: C.muted }}>
                                  {m.kasbonCount} kasbon · {m.projectCount} proyek
                                </div>
                                {/* Progress bar: approved vs total */}
                                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ flex: 1, height: 5, borderRadius: 5, background: C.border, overflow: "hidden" }}>
                                    <div style={{ height: "100%", borderRadius: 5, background: C.green, width: `${pct}%` }} />
                                  </div>
                                  <span style={{ fontSize: 10, color: C.mid, flexShrink: 0 }}>{Math.round(pct)}% approved</span>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>{fmtCompact(m.total)}</div>
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                                  {m.totalPending > 0 && <span style={{ fontSize: 10, color: C.yellow, fontWeight: 600, background: C.yellowBg, padding: "2px 7px", borderRadius: 4 }}>pending {fmtCompact(m.totalPending)}</span>}
                                  {m.totalApproved > 0 && <span style={{ fontSize: 10, color: C.green, fontWeight: 600, background: C.greenBg, padding: "2px 7px", borderRadius: 4 }}>approved {fmtCompact(m.totalApproved)}</span>}
                                </div>
                              </div>
                            </div>

                            {/* Breakdown per kategori */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              {Object.entries(m.byPurpose).sort((a,b) => b[1]-a[1]).map(([purpose, total]) => {
                                const purposeColors: Record<string, string> = {
                                  gaji_tukang: C.navy, uang_makan: C.green,
                                  pembelian_alat: C.yellow, operasional: "#7C3AED", lain_lain: C.mid,
                                };
                                const col = purposeColors[purpose] ?? C.mid;
                                const pctOfTotal = total / (m.total || 1) * 100;
                                return (
                                  <div key={purpose} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--surface-subtle)" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{PURPOSE_LABEL[purpose] ?? purpose}</div>
                                      <div style={{ height: 3, borderRadius: 3, background: C.border, marginTop: 3, overflow: "hidden" }}>
                                        <div style={{ height: "100%", borderRadius: 3, background: col, width: `${pctOfTotal}%` }} />
                                      </div>
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: col, flexShrink: 0 }}>{fmtCompact(total)}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Breakdown per proyek (kalau > 1) */}
                            {m.byProject.length > 1 && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid #F3F4F6` }}>
                                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Per Proyek:</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {m.byProject.sort((a,b) => b.total-a.total).map(p => (
                                    <span key={p.name} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: C.navyLight, color: C.navy, fontWeight: 600 }}>
                                      {p.name} · {fmtCompact(p.total)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            </>)}

            {/* ── Kasbon Tukang ── */}
            {kasbonType === "tukang" && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <select aria-label="Saring kasbon tukang" value={workerKasbonFilter} onChange={e => setWorkerKasbonFilter(e.target.value)}
                    style={{ padding: "7px 11px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none" }}>
                    <option value="all">Semua</option>
                    <option value="active">Belum Lunas</option>
                    <option value="settled">Sudah Lunas</option>
                  </select>
                  <button onClick={loadWorkerKasbons} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                    <RefreshCw size={13} /> Refresh
                  </button>
                  {workerKasbons.length > 0 && (
                    <span style={{ fontSize: 12, color: C.mid }}>
                      {workerKasbons.length} kasbon tukang · Beredar <strong style={{ color: C.yellow }}>
                        {fmtCompact(workerKasbons.filter(k => !k.is_settled).reduce((s, k) => s + Number(k.amount) - Number(k.amount_settled ?? 0), 0))}
                      </strong>
                    </span>
                  )}
                </div>

                {/* Info banner */}
                <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 12, color: C.yellow, fontWeight: 500 }}>
                  Kasbon tukang adalah advance upah individual — dilunasi via potongan laporan upah berikutnya (bukan dari kas proyek).
                </div>

                {loadingWorkerKasbon ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[1, 2, 3].map(i => <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}><Skeleton h={14} /></div>)}
                  </div>
                ) : workerKasbons.length === 0 ? (
                  <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
                    <Banknote size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                    <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Tidak ada kasbon tukang</p>
                    <p>Belum ada advance tukang yang tercatat.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {workerKasbons.map(wk => {
                      const remaining = Number(wk.amount) - Number(wk.amount_settled ?? 0);
                      const pct = Number(wk.amount) > 0 ? (Number(wk.amount_settled ?? 0) / Number(wk.amount)) * 100 : 0;
                      return (
                        <div key={wk.id} style={{
                          padding: "14px 16px", borderRadius: 12,
                          border: `1px solid ${wk.is_settled ? C.border : C.yellowBorder}`,
                          background: wk.is_settled ? "#FAFAFA" : C.yellowBg,
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                                  color: wk.is_settled ? C.green : C.yellow,
                                  background: wk.is_settled ? C.greenBg : C.yellowBg,
                                  border: `1px solid ${wk.is_settled ? C.greenBorder : C.yellowBorder}`,
                                }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: wk.is_settled ? C.green : C.yellow }} />
                                  {wk.is_settled ? "Lunas" : "Beredar"}
                                </span>
                                <span style={{ fontSize: 11, background: "var(--surface-hover)", padding: "2px 8px", borderRadius: 4, color: C.mid }}>
                                  {PURPOSE_LABEL[wk.purpose] ?? wk.purpose}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                                {wk.worker?.name ?? "—"}
                                {wk.mandor && <span style={{ fontSize: 12, color: C.mid, fontWeight: 400 }}> · Mandor {wk.mandor.name}</span>}
                              </div>
                              {wk.project && <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{wk.project.name}{wk.scope && ` · ${wk.scope.scope_name}`}</div>}
                              <div style={{ fontSize: 11, color: C.muted }}>{fmtDate(wk.kasbon_date)}</div>
                              {!wk.is_settled && (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                    <span style={{ fontSize: 10, color: C.muted }}>Terlunasi {Math.round(pct)}%</span>
                                    <span style={{ fontSize: 10, color: C.yellow }}>Sisa {fmtCompact(remaining)}</span>
                                  </div>
                                  <div style={{ height: 5, borderRadius: 99, background: C.border, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: C.green }} />
                                  </div>
                                </div>
                              )}
                              {wk.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>"{wk.notes}"</div>}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: wk.is_settled ? C.text : C.yellow, fontFamily: "var(--font-display)" }}>
                                {fmt(Number(wk.amount))}
                              </div>
                              {Number(wk.amount_settled ?? 0) > 0 && !wk.is_settled && (
                                <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>
                                  ↓ {fmtCompact(Number(wk.amount_settled))} dilunasi
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

          </div>
        )}

        {/* ── Tab: Arus Kas ── */}
        {tab === "aruskas" && (
          <div style={{ padding: 24 }}>

            {/* Filter Bar */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dari</label>
                <input aria-label="Tanggal mulai" type="date" value={arusFrom} onChange={e => setArusFrom(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sampai</label>
                <input aria-label="Tanggal akhir" type="date" value={arusTo} onChange={e => setArusTo(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Proyek</label>
                <select aria-label="Saring proyek pada arus kas" value={arusProjectId} onChange={e => setArusProjectId(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 160 }}>
                  <option value="">Semua Proyek</option>
                  {arusProjectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Jenis</label>
                <div style={{ display: "flex", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", flexWrap: "wrap" }}>
                  {[
                    { key: "payment",            label: "Pembayaran",    color: C.green },
                    { key: "expense",            label: "Pengeluaran",   color: C.red },
                    { key: "wage",               label: "Upah",          color: C.blue },
                    { key: "kasbon",             label: "Kasbon",        color: C.yellow },
                    { key: "progress_payment",   label: "Prog %",        color: "#7C3AED" },
                    { key: "settlement_borongan", label: "Settlement",   color: "#0891B2" },
                  ].map(t => (
                    <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, fontWeight: 600, color: arusTypes.includes(t.key) ? t.color : C.muted, userSelect: "none" }}>
                      <input type="checkbox" checked={arusTypes.includes(t.key)} onChange={() => toggleArusType(t.key)} style={{ accentColor: t.color, width: 12, height: 12 }} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Kategori</label>
                <select aria-label="Saring kategori pada arus kas" value={arusCategoryId} onChange={e => {
                  const id = e.target.value;
                  const found = arusCategories.find(c => c.id === id);
                  setArusCategoryId(id);
                  setArusCategoryName(found ? found.name : "");
                }}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 140, opacity: arusTypes.includes("expense") ? 1 : 0.4 }}>
                  <option value="">Semua Kategori</option>
                  {arusCategories.filter(c => !c.parent_id).map(parent => (
                    <optgroup key={parent.id} label={parent.name}>
                      {arusCategories.filter(c => c.parent_id === parent.id).map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name}</option>
                      ))}
                      <option value={parent.id}>{parent.name} (semua)</option>
                    </optgroup>
                  ))}
                </select>
              </div>
              {(arusProjectId || arusCategoryId || arusTypes.length < 6) && (
                <div style={{ alignSelf: "flex-end" }}>
                  <button onClick={() => { setArusProjectId(""); setArusCategoryId(""); setArusCategoryName(""); setArusTypes(["payment","expense","wage","kasbon","progress_payment","settlement_borongan"]); setArusFrom(defaultArusFrom); setArusTo(defaultArusTo); }}
                    style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 11, fontWeight: 600, color: C.mid, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <X size={12} /> Reset
                  </button>
                </div>
              )}
              {/* Mode toggle */}
              <div style={{ marginLeft: "auto", alignSelf: "flex-end" }}>
                <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", background: "var(--surface)" }}>
                  {([
                    { key: "mutasi", label: "Mutasi" },
                    { key: "chart",  label: "Chart" },
                  ] as const).map(m => (
                    <button key={m.key} onClick={() => setArusViewMode(m.key)}
                      style={{ padding: "7px 14px", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                        background: arusViewMode === m.key ? C.navy : "transparent",
                        color: arusViewMode === m.key ? "var(--surface)" : C.mid }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* KPI Strip */}
            {arusLoading ? (
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                {[1,2,3,4].map(i => <div key={i} style={{ flex:1, height:72, borderRadius:10, background:"var(--surface-hover)" }} />)}
              </div>
            ) : arusData && (
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.greenBorder}`, background: C.greenBg }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                    <ArrowDownLeft size={12} color={C.green} /> Total Masuk
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: "var(--font-display)" }}>{fmtCompact(arusData.totalIn)}</div>
                  <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>{arusData.byType.payment > 0 ? `Pembayaran ${fmtCompact(arusData.byType.payment)}` : "Tidak ada pembayaran"}</div>
                </div>
                <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.redBorder}`, background: C.redBg }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                    <ArrowUpRight size={12} color={C.red} /> Total Keluar
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)" }}>{fmtCompact(arusData.totalOut)}</div>
                  <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
                    Exp {fmtCompact(arusData.byType.expense)} · Upah {fmtCompact(arusData.byType.wage)} · Kasbon {fmtCompact(arusData.byType.kasbon)}
                    {((arusData.byType.progress_payment ?? 0) > 0 || (arusData.byType.settlement_borongan ?? 0) > 0) && (
                      <> · Prog {fmtCompact(arusData.byType.progress_payment ?? 0)} · Settle {fmtCompact(arusData.byType.settlement_borongan ?? 0)}</>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${arusData.netFlow >= 0 ? C.greenBorder : C.redBorder}`, background: arusData.netFlow >= 0 ? C.greenBg : C.redBg }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Net Flow</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: arusData.netFlow >= 0 ? C.green : C.red, fontFamily: "var(--font-display)" }}>
                    {arusData.netFlow >= 0 ? "+" : ""}{fmtCompact(arusData.netFlow)}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Transaksi</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>{arusData.transactions.length}</div>
                  <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>entri di periode ini</div>
                </div>
              </div>
            )}

            {/* Mode Chart: chart bar + tabel agregasi per periode */}
            {arusViewMode === "chart" && arusChart.length > 0 && (
              <>
                <div style={{ background: "#FAFAFA", borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 8px 8px", marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, paddingLeft: 12, marginBottom: 8 }}>Trend Arus Kas</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={arusChart} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-hover)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} />
                      <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={72} />
                      <Tooltip content={<CashflowTooltip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="masuk" name="Masuk" fill="#22C55E" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="keluar" name="Keluar" fill="#F87171" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                      <Line dataKey="net" name="Net" stroke={C.navy} strokeWidth={2} dot={{ r: 3, fill: C.navy, strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* Tabel agregasi per periode */}
                <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                        {["Periode", "Masuk", "Keluar", "Net"].map((h, i) => (
                          <th key={i} style={{ padding: "10px 14px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {arusChart.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid #F3F4F6` }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{row.label}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: C.green, fontWeight: 600, fontFamily: "monospace" }}>{fmtCompact(row.masuk)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: C.red, fontFamily: "monospace" }}>{fmtCompact(row.keluar)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: row.net >= 0 ? C.green : C.red }}>{row.net >= 0 ? "+" : ""}{fmtCompact(row.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {arusViewMode === "chart" && !arusChartLoading && arusChart.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted, fontSize: 13, background: "#FAFAFA", borderRadius: 12, border: `1px solid ${C.border}` }}>
                Tidak ada data di periode ini
              </div>
            )}

            {/* Mode Mutasi: tabel kronologis */}
            {arusViewMode === "mutasi" && (arusLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1,2,3,4,5].map(i => <div key={i} style={{ height: 52, borderRadius: 8, background: "var(--surface-hover)" }} />)}
              </div>
            ) : !arusData || arusData.transactions.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted, fontSize: 13, background: "#FAFAFA", borderRadius: 12, border: `1px solid ${C.border}` }}>
                Tidak ada transaksi di periode ini
              </div>
            ) : (
              <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                      {["Tanggal", "Keterangan", "Proyek", "Jenis", "Kategori", "Masuk", "Keluar"].map((h, i) => (
                        <th key={i} style={{ padding: "10px 12px", textAlign: i >= 5 ? "right" : "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {arusData.transactions.map(tx => {
                      const expanded = arusExpandedId === tx.id;
                      const typeMeta: Record<string, { label: string; color: string; bg: string; border: string }> = {
                        payment:             { label: "Pembayaran",    color: C.green,   bg: C.greenBg,   border: C.greenBorder },
                        expense:             { label: "Pengeluaran",   color: C.red,     bg: C.redBg,     border: C.redBorder },
                        wage:                { label: "Upah",          color: C.blue,    bg: C.blueBg,    border: C.blueBorder },
                        kasbon:              { label: "Kasbon",        color: C.yellow,  bg: C.yellowBg,  border: C.yellowBorder },
                        progress_payment:    { label: "Progress %",    color: "#7C3AED", bg: "#F5F3FF",   border: "#DDD6FE" },
                        settlement_borongan: { label: "Settlement",    color: "#0891B2", bg: "#ECFEFF",   border: "#A5F3FC" },
                      };
                      const tm = typeMeta[tx.type] ?? { label: tx.type, color: C.muted, bg: "var(--surface-hover)", border: C.border };
                      const dateStr = fmtDate(tx.date);

                      return (
                        <React.Fragment key={tx.id}>
                          <tr
                            onClick={() => setArusExpandedId(expanded ? null : tx.id)}
                            style={{ borderBottom: `1px solid #F3F4F6`, cursor: "pointer", background: expanded ? "#FAFBFF" : "transparent" }}
                            onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "#FAFBFF"; }}
                            onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={{ padding: "10px 12px", color: C.mid, whiteSpace: "nowrap", fontSize: 11 }}>{dateStr}</td>
                            <td style={{ padding: "10px 12px", maxWidth: 240 }}>
                              <div style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.label}</div>
                              {tx.sub_label && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{tx.sub_label}</div>}
                            </td>
                            <td style={{ padding: "10px 12px", color: C.mid, fontSize: 11, whiteSpace: "nowrap" }}>{tx.project?.name ?? "—"}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 600, color: tm.color, background: tm.bg, border: `1px solid ${tm.border}`, whiteSpace: "nowrap" }}>
                                {tm.label}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: 11, color: C.mid }}>
                              {tx.category ? (
                                <span>
                                  {tx.category.parent_name && <span style={{ color: C.muted }}>{tx.category.parent_name} › </span>}
                                  {tx.category.name}
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: C.green, fontFamily: "monospace", fontSize: 12 }}>
                              {tx.direction === "in" ? fmt(tx.amount) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: C.red, fontFamily: "monospace", fontSize: 12 }}>
                              {tx.direction === "out" ? fmt(tx.amount) : "—"}
                            </td>
                          </tr>
                          {expanded && (
                            <tr style={{ background: "#F8FBFF", borderBottom: `1px solid ${C.border}` }}>
                              <td colSpan={7} style={{ padding: "12px 16px" }}>
                                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                                  {Object.entries(tx.meta).filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                                    <div key={k} style={{ fontSize: 11 }}>
                                      <span style={{ color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{k.replace(/_/g," ")} </span>
                                      <span style={{ color: C.text, fontWeight: 500 }}>{String(v)}</span>
                                    </div>
                                  ))}
                                  <div style={{ fontSize: 11 }}>
                                    <span style={{ color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>jumlah </span>
                                    <span style={{ color: tx.direction === "in" ? C.green : C.red, fontWeight: 700 }}>{fmt(tx.amount)}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Profitabilitas ── */}
        {tab === "profitabilitas" && (
          <div style={{ padding: 24 }}>

            {/* Filter bar */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dari</label>
                <input aria-label="Tanggal mulai" type="date" value={profitFrom} onChange={e => setProfitFrom(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sampai</label>
                <input aria-label="Tanggal akhir" type="date" value={profitTo} onChange={e => setProfitTo(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Proyek</label>
                <select aria-label="Saring proyek pada laba rugi" value={profitProjectFilter} onChange={e => setProfitProjectFilter(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 160 }}>
                  <option value="">Semua Proyek</option>
                  {arusProjectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {(profitFrom || profitTo || profitProjectFilter) && (
                <button onClick={() => { setProfitFrom(""); setProfitTo(""); setProfitProjectFilter(""); }}
                  style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <X size={12} /> Reset
                </button>
              )}
            </div>

            {profitLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ padding: 20, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={16} /><div style={{ marginTop: 8 }} /><Skeleton h={12} w="70%" /></div>)}
              </div>
            ) : !profitData || profitData.projects.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
                <PieChart size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
                <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Tidak ada data profitabilitas</p>
                <p>Coba ubah filter atau tambah transaksi.</p>
              </div>
            ) : (
              <>
                {/* Summary totals */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Total Revenue", value: profitData.totals.revenue, color: C.green },
                    { label: "Total HPP", value: profitData.totals.total_cost, color: C.red },
                    { label: "Gross Profit", value: profitData.totals.gross_profit, color: profitData.totals.gross_profit >= 0 ? C.green : C.red },
                    { label: "Advance Beredar", value: profitData.totals.advance_outstanding, color: C.yellow },
                  ].map(s => (
                    <div key={s.label} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: "var(--font-display)" }}>{fmtCompact(s.value)}</div>
                    </div>
                  ))}
                </div>

                {/* Per-project table */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                        {["Proyek", "Revenue", "HPP Labor", "HPP Material", "HPP Ops", "Total HPP", "Gross Profit", "Margin", "Advance"].map((h, i) => (
                          <th key={i} style={{ padding: "10px 12px", textAlign: i === 0 ? "left" : "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {profitData.projects.map(p => {
                        const marginColor = p.gross_margin_pct >= 20 ? C.green : p.gross_margin_pct >= 0 ? C.yellow : C.red;
                        return (
                          <tr key={p.id} style={{ borderBottom: `1px solid #F3F4F6` }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#FAFBFF"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                            <td style={{ padding: "12px 12px" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                              <div style={{ fontSize: 10, color: C.muted, textTransform: "capitalize" }}>
                                {p.contract_model.replace("_", " ")} · Kontrak {fmtCompact(p.contract_value)}
                              </div>
                            </td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", color: C.green, fontWeight: 600 }}>{fmtCompact(p.revenue)}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", color: C.mid }}>{fmtCompact(p.labor_cost)}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", color: C.mid }}>{fmtCompact(p.material_cost)}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", color: C.mid }}>{fmtCompact(p.non_labor_cost)}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", color: C.red, fontWeight: 600 }}>{fmtCompact(p.total_cost)}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", color: p.gross_profit >= 0 ? C.green : C.red, fontWeight: 700 }}>{fmtCompact(p.gross_profit)}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right" }}>
                              <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: marginColor, background: `${marginColor}18` }}>
                                {p.gross_margin_pct}%
                              </span>
                            </td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", color: C.yellow }}>{fmtCompact(p.advance_outstanding)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${C.border}`, background: "var(--surface-subtle)" }}>
                        <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: C.text }}>TOTAL</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.green }}>{fmtCompact(profitData.totals.revenue)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: C.text }}>{fmtCompact(profitData.totals.labor_cost)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: C.text }}>{fmtCompact(profitData.totals.material_cost)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: C.text }}>{fmtCompact(profitData.totals.non_labor_cost)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.red }}>{fmtCompact(profitData.totals.total_cost)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: profitData.totals.gross_profit >= 0 ? C.green : C.red }}>{fmtCompact(profitData.totals.gross_profit)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          {profitData.totals.revenue > 0 && (
                            <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              color: (profitData.totals.gross_profit / profitData.totals.revenue * 100) >= 20 ? C.green : (profitData.totals.gross_profit / profitData.totals.revenue * 100) >= 0 ? C.yellow : C.red,
                              background: (profitData.totals.gross_profit / profitData.totals.revenue * 100) >= 20 ? C.greenBg : (profitData.totals.gross_profit / profitData.totals.revenue * 100) >= 0 ? C.yellowBg : C.redBg,
                            }}>
                              {Math.round(profitData.totals.gross_profit / profitData.totals.revenue * 1000) / 10}%
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: C.yellow }}>{fmtCompact(profitData.totals.advance_outstanding)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Margin bar chart */}
                <div style={{ marginTop: 24 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>Gross Margin per Proyek</h4>
                  {profitData.projects.map(p => {
                    const barWidth = Math.min(100, Math.max(0, Math.abs(p.gross_margin_pct)));
                    const col = p.gross_margin_pct >= 20 ? C.green : p.gross_margin_pct >= 0 ? C.yellow : C.red;
                    return (
                      <div key={p.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{p.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{p.gross_margin_pct}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${barWidth}%`, borderRadius: 99, background: col, transition: "width 0.5s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Buat Invoice ── */}
      {showCreateInvoice && (
        <CreateInvoiceModal
          onClose={() => setShowCreateInvoice(false)}
          onSuccess={() => {
            setShowCreateInvoice(false);
            loadSummary();
            if (tab === "invoice") loadInvoices();
            else setTab("invoice");
          }}
        />
      )}

      {/* ── Modal: Bayar Invoice ── */}
      {payingInvoice && (
        <PayInvoiceModal
          invoice={payingInvoice}
          onClose={() => setPayingInvoice(null)}
          onSuccess={() => {
            setPayingInvoice(null);
            loadInvoices();
            const { from, to } = computePeriodDates(overviewPeriod, overviewFrom, overviewTo);
            loadSummary(from, to);
            loadCashflowForOverview(from, to);
          }}
        />
      )}

      {/* ── Modal: Tambah Kasbon (admin/PM) ── */}
      {showAddKasbon && (
        <AddKasbonModal
          onClose={() => setShowAddKasbon(false)}
          onSuccess={() => {
            setShowAddKasbon(false);
            loadKasbons();
            const { from, to } = computePeriodDates(overviewPeriod, overviewFrom, overviewTo);
            loadSummary(from, to);
            loadCashflowForOverview(from, to);
          }}
        />
      )}
    </div>
  );
}

// ─── Types untuk expense billing ──────────────────────────────────────────────

interface BillableExpense {
  id: string;
  description: string;
  expense_date: string;
  qty: number;
  unit: string | null;
  unit_price: number;
  total_amount: number;
  billed_amount: number;
  remaining: number;
  vendor_name: string | null;
  notes: string | null;
  receipt_url: string | null;
  category: { id: string; name: string; type: string } | null;
}

interface LineItemDraft {
  key: string;                  // uuid untuk React key
  expense_id: string | null;    // null = item manual
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  amount: number;               // nilai yang ditagihkan
  notes: string;
  isManual: boolean;
}

// ─── Modal: Buat Invoice (Smart) ──────────────────────────────────────────────

type InvoiceMode = "termin_billing" | "expense_billing" | "commission_fee" | "commission_billing";

function CreateInvoiceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  // Mode pilihan per proyek (dipilih user jika komisi)
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("termin_billing");

  // Termin
  const [terminId, setTerminId] = useState("");

  // Expense billing — list pengeluaran yang bisa ditagih
  const [billableExpenses, setBillableExpenses] = useState<BillableExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);

  // Commission fee (mode: fee komisi saja)
  const [commissionFeeSuggest, setCommissionFeeSuggest] = useState<{
    commission_pct: number; total_expense: number; suggested_fee: number;
    already_billed_fee: number; remaining_fee: number;
  } | null>(null);
  const [commissionFeeAmount, setCommissionFeeAmount] = useState("");

  // Legacy komisi (commission_billing)
  const [totalPengeluaran, setTotalPengeluaran] = useState("");
  const [commissionPct, setCommissionPct] = useState("");

  // Shared
  const [baseAmount, setBaseAmount] = useState("");
  const [description, setDescription] = useState("");
  const [useRetensi, setUseRetensi] = useState(false);
  const [retensiPct, setRetensiPct] = useState("");
  // Potongan uang muka (DP recoupment) — saldo dari GET /finance/dp-register
  const [useDpDeduction, setUseDpDeduction] = useState(false);
  const [dpDeductionAmount, setDpDeductionAmount] = useState("");
  const [dpAvailable, setDpAvailable] = useState<number | null>(null);
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects").then(r => setProjects(r.data.projects)).catch(() => {});
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Reset saat ganti proyek
  useEffect(() => {
    if (!projectId) {
      setProjectDetail(null); setTerminId(""); setBaseAmount(""); setDescription("");
      setCommissionPct(""); setRetensiPct(""); setUseRetensi(false);
      setUseDpDeduction(false); setDpDeductionAmount(""); setDpAvailable(null);
      setLineItems([]); setBillableExpenses([]); setCommissionFeeSuggest(null); setCommissionFeeAmount("");
      return;
    }
    setLoadingProject(true);
    api.get<{ project: ProjectDetail }>(`/api/v1/projects/${projectId}`)
      .then(r => {
        const pd = r.data.project;
        setProjectDetail(pd);
        setTerminId(""); setBaseAmount(""); setDescription(""); setLineItems([]);
        setCommissionFeeSuggest(null); setCommissionFeeAmount("");
        if (pd.commission_pct) setCommissionPct(String(pd.commission_pct));
        if (pd.retention_pct) setRetensiPct(String(pd.retention_pct));
        // Default mode
        setInvoiceMode(pd.contract_model === "termin" ? "termin_billing" : "expense_billing");
      })
      .catch(() => {})
      .finally(() => setLoadingProject(false));
  }, [projectId]);

  // Saldo DP yang masih bisa dipotong (recoupment) untuk proyek terpilih
  useEffect(() => {
    if (!projectId) return;
    setUseDpDeduction(false); setDpDeductionAmount("");
    api.get<{ rows: { project: { id: string }; remaining_to_recoup: number }[] }>("/api/v1/finance/dp-register")
      .then(r => {
        const row = r.data.rows.find(x => x.project.id === projectId);
        setDpAvailable(row ? row.remaining_to_recoup : 0);
      })
      .catch(() => setDpAvailable(null));
  }, [projectId]);

  // Load billable expenses saat mode expense_billing dipilih
  useEffect(() => {
    if (invoiceMode !== "expense_billing" || !projectId) return;
    setLoadingExpenses(true);
    api.get<{ expenses: BillableExpense[] }>(`/api/v1/finance/billable-expenses?project_id=${projectId}`)
      .then(r => setBillableExpenses(r.data.expenses))
      .catch(() => setBillableExpenses([]))
      .finally(() => setLoadingExpenses(false));
  }, [invoiceMode, projectId]);

  // Load commission fee suggest saat mode commission_fee dipilih
  useEffect(() => {
    if (invoiceMode !== "commission_fee" || !projectId) return;
    api.get<typeof commissionFeeSuggest>(`/api/v1/finance/commission-fee-suggest?project_id=${projectId}`)
      .then(r => {
        setCommissionFeeSuggest(r.data);
        if (r.data && r.data.remaining_fee > 0) setCommissionFeeAmount(String(Math.round(r.data.remaining_fee)));
      })
      .catch(() => {});
  }, [invoiceMode, projectId]);

  // Termin auto-fill
  useEffect(() => {
    if (!terminId || !projectDetail) return;
    const t = projectDetail.termin_schedules.find(ts => ts.id === terminId);
    if (t) { setBaseAmount(String(t.amount)); setDescription(`Tagihan ${t.label}`); }
  }, [terminId, projectDetail]);

  // Legacy komisi auto-calc base
  useEffect(() => {
    if (invoiceMode !== "commission_billing") return;
    const pen = parseFloat(totalPengeluaran) || 0;
    const pct = parseFloat(commissionPct) || 0;
    if (pen > 0) setBaseAmount(String(Math.round(pen + pen * pct / 100)));
  }, [totalPengeluaran, commissionPct, invoiceMode]);

  // ── Helpers expense billing ──────────────────────────────────────────────────

  function addExpenseAsLineItem(exp: BillableExpense) {
    if (lineItems.find(li => li.expense_id === exp.id)) return; // sudah ada
    setLineItems(prev => [...prev, {
      key: crypto.randomUUID(),
      expense_id: exp.id,
      description: exp.description,
      qty: Number(exp.qty),
      unit: exp.unit ?? "",
      unit_price: Number(exp.unit_price),
      amount: exp.remaining,
      notes: "",
      isManual: false,
    }]);
  }

  function addManualLineItem() {
    setLineItems(prev => [...prev, {
      key: crypto.randomUUID(),
      expense_id: null,
      description: "",
      qty: 1,
      unit: "",
      unit_price: 0,
      amount: 0,
      notes: "",
      isManual: true,
    }]);
  }

  function removeLineItem(key: string) {
    setLineItems(prev => prev.filter(li => li.key !== key));
  }

  function updateLineItem(key: string, patch: Partial<LineItemDraft>) {
    setLineItems(prev => prev.map(li => {
      if (li.key !== key) return li;
      const updated = { ...li, ...patch };
      // Auto-calc amount dari qty × unit_price jika manual
      if (li.isManual && (patch.qty !== undefined || patch.unit_price !== undefined)) {
        updated.amount = Math.round(updated.qty * updated.unit_price);
      }
      return updated;
    }));
  }

  // ── Kalkulasi ──────────────────────────────────────────────────────────────

  const taxScheme = projectDetail?.tax_scheme ?? "pph_final";
  const taxRate   = taxScheme === "ppn" ? 11 : 2;
  const taxLabel  = taxScheme === "ppn" ? "PPN 11%" : "PPh Final 2%";

  const lineItemsTotal = lineItems.reduce((s, li) => s + Number(li.amount), 0);

  let base = 0;
  if (invoiceMode === "expense_billing") base = lineItemsTotal;
  else if (invoiceMode === "commission_fee") base = parseFloat(commissionFeeAmount) || 0;
  else base = parseFloat(baseAmount) || 0;

  const retensiAmt    = useRetensi ? Math.round(base * (parseFloat(retensiPct) || 0) / 100) : 0;
  const netAfterRet   = base - retensiAmt;
  const taxAmount     = Math.round(netAfterRet * taxRate / 100);
  const pengeluaran   = parseFloat(totalPengeluaran) || 0;
  const komisiPct     = parseFloat(commissionPct) || 0;
  const komisiAmt     = invoiceMode === "commission_billing" ? Math.round(pengeluaran * komisiPct / 100) : 0;

  // Potongan DP: hanya invoice termin progres (bukan termin on_sign = invoice DP-nya sendiri)
  const selectedTermin = projectDetail?.termin_schedules.find(ts => ts.id === terminId);
  const dpEligible    = invoiceMode === "termin_billing" && !!terminId
    && selectedTermin?.trigger_type !== "on_sign" && (dpAvailable ?? 0) > 0;
  const dpAmt         = dpEligible && useDpDeduction ? (parseFloat(dpDeductionAmount) || 0) : 0;
  const totalInvoice  = base - retensiAmt - dpAmt + taxAmount;

  const isTermin     = invoiceMode === "termin_billing";
  const isExpBilling = invoiceMode === "expense_billing";
  const isCommFee    = invoiceMode === "commission_fee";
  const isCommBill   = invoiceMode === "commission_billing";

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!projectId) { setError("Pilih proyek terlebih dahulu"); return; }
    if (isTermin && !terminId) { setError("Pilih termin yang akan ditagih"); return; }
    if (isExpBilling && lineItems.length === 0) { setError("Tambahkan minimal 1 item tagihan"); return; }
    if (isExpBilling) {
      for (const li of lineItems) {
        if (!li.description.trim()) { setError("Semua item harus punya deskripsi"); return; }
        if (li.amount <= 0) { setError(`Nominal item "${li.description}" harus lebih dari 0`); return; }
        if (!li.isManual && li.expense_id) {
          const exp = billableExpenses.find(e => e.id === li.expense_id);
          if (exp && li.amount > exp.remaining + 0.01) {
            setError(`"${li.description}": melebihi sisa tagihan (maks ${fmt(exp.remaining)})`); return;
          }
        }
      }
    }
    if ((isCommFee || isCommBill) && base <= 0) { setError("Nominal harus lebih dari 0"); return; }
    if (!isExpBilling && !isCommFee && !isTermin && (!baseAmount || base <= 0)) { setError("Nominal dasar harus lebih dari 0"); return; }
    if (!dueDate) { setError("Jatuh tempo wajib diisi"); return; }
    if (useRetensi && (!retensiPct || parseFloat(retensiPct) <= 0)) { setError("Persentase retensi harus lebih dari 0"); return; }
    if (dpEligible && useDpDeduction) {
      if (dpAmt <= 0) { setError("Nominal potongan uang muka harus lebih dari 0"); return; }
      if (dpAvailable != null && dpAmt > dpAvailable) { setError(`Potongan uang muka melebihi saldo DP (maks ${fmt(dpAvailable)})`); return; }
      if (dpAmt > netAfterRet) { setError("Potongan uang muka melebihi nilai tagihan setelah retensi"); return; }
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        project_id: projectId,
        invoice_type: invoiceMode,
        due_date: dueDate,
        issued_date: issuedDate,
        notes: notes || undefined,
        description: description || undefined,
        tax_amount: taxAmount,
      };
      if (useRetensi) { payload.retensi_pct = parseFloat(retensiPct); payload.retensi_amount = retensiAmt; }
      if (dpAmt > 0) {
        payload.dp_deduction_amount = dpAmt;
        if (base > 0) payload.dp_deduction_pct = Math.round((dpAmt / base) * 10000) / 100;
      }

      if (isTermin) {
        payload.termin_schedule_id = terminId;
        payload.base_amount = base;
      } else if (isExpBilling) {
        payload.line_items = lineItems.map((li, idx) => ({
          expense_id: li.expense_id ?? null,
          description: li.description,
          qty: li.qty,
          unit: li.unit || undefined,
          unit_price: li.unit_price,
          amount: li.amount,
          sort_order: idx,
          notes: li.notes || undefined,
        }));
      } else if (isCommFee) {
        payload.commission_fee_amount = base;
        payload.description = description || "Fee Komisi Proyek";
      } else {
        // commission_billing (legacy)
        payload.base_amount = base;
        payload.commission_pct = komisiPct;
        payload.commission_amount = komisiAmt;
        payload.total_pengeluaran = pengeluaran;
      }

      await api.post("/api/v1/finance/invoices", payload);
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal membuat invoice");
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none", boxSizing: "border-box" };
  const inputRpStyle: React.CSSProperties = { ...inputStyle, paddingLeft: 32 };

  const MODE_OPTIONS: { value: InvoiceMode; label: string; desc: string; color: string; bg: string }[] = projectDetail?.contract_model === "termin"
    ? [{ value: "termin_billing", label: "Tagihan Termin", desc: "Tagih sesuai jadwal termin", color: C.navy, bg: C.navyLight }]
    : [
        { value: "expense_billing", label: "Tagihan Pengeluaran", desc: "Pilih item pengeluaran spesifik", color: "#065F46", bg: "#ECFDF5" },
        { value: "commission_fee",  label: "Fee Komisi",         desc: "Invoice fee komisi saja", color: "#5B21B6", bg: "#EDE9FE" },
        { value: "commission_billing", label: "Komisi Langsung", desc: "Tagih total pengeluaran + komisi sekaligus", color: "#92400E", bg: "var(--warning-bg)" },
      ];

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 600, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", maxHeight: "94vh" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #003366, #0066CC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Receipt size={17} color="var(--surface)" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Buat Invoice Baru</h3>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>

          {/* ── Proyek ── */}
          <div>
            <label style={labelStyle}>Proyek <span style={{ color: C.red }}>*</span></label>
            <select aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} required style={inputStyle}>
              <option value="">-- Pilih proyek --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {loadingProject && <div style={{ fontSize: 12, color: C.muted }}>Memuat data proyek...</div>}

          {projectDetail && (<>

            {/* ── Mode/Tipe Invoice ── */}
            <div>
              <label style={labelStyle}>Tipe Invoice <span style={{ color: C.red }}>*</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {MODE_OPTIONS.map(m => (
                  <button key={m.value} type="button" onClick={() => setInvoiceMode(m.value)}
                    style={{ padding: "7px 14px", borderRadius: 8, border: `2px solid ${invoiceMode === m.value ? m.color : C.border}`,
                      background: invoiceMode === m.value ? m.bg : "var(--surface)", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: invoiceMode === m.value ? m.color : C.text }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>Pajak: {taxLabel}</div>
            </div>

            {/* ── TERMIN: pilih termin ── */}
            {isTermin && (
              <div>
                <label style={labelStyle}>Pilih Termin yang Ditagih <span style={{ color: C.red }}>*</span></label>
                <select aria-label="Pilih termin yang ditagih" value={terminId} onChange={e => setTerminId(e.target.value)} required style={inputStyle}>
                  <option value="">-- Pilih termin --</option>
                  {projectDetail.termin_schedules.map(t => (
                    <option key={t.id} value={t.id} disabled={t.status === "billed" || t.status === "paid"}>
                      {t.label} — {fmt(t.amount)} {t.status === "billed" ? "✓ Sudah ditagih" : t.status === "paid" ? "✓ Lunas" : ""}
                    </option>
                  ))}
                </select>
                {projectDetail.termin_schedules.length === 0 && (
                  <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Proyek ini belum memiliki jadwal termin</div>
                )}
              </div>
            )}

            {/* ── EXPENSE BILLING: pilih + tambah item ── */}
            {isExpBilling && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Pilih dari pengeluaran */}
                <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--success-bg)", border: "1px solid #BBF7D0" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#065F46", marginBottom: 8 }}>
                    Pengeluaran Tersedia ({billableExpenses.length})
                  </div>
                  {loadingExpenses && <div style={{ fontSize: 12, color: C.muted }}>Memuat...</div>}
                  {!loadingExpenses && billableExpenses.length === 0 && (
                    <div style={{ fontSize: 12, color: C.muted }}>Tidak ada pengeluaran approved yang belum sepenuhnya ditagih</div>
                  )}
                  {!loadingExpenses && billableExpenses.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                      {billableExpenses.map(exp => {
                        const alreadyAdded = lineItems.some(li => li.expense_id === exp.id);
                        return (
                          <div key={exp.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 6, background: "var(--surface)", border: `1px solid ${alreadyAdded ? "var(--success-border)" : C.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {exp.description}
                              </div>
                              <div style={{ fontSize: 10, color: C.muted }}>
                                {exp.expense_date} · {exp.category?.name ?? "—"} {exp.vendor_name ? `· ${exp.vendor_name}` : ""}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{fmt(exp.remaining)}</div>
                              {exp.billed_amount > 0 && <div style={{ fontSize: 9, color: C.muted }}>sisa dari {fmt(exp.total_amount)}</div>}
                            </div>
                            <button type="button" disabled={alreadyAdded} onClick={() => addExpenseAsLineItem(exp)}
                              style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: alreadyAdded ? C.border : C.navy, color: "var(--surface)", fontSize: 11, cursor: alreadyAdded ? "default" : "pointer", flexShrink: 0 }}>
                              {alreadyAdded ? "✓" : "+ Tambah"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Line items yang sudah dipilih */}
                {lineItems.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Item yang Ditagihkan ({lineItems.length})</div>
                    {lineItems.map(li => (
                      <div key={li.key} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: li.isManual ? "var(--warning-bg)" : "var(--bg)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            {li.isManual ? (
                              <input value={li.description} onChange={e => updateLineItem(li.key, { description: e.target.value })}
                                placeholder="Deskripsi item (wajib)" style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }} />
                            ) : (
                              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{li.description}</div>
                            )}
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {li.isManual && (<>
                                <input type="number" min={0.001} step={0.001} value={li.qty || ""} onChange={e => updateLineItem(li.key, { qty: parseFloat(e.target.value) || 1 })}
                                  placeholder="Qty" style={{ ...inputStyle, padding: "5px 8px", fontSize: 11, width: 64, flexShrink: 0 }} />
                                <input value={li.unit} onChange={e => updateLineItem(li.key, { unit: e.target.value })}
                                  placeholder="Satuan" style={{ ...inputStyle, padding: "5px 8px", fontSize: 11, width: 72, flexShrink: 0 }} />
                                <div style={{ position: "relative", flexShrink: 0, width: 120 }}>
                                  <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.muted }}>Rp</span>
                                  <input type="number" min={0} value={li.unit_price || ""} onChange={e => updateLineItem(li.key, { unit_price: parseFloat(e.target.value) || 0 })}
                                    placeholder="Harga satuan" style={{ ...inputStyle, padding: "5px 8px 5px 24px", fontSize: 11 }} />
                                </div>
                              </>)}
                              <div style={{ marginLeft: "auto", textAlign: "right", flexShrink: 0 }}>
                                <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Tagihkan:</div>
                                <div style={{ position: "relative", width: 130 }}>
                                  <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.muted }}>Rp</span>
                                  <input type="number" min={0.01}
                                    max={!li.isManual && li.expense_id ? (billableExpenses.find(e => e.id === li.expense_id)?.remaining ?? undefined) : undefined}
                                    value={li.amount || ""}
                                    onChange={e => updateLineItem(li.key, { amount: parseFloat(e.target.value) || 0 })}
                                    style={{ ...inputStyle, padding: "5px 8px 5px 24px", fontSize: 12, fontWeight: 700 }} />
                                </div>
                                {!li.isManual && li.expense_id && (() => {
                                  const exp = billableExpenses.find(e => e.id === li.expense_id);
                                  return exp ? <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>maks {fmt(exp.remaining)}</div> : null;
                                })()}
                              </div>
                            </div>
                          </div>
                          <button type="button" aria-label="Hapus baris item invoice" onClick={() => removeLineItem(li.key)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 2, flexShrink: 0 }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tombol tambah item manual */}
                <button type="button" onClick={addManualLineItem}
                  style={{ padding: "8px", borderRadius: 8, border: `1px dashed ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                  + Tambah Item Manual (upah / item tidak tercatat)
                </button>
              </div>
            )}

            {/* ── COMMISSION FEE: nominal fee saja ── */}
            {isCommFee && (
              <div style={{ padding: "12px 14px", borderRadius: 8, background: "#EDE9FE", border: "1px solid #C4B5FD", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#5B21B6" }}>Fee Komisi</div>
                {commissionFeeSuggest && (
                  <div style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 12px", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}>
                      <span>Total pengeluaran proyek</span><span>{fmt(commissionFeeSuggest.total_expense)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}>
                      <span>Fee komisi proyek ({commissionFeeSuggest.commission_pct}%)</span><span>{fmt(commissionFeeSuggest.suggested_fee)}</span>
                    </div>
                    {commissionFeeSuggest.already_billed_fee > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}>
                        <span>Sudah ditagih sebelumnya</span><span>- {fmt(commissionFeeSuggest.already_billed_fee)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#5B21B6", borderTop: `1px solid ${C.border}`, paddingTop: 4, marginTop: 2 }}>
                      <span>Sisa fee yang disarankan</span><span>{fmt(commissionFeeSuggest.remaining_fee)}</span>
                    </div>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Nominal Fee Komisi <span style={{ color: C.red }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
                    <input type="number" min={1} value={commissionFeeAmount} onChange={e => setCommissionFeeAmount(e.target.value)}
                      style={inputRpStyle} placeholder="0" />
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Bisa diubah dari saran di atas</div>
                </div>
              </div>
            )}

            {/* ── KOMISI LANGSUNG (legacy): input total pengeluaran + % ── */}
            {isCommBill && (
              <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--warning-bg)", border: "1px solid #FDE68A", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>Komisi Langsung</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Total Pengeluaran <span style={{ color: C.red }}>*</span></label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
                      <input type="number" min={1} value={totalPengeluaran} onChange={e => setTotalPengeluaran(e.target.value)} required style={inputRpStyle} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Komisi %
                      {projectDetail.commission_pct && <span style={{ fontWeight: 400, color: C.muted }}> (proyek: {projectDetail.commission_pct}%)</span>}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min={0} max={100} step={0.5} value={commissionPct} onChange={e => setCommissionPct(e.target.value)} style={{ ...inputStyle, paddingRight: 28 }} placeholder="0" />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>%</span>
                    </div>
                  </div>
                </div>
                {pengeluaran > 0 && (
                  <div style={{ background: "var(--surface)", borderRadius: 6, padding: "8px 12px", fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}><span>Pengeluaran</span><span>{fmt(pengeluaran)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}><span>Fee ({commissionPct || 0}%)</span><span>+ {fmt(komisiAmt)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: C.text, borderTop: `1px solid ${C.border}`, paddingTop: 4, marginTop: 2 }}><span>Subtotal</span><span>{fmt(pengeluaran + komisiAmt)}</span></div>
                  </div>
                )}
              </div>
            )}

            {/* ── Nominal Dasar (hanya untuk termin / commission_billing) ── */}
            {(isTermin || isCommBill) && (
              <div>
                <label style={labelStyle}>Nominal Dasar <span style={{ color: C.red }}>*</span>
                  {isCommBill && <span style={{ fontWeight: 400, color: C.muted }}> (auto-dihitung)</span>}
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
                  <input type="number" min={1} value={baseAmount} onChange={e => setBaseAmount(e.target.value)}
                    readOnly={isCommBill} required style={{ ...inputRpStyle, background: isCommBill ? "var(--surface-subtle)" : "var(--surface)" }} placeholder="0" />
                </div>
              </div>
            )}

            {/* ── Deskripsi ── */}
            <div>
              <label style={labelStyle}>Deskripsi Invoice</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="Tampil di PDF invoice" />
            </div>

            {/* ── Retensi toggle ── */}
            <div style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: useRetensi ? "var(--warning-bg)" : "var(--surface-subtle)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={useRetensi} onChange={e => setUseRetensi(e.target.checked)} style={{ width: 14, height: 14 }} />
                <span style={{ fontWeight: 600, color: C.text }}>Terapkan Potongan Retensi</span>
              </label>
              {useRetensi && (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Persentase Retensi
                      {projectDetail.retention_pct > 0 && <span style={{ fontWeight: 400 }}> (proyek: {projectDetail.retention_pct}%)</span>}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min={0} max={100} step={0.5} value={retensiPct} onChange={e => setRetensiPct(e.target.value)} style={{ ...inputStyle, paddingRight: 28 }} placeholder="5" />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>%</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Potongan Retensi</label>
                    <div style={{ padding: "9px 12px", background: "var(--surface-subtle)", borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.red, border: `1px solid ${C.border}` }}>
                      -{fmt(retensiAmt)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Potongan Uang Muka (DP recoupment) — hanya termin progres ── */}
            {dpEligible && (
              <div style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: useDpDeduction ? C.blueBg : "var(--surface-subtle)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={useDpDeduction} onChange={e => {
                    setUseDpDeduction(e.target.checked);
                    if (e.target.checked && !dpDeductionAmount && dpAvailable != null) {
                      setDpDeductionAmount(String(Math.min(dpAvailable, Math.max(netAfterRet, 0))));
                    }
                  }} style={{ width: 14, height: 14 }} />
                  <span style={{ fontWeight: 600, color: C.text }}>Potong Uang Muka (DP)</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid }}>Saldo DP: <b style={{ color: C.navy }}>{fmt(dpAvailable ?? 0)}</b></span>
                </label>
                {useDpDeduction && (
                  <div style={{ marginTop: 10 }}>
                    <label style={labelStyle}>Nominal Potongan DP</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                      <input type="number" min={0} max={dpAvailable ?? undefined} value={dpDeductionAmount}
                        onChange={e => setDpDeductionAmount(e.target.value)} style={inputRpStyle} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
                      DP yang sudah dibayar klien dipotong dari tagihan ini. Sisa DP setelah invoice ini: {fmt(Math.max((dpAvailable ?? 0) - dpAmt, 0))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tanggal ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Tanggal Terbit</label>
                <input aria-label="Tanggal" type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Jatuh Tempo <span style={{ color: C.red }}>*</span></label>
                <input aria-label="Tanggal" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required style={inputStyle} />
              </div>
            </div>

            {/* ── Catatan ── */}
            <div>
              <label style={labelStyle}>Catatan</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </div>

            {/* ── Summary footer real-time ── */}
            {base > 0 && (
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ background: "var(--bg)", padding: "8px 14px", fontSize: 11, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ringkasan Invoice</div>
                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {isExpBilling && lineItems.map(li => (
                    <SummaryRow key={li.key} label={li.description || "Item"} value={fmt(li.amount)} />
                  ))}
                  {isExpBilling && lineItems.length > 1 && (
                    <SummaryRow label="Subtotal item" value={fmt(lineItemsTotal)} />
                  )}
                  {!isExpBilling && <SummaryRow label={isCommFee ? "Fee Komisi" : "Nominal Dasar"} value={fmt(base)} />}
                  {useRetensi && retensiAmt > 0 && <SummaryRow label={`Potongan Retensi (${retensiPct}%)`} value={`-${fmt(retensiAmt)}`} valueColor={C.red} />}
                  {dpAmt > 0 && <SummaryRow label="Potongan Uang Muka (DP)" value={`-${fmt(dpAmt)}`} valueColor={C.blue} />}
                  <SummaryRow label={taxLabel} value={`-${fmt(taxAmount)}`} valueColor={C.muted} />
                  <div style={{ borderTop: `2px solid ${C.border}`, marginTop: 4, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>TOTAL INVOICE</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: C.navy, fontFamily: "var(--font-display)" }}>{fmt(totalInvoice)}</span>
                  </div>
                </div>
              </div>
            )}
          </>)}

          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading || !projectDetail}
              style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: (loading || !projectDetail) ? "#94A3B8" : C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: (loading || !projectDetail) ? "not-allowed" : "pointer" }}>
              {loading ? "Menyimpan..." : "Buat Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: C.mid }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? C.text }}>{value}</span>
    </div>
  );
}

// ─── Modal: Bayar Invoice ──────────────────────────────────────────────────────

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  main: "Kas Utama", collector: "Kolektor", petty_cash: "Kas Kecil",
};

function PayInvoiceModal({ invoice, onClose, onSuccess }: { invoice: Invoice; onClose: () => void; onSuccess: () => void }) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);

  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [amountPaid, setAmountPaid] = useState(String(Math.round(Number(invoice.amount_due))));
  const [paymentMethod, setPaymentMethod] = useState("transfer_bank");
  const [cashAccountId, setCashAccountId] = useState("");
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [refNumber, setRefNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts")
      .then(r => {
        setCashAccounts(r.data.accounts);
        const main = r.data.accounts.find(a => a.type === "main");
        if (main) setCashAccountId(main.id);
      }).catch(() => {});
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amountPaid);
    if (!paidAt || isNaN(amt) || amt <= 0) { setError("Tanggal dan nominal wajib diisi"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("invoice_id", invoice.id);
      fd.append("paid_at", paidAt);
      fd.append("amount_paid", String(amt));
      fd.append("payment_method", paymentMethod);
      if (cashAccountId) fd.append("cash_account_id", cashAccountId);
      if (refNumber.trim()) fd.append("ref_number", refNumber.trim());
      if (bankName.trim()) fd.append("bank_name", bankName.trim());
      if (notes.trim()) fd.append("notes", notes.trim());
      if (proofFile) fd.append("proof", proofFile);

      await api.post(`/api/v1/finance/invoice/${invoice.id}/pay`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal menyimpan pembayaran");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #15803d, #22C55E)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={17} color="var(--surface)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Catat Pembayaran</h3>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{invoice.invoice_number} · {invoice.projects?.name}</p>
            </div>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {/* Invoice info */}
          <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 600, marginBottom: 2 }}>Sisa Tagihan</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.green, fontFamily: "var(--font-display)" }}>{fmt(Number(invoice.amount_due))}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 600, marginBottom: 2 }}>Total Invoice</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.mid }}>{fmt(Number(invoice.total_amount))}</div>
            </div>
          </div>

          {success ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle2 size={48} color={C.green} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Pembayaran berhasil dicatat!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Tanggal Bayar <span style={{ color: C.red }}>*</span></label>
                  <input aria-label="Tanggal" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} required
                    style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                    <input type="number" min={1} value={amountPaid} onChange={e => setAmountPaid(e.target.value)} required
                      style={{ width: "100%", padding: "9px 12px 9px 30px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Kas Tujuan */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Wallet size={12} /> Masuk ke Kas
                  </span>
                </label>
                {cashAccounts.length === 0 ? (
                  <div style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.muted }}>Memuat...</div>
                ) : (
                  <select aria-label="Akun kas penerima pembayaran" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                    <option value="">— Tidak masuk ke kas —</option>
                    {cashAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({ACCOUNT_TYPE_LABEL[a.type] ?? a.type}) · Saldo {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(a.balance)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Metode Pembayaran</label>
                <select aria-label="Metode pembayaran" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                  <option value="transfer_bank">Transfer Bank</option>
                  <option value="cash">Tunai</option>
                  <option value="qris">QRIS</option>
                  <option value="cek">Cek</option>
                  <option value="giro">Giro</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>No. Referensi</label>
                  <input type="text" value={refNumber} onChange={e => setRefNumber(e.target.value)} placeholder="No. TF"
                    style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Bank</label>
                  <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="BCA, Mandiri..."
                    style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Bukti upload */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
                  Bukti Transfer <span style={{ color: C.muted, fontWeight: 400 }}>(opsional)</span>
                </label>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: "none" }} onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 5 * 1024 * 1024) { alert("Ukuran file maksimal 5 MB"); e.target.value = ""; return; }
                  setProofFile(f);
                }} />
                {proofFile ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: C.greenBg, border: `1px solid ${C.greenBorder}` }}>
                    <FileText size={16} color={C.green} />
                    <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proofFile.name}</span>
                    <button type="button" aria-label="Buang bukti transfer yang dipilih" onClick={() => setProofFile(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.red }}><X size={14} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    style={{ width: "100%", padding: "10px", border: `2px dashed ${C.border}`, borderRadius: 8, background: "#FAFAFA", color: C.mid, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <ArrowDownLeft size={14} /> Upload bukti transfer
                  </button>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>

              {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
                <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: loading ? "#94A3B8" : C.green, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
                  {loading ? "Menyimpan..." : "Catat Pembayaran"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah Kasbon (admin/PM buat langsung, auto-approve) ───────────────

function AddKasbonModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);

  const [scopes, setScopes] = useState<MandorScope[]>([]);
  const [scopeId, setScopeId] = useState("");
  const [amount, setAmount] = useState("");
  const [fundSource, setFundSource] = useState("owner_advance");
  const [purpose, setPurpose] = useState("operasional");
  const [kasbonDate, setKasbonDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    // Load work scopes dengan mandor assignment info
    Promise.all([
      api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts"),
      api.get<{ scopes: MandorScope[] }>("/api/v1/mandor/scopes"),
    ]).then(([accRes, scopeRes]) => {
      setCashAccounts(accRes.data.accounts);
      const main = accRes.data.accounts.find(a => a.type === "main");
      if (main) setCashAccountId(main.id);
      setScopes(scopeRes.data.scopes ?? []);
    }).catch(() => {
      // Fallback: coba ambil scopes dari assignments
      api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts").then(r => {
        setCashAccounts(r.data.accounts);
        const main = r.data.accounts.find(a => a.type === "main");
        if (main) setCashAccountId(main.id);
      }).catch(() => {});
    });
    return () => { document.body.style.overflow = ""; };
  }, []);

  const selectedScope = scopes.find(s => s.id === scopeId);
  const selectedAccount = cashAccounts.find(a => a.id === cashAccountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!scopeId || !amount) { setError("Work scope dan nominal wajib diisi"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError("Nominal harus lebih dari 0"); return; }
    if (autoApprove && !cashAccountId) { setError("Pilih akun kas untuk kasbon yang langsung disetujui"); return; }

    setLoading(true);
    try {
      await api.post("/api/v1/kasbons", {
        work_scope_id: scopeId,
        amount: amt,
        fund_source: fundSource,
        purpose,
        kasbon_date: kasbonDate,
        notes: notes.trim() || undefined,
        cash_account_id: autoApprove ? cashAccountId : undefined,
        auto_approve: autoApprove,
      });
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal menyimpan kasbon");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #B45309, #FBBF24)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={17} color="var(--surface)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Tambah Kasbon Mandor</h3>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Dibuat langsung oleh admin/PM</p>
            </div>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>

          {/* Work scope (mandor + proyek) */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Work Scope Mandor <span style={{ color: C.red }}>*</span></label>
            <select aria-label="Work scope mandor yang mengajukan kasbon" value={scopeId} onChange={e => setScopeId(e.target.value)} required
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
              <option value="">-- Pilih mandor & scope --</option>
              {scopes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.assignment?.mandor?.name ?? "?"} — {s.scope_name} ({s.assignment?.project?.name ?? "?"})
                </option>
              ))}
            </select>
            {selectedScope && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
                Mandor: <strong style={{ color: C.text }}>{selectedScope.assignment?.mandor?.name}</strong>
                {" · "}Proyek: <strong style={{ color: C.text }}>{selectedScope.assignment?.project?.name}</strong>
              </div>
            )}
          </div>

          {/* Nominal + Tanggal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} required
                  style={{ width: "100%", padding: "9px 12px 9px 30px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Tanggal</label>
              <input aria-label="Tanggal" type="date" value={kasbonDate} onChange={e => setKasbonDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Keperluan + Sumber Dana */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Keperluan <span style={{ color: C.red }}>*</span></label>
              <select aria-label="Keperluan kasbon" value={purpose} onChange={e => setPurpose(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="gaji_tukang">Gaji Tukang</option>
                <option value="uang_makan">Uang Makan</option>
                <option value="pembelian_alat">Pembelian Alat</option>
                <option value="operasional">Operasional</option>
                <option value="lain_lain">Lain-lain</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Sumber Dana</label>
              <select aria-label="Sumber dana kasbon" value={fundSource} onChange={e => setFundSource(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="owner_advance">Dana Owner</option>
                <option value="client_fund">Dana Klien</option>
              </select>
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Keterangan / Alasan</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Contoh: untuk beli material rangka atap minggu ini..."
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
              onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
          </div>

          {/* Mode: langsung setujui vs pending */}
          <div style={{ padding: "12px 14px", borderRadius: 10, background: autoApprove ? C.greenBg : C.yellowBg, border: `1px solid ${autoApprove ? C.greenBorder : C.yellowBorder}` }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Setujui langsung</div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
                  {autoApprove
                    ? "Kasbon langsung disetujui dan saldo kas berkurang"
                    : "Kasbon masuk sebagai pending, mandor atau admin bisa approve nanti"}
                </div>
              </div>
            </label>

            {/* Pilih kas sumber jika auto-approve */}
            {autoApprove && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Potong dari akun kas:</label>
                <select aria-label="Akun kas yang dipotong untuk kasbon ini" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                  <option value="">-- Pilih akun kas --</option>
                  {cashAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} · Saldo {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(a.balance))}
                    </option>
                  ))}
                </select>
                {selectedAccount && amount && (
                  <div style={{ marginTop: 6, fontSize: 11, color: Number(selectedAccount.balance) >= parseFloat(amount || "0") ? C.green : C.red }}>
                    Saldo setelah: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(selectedAccount.balance) - (parseFloat(amount) || 0))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: loading ? "#94A3B8" : autoApprove ? C.green : C.yellow, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Menyimpan..." : autoApprove ? "Buat & Setujui Kasbon" : "Buat Kasbon (Pending)"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

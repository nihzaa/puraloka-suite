"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { api, hasPermission } from "@/lib/api";
import {
  Wallet, ArrowRightLeft, ShoppingCart, Plus, X, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, 
  Banknote, TrendingDown, FileText,
  Building2, User, Package, Wrench, Circle,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
  purple: "var(--aksen)", purpleBg: "var(--navy-light)", purpleBorder: "var(--info-border)",
};

const card: React.CSSProperties = {
  background: "var(--surface)", border: `1px solid ${C.border}`,
  borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface CashSummary {
  totalBalance: number; mainBalance: number;
  collectorBalance: number; pettyBalance: number;
  pendingTransferCount: number; pendingTransferAmount: number;
  pendingExpenseCount: number; pendingExpenseAmount: number;
  expensesThisMonth: number;
}

interface CashAccount {
  id: string; name: string; type: "main" | "collector" | "petty_cash";
  balance: number; currency: string; notes: string | null; is_active: boolean;
  created_at: string;
  owner: { id: string; name: string; role: string } | null;
  projects: { id: string; name: string } | null;
}

interface CashTransfer {
  id: string; amount: number; transfer_date: string; status: string;
  ref_number: string | null; notes: string | null; proof_url: string | null;
  confirmed_at: string | null; created_at: string;
  from_account: { id: string; name: string; type: string } | null;
  to_account: { id: string; name: string; type: string } | null;
  creator: { id: string; name: string } | null;
  confirmer: { id: string; name: string } | null;
}

interface Expense {
  id: string; description: string; qty: number; unit: string | null;
  unit_price: number; total_amount: number;
  expense_date: string; expense_source: string;
  vendor_name: string | null; receipt_url: string | null; notes: string | null;
  status: string; created_at: string;
  projects: { id: string; name: string; location: string } | null;
  category: { id: string; name: string; type: string } | null;
  petty_cash: { id: string; name: string; type: string } | null;
  main_cash: { id: string; name: string; type: string } | null;
  submitter: { id: string; name: string; role: string } | null;
  reviewer: { id: string; name: string } | null;
}

interface Category { id: string; name: string; type: string; parent_id: string | null }
interface Project { id: string; name: string; contract_model: string }

type TabKey = "akun" | "transfer" | "pengeluaran";

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

const ACCOUNT_TYPE_LABEL: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  main:       { label: "Kas Utama",   icon: <Wallet size={15} />,    color: C.navy,   bg: C.navyLight,  border: "var(--info-border)" },
  collector:  { label: "Kolektor",    icon: <Building2 size={15} />, color: C.purple, bg: C.purpleBg,   border: C.purpleBorder },
  petty_cash: { label: "Kas Kecil",   icon: <Banknote size={15} />,  color: C.green,  bg: C.greenBg,    border: C.greenBorder },
};

const TRANSFER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Menunggu",   color: C.yellow, bg: C.yellowBg },
  confirmed: { label: "Dikonfirmasi", color: C.green, bg: C.greenBg },
  cancelled: { label: "Batal",      color: C.muted,  bg: "var(--surface-hover)" },
};

const EXPENSE_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",      color: C.muted,  bg: "var(--surface-hover)",  border: "var(--border)" },
  submitted: { label: "Menunggu",   color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  approved:  { label: "Disetujui",  color: C.green,  bg: C.greenBg,  border: C.greenBorder },
  rejected:  { label: "Ditolak",    color: C.red,    bg: C.redBg,    border: C.redBorder },
};

const CATEGORY_TYPE_ICON: Record<string, React.ReactNode> = {
  material:    <Package size={13} color={C.navy} />,
  labor:       <User size={13} color={C.purple} />,
  equipment:   <Wrench size={13} color={C.yellow} />,
  operational: <TrendingDown size={13} color={C.green} />,
  other:       <Circle size={13} color={C.muted} />,
};

const SOURCE_LABEL: Record<string, string> = {
  petty_cash:  "Kas Kecil",
  main_cash:   "Kas Utama",
  personal:    "Talangan Pribadi",
  client_fund: "Dana Klien",
};

function StatusBadge({ label, color, bg, border }: { label: string; color: string; bg: string; border?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color, background: bg, border: `1px solid ${border ?? bg}`, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: 6, background: "linear-gradient(90deg,var(--surface-hover) 0%,var(--border) 50%,var(--surface-hover) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />;
}

function Tab({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "10px 18px", border: "none",
      borderBottom: `2px solid ${active ? C.navy : "transparent"}`,
      background: "transparent", fontSize: 13,
      fontWeight: active ? 600 : 400,
      color: active ? C.navy : C.mid, cursor: "pointer",
      transition: "all 0.15s", whiteSpace: "nowrap",
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.text; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.mid; }}
    >
      {label}
      {count !== undefined && (
        <span style={{ fontSize: 10, fontWeight: 700, background: active ? C.navyLight : "var(--surface-hover)", color: active ? C.navy : C.muted, padding: "1px 6px", borderRadius: 99 }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({ acc, onClick }: { acc: CashAccount; onClick: () => void }) {
  const meta = ACCOUNT_TYPE_LABEL[acc.type];
  const low = acc.type === "petty_cash" && acc.balance < 500_000;
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", background: "var(--surface)",
      border: `1px solid ${low ? C.yellowBorder : C.border}`,
      borderRadius: 12, padding: "16px 18px", cursor: "pointer",
      transition: "all 0.15s", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,51,102,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: meta.bg, border: `1px solid ${meta.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: meta.color }}>
        {meta.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, padding: "1px 6px", borderRadius: 4 }}>{meta.label}</span>
          {acc.owner && <span style={{ fontSize: 11, color: C.muted }}>{acc.owner.name}</span>}
          {acc.projects && <span style={{ fontSize: 11, color: C.muted }}>· {acc.projects.name}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: low ? C.yellow : acc.balance < 0 ? C.red : C.text, fontFamily: "var(--font-display)" }}>
          {fmtCompact(acc.balance)}
        </div>
        {low && <div style={{ fontSize: 10, color: C.yellow, fontWeight: 600 }}>Saldo rendah</div>}
      </div>
    </button>
  );
}

// ─── Transfer Row ─────────────────────────────────────────────────────────────
function TransferRow({ t, canConfirm, onConfirm, onCancel }: {
  t: CashTransfer; canConfirm: boolean;
  onConfirm: (id: string) => void; onCancel: (id: string) => void;
}) {
  const st = TRANSFER_STATUS[t.status] ?? TRANSFER_STATUS.pending;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${t.status === "pending" ? C.yellowBorder : C.border}`, background: t.status === "pending" ? C.yellowBg : "var(--surface-subtle)", display: "flex", alignItems: "center", gap: 14 }}>
      {/* Arrow icon */}
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <ArrowRightLeft size={16} color={C.mid} />
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.from_account?.name ?? "—"}</span>
          <ArrowRightLeft size={11} color={C.muted} />
          <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{t.to_account?.name ?? "—"}</span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
          <span>{fmtDate(t.transfer_date)}</span>
          {t.ref_number && <span>Ref: {t.ref_number}</span>}
          {t.creator && <span>oleh {t.creator.name}</span>}
          {t.confirmer && <span>· dikonfirmasi {t.confirmer.name}</span>}
        </div>
        {t.notes && <div style={{ fontSize: 11, color: C.mid, marginTop: 2, fontStyle: "italic" }}>{t.notes}</div>}
      </div>
      {/* Amount + status + actions */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)", marginBottom: 6 }}>
          {fmt(t.amount)}
        </div>
        <StatusBadge label={st.label} color={st.color} bg={st.bg} />
        {canConfirm && t.status === "pending" && (
          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => onCancel(t.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 11, cursor: "pointer" }}>Batal</button>
            <button onClick={() => onConfirm(t.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Konfirmasi</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Expense Row ──────────────────────────────────────────────────────────────
function ExpenseRow({ e, canReview, onApprove, onReject }: {
  e: Expense; canReview: boolean;
  onApprove: (id: string) => void; onReject: (id: string) => void;
}) {
  const st = EXPENSE_STATUS[e.status] ?? EXPENSE_STATUS.submitted;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${e.status === "submitted" ? C.yellowBorder : C.border}`, background: e.status === "submitted" ? C.yellowBg : "var(--surface-subtle)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {CATEGORY_TYPE_ICON[e.category?.type ?? "other"]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.description}</span>
            <StatusBadge label={st.label} color={st.color} bg={st.bg} border={EXPENSE_STATUS[e.status]?.border} />
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.muted, flexWrap: "wrap", marginBottom: 2 }}>
            <span>{e.projects?.name ?? "—"}</span>
            <span>·</span>
            <span>{e.category?.name ?? "—"}</span>
            {e.vendor_name && <><span>·</span><span>{e.vendor_name}</span></>}
            <span>·</span>
            <span>{fmtDate(e.expense_date)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
            <span style={{ background: "var(--surface-hover)", padding: "1px 7px", borderRadius: 4 }}>{SOURCE_LABEL[e.expense_source]}</span>
            {e.petty_cash && <span style={{ background: C.navyLight, color: C.navy, padding: "1px 7px", borderRadius: 4 }}>dari: {e.petty_cash.name}</span>}
            {e.main_cash && <span style={{ background: C.navyLight, color: C.navy, padding: "1px 7px", borderRadius: 4 }}>dari: {e.main_cash.name}</span>}
            {e.qty !== 1 && <span>{e.qty} {e.unit} × {fmt(e.unit_price)}</span>}
            {e.submitter && <span>· {e.submitter.name}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)", marginBottom: 4 }}>
            {fmt(e.total_amount)}
          </div>
          {e.receipt_url && (
            <a href={e.receipt_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 10, color: C.navy, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginBottom: 4 }}>
              <FileText size={10} /> Lihat nota
            </a>
          )}
          {canReview && e.status === "submitted" && (
            <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
              <button onClick={() => onReject(e.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Tolak</button>
              <button onClick={() => onApprove(e.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Setujui</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KasPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  if (!mounted) return null;
  return <KasContent />;
}

function KasContent() {
  // ADR-004: capability, bukan nama jabatan. Diverifikasi ke
  // `requirePermission` di cash.ts — bukan ditebak dari nama tombolnya.
  const isAdmin = hasPermission("cash:account:manage");
  // `canEdit` dulu satu boolean untuk transfer, konfirmasi, DAN approve
  // pengeluaran — tiga wewenang berbeda yang API pisahkan. Dipertahankan
  // sebagai "boleh menyentuh kas" (transfer), sementara konfirmasi dan
  // approve kini memakai capability-nya sendiri di tempat pemakaiannya.
  const canEdit = hasPermission("cash:transfer:create");

  const [tab, setTab] = useState<TabKey>("akun");
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Akun
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  // Transfer
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [transferStatusFilter, setTransferStatusFilter] = useState("all");
  const [showCreateTransfer, setShowCreateTransfer] = useState(false);

  // Expenses
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState("all");
  const [showCreateExpense, setShowCreateExpense] = useState(false);

  // Supplier payments (bayar hutang supplier dari kas)
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [loadingSupplierPayments, setLoadingSupplierPayments] = useState(false);

  // Mandor outflows — progress payments & borongan settlements
  const [progressPaymentsKas, setProgressPaymentsKas] = useState<any[]>([]);
  const [boronganSettlementsKas, setBoronganSettlementsKas] = useState<any[]>([]);
  const [loadingMandorOutflows, setLoadingMandorOutflows] = useState(false);

  // Category breakdown
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ id: string; name: string; type: string; total: number; count: number }[]>([]);
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);

  useEffect(() => { loadSummary(); }, []);
  useEffect(() => {
    if (tab === "akun" && accounts.length === 0) loadAccounts();
    if (tab === "transfer" && transfers.length === 0) loadTransfers();
    if (tab === "pengeluaran" && expenses.length === 0) { loadExpenses(); loadSupplierPayments(); loadMandorOutflows(); loadCategoryBreakdown(); }
  }, [tab]);
  useEffect(() => { if (tab === "transfer") loadTransfers(); }, [transferStatusFilter]);
  useEffect(() => { if (tab === "pengeluaran") loadExpenses(); }, [expenseStatusFilter]);

  async function loadSummary() {
    setLoadingSummary(true);
    try { const r = await api.get<CashSummary>("/api/v1/cash/summary"); setSummary(r.data); }
    finally { setLoadingSummary(false); }
  }

  async function loadAccounts() {
    setLoadingAccounts(true);
    try { const r = await api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts"); setAccounts(r.data.accounts); }
    finally { setLoadingAccounts(false); }
  }

  async function loadTransfers() {
    setLoadingTransfers(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      if (transferStatusFilter !== "all") params.status = transferStatusFilter;
      const r = await api.get<{ transfers: CashTransfer[] }>("/api/v1/cash/transfers", { params });
      setTransfers(r.data.transfers);
    } finally { setLoadingTransfers(false); }
  }

  async function loadExpenses() {
    setLoadingExpenses(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      if (expenseStatusFilter !== "all") params.status = expenseStatusFilter;
      const r = await api.get<{ expenses: Expense[] }>("/api/v1/cash/expenses", { params });
      setExpenses(r.data.expenses);
    } finally { setLoadingExpenses(false); }
  }

  async function loadSupplierPayments() {
    setLoadingSupplierPayments(true);
    try {
      const r = await api.get("/api/v1/procurement/supplier-payments", { params: { limit: "100" } });
      // Hanya tampilkan yang punya cash_account (artinya memotong saldo kas)
      setSupplierPayments((r.data.supplier_payments ?? []).filter((p: any) => p.cash_account));
    } catch { setSupplierPayments([]); }
    finally { setLoadingSupplierPayments(false); }
  }

  async function loadMandorOutflows() {
    setLoadingMandorOutflows(true);
    try {
      const [ppRes, bsRes] = await Promise.all([
        api.get("/api/v1/mandor/progress-payments", { params: { status: "approved" } }).catch(() => ({ data: { payments: [] } })),
        api.get("/api/v1/mandor/borongan-settlements").catch(() => ({ data: { settlements: [] } })),
      ]);
      setProgressPaymentsKas((ppRes.data.payments ?? []).filter((p: any) => p.cash_account_id));
      setBoronganSettlementsKas((bsRes.data.settlements ?? []).filter((s: any) => s.cash_account_id));
    } catch { /* non-fatal */ }
    finally { setLoadingMandorOutflows(false); }
  }

  async function loadCategoryBreakdown() {
    try {
      const r = await api.get<{ summary: { id: string; name: string; type: string; total: number; count: number }[] }>("/api/v1/cash/expenses/summary-by-category");
      setCategoryBreakdown(r.data.summary);
    } catch { /* non-fatal */ }
  }

  async function handleConfirmTransfer(id: string) {
    try {
      await api.patch(`/api/v1/cash/transfers/${id}/confirm`);
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: "confirmed" } : t));
      loadSummary(); loadAccounts();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal konfirmasi");
    }
  }

  async function handleCancelTransfer(id: string) {
    try {
      await api.patch(`/api/v1/cash/transfers/${id}/cancel`);
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: "cancelled" } : t));
    } catch (err: unknown) {
      // Kegagalan ini SEBELUMNYA ditelan `catch {}` — dan tampilan lokal di
      // atas tetap berubah jadi "dibatalkan". Jadi layar menunjukkan transfer
      // yang batal sementara server masih menganggapnya berjalan, dan selisih
      // itu baru terlihat saat halaman dimuat ulang. Pola `alert` mengikuti
      // `handleApproveExpense` di berkas yang sama.
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal membatalkan transfer");
    }
  }

  async function handleApproveExpense(id: string) {
    try {
      await api.patch(`/api/v1/cash/expenses/${id}/status`, { status: "approved" });
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: "approved" } : e));
      loadSummary(); loadAccounts();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal approve");
    }
  }

  async function handleRejectExpense(id: string) {
    try {
      await api.patch(`/api/v1/cash/expenses/${id}/status`, { status: "rejected" });
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: "rejected" } : e));
      loadSummary();
    } catch (err: unknown) {
      // Kembarannya (`handleApproveExpense`) sudah memberi tahu sejak awal;
      // yang menolak justru diam. Inkonsistensi itu berarti PENOLAKAN yang
      // gagal terlihat berhasil — pengeluaran tetap menunggu persetujuan
      // tanpa ada yang tahu.
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menolak pengeluaran");
    }
  }

  const pendingExpenses = expenses.filter(e => e.status === "submitted").length;
  const pendingTransfers = transfers.filter(t => t.status === "pending").length;

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>

      {/* Header */}
      <div className="rise" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 4 }}>Manajemen Kas</h1>
          <p style={{ fontSize: 13, color: C.mid }}>Akun kas, perpindahan dana, dan pengeluaran proyek</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <button onClick={() => setShowCreateTransfer(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              <ArrowRightLeft size={14} /> Transfer
            </button>
          )}
          <button onClick={() => setShowCreateExpense(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
          >
            <Plus size={14} /> Catat Pengeluaran
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="rise rise-1" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {loadingSummary ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, minWidth: 160, ...card, padding: "16px 18px", display: "flex", gap: 14, alignItems: "center" }}>
              <Skeleton h={44} w={44} /><div style={{ flex: 1 }}><Skeleton h={12} w="60%" /><div style={{ marginTop: 8 }} /><Skeleton h={20} /></div>
            </div>
          ))
        ) : summary ? (
          <>
            {[
              { label: "Total Semua Kas", value: fmtCompact(summary.totalBalance), color: C.text, border: undefined, sub: "Utama + Kolektor + Kas Kecil" },
              { label: "Kas Utama", value: fmtCompact(summary.mainBalance), color: C.navy, border: C.blueBorder, sub: `Kolektor: ${fmtCompact(summary.collectorBalance)}` },
              { label: "Total Kas Kecil", value: fmtCompact(summary.pettyBalance), color: C.green, border: C.greenBorder, sub: "Di seluruh PM & proyek" },
              { label: "Pengeluaran Bulan Ini", value: fmtCompact(summary.expensesThisMonth), color: C.red, border: C.redBorder, sub: summary.pendingExpenseCount > 0 ? `${summary.pendingExpenseCount} menunggu review` : null },
            ].map(s => (
              <div key={s.label}
                style={{ flex: 1, minWidth: 160, ...card, padding: "16px 18px", borderColor: s.border ?? C.border, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,51,102,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <p style={{ fontSize: 11, color: C.muted, margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0, fontFamily: "var(--font-display)" }}>{s.value}</p>
                {s.sub && <p style={{ fontSize: 11, color: s.label === "Pengeluaran Bulan Ini" && summary.pendingExpenseCount > 0 ? C.yellow : C.muted, margin: "4px 0 0", fontWeight: s.label === "Pengeluaran Bulan Ini" && summary.pendingExpenseCount > 0 ? 600 : 400 }}>{s.sub}</p>}
              </div>
            ))}
          </>
        ) : null}
      </div>

      {/* Alert pending */}
      {summary && (summary.pendingTransferAmount > 0 || summary.pendingExpenseAmount > 0) && (
        <div className="rise rise-2" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {summary.pendingTransferAmount > 0 && (
            <div style={{ flex: 1, minWidth: 240, padding: "12px 16px", borderRadius: 10, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
              <Clock size={16} color={C.yellow} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.yellow, fontWeight: 600 }}>
                {summary.pendingTransferCount} transfer menunggu konfirmasi · {fmtCompact(summary.pendingTransferAmount)}
              </span>
              <button onClick={() => { setTab("transfer"); setTransferStatusFilter("pending"); }} style={{ marginLeft: "auto", fontSize: 11, color: C.yellow, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>Lihat →</button>
            </div>
          )}
          {summary.pendingExpenseAmount > 0 && (
            <div style={{ flex: 1, minWidth: 240, padding: "12px 16px", borderRadius: 10, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={16} color={C.yellow} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.yellow, fontWeight: 600 }}>
                {summary.pendingExpenseCount} pengeluaran menunggu persetujuan · {fmtCompact(summary.pendingExpenseAmount)}
              </span>
              <button onClick={() => { setTab("pengeluaran"); setExpenseStatusFilter("submitted"); }} style={{ marginLeft: "auto", fontSize: 11, color: C.yellow, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>Review →</button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="rise rise-3" style={card}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
          <Tab label="Akun Kas" active={tab === "akun"} onClick={() => setTab("akun")} count={accounts.length || undefined} />
          <Tab label="Transfer Dana" active={tab === "transfer"} onClick={() => { setTab("transfer"); }} count={pendingTransfers || undefined} />
          <Tab label="Pengeluaran" active={tab === "pengeluaran"} onClick={() => setTab("pengeluaran")} count={pendingExpenses || undefined} />
        </div>

        {/* TAB: Akun Kas */}
        {tab === "akun" && (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>Semua akun kas yang aktif dalam sistem</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={loadAccounts} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                  <RefreshCw size={13} /> Refresh
                </button>
                {isAdmin && (
                  <button onClick={() => setShowCreateAccount(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <Plus size={13} /> Akun Baru
                  </button>
                )}
              </div>
            </div>

            {loadingAccounts ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3].map(i => <div key={i} style={{ padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={18} /></div>)}</div>
            ) : accounts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: C.muted }}>
                <Wallet size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
                <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Belum ada akun kas</p>
                <p style={{ fontSize: 13 }}>Buat akun kas pertama untuk memulai tracking.</p>
                {isAdmin && <button onClick={() => setShowCreateAccount(true)} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Buat Akun Kas</button>}
              </div>
            ) : (
              <>
                {/* Group by type */}
                {(["main", "collector", "petty_cash"] as const).map(type => {
                  const group = accounts.filter(a => a.type === type);
                  if (!group.length) return null;
                  const meta = ACCOUNT_TYPE_LABEL[type];
                  const groupTotal = group.reduce((s, a) => s + Number(a.balance), 0);
                  return (
                    <div key={type} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: meta.color }}>
                          {meta.icon}
                          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{meta.label}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtCompact(groupTotal)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {group.map(acc => <AccountCard key={acc.id} acc={acc} onClick={() => {}} />)}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* TAB: Transfer Dana */}
        {tab === "transfer" && (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <select aria-label="Saring status transfer" value={transferStatusFilter} onChange={e => setTransferStatusFilter(e.target.value)}
                style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none" }}>
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu Konfirmasi</option>
                <option value="confirmed">Dikonfirmasi</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
              <button onClick={loadTransfers} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Refresh
              </button>
              {transfers.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid }}>
                  {transfers.length} transfer · Total: <strong style={{ color: C.text }}>{fmtCompact(transfers.filter(t => t.status === "confirmed").reduce((s, t) => s + t.amount, 0))}</strong> terkonfirmasi
                </span>
              )}
            </div>

            {loadingTransfers ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3].map(i => <div key={i} style={{ padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={18} /></div>)}</div>
            ) : transfers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: C.muted }}>
                <ArrowRightLeft size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
                <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Tidak ada transfer</p>
                <p style={{ fontSize: 13 }}>Belum ada catatan transfer dana.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {transfers.map(t => (
                  <TransferRow key={t.id} t={t} canConfirm={hasPermission("cash:transfer:confirm")} onConfirm={handleConfirmTransfer} onCancel={handleCancelTransfer} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: Pengeluaran */}
        {tab === "pengeluaran" && (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <select aria-label="Saring status pengeluaran" value={expenseStatusFilter} onChange={e => setExpenseStatusFilter(e.target.value)}
                style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none" }}>
                <option value="all">Semua Status</option>
                <option value="submitted">Menunggu Review</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
                <option value="draft">Draft</option>
              </select>
              <button onClick={loadExpenses} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Refresh
              </button>
              {expenses.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid }}>
                  Total disetujui: <strong style={{ color: C.text }}>{fmtCompact(expenses.filter(e => e.status === "approved").reduce((s, e) => s + e.total_amount, 0))}</strong>
                </span>
              )}
            </div>

            {/* Ringkasan per Kategori */}
            {categoryBreakdown.length > 0 && (
              <div style={{ marginBottom: 20, borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface-subtle)", overflow: "hidden" }}>
                <button
                  onClick={() => setShowCategoryBreakdown(p => !p)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: showCategoryBreakdown ? `1px solid ${C.border}` : "none",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                    <ShoppingCart size={13} color={C.navy} /> Ringkasan per Kategori
                    <span style={{ fontWeight: 400, color: C.muted }}>({categoryBreakdown.length} kategori · Total {fmtCompact(categoryBreakdown.reduce((s, c) => s + c.total, 0))})</span>
                  </span>
                  <span style={{ fontSize: 11, color: C.muted, transform: showCategoryBreakdown ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
                </button>
                {showCategoryBreakdown && (
                  <div style={{ padding: "12px 16px" }}>
                    {(() => {
                      const grandTotal = categoryBreakdown.reduce((s, c) => s + c.total, 0);
                      const TYPE_COLOR: Record<string, string> = {
                        material: C.red, labor: C.blue, equipment: C.yellow,
                        operational: "var(--aksen)", other: C.muted,
                      };
                      const TYPE_LABEL: Record<string, string> = {
                        material: "Material", labor: "Labor/Upah", equipment: "Equipment",
                        operational: "Operasional", other: "Lain-lain",
                      };
                      return categoryBreakdown.map(cat => {
                        const pct = grandTotal > 0 ? Math.round((cat.total / grandTotal) * 100) : 0;
                        const color = TYPE_COLOR[cat.type] ?? C.muted;
                        return (
                          <div key={cat.id} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 11, color, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: `${color}18` }}>
                                  {TYPE_LABEL[cat.type] ?? cat.type}
                                </span>
                                <span style={{ fontSize: 12, color: C.text }}>{cat.name}</span>
                                <span style={{ fontSize: 11, color: C.muted }}>({cat.count}×)</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: C.muted }}>{pct}%</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{fmtCompact(cat.total)}</span>
                              </div>
                            </div>
                            <div style={{ height: 6, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: color, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}

            {loadingExpenses ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3].map(i => <div key={i} style={{ padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={18} /></div>)}</div>
            ) : expenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: C.muted }}>
                <ShoppingCart size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
                <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Tidak ada pengeluaran</p>
                <p style={{ fontSize: 13 }}>Belum ada pengeluaran yang dicatat.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {expenses.map(e => (
                  <ExpenseRow key={e.id} e={e} canReview={hasPermission("cash:expense:approve")} onApprove={handleApproveExpense} onReject={handleRejectExpense} />
                ))}
              </div>
            )}

            {/* Bayar Supplier — pembayaran hutang supplier yang memotong kas */}
            {(supplierPayments.length > 0 || loadingSupplierPayments) && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.muted, marginBottom: 10 }}>
                  Bayar Supplier (dari kas)
                </div>
                {loadingSupplierPayments ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2].map(i => <div key={i} style={{ padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={16} /></div>)}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {supplierPayments.map((sp: any) => (
                      <div key={sp.id} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface-subtle)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Building2 size={16} color={C.blue} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                              Bayar Supplier · {sp.supplier?.name ?? "—"}
                            </div>
                            <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                              <span style={{ background: C.navyLight, color: C.navy, padding: "1px 7px", borderRadius: 4 }}>
                                dari: {sp.cash_account?.name}
                              </span>
                              <span>{fmtDate(sp.payment_date)}</span>
                              <span>· {sp.payment_method === "transfer" ? "Transfer Bank" : sp.payment_method === "cash" ? "Tunai" : "Cek/Giro"}</span>
                              {sp.reference_number && <span>· ref: {sp.reference_number}</span>}
                              {sp.creator && <span>· {sp.creator.name}</span>}
                            </div>
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)", flexShrink: 0 }}>
                            -{fmt(sp.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pembayaran Progress Mandor — progress_payments yang sudah approved & memotong kas */}
            {(progressPaymentsKas.length > 0 || loadingMandorOutflows) && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.muted, marginBottom: 10 }}>
                  Pembayaran Progress Mandor (dari kas)
                </div>
                {loadingMandorOutflows ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2].map(i => <div key={i} style={{ padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={16} /></div>)}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {progressPaymentsKas.map((pp: any) => (
                      <div key={pp.id} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${C.greenBorder}`, background: C.greenBg }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <TrendingDown size={16} color={C.green} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                              Bayar Progress {pp.pct_completed ?? pp.pct_done ?? 0}% · {pp.scope?.scope_name ?? "—"}
                            </div>
                            <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                              {pp.scope?.assignment?.mandor && <span>mandor: {pp.scope.assignment.mandor.name}</span>}
                              {pp.requester && <span>· diminta: {pp.requester.name}</span>}
                              <span>· {fmtDate(pp.paid_at ?? pp.created_at)}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)", flexShrink: 0 }}>
                            -{fmt(pp.gross_payment ?? 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Settlement Borongan — pembayaran final borongan yang memotong kas */}
            {(boronganSettlementsKas.length > 0 || loadingMandorOutflows) && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.muted, marginBottom: 10 }}>
                  Settlement Borongan (dari kas)
                </div>
                {loadingMandorOutflows ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2].map(i => <div key={i} style={{ padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}><Skeleton h={16} /></div>)}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {boronganSettlementsKas.map((bs: any) => (
                      <div key={bs.id} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${C.purpleBorder}`, background: C.purpleBg }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--navy-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <CheckCircle2 size={16} color={C.purple} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                              Settlement Borongan · {bs.scope?.scope_name ?? "—"}
                            </div>
                            <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                              {bs.scope?.assignment?.mandor && <span>mandor: {bs.scope.assignment.mandor.name}</span>}
                              <span>· {fmtDate(bs.settled_at ?? bs.created_at)}</span>
                              <span style={{ background: "var(--navy-light)", color: C.purple, padding: "1px 7px", borderRadius: 4, border: `1px solid ${C.purpleBorder}` }}>
                                Borongan {fmtCompact(bs.borongan_value ?? 0)} · Kasbon {fmtCompact(bs.total_kasbon ?? 0)}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)", flexShrink: 0 }}>
                            -{fmt(bs.net_payment ?? 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateAccount && isAdmin && (
        <CreateAccountModal
          onClose={() => setShowCreateAccount(false)}
          onSuccess={() => { setShowCreateAccount(false); loadAccounts(); loadSummary(); }}
        />
      )}
      {showCreateTransfer && canEdit && (
        <CreateTransferModal
          accounts={accounts}
          onClose={() => setShowCreateTransfer(false)}
          onSuccess={() => { setShowCreateTransfer(false); loadTransfers(); loadAccounts(); loadSummary(); }}
          onNeedAccounts={loadAccounts}
        />
      )}
      {showCreateExpense && (
        <CreateExpenseModal
          accounts={accounts.filter(a => a.type === "petty_cash" && a.is_active)}
          onClose={() => setShowCreateExpense(false)}
          onSuccess={() => { setShowCreateExpense(false); loadExpenses(); loadSummary(); loadAccounts(); }}
          onNeedAccounts={loadAccounts}
        />
      )}
    </div>
  );
}

// ─── Modal: Buat Akun Kas ─────────────────────────────────────────────────────
function CreateAccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [name, setName] = useState("");
  const [type, setType] = useState<"main" | "collector" | "petty_cash">("main");
  const [ownerId, setOwnerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<{ users: { id: string; name: string; role: string }[] }>("/api/v1/users"),
      api.get<{ projects: Project[] }>("/api/v1/projects"),
    ]).then(([ur, pr]) => { setUsers(ur.data.users); setProjects(pr.data.projects); }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!name || !type) { setError("Nama dan tipe wajib diisi"); return; }
    const parsedBalance = initialBalance ? parseFloat(initialBalance) : undefined;
    if (parsedBalance !== undefined && (isNaN(parsedBalance) || parsedBalance < 0)) {
      setError("Saldo awal harus berupa angka positif"); return;
    }
    setLoading(true);
    try {
      await api.post("/api/v1/cash/accounts", {
        name, type,
        owner_id: ownerId || undefined,
        project_id: projectId || undefined,
        initial_balance: parsedBalance,
        notes: notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal membuat akun");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,var(--navy),var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center" }}><Wallet size={17} color="var(--surface)" /></div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Buat Akun Kas Baru</h3>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          <div>
            <span id="tipe-akun" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Tipe Akun <span style={{ color: C.red }}>*</span></span>
            <div role="group" aria-labelledby="tipe-akun" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {(["main", "collector", "petty_cash"] as const).map(t => {
                const m = ACCOUNT_TYPE_LABEL[t];
                return (
                  <button type="button" key={t} onClick={() => setType(t)} style={{ padding: "10px 8px", borderRadius: 10, border: `2px solid ${type === t ? m.color : C.border}`, background: type === t ? m.bg : "var(--surface)", color: type === t ? m.color : C.mid, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.15s" }}>
                    {m.icon}{m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="name" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Nama Akun <span style={{ color: C.red }}>*</span></label>
            <input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder={type === "main" ? "Kas Utama Nizar" : type === "collector" ? "Kas Ayah" : "Kas Kecil PM Agus – Griya Asri"}
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
          </div>
          {(type === "petty_cash" || type === "collector") && (
            <div>
              <label htmlFor="owner-id" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Pemegang Kas {type === "petty_cash" ? <span style={{ color: C.red }}>*</span> : null}</label>
              <select id="owner-id" aria-label="Pemilik akun kas" value={ownerId} onChange={e => setOwnerId(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="">-- Pilih user --</option>
                {users.filter(u => type === "petty_cash" ? (u.role === "pm" || u.role === "admin") : true).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
          )}
          {type === "petty_cash" && (
            <div>
              <label htmlFor="project-id" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Proyek <span style={{ color: C.red }}>*</span></label>
              <select id="project-id" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="">-- Pilih proyek --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="initial-balance" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Saldo Awal (Rp)</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
              <input id="initial-balance" type="number" min={0} value={initialBalance} onChange={e => setInitialBalance(e.target.value)} placeholder="0"
                style={{ width: "100%", padding: "9px 12px 9px 32px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <label htmlFor="notes" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan</label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: loading ? "var(--text-muted)" : C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Menyimpan..." : "Buat Akun"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Transfer Dana ─────────────────────────────────────────────────────
function CreateTransferModal({ accounts, onClose, onSuccess, onNeedAccounts }: {
  accounts: CashAccount[]; onClose: () => void; onSuccess: () => void; onNeedAccounts: () => void;
}) {
  useTutupEsc(onClose);
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  useEffect(() => { if (accounts.length === 0) onNeedAccounts(); }, []);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<"pending" | "confirmed">("confirmed");
  const [refNumber, setRefNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!fromId || !toId || !amount) { setError("Akun asal, tujuan, dan nominal wajib diisi"); return; }
    if (fromId === toId) { setError("Akun asal dan tujuan tidak boleh sama"); return; }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError("Nominal transfer harus lebih dari 0"); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/cash/transfers", {
        from_account_id: fromId, to_account_id: toId,
        amount: parsedAmount, transfer_date: transferDate,
        status, ref_number: refNumber || undefined, notes: notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal catat transfer");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,var(--aksen),var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowRightLeft size={17} color="var(--surface)" /></div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Catat Transfer Dana</h3>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {/* From → To visual */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr", gap: 8, alignItems: "end" }}>
            <div>
              <label htmlFor="from-id" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Dari Akun <span style={{ color: C.red }}>*</span></label>
              <select id="from-id" aria-label="Kas asal transfer" value={fromId} onChange={e => setFromId(e.target.value)} required style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="">-- Pilih --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {fromAcc && <div style={{ fontSize: 11, color: fromAcc.balance < parseFloat(amount || "0") ? C.red : C.green, marginTop: 4 }}>Saldo: {fmt(fromAcc.balance)}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "center", paddingBottom: 10 }}><ArrowRightLeft size={16} color={C.mid} /></div>
            <div>
              <label htmlFor="to-id" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Ke Akun <span style={{ color: C.red }}>*</span></label>
              <select id="to-id" aria-label="Kas tujuan transfer" value={toId} onChange={e => setToId(e.target.value)} required style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="">-- Pilih --</option>
                {accounts.filter(a => a.id !== fromId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {toAcc && <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>Saldo saat ini: {fmt(toAcc.balance)}</div>}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="amount" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                <input id="amount" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} required
                  style={{ width: "100%", padding: "9px 12px 9px 32px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <label htmlFor="transfer-date" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Tanggal Transfer</label>
              <input id="transfer-date" aria-label="Tanggal" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <span id="status-transfer" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8 }}>Status Transfer</span>
            <div role="group" aria-labelledby="status-transfer" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" onClick={() => setStatus("confirmed")} style={{ padding: "10px", borderRadius: 10, border: `2px solid ${status === "confirmed" ? C.green : C.border}`, background: status === "confirmed" ? C.greenBg : "var(--surface)", color: status === "confirmed" ? C.green : C.mid, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                ✓ Langsung Konfirmasi<br /><span style={{ fontSize: 10, fontWeight: 400 }}>Saldo berubah sekarang</span>
              </button>
              <button type="button" onClick={() => setStatus("pending")} style={{ padding: "10px", borderRadius: 10, border: `2px solid ${status === "pending" ? C.yellow : C.border}`, background: status === "pending" ? C.yellowBg : "var(--surface)", color: status === "pending" ? C.yellow : C.mid, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                ⏳ Simpan Pending<br /><span style={{ fontSize: 10, fontWeight: 400 }}>Konfirmasi setelah diterima</span>
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="ref-number" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>No. Referensi</label>
            <input id="ref-number" type="text" value={refNumber} onChange={e => setRefNumber(e.target.value)} placeholder="No. TF / kode transfer"
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label htmlFor="notes-2" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan</label>
            <textarea id="notes-2" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Misal: Top-up kas kecil PM Agus untuk Proyek Griya Asri"
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: loading ? "var(--text-muted)" : C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Menyimpan..." : "Catat Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Catat Pengeluaran ─────────────────────────────────────────────────
function CreateExpenseModal({ accounts, onClose, onSuccess, onNeedAccounts }: {
  accounts: CashAccount[]; onClose: () => void; onSuccess: () => void; onNeedAccounts: () => void;
}) {
  useTutupEsc(onClose);
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  useEffect(() => { if (accounts.length === 0) onNeedAccounts(); }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mainCashAccounts, setMainCashAccounts] = useState<CashAccount[]>([]);
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [pettyCashId, setPettyCashId] = useState("");
  const [mainCashId, setMainCashId] = useState("");
  const [expenseSource, setExpenseSource] = useState<"petty_cash" | "main_cash" | "personal" | "client_fund">("petty_cash");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const total = (parseFloat(qty || "1") || 1) * (parseFloat(unitPrice || "0") || 0);
  const selectedPettyCash = accounts.find(a => a.id === pettyCashId);

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects").then(r => setProjects(r.data.projects)).catch(() => {});
    api.get<{ categories: Category[] }>("/api/v1/cash/categories")
      .then(r => setCategories(r.data.categories)).catch(() => {});
    api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts?type=main")
      .then(r => {
        const mains = r.data.accounts.filter(a => a.type === "main" && a.is_active);
        setMainCashAccounts(mains);
        if (mains.length === 1) setMainCashId(mains[0].id);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const url = projectId
      ? `/api/v1/cash/categories?project_id=${projectId}`
      : "/api/v1/cash/categories";
    api.get<{ categories: Category[] }>(url)
      .then(r => { setCategories(r.data.categories); setCategoryId(""); }).catch(() => {});
  }, [projectId]);

  // Filter kas kecil sesuai proyek
  const projectPettyCash = accounts.filter(a => {
    if (!a.projects) return false;
    return a.projects.id === projectId || !projectId;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!projectId || !categoryId || !description || !unitPrice) { setError("Proyek, kategori, deskripsi, dan harga wajib diisi"); return; }
    if (expenseSource === "petty_cash" && !pettyCashId) { setError("Pilih kas kecil jika sumber = Kas Kecil"); return; }
    if (expenseSource === "main_cash" && !mainCashId) { setError("Pilih akun Kas Utama jika sumber = Kas Utama"); return; }
    // client_fund: tidak mengurangi saldo kas manapun, tidak perlu pilih akun
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("project_id", projectId);
      fd.append("category_id", categoryId);
      fd.append("expense_source", expenseSource);
      if (expenseSource === "petty_cash" && pettyCashId) fd.append("petty_cash_id", pettyCashId);
      if (expenseSource === "main_cash" && mainCashId) fd.append("main_cash_id", mainCashId);
      fd.append("description", description);
      fd.append("expense_date", expenseDate);
      fd.append("qty", qty);
      if (unit) fd.append("unit", unit);
      fd.append("unit_price", unitPrice);
      if (vendorName) fd.append("vendor_name", vendorName);
      if (notes) fd.append("notes", notes);
      if (receiptFile) fd.append("receipt", receiptFile);
      await api.post("/api/v1/cash/expenses", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onSuccess();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal catat pengeluaran");
    } finally { setLoading(false); }
  }

  // Group categories
  const parentCats = categories.filter(c => !c.parent_id);
  const childCats = (parentId: string) => categories.filter(c => c.parent_id === parentId);

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", maxHeight: "92vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,var(--danger),var(--danger))", display: "flex", alignItems: "center", justifyContent: "center" }}><ShoppingCart size={17} color="var(--surface)" /></div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Catat Pengeluaran Proyek</h3>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
          {/* Proyek + Tanggal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="project-id-2" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Proyek <span style={{ color: C.red }}>*</span></label>
              <select id="project-id-2" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} required style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="">-- Pilih proyek --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="expense-date" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Tanggal</label>
              <input id="expense-date" aria-label="Tanggal" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Sumber Dana */}
          <div>
            <span id="sumber-dana" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8 }}>Sumber Dana <span style={{ color: C.red }}>*</span></span>
            <div role="group" aria-labelledby="sumber-dana" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(["petty_cash", "main_cash", "personal", "client_fund"] as const).map(s => (
                <button type="button" key={s} onClick={() => setExpenseSource(s)} style={{ padding: "8px 6px", borderRadius: 8, border: `2px solid ${expenseSource === s ? C.navy : C.border}`, background: expenseSource === s ? C.navyLight : "var(--surface)", color: expenseSource === s ? C.navy : C.mid, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
            {expenseSource === "client_fund" && (
              <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "var(--info-bg)", border: "1px solid var(--info-border)", fontSize: 11, color: "var(--info)" }}>
                Pengeluaran ini dibayar dari dana klien — tidak mengurangi saldo kas internal.
              </div>
            )}
            {expenseSource === "personal" && (
              <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 11, color: "var(--on-warning-bg)" }}>
                Talangan pribadi — perlu di-reimburse dari kas proyek.
              </div>
            )}
          </div>

          {/* Kas Kecil selector */}
          {expenseSource === "petty_cash" && (
            <div>
              <label htmlFor="petty-cash-id" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Kas Kecil <span style={{ color: C.red }}>*</span></label>
              <select id="petty-cash-id" aria-label="Kas kecil" value={pettyCashId} onChange={e => setPettyCashId(e.target.value)} required={expenseSource === "petty_cash"}
                style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="">-- Pilih kas kecil --</option>
                {(projectId ? projectPettyCash : accounts).map(a => (
                  <option key={a.id} value={a.id}>{a.name} — saldo: {fmt(a.balance)}</option>
                ))}
              </select>
              {selectedPettyCash && total > 0 && (
                <div style={{ fontSize: 11, marginTop: 4, color: selectedPettyCash.balance < total ? C.red : C.green }}>
                  Saldo: {fmt(selectedPettyCash.balance)} {selectedPettyCash.balance < total ? "⚠ tidak cukup" : "✓ cukup"}
                </div>
              )}
            </div>
          )}

          {/* Kas Utama selector */}
          {expenseSource === "main_cash" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Akun Kas Utama <span style={{ color: C.red }}>*</span></label>
              {mainCashAccounts.length === 0 ? (
                <div style={{ padding: "9px 12px", borderRadius: 8, background: "var(--surface-subtle)", border: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
                  Tidak ada akun Kas Utama aktif
                </div>
              ) : (
                <select aria-label="Kas utama" value={mainCashId} onChange={e => setMainCashId(e.target.value)} required={expenseSource === "main_cash"}
                  style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                  {mainCashAccounts.length > 1 && <option value="">-- Pilih akun kas utama --</option>}
                  {mainCashAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} — saldo: {fmt(a.balance)}</option>
                  ))}
                </select>
              )}
              {mainCashId && (() => {
                const acc = mainCashAccounts.find(a => a.id === mainCashId);
                if (!acc || total === 0) return null;
                return (
                  <div style={{ fontSize: 11, marginTop: 4, color: acc.balance < total ? C.red : C.green }}>
                    Saldo: {fmt(acc.balance)} {acc.balance < total ? "⚠ tidak cukup" : "✓ cukup"}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Kategori */}
          <div>
            <label htmlFor="category-id" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Kategori <span style={{ color: C.red }}>*</span></label>
            <select id="category-id" aria-label="Kategori pengeluaran" value={categoryId} onChange={e => setCategoryId(e.target.value)} required
              style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
              <option value="">-- Pilih kategori --</option>
              {parentCats.map(p => (
                <optgroup key={p.id} label={p.name}>
                  {childCats(p.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {childCats(p.id).length === 0 && <option value={p.id}>{p.name}</option>}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Deskripsi */}
          <div>
            <label htmlFor="description" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Deskripsi <span style={{ color: C.red }}>*</span></label>
            <input id="description" value={description} onChange={e => setDescription(e.target.value)} required placeholder="misal: Beli semen 40 sak di Toko Bangunan Maju"
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
          </div>

          {/* Qty + Unit + Harga */}
          <div style={{ display: "grid", gridTemplateColumns: "80px 80px 1fr", gap: 10 }}>
            <div>
              <label htmlFor="qty" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Qty</label>
              <input id="qty" type="number" min={0.001} step="0.001" value={qty} onChange={e => setQty(e.target.value)}
                style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label htmlFor="unit" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Satuan</label>
              <input id="unit" type="text" value={unit} onChange={e => setUnit(e.target.value)} placeholder="sak, kg, m"
                style={{ width: "100%", padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label htmlFor="unit-price" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Harga Satuan <span style={{ color: C.red }}>*</span></label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
                <input id="unit-price" type="number" min={0} value={unitPrice} onChange={e => setUnitPrice(e.target.value)} required
                  style={{ width: "100%", padding: "9px 12px 9px 30px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>

          {/* Total preview */}
          {total > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--surface-subtle)", border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: C.mid }}>Total</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>{fmt(total)}</span>
            </div>
          )}

          {/* Vendor + Nota */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="vendor-name" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Nama Toko/Supplier</label>
              <input id="vendor-name" type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Toko Bangunan Maju"
                style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Foto Nota</label>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 5 * 1024 * 1024) { alert("Ukuran file maksimal 5 MB"); e.target.value = ""; return; }
                setReceiptFile(f);
              }} />
              {receiptFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 8, background: C.greenBg, border: `1px solid ${C.greenBorder}` }}>
                  <FileText size={14} color={C.green} />
                  <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{receiptFile.name}</span>
                  <button type="button" aria-label="Buang nota yang dipilih" onClick={() => setReceiptFile(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.red, flexShrink: 0 }}><X size={12} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ width: "100%", padding: "9px 12px", border: `2px dashed ${C.border}`, borderRadius: 8, background: "var(--surface-subtle)", color: C.mid, fontSize: 11, cursor: "pointer", textAlign: "center", boxSizing: "border-box" }}>
                  Upload nota
                </button>
              )}
            </div>
          </div>

          {/* Catatan — medan ini SEBELUMNYA HILANG.
              `notes` sudah dikirim ke API (`fd.append("notes", notes)`) dan
              ditampilkan di daftar mutasi, tapi tak ada input yang mengisinya,
              jadi nilainya selalu "" dan kondisinya tak pernah benar. Dua modal
              lain di berkas ini (transfer & top-up) punya textarea-nya; yang ini
              terlewat. Ketahuan dari `setNotes` yatim di ratchet lint. */}
          <div>
            <label htmlFor="catatan-pengeluaran" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan</label>
            <textarea id="catatan-pengeluaran" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Misal: pembelian tambahan karena volume di lapangan bertambah"
              style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>

          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}

          {hasPermission("cash:expense:approve") && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.greenBg, border: `1px solid ${C.greenBorder}`, fontSize: 12, color: C.green }}>
              ✓ Pengeluaran akan langsung disetujui (saldo kas kecil berkurang otomatis)
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: loading ? "var(--text-muted)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Menyimpan..." : "Catat Pengeluaran"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

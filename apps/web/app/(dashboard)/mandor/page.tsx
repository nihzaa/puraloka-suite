"use client";

import { Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { api, getStoredUser } from "@/lib/api";
import { useUnits } from "@/lib/use-units";
import { useWorkCategories } from "@/lib/use-work-categories";
import * as XLSX from "xlsx";
import {
  HardHat, Plus, ChevronRight, RefreshCw, CheckCircle2, Clock,
  XCircle, AlertTriangle, Banknote, User, Users, FileText,
  Calendar, Search, X, ChevronDown, Trash2, Check, Download, Camera, Phone,
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
};

const card: React.CSSProperties = {
  background: "var(--surface)", border: `1px solid ${C.border}`,
  borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Assignment {
  id: string;
  status: string;
  notes: string | null;
  assigned_at: string;
  project: { id: string; name: string; location: string } | null;
  mandor: { id: string; name: string; phone: string | null } | null;
  assigner: { id: string; name: string } | null;
  work_scopes: WorkScope[];
}

interface WorkScope {
  id: string;
  scope_name: string;
  payment_system: string;
  status: string;
  borongan_value: number | null;
  contract_value: number;
  progress_pct_done: number;
  total_kasbon: number;
  total_progress_paid: number;
  financial_pct: number;
  paid_pct: number;
  settlement: { net_payment: number; borongan_value: number; total_kasbon: number } | null;
}

interface WageReport {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
  subtotal: number;
  total_amount: number;
  total_deduction: number;
  net_amount: number;
  notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  paid_at: string | null;
  payment_method: string | null;
  assignment: {
    id: string;
    project: { id: string; name: string } | null;
    mandor: { id: string; name: string } | null;
  } | null;
  scope: { id: string; scope_name: string; payment_system: string } | null;
  reviewer: { id: string; name: string } | null;
}

interface WageReportDetail {
  report: WageReport;
  items: WageItem[];
  deductions: WageDeduction[];
}

interface WageItem {
  id: string;
  worker_name: string;
  worker_id: string | null;
  days_worked: number;
  daily_rate: number;
  overtime_hours: number;
  overtime_rate: number;
  subtotal: number;
  notes: string | null;
}

interface WageDeduction {
  id: string;
  tipe: 'kasbon_kolektif' | 'kasbon_individu';
  label: string;
  amount: number;
  worker_name: string | null;
  worker_kasbon: {
    id: string;
    amount: number;
    purpose: string;
    kasbon_date: string;
    worker: { id: string; name: string } | null;
  } | null;
}

interface Worker {
  id: string; name: string; phone: string | null;
  tipe: 'tukang' | 'laden' | 'kenek' | null;
  skills: string[]; is_active: boolean;
  mandor?: { id: string; name: string } | null;
}
interface WorkerKasbon {
  id: string; amount: number; purpose: string; kasbon_date: string;
  notes: string | null; amount_settled: number; is_settled: boolean;
  photo_url: string | null;
  worker: { id: string; name: string } | null;
  mandor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  scope: { id: string; scope_name: string } | null;
}
interface Summary {
  pendingReports: number; approvedAmount: number;
  activeWorkersThisMonth: number; totalWorkersAll: number;
  activeKasbons: number; activeKasbonAmount: number;
}

interface MandorKasbon {
  id: string; amount: number; fund_source: string; purpose: string;
  kasbon_date: string; status: string; notes: string | null; created_at: string; approved_at: string | null;
  photo_url: string | null;
  project: { id: string; name: string } | null;
  work_scopes: { id: string; scope_name: string; mandor_assignments: { id: string; projects: { id: string; name: string } | null }[] } | null;
  approver: { id: string; name: string } | null;
  cash_account: { id: string; name: string; type: string } | null;
}

interface MandorScope {
  id: string; scope_name: string; payment_system: string;
  assignment: { id: string; project: { id: string; name: string } | null; mandor: { id: string; name: string } | null } | null;
}

interface ScopeItem {
  id: string; item_name: string; category: string; description: string | null;
  unit: string; volume: number; unit_price: number; subtotal: number;
  volume_done: number; pct_done: number; sort_order: number; notes: string | null;
  specs?: { id: string; spec_key: string; spec_value: string; sort_order: number }[];
}

interface ScopeDetail {
  scope: WorkScope & {
    assignment: { id: string; mandor: { id: string; name: string; phone: string | null } | null; project: { id: string; name: string; location: string } | null } | null;
    description: string | null;
    start_date: string | null; end_date: string | null;
  };
  items: ScopeItem[];
}

interface MandorUser { id: string; name: string; phone: string | null; email: string }

type TabKey = "penugasan" | "laporan" | "kasbon" | "mandor-kasbon" | "tukang" | "penagihan";

interface ProgressPayment {
  id: string;
  work_scope_id: string;
  pct_done: number;
  gross_payment: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  requested_by: string | null;
  cash_account_id: string | null;
  work_scope: { id: string; scope_name: string; payment_system: string; assignment_id: string } | null;
  project: { id: string; name: string } | null;
  requester: { id: string; name: string } | null;
}

interface CashAccount { id: string; name: string; type: string; balance: number; is_active: boolean; }

interface SettlementModalState {
  scopeId: string;
  scopeName: string;
  mandorName: string;
  projectName: string;
  boronganValue: number;
  totalKasbon: number;
}

interface ProgressPaymentConfirmState {
  payment: ProgressPayment;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const fmtDateShort = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

function getMondayOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

const REPORT_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",     color: C.mid,    bg: "var(--surface-subtle)",  border: C.border },
  submitted: { label: "Diajukan",  color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  approved:  { label: "Disetujui", color: C.green,  bg: C.greenBg,  border: C.greenBorder },
  rejected:  { label: "Ditolak",   color: C.red,    bg: C.redBg,    border: C.redBorder },
  paid:      { label: "Dibayar",   color: C.blue,   bg: C.blueBg,   border: C.blueBorder },
};

const PAYMENT_SYSTEM: Record<string, string> = {
  harian: "Harian", borongan: "Borongan", progress_pct: "Progress %",
};

const CATEGORY_LABELS: Record<string, string> = {
  struktur: "Struktur", baja: "Baja", dinding: "Dinding", finishing: "Finishing",
  atap: "Atap", plumbing: "Plumbing", elektrikal: "Elektrikal", mekanikal: "Mekanikal",
  kusen_pintu: "Kusen & Pintu", pagar_carport: "Pagar/Carport", landscape: "Landscape", lain_lain: "Lain-lain",
};

const TIPE_LABELS: Record<string, string> = { tukang: "Tukang", laden: "Laden", kenek: "Kenek" };
const TIPE_COLORS: Record<string, { bg: string; color: string }> = {
  tukang: { bg: "#DBEAFE", color: "#1E40AF" },
  laden:  { bg: "#D1FAE5", color: "#065F46" },
  kenek:  { bg: "#FEF3C7", color: "#92400E" },
};

const SKILL_OPTIONS = [
  { value: "tukang_batu", label: "Tukang Batu" },
  { value: "tukang_kayu", label: "Tukang Kayu" },
  { value: "tukang_besi", label: "Tukang Besi" },
  { value: "tukang_cat", label: "Tukang Cat" },
  { value: "plumbing", label: "Plumbing" },
  { value: "elektrikal", label: "Elektrikal" },
  { value: "finishing", label: "Finishing" },
  { value: "lainnya", label: "Lainnya" },
];
const SKILL_LABELS: Record<string, string> = Object.fromEntries(SKILL_OPTIONS.map(s => [s.value, s.label]));

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  struktur:      { bg: "#FEF3C7", color: "#92400E" },
  baja:          { bg: "#DBEAFE", color: "#1E40AF" },
  dinding:       { bg: "#FCE7F3", color: "#9D174D" },
  finishing:     { bg: "#D1FAE5", color: "#065F46" },
  atap:          { bg: "#E0E7FF", color: "#3730A3" },
  plumbing:      { bg: "#CFFAFE", color: "#164E63" },
  elektrikal:    { bg: "#FEF9C3", color: "#713F12" },
  mekanikal:     { bg: "#F3E8FF", color: "#6B21A8" },
  kusen_pintu:   { bg: "#FFF7ED", color: "#9A3412" },
  pagar_carport: { bg: "#F1F5F9", color: "#475569" },
  landscape:     { bg: "#DCFCE7", color: "#166534" },
  lain_lain:     { bg: "var(--surface-hover)", color: "var(--text-secondary)" },
};

// ─── Badge helpers (D3) ──────────────────────────────────────────────────────
function getPaymentSystemBadge(type: string) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    borongan:     { label: "Borongan",  bg: "#DBEAFE", color: "#1E40AF", border: "var(--info-border)" },
    harian:       { label: "Harian",    bg: "#D1FAE5", color: "#065F46", border: "#A7F3D0" },
    progress_pct: { label: "Progress%", bg: "#EDE9FE", color: "#5B21B6", border: "#C4B5FD" },
  };
  return map[type] ?? { label: type, bg: "var(--surface-hover)", color: "var(--text-secondary)", border: "var(--border)" };
}

function getWageStatusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    draft:     { label: "Draft",     bg: "var(--surface-subtle)",  color: "var(--text-secondary)", border: "var(--border)" },
    submitted: { label: "Diajukan",  bg: "var(--warning-bg)",  color: "var(--warning)", border: "var(--warning-border)" },
    approved:  { label: "Disetujui", bg: "var(--success-bg)",  color: "var(--success)", border: "var(--success-border)" },
    rejected:  { label: "Ditolak",   bg: "var(--danger-bg)",  color: "var(--danger)", border: "var(--danger-border)" },
    paid:      { label: "Dibayar",   bg: "var(--info-bg)",  color: "var(--info)", border: "var(--info-border)" },
  };
  return map[status] ?? map.draft;
}

// ─── Progress/Budget color helpers (D4) ──────────────────────────────────────
function getProgressColor(pct: number): string {
  if (pct >= 90) return "var(--warning)";  // amber — hampir selesai
  if (pct >= 70) return "var(--success)";  // hijau
  if (pct >= 30) return "var(--info)";  // biru
  return "var(--text-muted)";                  // abu — belum banyak
}

function getBudgetColor(pct: number): string {
  if (pct >= 90) return "var(--danger)";  // merah — kritis
  if (pct >= 70) return "var(--warning)";  // kuning — waspada
  return "var(--success)";                  // hijau — aman
}

// ─── WA link helper (D5) ─────────────────────────────────────────────────────
function toWaLink(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("0") ? "62" + digits.slice(1) : digits}`;
}

// ─── Modal mount guard ────────────────────────────────────────────────────────
function useMounted() {
  const [mounted, dispatch] = useReducer(() => true, false);
  useEffect(() => { dispatch(); }, []);
  return mounted;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function MandorPageInner() {
  const currentUser = getStoredUser();
  const isMandor = currentUser?.role === "mandor";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<TabKey>("laporan");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [reports, setReports] = useState<WageReport[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [kasbons, setKasbons] = useState<WorkerKasbon[]>([]);
  const [mandorKasbons, setMandorKasbons] = useState<MandorKasbon[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mandorList, setMandorList] = useState<MandorUser[]>([]);
  const [selectedScope, setSelectedScope] = useState<ScopeDetail | null>(null);
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [showAddScope, setShowAddScope] = useState<string | null>(null);
  const [showScopeItems, setShowScopeItems] = useState<string | null>(null);
  const [showAddScopeItem, setShowAddScopeItem] = useState<string | null>(null);
  const [loadingScope, setLoadingScope] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Filter state for Laporan Upah — synced with URL query params
  const [filterMandorId, setFilterMandorId] = useState(() => searchParams.get("mandor_id") ?? "");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "");
  const [filterDateFrom, setFilterDateFrom] = useState(() => searchParams.get("date_from") ?? "");
  const [filterDateTo, setFilterDateTo] = useState(() => searchParams.get("date_to") ?? "");

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function resetFilters() {
    setFilterMandorId(""); setFilterStatus(""); setFilterDateFrom(""); setFilterDateTo("");
    router.replace("?", { scroll: false });
  }

  // Filter state for Daftar Tukang tab
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerFilterTipe, setWorkerFilterTipe] = useState("");
  const [workerFilterStatus, setWorkerFilterStatus] = useState("aktif");

  // Filter state for Kasbon Tukang tab
  const [kasbonFilterMandorId, setKasbonFilterMandorId] = useState("");
  const [kasbonFilterStatus, setKasbonFilterStatus] = useState("aktif");

  // Cicilan modal state
  const [cicilanModal, setCicilanModal] = useState<{ kasbonId: string; remaining: number } | null>(null);
  const [cicilanNominal, setCicilanNominal] = useState("");
  const [cicilanCatatan, setCicilanCatatan] = useState("");
  const [cicilanLoading, setCicilanLoading] = useState(false);
  const [cicilanError, setCicilanError] = useState("");

  // Inline approve/tolak state
  const [inlineAction, setInlineAction] = useState<{
    report: WageReport;
    mode: "approve" | "reject";
  } | null>(null);
  const [inlinePaymentMethod, setInlinePaymentMethod] = useState<"cash" | "transfer_bank">("cash");
  const [inlineNotes, setInlineNotes] = useState("");
  const [inlineLoading, setInlineLoading] = useState(false);

  async function doInlineApprove() {
    if (!inlineAction) return;
    setInlineLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await api.patch(`/api/v1/mandor/wage-reports/${inlineAction.report.id}/status`, {
        status: "approved",
        payment_method: inlinePaymentMethod,
        paid_at: today,
        review_notes: inlineNotes || undefined,
      });
      setInlineAction(null); setInlineNotes("");
      load();
    } catch { /* silent */ } finally { setInlineLoading(false); }
  }

  async function doInlineReject() {
    if (!inlineAction || !inlineNotes.trim()) return;
    setInlineLoading(true);
    try {
      await api.patch(`/api/v1/mandor/wage-reports/${inlineAction.report.id}/status`, {
        status: "rejected",
        review_notes: inlineNotes,
      });
      setInlineAction(null); setInlineNotes("");
      load();
    } catch { /* silent */ } finally { setInlineLoading(false); }
  }

  // Modal states
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [showWorkerForm, setShowWorkerForm] = useState<{ mandorId?: string; mandorName?: string; worker?: Worker } | null>(null);
  const [deleteWorkerConfirm, setDeleteWorkerConfirm] = useState<Worker | null>(null);
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);
  const [showAddKasbon, setShowAddKasbon] = useState(false);
  const [showSubmitMandorKasbon, setShowSubmitMandorKasbon] = useState(false);
  const [detailReport, setDetailReport] = useState<WageReportDetail | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Fase D — Progress payments & settlements
  const [progressPayments, setProgressPayments] = useState<ProgressPayment[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [settlementModal, setSettlementModal] = useState<SettlementModalState | null>(null);
  const [ppConfirmModal, setPpConfirmModal] = useState<ProgressPaymentConfirmState | null>(null);
  const [ppActionLoading, setPpActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [asgRes, rptRes, sumRes, kbRes, mkbRes, mandorRes, ppRes, cashRes] = await Promise.all([
        api.get<{ assignments: Assignment[] }>("/api/v1/mandor/assignments"),
        api.get<{ reports: WageReport[] }>("/api/v1/mandor/wage-reports"),
        api.get<Summary>("/api/v1/mandor/summary"),
        api.get<{ kasbons: WorkerKasbon[] }>("/api/v1/mandor/worker-kasbons"),
        api.get<{ kasbons: MandorKasbon[] }>("/api/v1/kasbons"),
        api.get<{ mandors: MandorUser[] }>("/api/v1/mandor/list").catch(() => ({ data: { mandors: [] } })),
        api.get<{ payments: ProgressPayment[] }>("/api/v1/mandor/progress-payments").catch(() => ({ data: { payments: [] } })),
        api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts").catch(() => ({ data: { accounts: [] } })),
      ]);
      setAssignments(asgRes.data.assignments);
      setReports(rptRes.data.reports);
      setSummary(sumRes.data);
      setKasbons(kbRes.data.kasbons);
      setMandorKasbons(mkbRes.data.kasbons ?? []);
      setMandorList(mandorRes.data.mandors ?? []);
      setProgressPayments(ppRes.data.payments ?? []);
      setCashAccounts((cashRes.data.accounts ?? []).filter((a: CashAccount) => a.is_active));
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadWorkers = useCallback(() => {
    api.get<{ workers: Worker[] }>("/api/v1/mandor/workers")
      .then(r => setWorkers(r.data.workers)).catch(() => {});
  }, []);

  // Load workers ketika tab tukang dibuka
  useEffect(() => {
    if (tab === "tukang") loadWorkers();
  }, [tab, loadWorkers]);

  async function loadScopeDetail(scopeId: string) {
    setLoadingScope(true);
    try {
      const r = await api.get<ScopeDetail>(`/api/v1/mandor/work-scopes/${scopeId}`);
      setSelectedScope(r.data);
    } catch { /* silent */ } finally { setLoadingScope(false); }
  }

  async function openDetail(id: string) {
    try {
      const r = await api.get<WageReportDetail>(`/api/v1/mandor/wage-reports/${id}`);
      setDetailReport(r.data);
    } catch { /* silent */ }
  }

  async function handleApprove(id: string, status: "approved" | "rejected" | "paid", notes?: string, cashAccountId?: string, paidAt?: string, paymentMethod?: string) {
    try {
      await api.patch(`/api/v1/mandor/wage-reports/${id}/status`, {
        status,
        review_notes: notes,
        cash_account_id: cashAccountId ?? undefined,
        paid_at: paidAt ?? undefined,
        payment_method: paymentMethod ?? undefined,
      });
      load();
      if (detailReport?.report?.id === id) {
        openDetail(id);
      }
    } catch { /* silent */ }
  }

  async function handleDeleteWorker(worker: Worker) {
    setDeletingWorkerId(worker.id);
    try {
      await api.delete(`/api/v1/mandor/workers/${worker.id}`);
      setDeleteWorkerConfirm(null);
      loadWorkers();
    } catch (err: unknown) {
      alert((err as any)?.response?.data?.error ?? "Gagal menghapus tukang");
    } finally { setDeletingWorkerId(null); }
  }

  const filteredReports = reports.filter(r => {
    if (search && !(
      r.assignment?.mandor?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.assignment?.project?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.scope?.scope_name?.toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (filterMandorId && r.assignment?.mandor?.id !== filterMandorId) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterDateFrom && r.week_start < filterDateFrom) return false;
    if (filterDateTo && r.week_start > filterDateTo) return false;
    return true;
  });

  // D1 — Export Excel
  function exportExcel() {
    const rows = filteredReports.flatMap(r => {
      const baseRow = {
        Mandor: r.assignment?.mandor?.name ?? "",
        Scope: r.scope?.scope_name ?? "",
        Proyek: r.assignment?.project?.name ?? "",
        "Periode Minggu": r.week_start ? `${r.week_start} s/d ${r.week_end}` : "",
        "Total Potongan": (r as any).deductions?.reduce((s: number, d: any) => s + Number(d.amount), 0) ?? 0,
        "Yang Dibayar": r.net_amount,
        Status: getWageStatusBadge(r.status).label,
        "Metode Bayar": r.payment_method ?? "",
        "Tanggal Bayar": r.paid_at ?? "",
      };
      const items = (r as any).items as Array<any> | undefined;
      if (items?.length) {
        return items.map(item => ({
          ...baseRow,
          "Nama Pekerja": item.worker_name,
          "Hari Kerja": item.days_worked,
          "Tarif/Hari": item.daily_rate,
          "Lembur (Rp)": item.overtime_amount ?? 0,
          Subtotal: item.subtotal,
        }));
      }
      return [{ ...baseRow, "Nama Pekerja": "", "Hari Kerja": "", "Tarif/Hari": "", "Lembur (Rp)": "", Subtotal: r.total_amount }];
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Upah");
    XLSX.writeFile(wb, `laporan-upah-${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  const Tab = ({ id, label, count }: { id: TabKey; label: string; count?: number }) => (
    <button
      onClick={() => setTab(id)}
      onMouseEnter={e => { if (tab !== id) e.currentTarget.style.color = C.text; }}
      onMouseLeave={e => { if (tab !== id) e.currentTarget.style.color = C.mid; }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "10px 18px", background: "transparent", border: "none",
        borderBottom: `2px solid ${tab === id ? C.navy : "transparent"}`,
        fontSize: 13, fontWeight: tab === id ? 600 : 400,
        color: tab === id ? C.navy : C.mid,
        cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "1px 6px",
          background: tab === id ? C.navyLight : "var(--surface-hover)",
          color: tab === id ? C.navy : C.muted,
        }}>{count}</span>
      )}
    </button>
  );

  return (
    <div style={{ padding: "28px 32px", background: C.bg, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HardHat size={20} color={C.navy} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Mandor</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Laporan upah, kasbon tukang, dan manajemen tenaga kerja</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mid }}>
            <RefreshCw size={14} /> Refresh
          </button>
          {tab === "penugasan" && !isMandor && (
            <button onClick={() => setShowAddAssignment(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Plus size={14} /> Assign Mandor
            </button>
          )}
          {tab === "laporan" && (
            <button onClick={() => setShowCreateReport(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Plus size={14} /> Ajukan Upah
            </button>
          )}
          {tab === "kasbon" && (
            <button onClick={() => setShowAddKasbon(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Plus size={14} /> Tambah Kasbon
            </button>
          )}
          {tab === "mandor-kasbon" && (
            <button onClick={() => setShowSubmitMandorKasbon(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.yellow, color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.background = "#B45309"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.yellow; }}>
              <Plus size={14} /> Ajukan Kasbon
            </button>
          )}
          {tab === "tukang" && !isMandor && (
            <button onClick={() => setShowWorkerForm({ mandorId: "", mandorName: "" })} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Plus size={14} /> Tambah Pekerja
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Laporan Menunggu", value: summary.pendingReports, suffix: "laporan", icon: <Clock size={16} color={C.yellow} />, bg: C.yellowBg, color: C.yellow, sub: null, clickable: true },
            { label: "Perlu Dibayar", value: fmt(summary.approvedAmount), icon: <Banknote size={16} color={C.green} />, bg: C.greenBg, color: C.green, sub: null },
            { label: "Pekerja Terdaftar", value: summary.totalWorkersAll, suffix: "orang", icon: <Users size={16} color={C.navy} />, bg: C.navyLight, color: C.navy, sub: summary.activeWorkersThisMonth > 0 ? `${summary.activeWorkersThisMonth} aktif 30 hari terakhir` : null },
            { label: "Kasbon Aktif", value: summary.activeKasbons, suffix: "kasbon", icon: <AlertTriangle size={16} color={C.red} />, bg: C.redBg, color: C.red, sub: null },
            { label: "Total Kasbon Aktif", value: fmt(summary.activeKasbonAmount), icon: <FileText size={16} color={C.mid} />, bg: "var(--surface-subtle)", color: C.mid, sub: null },
          ].map((s, i) => (
            <div key={i}
              onClick={s.clickable ? () => { setTab("laporan"); setFilterStatus("submitted"); updateFilter("status", "submitted"); } : undefined}
              style={{ ...card, padding: "14px 16px", cursor: s.clickable ? "pointer" : "default", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,51,102,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.icon}</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
                {typeof s.value === "number" ? s.value : s.value}
                {s.suffix && <span style={{ fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 4 }}>{s.suffix}</span>}
              </div>
              {s.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Tabs + search */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
          {!isMandor && <Tab id="penugasan" label="Penugasan" />}
          <Tab id="laporan" label="Laporan Upah" count={summary?.pendingReports} />
          <Tab id="kasbon" label="Kasbon Tukang" count={kasbons.filter(k => !k.is_settled).length} />
          {!isMandor && <Tab id="penagihan" label="Penagihan Progress" count={progressPayments.filter(p => p.status === "pending").length} />}
          {isMandor && <Tab id="mandor-kasbon" label="Kasbon Saya" count={mandorKasbons.filter(k => k.status === "pending").length} />}
          <Tab id="tukang" label="Daftar Tukang" />
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 12px", padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--surface)" }}>
            <Search size={13} color={C.muted} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari..." style={{ border: "none", outline: "none", fontSize: 13, width: 140, color: C.text, background: "transparent" }} />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : (
        <>
          {/* TAB: Laporan Upah */}
          {tab === "laporan" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Filter bar */}
              {!isMandor && (
                <div style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <select value={filterMandorId} onChange={e => { setFilterMandorId(e.target.value); updateFilter("mandor_id", e.target.value); }}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text, minWidth: 160 }}>
                    <option value="">Semua Mandor</option>
                    {mandorList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); updateFilter("status", e.target.value); }}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text }}>
                    <option value="">Semua Status</option>
                    {Object.entries(REPORT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); updateFilter("date_from", e.target.value); }}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", color: C.text }} />
                  <span style={{ fontSize: 12, color: C.muted }}>s/d</span>
                  <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); updateFilter("date_to", e.target.value); }}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", color: C.text }} />
                  {(filterMandorId || filterStatus || filterDateFrom || filterDateTo) && (
                    <button onClick={resetFilters} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 12, color: C.mid, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <X size={12} /> Reset
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: C.muted }}>{filteredReports.length} laporan</span>
                  <button
                    onClick={exportExcel}
                    style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 12, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
                    <Download size={13} /> Export Excel
                  </button>
                </div>
              )}
              {filteredReports.length === 0 ? (
                <div style={{ ...card, padding: 48, textAlign: "center", color: C.muted }}>
                  <FileText size={32} color={C.border} style={{ marginBottom: 12 }} />
                  <div>Belum ada laporan upah</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Klik "Ajukan Upah" untuk membuat laporan baru</div>
                </div>
              ) : filteredReports.map(r => {
                const st = getWageStatusBadge(r.status);
                const canApprove = !isMandor && r.status === "submitted";
                return (
                  <div key={r.id} style={{ ...card, padding: "14px 18px", transition: "box-shadow 0.15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}
                      onClick={() => openDetail(r.id)}
                      onMouseEnter={e => (e.currentTarget.style.cursor = "pointer")}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: st.bg, border: `1px solid ${st.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Calendar size={18} color={st.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                            {r.assignment?.mandor?.name ?? "—"} · {r.scope?.scope_name ?? "—"}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                          {(() => { const b = getPaymentSystemBadge(r.scope?.payment_system ?? ""); return (
                            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 600 }}>{b.label}</span>
                          ); })()}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted }}>
                          {r.assignment?.project?.name ?? "—"} · Minggu {fmtDateShort(r.week_start)} – {fmtDateShort(r.week_end)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>{fmt(r.net_amount)}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {r.total_deduction > 0 && <span style={{ color: C.red }}>−{fmt(r.total_deduction)} potongan</span>}
                          {r.total_deduction === 0 && <span>Subtotal {fmt(r.subtotal)}</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} color={C.muted} onClick={() => openDetail(r.id)} style={{ cursor: "pointer" }} />
                    </div>
                    {/* Inline approve/reject buttons for submitted reports */}
                    {canApprove && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                        <button
                          onClick={e => { e.stopPropagation(); setInlineAction({ report: r, mode: "approve" }); setInlinePaymentMethod("cash"); setInlineNotes(""); }}
                          style={{ padding: "5px 14px", borderRadius: 7, border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                          <Check size={12} /> Setujui
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setInlineAction({ report: r, mode: "reject" }); setInlineNotes(""); }}
                          style={{ padding: "5px 14px", borderRadius: 7, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                          <XCircle size={12} /> Tolak
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB: Kasbon Tukang — grouped by mandor */}
          {tab === "kasbon" && (() => {
            const purposeLabel: Record<string, string> = {
              gaji_tukang: "Gaji", uang_makan: "Makan", pembelian_alat: "Alat", operasional: "Operasional", lain_lain: "Lain-lain",
            };

            // Filter
            const filteredKasbons = kasbons.filter(k => {
              if (search && !k.worker?.name?.toLowerCase().includes(search.toLowerCase()) && !k.project?.name?.toLowerCase().includes(search.toLowerCase())) return false;
              if (kasbonFilterMandorId && k.mandor?.id !== kasbonFilterMandorId) return false;
              if (kasbonFilterStatus === "aktif" && k.is_settled) return false;
              if (kasbonFilterStatus === "lunas" && !k.is_settled) return false;
              return true;
            });

            // Group by mandor
            const mandorMap = new Map<string, { id: string; name: string; kasbons: WorkerKasbon[] }>();
            filteredKasbons.forEach(k => {
              const mid = k.mandor?.id ?? "unknown";
              const mname = k.mandor?.name ?? "Tidak Diketahui";
              if (!mandorMap.has(mid)) mandorMap.set(mid, { id: mid, name: mname, kasbons: [] });
              mandorMap.get(mid)!.kasbons.push(k);
            });
            const groups = Array.from(mandorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            const uniqueMandors = Array.from(new Map(kasbons.filter(k => k.mandor).map(k => [k.mandor!.id, k.mandor!])).values());

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* 4A — Filter bar */}
                <div style={{ ...card, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <select value={kasbonFilterMandorId} onChange={e => setKasbonFilterMandorId(e.target.value)}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text, minWidth: 150 }}>
                    <option value="">Semua Mandor</option>
                    {uniqueMandors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <select value={kasbonFilterStatus} onChange={e => setKasbonFilterStatus(e.target.value)}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text }}>
                    <option value="">Semua Status</option>
                    <option value="aktif">Aktif</option>
                    <option value="lunas">Lunas</option>
                  </select>
                  {(kasbonFilterMandorId || kasbonFilterStatus !== "aktif") && (
                    <button onClick={() => { setKasbonFilterMandorId(""); setKasbonFilterStatus("aktif"); }}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 12, color: C.mid, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <X size={12} /> Reset
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>{filteredKasbons.length} kasbon</span>
                </div>

                {groups.length === 0 ? (
                  <div style={{ ...card, padding: 48, textAlign: "center", color: C.muted }}>
                    <Banknote size={32} color={C.border} style={{ marginBottom: 12 }} />
                    <div>Belum ada kasbon tukang</div>
                  </div>
                ) : groups.map(group => {
                  const totalKasbon = group.kasbons.reduce((s, k) => s + Number(k.amount), 0);
                  const totalLunas = group.kasbons.reduce((s, k) => s + Number(k.amount_settled), 0);
                  const outstanding = totalKasbon - totalLunas;
                  // 4C — progress bar color per mandor group
                  const outstandingPct = totalKasbon > 0 ? (outstanding / totalKasbon) * 100 : 0;
                  const groupBarColor = outstandingPct > 80 ? C.red : outstandingPct > 50 ? C.yellow : C.green;

                  return (
                    <div key={group.id} style={{ ...card, overflow: "hidden" }}>
                      {/* Group header */}
                      <div style={{ padding: "12px 18px", background: "var(--bg)", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: C.navy }}>
                            {group.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{group.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: C.navyLight, color: C.navy }}>{group.kasbons.length} kasbon</span>
                        </div>
                        {/* Summary strip */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                          {[
                            { label: "Total Kasbon", value: fmt(totalKasbon), color: C.text },
                            { label: "Lunas", value: fmt(totalLunas), color: C.green },
                            { label: "Outstanding", value: fmt(outstanding), color: outstanding > 0 ? C.red : C.mid },
                          ].map((s, i) => (
                            <div key={i}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 1 }}>{s.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                        {/* 4C — Progress bar outstanding vs total */}
                        {totalKasbon > 0 && (
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ fontSize: 10, color: C.muted }}>Outstanding</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: groupBarColor }}>{outstandingPct.toFixed(0)}%</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 2, background: groupBarColor, width: `${outstandingPct}%`, transition: "width 0.3s" }} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Kasbon rows */}
                      {group.kasbons.map((k, idx) => {
                        const remaining = k.amount - k.amount_settled;
                        const pct = k.amount > 0 ? (k.amount_settled / k.amount) * 100 : 0;
                        const isLast = idx === group.kasbons.length - 1;
                        return (
                          <div key={k.id} style={{ padding: "12px 18px", borderBottom: isLast ? "none" : `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: k.is_settled ? C.greenBg : C.yellowBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <User size={14} color={k.is_settled ? C.green : C.yellow} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{k.worker?.name ?? "—"}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8, background: k.is_settled ? C.greenBg : C.yellowBg, color: k.is_settled ? C.green : C.yellow }}>{k.is_settled ? "Lunas" : "Aktif"}</span>
                                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "var(--surface-hover)", color: C.mid }}>{purposeLabel[k.purpose] ?? k.purpose}</span>
                              </div>
                              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                                {k.project?.name ?? "—"} · {fmtDate(k.kasbon_date)}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ flex: 1, height: 3, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 3, background: k.is_settled ? C.green : C.yellow, width: `${pct}%` }} />
                                </div>
                                <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{Math.round(pct)}%</span>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: k.is_settled ? C.green : C.red }}>{fmt(remaining)}</div>
                              <div style={{ fontSize: 11, color: C.muted }}>dari {fmt(k.amount)}</div>
                              {/* 4B — Tombol cicilan */}
                              {!k.is_settled && (
                                <button type="button"
                                  onClick={() => { setCicilanModal({ kasbonId: k.id, remaining }); setCicilanNominal(""); setCicilanCatatan(""); setCicilanError(""); }}
                                  style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                  Catat Cicilan
                                </button>
                              )}
                              {k.photo_url && (
                                <button type="button" onClick={() => setLightboxPhoto(k.photo_url!)}
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: C.blue, display: "flex", alignItems: "center", gap: 3, fontSize: 11 }} title="Lihat foto nota">
                                  <Camera size={12} /> Foto
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* TAB: Kasbon Saya (mandor role) */}
          {tab === "mandor-kasbon" && (() => {
            const totalOut = mandorKasbons.reduce((s, k) => s + (["pending","approved","settled"].includes(k.status) ? Number(k.amount) : 0), 0);
            const totalSettled = mandorKasbons.filter(k => k.status === "settled").reduce((s, k) => s + Number(k.amount), 0);
            const outstanding = mandorKasbons.filter(k => k.status === "approved").reduce((s, k) => s + Number(k.amount), 0);
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Running total strip */}
              {mandorKasbons.length > 0 && (
                <div style={{ ...card, padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, background: C.navyLight, border: `1px solid #C7D9F0` }}>
                  {[
                    { label: "Total Kasbon", value: fmt(totalOut), color: C.text },
                    { label: "Sudah Settled", value: fmt(totalSettled), color: C.green },
                    { label: "Belum Lunas", value: fmt(outstanding), color: outstanding > 0 ? C.red : C.mid },
                  ].map((s, i) => (
                    <div key={i} style={{ textAlign: i === 1 ? "center" : i === 2 ? "right" : "left" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {mandorKasbons.length === 0 ? (
                <div style={{ ...card, padding: 48, textAlign: "center", color: C.muted }}>
                  <Banknote size={32} color={C.border} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Belum ada kasbon</div>
                  <div style={{ fontSize: 12 }}>Klik "Ajukan Kasbon" untuk mengajukan kasbon baru</div>
                </div>
              ) : mandorKasbons.map(k => {
                const project = k.project ?? k.work_scopes?.mandor_assignments?.[0]?.projects;
                const statusMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
                  pending:  { label: "Menunggu Persetujuan", color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
                  approved: { label: "Disetujui", color: C.green, bg: C.greenBg, border: C.greenBorder },
                  rejected: { label: "Ditolak", color: C.red, bg: C.redBg, border: C.redBorder },
                  settled:  { label: "Settled", color: C.mid, bg: "var(--surface-subtle)", border: C.border },
                };
                const st = statusMap[k.status] ?? statusMap.pending;
                const purposeLabel: Record<string, string> = {
                  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
                  pembelian_alat: "Pembelian Alat", operasional: "Operasional", lain_lain: "Lain-lain",
                };
                return (
                  <div key={k.id} style={{ ...card, padding: "14px 18px", border: `1px solid ${st.border}`, background: k.status === "pending" ? C.yellowBg : "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                          <span style={{ fontSize: 11, background: "var(--surface-hover)", color: C.mid, padding: "2px 8px", borderRadius: 4 }}>{purposeLabel[k.purpose] ?? k.purpose}</span>
                          <span style={{ fontSize: 11, background: "var(--surface-hover)", color: C.mid, padding: "2px 8px", borderRadius: 4 }}>{k.fund_source === "owner_advance" ? "Dana Owner" : "Dana Klien"}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                          {k.work_scopes?.scope_name
                            ? <>{k.work_scopes.scope_name}{project && <span style={{ fontSize: 12, color: C.mid, fontWeight: 400 }}> · {project.name}</span>}</>
                            : <span style={{ fontWeight: 400, color: C.mid }}>{project?.name ?? "Kasbon Umum"}</span>
                          }
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {new Date(k.kasbon_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                          {k.approver && k.status === "approved" && (
                            <span style={{ marginLeft: 10 }}>· Disetujui oleh {k.approver.name}</span>
                          )}
                        </div>
                        {k.cash_account && k.status === "approved" && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: C.navyLight, color: C.navy, fontWeight: 600 }}>
                            <Banknote size={10} /> {k.cash_account.name}
                          </div>
                        )}
                        {k.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>"{k.notes}"</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: k.status === "pending" ? C.yellow : k.status === "approved" ? C.green : C.mid, fontFamily: "monospace" }}>
                          {fmt(Number(k.amount))}
                        </div>
                        {k.status === "pending" && (
                          <div style={{ fontSize: 11, color: C.muted }}>menunggu approval</div>
                        )}
                        {k.photo_url && (
                          <button type="button" onClick={() => setLightboxPhoto(k.photo_url!)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: C.blue, display: "flex", alignItems: "center", gap: 3, fontSize: 11 }} title="Lihat foto nota">
                            <Camera size={12} /> Foto Nota
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* TAB: Penugasan & Work Scopes */}
          {tab === "penugasan" && !isMandor && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {assignments.filter(a => !search ||
                a.mandor?.name?.toLowerCase().includes(search.toLowerCase()) ||
                a.project?.name?.toLowerCase().includes(search.toLowerCase())
              ).length === 0 ? (
                <div style={{ ...card, padding: 48, textAlign: "center", color: C.muted }}>
                  <HardHat size={32} color={C.border} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Belum ada mandor yang di-assign</div>
                  <div style={{ fontSize: 12 }}>Klik "Assign Mandor" untuk menugaskan mandor ke proyek</div>
                </div>
              ) : assignments
                .filter(a => !search ||
                  a.mandor?.name?.toLowerCase().includes(search.toLowerCase()) ||
                  a.project?.name?.toLowerCase().includes(search.toLowerCase())
                )
                .map(asg => {
                  const totalNilai = asg.work_scopes.reduce((s, sc) => s + Number(sc.borongan_value ?? 0), 0);
                  return (
                    <div key={asg.id} style={card}>
                      {/* Assignment header */}
                      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <HardHat size={20} color={C.navy} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div
                            onClick={() => asg.mandor?.id && router.push(`/mandor/${asg.mandor.id}`)}
                            style={{ fontSize: 15, fontWeight: 700, color: C.navy, cursor: asg.mandor?.id ? "pointer" : "default", display: "inline-block" }}
                            title={asg.mandor?.id ? "Lihat profil mandor" : undefined}>
                            {asg.mandor?.name ?? "—"}
                          </div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                            {asg.project?.name ?? "—"}
                            {asg.mandor?.phone && toWaLink(asg.mandor.phone) && (
                              <a href={toWaLink(asg.mandor.phone)!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                style={{ marginLeft: 8, color: C.green, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <Phone size={10} /> {asg.mandor.phone}
                              </a>
                            )}
                            <span style={{ marginLeft: 8 }}>· Ditugaskan {fmtDate(asg.assigned_at)}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {totalNilai > 0 && (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{fmt(totalNilai)}</div>
                              <div style={{ fontSize: 11, color: C.muted }}>total nilai</div>
                            </div>
                          )}
                          <button
                            onClick={() => setShowAddScope(asg.id)}
                            style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.navy}`, background: "var(--surface)", color: C.navy, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                            <Plus size={12} /> Tambah Scope
                          </button>
                        </div>
                      </div>

                      {/* Work scopes */}
                      {asg.work_scopes.length === 0 ? (
                        <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                          Belum ada scope pekerjaan — klik "Tambah Scope"
                        </div>
                      ) : (
                        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {asg.work_scopes.map(sc => {
                            const pctColor = getProgressColor(sc.progress_pct_done);
                            const isBorongan = sc.payment_system === "borongan";
                            const isProgressPct = sc.payment_system === "progress_pct";
                            const contractValue = sc.contract_value ?? sc.borongan_value ?? 0;
                            return (
                              <div key={sc.id} style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "#FAFAFA", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{sc.scope_name}</span>
                                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: sc.status === "active" ? C.greenBg : "var(--surface-hover)", color: sc.status === "active" ? C.green : C.mid, border: `1px solid ${sc.status === "active" ? C.greenBorder : C.border}` }}>
                                      {sc.status === "active" ? "Aktif" : sc.status === "completed" ? "Selesai" : sc.status}
                                    </span>
                                    {(() => { const b = getPaymentSystemBadge(sc.payment_system); return (
                                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 600 }}>{b.label}</span>
                                    ); })()}
                                    {contractValue > 0 && (
                                      <span style={{ fontSize: 10, color: C.mid }}>{fmt(contractValue)}</span>
                                    )}
                                    {sc.settlement && (
                                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: C.greenBg, color: C.green, border: `1px solid ${C.greenBorder}` }}>
                                        ✓ Settled
                                      </span>
                                    )}
                                  </div>
                                  {/* Progress Fisik */}
                                  <div style={{ marginBottom: isBorongan || isProgressPct ? 5 : 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                      <span style={{ fontSize: 10, color: C.muted }}>Progress Fisik</span>
                                      <span style={{ fontSize: 10, fontWeight: 600, color: pctColor }}>{sc.progress_pct_done.toFixed(0)}%</span>
                                    </div>
                                    <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                                      <div style={{ height: "100%", borderRadius: 3, background: pctColor, width: `${sc.progress_pct_done}%` }} />
                                    </div>
                                  </div>
                                  {/* Borongan: bar kasbon / kontrak */}
                                  {isBorongan && contractValue > 0 && (
                                    <div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                        <span style={{ fontSize: 10, color: C.muted }}>Kasbon / Kontrak</span>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: C.yellow }}>
                                          {fmt(sc.total_kasbon ?? 0)} / {fmt(contractValue)} ({sc.financial_pct ?? 0}%)
                                        </span>
                                      </div>
                                      <div style={{ height: 4, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                                        <div style={{ height: "100%", borderRadius: 3, background: C.yellow, width: `${sc.financial_pct ?? 0}%` }} />
                                      </div>
                                    </div>
                                  )}
                                  {/* Progress%: bar sudah dibayar */}
                                  {isProgressPct && contractValue > 0 && (
                                    <div>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                        <span style={{ fontSize: 10, color: C.muted }}>Sudah Dibayar</span>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: C.green }}>
                                          {fmt(sc.total_progress_paid ?? 0)} ({sc.paid_pct ?? 0}%)
                                        </span>
                                      </div>
                                      <div style={{ height: 4, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                                        <div style={{ height: "100%", borderRadius: 3, background: C.green, width: `${sc.paid_pct ?? 0}%` }} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                  {sc.payment_system === "borongan" && sc.status === "active" && !isMandor && (
                                    <button
                                      onClick={() => {
                                        setSettlementModal({
                                          scopeId: sc.id,
                                          scopeName: sc.scope_name,
                                          mandorName: asg.mandor?.name ?? "—",
                                          projectName: asg.project?.name ?? "—",
                                          boronganValue: sc.borongan_value ?? 0,
                                          totalKasbon: 0,
                                        });
                                      }}
                                      style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.green}`, background: C.greenBg, color: C.green, cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                      Cairkan
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setShowScopeItems(sc.id); loadScopeDetail(sc.id); }}
                                    style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                                    Rincian <ChevronRight size={12} />
                                  </button>
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
          )}

          {/* TAB: Penagihan Progress — admin/PM review + confirm */}
          {tab === "penagihan" && !isMandor && (() => {
            const pendingPP = progressPayments.filter(p => p.status === "pending");
            const otherPP = progressPayments.filter(p => p.status !== "pending");

            const PP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
              pending:  { label: "Menunggu",   color: C.yellow, bg: C.yellowBg },
              approved: { label: "Disetujui",  color: C.green,  bg: C.greenBg  },
              rejected: { label: "Ditolak",    color: C.red,    bg: C.redBg    },
            };

            function PPCard({ p, isAction }: { p: ProgressPayment; isAction: boolean }) {
              const meta = PP_STATUS[p.status] ?? PP_STATUS.pending;
              return (
                <div style={{ ...card, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.work_scope?.scope_name ?? "—"}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                          {meta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.mid }}>
                        {p.project?.name ?? "—"} · Progress {p.pct_done}% · {p.requester?.name ?? "—"} · {new Date(p.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                      {p.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontStyle: "italic" }}>{p.notes}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmt(p.gross_payment)}</div>
                      {isAction && (
                        <button
                          onClick={() => setPpConfirmModal({ payment: p })}
                          style={{ marginTop: 8, padding: "5px 12px", borderRadius: 7, border: "none", background: C.navy, color: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Tinjau
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {progressPayments.length === 0 ? (
                  <div style={{ ...card, padding: 48, textAlign: "center", color: C.muted }}>
                    <Banknote size={32} color={C.border} style={{ marginBottom: 12 }} />
                    <div>Belum ada pengajuan penagihan progress</div>
                  </div>
                ) : (
                  <>
                    {pendingPP.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Menunggu Konfirmasi ({pendingPP.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {pendingPP.map(p => <PPCard key={p.id} p={p} isAction />)}
                        </div>
                      </div>
                    )}
                    {otherPP.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Riwayat ({otherPP.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {otherPP.map(p => <PPCard key={p.id} p={p} isAction={false} />)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* TAB: Daftar Pekerja — global list */}
          {tab === "tukang" && (() => {
            function formatWA(phone: string) {
              const digits = phone.replace(/\D/g, "");
              const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits;
              return `https://wa.me/${normalized}`;
            }

            const filteredWorkers = workers.filter(w => {
              if (workerSearch && !w.name.toLowerCase().includes(workerSearch.toLowerCase())) return false;
              if (workerFilterTipe && w.tipe !== workerFilterTipe) return false;
              if (workerFilterStatus === "aktif" && !w.is_active) return false;
              if (workerFilterStatus === "nonaktif" && w.is_active) return false;
              return true;
            });

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Filter bar */}
                <div style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", background: "var(--surface)" }}>
                    <Search size={13} color={C.muted} />
                    <input value={workerSearch} onChange={e => setWorkerSearch(e.target.value)} placeholder="Cari nama pekerja..." style={{ border: "none", outline: "none", fontSize: 13, width: "100%", color: C.text, background: "transparent" }} />
                  </div>
                  <select value={workerFilterTipe} onChange={e => setWorkerFilterTipe(e.target.value)}
                    style={{ padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: "var(--surface)", cursor: "pointer" }}>
                    <option value="">Semua Tipe</option>
                    <option value="tukang">Tukang</option>
                    <option value="laden">Laden</option>
                    <option value="kenek">Kenek</option>
                  </select>
                  <select value={workerFilterStatus} onChange={e => setWorkerFilterStatus(e.target.value)}
                    style={{ padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: "var(--surface)", cursor: "pointer" }}>
                    <option value="">Semua Status</option>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                  <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>{filteredWorkers.length} pekerja</span>
                  <button onClick={() => setShowWorkerForm({})}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                    <Plus size={13} /> Tambah Pekerja
                  </button>
                </div>

                {/* Table */}
                <div style={{ ...card, overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 90px 140px 130px 80px 64px", gap: 12, padding: "9px 16px", background: "var(--bg)", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <div />
                    <div>Nama</div>
                    <div>Tipe</div>
                    <div>Mandor Terakhir</div>
                    <div>No. HP</div>
                    <div>Status</div>
                    <div />
                  </div>

                  {filteredWorkers.length === 0 ? (
                    <div style={{ padding: "40px 16px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                      <Users size={28} color={C.border} style={{ marginBottom: 10, display: "block", margin: "0 auto 10px" }} />
                      Belum ada pekerja terdaftar
                    </div>
                  ) : (
                    filteredWorkers.map((w, idx) => {
                      const isLast = idx === filteredWorkers.length - 1;
                      const isDeleting = deletingWorkerId === w.id;
                      const tipeColor = w.tipe ? TIPE_COLORS[w.tipe] : null;
                      const mandorTerakhir = (w as any).mandor_terakhir ?? w.mandor?.name ?? null;
                      return (
                        <div key={w.id} style={{
                          display: "grid", gridTemplateColumns: "36px 1fr 90px 140px 130px 80px 64px", gap: 12,
                          padding: "10px 16px", alignItems: "center",
                          borderBottom: isLast ? "none" : `1px solid ${C.border}`,
                          background: !w.is_active ? "#FAFAFA" : "var(--surface)",
                          opacity: isDeleting ? 0.5 : 1,
                          transition: "opacity 0.15s",
                        }}>
                          {/* Avatar */}
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: w.is_active ? C.navyLight : "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: w.is_active ? C.navy : C.muted }}>
                            {w.name.charAt(0).toUpperCase()}
                          </div>
                          {/* Nama + skills */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: w.is_active ? C.text : C.muted }}>{w.name}</div>
                            {(w.skills ?? []).length > 0 && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                                {(w.skills ?? []).map(s => (
                                  <span key={s} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 5, background: C.blueBg, color: C.blue, border: `1px solid ${C.blueBorder}` }}>
                                    {SKILL_LABELS[s] ?? s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Tipe */}
                          <div>
                            {tipeColor ? (
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: tipeColor.bg, color: tipeColor.color }}>
                                {TIPE_LABELS[w.tipe!]}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: C.muted }}>—</span>
                            )}
                          </div>
                          {/* Mandor terakhir */}
                          <div style={{ fontSize: 12, color: C.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {mandorTerakhir ?? <span style={{ color: C.muted }}>—</span>}
                          </div>
                          {/* HP */}
                          <div>
                            {w.phone ? (
                              <a href={formatWA(w.phone)} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: C.green, textDecoration: "none", fontWeight: 500 }}
                                onClick={e => e.stopPropagation()}>
                                {w.phone}
                              </a>
                            ) : <span style={{ fontSize: 12, color: C.muted }}>—</span>}
                          </div>
                          {/* Status */}
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: w.is_active ? "#D1FAE5" : "var(--surface-hover)", color: w.is_active ? "#065F46" : C.muted }}>
                              {w.is_active ? "Aktif" : "Nonaktif"}
                            </span>
                          </div>
                          {/* Actions */}
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => setShowWorkerForm({ worker: w })}
                              style={{ padding: "5px 7px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", color: C.mid, display: "flex", alignItems: "center" }}
                              title="Edit">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onClick={() => setDeleteWorkerConfirm(w)}
                              style={{ padding: "5px 7px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, cursor: "pointer", color: C.red, display: "flex", alignItems: "center" }}
                              title="Hapus">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          {/* Delete worker confirmation */}
          {deleteWorkerConfirm && createPortal(
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "var(--surface)", borderRadius: 14, width: 380, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: C.text }}>Hapus Tukang?</h3>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: C.mid, lineHeight: 1.5 }}>
                  Hapus <strong>{deleteWorkerConfirm.name}</strong>? Data ini tidak bisa dikembalikan.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setDeleteWorkerConfirm(null)}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>
                    Batal
                  </button>
                  <button onClick={() => handleDeleteWorker(deleteWorkerConfirm)} disabled={deletingWorkerId === deleteWorkerConfirm.id}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.red, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    {deletingWorkerId === deleteWorkerConfirm.id ? "Menghapus..." : "Hapus"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}

      {/* Inline approve/reject modal */}
      {inlineAction && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 400, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            {inlineAction.mode === "approve" ? (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: C.text }}>Setujui Laporan</h3>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: C.muted }}>
                  {inlineAction.report.assignment?.mandor?.name} · {inlineAction.report.scope?.scope_name} · {fmt(inlineAction.report.net_amount)}
                </p>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8 }}>Metode Pembayaran</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["cash", "transfer_bank"] as const).map(m => (
                      <button key={m} type="button" onClick={() => setInlinePaymentMethod(m)}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: inlinePaymentMethod === m ? 700 : 400, border: `2px solid ${inlinePaymentMethod === m ? C.green : C.border}`, background: inlinePaymentMethod === m ? C.greenBg : "var(--surface)", color: inlinePaymentMethod === m ? C.green : C.mid }}>
                        {m === "cash" ? "Cash" : "Transfer Bank"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan (opsional)</div>
                  <textarea value={inlineNotes} onChange={e => setInlineNotes(e.target.value)} rows={2} placeholder="Catatan pembayaran..."
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setInlineAction(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
                  <button onClick={doInlineApprove} disabled={inlineLoading}
                    style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.green, color: "var(--surface)", cursor: inlineLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: inlineLoading ? 0.7 : 1 }}>
                    {inlineLoading ? "Memproses..." : "Bayar Sekarang"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: C.red }}>Tolak Laporan</h3>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: C.muted }}>
                  {inlineAction.report.assignment?.mandor?.name} · {inlineAction.report.scope?.scope_name} · {fmt(inlineAction.report.net_amount)}
                </p>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Alasan Penolakan <span style={{ color: C.red }}>*</span></div>
                  <textarea value={inlineNotes} onChange={e => setInlineNotes(e.target.value)} rows={3} placeholder="Jelaskan alasan penolakan..."
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${inlineNotes.trim() ? C.border : C.redBorder}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                  {!inlineNotes.trim() && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Alasan wajib diisi</div>}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setInlineAction(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
                  <button onClick={doInlineReject} disabled={inlineLoading || !inlineNotes.trim()}
                    style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.red, color: "var(--surface)", cursor: (inlineLoading || !inlineNotes.trim()) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: (inlineLoading || !inlineNotes.trim()) ? 0.6 : 1 }}>
                    {inlineLoading ? "Memproses..." : "Tolak Laporan"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modals */}
      {showCreateReport && (
        <CreateWageReportModal
          onClose={() => setShowCreateReport(false)}
          onSuccess={() => { setShowCreateReport(false); load(); }}
        />
      )}
      {showWorkerForm && (
        <WorkerFormModal
          mandorId={showWorkerForm.mandorId}
          mandorName={showWorkerForm.mandorName}
          worker={showWorkerForm.worker}
          onClose={() => setShowWorkerForm(null)}
          onSuccess={() => { setShowWorkerForm(null); loadWorkers(); }}
        />
      )}

      {showAddKasbon && (
        <AddKasbonModal
          assignments={assignments}
          onClose={() => setShowAddKasbon(false)}
          onSuccess={() => { setShowAddKasbon(false); load(); }}
        />
      )}
      {showSubmitMandorKasbon && (
        <SubmitMandorKasbonModal
          onClose={() => setShowSubmitMandorKasbon(false)}
          onSuccess={() => { setShowSubmitMandorKasbon(false); load(); }}
        />
      )}
      {showAddAssignment && (
        <AddAssignmentModal
          mandors={mandorList}
          onClose={() => setShowAddAssignment(false)}
          onSuccess={() => { setShowAddAssignment(false); load(); }}
        />
      )}
      {showAddScope && (
        <AddScopeModal
          assignmentId={showAddScope}
          onClose={() => setShowAddScope(null)}
          onSuccess={() => { setShowAddScope(null); load(); }}
        />
      )}
      {showScopeItems && (
        <ScopeDetailModal
          data={selectedScope}
          loading={loadingScope}
          onClose={() => { setShowScopeItems(null); setSelectedScope(null); }}
          onRefresh={() => showScopeItems ? loadScopeDetail(showScopeItems) : undefined}
          onAddItem={() => setShowAddScopeItem(showScopeItems)}
        />
      )}
      {showAddScopeItem && (
        <AddScopeItemModal
          scopeId={showAddScopeItem}
          onClose={() => setShowAddScopeItem(null)}
          onSuccess={() => {
            setShowAddScopeItem(null);
            if (showScopeItems) loadScopeDetail(showScopeItems);
          }}
        />
      )}
      {detailReport && (
        <WageReportDetailModal
          data={detailReport}
          onClose={() => setDetailReport(null)}
          onApprove={handleApprove}
        />
      )}
      {/* D2 — Lightbox foto nota */}
      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          <img src={lightboxPhoto} alt="Foto nota" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }} />
          <button onClick={() => setLightboxPhoto(null)}
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", color: "var(--surface)", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>
      )}

      {/* Settlement Borongan Modal */}
      {settlementModal && typeof document !== "undefined" && createPortal(
        <SettlementBoronganModal
          data={settlementModal}
          cashAccounts={cashAccounts}
          onClose={() => setSettlementModal(null)}
          onSuccess={() => { setSettlementModal(null); load(); }}
        />,
        document.body
      )}

      {/* Progress Payment Confirm Modal */}
      {ppConfirmModal && typeof document !== "undefined" && createPortal(
        <PPConfirmModal
          payment={ppConfirmModal.payment}
          cashAccounts={cashAccounts}
          loading={ppActionLoading}
          onClose={() => setPpConfirmModal(null)}
          onAction={async (action, cashAccountId, notes) => {
            setPpActionLoading(true);
            try {
              await api.patch(`/api/v1/mandor/progress-payments/${ppConfirmModal.payment.id}/confirm`, {
                status: action,
                cash_account_id: cashAccountId || undefined,
                notes: notes || undefined,
              });
              setPpConfirmModal(null);
              load();
            } catch (err: any) {
              alert(err.response?.data?.error ?? "Gagal memproses");
            } finally {
              setPpActionLoading(false);
            }
          }}
        />,
        document.body
      )}

      {/* Cicilan Modal */}
      {cicilanModal && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(0,0,0,0.4)" }}
          onClick={e => { if (e.target === e.currentTarget) setCicilanModal(null); }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", width: "100%", maxWidth: 400, padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.navy, marginBottom: 4 }}>Catat Cicilan Kasbon</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Sisa outstanding: <strong style={{ color: C.red }}>{fmt(cicilanModal.remaining)}</strong>
            </div>
            {cicilanError && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red, marginBottom: 12 }}>{cicilanError}</div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Nominal Cicilan</label>
              <input
                type="number" min={1} max={cicilanModal.remaining}
                value={cicilanNominal} onChange={e => setCicilanNominal(e.target.value)}
                placeholder="Rp 0"
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Catatan (opsional)</label>
              <textarea
                value={cicilanCatatan} onChange={e => setCicilanCatatan(e.target.value)}
                rows={2} placeholder="Mis: bayar dari upah minggu ini"
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setCicilanModal(null)} disabled={cicilanLoading}
                style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer", color: C.text }}>
                Batal
              </button>
              <button
                disabled={cicilanLoading || !cicilanNominal || Number(cicilanNominal) <= 0}
                onClick={async () => {
                  if (!cicilanModal) return;
                  setCicilanLoading(true); setCicilanError("");
                  try {
                    const r = await api.patch(`/api/v1/mandor/worker-kasbons/${cicilanModal.kasbonId}/cicilan`, { nominal: Number(cicilanNominal), catatan: cicilanCatatan || undefined });
                    if (r.data) { setCicilanModal(null); load(); }
                  } catch (err: any) {
                    setCicilanError(err?.response?.data?.error ?? "Gagal catat cicilan");
                  } finally { setCicilanLoading(false); }
                }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: cicilanLoading ? C.border : C.navy, color: cicilanLoading ? C.muted : "var(--surface)", fontSize: 13, fontWeight: 600, cursor: cicilanLoading ? "not-allowed" : "pointer" }}>
                {cicilanLoading ? "Menyimpan..." : "Simpan Cicilan"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Modal: Buat Laporan Upah ─────────────────────────────────────────────────
function CreateWageReportModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const currentUser = getStoredUser();
  const isMandor = currentUser?.role === "mandor";

  // Load assignments fresh di dalam modal
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  // Load kasbons fresh saat modal buka (bukan dari prop, agar selalu up-to-date)
  const [kasbons, setKasbons] = useState<WorkerKasbon[]>([]);

  useEffect(() => {
    setLoadingAssignments(true);
    Promise.all([
      api.get<{ assignments: Assignment[] }>("/api/v1/mandor/assignments"),
      api.get<{ kasbons: WorkerKasbon[] }>("/api/v1/mandor/worker-kasbons"),
    ]).then(([asgRes, kbRes]) => {
        setAssignments(asgRes.data.assignments);
        setKasbons(kbRes.data.kasbons ?? []);
        // Kalau mandor dan hanya punya 1 assignment, auto-select
        if (asgRes.data.assignments.length === 1) {
          setAssignmentId(asgRes.data.assignments[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAssignments(false));
  }, []);

  const [assignmentId, setAssignmentId] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Wage items
  const [items, setItems] = useState([{ worker_name: "", days_worked: "7", daily_rate: "125000", overtime_hours: "", overtime_rate: "15000" }]);
  // Deductions — support kolektif dan individu
  const [deductions, setDeductions] = useState<Array<{
    tipe: "kasbon_kolektif" | "kasbon_individu";
    label: string;
    amount: string;
    worker_kasbon_id: string;
    worker_name: string;
  }>>([]);

  const selectedAssignment = assignments.find(a => a.id === assignmentId);
  const availableScopes = selectedAssignment?.work_scopes ?? [];
  const projectKasbons = kasbons.filter(k =>
    selectedAssignment && k.project?.id === selectedAssignment.project?.id
  );

  function addItem() {
    setItems(prev => [...prev, { worker_name: "", days_worked: "7", daily_rate: "125000", overtime_hours: "", overtime_rate: "15000" }]);
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateItem(i: number, key: string, val: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: val } : item));
  }
  function addDeduction() {
    setDeductions(prev => [...prev, { tipe: "kasbon_kolektif", label: "Potong BON", amount: "", worker_kasbon_id: "", worker_name: "" }]);
  }
  function removeDeduction(i: number) {
    setDeductions(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateDeduction(i: number, key: string, val: string) {
    setDeductions(prev => prev.map((d, idx) => idx === i ? { ...d, [key]: val } : d));
  }

  // Auto-fill kasbon amount saat pilih worker_kasbon
  function onKasbonSelect(i: number, kasbonId: string) {
    const kb = projectKasbons.find(k => k.id === kasbonId);
    const remaining = kb ? kb.amount - kb.amount_settled : 0;
    setDeductions(prev => prev.map((d, idx) => idx === i
      ? { ...d, worker_kasbon_id: kasbonId, amount: remaining.toString(), label: kb ? `Potong BON - ${kb.worker?.name}` : d.label }
      : d
    ));
  }

  // Hitung totals
  const subtotal = items.reduce((s, item) => {
    const days = parseFloat(item.days_worked || "0");
    const rate = parseFloat(item.daily_rate || "0");
    const ot = parseFloat(item.overtime_hours || "0");
    const otRate = parseFloat(item.overtime_rate || "0");
    return s + (days * rate) + (ot * otRate);
  }, 0);
  const totalDed = deductions.reduce((s, d) => s + (parseFloat(d.amount || "0")), 0);
  const net = Math.max(subtotal - totalDed, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!assignmentId || !scopeId) { setError("Pilih mandor dan scope pekerjaan"); return; }
    if (items.some(i => !i.worker_name || !i.daily_rate)) { setError("Nama tukang dan tarif harian wajib diisi"); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/mandor/wage-reports", {
        assignment_id: assignmentId,
        scope_id: scopeId,
        week_start: weekStart,
        notes: notes || undefined,
        items: items.map(i => ({
          worker_name: i.worker_name,
          days_worked: parseFloat(i.days_worked || "0"),
          daily_rate: parseFloat(i.daily_rate || "0"),
          overtime_hours: parseFloat(i.overtime_hours || "0"),
          overtime_rate: parseFloat(i.overtime_rate || "0"),
        })),
        deductions: deductions.length > 0 ? deductions.map(d => ({
          tipe: d.tipe,
          label: d.label,
          amount: parseFloat(d.amount || "0"),
          worker_kasbon_id: d.worker_kasbon_id || undefined,
          worker_name: d.tipe === "kasbon_individu" ? (d.worker_name || undefined) : undefined,
        })) : undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal membuat laporan");
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 700, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Ajukan Laporan Upah</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: C.muted }}>Rincian upah tukang mingguan</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Mandor + scope + minggu */}
          {/* Mandor / Assignment — hide jika mandor hanya punya 1 (auto-selected) */}
          {!(isMandor && assignments.length === 1) && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
                Mandor / Proyek <span style={{ color: C.red }}>*</span>
              </label>
              {loadingAssignments ? (
                <div style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.muted }}>Memuat...</div>
              ) : assignments.length === 0 ? (
                <div style={{ padding: "10px 14px", background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 8, fontSize: 13, color: C.yellow }}>
                  Belum ada assignment mandor aktif. Assign mandor ke proyek terlebih dahulu di halaman detail proyek.
                </div>
              ) : (
                <select value={assignmentId} onChange={e => { setAssignmentId(e.target.value); setScopeId(""); }} style={inputStyle}>
                  <option value="">-- Pilih mandor & proyek --</option>
                  {assignments.map(a => (
                    <option key={a.id} value={a.id}>{a.mandor?.name} — {a.project?.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Info auto-selected jika mandor hanya 1 assignment */}
          {isMandor && assignments.length === 1 && assignmentId && (
            <div style={{ padding: "10px 14px", background: C.navyLight, borderRadius: 8, fontSize: 13, color: C.navy, fontWeight: 500 }}>
              Proyek: <strong>{assignments[0].project?.name}</strong>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Scope Pekerjaan <span style={{ color: C.red }}>*</span></label>
              {!assignmentId ? (
                <div style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.muted, background: "var(--surface-subtle)" }}>Pilih mandor/proyek dulu</div>
              ) : availableScopes.length === 0 ? (
                <div style={{ padding: "10px 14px", background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 8, fontSize: 13, color: C.yellow }}>
                  Belum ada scope — tambahkan di detail proyek.
                </div>
              ) : (
                <select value={scopeId} onChange={e => setScopeId(e.target.value)} style={inputStyle}>
                  <option value="">-- Pilih scope --</option>
                  {availableScopes.map(s => (
                    <option key={s.id} value={s.id}>{s.scope_name} ({PAYMENT_SYSTEM[s.payment_system]})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Minggu (Senin) <span style={{ color: C.red }}>*</span></label>
              <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Rincian tukang */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>Rincian Tukang <span style={{ color: C.red }}>*</span></label>
              <button type="button" onClick={addItem} style={{ fontSize: 12, color: C.navy, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                <Plus size={12} /> Tambah Tukang
              </button>
            </div>

            {/* Header kolom */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 4, padding: "0 4px" }}>
              {["Nama Tukang", "Hari Kerja", "Tarif/Hari", "Lembur (jam)", "Tarif Lembur", ""].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item, i) => {
                const subtotalItem = (parseFloat(item.days_worked || "0") * parseFloat(item.daily_rate || "0")) +
                  (parseFloat(item.overtime_hours || "0") * parseFloat(item.overtime_rate || "0"));
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 28px", gap: 6, alignItems: "center", padding: "8px", background: "#FAFAFA", borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <input placeholder="Nama tukang" value={item.worker_name} onChange={e => updateItem(i, "worker_name", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} />
                    <input type="number" placeholder="7" value={item.days_worked} onChange={e => updateItem(i, "days_worked", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} step="0.5" min="0" />
                    <input type="number" placeholder="125000" value={item.daily_rate} onChange={e => updateItem(i, "daily_rate", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} />
                    <input type="number" placeholder="0" value={item.overtime_hours} onChange={e => updateItem(i, "overtime_hours", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} step="0.5" min="0" />
                    <input type="number" placeholder="15000" value={item.overtime_rate} onChange={e => updateItem(i, "overtime_rate", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} />
                    <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} style={{ padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: items.length === 1 ? "not-allowed" : "pointer", color: C.red, opacity: items.length === 1 ? 0.3 : 1 }}>
                      <Trash2 size={13} />
                    </button>
                    {subtotalItem > 0 && (
                      <div style={{ gridColumn: "1/-1", fontSize: 11, color: C.mid, textAlign: "right", paddingRight: 4 }}>
                        Subtotal: <strong style={{ color: C.text }}>{fmt(subtotalItem)}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Potongan */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>Potongan</label>
              <button type="button" onClick={addDeduction} style={{ fontSize: 12, color: C.red, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                <Plus size={12} /> Tambah Potongan
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deductions.map((d, i) => (
                <div key={i} style={{ padding: "10px 12px", background: "#FFF5F5", borderRadius: 8, border: `1px solid ${C.redBorder}` }}>
                  {/* Toggle tipe */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {(["kasbon_kolektif", "kasbon_individu"] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => updateDeduction(i, "tipe", t)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: d.tipe === t ? 700 : 400, cursor: "pointer", border: `1px solid ${d.tipe === t ? C.red : C.border}`, background: d.tipe === t ? C.redBg : "var(--surface)", color: d.tipe === t ? C.red : C.mid }}>
                        {t === "kasbon_kolektif" ? "Kolektif" : "Per Individu"}
                      </button>
                    ))}
                    <button type="button" onClick={() => removeDeduction(i)} style={{ marginLeft: "auto", padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.red }}>
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {d.tipe === "kasbon_kolektif" ? (
                    /* Kolektif: label + nominal */
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6 }}>
                      <input placeholder="Keterangan (mis: Kasbon rabu)" value={d.label} onChange={e => updateDeduction(i, "label", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} />
                      <input type="number" placeholder="Nominal" value={d.amount} onChange={e => updateDeduction(i, "amount", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} />
                    </div>
                  ) : (
                    /* Per individu: nama pekerja + kasbon link + nominal */
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {/* Nama: search dari pekerja di baris items */}
                        <select value={d.worker_name} onChange={e => updateDeduction(i, "worker_name", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }}>
                          <option value="">-- Pilih pekerja --</option>
                          {items.filter(it => it.worker_name.trim()).map((it, idx) => (
                            <option key={idx} value={it.worker_name}>{it.worker_name}</option>
                          ))}
                        </select>
                        {/* Kasbon aktif (opsional) */}
                        <select value={d.worker_kasbon_id} onChange={e => onKasbonSelect(i, e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }}>
                          <option value="">-- Link kasbon (opsional) --</option>
                          {projectKasbons.filter(k => !k.is_settled).map(k => (
                            <option key={k.id} value={k.id}>{k.worker?.name} — sisa {fmt(k.amount - k.amount_settled)}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6 }}>
                        <input placeholder="Keterangan (mis: Cicilan kasbon Ade)" value={d.label} onChange={e => updateDeduction(i, "label", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} />
                        <input type="number" placeholder="Nominal" value={d.amount} onChange={e => updateDeduction(i, "amount", e.target.value)} style={{ ...inputStyle, background: "var(--surface)" }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Catatan</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Catatan tambahan..." />
          </div>

          {/* Summary total */}
          <div style={{ padding: "12px 16px", background: C.navyLight, borderRadius: 10, border: `1px solid ${C.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Subtotal Upah", value: subtotal, color: C.text },
                { label: "Total Potongan", value: totalDed, color: C.red },
                { label: "Yang Dibayar", value: net, color: C.navy },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 11, color: C.mid, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{fmt(s.value)}</div>
                </div>
              ))}
            </div>
          </div>

          {error && <div style={{ padding: "10px 14px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red, border: `1px solid ${C.redBorder}` }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Mengajukan..." : "Ajukan Laporan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Detail Laporan ────────────────────────────────────────────────────
interface CashAccountOption { id: string; name: string; type: string; balance: number; is_active?: boolean; }

function WageReportDetailModal({ data, onClose, onApprove }: {
  data: WageReportDetail;
  onClose: () => void;
  onApprove: (id: string, status: "approved" | "rejected" | "paid", notes?: string, cashAccountId?: string, paidAt?: string, paymentMethod?: string) => void;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const [reviewNotes, setReviewNotes] = useState("");
  const [approvePaymentMethod, setApprovePaymentMethod] = useState<"cash" | "transfer_bank">("cash");
  const [rejectNotes, setRejectNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);

  const r = data.report;
  const st = REPORT_STATUS[r?.status ?? "draft"] ?? REPORT_STATUS.draft;

  useEffect(() => {
    if (r?.status === "approved" || showPayForm) {
      api.get<{ accounts: CashAccountOption[] }>("/api/v1/cash/accounts")
        .then(res => {
          const active = res.data.accounts.filter(a => a.is_active !== false);
          setCashAccounts(active);
          const main = active.find(a => a.type === "main");
          if (main) setCashAccountId(main.id);
        }).catch(() => {});
    }
  }, [r?.status, showPayForm]);

  async function doApprove(status: "approved" | "rejected" | "paid") {
    if (status === "rejected" && !rejectNotes.trim()) return;
    setLoading(true);
    if (status === "paid") {
      await onApprove(r.id, status, reviewNotes || undefined, cashAccountId || undefined, paidAt);
    } else if (status === "approved") {
      await onApprove(r.id, status, reviewNotes || undefined, undefined, undefined, approvePaymentMethod);
    } else {
      await onApprove(r.id, status, rejectNotes);
    }
    setLoading(false);
    setShowApproveForm(false);
    setShowRejectForm(false);
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 640, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Detail Laporan Upah</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: C.muted }}>
              {r?.assignment?.mandor?.name} · {r?.scope?.scope_name} · Minggu {r && fmtDateShort(r.week_start)}–{r && fmtDateShort(r.week_end)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
            <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "70vh", overflowY: "auto" }}>
          {/* Rincian tukang */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Rincian Tukang</div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-subtle)" }}>
                    {["Nama", "Hari", "Tarif/Hari", "Lembur", "Subtotal"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, i) => (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? "var(--surface)" : "#FAFAFA" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: C.text, fontWeight: 600 }}>{item.worker_name}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: C.mid }}>{item.days_worked}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: C.mid }}>{fmt(item.daily_rate)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: C.mid }}>
                        {item.overtime_hours > 0 ? `${item.overtime_hours}j × ${fmt(item.overtime_rate)}` : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: C.text }}>{fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Potongan */}
          {data.deductions.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Potongan</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.deductions.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.redBg, borderRadius: 8, border: `1px solid ${C.redBorder}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.label}</div>
                      {d.worker_kasbon && <div style={{ fontSize: 11, color: C.muted }}>Kasbon {d.worker_kasbon.worker?.name} · {fmtDate(d.worker_kasbon.kasbon_date)}</div>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>−{fmt(d.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ringkasan total */}
          <div style={{ padding: "14px 16px", background: C.navyLight, borderRadius: 10, border: `1px solid #C7D9F0` }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.mid }}>
                <span>Subtotal upah</span><span>{fmt(r?.subtotal ?? 0)}</span>
              </div>
              {(r?.total_deduction ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.red }}>
                  <span>Total potongan</span><span>−{fmt(r?.total_deduction ?? 0)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: C.navy, paddingTop: 6, borderTop: `1px solid #C7D9F0`, marginTop: 4 }}>
                <span>Yang Dibayar</span><span>{fmt(r?.net_amount ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Review notes jika ada */}
          {r?.review_notes && (
            <div style={{ padding: "10px 14px", background: "var(--surface-subtle)", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text }}>
              <div style={{ fontWeight: 600, color: C.muted, fontSize: 11, marginBottom: 4 }}>Catatan Review:</div>
              {r.review_notes}
            </div>
          )}

          {/* Action: approve/reject (jika submitted) */}
          {r?.status === "submitted" && (
            <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              {!showApproveForm && !showRejectForm && (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowRejectForm(true)} disabled={loading} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <XCircle size={14} /> Tolak
                  </button>
                  <button onClick={() => setShowApproveForm(true)} disabled={loading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.green, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <Check size={14} /> Setujui
                  </button>
                </div>
              )}

              {/* Form approve */}
              {showApproveForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", background: C.greenBg, borderRadius: 10, border: `1px solid ${C.greenBorder}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Konfirmasi Persetujuan</div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Metode Pembayaran <span style={{ color: C.red }}>*</span></label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {([["cash", "Cash"], ["transfer_bank", "Transfer Bank"]] as const).map(([val, lbl]) => (
                        <button key={val} type="button" onClick={() => setApprovePaymentMethod(val)}
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `2px solid ${approvePaymentMethod === val ? C.green : C.border}`, background: approvePaymentMethod === val ? C.greenBg : "var(--surface)", color: approvePaymentMethod === val ? C.green : C.mid, fontSize: 13, fontWeight: approvePaymentMethod === val ? 700 : 400, cursor: "pointer" }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan (opsional)</label>
                    <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} placeholder="Catatan tambahan..." style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowApproveForm(false)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
                    <button onClick={() => doApprove("approved")} disabled={loading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.green, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Check size={14} /> {loading ? "Menyimpan..." : "Setujui"}
                    </button>
                  </div>
                </div>
              )}

              {/* Form reject */}
              {showRejectForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", background: C.redBg, borderRadius: 10, border: `1px solid ${C.redBorder}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.red }}>Tolak Laporan</div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Alasan Penolakan <span style={{ color: C.red }}>*</span></label>
                    <textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} rows={3} placeholder="Wajib diisi — jelaskan alasan penolakan..." style={{ width: "100%", padding: "8px 10px", border: `1px solid ${rejectNotes.trim() ? C.border : C.red}`, borderRadius: 8, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                    {!rejectNotes.trim() && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Alasan penolakan wajib diisi</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowRejectForm(false)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
                    <button onClick={() => doApprove("rejected")} disabled={loading || !rejectNotes.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.red, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: !rejectNotes.trim() ? 0.5 : 1 }}>
                      <XCircle size={14} /> {loading ? "Menyimpan..." : "Tolak Laporan"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action: mark as paid (jika approved) */}
          {r?.status === "approved" && (
            <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              {!showPayForm ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => setShowPayForm(true)} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <Banknote size={14} /> Tandai Sudah Dibayar
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", background: C.navyLight, borderRadius: 10, border: `1px solid #C7D9F0` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Konfirmasi Pembayaran Upah</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Tanggal Bayar</label>
                      <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Sumber Kas <span style={{ color: C.red }}>*</span></label>
                      <select value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                        <option value="">— Tidak dari kas —</option>
                        {cashAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (Rp {Number(a.balance).toLocaleString("id-ID")})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {cashAccountId && (() => {
                    const acc = cashAccounts.find(a => a.id === cashAccountId);
                    const net = r?.net_amount ?? 0;
                    if (!acc) return null;
                    const ok = acc.balance >= net;
                    return (
                      <div style={{ fontSize: 11, color: ok ? C.green : C.red, fontWeight: 600 }}>
                        {ok ? `✓ Saldo cukup — setelah bayar: Rp ${(acc.balance - net).toLocaleString("id-ID")}` : `⚠ Saldo tidak cukup (Rp ${acc.balance.toLocaleString("id-ID")} < Rp ${net.toLocaleString("id-ID")})`}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowPayForm(false)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
                    <button onClick={() => doApprove("paid")} disabled={loading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Banknote size={14} /> {loading ? "Menyimpan..." : "Konfirmasi Bayar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah / Edit Pekerja ────────────────────────────────────────────
function WorkerFormModal({ mandorId: initialMandorId, mandorName: initialMandorName, worker, onClose, onSuccess }: {
  mandorId?: string;
  mandorName?: string;
  worker?: Worker;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const currentUser = getStoredUser();
  const isMandor = currentUser?.role === "mandor";
  const isEdit = !!worker;

  const [mandorOptions, setMandorOptions] = useState<{ id: string; name: string }[]>(
    initialMandorId ? [{ id: initialMandorId, name: initialMandorName ?? "" }] : []
  );
  useEffect(() => {
    if (!initialMandorId && !isMandor) {
      api.get<{ mandors: { id: string; name: string; phone: string | null; email: string }[] }>("/api/v1/mandor/list")
        .then(r => setMandorOptions(r.data.mandors ?? []))
        .catch(() => {});
    }
  }, [initialMandorId, isMandor]);

  const [mandorId, setMandorId] = useState(
    isMandor ? (currentUser?.id ?? "") : (initialMandorId || worker?.mandor?.id || "")
  );
  const [name, setName] = useState(worker?.name ?? "");
  const [tipe, setTipe] = useState<string>(worker?.tipe ?? "");
  const [phone, setPhone] = useState(worker?.phone ?? "");
  const [skills, setSkills] = useState<string[]>(worker?.skills ?? []);
  const [isActive, setIsActive] = useState(worker?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleSkill(val: string) {
    setSkills(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!name.trim()) { setError("Nama pekerja wajib diisi"); return; }
    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/api/v1/mandor/workers/${worker!.id}`, {
          name: name.trim(),
          tipe: tipe || null,
          phone: phone || null,
          skills,
          is_active: isActive,
        });
      } else {
        await api.post("/api/v1/mandor/workers", {
          name: name.trim(),
          tipe: tipe || undefined,
          phone: phone || undefined,
          skills,
          mandor_id: isMandor ? undefined : (mandorId || undefined),
        });
      }
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? (isEdit ? "Gagal update pekerja" : "Gagal tambah pekerja"));
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 460, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
              {isEdit ? "Edit Pekerja" : "Tambah Pekerja"}
            </h2>
            {(initialMandorName || worker?.mandor?.name) && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Mandor: <strong>{initialMandorName || worker?.mandor?.name}</strong>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Mandor selector — hanya jika dibuka dari header (bukan dari grup) dan bukan mandor */}
          {!isMandor && !initialMandorId && !isEdit && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Mandor <span style={{ color: C.red }}>*</span></label>
              <select value={mandorId} onChange={e => setMandorId(e.target.value)} style={inputStyle}>
                <option value="">-- Pilih mandor --</option>
                {mandorOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Nama <span style={{ color: C.red }}>*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama pekerja" style={inputStyle} autoFocus />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tipe (opsional)</label>
            <select value={tipe} onChange={e => setTipe(e.target.value)} style={inputStyle}>
              <option value="">-- Tidak ditentukan --</option>
              <option value="tukang">Tukang</option>
              <option value="laden">Laden</option>
              <option value="kenek">Kenek</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>No. HP (opsional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx, tanpa tanda hubung" style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 8 }}>Keahlian (opsional)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SKILL_OPTIONS.map(s => {
                const selected = skills.includes(s.value);
                return (
                  <button key={s.value} type="button" onClick={() => toggleSkill(s.value)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                      border: `1px solid ${selected ? C.navy : C.border}`,
                      background: selected ? C.navyLight : "var(--surface)",
                      color: selected ? C.navy : C.mid,
                      fontWeight: selected ? 600 : 400,
                    }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isEdit && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 8 }}>Status</label>
              <div style={{ display: "flex", gap: 8 }}>
                {([true, false] as const).map(val => (
                  <button key={String(val)} type="button" onClick={() => setIsActive(val)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                      border: `2px solid ${isActive === val ? (val ? C.green : C.red) : C.border}`,
                      background: isActive === val ? (val ? C.greenBg : C.redBg) : "var(--surface)",
                      color: isActive === val ? (val ? C.green : C.red) : C.mid,
                      fontWeight: isActive === val ? 700 : 400,
                    }}>
                    {val ? "Aktif" : "Nonaktif"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Catat Kasbon Tukang ───────────────────────────────────────────────
function AddKasbonModal({ assignments, onClose, onSuccess }: {
  assignments: Assignment[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const [assignmentId, setAssignmentId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("gaji_tukang");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const selectedAssignment = assignments.find(a => a.id === assignmentId);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Foto maksimal 5MB"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Format foto harus JPEG, PNG, atau WebP"); return; }
    setError("");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  // Load workers saat assignment dipilih
  useEffect(() => {
    if (!assignmentId) return;
    const asgn = assignments.find(a => a.id === assignmentId);
    if (!asgn?.mandor?.id) return;
    setWorkers([]);
    setWorkerId("");
    api.get<{ workers: Worker[] }>(`/api/v1/mandor/workers?mandor_id=${asgn.mandor.id}`)
      .then(r => setWorkers(r.data.workers))
      .catch(() => {});
  }, [assignmentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!assignmentId || !workerId || !amount) { setError("Pilih mandor, tukang, dan isi nominal"); return; }
    setLoading(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_KEY!
        );
        const ext = photoFile.name.split(".").pop();
        const path = `worker-kasbons/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("kasbon-photos").upload(path, photoFile, { upsert: true });
        if (upErr) throw new Error("Gagal upload foto: " + upErr.message);
        const { data: { publicUrl } } = sb.storage.from("kasbon-photos").getPublicUrl(path);
        photoUrl = publicUrl;
      }
      await api.post("/api/v1/mandor/worker-kasbons", {
        worker_id: workerId,
        project_id: selectedAssignment?.project?.id,
        amount: parseFloat(amount),
        purpose,
        kasbon_date: date,
        notes: notes || undefined,
        mandor_id: selectedAssignment?.mandor?.id,
        photo_url: photoUrl,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? (err as any)?.message ?? "Gagal catat kasbon");
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: 480, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Catat Kasbon Tukang</h2>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Mandor / Proyek <span style={{ color: C.red }}>*</span></label>
            <select value={assignmentId} onChange={e => setAssignmentId(e.target.value)} style={inputStyle}>
              <option value="">-- Pilih mandor --</option>
              {assignments.map(a => <option key={a.id} value={a.id}>{a.mandor?.name} — {a.project?.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tukang <span style={{ color: C.red }}>*</span></label>
            <select value={workerId} onChange={e => setWorkerId(e.target.value)} style={inputStyle} disabled={!assignmentId}>
              <option value="">-- Pilih tukang --</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tanggal</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tujuan</label>
            <select value={purpose} onChange={e => setPurpose(e.target.value)} style={inputStyle}>
              <option value="gaji_tukang">Gaji Tukang</option>
              <option value="uang_makan">Uang Makan</option>
              <option value="lain_lain">Lain-lain</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Catatan</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Catatan kasbon..." style={{ ...inputStyle, resize: "none" }} />
          </div>
          {/* D2 — Foto nota */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              <Camera size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />Foto Nota (opsional)
            </label>
            {photoPreview ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={photoPreview} alt="preview" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", color: "var(--surface)", width: 24, height: 24, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: `2px dashed ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: C.muted, background: "#FAFAFA" }}>
                <Camera size={16} color={C.muted} /> Klik untuk pilih foto (maks 5MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} style={{ display: "none" }} />
              </label>
            )}
          </div>
          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Menyimpan..." : "Catat Kasbon"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Ajukan Kasbon Mandor (mandor mengajukan ke admin) ─────────────────

function SubmitMandorKasbonModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [scopes, setScopes] = useState<MandorScope[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [amount, setAmount] = useState("");
  const [fundSource, setFundSource] = useState("owner_advance");
  const [purpose, setPurpose] = useState("operasional");
  const [kasbonDate, setKasbonDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Foto maksimal 5MB"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Format foto harus JPEG, PNG, atau WebP"); return; }
    setError("");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  useEffect(() => {
    api.get<{ scopes: MandorScope[] }>("/api/v1/mandor/scopes")
      .then(r => {
        const scopeList = r.data.scopes ?? [];
        setScopes(scopeList);
        // Build unique project list
        const pm = new Map<string, { id: string; name: string }>();
        for (const s of scopeList) {
          const p = s.assignment?.project;
          if (p?.id && !pm.has(p.id)) pm.set(p.id, { id: p.id, name: p.name });
        }
        setProjects(Array.from(pm.values()));
      })
      .catch(() => {});
  }, []);

  // Scopes filtered by selected project
  const filteredScopes = projectId
    ? scopes.filter(s => s.assignment?.project?.id === projectId)
    : scopes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!projectId) { setError("Pilih proyek terlebih dahulu"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError("Nominal harus lebih dari 0"); return; }
    if (!notes.trim()) { setError("Keterangan / alasan kasbon wajib diisi"); return; }

    setLoading(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_KEY!
        );
        const ext = photoFile.name.split(".").pop();
        const path = `mandor-kasbons/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("kasbon-photos").upload(path, photoFile, { upsert: true });
        if (upErr) throw new Error("Gagal upload foto: " + upErr.message);
        const { data: { publicUrl } } = sb.storage.from("kasbon-photos").getPublicUrl(path);
        photoUrl = publicUrl;
      }
      await api.post("/api/v1/kasbons", {
        project_id: projectId,
        work_scope_id: scopeId || undefined,
        amount: amt,
        fund_source: fundSource,
        purpose,
        kasbon_date: kasbonDate,
        notes: notes.trim(),
        photo_url: photoUrl,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? (err as any)?.message ?? "Gagal mengajukan kasbon");
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)",
  };

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #D97706, #FBBF24)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={17} color="var(--surface)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Ajukan Kasbon</h2>
              <p style={{ margin: 0, fontSize: 11, color: C.muted }}>Pengajuan akan dikirim ke admin/PM untuk disetujui</p>
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>

          {/* Info banner */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 12, color: C.yellow, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <Clock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Kasbon akan berstatus <strong>Menunggu Persetujuan</strong> sampai admin atau PM menyetujuinya.</span>
          </div>

          {/* Proyek — required */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              Proyek <span style={{ color: C.red }}>*</span>
            </label>
            {projects.length === 0 ? (
              <div style={{ ...inputStyle, color: C.muted }}>Memuat...</div>
            ) : (
              <select value={projectId} onChange={e => { setProjectId(e.target.value); setScopeId(""); }} style={inputStyle} required>
                <option value="">-- Pilih proyek --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Scope Pekerjaan — opsional */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 4 }}>
              Scope Pekerjaan
              <span style={{ fontSize: 11, fontWeight: 400, color: C.muted, marginLeft: 6 }}>(opsional)</span>
            </label>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
              Kosongkan jika kasbon bersifat umum dan tidak terikat scope tertentu.
            </div>
            <select
              value={scopeId}
              onChange={e => setScopeId(e.target.value)}
              disabled={!projectId}
              style={{ ...inputStyle, opacity: projectId ? 1 : 0.6, background: projectId ? "var(--surface)" : "var(--surface-subtle)" }}
            >
              <option value="">— Kasbon umum (tidak terikat scope) —</option>
              {filteredScopes.map(s => (
                <option key={s.id} value={s.id}>{s.scope_name}</option>
              ))}
            </select>
          </div>

          {/* Nominal + Tanggal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} required
                  style={{ ...inputStyle, paddingLeft: 30 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tanggal</label>
              <input type="date" value={kasbonDate} onChange={e => setKasbonDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Keperluan — full width, sumber dana ditentukan admin/PM saat approve */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Keperluan <span style={{ color: C.red }}>*</span></label>
            <select value={purpose} onChange={e => setPurpose(e.target.value)} style={inputStyle}>
              <option value="gaji_tukang">Gaji Tukang</option>
              <option value="uang_makan">Uang Makan</option>
              <option value="pembelian_alat">Pembelian Alat</option>
              <option value="operasional">Operasional</option>
              <option value="lain_lain">Lain-lain</option>
            </select>
          </div>

          {/* Keterangan — wajib untuk mandor */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              Keterangan / Alasan <span style={{ color: C.red }}>*</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} required
              placeholder="Jelaskan keperluan kasbon ini secara detail, misal: untuk beli semen 50 sak dan besi 10mm..."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Keterangan yang jelas mempercepat persetujuan dari admin/PM.
            </div>
          </div>

          {/* D2 — Foto nota */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              <Camera size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />Foto Nota (opsional)
            </label>
            {photoPreview ? (
              <div style={{ position: "relative" }}>
                <img src={photoPreview} alt="preview" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", color: "var(--surface)", width: 24, height: 24, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: `2px dashed ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: C.muted, background: "#FAFAFA" }}>
                <Camera size={16} color={C.muted} /> Klik untuk pilih foto (maks 5MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} style={{ display: "none" }} />
              </label>
            )}
          </div>

          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading || !projectId} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: (loading || !projectId) ? "#94A3B8" : C.yellow, color: "var(--surface)", cursor: (loading || !projectId) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Mengajukan..." : "Ajukan Kasbon"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Assign Mandor ke Proyek ──────────────────────────────────────────
function AddAssignmentModal({ mandors, onClose, onSuccess }: {
  mandors: MandorUser[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [mandorId, setMandorId] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedAt, setAssignedAt] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ projects: { id: string; name: string }[] }>("/api/v1/projects")
      .then(r => setProjects(r.data.projects)).catch(() => {});
  }, []);

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !mandorId) { setError("Proyek dan mandor wajib dipilih"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/api/v1/mandor/assignments", { project_id: projectId, mandor_id: mandorId, notes: notes || undefined, assigned_at: assignedAt });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Assign Mandor ke Proyek</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>Satu mandor bisa memiliki beberapa scope pekerjaan</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Proyek</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inputStyle} required>
              <option value="">-- Pilih proyek --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Mandor</label>
            <select value={mandorId} onChange={e => setMandorId(e.target.value)} style={inputStyle} required>
              <option value="">-- Pilih mandor --</option>
              {mandors.map(m => <option key={m.id} value={m.id}>{m.name}{m.phone ? ` (${m.phone})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal Mulai Tugas</label>
            <input type="date" value={assignedAt} onChange={e => setAssignedAt(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan (opsional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Deskripsi tugas, area kerja, dll" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Assign Mandor"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah Work Scope ──────────────────────────────────────────────────
function AddScopeModal({ assignmentId, onClose, onSuccess }: {
  assignmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [scopeName, setScopeName] = useState("");
  const [description, setDescription] = useState("");
  const [paymentSystem, setPaymentSystem] = useState<"harian" | "borongan" | "progress_pct">("borongan");
  const [boronganValue, setBoronganValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scopeName) { setError("Nama scope wajib diisi"); return; }
    if (paymentSystem !== "harian" && !boronganValue) { setError("Nilai kontrak wajib diisi untuk sistem borongan/progress"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/api/v1/mandor/work-scopes", {
        assignment_id: assignmentId,
        scope_name: scopeName,
        description: description || undefined,
        payment_system: paymentSystem,
        borongan_value: boronganValue ? Number(boronganValue.replace(/\D/g, "")) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Tambah Scope Pekerjaan</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>Rincian item pekerjaan bisa ditambahkan setelah scope dibuat</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nama Scope Pekerjaan</label>
            <input value={scopeName} onChange={e => setScopeName(e.target.value)} placeholder="cth: Pekerjaan Struktur Lantai 1, Rangka Baja Atap" style={inputStyle} required />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Deskripsi (opsional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Detail lingkup pekerjaan..." style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Sistem Pembayaran</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {(["borongan", "harian", "progress_pct"] as const).map(ps => (
                <button key={ps} type="button" onClick={() => setPaymentSystem(ps)}
                  style={{ padding: "10px 8px", borderRadius: 8, border: `2px solid ${paymentSystem === ps ? C.navy : C.border}`, background: paymentSystem === ps ? C.navyLight : "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: paymentSystem === ps ? 700 : 400, color: paymentSystem === ps ? C.navy : C.mid, textAlign: "center" }}>
                  {PAYMENT_SYSTEM[ps]}
                  <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, color: C.muted }}>
                    {ps === "borongan" ? "Bayar selesai" : ps === "harian" ? "Bayar per minggu" : "Bayar per %"}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {paymentSystem !== "harian" && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nilai Kontrak (Rp)</label>
              <input
                value={boronganValue}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setBoronganValue(raw ? Number(raw).toLocaleString("id-ID") : "");
                }}
                placeholder="0" style={inputStyle} required />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal Mulai</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Target Selesai</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Simpan Scope"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Detail Scope + Rincian Items ─────────────────────────────────────
function ScopeDetailModal({ data, loading: isLoading, onClose, onRefresh, onAddItem }: {
  data: ScopeDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onAddItem: () => void;
}) {
  const mounted = useMounted();
  const { symbolOf } = useUnits(); // resolver satuan dari master `units` (fallback legacy)
  const { labelOf } = useWorkCategories(); // resolver kategori dari master `work_categories`
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  if (!mounted) return null;

  const scope = data?.scope;
  const items = data?.items ?? [];
  const totalSubtotal = items.reduce((s, i) => s + Number(i.subtotal), 0);
  const totalDone = items.reduce((s, i) => s + Number(i.volume_done) * Number(i.unit_price), 0);
  const overallPct = totalSubtotal > 0 ? (totalDone / totalSubtotal) * 100 : 0;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      {/* Slide-over panel */}
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 480, background: "var(--surface)", boxShadow: "-4px 0 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isLoading ? (
              <div style={{ color: C.muted, fontSize: 13 }}>Memuat...</div>
            ) : scope ? (
              <>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{scope.scope_name}</h2>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {(() => { const b = getPaymentSystemBadge(scope.payment_system); return (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 600 }}>{b.label}</span>
                  ); })()}
                  {scope.borongan_value && <span style={{ fontSize: 11, color: C.mid }}>Nilai: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(scope.borongan_value)}</span>}
                  {scope.start_date && <span style={{ fontSize: 11, color: C.muted }}>{new Date(scope.start_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} {scope.end_date ? `– ${new Date(scope.end_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>}
                </div>
              </>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
            <button onClick={onRefresh} style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 12, color: C.mid, display: "flex", alignItems: "center", gap: 4 }}>
              <RefreshCw size={12} /> Refresh
            </button>
            <button onClick={onAddItem} style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={12} /> Tambah Item
            </button>
            <button onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
          </div>
        </div>

        {!isLoading && items.length > 0 && (
          <div style={{ padding: "12px 24px", background: "var(--bg)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Progress Keseluruhan</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: getProgressColor(overallPct) }}>{overallPct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, background: getProgressColor(overallPct), width: `${overallPct}%` }} />
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalSubtotal)}</div>
              <div style={{ fontSize: 11, color: C.muted }}>total nilai {items.length} item</div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Memuat rincian...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
              <FileText size={28} color={C.border} style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Belum ada rincian item</div>
              <div style={{ fontSize: 12 }}>Klik "Tambah Item" untuk menambah rincian pekerjaan</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(
                items.reduce((acc, item) => {
                  if (!acc[item.category]) acc[item.category] = [];
                  acc[item.category].push(item);
                  return acc;
                }, {} as Record<string, ScopeItem[]>)
              ).map(([cat, catItems]) => {
                const catColor = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.lain_lain;
                const catTotal = catItems.reduce((s, i) => s + Number(i.subtotal), 0);
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10, background: catColor.bg, color: catColor.color }}>
                        {labelOf(cat)}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>{catItems.length} item · {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(catTotal)}</span>
                    </div>
                    {catItems.map(item => {
                      const pct = Number(item.pct_done);
                      const pctColor = getProgressColor(pct);
                      return (
                        <div key={item.id} style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#FAFAFA", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{item.item_name}</div>
                              {item.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{item.description}</div>}
                              {item.specs && item.specs.length > 0 && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                                  {item.specs.map(sp => (
                                    <span key={sp.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#F0F4FF", color: C.navy, border: "1px solid #C7D7F5" }}>
                                      {sp.spec_key}: <strong>{sp.spec_value}</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ fontSize: 12, color: C.mid }}>
                                {item.volume.toLocaleString("id-ID")} {symbolOf(item.unit)} × {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.unit_price)}/{symbolOf(item.unit)}
                              </div>
                              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 3, background: pctColor, width: `${pct}%` }} />
                                </div>
                                <span style={{ fontSize: 11, color: pctColor, fontWeight: 600, flexShrink: 0 }}>
                                  {Number(item.volume_done).toLocaleString("id-ID")}/{Number(item.volume).toLocaleString("id-ID")} {symbolOf(item.unit)} ({pct.toFixed(0)}%)
                                </span>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.subtotal)}</div>
                              {item.notes && <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: 2 }}>{item.notes}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah Item Rincian Pekerjaan ─────────────────────────────────────
function AddScopeItemModal({ scopeId, onClose, onSuccess }: {
  scopeId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mounted = useMounted();
  const { grouped, symbolOf } = useUnits(); // dropdown satuan dari master `units`; mandor simpan code
  const { categories: workCategories } = useWorkCategories(); // dropdown kategori dari master `work_categories`
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("lain_lain");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("m2");
  const [volume, setVolume] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [volumeDone, setVolumeDone] = useState("0");
  const [notes, setNotes] = useState("");
  const [specs, setSpecs] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" };
  const estSubtotal = (Number(volume) || 0) * (Number(String(unitPrice).replace(/\D/g, "")) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const vol = Number(volume);
    const price = Number(String(unitPrice).replace(/\D/g, ""));
    if (!itemName || !vol || !price) { setError("Nama item, volume, dan harga satuan wajib diisi"); return; }
    setLoading(true); setError("");
    try {
      await api.post(`/api/v1/mandor/work-scopes/${scopeId}/items`, {
        item_name: itemName,
        category,
        description: description || undefined,
        unit,
        volume: vol,
        unit_price: price,
        volume_done: Number(volumeDone) || 0,
        notes: notes || undefined,
        specs: specs.filter(s => s.key && s.value).map((s, i) => ({ spec_key: s.key, spec_value: s.value, sort_order: i })),
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setLoading(false); }
  }

  // Satuan dari master `units` (sumber tunggal). Fallback statis dipertahankan agar
  // dropdown tetap terisi bila master belum termuat / fetch gagal (nilai = code).
  const FALLBACK_UNITS_GROUPED: { group: string; opts: [string, string][] }[] = [
    { group: "Area", opts: [["m2", "m²"]] },
    { group: "Volume", opts: [["m3", "m³"]] },
    { group: "Panjang", opts: [["m", "m"], ["m_linear", "m'"]] },
    { group: "Berat", opts: [["kg", "kg"], ["ton", "ton"]] },
    { group: "Unit/Buah", opts: [["unit", "unit"], ["buah", "buah"], ["titik", "titik"], ["batang", "batang"], ["lembar", "lembar"]] },
    { group: "Set/Lot", opts: [["set", "set"], ["ls", "ls"]] },
    { group: "Waktu", opts: [["hari", "hari"], ["minggu", "minggu"]] },
  ];
  const UNITS_GROUPED: { group: string; opts: [string, string][] }[] = grouped.length > 0
    ? grouped.map(g => ({ group: g.label, opts: g.items.map(u => [u.code, u.symbol] as [string, string]) }))
    : FALLBACK_UNITS_GROUPED;

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", maxHeight: "92vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Tambah Item Pekerjaan</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>Rincian pekerjaan: sipil, baja WF, MEP, finishing</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nama Item Pekerjaan</label>
            <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="cth: Kolom Baja WF 200x100, Pasang Keramik 60x60, Cor Pondasi" style={inputStyle} required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                {(workCategories.length > 0
                  ? workCategories.map(c => [c.code, c.label] as [string, string])
                  : Object.entries(CATEGORY_LABELS)
                ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Satuan</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} style={inputStyle}>
                {UNITS_GROUPED.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Volume ({symbolOf(unit)})</label>
              <input value={volume} onChange={e => setVolume(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Harga/satuan (Rp)</label>
              <input value={unitPrice} onChange={e => { const r = e.target.value.replace(/\D/g, ""); setUnitPrice(r ? Number(r).toLocaleString("id-ID") : ""); }} placeholder="0" style={inputStyle} required />
            </div>
          </div>
          {estSubtotal > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.navyLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.navy }}>Estimasi subtotal</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(estSubtotal)}</span>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Volume Sudah Dikerjakan ({symbolOf(unit)}) — opsional</label>
            <input value={volumeDone} onChange={e => setVolumeDone(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Deskripsi (opsional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Spesifikasi teknis umum, dll" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Spesifikasi Teknis (opsional)</label>
              <button type="button" onClick={() => setSpecs([...specs, { key: "", value: "" }])}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", color: C.navy }}>
                + Tambah Spec
              </button>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Contoh: Profil → WF 200x100x5.5x8, Grade → BJ41, Diameter → 4 inch</div>
            {specs.map((sp, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 6 }}>
                <input value={sp.key} onChange={e => { const s = [...specs]; s[i].key = e.target.value; setSpecs(s); }} placeholder="Nama spec" style={{ ...inputStyle, fontSize: 12 }} />
                <input value={sp.value} onChange={e => { const s = [...specs]; s[i].value = e.target.value; setSpecs(s); }} placeholder="Nilai" style={{ ...inputStyle, fontSize: 12 }} />
                <button type="button" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, cursor: "pointer", color: C.red }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan (opsional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan tambahan..." style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Simpan Item"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Settlement Borongan ───────────────────────────────────────────────
function SettlementBoronganModal({ data, cashAccounts, onClose, onSuccess }: {
  data: SettlementModalState;
  cashAccounts: CashAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [boronganValue, setBoronganValue] = useState(String(data.boronganValue || ""));
  const [totalKasbon, setTotalKasbon] = useState(String(data.totalKasbon || ""));
  const [totalOtherExpense, setTotalOtherExpense] = useState("0");
  const [cashAccountId, setCashAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bv = Number(boronganValue) || 0;
  const tk = Number(totalKasbon) || 0;
  const toe = Number(totalOtherExpense) || 0;
  const netPayment = Math.max(0, bv - tk - toe);
  const fmtLocal = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cashAccountId) { setError("Pilih akun kas terlebih dahulu"); return; }
    if (bv <= 0) { setError("Nilai kontrak harus diisi"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/api/v1/mandor/borongan-settlements", {
        work_scope_id: data.scopeId,
        borongan_value: bv,
        total_kasbon: tk,
        total_other_expense: toe,
        net_payment: netPayment,
        cash_account_id: cashAccountId,
        notes: notes || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Gagal mencairkan settlement");
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" };

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 16px 48px rgba(0,0,0,0.2)", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Cairkan Settlement Borongan</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{data.scopeName} · {data.mandorName} · {data.projectName}</p>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Nilai Kontrak Borongan (Rp) *</label>
            <input type="number" min={1} value={boronganValue} onChange={e => setBoronganValue(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Total Kasbon Mandor (Rp)</label>
            <input type="number" min={0} value={totalKasbon} onChange={e => setTotalKasbon(e.target.value)} placeholder="0" style={inputStyle} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Kasbon yang sudah diajukan mandor untuk scope ini</div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Pengeluaran Lain (Rp)</label>
            <input type="number" min={0} value={totalOtherExpense} onChange={e => setTotalOtherExpense(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div style={{ background: "var(--navy-light)", borderRadius: 10, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Nilai Kontrak</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>{fmtLocal(bv)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Potongan</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)" }}>- {fmtLocal(tk + toe)}</div>
            </div>
            <div style={{ gridColumn: "span 2", borderTop: "1px solid #E5E7EB", paddingTop: 10 }}>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Net Pembayaran</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: netPayment > 0 ? "var(--success)" : "var(--text-secondary)" }}>{fmtLocal(netPayment)}</div>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Akun Kas *</label>
            <select value={cashAccountId} onChange={e => setCashAccountId(e.target.value)} style={inputStyle}>
              <option value="">Pilih akun kas...</option>
              {cashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} -- {fmtLocal(a.balance)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Catatan</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opsional" style={{ ...inputStyle, resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--surface)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: loading ? "var(--text-secondary)" : "var(--success)", color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Memproses..." : `Cairkan ${fmtLocal(netPayment)}`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Konfirmasi Progress Payment ──────────────────────────────────────
function PPConfirmModal({ payment, cashAccounts, loading, onClose, onAction }: {
  payment: ProgressPayment;
  cashAccounts: CashAccount[];
  loading: boolean;
  onClose: () => void;
  onAction: (action: "approved" | "rejected", cashAccountId?: string, notes?: string) => Promise<void>;
}) {
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [cashAccountId, setCashAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const fmtLocal = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" };

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Tinjau Penagihan Progress</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{payment.work_scope?.scope_name ?? "---"} - {payment.project?.name ?? "---"}</p>
        </div>
        <div style={{ padding: "16px 24px", background: "var(--bg)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, borderBottom: "1px solid #E5E7EB" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Diajukan oleh</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{payment.requester?.name ?? "---"}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Progress Klaim</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{payment.pct_done}%</div>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Jumlah Tagihan</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{fmtLocal(payment.gross_payment)}</div>
          </div>
          {payment.notes && (
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Catatan Mandor</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>{payment.notes}</div>
            </div>
          )}
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setMode("approve")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${mode === "approve" ? "var(--success)" : "var(--border)"}`, background: mode === "approve" ? "var(--success-bg)" : "var(--surface)", color: mode === "approve" ? "var(--success)" : "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Setujui
            </button>
            <button onClick={() => setMode("reject")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${mode === "reject" ? "var(--danger)" : "var(--border)"}`, background: mode === "reject" ? "var(--danger-bg)" : "var(--surface)", color: mode === "reject" ? "var(--danger)" : "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Tolak
            </button>
          </div>
          {mode === "approve" && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Akun Kas *</label>
              <select value={cashAccountId} onChange={e => setCashAccountId(e.target.value)} style={inputStyle}>
                <option value="">Pilih akun kas...</option>
                {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.name} -- {fmtLocal(a.balance)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>
              {mode === "reject" ? "Alasan Penolakan *" : "Catatan (opsional)"}
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder={mode === "reject" ? "Jelaskan alasan penolakan..." : "Opsional"}
              style={{ ...inputStyle, resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--surface)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>Batal</button>
            <button
              onClick={() => {
                if (mode === "approve" && !cashAccountId) { alert("Pilih akun kas"); return; }
                if (mode === "reject" && !notes.trim()) { alert("Isi alasan penolakan"); return; }
                onAction(mode === "approve" ? "approved" : "rejected", cashAccountId || undefined, notes || undefined);
              }}
              disabled={loading}
              style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: loading ? "var(--text-secondary)" : mode === "approve" ? "var(--success)" : "var(--danger)", color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Memproses..." : mode === "approve" ? "Setujui & Bayar" : "Tolak Tagihan"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function MandorPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>Memuat...</div>}>
      <MandorPageInner />
    </Suspense>
  );
}

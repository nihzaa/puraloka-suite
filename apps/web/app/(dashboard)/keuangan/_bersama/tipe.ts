/**
 * TIPE & HELPER BERSAMA — modul Keuangan.
 *
 * Diekstrak saat modul dipecah dari satu berkas 3.449 baris jadi enam rute.
 * Kalau tipe-tipe ini disalin ke tiap halaman, mereka akan menyimpang: satu
 * halaman menambah kolom, halaman lain tidak, dan galatnya baru muncul saat
 * data dari API tak cocok dengan apa yang dirender.
 *
 * Awalan garis-bawah pada nama folder membuat Next.js MENGABAIKANNYA
 * sebagai rute — /keuangan/_bersama tak akan pernah jadi halaman.
 */

import { C } from "@/lib/warna-ui";
export interface Summary {
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

export interface Invoice {
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

export interface Payment {
  id: string; amount_paid: number; payment_method: string;
  paid_at: string; ref_number: string | null; bank_name: string | null;
  notes: string | null; proof_url: string | null;
  invoices?: { id: string; invoice_number: string; invoice_type: string; total_amount: number; projects: { id: string; name: string } | null } | null;
  recorder?: { id: string; name: string } | null;
  cash_account?: { id: string; name: string; type: string } | null;
}

export interface CashAccount {
  id: string; name: string; type: "main" | "collector" | "petty_cash"; balance: number;
}

export interface Kasbon {
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

export interface WorkerKasbon {
  id: string; amount: number; purpose: string; kasbon_date: string;
  notes: string | null; amount_settled: number; is_settled: boolean; created_at: string;
  worker: { id: string; name: string; phone: string | null } | null;
  mandor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  scope: { id: string; scope_name: string } | null;
}

export interface CashflowPoint { label: string; masuk: number; keluar: number; net: number; keluarKasbon: number; keluarExpense: number; keluarUpah: number; }

export interface Project { id: string; name: string; contract_model: string; contract_value: number; commission_pct: number | null; retention_pct: number; tax_scheme: string }

export interface TerminSchedule { id: string; termin_number: number; label: string; amount: number; pct_of_contract: number; status: string; target_date: string | null; trigger_type?: string | null }

export interface ProjectDetail extends Project {
  termin_schedules: TerminSchedule[];
  clients: { id: string; contact_person: string } | null;
  pm: { id: string; name: string } | null;
}

export interface MandorScope {
  id: string; scope_name: string; payment_system: string;
  assignment: { id: string; project: { id: string; name: string } | null; mandor: { id: string; name: string } | null } | null;
}

export interface KasbonMandorSummary {
  mandorId: string; mandorName: string; projectCount: number;
  total: number; totalApproved: number; totalPending: number; totalSettled: number;
  byPurpose: Record<string, number>;
  byProject: { name: string; total: number }[];
  kasbonCount: number;
}

export interface KasbonSummaryData {
  summary: KasbonMandorSummary[];
  grandByPurpose: Record<string, number>;
  totalKasbons: number;
}

export interface CashflowTransaction {
  id: string; type: string; direction: "in" | "out";
  date: string; amount: number; label: string;
  project: { id: string; name: string } | null;
  category: { id: string; name: string; parent_name: string | null } | null;
  sub_label: string;
  meta: Record<string, unknown>;
}
export interface ArusKasData {
  totalIn: number; totalOut: number; netFlow: number;
  byType: { payment: number; expense: number; wage: number; kasbon: number; progress_payment?: number; settlement_borongan?: number };
  transactions: CashflowTransaction[];
}
export interface ArusKasChartPoint { period: string; label: string; masuk: number; keluar: number; net: number; }
export interface ExpenseCategory { id: string; name: string; parent_id: string | null; parent?: { id: string; name: string } | null; }

//  dihapus 2026-08-05: tab diganti rute nyata, jadi "bagian mana
// yang aktif" ditentukan URL, bukan state. Menyisakannya berarti dua sumber
// kebenaran untuk hal yang sama.

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return fmt(n);
};

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);


export const INVOICE_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",     color: C.muted,   bg: "var(--surface-hover)",   border: "var(--border)" },
  sent:      { label: "Terkirim",  color: C.blue,    bg: C.blueBg,    border: C.blueBorder },
  partial:   { label: "Parsial",   color: C.yellow,  bg: C.yellowBg,  border: C.yellowBorder },
  paid:      { label: "Lunas",     color: C.green,   bg: C.greenBg,   border: C.greenBorder },
  overdue:   { label: "Jatuh Tempo", color: C.red,   bg: C.redBg,     border: C.redBorder },
  cancelled: { label: "Batal",     color: C.muted,   bg: "var(--surface-hover)",   border: "var(--border)" },
};

export const KASBON_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:  { label: "Menunggu",  color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  approved: { label: "Disetujui", color: C.green,  bg: C.greenBg,  border: C.greenBorder },
  rejected: { label: "Ditolak",   color: C.red,    bg: C.redBg,    border: C.redBorder },
  settled:  { label: "Settled",   color: C.muted,  bg: "var(--surface-hover)",  border: "var(--border)" },
};

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  termin_billing: "Termin", commission_billing: "Komisi", retention_release: "Retensi",
};

export interface BillableExpense {
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

export interface LineItemDraft {
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

export type InvoiceMode = "termin_billing" | "expense_billing" | "commission_fee" | "commission_billing";

export interface PenaltyInfo {
  waived: boolean; waived_reason: string | null;
  authoritative: { penalty_amount: number; days_late: number; base_amount: number; anchor_date: string; basis: string } | null;
  estimate: { estimate: true; as_of: string; enabled: boolean; applicable: boolean; reason: string; daysLate: number; baseAmount: number; penaltyAmount: number; basis: string };
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  main: "Kas Utama", collector: "Kolektor", petty_cash: "Kas Kecil",
};

export const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
  pembelian_alat: "Pembelian Alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

export const FUND_SOURCE_LABEL: Record<string, string> = {
  owner_advance: "Dana Owner", client_fund: "Dana Klien",
};

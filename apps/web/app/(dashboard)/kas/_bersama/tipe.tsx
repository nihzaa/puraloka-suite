/**
 * KAS — tipe & pembantu bersama antar-halaman modul.
 *
 * Dipindah UTUH dari `kas/page.tsx` (1.537 baris, 3 tab) saat modul dipecah
 * jadi dashboard + tiga halaman. Isinya tidak ditulis ulang: peta status,
 * label sumber dana, dan format nominal dipakai oleh keempat halaman, dan
 * menyalinnya per halaman adalah cara paling mudah membuat "Menunggu" di satu
 * layar berarti hal berbeda dari "Menunggu" di layar sebelahnya.
 */

import type React from "react";
import {
  Wallet, Banknote, Building2, User, Package, Wrench, Circle, TrendingDown,
} from "lucide-react";
import { C } from "@/lib/warna-ui";

// ─── Tipe data ────────────────────────────────────────────────────────────────

export interface CashSummary {
  totalBalance: number; mainBalance: number;
  collectorBalance: number; pettyBalance: number;
  pendingTransferCount: number; pendingTransferAmount: number;
  pendingExpenseCount: number; pendingExpenseAmount: number;
  expensesThisMonth: number;
}

export interface CashAccount {
  id: string; name: string; type: "main" | "collector" | "petty_cash";
  balance: number; currency: string; notes: string | null; is_active: boolean;
  created_at: string;
  owner: { id: string; name: string; role: string } | null;
  projects: { id: string; name: string } | null;
}

export interface CashTransfer {
  id: string; amount: number; transfer_date: string; status: string;
  ref_number: string | null; notes: string | null; proof_url: string | null;
  confirmed_at: string | null; created_at: string;
  from_account: { id: string; name: string; type: string } | null;
  to_account: { id: string; name: string; type: string } | null;
  creator: { id: string; name: string } | null;
  confirmer: { id: string; name: string } | null;
}

export interface Expense {
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

export interface Category { id: string; name: string; type: string; parent_id: string | null }
export interface Project { id: string; name: string; contract_model: string }

/** Satu baris `/api/v1/cash/expenses/summary-by-category`. */
export interface RingkasKategori {
  id: string; name: string; type: string; total: number; count: number;
}

/** Satu titik `/api/v1/finance/cashflow-chart`. */
export interface TitikArusKas {
  period: string; label: string; masuk: number; keluar: number; net: number;
}

// ─── Format ───────────────────────────────────────────────────────────────────

export const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return fmt(n);
};

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

// ─── Peta label & warna ───────────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABEL: Record<string, {
  label: string; icon: React.ReactNode; color: string; bg: string; border: string;
}> = {
  main:       { label: "Kas Utama", icon: <Wallet size={15} />,    color: C.navy,   bg: C.navyLight, border: "var(--info-border)" },
  collector:  { label: "Kolektor",  icon: <Building2 size={15} />, color: C.purple, bg: C.purpleBg,  border: C.purpleBorder },
  petty_cash: { label: "Kas Kecil", icon: <Banknote size={15} />,  color: C.green,  bg: C.greenBg,   border: C.greenBorder },
};

export const TRANSFER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Menunggu",     color: C.yellow, bg: C.yellowBg },
  confirmed: { label: "Dikonfirmasi", color: C.green,  bg: C.greenBg },
  cancelled: { label: "Batal",        color: C.muted,  bg: "var(--surface-hover)" },
};

export const EXPENSE_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",     color: C.muted,  bg: "var(--surface-hover)", border: "var(--border)" },
  submitted: { label: "Menunggu",  color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  approved:  { label: "Disetujui", color: C.green,  bg: C.greenBg,  border: C.greenBorder },
  rejected:  { label: "Ditolak",   color: C.red,    bg: C.redBg,    border: C.redBorder },
};

export const CATEGORY_TYPE_ICON: Record<string, React.ReactNode> = {
  material:    <Package size={13} color={C.navy} />,
  labor:       <User size={13} color={C.purple} />,
  equipment:   <Wrench size={13} color={C.yellow} />,
  operational: <TrendingDown size={13} color={C.green} />,
  other:       <Circle size={13} color={C.muted} />,
};

export const SOURCE_LABEL: Record<string, string> = {
  petty_cash:  "Kas Kecil",
  main_cash:   "Kas Utama",
  personal:    "Talangan Pribadi",
  client_fund: "Dana Klien",
};

/** Warna & label per tipe kategori pengeluaran — dipakai rincian kategori. */
export const TYPE_COLOR: Record<string, string> = {
  material: C.red, labor: C.blue, equipment: C.yellow,
  operational: "var(--aksen)", other: C.muted,
};

export const TYPE_LABEL: Record<string, string> = {
  material: "Material", labor: "Labor/Upah", equipment: "Equipment",
  operational: "Operasional", other: "Lain-lain",
};

/**
 * Pesan galat dari respons API, atau teks cadangan.
 *
 * Diangkat jadi fungsi karena empat penangan aksi memakai bentuk yang sama
 * dan dua di antaranya SEBELUMNYA menelan galatnya diam-diam — tampilan lokal
 * berubah sementara server menolak, dan selisih itu baru terlihat saat halaman
 * dimuat ulang.
 */
export function pesanGalat(err: unknown, cadangan: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? cadangan;
}

/**
 * TIPE & PEMBANTU BERSAMA — modul Mandor.
 *
 * ── Kenapa berkas ini ada
 *
 * Sampai 2026-08-07 seluruh modul Mandor hidup dalam SATU berkas 3.848 baris
 * dengan tujuh tab — halaman terbesar di repo. Yang rusak dari itu bukan
 * ukurannya saja:
 *
 *   • Tab tak ada di URL. "Lihat yang di tab Kasbon" tak bisa dikirim sebagai
 *     tautan; muat ulang selalu kembali ke Laporan Upah.
 *   • Membuka satu tab tetap mengunduh kode ketujuhnya, dan memanggil
 *     delapan endpoint sekaligus.
 *   • Tujuh tab terbuka semuanya bertuliskan "Mandor" di bilah tab peramban.
 *
 * Uji ARAH-VISUAL §6a — *"kalau saya kirim tautan ini ke rekan, apa yang ia
 * lihat?"* — dijawab "tergantung tab mana yang terakhir ia buka". Itu tanda
 * ia seharusnya halaman, bukan tab.
 *
 * Berkas ini memuat yang dipakai LEBIH DARI SATU rute sesudah pemecahan:
 * bentuk data dari API, pemformat, dan peta label/warna status. Menyalinnya
 * ke tiap halaman berarti perbaikan di satu tempat tak sampai ke tempat lain.
 *
 * Isinya dipindahkan APA ADANYA dari `page.tsx` lama — pemecahan ini menata
 * ulang letak, bukan perilaku.
 */

import type { CSSProperties } from "react";
import { C } from "@/lib/warna-ui";

/**
 * Permukaan kartu baku modul ini — dipakai sembilan berkas setelah pemecahan.
 *
 * Dinamai `kartu` di sumbernya dan diimpor `as card` di tempat pemakaian,
 * supaya blok `style={{ ...card, ... }}` yang dipindahkan dari `page.tsx`
 * lama tak perlu diubah satu per satu. Menyunting ratusan situs pemakaian
 * hanya demi nama adalah kesempatan bagus untuk merusak sesuatu.
 */
export const kartu: CSSProperties = {
  background: "var(--surface)", border: `1px solid ${C.border}`,
  borderRadius: 14, boxShadow: "var(--naik-1)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Assignment {
  id: string;
  status: string;
  notes: string | null;
  assigned_at: string;
  project: { id: string; name: string; location: string } | null;
  mandor: { id: string; name: string; phone: string | null } | null;
  assigner: { id: string; name: string } | null;
  work_scopes: WorkScope[];
}

export interface WorkScope {
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

export interface WageReport {
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

export interface WageReportDetail {
  report: WageReport;
  items: WageItem[];
  deductions: WageDeduction[];
}

export interface WageItem {
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

export interface WageDeduction {
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

export interface Worker {
  id: string; name: string; phone: string | null;
  tipe: 'tukang' | 'laden' | 'kenek' | null;
  skills: string[]; is_active: boolean;
  mandor?: { id: string; name: string } | null;
}
export interface WorkerKasbon {
  id: string; amount: number; purpose: string; kasbon_date: string;
  notes: string | null; amount_settled: number; is_settled: boolean;
  photo_url: string | null;
  worker: { id: string; name: string } | null;
  mandor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  scope: { id: string; scope_name: string } | null;
}
export interface Summary {
  pendingReports: number; approvedAmount: number;
  activeWorkersThisMonth: number; totalWorkersAll: number;
  activeKasbons: number; activeKasbonAmount: number;
}

export interface MandorKasbon {
  id: string; amount: number; fund_source: string; purpose: string;
  kasbon_date: string; status: string; notes: string | null; created_at: string; approved_at: string | null;
  photo_url: string | null;
  project: { id: string; name: string } | null;
  work_scopes: { id: string; scope_name: string; mandor_assignments: { id: string; projects: { id: string; name: string } | null }[] } | null;
  approver: { id: string; name: string } | null;
  cash_account: { id: string; name: string; type: string } | null;
}

export interface MandorScope {
  id: string; scope_name: string; payment_system: string;
  assignment: { id: string; project: { id: string; name: string } | null; mandor: { id: string; name: string } | null } | null;
}

export interface ScopeItem {
  id: string; item_name: string; category: string; description: string | null;
  unit: string; volume: number; unit_price: number; subtotal: number;
  volume_done: number; pct_done: number; sort_order: number; notes: string | null;
  specs?: { id: string; spec_key: string; spec_value: string; sort_order: number }[];
}

export interface ScopeDetail {
  scope: WorkScope & {
    assignment: { id: string; mandor: { id: string; name: string; phone: string | null } | null; project: { id: string; name: string; location: string } | null } | null;
    description: string | null;
    start_date: string | null; end_date: string | null;
  };
  items: ScopeItem[];
}

export interface MandorUser { id: string; name: string; phone: string | null; email: string }

export type TabKey = "penugasan" | "laporan" | "kasbon" | "mandor-kasbon" | "tukang" | "penagihan" | "retensi";

export interface ProgressPayment {
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

export interface CashAccount { id: string; name: string; type: string; balance: number; is_active: boolean; }

export interface SettlementModalState {
  scopeId: string;
  scopeName: string;
  mandorName: string;
  projectName: string;
  boronganValue: number;
  totalKasbon: number;
}

export interface ProgressPaymentConfirmState {
  payment: ProgressPayment;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
export const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
export const fmtDateShort = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

export function getMondayOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export const REPORT_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",     color: C.mid,    bg: "var(--surface-subtle)",  border: C.border },
  submitted: { label: "Diajukan",  color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  approved:  { label: "Disetujui", color: C.green,  bg: C.greenBg,  border: C.greenBorder },
  rejected:  { label: "Ditolak",   color: C.red,    bg: C.redBg,    border: C.redBorder },
  paid:      { label: "Dibayar",   color: C.blue,   bg: C.blueBg,   border: C.blueBorder },
};

export const PAYMENT_SYSTEM: Record<string, string> = {
  harian: "Harian", borongan: "Borongan", progress_pct: "Progress %",
};

export const CATEGORY_LABELS: Record<string, string> = {
  struktur: "Struktur", baja: "Baja", dinding: "Dinding", finishing: "Finishing",
  atap: "Atap", plumbing: "Plumbing", elektrikal: "Elektrikal", mekanikal: "Mekanikal",
  kusen_pintu: "Kusen & Pintu", pagar_carport: "Pagar/Carport", landscape: "Landscape", lain_lain: "Lain-lain",
};

export const TIPE_LABELS: Record<string, string> = { tukang: "Tukang", laden: "Laden", kenek: "Kenek" };
export const TIPE_COLORS: Record<string, { bg: string; color: string }> = {
  tukang: { bg: "var(--navy-light)", color: "var(--on-info-bg)" },
  laden:  { bg: "var(--success-bg)", color: "var(--on-success-bg)" },
  kenek:  { bg: "var(--warning-bg)", color: "var(--on-warning-bg)" },
};

export const SKILL_OPTIONS = [
  { value: "tukang_batu", label: "Tukang Batu" },
  { value: "tukang_kayu", label: "Tukang Kayu" },
  { value: "tukang_besi", label: "Tukang Besi" },
  { value: "tukang_cat", label: "Tukang Cat" },
  { value: "plumbing", label: "Plumbing" },
  { value: "elektrikal", label: "Elektrikal" },
  { value: "finishing", label: "Finishing" },
  { value: "lainnya", label: "Lainnya" },
];
export const SKILL_LABELS: Record<string, string> = Object.fromEntries(SKILL_OPTIONS.map(s => [s.value, s.label]));

export const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  struktur:      { bg: "var(--warning-bg)", color: "var(--on-warning-bg)" },
  baja:          { bg: "var(--navy-light)", color: "var(--on-info-bg)" },
  dinding:       { bg: "#FCE7F3", color: "#9D174D" },
  finishing:     { bg: "var(--success-bg)", color: "var(--on-success-bg)" },
  atap:          { bg: "var(--navy-light)", color: "var(--aksen-pekat)" },
  plumbing:      { bg: "#CFFAFE", color: "#164E63" },
  elektrikal:    { bg: "#FEF9C3", color: "#713F12" },
  mekanikal:     { bg: "#F3E8FF", color: "#6B21A8" },
  kusen_pintu:   { bg: "var(--warning-bg)", color: "#9A3412" },
  pagar_carport: { bg: "var(--surface-hover)", color: "var(--text-secondary)" },
  landscape:     { bg: "var(--success-bg)", color: "var(--on-success-bg)" },
  lain_lain:     { bg: "var(--surface-hover)", color: "var(--text-secondary)" },
};

// ─── Badge helpers (D3) ──────────────────────────────────────────────────────
export function getPaymentSystemBadge(type: string) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    borongan:     { label: "Borongan",  bg: "var(--navy-light)", color: "var(--on-info-bg)", border: "var(--info-border)" },
    harian:       { label: "Harian",    bg: "var(--success-bg)", color: "var(--on-success-bg)", border: "var(--success-border)" },
    progress_pct: { label: "Progress%", bg: "var(--navy-light)", color: "var(--aksen-pekat)", border: "var(--aksen-terang)" },
  };
  return map[type] ?? { label: type, bg: "var(--surface-hover)", color: "var(--text-secondary)", border: "var(--border)" };
}

export function getWageStatusBadge(status: string) {
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
export function getProgressColor(pct: number): string {
  if (pct >= 90) return "var(--warning)";  // amber — hampir selesai
  if (pct >= 70) return "var(--success)";  // hijau
  if (pct >= 30) return "var(--info)";  // biru
  return "var(--text-muted)";                  // abu — belum banyak
}

// ─── WA link helper (D5) ─────────────────────────────────────────────────────
export function toWaLink(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("0") ? "62" + digits.slice(1) : digits}`;
}

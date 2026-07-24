// Denda keterlambatan — lapisan DB (config-first, AKTA 3). ⚠️ Red-Line §5#2.
// Delegasi keputusan "berapa denda" ke lib/penalty.ts (murni). Di sini: resolusi terms
// (override proyek ?? global effective), resolusi basis, PERSIST otoritatif saat event,
// dan ESTIMASI on-read (tampilan, tidak dipersist → C5 aman).
//
// ANCHOR (DOMAIN.md § Denda):
//   • Terms (rate/cap/grace/basis/enabled) = override proyek per-field, else global
//     financial_config EFFECTIVE PADA due_date invoice (= "sesuai kontrak", bukan global
//     terkini — syarat founder #2).
//   • Hari telat = tanggal WIB anchor − due_date − grace. anchor = paidDate (otoritatif) /
//     today WIB (estimasi).

import { supabase } from './supabase.js'
import { getEffectiveFinancialValue } from './financial-config.js'
import { todayWIB } from '../lib/financial-config.js'
import {
  resolvePenaltyTerms, computePenalty, PENALTY_BASES,
  type PenaltyTerms, type PenaltyBasis, type PenaltyResult, type PenaltyOverride,
} from '../lib/penalty.js'

// Fallback statis (dipakai HANYA jika config hilang; getEffectiveFinancialValue sudah
// berisik utk key finansial, tapi key penalty.* tak ada di STATIC_FALLBACK-nya → guard di sini).
const PENALTY_DEFAULT: PenaltyTerms = { enabled: false, basis: 'invoice_telat', ratePerDay: 0.001, capPct: 0.05, graceDays: 0 }

function coerceBasis(v: unknown): PenaltyBasis {
  return PENALTY_BASES.includes(v as PenaltyBasis) ? (v as PenaltyBasis) : PENALTY_DEFAULT.basis
}
function coerceNum(v: unknown, fb: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fb
}

/** Terms global effective pada atDate (default due_date pemanggil / hari ini WIB). */
export async function getGlobalPenaltyTerms(atDate: string): Promise<PenaltyTerms> {
  const [enabled, basis, rate, cap, grace] = await Promise.all([
    getEffectiveFinancialValue('penalty.enabled', atDate),
    getEffectiveFinancialValue('penalty.basis', atDate),
    getEffectiveFinancialValue('penalty.rate_per_day', atDate),
    getEffectiveFinancialValue('penalty.cap_pct', atDate),
    getEffectiveFinancialValue('penalty.grace_days', atDate),
  ])
  return {
    enabled: enabled === true || enabled === 'true',
    basis: coerceBasis(basis),
    ratePerDay: coerceNum(rate, PENALTY_DEFAULT.ratePerDay),
    capPct: coerceNum(cap, PENALTY_DEFAULT.capPct),
    graceDays: Math.trunc(coerceNum(grace, PENALTY_DEFAULT.graceDays)),
  }
}

export interface ProjectPenaltyOverride {
  penalty_enabled?: boolean | null
  penalty_basis?: string | null
  penalty_rate_per_day?: number | string | null
  penalty_cap_pct?: number | string | null
  penalty_grace_days?: number | string | null
}

function toOverride(p: ProjectPenaltyOverride | null | undefined): PenaltyOverride {
  if (!p) return {}
  return {
    enabled: p.penalty_enabled ?? null,
    basis: (p.penalty_basis as PenaltyBasis) ?? null,
    ratePerDay: p.penalty_rate_per_day == null ? null : Number(p.penalty_rate_per_day),
    capPct: p.penalty_cap_pct == null ? null : Number(p.penalty_cap_pct),
    graceDays: p.penalty_grace_days == null ? null : Number(p.penalty_grace_days),
  }
}

/** Terms efektif proyek = override per-field ?? global effective pada due_date. */
export async function resolveProjectPenaltyTerms(
  project: ProjectPenaltyOverride | null | undefined, dueDate: string,
): Promise<PenaltyTerms> {
  const global = await getGlobalPenaltyTerms(dueDate)
  return resolvePenaltyTerms(toOverride(project), global)
}

/** Nilai basis denda menurut basis terpilih. */
export async function resolvePenaltyBase(
  basis: PenaltyBasis,
  ctx: { invoiceTotal: number; projectId: string | null; contractValue: number | null; excludeInvoiceId?: string },
): Promise<number> {
  if (basis === 'invoice_telat') return ctx.invoiceTotal
  if (basis === 'kontrak_total') return Number(ctx.contractValue ?? 0)
  // outstanding_proyek: jumlah amount_due invoice proyek yang belum lunas.
  if (!ctx.projectId) return 0
  const { data } = await supabase
    .from('invoices')
    .select('amount_due, status')
    .eq('project_id', ctx.projectId)
    .neq('status', 'cancelled')
  return (data ?? [])
    .filter(i => i.status !== 'paid')
    .reduce((s, i) => s + Number(i.amount_due ?? 0), 0)
}

interface InvoiceForPenalty {
  id: string
  project_id: string | null
  total_amount: number | string
  due_date: string
  penalty_waived?: boolean | null
}
interface ProjectForPenalty extends ProjectPenaltyOverride {
  id?: string
  contract_value?: number | string | null
}

/**
 * OTORITATIF: hitung denda saat invoice LUNAS telat & PERSIST (immutable, satu per invoice).
 * Idempotent via UNIQUE(invoice_id) + pre-check. Fire-and-forget-safe: menelan error DB.
 * Return hasil (atau null jika tak berlaku/sudah ada).
 */
export async function computeAndPersistPenalty(params: {
  invoice: InvoiceForPenalty
  project: ProjectForPenalty | null
  paidDate: string          // tanggal pelunasan (anchor hari telat), 'YYYY-MM-DD'
  createdBy: string | null
}): Promise<PenaltyResult | null> {
  try {
    const { invoice, project, createdBy } = params
    const paidDate = String(params.paidDate).slice(0, 10)
    const dueDate = String(invoice.due_date).slice(0, 10)

    // Sudah ada denda otoritatif? (idempotent — jangan hitung dua kali)
    const { data: existing } = await supabase
      .from('invoice_penalties').select('id').eq('invoice_id', invoice.id).maybeSingle()
    if (existing) return null

    const terms = await resolveProjectPenaltyTerms(project, dueDate)
    const baseAmount = await resolvePenaltyBase(terms.basis, {
      invoiceTotal: Number(invoice.total_amount),
      projectId: invoice.project_id,
      contractValue: project?.contract_value == null ? null : Number(project.contract_value),
    })

    const result = computePenalty({
      terms, waived: invoice.penalty_waived === true, baseAmount, dueDate, atDate: paidDate,
    })
    if (!result.applicable) return result   // OFF/waived/tak-telat → tak dipersist

    const { error } = await supabase.from('invoice_penalties').insert({
      invoice_id: invoice.id,
      project_id: invoice.project_id,
      basis: terms.basis,
      base_amount: baseAmount,
      days_late: result.daysLate,
      grace_days: terms.graceDays,
      rate_per_day: terms.ratePerDay,
      cap_pct: terms.capPct,
      raw_amount: result.rawAmount,
      penalty_amount: result.penaltyAmount,
      anchor_date: paidDate,
      due_date: dueDate,
      created_by: createdBy,
    })
    // 23505 (unique) = race → sudah ada, aman diabaikan.
    if (error && (error as { code?: string }).code !== '23505') {
      console.error(JSON.stringify({ level: 'error', event: 'penalty_persist_failed', invoice_id: invoice.id, msg: error.message }))
    }
    return result
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', event: 'penalty_persist_threw', msg: (e as Error).message }))
    return null
  }
}

export interface PenaltyEstimate extends PenaltyResult {
  estimate: true
  as_of: string
  basis: PenaltyBasis
  enabled: boolean
}

/**
 * ESTIMASI on-read utk TAMPILAN (invoice belum lunas). TIDAK dipersist, BUKAN angka resmi
 * (dilabeli estimate + as_of). Menutup lubang event-driven: menagih sebelum klien bayar.
 */
export async function estimatePenalty(params: {
  invoice: InvoiceForPenalty
  project: ProjectForPenalty | null
  asOf?: string
}): Promise<PenaltyEstimate> {
  const asOf = params.asOf ?? todayWIB()
  const dueDate = String(params.invoice.due_date).slice(0, 10)
  const terms = await resolveProjectPenaltyTerms(params.project, dueDate)
  const baseAmount = await resolvePenaltyBase(terms.basis, {
    invoiceTotal: Number(params.invoice.total_amount),
    projectId: params.invoice.project_id,
    contractValue: params.project?.contract_value == null ? null : Number(params.project.contract_value),
  })
  const result = computePenalty({
    terms, waived: params.invoice.penalty_waived === true, baseAmount, dueDate, atDate: asOf,
  })
  return { ...result, estimate: true, as_of: asOf, basis: terms.basis, enabled: terms.enabled }
}

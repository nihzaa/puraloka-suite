import type { FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'
import { evaluateApproval, type ApprovalDecision, type ApprovalStep } from '../lib/approval-engine.js'

// Lapisan DB Approval Engine (ADR-007). Keputusan "berapa langkah & siapa boleh"
// didelegasikan ke lib/approval-engine.ts (murni, ber-test). Di sini hanya:
// baca konfigurasi rantai + jejak persetujuan, lalu catat persetujuan.
//
// Kolom `status` tabel sumber TETAP sumber kebenaran — util ini tidak menyimpannya.

export type ApprovalEntityType =
  | 'kasbon' | 'change_order' | 'material_request' | 'project_expense'
  | 'estimate_version'  // CECEP Milestone 3 — approval via engine yang sama (ADR-007, 47 §3)
  | 'lessons_learned'   // CECEP Milestone 4 — titik approval ke-3 (47 §3); approve = memicu write-back
  | 'submittal'         // ROADMAP #24c — keputusan konsultan atas material/gambar yang diajukan.
                        // Ikut engine ini, BUKAN status sendiri: membuat mekanisme
                        // approval keempat berarti mengulang persis masalah yang
                        // Program B selesaikan (Blueprint melarangnya eksplisit).

/**
 * Ambil langkah rantai aktif untuk sebuah entitas — MILIK COMPANY INI.
 *
 * T4h: tanpa `company_id`, rantai approval efektif DIPAKAI BERSAMA semua tenant.
 * Tenant A mengubah/menonaktifkan langkah approval akan mengubah alur approval
 * tenant B — termasuk melumpuhkannya total, karena `steps.length === 0`
 * bersifat fail-closed (nol orang bisa approve).
 */
async function loadSteps(
  entityType: ApprovalEntityType,
  companyId: string,
): Promise<{ steps: ApprovalStep[]; error?: string }> {
  const { data, error } = await supabase
    .from('approval_chains')
    .select('id, is_active, approval_steps ( level, required_permission, min_amount, label )')
    .eq('entity_type', entityType)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) return { steps: [], error: error.message }
  if (!data || data.is_active === false) return { steps: [] }
  const raw = (data.approval_steps ?? []) as unknown as ApprovalStep[]
  return { steps: raw.map(s => ({ ...s, min_amount: s.min_amount === null ? null : Number(s.min_amount) })) }
}

/** Level yang SUDAH disetujui untuk entitas ini. */
async function loadApprovedLevels(
  entityType: ApprovalEntityType,
  entityId: string,
  companyId: string,
): Promise<number[]> {
  const { data } = await supabase
    .from('approval_progress')
    .select('level')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('company_id', companyId)
  return (data ?? []).map(r => Number(r.level))
}

/** Set permission milik role user (sumber sama dgn requirePermission runtime). */
async function loadUserPermissions(request: FastifyRequest): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc('get_role_permissions', {
    role_name: request.currentUser!.role,
  })
  if (error) return null
  return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key))
}

export interface EntityApprovalResult extends ApprovalDecision {
  /** true bila konfigurasi/permission tak terbaca — pemanggil WAJIB balas 500, bukan 403. */
  configError?: string
}

/**
 * Evaluasi apakah user boleh menyetujui entitas SEKARANG.
 * FAIL-CLOSED (ADR-007): konfigurasi/permission tak terbaca → TIDAK diloloskan, dan
 * dibedakan dari "tidak berhak" lewat `configError` supaya kegagalan tak menyamar
 * sebagai penolakan otorisasi (pelajaran Phase 1 §4E).
 */
export async function evaluateEntityApproval(
  request: FastifyRequest,
  params: { entityType: ApprovalEntityType; entityId: string; amount: number | null },
): Promise<EntityApprovalResult> {
  const { steps, error } = await loadSteps(params.entityType, request.companyId!)
  if (error) {
    return { allowed: false, reason: 'no_steps', step: null, isFinalStep: false, applicable: [], configError: error }
  }
  const perms = await loadUserPermissions(request)
  if (!perms) {
    return { allowed: false, reason: 'no_steps', step: null, isFinalStep: false, applicable: [], configError: 'get_role_permissions gagal' }
  }
  const approvedLevels = await loadApprovedLevels(params.entityType, params.entityId, request.companyId!)
  return evaluateApproval({ steps, amount: params.amount, approvedLevels, userPermissions: perms })
}

/**
 * Gerbang KASAR: apakah user memegang permission SALAH SATU langkah rantai?
 *
 * Dipakai SEBELUM entitas di-fetch, supaya urutan lama terjaga: user tak berwenang
 * dapat 403 tanpa pernah tahu entitasnya ada atau tidak (mencegah kebocoran
 * keberadaan id lewat beda 403 vs 404). Dengan seed 1 langkah, ini identik dengan
 * `requirePermission('<permission langkah 1>')` yang lama.
 */
export async function canParticipateInChain(
  request: FastifyRequest,
  entityType: ApprovalEntityType,
): Promise<{ ok: boolean; configError?: string }> {
  const { steps, error } = await loadSteps(entityType, request.companyId!)
  if (error) return { ok: false, configError: error }
  if (steps.length === 0) return { ok: false } // fail-closed
  const perms = await loadUserPermissions(request)
  if (!perms) return { ok: false, configError: 'get_role_permissions gagal' }
  return { ok: steps.some(s => perms.has(s.required_permission)) }
}

/** Catat persetujuan satu level (idempoten via UNIQUE(entity_type, entity_id, level)). */
export async function recordApproval(params: {
  entityType: ApprovalEntityType
  entityId: string
  level: number
  approvedBy: string
  note?: string | null
  /** T4h: wajib — jejak approval milik company mana. */
  companyId: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('approval_progress').insert({
    entity_type: params.entityType,
    entity_id: params.entityId,
    level: params.level,
    approved_by: params.approvedBy,
    note: params.note ?? null,
    company_id: params.companyId,
  })
  // 23505 = level ini sudah tercatat (race/dobel) → aman diperlakukan sukses-idempoten.
  if (error && (error as { code?: string }).code !== '23505') return { ok: false, error: error.message }
  return { ok: true }
}

/** Bersihkan jejak persetujuan (dipakai saat entitas ditolak → rantai diulang dari awal). */
export async function clearApprovalProgress(
  entityType: ApprovalEntityType,
  entityId: string,
  companyId: string,
): Promise<void> {
  await supabase.from('approval_progress').delete()
    .eq('entity_type', entityType).eq('entity_id', entityId).eq('company_id', companyId)
}

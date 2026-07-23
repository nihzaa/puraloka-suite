import type { FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'
import { asUuidOrNull } from './uuid.js'

// ─────────────────────────────────────────────────────────────────────────────
// Audit Trail Helper terpusat (Epic 5 / 1A.3)
//
// Menutup gap yang ditemukan di current-state audit: skema audit_logs matang
// (migration 009+046+072) tapi write-path nyaris kosong (1 titik, tanpa
// severity/ip/user_agent/diff). Helper ini:
//   - mengisi ip_address & user_agent OTOMATIS dari request → menghilangkan kelas
//     bug "lupa isi field" (akar gap 3 di audit).
//   - fire-and-forget: TIDAK PERNAH throw/menggagalkan request utama — pola sama
//     persis dengan notifications util yang sudah matang.
//   - INSERT murni → idempotent secara alami, tidak butuh idempotency key.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditEntry {
  tableName: string
  recordId: string
  action: string
  actorId: string
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  severity?: AuditSeverity
  reason?: string
  correlationId?: string
  workflowId?: string
}

/**
 * Diff dangkal antara old & new: hanya key yang nilainya berubah, dengan
 * bentuk { key: { from, to } }. Null jika salah satu sisi tidak ada.
 */
export function computeDiff(
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null
): Record<string, { from: unknown; to: unknown }> | null {
  if (!oldValues || !newValues) return null
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
  for (const k of keys) {
    const from = oldValues[k]
    const to = newValues[k]
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      diff[k] = { from, to }
    }
  }
  return Object.keys(diff).length > 0 ? diff : null
}

/**
 * Catat satu audit event. Fire-and-forget: error di-log tapi TIDAK PERNAH
 * di-throw ke pemanggil — audit yang gagal tidak boleh menggagalkan aksi bisnis.
 * ip_address & user_agent diambil otomatis dari request.
 *
 * Sub-Fase 1D.2 — correlation_id diisi OTOMATIS dari `request.id` (Fastify genReqId,
 * UUID per-request). Semua audit event dalam satu request jadi punya correlation_id
 * sama, dan ID itu identik dengan `reqId` di structured log → bisa ditelusuri bolak-balik.
 * `entry.correlationId` eksplisit tetap menang bila diberikan (mis. job background
 * yang mengaitkan ke request asal).
 */
export async function logAuditEvent(request: FastifyRequest, entry: AuditEntry): Promise<void> {
  try {
    const diff = computeDiff(entry.oldValues, entry.newValues)
    const { error } = await supabase.from('audit_logs').insert({
      table_name: entry.tableName,
      record_id: entry.recordId,
      action: entry.action,
      user_id: entry.actorId,
      old_values: entry.oldValues ?? null,
      new_values: entry.newValues ?? null,
      diff,
      severity: entry.severity ?? 'info',
      reason: entry.reason ?? null,
      // 1D.2: eksplisit menang; selain itu request.id (genReqId). Kolom uuid →
      // guard asUuidOrNull: nilai non-UUID jadi null (insert audit tak boleh gagal
      // karena correlation_id — sama seperti dual-write, fire-and-forget).
      correlation_id: asUuidOrNull(entry.correlationId) ?? asUuidOrNull(request.id),
      workflow_id: entry.workflowId ?? null,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] ?? null,
    })
    if (error) request.log.error({ err: error, entry }, 'logAuditEvent insert failed')
  } catch (err) {
    // Fire-and-forget: jangan pernah propagate ke main request.
    request.log.error({ err, entry }, 'logAuditEvent threw')
  }
}

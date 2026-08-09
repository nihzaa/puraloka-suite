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
  /**
   * Kanal asal tindakan. Bawaan `web`.
   *
   * Tanpa ini, approval lewat WhatsApp tak bisa dibedakan dari approval lewat
   * dashboard — dan kalau satu kanal ternyata disalahgunakan, tak ada cara
   * mengetahui tindakan mana yang berasal darinya.
   */
  via?: 'web' | 'ai_whatsapp' | 'penjadwal' | 'api'
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
      // `company_id` DINYATAKAN, tidak diserahkan ke trigger.
      //
      // `fn_isi_company_id` (trigger BEFORE INSERT) memang mengisinya kalau
      // kosong — TAPI hanya saat ambigu bisa dihindari: ia membaca
      // `app.company_id`, dan bila itu kosong ia menebak dari `companies`
      // HANYA bila tenant-nya tepat satu. Lebih dari satu → sengaja
      // dibiarkan NULL, karena menebak akan memalsukan pemilik jejak.
      //
      // Trigger itu benar. Yang salah adalah memanggilnya tanpa menyatakan
      // tenant: di dev (1 company) tebakannya berhasil dan audit tertulis;
      // di CI (>1 company) NOT NULL menolak, `catch` di bawah menelan
      // galatnya, dan JEJAK AUDIT HILANG TANPA SUARA.
      //
      // Itu bukan sekadar test merah — di lingkungan multi-tenant sungguhan,
      // seluruh riwayat "siapa mengubah apa" tak pernah tercatat, dan tak
      // ada satu pun gejala sampai seseorang mencarinya.
      company_id: request.companyId ?? null,
      table_name: entry.tableName,
      // ── `recordId` yang BUKAN UUID masuk `record_key` (migrasi 249)
      //
      // `record_id` bertipe uuid, dan LIMA modul memakai `recordId` untuk
      // identitas yang bukan UUID: kode tujuan kasbon, `event_type` aturan
      // notifikasi, `entity_type` rantai approval, nama kunci kredensial,
      // nama tugas terjadwal.
      //
      // Akibatnya insert-nya DITOLAK basis — `invalid input syntax for type
      // uuid` — galatnya tercatat di log aplikasi, dan barisnya tak pernah
      // sampai ke `audit_logs`. Diukur 2026-08-09: NOL baris audit untuk
      // ketiga modul konfigurasi itu, padahal justru merekalah yang mengubah
      // cara sistem memutuskan.
      //
      // Dipisah di SINI, bukan di tiap pemanggil: memperbaikinya satu per satu
      // berarti pemanggil keenam kelak mengulang cacat yang sama.
      record_id: asUuidOrNull(entry.recordId),
      record_key: asUuidOrNull(entry.recordId) ? null : entry.recordId,
      via: entry.via ?? 'web',
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

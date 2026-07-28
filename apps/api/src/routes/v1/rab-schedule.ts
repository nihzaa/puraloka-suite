import type { FastifyInstance } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'

/**
 * RAB Schedule & Absorption Log
 *
 * rab_schedule     — jadwal rencana serapan per item per minggu (basis Kurva S Rencana)
 * rab_absorption_log — serapan dana aktual yang diinput manual per item per minggu
 */
export default async function rabScheduleRoutes(app: FastifyInstance) {

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Hitung tanggal Senin dari suatu tanggal
  function getMondayOf(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay() // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  // Hitung week_number berdasarkan project start_date
  function getWeekNumber(weekStart: Date, projectStart: Date): number {
    const diff = weekStart.getTime() - getMondayOf(projectStart).getTime()
    return Math.floor(diff / (7 * 86400000)) + 1
  }

  // ── GET /api/v1/projects/:projectId/rab-schedule ──────────────────────────
  // Semua jadwal rencana untuk proyek ini, dikelompokkan per item
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab-schedule',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_schedule')
        .select(`
          id, rab_item_id, week_start, week_number,
          material_pct, upah_pct, alat_pct, other_pct, notes,
          created_at,
          rab_items ( id, name, level, total_price, weight_pct )
        `)
        .eq('project_id', projectId)
        .order('rab_item_id')
        .order('week_start')

      if (error) return reply.status(500).send({ error: error.message })
      return { data: data ?? [] }
    }
  )

  // ── GET /api/v1/projects/:projectId/rab-schedule/:itemId ─────────────────
  // Jadwal rencana untuk satu item RAB
  app.get<{ Params: { projectId: string; itemId: string } }>(
    '/api/v1/projects/:projectId/rab-schedule/:itemId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId, itemId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_schedule')
        .select('id, week_start, week_number, material_pct, upah_pct, alat_pct, other_pct, notes, created_at')
        .eq('project_id', projectId)
        .eq('rab_item_id', itemId)
        .order('week_start')

      if (error) return reply.status(500).send({ error: error.message })
      return { data: data ?? [] }
    }
  )

  // ── POST /api/v1/projects/:projectId/rab-schedule ─────────────────────────
  // Upsert jadwal rencana (bisa insert atau update per minggu)
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab-schedule',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const body = request.body as {
        rab_item_id: string
        week_start: string   // ISO date string "2026-02-03"
        material_pct?: number
        upah_pct?: number
        alat_pct?: number
        other_pct?: number
        notes?: string
      }

      if (!body.rab_item_id || !body.week_start) {
        return reply.status(400).send({ error: 'rab_item_id dan week_start wajib diisi' })
      }

      const weekStartDate = getMondayOf(new Date(body.week_start))
      const weekStartISO = weekStartDate.toISOString().split('T')[0]

      // Verifikasi item milik project ini
      const { data: item } = await supabase
        .from('rab_items')
        .select('id, project_id, total_price')
        .eq('id', body.rab_item_id)
        .eq('project_id', projectId)
        .single()

      if (!item) return reply.status(404).send({ error: 'Item RAB tidak ditemukan' })

      // Ambil project start_date untuk hitung week_number
      const { data: proj } = await supabase
        .from('projects')
        .select('start_date')
        .eq('id', projectId)
        .single()

      const weekNumber = proj
        ? getWeekNumber(weekStartDate, new Date(proj.start_date))
        : 1

      const row = {
        project_id:   projectId,
        rab_item_id:  body.rab_item_id,
        week_start:   weekStartISO,
        week_number:  weekNumber,
        material_pct: Number(body.material_pct ?? 0),
        upah_pct:     Number(body.upah_pct ?? 0),
        alat_pct:     Number(body.alat_pct ?? 0),
        other_pct:    Number(body.other_pct ?? 0),
        notes:        body.notes ?? null,
        created_by:   request.currentUser!.id,
        updated_at:   new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('rab_schedule')
        .upsert(row, { onConflict: 'rab_item_id,week_start' })
        .select()
        .single()

      if (error) return reply.status(500).send({ error: error.message })
      return reply.status(201).send({ data })
    }
  )

  // ── DELETE /api/v1/projects/:projectId/rab-schedule/:id ──────────────────
  app.delete<{ Params: { projectId: string; id: string } }>(
    '/api/v1/projects/:projectId/rab-schedule/:id',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId, id } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { error } = await supabase
        .from('rab_schedule')
        .delete()
        .eq('id', id)
        .eq('project_id', projectId)

      if (error) return reply.status(500).send({ error: error.message })
      return { success: true }
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSORPTION LOG
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/v1/projects/:projectId/absorption ────────────────────────────
  // Semua log serapan untuk proyek ini
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/absorption',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_absorption_log')
        .select(`
          id, rab_item_id, week_start, week_number,
          material_pct, upah_pct, alat_pct, other_pct, notes,
          logged_at, updated_at,
          logged_by_user:users!rab_absorption_log_logged_by_fkey ( id, name ),
          rab_items ( id, name, level, total_price, weight_pct )
        `)
        .eq('project_id', projectId)
        .order('week_start', { ascending: false })
        .order('rab_item_id')

      if (error) return reply.status(500).send({ error: error.message })
      return { data: data ?? [] }
    }
  )

  // ── GET /api/v1/projects/:projectId/absorption/:itemId ───────────────────
  // Log serapan untuk satu item RAB
  app.get<{ Params: { projectId: string; itemId: string } }>(
    '/api/v1/projects/:projectId/absorption/:itemId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId, itemId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_absorption_log')
        .select(`
          id, week_start, week_number,
          material_pct, upah_pct, alat_pct, other_pct, notes,
          logged_at, updated_at,
          logged_by_user:users!rab_absorption_log_logged_by_fkey ( id, name )
        `)
        .eq('project_id', projectId)
        .eq('rab_item_id', itemId)
        .order('week_start', { ascending: false })

      if (error) return reply.status(500).send({ error: error.message })
      return { data: data ?? [] }
    }
  )

  // ── POST /api/v1/projects/:projectId/absorption ───────────────────────────
  // Upsert log serapan dana manual.
  //
  // Dua mode pengiriman:
  //   A) total_pct (dari RAB section inline): kirim nilai absolut kumulatif yang diinginkan.
  //      API baca row existing minggu ini, hitung delta = total_pct - current_total,
  //      distribusikan delta ke komponen proporsional sesuai rab_items komponen biaya.
  //      Ini mencegah race condition / double-count karena server yang pegang state.
  //
  //   B) material_pct + upah_pct + alat_pct + other_pct (dari AbsorptionLogModal):
  //      Nilai per-komponen langsung disimpan apa adanya (upsert replace row lama).
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/absorption',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const body = request.body as {
        rab_item_id: string
        week_start: string
        // Mode A: nilai absolut total
        total_pct?: number
        // Mode B: nilai per-komponen langsung
        material_pct?: number
        upah_pct?: number
        alat_pct?: number
        other_pct?: number
        notes?: string
      }

      if (!body.rab_item_id || !body.week_start) {
        return reply.status(400).send({ error: 'rab_item_id dan week_start wajib diisi' })
      }

      const weekStartDate = getMondayOf(new Date(body.week_start))
      const weekStartISO = weekStartDate.toISOString().split('T')[0]

      // Verifikasi item milik project ini dan ambil komponen biayanya
      const { data: rabItem } = await supabase
        .from('rab_items')
        .select('id, project_id, material_pct, upah_pct, alat_pct, other_pct')
        .eq('id', body.rab_item_id)
        .eq('project_id', projectId)
        .single()

      if (!rabItem) return reply.status(404).send({ error: 'Item RAB tidak ditemukan' })

      const { data: proj } = await supabase
        .from('projects')
        .select('start_date')
        .eq('id', projectId)
        .single()

      const weekNumber = proj
        ? getWeekNumber(weekStartDate, new Date(proj.start_date))
        : 1

      let mat: number, upah: number, alat: number, other: number

      if (body.total_pct !== undefined) {
        // Mode A: server hitung komponen dari target absolut
        const targetTotal = Math.min(100, Math.max(0, Number(body.total_pct)))

        // Baca row existing minggu ini untuk dapat current total
        const { data: existing } = await supabase
          .from('rab_absorption_log')
          .select('material_pct, upah_pct, alat_pct, other_pct')
          .eq('rab_item_id', body.rab_item_id)
          .eq('week_start', weekStartISO)
          .maybeSingle()

        // Kumulatif semua minggu sebelum minggu ini
        const { data: prevLogs } = await supabase
          .from('rab_absorption_log')
          .select('material_pct, upah_pct, alat_pct, other_pct')
          .eq('rab_item_id', body.rab_item_id)
          .lt('week_start', weekStartISO)

        const prevTotal = (prevLogs ?? []).reduce(
          (s, r) => s + Number(r.material_pct) + Number(r.upah_pct) + Number(r.alat_pct) + Number(r.other_pct),
          0
        )

        // Nilai yang harus ada di baris minggu ini = targetTotal - semua minggu sebelumnya
        const weekTarget = Math.max(0, targetTotal - prevTotal)

        // Distribusikan weekTarget ke komponen proporsional
        const kompTotal = Number(rabItem.material_pct) + Number(rabItem.upah_pct) + Number(rabItem.alat_pct) + Number(rabItem.other_pct)
        if (kompTotal > 0) {
          mat   = parseFloat((weekTarget * Number(rabItem.material_pct) / kompTotal).toFixed(2))
          upah  = parseFloat((weekTarget * Number(rabItem.upah_pct)  / kompTotal).toFixed(2))
          alat  = parseFloat((weekTarget * Number(rabItem.alat_pct)  / kompTotal).toFixed(2))
          other = parseFloat((weekTarget * Number(rabItem.other_pct) / kompTotal).toFixed(2))
          // Koreksi rounding ke upah
          const diff = parseFloat((weekTarget - (mat + upah + alat + other)).toFixed(2))
          upah = parseFloat((upah + diff).toFixed(2))
        } else {
          mat = 0; upah = 0; alat = 0
          other = parseFloat(weekTarget.toFixed(2))
        }

        // Jika row existing sudah ada dengan nilai sama, skip (idempotent)
        if (existing) {
          const existingTotal = Number(existing.material_pct) + Number(existing.upah_pct) + Number(existing.alat_pct) + Number(existing.other_pct)
          if (Math.abs(existingTotal - weekTarget) < 0.01) {
            return reply.status(200).send({ data: existing, skipped: true })
          }
        }
      } else {
        // Mode B: nilai per-komponen langsung dari caller
        mat   = Number(body.material_pct ?? 0)
        upah  = Number(body.upah_pct ?? 0)
        alat  = Number(body.alat_pct ?? 0)
        other = Number(body.other_pct ?? 0)
      }

      const row = {
        project_id:   projectId,
        rab_item_id:  body.rab_item_id,
        week_start:   weekStartISO,
        week_number:  weekNumber,
        material_pct: mat,
        upah_pct:     upah,
        alat_pct:     alat,
        other_pct:    other,
        notes:        body.notes ?? null,
        logged_by:    request.currentUser!.id,
        updated_at:   new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('rab_absorption_log')
        .upsert(row, { onConflict: 'rab_item_id,week_start' })
        .select()
        .single()

      if (error) return reply.status(500).send({ error: error.message })
      return reply.status(201).send({ data })
    }
  )

  // ── GET /api/v1/projects/:projectId/absorption/summary ──────────────────
  // Serapan kumulatif per item (sum semua minggu) — untuk kolom Progress di RAB section
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/absorption/summary',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: logs, error } = await supabase
        .from('rab_absorption_log')
        .select('rab_item_id, material_pct, upah_pct, alat_pct, other_pct')
        .eq('project_id', projectId)

      if (error) return reply.status(500).send({ error: error.message })

      const summaryMap: Record<string, number> = {}
      for (const row of (logs ?? [])) {
        const total = Number(row.material_pct) + Number(row.upah_pct) + Number(row.alat_pct) + Number(row.other_pct)
        summaryMap[row.rab_item_id] = (summaryMap[row.rab_item_id] ?? 0) + total
      }
      for (const id of Object.keys(summaryMap)) {
        summaryMap[id] = Math.min(100, summaryMap[id])
      }

      return { data: summaryMap }
    }
  )

  // ── DELETE /api/v1/projects/:projectId/absorption/:id ────────────────────
  app.delete<{ Params: { projectId: string; id: string } }>(
    '/api/v1/projects/:projectId/absorption/:id',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId, id } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { error } = await supabase
        .from('rab_absorption_log')
        .delete()
        .eq('id', id)
        .eq('project_id', projectId)

      if (error) return reply.status(500).send({ error: error.message })
      return { success: true }
    }
  )
}

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import {
  analisaKeterlambatan,
  type BarisMilestone,
  type ParamProyek,
} from '../../lib/analisa-keterlambatan.js'

/**
 * ANALISA KETERLAMBATAN (F5 PEMBEDA)
 *
 * ── Kenapa modul ini ada
 *
 * Ketiga bahannya SUDAH ADA di basis dan tak pernah diadu:
 *
 *   milestones.target_date / completed_at   kapan seharusnya vs kapan nyata
 *   contract_eot.days_approved              perpanjangan waktu yang DISETUJUI
 *   projects.penalty_*                      tarif denda per hari + grace + cap
 *
 * Diukur 2026-08-06: 16 milestone telat (4 selesai-terlambat, 12 masih
 * berjalan), terparah 67 hari — tanpa satu pun layar yang menghubungkannya
 * ke EOT atau ke rupiah.
 *
 * ── Kenapa EOT diambil, bukan diabaikan
 *
 * Keterlambatan yang sudah dimaafkan lewat EOT BUKAN keterlambatan. Melaporkan
 * "telat 67 hari" pada proyek yang EOT-nya disetujui 60 hari adalah menuduh
 * atas sesuatu yang secara kontrak tak pernah terjadi — dan tuduhan itu bisa
 * dibantah dengan satu lembar surat.
 *
 * ── Kenapa read-only
 *
 * Angka keterlambatan adalah dasar klaim EOT dan negosiasi denda. Angka yang
 * bisa disunting berhenti jadi dasar apa pun — dan yang paling berkepentingan
 * menyuntingnya adalah pihak yang sedang dituduh terlambat.
 */
export default async function analisaKeterlambatanRoutes(app: FastifyInstance) {
  // ── GET /api/v1/analisa-keterlambatan ────────────────────────────────────
  app.get('/api/v1/analisa-keterlambatan', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    const kosong = {
      baris: [], jumlah_selesai_terlambat: 0, jumlah_berjalan_terlambat: 0,
      jumlah_dimaafkan_eot: 0, jumlah_tepat_waktu: 0, jumlah_belum_jatuh_tempo: 0,
      telat_terparah: 0, total_estimasi_paparan: 0, jumlah_proyek_denda_mati: 0,
    }
    if (idProyek.length === 0) return reply.send(kosong)

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const dipakai = q.project_id ? [q.project_id] : idProyek

    // ── Parameter denda per proyek ─────────────────────────────────────────
    const { data: proyek, error: e1 } = await db
      .unsafe('projects', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select(`id, name, penalty_enabled, penalty_rate_per_day, penalty_grace_days,
               penalty_cap_pct, contract_value`)
      .in('id', dipakai)

    if (e1) return reply.status(500).send({ error: e1.message })

    // ── EOT yang DISETUJUI ─────────────────────────────────────────────────
    //
    // Hanya `disetujui` yang mengurangi keterlambatan. Yang masih `diajukan`
    // belum mengubah kewajiban apa pun — memakainya membuat proyek tampak
    // bebas hanya karena suratnya sudah dikirim.
    const { data: eot, error: e2 } = await db
      .unsafe('contract_eot', 'daftar lintas-proyek; dijumlahkan per project_id')
      .select('project_id, days_approved, status')
      .in('project_id', dipakai)
      .eq('status', 'disetujui')

    if (e2) return reply.status(500).send({ error: e2.message })

    const eotPerProyek = new Map<string, number>()
    for (const e of (eot ?? []) as Array<{ project_id: string; days_approved: number | null }>) {
      eotPerProyek.set(e.project_id,
        (eotPerProyek.get(e.project_id) ?? 0) + Math.max(0, Number(e.days_approved) || 0))
    }

    // ── Milestone ──────────────────────────────────────────────────────────
    const { data: ms, error: e3 } = await db
      .unsafe('milestones', 'daftar lintas-proyek; disaring dengan projectIds')
      .select('id, project_id, title, target_date, completed_at, status')
      .in('project_id', dipakai)

    if (e3) return reply.status(500).send({ error: e3.message })

    const param: ParamProyek[] = ((proyek ?? []) as Array<{
      id: string; name: string
      penalty_enabled: boolean | null
      penalty_rate_per_day: number | string | null
      penalty_grace_days: number | string | null
      penalty_cap_pct: number | string | null
      contract_value: number | string | null
    }>).map((p) => ({
      project_id: p.id,
      project_name: p.name,
      eot_hari_disetujui: eotPerProyek.get(p.id) ?? 0,
      penalty_enabled: p.penalty_enabled,
      penalty_rate_per_day: p.penalty_rate_per_day,
      penalty_grace_days: p.penalty_grace_days,
      penalty_cap_pct: p.penalty_cap_pct,
      contract_value: p.contract_value,
    }))

    const milestone = ((ms ?? []) as Array<{
      id: string; project_id: string; title: string
      target_date: string; completed_at: string | null; status: string | null
    }>) as BarisMilestone[]

    // `hariIni` ditentukan DI SINI, bukan di dalam fungsi murninya — supaya
    // fungsinya bisa diuji tanpa hasilnya berubah besok.
    const hariIni = new Date().toISOString().slice(0, 10)

    return reply.send(analisaKeterlambatan(milestone, param, hariIni))
  })
}

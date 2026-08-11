import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  ringkasTimesheet, bolehDiajukan,
  type BarisTimesheet,
} from '../../lib/timesheet-staf.js'

/**
 * TIMESHEET STAF KANTOR (G2b).
 *
 * ── Yang dijawab modul ini
 *
 * Bukan "berapa upah minggu ini" (itu `absensi_harian` + upah mandor yang
 * sudah hidup), melainkan **berapa jam waktu staf kantor dibebankan ke tiap
 * proyek**. Staf digaji bulanan tetap — jamnya tak menentukan gajinya,
 * melainkan menentukan berapa biaya overhead yang jatuh ke proyek mana.
 *
 * ── Peringatan tenancy
 *
 * `pegawai` kategori B (punya `company_id` sendiri).
 * `timesheet_staf` kategori C dengan `lewat: 'pegawai_id'` — BUKAN
 * `project_id` maupun `company_id`. `viaProject('timesheet_staf', projekId)`
 * menyusun `.eq('pegawai_id', projekId)` dan mengembalikan NOL BARIS tanpa
 * galat apa pun. Kesalahan sekelas ini sudah terjadi tiga kali di repo ini.
 *
 * Skema, constraint, dan alasannya ada di `db/migrations/286_*.sql`.
 */

const PEGAWAI_SELECT = `
  id, user_id, nomor_induk, jabatan, departemen, tanggal_masuk, tanggal_keluar,
  jam_standar, status_ptkp, kategori_ter, created_at,
  orang:users ( id, name, email )
`

const TS_SELECT = `
  id, pegawai_id, tanggal, jam_kerja, jam_lembur, project_id, kegiatan,
  catatan, status, disetujui_oleh, disetujui_pada, alasan_tolak,
  proyek:projects ( id, name )
`

/** Bulan `YYYY-MM` → rentang tanggal awal & akhir bulan itu. */
function rentangBulan(bulan: string): { awal: string; akhir: string } | null {
  if (!/^\d{4}-\d{2}$/.test(bulan)) return null
  const [y, m] = bulan.split('-').map(Number)
  if (m < 1 || m > 12) return null
  // `Date.UTC(y, m, 0)` = hari terakhir bulan `m` — menghindari tabel
  // panjang-bulan dan kabisat yang salah ditulis tangan.
  const akhir = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { awal: `${bulan}-01`, akhir }
}

export default async function timesheetStafRoutes(app: FastifyInstance) {
  // ── GET /sdm/pegawai ─────────────────────────────────────────────────────
  //
  // Gaji pokok TIDAK ikut di sini: daftar pegawai dibuka untuk memilih siapa
  // timesheet-nya dilihat, dan itu tak menuntut kewenangan melihat gaji.
  // Yang butuh gaji memakai endpoint payroll dengan permission sendiri.
  app.get(
    '/api/v1/sdm/pegawai',
    { preHandler: [authenticate, requirePermission('sdm:timesheet:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('pegawai')
        .select(PEGAWAI_SELECT)
        .is('tanggal_keluar', null)
        .order('nomor_induk', { ascending: true, nullsFirst: false })
        .limit(500)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat daftar pegawai')
        return reply.status(500).send({ error: 'Gagal memuat daftar pegawai' })
      }
      return reply.send({ pegawai: data ?? [] })
    },
  )

  // ── GET /sdm/pegawai/:id/timesheet?bulan=YYYY-MM ─────────────────────────
  app.get<{ Params: { id: string }; Querystring: { bulan?: string } }>(
    '/api/v1/sdm/pegawai/:id/timesheet',
    { preHandler: [authenticate, requirePermission('sdm:timesheet:view')] },
    async (request, reply) => {
      const { id } = request.params
      const bulan = request.query.bulan ?? new Date().toISOString().slice(0, 7)

      const rentang = rentangBulan(bulan)
      if (!rentang) {
        return reply.status(400).send({ error: 'bulan harus berformat YYYY-MM' })
      }

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai')
        .select(PEGAWAI_SELECT)
        .eq('id', id)
        .maybeSingle()
      if (ePeg) {
        request.log.error({ err: ePeg, id }, 'gagal memuat pegawai')
        return reply.status(500).send({ error: 'Gagal memuat pegawai' })
      }
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      // ⚠ `timesheet_staf` lewat `pegawai_id`, BUKAN project_id.
      const { data: ts, error: eTs } = await request.db!
        .viaProject('timesheet_staf', id)
        .select(TS_SELECT)
        .gte('tanggal', rentang.awal)
        .lte('tanggal', rentang.akhir)
        .order('tanggal', { ascending: false })
        .limit(200)
      if (eTs) {
        request.log.error({ err: eTs, id }, 'gagal memuat timesheet')
        return reply.status(500).send({ error: 'Gagal memuat timesheet' })
      }

      const baris = (ts ?? []) as unknown as BarisTimesheet[]
      const jamStandar = Number((peg as { jam_standar: unknown }).jam_standar) || 8
      const ringkasan = ringkasTimesheet(baris, jamStandar, rentang)

      return reply.send({
        pegawai: peg,
        bulan,
        rentang,
        ringkasan,
        pengajuan: bolehDiajukan(ringkasan),
      })
    },
  )

  // ── POST /sdm/pegawai/:id/timesheet — isi satu hari ──────────────────────
  //
  // Satu baris per hari (constraint `timesheet_pegawai_tanggal_unik`). Kalau
  // sudah ada, ini MEMPERBARUI — bukan menambah baris kedua yang membuat
  // total berlipat.
  app.post<{
    Params: { id: string }
    Body: {
      tanggal?: string; jam_kerja?: number | string; jam_lembur?: number | string
      project_id?: string | null; kegiatan?: string; catatan?: string
    }
  }>(
    '/api/v1/sdm/pegawai/:id/timesheet',
    { preHandler: [authenticate, requirePermission('sdm:timesheet:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(b.tanggal)) {
        return reply.status(400).send({ error: 'tanggal wajib berformat YYYY-MM-DD' })
      }

      // `null` untuk yang kosong, bukan 0 — pelajaran G2a (`Number('') === 0`).
      // Di sini bedanya lebih halus: jam yang memang nol adalah nilai sah
      // (hari libur dengan lembur saja), jadi yang dikosongkan JATUH ke 0
      // dengan sengaja — tapi lewat jalur yang menyatakan itu, bukan lewat
      // kebetulan `Number('')`.
      const jam = (v: unknown): number => {
        if (v === null || v === undefined) return 0
        const s = String(v).trim()
        if (s === '') return 0
        const n = Number(s)
        return Number.isFinite(n) ? n : 0
      }

      const { data: peg, error: ePeg } = await request.db!
        .from('pegawai')
        .select('id')
        .eq('id', id)
        .maybeSingle()
      if (ePeg) return reply.status(500).send({ error: ePeg.message })
      if (!peg) return reply.status(404).send({ error: 'Pegawai tidak ditemukan' })

      // Baris yang SUDAH diputuskan (disetujui/ditolak) tak boleh diubah
      // diam-diam: persetujuan mengikat pada isi yang disetujui, dan
      // mengubahnya sesudahnya membuat yang menyetujui menandatangani
      // sesuatu yang lain.
      const { data: lama, error: eLama } = await request.db!
        .viaProject('timesheet_staf', id)
        .select('id, status')
        .eq('tanggal', b.tanggal)
        .maybeSingle()
      if (eLama) return reply.status(500).send({ error: eLama.message })

      if (lama && (lama as { status: string }).status === 'disetujui') {
        return reply.status(409).send({
          error: 'Timesheet hari ini sudah disetujui — minta atasan membatalkan '
            + 'persetujuannya dulu kalau memang perlu diubah.',
        })
      }

      const isi = {
        pegawai_id: id,
        tanggal: b.tanggal,
        jam_kerja: jam(b.jam_kerja),
        jam_lembur: jam(b.jam_lembur),
        project_id: b.project_id || null,
        kegiatan: b.kegiatan?.trim() || null,
        catatan: b.catatan?.trim() || null,
        // Mengisi ulang baris yang DITOLAK mengembalikannya ke draf —
        // kalau tidak, ia tetap merah selamanya meski sudah diperbaiki.
        status: 'draf' as const,
        alasan_tolak: null,
        updated_at: new Date().toISOString(),
      }

      const q = request.db!.viaProject('timesheet_staf', id)
      const { data, error } = lama
        ? await q.update(isi).eq('id', (lama as { id: string }).id).select(TS_SELECT).maybeSingle()
        : await q.insert(isi).select(TS_SELECT).single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menyimpan timesheet')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Baris timesheet tak ditemukan' })

      return reply.status(lama ? 200 : 201).send({ timesheet: data })
    },
  )

  // ── POST /sdm/pegawai/:id/timesheet/ajukan?bulan=YYYY-MM ─────────────────
  app.post<{ Params: { id: string }; Querystring: { bulan?: string } }>(
    '/api/v1/sdm/pegawai/:id/timesheet/ajukan',
    { preHandler: [authenticate, requirePermission('sdm:timesheet:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const bulan = request.query.bulan ?? new Date().toISOString().slice(0, 7)
      const rentang = rentangBulan(bulan)
      if (!rentang) return reply.status(400).send({ error: 'bulan harus berformat YYYY-MM' })

      // Status lama di WHERE: hanya draf yang diajukan, dan dua pengajuan
      // bersamaan tak boleh sama-sama mengubah baris yang sama.
      const { data, error } = await request.db!
        .viaProject('timesheet_staf', id)
        .update({ status: 'diajukan', updated_at: new Date().toISOString() })
        .eq('status', 'draf')
        .gte('tanggal', rentang.awal)
        .lte('tanggal', rentang.akhir)
        .select('id')

      if (error) {
        request.log.error({ err: error, id }, 'gagal mengajukan timesheet')
        return reply.status(500).send({ error: error.message })
      }
      // Nol baris BUKAN keberhasilan: tak ada draf untuk diajukan.
      if (!data || data.length === 0) {
        return reply.status(409).send({
          error: 'Tak ada baris berstatus draf di bulan ini untuk diajukan.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'timesheet_staf',
        recordId: id,
        newValues: { bulan, diajukan: data.length },
      })
      return reply.send({ diajukan: data.length, bulan })
    },
  )

  // ── POST /sdm/timesheet/:id/putuskan — setujui / tolak ───────────────────
  app.post<{
    Params: { id: string }
    Body: { setujui?: boolean; alasan?: string }
  }>(
    '/api/v1/sdm/timesheet/:id/putuskan',
    { preHandler: [authenticate, requirePermission('sdm:timesheet:approve')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (typeof b.setujui !== 'boolean') {
        return reply.status(400).send({ error: 'setujui wajib true atau false' })
      }
      // Penolakan WAJIB beralasan — yang mengajukan harus tahu apa yang
      // diperbaiki, bukan sekadar bahwa ditolak. Constraint DB menegakkannya;
      // ini pesan yang bisa dibaca di layar.
      if (!b.setujui && !b.alasan?.trim()) {
        return reply.status(400).send({
          error: 'Penolakan wajib beralasan — yang mengajukan harus tahu APA '
            + 'yang perlu diperbaiki',
        })
      }

      const perubahan = b.setujui
        ? {
          status: 'disetujui' as const,
          // Penyetuju diisi SERVER dari sesi, bukan diterima dari klien.
          disetujui_oleh: request.currentUser!.id,
          disetujui_pada: new Date().toISOString(),
          alasan_tolak: null,
          updated_at: new Date().toISOString(),
        }
        : {
          status: 'ditolak' as const,
          alasan_tolak: b.alasan!.trim(),
          disetujui_oleh: null,
          disetujui_pada: null,
          updated_at: new Date().toISOString(),
        }

      // Hanya yang DIAJUKAN yang bisa diputuskan, dan status lama ikut di
      // WHERE — dua keputusan bersamaan tak boleh sama-sama berhasil.
      const { data, error } = await request.db!
        .unsafe('timesheet_staf',
          'id baris langsung + status lama di WHERE; tenancy dijamin RLS lewat pegawai→company')
        .update(perubahan)
        .eq('id', id)
        .eq('status', 'diajukan')
        .select('id, tanggal, status')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memutuskan timesheet')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Baris ini tidak berstatus diajukan — mungkin sudah diputuskan '
            + 'dari tempat lain. Muat ulang halaman.',
        })
      }

      await logAuditEvent(request, {
        action: b.setujui ? 'APPROVE' : 'REJECT',
        actorId: request.currentUser!.id,
        tableName: 'timesheet_staf',
        recordId: id,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ timesheet: data })
    },
  )
}

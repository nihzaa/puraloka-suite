import type { FastifyInstance, FastifyRequest } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import type { TenantDb } from '../../utils/tenant-db.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain, idAlurPersetujuan , periksaGerbangSod } from '../../utils/approval.js'

// Submittal Register — ROADMAP #24c.
//
// Pengajuan kontraktor ke konsultan/owner untuk DISETUJUI sebelum dipakai:
// contoh material, shop drawing, data teknis, hasil uji, metode kerja.
//
// Dua hal yang menentukan berkas ini, keduanya dijelaskan panjang lebar di
// `db/migrations/159_submittal_register.sql`:
//
//   1. REVISI adalah warga kelas satu. Submittal ditolak lalu diajukan ulang
//      adalah alur normal — keramik ditolak karena warna, diganti, ditolak
//      lagi karena ukuran. `induk_id` merantai seluruh percobaan jadi satu
//      perkara, karena "ditolak 3× sebelum disetujui" adalah fakta yang
//      menjelaskan keterlambatan.
//
//   2. Persetujuan lewat WORKFLOW ENGINE, bukan status sendiri. Tak ada kolom
//      `disetujui_oleh` di tabel ini — jejaknya hidup di `approval_progress`,
//      satu tempat untuk seluruh sistem. Membuat mekanisme keempat berarti
//      mengulang persis masalah yang Program B selesaikan.

const SUBMITTAL_SELECT = `
  id, project_id, nomor, judul, jenis, spesifikasi, referensi_spek,
  status, revisi, induk_id, ditujukan_ke, diajukan_pada, keputusan_diharapkan,
  diputuskan_pada, catatan_reviewer, diputuskan_oleh,
  rab_item_id, material_id, menghentikan_pekerjaan,
  diajukan_oleh, created_at, updated_at,
  pengaju:users!submittals_diajukan_oleh_fkey ( id, name ),
  rab_item:rab_items ( id, name, category_code ),
  material:materials ( id, name, code, unit )
`

const TRANSISI: Record<string, string[]> = {
  draft: ['diajukan', 'dibatalkan'],
  // Diajukan → draft TIDAK ADA: yang sudah dilayangkan tak bisa ditarik jadi
  // konsep. Kalau keliru, dibatalkan — dengan jejaknya.
  diajukan: ['disetujui', 'disetujui_catatan', 'ditolak', 'dibatalkan'],
  // Ditolak → tak ada lanjutan di baris INI. Pengajuan ulang membuat baris
  // BARU ber-revisi, supaya riwayat tiap percobaan tetap utuh.
  ditolak: [],
  // Keputusan bisa diralat: konsultan mengoreksi keputusannya sendiri adalah
  // kejadian nyata, dan memaksa pengajuan ulang menghapus fakta bahwa yang
  // berubah adalah keputusan mereka, bukan usulan kita.
  disetujui: ['disetujui_catatan', 'ditolak'],
  disetujui_catatan: ['disetujui', 'ditolak'],
  dibatalkan: ['draft'],
}

const HARI_MS = 86_400_000

/**
 * Berapa hari sebuah pengajuan menunggu keputusan.
 * Definisi TUNGGAL, sama persis dengan RFI (157): belum diajukan → `null`,
 * BUKAN 0. Nol berarti "diputuskan seketika", dan itu tak benar.
 */
function hariMenunggu(diajukan: string | null, diputuskan: string | null): number | null {
  if (!diajukan) return null
  const akhir = diputuskan ? new Date(diputuskan).getTime() : Date.now()
  return Math.floor((akhir - new Date(diajukan).getTime()) / HARI_MS)
}

async function nomorBerikutnya(db: TenantDb, projectId: string): Promise<string> {
  const { data, error } = await db
    .viaProject('submittals', projectId)
    .select('nomor')
    .order('nomor', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Gagal membaca nomor submittal terakhir: ${error.message}`)
  if (!data || data.length === 0) return 'SUB-001'
  // ⚠️ `^SUB-(\d+)` TANPA `$`: nomor revisi berbentuk `SUB-004-R2`, dan pola
  // ber-anchor akhir akan gagal mencocokkannya sehingga penomoran mengulang
  // dari 001 dan menabrak nomor yang sudah dipakai.
  const cocok = /^SUB-(\d+)/.exec(data[0].nomor)
  if (!cocok) return 'SUB-001'
  return `SUB-${String(parseInt(cocok[1], 10) + 1).padStart(3, '0')}`
}

async function ambilSubmittalMilikTenant(
  request: FastifyRequest,
  id: string
): Promise<{
  id: string; project_id: string; nomor: string; judul: string; jenis: string
  status: string; revisi: number; induk_id: string | null
  diajukan_pada: string | null; diajukan_oleh: string
  spesifikasi: string | null; referensi_spek: string | null
  ditujukan_ke: string | null; keputusan_diharapkan: string | null
  rab_item_id: string | null; material_id: string | null
  menghentikan_pekerjaan: boolean
} | null> {
  const { data, error } = await request.db!
    .unsafe('submittals', 'lookup by id: project belum diketahui — hasilnya DIPERIKSA proyekMilikTenant di bawah')
    .select('id, project_id, nomor, judul, jenis, status, revisi, induk_id, diajukan_pada, diajukan_oleh, spesifikasi, referensi_spek, ditujukan_ke, keputusan_diharapkan, rab_item_id, material_id, menghentikan_pekerjaan')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Gagal membaca submittal: ${error.message}`)
  if (!data) return null
  if (!(await proyekMilikTenant(request, data.project_id))) return null
  return data
}

export default async function submittalRoutes(app: FastifyInstance) {
  // ── GET daftar ────────────────────────────────────────────────────────────
  app.get<{ Params: { projectId: string }; Querystring: { status?: string; jenis?: string } }>(
    '/api/v1/projects/:projectId/submittals',
    { preHandler: [authenticate, requirePermission('submittal:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      let q = request.db!
        .viaProject('submittals', projectId)
        .select(SUBMITTAL_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)
      if (request.query.status) q = q.eq('status', request.query.status)
      if (request.query.jenis) q = q.eq('jenis', request.query.jenis)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat submittal')
        return reply.status(500).send({ error: 'Gagal memuat daftar submittal' })
      }

      const denganHitungan = (data ?? []).map((b: Record<string, unknown>) => ({
        ...b,
        hari_menunggu: hariMenunggu(
          b.diajukan_pada as string | null,
          b.diputuskan_pada as string | null
        ),
      }))

      const { data: rekap, error: errRekap } = await request.db!
        .viaProject('submittals', projectId)
        .select('status, diajukan_pada, diputuskan_pada, menghentikan_pekerjaan, induk_id')

      if (errRekap) request.log.error({ err: errRekap, projectId }, 'gagal menghitung rekap submittal')

      const semua = rekap ?? []
      const perStatus: Record<string, number> = {}
      for (const b of semua) perStatus[b.status] = (perStatus[b.status] ?? 0) + 1

      const menunggu = semua.filter((b) => b.status === 'diajukan')
      const hariTiapnya = menunggu
        .map((b) => hariMenunggu(b.diajukan_pada, null))
        .filter((h): h is number => h !== null)

      return reply.send({
        data: denganHitungan,
        meta: {
          per_status: perStatus,
          total: semua.length,
          menunggu: menunggu.length,
          memblokir: menunggu.filter((b) => b.menghentikan_pekerjaan).length,
          // Terlama, bukan rata-rata — alasan yang sama dengan RFI (157):
          // rata-rata menyamarkan satu pengajuan tertahan berminggu-minggu.
          menunggu_terlama_hari: hariTiapnya.length ? Math.max(...hariTiapnya) : 0,
          // Berapa pengajuan yang PERNAH ditolak. Angka ini yang menjelaskan
          // keterlambatan pengadaan — dan hilang kalau tiap revisi dihitung
          // sebagai perkara terpisah.
          pernah_direvisi: semua.filter((b) => b.induk_id !== null).length,
          rekap_lengkap: !errRekap,
        },
      })
    }
  )

  // ── POST ──────────────────────────────────────────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/submittals',
    { preHandler: [authenticate, requirePermission('submittal:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const body = request.body as {
        judul?: string; jenis?: string; spesifikasi?: string; referensi_spek?: string
        ditujukan_ke?: string; keputusan_diharapkan?: string
        rab_item_id?: string; material_id?: string; menghentikan_pekerjaan?: boolean
      }
      const judul = (body.judul ?? '').trim()
      if (!judul) return reply.status(400).send({ error: 'Judul pengajuan wajib diisi' })

      let terakhir: string | null = null
      for (let percobaan = 0; percobaan < 5; percobaan++) {
        const nomor = await nomorBerikutnya(request.db!, projectId)
        const { data, error } = await request.db!
          .viaProject('submittals', projectId)
          .insert({
            project_id: projectId,
            nomor,
            judul,
            jenis: body.jenis ?? 'contoh_material',
            spesifikasi: body.spesifikasi ?? null,
            referensi_spek: body.referensi_spek ?? null,
            ditujukan_ke: body.ditujukan_ke ?? null,
            keputusan_diharapkan: body.keputusan_diharapkan ?? null,
            rab_item_id: body.rab_item_id ?? null,
            material_id: body.material_id ?? null,
            menghentikan_pekerjaan: body.menghentikan_pekerjaan ?? false,
            diajukan_oleh: request.currentUser!.id,
          })
          .select(SUBMITTAL_SELECT)
          .single()

        if (!error) {
          await logAuditEvent(request, {
            tableName: 'submittals', recordId: data.id, action: 'INSERT',
            actorId: request.currentUser!.id,
            newValues: { nomor, judul, jenis: data.jenis },
          })
          return reply.status(201).send({ data: { ...data, hari_menunggu: null } })
        }
        if (error.code !== '23505') {
          request.log.error({ err: error, projectId }, 'gagal membuat submittal')
          return reply.status(500).send({ error: 'Gagal menyimpan pengajuan' })
        }
        terakhir = error.message
      }
      request.log.error({ projectId, terakhir }, 'nomor submittal direbut 5x berturut-turut')
      return reply.status(409).send({ error: 'Nomor pengajuan direbut berkali-kali. Coba lagi.' })
    }
  )

  // ── POST ajukan ulang (revisi) ────────────────────────────────────────────
  // Endpoint TERSENDIRI, bukan PATCH status. Alasannya bukan gaya: pengajuan
  // ulang membuat baris BARU, dan menyembunyikannya di balik "ubah status"
  // membuat pemanggil mengira barisnya sama — lalu menautkan lampiran ke
  // pengajuan yang sudah ditolak.
  app.post<{ Params: { id: string } }>(
    '/api/v1/submittals/:id/revisi',
    { preHandler: [authenticate, requirePermission('submittal:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      if (lama.status !== 'ditolak' && lama.status !== 'disetujui_catatan') {
        return reply.status(409).send({
          error: `Pengajuan berstatus '${lama.status}' tidak perlu direvisi. `
            + 'Revisi hanya untuk yang ditolak atau disetujui dengan catatan.',
        })
      }

      const body = request.body as {
        judul?: string; spesifikasi?: string; referensi_spek?: string
        material_id?: string; keputusan_diharapkan?: string
      }

      // Akar rantai: kalau `lama` sendiri sudah revisi, induknya diwarisi —
      // supaya seluruh percobaan menunjuk ke pengajuan PERTAMA, bukan
      // membentuk rantai berjenjang yang harus ditelusuri satu per satu.
      const akar = lama.induk_id ?? lama.id
      const revisiBaru = lama.revisi + 1
      const nomorBaru = `${lama.nomor.replace(/-R\d+$/, '')}-R${revisiBaru}`

      const { data, error } = await request.db!
        .viaProject('submittals', lama.project_id)
        .insert({
          project_id: lama.project_id,
          nomor: nomorBaru,
          judul: (body.judul ?? lama.judul).trim(),
          jenis: lama.jenis,
          spesifikasi: body.spesifikasi ?? lama.spesifikasi,
          referensi_spek: body.referensi_spek ?? lama.referensi_spek,
          ditujukan_ke: lama.ditujukan_ke,
          keputusan_diharapkan: body.keputusan_diharapkan ?? lama.keputusan_diharapkan,
          rab_item_id: lama.rab_item_id,
          material_id: body.material_id ?? lama.material_id,
          menghentikan_pekerjaan: lama.menghentikan_pekerjaan,
          revisi: revisiBaru,
          induk_id: akar,
          diajukan_oleh: request.currentUser!.id,
        })
        .select(SUBMITTAL_SELECT)
        .single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: `Revisi ${revisiBaru} sudah ada untuk pengajuan ini` })
        }
        request.log.error({ err: error, id }, 'gagal membuat revisi submittal')
        return reply.status(500).send({ error: 'Gagal membuat revisi' })
      }

      await logAuditEvent(request, {
        tableName: 'submittals', recordId: data.id, action: 'INSERT',
        actorId: request.currentUser!.id,
        newValues: { nomor: nomorBaru, revisi: revisiBaru, induk_id: akar, dari: lama.nomor },
      })

      return reply.status(201).send({ data: { ...data, hari_menunggu: null } })
    }
  )

  // ── PATCH isi (hanya draft) ───────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/submittals/:id',
    { preHandler: [authenticate, requirePermission('submittal:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      // Isi BEKU begitu diajukan. Kalau bisa diubah belakangan, keputusan
      // konsultan akan tampak menyetujui usulan yang tak pernah mereka lihat.
      if (lama.status !== 'draft') {
        return reply.status(409).send({
          error: `Pengajuan berstatus '${lama.status}' tidak bisa disunting — sudah `
            + 'dilayangkan. Untuk mengubah usulan, ajukan revisi.',
        })
      }

      const body = request.body as Record<string, unknown>
      const boleh = [
        'judul', 'jenis', 'spesifikasi', 'referensi_spek', 'ditujukan_ke',
        'keputusan_diharapkan', 'rab_item_id', 'material_id', 'menghentikan_pekerjaan',
      ]
      const perubahan: Record<string, unknown> = {}
      for (const k of boleh) if (k in body) perubahan[k] = body[k]
      if (Object.keys(perubahan).length === 0) {
        return reply.status(400).send({ error: 'Tidak ada field yang bisa diubah' })
      }

      const { data, error } = await request.db!
        .viaProject('submittals', lama.project_id)
        .update(perubahan).eq('id', id).select(SUBMITTAL_SELECT).single()
      if (error) {
        request.log.error({ err: error, id }, 'gagal menyunting submittal')
        return reply.status(500).send({ error: 'Gagal menyimpan perubahan' })
      }

      await logAuditEvent(request, {
        tableName: 'submittals', recordId: id, action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: Object.fromEntries(
          Object.keys(perubahan).map((k) => [k, (lama as Record<string, unknown>)[k]])
        ),
        newValues: perubahan,
      })
      return reply.send({ data })
    }
  )

  // ── PATCH ajukan / batalkan ───────────────────────────────────────────────
  // Mengajukan dan membatalkan TIDAK lewat rantai approval — keduanya tindakan
  // pengaju atas pengajuannya sendiri. Yang lewat rantai hanya KEPUTUSAN.
  app.patch<{ Params: { id: string } }>(
    '/api/v1/submittals/:id/status',
    { preHandler: [authenticate, requirePermission('submittal:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      const body = request.body as { status?: string; diajukan_pada?: string }
      const baru = body.status
      if (!baru) return reply.status(400).send({ error: 'Field `status` wajib' })

      // Keputusan punya endpointnya sendiri karena ia lewat rantai approval.
      if (['disetujui', 'disetujui_catatan', 'ditolak'].includes(baru)) {
        return reply.status(400).send({
          error: 'Keputusan dicatat lewat POST /api/v1/submittals/:id/keputusan — '
            + 'ia melewati rantai persetujuan, bukan perubahan status biasa',
        })
      }

      const sah = TRANSISI[lama.status] ?? []
      if (!sah.includes(baru)) {
        return reply.status(422).send({
          error: `Tidak bisa mengubah status dari '${lama.status}' ke '${baru}'`,
          transisi_yang_boleh: sah,
        })
      }

      const perubahan: Record<string, unknown> = { status: baru }
      if (baru === 'diajukan') {
        const aju = body.diajukan_pada ?? new Date().toISOString()
        if (new Date(aju).getTime() > Date.now() + 60_000) {
          return reply.status(400).send({
            error: 'Tanggal pengajuan tidak boleh di masa depan — lama menunggu '
              + 'akan terhitung negatif',
          })
        }
        perubahan.diajukan_pada = aju
      }
      // Dikembalikan ke draft: jejak persetujuan yang mungkin sudah tercatat
      // DIBUANG, kalau tidak pengajuan yang sedang disunting tampak sudah
      // sebagian disetujui.
      if (baru === 'draft') {
        await clearApprovalProgress('submittal', id, request.companyId!)
      }

      const { data, error } = await request.db!
        .viaProject('submittals', lama.project_id)
        .update(perubahan).eq('id', id).select(SUBMITTAL_SELECT).single()
      if (error) {
        request.log.error({ err: error, id, baru }, 'gagal mengubah status submittal')
        return reply.status(500).send({ error: 'Gagal mengubah status pengajuan' })
      }

      await logAuditEvent(request, {
        tableName: 'submittals', recordId: id, action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: { status: lama.status },
        newValues: perubahan,
        severity: baru === 'diajukan' ? 'critical' : 'info',
      })

      return reply.send({
        data: { ...data, hari_menunggu: hariMenunggu(data.diajukan_pada, data.diputuskan_pada) },
      })
    }
  )

  // ── POST keputusan (lewat rantai approval) ────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/submittals/:id/keputusan',
    { preHandler: [authenticate] },
    async (request, reply) => {
      // Gerbang KASAR sebelum entitas di-fetch: user tak berwenang dapat 403
      // tanpa pernah tahu id-nya ada — mencegah kebocoran keberadaan lewat
      // beda 403 vs 404.
      const gerbang = await canParticipateInChain(request, 'submittal')
      if (gerbang.configError) {
        request.log.error({ configError: gerbang.configError }, 'rantai approval submittal tak terbaca')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!gerbang.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      if (lama.status !== 'diajukan') {
        return reply.status(409).send({
          error: `Hanya pengajuan berstatus 'diajukan' yang bisa diputuskan `
            + `(sekarang '${lama.status}')`,
        })
      }

      const body = request.body as {
        keputusan?: string; catatan?: string; diputuskan_oleh?: string
      }
      const keputusan = body.keputusan
      if (!keputusan || !['disetujui', 'disetujui_catatan', 'ditolak'].includes(keputusan)) {
        return reply.status(400).send({
          error: '`keputusan` harus salah satu: disetujui, disetujui_catatan, ditolak',
        })
      }

      const catatan = (body.catatan ?? '').trim()
      // "Boleh dipakai" tanpa menyebut syaratnya membuat syaratnya HILANG, dan
      // pekerjaan berjalan dengan asumsi yang salah. Karena itu
      // `disetujui_catatan` sama wajibnya beralasan dengan `ditolak`.
      if ((keputusan === 'ditolak' || keputusan === 'disetujui_catatan') && !catatan) {
        return reply.status(400).send({
          error: keputusan === 'ditolak'
            ? 'Alasan penolakan wajib — pengaju harus tahu apa yang harus diganti'
            : 'Catatan wajib saat disetujui dengan catatan — syarat yang tak '
              + 'tertulis akan hilang dan pekerjaan berjalan dengan asumsi salah',
        })
      }

      // Submittal tak punya nilai rupiah, jadi `amount: null` — rantai
      // ber-ambang nominal tak berlaku di sini, dan itu benar: keputusan
      // teknis tak berjenjang menurut harga.
      const decision = await evaluateEntityApproval(request, {
        entityType: 'submittal', entityId: id, amount: null,
      })
      // Gagal baca konfigurasi TIDAK boleh menyamar jadi "tidak berhak"
      // (Phase 1 §4E) — yang satu bug, yang lain keputusan otorisasi.
      if (decision.configError) {
        request.log.error({ configError: decision.configError, id }, 'evaluasi rantai submittal gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!decision.allowed) {
        if (decision.reason === 'already_approved') {
          return reply.status(409).send({ error: 'Pengajuan ini sudah diputuskan penuh' })
        }
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      // TJS-P4 — pengaju tak boleh menyetujui pengajuannya sendiri.
      const sod = await periksaGerbangSod(request, 'submittal', id, {
        alasanOverride: (request.body as { alasan_override?: string } | undefined)?.alasan_override,
        level: decision.step?.level,
      })
      if (!sod.ok) return reply.status(403).send({ error: sod.pesan })
      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'submittal', entityId: id, level: decision.step.level,
          approvedBy: request.currentUser!.id, note: catatan || null,
          companyId: request.companyId!,
        })
        if (!rec.ok) {
          return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })
        }

        // Bukan langkah terakhir → status BELUM berubah. Pengajuan tetap
        // 'diajukan' sampai seluruh level selesai.
        if (!decision.isFinalStep) {
          const berikut = decision.applicable.find((s) => s.level > decision.step!.level)
          await logAuditEvent(request, {
            tableName: 'submittals', recordId: id, action: 'submittal.approval.level',
            // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
            // Lihat `idAlurPersetujuan` di utils/approval.ts.
            workflowId: idAlurPersetujuan(id),
            actorId: request.currentUser!.id,
            newValues: { level: decision.step.level, of: decision.applicable.length },
            severity: 'critical',
          })
          return reply.send({
            data: null,
            pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. `
              + `Menunggu level ${berikut?.level ?? '-'}.`,
          })
        }
      }

      const { data, error } = await request.db!
        .viaProject('submittals', lama.project_id)
        .update({
          status: keputusan,
          diputuskan_pada: new Date().toISOString(),
          catatan_reviewer: catatan || null,
          diputuskan_oleh: body.diputuskan_oleh?.trim() ?? null,
        })
        .eq('id', id)
        .select(SUBMITTAL_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id, keputusan }, 'gagal menyimpan keputusan submittal')
        return reply.status(500).send({ error: 'Gagal menyimpan keputusan' })
      }

      await logAuditEvent(request, {
        tableName: 'submittals', recordId: id, action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: { status: lama.status },
        newValues: { status: keputusan, catatan_reviewer: catatan || null },
        // Menyetujui material yang akan terpasang permanen adalah keputusan
        // yang dipertanggungjawabkan, bukan penyuntingan.
        severity: 'critical',
      })

      return reply.send({
        data: { ...data, hari_menunggu: hariMenunggu(data.diajukan_pada, data.diputuskan_pada) },
      })
    }
  )

  // ── DELETE ────────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/submittals/:id',
    { preHandler: [authenticate, requirePermission('submittal:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      if (lama.status !== 'draft') {
        return reply.status(409).send({
          error: `Pengajuan berstatus '${lama.status}' tidak bisa dihapus — sudah `
            + 'menjadi bagian korespondensi resmi. Gunakan status `dibatalkan`.',
        })
      }

      const { error } = await request.db!
        .viaProject('submittals', lama.project_id).delete().eq('id', id)
      if (error) {
        request.log.error({ err: error, id }, 'gagal menghapus submittal')
        return reply.status(500).send({ error: 'Gagal menghapus pengajuan' })
      }

      await logAuditEvent(request, {
        tableName: 'submittals', recordId: id, action: 'DELETE',
        actorId: request.currentUser!.id,
        oldValues: { nomor: lama.nomor, judul: lama.judul },
        severity: 'critical',
      })
      return reply.send({ success: true })
    }
  )

  // ── Lampiran ──────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/submittals/:id/documents',
    { preHandler: [authenticate, requirePermission('submittal:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      const body = request.body as { document_id?: string }
      if (!body.document_id) return reply.status(400).send({ error: 'Field `document_id` wajib' })

      // Dokumen harus milik PROYEK YANG SAMA — tanpa cek ini, berkas proyek
      // lain (termasuk perusahaan lain) bisa dilampirkan sebagai bukti.
      const { data: dok } = await request.db!
        .viaProject('documents', lama.project_id)
        .select('id, project_id').eq('id', body.document_id).maybeSingle()
      if (!dok || dok.project_id !== lama.project_id) {
        return reply.status(404).send({ error: 'Dokumen tidak ditemukan di proyek ini' })
      }

      const { data, error } = await request.db!
        .unsafe('submittal_documents', 'kategori C lewat submittal_id; induknya sudah lewat ambilSubmittalMilikTenant')
        .insert({ submittal_id: id, document_id: body.document_id })
        .select('id, submittal_id, document_id, created_at')
        .single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: 'Dokumen itu sudah terlampir' })
        }
        request.log.error({ err: error, id }, 'gagal melampirkan dokumen submittal')
        return reply.status(500).send({ error: 'Gagal melampirkan dokumen' })
      }
      return reply.status(201).send({ data })
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/v1/submittals/:id/documents',
    { preHandler: [authenticate, requirePermission('submittal:view')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      const { data, error } = await request.db!
        .unsafe('submittal_documents', 'kategori C lewat submittal_id; induknya sudah lewat ambilSubmittalMilikTenant')
        .select('id, created_at, dokumen:documents ( id, title, doc_type, file_url, file_extension, file_size_kb )')
        .eq('submittal_id', id)
        .order('created_at', { ascending: true })

      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat lampiran submittal')
        return reply.status(500).send({ error: 'Gagal memuat lampiran' })
      }
      return reply.send({ data: data ?? [] })
    }
  )

  // ── GET riwayat revisi ────────────────────────────────────────────────────
  // Seluruh percobaan satu perkara, urut. "Ditolak 3× sebelum disetujui"
  // adalah fakta yang menjelaskan keterlambatan pengadaan — dan itu hanya
  // terbaca kalau percobaannya dirantai, bukan berdiri sendiri-sendiri.
  app.get<{ Params: { id: string } }>(
    '/api/v1/submittals/:id/riwayat',
    { preHandler: [authenticate, requirePermission('submittal:view')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilSubmittalMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Pengajuan tidak ditemukan' })

      const akar = lama.induk_id ?? lama.id
      const { data, error } = await request.db!
        .viaProject('submittals', lama.project_id)
        .select('id, nomor, revisi, status, diajukan_pada, diputuskan_pada, catatan_reviewer')
        .or(`id.eq.${akar},induk_id.eq.${akar}`)
        .order('revisi', { ascending: true })

      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat riwayat revisi')
        return reply.status(500).send({ error: 'Gagal memuat riwayat revisi' })
      }

      const daftar: Array<Record<string, unknown> & { hari_menunggu: number | null }> =
        (data ?? []).map((b: Record<string, unknown>) => ({
          ...b,
          hari_menunggu: hariMenunggu(
            b.diajukan_pada as string | null,
            b.diputuskan_pada as string | null
          ),
        }))

      return reply.send({
        data: daftar,
        meta: {
          percobaan: daftar.length,
          ditolak: daftar.filter((b) => b.status === 'ditolak').length,
          // Total hari dari pengajuan PERTAMA sampai keputusan terakhir —
          // inilah biaya waktu sesungguhnya dari sebuah submittal, bukan lama
          // percobaan terakhir saja.
          total_hari: daftar.reduce(
            (t, b) => t + ((b.hari_menunggu as number | null) ?? 0), 0),
        },
      })
    }
  )
}

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import type { TenantDb } from '../../utils/tenant-db.js'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { createNotifications } from '../../utils/notifications.js'
import { logAuditEvent } from '../../utils/audit.js'

// Punch List / Snagging — ROADMAP #24 (Capability Tier-2).
//
// Daftar cacat: apa yang salah, di mana, siapa yang memperbaiki, dan siapa yang
// menyatakan perbaikannya sah. Rancangan tabel + alasan tiap keputusan ada di
// `db/migrations/156_punch_list.sql` — dibaca dulu sebelum mengubah file ini.
//
// Tiga capability, bukan satu:
//   punch:view    — melihat
//   punch:manage  — mencatat, menugaskan, mengklaim perbaikan
//   punch:verify  — menyatakan perbaikan sah dan menutup
//
// Pemisahan verify dari manage adalah inti modul ini: yang memperbaiki tidak
// boleh menutup perkaranya sendiri. Kalau tidak, punch list berubah jadi
// daftar niat.

const PUNCH_SELECT = `
  id,
  project_id,
  nomor,
  judul,
  deskripsi,
  lokasi,
  severity,
  status,
  rab_item_id,
  work_scope_id,
  ditemukan_oleh,
  ditugaskan_ke,
  diverifikasi_oleh,
  diverifikasi_pada,
  alasan_penolakan,
  target_selesai,
  ditutup_pada,
  created_at,
  updated_at,
  penemu:users!punch_items_ditemukan_oleh_fkey ( id, name ),
  petugas:users!punch_items_ditugaskan_ke_fkey ( id, name ),
  verifikator:users!punch_items_diverifikasi_oleh_fkey ( id, name ),
  rab_item:rab_items ( id, name, category_code, level ),
  work_scope:work_scopes ( id, scope_name )
`

/** Status yang boleh menyusul status tertentu. Transisi di luar ini ditolak. */
const TRANSISI_SAH: Record<string, string[]> = {
  terbuka: ['dikerjakan', 'menunggu_cek', 'ditolak'],
  // Boleh mundur ke `terbuka` — penugasan bisa dicabut saat mandornya berganti.
  dikerjakan: ['menunggu_cek', 'terbuka', 'ditolak'],
  // `menunggu_cek` → `dikerjakan` adalah jalur "verifikator menolak hasil":
  // perkaranya kembali dikerjakan, TIDAK ditutup dan tidak hilang.
  menunggu_cek: ['ditutup', 'dikerjakan', 'ditolak'],
  // Membuka kembali perkara yang sudah ditutup harus mungkin — cacat yang
  // "selesai" lalu muncul lagi adalah kejadian normal, dan memaksa orang
  // membuat perkara BARU memutus riwayatnya.
  ditutup: ['dikerjakan'],
  ditolak: ['terbuka'],
}

/**
 * Nomor perkara berikutnya untuk sebuah proyek.
 *
 * ⚠️ Pola "baca terakhir lalu +1" BALAPAN. Di modul lain (change-orders)
 * konsekuensinya kecil — dua CO dibuat bersamaan itu jarang. Di sini tidak:
 * beberapa orang berkeliling lokasi yang sama dan mencatat temuan pada menit
 * yang sama adalah cara kerja normal punch list.
 *
 * Karena itu penomoran di sini DICOBA ULANG terhadap indeks unik
 * `(project_id, nomor)`, bukan sekadar mengandalkan indeks itu untuk menolak.
 * Menolak permintaan kedua dengan 500 berarti temuan lapangan HILANG — orangnya
 * sudah berjalan ke ruangan berikutnya.
 */
async function nomorBerikutnya(db: TenantDb, projectId: string): Promise<string> {
  const { data, error } = await db
    .viaProject('punch_items', projectId)
    .select('nomor')
    .order('nomor', { ascending: false })
    .limit(1)

  // Gagal baca ≠ belum ada perkara. `?? []` di sini akan mengubah kegagalan
  // jadi "mulai dari PL-001" dan menabrak nomor yang sudah dipakai.
  if (error) throw new Error(`Gagal membaca nomor punch terakhir: ${error.message}`)
  if (!data || data.length === 0) return 'PL-001'

  const cocok = /^PL-(\d+)$/.exec(data[0].nomor)
  if (!cocok) return 'PL-001'
  return `PL-${String(parseInt(cocok[1], 10) + 1).padStart(3, '0')}`
}

export default async function punchListRoutes(app: FastifyInstance) {
  // ── GET /api/v1/projects/:projectId/punch-items ───────────────────────────
  app.get<{ Params: { projectId: string }; Querystring: { status?: string; severity?: string } }>(
    '/api/v1/projects/:projectId/punch-items',
    { preHandler: [authenticate, requirePermission('punch:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      let q = request.db!
        .viaProject('punch_items', projectId)
        .select(PUNCH_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)

      if (request.query.status) q = q.eq('status', request.query.status)
      if (request.query.severity) q = q.eq('severity', request.query.severity)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat punch items')
        return reply.status(500).send({ error: 'Gagal memuat daftar temuan' })
      }

      // Ringkasan ikut dikirim supaya UI tak perlu menghitung ulang dari 200
      // baris pertama — angka yang dihitung dari halaman pertama saja akan
      // SALAH begitu perkaranya lebih dari 200, dan salahnya tak terlihat.
      const { data: rekap, error: errRekap } = await request.db!
        .viaProject('punch_items', projectId)
        .select('status, severity')

      if (errRekap) {
        request.log.error({ err: errRekap, projectId }, 'gagal menghitung rekap punch')
      }

      const perStatus: Record<string, number> = {}
      const perSeverity: Record<string, number> = {}
      for (const b of rekap ?? []) {
        perStatus[b.status] = (perStatus[b.status] ?? 0) + 1
        perSeverity[b.severity] = (perSeverity[b.severity] ?? 0) + 1
      }

      return reply.send({
        data: data ?? [],
        meta: {
          per_status: perStatus,
          per_severity: perSeverity,
          total: (rekap ?? []).length,
          // Terbuka + dikerjakan + menunggu_cek = yang masih menghalangi serah
          // terima. `ditolak` TIDAK dihitung — itu perkara yang dinyatakan
          // tidak berlaku, bukan pekerjaan tersisa.
          belum_selesai: (rekap ?? []).filter(
            (b) => b.status !== 'ditutup' && b.status !== 'ditolak'
          ).length,
          rekap_lengkap: !errRekap,
        },
      })
    }
  )

  // ── POST /api/v1/projects/:projectId/punch-items ──────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/punch-items',
    { preHandler: [authenticate, requirePermission('punch:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const body = request.body as {
        judul?: string; deskripsi?: string; lokasi?: string
        severity?: string; rab_item_id?: string; work_scope_id?: string
        ditugaskan_ke?: string; target_selesai?: string
      }

      const judul = (body.judul ?? '').trim()
      if (!judul) return reply.status(400).send({ error: 'Judul temuan wajib diisi' })

      // Coba beberapa kali: nomor bisa direbut permintaan lain di antara baca
      // dan tulis. Batas 5 dipilih supaya kegagalan NYATA (mis. constraint lain
      // yang dilanggar) tetap muncul sebagai error, bukan berputar selamanya.
      let terakhir: string | null = null
      for (let percobaan = 0; percobaan < 5; percobaan++) {
        const nomor = await nomorBerikutnya(request.db!, projectId)
        const { data, error } = await request.db!
          .viaProject('punch_items', projectId)
          .insert({
            project_id: projectId,
            nomor,
            judul,
            deskripsi: body.deskripsi ?? null,
            lokasi: body.lokasi ?? null,
            severity: body.severity ?? 'sedang',
            rab_item_id: body.rab_item_id ?? null,
            work_scope_id: body.work_scope_id ?? null,
            ditemukan_oleh: request.currentUser!.id,
            ditugaskan_ke: body.ditugaskan_ke ?? null,
            target_selesai: body.target_selesai ?? null,
          })
          .select(PUNCH_SELECT)
          .single()

        if (!error) {
          await logAuditEvent(request, {
            tableName: 'punch_items',
            recordId: data.id,
            action: 'INSERT',
            actorId: request.currentUser!.id,
            newValues: { nomor, judul, severity: data.severity },
          })

          // Beri tahu yang ditugaskan — temuan tanpa pemberitahuan adalah
          // temuan yang baru diketahui saat serah terima.
          if (body.ditugaskan_ke) {
            await createNotifications([{
              company_id: request.companyId!,
              user_id: body.ditugaskan_ke,
              title: `Temuan baru: ${nomor}`,
              message: `${judul}${body.lokasi ? ` — ${body.lokasi}` : ''}`,
              type: 'punch_assigned',
              priority: data.severity === 'kritis' ? 'urgent'
                : data.severity === 'berat' ? 'high' : 'normal',
              project_id: projectId,
              action_url: `/lapangan/punch-list?item=${data.id}`,
            }])
          }

          return reply.status(201).send({ data })
        }

        // 23505 = nomor direbut. Ulangi dengan nomor baru.
        if (error.code !== '23505') {
          request.log.error({ err: error, projectId }, 'gagal membuat punch item')
          return reply.status(500).send({ error: 'Gagal mencatat temuan' })
        }
        terakhir = error.message
      }

      request.log.error({ projectId, terakhir }, 'nomor punch direbut 5x berturut-turut')
      return reply.status(409).send({
        error: 'Nomor temuan direbut permintaan lain berkali-kali. Coba lagi.',
      })
    }
  )

  // ── PATCH /api/v1/punch-items/:id ─────────────────────────────────────────
  // Sunting isi (bukan status — status punya endpointnya sendiri di bawah,
  // karena aturan transisinya berbeda dan verifikasi butuh capability lain).
  app.patch<{ Params: { id: string } }>(
    '/api/v1/punch-items/:id',
    { preHandler: [authenticate, requirePermission('punch:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilPunchMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      const body = request.body as Record<string, unknown>
      const boleh = [
        'judul', 'deskripsi', 'lokasi', 'severity',
        'rab_item_id', 'work_scope_id', 'ditugaskan_ke', 'target_selesai',
      ]
      const perubahan: Record<string, unknown> = {}
      for (const k of boleh) if (k in body) perubahan[k] = body[k]

      if (Object.keys(perubahan).length === 0) {
        return reply.status(400).send({ error: 'Tidak ada field yang bisa diubah' })
      }

      const { data, error } = await request.db!
        .viaProject('punch_items', lama.project_id)
        .update(perubahan)
        .eq('id', id)
        .select(PUNCH_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menyunting punch item')
        return reply.status(500).send({ error: 'Gagal menyimpan perubahan' })
      }

      await logAuditEvent(request, {
        tableName: 'punch_items',
        recordId: id,
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: Object.fromEntries(
          Object.keys(perubahan).map((k) => [k, (lama as Record<string, unknown>)[k]])
        ),
        newValues: perubahan,
      })

      return reply.send({ data })
    }
  )

  // ── PATCH /api/v1/punch-items/:id/status ──────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/punch-items/:id/status',
    { preHandler: [authenticate, requirePermission('punch:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilPunchMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      const body = request.body as { status?: string; alasan_penolakan?: string }
      const baru = body.status
      if (!baru) return reply.status(400).send({ error: 'Field `status` wajib' })

      const sah = TRANSISI_SAH[lama.status] ?? []
      if (!sah.includes(baru)) {
        return reply.status(422).send({
          error: `Tidak bisa mengubah status dari '${lama.status}' ke '${baru}'`,
          transisi_yang_boleh: sah,
        })
      }

      // ⚠️ MENUTUP butuh `punch:verify`, bukan `punch:manage`. Inilah tempat
      // pemisahan itu benar-benar berlaku — di tabel ia hanya kolom terpisah;
      // di sini ia menolak permintaan. Tanpa cek ini, siapa pun yang bisa
      // mengklaim "sudah diperbaiki" juga bisa menyatakan perbaikannya sah.
      if (baru === 'ditutup') {
        if (!(await hasPermission(request, 'punch:verify'))) {
          return reply.status(403).send({
            error: 'Menutup temuan butuh permission punch:verify — pelaksana '
              + 'tidak boleh menyatakan perbaikannya sendiri sah',
          })
        }
        // Pelaksana tetap tak boleh menutup perkaranya sendiri walau ia
        // KEBETULAN punya punch:verify (mis. seorang PM yang juga mengerjakan).
        // Capability menjawab "boleh apa", bukan "boleh atas perkara siapa".
        if (lama.ditugaskan_ke && lama.ditugaskan_ke === request.currentUser!.id) {
          return reply.status(403).send({
            error: 'Anda yang ditugaskan memperbaiki temuan ini — verifikasi '
              + 'harus dilakukan orang lain',
          })
        }
      }

      if (baru === 'ditolak' && !(body.alasan_penolakan ?? '').trim()) {
        return reply.status(400).send({
          error: 'Alasan penolakan wajib diisi — temuan yang ditolak tanpa '
            + 'alasan tak bisa dibedakan dari yang dihapus diam-diam',
        })
      }

      const perubahan: Record<string, unknown> = { status: baru }
      if (baru === 'ditutup') {
        perubahan.diverifikasi_oleh = request.currentUser!.id
        perubahan.diverifikasi_pada = new Date().toISOString()
        perubahan.ditutup_pada = new Date().toISOString()
      }
      if (baru === 'ditolak') {
        perubahan.alasan_penolakan = body.alasan_penolakan!.trim()
      }
      // Dibuka kembali: jejak verifikasi lama DIBUANG. Membiarkannya membuat
      // perkara yang sedang terbuka tampak sudah diverifikasi.
      if (lama.status === 'ditutup' && baru !== 'ditutup') {
        perubahan.diverifikasi_oleh = null
        perubahan.diverifikasi_pada = null
        perubahan.ditutup_pada = null
      }

      const { data, error } = await request.db!
        .viaProject('punch_items', lama.project_id)
        .update(perubahan)
        .eq('id', id)
        .select(PUNCH_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id, baru }, 'gagal mengubah status punch')
        return reply.status(500).send({ error: 'Gagal mengubah status temuan' })
      }

      await logAuditEvent(request, {
        tableName: 'punch_items',
        recordId: id,
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: { status: lama.status },
        newValues: perubahan,
        // Menutup/menolak temuan mengubah apa yang dianggap selesai saat serah
        // terima — itu keputusan, bukan penyuntingan.
        severity: (baru === 'ditutup' || baru === 'ditolak') ? 'critical' : 'info',
      })

      // Kabari penemu saat perkaranya ditutup atau ditolak — ia yang paling
      // berkepentingan tahu, dan ia bukan orang yang menekan tombolnya.
      if ((baru === 'ditutup' || baru === 'ditolak') && lama.ditemukan_oleh !== request.currentUser!.id) {
        await createNotifications([{
          company_id: request.companyId!,
          user_id: lama.ditemukan_oleh,
          title: `Temuan ${lama.nomor} ${baru === 'ditutup' ? 'ditutup' : 'ditolak'}`,
          message: baru === 'ditolak'
            ? `Alasan: ${perubahan.alasan_penolakan as string}`
            : `${lama.judul} — perbaikan diverifikasi`,
          type: baru === 'ditutup' ? 'punch_closed' : 'punch_rejected',
          priority: 'normal',
          project_id: lama.project_id,
          action_url: `/lapangan/punch-list?item=${id}`,
        }])
      }

      return reply.send({ data })
    }
  )

  // ── DELETE /api/v1/punch-items/:id ────────────────────────────────────────
  // Hanya perkara yang belum tersentuh. Yang sudah berjalan DITOLAK, bukan
  // dihapus — itulah gunanya status `ditolak` (lihat migrasi 156 keputusan #5).
  app.delete<{ Params: { id: string } }>(
    '/api/v1/punch-items/:id',
    { preHandler: [authenticate, requirePermission('punch:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilPunchMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      if (lama.status !== 'terbuka') {
        return reply.status(409).send({
          error: `Temuan berstatus '${lama.status}' tidak bisa dihapus. `
            + 'Gunakan status `ditolak` dengan alasan — riwayatnya harus tetap ada.',
        })
      }

      const { error } = await request.db!.viaProject('punch_items', lama.project_id).delete().eq('id', id)
      if (error) {
        request.log.error({ err: error, id }, 'gagal menghapus punch item')
        return reply.status(500).send({ error: 'Gagal menghapus temuan' })
      }

      await logAuditEvent(request, {
        tableName: 'punch_items',
        recordId: id,
        action: 'DELETE',
        actorId: request.currentUser!.id,
        oldValues: { nomor: lama.nomor, judul: lama.judul, status: lama.status },
        severity: 'critical',
      })

      return reply.send({ success: true })
    }
  )

  // ── POST /api/v1/punch-items/:id/photos ───────────────────────────────────
  // Mengaitkan foto yang SUDAH diunggah lewat jalur `project_photos`. Foto
  // tidak diunggah ulang di sini: satu bucket, satu jalur ber-policy (yang baru
  // benar-benar hidup sejak migrasi 098).
  app.post<{ Params: { id: string } }>(
    '/api/v1/punch-items/:id/photos',
    { preHandler: [authenticate, requirePermission('punch:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilPunchMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      const body = request.body as { photo_id?: string; jenis?: string }
      if (!body.photo_id) return reply.status(400).send({ error: 'Field `photo_id` wajib' })
      const jenis = body.jenis ?? 'temuan'
      if (jenis !== 'temuan' && jenis !== 'perbaikan') {
        return reply.status(400).send({ error: '`jenis` harus `temuan` atau `perbaikan`' })
      }

      // Foto harus milik PROYEK YANG SAMA. Tanpa cek ini, foto proyek lain —
      // termasuk proyek perusahaan lain — bisa ditempelkan sebagai bukti.
      const { data: foto } = await request.db!
        .viaProject('project_photos', lama.project_id)
        .select('id, project_id')
        .eq('id', body.photo_id)
        .maybeSingle()

      if (!foto || foto.project_id !== lama.project_id) {
        return reply.status(404).send({ error: 'Foto tidak ditemukan di proyek ini' })
      }

      // `punch_item_photos` mewarisi tenancy lewat `punch_item_id`, bukan
      // `project_id` — jadi `viaProject()` tak berlaku. Yang menjaganya adalah
      // `ambilPunchMilikTenant()` di atas: baris induknya sudah dipastikan
      // milik tenant aktif sebelum baris ini ditulis.
      const { data, error } = await request.db!
        .unsafe('punch_item_photos', 'kategori C lewat punch_item_id; induknya sudah lewat ambilPunchMilikTenant')
        .insert({ punch_item_id: id, photo_id: body.photo_id, jenis })
        .select('id, punch_item_id, photo_id, jenis, created_at')
        .single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: 'Foto itu sudah terlampir sebagai bukti sejenis' })
        }
        request.log.error({ err: error, id }, 'gagal melampirkan foto punch')
        return reply.status(500).send({ error: 'Gagal melampirkan foto' })
      }

      return reply.status(201).send({ data })
    }
  )

  // ── GET /api/v1/punch-items/:id/photos ────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/punch-items/:id/photos',
    { preHandler: [authenticate, requirePermission('punch:view')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilPunchMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      const { data, error } = await request.db!
        .unsafe('punch_item_photos', 'kategori C lewat punch_item_id; induknya sudah lewat ambilPunchMilikTenant')
        .select('id, jenis, created_at, foto:project_photos ( id, url, thumbnail_url, caption, taken_at )')
        .eq('punch_item_id', id)
        .order('created_at', { ascending: true })

      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat foto punch')
        return reply.status(500).send({ error: 'Gagal memuat bukti foto' })
      }
      return reply.send({ data: data ?? [] })
    }
  )
}

/**
 * Ambil satu punch item HANYA kalau proyek induknya milik tenant aktif.
 *
 * Rute by-id tanpa saringan ini adalah kelas celah yang sama dengan
 * `resolveScopeItemOwnership()` (ROADMAP 14e): mencari dengan `.eq('id')` saja
 * lalu memeriksa kepemilikan di lapis lain — dan admin perusahaan lain yang
 * tahu UUID-nya lolos, karena tak ada yang memfilter admin.
 */
async function ambilPunchMilikTenant(
  request: FastifyRequest,
  id: string
): Promise<{
  id: string; project_id: string; nomor: string; judul: string
  status: string; ditugaskan_ke: string | null; ditemukan_oleh: string
} | null> {
  // Satu literal, bukan string yang disambung: Supabase menurunkan tipe hasil
  // dari LITERAL select-nya. Sambungan `'a, ' + 'b'` membuat inferensinya jatuh
  // ke `GenericStringError` dan seluruh pengecekan kolom di bawah ini hilang —
  // persis kelas bug kolom-salah-nama yang penjaga `audit-kolom-select` ada
  // untuk menangkapnya.
  const { data, error } = await request.db!
    .unsafe('punch_items', 'lookup by id: project belum diketahui — hasilnya DIPERIKSA proyekMilikTenant di bawah')
    .select('id, project_id, nomor, judul, status, ditugaskan_ke, ditemukan_oleh, deskripsi, lokasi, severity, rab_item_id, work_scope_id, target_selesai')
    .eq('id', id)
    .maybeSingle()

  // Gagal baca ≠ tidak ditemukan. Menyamakan keduanya membuat gangguan DB
  // terbaca sebagai 404 — pemanggil menyimpulkan datanya tak ada, padahal ada.
  if (error) throw new Error(`Gagal membaca punch item: ${error.message}`)
  if (!data) return null
  if (!(await proyekMilikTenant(request, data.project_id))) return null
  return data
}

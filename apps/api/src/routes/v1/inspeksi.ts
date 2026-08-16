import type { FastifyInstance, FastifyRequest } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import type { TenantDb } from '../../utils/tenant-db.js'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { createNotifications } from '../../utils/notifications.js'
import { logAuditEvent } from '../../utils/audit.js'

// Request for Inspection — izin cor / izin tutup. ROADMAP #24.
//
// Mandor minta pengawas memeriksa pekerjaan SEBELUM ditutup. Hasilnya lolos
// atau tidak lolos; yang tidak lolos melahirkan temuan punch list (156),
// sehingga rantainya bisa ditelusuri: inspeksi gagal → cacat apa → sudah
// ditutup belum.
//
// Rancangan tabel + alasan tiap keputusan ada di
// `db/migrations/157_rfi_inspeksi_dan_informasi.sql`.
//
// `inspeksi:periksa` TERPISAH dari `inspeksi:manage`: pemohon tak boleh
// memberi izin pada pekerjaannya sendiri. Pola yang sama dengan `punch:verify`.

const INSPEKSI_SELECT = `
  id, project_id, nomor, judul, lokasi, catatan, pekerjaan_lanjutan,
  status, rab_item_id, work_scope_id, diminta_oleh, diminta_untuk,
  diperiksa_oleh, diperiksa_pada, hasil_catatan, punch_item_id,
  created_at, updated_at,
  pemohon:users!inspection_requests_diminta_oleh_fkey ( id, name ),
  pemeriksa:users!inspection_requests_diperiksa_oleh_fkey ( id, name ),
  rab_item:rab_items ( id, name, category_code ),
  temuan:punch_items ( id, nomor, judul, status )
`

/** Transisi yang sah. Di luar ini ditolak 422, bukan diterima diam-diam. */
const TRANSISI: Record<string, string[]> = {
  diminta: ['dijadwalkan', 'lolos', 'tidak_lolos', 'dibatalkan'],
  // Boleh langsung diputuskan tanpa dijadwalkan — pengawas yang kebetulan
  // ada di lokasi memeriksa saat itu juga, dan memaksa penjadwalan lebih
  // dulu berarti orang mencatatnya belakangan atau tidak sama sekali.
  dijadwalkan: ['lolos', 'tidak_lolos', 'dibatalkan', 'diminta'],
  // Tidak lolos → diminta lagi: setelah diperbaiki, pemeriksaan diulang.
  // Perkaranya TIDAK dibuat baru supaya riwayat percobaannya tetap satu berkas.
  tidak_lolos: ['diminta', 'dibatalkan'],
  // Lolos adalah keputusan yang dipertanggungjawabkan; membukanya kembali
  // harus mungkin (temuan menyusul) tapi hanya lewat pengajuan ulang.
  lolos: ['diminta'],
  dibatalkan: ['diminta'],
}

async function nomorBerikutnya(db: TenantDb, projectId: string): Promise<string> {
  const { data, error } = await db
    .viaProject('inspection_requests', projectId)
    .select('nomor')
    .order('nomor', { ascending: false })
    .limit(1)

  // Gagal baca ≠ belum ada permintaan. `?? []` akan mengubah kegagalan jadi
  // "mulai dari RFI-001" dan menabrak nomor yang sudah dipakai.
  if (error) throw new Error(`Gagal membaca nomor inspeksi terakhir: ${error.message}`)
  if (!data || data.length === 0) return 'RFI-001'
  const cocok = /^RFI-(\d+)$/.exec(data[0].nomor)
  if (!cocok) return 'RFI-001'
  return `RFI-${String(parseInt(cocok[1], 10) + 1).padStart(3, '0')}`
}

/**
 * Ambil satu permintaan HANYA kalau proyek induknya milik tenant aktif.
 * Rute by-id tanpa saringan ini adalah kelas celah yang sama dengan
 * `resolveScopeItemOwnership()` (ROADMAP 14e).
 */
async function ambilInspeksiMilikTenant(
  request: FastifyRequest,
  id: string
): Promise<{
  id: string; project_id: string; nomor: string; judul: string
  status: string; diminta_oleh: string; lokasi: string | null
} | null> {
  const { data, error } = await request.db!
    .unsafe('inspection_requests', 'lookup by id: project belum diketahui — hasilnya DIPERIKSA proyekMilikTenant di bawah')
    .select('id, project_id, nomor, judul, status, diminta_oleh, lokasi, catatan, pekerjaan_lanjutan, rab_item_id, work_scope_id, diminta_untuk')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Gagal membaca permintaan inspeksi: ${error.message}`)
  if (!data) return null
  if (!(await proyekMilikTenant(request, data.project_id))) return null
  return data
}

export default async function inspeksiRoutes(app: FastifyInstance) {
  // ── GET daftar ────────────────────────────────────────────────────────────
  app.get<{ Params: { projectId: string }; Querystring: { status?: string } }>(
    '/api/v1/projects/:projectId/inspections',
    { preHandler: [authenticate, requirePermission('inspeksi:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      let q = request.db!
        .viaProject('inspection_requests', projectId)
        .select(INSPEKSI_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)
      if (request.query.status) q = q.eq('status', request.query.status)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat permintaan inspeksi')
        return reply.status(500).send({ error: 'Gagal memuat permintaan inspeksi' })
      }

      // Rekap dihitung dari SELURUH baris, bukan dari 200 yang terbawa —
      // angka yang dihitung dari halaman pertama akan salah begitu perkaranya
      // lebih banyak, dan salahnya tak terlihat.
      const { data: rekap, error: errRekap } = await request.db!
        .viaProject('inspection_requests', projectId)
        .select('status, diminta_untuk')

      if (errRekap) request.log.error({ err: errRekap, projectId }, 'gagal menghitung rekap inspeksi')

      const perStatus: Record<string, number> = {}
      for (const b of rekap ?? []) perStatus[b.status] = (perStatus[b.status] ?? 0) + 1

      const sekarang = Date.now()
      return reply.send({
        data: data ?? [],
        meta: {
          per_status: perStatus,
          total: (rekap ?? []).length,
          // Yang menunggu pemeriksa. Ini angka yang menentukan apakah pekerjaan
          // lanjutan bisa jalan — bukan total permintaan.
          menunggu: (rekap ?? []).filter(
            (b) => b.status === 'diminta' || b.status === 'dijadwalkan'
          ).length,
          // Menunggu DAN waktunya sudah lewat: pekerjaan berhenti karena
          // pemeriksa belum datang.
          terlambat: (rekap ?? []).filter(
            (b) => (b.status === 'diminta' || b.status === 'dijadwalkan')
              && b.diminta_untuk && new Date(b.diminta_untuk).getTime() < sekarang
          ).length,
          rekap_lengkap: !errRekap,
        },
      })
    }
  )

  // ── POST ajukan ───────────────────────────────────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/inspections',
    { preHandler: [authenticate, requirePermission('inspeksi:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const body = request.body as {
        judul?: string; lokasi?: string; catatan?: string
        pekerjaan_lanjutan?: string; diminta_untuk?: string
        rab_item_id?: string; work_scope_id?: string
      }
      const judul = (body.judul ?? '').trim()
      if (!judul) return reply.status(400).send({ error: 'Judul pekerjaan wajib diisi' })

      // Nomor bisa direbut permintaan lain di antara baca dan tulis. Menolak
      // yang kedua dengan 500 berarti permintaan lapangan hilang — dan di sini
      // akibatnya pekerjaan berhenti menunggu izin yang tak pernah tercatat.
      let terakhir: string | null = null
      for (let percobaan = 0; percobaan < 5; percobaan++) {
        const nomor = await nomorBerikutnya(request.db!, projectId)
        const { data, error } = await request.db!
          .viaProject('inspection_requests', projectId)
          .insert({
            project_id: projectId,
            nomor,
            judul,
            lokasi: body.lokasi ?? null,
            catatan: body.catatan ?? null,
            pekerjaan_lanjutan: body.pekerjaan_lanjutan ?? null,
            diminta_untuk: body.diminta_untuk ?? null,
            rab_item_id: body.rab_item_id ?? null,
            work_scope_id: body.work_scope_id ?? null,
            diminta_oleh: request.currentUser!.id,
          })
          .select(INSPEKSI_SELECT)
          .single()

        if (!error) {
          await logAuditEvent(request, {
            tableName: 'inspection_requests', recordId: data.id, action: 'INSERT',
            actorId: request.currentUser!.id,
            newValues: { nomor, judul, diminta_untuk: data.diminta_untuk },
          })

          // Kabari yang berwenang memeriksa. Permintaan inspeksi yang tak
          // diberitahukan sama saja dengan tidak diajukan: pekerjaan tetap
          // berhenti, hanya sekarang ada catatannya.
          //
          // ⚠️ TIDAK memakai `?? []` di sini. Kegagalan query penerima akan
          // menjadi "nol orang diberitahu" yang terlihat sah — permintaan
          // tersimpan, respons 201, dan tak seorang pun tahu. Pemohon menunggu
          // pemeriksa yang tak pernah menerima kabarnya, lalu menyimpulkan
          // sistemnya lambat. Kegagalannya DILAPORKAN ke pemanggil lewat
          // `penerima_diberitahu`, bukan ditelan.
          let diberitahu: number | null = null
          const { data: pemeriksa, error: errPeran } = await request.db!
            .unsafe('role_permissions', 'cari pemegang inspeksi:periksa untuk notifikasi; disaring ke anggota company di bawah')
            .select('role_id, permissions!inner(key)')
            .eq('permissions.key', 'inspeksi:periksa')

          if (errPeran) {
            request.log.error({ err: errPeran, id: data.id }, 'gagal mencari pemegang inspeksi:periksa')
          } else {
            const roleIds = (pemeriksa as Array<{ role_id: string }>).map((r) => r.role_id)
            if (roleIds.length === 0) {
              // Nol pemegang capability bukan galat teknis, tapi tetap perlu
              // terlihat: modulnya hidup tanpa siapa pun yang bisa memutuskan.
              request.log.warn({ id: data.id }, 'nol role memegang inspeksi:periksa — permintaan tak akan diperiksa siapa pun')
              diberitahu = 0
            } else {
              const { data: orang, error: errOrang } = await request.db!
                .unsafe('company_members', 'penerima notifikasi; disaring eq(company_id) di bawah')
                .select('user_id')
                .eq('company_id', request.companyId!)
                .eq('is_active', true)
                .in('role_id', roleIds)

              if (errOrang) {
                request.log.error({ err: errOrang, id: data.id }, 'gagal memuat penerima notifikasi inspeksi')
              } else {
                const daftar = orang as Array<{ user_id: string }>
                await createNotifications(daftar.map((o) => ({
                  company_id: request.companyId!,
                  user_id: o.user_id,
                  title: `Minta diperiksa: ${nomor}`,
                  message: `${judul}${body.lokasi ? ` — ${body.lokasi}` : ''}`,
                  type: 'inspeksi_diminta' as const,
                  priority: 'high' as const,
                  project_id: projectId,
                  action_url: `/lapangan/inspeksi?item=${data.id}`,
                  // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
                  action_data: { record_id: data.id },
                })))
                diberitahu = daftar.length
              }
            }
          }

          // `null` = tak diketahui (query penerima gagal), `0` = memang tak ada
          // yang berwenang. Dua keadaan berbeda yang butuh tindakan berbeda.
          return reply.status(201).send({ data, penerima_diberitahu: diberitahu })
        }

        if (error.code !== '23505') {
          request.log.error({ err: error, projectId }, 'gagal mengajukan inspeksi')
          return reply.status(500).send({ error: 'Gagal mengajukan permintaan inspeksi' })
        }
        terakhir = error.message
      }

      request.log.error({ projectId, terakhir }, 'nomor inspeksi direbut 5x berturut-turut')
      return reply.status(409).send({ error: 'Nomor permintaan direbut berkali-kali. Coba lagi.' })
    }
  )

  // ── PATCH status ──────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/inspections/:id/status',
    { preHandler: [authenticate, requirePermission('inspeksi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilInspeksiMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Permintaan tidak ditemukan' })

      const body = request.body as {
        status?: string; hasil_catatan?: string
        diminta_untuk?: string; buat_temuan?: boolean
      }
      const baru = body.status
      if (!baru) return reply.status(400).send({ error: 'Field `status` wajib' })

      const sah = TRANSISI[lama.status] ?? []
      if (!sah.includes(baru)) {
        return reply.status(422).send({
          error: `Tidak bisa mengubah status dari '${lama.status}' ke '${baru}'`,
          transisi_yang_boleh: sah,
        })
      }

      const memutuskan = baru === 'lolos' || baru === 'tidak_lolos'
      if (memutuskan) {
        // ⚠️ MEMUTUSKAN butuh `inspeksi:periksa`, bukan `inspeksi:manage`.
        // Di tabel pemisahan itu hanya kolom terpisah; di sini ia menolak
        // permintaan. Tanpa cek ini, pemohon memberi izin cor pada
        // pekerjaannya sendiri.
        if (!(await hasPermission(request, 'inspeksi:periksa'))) {
          return reply.status(403).send({
            error: 'Memutuskan hasil pemeriksaan butuh permission inspeksi:periksa — '
              + 'pemohon tidak boleh memberi izin pada pekerjaannya sendiri',
          })
        }
        // Dan pemohon tetap tak boleh memutuskan walau ia KEBETULAN punya
        // capability itu. Capability menjawab "boleh apa", bukan "boleh atas
        // perkara siapa".
        if (lama.diminta_oleh === request.currentUser!.id) {
          return reply.status(403).send({
            error: 'Anda yang mengajukan permintaan ini — pemeriksaan harus '
              + 'dilakukan orang lain',
          })
        }
      }

      if (baru === 'tidak_lolos' && !(body.hasil_catatan ?? '').trim()) {
        return reply.status(400).send({
          error: 'Catatan hasil wajib diisi saat tidak lolos — pemohon harus tahu '
            + 'apa yang diperbaiki',
        })
      }

      const perubahan: Record<string, unknown> = { status: baru }
      if (memutuskan) {
        perubahan.diperiksa_oleh = request.currentUser!.id
        perubahan.diperiksa_pada = new Date().toISOString()
        if (body.hasil_catatan) perubahan.hasil_catatan = body.hasil_catatan.trim()
      }
      if (body.diminta_untuk !== undefined) perubahan.diminta_untuk = body.diminta_untuk
      // Diajukan ulang: jejak pemeriksaan lama DIBUANG, kalau tidak permintaan
      // yang sedang menunggu tampak sudah diperiksa.
      if (baru === 'diminta') {
        perubahan.diperiksa_oleh = null
        perubahan.diperiksa_pada = null
      }

      const { data, error } = await request.db!
        .viaProject('inspection_requests', lama.project_id)
        .update(perubahan)
        .eq('id', id)
        .select(INSPEKSI_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id, baru }, 'gagal mengubah status inspeksi')
        return reply.status(500).send({ error: 'Gagal mengubah status permintaan' })
      }

      // TIDAK LOLOS boleh langsung melahirkan temuan punch list. Opsional,
      // bukan otomatis: sebagian kegagalan hanya soal kesiapan (bekisting belum
      // rapi, besi belum lengkap) dan bukan cacat yang perlu ditelusuri sampai
      // serah terima. Memaksa semuanya jadi temuan membuat punch list penuh
      // perkara yang selesai lima menit kemudian, dan angka "menghalangi serah
      // terima" kehilangan artinya.
      let temuan: { id: string; nomor: string } | null = null
      if (baru === 'tidak_lolos' && body.buat_temuan) {
        const { data: nomorTerakhir } = await request.db!
          .viaProject('punch_items', lama.project_id)
          .select('nomor').order('nomor', { ascending: false }).limit(1)
        const n = nomorTerakhir?.[0]?.nomor
        const urut = n ? parseInt(/^PL-(\d+)$/.exec(n)?.[1] ?? '0', 10) + 1 : 1
        const nomorPunch = `PL-${String(urut).padStart(3, '0')}`

        const { data: pi, error: errPi } = await request.db!
          .viaProject('punch_items', lama.project_id)
          .insert({
            project_id: lama.project_id,
            nomor: nomorPunch,
            judul: `${lama.judul} — tidak lolos pemeriksaan`,
            deskripsi: body.hasil_catatan?.trim() ?? null,
            lokasi: lama.lokasi,
            severity: 'berat',   // menghalangi pekerjaan lanjutan, menurut definisi
            ditemukan_oleh: request.currentUser!.id,
            ditugaskan_ke: lama.diminta_oleh,
          })
          .select('id, nomor')
          .single()

        if (errPi) {
          // Temuan gagal dibuat TIDAK membatalkan hasil pemeriksaan — keputusan
          // "tidak lolos" sudah sah dan tercatat. Tapi kegagalannya dilaporkan,
          // bukan ditelan: pemakainya harus tahu temuannya tidak terbentuk.
          request.log.error({ err: errPi, id }, 'gagal membuat temuan dari inspeksi gagal')
        } else {
          temuan = pi
          // Temuan SUDAH terbentuk. Kalau tautannya gagal dipasang, temuan itu
          // ada tapi yatim — inspeksi tak menunjuk ke mana pun, dan tak ada
          // jalan menemukannya kembali dari sisi inspeksi. Dilaporkan, tidak
          // 500: inspeksinya sendiri sudah sah tercatat "tidak lolos", dan
          // membatalkannya justru membuang hasil pemeriksaan lapangan.
          const { error: errTaut } = await request.db!
            .viaProject('inspection_requests', lama.project_id)
            .update({ punch_item_id: pi.id }).eq('id', id)
          if (errTaut) {
            request.log.error(
              { err: errTaut, id, punchItemId: pi.id },
              'temuan terbentuk tapi tautan ke inspeksi gagal dipasang — temuan jadi yatim',
            )
          }
        }
      }

      await logAuditEvent(request, {
        tableName: 'inspection_requests', recordId: id, action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: { status: lama.status },
        newValues: { ...perubahan, ...(temuan ? { punch_item_id: temuan.id } : {}) },
        // Izin cor adalah keputusan yang dipertanggungjawabkan, bukan
        // penyuntingan biasa.
        severity: memutuskan ? 'critical' : 'info',
      })

      if (memutuskan && lama.diminta_oleh !== request.currentUser!.id) {
        await createNotifications([{
          company_id: request.companyId!,
          user_id: lama.diminta_oleh,
          title: `${lama.nomor} ${baru === 'lolos' ? 'LOLOS' : 'tidak lolos'}`,
          message: baru === 'lolos'
            ? `${lama.judul} — boleh dilanjutkan`
            : (body.hasil_catatan?.trim() ?? lama.judul),
          type: baru === 'lolos' ? 'inspeksi_lolos' : 'inspeksi_gagal',
          // `record_id` WAJIB - lihat `audit-notifikasi-punya-record.mjs`.
          action_data: { record_id: id },
          priority: baru === 'lolos' ? 'normal' : 'high',
          project_id: lama.project_id,
          action_url: `/lapangan/inspeksi?item=${id}`,
        }])
      }

      return reply.send({ data, temuan_dibuat: temuan })
    }
  )

  // ── DELETE ────────────────────────────────────────────────────────────────
  // Hanya yang belum diperiksa. Yang sudah punya hasil DIBATALKAN, bukan
  // dihapus — keputusan lolos/tidak lolos adalah jejak yang harus tetap ada.
  app.delete<{ Params: { id: string } }>(
    '/api/v1/inspections/:id',
    { preHandler: [authenticate, requirePermission('inspeksi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilInspeksiMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'Permintaan tidak ditemukan' })

      if (lama.status !== 'diminta') {
        return reply.status(409).send({
          error: `Permintaan berstatus '${lama.status}' tidak bisa dihapus. `
            + 'Gunakan status `dibatalkan` — hasil pemeriksaan harus tetap terekam.',
        })
      }

      const { error } = await request.db!
        .viaProject('inspection_requests', lama.project_id).delete().eq('id', id)
      if (error) {
        request.log.error({ err: error, id }, 'gagal menghapus permintaan inspeksi')
        return reply.status(500).send({ error: 'Gagal menghapus permintaan' })
      }

      await logAuditEvent(request, {
        tableName: 'inspection_requests', recordId: id, action: 'DELETE',
        actorId: request.currentUser!.id,
        oldValues: { nomor: lama.nomor, judul: lama.judul },
        severity: 'critical',
      })
      return reply.send({ success: true })
    }
  )
}

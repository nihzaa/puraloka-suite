import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { scopeIdsTenant } from '../../utils/tenant-guard.js'
import {
  periksaTransisiSerahTerima,
  periksaKesiapanPho,
  akhirMasaPemeliharaan,
  porsiRetensiBolehCair,
  type BeritaAcara,
  type JenisSerahTerima,
  type StatusSerahTerima,
} from '../../lib/serah-terima.js'

/**
 * SERAH TERIMA PHO/FHO (E2).
 *
 * ── Yang membuat modul ini ada
 *
 * `POST /mandor/retensi-releases` mencairkan retensi setelah memeriksa saldo
 * SAJA. Diukur 2026-08-12: 36 dari 40 punch item masih terbuka, termasuk satu
 * proyek dengan 19 dari 19. Uang jaminan mutu bisa cair penuh sementara
 * sembilan belas cacat menunggu diperbaiki.
 *
 * Sekarang pencairan menuntut berita acara yang DITANDATANGANI, dan porsinya
 * bertahap: PHO membuka sebagian, FHO membuka sisanya.
 *
 * ── Tenancy
 *
 * `serah_terima` kategori B — `company_id` langsung. `work_scope_id` opsional
 * dan diverifikasi lewat `scopeIdsTenant` saat diisi.
 */
export default async function serahTerimaRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'

  const SELECT_BA = `
    id, jenis, nomor, tanggal, lingkup_serah, catatan, catatan_cacat,
    masa_pemeliharaan_hari, punch_terbuka_saat_terbit,
    ttd_penyerah_url, ttd_penyerah_pada, ttd_penerima_url, ttd_penerima_pada,
    status, alasan_batal, project_id, work_scope_id, dibuat_pada,
    penerbit:users!serah_terima_diterbitkan_oleh_fkey ( id, name ),
    proyek:projects ( id, name ),
    scope:work_scopes ( id, scope_name )
  `

  // ── GET /api/v1/serah-terima ─────────────────────────────────────────────
  app.get<{ Querystring: { project_id?: string; jenis?: string; status?: string } }>(
    '/api/v1/serah-terima',
    { preHandler: [authenticate, requirePermission('serah_terima:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      let query = db.unsafe('serah_terima', ALASAN)
        .select(SELECT_BA)
        .eq('company_id', request.companyId!)
        .order('tanggal', { ascending: false })

      if (q.project_id) query = query.eq('project_id', q.project_id)
      if (q.jenis) query = query.eq('jenis', q.jenis)
      if (q.status) query = query.eq('status', q.status)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      // Akhir masa pemeliharaan DITURUNKAN saat baca, tak disimpan: yang
      // disepakati kontrak adalah jumlah harinya, dan menyimpan tanggal
      // akhirnya membuat PHO yang tanggalnya dikoreksi meninggalkan masa
      // pemeliharaan yang tak ikut bergeser.
      const hasil = (data ?? []).map((b) => {
        const r = b as Record<string, unknown>
        return {
          ...r,
          akhir_pemeliharaan: r.jenis === 'pho'
            ? akhirMasaPemeliharaan(
                String(r.tanggal),
                r.masa_pemeliharaan_hari as number | null,
              )
            : null,
        }
      })
      return reply.send({ serah_terima: hasil })
    },
  )

  // ── GET /api/v1/serah-terima/kesiapan/:projectId ─────────────────────────
  //
  // Menjawab "boleh PHO sekarang?" SEBELUM orang mengisi form dan ditolak.
  // Ia tak pernah menolak — PHO bersyarat sah — tetapi ia menyebut angkanya.
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/serah-terima/kesiapan/:projectId',
    { preHandler: [authenticate, requirePermission('serah_terima:view')] },
    async (request, reply) => {
      const db = request.db!
      const { projectId } = request.params

      if (!(await db.projectIds()).includes(projectId)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: punch, error: errPunch } = await db
        .viaProject('punch_items', projectId)
        .select('id, status')
      if (errPunch) return reply.status(500).send({ error: errPunch.message })

      const baris = (punch ?? []) as Array<{ status?: string }>
      // `ditolak` TIDAK dihitung terbuka: temuan yang ditolak sudah diputuskan
      // bukan cacat. Menghitungnya sebagai terbuka membuat PHO tersandera
      // temuan yang sudah dinyatakan tak berlaku.
      const terbuka = baris.filter(
        (p) => p.status === 'terbuka' || p.status === 'dikerjakan' || p.status === 'menunggu_cek',
      ).length

      const kesiapan = periksaKesiapanPho({ punchTerbuka: terbuka, punchTotal: baris.length })

      const { data: ba, error: errBa } = await db.unsafe('serah_terima', ALASAN)
        .select('jenis, status, tanggal, masa_pemeliharaan_hari')
        .eq('company_id', request.companyId!)
        .eq('project_id', projectId)
      if (errBa) return reply.status(500).send({ error: errBa.message })

      const daftar = (ba ?? []) as unknown as BeritaAcara[]
      const gerbang = porsiRetensiBolehCair(daftar)

      return reply.send({
        kesiapan,
        retensi: {
          porsi_maks: gerbang.porsiMaks,
          sebab: gerbang.sebab,
        },
        sudah_ada: {
          pho: daftar.some((b) => b.jenis === 'pho' && b.status !== 'dibatalkan'),
          fho: daftar.some((b) => b.jenis === 'fho' && b.status !== 'dibatalkan'),
        },
      })
    },
  )

  // ── POST /api/v1/serah-terima ────────────────────────────────────────────
  app.post<{
    Body: {
      project_id?: string
      work_scope_id?: string | null
      jenis?: JenisSerahTerima
      tanggal?: string
      lingkup_serah?: string
      masa_pemeliharaan_hari?: number | null
      catatan?: string
      catatan_cacat?: string
    }
  }>(
    '/api/v1/serah-terima',
    { preHandler: [authenticate, requirePermission('serah_terima:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.project_id) return reply.status(400).send({ error: 'project_id wajib diisi' })
      if (b.jenis !== 'pho' && b.jenis !== 'fho') {
        return reply.status(400).send({ error: 'jenis wajib "pho" atau "fho"' })
      }
      if (!b.tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(b.tanggal)) {
        return reply.status(400).send({ error: 'tanggal wajib, bentuk YYYY-MM-DD' })
      }
      if (!b.lingkup_serah?.trim()) {
        return reply.status(400).send({
          error: 'Lingkup serah wajib diisi — berita acara tanpa lingkup tak menyerahkan apa pun.',
        })
      }

      if (!(await db.projectIds()).includes(b.project_id)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // Lingkup kerja opsional, TAPI kalau diisi wajib milik tenant ini —
      // pelajaran E1: rujukan yang tak diverifikasi terlihat seperti bukti.
      if (b.work_scope_id) {
        if (!(await scopeIdsTenant(request)).includes(b.work_scope_id)) {
          return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })
        }
      }

      // `Number('')` bernilai 0, bukan NaN — kosong ditangani SEBELUM konversi
      // supaya "belum diputuskan" tak berubah jadi "masa pemeliharaan nol hari".
      let masa: number | null = null
      if (b.masa_pemeliharaan_hari !== null && b.masa_pemeliharaan_hari !== undefined
          && String(b.masa_pemeliharaan_hari) !== '') {
        const n = Number(b.masa_pemeliharaan_hari)
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'Masa pemeliharaan harus 0 hari atau lebih' })
        }
        masa = n
      }
      if (b.jenis === 'fho' && masa !== null) {
        return reply.status(400).send({
          error: 'Masa pemeliharaan hanya berlaku pada PHO — FHO justru yang menutupnya.',
        })
      }

      // Cacat yang masih terbuka DIHITUNG DAN DISIMPAN, bukan menolak.
      //
      // PHO bersyarat sah. Yang tak boleh adalah PHO yang menghapus jejak
      // berapa cacat yang menggantung saat kedua pihak tanda tangan — itulah
      // pertanyaan yang muncul saat sengketa.
      const { data: punch, error: errPunch } = await db
        .viaProject('punch_items', b.project_id)
        .select('id, status')
      if (errPunch) return reply.status(500).send({ error: errPunch.message })
      const terbuka = ((punch ?? []) as Array<{ status?: string }>).filter(
        (p) => p.status === 'terbuka' || p.status === 'dikerjakan' || p.status === 'menunggu_cek',
      ).length

      const tahun = b.tanggal.slice(0, 4)
      const awalan = b.jenis === 'pho' ? 'BA-PHO' : 'BA-FHO'
      const { data: terakhir, error: errNomor } = await db.unsafe('serah_terima', ALASAN)
        .select('nomor').eq('company_id', request.companyId!)
        .like('nomor', `${awalan}-${tahun}-%`)
        .order('nomor', { ascending: false }).limit(1).maybeSingle()
      // Galat DIPERIKSA: kalau gagal, nomornya kembali ke 0001 dan ditolak
      // UNIQUE dengan pesan yang membicarakan hal lain.
      if (errNomor) return reply.status(500).send({ error: errNomor.message })
      const urut = terakhir?.nomor ? Number(String(terakhir.nomor).split('-').pop()) + 1 : 1
      const nomor = `${awalan}-${tahun}-${String(urut).padStart(4, '0')}`

      const { data, error } = await db.unsafe('serah_terima', ALASAN)
        .insert({
          company_id: request.companyId!,
          project_id: b.project_id,
          work_scope_id: b.work_scope_id ?? null,
          jenis: b.jenis,
          nomor,
          tanggal: b.tanggal,
          lingkup_serah: b.lingkup_serah.trim(),
          masa_pemeliharaan_hari: masa,
          punch_terbuka_saat_terbit: terbuka,
          catatan: b.catatan ?? null,
          catatan_cacat: b.catatan_cacat ?? null,
          diterbitkan_oleh: request.currentUser!.id,
        })
        .select('id, nomor, jenis, status, punch_terbuka_saat_terbit')
        .single()

      if (error) {
        const kode = (error as { code?: string }).code
        if (kode === '23505') {
          // Bisa dua sebab: nomor bentrok, atau PHO/FHO kedua pada proyek yang
          // sama. Yang kedua jauh lebih mungkin, dan menyebut keduanya lebih
          // menolong daripada menebak satu.
          return reply.status(409).send({
            error: `Proyek ini sudah punya berita acara ${b.jenis.toUpperCase()} yang berlaku, `
              + 'atau nomornya bentrok. Batalkan yang lama lebih dulu bila hendak menggantinya.',
          })
        }
        if (kode === '23514' || /check_violation/i.test(error.message)) {
          // Trigger FHO-butuh-PHO melempar dengan ERRCODE check_violation, dan
          // pesannya sudah ditulis untuk manusia — diteruskan apa adanya.
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'serah_terima', recordId: (data as { id: string }).id,
        action: `serah_terima.${b.jenis}.create`,
        actorId: request.currentUser!.id,
        newValues: { nomor, project_id: b.project_id, punch_terbuka: terbuka },
        severity: 'critical',
      })

      return reply.status(201).send({
        serah_terima: data,
        peringatan: terbuka > 0
          ? `${terbuka} temuan cacat masih terbuka saat berita acara ini dibuat. `
            + 'Jumlahnya tercatat permanen — tuliskan yang disepakati diperbaiki di catatan cacat.'
          : undefined,
      })
    },
  )

  // ── PATCH /api/v1/serah-terima/:id/status ────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      status?: StatusSerahTerima
      alasan?: string
      ttd_url?: string
      pihak?: 'penyerah' | 'penerima'
    }
  }>(
    '/api/v1/serah-terima/:id/status',
    { preHandler: [authenticate, requirePermission('serah_terima:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      const { data: ba, error: errBaca } = await db.unsafe('serah_terima', ALASAN)
        .select('id, nomor, jenis, status, ttd_penyerah_url, ttd_penerima_url')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!ba) return reply.status(404).send({ error: 'Berita acara tidak ditemukan' })

      const r = ba as Record<string, unknown>
      const status = r.status as StatusSerahTerima

      // ── Membubuhkan tanda tangan ───────────────────────────────────────
      if (b.ttd_url && b.pihak) {
        if (status !== 'draf') {
          return reply.status(409).send({
            error: `Berita acara ${r.nomor} berstatus ${status} — tanda tangan hanya `
              + 'bisa dibubuhkan pada draf.',
          })
        }
        const kolom = b.pihak === 'penyerah' ? 'ttd_penyerah_url' : 'ttd_penerima_url'
        const kolomPada = b.pihak === 'penyerah' ? 'ttd_penyerah_pada' : 'ttd_penerima_pada'

        const { data: hasil, error } = await db.unsafe('serah_terima', ALASAN)
          .update({ [kolom]: b.ttd_url, [kolomPada]: new Date().toISOString() })
          .eq('id', id).eq('company_id', request.companyId!)
          // Status lama ikut di WHERE: dua pembubuhan bersamaan pada berita
          // acara yang sedang ditandatangani tak boleh sama-sama berhasil.
          .eq('status', 'draf')
          .select('id, nomor, ttd_penyerah_url, ttd_penerima_url')
        if (error) return reply.status(500).send({ error: error.message })
        if (!hasil || hasil.length === 0) {
          return reply.status(409).send({
            error: 'Berita acara berubah status dari tempat lain. Muat ulang halaman.',
          })
        }

        void logAuditEvent(request, {
          tableName: 'serah_terima', recordId: id,
          action: `serah_terima.ttd.${b.pihak}`,
          actorId: request.currentUser!.id,
          newValues: { pihak: b.pihak },
          severity: 'critical',
        })
        return reply.send({ serah_terima: hasil[0] })
      }

      // ── Pindah status ───────────────────────────────────────────────────
      if (!b.status) {
        return reply.status(400).send({ error: 'status atau (ttd_url + pihak) wajib diisi' })
      }

      const verdict = periksaTransisiSerahTerima({
        statusSekarang: status,
        statusTujuan: b.status,
        adaTtdPenyerah: !!r.ttd_penyerah_url,
        adaTtdPenerima: !!r.ttd_penerima_url,
        alasanBatal: b.alasan,
      })
      if (!verdict.boleh) {
        return reply.status(409).send({ error: verdict.sebab })
      }

      const patch: Record<string, unknown> = { status: b.status }
      if (b.status === 'dibatalkan') patch.alasan_batal = b.alasan!.trim()

      const { data: hasil, error } = await db.unsafe('serah_terima', ALASAN)
        .update(patch)
        .eq('id', id).eq('company_id', request.companyId!)
        // Status lama IKUT di WHERE — dua keputusan bersamaan hanya boleh
        // menghasilkan satu yang berhasil.
        .eq('status', status)
        .select('id, nomor, jenis, status')
      if (error) {
        if (/check_violation/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!hasil || hasil.length === 0) {
        return reply.status(409).send({
          error: 'Berita acara sudah diubah dari tempat lain. Muat ulang halaman.',
        })
      }

      void logAuditEvent(request, {
        tableName: 'serah_terima', recordId: id,
        action: `serah_terima.${b.status}`,
        actorId: request.currentUser!.id,
        newValues: patch,
        severity: 'critical',
      })

      return reply.send({
        serah_terima: hasil[0],
        pesan: b.status === 'ditandatangani'
          ? (r.jenis === 'pho'
              ? 'PHO ditandatangani — masa pemeliharaan mulai berjalan, dan sebagian retensi kini boleh cair.'
              : 'FHO ditandatangani — masa pemeliharaan berakhir, sisa retensi kini boleh cair.')
          : undefined,
      })
    },
  )
}

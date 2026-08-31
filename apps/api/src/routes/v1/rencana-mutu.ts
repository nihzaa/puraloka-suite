import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, idAlurPersetujuan, periksaGerbangSod,
} from '../../utils/approval.js'
import {
  ringkasItp, cacatRencanaMutu, bolehDisetujui,
  type TitikItp, type RencanaMutu,
} from '../../lib/rencana-mutu.js'

/**
 * RENCANA MUTU PROYEK + INSPECTION & TEST PLAN (G1e).
 *
 * ── Kenapa berkas terpisah dari `mutu.ts`
 *
 * `mutu.ts` menangani HASIL (checklist inspeksi, uji material). Berkas ini
 * menangani RENCANA — apa yang seharusnya diperiksa, dan tahap mana yang
 * menahan pekerjaan. Keduanya bertemu lewat `inspection_requests.itp_titik_id`,
 * bukan lewat berkas yang sama.
 *
 * ── Peringatan tenancy yang sudah pernah memakan waktu
 *
 * `itp_titik` kategori C dengan `lewat: 'rencana_mutu_id'` — BUKAN
 * `project_id`. `viaProject('itp_titik', projekId)` akan menyusun
 * `.eq('rencana_mutu_id', projekId)` dan mengembalikan NOL BARIS tanpa galat
 * apa pun. Kesalahan persis ini terjadi 2026-07-30 (rap.ts) dan terulang
 * 2026-08-11 (weekly_wage_reports) beberapa jam setelah saya membaca
 * komentarnya. `audit-viaproject-argumen.mjs` sekarang menjaganya.
 *
 * Skema, constraint, dan alasannya ada di `db/migrations/280_*.sql`.
 */

const RMP_SELECT = `
  id, project_id, nomor, judul, revisi, status, standar_acuan,
  sasaran_mutu, catatan, penanggung_jawab, disetujui_oleh, disetujui_pada,
  created_at, updated_at,
  pj:users!rencana_mutu_penanggung_jawab_fkey ( id, name ),
  penyetuju:users!rencana_mutu_disetujui_oleh_fkey ( id, name )
`

const ITP_SELECT = `
  id, rencana_mutu_id, urutan, kode, tahap_pekerjaan, uraian, jenis_titik,
  kriteria, acuan, metode_verifikasi, pihak_verifikasi, rab_item_id,
  lolos, diperiksa_oleh, diperiksa_pada, catatan_hasil,
  pemeriksa:users ( id, name )
`

export default async function rencanaMutuRoutes(app: FastifyInstance) {
  // ── GET /projects/:projectId/rencana-mutu ────────────────────────────────
  //
  // Daftar RMP satu proyek. Revisi TERBARU lebih dulu — yang berlaku hari ini
  // adalah yang paling sering dicari, dan revisi lama tetap ada karena klaim
  // merujuk versi yang berlaku SAAT pekerjaan dilakukan.
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rencana-mutu',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:view')] },
    async (request, reply) => {
      const { projectId } = request.params

      const { data, error } = await request.db!
        .viaProject('rencana_mutu', projectId)
        .select(RMP_SELECT)
        .order('revisi', { ascending: false })
        .limit(100)
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat rencana mutu')
        return reply.status(500).send({ error: 'Gagal memuat rencana mutu' })
      }

      return reply.send({ rencana: data ?? [] })
    },
  )

  // ── GET /rencana-mutu/:id — satu dokumen beserta ITP-nya ─────────────────
  //
  // Ringkasan dihitung di server, bukan di layar: pertanyaan "boleh lanjut?"
  // punya SATU jawaban, dan menghitungnya di dua tempat membuat dua jawaban
  // yang bisa berbeda.
  app.get<{ Params: { id: string } }>(
    '/api/v1/rencana-mutu/:id',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:view')] },
    async (request, reply) => {
      const { id } = request.params

      // `rencana_mutu` kategori C lewat `project_id`. Saringan
      // `.in('project_id', projectIds())` di query yang SAMA membuat "bukan
      // milik saya" jadi 404 yang identik dengan "tidak ada" — nol kebocoran
      // keberadaan dokumen tenant lain.
      const { data: rmp, error: eRmp } = await request.db!
        .unsafe('rencana_mutu',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select(RMP_SELECT)
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eRmp) {
        request.log.error({ err: eRmp, id }, 'gagal memuat rencana mutu')
        return reply.status(500).send({ error: 'Gagal memuat rencana mutu' })
      }
      if (!rmp) return reply.status(404).send({ error: 'Rencana mutu tidak ditemukan' })

      // ⚠ `itp_titik` lewat `rencana_mutu_id`, BUKAN project_id. Lihat kepala
      // berkas — kesalahan ini mengembalikan nol baris tanpa galat.
      const { data: titikData, error: eTitik } = await request.db!
        .viaProject('itp_titik', id)
        .select(ITP_SELECT)
        .order('urutan', { ascending: true })
        .limit(500)
      if (eTitik) {
        request.log.error({ err: eTitik, id }, 'gagal memuat titik ITP')
        return reply.status(500).send({ error: 'Gagal memuat titik ITP' })
      }

      const titik = (titikData ?? []) as unknown as TitikItp[]
      const dok = rmp as unknown as RencanaMutu

      return reply.send({
        rencana: rmp,
        titik,
        ringkasan: ringkasItp(titik),
        cacat: cacatRencanaMutu(dok, titik),
        persetujuan: bolehDisetujui(dok, titik),
      })
    },
  )

  // ── POST /projects/:projectId/rencana-mutu ───────────────────────────────
  app.post<{
    Params: { projectId: string }
    Body: {
      nomor?: string; judul?: string; revisi?: number
      standar_acuan?: string; sasaran_mutu?: string
      penanggung_jawab?: string; catatan?: string
    }
  }>(
    '/api/v1/projects/:projectId/rencana-mutu',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      const b = request.body

      if (!b.nomor?.trim()) return reply.status(400).send({ error: 'nomor wajib diisi' })
      if (!b.judul?.trim()) return reply.status(400).send({ error: 'judul wajib diisi' })

      const { data, error } = await request.db!
        .viaProject('rencana_mutu', projectId)
        .insert({
          project_id: projectId,
          nomor: b.nomor.trim(),
          judul: b.judul.trim(),
          revisi: Number.isFinite(b.revisi) ? b.revisi : 0,
          standar_acuan: b.standar_acuan?.trim() || null,
          sasaran_mutu: b.sasaran_mutu?.trim() || null,
          penanggung_jawab: b.penanggung_jawab || null,
          catatan: b.catatan?.trim() || null,
          dibuat_oleh: request.currentUser!.id,
        })
        .select('id, nomor, judul, revisi, status')
        .single()

      if (error) {
        request.log.error({ err: error, projectId }, 'gagal membuat rencana mutu')
        return reply.status(500).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'rencana_mutu',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ rencana: data })
    },
  )

  // ── POST /rencana-mutu/:id/titik — tambah titik periksa ──────────────────
  app.post<{
    Params: { id: string }
    Body: {
      tahap_pekerjaan?: string; uraian?: string
      jenis_titik?: 'hold' | 'witness' | 'review'
      kode?: string; kriteria?: string; acuan?: string
      metode_verifikasi?: string; pihak_verifikasi?: string
      rab_item_id?: string; urutan?: number
    }
  }>(
    '/api/v1/rencana-mutu/:id/titik',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.tahap_pekerjaan?.trim()) {
        return reply.status(400).send({ error: 'tahap_pekerjaan wajib diisi' })
      }
      if (!b.uraian?.trim()) return reply.status(400).send({ error: 'uraian wajib diisi' })

      // `jenis_titik` menentukan apakah pekerjaan boleh lanjut — ia tak boleh
      // punya nilai bawaan. Menebak 'review' membuat titik yang seharusnya
      // menahan jadi tak menahan; menebak 'hold' menghentikan pekerjaan yang
      // tak perlu berhenti. Keduanya salah, jadi yang benar adalah menolak.
      if (!b.jenis_titik || !['hold', 'witness', 'review'].includes(b.jenis_titik)) {
        return reply.status(400).send({
          error: 'jenis_titik wajib salah satu: hold, witness, review — '
            + 'ia menentukan apakah pekerjaan boleh lanjut, jadi tak punya nilai bawaan',
        })
      }

      // Kepemilikan dokumen induk diperiksa lebih dulu: tanpa ini, titik bisa
      // ditempelkan ke RMP tenant lain, dan RLS baru menolaknya di lapisan
      // basis dengan pesan yang tak bisa dibaca di layar.
      const { data: rmp, error: eRmp } = await request.db!
        .unsafe('rencana_mutu',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select('id, status')
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eRmp) return reply.status(500).send({ error: eRmp.message })
      if (!rmp) return reply.status(404).send({ error: 'Rencana mutu tidak ditemukan' })

      // Dokumen yang SUDAH DISETUJUI tak boleh ditambah titik diam-diam.
      //
      // Persetujuan mengikat pada isi yang disetujui. Menambah titik HOLD
      // sesudahnya mengubah apa yang menahan pekerjaan tanpa sepengetahuan
      // yang menandatangani — dan menghapusnya jauh lebih buruk lagi.
      if ((rmp as { status: string }).status === 'disetujui') {
        return reply.status(409).send({
          error: 'Rencana mutu sudah disetujui — buat revisi baru untuk mengubah ITP. '
            + 'Persetujuan mengikat pada isi yang disetujui.',
        })
      }

      const { data, error } = await request.db!
        // ⚠ argumen kedua = rencana_mutu_id (kolom `lewat`), BUKAN project_id.
        .viaProject('itp_titik', id)
        .insert({
          rencana_mutu_id: id,
          urutan: Number.isFinite(b.urutan) ? b.urutan : 0,
          kode: b.kode?.trim() || null,
          tahap_pekerjaan: b.tahap_pekerjaan.trim(),
          uraian: b.uraian.trim(),
          jenis_titik: b.jenis_titik,
          kriteria: b.kriteria?.trim() || null,
          acuan: b.acuan?.trim() || null,
          metode_verifikasi: b.metode_verifikasi?.trim() || null,
          pihak_verifikasi: b.pihak_verifikasi?.trim() || null,
          rab_item_id: b.rab_item_id || null,
        })
        .select('id, tahap_pekerjaan, jenis_titik')
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah titik ITP')
        return reply.status(500).send({ error: error.message })
      }
      return reply.status(201).send({ titik: data })
    },
  )

  // ── PATCH /itp-titik/:id — hasil pemeriksaan satu titik ──────────────────
  app.patch<{
    Params: { id: string }
    Body: { lolos?: boolean | null; catatan_hasil?: string | null; inspection_id?: string }
  }>(
    '/api/v1/itp-titik/:id',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      // Titik GAGAL wajib beralasan. Constraint DB sudah menegakkannya
      // (`itp_gagal_beralasan`); ini bukan penggantinya melainkan pesan yang
      // bisa dibaca — "violates check constraint" tak berarti apa-apa di layar.
      if (b.lolos === false && !b.catatan_hasil?.trim()) {
        return reply.status(400).send({
          error: 'Titik yang tidak lolos wajib punya catatan — '
            + 'yang menerima tugas perbaikan harus tahu APA yang salah',
        })
      }

      // Pemeriksa diisi SERVER dari sesi, bukan diterima dari klien.
      // Pemeriksa yang bisa dipilih sendiri bukan bukti — dan justru pada
      // titik HOLD-lah bukti itu paling dibutuhkan saat sengketa.
      const menilai = b.lolos !== undefined && b.lolos !== null

      const { data, error } = await request.db!
        .unsafe('itp_titik',
          'id titik langsung; tenancy dijamin RLS RESTRICTIVE lewat rencana_mutu→project')
        .update({
          ...(b.lolos !== undefined ? { lolos: b.lolos } : {}),
          ...(b.catatan_hasil !== undefined
            ? { catatan_hasil: b.catatan_hasil?.trim() || null } : {}),
          ...(menilai
            ? { diperiksa_oleh: request.currentUser!.id, diperiksa_pada: new Date().toISOString() }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, tahap_pekerjaan, jenis_titik, lolos')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui titik ITP')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Titik ITP tidak ditemukan' })

      // Sambungan rencana→pelaksanaan: inspeksi mana yang menjawab titik ini.
      //
      // Tanpa ini, ITP dan inspeksi hidup di dua tabel yang tak pernah
      // bertemu — kelas cacat yang sudah terjadi tujuh kali di repo ini.
      if (b.inspection_id) {
        // `.select()` lalu periksa jumlah barisnya: nol baris di sini BUKAN
        // best-effort. Ia berarti inspeksinya tak ada, atau milik tenant lain
        // — dan membalas 200 untuk itu membuat layar menampilkan "tertaut"
        // padahal tak ada yang tertaut. Justru sambungan inilah yang jadi
        // alasan modul ini dibangun.
        const { data: tertaut, error: eLink } = await request.db!
          .unsafe('inspection_requests',
            'menautkan inspeksi ke titik ITP; disaring .in(project_id, projectIds()) di query yang SAMA')
          .update({ itp_titik_id: id })
          .eq('id', b.inspection_id)
          .in('project_id', await request.db!.projectIds())
          .select('id')
        if (eLink) {
          request.log.error({ err: eLink, id }, 'gagal menautkan inspeksi ke titik ITP')
          return reply.status(500).send({ error: 'Gagal menautkan inspeksi' })
        }
        if (!tertaut || tertaut.length === 0) {
          return reply.status(404).send({
            error: 'Inspeksi yang mau ditautkan tidak ditemukan',
          })
        }
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'itp_titik',
        recordId: id,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ titik: data })
    },
  )

  // ── POST /rencana-mutu/:id/ajukan — draf → diajukan ──────────────────────
  //
  // Langkah ini ADA supaya inbox persetujuan terpusat punya sesuatu untuk
  // ditampilkan. Tanpa `diajukan`, dokumen melompat dari draf ke disetujui,
  // dan penyetujunya harus menemukan sendiri bahwa ada yang menunggu.
  app.post<{ Params: { id: string } }>(
    '/api/v1/rencana-mutu/:id/ajukan',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params

      // Status lama di WHERE: hanya draf yang bisa diajukan, dan dua
      // pengajuan bersamaan tak boleh sama-sama berhasil.
      const { data, error } = await request.db!
        .unsafe('rencana_mutu',
          'update dengan status lama di WHERE; disaring projectIds() di query yang SAMA')
        .update({ status: 'diajukan', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'draf')
        .in('project_id', await request.db!.projectIds())
        .select('id, nomor, revisi, status')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal mengajukan rencana mutu')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({
          error: 'Hanya rencana mutu berstatus draf yang bisa diajukan',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'rencana_mutu',
        recordId: id,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ rencana: data })
    },
  )

  // ── POST /rencana-mutu/:id/setujui ───────────────────────────────────────
  //
  // Persetujuan MENGIKAT: sesudahnya dokumen ini yang ditunjukkan ke pemilik
  // dan auditor, dan ITP-nya tak boleh diubah tanpa revisi baru.
  //
  // ── Kenapa lewat MESIN approval, bukan menulis `disetujui_oleh` langsung
  //
  // Versi pertama endpoint ini menulis kolomnya langsung, dan
  // `audit-approval-satu-pintu.mjs` merahkannya. Penjaga itu benar:
  // persetujuan yang MENGIKAT pada sebagian tenant butuh dua tanda tangan —
  // QA lalu direktur — dan tulis-langsung membuat rantai dua langkah lolos
  // dengan satu ketukan, sementara halaman pengaturannya tetap menampilkan
  // dua. Konfigurasinya terlihat benar, penegakannya tidak ada.
  //
  // `amount: null` — RMP tak menyentuh uang. Yang berjenjang di sini adalah
  // KEWENANGAN, bukan besaran, dan rantai tanpa ambang nominal sah di mesin
  // ini (pola sama dengan `submittal`).
  app.post<{ Params: { id: string } }>(
    '/api/v1/rencana-mutu/:id/setujui',
    { preHandler: [authenticate, requireModul('modul.uji_mutu'), requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: rmp, error: eRmp } = await request.db!
        .unsafe('rencana_mutu',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select(RMP_SELECT)
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eRmp) return reply.status(500).send({ error: eRmp.message })
      if (!rmp) return reply.status(404).send({ error: 'Rencana mutu tidak ditemukan' })

      const { data: titikData, error: eTitik } = await request.db!
        .viaProject('itp_titik', id)
        .select(ITP_SELECT)
        .limit(500)
      if (eTitik) return reply.status(500).send({ error: eTitik.message })

      const titik = (titikData ?? []) as unknown as TitikItp[]
      const dok = rmp as unknown as RencanaMutu

      // Penghalang diperiksa di SERVER, bukan hanya disembunyikan di layar.
      // Tombol yang disembunyikan adalah UX; endpoint yang menolak adalah
      // aturan. Endpoint bisa dipanggil langsung.
      //
      // Ini diperiksa SEBELUM mesin approval: rantai persetujuan menjawab
      // "siapa yang berwenang", bukan "apakah dokumennya layak disetujui".
      // Dokumen tanpa satu pun titik HOLD tak boleh disetujui oleh siapa pun.
      const izin = bolehDisetujui(dok, titik)
      if (!izin.boleh) {
        if (dok.status === 'disetujui') {
          return reply.status(409).send({ error: 'Rencana mutu ini sudah disetujui' })
        }
        return reply.status(422).send({
          error: 'Rencana mutu belum bisa disetujui',
          penghalang: izin.penghalang,
        })
      }

      const decision = await evaluateEntityApproval(request, {
        entityType: 'rencana_mutu', entityId: id, amount: null,
      })
      if (decision.configError) {
        request.log.error({ configError: decision.configError, id },
          'evaluasi rantai approval rencana mutu gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!decision.allowed) {
        if (decision.reason === 'already_approved') {
          return reply.status(409).send({ error: 'Rencana mutu ini sudah disetujui' })
        }
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      // TJS-P4 — pengaju tak boleh menyetujui pengajuannya sendiri.
      const sod = await periksaGerbangSod(request, 'rencana_mutu', id, {
        alasanOverride: (request.body as { alasan_override?: string } | undefined)?.alasan_override,
        level: decision.step?.level,
      })
      if (!sod.ok) return reply.status(403).send({ error: sod.pesan })
      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'rencana_mutu', entityId: id, level: decision.step.level,
          approvedBy: request.currentUser!.id, companyId: request.companyId!,
        })
        if (!rec.ok) {
          return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })
        }

        // Belum langkah terakhir: dokumen TETAP `diajukan`. Menandainya
        // disetujui di sini persis kesalahan yang penjaga cegah — separuh
        // rantai, status penuh.
        if (!decision.isFinalStep) {
          const next = decision.applicable.find((s) => s.level > decision.step!.level)
          await logAuditEvent(request, {
            action: 'rencana_mutu.approval.level',
            actorId: request.currentUser!.id,
            tableName: 'rencana_mutu',
            recordId: id,
            newValues: { level: decision.step.level, of: decision.applicable.length },
            severity: 'critical',
            // Mengikat SELURUH langkah lintas request — persetujuan berjenjang
            // terjadi di hari berbeda oleh orang berbeda.
            workflowId: idAlurPersetujuan(id),
          })
          return reply.send({
            ok: true, pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. Menunggu level ${next?.level ?? '-'}.`,
          })
        }
      }

      // Status lama ikut di WHERE — approval ganda dicegah di basis, bukan
      // hanya di pengecekan sebelumnya. Dua permintaan yang tiba bersamaan
      // sama-sama lolos pemeriksaan di atas; yang kedua gagal di sini.
      const { data, error } = await request.db!
        .unsafe('rencana_mutu',
          'update dengan status lama di WHERE (anti approval ganda); disaring projectIds() di query yang SAMA')
        .update({
          status: 'disetujui',
          disetujui_oleh: request.currentUser!.id,
          disetujui_pada: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .neq('status', 'disetujui')
        .in('project_id', await request.db!.projectIds())
        .select('id, nomor, revisi, status, disetujui_pada')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menyetujui rencana mutu')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({ error: 'Rencana mutu ini sudah disetujui' })
      }

      // Persetujuan mengikat — severity dinaikkan supaya ia tak tenggelam di
      // antara perubahan biasa saat riwayatnya ditelusuri.
      await logAuditEvent(request, {
        action: 'APPROVE',
        actorId: request.currentUser!.id,
        tableName: 'rencana_mutu',
        recordId: id,
        newValues: data as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.send({ rencana: data })
    },
  )
}

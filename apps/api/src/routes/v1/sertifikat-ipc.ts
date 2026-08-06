import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { hitungIpc, type MasukanIpc } from '../../lib/sertifikat-ipc.js'

/**
 * SERTIFIKAT IPC — Interim Payment Certificate (INTI #2)
 *
 * ── Cacat yang ditutup, diukur pada data nyata
 *
 * Gerbang progres sudah ada dan sudah terpasang (`lib/ipc-progres.ts` dipanggil
 * di `finance.ts:560`). Yang hilang: **angkanya tak pernah disimpan.**
 *
 * Gerbang itu menghitung "progres 47%, ambang 40% → lolos", lalu membuang
 * hasilnya. Enam bulan kemudian `projects.progress_pct` sudah bergerak, dan
 * saat owner mempersoalkan sebuah termin, yang tersedia hanya progres HARI
 * INI — bukan progres yang jadi dasar penagihan waktu itu.
 *
 * Diukur 2026-08-07: 40 termin (18 dibayar · 7 tertagih), 26 invoice,
 * 271 log progres, Rp 4,88 miliar nilai kontrak — nol sertifikat.
 *
 * ── Kenapa nilainya DIHITUNG, bukan disimpan
 *
 * `nilai_bersih` tidak punya kolom. Ia diturunkan dari komponen yang dibekukan
 * di barisnya. Kolom hasil yang basi adalah cara paling sunyi untuk membayar
 * angka yang salah: ia terlihat benar sampai salah satu komponennya berubah,
 * dan tak ada yang memeriksa ulang angka yang sudah "final".
 *
 * Sebaliknya, `progres_diakui_pct`, `nilai_kontrak`, dan `retensi_pct`
 * memang DIBEKUKAN — itulah yang membuat sertifikat ini sertifikat, bukan
 * laporan hari ini.
 */
export default async function sertifikatIpcRoutes(app: FastifyInstance) {
  // ── GET /api/v1/sertifikat-ipc ─────────────────────────────────────────
  app.get('/api/v1/sertifikat-ipc', {
    preHandler: [authenticate, requirePermission('finance:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.send({ sertifikat: [], total: 0 })

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const batas = Math.min(Math.max(Number(q.limit) || 100, 1), 500)

    let kueri = db
      .unsafe('sertifikat_ipc', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select(
        `id, nomor, tanggal, status, progres_diakui_pct, nilai_kontrak, retensi_pct,
         kumulatif_sebelumnya, potongan_dp, potongan_lain, potongan_lain_alasan,
         catatan, disetujui_pada, invoice_id, created_at,
         proyek:projects ( id, name ),
         termin:termin_schedules ( id, termin_number, label, amount ),
         penyetuju:users!sertifikat_ipc_disetujui_oleh_fkey ( id, name )`,
        { count: 'exact' },
      )
      .in('project_id', idProyek)

    if (q.project_id) kueri = kueri.eq('project_id', q.project_id)
    if (q.status) kueri = kueri.eq('status', q.status)

    const { data, error, count } = await kueri
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, batas - 1)

    if (error) return reply.status(500).send({ error: error.message })

    // Perhitungan ditempelkan di sini, bukan disimpan di basis. Lihat catatan
    // kepala berkas.
    const sertifikat = (data ?? []).map((s) => ({
      ...s,
      hitung: hitungIpc(s as unknown as MasukanIpc),
    }))

    return reply.send({ sertifikat, total: count ?? 0 })
  })

  // ── GET /api/v1/sertifikat-ipc/:id ─────────────────────────────────────
  app.get('/api/v1/sertifikat-ipc/:id', {
    preHandler: [authenticate, requirePermission('finance:view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Sertifikat tidak ditemukan' })

    // Gerbang tenancy: disaring `projectIds`. Tanpa `.in()`, `eq('id', ...)`
    // mengembalikan sertifikat tenant lain beserta seluruh nilai kontrak dan
    // progres penagihannya — informasi komersial yang paling merugikan bila
    // bocor ke pesaing yang menender proyek yang sama.
    const { data, error } = await db
      .unsafe('sertifikat_ipc', 'ambil satu sertifikat dengan saringan projectIds')
      .select(
        `id, nomor, tanggal, status, progres_diakui_pct, nilai_kontrak, retensi_pct,
         kumulatif_sebelumnya, potongan_dp, potongan_lain, potongan_lain_alasan,
         catatan, disetujui_pada, invoice_id, project_id, termin_id, created_at,
         proyek:projects ( id, name ),
         termin:termin_schedules ( id, termin_number, label, amount, trigger_type, trigger_pct ),
         penyetuju:users!sertifikat_ipc_disetujui_oleh_fkey ( id, name )`,
      )
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Sertifikat tidak ditemukan' })

    return reply.send({
      sertifikat: data,
      hitung: hitungIpc(data as unknown as MasukanIpc),
    })
  })

  // ── POST /api/v1/sertifikat-ipc ────────────────────────────────────────
  //
  // `finance:invoice:create` — DIVERIFIKASI ada di tabel `permissions`.
  // Menerbitkan IPC adalah tindakan penagihan: hasilnya tagihan ke owner.
  app.post('/api/v1/sertifikat-ipc', {
    preHandler: [authenticate, requirePermission('finance:invoice:create')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      termin_id?: string | null
      nomor?: string
      tanggal?: string
      progres_diakui_pct?: number
      retensi_pct?: number
      kumulatif_sebelumnya?: number
      potongan_dp?: number
      potongan_lain?: number
      potongan_lain_alasan?: string
      catatan?: string
    }

    if (!b.project_id || !b.nomor?.trim()) {
      return reply.status(400).send({ error: 'project_id dan nomor wajib diisi' })
    }
    if (!(await proyekMilikTenant(request, b.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const db = request.db!

    // Nilai kontrak dan retensi DIBACA SEKARANG lalu dibekukan di barisnya.
    // Membiarkan penerbit mengirimnya sendiri berarti nilai kontrak di
    // sertifikat bisa berbeda dari kontraknya — dan selisih itu tak akan
    // pernah terlihat karena tak ada yang membandingkan keduanya lagi.
    const { data: proyek, error: eP } = await db
      .unsafe('projects', 'membekukan nilai kontrak & retensi ke sertifikat')
      .select('id, contract_value, retention_pct, progress_pct')
      .eq('id', b.project_id)
      .maybeSingle()

    if (eP) return reply.status(500).send({ error: eP.message })
    if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const nilaiKontrak = Number(
      (proyek as { contract_value: number | string | null }).contract_value ?? 0)
    if (!(nilaiKontrak > 0)) {
      return reply.status(422).send({
        error: 'Proyek ini belum punya nilai kontrak — IPC tak bisa dihitung tanpanya',
      })
    }

    // Progres yang diakui: dari penerbit bila diisi, kalau tidak dari proyek.
    //
    // Penerbit boleh mengakui LEBIH RENDAH dari progres sistem — itu yang
    // terjadi saat sebagian pekerjaan belum diterima owner. Yang tak boleh
    // adalah mengakui lebih dari 100%, dan itu dijaga constraint.
    const progres = b.progres_diakui_pct ?? Number(
      (proyek as { progress_pct: number | string | null }).progress_pct ?? 0)

    const retensi = b.retensi_pct ?? Number(
      (proyek as { retention_pct: number | string | null }).retention_pct ?? 0)

    const { data, error } = await db
      .unsafe('sertifikat_ipc', 'menerbitkan sertifikat; project_id sudah diverifikasi milik tenant')
      .insert({
        project_id: b.project_id,
        termin_id: b.termin_id ?? null,
        nomor: b.nomor.trim(),
        tanggal: b.tanggal ?? new Date().toISOString().slice(0, 10),
        progres_diakui_pct: progres,
        nilai_kontrak: nilaiKontrak,
        retensi_pct: retensi,
        kumulatif_sebelumnya: b.kumulatif_sebelumnya ?? 0,
        potongan_dp: b.potongan_dp ?? 0,
        potongan_lain: b.potongan_lain ?? 0,
        potongan_lain_alasan: b.potongan_lain_alasan ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, status, progres_diakui_pct, nilai_kontrak, retensi_pct, kumulatif_sebelumnya, potongan_dp, potongan_lain')
      .single()

    if (error) {
      // 23505 = nomor kembar ATAU dua sertifikat hidup atas termin yang sama.
      // Keduanya patut dijelaskan, bukan dilempar sebagai galat basis mentah.
      if (error.code === '23505') {
        return reply.status(409).send({
          error: 'Nomor sertifikat sudah dipakai, atau termin ini sudah punya sertifikat yang masih berjalan',
        })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Nilai sertifikat di luar batas yang wajar — periksa progres, retensi, dan potongan',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({
      sertifikat: data,
      hitung: hitungIpc(data as unknown as MasukanIpc),
    })
  })

  // ── PATCH /api/v1/sertifikat-ipc/:id/setujui ───────────────────────────
  //
  // Persetujuan terpisah dari penerbitan: yang menerbitkan dan yang mengakui
  // progres tidak selalu orang yang sama, dan justru itu gunanya.
  app.patch('/api/v1/sertifikat-ipc/:id/setujui', {
    preHandler: [authenticate, requirePermission('finance:invoice:create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Sertifikat tidak ditemukan' })

    const { data, error } = await db
      .unsafe('sertifikat_ipc', 'menyetujui sertifikat; disaring projectIds')
      .update({
        status: 'disetujui',
        disetujui_oleh: request.currentUser!.id,
        disetujui_pada: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'draft')      // hanya draft yang bisa disetujui
      .in('project_id', idProyek)
      .select('id, nomor, status, disetujui_pada')
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    // Nol baris terpengaruh: sertifikatnya tak ada, bukan milik tenant ini,
    // atau statusnya bukan `draft`. Dibedakan dari sukses — update yang tak
    // mengenai apa pun adalah kegagalan senyap kalau dibalas 200.
    if (!data) {
      return reply.status(409).send({
        error: 'Sertifikat tidak ditemukan, atau statusnya bukan draft lagi',
      })
    }

    return reply.send({ sertifikat: data })
  })
}

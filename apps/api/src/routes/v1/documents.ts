import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { validateMime } from '../../utils/mime.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { muatPenyimpanan } from '../../utils/kuota-penyimpanan.js'
import {
  nilaiRevisiDokumen, periksaRevisi, nomorRevisiBerikut,
} from '../../lib/revisi-dokumen.js'

const BUCKET = 'project-documents'
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_SIZE_MB = 20

// Kolom aktual tabel documents (migration 008):
//   id, project_id, title, doc_type, file_url, file_size_kb,
//   file_extension, version, is_visible_to_client,
//   uploaded_by, uploaded_at, created_at, updated_at

const SELECT_FIELDS = `
  id, project_id, title, doc_type, file_url,
  file_size_kb, file_extension, version, is_visible_to_client,
  revisi, menggantikan_id,
  uploaded_by, uploaded_at, created_at,
  uploader:users!documents_uploaded_by_fkey ( id, name )
`

// Role-based access: mana doc_type yang bisa dilihat per role
// admin & pm: semua
// mandor: gambar_kerja, spk, berita_acara
// client: kontrak, gambar_kerja, berita_acara, foto_progress, lainnya — hanya jika is_visible_to_client=true
const ROLE_ALLOWED_TYPES: Record<string, string[] | 'all'> = {
  admin: 'all',
  pm:    'all',
  mandor: ['gambar_kerja', 'spk', 'berita_acara', 'foto_progress'],
  client: ['kontrak', 'gambar_kerja', 'berita_acara', 'foto_progress', 'lainnya'],
}

export default async function documentRoutes(app: FastifyInstance) {

  // ── GET /api/v1/projects/:projectId/documents ─────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/documents',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params
      // T4g: dokumen kategori C. Tanpa gerbang ini, `file_url` (signed URL
      // berlaku 10 TAHUN) ke kontrak/SPK/berita-acara tenant lain bocor —
      // dan uploadnya menulis ke folder storage milik mereka.
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const role = request.currentUser!.role

      let query = request.db!
        .viaProject('documents', projectId)
        .select(SELECT_FIELDS)
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false })

      // Role filter
      const allowed = ROLE_ALLOWED_TYPES[role]
      if (allowed !== 'all') {
        query = query.in('doc_type', allowed)
        // Client hanya lihat yang is_visible_to_client = true
        if (role === 'client') {
          query = query.eq('is_visible_to_client', true)
        }
      }

      const { data, error } = await query

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengambil data dokumen' })
      }

      // ── Status revisi: DITURUNKAN, bukan dibaca dari kolom ───────────────
      //
      // Kolom `status` hanya benar kalau ada yang ingat memperbaruinya saat
      // revisi baru terbit. Yang tak pernah lupa: memeriksa apakah ADA baris
      // lain yang menunjuk baris ini sebagai yang digantikannya.
      //
      // ⚠ Dinilai atas SELURUH hasil query, dan itu berarti saringan peran di
      // atas ikut menentukan. Untuk `client` yang hanya melihat sebagian
      // dokumen, "rev-1 dari 3" bisa terbaca "rev-1 dari 1" — tetapi itu
      // memang keadaan yang benar BAGI DIA: revisi yang tak boleh ia lihat
      // tak boleh pula diberitahukan keberadaannya.
      const { hasil } = nilaiRevisiDokumen(
        (data ?? []) as unknown as Array<{ id: string; title: string; menggantikan_id?: string | null }>)
      const peta = new Map(hasil.map((h) => [h.dokumen.id, h]))

      return reply.send({
        data: (data ?? []).map((d) => {
          const h = peta.get((d as { id: string }).id)
          return {
            ...d,
            digantikan: h?.digantikan ?? false,
            digantikan_oleh: h?.digantikan_oleh ?? null,
            revisi_hitung: h?.revisi ?? 1,
            revisi_terkini: h?.revisi_terkini ?? 1,
          }
        }),
      })
    }
  )

  // ── POST /api/v1/projects/:projectId/documents/upload ────────────────────
  app.post<{
    Params: { projectId: string }
    Body: {
      title: string
      doc_type: string
      is_visible_to_client?: boolean
      file_base64: string
      file_name: string
      file_type: string
      /**
       * Dokumen yang digantikan unggahan ini. Kosong = dokumen baru.
       *
       * Sebelum ini, unggah ulang menghasilkan dua baris berjudul sama tanpa
       * satu pun tautan di antaranya — dan daftar dokumen menampilkan keduanya
       * sebagai dokumen terpisah tanpa cara tahu mana yang BERLAKU.
       */
      menggantikan_id?: string | null
    }
  }>(
    '/api/v1/projects/:projectId/documents/upload',
    // bodyLimit wajib > MAX_SIZE_MB: base64 menambah ~33%. Tanpa ini Fastify (default
    // 1MB) menolak 413 sebelum validasi → dokumen valid gagal diam-diam (bug lama,
    // sekelas temuan foto OPEN-4; diperbaiki bersamaan).
    { preHandler: [authenticate, requirePermission('documents:manage')], bodyLimit: 28 * 1024 * 1024 },
    async (request, reply) => {
      const { projectId } = request.params
      // T4g: dokumen kategori C. Tanpa gerbang ini, `file_url` (signed URL
      // berlaku 10 TAHUN) ke kontrak/SPK/berita-acara tenant lain bocor —
      // dan uploadnya menulis ke folder storage milik mereka.
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const {
        title, doc_type, is_visible_to_client, file_base64, file_name, menggantikan_id,
      } = request.body

      if (!title?.trim()) return reply.status(400).send({ error: 'Judul dokumen wajib diisi' })
      if (!file_base64) return reply.status(400).send({ error: 'File tidak ditemukan' })

      // ── Revisi: diperiksa SEBELUM berkasnya diunggah ─────────────────────
      //
      // Urutan ini bukan selera. Mengunggah dulu lalu menolak berarti berkas
      // yatim tertinggal di storage — dan yang membersihkannya tak pernah ada.
      let revisiBaru = 1
      if (menggantikan_id) {
        const { data: induk } = await request.db!
          .viaProject('documents', projectId)
          .select('id, title, project_id, revisi, menggantikan_id')
          .eq('id', menggantikan_id)
          .maybeSingle()

        const { data: penerus } = await request.db!
          .viaProject('documents', projectId)
          .select('id')
          .eq('menggantikan_id', menggantikan_id)
          .maybeSingle()

        const v = periksaRevisi({
          induk: induk as { id: string; title: string; project_id?: string } | null,
          projectId,
          sudahDigantikan: !!penerus,
        })
        if (!v.ok) return reply.status(409).send({ error: v.galat })

        revisiBaru = nomorRevisiBerikut(induk as { revisi?: number | null } | null)
      }

      const buffer = Buffer.from(file_base64, 'base64')
      if (buffer.byteLength > MAX_SIZE_MB * 1024 * 1024) {
        return reply.status(400).send({ error: `Ukuran file maksimal ${MAX_SIZE_MB}MB` })
      }

      let detectedType: string
      try {
        detectedType = validateMime(buffer, ALLOWED_TYPES)
      } catch (e: unknown) {
        return reply.status(400).send({ error: (e as Error).message })
      }

      const ext = file_name.split('.').pop()?.toLowerCase() ?? 'bin'
      const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${projectId}/${Date.now()}_${safeName}`

      // ⚠ Kuota diperiksa SEBELUM menulis. Memeriksa sesudahnya berarti
      // berkasnya sudah ada di penyimpanan saat ditolak, dan menghapusnya
      // kembali adalah operasi kedua yang bisa gagal sendiri — meninggalkan
      // berkas yatim yang tetap memakan kuota tapi tak tertaut ke apa pun.
      const muat = await muatPenyimpanan(request.companyId!, buffer.length)
      if (!muat.boleh) {
        // 402, sama dengan gerbang modul: ini batas KOMERSIAL, bukan izin.
        // Membedakannya dari 403 memungkinkan UI mengarahkan ke halaman
        // langganan alih-alih menyuruh minta akses ke admin.
        return reply.status(402).send({ error: muat.alasan, kode: 'KUOTA_PENYIMPANAN' })
      }
      if (muat.daruratTerbuka) {
        request.log.warn(
          { companyId: request.companyId },
          'Kuota penyimpanan tak terhitung — unggahan diloloskan'
        )
      }

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: detectedType, upsert: false })

      if (storageError) {
        app.log.error(storageError)
        return reply.status(500).send({ error: 'Gagal upload file ke storage' })
      }

      const { data: urlData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

      const fileUrl = urlData?.signedUrl ?? storagePath

      const { data, error } = await request.db!
        .viaProject('documents', projectId)
        .insert({
          project_id:           projectId,
          title:                title.trim(),
          doc_type:             doc_type || 'lainnya',
          file_url:             fileUrl,
          file_size_kb:         Math.ceil(buffer.byteLength / 1024),
          file_extension:       ext,
          is_visible_to_client: is_visible_to_client ?? false,
          menggantikan_id:      menggantikan_id || null,
          revisi:               revisiBaru,
          // `version` (VARCHAR bebas, bawaan '1.0') DIBIARKAN apa adanya.
          //
          // Ia sudah dipakai data lama dan tak punya constraint apa pun —
          // menimpanya dengan nomor revisi berarti mengubah arti kolom yang
          // sudah terlanjur diisi orang dengan "Rev A", "final", "v2 fix".
          // Nomor yang bisa dipercaya ada di `revisi`.
          uploaded_by:          request.currentUser!.id,
        })
        .select(SELECT_FIELDS)
        .single()

      if (error) {
        app.log.error(error)
        await supabase.storage.from(BUCKET).remove([storagePath])
        return reply.status(500).send({ error: 'Gagal menyimpan record dokumen' })
      }

      return reply.status(201).send({ data })
    }
  )

  // ── PATCH /api/v1/projects/:projectId/documents/:documentId ──────────────
  // Update is_visible_to_client toggle (admin/pm only)
  app.patch<{
    Params: { projectId: string; documentId: string }
    Body: { is_visible_to_client?: boolean }
  }>(
    '/api/v1/projects/:projectId/documents/:documentId',
    { preHandler: [authenticate, requirePermission('documents:manage')] },
    async (request, reply) => {
      const { projectId, documentId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { is_visible_to_client } = request.body

      const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (is_visible_to_client !== undefined) updateFields.is_visible_to_client = is_visible_to_client

      // T4j: gerbang proyek di atas memeriksa `projectId` DARI URL, tapi UPDATE
      // ini dulu hanya menyaring `documentId` — artinya penyerang yang memang
      // punya satu proyek sah bisa lolos gerbang lalu menyebut documentId milik
      // tenant lain. Filter kepemilikan HARUS ada di query yang memutasi.
      const { data, error } = await request.db!
        .viaProject('documents', projectId)
        .update(updateFields)
        .eq('id', documentId)
        .eq('project_id', projectId)
        .select(SELECT_FIELDS)
        .maybeSingle()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal memperbarui dokumen' })
      }

      return reply.send({ data })
    }
  )

  // ── POST /api/v1/documents/:documentId/access-log ────────────────────────
  // Catat akses view/download (fire-and-forget dari frontend)
  app.post<{
    Params: { documentId: string }
    Body: { action: 'view' | 'download' }
  }>(
    '/api/v1/documents/:documentId/access-log',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { documentId } = request.params
      const { action } = request.body

      if (!['view', 'download'].includes(action)) {
        return reply.status(400).send({ error: 'Action tidak valid' })
      }

      // T4g: dokumen wajib milik proyek tenant ini. Dampaknya lebih kecil dari
      // endpoint lain (tak mengembalikan data), tapi tanpa cek ini tenant A bisa
      // menyuntik baris ke log akses dokumen tenant B — mengotori jejak audit
      // yang justru dipakai untuk menyelidiki akses mencurigakan.
      // Lewat wrapper: `documents` kategori C, jadi .viaProject() butuh project.
      // Di sini project-nya BELUM diketahui (hanya documentId), jadi .unsafe()
      // dengan alasan — lalu hasilnya divalidasi proyeknya di baris berikutnya.
      const { data: docTenant } = await request.db!
        .unsafe('documents', 'resolusi project_id dari documentId; divalidasi tepat di bawah')
        .select('project_id').eq('id', documentId).maybeSingle()
      if (!docTenant || !(await proyekMilikTenant(request, docTenant.project_id))) {
        return reply.status(404).send({ error: 'Dokumen tidak ditemukan' })
      }

      // Fire-and-forget, tidak pernah throw ke caller
      ;(async () => {
        try {
          // `document_access_logs` mewarisi lewat `document_id`, bukan
          // `project_id` — argumen kedua HARUS id dokumen. Sama seperti
          // `payments` di `termin-payment.ts`: `.insert()` mengabaikan
          // saringannya sehingga log tetap tercatat; yang diperbaiki polanya,
          // supaya penyalinan berikutnya ke `.select()` tak gagal senyap.
          await request.db!.viaProject('document_access_logs', documentId).insert({
            document_id: documentId,
            user_id:     request.currentUser!.id,
            action,
          })
        } catch (e) {
          app.log.warn({ err: e }, 'access-log insert failed (non-critical)')
        }
      })()

      return reply.send({ success: true })
    }
  )

  // ── DELETE /api/v1/projects/:projectId/documents/:documentId ─────────────
  app.delete<{ Params: { projectId: string; documentId: string } }>(
    '/api/v1/projects/:projectId/documents/:documentId',
    { preHandler: [authenticate, requirePermission('documents:manage')] },
    async (request, reply) => {
      const { projectId, documentId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: doc, error: fetchError } = await request.db!
        .viaProject('documents', projectId)
        .select('id, file_url')
        .eq('id', documentId)
        .eq('project_id', projectId)   // T4g: dokumen HARUS milik proyek di URL
        .maybeSingle()

      if (fetchError || !doc) {
        return reply.status(404).send({ error: 'Dokumen tidak ditemukan' })
      }

      const { error } = await request.db!
        .viaProject('documents', projectId)
        .delete()
        .eq('id', documentId)

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal menghapus dokumen' })
      }

      return reply.send({ success: true })
    }
  )
}

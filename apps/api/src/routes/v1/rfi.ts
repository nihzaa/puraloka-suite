import type { FastifyInstance, FastifyRequest } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import type { TenantDb } from '../../utils/tenant-db.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'

// Request for Information — pertanyaan resmi ke konsultan/pemberi kerja.
// ROADMAP #24. Berbeda modul dari Request for Inspection (`inspeksi.ts`);
// alasannya panjang lebar di `db/migrations/157_rfi_inspeksi_dan_informasi.sql`.
//
// Nilai modul ini bukan menyimpan pertanyaan — itu bisa dilakukan email. Yang
// tak bisa dilakukan email: MENGHITUNG berapa lama pekerjaan menggantung
// menunggu jawaban, dan menautkan angka itu ke klaim perpanjangan waktu.
// Karena itu aritmetika hari adalah bagian paling hati-hati di berkas ini.

const RFI_SELECT = `
  id, project_id, nomor, perihal, pertanyaan, ditujukan_ke, referensi_gambar,
  status, dikirim_pada, jawaban_diharapkan, dijawab_pada, jawaban, dijawab_oleh,
  menghentikan_pekerjaan, pekerjaan_terdampak, eot_id,
  diajukan_oleh, created_at, updated_at,
  pengaju:users!information_requests_diajukan_oleh_fkey ( id, name ),
  eot:contract_eot ( id, eot_number, days_requested, days_approved, status )
`

const TRANSISI: Record<string, string[]> = {
  draft: ['terkirim', 'dibatalkan'],
  // Terkirim → draft TIDAK ADA: surat yang sudah dilayangkan tak bisa
  // ditarik menjadi konsep. Kalau keliru, ia dibatalkan — dengan jejaknya.
  terkirim: ['dijawab', 'dibatalkan'],
  // Dijawab → terkirim: jawaban ternyata tak menjawab, pertanyaan diulang.
  dijawab: ['ditutup', 'terkirim'],
  ditutup: ['dijawab'],
  dibatalkan: ['draft'],
}

const HARI_MS = 86_400_000

/**
 * Berapa hari sebuah pertanyaan menggantung.
 *
 * Ini angka yang dibawa ke klaim, jadi definisinya harus tunggal dan tertulis:
 *   · sudah dijawab → selisih kirim sampai jawab
 *   · belum dijawab → selisih kirim sampai HARI INI (masih berjalan)
 *   · belum dikirim → null, BUKAN 0. Nol berarti "dijawab seketika", dan itu
 *     kebohongan yang menguntungkan diri sendiri di berkas klaim.
 *
 * `Math.floor` pada selisih milidetik, bukan selisih tanggal kalender: RFI yang
 * dikirim Senin 23.50 dan dijawab Selasa 00.10 menggantung 20 menit, bukan
 * "satu hari". Melebihkan hitungan di dokumen klaim adalah cacat yang baru
 * ketahuan ketika pihak lawan menghitung ulang.
 */
function hariMenggantung(dikirim: string | null, dijawab: string | null): number | null {
  if (!dikirim) return null
  const akhir = dijawab ? new Date(dijawab).getTime() : Date.now()
  return Math.floor((akhir - new Date(dikirim).getTime()) / HARI_MS)
}

/** Sudah lewat tanggal yang diminta dan belum dijawab. */
function terlambat(b: { status: string; jawaban_diharapkan: string | null }): boolean {
  if (b.status !== 'terkirim' || !b.jawaban_diharapkan) return false
  return new Date(b.jawaban_diharapkan).getTime() < Date.now()
}

async function nomorBerikutnya(db: TenantDb, projectId: string): Promise<string> {
  const { data, error } = await db
    .viaProject('information_requests', projectId)
    .select('nomor')
    .order('nomor', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Gagal membaca nomor RFI terakhir: ${error.message}`)
  if (!data || data.length === 0) return 'RFI-I-001'
  const cocok = /^RFI-I-(\d+)$/.exec(data[0].nomor)
  if (!cocok) return 'RFI-I-001'
  return `RFI-I-${String(parseInt(cocok[1], 10) + 1).padStart(3, '0')}`
}

async function ambilRfiMilikTenant(
  request: FastifyRequest,
  id: string
): Promise<{
  id: string; project_id: string; nomor: string; perihal: string
  status: string; dikirim_pada: string | null; dijawab_pada: string | null
  menghentikan_pekerjaan: boolean
} | null> {
  const { data, error } = await request.db!
    .unsafe('information_requests', 'lookup by id: project belum diketahui — hasilnya DIPERIKSA proyekMilikTenant di bawah')
    .select('id, project_id, nomor, perihal, pertanyaan, status, dikirim_pada, dijawab_pada, jawaban_diharapkan, menghentikan_pekerjaan, pekerjaan_terdampak, ditujukan_ke, referensi_gambar, eot_id')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Gagal membaca RFI: ${error.message}`)
  if (!data) return null
  if (!(await proyekMilikTenant(request, data.project_id))) return null
  return data
}

export default async function rfiRoutes(app: FastifyInstance) {
  // ── GET daftar ────────────────────────────────────────────────────────────
  app.get<{ Params: { projectId: string }; Querystring: { status?: string } }>(
    '/api/v1/projects/:projectId/rfis',
    { preHandler: [authenticate, requirePermission('rfi:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      let q = request.db!
        .viaProject('information_requests', projectId)
        .select(RFI_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)
      if (request.query.status) q = q.eq('status', request.query.status)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat RFI')
        return reply.status(500).send({ error: 'Gagal memuat daftar RFI' })
      }

      // Hari menggantung dihitung di server, bukan di browser: angka ini masuk
      // berkas klaim, dan dua tempat yang menghitungnya sendiri-sendiri pada
      // akhirnya akan berbeda — biasanya ketahuan justru saat dipakai.
      const denganHitungan = (data ?? []).map((b: Record<string, unknown>) => ({
        ...b,
        hari_menggantung: hariMenggantung(
          b.dikirim_pada as string | null,
          b.dijawab_pada as string | null
        ),
        terlambat: terlambat(b as { status: string; jawaban_diharapkan: string | null }),
      }))

      const { data: rekap, error: errRekap } = await request.db!
        .viaProject('information_requests', projectId)
        .select('status, dikirim_pada, dijawab_pada, jawaban_diharapkan, menghentikan_pekerjaan')

      if (errRekap) request.log.error({ err: errRekap, projectId }, 'gagal menghitung rekap RFI')

      const semua = rekap ?? []
      const perStatus: Record<string, number> = {}
      for (const b of semua) perStatus[b.status] = (perStatus[b.status] ?? 0) + 1

      const menggantung = semua.filter((b) => b.status === 'terkirim')
      const hariTiapnya = menggantung
        .map((b) => hariMenggantung(b.dikirim_pada, null))
        .filter((h): h is number => h !== null)

      return reply.send({
        data: denganHitungan,
        meta: {
          per_status: perStatus,
          total: semua.length,
          menggantung: menggantung.length,
          terlambat: semua.filter(terlambat).length,
          // Yang menggantung DAN menghentikan pekerjaan — pertanyaan paling
          // mahal, dan calon dasar klaim waktu.
          memblokir: menggantung.filter((b) => b.menghentikan_pekerjaan).length,
          // Menggantung paling lama, bukan rata-rata: rata-rata menyamarkan
          // satu pertanyaan yang tertahan 40 hari di antara sepuluh yang
          // dijawab besoknya, dan justru yang 40 hari itu yang jadi perkara.
          menggantung_terlama_hari: hariTiapnya.length ? Math.max(...hariTiapnya) : 0,
          rekap_lengkap: !errRekap,
        },
      })
    }
  )

  // ── POST ──────────────────────────────────────────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rfis',
    { preHandler: [authenticate, requirePermission('rfi:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const body = request.body as {
        perihal?: string; pertanyaan?: string; ditujukan_ke?: string
        referensi_gambar?: string; jawaban_diharapkan?: string
        menghentikan_pekerjaan?: boolean; pekerjaan_terdampak?: string
      }
      const perihal = (body.perihal ?? '').trim()
      const pertanyaan = (body.pertanyaan ?? '').trim()
      if (!perihal) return reply.status(400).send({ error: 'Perihal wajib diisi' })
      if (!pertanyaan) return reply.status(400).send({ error: 'Pertanyaan wajib diisi' })

      let terakhir: string | null = null
      for (let percobaan = 0; percobaan < 5; percobaan++) {
        const nomor = await nomorBerikutnya(request.db!, projectId)
        const { data, error } = await request.db!
          .viaProject('information_requests', projectId)
          .insert({
            project_id: projectId,
            nomor,
            perihal,
            pertanyaan,
            ditujukan_ke: body.ditujukan_ke ?? null,
            referensi_gambar: body.referensi_gambar ?? null,
            jawaban_diharapkan: body.jawaban_diharapkan ?? null,
            menghentikan_pekerjaan: body.menghentikan_pekerjaan ?? false,
            pekerjaan_terdampak: body.pekerjaan_terdampak ?? null,
            diajukan_oleh: request.currentUser!.id,
          })
          .select(RFI_SELECT)
          .single()

        if (!error) {
          await logAuditEvent(request, {
            tableName: 'information_requests', recordId: data.id, action: 'INSERT',
            actorId: request.currentUser!.id,
            newValues: { nomor, perihal, menghentikan_pekerjaan: data.menghentikan_pekerjaan },
          })
          return reply.status(201).send({
            data: { ...data, hari_menggantung: null, terlambat: false },
          })
        }
        if (error.code !== '23505') {
          request.log.error({ err: error, projectId }, 'gagal membuat RFI')
          return reply.status(500).send({ error: 'Gagal menyimpan RFI' })
        }
        terakhir = error.message
      }
      request.log.error({ projectId, terakhir }, 'nomor RFI direbut 5x berturut-turut')
      return reply.status(409).send({ error: 'Nomor RFI direbut berkali-kali. Coba lagi.' })
    }
  )

  // ── PATCH isi (hanya draft) ───────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/rfis/:id',
    { preHandler: [authenticate, requirePermission('rfi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilRfiMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'RFI tidak ditemukan' })

      // Isi pertanyaan BEKU begitu dilayangkan. Surat yang sudah dikirim tak
      // bisa diubah belakangan — kalau bisa, jawaban konsultan akan tampak
      // menjawab pertanyaan yang tak pernah mereka terima, dan seluruh berkas
      // kehilangan nilai sebagai bukti.
      if (lama.status !== 'draft') {
        return reply.status(409).send({
          error: `RFI berstatus '${lama.status}' tidak bisa disunting — isinya sudah `
            + 'dilayangkan. Untuk memperbaiki, ajukan RFI baru yang merujuk nomor ini.',
        })
      }

      const body = request.body as Record<string, unknown>
      const boleh = [
        'perihal', 'pertanyaan', 'ditujukan_ke', 'referensi_gambar',
        'jawaban_diharapkan', 'menghentikan_pekerjaan', 'pekerjaan_terdampak',
      ]
      const perubahan: Record<string, unknown> = {}
      for (const k of boleh) if (k in body) perubahan[k] = body[k]
      if (Object.keys(perubahan).length === 0) {
        return reply.status(400).send({ error: 'Tidak ada field yang bisa diubah' })
      }

      const { data, error } = await request.db!
        .viaProject('information_requests', lama.project_id)
        .update(perubahan).eq('id', id).select(RFI_SELECT).single()
      if (error) {
        request.log.error({ err: error, id }, 'gagal menyunting RFI')
        return reply.status(500).send({ error: 'Gagal menyimpan perubahan' })
      }

      await logAuditEvent(request, {
        tableName: 'information_requests', recordId: id, action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: Object.fromEntries(
          Object.keys(perubahan).map((k) => [k, (lama as Record<string, unknown>)[k]])
        ),
        newValues: perubahan,
      })
      return reply.send({ data })
    }
  )

  // ── PATCH status ──────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/rfis/:id/status',
    { preHandler: [authenticate, requirePermission('rfi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilRfiMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'RFI tidak ditemukan' })

      const body = request.body as {
        status?: string; jawaban?: string; dijawab_oleh?: string
        dijawab_pada?: string; dikirim_pada?: string; eot_id?: string
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

      const perubahan: Record<string, unknown> = { status: baru }

      if (baru === 'terkirim') {
        // Tanggal kirim boleh disebut (surat dilayangkan kemarin, dicatat hari
        // ini) — itu kejadian normal di kantor proyek. Tapi tak boleh di masa
        // depan: lama-menggantung akan negatif.
        const kirim = body.dikirim_pada ?? new Date().toISOString()
        if (new Date(kirim).getTime() > Date.now() + 60_000) {
          return reply.status(400).send({
            error: 'Tanggal kirim tidak boleh di masa depan — lama menggantung '
              + 'akan terhitung negatif',
          })
        }
        perubahan.dikirim_pada = kirim
      }

      if (baru === 'dijawab') {
        const jawaban = (body.jawaban ?? '').trim()
        if (!jawaban) {
          return reply.status(400).send({
            error: 'Isi jawaban wajib — RFI yang ditandai dijawab tanpa isinya '
              + 'tak bisa dipakai sebagai bukti',
          })
        }
        const dijawab = body.dijawab_pada ?? new Date().toISOString()
        // Jawaban mendahului pengiriman = data mustahil. Constraint DB juga
        // menolaknya, tapi ditangkap di sini supaya pesannya menjelaskan
        // SEBABNYA, bukan melempar 23514 yang tak berarti bagi pemakainya.
        if (lama.dikirim_pada && new Date(dijawab).getTime() < new Date(lama.dikirim_pada).getTime()) {
          return reply.status(400).send({
            error: 'Tanggal jawaban lebih awal daripada tanggal kirim. Periksa '
              + 'kembali — urutan terbalik membuat lama menggantung negatif.',
          })
        }
        perubahan.jawaban = jawaban
        perubahan.dijawab_pada = dijawab
        if (body.dijawab_oleh) perubahan.dijawab_oleh = body.dijawab_oleh.trim()
      }

      // Menautkan ke klaim EOT. Dilakukan terpisah dari menjawab karena
      // urutannya memang begitu: jawabannya masuk dulu, baru terlihat berapa
      // lama tertahan, baru diputuskan apakah layak jadi dasar klaim.
      if (body.eot_id !== undefined) {
        if (body.eot_id) {
          // EOT harus milik PROYEK YANG SAMA. Tanpa cek ini, klaim proyek lain
          // bisa ditautkan sebagai dasar — termasuk proyek perusahaan lain.
          const { data: eot } = await request.db!
            .viaProject('contract_eot', lama.project_id)
            .select('id').eq('id', body.eot_id).maybeSingle()
          if (!eot) {
            return reply.status(404).send({ error: 'Klaim EOT tidak ditemukan di proyek ini' })
          }
        }
        perubahan.eot_id = body.eot_id || null
      }

      const { data, error } = await request.db!
        .viaProject('information_requests', lama.project_id)
        .update(perubahan).eq('id', id).select(RFI_SELECT).single()

      if (error) {
        request.log.error({ err: error, id, baru }, 'gagal mengubah status RFI')
        return reply.status(500).send({ error: 'Gagal mengubah status RFI' })
      }

      await logAuditEvent(request, {
        tableName: 'information_requests', recordId: id, action: 'UPDATE',
        actorId: request.currentUser!.id,
        oldValues: { status: lama.status, dikirim_pada: lama.dikirim_pada },
        newValues: perubahan,
        // Melayangkan surat dan mencatat jawaban keduanya jadi bukti saat
        // sengketa — itu bukan penyuntingan biasa.
        severity: (baru === 'terkirim' || baru === 'dijawab') ? 'critical' : 'info',
      })

      return reply.send({
        data: {
          ...data,
          hari_menggantung: hariMenggantung(data.dikirim_pada, data.dijawab_pada),
          terlambat: terlambat(data),
        },
      })
    }
  )

  // ── DELETE ────────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/rfis/:id',
    { preHandler: [authenticate, requirePermission('rfi:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const lama = await ambilRfiMilikTenant(request, id)
      if (!lama) return reply.status(404).send({ error: 'RFI tidak ditemukan' })

      // Hanya konsep. Yang sudah dilayangkan DIBATALKAN — surat yang pernah
      // dikirim adalah bagian dari korespondensi resmi, dan menghapusnya
      // menghilangkan bukti yang mungkin justru menguntungkan kita sendiri.
      if (lama.status !== 'draft') {
        return reply.status(409).send({
          error: `RFI berstatus '${lama.status}' tidak bisa dihapus — sudah menjadi `
            + 'bagian korespondensi resmi. Gunakan status `dibatalkan`.',
        })
      }

      const { error } = await request.db!
        .viaProject('information_requests', lama.project_id).delete().eq('id', id)
      if (error) {
        request.log.error({ err: error, id }, 'gagal menghapus RFI')
        return reply.status(500).send({ error: 'Gagal menghapus RFI' })
      }

      await logAuditEvent(request, {
        tableName: 'information_requests', recordId: id, action: 'DELETE',
        actorId: request.currentUser!.id,
        oldValues: { nomor: lama.nomor, perihal: lama.perihal },
        severity: 'critical',
      })
      return reply.send({ success: true })
    }
  )
}

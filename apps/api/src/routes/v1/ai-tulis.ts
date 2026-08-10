/**
 * POST /api/v1/ai/siapkan-tulis — menerbitkan token (tak menulis apa pun)
 * POST /api/v1/ai/tulis         — memakai token, MENULIS satu baris
 * GET  /api/v1/ai/tulis/entitas — apa saja yang bisa dicatat lewat asisten
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA TEMPAT ASISTEN BISA MENULIS — DAN IA BUKAN TOOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder memilih "CRUD terbatas + token konfirmasi", melampaui TJS yang nol
 * create/update/delete.
 *
 * Yang membuatnya boleh ada: **I-1 tetap utuh**. Tak satu pun tool menulis;
 * `audit-tool-ai-read-only` tetap berambang NOL dan tetap hijau. Tulisannya
 * terjadi DI SINI, dan hanya bisa dipicu permintaan yang membawa token —
 * yaitu klik manusia, bukan kalimat model.
 *
 * Injeksi lewat dokumen bisa membuat model memanggil `siapkan_tulis`. Ia tak
 * bisa membuat manusia menekan tombol, dan token yang tak diklaim kedaluwarsa
 * dalam 15 menit tanpa mengubah apa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA IZIN YANG BERBEDA, DAN ITU DISENGAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ai:chat` untuk bertanya. `ai:tulis` untuk menyimpan. Kalau keduanya satu
 * izin, memberi seseorang akses asisten diam-diam memberinya jalan menulis —
 * dan yang memberikan izin itu tak pernah bermaksud begitu.
 */

import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ENTITAS_TULIS, entitasTulis, persenSah } from '../../lib/ai-tool-siapkan.js'

/** Umur token. Sama dengan token setujui — satu kebiasaan, bukan dua. */
const UMUR_TOKEN_MS = 15 * 60_000

interface BadanSiapkan {
  jenis?: string
  project_id?: string
  persen?: number
  catatan?: string
  judul?: string
  lokasi?: string
  severity?: string
  kanal?: string
}

export default async function aiTulisRoutes(app: FastifyInstance) {
  // ── Apa saja yang bisa dicatat — supaya UI tak menebak ───────────────────
  app.get(
    '/api/v1/ai/tulis/entitas',
    { preHandler: [authenticate, requirePermission('ai:tulis')] },
    async (_req, reply) =>
      reply.send({
        data: ENTITAS_TULIS.map((e) => ({
          jenis: e.jenis,
          label: e.label,
          aksi: e.aksi,
          field: e.field,
        })),
      }),
  )

  // ── SIAPKAN: menerbitkan token. Tak menyentuh entitasnya sama sekali. ────
  app.post<{ Body: BadanSiapkan }>(
    '/api/v1/ai/siapkan-tulis',
    {
      preHandler: [authenticate, requirePermission('ai:tulis')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const b = request.body ?? {}
      const jenis = (b.jenis ?? '').trim()
      const meta = entitasTulis(jenis)

      if (!meta) {
        return reply.status(422).send({
          error: `Jenis '${jenis}' tidak bisa dicatat lewat asisten.`,
          tersedia: ENTITAS_TULIS.map((e) => e.jenis),
        })
      }

      const projectId = (b.project_id ?? '').trim()
      if (!projectId) {
        return reply.status(422).send({ error: 'project_id wajib diisi' })
      }

      /*
       * Proyek DIVERIFIKASI milik tenant ini lewat `request.db`.
       *
       * Tanpa ini, id proyek tenant lain yang dikirim pemanggil akan lolos —
       * dan barisnya tercipta di proyek mereka, dengan `company_id` yang
       * tampak benar karena diambil dari sesi penulis.
       */
      const { data: proyek, error: errProyek } = await request.db!
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .maybeSingle()

      if (errProyek) {
        request.log.error({ err: errProyek }, 'ai/tulis: gagal memeriksa proyek')
        return reply.status(500).send({ error: 'Gagal memeriksa proyek' })
      }
      if (!proyek) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const namaProyek = (proyek as { name: string }).name

      // ── Validasi per jenis ────────────────────────────────────────────────
      let muatan: Record<string, unknown>
      let ringkasan: string

      if (jenis === 'catatan_progres') {
        if (!persenSah(b.persen)) {
          return reply.status(422).send({ error: 'persen harus angka 0-100' })
        }
        muatan = {
          pct_overall: Number(b.persen),
          notes: (b.catatan ?? '').trim() || null,
        }
        ringkasan = `Catatan progres ${namaProyek}: ${Number(b.persen)}%${
          b.catatan?.trim() ? ` — ${b.catatan.trim()}` : ''
        }`
      } else if (jenis === 'temuan_punch') {
        const judul = (b.judul ?? '').trim()
        if (judul.length < 5) {
          return reply.status(422).send({ error: 'judul temuan minimal 5 karakter' })
        }
        // Nilai enum `punch_severity` DIUKUR dari pg_enum, bukan ditebak.
        // Versi pertama memakai 'minor'/'major' — tebakan Inggris yang wajar
        // dari nama field, dan Postgres menolaknya dengan galat yang muncul
        // SESUDAH token terlanjur habis.
        const SEVERITY = ['ringan', 'sedang', 'berat', 'kritis']
        const severity = SEVERITY.includes(b.severity ?? '') ? b.severity : 'sedang'
        muatan = {
          judul,
          lokasi: (b.lokasi ?? '').trim() || null,
          severity,
        }
        ringkasan = `Temuan punch ${namaProyek}: ${judul}${
          b.lokasi?.trim() ? ` (${b.lokasi.trim()})` : ''
        }`
      } else {
        // Tak terjangkau — `entitasTulis` sudah menyaring. Ditulis eksplisit
        // supaya jenis baru yang lupa ditangani gagal KERAS di sini, bukan
        // menyimpan muatan kosong yang terlihat sah.
        return reply.status(500).send({ error: `Jenis '${jenis}' terdaftar tapi tak ditangani.` })
      }

      const token = randomBytes(32).toString('base64url')
      const kedaluwarsa = new Date(Date.now() + UMUR_TOKEN_MS).toISOString()

      const { error } = await request.db!
        .from('ai_token_tulis')
        .insert({
          company_id: request.companyId!,
          token,
          user_id: request.currentUser!.id,
          jenis,
          aksi: 'buat',
          project_id: projectId,
          muatan,
          ringkasan,
          kanal: b.kanal === 'wa' || b.kanal === 'ai_whatsapp' ? 'ai_whatsapp' : 'web',
          kedaluwarsa,
        })
        .select('id')

      if (error) {
        request.log.error({ err: error }, 'ai/tulis: gagal menerbitkan token')
        return reply.status(500).send({ error: 'Gagal menyiapkan catatan' })
      }

      return reply.send({ token, ringkasan, kedaluwarsa, jenis })
    },
  )

  // ── TULIS: klaim token ATOMIK, lalu simpan satu baris ────────────────────
  app.post<{ Body: { token?: string } }>(
    '/api/v1/ai/tulis',
    {
      preHandler: [authenticate, requirePermission('ai:tulis')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = (request.body?.token ?? '').trim()
      if (!token) return reply.status(422).send({ error: 'token wajib diisi' })

      const { data: lihat, error: errLihat } = await request.db!
        .from('ai_token_tulis')
        .select('id, user_id, jenis, aksi, project_id, muatan, ringkasan, kedaluwarsa, dipakai_pada')
        .eq('token', token)
        .maybeSingle()

      if (errLihat) {
        // Gangguan basis TIDAK boleh menyamar jadi "token tak dikenal" — kalau
        // dibiarkan, jejak audit terisi orang yang tak melakukan kesalahan.
        request.log.error({ err: errLihat }, 'ai/tulis: gagal membaca token')
        return reply.status(503).send({ error: 'Gagal memeriksa token. Coba lagi.' })
      }
      if (!lihat) return reply.status(410).send({ error: 'Token tidak dikenal.' })

      const t = lihat as {
        id: string
        user_id: string
        jenis: string
        aksi: string
        project_id: string
        muatan: Record<string, unknown>
        ringkasan: string
        kedaluwarsa: string
        dipakai_pada: string | null
      }

      if (t.user_id !== request.currentUser!.id) {
        void logAuditEvent(request, {
          tableName: 'ai_token_tulis',
          recordId: request.currentUser!.id,
          action: 'ai.tulis.ditolak',
          actorId: request.currentUser!.id,
          newValues: { alasan: 'bukan_pemilik_token' },
          severity: 'critical',
        })
        return reply.status(403).send({ error: 'Token ini bukan milik Anda.' })
      }
      if (t.dipakai_pada) return reply.status(409).send({ error: 'Token sudah dipakai.' })
      if (new Date(t.kedaluwarsa).getTime() < Date.now()) {
        return reply.status(410).send({ error: 'Token sudah kedaluwarsa.' })
      }

      /*
       * Klaim ATOMIK sebelum menulis apa pun.
       *
       * `dipakai_pada IS NULL` ikut di WHERE — basis yang menengahi. Dengan
       * baca-lalu-tulis, dua klik bersamaan sama-sama melihat "belum dipakai"
       * dan DUA baris tercipta; pengguna melihat catatan gandanya dan tak
       * tahu mana yang benar.
       */
      const { data: diklaim, error: errKlaim } = await request.db!
        .from('ai_token_tulis')
        .update({ dipakai_pada: new Date().toISOString() })
        .eq('id', t.id)
        .is('dipakai_pada', null)
        .select('id')

      if (errKlaim) {
        request.log.error({ err: errKlaim }, 'ai/tulis: gagal mengklaim token')
        return reply.status(503).send({ error: 'Gagal mengklaim token' })
      }
      if (!diklaim || (diklaim as unknown[]).length === 0) {
        return reply.status(409).send({ error: 'Token sudah dipakai.' })
      }

      const meta = entitasTulis(t.jenis)
      if (!meta) {
        return reply.status(500).send({ error: `Jenis '${t.jenis}' tak dikenal lagi.` })
      }

      // ── Tulisan sesungguhnya ─────────────────────────────────────────────
      //
      // `viaProject`: kedua tabel kategori C, dan wrapper menolak `.from()`
      // untuk keduanya di titik pemanggilan.
      const dasar = { project_id: t.project_id }

      /*
       * `punch_items.nomor` WAJIB dan UNIK per proyek — diukur dari
       * information_schema dan `uq_punch_items_project_nomor`, bukan ditebak.
       * Formatnya `PL-YYMM-NNN`, mengikuti baris yang sudah ada.
       *
       * Nomor dihitung dari yang TERTINGGI di proyek itu, bukan dari jumlah
       * baris: baris yang pernah dihapus akan membuat hitungan menabrak nomor
       * yang masih terpakai, dan galatnya muncul sebagai "gagal menyimpan"
       * yang tak menyebut sebabnya.
       */
      let nomorBaru: string | null = null
      if (t.jenis === 'temuan_punch') {
        const { data: adaNomor } = await request.db!
          .viaProject('punch_items', t.project_id)
          .select('nomor')
          .eq('project_id', t.project_id)
          .order('nomor', { ascending: false })
          .limit(1)

        const kini = new Date()
        const yymm = `${String(kini.getFullYear()).slice(2)}${String(kini.getMonth() + 1).padStart(2, '0')}`
        const terakhir = (adaNomor as Array<{ nomor: string }> | null)?.[0]?.nomor ?? ''
        const urut = Number(terakhir.split('-').pop()) || 0
        nomorBaru = `PL-${yymm}-${String(urut + 1).padStart(3, '0')}`
      }
      // `Record<string, unknown>`: bentuk barisnya BERBEDA per jenis, dan
      // menyatukannya jadi satu tipe akan menuntut union yang harus diperbarui
      // tiap entitas baru — persis jenis pekerjaan yang pasti terlupakan.
      const baris: Record<string, unknown> =
        t.jenis === 'catatan_progres'
          ? {
              ...dasar,
              ...t.muatan,
              reported_by: request.currentUser!.id,
              logged_at: new Date().toISOString(),
            }
          : {
              ...dasar,
              ...t.muatan,
              nomor: nomorBaru,
              status: 'terbuka',
              ditemukan_oleh: request.currentUser!.id,
            }

      const { data: hasil, error: errTulis } = await request.db!
        .viaProject(meta.tabel, t.project_id)
        .insert(baris)
        .select('id')

      if (errTulis) {
        /*
         * Token SUDAH habis meski tulisannya gagal, dan itu disengaja.
         *
         * Mengembalikannya berarti token bisa dicoba berulang kali — pintu
         * untuk mencoba-coba sampai satu percobaan lolos. Pengguna cukup
         * meminta asisten menyiapkan lagi; ongkosnya satu pesan.
         */
        request.log.error({ err: errTulis, jenis: t.jenis }, 'ai/tulis: gagal menyimpan')
        void logAuditEvent(request, {
          tableName: meta.tabel,
          recordId: t.project_id,
          action: 'ai.tulis.gagal',
          actorId: request.currentUser!.id,
          newValues: { jenis: t.jenis, galat: errTulis.message },
          severity: 'critical',
        })
        return reply.status(500).send({ error: `Gagal menyimpan: ${errTulis.message}` })
      }

      const idBaru = (hasil as Array<{ id: string }>)?.[0]?.id ?? null

      // Jejak dari NIAT ke HASIL: tanpa `hasil_id`, tak ada cara menghubungkan
      // baris yang tercipta dengan token yang membuatnya.
      const { error: errJejak } = await request.db!
        .from('ai_token_tulis')
        .update({ hasil_id: idBaru })
        .eq('id', t.id)
        .select('id')

      // Gagal menautkan jejak TIDAK membatalkan tulisannya — barisnya sudah
      // ada, dan membatalkan sesuatu yang sudah tersimpan lebih berisiko
      // daripada kehilangan tautannya. Tapi ia juga tak boleh hilang:
      // "siapa yang mencatat ini lewat asisten?" jadi tak terjawab.
      if (errJejak) {
        request.log.error(
          { err: errJejak, token: t.id, hasil: idBaru },
          'ai/tulis: hasil_id gagal ditautkan — jejak niat→hasil terputus',
        )
      }

      void logAuditEvent(request, {
        tableName: meta.tabel,
        recordId: idBaru ?? t.project_id,
        action: 'ai.tulis.berhasil',
        actorId: request.currentUser!.id,
        // Muatan ikut: yang tersimpan lewat asisten harus bisa ditelusuri
        // sampai ke isinya, bukan hanya ke fakta bahwa ia terjadi.
        newValues: { jenis: t.jenis, ringkasan: t.ringkasan, muatan: t.muatan },
        severity: 'critical',
      })

      return reply.send({ ok: true, id: idBaru, jenis: t.jenis, ringkasan: t.ringkasan })
    },
  )
}

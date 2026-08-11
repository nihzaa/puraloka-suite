import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { buatKunci, periksaPermintaan, kedaluwarsaDari } from '../../lib/api-key.js'

/**
 * PENGELOLAAN API KEY (G6c).
 *
 * ── Yang TIDAK pernah dikembalikan endpoint ini
 *
 * Nilai kunci. Ia muncul **satu kali** di balasan POST, dan sesudah itu tak
 * ada endpoint mana pun yang bisa memulihkannya — karena yang tersimpan
 * hanyalah hash satu arah. Yang hilang harus dicabut dan dibuat ulang.
 *
 * Ini bukan kekurangan yang perlu diperbaiki nanti: kunci yang bisa dibaca
 * ulang berarti siapa pun yang memegang server bisa membaca kredensial
 * setiap pelanggan.
 *
 * ── Kenapa tak ada PATCH
 *
 * Kunci tak bisa disunting — dijaga `trg_api_key_hash_beku` di basis. Yang
 * boleh: mencabut lalu membuat baru. Mengganti isi kunci diam-diam
 * memindahkan akses tanpa pemilik lama tahu.
 */

const SELECT = `
  id, nama, keperluan, awalan, izin,
  kedaluwarsa_pada, dicabut_pada, alasan_cabut,
  dibuat_oleh, dibuat_pada, dipakai_terakhir, jumlah_pakai
`

export default async function apiKeyRoutes(app: FastifyInstance) {
  // ── GET /api-key ─────────────────────────────────────────────────────────
  app.get(
    '/api/v1/api-key',
    { preHandler: [authenticate, requirePermission('settings:apikey:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('api_key')
        .select(SELECT)
        .order('dibuat_pada', { ascending: false })
        .limit(200)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat kunci API')
        return reply.status(500).send({ error: 'Gagal memuat kunci API' })
      }

      const sekarang = Date.now()
      return reply.send({
        kunci: (data as Array<Record<string, unknown>>).map((k) => ({
          ...k,
          // Keadaan dihitung di sini supaya layar tak mengulang logikanya —
          // dan supaya "kedaluwarsa" tak jadi keadaan yang lupa ditampilkan.
          keadaan: k.dicabut_pada
            ? 'dicabut'
            : new Date(k.kedaluwarsa_pada as string).getTime() <= sekarang
              ? 'kedaluwarsa'
              : 'aktif',
        })),
      })
    },
  )

  // ── POST /api-key — satu-satunya tempat nilai kunci pernah terlihat ──────
  app.post<{
    Body: {
      nama?: string
      keperluan?: string
      hari_berlaku?: number | string
      izin?: string[]
    }
  }>(
    '/api/v1/api-key',
    { preHandler: [authenticate, requirePermission('settings:apikey:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}

      const p = periksaPermintaan(b.nama, b.keperluan, b.hari_berlaku as number)
      if (p) return reply.status(400).send({ error: p })

      const izin = Array.isArray(b.izin) ? b.izin.filter((x) => typeof x === 'string' && x) : []

      // Izin yang diminta harus BENAR-BENAR ADA. Izin karangan lolos INSERT
      // lalu tak pernah cocok dengan apa pun — kunci yang terlihat berwenang
      // di layar dan menolak semua permintaan di kenyataan.
      if (izin.length > 0) {
        const { data: sah, error: eIzin } = await request.db!
          .from('permissions').select('key').in('key', izin)
        if (eIzin) {
          request.log.error({ err: eIzin }, 'gagal memeriksa izin')
          return reply.status(500).send({ error: 'Gagal memeriksa izin' })
        }
        const adaSet = new Set((sah ?? []).map((r) => (r as { key: string }).key))
        const asing = izin.filter((x) => !adaSet.has(x))
        if (asing.length > 0) {
          return reply.status(400).send({
            error: `Izin tidak dikenal: ${asing.join(', ')}. Izin karangan lolos `
              + 'tersimpan lalu tak pernah cocok dengan apa pun — kuncinya akan '
              + 'terlihat berwenang di layar dan menolak semua permintaan.',
          })
        }
      }

      const k = buatKunci()

      const { data, error } = await request.db!
        .from('api_key')
        .insert({
          nama: b.nama!.trim(),
          keperluan: b.keperluan!.trim(),
          hash_kunci: k.hash,
          awalan: k.awalan,
          izin,
          kedaluwarsa_pada: kedaluwarsaDari(Number(b.hari_berlaku)),
          dibuat_oleh: request.currentUser!.id,
        })
        .select(SELECT)
        .single()

      if (error) {
        request.log.error({ err: error }, 'gagal membuat kunci API')
        return reply.status(400).send({ error: error.message })
      }

      // ⚠ `newValues` TIDAK memuat kunci maupun hash-nya. Audit log dibaca
      // banyak orang dan diekspor; menaruh kredensial di sana memindahkan
      // rahasia ke tempat yang justru paling mudah dibaca.
      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'api_key',
        recordId: data!.id as string,
        newValues: {
          nama: data!.nama, keperluan: data!.keperluan, awalan: data!.awalan,
          izin: data!.izin, kedaluwarsa_pada: data!.kedaluwarsa_pada,
        } as Record<string, unknown>,
      })

      return reply.status(201).send({
        kunci: data,
        // SATU-SATUNYA tempat nilai ini pernah keluar dari server.
        nilai: k.kunci,
        peringatan: 'Salin sekarang — nilai ini tidak akan pernah ditampilkan '
          + 'lagi. Yang tersimpan hanya sidik jarinya, jadi kami pun tak bisa '
          + 'memulihkannya. Kunci yang hilang harus dicabut dan dibuat ulang.',
      })
    },
  )

  // ── POST /api-key/:id/cabut ──────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { alasan?: string } }>(
    '/api/v1/api-key/:id/cabut',
    { preHandler: [authenticate, requirePermission('settings:apikey:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const alasan = request.body?.alasan?.trim() ?? ''

      if (alasan.length < 5) {
        return reply.status(400).send({
          error: 'Alasan pencabutan wajib diisi minimal 5 huruf — tanpa itu, '
            + '"kenapa integrasi kami mati?" tak punya jawaban.',
        })
      }

      // `.eq('dicabut_pada', null)` ikut di WHERE, bukan hanya diperiksa lebih
      // dulu: dua permintaan bersamaan bisa sama-sama lolos pemeriksaan
      // aplikasi, dan yang kedua akan menimpa alasan pencabutan pertama —
      // menghapus keterangan yang justru dicari saat ditelusuri.
      const { data, error } = await request.db!
        .from('api_key')
        .update({
          dicabut_pada: new Date().toISOString(),
          dicabut_oleh: request.currentUser!.id,
          alasan_cabut: alasan,
        })
        .eq('id', id)
        .is('dicabut_pada', null)
        .select(SELECT)

      if (error) {
        request.log.error({ err: error, id }, 'gagal mencabut kunci API')
        return reply.status(400).send({ error: error.message })
      }

      if (!data || data.length === 0) {
        // Bisa berarti dua hal, dan keduanya bukan galat server: kunci tak
        // ada, atau sudah dicabut lebih dulu.
        const { data: ada } = await request.db!
          .from('api_key').select('id, dicabut_pada').eq('id', id).maybeSingle()
        if (!ada) return reply.status(404).send({ error: 'Kunci tidak ditemukan' })
        return reply.status(409).send({
          error: 'Kunci ini sudah dicabut sebelumnya.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'api_key',
        recordId: id,
        newValues: { dicabut_pada: data[0].dicabut_pada, alasan_cabut: alasan },
      })

      return reply.send({ kunci: data[0] })
    },
  )

  // ── GET /api-key/:id/pemakaian ───────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/api-key/:id/pemakaian',
    { preHandler: [authenticate, requirePermission('settings:apikey:view')] },
    async (request, reply) => {
      const { id } = request.params

      // Kunci diperiksa lebih dulu lewat `request.db` (sadar tenant) — tanpa
      // itu, id milik tenant lain akan menghasilkan daftar kosong yang
      // terbaca sebagai "kunci ini belum pernah dipakai".
      const { data: kunci, error: eKunci } = await request.db!
        .from('api_key').select('id').eq('id', id).maybeSingle()
      if (eKunci) return reply.status(500).send({ error: eKunci.message })
      if (!kunci) return reply.status(404).send({ error: 'Kunci tidak ditemukan' })

      // ⚠ `api_key_pakai` kategori C lewat `api_key_id` — disaring ke kunci
      // yang SUDAH terbukti milik tenant ini di query atas.
      const { data, error } = await request.db!
        .unsafe('api_key_pakai', 'disaring ke kunci yang sudah terbukti milik tenant ini')
        .select('pada, metode, jalur, status, ip')
        .eq('api_key_id', id)
        .order('pada', { ascending: false })
        .limit(200)
      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat pemakaian kunci')
        return reply.status(500).send({ error: 'Gagal memuat pemakaian kunci' })
      }

      return reply.send({ pemakaian: data })
    },
  )
}

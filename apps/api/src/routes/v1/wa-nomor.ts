/**
 * NOMOR WHATSAPP — daftar, verifikasi, nonaktifkan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA VERIFIKASI, BUKAN SEKADAR MENGETIK NOMOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Siapa pun bisa mengetik nomor orang lain. Tanpa verifikasi, mendaftarkan
 * nomor atasan sudah cukup untuk membaca data yang jadi wewenangnya — dan
 * jejaknya tak terlihat, karena sesi yang terbentuk sah menurut sistem.
 *
 * Kodenya dikirim KE NOMOR ITU. Yang memegang nomornya yang bisa
 * mengonfirmasi, dan itu satu-satunya bukti kepemilikan yang tersedia.
 *
 * ── Kenapa kode disimpan apa adanya, bukan di-hash
 *
 * Umurnya 10 menit, panjangnya 6 digit, dan percobaannya dibatasi 5. Hash
 * akan menambah lapisan yang tak mengubah apa pun: penyerang yang bisa
 * membaca tabel ini sudah bisa membaca `wa_nomor_pengguna` seluruhnya, dan
 * kode yang kedaluwarsa dalam 10 menit tak berguna baginya.
 *
 * Yang justru penting: kode TIDAK PERNAH dikembalikan lewat API. Ia hanya
 * dikirim lewat WhatsApp.
 */

import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ambilKredensial } from '../../lib/kredensial.js'
import {
  kirimWa,
  konfigurasiKanal as muatKonfigurasi,
  normalkanNomor,
} from '../../lib/wa-kirim.js'

const UMUR_KODE_MS = 10 * 60_000
const MAKS_PERCOBAAN = 5

/**
 * Konfigurasi kanal untuk request web.
 *
 * Pemuatannya sendiri tinggal di `wa-kirim.ts` — dipakai bersama webhook, yang
 * tak punya bentuk `request` yang sama. Di sini hanya pengikatannya.
 */
function konfigurasiKanal(request: Parameters<typeof ambilKredensial>[0]) {
  return muatKonfigurasi((kunci) => ambilKredensial(request, kunci))
}

export default async function waNomorRoutes(app: FastifyInstance) {
  // ── GET /api/v1/wa/nomor ─────────────────────────────────────────────────
  app.get(
    '/api/v1/wa/nomor',
    { preHandler: [authenticate, requirePermission('settings:wa:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('wa_nomor_pengguna')
        // `kode_verifikasi` TIDAK ikut. Kode yang bisa dibaca lewat API
        // membuat verifikasi kehilangan artinya — siapa pun yang bisa
        // membuka halaman ini bisa memverifikasi nomor siapa pun.
        .select('id, user_id, nomor, terverifikasi_pada, aktif, percobaan_gagal, dibuat_pada')
        .order('dibuat_pada', { ascending: false })

      if (error) {
        request.log.error({ err: error }, 'wa/nomor: gagal membaca daftar')
        return reply.status(500).send({ error: 'Gagal membaca daftar nomor' })
      }

      const cfg = await konfigurasiKanal(request)
      return reply.send({
        data: data ?? [],
        // UI memakai ini untuk menjelaskan kenapa "Kirim kode" tak bisa
        // ditekan, alih-alih menampilkan 503 telanjang setelah diklik.
        kanal_siap: cfg !== null,
      })
    },
  )

  // ── POST /api/v1/wa/nomor ────────────────────────────────────────────────
  app.post<{ Body: { nomor?: string; user_id?: string } }>(
    '/api/v1/wa/nomor',
    {
      preHandler: [authenticate, requirePermission('settings:wa:manage')],
      // Per user: pendaftaran nomor memicu pengiriman WhatsApp, dan
      // pengiriman berulang ke nomor orang lain adalah gangguan.
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (r: { currentUser?: { id: string }; ip: string }) =>
            r.currentUser?.id ?? r.ip,
        },
      },
    },
    async (request, reply) => {
      const nomor = normalkanNomor(request.body?.nomor ?? '')
      if (!nomor) {
        return reply.status(422).send({
          error: 'Nomor tidak sah. Contoh yang diterima: 08123456789 atau +628123456789.',
        })
      }

      // Nomor didaftarkan UNTUK pengguna tertentu; bawaannya diri sendiri.
      // Mendaftarkan untuk orang lain butuh `settings:wa:manage` yang sudah
      // diperiksa preHandler — dan verifikasinya tetap harus dari nomor itu.
      const userId = request.body?.user_id ?? request.currentUser!.id

      const kode = String(randomInt(0, 1_000_000)).padStart(6, '0')
      const kedaluwarsa = new Date(Date.now() + UMUR_KODE_MS).toISOString()

      const { data, error } = await request.db!
        .from('wa_nomor_pengguna')
        .upsert(
          {
            company_id: request.companyId!,
            user_id: userId,
            nomor,
            kode_verifikasi: kode,
            kode_kedaluwarsa: kedaluwarsa,
            percobaan_gagal: 0,
            // Mendaftar ulang nomor yang sudah terverifikasi MENGULANG
            // verifikasinya. Kalau tidak, orang bisa memindahkan nomor
            // terverifikasi ke akun lain tanpa membuktikan apa pun.
            terverifikasi_pada: null,
            aktif: true,
          },
          { onConflict: 'nomor' },
        )
        .select('id, nomor')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, nomor }, 'wa/nomor: gagal mendaftarkan')
        return reply.status(500).send({ error: 'Gagal mendaftarkan nomor' })
      }

      const cfg = await konfigurasiKanal(request)
      const hasil = await kirimWa({
        db: request.db!,
        companyId: request.companyId!,
        nomor,
        teks:
          `Kode verifikasi Puraloka Suite: ${kode}\n\n` +
          'Berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun — ' +
          'termasuk yang mengaku dari Puraloka.',
        userId,
        konfigurasi: cfg,
        // TANPA kunci idempotensi: pendaftaran ulang MEMANG harus mengirim
        // kode baru. Kunci di sini akan membuat percobaan kedua tertelan, dan
        // orang yang tak menerima SMS pertama tak punya jalan keluar.
      })

      void logAuditEvent(request, {
        tableName: 'wa_nomor_pengguna',
        recordId: nomor,
        action: 'wa.nomor.daftar',
        actorId: request.currentUser!.id,
        newValues: { nomor, untuk_user: userId, terkirim: hasil.ok },
        severity: 'warning',
      })

      if (!hasil.ok) {
        // Barisnya TETAP tersimpan — nomornya sudah terdaftar, hanya kodenya
        // yang belum sampai. Menghapusnya akan memaksa mengetik ulang.
        return reply.status(503).send({
          error: `Nomor tersimpan, tetapi kode gagal dikirim: ${hasil.pesan}`,
          alasan: hasil.alasan,
          id: (data as { id?: string } | null)?.id ?? null,
        })
      }

      // Kodenya TIDAK dikembalikan. Ia hanya ada di WhatsApp nomor itu.
      return reply.send({ ok: true, id: (data as { id?: string } | null)?.id ?? null, nomor })
    },
  )

  // ── POST /api/v1/wa/nomor/:id/verifikasi ─────────────────────────────────
  app.post<{ Params: { id: string }; Body: { kode?: string } }>(
    '/api/v1/wa/nomor/:id/verifikasi',
    {
      preHandler: [authenticate, requirePermission('settings:wa:manage')],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (r: { currentUser?: { id: string }; ip: string }) =>
            r.currentUser?.id ?? r.ip,
        },
      },
    },
    async (request, reply) => {
      const kode = (request.body?.kode ?? '').trim()
      if (!/^\d{6}$/.test(kode)) {
        return reply.status(422).send({ error: 'Kode harus 6 digit' })
      }

      const { data, error } = await request.db!
        .from('wa_nomor_pengguna')
        .select('id, nomor, kode_verifikasi, kode_kedaluwarsa, percobaan_gagal, terverifikasi_pada')
        .eq('id', request.params.id)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'wa/nomor: gagal membaca nomor')
        return reply.status(500).send({ error: 'Gagal membaca nomor' })
      }
      if (!data) return reply.status(404).send({ error: 'Nomor tidak ditemukan' })

      const b = data as {
        id: string; nomor: string
        kode_verifikasi: string | null; kode_kedaluwarsa: string | null
        percobaan_gagal: number; terverifikasi_pada: string | null
      }

      if (b.terverifikasi_pada) {
        return reply.send({ ok: true, sudah: true, nomor: b.nomor })
      }

      if (b.percobaan_gagal >= MAKS_PERCOBAAN) {
        // Tanpa batas, 6 digit bisa ditebak habis. Yang tercapai batasnya
        // harus mendaftar ulang — itu memicu kode baru ke nomor aslinya, jadi
        // penyerang yang tak memegang nomor itu berhenti di sini.
        return reply.status(429).send({
          error: 'Terlalu banyak percobaan. Daftarkan ulang nomornya untuk mendapat kode baru.',
          alasan: 'percobaan_habis',
        })
      }

      const kedaluwarsa = b.kode_kedaluwarsa ? new Date(b.kode_kedaluwarsa) : null
      if (!b.kode_verifikasi || !kedaluwarsa || kedaluwarsa.getTime() < Date.now()) {
        return reply.status(410).send({
          error: 'Kode sudah kedaluwarsa. Daftarkan ulang untuk mendapat kode baru.',
          alasan: 'kode_kedaluwarsa',
        })
      }

      if (b.kode_verifikasi !== kode) {
        // Penghitung dinaikkan dengan UPDATE bersyarat pada nilai lama —
        // dua percobaan bersamaan yang sama-sama membaca 2 lalu sama-sama
        // menulis 3 akan menghabiskan satu jatah, bukan dua.
        await request.db!
          .from('wa_nomor_pengguna')
          .update({ percobaan_gagal: b.percobaan_gagal + 1 })
          .eq('id', b.id)
          .eq('percobaan_gagal', b.percobaan_gagal)
          .select('id')

        return reply.status(422).send({
          error: 'Kode salah',
          alasan: 'kode_salah',
          sisa_percobaan: Math.max(0, MAKS_PERCOBAAN - (b.percobaan_gagal + 1)),
        })
      }

      const { data: hasil, error: errUpd } = await request.db!
        .from('wa_nomor_pengguna')
        .update({
          terverifikasi_pada: new Date().toISOString(),
          // Kode DIHAPUS setelah dipakai. Kode yang tinggal di basis bisa
          // dipakai ulang kalau verifikasinya kelak di-reset.
          kode_verifikasi: null,
          kode_kedaluwarsa: null,
          percobaan_gagal: 0,
        })
        .eq('id', b.id)
        // Status lama ikut di WHERE: dua permintaan bersamaan tak boleh
        // sama-sama "berhasil memverifikasi".
        .is('terverifikasi_pada', null)
        .select('id, nomor, terverifikasi_pada')
        .maybeSingle()

      if (errUpd || !hasil) {
        request.log.error({ err: errUpd }, 'wa/nomor: gagal menyimpan verifikasi')
        return reply.status(500).send({ error: 'Gagal menyimpan verifikasi' })
      }

      void logAuditEvent(request, {
        tableName: 'wa_nomor_pengguna',
        recordId: b.nomor,
        action: 'wa.nomor.terverifikasi',
        actorId: request.currentUser!.id,
        newValues: { nomor: b.nomor },
        severity: 'critical',
      })

      return reply.send({ ok: true, nomor: b.nomor })
    },
  )

  // ── PATCH /api/v1/wa/nomor/:id ───────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { aktif?: boolean } }>(
    '/api/v1/wa/nomor/:id',
    { preHandler: [authenticate, requirePermission('settings:wa:manage')] },
    async (request, reply) => {
      const aktif = request.body?.aktif
      if (typeof aktif !== 'boolean') {
        return reply.status(422).send({ error: 'Field `aktif` harus true/false' })
      }

      const { data, error } = await request.db!
        .from('wa_nomor_pengguna')
        .update({ aktif })
        .eq('id', request.params.id)
        .select('id, nomor, aktif')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'wa/nomor: gagal mengubah status')
        return reply.status(500).send({ error: 'Gagal mengubah status nomor' })
      }
      if (!data) return reply.status(404).send({ error: 'Nomor tidak ditemukan' })

      void logAuditEvent(request, {
        tableName: 'wa_nomor_pengguna',
        recordId: (data as { nomor: string }).nomor,
        action: aktif ? 'wa.nomor.aktifkan' : 'wa.nomor.nonaktifkan',
        actorId: request.currentUser!.id,
        newValues: { aktif },
        severity: 'critical',
      })

      return reply.send({ ok: true, ...(data as object) })
    },
  )
}

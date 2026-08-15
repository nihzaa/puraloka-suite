/**
 * PREFERENSI PESAN — jam tenang, kuota harian, dan tombol berhenti.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TAK ADA `requirePermission` UNTUK MILIK SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap orang berhak mematikan pesan yang mengganggunya TANPA meminta izin
 * siapa pun. Opt-out yang butuh permission bukan opt-out — ia jadi
 * permohonan, dan permohonan bisa ditolak.
 *
 * Yang butuh izin (`notifikasi:preferensi:kelola`) hanya melihat atau
 * mengubah preferensi ORANG LAIN. Itu wewenang admin yang wajar: memeriksa
 * kenapa seorang mandor tak pernah menerima notifikasi.
 *
 * ── Kenapa GET selalu mengembalikan nilai, bukan 404
 *
 * Orang yang belum pernah membuka halaman ini TETAP punya preferensi — dari
 * bawaan tabel. Mengembalikan 404 akan membuat UI menampilkan formulir kosong,
 * dan orang menyimpulkan jam tenangnya belum ada padahal sudah berlaku.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { PREFERENSI_BAWAAN, bentukPreferensi, menitDariJam } from '../../lib/gerbang-kirim.js'

interface BadanSimpan {
  jam_tenang_mulai?: string
  jam_tenang_selesai?: string
  maks_per_hari?: number
  boleh_sapaan?: boolean
  berhenti?: boolean
  user_id?: string
}

export default async function preferensiPesanRoutes(app: FastifyInstance) {
  // ── GET — milik sendiri, atau milik orang lain kalau berizin ────────────
  app.get<{ Querystring: { user_id?: string } }>(
    '/api/v1/preferensi-pesan',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const aku = request.currentUser!.id
      const diminta = (request.query?.user_id ?? '').trim() || aku

      if (diminta !== aku && !hasPermission(request, 'notifikasi:preferensi:kelola')) {
        return reply.status(403).send({
          error: 'Butuh permission: notifikasi:preferensi:kelola untuk melihat preferensi orang lain',
        })
      }

      const { data, error } = await request.db!
        .from('preferensi_pesan')
        .select('jam_tenang_mulai, jam_tenang_selesai, maks_per_hari, boleh_sapaan, berhenti, zona_waktu')
        .eq('user_id', diminta)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'preferensi-pesan: gagal membaca')
        return reply.status(500).send({ error: 'Gagal membaca preferensi' })
      }

      // Baris yang HILANG mengembalikan bawaan, bukan 404 — sama persis
      // dengan yang dipakai gerbang saat memutuskan.
      const pref = bentukPreferensi(data as never)

      return reply.send({
        data: {
          jam_tenang_mulai: pref.jamTenangMulai,
          jam_tenang_selesai: pref.jamTenangSelesai,
          maks_per_hari: pref.maksPerHari,
          boleh_sapaan: pref.bolehSapaan,
          berhenti: pref.berhenti,
          zona_waktu: pref.zonaWaktu,
        },
        tersimpan: Boolean(data),
        bawaan: {
          jam_tenang_mulai: PREFERENSI_BAWAAN.jamTenangMulai,
          jam_tenang_selesai: PREFERENSI_BAWAAN.jamTenangSelesai,
          maks_per_hari: PREFERENSI_BAWAAN.maksPerHari,
        },
      })
    },
  )

  // ── PUT — menyimpan ─────────────────────────────────────────────────────
  app.put<{ Body: BadanSimpan }>(
    '/api/v1/preferensi-pesan',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const aku = request.currentUser!.id
      const b = request.body ?? {}
      const sasaran = (b.user_id ?? '').trim() || aku

      if (sasaran !== aku && !hasPermission(request, 'notifikasi:preferensi:kelola')) {
        return reply.status(403).send({
          error: 'Butuh permission: notifikasi:preferensi:kelola untuk mengubah preferensi orang lain',
        })
      }

      /*
       * Jam divalidasi SERVER, bukan hanya UI.
       *
       * CHECK basis sudah menahannya, tetapi galatnya keluar sebagai 500 yang
       * tak menjelaskan apa-apa. Ditolak di sini, penanya tahu persis
       * bentuk yang diminta.
       */
      const mulai = b.jam_tenang_mulai ?? PREFERENSI_BAWAAN.jamTenangMulai
      const selesai = b.jam_tenang_selesai ?? PREFERENSI_BAWAAN.jamTenangSelesai

      if (menitDariJam(mulai) === null || menitDariJam(selesai) === null) {
        return reply.status(422).send({ error: 'Jam harus berbentuk HH:MM (mis. 21:00)' })
      }

      const kuota = Number(b.maks_per_hari ?? PREFERENSI_BAWAAN.maksPerHari)
      if (!Number.isInteger(kuota) || kuota < 0 || kuota > 50) {
        return reply.status(422).send({ error: 'Batas pesan harian harus 0–50' })
      }

      const { data: lama } = await request.db!
        .from('preferensi_pesan')
        .select('jam_tenang_mulai, jam_tenang_selesai, maks_per_hari, boleh_sapaan, berhenti')
        .eq('user_id', sasaran)
        .maybeSingle()

      const { data, error } = await request.db!
        .from('preferensi_pesan')
        .upsert(
          {
            company_id: request.companyId!,
            user_id: sasaran,
            jam_tenang_mulai: mulai,
            jam_tenang_selesai: selesai,
            maks_per_hari: kuota,
            boleh_sapaan: b.boleh_sapaan ?? true,
            berhenti: b.berhenti ?? false,
          },
          { onConflict: 'company_id,user_id' },
        )
        .select('jam_tenang_mulai, jam_tenang_selesai, maks_per_hari, boleh_sapaan, berhenti')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'preferensi-pesan: gagal menyimpan')
        return reply.status(500).send({ error: 'Gagal menyimpan preferensi' })
      }

      // Dicatat saat MENGUBAH MILIK ORANG LAIN. Mengubah preferensi sendiri
      // adalah hal biasa; mengubah milik orang lain adalah tindakan yang
      // pantas ditanyakan kelak ("siapa mematikan notifikasi saya?").
      if (sasaran !== aku) {
        void logAuditEvent(request, {
          tableName: 'preferensi_pesan',
          recordId: sasaran,
          action: 'preferensi.pesan.set',
          actorId: aku,
          oldValues: lama ?? null,
          newValues: data ?? null,
          severity: 'critical',
        })
      }

      return reply.send({ ok: true, data })
    },
  )
}

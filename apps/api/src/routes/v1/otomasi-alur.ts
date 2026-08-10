/**
 * ALUR OTOMASI — katalog workflow, status, jejak jalan, dan pemicu manual.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUKUR DI TJS LEBIH DULU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `automation-tjs/admin-dashboard` punya 6 endpoint automation dan 3 halaman.
 * Dua bentuknya ditiru karena terbukti, satu sengaja tidak:
 *
 *   DITIRU — katalog terpisah dari n8n. Halaman tetap terbaca saat n8n mati.
 *   DITIRU — kesehatan dihitung ULANG dari log, bukan counter yang ditambah.
 *   TIDAK  — dua namespace yang dijembatani peta tulis-tangan. Di sini
 *            `otomasi_jalan.alur_id` adalah FK, jadi tak ada yang bisa
 *            "unmapped".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENJALANKAN PUNYA IZINNYA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `otomasi:alur:jalankan` terpisah dari `otomasi:alur:lihat`. Yang boleh
 * memeriksa kenapa notifikasi tak terkirim bukan otomatis yang boleh memicu
 * ulang pengirimannya — dan alur di sini mengirim pesan KE PELANGGAN. Satu
 * klik yang salah terlihat oleh orang di luar perusahaan, dan tak bisa
 * ditarik kembali.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ambilKredensial } from '../../lib/kredensial.js'
import {
  konfigurasiN8n,
  daftarWorkflowN8n,
  jalankanAlur,
  segarkanKesehatanAlur,
  ujiSambunganN8n,
} from '../../lib/otomasi-n8n.js'

const KOLOM_ALUR =
  'id, kode, nama, keterangan, n8n_id, jalur_webhook, pemicu, jadwal_cron, ' +
  'kategori, aktif, kesehatan, kesehatan_pada, jalan_terakhir, sukses_terakhir, ' +
  'gagal_terakhir, pesan_gagal, diperbarui_pada'

/** Kode alur: huruf kecil, angka, strip. Dipakai di URL dan pencatatan. */
const POLA_KODE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

function cfgTenant(request: Parameters<typeof ambilKredensial>[0]) {
  return konfigurasiN8n((kunci) => ambilKredensial(request, kunci))
}

export default async function otomasiAlurRoutes(app: FastifyInstance) {
  // ── GET /api/v1/otomasi/alur ─────────────────────────────────────────────
  app.get(
    '/api/v1/otomasi/alur',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('otomasi_alur')
        .select(KOLOM_ALUR)
        .order('kategori')
        .order('kode')

      if (error) {
        request.log.error({ err: error }, 'otomasi/alur: gagal membaca katalog')
        return reply.status(500).send({ error: 'Gagal membaca katalog alur' })
      }

      /*
       * Kesiapan kanal dinyatakan BERSAMA katalognya, bukan lewat panggilan
       * kedua dari UI.
       *
       * Pola yang sama dengan `wa/nomor` (`kanal_siap`): tombol "Jalankan"
       * yang baru gagal SESUDAH diklik memberi tahu terlambat, dan pesannya
       * ("N8N_BASE_URL belum diisi") datang pada saat orang sudah mengira
       * sesuatu terjadi.
       */
      const cfg = await cfgTenant(request)
      return reply.send({ data: data ?? [], n8n_siap: cfg !== null })
    },
  )

  // ── GET /api/v1/otomasi/alur/:id/jalan — jejak ───────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/otomasi/alur/:id/jalan',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('otomasi_jalan')
        .select('id, status, sumber, n8n_jalan_id, dimulai_pada, selesai_pada, durasi_ms, pesan, oleh')
        .eq('alur_id', request.params.id)
        .order('dimulai_pada', { ascending: false })
        .limit(50)

      if (error) {
        request.log.error({ err: error }, 'otomasi/alur: gagal membaca jejak')
        return reply.status(500).send({ error: 'Gagal membaca jejak jalan' })
      }
      return reply.send({ data: data ?? [] })
    },
  )

  // ── POST /api/v1/otomasi/alur — daftarkan / ubah ─────────────────────────
  app.post<{
    Body: {
      id?: string
      kode?: string
      nama?: string
      keterangan?: string
      n8n_id?: string
      jalur_webhook?: string
      pemicu?: string
      jadwal_cron?: string
      kategori?: string
      aktif?: boolean
    }
  }>(
    '/api/v1/otomasi/alur',
    { preHandler: [authenticate, requirePermission('otomasi:alur:kelola')] },
    async (request, reply) => {
      const b = request.body ?? {}

      // ── Mengubah yang sudah ada ──────────────────────────────────────────
      if (b.id) {
        const muatan: Record<string, unknown> = {
          diperbarui_pada: new Date().toISOString(),
          diperbarui_oleh: request.currentUser!.id,
        }
        for (const k of ['nama', 'keterangan', 'n8n_id', 'jalur_webhook', 'pemicu', 'jadwal_cron', 'kategori'] as const) {
          if (typeof b[k] === 'string') muatan[k] = b[k]
        }
        if (typeof b.aktif === 'boolean') muatan.aktif = b.aktif

        const { data, error } = await request.db!
          .from('otomasi_alur')
          .update(muatan)
          .eq('id', b.id)
          .select('id')

        if (error) {
          request.log.error({ err: error }, 'otomasi/alur: gagal mengubah')
          return reply.status(500).send({ error: 'Gagal mengubah alur' })
        }
        // Nol baris BUKAN keberhasilan — pelajaran S4 (`wa/template`), dan
        // penjaga `audit-tulis-tanpa-periksa` ambang kedua menahannya.
        if (!data || data.length === 0) {
          return reply.status(404).send({ error: 'Alur tidak ditemukan' })
        }

        void logAuditEvent(request, {
          tableName: 'otomasi_alur',
          recordId: b.id,
          action: 'otomasi.alur.ubah',
          actorId: request.currentUser!.id,
          newValues: muatan,
          severity: 'warning',
        })
        return reply.send({ ok: true, id: b.id })
      }

      // ── Mendaftarkan baru ────────────────────────────────────────────────
      const kode = (b.kode ?? '').trim().toLowerCase()
      if (!POLA_KODE.test(kode)) {
        return reply.status(422).send({
          error:
            'Kode alur hanya huruf kecil, angka, dan strip (3-50 karakter). ' +
            'Contoh: pengingat-invoice-jatuh-tempo.',
        })
      }
      const nama = (b.nama ?? '').trim()
      if (!nama) return reply.status(422).send({ error: 'Nama alur wajib diisi' })

      const { data, error } = await request.db!
        .from('otomasi_alur')
        .insert({
          company_id: request.companyId!,
          kode,
          nama,
          keterangan: b.keterangan ?? null,
          n8n_id: b.n8n_id ?? null,
          jalur_webhook: b.jalur_webhook ?? null,
          pemicu: b.pemicu ?? 'manual',
          jadwal_cron: b.jadwal_cron ?? null,
          kategori: b.kategori ?? 'umum',
          diperbarui_oleh: request.currentUser!.id,
        })
        .select('id')

      if (error) {
        // Kode ganda punya pesannya sendiri: "gagal menyimpan" membuat orang
        // mengulang tindakan yang sama dan mendapat hasil yang sama.
        if (/duplicate|unique/i.test(error.message)) {
          return reply.status(409).send({ error: `Kode "${kode}" sudah dipakai alur lain.` })
        }
        request.log.error({ err: error }, 'otomasi/alur: gagal mendaftarkan')
        return reply.status(500).send({ error: 'Gagal mendaftarkan alur' })
      }

      const id = (data as Array<{ id: string }> | null)?.[0]?.id ?? null
      void logAuditEvent(request, {
        tableName: 'otomasi_alur',
        recordId: id ?? kode,
        action: 'otomasi.alur.daftar',
        actorId: request.currentUser!.id,
        newValues: { kode, nama },
        severity: 'warning',
      })
      return reply.status(201).send({ ok: true, id })
    },
  )

  // ── POST /api/v1/otomasi/alur/:id/jalankan ───────────────────────────────
  app.post<{ Params: { id: string }; Body: { muatan?: Record<string, unknown> } }>(
    '/api/v1/otomasi/alur/:id/jalankan',
    {
      preHandler: [authenticate, requirePermission('otomasi:alur:jalankan')],
      // Per user: memicu alur berarti mengirim pesan keluar. Klik beruntun
      // yang tak dibatasi mengirimkannya berkali-kali ke orang yang sama.
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (r: { currentUser?: { id: string }; ip: string }) =>
            r.currentUser?.id ?? r.ip,
        },
      },
    },
    async (request, reply) => {
      const { data: alur, error } = await request.db!
        .from('otomasi_alur')
        .select('id, kode, nama, n8n_id, jalur_webhook, aktif')
        .eq('id', request.params.id)
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'otomasi/alur: gagal membaca alur')
        return reply.status(500).send({ error: 'Gagal membaca alur' })
      }
      if (!alur) return reply.status(404).send({ error: 'Alur tidak ditemukan' })

      const a = alur as {
        id: string; kode: string; nama: string
        n8n_id: string | null; jalur_webhook: string | null; aktif: boolean
      }
      // Alur NONAKTIF tak boleh dipicu walau tombolnya sampai terklik —
      // "nonaktif" yang masih bisa dijalankan bukan nonaktif.
      if (!a.aktif) {
        return reply.status(409).send({ error: `Alur "${a.nama}" sedang nonaktif.` })
      }

      const hasil = await jalankanAlur({
        db: request.db!,
        companyId: request.companyId!,
        cfg: await cfgTenant(request),
        alur: a,
        sumber: 'manual',
        oleh: request.currentUser!.id,
        muatan: request.body?.muatan,
      })

      await segarkanKesehatanAlur(request.db!, a.id)

      void logAuditEvent(request, {
        tableName: 'otomasi_alur',
        recordId: a.id,
        action: 'otomasi.alur.jalankan',
        actorId: request.currentUser!.id,
        newValues: { kode: a.kode, berhasil: hasil.ok, durasi_ms: hasil.durasiMs },
        severity: 'warning',
      })

      if (!hasil.ok) {
        // 502, bukan 500: yang gagal adalah n8n, bukan kita. Kode status yang
        // menyalahkan diri sendiri mengirim orang memeriksa tempat yang salah.
        return reply.status(hasil.alasan === 'tak_terkonfigurasi' ? 503 : 502).send({
          error: hasil.pesan,
          alasan: hasil.alasan,
        })
      }
      return reply.send({ ok: true, durasi_ms: hasil.durasiMs, n8n_jalan_id: hasil.n8nJalanId })
    },
  )

  // ── GET /api/v1/otomasi/n8n/status ───────────────────────────────────────
  app.get(
    '/api/v1/otomasi/n8n/status',
    { preHandler: [authenticate, requirePermission('otomasi:alur:lihat')] },
    async (request, reply) => {
      const cfg = await cfgTenant(request)
      const uji = await ujiSambunganN8n(cfg)
      return reply.send({
        terkonfigurasi: cfg !== null,
        ok: uji.ok,
        pesan: uji.pesan,
        durasi_ms: uji.durasiMs,
      })
    },
  )

  // ── GET /api/v1/otomasi/n8n/workflow — apa yang ADA di n8n ───────────────
  //
  // Dipakai untuk MENCOCOKKAN katalog dengan kenyataan: alur yang terdaftar
  // di sini tetapi tak ada lagi di n8n adalah alur yang tak akan pernah
  // jalan — dan tanpa halaman ini, ketiadaannya baru ketahuan saat seseorang
  // menunggu notifikasi yang tak datang.
  app.get(
    '/api/v1/otomasi/n8n/workflow',
    { preHandler: [authenticate, requirePermission('otomasi:alur:kelola')] },
    async (request, reply) => {
      const hasil = await daftarWorkflowN8n(await cfgTenant(request))
      if (!hasil.ok) return reply.status(502).send({ error: hasil.pesan })

      // Cocokkan dengan katalog supaya UI bisa menandai yang belum terdaftar
      // dan yang sudah hilang — dua keadaan yang sama-sama tak bergejala.
      const { data } = await request.db!.from('otomasi_alur').select('kode, nama, n8n_id')
      const katalog = (data ?? []) as Array<{ kode: string; nama: string; n8n_id: string | null }>
      const terpakai = new Set(katalog.map((k) => k.n8n_id).filter(Boolean))
      const adaDiN8n = new Set(hasil.data.map((w) => w.id))

      return reply.send({
        data: hasil.data.map((w) => ({ ...w, terdaftar: terpakai.has(w.id) })),
        hilang: katalog
          .filter((k) => k.n8n_id && !adaDiN8n.has(k.n8n_id))
          .map((k) => ({ kode: k.kode, nama: k.nama, n8n_id: k.n8n_id })),
      })
    },
  )
}

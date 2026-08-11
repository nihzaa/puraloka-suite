import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  pilihMarkup, periksaFraksi, hitungPenawaran, marginPersen,
  type PeriodeMarkup,
} from '../../lib/markup.js'

/**
 * MARKUP & MARGIN (G6) — angka yang menentukan laba, diberi rumah.
 *
 * ── Yang diperbaiki modul ini
 *
 * Sampai migrasi 301, `buk_fraction` dikirim ulang tiap permintaan dan tak
 * tersimpan di mana pun. API menolak default dengan tegas; UI diam-diam
 * mengisinya `useState("10")`. Sepuluh persen jadi angka bawaan tanpa
 * seorang pun memutuskannya.
 *
 * ── Kenapa `berlaku` boleh menjawab "belum ditetapkan"
 *
 * Endpoint ini SENGAJA bisa mengembalikan `markup: null`. Menjawab dengan
 * angka aman (0, atau 10%) akan membuat layar menampilkan estimasi yang
 * lengkap dan meyakinkan — dan tak ada yang tahu angkanya tak pernah
 * ditetapkan siapa pun. Pola yang sama dipakai tarif payroll (G2a) dan peta
 * akun jurnal (R-012).
 *
 * ── Periode DITAMBAH, tak ditimpa
 *
 * Estimasi yang sudah dibuat harus tetap bisa dijelaskan dengan angka yang
 * berlaku saat itu. Karena itu tak ada endpoint "ubah markup yang berlaku" —
 * yang ada "tambah periode baru".
 */

const SELECT = `
  id, jenis_pekerjaan, berlaku_sejak,
  overhead_fraksi, keuntungan_fraksi, kontinjensi_fraksi, buk_fraksi,
  alasan, catatan, ditetapkan_oleh, created_at
`

const HARI_INI = () => new Date().toISOString().slice(0, 10)
const sahTanggal = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export default async function markupRoutes(app: FastifyInstance) {
  // ── GET /markup — seluruh periode ────────────────────────────────────────
  app.get(
    '/api/v1/markup',
    { preHandler: [authenticate, requirePermission('cecep:markup:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('markup_periode')
        .select(SELECT)
        .order('berlaku_sejak', { ascending: false })
        .limit(200)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat periode markup')
        return reply.status(500).send({ error: 'Gagal memuat periode markup' })
      }

      const periode = data as unknown as PeriodeMarkup[]
      const hariIni = HARI_INI()

      // Jenis pekerjaan yang PUNYA barisnya sendiri — dipakai layar untuk
      // menyatakan mana yang khusus dan mana yang jatuh ke umum.
      const jenis = [...new Set(
        periode.map((p) => p.jenis_pekerjaan).filter((j): j is string => !!j))]

      return reply.send({
        periode: data,
        berlaku: pilihMarkup(periode, hariIni),
        berlaku_per_jenis: jenis.map((j) => ({
          jenis_pekerjaan: j,
          markup: pilihMarkup(periode, hariIni, j),
        })),
        pada: hariIni,
      })
    },
  )

  // ── GET /markup/berlaku — satu jawaban untuk perhitungan ─────────────────
  app.get<{ Querystring: { pada?: string; jenis?: string; biaya_pokok?: string } }>(
    '/api/v1/markup/berlaku',
    { preHandler: [authenticate, requirePermission('cecep:markup:view')] },
    async (request, reply) => {
      const pada = request.query.pada ?? HARI_INI()
      if (!sahTanggal(pada)) {
        return reply.status(400).send({ error: 'pada harus berbentuk YYYY-MM-DD' })
      }

      const { data, error } = await request.db!
        .from('markup_periode').select(SELECT).limit(200)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat periode markup')
        return reply.status(500).send({ error: 'Gagal memuat periode markup' })
      }

      const m = pilihMarkup(data as unknown as PeriodeMarkup[], pada, request.query.jenis)

      // 200 dengan `markup: null`, BUKAN 404. Yang bertanya berhak tahu
      // bahwa jawabannya "belum ditetapkan" — dan 404 terbaca sebagai
      // "endpoint-nya salah", lalu orang mencari di tempat yang keliru.
      if (!m) {
        return reply.send({
          markup: null,
          pada,
          alasan: 'Markup belum ditetapkan untuk tanggal ini. Buka Pengaturan → '
            + 'Markup & Margin dan tetapkan overhead serta keuntungan — angka '
            + 'ini menentukan laba tiap penawaran, jadi tak ditebak sistem.',
        })
      }

      // Biaya pokok bersifat OPSIONAL: endpoint ini juga dipakai layar yang
      // hanya ingin tahu markup yang berlaku tanpa menghitung apa pun.
      let rincian: ReturnType<typeof hitungPenawaran> | null = null
      let margin: number | null = null
      if (request.query.biaya_pokok !== undefined) {
        const b = Number(request.query.biaya_pokok)
        // `Number('')` adalah 0, bukan NaN — tanpa pemeriksaan panjang di
        // bawah, `?biaya_pokok=` menghasilkan penawaran Rp 0 yang seluruhnya
        // "berhasil".
        if (request.query.biaya_pokok.trim() === '' || !Number.isFinite(b) || b < 0) {
          return reply.status(400).send({ error: 'biaya_pokok harus angka >= 0' })
        }
        rincian = hitungPenawaran(b, m)
        margin = marginPersen(rincian.nilai_penawaran, b)
      }

      return reply.send({ markup: m, pada, rincian, margin_persen: margin })
    },
  )

  // ── POST /markup — tambah periode ────────────────────────────────────────
  app.post<{
    Body: {
      jenis_pekerjaan?: string | null
      berlaku_sejak?: string
      overhead_fraksi?: number | string
      keuntungan_fraksi?: number | string
      kontinjensi_fraksi?: number | string
      alasan?: string
      catatan?: string
    }
  }>(
    '/api/v1/markup',
    { preHandler: [authenticate, requirePermission('cecep:markup:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}

      if (!sahTanggal(b.berlaku_sejak)) {
        return reply.status(400).send({
          error: 'berlaku_sejak wajib diisi (YYYY-MM-DD) — markup tanpa tanggal '
            + 'berlaku membuat estimasi lama tak bisa dihitung ulang',
        })
      }

      for (const [nama, nilai] of [
        ['Overhead', b.overhead_fraksi],
        ['Keuntungan', b.keuntungan_fraksi],
      ] as const) {
        const p = periksaFraksi(nama, nilai)
        if (p) return reply.status(400).send({ error: p })
      }
      if (b.kontinjensi_fraksi !== undefined && b.kontinjensi_fraksi !== null
          && b.kontinjensi_fraksi !== '') {
        const p = periksaFraksi('Kontinjensi', b.kontinjensi_fraksi)
        if (p) return reply.status(400).send({ error: p })
      }

      const jenis = b.jenis_pekerjaan?.trim() || null

      const { data, error } = await request.db!
        .from('markup_periode')
        .insert({
          jenis_pekerjaan: jenis,
          berlaku_sejak: b.berlaku_sejak,
          overhead_fraksi: b.overhead_fraksi,
          keuntungan_fraksi: b.keuntungan_fraksi,
          kontinjensi_fraksi:
            b.kontinjensi_fraksi === undefined || b.kontinjensi_fraksi === ''
              ? 0 : b.kontinjensi_fraksi,
          alasan: b.alasan?.trim() || null,
          catatan: b.catatan?.trim() || null,
          ditetapkan_oleh: request.currentUser!.id,
        })
        .select(SELECT)
        .single()

      if (error) {
        // Pesan Postgres menyebut nama indeks, bukan apa yang salah bagi
        // orang yang mengetik.
        if (/uq_markup_jenis/i.test(error.message) || /duplicate key/i.test(error.message)) {
          return reply.status(409).send({
            error: `Sudah ada markup ${jenis ? `untuk "${jenis}" ` : 'umum '}`
              + `yang berlaku sejak ${b.berlaku_sejak}. Dua markup pada tanggal `
              + `yang sama membuat "markup mana yang berlaku" tak punya jawaban `
              + `tunggal — sunting yang sudah ada, atau pilih tanggal lain.`,
          })
        }
        request.log.error({ err: error }, 'gagal menambah periode markup')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'markup_periode',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ periode: data })
    },
  )

  // ── DELETE /markup/:id ───────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/markup/:id',
    { preHandler: [authenticate, requirePermission('cecep:markup:manage')] },
    async (request, reply) => {
      const { id } = request.params

      // Periode yang SUDAH dipakai versi estimasi tak boleh hilang — bersama
      // dia hilang pula penjelasan atas harga yang sudah ditawarkan. Angkanya
      // memang ikut tersalin ke `estimate_versions`, tetapi rujukannya yang
      // membuat "markup yang mana" bisa ditunjuk.
      const { data: dipakai, error: eDipakai } = await request.db!
        .unsafe('estimate_versions', 'hanya menghitung rujukan; tak ada data yang dikembalikan')
        .select('id')
        .eq('markup_periode_id', id)
        .limit(1)
      if (eDipakai) {
        request.log.error({ err: eDipakai, id }, 'gagal memeriksa pemakaian markup')
        return reply.status(500).send({ error: 'Gagal memeriksa pemakaian markup' })
      }
      if ((dipakai ?? []).length > 0) {
        return reply.status(409).send({
          error: 'Periode markup ini sudah dipakai versi estimasi. Menghapusnya '
            + 'menghapus penjelasan atas harga yang sudah ditawarkan — tambahkan '
            + 'periode baru dengan tanggal berlaku yang lebih baru.',
        })
      }

      const { data, error } = await request.db!
        .from('markup_periode').delete().eq('id', id).select('id').maybeSingle()
      if (error) {
        request.log.error({ err: error, id }, 'gagal menghapus periode markup')
        return reply.status(400).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Periode markup tidak ditemukan' })

      await logAuditEvent(request, {
        action: 'DELETE',
        actorId: request.currentUser!.id,
        tableName: 'markup_periode',
        recordId: id,
        oldValues: { id },
      })
      return reply.send({ dihapus: id })
    },
  )
}

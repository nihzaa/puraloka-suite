import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import {
  nilaiPrakualifikasi, nilaiEvaluasi,
  type MasukanPrakualifikasi, type MasukanEvaluasi,
} from '../../lib/vendor-penilaian.js'

/**
 * PRAKUALIFIKASI & EVALUASI KINERJA VENDOR (TUNDA kelompok A)
 *
 * ── Yang dijawab modul ini
 *
 * "Vendor mana yang boleh diundang tender, dan mana yang sudah terbukti
 * mengecewakan?"
 *
 * ── Kenapa `company_id` langsung, bukan lewat proyek
 *
 * Vendor dimiliki TENANT, bukan proyek — satu supplier dipakai lintas proyek.
 * Ketiga tabelnya berkategori B (punya `company_id` NOT NULL), jadi disaring
 * `eq('company_id', …)` lewat `db.unsafe()` dengan alasan tertulis.
 *
 * ── Penilaian DIHITUNG, bukan disimpan
 *
 * Skor berbobot dan daftar peringatan diturunkan tiap kali diminta.
 * Menyimpannya sebagai kolom membuat "boleh diundang" bisa basi diam-diam
 * saat dokumen kedaluwarsa — dan itu persis kasus yang paling merugikan:
 * status hijau dengan izin mati, lalu penawaran gugur di meja panitia.
 */
export default async function vendorKualifikasiRoutes(app: FastifyInstance) {
  /** Tanggal acuan, dioper ke pustaka murni supaya hasilnya bisa diuji. */
  const hariIni = () => new Date().toISOString().slice(0, 10)

  // ── GET /api/v1/vendor-kualifikasi ──────────────────────────────────────
  app.get('/api/v1/vendor-kualifikasi', {
    preHandler: [authenticate, requireModul('modul.crm'), requirePermission('procurement:view')],
  }, async (request, reply) => {
    const db = request.db!
    const cid = request.companyId!

    const { data, error } = await db
      .unsafe('prakualifikasi_vendor', 'kategori B; disaring company_id di baris berikutnya')
      .select(`
        id, tanggal, berlaku_sampai, status,
        skor_legalitas, skor_keuangan, skor_teknis, skor_pengalaman,
        catatan, alasan_tolak, created_at,
        vendor:suppliers ( id, name, city ),
        dokumen:dokumen_prakualifikasi ( jenis, nomor, berlaku_sampai, terverifikasi )
      `)
      .eq('company_id', cid)
      .order('tanggal', { ascending: false })

    if (error) return reply.status(500).send({ error: error.message })

    const t = hariIni()
    const prakualifikasi = (data ?? []).map((p) => ({
      ...p,
      nilai: nilaiPrakualifikasi(
        { ...(p as unknown as MasukanPrakualifikasi),
          dokumen: (p as { dokumen?: unknown[] }).dokumen as never },
        t),
    }))

    return reply.send({ prakualifikasi, total: prakualifikasi.length })
  })

  // ── GET /api/v1/vendor-kualifikasi/evaluasi ─────────────────────────────
  app.get('/api/v1/vendor-kualifikasi/evaluasi', {
    preHandler: [authenticate, requireModul('modul.crm'), requirePermission('procurement:view')],
  }, async (request, reply) => {
    const db = request.db!

    const { data, error } = await db
      .unsafe('evaluasi_vendor', 'kategori B; disaring company_id di baris berikutnya')
      .select(`
        id, periode, skor_mutu, skor_waktu, skor_harga, skor_layanan,
        catatan, masuk_daftar_hitam, alasan_daftar_hitam, created_at,
        vendor:suppliers ( id, name ),
        po:purchase_orders ( id, po_number )
      `)
      .eq('company_id', request.companyId!)
      .order('periode', { ascending: false })

    if (error) return reply.status(500).send({ error: error.message })

    const evaluasi = (data ?? []).map((e) => ({
      ...e,
      nilai: nilaiEvaluasi(e as unknown as MasukanEvaluasi),
    }))

    return reply.send({ evaluasi, total: evaluasi.length })
  })

  // ── POST /api/v1/vendor-kualifikasi ─────────────────────────────────────
  app.post('/api/v1/vendor-kualifikasi', {
    preHandler: [authenticate, requireModul('modul.crm'), requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      supplier_id?: string
      tanggal?: string
      berlaku_sampai?: string | null
      skor_legalitas?: number
      skor_keuangan?: number
      skor_teknis?: number
      skor_pengalaman?: number
      status?: string
      catatan?: string
      alasan_tolak?: string
    }

    if (!b.supplier_id) {
      return reply.status(400).send({ error: 'supplier_id wajib diisi' })
    }

    const db = request.db!
    const cid = request.companyId!

    // Vendor WAJIB milik tenant ini. Tanpa ini, prakualifikasi bisa dibuat
    // atas supplier tenant lain — dan skornya terbaca di layar mereka.
    const { data: vendor } = await db
      .unsafe('suppliers', 'memastikan vendor milik tenant sebelum dinilai')
      .select('id').eq('id', b.supplier_id).eq('company_id', cid).maybeSingle()
    if (!vendor) return reply.status(404).send({ error: 'Vendor tidak ditemukan' })

    const { data, error } = await db
      .unsafe('prakualifikasi_vendor', 'menyimpan penilaian; vendor sudah diverifikasi milik tenant')
      .insert({
        supplier_id: b.supplier_id,
        company_id: cid,
        tanggal: b.tanggal ?? hariIni(),
        berlaku_sampai: b.berlaku_sampai ?? null,
        skor_legalitas: b.skor_legalitas ?? 0,
        skor_keuangan: b.skor_keuangan ?? 0,
        skor_teknis: b.skor_teknis ?? 0,
        skor_pengalaman: b.skor_pengalaman ?? 0,
        status: b.status ?? 'draft',
        catatan: b.catatan ?? null,
        alasan_tolak: b.alasan_tolak ?? null,
        dinilai_oleh: request.currentUser!.id,
        created_by: request.currentUser!.id,
      })
      .select('id, tanggal, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({
          error: 'Vendor ini sudah dinilai pada tanggal tersebut',
        })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Nilai di luar batas wajar, atau penolakan belum diberi alasan (minimal 5 huruf)',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ prakualifikasi: data })
  })
}

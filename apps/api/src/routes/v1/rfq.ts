import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { susunTabulasi, type BarisPenawaran } from '../../lib/tabulasi-penawaran.js'

/**
 * RFQ KE VENDOR + PERBANDINGAN PENAWARAN (F5 PEMBEDA)
 *
 * ── Cacat yang ditutup, diukur pada data nyata
 *
 * Material yang SAMA dibeli dari beberapa supplier dengan harga berbeda,
 * tanpa satu pun jejak kenapa yang mahal dipilih:
 *
 *   Besi Beton Ø12mm SNI   3 supplier   Rp100.000 .. Rp120.000   (+20%)
 *   Pasir Pasang           2 supplier   Rp185.000 .. Rp195.000
 *
 * 5 dari 7 PO lahir langsung dari MR. Harga datang dari satu vendor
 * langganan, bukan dari perbandingan — dan saat auditor bertanya "kenapa
 * vendor ini", tak ada yang bisa dijawab selain ingatan orang.
 *
 * ── Kenapa perbandingannya DIHITUNG, bukan disimpan
 *
 * Tabulasi diturunkan dari penawaran tiap kali diminta. Menyimpannya sebagai
 * kolom membuat angka "termurah" bisa basi diam-diam saat satu penawaran
 * disunting — dan yang paling berkepentingan menyuntingnya adalah orang yang
 * vendornya sedang kalah.
 */
export default async function rfqRoutes(app: FastifyInstance) {
  // ── GET /api/v1/rfq ──────────────────────────────────────────────────────
  app.get('/api/v1/rfq', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.send({ rfq: [], total: 0 })

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const batas = Math.min(Math.max(Number(q.limit) || 100, 1), 500)

    // Daftar LINTAS-PROYEK: tak ada satu proyek sebagai konteks, jadi
    // `viaProject` tak berlaku — polanya `.in('project_id', projectIds())`
    // seperti dinyatakan di `tenant-db.ts`.
    let kueri = db
      .unsafe('rfq', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select(
        `id, nomor, tanggal, batas_masuk, status, catatan, alasan_pilih, created_at,
         proyek:projects ( id, name ),
         pembuat:users ( id, name )`,
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

    return reply.send({ rfq: data ?? [], total: count ?? 0 })
  })

  // ── GET /api/v1/rfq/:id — beserta TABULASI perbandingannya ───────────────
  app.get('/api/v1/rfq/:id', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'RFQ tidak ditemukan' })

    // Gerbang tenancy: RFQ diambil dengan saringan proyek milik tenant.
    // Tanpa `.in()`, `eq('id', ...)` akan mengembalikan RFQ tenant lain —
    // beserta seluruh harga penawaran vendornya, informasi komersial yang
    // paling merugikan kalau bocor.
    const { data: kepala, error: e1 } = await db
      .unsafe('rfq', 'ambil satu RFQ dengan saringan projectIds; viaProject tak menerima id RFQ')
      .select(`id, nomor, tanggal, batas_masuk, status, catatan, alasan_pilih, project_id, po_id,
               proyek:projects ( id, name ), pembuat:users ( id, name )`)
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (e1) return reply.status(500).send({ error: e1.message })
    if (!kepala) return reply.status(404).send({ error: 'RFQ tidak ditemukan' })

    const { data: penawaran, error: e2 } = await db
      .viaProject('rfq_penawaran', id)
      .select(`supplier_id, material_id, qty, harga_satuan, tidak_menawar, waktu_kirim_hari, catatan,
               supplier:suppliers ( id, name ), material:materials ( id, name, unit )`)

    if (e2) return reply.status(500).send({ error: e2.message })

    type BarisMentah = {
      supplier_id: string
      material_id: string
      qty: number | string
      harga_satuan: number | string
      tidak_menawar: boolean | null
      waktu_kirim_hari: number | null
      supplier?: { id: string; name: string } | { id: string; name: string }[] | null
      material?: { id: string; name: string; unit: string | null } | { id: string; name: string; unit: string | null }[] | null
    }

    const satu = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const baris: BarisPenawaran[] = ((penawaran ?? []) as BarisMentah[]).map((p) => {
      const s = satu(p.supplier)
      const m = satu(p.material)
      return {
        supplier_id: p.supplier_id,
        supplier_name: s?.name,
        material_id: p.material_id,
        material_name: m?.name,
        unit: m?.unit ?? null,
        qty: p.qty,
        harga_satuan: p.harga_satuan,
        tidak_menawar: p.tidak_menawar,
        waktu_kirim_hari: p.waktu_kirim_hari,
      }
    })

    return reply.send({ rfq: kepala, tabulasi: susunTabulasi(baris) })
  })

  // ── POST /api/v1/rfq ─────────────────────────────────────────────────────
  //
  // `procurement:po:manage` — DIVERIFIKASI ada di tabel `permissions`. RFQ
  // adalah langkah menuju PO, dan yang berwenang menerbitkan PO adalah yang
  // berwenang meminta penawarannya.
  app.post('/api/v1/rfq', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      nomor?: string
      mr_id?: string
      tanggal?: string
      batas_masuk?: string
      catatan?: string
    }

    if (!b.project_id || !b.nomor?.trim()) {
      return reply.status(400).send({ error: 'project_id dan nomor wajib diisi' })
    }

    if (!(await proyekMilikTenant(request, b.project_id))) {
      // 404, bukan 403 — membedakan "tidak ada" dari "bukan milik Anda"
      // memberi tahu penanya bahwa proyek itu ADA di tenant lain.
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('rfq', b.project_id)
      .insert({
        project_id: b.project_id,
        nomor: b.nomor.trim(),
        mr_id: b.mr_id ?? null,
        tanggal: b.tanggal ?? new Date().toISOString().slice(0, 10),
        batas_masuk: b.batas_masuk ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, status')
      .single()

    if (error) {
      // Nomor RFQ unik per tenant. Pesan constraint mentah ("duplicate key
      // value violates unique constraint") tak bisa ditindaklanjuti siapa pun
      // di layar.
      if (error.code === '23505') {
        return reply.status(400).send({ error: `Nomor RFQ "${b.nomor.trim()}" sudah dipakai` })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ rfq: data })
  })

  // ── POST /api/v1/rfq/:id/penawaran — catat penawaran satu vendor ─────────
  app.post('/api/v1/rfq/:id/penawaran', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as {
      supplier_id?: string
      material_id?: string
      qty?: number
      harga_satuan?: number
      tidak_menawar?: boolean
      waktu_kirim_hari?: number
      catatan?: string
    }

    if (!b.supplier_id || !b.material_id || !b.qty) {
      return reply.status(400).send({ error: 'supplier_id, material_id, dan qty wajib diisi' })
    }

    const qty = Number(b.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      return reply.status(400).send({ error: 'qty harus angka lebih dari 0' })
    }

    const tidakMenawar = b.tidak_menawar === true
    const harga = Number(b.harga_satuan ?? 0)

    if (!tidakMenawar && (!Number.isFinite(harga) || harga <= 0)) {
      // Harga 0 hanya sah bila vendor MENYATAKAN tidak menawar. Tanpa pagar
      // ini, "0" akan selalu menang sebagai termurah — dan PO terbit ke vendor
      // yang tak menawarkan apa pun.
      return reply.status(400).send({
        error: 'harga_satuan harus lebih dari 0, atau tandai tidak_menawar',
      })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'RFQ tidak ditemukan' })

    // RFQ-nya wajib milik tenant ini SEBELUM satu baris penawaran pun ditulis.
    const { data: rfq, error: eRfq } = await db
      .unsafe('rfq', 'verifikasi kepemilikan RFQ lewat projectIds sebelum menulis penawaran')
      .select('id, project_id, status')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (eRfq) return reply.status(500).send({ error: eRfq.message })
    if (!rfq) return reply.status(404).send({ error: 'RFQ tidak ditemukan' })

    if (rfq.status === 'selesai' || rfq.status === 'batal') {
      // Penawaran yang masuk setelah keputusan mengubah tabulasi di belakang
      // keputusan yang sudah diambil — dan jejak auditnya berbohong.
      return reply.status(400).send({
        error: `RFQ berstatus "${rfq.status}" tidak menerima penawaran baru`,
      })
    }

    const { data, error } = await db
      .viaProject('rfq_penawaran', id)
      .insert({
        rfq_id: id,
        supplier_id: b.supplier_id,
        material_id: b.material_id,
        qty,
        harga_satuan: tidakMenawar ? 0 : harga,
        tidak_menawar: tidakMenawar,
        waktu_kirim_hari: b.waktu_kirim_hari ?? null,
        catatan: b.catatan ?? null,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(400).send({
          error: 'Vendor ini sudah menawar material tersebut di RFQ ini — sunting penawarannya, jangan tambah baris baru',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ penawaran: data })
  })
}

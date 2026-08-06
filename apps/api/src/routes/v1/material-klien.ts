import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'

/**
 * MATERIAL MILIK KLIEN — free issue (F5 PEMBEDA)
 *
 * ── Cacat yang ditutup
 *
 * Diukur 2026-08-06: NOL penanda kepemilikan di seluruh tabel material. Pada
 * kontrak konstruksi, owner sering memasok sendiri material tertentu
 * (keramik, sanitair, lift) dan kontraktor hanya memasangnya.
 *
 * Tanpa jalur tersendiri, barang itu hanya bisa masuk lewat penerimaan
 * pembelian — dan di `/gudang/rekonsiliasi` ia akan menggelembungkan penyebut
 * susut SEKALIGUS membuat perusahaan tampak memborong material yang tak
 * pernah ia beli sesen pun.
 *
 * ── Kenapa tabel sendiri, bukan penanda di `goods_receipts`
 *
 * `po_id` dan `supplier_id` di sana **NOT NULL** (diverifikasi; bukan
 * disimpulkan dari definisi FK — saya sempat salah menyimpulkannya). Material
 * owner tak punya keduanya, jadi jalur itu menuntut `DROP NOT NULL` pada
 * tabel berisi data finansial hidup: Gerbang Keras G-2.
 *
 * ── Kenapa stok BERTAMBAH tapi "dibeli" tidak
 *
 * Barangnya nyata ada di gudang: ia harus terlihat di kartu stok, terpakai,
 * dan tersisa seperti material lain. Yang tidak boleh adalah ia dihitung
 * sebagai PEMBELIAN kita. Karena itu mutasinya `goods_receipt` (stok naik),
 * tapi `reference_type` menandainya `material_klien` — dan rekonsiliasi
 * membacanya dari tabel ini, bukan dari `goods_receipt_items`.
 */
export default async function materialKlienRoutes(app: FastifyInstance) {
  // ── GET /api/v1/material-klien ───────────────────────────────────────────
  app.get('/api/v1/material-klien', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.send({ penerimaan: [], total: 0 })

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const batas = Math.min(Math.max(Number(q.limit) || 100, 1), 500)

    // Tabel kategori C lewat `project_id`. Untuk daftar LINTAS-PROYEK tak ada
    // satu proyek sebagai konteks, jadi `viaProject` tak berlaku — polanya
    // `.in('project_id', await db.projectIds())`, seperti dinyatakan di
    // `tenant-db.ts`.
    let kueri = db
      .unsafe('penerimaan_material_klien', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select(
        `id, qty, tanggal, pemasok, nomor_surat_jalan, catatan, created_at,
         material:materials ( id, name, unit ),
         proyek:projects ( id, name ),
         pembuat:users ( id, name )`,
        { count: 'exact' },
      )
      .in('project_id', idProyek)

    if (q.project_id) kueri = kueri.eq('project_id', q.project_id)

    const { data, error, count } = await kueri
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, batas - 1)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ penerimaan: data ?? [], total: count ?? 0 })
  })

  // ── POST /api/v1/material-klien ──────────────────────────────────────────
  //
  // `procurement:material:manage` — DIVERIFIKASI ada di tabel `permissions`.
  // Endpoint ini MENAMBAH saldo stok, jadi gerbangnya permission mengelola,
  // bukan `procurement:view` seperti `POST /procurement/stocks/usage` (cacat
  // T4j yang tercatat di berkas itu sendiri).
  app.post('/api/v1/material-klien', {
    preHandler: [authenticate, requirePermission('procurement:material:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string
      material_id?: string
      qty?: number
      tanggal?: string
      pemasok?: string
      nomor_surat_jalan?: string
      catatan?: string
    }

    if (!b.project_id || !b.material_id || !b.qty) {
      return reply.status(400).send({ error: 'project_id, material_id, dan qty wajib diisi' })
    }

    const qty = Number(b.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      return reply.status(400).send({ error: 'qty harus angka lebih dari 0' })
    }

    if (!(await proyekMilikTenant(request, b.project_id))) {
      // 404, bukan 403: membedakan "tidak ada" dari "bukan milik Anda"
      // memberi tahu penanya bahwa proyek itu ADA di tenant lain.
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const db = request.db!

    const { data: stok, error: errStok } = await db
      .viaProject('project_stocks', b.project_id)
      .select('id, qty_on_hand')
      .eq('material_id', b.material_id)
      .maybeSingle()

    if (errStok) return reply.status(500).send({ error: errStok.message })

    const sebelum = Number(stok?.qty_on_hand ?? 0)
    const sesudah = sebelum + qty

    // ── Kepala penerimaan ditulis LEBIH DULU ──────────────────────────────
    //
    // Urutannya disengaja, sama seperti transfer stok: kalau mutasi ditulis
    // dulu lalu kepalanya gagal, yang tertinggal adalah kenaikan stok tanpa
    // apa pun yang menjelaskan asalnya — dan di rekonsiliasi ia akan muncul
    // sebagai `sisa` yang tak berasal dari mana pun ("data belum lengkap").
    const { data: kepala, error: errKepala } = await db
      .viaProject('penerimaan_material_klien', b.project_id)
      .insert({
        project_id: b.project_id,
        material_id: b.material_id,
        qty,
        tanggal: b.tanggal ?? new Date().toISOString().slice(0, 10),
        pemasok: b.pemasok ?? null,
        nomor_surat_jalan: b.nomor_surat_jalan ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (errKepala) return reply.status(500).send({ error: errKepala.message })

    // Mutasi stok. `movement_type` = `goods_receipt` karena barangnya memang
    // MASUK; yang membedakannya dari pembelian adalah `reference_type`.
    // Rekonsiliasi tak membaca mutasi ini sebagai "dibeli" — ia membaca
    // tabel `penerimaan_material_klien` langsung.
    const { data: mutasi, error: errMutasi } = await db
      .viaProject('stock_movements', b.project_id)
      .insert({
        project_id: b.project_id,
        material_id: b.material_id,
        movement_type: 'goods_receipt',
        qty,
        qty_before: sebelum,
        qty_after: sesudah,
        reference_type: 'material_klien',
        reference_id: kepala.id,
        notes: b.pemasok ? `Material dari klien: ${b.pemasok}` : 'Material dari klien',
        created_by: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (errMutasi) {
      // Kepala tanpa mutasi tak boleh tertinggal diam-diam: ia akan terbaca
      // sebagai penerimaan yang sah pada laporan, padahal stoknya tak pernah
      // bertambah — dan selisihnya muncul sebagai "susut" pada barang orang.
      const { error: errBatal } = await db
        .viaProject('penerimaan_material_klien', b.project_id).delete().eq('id', kepala.id)
      if (errBatal) {
        return reply.status(500).send({
          error: `Mutasi stok gagal (${errMutasi.message}), DAN pembatalan penerimaan ${kepala.id} juga gagal (${errBatal.message}). Penerimaan tercatat tanpa kenaikan stok — perbaiki manual.`,
        })
      }
      return reply.status(500).send({ error: `Gagal menulis mutasi stok: ${errMutasi.message}` })
    }

    // Saldo stok. Hasil DIPERIKSA — ini satu-satunya tempat saldo berubah,
    // dan kalau gagal diam-diam, riwayat bilang barang masuk sementara saldo
    // bilang tidak.
    const { error: errSimpan } = stok
      ? await db.viaProject('project_stocks', b.project_id)
          .update({ qty_on_hand: sesudah, last_updated_at: new Date().toISOString() })
          .eq('id', stok.id)
      : await db.viaProject('project_stocks', b.project_id)
          .insert({ project_id: b.project_id, material_id: b.material_id, qty_on_hand: sesudah })

    if (errSimpan) {
      return reply.status(500).send({
        error: `Saldo stok gagal diperbarui (${errSimpan.message}). Penerimaan ${kepala.id} sudah tercatat — periksa kartu stok proyek.`,
      })
    }

    const { error: errTaut } = await db
      .viaProject('penerimaan_material_klien', b.project_id)
      .update({ movement_id: mutasi.id })
      .eq('id', kepala.id)

    if (errTaut) {
      return reply.status(500).send({
        error: `Stok sudah bertambah, tapi tautan jejaknya gagal disimpan (${errTaut.message}). Penerimaan ${kepala.id} perlu diperiksa.`,
      })
    }

    return reply.status(201).send({
      penerimaan: { id: kepala.id, qty, qty_before: sebelum, qty_after: sesudah },
    })
  })
}

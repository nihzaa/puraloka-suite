import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { susunTabulasi, type BarisPenawaran } from '../../lib/tabulasi-penawaran.js'
import { susunPutusan } from '../../lib/putusan-rfq.js'
import { ringkasKelayakan, type MrRingkas } from '../../lib/mr-layak-rfq.js'
import { logAuditEvent } from '../../utils/audit.js'

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
type BarisMentahPenawaran = {
  supplier_id: string
  material_id: string
  qty: number | string
  harga_satuan: number | string
  tidak_menawar: boolean | null
  waktu_kirim_hari: number | null
  supplier?: { id: string; name: string } | { id: string; name: string }[] | null
  material?:
    | { id: string; name: string; unit: string | null }
    | { id: string; name: string; unit: string | null }[]
    | null
}

/** PostgREST mengembalikan relasi sebagai objek ATAU array, tergantung bentuk join. */
const satuRelasi = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

/**
 * Bentuk baris penawaran mentah jadi masukan `susunTabulasi`.
 *
 * Diangkat jadi fungsi karena dipakai DUA kali: saat menampilkan tabulasi, dan
 * saat memutuskan pemenang. Kalau keduanya membentuk barisnya sendiri-sendiri,
 * putusan bisa dihitung dari tabulasi yang berbeda dengan yang dilihat pemakai
 * di layar — dan yang berbeda hanyalah harga, yang tak akan terlihat sampai PO
 * terbit ke vendor yang salah.
 */
function bentukBaris(mentah: BarisMentahPenawaran[]): BarisPenawaran[] {
  return mentah.map((p) => {
    const s = satuRelasi(p.supplier)
    const m = satuRelasi(p.material)
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
}

/**
 * Batalkan PO yang baru terbit — item dulu, lalu kepalanya.
 *
 * ── Kenapa hasil hapusnya DIPERIKSA
 *
 * Ini jalur pemulihan: ia hanya dipanggil setelah sesuatu sudah gagal. Kalau
 * pemulihannya ikut gagal DAN diam, yang tertinggal adalah PO yatim — pesanan
 * yang tak berasal dari keputusan mana pun, tak muncul di RFQ mana pun, dan
 * baru ketahuan saat vendor menanyakan barang yang tak pernah dipesan siapa
 * pun. Penjaga `audit-tulis-tanpa-periksa.mjs` menandai persis pola ini, dan
 * ia benar.
 *
 * Yang tak bisa dilakukan di sini: menjamin pemulihannya berhasil. Tak ada
 * transaksi lintas-tabel lewat PostgREST. Yang BISA: mengembalikan kalimat
 * yang menyebut nomor PO-nya, supaya pesan galat memberi tahu apa yang
 * tertinggal, alih-alih berpura-pura semuanya bersih.
 *
 * @returns null bila bersih; kalimat peringatan bila ada yang tertinggal.
 */
async function batalkanPo(
  db: NonNullable<FastifyRequest['db']>,
  projectId: string,
  poId: string,
): Promise<string | null> {
  const { error: eItem } = await db
    .viaProject('purchase_order_items', poId).delete().eq('po_id', poId)
  const { error: ePo } = await db
    .viaProject('purchase_orders', projectId).delete().eq('id', poId)

  if (!eItem && !ePo) return null
  return `PERHATIAN: PO ${poId} gagal dibatalkan dan mungkin tertinggal tanpa keputusan — hapus manual. (${[eItem?.message, ePo?.message].filter(Boolean).join('; ')})`
}

const PILIH_PENAWARAN =
  `supplier_id, material_id, qty, harga_satuan, tidak_menawar, waktu_kirim_hari, catatan,
   supplier:suppliers ( id, name ), material:materials ( id, name, unit )`

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

  // ── GET /api/v1/rfq/mr-layak?project_id= ─────────────────────────────────
  //
  // MR mana di proyek ini yang layak dimintakan penawaran, dan BERAPA sisanya.
  //
  // Diukur 2026-08-08: `rfq.mr_id` ada, rute POST sudah menerimanya, dan 3
  // dari 3 RFQ ber-`mr_id` NULL — UI tak punya cara mengisinya. Endpoint ini
  // yang memberi UI daftar untuk dipilih.
  //
  // Alasannya per-MR ikut dikirim, termasuk untuk yang TIDAK layak: layar yang
  // hanya menampilkan yang lolos membuat orang bertanya "MR saya ke mana" dan
  // tak menemukan jawabannya di mana pun.
  //
  // Ditaruh SEBELUM `/rfq/:id` — kalau di bawahnya, `:id` menangkap
  // "mr-layak" sebagai UUID dan membalas 404 yang membingungkan.
  app.get('/api/v1/rfq/mr-layak', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const { project_id } = request.query as Record<string, string>
    if (!project_id) return reply.status(400).send({ error: 'project_id wajib diisi' })

    if (!(await proyekMilikTenant(request, project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('material_requests', project_id)
      .select(`
        id, mr_number, status, needed_date,
        items:material_request_items (
          id, qty_requested, qty_ordered, unit,
          material:materials ( id, name, unit )
        )
      `)
      .order('needed_date', { ascending: true })
      .limit(200)

    if (error) return reply.status(500).send({ error: error.message })

    // Tipe eksplisit, bukan `?? []`: penjaga `audit-kegagalan-senyap` menandai
    // pola itu karena ia menyamarkan galat yang belum diperiksa jadi daftar
    // kosong. Di sini `error` SUDAH diperiksa di atas, jadi `data` pasti ada.
    const daftar = (data ?? []) as unknown as MrRingkas[]
    const hasil = ringkasKelayakan(daftar)

    return reply.send({
      layak: hasil.layak,
      tak_layak: hasil.tak_layak,
      // Jumlah total dibawa supaya layar bisa mengatakan "3 dari 9", bukan
      // hanya "3" — tanpa penyebutnya, angka itu tak bisa dinilai.
      jumlah_mr: daftar.length,
    })
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
      .select(PILIH_PENAWARAN)

    if (e2) return reply.status(500).send({ error: e2.message })

    const baris = bentukBaris((penawaran ?? []) as unknown as BarisMentahPenawaran[])

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

    // `mr_id` sudah lama diterima di sini dan LANGSUNG di-insert tanpa
    // diperiksa. Selama UI tak pernah mengirimnya (3 dari 3 RFQ ber-`mr_id`
    // NULL), celahnya tak pernah terpakai — dan sekarang UI mulai mengirimnya.
    //
    // Yang dijaga: MR harus ada DAN milik proyek yang sama. Tanpa ini, RFQ
    // proyek A bisa menunjuk kebutuhan proyek B — dan karena `mr_id` cuma
    // dibaca saat seseorang bertanya "ini untuk apa", salahnya baru ketahuan
    // jauh setelah PO terbit.
    if (b.mr_id) {
      const { data: mr, error: galatMr } = await request.db!
        .viaProject('material_requests', b.project_id)
        .select('id')
        .eq('id', b.mr_id)
        .maybeSingle()
      if (galatMr) return reply.status(500).send({ error: galatMr.message })
      if (!mr) {
        return reply.status(400).send({ error: 'Material request tidak ditemukan di proyek ini' })
      }
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

  // ── POST /api/v1/rfq/:id/putuskan — menangkan vendor & terbitkan PO ──────
  //
  // ══════════════════════════════════════════════════════════════════════════
  // UJUNG YANG SELAMA INI TAK ADA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Migrasi 195 menyiapkan `rfq.po_id` dan `rfq.alasan_pilih` sejak awal, dan
  // dua endpoint di atas MEMBACA keduanya. Diukur 2026-08-08: tak ada satu
  // baris pun yang MENULISNYA. Status `selesai` ada di CHECK constraint dan
  // tak pernah tercapai; halaman RFQ menjanjikan *"keputusannya tercatat"*
  // tanpa punya tombol untuk mencatatnya.
  //
  // ── Kenapa PO diterbitkan di sini, bukan disuruh dibuat manual
  //
  // Menyuruh orang menyalin harga dari tabulasi ke form PO membuat angka bisa
  // berbeda dari yang dibandingkan — dan itu menghapus seluruh guna RFQ:
  // tabulasinya jadi bukti untuk keputusan yang tidak benar-benar diambil.
  // Item PO di sini datang dari penawaran vendor yang menang, apa adanya.
  //
  // ── Urutan tulis: PO dulu, RFQ belakangan, dan kenapa itu yang benar
  //
  // Tak ada transaksi lintas-tabel lewat PostgREST. Dua urutan yang mungkin,
  // dua kegagalan yang berbeda:
  //
  //   RFQ dulu → RFQ `selesai` menunjuk `po_id` yang tak ada. Layar bilang
  //              "sudah diputuskan", PO-nya tak pernah terbit, dan tak ada
  //              yang tahu sampai vendor menanyakan pesanannya.
  //   PO dulu  → PO terbit tapi RFQ masih `terkirim`. Terlihat SEGERA: RFQ
  //              masih menawarkan tombol putuskan, dan percobaan kedua
  //              ditolak nomor PO ganda… tidak, nomornya digenerate DB.
  //
  // Karena itu jalur PO-dulu ditutup rapat: bila penandaan RFQ gagal, PO yang
  // baru terbit DIHAPUS lagi, dan pemanggil menerima 500 yang jujur. PO
  // yatim tak pernah tertinggal di basis.
  app.post('/api/v1/rfq/:id/putuskan', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as {
      supplier_id?: string
      alasan?: string
      expected_delivery_date?: string
      delivery_address?: string
      catatan?: string
    }

    if (!b.supplier_id) {
      return reply.status(400).send({ error: 'supplier_id wajib diisi' })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'RFQ tidak ditemukan' })

    const { data: rfq, error: eRfq } = await db
      .unsafe('rfq', 'verifikasi kepemilikan RFQ lewat projectIds sebelum menerbitkan PO')
      .select('id, nomor, project_id, status, po_id')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (eRfq) return reply.status(500).send({ error: eRfq.message })
    if (!rfq) return reply.status(404).send({ error: 'RFQ tidak ditemukan' })

    // Putusan ganda menerbitkan PO KEDUA untuk RFQ yang sama: vendor menerima
    // dua pesanan, dan `po_id` hanya menyimpan yang terakhir — yang pertama
    // jadi PO tanpa asal-usul yang bisa ditelusuri.
    if (rfq.status === 'selesai' || rfq.po_id) {
      return reply.status(409).send({
        error: `RFQ ${rfq.nomor} sudah diputuskan. Batalkan PO-nya lebih dulu bila keputusannya berubah.`,
      })
    }
    if (rfq.status === 'batal') {
      return reply.status(400).send({ error: `RFQ ${rfq.nomor} sudah dibatalkan` })
    }

    const { data: penawaran, error: ePen } = await db
      .viaProject('rfq_penawaran', id)
      .select(PILIH_PENAWARAN)

    if (ePen) return reply.status(500).send({ error: ePen.message })

    // Tabulasi dihitung dari sumber yang SAMA dengan yang dilihat pemakai —
    // lihat `bentukBaris`.
    const tabulasi = susunTabulasi(bentukBaris((penawaran ?? []) as unknown as BarisMentahPenawaran[]))
    const hasil = susunPutusan(tabulasi, { supplier_id: b.supplier_id, alasan: b.alasan })

    if (!hasil.ok) {
      // 400, bukan 422: yang ditolak adalah ISI permintaan (vendor yang tak
      // menawar, alasan yang kosong), dan pesannya sudah dirancang untuk
      // dibaca langsung di layar oleh yang menekan tombolnya.
      return reply.status(400).send({ error: hasil.alasan })
    }

    const { rencana } = hasil

    // `payment_terms` disalin dari supplier, mengikuti pola pembuatan PO di
    // `procurement.ts` — syarat bayar yang berlaku adalah yang disepakati saat
    // PO terbit, bukan yang berlaku saat GR datang berbulan-bulan kemudian.
    const { data: sup } = await db
      .from('suppliers').select('payment_terms').eq('id', rencana.supplier_id).maybeSingle()

    const { data: po, error: ePo } = await db
      .viaProject('purchase_orders', rfq.project_id)
      .insert({
        project_id: rfq.project_id,
        supplier_id: rencana.supplier_id,
        created_by: request.currentUser!.id,
        expected_delivery_date: b.expected_delivery_date ?? null,
        delivery_address: b.delivery_address ?? null,
        payment_terms: sup?.payment_terms ?? 'cod',
        total_amount: rencana.total,
        // Nomor PO dihasilkan trigger `generate_po_number` per-company
        // (migrasi 135, diperbaiki 217). Mengarangnya di sini akan bertabrakan
        // dengan penomoran tenant lain.
        po_number: '',
        notes: b.catatan ?? `Dari RFQ ${rfq.nomor}`,
      })
      .select('id, po_number')
      .single()

    if (ePo) return reply.status(500).send({ error: ePo.message })

    const item = rencana.item.map((i) => ({
      po_id: po.id,
      material_id: i.material_id,
      qty_ordered: i.qty_ordered,
      unit: i.unit,
      unit_price: i.unit_price,
    }))

    const { error: eItem } = await db
      .viaProject('purchase_order_items', po.id)
      .insert(item)

    if (eItem) {
      // PO tanpa item adalah PO yang tak bisa diterima barangnya dan tak bisa
      // ditagih — lebih buruk daripada tak ada PO sama sekali, karena ia
      // menghitung `total_amount` yang tak punya rincian.
      const sisa = await batalkanPo(db, rfq.project_id, po.id)
      return reply.status(500).send({
        error: `Gagal menulis item PO: ${eItem.message}${sisa ? ` — ${sisa}` : ''}`,
      })
    }

    const { data: rfqBaru, error: eTandai } = await db
      .viaProject('rfq', rfq.project_id)
      .update({
        status: 'selesai',
        po_id: po.id,
        alasan_pilih: (b.alasan ?? '').trim() || null,
      })
      .eq('id', id)
      .select('id, status, po_id, alasan_pilih')
      .maybeSingle()

    // Hasil update DIPERIKSA, bukan diabaikan. `update` yang tak mengenai satu
    // baris pun tidak menghasilkan error di PostgREST — ia mengembalikan nol
    // baris dengan tenang, dan tanpa pemeriksaan ini RFQ tetap `terkirim`
    // sementara PO sudah terbit.
    if (eTandai || !rfqBaru) {
      const sisa = await batalkanPo(db, rfq.project_id, po.id)
      return reply.status(500).send({
        error: [
          'Gagal menandai RFQ selesai; PO dibatalkan supaya tak ada pesanan tanpa keputusan.',
          eTandai?.message,
          sisa,
        ].filter(Boolean).join(' '),
      })
    }

    await logAuditEvent(request, {
      tableName: 'rfq',
      recordId: id,
      action: 'procurement.rfq_diputuskan',
      actorId: request.currentUser!.id,
      // `severity: 'warning'` saat yang menang BUKAN termurah. Inilah baris
      // yang dicari auditor, dan mencarinya di antara ratusan entri `info`
      // berarti tak akan ditemukan.
      severity: rencana.seluruhnya_termurah ? 'info' : 'warning',
      reason: rencana.seluruhnya_termurah
        ? undefined
        : `Vendor bukan termurah; selisih ${rencana.selisih_total}`,
      newValues: {
        rfq_nomor: rfq.nomor,
        po_id: po.id,
        po_number: po.po_number,
        supplier_id: rencana.supplier_id,
        supplier_name: rencana.supplier_name,
        total: rencana.total,
        seluruhnya_termurah: rencana.seluruhnya_termurah,
        selisih_total: rencana.selisih_total,
        alasan_pilih: (b.alasan ?? '').trim() || null,
      },
    })

    return reply.status(201).send({
      rfq: rfqBaru,
      purchase_order: { id: po.id, po_number: po.po_number, total: rencana.total },
      putusan: {
        supplier_name: rencana.supplier_name,
        jumlah_item: rencana.item.length,
        seluruhnya_termurah: rencana.seluruhnya_termurah,
        selisih_total: rencana.selisih_total,
      },
    })
  })
}

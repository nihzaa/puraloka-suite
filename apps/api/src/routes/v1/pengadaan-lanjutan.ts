import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import {
  nilaiKontrakPayung, bolehTarikKuota, nilaiExpediting, nilaiNotaKredit,
  type KontrakPayung, type ItemPayung, type Expediting, type NotaKredit,
} from '../../lib/pengadaan-lanjutan.js'

/**
 * PENGADAAN LANJUTAN (TUNDA kelompok F)
 *
 * ── Yang dijawab modul ini
 *
 * Satu barang, dari kesepakatan sampai uangnya kembali:
 *
 *   kontrak payung → harga & kuota disepakati DI MUKA
 *   expediting     → barangnya sekarang di mana, telat berapa hari
 *   nota kredit    → barang salah/rusak diretur, tagihan dikoreksi
 *
 * ── Kenapa status DIHITUNG, bukan dibaca dari kolom
 *
 * Kontrak payung berstatus 'aktif' bisa saja kuotanya sudah habis atau masa
 * berlakunya lewat — memperbarui statusnya adalah langkah manual yang mudah
 * terlupa. Yang tak lupa: membandingkan `terpakai` dengan `kuota`, dan
 * `berlaku_sampai` dengan hari ini. PO berikutnya yang menarik dari kontrak
 * mati akan ditagih di luar harga kontrak.
 */
export default async function pengadaanLanjutanRoutes(app: FastifyInstance) {
  const hariIni = () => new Date().toISOString().slice(0, 10)

  // ── GET /api/v1/pengadaan-lanjutan ──────────────────────────────────────
  app.get('/api/v1/pengadaan-lanjutan', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const db = request.db!
    const cid = request.companyId!
    const t = hariIni()
    const alasan = 'kategori B; disaring company_id di baris berikutnya'

    const [payung, itemPayung, exp, nota, pemasok, po] = await Promise.all([
      db.unsafe('kontrak_payung', alasan)
        .select('id, supplier_id, nomor, judul, berlaku_dari, berlaku_sampai, pagu_nilai, status, syarat_pembayaran')
        .eq('company_id', cid).order('berlaku_sampai'),
      db.unsafe('kontrak_payung_item', alasan)
        .select('id, kontrak_id, uraian, satuan, harga_satuan, kuota, terpakai')
        .eq('company_id', cid).order('uraian'),
      db.unsafe('expediting', alasan)
        .select('id, po_id, status, janji_vendor, perkiraan_tiba, tiba_aktual, lokasi_terkini, nomor_resi, moda, sebab_tertahan')
        .eq('company_id', cid),
      db.unsafe('nota_kredit', alasan)
        .select('id, supplier_id, supplier_invoice_id, nomor, tanggal, jenis, jumlah, alasan, status, diputuskan_pada, diterapkan_pada, alasan_tolak')
        .eq('company_id', cid).order('tanggal', { ascending: false }),
      db.unsafe('suppliers', 'melengkapi nama pemasok untuk layar')
        .select('id, name').eq('company_id', cid),
      // `purchase_orders` KATEGORI C — mewarisi tenancy lewat `project_id`,
      // TIDAK punya `company_id` sendiri. Menyaringnya dengan
      // `eq('company_id', …)` akan gagal dengan galat kolom-tak-ada, dan
      // `?? []` mengubah kegagalan itu jadi "nol PO" yang terlihat sah.
      // Disaring lewat join ke `projects` yang memang ber-`company_id`.
      db.unsafe('purchase_orders', 'kategori C; disaring lewat projects!inner(company_id)')
        .select('id, po_number, expected_delivery_date, supplier_id, project_id, projects!inner(company_id)')
        .eq('projects.company_id', cid),
    ])

    // Diperiksa satu per satu dengan menyebut namanya, BUKAN lewat loop atas
    // array: query ketujuh yang ditambahkan nanti dan lupa dimasukkan akan
    // gagal tanpa suara, lalu `?? []` mengubahnya jadi "nol baris" yang sah.
    if (payung.error) return reply.status(500).send({ error: payung.error.message })
    if (itemPayung.error) return reply.status(500).send({ error: itemPayung.error.message })
    if (exp.error) return reply.status(500).send({ error: exp.error.message })
    if (nota.error) return reply.status(500).send({ error: nota.error.message })
    if (pemasok.error) return reply.status(500).send({ error: pemasok.error.message })
    if (po.error) return reply.status(500).send({ error: po.error.message })

    type Baris = Record<string, unknown>
    const namaPemasok = new Map(
      (pemasok.data ?? []).map((s) => [(s as Baris).id as string, (s as Baris).name as string]))
    const petaPo = new Map(
      (po.data ?? []).map((p) => [(p as Baris).id as string, p as Baris]))

    // Item dikelompokkan per kontrak.
    const itemPerKontrak = new Map<string, ItemPayung[]>()
    for (const i of (itemPayung.data ?? []) as Baris[]) {
      const k = i.kontrak_id as string
      const a = itemPerKontrak.get(k) ?? []
      a.push(i as unknown as ItemPayung)
      itemPerKontrak.set(k, a)
    }

    const kontrakLengkap = ((payung.data ?? []) as unknown as KontrakPayung[]).map((k) => ({
      ...k,
      pemasok_nama: k.supplier_id ? namaPemasok.get(k.supplier_id) ?? null : null,
      item: itemPerKontrak.get(k.id) ?? [],
    }))

    const ringkasPayung = nilaiKontrakPayung(kontrakLengkap, t)

    // Yang "aktif tapi tak bisa dipakai" naik ke atas — PO berikutnya yang
    // menariknya akan ditagih di luar harga kontrak.
    ringkasPayung.kontrak.sort((a, b) => {
      if (a.aktifTapiTakBisaDipakai !== b.aktifTapiTakBisaDipakai) {
        return a.aktifTapiTakBisaDipakai ? -1 : 1
      }
      return (a.sisaHari ?? 9e9) - (b.sisaHari ?? 9e9)
    })

    // Expediting dilengkapi nomor PO dan TANGGAL KEBUTUHAN dari PO-nya.
    //
    // `expected_delivery_date` di PO adalah kebutuhan KITA; `janji_vendor`
    // di expediting adalah janji vendor. Keduanya dibawa terpisah karena
    // selisihnya adalah percakapan yang berbeda saat pekerjaan telat.
    const expLengkap = ((exp.data ?? []) as unknown as Expediting[]).map((e) => {
      const p = petaPo.get(e.po_id)
      return {
        ...e,
        po_number: (p?.po_number as string) ?? null,
        butuh_tanggal: (p?.expected_delivery_date as string) ?? null,
        pemasok_nama: p?.supplier_id
          ? namaPemasok.get(p.supplier_id as string) ?? null
          : null,
      }
    })

    const ringkasExp = nilaiExpediting(expLengkap, t)

    // Yang paling telat naik ke atas — bukan yang paling baru dibuat.
    ringkasExp.kiriman.sort((a, b) => {
      if (a.sudahTiba !== b.sudahTiba) return a.sudahTiba ? 1 : -1
      return (b.telatHari ?? -9e9) - (a.telatHari ?? -9e9)
    })

    const notaLengkap = ((nota.data ?? []) as unknown as NotaKredit[]).map((n) => ({
      ...n,
      pemasok_nama: n.supplier_id ? namaPemasok.get(n.supplier_id) ?? null : null,
    }))

    const ringkasNota = nilaiNotaKredit(notaLengkap, t)

    // Yang menggantung naik: potongan disepakati tapi tagihan penuh dibayar.
    ringkasNota.nota.sort((a, b) => {
      if (a.menggantung !== b.menggantung) return a.menggantung ? -1 : 1
      return (b.umurSetujuHari ?? -9e9) - (a.umurSetujuHari ?? -9e9)
    })

    return reply.send({
      tanggal: t,
      kontrakPayung: ringkasPayung,
      expediting: ringkasExp,
      notaKredit: ringkasNota,
    })
  })

  // ── POST /api/v1/pengadaan-lanjutan/kontrak ─────────────────────────────
  app.post('/api/v1/pengadaan-lanjutan/kontrak', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      supplier_id?: string
      nomor?: string
      judul?: string
      berlaku_dari?: string
      berlaku_sampai?: string
      pagu_nilai?: number | null
      syarat_pembayaran?: string
      catatan?: string
      item?: Array<{ uraian?: string; satuan?: string; harga_satuan?: number; kuota?: number; material_id?: string }>
    }

    if (!b.supplier_id || !b.nomor || !b.judul) {
      return reply.status(400).send({ error: 'supplier_id, nomor, dan judul wajib diisi' })
    }
    if (!b.berlaku_dari || !b.berlaku_sampai) {
      return reply.status(400).send({
        error: 'Kontrak payung SELALU bertanggal — harga yang disepakati tahun lalu bukan harga hari ini',
      })
    }
    if (!b.item?.length) {
      // Kontrak payung tanpa item adalah kesepakatan tanpa isi: tak ada
      // harga dan tak ada kuota yang bisa ditarik PO.
      return reply.status(400).send({ error: 'Kontrak payung harus memuat minimal satu item' })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: s } = await db
      .unsafe('suppliers', 'memastikan pemasok milik tenant sebelum diikat kontrak')
      .select('id').eq('id', b.supplier_id).eq('company_id', cid).maybeSingle()
    if (!s) return reply.status(404).send({ error: 'Pemasok tidak ditemukan' })

    const { data, error } = await db
      .unsafe('kontrak_payung', 'menyimpan kontrak; pemasok sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        supplier_id: b.supplier_id,
        nomor: b.nomor,
        judul: b.judul,
        berlaku_dari: b.berlaku_dari,
        berlaku_sampai: b.berlaku_sampai,
        pagu_nilai: b.pagu_nilai ?? null,
        syarat_pembayaran: b.syarat_pembayaran ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: `Kontrak payung ${b.nomor} sudah ada` })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Jendela berlaku terbalik, atau pagu nilainya tak lebih dari nol',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    const { error: galatItem } = await db
      .unsafe('kontrak_payung_item', 'menyimpan item kontrak yang baru dibuat')
      .insert(b.item.map((i) => ({
        company_id: cid,
        kontrak_id: data!.id,
        material_id: i.material_id ?? null,
        uraian: i.uraian ?? '',
        satuan: i.satuan ?? '',
        harga_satuan: i.harga_satuan ?? 0,
        kuota: i.kuota ?? 0,
      })))

    if (galatItem) {
      // Kontrak tanpa item tak berguna — dan lebih buruk daripada tak ada,
      // karena ia terlihat seperti kesepakatan yang bisa ditarik. Dibatalkan
      // seluruhnya, dan hasil pembatalannya DIPERIKSA.
      const { error: galatBatal } = await db
        .unsafe('kontrak_payung', 'membatalkan kontrak yang itemnya gagal disimpan')
        .delete().eq('id', data!.id).eq('company_id', cid)

      if (galatBatal) {
        request.log.error({ err: galatBatal, kontrak: data!.id, nomor: b.nomor },
          'kontrak payung kosong TERTINGGAL — item ditolak dan pembatalannya gagal')
        return reply.status(500).send({
          error: `Item kontrak ditolak, dan kontrak ${b.nomor} gagal dibatalkan. Hapus manual sebelum membuat ulang — kontrak tanpa item terlihat seperti kesepakatan yang bisa ditarik.`,
        })
      }

      return reply.status(422).send({
        error: 'Item kontrak ditolak — harga satuan dan kuota harus lebih dari nol, dan uraian+satuan tak boleh kembar',
      })
    }

    return reply.status(201).send({ kontrak: data })
  })

  // ── POST /api/v1/pengadaan-lanjutan/tarik-kuota ─────────────────────────
  //
  // Menarik kuota kontrak payung. Diperiksa DI SINI sebelum menyimpan supaya
  // pesannya menyebut sisa berapa — constraint DB menolak dengan 23514 yang
  // tak memberi tahu angkanya, dan yang mengisi form butuh angkanya.
  app.post('/api/v1/pengadaan-lanjutan/tarik-kuota', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const b = request.body as { item_id?: string; jumlah?: number; po_id?: string }

    if (!b.item_id || b.jumlah == null) {
      return reply.status(400).send({ error: 'item_id dan jumlah wajib diisi' })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: item, error: galatBaca } = await db
      .unsafe('kontrak_payung_item', 'kategori B; disaring company_id di baris berikutnya')
      .select('id, kontrak_id, uraian, satuan, harga_satuan, kuota, terpakai')
      .eq('id', b.item_id).eq('company_id', cid).maybeSingle()

    if (galatBaca) return reply.status(500).send({ error: galatBaca.message })
    if (!item) return reply.status(404).send({ error: 'Item kontrak tidak ditemukan' })

    const cek = bolehTarikKuota(item as unknown as ItemPayung, b.jumlah)
    if (!cek.boleh) {
      return reply.status(422).send({ error: cek.alasan, sisa: cek.sisa })
    }

    // Kontraknya sendiri harus masih bisa dipakai. Kuota tersisa pada
    // kontrak yang sudah kedaluwarsa bukan kuota yang boleh ditarik.
    const { data: kontrak } = await db
      .unsafe('kontrak_payung', 'memastikan kontrak induk masih berlaku')
      .select('id, nomor, status, berlaku_dari, berlaku_sampai, pagu_nilai')
      .eq('id', (item as { kontrak_id: string }).kontrak_id).eq('company_id', cid).maybeSingle()

    if (!kontrak) return reply.status(404).send({ error: 'Kontrak induk tidak ditemukan' })

    const t = hariIni()
    if (kontrak.status !== 'aktif') {
      return reply.status(422).send({
        error: `Kontrak ${kontrak.nomor} berstatus "${kontrak.status}" — hanya kontrak aktif yang bisa ditarik`,
      })
    }
    if ((kontrak.berlaku_sampai as string) < t) {
      return reply.status(422).send({
        error: `Kontrak ${kontrak.nomor} sudah kedaluwarsa ${kontrak.berlaku_sampai} — penarikan akan ditagih di luar harga kontrak`,
      })
    }
    if ((kontrak.berlaku_dari as string) > t) {
      return reply.status(422).send({
        error: `Kontrak ${kontrak.nomor} baru berlaku ${kontrak.berlaku_dari}`,
      })
    }

    const terpakaiBaru = (Number((item as { terpakai: number | string }).terpakai) || 0) + Number(b.jumlah)

    // Penarikan dijaga `eq('terpakai', …)`: kalau ada yang menarik lebih
    // dulu di antara pembacaan dan penulisan ini, nilainya sudah berubah dan
    // update ini TIDAK mengenai baris mana pun — bukan menimpanya diam-diam.
    const { data: hasil, error } = await db
      .unsafe('kontrak_payung_item', 'menarik kuota; item sudah diverifikasi milik tenant')
      .update({ terpakai: terpakaiBaru, updated_at: new Date().toISOString() })
      .eq('id', b.item_id).eq('company_id', cid)
      .eq('terpakai', (item as { terpakai: number | string }).terpakai ?? 0)
      .select('id, uraian, kuota, terpakai')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Penarikan melebihi kuota — ada penarikan lain yang mendahului permintaan ini',
        })
      }
      return reply.status(500).send({ error: error.message })
    }
    if (!hasil) {
      return reply.status(409).send({
        error: 'Kuota berubah saat permintaan diproses — ada penarikan lain yang mendahului. Muat ulang dan coba lagi.',
      })
    }

    if (b.po_id) {
      // Kategori C: PO diverifikasi milik tenant lebih dulu lewat proyeknya,
      // baru diperbarui — `update` tak bisa memakai join.
      const { data: poSah } = await db
        .unsafe('purchase_orders', 'memastikan PO milik tenant lewat proyeknya sebelum ditautkan')
        .select('id, projects!inner(company_id)')
        .eq('id', b.po_id).eq('projects.company_id', cid).maybeSingle()

      if (!poSah) {
        request.log.error({ po: b.po_id },
          'kuota tertarik tapi PO bukan milik tenant ini — penautan dilewati')
      } else {
        const { error: galatPo } = await db
          .unsafe('purchase_orders', 'menautkan PO ke kontrak payung; PO sudah diverifikasi')
          .update({ kontrak_payung_id: (item as { kontrak_id: string }).kontrak_id })
          .eq('id', b.po_id)
        if (galatPo) {
          request.log.error({ err: galatPo, po: b.po_id },
            'kuota tertarik tapi PO gagal ditautkan ke kontrak payung')
        }
      }
    }

    return reply.status(200).send({ item: hasil })
  })

  // ── POST /api/v1/pengadaan-lanjutan/expediting ──────────────────────────
  app.post('/api/v1/pengadaan-lanjutan/expediting', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      po_id?: string
      janji_vendor?: string
      perkiraan_tiba?: string
      status?: string
      lokasi_terkini?: string
      nomor_resi?: string
      moda?: string
      sebab_tertahan?: string
      catatan?: string
    }

    if (!b.po_id) return reply.status(400).send({ error: 'po_id wajib diisi' })

    const db = request.db!
    const cid = request.companyId!

    // Kategori C: kepemilikan tenant diperiksa lewat proyeknya.
    const { data: po } = await db
      .unsafe('purchase_orders', 'memastikan PO milik tenant lewat proyeknya sebelum dilacak')
      .select('id, po_number, projects!inner(company_id)')
      .eq('id', b.po_id).eq('projects.company_id', cid).maybeSingle()
    if (!po) return reply.status(404).send({ error: 'PO tidak ditemukan' })

    const { data, error } = await db
      .unsafe('expediting', 'menyimpan pelacakan; PO sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        po_id: b.po_id,
        janji_vendor: b.janji_vendor ?? null,
        perkiraan_tiba: b.perkiraan_tiba ?? null,
        status: b.status ?? 'dipesan',
        lokasi_terkini: b.lokasi_terkini ?? null,
        nomor_resi: b.nomor_resi ?? null,
        moda: b.moda ?? null,
        sebab_tertahan: b.sebab_tertahan ?? null,
        catatan: b.catatan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, po_id, status, perkiraan_tiba')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({
          error: `PO ${po.po_number} sudah punya catatan pelacakan — perbarui yang ada, jangan buat kedua`,
        })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Status tertahan wajib menyebut sebabnya, dan status tiba wajib bertanggal',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ expediting: data })
  })

  // ── PATCH /api/v1/pengadaan-lanjutan/expediting/:id ─────────────────────
  app.patch('/api/v1/pengadaan-lanjutan/expediting/:id', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as {
      status?: string
      lokasi_terkini?: string
      perkiraan_tiba?: string
      tiba_aktual?: string
      sebab_tertahan?: string
      catatan?: string
    }

    const db = request.db!
    const cid = request.companyId!

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (b.status !== undefined) patch.status = b.status
    if (b.lokasi_terkini !== undefined) patch.lokasi_terkini = b.lokasi_terkini
    if (b.perkiraan_tiba !== undefined) patch.perkiraan_tiba = b.perkiraan_tiba
    if (b.tiba_aktual !== undefined) patch.tiba_aktual = b.tiba_aktual
    if (b.sebab_tertahan !== undefined) patch.sebab_tertahan = b.sebab_tertahan
    if (b.catatan !== undefined) patch.catatan = b.catatan

    const { data, error } = await db
      .unsafe('expediting', 'kategori B; disaring company_id di baris berikutnya')
      .update(patch).eq('id', id).eq('company_id', cid)
      .select('id, po_id, status, lokasi_terkini, perkiraan_tiba, tiba_aktual')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Status tertahan wajib menyebut sebabnya (minimal 5 huruf), dan status tiba wajib bertanggal',
        })
      }
      return reply.status(500).send({ error: error.message })
    }
    if (!data) return reply.status(404).send({ error: 'Catatan pelacakan tidak ditemukan' })

    // Jejak perubahan status — riwayat, bukan hanya keadaan terkini.
    // "Barang ini tertahan sejak kapan?" tak bisa dijawab dari satu baris.
    if (b.status) {
      const { error: galatJejak } = await db
        .unsafe('expediting_jejak', 'mencatat jejak perubahan status pelacakan')
        .insert({
          company_id: cid,
          expediting_id: id,
          status: b.status,
          lokasi: b.lokasi_terkini ?? null,
          catatan: b.catatan ?? null,
          dicatat_oleh: request.currentUser!.id,
        })
      if (galatJejak) {
        request.log.error({ err: galatJejak, expediting: id },
          'status pelacakan berubah tapi jejaknya gagal dicatat')
      }
    }

    return reply.send({ expediting: data })
  })

  // ── POST /api/v1/pengadaan-lanjutan/nota-kredit ─────────────────────────
  app.post('/api/v1/pengadaan-lanjutan/nota-kredit', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      supplier_id?: string
      supplier_invoice_id?: string | null
      project_id?: string | null
      nomor?: string
      tanggal?: string
      jenis?: string
      jumlah?: number
      alasan?: string
      ajukan?: boolean
    }

    if (!b.supplier_id || !b.nomor || b.jumlah == null) {
      return reply.status(400).send({ error: 'supplier_id, nomor, dan jumlah wajib diisi' })
    }
    if (!b.alasan || b.alasan.trim().length < 10) {
      return reply.status(400).send({
        error: 'Nota kredit wajib beralasan (minimal 10 huruf) — tanpa itu ia tak bisa dibedakan dari kesalahan pencatatan',
      })
    }

    const db = request.db!
    const cid = request.companyId!

    const { data: s } = await db
      .unsafe('suppliers', 'memastikan pemasok milik tenant sebelum dibuatkan nota kredit')
      .select('id').eq('id', b.supplier_id).eq('company_id', cid).maybeSingle()
    if (!s) return reply.status(404).send({ error: 'Pemasok tidak ditemukan' })

    const diajukan = b.ajukan === true

    const { data, error } = await db
      .unsafe('nota_kredit', 'menyimpan nota kredit; pemasok sudah diverifikasi milik tenant')
      .insert({
        company_id: cid,
        supplier_id: b.supplier_id,
        supplier_invoice_id: b.supplier_invoice_id ?? null,
        project_id: b.project_id ?? null,
        nomor: b.nomor,
        tanggal: b.tanggal ?? hariIni(),
        jenis: b.jenis ?? 'retur_barang',
        jumlah: b.jumlah,
        alasan: b.alasan,
        status: diajukan ? 'diajukan' : 'draft',
        diajukan_oleh: diajukan ? request.currentUser!.id : null,
        diajukan_pada: diajukan ? new Date().toISOString() : null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, jumlah, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: `Nota kredit ${b.nomor} sudah ada` })
      }
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Jumlah harus lebih dari nol, dan jenisnya harus salah satu yang dikenal',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ notaKredit: data })
  })

  // ── PATCH /api/v1/pengadaan-lanjutan/nota-kredit/:id/putuskan ───────────
  app.patch('/api/v1/pengadaan-lanjutan/nota-kredit/:id/putuskan', {
    preHandler: [authenticate, requirePermission('procurement:payment:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as { setujui?: boolean; alasan_tolak?: string }
    const db = request.db!
    const cid = request.companyId!

    const { data: nk, error: galatBaca } = await db
      .unsafe('nota_kredit', 'kategori B; disaring company_id di baris berikutnya')
      .select('id, nomor, status, diajukan_oleh, jumlah')
      .eq('id', id).eq('company_id', cid).maybeSingle()

    if (galatBaca) return reply.status(500).send({ error: galatBaca.message })
    if (!nk) return reply.status(404).send({ error: 'Nota kredit tidak ditemukan' })

    if (nk.status !== 'diajukan') {
      return reply.status(422).send({
        error: `Nota kredit ini berstatus "${nk.status}" — hanya yang diajukan bisa diputuskan`,
      })
    }

    // Pemisahan tugas diperiksa DI SINI juga, bukan hanya di constraint:
    // pesan galat yang jelas lebih berguna daripada 23514 mentah.
    if (nk.diajukan_oleh === request.currentUser!.id) {
      return reply.status(403).send({
        error: 'Anda yang mengajukan nota kredit ini — pemutus harus orang lain. Potongan yang disetujui sendiri bukan pengendalian apa pun.',
      })
    }

    const setujui = b.setujui === true
    if (!setujui && (b.alasan_tolak ?? '').trim().length < 10) {
      return reply.status(422).send({
        error: 'Penolakan wajib beralasan (minimal 10 huruf)',
      })
    }

    const { data, error } = await db
      .unsafe('nota_kredit', 'menyimpan keputusan; nota sudah diverifikasi milik tenant')
      .update({
        status: setujui ? 'disetujui' : 'ditolak',
        diputuskan_oleh: request.currentUser!.id,
        diputuskan_pada: new Date().toISOString(),
        alasan_tolak: setujui ? null : b.alasan_tolak,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('company_id', cid)
      .eq('status', 'diajukan')
      .select('id, nomor, status, diputuskan_pada')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        return reply.status(422).send({
          error: 'Keputusan ditolak basis — periksa alasan penolakannya',
        })
      }
      return reply.status(500).send({ error: error.message })
    }
    // Nota kredit sudah dibaca & diverifikasi di atas, jadi nol baris di sini
    // berarti keputusan lain menang lebih dulu (TJS-A0, 2026-08-09).
    if (!data) {
      request.log.warn({ nkId: id }, 'keputusan nota kredit serentak ditolak')
      return reply.status(409).send({
        error: 'Nota kredit ini baru saja diputus dari tempat lain. Muat ulang halaman.',
      })
    }

    return reply.send({ notaKredit: data })
  })

  // ── PATCH /api/v1/pengadaan-lanjutan/nota-kredit/:id/terapkan ───────────
  //
  // Menerapkan potongan ke tagihan. Terpisah dari `putuskan` dengan sengaja:
  // disetujui dan diterapkan adalah dua kejadian berbeda, dan jarak di
  // antaranya persis yang membuat uang hilang dengan persetujuan lengkap.
  app.patch('/api/v1/pengadaan-lanjutan/nota-kredit/:id/terapkan', {
    preHandler: [authenticate, requirePermission('procurement:payment:manage')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!
    const cid = request.companyId!

    const { data: nk, error: galatBaca } = await db
      .unsafe('nota_kredit', 'kategori B; disaring company_id di baris berikutnya')
      .select('id, nomor, status, jumlah, supplier_invoice_id')
      .eq('id', id).eq('company_id', cid).maybeSingle()

    if (galatBaca) return reply.status(500).send({ error: galatBaca.message })
    if (!nk) return reply.status(404).send({ error: 'Nota kredit tidak ditemukan' })

    if (nk.status !== 'disetujui') {
      return reply.status(422).send({
        error: `Nota kredit berstatus "${nk.status}" — hanya yang sudah disetujui bisa diterapkan. Potongan yang diterapkan tanpa persetujuan adalah uang yang hilang tanpa satu pun tanda tangan.`,
      })
    }

    const { data, error } = await db
      .unsafe('nota_kredit', 'menandai nota kredit diterapkan; sudah diverifikasi disetujui')
      .update({
        status: 'diterapkan',
        diterapkan_pada: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('company_id', cid)
      .select('id, nomor, jumlah, status, diterapkan_pada')
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Nota kredit tidak ditemukan' })

    return reply.send({ notaKredit: data })
  })
}

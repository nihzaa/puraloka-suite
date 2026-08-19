import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import {
  susunTender, periksaPenetapan, periksaPenutupan, susunTabulasiItem,
  type BarisPenawaranSubkon, type BarisItemPenawaran,
} from '../../lib/tender-subkon.js'
import {
  rencanakanSalinBoq, type ItemPenawaranMenang, type ItemBoqAda,
} from '../../lib/salin-boq-pemenang.js'
import { logAuditEvent } from '../../utils/audit.js'
import { periksaKelayakan } from '../../lib/gerbang-kelayakan.js'

/**
 * TENDER & AWARD SUBKONTRAKTOR (F5 PEMBEDA)
 *
 * ── Cacat yang ditutup, diukur pada data nyata
 *
 * 20 lingkup kerja bernilai Rp 15.000.000 sampai Rp 280.000.000, SELURUHNYA
 * ber-`contract_status = 'unsigned'`, dan tak satu pun punya jejak bagaimana
 * mandornya dipilih.
 *
 * Kesenjangan yang persis sama dengan yang ditutup RFQ (migrasi 195), tapi di
 * sisi subkontraktor.
 *
 * ── Kenapa memakai `workers`, bukan tabel subkontraktor baru
 *
 * Sistem ini memakai MANDOR sebagai padanan lokal subkontraktor. Membuat
 * daftar terpisah menciptakan dua sumber kebenaran tentang siapa mengerjakan
 * apa. Rinciannya di migrasi 201.
 *
 * ── Kenapa perbandingannya DIHITUNG, bukan disimpan
 *
 * Tabulasi diturunkan dari penawaran tiap kali diminta. Menyimpannya sebagai
 * kolom membuat angka "termurah" bisa basi diam-diam saat satu penawaran
 * disunting — dan yang paling berkepentingan menyuntingnya adalah orang yang
 * mandornya sedang kalah.
 */
/** Ringkasan penyalinan BOQ yang ikut di balasan penetapan pemenang. */
interface RingkasanBoq {
  /** `false` bila tender belum punya `work_scope_id` — bukan kegagalan. */
  disalin: boolean
  sebab?: string
  jumlah_sisip?: number
  jumlah_perbarui?: number
  /** Nama item yang TIDAK ditimpa karena sudah punya progres lapangan. */
  dilewati_berprogres?: string[]
}

/**
 * Salin rincian penawaran PEMENANG ke `work_scope_items`.
 *
 * ⚠ ADITIF, tidak pernah destruktif. Aturan lengkap beserta alasannya ada di
 * `lib/salin-boq-pemenang.ts`; yang paling penting: item yang sudah punya
 * `volume_done > 0` DILEWATI. Progres lapangan adalah satu-satunya data di
 * modul ini yang tak bisa dibuat ulang dari mana pun.
 *
 * Kegagalan penyalinan TIDAK membatalkan penetapan pemenang. Pemenangnya
 * sudah tercatat beserta alasannya — itu keputusan yang sah dan lengkap.
 * BOQ adalah turunan yang bisa disusun ulang; membatalkan keputusan yang
 * benar karena turunannya gagal justru menghapus jejak yang lebih berharga.
 * Karena itu sebabnya DILAPORKAN, bukan ditelan diam-diam.
 */
async function salinBoqPemenang(
  request: FastifyRequest,
  idTender: string,
  idPenawaran: string,
  idProyek: string[],
): Promise<RingkasanBoq> {
  const db = request.db!
  const kosong = (sebab: string): RingkasanBoq => ({ disalin: false, sebab })

  const { data: tender, error: eT } = await db
    .unsafe('tender_subkon', 'membaca work_scope_id tender yang kepemilikannya sudah diverifikasi pemanggil')
    .select('work_scope_id')
    .eq('id', idTender)
    .in('project_id', idProyek)
    .maybeSingle()
  if (eT) return kosong(`Gagal membaca lingkup kerja tender: ${eT.message}`)

  const idScope = (tender as { work_scope_id: string | null } | null)?.work_scope_id
  if (!idScope) {
    // BUKAN kegagalan. Migrasi 347 memang tak membuat `work_scopes` otomatis.
    return kosong(
      'Tender ini belum terkait lingkup kerja (work_scope), jadi BOQ pemenang belum '
      + 'bisa disalin. Kaitkan lingkup kerjanya lebih dulu, lalu salin BOQ dari sana.')
  }

  // ⚠ `viaProject` untuk tabel kategori C menyaring lewat kolom INDUKNYA,
  // bukan lewat project_id. Untuk `penawaran_subkon_item` induknya
  // `penawaran_id` (tenant-map), jadi yang diserahkan adalah id PENAWARAN.
  //
  // Percobaan pertama menyerahkan id TENDER dan hasilnya nol baris — tanpa
  // galat. Rutenya lalu melapor "penawaran pemenang tidak berisi rincian",
  // kalimat yang masuk akal dan sepenuhnya salah. Ditangkap test, bukan oleh
  // pembacaan kode.
  const { data: itemMenang, error: eI } = await db
    .viaProject('penawaran_subkon_item', idPenawaran)
    .select('kode_item, uraian, satuan, volume, harga_satuan, urutan')
    .order('urutan', { ascending: true })
  if (eI) return kosong(`Gagal membaca rincian pemenang: ${eI.message}`)

  const item = (itemMenang ?? []) as unknown as ItemPenawaranMenang[]
  if (item.length === 0) {
    // Penawaran hanya-total. Sah (437), tapi tak ada yang bisa disalin.
    return kosong('Penawaran pemenang tidak berisi rincian per-item, jadi BOQ tidak berubah.')
  }

  // `work_scope_items` kategori C lewat `work_scope_id` (tenant-map), jadi
  // yang diserahkan `viaProject` adalah id LINGKUP KERJA — bukan id proyek.
  const { data: boqLama, error: eB } = await db
    .viaProject('work_scope_items', idScope)
    .select('id, item_name, volume_done')
  if (eB) return kosong(`Gagal membaca BOQ lingkup kerja: ${eB.message}`)

  const rencana = rencanakanSalinBoq(item, (boqLama ?? []) as unknown as ItemBoqAda[])

  for (const t of rencana.tindakan) {
    if (t.jenis === 'lewati') continue

    if (t.jenis === 'sisip') {
      const { error } = await db
        .viaProject('work_scope_items', idScope)
        .insert({
          work_scope_id: idScope,
          item_name: t.item_name,
          unit: t.unit,
          volume: t.volume,
          unit_price: t.unit_price,
          sort_order: t.sort_order,
          created_by: request.currentUser!.id,
          // `category` sengaja dibiarkan pada DEFAULT 'lain_lain' (023:68).
          // Menebaknya dari uraian akan salah diam-diam, dan kategori yang
          // salah mengalir ke laporan biaya per-kategori.
        })
      if (error) return kosong(`Gagal menyisipkan item BOQ "${t.item_name}": ${error.message}`)
      continue
    }

    // `volume_done` ikut di WHERE — pagar KEDUA di luar `rencanakanSalinBoq`.
    //
    // Rencana disusun dari pembacaan beberapa milidetik lalu; kalau seorang
    // mandor mencatat progres di antara baca dan tulis, aturan "jangan timpa
    // progres" akan terlewat justru pada baris yang paling perlu dijaga.
    // Di sini basis yang memutuskan, bukan ingatan aplikasi.
    const { error } = await db
      .viaProject('work_scope_items', idScope)
      .update({
        unit: t.unit, volume: t.volume, unit_price: t.unit_price,
        updated_at: new Date().toISOString(),
      })
      .eq('id', t.id)
      .eq('volume_done', 0)
    if (error) return kosong(`Gagal memperbarui item BOQ "${t.item_name}": ${error.message}`)
  }

  return {
    disalin: true,
    jumlah_sisip: rencana.jumlah_sisip,
    jumlah_perbarui: rencana.jumlah_perbarui,
    dilewati_berprogres: rencana.dilewati_berprogres,
  }
}

export default async function tenderSubkonRoutes(app: FastifyInstance) {
  // ── GET /api/v1/tender-subkon ────────────────────────────────────────────
  app.get('/api/v1/tender-subkon', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.send({ tender: [], total: 0 })

    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const batas = Math.min(Math.max(Number(q.limit) || 100, 1), 500)

    let kueri = db
      .unsafe('tender_subkon', 'daftar lintas-proyek; viaProject butuh satu project sebagai konteks')
      .select(
        // `penawaran_subkon(count)` — jumlah penawaran per tender.
        //
        // Bukan hiasan: tanpa angka ini layar tak punya cara memilih tender
        // mana yang dibuka lebih dulu, dan urutan `tanggal DESC` membuat
        // tender TERBARU yang menang — yang justru paling mungkin belum ada
        // penawarannya. Pengguna membuka layar perbandingan dan disambut
        // "belum ada penawaran", padahal tender lain penuh isinya.
        `id, nomor, judul, lingkup_kerja, nilai_perkiraan, tanggal, batas_masuk,
         status, alasan_pilih, created_at,
         proyek:projects ( id, name ),
         pembuat:users ( id, name ),
         penawaran_subkon ( count )`,
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

    return reply.send({ tender: data ?? [], total: count ?? 0 })
  })

  // ── GET /api/v1/tender-subkon/:id — beserta perbandingannya ──────────────
  app.get('/api/v1/tender-subkon/:id', {
    preHandler: [authenticate, requirePermission('projects:view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.db!

    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    // Gerbang tenancy: tender diambil dengan saringan proyek milik tenant.
    // Tanpa `.in()`, `eq('id', ...)` mengembalikan tender tenant lain beserta
    // SELURUH nilai penawaran mandornya — informasi komersial yang paling
    // merugikan kalau bocor, terutama ke sesama mandor yang bersaing.
    const { data: kepala, error: e1 } = await db
      .unsafe('tender_subkon', 'ambil satu tender dengan saringan projectIds')
      .select(`id, nomor, judul, lingkup_kerja, nilai_perkiraan, tanggal, batas_masuk,
               status, alasan_pilih, catatan, project_id, work_scope_id,
               proyek:projects ( id, name )`)
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (e1) return reply.status(500).send({ error: e1.message })
    if (!kepala) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: penawaran, error: e2 } = await db
      .viaProject('penawaran_subkon', id)
      .select(`id, worker_id, nilai_penawaran, waktu_kerja_hari, tidak_menawar,
               status, catatan, workers ( id, name )`)

    if (e2) return reply.status(500).send({ error: e2.message })

    const satu = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const baris: BarisPenawaranSubkon[] = ((penawaran ?? []) as Array<{
      id: string; worker_id: string
      nilai_penawaran: number | string
      waktu_kerja_hari: number | null
      tidak_menawar: boolean | null
      status: string | null
      catatan: string | null
      workers?: { id: string; name: string } | { id: string; name: string }[] | null
    }>).map((p) => ({
      id: p.id,
      worker_id: p.worker_id,
      worker_name: satu(p.workers)?.name ?? null,
      nilai_penawaran: p.nilai_penawaran,
      waktu_kerja_hari: p.waktu_kerja_hari,
      tidak_menawar: p.tidak_menawar,
      status: (p.status ?? 'diajukan') as BarisPenawaranSubkon['status'],
      catatan: p.catatan,
    }))

    // ── Rincian per-item (437) ─────────────────────────────────────────────
    //
    // Diambil TERPISAH, bukan lewat nested select di query penawaran di atas.
    // Alasannya PostgREST: baca bersarang tunduk pada batas 1.000 baris yang
    // memotong SENYAP (penjaga `audit-baca-tak-terpotong.mjs`), dan pemotongan
    // di sini tak menghasilkan galat — ia menghasilkan tabel perbandingan yang
    // kehilangan pos-pos terakhir, persis bentuk kesalahan yang paling sulit
    // terlihat: tabel yang tampak lengkap.
    const idPenawaran = baris.map((b) => b.id)
    let itemMentah: BarisItemPenawaran[] = []

    if (idPenawaran.length > 0) {
      // `unsafe`, bukan `viaProject`: rincian diambil untuk BEBERAPA penawaran
      // sekaligus, sementara `viaProject` hanya bisa menyaring satu induk
      // (`.eq('penawaran_id', …)`). Tenancy tetap terjaga — `idPenawaran`
      // berasal dari `baris`, yang sudah disaring `projectIds()` di atas.
      const { data: dataItem, error: e3 } = await db
        .unsafe('penawaran_subkon_item',
          'id penawaran berasal dari daftar yang sudah disaring projectIds() di atas')
        .select('penawaran_id, kode_item, uraian, satuan, volume, harga_satuan, subtotal, urutan')
        .in('penawaran_id', idPenawaran)
        .order('urutan', { ascending: true })

      // Galat TIDAK ditelan: rincian yang gagal dibaca membuat perbandingan
      // per-item tampil kosong, dan "tak ada rincian" adalah kesimpulan yang
      // salah tapi masuk akal — pembacanya tak akan pernah tahu ia menatap
      // kegagalan, bukan keadaan.
      if (e3) return reply.status(500).send({ error: e3.message })
      itemMentah = (dataItem ?? []) as unknown as BarisItemPenawaran[]
    }

    const namaPenawar: Record<string, string> = {}
    for (const b of baris) namaPenawar[b.id] = b.worker_name ?? '—'

    return reply.send({
      tender: kepala,
      perbandingan: susunTender(baris, (kepala as { nilai_perkiraan: number | string | null }).nilai_perkiraan),
      // `null`, bukan objek kosong, saat tak ada rincian sama sekali. Layar
      // harus bisa membedakan "tender ini dibandingkan per-total saja" dari
      // "ada rincian tapi semuanya nol" — keduanya bukan keadaan yang sama.
      perbandingan_item: itemMentah.length > 0
        ? susunTabulasiItem(itemMentah, namaPenawar)
        : null,
    })
  })

  // ── POST /api/v1/tender-subkon ───────────────────────────────────────────
  //
  // `projects:contract` — DIVERIFIKASI ada di tabel `permissions`. Menender
  // pekerjaan adalah tindakan kontraktual: hasilnya kontrak borongan.
  app.post('/api/v1/tender-subkon', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const b = request.body as {
      project_id?: string; nomor?: string; judul?: string
      lingkup_kerja?: string; nilai_perkiraan?: number
      tanggal?: string; batas_masuk?: string; catatan?: string
    }

    if (!b.project_id || !b.nomor?.trim() || !b.judul?.trim()) {
      return reply.status(400).send({ error: 'project_id, nomor, dan judul wajib diisi' })
    }

    if (b.batas_masuk && b.tanggal && b.batas_masuk < b.tanggal) {
      // Dijaga juga oleh CHECK di basis. Diperiksa di sini supaya penggunanya
      // dapat kalimat yang bisa dimengerti, bukan galat constraint mentah.
      return reply.status(400).send({
        error: 'batas_masuk tidak boleh lebih awal daripada tanggal tender',
      })
    }

    if (!(await proyekMilikTenant(request, b.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .viaProject('tender_subkon', b.project_id)
      .insert({
        project_id: b.project_id,
        nomor: b.nomor.trim(),
        judul: b.judul.trim(),
        lingkup_kerja: b.lingkup_kerja?.trim() || null,
        nilai_perkiraan: b.nilai_perkiraan ?? null,
        tanggal: b.tanggal ?? new Date().toISOString().slice(0, 10),
        batas_masuk: b.batas_masuk ?? null,
        catatan: b.catatan?.trim() || null,
        created_by: request.currentUser!.id,
      })
      .select('id, nomor, judul, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(400).send({ error: `Nomor tender "${b.nomor.trim()}" sudah dipakai` })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ tender: data })
  })

  // ── POST /api/v1/tender-subkon/:id/penawaran ─────────────────────────────
  app.post('/api/v1/tender-subkon/:id/penawaran', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as {
      worker_id?: string; nilai_penawaran?: number
      waktu_kerja_hari?: number; tidak_menawar?: boolean; catatan?: string
    }

    if (!b.worker_id) {
      return reply.status(400).send({ error: 'worker_id wajib diisi' })
    }

    const tidakMenawar = b.tidak_menawar === true
    const nilai = Number(b.nilai_penawaran ?? 0)

    if (!tidakMenawar && (!Number.isFinite(nilai) || nilai <= 0)) {
      // Harga 0 hanya sah bila mandor MENYATAKAN tak menawar. Tanpa pagar
      // ini, "0" selalu menang sebagai termurah — dan borongan jatuh ke
      // mandor yang tak pernah mengajukan harga.
      return reply.status(400).send({
        error: 'nilai_penawaran harus lebih dari 0, atau tandai tidak_menawar',
      })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: tender, error: eT } = await db
      .unsafe('tender_subkon', 'verifikasi kepemilikan tender lewat projectIds sebelum menulis penawaran')
      .select('id, project_id, status')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()

    if (eT) return reply.status(500).send({ error: eT.message })
    if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    if (tender.status === 'selesai' || tender.status === 'batal') {
      // Penawaran yang masuk sesudah keputusan mengubah perbandingan di
      // belakang keputusan yang sudah diambil — dan jejak auditnya berbohong.
      return reply.status(400).send({
        error: `Tender berstatus "${tender.status}" tidak menerima penawaran baru`,
      })
    }

    const { data, error } = await db
      .viaProject('penawaran_subkon', id)
      .insert({
        tender_id: id,
        worker_id: b.worker_id,
        nilai_penawaran: tidakMenawar ? 0 : nilai,
        waktu_kerja_hari: b.waktu_kerja_hari ?? null,
        tidak_menawar: tidakMenawar,
        catatan: b.catatan?.trim() || null,
        created_by: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(400).send({
          error: 'Mandor ini sudah menawar di tender tersebut — sunting penawarannya, jangan tambah baris baru',
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.status(201).send({ penawaran: data })
  })

  // ── PUT /api/v1/tender-subkon/:id/penawaran/:pid/item ────────────────────
  //
  // Rincian per-item sebuah penawaran (437). PUT, bukan POST: yang dikirim
  // adalah SELURUH rincian penawaran itu, dan hasilnya menggantikan yang lama
  // seluruhnya.
  //
  // Kenapa mengganti seluruhnya, bukan menambah baris demi baris: total dan
  // rinciannya wajib cocok (trigger 437), jadi keadaan setengah-terkirim
  // SELALU melanggar. Menyisipkan per baris berarti tiap permintaan di
  // tengah-tengah pasti ditolak — kecuali kalau pemeriksaannya dilonggarkan,
  // yang justru membuang gunanya.
  app.put('/api/v1/tender-subkon/:id/penawaran/:pid/item', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id, pid } = request.params as { id: string; pid: string }
    const b = request.body as {
      item?: Array<{
        kode_item?: string | null; uraian?: string; satuan?: string | null
        volume?: number | string; harga_satuan?: number | string; catatan?: string | null
      }>
      /**
       * Total baru, opsional.
       *
       * Dikirim bersama itemnya supaya keduanya berubah dalam SATU permintaan.
       * Tanpa ini, mengganti rincian yang jumlahnya berbeda dari total lama
       * selalu ditolak trigger — dan pengguna tak punya urutan langkah yang
       * bisa berhasil.
       */
      nilai_penawaran?: number | string
    }

    if (!Array.isArray(b.item)) {
      return reply.status(400).send({ error: 'item wajib berupa array (kirim [] untuk menghapus seluruh rincian)' })
    }
    if (b.item.length > 500) {
      return reply.status(400).send({ error: 'Rincian melebihi 500 baris' })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: tender, error: eT } = await db
      .unsafe('tender_subkon', 'kepemilikan diverifikasi lewat projectIds() di baris berikutnya')
      .select('id, status')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()
    if (eT) return reply.status(500).send({ error: eT.message })
    if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    if ((tender as { status: string }).status !== 'terkirim') {
      // Rincian yang berubah SESUDAH keputusan mengubah dasar perbandingan di
      // belakang keputusan yang sudah diambil — dan jejak auditnya berbohong.
      return reply.status(409).send({
        error: `Tender berstatus "${(tender as { status: string }).status}" tidak menerima perubahan rincian`,
      })
    }

    const { data: pen, error: eP } = await db
      .viaProject('penawaran_subkon', id)
      .select('id, tidak_menawar, nilai_penawaran')
      .eq('id', pid)
      .eq('tender_id', id)
      .maybeSingle()
    if (eP) return reply.status(500).send({ error: eP.message })
    if (!pen) return reply.status(404).send({ error: 'Penawaran tidak ditemukan pada tender ini' })

    if ((pen as { tidak_menawar: boolean }).tidak_menawar && b.item.length > 0) {
      // Dijaga juga oleh trigger 437; diperiksa di sini supaya penolakannya
      // berupa kalimat yang bisa ditindaklanjuti, bukan galat trigger mentah.
      return reply.status(409).send({
        error: 'Penawar ini menyatakan TIDAK menawar — rincian harga tidak bisa dilampirkan.',
      })
    }

    // Validasi bentuk sebelum menyentuh basis: satu baris tanpa uraian akan
    // ditolak CHECK, dan galatnya tak menyebut baris ke berapa.
    //
    // Nomor barisnya ikut disebut karena inilah yang membedakan galat yang
    // bisa diperbaiki dari galat yang hanya bisa ditebak: rincian 40 baris
    // yang ditolak "uraian wajib diisi" tanpa menyebut baris ke berapa
    // membuat penggunanya memeriksa keempat puluhnya satu per satu.
    const baris: Array<{
      penawaran_id: string; kode_item: string | null; uraian: string
      satuan: string | null; volume: number; harga_satuan: number
      urutan: number; catatan: string | null
    }> = []

    for (const [i, it] of b.item.entries()) {
      const uraian = String(it.uraian ?? '').trim()
      if (!uraian) {
        return reply.status(400).send({ error: `Baris ${i + 1}: uraian wajib diisi` })
      }
      const volume = Number(it.volume ?? 0)
      const harga = Number(it.harga_satuan ?? 0)
      if (!Number.isFinite(volume) || volume < 0) {
        return reply.status(400).send({ error: `Baris ${i + 1}: volume tidak sah` })
      }
      if (!Number.isFinite(harga) || harga < 0) {
        return reply.status(400).send({ error: `Baris ${i + 1}: harga satuan tidak sah` })
      }
      baris.push({
        penawaran_id: pid,
        kode_item: it.kode_item?.toString().trim() || null,
        uraian,
        satuan: it.satuan?.toString().trim() || null,
        volume,
        harga_satuan: harga,
        urutan: i,
        catatan: it.catatan?.toString().trim() || null,
      })
    }

    // Total dikirim → dipakai. Tidak dikirim → dihitung dari rincian.
    //
    // Yang kedua BUKAN pelanggaran keputusan "total divalidasi, bukan
    // dihitung" (kepala migrasi 437): keputusan itu tentang apa yang basis
    // lakukan pada angka yang SUDAH tersimpan. Di sini pengguna baru saja
    // mengetik rinciannya dan tak menyebut total — menawarkan jumlahnya
    // sebagai nilai awal lebih jujur daripada menolak dengan "totalnya tak
    // cocok" atas angka yang belum pernah ia tetapkan.
    const jumlahItem = baris.reduce((s, x) => s + x.volume * x.harga_satuan, 0)
    const totalBaru = b.nilai_penawaran != null && b.nilai_penawaran !== ''
      ? Number(b.nilai_penawaran)
      : baris.length > 0
        ? Number(jumlahItem.toFixed(2))
        : Number((pen as { nilai_penawaran: number | string }).nilai_penawaran)

    if (!Number.isFinite(totalBaru) || totalBaru < 0) {
      return reply.status(400).send({ error: 'nilai_penawaran tidak sah' })
    }
    if (baris.length > 0 && Math.abs(totalBaru - jumlahItem) > 1) {
      // Ditolak SEBELUM menulis apa pun — trigger 437 akan menolaknya juga,
      // tapi di sini pesannya bisa menyebut kedua angkanya.
      return reply.status(409).send({
        error: `Rincian berjumlah Rp ${jumlahItem.toLocaleString('id-ID')} tetapi nilai `
          + `penawaran Rp ${totalBaru.toLocaleString('id-ID')}. Perbaiki salah satunya.`,
      })
    }

    // ── URUTAN TULIS: kosongkan → set total → sisip ────────────────────────
    //
    // ⚠ Urutan ini WAJIB, dan alasannya bukan selera.
    //
    // Percobaan pertama menulis "hapus → sisip → set total" dengan anggapan
    // trigger 437 yang DEFERRABLE INITIALLY DEFERRED akan menahan pemeriksaan
    // sampai seluruh rangkaian selesai. Itu SALAH, dan testnya menangkapnya:
    //
    //     Rincian item berjumlah Rp 3.000.000 tetapi nilai penawaran
    //     tertulis Rp 50.000.000
    //
    // `request.db` adalah PostgREST lewat HTTP — TIAP pemanggilan adalah
    // transaksinya SENDIRI. "Deferred" hanya menunda pemeriksaan sampai akhir
    // transaksi, dan di sini akhir transaksi datang di ujung tiap statement.
    // Jadi tak ada satu pun jendela di mana keadaan setengah jalan tersembunyi.
    //
    // Yang menyelamatkan: trigger MELEWATI penawaran yang TAK punya item sama
    // sekali (`v_n = 0` → sah, itulah "per-item opsional"). Jadi dengan
    // mengosongkan rincian lebih dulu, penawaran kembali ke bentuk hanya-total
    // yang selalu sah — totalnya bebas diubah — lalu rincian yang sudah cocok
    // disisipkan terakhir.
    //
    // Tiap batas commit di antaranya menyimpan keadaan yang SAH.
    // `viaProject` untuk tabel ini menyaring lewat `penawaran_id` (kategori C,
    // induknya penawaran — bukan project). Yang diserahkan karena itu `pid`,
    // dan kepemilikannya sudah diverifikasi lewat tender di atas.
    const { error: eDel } = await db
      .viaProject('penawaran_subkon_item', pid)
      .delete()
      .eq('penawaran_id', pid)
    if (eDel) return reply.status(500).send({ error: eDel.message })

    const { data: totalTersimpan, error: eUp } = await db
      .viaProject('penawaran_subkon', id)
      .update({ nilai_penawaran: totalBaru, updated_at: new Date().toISOString() })
      .eq('id', pid)
      .eq('tender_id', id)
      .select('id, nilai_penawaran')
      .maybeSingle()
    if (eUp) return reply.status(409).send({ error: eUp.message })
    if (!totalTersimpan) {
      // NOL baris TIDAK sah di sini: rincian lama sudah terhapus, totalnya
      // tak berubah. Dinyatakan alih-alih melapor berhasil.
      return reply.status(409).send({
        error: 'Rincian lama terhapus tetapi totalnya gagal diperbarui — penawaran '
          + 'berubah dari tempat lain. Muat ulang dan periksa nilainya.',
      })
    }

    if (baris.length > 0) {
      const { error: eIns } = await db
        .viaProject('penawaran_subkon_item', pid)
        .insert(baris)
      if (eIns) {
        if (eIns.code === '23505') {
          return reply.status(400).send({
            error: 'Ada kode item yang kembar dalam satu penawaran — tiap kode hanya boleh sekali.',
          })
        }
        return reply.status(400).send({ error: eIns.message })
      }
    }

    await logAuditEvent(request, {
      action: 'update',
      tableName: 'penawaran_subkon',
      recordId: pid,
      actorId: request.currentUser!.id,
      newValues: { rincian_item: baris.length, nilai_penawaran: totalBaru },
      reason: `Rincian per-item diperbarui (${baris.length} baris)`,
    })

    return reply.send({ jumlah_item: baris.length, nilai_penawaran: totalBaru })
  })

  // ── PATCH /api/v1/tender-subkon/:id/pemenang ─────────────────────────────
  //
  // Endpoint yang selama ini HILANG. Diukur 2026-08-13: `status = 'menang'`
  // dibaca dua halaman (`mandor/spk/page.tsx:610` mencarinya untuk menerbitkan
  // SPK) tetapi tak satu pun rute menulisnya. Modul ini bisa membandingkan
  // penawaran dengan sangat baik, lalu berhenti tepat sebelum gunanya.
  //
  // Penetapan TIDAK menutup tendernya. Keduanya dipisah supaya masih ada
  // kesempatan meninjau ulang sebelum penutupan — yang tak bisa dibatalkan.
  app.patch('/api/v1/tender-subkon/:id/pemenang', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as { penawaran_id?: string; alasan?: string }

    if (!b.penawaran_id) {
      return reply.status(400).send({ error: 'penawaran_id wajib diisi' })
    }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: tender, error: eT } = await db
      .unsafe('tender_subkon', 'kepemilikan diverifikasi lewat projectIds() di baris berikutnya')
      .select('id, status, nilai_perkiraan')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()
    if (eT) return reply.status(500).send({ error: eT.message })
    if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: penawaran, error: eP } = await db
      .viaProject('penawaran_subkon', id)
      .select('id, worker_id, nilai_penawaran, waktu_kerja_hari, tidak_menawar, status')
      .eq('tender_id', id)
    if (eP) return reply.status(500).send({ error: eP.message })

    const verdict = periksaPenetapan({
      penawaran: (penawaran ?? []) as unknown as BarisPenawaranSubkon[],
      idPemenang: b.penawaran_id,
      statusTender: (tender as { status: string }).status,
      alasan: b.alasan,
    })
    if (!verdict.boleh) {
      // 404 hanya untuk yang benar-benar tak ada; sisanya 409 — permintaannya
      // bisa dimengerti, keadaannya yang menolak.
      return reply.status(verdict.kode === 'tak_ada' ? 404 : 409).send({ error: verdict.sebab })
    }

    // ── GERBANG KELAYAKAN — di sinilah kerugiannya nyata ──────────────────
    //
    // Diukur 2026-08-19, SEBELUM migrasi 461: kedelapan penawaran tender
    // datang lewat `workers`, sementara `evaluasi_subkon.masuk_daftar_hitam`
    // hanya bisa menunjuk `suppliers` — dan berkas ini tak memeriksanya sama
    // sekali. Pihak yang di-blacklist bisa menawar DAN MENANG, bukan karena
    // penjaganya lalai melainkan karena penjaganya berdiri di pintu lain.
    //
    // Diperiksa di PENETAPAN, bukan di penawaran: menawar belum memindahkan
    // uang, menetapkan sudah. Menolak keduanya sama kerasnya mendorong orang
    // menghapus status daftar hitam supaya pekerjaannya jalan — dan penanda
    // yang dihapus demi kelancaran adalah penanda yang mati.
    const pemenang = (penawaran ?? []).find(
      (p) => (p as { id: string }).id === b.penawaran_id) as { worker_id?: string } | undefined

    if (pemenang?.worker_id) {
      const { data: tukang, error: eTukang } = await db
        .from('workers')
        .select('mitra_id')
        .eq('id', pemenang.worker_id)
        .maybeSingle()
      if (eTukang) return reply.status(500).send({ error: eTukang.message })

      const idMitra = (tukang as { mitra_id: string | null } | null)?.mitra_id ?? null
      if (idMitra) {
        const { data: mitra, error: eMitra } = await db
          .from('mitra')
          .select('id, nama, daftar_hitam, alasan_daftar_hitam, aktif')
          .eq('id', idMitra)
          .maybeSingle()
        if (eMitra) return reply.status(500).send({ error: eMitra.message })

        const kelayakan = periksaKelayakan(mitra as never)
        if (!kelayakan.boleh) {
          // 409, bukan 403: permintaannya sah dan penggunanya berwenang —
          // keadaan pihaknya yang menolak. 403 akan terbaca sebagai "Anda
          // tak boleh menetapkan pemenang", tuduhan yang salah alamat.
          return reply.status(409).send({ error: kelayakan.pesan })
        }
      }
      // `mitra_id` NULL sengaja dilewati tanpa menolak — itu keadaan data
      // (baris belum ter-backfill), bukan penilaian atas pihaknya. Menolaknya
      // akan menghentikan seluruh tender di tenant yang belum ter-migrasi.
    }

    // Yang KALAH ditandai lebih dulu, pemenang belakangan.
    //
    // Urutan ini bukan selera: basis memasang indeks unik parsial "satu
    // pemenang per tender" (migrasi 201:157). Menulis pemenang baru sebelum
    // pemenang lama diturunkan akan ditolak indeks itu — dan pesannya
    // ("duplicate key") tak memberitahu siapa pun apa yang harus dilakukan.
    const { data: diturunkan, error: eKalah } = await db
      .viaProject('penawaran_subkon', id)
      .update({ status: 'kalah', updated_at: new Date().toISOString() })
      .eq('tender_id', id)
      .neq('id', b.penawaran_id)
      .in('status', ['diajukan', 'menang'])
      // Yang menyatakan TIDAK MENAWAR tidak ikut diturunkan jadi 'kalah'.
      //
      // Kalah berarti bersaing lalu tidak terpilih. Mandor yang menjawab
      // "saya tidak menawar" tak pernah masuk persaingan, dan menandainya
      // kalah membuat rekam jejaknya berbohong: daftar "berapa kali kalah
      // tender" akan menghitung undangan yang bahkan tak pernah ia jawab
      // dengan harga.
      .eq('tidak_menawar', false)
      .select('id')
    if (eKalah) return reply.status(500).send({ error: eKalah.message })
    // NOL baris di sini SAH: tender berpenawar tunggal tak punya siapa pun
    // untuk diturunkan. Yang tidak sah adalah tidak tahu — jumlahnya ikut di
    // balasan supaya layar bisa menyatakan "2 penawar lain ditandai kalah"
    // alih-alih membiarkan pengguna menebak apa yang barusan terjadi.
    const jumlahKalah = (diturunkan ?? []).length

    // `.in('status', …)` ikut di WHERE: penetapan yang berlomba dengan
    // penetapan lain tak boleh menimpa hasil yang sudah berpindah status.
    const { data: jadi, error: eMenang } = await db
      .viaProject('penawaran_subkon', id)
      .update({ status: 'menang', updated_at: new Date().toISOString() })
      .eq('id', b.penawaran_id)
      .eq('tender_id', id)
      .in('status', ['diajukan', 'kalah'])
      .select('id, worker_id, nilai_penawaran, status')
      .maybeSingle()
    if (eMenang) return reply.status(500).send({ error: eMenang.message })
    if (!jadi) {
      return reply.status(409).send({
        error: 'Penawaran itu berubah dari tempat lain sebelum penetapan tersimpan. Muat ulang.',
      })
    }

    const { data: alasanTersimpan, error: eAlasan } = await db
      .unsafe('tender_subkon', 'id sudah diverifikasi milik tenant ini di atas')
      .update({ alasan_pilih: (b.alasan ?? '').trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('project_id', idProyek)
      .select('id')
      .maybeSingle()
    if (eAlasan) return reply.status(500).send({ error: eAlasan.message })
    if (!alasanTersimpan) {
      // NOL baris di sini TIDAK sah: pemenangnya sudah tercatat, tapi alasan
      // yang menjelaskannya tidak. Itu justru keadaan yang paling berbahaya —
      // keputusan tanpa keterangan, dan endpointnya melapor berhasil.
      return reply.status(409).send({
        error: 'Pemenang tersimpan tetapi alasannya gagal ditulis — tender berubah dari '
          + 'tempat lain. Muat ulang dan periksa alasan pemilihannya.',
      })
    }

    // ── Salin BOQ pemenang ke `work_scope_items` (437) ─────────────────────
    //
    // Menutup rantai yang selama ini putus tepat sesudah uang dijanjikan:
    // rincian harga yang dipakai MEMILIH pemenang berhenti di tender, lalu
    // BOQ pelaksanaannya diketik ulang dari nol — atau tidak sama sekali.
    // Diukur 2026-08-16: `work_scope_items` tak punya SATU PUN rute tulis.
    //
    // Hanya bila `work_scope_id` sudah terisi. Migrasi 347:48-52 menyatakan
    // menutup tender TIDAK membuat `work_scopes`; kaitannya dipasang manual.
    // Tanpa kaitan itu tak ada tujuan yang bisa dituju, dan MEMBUAT scope di
    // sini adalah keputusan lain yang bukan milik endpoint ini.
    const ringkasanBoq = await salinBoqPemenang(request, id, b.penawaran_id, idProyek)

    await logAuditEvent(request, {
      action: 'update',
      tableName: 'penawaran_subkon',
      recordId: b.penawaran_id,
      actorId: request.currentUser!.id,
      newValues: { status: 'menang', tender_id: id, alasan_pilih: (b.alasan ?? '').trim() },
      reason: (b.alasan ?? '').trim(),
    })

    return reply.send({
      pemenang: jadi,
      peringatan: verdict.peringatan,
      penawar_dikalahkan: jumlahKalah,
      boq: ringkasanBoq,
    })
  })

  // ── PATCH /api/v1/tender-subkon/:id/tutup ────────────────────────────────
  //
  // Menutup tender = menyatakan keputusannya final. Trigger 347 menuntut
  // tepat satu pemenang DAN alasan terisi; diperiksa juga di sini supaya
  // penolakannya berupa kalimat yang bisa ditindaklanjuti.
  app.patch('/api/v1/tender-subkon/:id/tutup', {
    preHandler: [authenticate, requirePermission('projects:contract')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const db = request.db!
    const idProyek = await db.projectIds()
    if (idProyek.length === 0) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: tender, error: eT } = await db
      .unsafe('tender_subkon', 'kepemilikan diverifikasi lewat projectIds() di baris berikutnya')
      .select('id, status, alasan_pilih')
      .eq('id', id)
      .in('project_id', idProyek)
      .maybeSingle()
    if (eT) return reply.status(500).send({ error: eT.message })
    if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

    const { data: penawaran, error: eP } = await db
      .viaProject('penawaran_subkon', id)
      .select('id, worker_id, nilai_penawaran, waktu_kerja_hari, tidak_menawar, status')
      .eq('tender_id', id)
    if (eP) return reply.status(500).send({ error: eP.message })

    const t = tender as { status: string; alasan_pilih: string | null }
    const verdict = periksaPenutupan({
      penawaran: (penawaran ?? []) as unknown as BarisPenawaranSubkon[],
      statusTender: t.status,
      alasan: t.alasan_pilih,
    })
    if (!verdict.boleh) return reply.status(409).send({ error: verdict.sebab })

    // Status lama ikut di WHERE — dua penutupan bersamaan tak boleh keduanya
    // mengira berhasil.
    const { data: jadi, error } = await db
      .unsafe('tender_subkon', 'id sudah diverifikasi milik tenant ini di atas')
      .update({ status: 'selesai', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('project_id', idProyek)
      .eq('status', t.status)
      .select('id, nomor, status')
      .maybeSingle()

    if (error) {
      // Trigger 347 menolak dengan kalimat yang sudah dirancang untuk dibaca
      // manusia; diteruskan apa adanya alih-alih ditimpa "gagal menutup".
      const pesan = (error as { message?: string }).message ?? ''
      if (/pemenang|[Aa]lasan/.test(pesan)) {
        return reply.status(409).send({ error: pesan })
      }
      return reply.status(500).send({ error: error.message })
    }
    if (!jadi) {
      return reply.status(409).send({
        error: 'Tender berubah dari tempat lain sebelum penutupan tersimpan. Muat ulang.',
      })
    }

    await logAuditEvent(request, {
      action: 'update',
      tableName: 'tender_subkon',
      recordId: id,
      actorId: request.currentUser!.id,
      oldValues: { status: t.status },
      newValues: { status: 'selesai' },
    })

    return reply.send({ tender: jadi })
  })
}

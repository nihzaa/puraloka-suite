import type { FastifyInstance, FastifyRequest } from 'fastify'
import PDFDocument from 'pdfkit'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  hitungPenawaran, periksaKirimPenawaran, terbilangRupiah,
  STATUS_PENAWARAN_SAH, type BarisPenawaran, type StatusPenawaran,
} from '../../lib/penawaran.js'

/**
 * DOKUMEN PENAWARAN (crm-proposal · migrasi 407).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DITUTUP MODUL INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `bids` menyimpan ANGKA penawaran, bukan dokumennya. Suratnya karena itu
 * disusun di luar aplikasi, dan yang dikirim ke owner berbeda dari yang
 * tercatat di sini — selisihnya baru ketahuan sebagai margin yang hilang saat
 * RAB-nya disusun dari angka yang tak pernah dibandingkan.
 *
 * ── Nilai DITURUNKAN, tidak disimpan
 *
 * Tak ada kolom total di basis. Tiap balasan menghitung ulang dari barisnya
 * lewat `lib/penawaran.ts` (24 test). Menyimpannya berarti dua sumber untuk
 * satu nilai, dan yang menyimpang pertama selalu yang tersimpan: satu baris
 * disunting, totalnya tidak.
 *
 * ── Terbilang lahir dari angka yang SAMA yang dicetak
 *
 * Surat penawaran menuliskan nilainya dua kali — angka dan kata — dan dalam
 * praktik komersial YANG TERTULIS HURUF yang dipegang saat keduanya berbeda.
 * Karena itu terbilangnya tak pernah diterima dari klien.
 */

const PENAWARAN_SELECT = `
  id, bid_id, nomor, perihal, kepada, kepada_alamat, tanggal, berlaku_sampai,
  diskon, ppn_persen, syarat, catatan, status, dikirim_pada, created_at
`

const ITEM_SELECT = 'id, urutan, uraian, satuan, volume, harga_satuan, catatan'

export default async function penawaranRoutes(app: FastifyInstance) {
  // ── GET /api/v1/penawaran ────────────────────────────────────────────────
  app.get<{ Querystring: { bid_id?: string; status?: string } }>(
    '/api/v1/penawaran',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:view')] },
    async (request, reply) => {
      const db = request.db!
      let q = db
        .from('penawaran')
        .select(PENAWARAN_SELECT)
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300)

      if (request.query.bid_id) q = q.eq('bid_id', request.query.bid_id)
      if (request.query.status) q = q.eq('status', request.query.status)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error }, 'gagal memuat penawaran')
        return reply.status(500).send({ error: 'Gagal memuat daftar penawaran' })
      }

      const baris = (data ?? []) as Array<Record<string, unknown>>
      if (baris.length === 0) return reply.send({ data: [] })

      // Item seluruh penawaran dibaca SEKALI, bukan per baris. N+1 di sini
      // berarti tiga ratus query untuk satu daftar.
      const { data: item, error: eItem } = await db
        .unsafe('penawaran_item', 'kategori C; disaring .in(penawaran_id, id milik tenant ini)')
        .select('penawaran_id, uraian, satuan, volume, harga_satuan')
        .in('penawaran_id', baris.map((p) => p.id as string))
      if (eItem) {
        request.log.error({ err: eItem }, 'gagal memuat item penawaran')
        return reply.status(500).send({ error: 'Gagal memuat rincian penawaran' })
      }

      const perInduk = new Map<string, BarisPenawaran[]>()
      for (const it of (item ?? []) as Array<Record<string, unknown>>) {
        const k = it.penawaran_id as string
        perInduk.set(k, [...(perInduk.get(k) ?? []), it as unknown as BarisPenawaran])
      }

      return reply.send({
        data: baris.map((p) => ({
          ...p,
          jumlah_baris: (perInduk.get(p.id as string) ?? []).length,
          hitung: hitungPenawaran({
            baris: perInduk.get(p.id as string) ?? [],
            diskon: p.diskon as number,
            ppn_persen: p.ppn_persen as number,
          }),
        })),
      })
    },
  )

  // ── GET /api/v1/penawaran/:id ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/penawaran/:id',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:view')] },
    async (request, reply) => {
      const hasil = await ambil(request, request.params.id)
      if (!hasil) return reply.status(404).send({ error: 'Penawaran tidak ditemukan' })
      return reply.send(hasil)
    },
  )

  // ── POST /api/v1/penawaran ───────────────────────────────────────────────
  app.post(
    '/api/v1/penawaran',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as {
        bid_id?: string | null; nomor?: string; perihal?: string
        kepada?: string; kepada_alamat?: string
        tanggal?: string; berlaku_sampai?: string | null
        diskon?: number; ppn_persen?: number
        syarat?: string; catatan?: string
      }

      if (!b.nomor?.trim()) {
        return reply.status(400).send({ error: 'Nomor surat wajib diisi' })
      }
      if (!b.perihal?.trim()) {
        return reply.status(400).send({ error: 'Perihal wajib diisi' })
      }

      const { data, error } = await request.db!
        .from('penawaran')
        .insert({
          bid_id: b.bid_id || null,
          nomor: b.nomor.trim(),
          perihal: b.perihal.trim(),
          kepada: b.kepada?.trim() || null,
          kepada_alamat: b.kepada_alamat?.trim() || null,
          tanggal: b.tanggal || new Date().toISOString().slice(0, 10),
          berlaku_sampai: b.berlaku_sampai || null,
          diskon: b.diskon ?? 0,
          ppn_persen: b.ppn_persen ?? 0,
          syarat: b.syarat?.trim() || null,
          catatan: b.catatan?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select(PENAWARAN_SELECT)
        .single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({
            error: `Nomor surat "${b.nomor.trim()}" sudah dipakai penawaran lain. `
              + 'Dua surat bernomor sama membuat korespondensi berikutnya menunjuk '
              + 'dokumen yang ambigu.',
          })
        }
        if (error.code === '23514') {
          return reply.status(400).send({
            error: 'Masa berlaku tak boleh berakhir sebelum tanggal suratnya sendiri.',
          })
        }
        request.log.error({ err: error }, 'gagal membuat penawaran')
        return reply.status(500).send({ error: error.message })
      }

      return reply.status(201).send({ data })
    },
  )

  // ── PATCH /api/v1/penawaran/:id ──────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/penawaran/:id',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const db = request.db!

      const { data: lama } = await db
        .from('penawaran').select('id, status').eq('id', request.params.id).maybeSingle()
      if (!lama) return reply.status(404).send({ error: 'Penawaran tidak ditemukan' })

      const boleh = ['bid_id', 'nomor', 'perihal', 'kepada', 'kepada_alamat',
        'tanggal', 'berlaku_sampai', 'diskon', 'ppn_persen', 'syarat', 'catatan']
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of boleh) if (k in b) patch[k] = b[k]

      const { data, error } = await db
        .from('penawaran').update(patch).eq('id', request.params.id)
        .select(PENAWARAN_SELECT).maybeSingle()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: 'Nomor surat itu sudah dipakai penawaran lain.' })
        }
        if (error.code === '23514') {
          return reply.status(400).send({
            error: 'Masa berlaku tak boleh berakhir sebelum tanggal suratnya sendiri.',
          })
        }
        return reply.status(500).send({ error: error.message })
      }
      // NOL baris di sini TIDAK sah: barisnya baru saja terbaca di atas.
      if (!data) {
        return reply.status(409).send({
          error: 'Penawaran berubah dari tempat lain sebelum perubahan tersimpan. Muat ulang.',
        })
      }

      return reply.send({ data })
    },
  )

  // ── PUT /api/v1/penawaran/:id/item — ganti SELURUH rincian ───────────────
  //
  // Ganti-seluruhnya, bukan CRUD per baris. Rincian penawaran disunting
  // sebagai satu tabel di layar (tambah baris, hapus baris, geser urutan),
  // dan menyimpannya per-baris berarti belasan permintaan yang bisa gagal
  // separuh jalan — meninggalkan rincian yang tak pernah dilihat siapa pun
  // dalam bentuk itu.
  app.put<{ Params: { id: string } }>(
    '/api/v1/penawaran/:id/item',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:edit')] },
    async (request, reply) => {
      const db = request.db!
      const { item } = request.body as { item?: BarisPenawaran[] }

      if (!Array.isArray(item)) {
        return reply.status(400).send({ error: 'Field `item` wajib berupa array' })
      }

      const { data: induk } = await db
        .from('penawaran').select('id, status').eq('id', request.params.id).maybeSingle()
      if (!induk) return reply.status(404).send({ error: 'Penawaran tidak ditemukan' })

      // Yang sudah TERKIRIM tak boleh diubah rinciannya.
      //
      // Suratnya sudah di tangan calon pemberi kerja; mengubah rincian di sini
      // membuat arsip kita berbeda dari yang mereka pegang — dan yang
      // dipegang mereka yang mengikat.
      if (induk.status !== 'draft') {
        return reply.status(409).send({
          error: `Penawaran berstatus "${induk.status}" tak bisa diubah rinciannya. `
            + 'Suratnya sudah di tangan penerima — buat penawaran revisi bernomor '
            + 'baru supaya keduanya bisa dibandingkan.',
        })
      }

      const { error: eHapus } = await db
        .unsafe('penawaran_item', 'kategori C; induknya terbukti milik tenant ini di query di atas')
        .delete().eq('penawaran_id', request.params.id)
      if (eHapus) return reply.status(500).send({ error: eHapus.message })

      const bersih = item
        .filter((it) => String(it.uraian ?? '').trim())
        .map((it, i) => ({
          penawaran_id: request.params.id,
          urutan: i + 1,
          uraian: String(it.uraian).trim(),
          satuan: it.satuan?.toString().trim() || null,
          // Kosong dikirim `null`, bukan 0. Baris JUDUL memang tak bervolume;
          // nol berarti volume nol yang sesungguhnya, dan keduanya tercetak
          // berbeda di surat.
          volume: it.volume === '' || it.volume === null || it.volume === undefined
            ? null : Number(it.volume),
          harga_satuan: it.harga_satuan === '' || it.harga_satuan === null
            || it.harga_satuan === undefined ? null : Number(it.harga_satuan),
        }))

      if (bersih.length > 0) {
        const { error: eIsi } = await db
          .unsafe('penawaran_item', 'kategori C; induknya terbukti milik tenant ini di query di atas')
          .insert(bersih)
        if (eIsi) {
          request.log.error({ err: eIsi }, 'gagal menulis rincian penawaran')
          return reply.status(400).send({
            error: `Rincian ditolak: ${eIsi.message}. Rincian lama sudah terhapus — `
              + 'periksa isiannya lalu simpan ulang.',
          })
        }
      }

      const hasil = await ambil(request, request.params.id)
      return reply.send(hasil)
    },
  )

  // ── PATCH /api/v1/penawaran/:id/status ───────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/penawaran/:id/status',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:edit')] },
    async (request, reply) => {
      const db = request.db!
      const { status } = request.body as { status?: string }

      if (!status || !STATUS_PENAWARAN_SAH.includes(status as StatusPenawaran)) {
        return reply.status(400).send({
          error: `status wajib salah satu: ${STATUS_PENAWARAN_SAH.join(', ')}`,
        })
      }

      const hasil = await ambil(request, request.params.id)
      if (!hasil) return reply.status(404).send({ error: 'Penawaran tidak ditemukan' })

      // Menjadi TERKIRIM adalah satu-satunya perpindahan yang diperiksa
      // kelengkapan dokumennya. Sesudah itu ia sudah di tangan orang; menahan
      // "menang"/"kalah" karena dokumennya kurang hanya membuat hasil yang
      // sudah terjadi tak bisa dicatat.
      if (status === 'terkirim') {
        const v = periksaKirimPenawaran({
          nomor: hasil.data.nomor as string,
          tanggal: hasil.data.tanggal as string,
          berlaku_sampai: hasil.data.berlaku_sampai as string | null,
          baris: hasil.item as unknown as BarisPenawaran[],
        })
        if (!v.ok) return reply.status(422).send({ error: v.galat })
      }

      const patch: Record<string, unknown> = {
        status, updated_at: new Date().toISOString(),
      }
      // `dikirim_pada` diisi SEKALI, saat pertama terkirim. Menimpanya tiap
      // perpindahan status membuat "berapa lama menggantung" dihitung dari
      // saat menang, bukan saat dikirim.
      if (status !== 'draft' && status !== 'batal' && !hasil.data.dikirim_pada) {
        patch.dikirim_pada = new Date().toISOString()
      }

      const { data, error } = await db
        .from('penawaran').update(patch).eq('id', request.params.id)
        .select(PENAWARAN_SELECT).maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!data) {
        return reply.status(409).send({
          error: 'Penawaran berubah dari tempat lain. Muat ulang.',
        })
      }

      void logAuditEvent(request, {
        tableName: 'penawaran', recordId: request.params.id, action: 'penawaran.status',
        actorId: request.currentUser!.id,
        oldValues: { status: hasil.data.status },
        newValues: { status },
      })

      return reply.send({ data })
    },
  )

  // ── GET /api/v1/penawaran/:id/pdf ────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/penawaran/:id/pdf',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:view')] },
    async (request, reply) => {
      const hasil = await ambil(request, request.params.id)
      if (!hasil) return reply.status(404).send({ error: 'Penawaran tidak ditemukan' })

      // Identitas penerbit. Kegagalan memuatnya TIDAK menghentikan pencetakan
      // — dokumen yang tak bisa terbit jauh lebih merugikan daripada dokumen
      // berkop tipis. Alasan yang sama tertulis di `contracts.ts`.
      const { data: perusahaan } = await request.db!
        .unsafe('companies', 'identitas penerbit dokumen; disaring eq(id, companyId)')
        .select('name, legal_name, address, city, phone, email, npwp')
        .eq('id', request.companyId!)
        .maybeSingle()

      const pdf = await susunPdfPenawaran(hasil, perusahaan as Record<string, unknown> | null)

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition',
          `inline; filename="Penawaran_${String(hasil.data.nomor).replace(/[^a-zA-Z0-9]+/g, '_')}.pdf"`)
        .send(pdf)
    },
  )

  // ── DELETE /api/v1/penawaran/:id ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/penawaran/:id',
    { preHandler: [authenticate, requireModul('modul.crm'), requirePermission('projects:edit')] },
    async (request, reply) => {
      const db = request.db!
      const { data: ada } = await db
        .from('penawaran').select('id, status, nomor').eq('id', request.params.id).maybeSingle()
      if (!ada) return reply.status(404).send({ error: 'Penawaran tidak ditemukan' })

      // Yang sudah DIKIRIM tak boleh dihapus — suratnya ada di tangan orang
      // lain, dan arsip yang tak memuatnya membuat kita tak bisa membuktikan
      // apa yang pernah kita tawarkan.
      if (ada.status !== 'draft') {
        return reply.status(409).send({
          error: `Penawaran berstatus "${ada.status}" tak bisa dihapus — suratnya `
            + 'sudah di tangan penerima. Pakai status "batal" bila perlu.',
        })
      }

      const { error } = await db.from('penawaran').delete().eq('id', request.params.id)
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ ok: true })
    },
  )
}

// ─── Pembantu ────────────────────────────────────────────────────────────────

interface HasilPenawaran {
  data: Record<string, unknown>
  item: Array<Record<string, unknown>>
  hitung: ReturnType<typeof hitungPenawaran>
}

async function ambil(
  request: FastifyRequest,
  id: string,
): Promise<HasilPenawaran | null> {
  const db = request.db!
  const { data, error } = await db
    .from('penawaran').select(PENAWARAN_SELECT).eq('id', id).maybeSingle()
  if (error || !data) return null

  const { data: item } = await db
    .unsafe('penawaran_item', 'kategori C; induknya terbukti milik tenant ini di query di atas')
    .select(ITEM_SELECT)
    .eq('penawaran_id', id)
    .order('urutan', { ascending: true })

  const baris = (item ?? []) as Array<Record<string, unknown>>
  return {
    data: data as Record<string, unknown>,
    item: baris,
    hitung: hitungPenawaran({
      baris: baris as unknown as BarisPenawaran[],
      diskon: (data as { diskon?: number }).diskon,
      ppn_persen: (data as { ppn_persen?: number }).ppn_persen,
    }),
  }
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))

const tglPanjang = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(`${String(s).slice(0, 10)}T12:00:00`)
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Susun PDF surat penawaran.
 *
 * ── Kenapa terbilang dicetak, dan dicetak MIRING
 *
 * Dua kali menulis nilai — angka dan kata — adalah bentuk baku surat
 * penawaran di Indonesia, dan saat keduanya berbeda yang tertulis huruf yang
 * dipegang. Hurufnya dicetak miring supaya terbaca sebagai penegasan nilai di
 * atasnya, bukan sebagai baris tabel lain.
 */
async function susunPdfPenawaran(
  h: HasilPenawaran,
  perusahaan: Record<string, unknown> | null,
): Promise<Buffer> {
  const M = 55
  const W = 595.28 - M * 2
  const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  let y = M
  const d = h.data

  // ── Kop ──────────────────────────────────────────────────────────────────
  const nama = String(perusahaan?.legal_name || perusahaan?.name || 'Perusahaan')
  doc.font('Helvetica-Bold').fontSize(13).text(nama.toUpperCase(), M, y, { width: W, align: 'center' })
  y = doc.y + 1

  const kopBaris = [
    [perusahaan?.address, perusahaan?.city].filter(Boolean).join(', '),
    [perusahaan?.phone && `Telp. ${perusahaan.phone}`, perusahaan?.email].filter(Boolean).join(' · '),
    perusahaan?.npwp && `NPWP ${perusahaan.npwp}`,
  ].filter((x) => x && String(x).trim()) as string[]

  for (const b of kopBaris) {
    doc.font('Helvetica').fontSize(8.5).text(b, M, y, { width: W, align: 'center' })
    y = doc.y + 1
  }
  y += 5
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1.2).stroke()
  y += 16

  // ── Nomor & tanggal ──────────────────────────────────────────────────────
  doc.font('Helvetica').fontSize(10)
  doc.text(`Nomor    : ${d.nomor}`, M, y, { width: W * 0.6 })
  doc.text(`${perusahaan?.city ?? ''}${perusahaan?.city ? ', ' : ''}${tglPanjang(d.tanggal as string)}`,
    M + W * 0.6, y, { width: W * 0.4, align: 'right' })
  y = doc.y + 2
  doc.text(`Perihal  : ${d.perihal}`, M, y, { width: W })
  y = doc.y + 14

  if (d.kepada) {
    doc.font('Helvetica').fontSize(10).text('Kepada Yth.', M, y, { width: W })
    y = doc.y
    doc.font('Helvetica-Bold').fontSize(10).text(String(d.kepada), M, y, { width: W })
    y = doc.y
    if (d.kepada_alamat) {
      doc.font('Helvetica').fontSize(9.5).text(String(d.kepada_alamat), M, y, { width: W * 0.6 })
      y = doc.y
    }
    y += 12
  }

  doc.font('Helvetica').fontSize(10).text(
    'Bersama ini kami sampaikan penawaran harga untuk pekerjaan sebagaimana '
    + 'terurai di bawah ini:', M, y, { width: W, align: 'justify', lineGap: 2 })
  y = doc.y + 10

  // ── Tabel rincian ────────────────────────────────────────────────────────
  const kol = [26, W - 26 - 46 - 62 - 88 - 96, 46, 62, 88, 96]
  const judul = ['No', 'Uraian Pekerjaan', 'Sat', 'Volume', 'Harga Sat.', 'Jumlah']
  const rowH = 17
  const bawah = doc.page.height - M - 40

  const gambarKepala = () => {
    let x = M
    doc.font('Helvetica-Bold').fontSize(8.5)
    judul.forEach((t, i) => {
      doc.rect(x, y, kol[i], rowH).stroke()
      doc.text(t, x + 2, y + 5, { width: kol[i] - 4, align: 'center' })
      x += kol[i]
    })
    y += rowH
  }
  gambarKepala()

  doc.font('Helvetica').fontSize(8.5)
  h.item.forEach((it, i) => {
    const vol = it.volume === null || it.volume === undefined ? null : Number(it.volume)
    const harga = it.harga_satuan === null || it.harga_satuan === undefined
      ? null : Number(it.harga_satuan)
    // Baris JUDUL — tanpa volume & harga — dicetak tebal tanpa angka. Mengisi
    // "0" di kolom jumlahnya membuat pembaca menjumlahkannya sebagai
    // pekerjaan gratis.
    const judulBaris = vol === null && harga === null
    const jumlah = judulBaris ? '' : rp((vol ?? 0) * (harga ?? 0))

    const sel = [
      judulBaris ? '' : String(i + 1),
      String(it.uraian ?? ''),
      judulBaris ? '' : String(it.satuan ?? ''),
      vol === null ? '' : new Intl.NumberFormat('id-ID').format(vol),
      harga === null ? '' : rp(harga),
      jumlah,
    ]

    let tinggi = rowH
    sel.forEach((c, k) => {
      const t = doc.heightOfString(c, { width: kol[k] - 4 })
      if (t + 8 > tinggi) tinggi = t + 8
    })

    if (y + tinggi > bawah) {
      doc.addPage(); y = M; gambarKepala()
      doc.font('Helvetica').fontSize(8.5)
    }

    let x = M
    sel.forEach((c, k) => {
      doc.rect(x, y, kol[k], tinggi).stroke()
      doc.font(judulBaris ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
        .text(c, x + 2, y + 4, {
          width: kol[k] - 4,
          align: k === 0 ? 'center' : k >= 3 ? 'right' : 'left',
        })
      x += kol[k]
    })
    y += tinggi
  })

  // ── Rekapitulasi ─────────────────────────────────────────────────────────
  const lebarLabel = kol.slice(0, 5).reduce((a, b) => a + b, 0)
  const rekap: Array<[string, number, boolean]> = [
    ['Jumlah', h.hitung.subtotal, false],
  ]
  if (h.hitung.diskon > 0) rekap.push(['Diskon', -h.hitung.diskon, false])
  if (h.hitung.ppn > 0) {
    rekap.push(['Dasar Pengenaan Pajak', h.hitung.dpp, false])
    rekap.push([`PPN ${Number(d.ppn_persen)}%`, h.hitung.ppn, false])
  }
  rekap.push(['TOTAL PENAWARAN', h.hitung.total, true])

  for (const [label, nilai, tebal] of rekap) {
    if (y + rowH > bawah) { doc.addPage(); y = M }
    doc.rect(M, y, lebarLabel, rowH).stroke()
    doc.rect(M + lebarLabel, y, kol[5], rowH).stroke()
    doc.font(tebal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
      .text(label, M + 2, y + 5, { width: lebarLabel - 6, align: 'right' })
    doc.font(tebal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
      .text(rp(nilai), M + lebarLabel + 2, y + 5, { width: kol[5] - 4, align: 'right' })
    y += rowH
  }

  y += 8
  // Terbilang dihitung ULANG di sini dari total yang sama yang dicetak di
  // atas — bukan diterima dari luar. Yang tertulis huruf yang mengikat.
  doc.font('Helvetica-Oblique').fontSize(9.5)
    .text(`Terbilang: ${terbilangRupiah(h.hitung.total)}`, M, y, { width: W })
  y = doc.y + 14

  if (d.berlaku_sampai) {
    doc.font('Helvetica').fontSize(9.5).text(
      `Penawaran ini berlaku sampai dengan ${tglPanjang(d.berlaku_sampai as string)}.`,
      M, y, { width: W })
    y = doc.y + 8
  }

  if (d.syarat) {
    doc.font('Helvetica-Bold').fontSize(9.5).text('Syarat & Ketentuan', M, y, { width: W })
    y = doc.y + 2
    doc.font('Helvetica').fontSize(9).text(String(d.syarat), M, y, {
      width: W, align: 'justify', lineGap: 1.5,
    })
    y = doc.y + 10
  }

  // ── Tanda tangan ─────────────────────────────────────────────────────────
  if (y + 90 > doc.page.height - M) { doc.addPage(); y = M }
  y += 10
  doc.font('Helvetica').fontSize(10)
    .text('Hormat kami,', M + W * 0.6, y, { width: W * 0.4, align: 'center' })
  y = doc.y + 52
  doc.font('Helvetica-Bold').fontSize(10)
    .text(nama, M + W * 0.6, y, { width: W * 0.4, align: 'center' })

  doc.end()

  // `doc.end()` TIDAK menuntaskan aliran secara sinkron: peristiwa `data`
  // masih menyusul sesudahnya. Menyusun buffer tanpa menunggu `end`
  // menghasilkan berkas KOSONG yang tetap terkirim sebagai 200 ber-Content-
  // Type PDF — peramban menampilkannya sebagai berkas rusak, dan tak ada
  // galat di mana pun. Ujinya menangkap ini; polanya disalin dari
  // `contracts.ts:626`.
  await new Promise<void>((resolve) => doc.on('end', resolve))
  return Buffer.concat(chunks)
}

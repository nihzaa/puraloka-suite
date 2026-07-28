import type { FastifyInstance } from 'fastify'
import PDFDocument from 'pdfkit'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { terbilang, terbilangHari } from '../../utils/terbilang.js'

// ─── Date helpers ─────────────────────────────────────────────────────────────

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]
const ANGKA_KATA = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
  'sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas',
  'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas', 'dua puluh',
  'dua puluh satu', 'dua puluh dua', 'dua puluh tiga', 'dua puluh empat',
  'dua puluh lima', 'dua puluh enam', 'dua puluh tujuh', 'dua puluh delapan',
  'dua puluh sembilan', 'tiga puluh', 'tiga puluh satu',
]

function angkaKeTanggalKata(n: number): string {
  return ANGKA_KATA[n] ?? String(n)
}

function tahunKata(y: number): string {
  const ribuan = Math.floor(y / 1000)
  const ratusan = Math.floor((y % 1000) / 100)
  const puluhan = Math.floor((y % 100) / 10)
  const satuan = y % 10
  const SATUAN_W = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan']
  const PULUHAN_W = ['', '', 'dua puluh', 'tiga puluh', 'empat puluh', 'lima puluh',
    'enam puluh', 'tujuh puluh', 'delapan puluh', 'sembilan puluh']
  let hasil = ''
  if (ribuan > 0) hasil += `${SATUAN_W[ribuan]} ribu `
  if (ratusan > 0) hasil += `${SATUAN_W[ratusan] === 'satu' ? 'seratus' : SATUAN_W[ratusan] + ' ratus'} `
  if (puluhan >= 2) {
    hasil += PULUHAN_W[puluhan]
    if (satuan > 0) hasil += ` ${SATUAN_W[satuan]}`
  } else if (puluhan === 1) {
    const belas = 10 + satuan
    if (belas === 11) hasil += 'sebelas'
    else if (belas === 10) hasil += 'sepuluh'
    else hasil += `${SATUAN_W[satuan]} belas`
  } else if (satuan > 0) {
    hasil += SATUAN_W[satuan]
  }
  return hasil.trim()
}

function tanggalPanjang(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const hari = HARI[d.getDay()]
  const tgl = angkaKeTanggalKata(d.getDate())
  const bln = BULAN_PANJANG[d.getMonth()].toLowerCase()
  const thn = tahunKata(d.getFullYear())
  return `${hari}, tanggal ${tgl} bulan ${bln} tahun ${thn}`
}

function fmtRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(n))
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// ─── PDF helpers ──────────────────────────────────────────────────────────────

const MARGIN = 65
const PAGE_W = 595.28  // A4
const CONTENT_W = PAGE_W - MARGIN * 2

interface DocContext {
  doc: PDFKit.PDFDocument
  y: number
  margin: number
}

function ensureSpace(ctx: DocContext, needed: number) {
  const pageBottom = ctx.doc.page.height - MARGIN
  if (ctx.y + needed > pageBottom) {
    ctx.doc.addPage()
    ctx.y = MARGIN
  }
}

function paragraph(ctx: DocContext, text: string, opts: {
  fontSize?: number; bold?: boolean; indent?: number; align?: 'left' | 'center' | 'justify'; lineGap?: number
} = {}) {
  const { fontSize = 10, bold = false, indent = 0, align = 'justify', lineGap = 2 } = opts
  ensureSpace(ctx, fontSize * 3)
  ctx.doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(fontSize)
    .text(text, MARGIN + indent, ctx.y, {
      width: CONTENT_W - indent,
      align,
      lineGap,
    })
  ctx.y = ctx.doc.y + 6
}

function gap(ctx: DocContext, h = 8) {
  ctx.y += h
}

function pasal(ctx: DocContext, num: string, title: string) {
  gap(ctx, 10)
  ensureSpace(ctx, 30)
  ctx.doc.font('Helvetica-Bold').fontSize(10)
    .text(`PASAL ${num}`, MARGIN, ctx.y, { width: CONTENT_W, align: 'center' })
  ctx.y = ctx.doc.y + 2
  ctx.doc.font('Helvetica-Bold').fontSize(10)
    .text(title, MARGIN, ctx.y, { width: CONTENT_W, align: 'center' })
  ctx.y = ctx.doc.y + 8
}

function drawTable(
  ctx: DocContext,
  headers: string[],
  rows: string[][],
  colWidths: number[],
) {
  const rowH = 18
  const tableW = colWidths.reduce((a, b) => a + b, 0)
  const pageBottom = ctx.doc.page.height - MARGIN

  // Header row
  ensureSpace(ctx, rowH + 4)
  let x = MARGIN
  ctx.doc.font('Helvetica-Bold').fontSize(8.5)
  headers.forEach((h, i) => {
    ctx.doc.rect(x, ctx.y, colWidths[i], rowH).stroke()
    ctx.doc.text(h, x + 3, ctx.y + 4, { width: colWidths[i] - 6, align: 'center' })
    x += colWidths[i]
  })
  ctx.y += rowH

  ctx.doc.font('Helvetica').fontSize(8.5)
  rows.forEach(row => {
    // Compute row height by checking text height per cell
    let maxH = rowH
    row.forEach((cell, i) => {
      const h = ctx.doc.heightOfString(cell, { width: colWidths[i] - 6 })
      if (h + 8 > maxH) maxH = h + 8
    })
    maxH = Math.max(maxH, rowH)

    if (ctx.y + maxH > pageBottom) {
      ctx.doc.addPage()
      ctx.y = MARGIN
    }

    x = MARGIN
    row.forEach((cell, i) => {
      ctx.doc.rect(x, ctx.y, colWidths[i], maxH).stroke()
      ctx.doc.text(cell, x + 3, ctx.y + 4, { width: colWidths[i] - 6, align: i === 0 ? 'center' : 'left' })
      x += colWidths[i]
    })
    ctx.y += maxH
  })

  return ctx.y
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TerminRow {
  id: string
  termin_number: number
  label: string
  amount: number
  pct_of_contract: number
  trigger_type: string | null
  trigger_pct: number | null
  due_days: number | null
}

interface RabCategory {
  id: string
  name: string
  sort_order: number
}

interface ProjectData {
  id: string
  name: string
  location: string
  contract_value: number
  clients: {
    contact_person: string
    phone: string
    email: string | null
    address: string | null
    nik?: string | null
  } | null
  termin_schedules: TerminRow[]
}

// ─── Route ────────────────────────────────────────────────────────────────────

export default async function contractRoutes(app: FastifyInstance) {

  app.get<{
    Params: { projectId: string }
    Querystring: {
      contract_date?: string
      duration_days?: string
      pelaksana_nama?: string
      pelaksana_nik?: string
      pelaksana_alamat?: string
      pelaksana_telepon?: string
      rekening_bank?: string
      rekening_nomor?: string
      saksi_1?: string
      saksi_2?: string
    }
  }>(
    '/api/v1/projects/:projectId/contracts/generate',
    { preHandler: [authenticate, requirePermission('projects:contract')] },
    async (request, reply) => {
      const { projectId } = request.params
      const q = request.query

      const contractDate = q.contract_date ?? new Date().toISOString().split('T')[0]
      const durationDays = parseInt(q.duration_days ?? '120', 10)
      const pelaksanaNama = q.pelaksana_nama ?? ''
      const pelaksanaNik = q.pelaksana_nik ?? ''
      const pelaksanaAlamat = q.pelaksana_alamat ?? ''
      const pelaksanaTelepon = q.pelaksana_telepon ?? ''
      const rekeningBank = q.rekening_bank ?? ''
      const rekeningNomor = q.rekening_nomor ?? ''
      const saksi1 = q.saksi_1 ?? ''
      const saksi2 = q.saksi_2 ?? ''

      // ── Fetch data ─────────────────────────────────────────────────────────

      const [projRes, rabRes] = await Promise.all([
        request.db!
          .from('projects')
          .select(`
            id, name, location, contract_value,
            clients ( contact_person, phone, email, address ),
            termin_schedules (
              id, termin_number, label, amount, pct_of_contract,
              trigger_type, trigger_pct, due_days
            )
          `)
          .eq('id', projectId)
          .single(),
        supabase
          .from('rab_items')
          .select('id, name, sort_order')
          .eq('project_id', projectId)
          .eq('level', 'category')
          .order('sort_order', { ascending: true }),
      ])

      if (projRes.error || !projRes.data) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const proj = projRes.data as unknown as ProjectData
      const rabCategories: RabCategory[] = rabRes.data ?? []

      const client = proj.clients
      const termins: TerminRow[] = ((proj.termin_schedules ?? []) as TerminRow[])
        .sort((a, b) => a.termin_number - b.termin_number)

      const contractValue = Number(proj.contract_value)

      // Masa pemeliharaan dari on_retention due_days, fallback 90
      const retentionTermin = termins.find(t => t.trigger_type === 'on_retention')
      const masaPemeliharaan = retentionTermin?.due_days ?? 90

      // Kota dari alamat klien (ambil token terakhir setelah koma)
      const clientAddress = client?.address ?? ''
      const kotaParts = clientAddress.split(',').map(s => s.trim())
      const kota = kotaParts.length > 1 ? kotaParts[kotaParts.length - 1] : 'Bandung'

      const dateObj = new Date(contractDate + 'T12:00:00')
      const tglFooter = `${kota}, ${dateObj.getDate()} ${BULAN_PANJANG[dateObj.getMonth()]} ${dateObj.getFullYear()}`

      // ── Build PDF ──────────────────────────────────────────────────────────

      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true })
      const ctx: DocContext = { doc, y: MARGIN, margin: MARGIN }

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))

      // Header
      ctx.doc.font('Helvetica-Bold').fontSize(13)
        .text(`KONTRAK PEKERJAAN ${proj.name.toUpperCase()}`, MARGIN, ctx.y, {
          width: CONTENT_W, align: 'center',
        })
      ctx.y = ctx.doc.y + 4

      ctx.doc.font('Helvetica').fontSize(10)
        .text('_________________________________________________________________', MARGIN, ctx.y, {
          width: CONTENT_W, align: 'center',
        })
      ctx.y = ctx.doc.y + 14

      // Pembuka
      paragraph(ctx, `Pada Hari ini ${tanggalPanjang(contractDate)}, yang bertandatangan di bawah ini :`)
      gap(ctx, 6)

      // PIHAK PERTAMA
      const labelW = 70
      const colW = CONTENT_W - labelW

      function pihakRow(label: string, value: string, indent = 0) {
        ensureSpace(ctx, 18)
        ctx.doc.font('Helvetica-Bold').fontSize(10)
          .text(label, MARGIN + indent, ctx.y, { width: labelW, continued: true })
        ctx.doc.font('Helvetica').fontSize(10)
          .text(`: ${value}`, { width: colW })
        ctx.y = ctx.doc.y + 2
      }

      pihakRow('Nama', client?.contact_person ?? '—')
      if (client && (client as Record<string, unknown>).nik) {
        pihakRow('NIK', String((client as Record<string, unknown>).nik))
      }
      pihakRow('Alamat', clientAddress || '—')
      pihakRow('Telepon', client?.phone ?? '—')

      gap(ctx, 6)
      paragraph(ctx,
        'Dalam hal ini bertindak atas nama Pemilik dan selanjutnya disebut sebagai PIHAK PERTAMA',
        { align: 'left' })
      gap(ctx, 4)
      paragraph(ctx, 'dan,', { align: 'left' })
      gap(ctx, 4)

      // PIHAK KEDUA
      pihakRow('Nama', pelaksanaNama || '—')
      if (pelaksanaNik) pihakRow('NIK', pelaksanaNik)
      pihakRow('Alamat', pelaksanaAlamat || '—')
      pihakRow('Telepon', pelaksanaTelepon || '—')
      gap(ctx, 6)
      paragraph(ctx,
        'Dalam hal ini bertindak atas nama Pelaksana Pekerjaan dan selanjutnya disebut sebagai PIHAK KEDUA',
        { align: 'left' })

      gap(ctx, 10)
      paragraph(ctx,
        `Kedua belah pihak sepakat untuk mengikatkan diri dalam Kontrak Pekerjaan ${proj.name} yang terletak di ${proj.location}, dengan ketentuan dan syarat-syarat sebagai berikut:`)

      // ── PASAL 1 ──────────────────────────────────────────────────────────
      pasal(ctx, '1', 'MAKSUD DAN TUJUAN')
      paragraph(ctx,
        'Kontrak ini bermaksud untuk mengatur pelaksanaan pekerjaan pembangunan/renovasi oleh PIHAK KEDUA sesuai dengan gambar rencana, spesifikasi teknis, dan Rencana Anggaran Biaya (RAB) yang telah disetujui oleh PIHAK PERTAMA.')

      // ── PASAL 2 ──────────────────────────────────────────────────────────
      pasal(ctx, '2', 'LINGKUP PEKERJAAN')
      paragraph(ctx,
        'PIHAK KEDUA bertanggung jawab untuk melaksanakan seluruh pekerjaan yang meliputi:')
      gap(ctx, 4)

      const lingkupItems = rabCategories.length > 0
        ? rabCategories.map(r => r.name)
        : ['Seluruh pekerjaan konstruksi sesuai gambar rencana dan spesifikasi teknis']
      lingkupItems.push('Pekerjaan pembersihan area proyek setelah pelaksanaan pekerjaan selesai.')

      lingkupItems.forEach((item, i) => {
        ensureSpace(ctx, 18)
        ctx.doc.font('Helvetica').fontSize(10)
          .text(`${i + 1}.  ${item}`, MARGIN + 16, ctx.y, { width: CONTENT_W - 16, align: 'left' })
        ctx.y = ctx.doc.y + 3
      })

      gap(ctx, 6)
      paragraph(ctx,
        'PIHAK KEDUA bertanggung jawab sepenuhnya atas pelaksanaan seluruh lingkup pekerjaan di atas sesuai standar kualitas yang disepakati.')

      // ── PASAL 3 ──────────────────────────────────────────────────────────
      pasal(ctx, '3', 'NILAI KONTRAK DAN RAB')
      paragraph(ctx, `Nilai total pekerjaan ${proj.name} adalah sebesar:`)
      gap(ctx, 4)
      paragraph(ctx, `Rp ${fmtRupiah(contractValue)},-`, { bold: true, align: 'center' })
      paragraph(ctx, `(${terbilang(contractValue)}).`, { align: 'center' })
      gap(ctx, 6)
      paragraph(ctx,
        'Nilai tersebut mencakup seluruh pekerjaan sipil dan konstruksi sesuai gambar rencana dan spesifikasi teknis, namun tidak termasuk:')
      gap(ctx, 4)
      const pengecualian = [
        'Pajak-pajak yang timbul akibat pelaksanaan pembangunan.',
        'Biaya pengurusan izin mendirikan bangunan (IMB) atau perizinan lain.',
        'Biaya force majeure dan pekerjaan tambahan yang disepakati kemudian.',
      ]
      pengecualian.forEach((item, i) => {
        ensureSpace(ctx, 18)
        ctx.doc.font('Helvetica').fontSize(10)
          .text(`${i + 1}.  ${item}`, MARGIN + 16, ctx.y, { width: CONTENT_W - 16, align: 'left' })
        ctx.y = ctx.doc.y + 3
      })

      // ── PASAL 4 ──────────────────────────────────────────────────────────
      pasal(ctx, '4', 'JANGKA WAKTU PELAKSANAAN')
      paragraph(ctx,
        `Jangka waktu pelaksanaan pekerjaan ini adalah ${durationDays} (${terbilangHari(durationDays)}) hari kalender, terhitung sejak pembayaran tahap pertama diterima oleh PIHAK KEDUA.`)
      gap(ctx, 4)
      paragraph(ctx,
        'Apabila terjadi keterlambatan yang disebabkan oleh kondisi di luar kendali PIHAK KEDUA (force majeure) atau perubahan pekerjaan yang disetujui secara tertulis, maka jangka waktu pelaksanaan dapat diperpanjang sesuai kesepakatan kedua belah pihak.')

      // ── PASAL 5 ──────────────────────────────────────────────────────────
      pasal(ctx, '5', 'CARA PEMBAYARAN')
      paragraph(ctx, `Total  :  Rp ${fmtRupiah(contractValue)},-`, { bold: true })
      gap(ctx, 4)
      paragraph(ctx, 'Semua pembayaran dilakukan melalui transfer ke:')
      paragraph(ctx, rekeningBank ? `Bank ${rekeningBank}` : '—', { bold: true })
      if (rekeningNomor) {
        paragraph(ctx, `No. Rekening: ${rekeningNomor}`, { bold: true })
      }
      gap(ctx, 6)

      if (termins.length > 0) {
        paragraph(ctx, 'Jadwal pembayaran termin sebagai berikut:')
        gap(ctx, 4)

        const tblHeaders = ['No', 'Termin Pembayaran', 'Persentase', 'Nilai (Rp)', 'Keterangan']
        const colWs = [22, 95, 52, 80, CONTENT_W - 22 - 95 - 52 - 80]
        const tblRows = termins.map(t => {
          let ket = ''
          if (t.trigger_type === 'on_sign') {
            ket = 'Dibayar pada saat kontrak ditandatangani dan pekerjaan akan dimulai'
          } else if (t.trigger_type === 'on_progress' && t.trigger_pct != null) {
            ket = `Dibayar pada saat progres pekerjaan mencapai ${t.trigger_pct}%`
          } else if (t.trigger_type === 'on_retention' && t.due_days != null) {
            ket = `Dibayar ${t.due_days} hari setelah serah terima pekerjaan untuk masa pemeliharaan`
          } else {
            ket = t.label
          }
          return [
            String(t.termin_number),
            t.label,
            `${t.pct_of_contract}%`,
            fmtRupiah(t.amount),
            ket,
          ]
        })

        drawTable(ctx, tblHeaders, tblRows, colWs)
        ctx.y += 8
      } else {
        paragraph(ctx, 'Jadwal pembayaran akan ditentukan berdasarkan kesepakatan para pihak.')
      }

      // ── PASAL 6 ──────────────────────────────────────────────────────────
      pasal(ctx, '6', 'PERUBAHAN PEKERJAAN DAN PEKERJAAN TAMBAHAN')
      const pasal6 = [
        'Setiap perubahan lingkup pekerjaan harus disepakati secara tertulis oleh kedua belah pihak dalam bentuk addendum kontrak yang merupakan bagian tidak terpisahkan dari kontrak ini.',
        'Pekerjaan tambahan yang tidak tercantum dalam RAB awal dapat dilaksanakan setelah mendapat persetujuan tertulis dari PIHAK PERTAMA, dengan nilai dan waktu pelaksanaan yang disepakati dalam RAB tambahan.',
      ]
      pasal6.forEach((item, i) => {
        ensureSpace(ctx, 18)
        ctx.doc.font('Helvetica').fontSize(10)
          .text(`${i + 1}.  ${item}`, MARGIN + 16, ctx.y, { width: CONTENT_W - 16, align: 'justify' })
        ctx.y = ctx.doc.y + 5
      })

      // ── PASAL 7 ──────────────────────────────────────────────────────────
      pasal(ctx, '7', 'MASA PEMELIHARAAN')
      const pasal7 = [
        `Setelah pekerjaan selesai dan diserahterimakan, PIHAK KEDUA bertanggung jawab atas masa pemeliharaan selama ${masaPemeliharaan} (${terbilangHari(masaPemeliharaan)}) hari kalender.`,
        'Selama masa pemeliharaan, PIHAK KEDUA wajib memperbaiki segala kerusakan atau cacat yang timbul akibat kesalahan pelaksanaan pekerjaan tanpa biaya tambahan kepada PIHAK PERTAMA.',
        'Nilai retensi akan dilepaskan kepada PIHAK KEDUA setelah masa pemeliharaan berakhir dan seluruh perbaikan telah diselesaikan dengan baik.',
      ]
      pasal7.forEach((item, i) => {
        ensureSpace(ctx, 18)
        ctx.doc.font('Helvetica').fontSize(10)
          .text(`${i + 1}.  ${item}`, MARGIN + 16, ctx.y, { width: CONTENT_W - 16, align: 'justify' })
        ctx.y = ctx.doc.y + 5
      })

      // ── PASAL 8 ──────────────────────────────────────────────────────────
      pasal(ctx, '8', 'HAK DAN KEWAJIBAN PARA PIHAK')

      paragraph(ctx, 'A. Kewajiban PIHAK PERTAMA:', { bold: true, align: 'left' })
      gap(ctx, 2)
      const kewajiban1 = [
        'Menyediakan akses lokasi pekerjaan yang diperlukan oleh PIHAK KEDUA.',
        'Melakukan pembayaran sesuai jadwal yang telah disepakati dalam kontrak ini.',
        'Menyediakan gambar rencana, spesifikasi teknis, dan informasi teknis yang diperlukan.',
        'Tidak melakukan intervensi yang dapat mengganggu kelancaran pelaksanaan pekerjaan.',
      ]
      kewajiban1.forEach((item, i) => {
        ensureSpace(ctx, 18)
        ctx.doc.font('Helvetica').fontSize(10)
          .text(`   ${i + 1}.  ${item}`, MARGIN + 16, ctx.y, { width: CONTENT_W - 16, align: 'justify' })
        ctx.y = ctx.doc.y + 4
      })

      gap(ctx, 6)
      paragraph(ctx, 'B. Kewajiban PIHAK KEDUA:', { bold: true, align: 'left' })
      gap(ctx, 2)
      const kewajiban2 = [
        'Melaksanakan pekerjaan sesuai dengan gambar rencana, spesifikasi teknis, dan RAB yang telah disetujui.',
        'Menyediakan tenaga kerja, peralatan, dan material yang diperlukan untuk pelaksanaan pekerjaan.',
        'Menjamin keselamatan kerja seluruh tenaga kerja yang terlibat dalam pelaksanaan pekerjaan.',
        'Menjaga kebersihan dan ketertiban di area proyek selama pelaksanaan pekerjaan.',
        'Melaporkan perkembangan pelaksanaan pekerjaan secara berkala kepada PIHAK PERTAMA.',
      ]
      kewajiban2.forEach((item, i) => {
        ensureSpace(ctx, 18)
        ctx.doc.font('Helvetica').fontSize(10)
          .text(`   ${i + 1}.  ${item}`, MARGIN + 16, ctx.y, { width: CONTENT_W - 16, align: 'justify' })
        ctx.y = ctx.doc.y + 4
      })

      // ── PASAL 9 ──────────────────────────────────────────────────────────
      pasal(ctx, '9', 'PENYELESAIAN PERSELISIHAN')
      paragraph(ctx,
        'Apabila terjadi perselisihan antara PIHAK PERTAMA dan PIHAK KEDUA dalam pelaksanaan kontrak ini, kedua belah pihak sepakat untuk menyelesaikannya secara musyawarah untuk mufakat. Apabila musyawarah tidak mencapai kesepakatan, maka penyelesaian perselisihan akan diselesaikan melalui jalur hukum yang berlaku sesuai peraturan perundang-undangan Republik Indonesia.')

      // ── PASAL 10 ─────────────────────────────────────────────────────────
      pasal(ctx, '10', 'FORCE MAJEURE')
      paragraph(ctx,
        'Yang dimaksud dengan force majeure dalam kontrak ini adalah kejadian-kejadian di luar kemampuan dan kekuasaan para pihak yang mempengaruhi pelaksanaan kewajiban, antara lain: bencana alam (gempa bumi, banjir, tanah longsor), kebakaran, huru-hara, pandemi, perang, dan kebijakan pemerintah yang secara langsung mempengaruhi pelaksanaan pekerjaan. Pihak yang mengalami force majeure wajib memberitahukan kepada pihak lainnya selambat-lambatnya 7 (tujuh) hari kalender sejak kejadian tersebut berlangsung.')

      // ── PASAL 11 ─────────────────────────────────────────────────────────
      pasal(ctx, '11', 'PENUTUP')
      paragraph(ctx,
        'Kontrak ini dibuat rangkap 2 (dua) bermaterai cukup, masing-masing mempunyai kekuatan hukum yang sama, ditandatangani oleh kedua belah pihak dalam keadaan sadar dan tanpa paksaan dari pihak manapun, serta berlaku sejak tanggal ditandatangani.')

      // ── Footer tanda tangan ───────────────────────────────────────────────
      gap(ctx, 20)
      ensureSpace(ctx, 140)

      ctx.doc.font('Helvetica').fontSize(10)
        .text(tglFooter, MARGIN, ctx.y, { width: CONTENT_W, align: 'right' })
      ctx.y = ctx.doc.y + 14

      const colMid = MARGIN + CONTENT_W / 2
      const ttdY = ctx.y

      // PIHAK PERTAMA (kiri)
      ctx.doc.font('Helvetica-Bold').fontSize(10)
        .text('PIHAK PERTAMA', MARGIN, ttdY, { width: CONTENT_W / 2 - 10, align: 'center' })
      ctx.doc.font('Helvetica').fontSize(10)
        .text('(Pemilik)', MARGIN, ctx.doc.y + 2, { width: CONTENT_W / 2 - 10, align: 'center' })

      // PIHAK KEDUA (kanan)
      ctx.doc.font('Helvetica-Bold').fontSize(10)
        .text('PIHAK KEDUA', colMid, ttdY, { width: CONTENT_W / 2 - 10, align: 'center' })
      ctx.doc.font('Helvetica').fontSize(10)
        .text('(Pelaksana Pekerjaan)', colMid, ctx.doc.y + 2, { width: CONTENT_W / 2 - 10, align: 'center' })

      ctx.y = ttdY + 70 // 3 baris kosong untuk TTD

      // Nama terang
      ctx.doc.font('Helvetica').fontSize(10)
        .text(`( ${client?.contact_person ?? '_______________'} )`, MARGIN, ctx.y, {
          width: CONTENT_W / 2 - 10, align: 'center',
        })
      ctx.doc.font('Helvetica').fontSize(10)
        .text(`( ${pelaksanaNama || '_______________'} )`, colMid, ctx.y, {
          width: CONTENT_W / 2 - 10, align: 'center',
        })

      ctx.y = ctx.doc.y + 16

      // Saksi
      if (saksi1 || saksi2) {
        ctx.doc.font('Helvetica-Bold').fontSize(10)
          .text('Saksi-saksi:', MARGIN, ctx.y)
        ctx.y = ctx.doc.y + 8

        if (saksi1) {
          ctx.doc.font('Helvetica').fontSize(10)
            .text(`Saksi 1  :  ________________________  (${saksi1})`, MARGIN + 16, ctx.y)
          ctx.y = ctx.doc.y + 8
        }
        if (saksi2) {
          ctx.doc.font('Helvetica').fontSize(10)
            .text(`Saksi 2  :  ________________________  (${saksi2})`, MARGIN + 16, ctx.y)
          ctx.y = ctx.doc.y + 8
        }
      }

      doc.end()

      await new Promise<void>(resolve => doc.on('end', resolve))
      const pdfBuffer = Buffer.concat(chunks)

      const slug = slugify(proj.name)
      const filename = `Kontrak_${slug}_${contractDate}.pdf`

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer)
    }
  )
}

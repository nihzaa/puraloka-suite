import type { FastifyInstance } from 'fastify'
import PDFDocument from 'pdfkit'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { scopeIdsTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'
import { siapkanKop, gambarKop, KOLOM_IDENTITAS, BUCKET_LOGO } from '../../lib/gambar-kop.js'
import type { IdentitasTenant } from '../../lib/kop-dokumen.js'
import { terbilangRupiah } from '../../lib/penawaran.js'
import {
  validasiSpk, periksaTransisiSpk, hitungDendaKeterlambatan,
  type StatusSpk,
} from '../../lib/spk.js'

/**
 * SURAT PERINTAH KERJA (E1) — perintah kerja resmi ke subkontraktor.
 *
 * ── Rantai yang putus, diukur 2026-08-12
 *
 * `tender_subkon` ada (3 tender, 1 penawaran menang). `work_scopes` ada (20
 * lingkup, pembayaran, retensi, opname). Di antaranya: TAK ADA APA PUN.
 *
 * NOL dari 3 tender punya `work_scope_id`. Dan lima kolom kontrak di
 * `work_scopes` — ada sejak 2024 — tak pernah dibaca satu baris kode pun:
 * 20 dari 20 berstatus `unsigned`, termasuk yang bernilai Rp 280 juta.
 *
 * ── Dua izin
 *
 * `spk:kelola`       menyusun & menerbitkan
 * `spk:tandatangan`  membubuhkan tanda tangan penerbit
 *
 * PM menyusun SPK; yang mengikat perusahaan tetap di tangan yang berwenang.
 */
export default async function spkRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'

  // ── GET /api/v1/spk ──────────────────────────────────────────────────────
  app.get<{ Querystring: { work_scope_id?: string; status?: string; project_id?: string } }>(
    '/api/v1/spk',
    { preHandler: [authenticate, requirePermission('mandor:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      let query = db.unsafe('surat_perintah_kerja', ALASAN)
        .select(`
          id, nomor, tanggal_terbit, lingkup_kerja, nilai_kontrak,
          tanggal_mulai, tanggal_selesai, denda_per_hari, denda_maks_pct,
          syarat_khusus, status, alasan_batal, pdf_url,
          ttd_penerbit_url, ttd_penerbit_pada, ttd_pelaksana_url, ttd_pelaksana_pada,
          project_id, work_scope_id, tender_id, penawaran_id, dibuat_pada,
          penerbit:users!surat_perintah_kerja_diterbitkan_oleh_fkey ( id, name ),
          scope:work_scopes ( id, scope_name, payment_system )
        `)
        .eq('company_id', request.companyId!)
        .order('tanggal_terbit', { ascending: false })

      if (q.work_scope_id) query = query.eq('work_scope_id', q.work_scope_id)
      if (q.project_id) query = query.eq('project_id', q.project_id)
      if (q.status) query = query.eq('status', q.status)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      const hariIni = new Date().toISOString().slice(0, 10)
      // Denda dihitung SAAT BACA, bukan disimpan.
      //
      // Disimpan, ia basi diam-diam: keterlambatan bertambah tiap hari dan tak
      // ada yang menjalankan ulang perhitungannya. Pola yang sama sudah
      // dipakai jatuh-tempo perawatan alat, dengan alasan yang sama.
      const hasil = (data ?? []).map((r) => {
        const s = r as Record<string, unknown>
        const denda = s.status === 'ditandatangani'
          ? hitungDendaKeterlambatan({
              tanggalSelesai: String(s.tanggal_selesai),
              tanggalAcuan: hariIni,
              nilaiKontrak: Number(s.nilai_kontrak) || 0,
              dendaPerHari: s.denda_per_hari === null ? null : Number(s.denda_per_hari),
              dendaMaksPct: s.denda_maks_pct === null ? null : Number(s.denda_maks_pct),
            })
          : null
        return { ...s, denda }
      })

      return reply.send({ spk: hasil })
    },
  )

  // ── POST /api/v1/spk ─────────────────────────────────────────────────────
  app.post<{
    Body: {
      work_scope_id?: string
      tender_id?: string | null
      penawaran_id?: string | null
      tanggal_terbit?: string
      lingkup_kerja?: string
      nilai_kontrak?: number
      tanggal_mulai?: string
      tanggal_selesai?: string
      denda_per_hari?: number | null
      denda_maks_pct?: number | null
      syarat_khusus?: string
    }
  }>(
    '/api/v1/spk',
    { preHandler: [authenticate, requirePermission('spk:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.work_scope_id) return reply.status(400).send({ error: 'work_scope_id wajib diisi' })
      if (!b.tanggal_terbit || !/^\d{4}-\d{2}-\d{2}$/.test(b.tanggal_terbit)) {
        return reply.status(400).send({ error: 'tanggal_terbit wajib, bentuk YYYY-MM-DD' })
      }

      const v = validasiSpk({
        lingkupKerja: b.lingkup_kerja,
        nilaiKontrak: b.nilai_kontrak,
        tanggalMulai: b.tanggal_mulai,
        tanggalSelesai: b.tanggal_selesai,
        dendaPerHari: b.denda_per_hari,
        dendaMaksPct: b.denda_maks_pct,
      })
      if (!v.ok) return reply.status(400).send({ error: v.galat })

      // Lingkup kerja WAJIB milik tenant ini.
      if (!(await scopeIdsTenant(request)).includes(b.work_scope_id)) {
        return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })
      }

      const { data: scope, error: errScope } = await db
        .unsafe('work_scopes', 'sudah diverifikasi lewat scopeIdsTenant di baris sebelumnya')
        .select('id, assignment:mandor_assignments!inner(project_id)')
        .eq('id', b.work_scope_id)
        .maybeSingle()
      if (errScope) return reply.status(500).send({ error: errScope.message })
      if (!scope) return reply.status(404).send({ error: 'Lingkup kerja tidak ditemukan' })

      const projectId = ((scope as Record<string, unknown>).assignment as { project_id?: string })?.project_id
      if (!projectId) return reply.status(500).send({ error: 'Lingkup kerja tanpa proyek' })

      // ── Asal-usul tender WAJIB diverifikasi, bukan diterima apa adanya ──
      //
      // `tender_id` dan `penawaran_id` datang dari body. Tanpa cek, id milik
      // tenant lain bisa tersimpan di SPK ini — dan karena keduanya hanya
      // ditampilkan sebagai rujukan (bukan dipakai menghitung), tak ada satu
      // pun galat yang menandainya. Jejak asal-usul yang menunjuk dokumen
      // orang lain lebih buruk daripada tak ada jejak sama sekali: ia
      // terlihat seperti bukti.
      //
      // Tender diperiksa lewat `projectIds()` — daftar proyek milik tenant
      // ini. Penawaran diperiksa lewat tendernya, jadi `penawaran_id` tanpa
      // `tender_id` ditolak: penawaran yang tak diketahui tendernya tak bisa
      // ditelusuri ke tenant mana pun.
      if (b.penawaran_id && !b.tender_id) {
        return reply.status(400).send({
          error: 'penawaran_id tanpa tender_id — penawaran hanya bisa ditelusuri lewat tendernya.',
        })
      }
      if (b.tender_id) {
        const { data: tender, error: errTender } = await db
          .unsafe('tender_subkon', 'disaring project_id milik tenant di baris berikutnya')
          .select('id, work_scope_id')
          .eq('id', b.tender_id)
          .in('project_id', await db.projectIds())
          .maybeSingle()
        if (errTender) return reply.status(500).send({ error: errTender.message })
        if (!tender) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

        if (b.penawaran_id) {
          const { data: pen, error: errPen } = await db
            .unsafe('penawaran_subkon', 'disaring tender_id yang sudah diverifikasi di atas')
            .select('id')
            .eq('id', b.penawaran_id)
            .eq('tender_id', b.tender_id)
            .maybeSingle()
          if (errPen) return reply.status(500).send({ error: errPen.message })
          if (!pen) {
            return reply.status(404).send({
              error: 'Penawaran tidak ditemukan pada tender itu.',
            })
          }
        }
      }

      // SPK aktif yang SUDAH ada untuk lingkup ini.
      //
      // Bukan larangan: addendum adalah praktik yang sah saat lingkupnya
      // bertambah. Tapi yang membuat SPK kedua tanpa sadar ada yang pertama
      // akan menerbitkan dua perintah untuk pekerjaan yang sama — dan
      // pelaksananya yang menanggung kebingungannya.
      const { data: aktif, error: errAktif } = await db.unsafe('surat_perintah_kerja', ALASAN)
        .select('nomor, status')
        .eq('company_id', request.companyId!)
        .eq('work_scope_id', b.work_scope_id)
        .in('status', ['diterbitkan', 'ditandatangani'])
      if (errAktif) return reply.status(500).send({ error: errAktif.message })

      const tahun = b.tanggal_terbit.slice(0, 4)
      const { data: terakhir, error: errNomor } = await db.unsafe('surat_perintah_kerja', ALASAN)
        .select('nomor').eq('company_id', request.companyId!)
        .like('nomor', `SPK-${tahun}-%`)
        .order('nomor', { ascending: false }).limit(1).maybeSingle()
      if (errNomor) return reply.status(500).send({ error: errNomor.message })
      const urut = terakhir?.nomor ? Number(String(terakhir.nomor).split('-').pop()) + 1 : 1
      const nomor = `SPK-${tahun}-${String(urut).padStart(4, '0')}`

      const { data, error } = await db.unsafe('surat_perintah_kerja', ALASAN)
        .insert({
          company_id: request.companyId!,
          project_id: projectId,
          work_scope_id: b.work_scope_id,
          tender_id: b.tender_id ?? null,
          penawaran_id: b.penawaran_id ?? null,
          nomor,
          tanggal_terbit: b.tanggal_terbit,
          lingkup_kerja: b.lingkup_kerja!.trim(),
          nilai_kontrak: v.nilai.nilaiKontrak,
          tanggal_mulai: b.tanggal_mulai,
          tanggal_selesai: b.tanggal_selesai,
          denda_per_hari: v.nilai.dendaPerHari,
          denda_maks_pct: v.nilai.dendaMaksPct,
          syarat_khusus: b.syarat_khusus ?? null,
          diterbitkan_oleh: request.currentUser!.id,
        })
        .select('id, nomor, status, nilai_kontrak')
        .single()

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: `Nomor ${nomor} sudah dipakai` })
        }
        if ((error as { code?: string }).code === '23514') {
          return reply.status(422).send({ error: 'Isi SPK tak memenuhi aturan basis' })
        }
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'surat_perintah_kerja', recordId: (data as { id: string }).id,
        action: 'spk.create', actorId: request.currentUser!.id,
        newValues: { nomor, work_scope_id: b.work_scope_id, nilai: v.nilai.nilaiKontrak },
        severity: 'critical',
      })

      return reply.status(201).send({
        spk: data,
        // Peringatan, bukan penolakan — keputusan tetap di tangan manusia.
        peringatan: (aktif ?? []).length > 0
          ? `Lingkup kerja ini sudah punya SPK aktif (${(aktif ?? [])
              .map((a) => (a as { nomor: string }).nomor).join(', ')}). `
            + 'Pastikan ini addendum, bukan perintah ganda.'
          : null,
      })
    },
  )

  // ── PATCH /api/v1/spk/:id/status ─────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: { status?: StatusSpk; alasan?: string; ttd_url?: string; pihak?: 'penerbit' | 'pelaksana' }
  }>(
    '/api/v1/spk/:id/status',
    { preHandler: [authenticate, requirePermission('spk:kelola')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      const { data: spk, error: errBaca } = await db.unsafe('surat_perintah_kerja', ALASAN)
        .select('id, nomor, status, ttd_penerbit_url, ttd_pelaksana_url')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!spk) return reply.status(404).send({ error: 'SPK tidak ditemukan' })

      const s = spk as Record<string, unknown>

      // ── Membubuhkan tanda tangan (bukan pindah status) ────────────────────
      if (b.ttd_url && b.pihak) {
        // Tanda tangan PENERBIT mengikat perusahaan, jadi ia butuh izin
        // tersendiri di atas `spk:kelola`. Tanda tangan pelaksana dibubuhkan
        // atas nama pihak lain — yang menjaganya bukan izin, melainkan
        // dokumen fisik/foto yang diunggah sebagai buktinya.
        if (b.pihak === 'penerbit' && !(await hasPermission(request, 'spk:tandatangan'))) {
          return reply.status(403).send({
            error: 'Tanda tangan penerbit mengikat perusahaan dan butuh izin Tanda tangani SPK.',
          })
        }
        const kolom = b.pihak === 'penerbit'
          ? { ttd_penerbit_url: b.ttd_url, ttd_penerbit_pada: new Date().toISOString() }
          : { ttd_pelaksana_url: b.ttd_url, ttd_pelaksana_pada: new Date().toISOString() }

        const { data: ttd, error: errTtd } = await db.unsafe('surat_perintah_kerja', ALASAN)
          .update(kolom)
          .eq('id', id).eq('company_id', request.companyId!)
          // Yang sudah ditandatangani penuh atau dibatalkan tak menerima
          // tanda tangan baru.
          .in('status', ['draf', 'diterbitkan'])
          .select('id, nomor, ttd_penerbit_url, ttd_pelaksana_url, status')
        if (errTtd) return reply.status(500).send({ error: errTtd.message })
        if (!ttd || ttd.length === 0) {
          return reply.status(409).send({
            error: `SPK ${s.nomor} berstatus ${s.status}; tanda tangan hanya bisa dibubuhkan `
              + 'pada draf atau yang sudah diterbitkan.',
          })
        }
        return reply.send({ spk: ttd[0] })
      }

      // ── Perpindahan status ────────────────────────────────────────────────
      if (!b.status) {
        return reply.status(400).send({ error: 'status atau (ttd_url + pihak) wajib diisi' })
      }

      const periksa = periksaTransisiSpk({
        statusSekarang: s.status as StatusSpk,
        statusTujuan: b.status,
        adaTtdPenerbit: !!s.ttd_penerbit_url,
        adaTtdPelaksana: !!s.ttd_pelaksana_url,
        alasanBatal: b.alasan,
      })
      if (!periksa.boleh) return reply.status(409).send({ error: periksa.sebab })

      const patch: Record<string, unknown> = { status: b.status }
      if (b.status === 'dibatalkan') patch.alasan_batal = b.alasan!.trim()

      const { data, error } = await db.unsafe('surat_perintah_kerja', ALASAN)
        .update(patch)
        .eq('id', id).eq('company_id', request.companyId!)
        // Status lama ikut di WHERE: dua perpindahan bersamaan hanya boleh
        // menghasilkan satu yang berhasil.
        .eq('status', s.status as string)
        .select('id, nomor, status')
      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Status SPK sudah diubah pihak lain.' })
      }

      void logAuditEvent(request, {
        tableName: 'surat_perintah_kerja', recordId: id,
        action: `spk.${b.status}`, actorId: request.currentUser!.id,
        newValues: patch, severity: 'critical',
      })
      return reply.send({ spk: data[0] })
    },
  )

  // ── GET /api/v1/spk/:id.pdf ──────────────────────────────────────────────
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA SPK HARUS BISA DICETAK, DAN KENAPA BUKAN SEKADAR KERAPIAN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur 2026-08-17: seluruh rantainya sudah ada — tabel, rute, layar, test,
  // bahkan kolom `pdf_url` dan dua kolom tanda tangan. Yang TIDAK ada:
  // dokumennya sendiri. `pdf_url` tersimpan tetapi tak satu baris pun yang
  // pernah mengisinya.
  //
  // SPK adalah perintah kerja yang MENGIKAT pihak ketiga. Selama ia hanya
  // baris di basis, yang diserahkan ke subkontraktor tetap kertas yang
  // diketik di Word — dan begitu itu terjadi, angka di layar dan angka di
  // kertas berhenti dijamin sama. Nilai kontrak, tanggal, denda per hari:
  // ketiganya diketik ulang oleh manusia, dan tak ada satu pun yang
  // membandingkannya kembali.
  //
  // ── Kenapa terbilang ikut dicetak
  //
  // Nominal berangka bisa bergeser satu digit tanpa terlihat. Huruf tidak —
  // itu sebabnya surat resmi memuat keduanya, dan kenapa yang dipegang saat
  // keduanya berbeda adalah hurufnya. `terbilangRupiah` sudah dipakai surat
  // penawaran; SPK memakai fungsi yang SAMA supaya dua dokumen dari satu
  // sistem tak pernah membulatkan dengan cara berbeda.
  //
  // ── Kenapa DRAF pun boleh dicetak, tapi bertanda
  //
  // Menolak mencetak draf memaksa orang menyusunnya di Word untuk dibahas
  // lebih dulu — dan yang dibahas di Word itulah yang akhirnya ditandatangani.
  // Jadi draf tercetak, dengan kata "DRAF" di kepala dokumen dan tanpa blok
  // tanda tangan. Yang membedakan draf dari yang final harus terlihat dari
  // KERTASNYA, bukan dari ingatan siapa yang mengirimnya.
  app.get<{ Params: { id: string } }>(
    '/api/v1/spk/:id.pdf',
    { preHandler: [authenticate, requirePermission('mandor:view')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params

      const { data: spk, error } = await db
        .unsafe('surat_perintah_kerja', ALASAN)
        .select(`
          id, nomor, tanggal_terbit, lingkup_kerja, nilai_kontrak,
          tanggal_mulai, tanggal_selesai, denda_per_hari, denda_maks_pct,
          syarat_khusus, status,
          ttd_penerbit_pada, ttd_pelaksana_pada,
          penerbit:users!surat_perintah_kerja_diterbitkan_oleh_fkey ( name ),
          scope:work_scopes ( scope_name, payment_system )
        `)
        .eq('id', id)
        .eq('company_id', request.companyId!)
        .maybeSingle()
      if (error) {
        request.log.error({ err: error, id }, 'gagal memuat SPK untuk dicetak')
        return reply.status(500).send({ error: 'Gagal memuat SPK' })
      }
      if (!spk) return reply.status(404).send({ error: 'SPK tidak ditemukan' })

      const s = spk as Record<string, any>

      const { kop, logo } = await siapkanKop({
        companyId: request.companyId!,
        ambilIdentitas: async () => {
          const { data } = await db
            .unsafe('companies', 'identitas penerbit dokumen; disaring ke companyId di baris berikutnya')
            .select(KOLOM_IDENTITAS).eq('id', request.companyId!).maybeSingle()
          return data as IdentitasTenant | null
        },
        unduh: async (kunci) => {
          const { data: blob, error: e } = await supabase.storage.from(BUCKET_LOGO).download(kunci)
          if (e) {
            request.log.warn({ err: e, kunci }, 'logo tak terunduh, SPK dicetak tanpa logo')
            return null
          }
          return blob ? Buffer.from(await blob.arrayBuffer()) : null
        },
        log: request.log,
      })

      const M = 60
      const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true })
      const W = doc.page.width - M * 2
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))

      let y = gambarKop({ doc: doc as any, y: M, margin: M, lebar: W, kop, logo }, request.log)

      const draf = s.status === 'draf'
      const batal = s.status === 'dibatalkan'

      // Status yang BUKAN dokumen final ditandai di kepala, bukan hanya di
      // basis. Kertas draf yang tak bisa dibedakan dari kertas final adalah
      // kertas yang akan ditandatangani orang tanpa sadar.
      if (draf || batal) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#8a2b2b')
          .text(batal ? 'DIBATALKAN — BUKAN DOKUMEN YANG BERLAKU' : 'DRAF — BELUM DITERBITKAN',
            M, y, { width: W, align: 'center' })
        doc.fillColor('black')
        y = doc.y + 8
      }

      doc.font('Helvetica-Bold').fontSize(13)
        .text('SURAT PERINTAH KERJA', M, y, { width: W, align: 'center' })
      y = doc.y + 2
      doc.font('Helvetica').fontSize(10)
        .text(`Nomor: ${s.nomor ?? '—'}`, M, y, { width: W, align: 'center' })
      y = doc.y + 12

      const baris = (label: string, nilai: string) => {
        doc.font('Helvetica-Bold').fontSize(9.5).text(label, M, y, { width: 140 })
        doc.font('Helvetica').fontSize(9.5).text(nilai, M + 148, y, { width: W - 148 })
        y = Math.max(doc.y, y) + 4
      }

      const tgl = (v: unknown) => (v ? String(v).slice(0, 10) : '—')
      const rp = (n: number) =>
        'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)

      const nilai = Number(s.nilai_kontrak) || 0

      baris('Pemberi Perintah', kop.nama)
      baris('Lingkup Pekerjaan', String(s.scope?.scope_name ?? s.lingkup_kerja ?? '—'))
      baris('Tanggal Terbit', tgl(s.tanggal_terbit))
      baris('Jangka Waktu', `${tgl(s.tanggal_mulai)} s.d. ${tgl(s.tanggal_selesai)}`)

      y += 6
      doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.8).stroke()
      y += 10

      // ── Nilai: angka DAN huruf ───────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).text('NILAI PEKERJAAN', M, y, { width: W })
      y = doc.y + 4
      doc.font('Helvetica-Bold').fontSize(12).text(rp(nilai), M, y, { width: W })
      y = doc.y + 2
      doc.font('Helvetica-Oblique').fontSize(9.5)
        .text(`Terbilang: ${terbilangRupiah(nilai)}`, M, y, { width: W })
      y = doc.y + 12

      // ── Uraian pekerjaan ─────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).text('URAIAN PEKERJAAN', M, y, { width: W })
      y = doc.y + 4
      doc.font('Helvetica').fontSize(9.5)
        .text(String(s.lingkup_kerja ?? '—'), M, y, { width: W, align: 'justify' })
      y = doc.y + 12

      // ── Denda ────────────────────────────────────────────────────────────
      //
      // Dicetak APA ADANYA, termasuk saat tak ada. "Tanpa denda" yang tertulis
      // jelas berbeda dari kolom yang hilang: yang kedua terbaca seperti
      // kelalaian penyusun, dan pihak yang dirugikan belakangan akan
      // memperdebatkan apakah dendanya memang tak disepakati.
      doc.font('Helvetica-Bold').fontSize(10).text('DENDA KETERLAMBATAN', M, y, { width: W })
      y = doc.y + 4
      const perHari = s.denda_per_hari === null ? null : Number(s.denda_per_hari)
      const maksPct = s.denda_maks_pct === null ? null : Number(s.denda_maks_pct)
      doc.font('Helvetica').fontSize(9.5).text(
        perHari === null
          ? 'Tidak diperjanjikan denda keterlambatan dalam surat perintah kerja ini.'
          : `${rp(perHari)} per hari kalender keterlambatan`
            + (maksPct === null ? '.' : `, setinggi-tingginya ${maksPct}% dari nilai pekerjaan.`),
        M, y, { width: W, align: 'justify' })
      y = doc.y + 12

      if (String(s.syarat_khusus ?? '').trim()) {
        doc.font('Helvetica-Bold').fontSize(10).text('SYARAT KHUSUS', M, y, { width: W })
        y = doc.y + 4
        doc.font('Helvetica').fontSize(9.5)
          .text(String(s.syarat_khusus), M, y, { width: W, align: 'justify' })
        y = doc.y + 12
      }

      // ── Tanda tangan ─────────────────────────────────────────────────────
      //
      // Draf TIDAK mendapat blok tanda tangan. Kolom tanda tangan di atas
      // kertas adalah undangan untuk menandatanganinya, dan draf yang
      // menyediakannya akan ditandatangani sebelum diterbitkan.
      if (!draf && !batal) {
        if (y > doc.page.height - 170) { doc.addPage(); y = M }
        y += 8
        const kolomW = (W - 30) / 2
        doc.font('Helvetica').fontSize(9.5)
          .text('Pemberi Perintah,', M, y, { width: kolomW, align: 'center' })
          .text('Pelaksana Pekerjaan,', M + kolomW + 30, y, { width: kolomW, align: 'center' })
        const yTtd = doc.y + 56

        // Tanggal tanda tangan dicetak BILA ADA. Baris kosong di bawah nama
        // berarti belum ditandatangani — dan itu memang keadaannya.
        doc.font('Helvetica-Bold').fontSize(9.5)
          .text(String(s.penerbit?.name ?? kop.nama), M, yTtd, { width: kolomW, align: 'center' })
          .text('(...............................)', M + kolomW + 30, yTtd,
            { width: kolomW, align: 'center' })
        let yBawah = doc.y + 2
        doc.font('Helvetica').fontSize(8)
          .text(s.ttd_penerbit_pada ? `ditandatangani ${tgl(s.ttd_penerbit_pada)}` : 'belum ditandatangani',
            M, yBawah, { width: kolomW, align: 'center' })
          .text(s.ttd_pelaksana_pada ? `ditandatangani ${tgl(s.ttd_pelaksana_pada)}` : 'belum ditandatangani',
            M + kolomW + 30, yBawah, { width: kolomW, align: 'center' })
      }

      doc.end()
      await new Promise<void>((res) => doc.on('end', () => res()))

      const namaBerkas = `SPK-${String(s.nomor ?? id).replace(/[^\w-]+/g, '-').slice(0, 60)}.pdf`
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${namaBerkas}"`)
        .send(Buffer.concat(chunks))
    },
  )
}

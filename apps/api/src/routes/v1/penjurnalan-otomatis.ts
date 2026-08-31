import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  susunJurnalInvoice, susunJurnalPembayaran, periksaKesiapanPeta,
  LABEL_PETA, PETA_MINIMUM,
  type PetaAkun, type JenisPetaAkun, type InvoiceUntukJurnal,
} from '../../lib/penjurnalan-otomatis.js'

/**
 * PETA AKUN & PENJURNALAN OTOMATIS (R-012).
 *
 * ⚠ EMBER [C] TIDAK dilanggar. Yang bisa dikonfigurasi: PEMETAAN AKUN.
 *   Yang tetap: invariant debit=kredit (`trg_gl_wajib_seimbang`), immutability
 *   jurnal posted, dan penguncian periode (migrasi 294) — semuanya di basis.
 *
 * ── Kenapa jurnal dibuat DRAFT, bukan langsung posted
 *
 * Penjurnalan otomatis adalah tafsir atas transaksi, dan tafsir bisa salah.
 * Membuatnya `draft` berarti ia belum masuk laporan mana pun sampai seseorang
 * memeriksanya dan menekan posting — dan itu memberi kesempatan menangkap
 * peta akun yang keliru SEBELUM angkanya masuk neraca.
 *
 * Kalau langsung posted, jurnal yang salah petakan langsung mengubah laporan,
 * dan memperbaikinya menuntut jurnal balik — yang meninggalkan dua baris di
 * buku besar untuk satu kesalahan.
 *
 * ── Kenapa satu invoice tak bisa dijurnalkan dua kali
 *
 * Dijaga `uq_jurnal_satu_per_rujukan` (migrasi 297), bukan pemeriksaan di
 * sini: dua permintaan bersamaan bisa lolos pemeriksaan aplikasi dan
 * keduanya tersimpan — dan itu bukan kerapian, itu PENGGANDAAN PENDAPATAN
 * yang tetap seimbang sehingga tak ada invariant yang menangkapnya.
 */

const PETA_SELECT = `
  id, jenis, account_id, catatan, created_at,
  akun:accounts ( id, code, name, type )
`

const JENIS_SAH: JenisPetaAkun[] = [
  'pendapatan_termin', 'piutang_usaha', 'retensi_ditahan',
  'uang_muka_klien', 'ppn_keluaran', 'pph_final', 'kas_bank']

/** Membaca peta akun jadi bentuk yang dipakai pustaka. */
async function bacaPeta(
  db: NonNullable<Parameters<typeof logAuditEvent>[0]['db']>,
): Promise<PetaAkun | { galat: string }> {
  const { data, error } = await db
    .from('peta_akun_jurnal')
    .select('jenis, account_id')
    .limit(50)
  if (error) return { galat: error.message }

  // `data` DIPASTIKAN tidak null — `error` sudah diperiksa. `data ?? []` di
  // sini berbahaya: query gagal berubah jadi "peta kosong", dan layar
  // berkata "belum ditetapkan" padahal sudah.
  const peta: PetaAkun = {}
  for (const r of data as Array<Record<string, unknown>>) {
    peta[r.jenis as JenisPetaAkun] = r.account_id as string
  }
  return peta
}

export default async function penjurnalanOtomatisRoutes(app: FastifyInstance) {
  // ── GET /gl/peta-akun ────────────────────────────────────────────────────
  app.get(
    '/api/v1/gl/peta-akun',
    { preHandler: [authenticate, requireModul('modul.akuntansi'), requirePermission('gl:peta-akun:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('peta_akun_jurnal')
        .select(PETA_SELECT)
        .limit(50)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat peta akun')
        return reply.status(500).send({ error: 'Gagal memuat peta akun' })
      }

      const peta: PetaAkun = {}
      for (const r of (data as Array<Record<string, unknown>>)) {
        peta[r.jenis as JenisPetaAkun] = r.account_id as string
      }

      // Daftar akun untuk pemilih di layar. Hanya yang AKTIF — memetakan
      // akun mati menghasilkan jurnal yang tak terbaca laporan.
      const { data: akun, error: eAkun } = await request.db!
        .from('accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code', { ascending: true })
        .limit(500)
      if (eAkun) {
        request.log.error({ err: eAkun }, 'gagal memuat daftar akun')
        return reply.status(500).send({ error: 'Gagal memuat daftar akun' })
      }

      return reply.send({
        peta: data,
        akun,
        kesiapan: periksaKesiapanPeta(peta),
        label: LABEL_PETA,
        minimum: PETA_MINIMUM,
      })
    },
  )

  // ── PUT /gl/peta-akun/:jenis ─────────────────────────────────────────────
  app.put<{ Params: { jenis: string }; Body: { account_id?: string; catatan?: string } }>(
    '/api/v1/gl/peta-akun/:jenis',
    { preHandler: [authenticate, requireModul('modul.akuntansi'), requirePermission('gl:peta-akun:manage')] },
    async (request, reply) => {
      const { jenis } = request.params
      const b = request.body

      if (!JENIS_SAH.includes(jenis as JenisPetaAkun)) {
        return reply.status(400).send({
          error: `jenis harus salah satu dari: ${JENIS_SAH.join(', ')}`,
        })
      }
      if (!b.account_id) {
        return reply.status(400).send({ error: 'account_id wajib diisi' })
      }

      const { data: akun, error: eAkun } = await request.db!
        .from('accounts')
        .select('id, code, name, is_active')
        .eq('id', b.account_id)
        .maybeSingle()
      if (eAkun) return reply.status(500).send({ error: eAkun.message })
      if (!akun) return reply.status(404).send({ error: 'Akun tidak ditemukan' })
      if (akun.is_active !== true) {
        return reply.status(422).send({
          error: `Akun ${akun.code} sudah tidak aktif. Jurnal yang menunjuk akun `
            + 'mati tak terbaca laporan — pilih akun yang aktif.',
        })
      }

      // Upsert: satu jenis = satu akun (`uq_peta_akun_jenis`).
      const { data, error } = await request.db!
        .from('peta_akun_jurnal')
        .upsert({
          jenis,
          account_id: b.account_id,
          catatan: b.catatan?.trim() || null,
          ditetapkan_oleh: request.currentUser!.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,jenis' })
        .select(PETA_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, jenis }, 'gagal menetapkan peta akun')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'peta_akun_jurnal',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ peta: data })
    },
  )

  // ── GET /gl/jurnalkan/invoice — apa yang BELUM dijurnalkan ───────────────
  app.get<{ Querystring: { proyek?: string } }>(
    '/api/v1/gl/jurnalkan/invoice',
    { preHandler: [authenticate, requireModul('modul.akuntansi'), requirePermission('gl:jurnalkan')] },
    async (request, reply) => {
      const peta = await bacaPeta(request.db!)
      if ('galat' in peta) {
        request.log.error({ err: peta.galat }, 'gagal memuat peta akun')
        return reply.status(500).send({ error: 'Gagal memuat peta akun' })
      }

      // ⚠ `invoices` kategori C lewat `project_id` — `.from()` MELEMPAR.
      // Dipakai `unsafe` dengan saringan proyek eksplisit atas proyek yang
      // memang milik tenant ini (`projectIds()` sudah menyaringnya).
      const idProyek = await request.db!.projectIds()
      let q = request.db!
        .unsafe('invoices', 'disaring ke proyek milik tenant lewat projectIds()')
        .select(`id, invoice_number, issued_date, base_amount, commission_amount,
                 tax_amount, retensi_amount, dp_deduction_amount, total_amount,
                 status, project_id, projects ( id, name, tax_scheme )`)
        .in('project_id', idProyek)
        .order('issued_date', { ascending: false })
        .limit(300)
      if (request.query.proyek) q = q.eq('project_id', request.query.proyek)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error }, 'gagal memuat invoice')
        return reply.status(500).send({ error: 'Gagal memuat invoice' })
      }

      const baris = data as Array<Record<string, unknown>>

      // Invoice mana yang SUDAH punya jurnal — dibaca sekali, bukan per baris.
      const { data: sudah, error: eSudah } = await request.db!
        .from('journal_entries')
        .select('ref_id, id, entry_number, status')
        .eq('ref_type', 'invoice')
        .neq('status', 'void')
        .limit(1000)
      if (eSudah) {
        request.log.error({ err: eSudah }, 'gagal memuat jurnal yang sudah ada')
        return reply.status(500).send({ error: 'Gagal memuat jurnal yang sudah ada' })
      }
      const petaJurnal = new Map(
        (sudah as Array<Record<string, unknown>>).map(
          (j) => [j.ref_id as string, j]))

      return reply.send({
        kesiapan: periksaKesiapanPeta(peta),
        invoice: baris.map((inv) => {
          const proyek = inv.projects as { tax_scheme?: string } | null
          const untuk: InvoiceUntukJurnal = {
            id: inv.id as string,
            invoice_number: inv.invoice_number as string,
            issued_date: inv.issued_date as string,
            base_amount: inv.base_amount as number | string | null,
            commission_amount: inv.commission_amount as number | string | null,
            tax_amount: inv.tax_amount as number | string | null,
            retensi_amount: inv.retensi_amount as number | string | null,
            dp_deduction_amount: inv.dp_deduction_amount as number | string | null,
            total_amount: inv.total_amount as number | string | null,
            tax_scheme: proyek?.tax_scheme ?? null,
          }
          const susun = susunJurnalInvoice(untuk, peta)
          const jurnal = petaJurnal.get(inv.id as string)
          return {
            ...inv,
            jurnal: jurnal ?? null,
            // `bisa` menjawab apakah jurnalnya BISA disusun — bukan apakah
            // sudah. Keduanya ditampilkan terpisah di layar.
            bisa: !('galat' in susun),
            alasan: 'galat' in susun ? susun.galat : null,
            kurang: 'galat' in susun ? (susun.kurang ?? []) : [],
          }
        }),
      })
    },
  )

  // ── POST /gl/jurnalkan/invoice/:id ───────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/gl/jurnalkan/invoice/:id',
    { preHandler: [authenticate, requireModul('modul.akuntansi'), requirePermission('gl:jurnalkan')] },
    async (request, reply) => {
      const { id } = request.params

      const peta = await bacaPeta(request.db!)
      if ('galat' in peta) {
        request.log.error({ err: peta.galat }, 'gagal memuat peta akun')
        return reply.status(500).send({ error: 'Gagal memuat peta akun' })
      }

      // ⚠ `invoices` kategori C — lihat catatan di GET di atas.
      const { data: inv, error: eInv } = await request.db!
        .unsafe('invoices', 'dibaca lewat id; disaring ke proyek milik tenant')
        .select(`id, invoice_number, issued_date, base_amount, commission_amount,
                 tax_amount, retensi_amount, dp_deduction_amount, total_amount,
                 project_id, projects ( id, name, tax_scheme )`)
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eInv) {
        request.log.error({ err: eInv, id }, 'gagal memuat invoice')
        return reply.status(500).send({ error: 'Gagal memuat invoice' })
      }
      if (!inv) return reply.status(404).send({ error: 'Invoice tidak ditemukan' })

      const proyek = inv.projects as { tax_scheme?: string } | null
      const susun = susunJurnalInvoice({
        id: inv.id as string,
        invoice_number: inv.invoice_number as string,
        issued_date: inv.issued_date as string,
        base_amount: inv.base_amount as number | string | null,
        commission_amount: inv.commission_amount as number | string | null,
        tax_amount: inv.tax_amount as number | string | null,
        retensi_amount: inv.retensi_amount as number | string | null,
        dp_deduction_amount: inv.dp_deduction_amount as number | string | null,
        total_amount: inv.total_amount as number | string | null,
        tax_scheme: proyek?.tax_scheme ?? null,
      }, peta)

      if ('galat' in susun) {
        return reply.status(422).send({
          error: susun.galat,
          kurang: susun.kurang ?? [],
        })
      }

      const nomor = `JU-INV-${inv.invoice_number}`

      // Jurnal dibuat DRAFT — lihat kepala berkas.
      const { data: je, error: eJe } = await request.db!
        .from('journal_entries')
        .insert({
          entry_number: nomor,
          entry_date: inv.issued_date,
          description: susun.keterangan,
          // `source` menjawab "berasal dari transaksi APA", bukan "dibuat
          // BAGAIMANA" — `'otomatis'` yang saya pakai semula salah bentuk,
          // dan basis menolaknya (migrasi 298).
          source: 'invoice',
          ref_type: 'invoice',
          ref_id: inv.id,
          status: 'draft',
          created_by: request.currentUser!.id,
        })
        .select('id, entry_number, entry_date, status')
        .single()

      if (eJe) {
        // `uq_jurnal_satu_per_rujukan` menolak invoice yang sudah dijurnalkan.
        // Pesannya diterjemahkan — galat Postgres menyebut nama indeks, bukan
        // apa yang salah.
        if (/uq_jurnal_satu_per_rujukan|duplicate key/i.test(eJe.message)) {
          return reply.status(409).send({
            error: `Invoice ${inv.invoice_number} sudah pernah dijurnalkan. `
              + 'Menjurnalkannya lagi menggandakan pendapatan — dan jurnal '
              + 'gandanya tetap seimbang, jadi tak ada yang menangkapnya '
              + 'selain penjaga ini.',
          })
        }
        request.log.error({ err: eJe, id }, 'gagal membuat jurnal')
        return reply.status(400).send({ error: eJe.message })
      }

      // ⚠ `journal_entry_lines` kategori C lewat `account_id` — `.from()`
      // melempar, dan `viaProject` menuntut SATU akun sementara jurnal punya
      // beberapa. Pola yang sama dipakai `gl.ts:217`.
      const { error: eBaris } = await request.db!
        .unsafe('journal_entry_lines', 'mewarisi tenancy dari kepala jurnal yang baru dibuat di atas')
        .insert(susun.baris.map((b) => ({
          entry_id: je!.id,
          account_id: b.account_id,
          debit: b.debit,
          credit: b.credit,
          description: b.keterangan,
        })))

      if (eBaris) {
        // Jurnal kepala sudah tersimpan tetapi barisnya gagal: itu jurnal
        // KOSONG yang terlihat sah di daftar. Dihapus supaya tak jadi
        // "berhasil tanpa melakukan apa-apa" — dan penghapusannya aman
        // karena statusnya masih draft.
        //
        // Hasil penghapusan DIPERIKSA (`audit-tulis-tanpa-periksa` menangkap
        // versi pertama yang tidak memeriksanya). Kalau pembersihan pun
        // gagal, jurnal kosong itu TETAP ADA — dan diam tentangnya berarti
        // pengguna melihat "gagal" sementara ada baris siluman di buku
        // besar. Nomornya disebut supaya bisa dicari dan dihapus.
        // `.select('id')` — nol baris terhapus SAMA BAHAYANYA dengan galat.
        //
        // Komentar di atas sudah menyatakan "hasil penghapusan DIPERIKSA",
        // tetapi `{ error }` saja hanya menangkap query yang GAGAL. Penghapusan
        // yang menyentuh nol baris meninggalkan jurnal kosong itu TETAP ADA di
        // buku besar, sementara kode ini melapor berhasil.
        //
        // Komentar yang menjanjikan lebih dari yang dilakukan kodenya adalah
        // bentuk kegagalan tersendiri: pembaca berikutnya berhenti memeriksa.
        const { data: terhapus, error: eBersih } = await request.db!
          .from('journal_entries').delete().eq('id', je!.id).select('id')
        if (eBersih || !terhapus || terhapus.length === 0) {
          request.log.error(
            { err: eBersih, jurnal: je!.entry_number },
            'jurnal kepala kosong GAGAL dibersihkan — perlu dihapus manual')
          return reply.status(500).send({
            error: `Baris jurnal gagal ditulis, dan pembatalannya juga gagal. `
              + `Jurnal ${je!.entry_number} kini KOSONG di buku besar dan harus `
              + `dihapus manual — statusnya masih draft, jadi belum masuk laporan.`,
          })
        }
        request.log.error({ err: eBaris, id }, 'baris jurnal gagal ditulis; jurnal kepala dihapus')
        return reply.status(500).send({
          error: 'Baris jurnal gagal ditulis. Jurnalnya dibatalkan supaya tak '
            + 'ada jurnal kosong yang terlihat sah.',
        })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'journal_entries',
        recordId: je!.id as string,
        newValues: { ...je, baris: susun.baris } as Record<string, unknown>,
      })

      return reply.status(201).send({
        jurnal: je,
        baris: susun.baris,
        total_debit: susun.total_debit,
        total_kredit: susun.total_kredit,
      })
    },
  )

  // ── POST /gl/jurnalkan/pembayaran/:id ────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/gl/jurnalkan/pembayaran/:id',
    { preHandler: [authenticate, requireModul('modul.akuntansi'), requirePermission('gl:jurnalkan')] },
    async (request, reply) => {
      const { id } = request.params

      const peta = await bacaPeta(request.db!)
      if ('galat' in peta) {
        request.log.error({ err: peta.galat }, 'gagal memuat peta akun')
        return reply.status(500).send({ error: 'Gagal memuat peta akun' })
      }

      // ⚠ `payments` kategori C lewat `invoice_id` — disaring lewat induknya.
      const { data: bayar, error: eBayar } = await request.db!
        .unsafe('payments', 'dibaca lewat id; induk invoice disaring ke proyek tenant')
        .select('id, invoice_id, amount_paid, paid_at, cash_account_id, invoices!inner ( invoice_number, project_id )')
        .eq('id', id)
        .in('invoices.project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eBayar) {
        request.log.error({ err: eBayar, id }, 'gagal memuat pembayaran')
        return reply.status(500).send({ error: 'Gagal memuat pembayaran' })
      }
      if (!bayar) return reply.status(404).send({ error: 'Pembayaran tidak ditemukan' })

      const inv = bayar.invoices as { invoice_number?: string } | null
      const susun = susunJurnalPembayaran({
        id: bayar.id as string,
        invoice_id: bayar.invoice_id as string,
        invoice_number: inv?.invoice_number ?? '(tanpa nomor)',
        amount_paid: bayar.amount_paid as number | string | null,
        paid_at: String(bayar.paid_at).slice(0, 10),
        cash_account_id: (bayar.cash_account_id as string | null) ?? null,
      }, peta)

      if ('galat' in susun) {
        return reply.status(422).send({ error: susun.galat, kurang: susun.kurang ?? [] })
      }

      const { data: je, error: eJe } = await request.db!
        .from('journal_entries')
        .insert({
          entry_number: `JU-BYR-${String(bayar.id).slice(0, 8)}`,
          entry_date: String(bayar.paid_at).slice(0, 10),
          description: susun.keterangan,
          source: 'payment',
          ref_type: 'payment',
          ref_id: bayar.id,
          status: 'draft',
          created_by: request.currentUser!.id,
        })
        .select('id, entry_number, entry_date, status')
        .single()

      if (eJe) {
        if (/uq_jurnal_satu_per_rujukan|duplicate key/i.test(eJe.message)) {
          return reply.status(409).send({
            error: 'Pembayaran ini sudah pernah dijurnalkan.',
          })
        }
        request.log.error({ err: eJe, id }, 'gagal membuat jurnal pembayaran')
        return reply.status(400).send({ error: eJe.message })
      }

      // ⚠ `journal_entry_lines` kategori C lewat `account_id` — `.from()`
      // melempar, dan `viaProject` menuntut SATU akun sementara jurnal punya
      // beberapa. Pola yang sama dipakai `gl.ts:217`.
      const { error: eBaris } = await request.db!
        .unsafe('journal_entry_lines', 'mewarisi tenancy dari kepala jurnal yang baru dibuat di atas')
        .insert(susun.baris.map((b) => ({
          entry_id: je!.id,
          account_id: b.account_id,
          debit: b.debit,
          credit: b.credit,
          description: b.keterangan,
        })))

      if (eBaris) {
        // Sama dengan penjurnalan invoice di atas — lihat catatan di sana.
        // `.select('id')` — nol baris terhapus SAMA BAHAYANYA dengan galat.
        //
        // Komentar di atas sudah menyatakan "hasil penghapusan DIPERIKSA",
        // tetapi `{ error }` saja hanya menangkap query yang GAGAL. Penghapusan
        // yang menyentuh nol baris meninggalkan jurnal kosong itu TETAP ADA di
        // buku besar, sementara kode ini melapor berhasil.
        //
        // Komentar yang menjanjikan lebih dari yang dilakukan kodenya adalah
        // bentuk kegagalan tersendiri: pembaca berikutnya berhenti memeriksa.
        const { data: terhapus, error: eBersih } = await request.db!
          .from('journal_entries').delete().eq('id', je!.id).select('id')
        if (eBersih || !terhapus || terhapus.length === 0) {
          request.log.error(
            { err: eBersih, jurnal: je!.entry_number },
            'jurnal kepala kosong GAGAL dibersihkan — perlu dihapus manual')
          return reply.status(500).send({
            error: `Baris jurnal gagal ditulis, dan pembatalannya juga gagal. `
              + `Jurnal ${je!.entry_number} kini KOSONG di buku besar dan harus `
              + `dihapus manual — statusnya masih draft, jadi belum masuk laporan.`,
          })
        }
        request.log.error({ err: eBaris, id }, 'baris jurnal gagal ditulis; jurnal kepala dihapus')
        return reply.status(500).send({
          error: 'Baris jurnal gagal ditulis. Jurnalnya dibatalkan.',
        })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'journal_entries',
        recordId: je!.id as string,
        newValues: { ...je, baris: susun.baris } as Record<string, unknown>,
      })

      return reply.status(201).send({ jurnal: je, baris: susun.baris })
    },
  )
}

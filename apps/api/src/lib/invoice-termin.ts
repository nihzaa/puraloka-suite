/**
 * INVOICE DARI TERMIN — satu tempat yang menerbitkannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIANGKAT KE `lib/`, BUKAN DISALIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-12 penerbitan invoice termin hidup DI DALAM rute pencatatan
 * pembayaran (`termin-payment.ts`), sebagai blok di tengah handler. Bentuk itu
 * benar selama satu-satunya cara invoice lahir adalah "ada yang mencatat
 * pembayaran".
 *
 * Automation 5.1 menuntut jalur kedua: termin yang MEMENUHI SYARAT TAGIH
 * diterbitkan invoice-nya tanpa menunggu pembayaran. Menyalin blok itu ke
 * endpoint automation berarti DUA tempat menerbitkan dokumen yang keluar ke
 * KLIEN — dan dua tempat yang menomori invoice dengan cara berbeda pasti
 * berselisih, seperti yang sudah tertulis di komentar rute itu sendiri.
 *
 * Selisihnya baru terlihat saat dua nomor bertabrakan, yaitu di dokumen yang
 * sudah terkirim ke pelanggan.
 *
 * Jadi logikanya diangkat ke sini, dan KEDUA pemanggil memakai fungsi yang
 * sama. Yang tinggal di rute hanya urusan pembayaran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA HAL YANG DIPERTAHANKAN PERSIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   NOMOR    `next_document_number` (counter transaksional), BUKAN
 *            `COUNT(*) + 1`. Menghapus invoice terakhir tak boleh membuat
 *            nomornya lahir kembali.
 *   PREFIX   dari `companies.invoice_prefix`, bukan "PRL" yang dipaku —
 *            tenant lain tak boleh menerbitkan invoice bersingkatan
 *            perusahaan orang lain.
 *   PAJAK    `calculateTax` + tarif EFFECTIVE pada tanggal dokumen.
 *
 * Ketiganya cacat yang sudah pernah diperbaiki. Memindahkan kode adalah cara
 * termudah menghidupkannya kembali, jadi ketiganya ikut pindah utuh.
 */
import type { FastifyRequest } from 'fastify'
import { supabase } from '../utils/supabase.js'
import { calculateTax } from './tax-calculation.js'
import { getTaxRate } from '../utils/financial-config.js'

/** Termin yang hendak ditagihkan. */
export interface TerminUntukInvoice {
  id: string
  amount: number | string
  project_id: string
}

/** Proyek pemilik termin — dibutuhkan untuk skema pajaknya. */
export interface ProyekUntukInvoice {
  id: string
  tax_scheme: string | null
}

export type HasilInvoice =
  | { ok: true; invoiceId: string; nomor: string; baru: boolean; total: number }
  | { ok: false; alasan: 'nomor_gagal' | 'insert_gagal' | 'baca_gagal'; pesan: string }

/**
 * Terbitkan invoice untuk satu termin — atau kembalikan yang sudah ada.
 *
 * ── Idempoten lewat DATA, bukan lewat penanda terpisah
 *
 * Kunci uniknya `invoices.termin_schedule_id`: satu termin, satu invoice.
 * Pemanggil kedua mendapat `baru: false` dan id yang sama, bukan invoice
 * kembar. Tak ada tabel status terpisah yang bisa melenceng dari kenyataan.
 *
 * ── TIDAK melempar
 *
 * Sama seperti `chat()` di lapisan AI. Pemanggil dari automation menjawab
 * kegagalan dengan mencatat dan lanjut ke termin berikutnya; pemanggil dari
 * rute pembayaran menjawab 500. Melempar memaksa keduanya menebak artinya.
 *
 * @param tanggalDokumen ANCHOR DATE pajak — 'YYYY-MM-DD'. Dari rute
 *   pembayaran ini `paid_at`; dari automation, hari ini. Bukan `now()` di
 *   dalam fungsi: tarif pajak dibaca EFFECTIVE pada tanggal dokumen, dan
 *   invoice yang diterbitkan untuk transaksi bulan lalu harus memakai tarif
 *   bulan lalu.
 */
export async function terbitkanInvoiceTermin(
  request: FastifyRequest,
  termin: TerminUntukInvoice,
  proyek: ProyekUntukInvoice,
  tanggalDokumen: string,
  createdBy: string,
): Promise<HasilInvoice> {
  const projectId = proyek.id

  // ── Sudah ada? Kembalikan yang itu. ──────────────────────────────────────
  const { data: adaInvoice, error: eBaca } = await request.db!
    .viaProject('invoices', projectId)
    .select('id, invoice_number, total_amount')
    .eq('termin_schedule_id', termin.id)
    .maybeSingle()

  if (eBaca) {
    return { ok: false, alasan: 'baca_gagal', pesan: eBaca.message }
  }
  if (adaInvoice) {
    return {
      ok: true,
      invoiceId: adaInvoice.id as string,
      nomor: (adaInvoice.invoice_number as string) ?? '',
      baru: false,
      total: Number(adaInvoice.total_amount ?? 0),
    }
  }

  // ── Nomor: counter transaksional ─────────────────────────────────────────
  const tgl = new Date(tanggalDokumen)
  const year = tgl.getFullYear()
  const month = String(tgl.getMonth() + 1).padStart(2, '0')

  const { data: barisCompany } = await request.db!
    .unsafe('companies', 'tabel tenant itu sendiri; di-scope eq(id, companyId)')
    .select('invoice_prefix')
    .eq('id', request.companyId!)
    .maybeSingle()

  const prefix = (barisCompany as { invoice_prefix?: string } | null)?.invoice_prefix ?? 'INV'
  const awalanNomor = `${prefix}/${year}/${month}/`

  const { data: nomorUrut, error: eNomor } = await supabase.rpc('next_document_number', {
    p_company_id: request.companyId!,
    p_doc_type:   'invoice',
    p_period:     `${year}-${month}`,
    p_prefix:     awalanNomor,
  })

  // Galat DIPERIKSA: nomor yang gagal diambil tak boleh jadi nol —
  // `String(null).padStart` menghasilkan "null", dan invoice lahir bernomor
  // `INV/2026/08/null` di dokumen yang keluar ke klien.
  if (eNomor) {
    return { ok: false, alasan: 'nomor_gagal', pesan: eNomor.message }
  }

  const urut = String(nomorUrut).padStart(3, '0')
  const nomorInvoice = `${awalanNomor}${urut}`

  // ── Pajak: tarif EFFECTIVE pada tanggal dokumen ──────────────────────────
  const tarif = await getTaxRate(proyek.tax_scheme, tanggalDokumen)
  const { baseAmount, taxAmount, totalAmount } = calculateTax(
    Number(termin.amount), proyek.tax_scheme, tarif,
  )

  // Jatuh tempo 14 hari sesudah terbit — sama dengan jalur pembayaran.
  const jatuhTempo = new Date(tgl)
  jatuhTempo.setDate(jatuhTempo.getDate() + 14)

  const { data: invoiceBaru, error: eInsert } = await request.db!
    .viaProject('invoices', projectId)
    .insert({
      project_id: projectId,
      termin_schedule_id: termin.id,
      invoice_number: nomorInvoice,
      invoice_type: 'termin_billing',
      base_amount: baseAmount,
      commission_amount: 0,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      amount_paid: 0,
      amount_due: totalAmount,
      issued_date: tanggalDokumen,
      due_date: jatuhTempo.toISOString().split('T')[0],
      status: 'sent',
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (eInsert || !invoiceBaru) {
    return {
      ok: false,
      alasan: 'insert_gagal',
      pesan: eInsert?.message ?? 'invoice tak terbentuk',
    }
  }

  return {
    ok: true,
    invoiceId: invoiceBaru.id as string,
    nomor: nomorInvoice,
    baru: true,
    total: totalAmount,
  }
}

/**
 * Apakah termin ini sudah memenuhi syarat tagih?
 *
 * Aturannya SAMA dengan yang dipakai `check-deadlines` untuk memutuskan kapan
 * mengirim notifikasi "Termin Siap Ditagih" (`notifications.ts:523`). Diangkat
 * ke sini supaya notifikasi dan penerbitan invoice tak pernah berbeda pendapat
 * tentang termin yang sama — kalau berbeda, orang menerima peringatan untuk
 * termin yang invoice-nya tak kunjung terbit, atau sebaliknya.
 */
export function terminSiapTagih(
  triggerType: string | null,
  triggerPct: number | null,
  progressProyek: number | null,
): boolean {
  if (triggerType === 'on_sign') return true
  if (triggerType === 'on_progress') {
    if (triggerPct === null) return false
    return Number(progressProyek ?? 0) >= Number(triggerPct)
  }
  return false
}

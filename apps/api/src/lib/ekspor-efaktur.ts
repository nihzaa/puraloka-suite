/**
 * EKSPOR e-FAKTUR — CSV skema impor DJP (FK / LT / OF).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI DIBANGUN MESKI PURALOKA BELUM PKP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ekspor-bupot.ts` dibangun lebih dulu dengan alasan yang benar UNTUK
 * PURALOKA: 18 dari 18 catatan pajaknya `pph_final_42`, nol PPN.
 *
 * Founder mengoreksi lingkupnya 2026-08-17, dan koreksinya tepat: ini produk
 * SaaS multi-tenant. Tenant lain PASTI ada yang PKP, dan bagi mereka Faktur
 * Pajak adalah kewajiban BULANAN — bukan fitur pelengkap.
 *
 * Menyempitkan keputusan produk ke data satu tenant adalah kesalahan yang
 * sama bentuknya dengan menulis angka di dokumen konteks: benar hari ini,
 * salah begitu pelanggan kedua masuk.
 *
 * ── Kenapa TIGA jenis baris, dan kenapa urutannya mengikat
 *
 * Aplikasi e-Faktur DJP menerima CSV bertingkat:
 *
 *     FK   kepala faktur   — satu per faktur (lawan transaksi, DPP, PPN)
 *     LT   lawan transaksi — alamat pembeli, mengikuti FK di atasnya
 *     OF   objek faktur    — baris barang/jasa, mengikuti LT
 *
 * Urutannya BUKAN kosmetik: importer DJP membaca berurutan dan menempelkan
 * tiap LT/OF ke FK terakhir yang dibacanya. Satu baris tertukar membuat
 * seluruh sisa berkas menempel ke faktur yang salah — dan itu tak terlihat
 * sampai SPT-nya ditolak.
 *
 * ── Kenapa DPP & PPN dibulatkan ke rupiah penuh
 *
 * DJP menolak desimal pada kolom uang. Yang lebih halus: pembulatan HARUS
 * dilakukan sekali di sini, bukan dua kali (di layar lalu di berkas) —
 * selisih satu rupiah antara faktur dan SPT cukup untuk memicu koreksi.
 */

export interface BarisFaktur {
  /** Nomor Seri Faktur Pajak dari jatah e-Nofa. Wajib, dan sekali pakai. */
  efaktur_number: string | null
  base_amount: number | string | null
  tax_amount: number | string | null
  period_month: string | null
  invoice?: {
    invoice_number?: string | null
    issued_date?: string | null
    project?: {
      name?: string | null
      client?: {
        contact_person?: string | null
        company_name?: string | null
        npwp?: string | null
        address?: string | null
      } | null
    } | null
  } | null
}

export interface HasilEksporFaktur {
  csv: string
  jumlah: number
  ditolak: Array<{ nomor: number; sebab: string }>
}

function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * NPWP 16 digit tanpa pemisah. Sengaja SAMA perilakunya dengan
 * `ekspor-bupot.ts` — dua ekspor pajak yang menormalkan NPWP dengan cara
 * berbeda akan menghasilkan dua angka untuk satu klien, dan yang menemukan
 * selisihnya adalah petugas pajak.
 */
export function npwpFaktur(npwp: string | null | undefined): string | null {
  const digit = String(npwp ?? '').replace(/\D/g, '')
  if (digit.length === 16) return digit
  if (digit.length === 15) return '0' + digit
  return null
}

/**
 * Nomor Seri Faktur Pajak: 16 digit.
 *
 * Bentuk resminya `0000000000000000` — tiga digit kode transaksi & status,
 * dua digit tahun, sebelas digit urut. Yang diperiksa di sini PANJANGNYA,
 * bukan maknanya: memvalidasi kode transaksi berarti menebak jenis
 * penyerahan, dan tebakan itu tak bisa dikoreksi sesudah faktur terbit.
 */
export function nsfpSah(nomor: string | null | undefined): string | null {
  const digit = String(nomor ?? '').replace(/\D/g, '')
  return digit.length === 16 ? digit : null
}

function sel(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Menyusun CSV e-Faktur.
 *
 * Baris tak lengkap DITOLAK beserta sebabnya — tidak dibuang diam-diam dan
 * tidak dikarang. Faktur Pajak yang isinya dikarang bukan sekadar salah: ia
 * memindahkan kewajiban PPN ke pihak yang tak pernah bertransaksi.
 */
export function susunCsvEfaktur(baris: readonly BarisFaktur[]): HasilEksporFaktur {
  const ditolak: HasilEksporFaktur['ditolak'] = []
  const isi: string[] = []

  baris.forEach((b, i) => {
    const nomor = i + 1
    const klien = b.invoice?.project?.client
    const nsfp = nsfpSah(b.efaktur_number)
    const npwp = npwpFaktur(klien?.npwp)
    const nama = klien?.company_name || klien?.contact_person || null
    const dpp = angka(b.base_amount)
    const ppn = angka(b.tax_amount)
    const periode = String(b.period_month ?? '')
    const cocokPeriode = /^(\d{4})-(\d{2})$/.exec(periode)

    if (!nsfp) {
      ditolak.push({
        nomor,
        sebab: 'Nomor Seri Faktur Pajak kosong atau bukan 16 digit — '
          + 'ambil jatahnya dari e-Nofa lebih dulu',
      })
      return
    }
    if (!npwp) { ditolak.push({ nomor, sebab: 'NPWP pembeli kosong atau bukan 15/16 digit' }); return }
    if (!nama) { ditolak.push({ nomor, sebab: 'nama pembeli kosong' }); return }
    if (dpp === null || ppn === null) { ditolak.push({ nomor, sebab: 'DPP atau PPN bukan angka' }); return }
    if (!cocokPeriode) { ditolak.push({ nomor, sebab: `masa pajak "${periode}" bukan YYYY-MM` }); return }

    const dppBulat = Math.round(dpp)
    const ppnBulat = Math.round(ppn)
    const tgl = b.invoice?.issued_date ?? ''

    // FK — kepala faktur. `01` = penyerahan kepada selain pemungut PPN,
    // bentuk paling lazim untuk kontraktor swasta.
    isi.push(['FK', '01', '0', sel(nsfp), sel(cocokPeriode[2]), sel(cocokPeriode[1]),
      sel(tgl), sel(npwp), sel(nama), sel(dppBulat), sel(ppnBulat), '0'].join(','))

    // LT — lawan transaksi. Alamat boleh kosong di berkas; DJP mengisinya
    // dari NPWP saat impor. Yang TIDAK boleh kosong justru NPWP-nya, dan itu
    // sudah dijaga di atas.
    isi.push(['LT', sel(npwp), sel(nama), sel(klien?.address ?? '')].join(','))

    // OF — objek faktur. Satu baris ringkas per faktur, bukan per item RAB:
    // yang dilaporkan ke DJP nilai penyerahannya, dan memecahnya per item
    // membuat jumlah OF tak cocok dengan DPP di FK bila ada pembulatan.
    isi.push(['OF',
      sel(`Jasa konstruksi — ${b.invoice?.project?.name ?? b.invoice?.invoice_number ?? 'proyek'}`),
      '1', sel(dppBulat), '0', sel(dppBulat), '0', sel(ppnBulat), '0', '0'].join(','))
  })

  // BOM UTF-8: alasan yang sama dengan importer & bupot — tanpanya Excel di
  // Windows merusak nama pembeli sebelum berkasnya sempat diunggah.
  const csv = '﻿' + isi.join('\r\n') + (isi.length ? '\r\n' : '')

  return { csv, jumlah: isi.length / 3, ditolak }
}

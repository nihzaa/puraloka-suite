/**
 * EKSPOR BUKTI POTONG — CSV untuk diunggah ke e-Bupot Unifikasi DJP.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA CSV UNGGAH, BUKAN SAMBUNGAN API
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog menandai `fn-efaktur` "sebagian" dengan alasan: "pembuatan
 * berkasnya lewat aplikasi DJP". Itu benar, dan tetap benar — DJP TIDAK
 * membuka API publik untuk e-Bupot. Host-to-host hanya lewat PJAP
 * bersertifikat (OnlinePajak, Pajakku, Klikpajak), berlangganan bulanan.
 *
 * Untuk satu kontraktor dengan 18 catatan pajak setahun, berlangganan PJAP
 * lebih mahal daripada mengetik ulang. Yang benar-benar menghemat waktu
 * bukan sambungan API, melainkan BERKAS yang bisa diunggah — dan itu tak
 * butuh kredensial apa pun.
 *
 * ── Kenapa BUPOT, bukan e-Faktur
 *
 * Diukur 2026-08-17: 18 dari 18 catatan pajak bertipe `pph_final_42` (PPh
 * Final Pasal 4 ayat 2 — Jasa Konstruksi). NOL PPN.
 *
 * e-Faktur adalah aplikasi PPN. Perusahaan yang belum PKP tak menerbitkan
 * Faktur Pajak sama sekali, jadi seluruh modul e-Faktur tak relevan
 * baginya — sementara Bukti Potong PPh Final justru WAJIB tiap kali klien
 * memotong pembayaran.
 *
 * Membangun ekspor e-Faktur lebih dulu berarti membangun untuk kebutuhan
 * yang belum ada, sambil membiarkan yang sudah ada tetap diketik tangan.
 *
 * ── Kenapa fungsi MURNI, tanpa I/O
 *
 * Formatnya menentukan apakah DJP menerima berkasnya. Menguji itu lewat
 * endpoint berarti menyiapkan basis, sesi, dan izin untuk memeriksa
 * SUSUNAN KOLOM — dan tiap penyusunan yang salah baru ketahuan sesudah
 * seseorang mencoba mengunggahnya ke DJP.
 *
 * Sebagai fungsi murni, tiap aturan formatnya bisa dikunci test.
 */

/** Satu baris pajak yang siap diekspor. Bentuknya cerminan `tax_records`. */
export interface BarisPajak {
  tax_type: string
  base_amount: number | string | null
  rate_pct: number | string | null
  tax_amount: number | string | null
  period_month: string | null
  efaktur_number?: string | null
  invoice?: {
    invoice_number?: string | null
    issued_date?: string | null
    project?: {
      name?: string | null
      client?: {
        contact_person?: string | null
        company_name?: string | null
        npwp?: string | null
      } | null
    } | null
  } | null
}

export interface HasilEkspor {
  csv: string
  jumlah: number
  /** Baris yang TIDAK bisa diekspor beserta sebabnya — per baris, bukan total. */
  ditolak: Array<{ nomor: number; sebab: string }>
}

/**
 * Kode objek pajak per jenis. PPh Final Jasa Konstruksi punya tarif berbeda
 * menurut kualifikasi usaha, dan kodenya IKUT berbeda.
 *
 * ⚠ Daftar ini SENGAJA pendek. Menambah kode yang belum pernah dipakai
 * perusahaan ini berarti menebak klasifikasi pajaknya — dan bukti potong
 * berkode salah ditolak DJP saat pelaporan, bukan saat diunggah.
 */
export const KODE_OBJEK: Record<string, string> = {
  // PPh Pasal 4 ayat (2) — jasa konstruksi, pelaksana berkualifikasi.
  pph_final_42: '28-403-01',
  pph_final: '28-403-01',
}

/** Angka aman: `numeric` Postgres bisa memulangkan NaN, dan NaN di kolom
 *  uang akan diam-diam jadi "0" saat diserialkan. */
function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * NPWP dinormalkan ke 16 digit TANPA pemisah.
 *
 * DJP menerima unggahan hanya bila NPWP-nya angka murni. Yang tersimpan di
 * basis lazimnya berformat `01.234.567.8-901.000` karena begitulah orang
 * menyalinnya dari kartu.
 *
 * Sejak 2024 NPWP badan 16 digit; yang masih 15 digit diberi awalan `0`
 * mengikuti aturan transisi DJP. Yang panjangnya di luar itu TIDAK ditebak —
 * ia ditolak dengan menyebut barisnya.
 */
export function normalkanNpwp(npwp: string | null | undefined): string | null {
  const digit = String(npwp ?? '').replace(/\D/g, '')
  if (digit.length === 16) return digit
  if (digit.length === 15) return '0' + digit
  return null
}

/** Satu sel CSV. Koma, kutip, dan baris baru dibungkus — nama klien seperti
 *  `PT Maju, Tbk` akan memecah barisnya kalau tidak. */
function sel(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Menyusun CSV bukti potong dari baris pajak.
 *
 * Baris yang tak lengkap TIDAK dibuang diam-diam dan TIDAK dikarang isinya —
 * ia dikembalikan di `ditolak` beserta sebabnya. Bukti potong yang datanya
 * dikarang lebih buruk daripada yang tak terbit: yang pertama beredar sebagai
 * dokumen pajak yang salah, yang kedua cuma menunggu dilengkapi.
 */
export function susunCsvBupot(baris: readonly BarisPajak[]): HasilEkspor {
  const ditolak: HasilEkspor['ditolak'] = []
  const isi: string[] = []

  // Judul kolom mengikuti skema unggah e-Bupot Unifikasi.
  const judul = [
    'NPWP', 'NAMA', 'KODE_OBJEK', 'MASA_PAJAK', 'TAHUN_PAJAK',
    'DPP', 'TARIF', 'PPH', 'NOMOR_INVOICE', 'TANGGAL',
  ]

  baris.forEach((b, i) => {
    const nomor = i + 1
    const klien = b.invoice?.project?.client
    const npwp = normalkanNpwp(klien?.npwp)
    const nama = klien?.company_name || klien?.contact_person || null
    const kode = KODE_OBJEK[b.tax_type]
    const dpp = angka(b.base_amount)
    const tarif = angka(b.rate_pct)
    const pph = angka(b.tax_amount)

    // Diperiksa satu per satu supaya sebabnya bisa disebut. Satu pesan
    // "data tak lengkap" memaksa orang menebak kolom mana yang kurang.
    if (!npwp) {
      ditolak.push({ nomor, sebab: 'NPWP klien kosong atau bukan 15/16 digit' })
      return
    }
    if (!nama) {
      ditolak.push({ nomor, sebab: 'nama klien kosong' })
      return
    }
    if (!kode) {
      ditolak.push({ nomor, sebab: `jenis pajak "${b.tax_type}" belum punya kode objek` })
      return
    }
    if (dpp === null || pph === null) {
      ditolak.push({ nomor, sebab: 'DPP atau nilai PPh bukan angka' })
      return
    }

    // `period_month` bentuknya `YYYY-MM`. Masa & tahun DIPISAH karena
    // e-Bupot memintanya begitu, dan menyatukannya membuat berkasnya ditolak
    // tanpa pesan yang menjelaskan.
    const periode = String(b.period_month ?? '')
    const cocok = /^(\d{4})-(\d{2})$/.exec(periode)
    if (!cocok) {
      ditolak.push({ nomor, sebab: `masa pajak "${periode}" bukan format YYYY-MM` })
      return
    }

    isi.push([
      sel(npwp), sel(nama), sel(kode),
      sel(Number(cocok[2])), sel(cocok[1]),
      sel(Math.round(dpp)), sel(tarif ?? ''), sel(Math.round(pph)),
      sel(b.invoice?.invoice_number ?? ''), sel(b.invoice?.issued_date ?? ''),
    ].join(','))
  })

  // ⚠ BOM UTF-8 WAJIB — alasan yang sama dengan template importer: tanpa
  // BOM, Excel di Windows membaca CSV sebagai ANSI dan nama klien ber-akhiran
  // khusus berubah bentuk sebelum sempat diunggah.
  const csv = '﻿' + [judul.join(','), ...isi].join('\r\n') + '\r\n'

  return { csv, jumlah: isi.length, ditolak }
}

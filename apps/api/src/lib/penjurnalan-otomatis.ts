// PENJURNALAN OTOMATIS — invoice & pembayaran → jurnal umum (R-012).
//
// ⚠ EMBER [C] TIDAK dilanggar. Yang jadi data adalah PEMETAAN AKUN; struktur
//   jurnalnya (baris apa saja, debit atau kredit, dari kolom mana) tetap di
//   kode dan tetap tunduk `trg_gl_wajib_seimbang`.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI MENOLAK BEKERJA SAMPAI PETANYA DIISI
// ══════════════════════════════════════════════════════════════════════════
//
// Jurnal yang salah petakan menghasilkan laporan keuangan yang **salah dengan
// meyakinkan**. Slip gaji yang salah masih bisa dibantah penerimanya; neraca
// yang salah tak punya siapa pun yang membantah sampai auditor datang —
// dan saat itu jurnalnya sudah ribuan.
//
// Karena itu `susunJurnalInvoice` mengembalikan `{ galat }` bila peta akunnya
// belum lengkap, BUKAN memakai akun bawaan yang kelihatan masuk akal. Bawaan
// yang kelihatan masuk akal adalah bentuk paling berbahaya dari menebak: ia
// tak pernah ditanyakan siapa pun karena hasilnya terlihat wajar.
//
// Pelajaran yang sama dengan tarif payroll (G2a).
//
// ══════════════════════════════════════════════════════════════════════════
// BENTUK JURNAL, DAN DASARNYA (RATIFIKASI R-012)
// ══════════════════════════════════════════════════════════════════════════
//
// INVOICE TERMIN — pendapatan diakui saat invoice TERBIT (akrual, PSAK 72):
//
//   Dr  Piutang Usaha         (total tertagih − retensi − potongan uang muka)
//   Dr  Retensi Ditahan       (retensi_amount)          ← ASET, bukan pengurang
//   Dr  Uang Muka Klien       (dp_deduction_amount)     ← melunasi liabilitas
//       Cr  Pendapatan Termin (base_amount + commission_amount)
//       Cr  PPN Keluaran      (tax_amount, bila skema ppn)     ← TITIPAN
//       atau
//   Dr  Beban PPh Final       (tax_amount, bila skema pph_final) ← BEBAN
//       Cr  Piutang Usaha ... (sudah termasuk di atas)
//
// ── Kenapa retensi DIDEBIT sebagai aset, bukan mengurangi pendapatan
//
// Pekerjaannya sudah dilakukan dan pendapatannya sudah diakui penuh; yang
// belum adalah HAKNYA MENAGIH sampai masa pemeliharaan berakhir. Mencatat
// retensi sebagai pengurang pendapatan membuat laba periode ini turun padahal
// pekerjaannya selesai — menyesatkan justru pada angka yang dipakai menilai
// kinerja proyek.
//
// ── Kenapa PPh final dan PPN diperlakukan BERBEDA
//
//   PPh final 2%  BEBAN perusahaan — mengurangi laba (didebit)
//   PPN 11%       TITIPAN dari pelanggan — utang ke negara (dikredit)
//
// Mencampur keduanya di satu akun membuat laba terlihat lebih besar dari yang
// sebenarnya: beban yang dicatat sebagai utang tak pernah muncul di laba rugi.
//
// PEMBAYARAN — kas masuk melunasi piutang:
//
//   Dr  Kas/Bank
//       Cr  Piutang Usaha
//
// Pendapatan TIDAK disentuh di sini — ia sudah diakui saat invoice terbit.
// Mengakuinya lagi saat pembayaran adalah penggandaan pendapatan.

export type JenisPetaAkun =
  | 'pendapatan_termin' | 'piutang_usaha' | 'retensi_ditahan'
  | 'uang_muka_klien' | 'ppn_keluaran' | 'pph_final' | 'kas_bank'

/** Peta akun: jenis → id akun. Kosong berarti belum ditetapkan founder. */
export type PetaAkun = Partial<Record<JenisPetaAkun, string>>

export interface BarisJurnal {
  account_id: string
  debit: number
  credit: number
  /** Untuk pembaca manusia — bukan dipakai perhitungan. */
  keterangan: string
}

export interface InvoiceUntukJurnal {
  id: string
  invoice_number: string
  /** `YYYY-MM-DD` */
  issued_date: string
  base_amount: number | string | null
  commission_amount: number | string | null
  tax_amount: number | string | null
  retensi_amount: number | string | null
  dp_deduction_amount: number | string | null
  total_amount: number | string | null
  /** `pph_final` atau `ppn` — dari `projects.tax_scheme`. */
  tax_scheme: string | null
}

export interface PembayaranUntukJurnal {
  id: string
  invoice_id: string
  invoice_number: string
  amount_paid: number | string | null
  /** `YYYY-MM-DD` */
  paid_at: string
  /** Akun kas tujuan bila diketahui; `null` → pakai peta `kas_bank`. */
  cash_account_id: string | null
}

/**
 * numeric Postgres → angka.
 *
 * `null` untuk yang TAK TERBACA, bukan 0 — pelajaran G5. Di sini bedanya
 * menentukan: nominal yang gagal dibaca lalu dianggap 0 menghasilkan jurnal
 * yang SEIMBANG tetapi SALAH, dan `trg_gl_wajib_seimbang` tak akan
 * menangkapnya karena ia memang seimbang.
 */
function angka(v: number | string | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Nol untuk medan OPSIONAL yang memang boleh kosong (retensi, potongan DP).
 *
 * ⚠ `angka()` dipanggil untuk yang BUKAN kosong, dan penjaga `s === ''` di
 * dalamnya karena itu tak pernah tercapai dari sini. Mutasi membuktikannya:
 * melepas penjaga itu tak mengubah satu pun keluaran modul ini, karena kedua
 * pemakaian `angka()` yang tersisa (base_amount, amount_paid) sudah dijaga
 * `<= 0` yang menangkap 0 maupun hasil `Number('')`.
 *
 * Penjaganya TETAP ada — bukan karena berakibat di sini, melainkan karena
 * `angka()` mengembalikan `number | null` dan kontrak itu harus benar untuk
 * pemanggil berikutnya. Yang keliru adalah menganggapnya penjaga perilaku;
 * ia penjaga TIPE.
 */
function angkaAtauNol(v: number | string | null | undefined): number | null {
  if (v == null) return 0
  // String kosong/spasi = medan yang memang dibiarkan kosong → NOL.
  // Teks bukan-angka BUKAN nol — itu data rusak, dan `angka()` menjawab
  // `null` yang lalu MENOLAK jurnalnya.
  if (typeof v === 'string' && v.trim() === '') return 0
  return angka(v)
}

export interface HasilSusun {
  baris: BarisJurnal[]
  /** Ringkasan untuk `journal_entries.description`. */
  keterangan: string
  total_debit: number
  total_kredit: number
}

export type Susun = HasilSusun | { galat: string; kurang?: JenisPetaAkun[] }

/** Pembulatan 2 desimal — sama dengan `numeric(18,2)` di basis. */
const bulat = (n: number) => Math.round(n * 100) / 100

/**
 * Jenis peta yang WAJIB ada untuk menjurnalkan invoice.
 *
 * `retensi_ditahan` dan `uang_muka_klien` hanya wajib bila invoice-nya
 * memang memuat keduanya — menuntutnya selalu akan menghalangi perusahaan
 * yang tak pernah memakai retensi.
 */
export function petaWajibInvoice(inv: InvoiceUntukJurnal): JenisPetaAkun[] {
  const wajib: JenisPetaAkun[] = ['pendapatan_termin', 'piutang_usaha']
  if ((angkaAtauNol(inv.retensi_amount) ?? 0) > 0) wajib.push('retensi_ditahan')
  if ((angkaAtauNol(inv.dp_deduction_amount) ?? 0) > 0) wajib.push('uang_muka_klien')
  if ((angkaAtauNol(inv.tax_amount) ?? 0) > 0) {
    wajib.push(inv.tax_scheme === 'ppn' ? 'ppn_keluaran' : 'pph_final')
  }
  return wajib
}

/**
 * Menyusun baris jurnal dari satu invoice.
 *
 * Mengembalikan `{ galat }` bila peta akunnya belum lengkap ATAU nominalnya
 * tak terbaca — tak pernah menebak.
 */
export function susunJurnalInvoice(
  inv: InvoiceUntukJurnal,
  peta: PetaAkun,
): Susun {
  const wajib = petaWajibInvoice(inv)
  const kurang = wajib.filter((j) => !peta[j])
  if (kurang.length > 0) {
    return {
      galat: 'Peta akun belum lengkap untuk invoice ini. Tetapkan dulu di '
        + 'Pengaturan → Peta Akun Jurnal — penjurnalan yang menebak akun '
        + 'menghasilkan laporan keuangan yang salah dengan meyakinkan.',
      kurang,
    }
  }

  const dasar = angka(inv.base_amount)
  if (dasar === null || dasar <= 0) {
    return { galat: `Nilai dasar invoice ${inv.invoice_number} tak terbaca atau nol` }
  }
  const komisi = angkaAtauNol(inv.commission_amount)
  const pajak = angkaAtauNol(inv.tax_amount)
  const retensi = angkaAtauNol(inv.retensi_amount)
  const potonganDp = angkaAtauNol(inv.dp_deduction_amount)
  if (komisi === null || pajak === null || retensi === null || potonganDp === null) {
    return {
      galat: `Ada nominal invoice ${inv.invoice_number} yang tak terbaca. `
        + 'Jurnal tak disusun — nominal yang dianggap nol menghasilkan jurnal '
        + 'yang seimbang tetapi salah, dan basis tak akan menangkapnya.',
    }
  }

  const pendapatan = bulat(dasar + komisi)
  const berPpn = inv.tax_scheme === 'ppn'

  const baris: BarisJurnal[] = []

  // ── SISI KREDIT: pendapatan (dan PPN bila ada) ───────────────────────────
  baris.push({
    account_id: peta.pendapatan_termin!,
    debit: 0, credit: pendapatan,
    keterangan: komisi > 0
      ? `Pendapatan termin ${inv.invoice_number} (termasuk komisi)`
      : `Pendapatan termin ${inv.invoice_number}`,
  })

  if (pajak > 0 && berPpn) {
    // PPN = titipan dari pelanggan → utang ke negara.
    baris.push({
      account_id: peta.ppn_keluaran!,
      debit: 0, credit: bulat(pajak),
      keterangan: `PPN keluaran ${inv.invoice_number}`,
    })
  }

  // ── SISI DEBIT ───────────────────────────────────────────────────────────
  if (pajak > 0 && !berPpn) {
    // PPh final = BEBAN perusahaan → mengurangi laba.
    baris.push({
      account_id: peta.pph_final!,
      debit: bulat(pajak), credit: 0,
      keterangan: `PPh final ${inv.invoice_number}`,
    })
  }

  if (retensi > 0) {
    baris.push({
      account_id: peta.retensi_ditahan!,
      debit: bulat(retensi), credit: 0,
      keterangan: `Retensi ditahan ${inv.invoice_number}`,
    })
  }

  if (potonganDp > 0) {
    // Memotong uang muka = MELUNASI liabilitas yang sudah dicatat saat uang
    // mukanya diterima.
    baris.push({
      account_id: peta.uang_muka_klien!,
      debit: bulat(potonganDp), credit: 0,
      keterangan: `Potongan uang muka ${inv.invoice_number}`,
    })
  }

  // Piutang = sisanya. Dihitung sebagai SELISIH, bukan dari `total_amount` —
  // karena `total_amount` bisa saja tak konsisten dengan komponennya, dan
  // jurnal yang tak seimbang akan ditolak trigger dengan pesan yang tak
  // menjelaskan sebabnya.
  const kredit = baris.reduce((a, b) => a + b.credit, 0)
  const debitSejauhIni = baris.reduce((a, b) => a + b.debit, 0)
  const piutang = bulat(kredit - debitSejauhIni)

  if (piutang < 0) {
    return {
      galat: `Invoice ${inv.invoice_number}: retensi + potongan uang muka + PPh `
        + 'melebihi nilai tagihannya. Periksa kembali nominalnya — jurnal '
        + 'dengan piutang negatif tak masuk akal.',
    }
  }

  if (piutang > 0) {
    baris.push({
      account_id: peta.piutang_usaha!,
      debit: piutang, credit: 0,
      keterangan: `Piutang ${inv.invoice_number}`,
    })
  }

  const totalDebit = bulat(baris.reduce((a, b) => a + b.debit, 0))
  const totalKredit = bulat(baris.reduce((a, b) => a + b.credit, 0))

  // Pemeriksaan terakhir sebelum menyentuh basis. `trg_gl_wajib_seimbang`
  // adalah lapis terakhir; ini lapis yang bisa menjelaskan sebabnya.
  if (totalDebit !== totalKredit) {
    return {
      galat: `Jurnal ${inv.invoice_number} tak seimbang: debit ${totalDebit} `
        + `vs kredit ${totalKredit}. Ini cacat perhitungan, bukan data — laporkan.`,
    }
  }

  return {
    baris,
    keterangan: `Invoice ${inv.invoice_number}`,
    total_debit: totalDebit,
    total_kredit: totalKredit,
  }
}

/**
 * Menyusun baris jurnal dari satu pembayaran.
 *
 * Pendapatan TIDAK disentuh — ia sudah diakui saat invoice terbit (akrual).
 * Mengakuinya lagi di sini adalah penggandaan pendapatan, dan itu tak
 * tertangkap invariant mana pun karena jurnalnya tetap seimbang.
 */
export function susunJurnalPembayaran(
  bayar: PembayaranUntukJurnal,
  peta: PetaAkun,
): Susun {
  const kurang: JenisPetaAkun[] = []
  if (!peta.piutang_usaha) kurang.push('piutang_usaha')
  // Akun kas boleh datang dari pembayarannya sendiri (`cash_account_id`);
  // peta `kas_bank` hanya cadangan bila pembayaran tak menyebutkannya.
  if (!bayar.cash_account_id && !peta.kas_bank) kurang.push('kas_bank')
  if (kurang.length > 0) {
    return {
      galat: 'Peta akun belum lengkap untuk pembayaran ini. Tetapkan dulu di '
        + 'Pengaturan → Peta Akun Jurnal.',
      kurang,
    }
  }

  const nilai = angka(bayar.amount_paid)
  if (nilai === null || nilai <= 0) {
    return { galat: `Nilai pembayaran untuk ${bayar.invoice_number} tak terbaca atau nol` }
  }

  const nilaiBulat = bulat(nilai)
  const baris: BarisJurnal[] = [
    {
      account_id: bayar.cash_account_id ?? peta.kas_bank!,
      debit: nilaiBulat, credit: 0,
      keterangan: `Penerimaan pembayaran ${bayar.invoice_number}`,
    },
    {
      account_id: peta.piutang_usaha!,
      debit: 0, credit: nilaiBulat,
      keterangan: `Pelunasan piutang ${bayar.invoice_number}`,
    },
  ]

  return {
    baris,
    keterangan: `Pembayaran ${bayar.invoice_number}`,
    total_debit: nilaiBulat,
    total_kredit: nilaiBulat,
  }
}

export interface KesiapanPeta {
  /**
   * Peta sudah cukup untuk menjurnalkan?
   *
   * `null` bila peta KOSONG SAMA SEKALI — itu keadaan yang berbeda dari
   * "belum lengkap": yang pertama berarti founder belum pernah menetapkannya,
   * yang kedua berarti ada yang tertinggal. Layar mengatakan hal berbeda
   * untuk keduanya.
   */
  siap: boolean | null
  ditetapkan: JenisPetaAkun[]
  kurang: JenisPetaAkun[]
}

/**
 * Jenis yang WAJIB ada agar penjurnalan bisa berjalan sama sekali.
 *
 * Retensi, uang muka, dan pajak TIDAK di sini — ketiganya hanya wajib bila
 * transaksinya memang memuatnya (lihat `petaWajibInvoice`).
 */
export const PETA_MINIMUM: JenisPetaAkun[] = [
  'pendapatan_termin', 'piutang_usaha', 'kas_bank',
]

export function periksaKesiapanPeta(peta: PetaAkun): KesiapanPeta {
  const ditetapkan = (Object.keys(peta) as JenisPetaAkun[]).filter((j) => peta[j])
  if (ditetapkan.length === 0) {
    return { siap: null, ditetapkan: [], kurang: PETA_MINIMUM }
  }
  const kurang = PETA_MINIMUM.filter((j) => !peta[j])
  return { siap: kurang.length === 0, ditetapkan, kurang }
}

/** Label yang bisa dibaca manusia — dipakai pesan galat dan layar. */
export const LABEL_PETA: Record<JenisPetaAkun, string> = {
  pendapatan_termin: 'Pendapatan termin',
  piutang_usaha: 'Piutang usaha',
  retensi_ditahan: 'Retensi ditahan',
  uang_muka_klien: 'Uang muka klien',
  ppn_keluaran: 'PPN keluaran',
  pph_final: 'Beban PPh final',
  kas_bank: 'Kas / bank',
}

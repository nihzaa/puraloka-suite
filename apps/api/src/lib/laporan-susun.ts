/**
 * REPORT BUILDER — laporan yang disusun sendiri, TANPA membiarkan pengguna
 * menulis query (G6d).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KEPUTUSAN BENTUK YANG PALING MENENTUKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Report builder" biasanya diartikan sebagai layar yang membiarkan pengguna
 * menyusun query: pilih tabel, pilih kolom, tulis kondisi. Bentuk itu **tidak
 * dibangun di sini**, dan alasannya bukan kemalasan:
 *
 *   1. **SQL injection.** Kondisi yang diketik pengguna, betapa pun disaring,
 *      adalah teks yang berakhir di query. Setiap penyaring adalah tebakan
 *      tentang apa yang berbahaya, dan tebakan itu selalu tertinggal dari
 *      yang menyerangnya.
 *
 *   2. **Kebocoran tenant — yang lebih halus dan lebih mahal.** Query bebas
 *      melewati `request.db` yang sadar-tenant. Satu JOIN ke tabel yang tak
 *      punya `company_id` sudah cukup untuk menarik data perusahaan lain, dan
 *      hasilnya terlihat seperti laporan yang wajar. Tak ada galat, tak ada
 *      gejala.
 *
 * Yang dibangun: **sumber data TERDAFTAR**. Tiap sumber menyatakan tabelnya,
 * kolom yang boleh dipilih, dan bagaimana ia disaring per tenant. Pengguna
 * memilih dari daftar itu — tak pernah mengetik nama tabel maupun kondisi.
 *
 * Konsekuensinya jujur: laporan yang belum ada sumbernya **tidak bisa
 * dibuat**, dan menambah sumber butuh menyentuh kode. Itu batas yang
 * disengaja — ia menukar keleluasaan dengan jaminan bahwa tak ada laporan
 * yang bisa membaca data yang tak boleh dibacanya.
 *
 * ── Daftar ini dijaga terhadap SKEMA NYATA
 *
 * `scripts/audit-sumber-laporan-nyata.mjs` mencocokkan tiap tabel dan kolom
 * di bawah dengan `information_schema`, dan memeriksa bahwa kolom penyaring
 * tenant-nya benar-benar ada. Tanpa penjaga itu, kolom karangan LOLOS seluruh
 * pemeriksaan pustaka ini — ia ada di daftar, jadi sah — lalu gagal di basis
 * dengan pesan yang menunjuk query. Sudah terjadi sekali: `project_expenses`
 * didaftarkan dengan kolom `amount`, padahal yang ada `total_amount`.
 */

import type { TabelTerklasifikasi } from '../utils/tenant-map.generated.js'

/** Jenis kolom — menentukan operator yang masuk akal dan cara memformat. */
export type JenisKolom = 'teks' | 'angka' | 'uang' | 'tanggal' | 'bool'

export interface Kolom {
  kunci: string
  label: string
  jenis: JenisKolom
}

export interface SumberData {
  kunci: string
  label: string
  keterangan: string
  /**
   * Nama tabel — dari KODE, tak pernah dari masukan pengguna.
   *
   * Tipenya `TabelTerklasifikasi`, bukan `string`: tabel yang tak ada di peta
   * tenancy ditolak **oleh tsc**, bukan hanya oleh penjaga. Itu jaring kedua
   * yang berbeda sifatnya — penjaga berjalan di CI, tsc berjalan saat menulis.
   *
   * Dan yang lebih penting: `.unsafe()` maupun `.viaProject()` menuntut tipe
   * ini. Memaksanya lewat `as string` akan membuat sumber yang lupa
   * didaftarkan di peta tenancy lolos diam-diam — dan tabel yang tak
   * terklasifikasi berarti tak ada yang tahu bagaimana ia disaring.
   */
  tabel: TabelTerklasifikasi
  /**
   * Bagaimana barisnya disaring ke tenant.
   *
   * `company` — tabel punya `company_id`, `request.db.from()` sudah menjaga.
   * `project` — disaring lewat `project_id` (`viaProject`).
   *
   * Sumber tanpa salah satu dari keduanya TIDAK BOLEH didaftarkan.
   */
  tenancy: 'company' | 'project'
  kolom: Kolom[]
  /** Izin yang harus dimiliki untuk memakai sumber ini. */
  izin: string
}

/**
 * Daftar sumber. Ditulis di KODE — bukan tabel konfigurasi.
 *
 * Menaruhnya di basis akan membuat "tabel mana yang boleh dibaca laporan"
 * bisa diubah lewat UI, dan itu memindahkan keputusan keamanan ke tempat yang
 * paling mudah salah tekan.
 */
export const SUMBER: SumberData[] = [
  {
    kunci: 'proyek',
    label: 'Proyek',
    keterangan: 'Daftar proyek beserta nilai kontrak dan statusnya.',
    tabel: 'projects',
    tenancy: 'company',
    izin: 'projects:view',
    kolom: [
      { kunci: 'name', label: 'Nama proyek', jenis: 'teks' },
      { kunci: 'status', label: 'Status', jenis: 'teks' },
      { kunci: 'contract_value', label: 'Nilai kontrak', jenis: 'uang' },
      { kunci: 'start_date', label: 'Mulai', jenis: 'tanggal' },
      { kunci: 'end_date', label: 'Selesai (rencana)', jenis: 'tanggal' },
      { kunci: 'actual_end_date', label: 'Selesai (nyata)', jenis: 'tanggal' },
      { kunci: 'progress_pct', label: 'Progres (%)', jenis: 'angka' },
    ],
  },
  {
    kunci: 'invoice',
    label: 'Invoice',
    keterangan: 'Tagihan ke klien beserta nilai dan statusnya.',
    tabel: 'invoices',
    tenancy: 'project',
    izin: 'finance:view',
    kolom: [
      { kunci: 'invoice_number', label: 'Nomor', jenis: 'teks' },
      { kunci: 'issued_date', label: 'Tanggal terbit', jenis: 'tanggal' },
      { kunci: 'due_date', label: 'Jatuh tempo', jenis: 'tanggal' },
      { kunci: 'base_amount', label: 'Nilai dasar', jenis: 'uang' },
      { kunci: 'tax_amount', label: 'Pajak', jenis: 'uang' },
      { kunci: 'retensi_amount', label: 'Retensi', jenis: 'uang' },
      { kunci: 'total_amount', label: 'Total tagihan', jenis: 'uang' },
      { kunci: 'status', label: 'Status', jenis: 'teks' },
    ],
  },
  {
    kunci: 'pengeluaran',
    label: 'Pengeluaran',
    keterangan: 'Biaya yang dikeluarkan per proyek.',
    tabel: 'project_expenses',
    tenancy: 'project',
    izin: 'finance:view',
    kolom: [
      { kunci: 'description', label: 'Keterangan', jenis: 'teks' },
      { kunci: 'expense_date', label: 'Tanggal', jenis: 'tanggal' },
      // `total_amount`, BUKAN `amount` — nama kolomnya diukur, bukan ditebak.
      // Versi pertama memakai `amount` yang tak ada; kolom karangan lolos
      // seluruh pemeriksaan pustaka ini (ia ada di daftar) lalu gagal di
      // basis dengan pesan yang menunjuk query, bukan ke daftar sumber.
      // Itulah yang melahirkan `audit-sumber-laporan-nyata.mjs`.
      { kunci: 'total_amount', label: 'Jumlah', jenis: 'uang' },
      { kunci: 'vendor_name', label: 'Vendor', jenis: 'teks' },
      { kunci: 'status', label: 'Status', jenis: 'teks' },
    ],
  },
]

export const OPERATOR = {
  teks: ['=', 'mengandung', 'diawali'],
  angka: ['=', '>', '>=', '<', '<='],
  uang: ['=', '>', '>=', '<', '<='],
  tanggal: ['=', '>=', '<='],
  bool: ['='],
} as const satisfies Record<JenisKolom, readonly string[]>

export interface Saringan {
  kolom: string
  operator: string
  nilai: string
}

export interface Susunan {
  sumber: string
  kolom: string[]
  saringan?: Saringan[]
  urut?: { kolom: string; arah: 'naik' | 'turun' }
  batas?: number
}

/** Batas baris. Bukan kesopanan — laporan sejuta baris membekukan peramban. */
export const BATAS_BAWAAN = 500
export const BATAS_MAKS = 5000

export function cariSumber(kunci: string): SumberData | null {
  return SUMBER.find((s) => s.kunci === kunci) ?? null
}

export type HasilPeriksa =
  | { sah: true; sumber: SumberData; susunan: Required<Omit<Susunan, 'urut'>> & { urut: Susunan['urut'] } }
  | { sah: false; galat: string }

/**
 * Memeriksa susunan yang diminta.
 *
 * Setiap nama — sumber, kolom, kolom saringan, kolom urut — DICOCOKKAN dengan
 * daftar. Yang tak ada di daftar ditolak, bukan disaring: menyaring berarti
 * menebak apa yang berbahaya, dan yang lolos dari tebakan itu berakhir di
 * query.
 */
export function periksaSusunan(s: Susunan): HasilPeriksa {
  const sumber = cariSumber(s.sumber)
  if (!sumber) {
    return { sah: false, galat: `Sumber data tidak dikenal: ${s.sumber}` }
  }

  const kolomSah = new Set(sumber.kolom.map((k) => k.kunci))

  if (!Array.isArray(s.kolom) || s.kolom.length === 0) {
    return { sah: false, galat: 'Pilih minimal satu kolom' }
  }
  const kolomAsing = s.kolom.filter((k) => !kolomSah.has(k))
  if (kolomAsing.length > 0) {
    return {
      sah: false,
      galat: `Kolom tidak dikenal pada sumber "${sumber.label}": ${kolomAsing.join(', ')}`,
    }
  }

  const saringan = s.saringan ?? []
  for (const f of saringan) {
    const kol = sumber.kolom.find((k) => k.kunci === f.kolom)
    if (!kol) {
      return { sah: false, galat: `Kolom saringan tidak dikenal: ${f.kolom}` }
    }
    const sah = OPERATOR[kol.jenis] as readonly string[]
    if (!sah.includes(f.operator)) {
      return {
        sah: false,
        galat: `Operator "${f.operator}" tak berlaku untuk ${kol.label} `
          + `(${kol.jenis}). Yang berlaku: ${sah.join(', ')}`,
      }
    }
    // Nilai KOSONG ditolak, bukan diperlakukan sebagai "tanpa saringan".
    // Saringan yang diam-diam hilang menghasilkan laporan yang jauh lebih
    // besar dari yang diminta — dan terlihat sah.
    if (f.nilai === undefined || f.nilai === null || String(f.nilai).trim() === '') {
      return { sah: false, galat: `Nilai saringan untuk ${kol.label} wajib diisi` }
    }
    if (kol.jenis === 'angka' || kol.jenis === 'uang') {
      // `Number('')` adalah 0 — sudah ditolak di atas. Yang dijaga di sini
      // teks yang bukan angka sama sekali.
      if (!Number.isFinite(Number(f.nilai))) {
        return { sah: false, galat: `Nilai saringan untuk ${kol.label} harus angka` }
      }
    }
    if (kol.jenis === 'tanggal' && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.nilai))) {
      return { sah: false, galat: `Nilai saringan untuk ${kol.label} harus tanggal (YYYY-MM-DD)` }
    }
  }

  if (s.urut && !kolomSah.has(s.urut.kolom)) {
    return { sah: false, galat: `Kolom urut tidak dikenal: ${s.urut.kolom}` }
  }
  if (s.urut && s.urut.arah !== 'naik' && s.urut.arah !== 'turun') {
    return { sah: false, galat: 'Arah urut harus naik atau turun' }
  }

  const batasMinta = s.batas === undefined || s.batas === null ? BATAS_BAWAAN : Number(s.batas)
  if (!Number.isFinite(batasMinta) || batasMinta < 1) {
    return { sah: false, galat: 'Batas baris minimal 1' }
  }
  if (batasMinta > BATAS_MAKS) {
    return {
      sah: false,
      galat: `Batas baris maksimal ${BATAS_MAKS}. Laporan yang lebih besar `
        + `membekukan peramban yang membukanya — persempit saringannya.`,
    }
  }

  return {
    sah: true,
    sumber,
    susunan: {
      sumber: s.sumber,
      kolom: s.kolom,
      saringan,
      batas: batasMinta,
      urut: s.urut,
    },
  }
}

/**
 * Kolom yang diminta, sebagai daftar untuk `.select()`.
 *
 * Nilainya berasal dari `SUMBER` — bukan dari masukan pengguna — karena
 * `periksaSusunan()` sudah menolak apa pun yang tak ada di daftar. Fungsi ini
 * ada supaya sifat itu terlihat di satu tempat, bukan tersebar.
 */
export function daftarSelect(sumber: SumberData, kolom: string[]): string {
  const sah = new Set(sumber.kolom.map((k) => k.kunci))
  // Disaring SEKALI LAGI di sini. Duplikasi yang disengaja: fungsi ini bisa
  // dipanggil dari tempat yang lupa memeriksa lebih dulu, dan yang dihasilkan
  // masuk langsung ke query.
  //
  // Hasil kosong dibiarkan KOSONG, tidak diganti '*': mengganti berarti kolom
  // yang baru saja ditolak justru semuanya ikut terbaca.
  return kolom.filter((k) => sah.has(k)).join(', ')
}

/** Nilai saringan dalam bentuk yang diterima query. */
export function nilaiSaringan(jenis: JenisKolom, operator: string, nilai: string): string {
  // HANYA teks yang dibungkus persen. Kalau angka ikut dibungkus,
  // perbandingan angka berubah jadi perbandingan teks dan "9" akan terlihat
  // lebih besar dari "10".
  if (jenis === 'teks') {
    if (operator === 'mengandung') return `%${nilai}%`
    if (operator === 'diawali') return `${nilai}%`
  }
  return nilai
}

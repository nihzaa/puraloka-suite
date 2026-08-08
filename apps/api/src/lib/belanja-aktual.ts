// BELANJA AKTUAL — menyatukan biaya yang tersebar di empat tabel.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-08:
//
//   upah mingguan `paid`      43 baris   Rp 243.600.100
//   faktur supplier            5 baris   Rp  50.485.000
//   PO (komitmen)              8 baris   Rp  11.095.000
//   `project_expenses`         0 baris   Rp           0   ← YANG DIPAKAI LAPORAN
//
// `cost-control.ts` membaca `project_expenses` untuk sisi "aktual". Tabel itu
// **nol baris**, sehingga tab Varians Biaya menampilkan "Belanja aktual Rp 0"
// tepat di sebelah "Commitment Rp 11.095.000" — bukan karena belum ada
// belanja, melainkan karena **melihat ke tabel yang salah**.
//
// Hampir **Rp 300 juta** biaya nyata tak masuk laporan mana pun. Dan inilah
// yang memblokir CVR (Cost Value Reconciliation, 🔴 terakhir yang bukan
// "jangan dibangun"): ia membandingkan biaya terpakai vs nilai terpasang,
// dan sisi "biaya terpakai"-nya selama ini kosong.
//
// ── Kenapa DIHITUNG, bukan disalin ke satu tabel ringkasan
//
// Angka yang disimpan bisa basi diam-diam saat satu faktur disunting — dan
// yang paling berkepentingan menyuntingnya adalah orang yang angkanya sedang
// buruk. Pola yang sama sudah dipakai contingency ("sisa dihitung, tak
// disimpan") dan tabulasi RFQ ("menyimpannya membuat 'termurah' basi").
//
// ── Kenapa PO dipisah dari belanja
//
// PO yang terbit MENGIKAT uang tapi belum mengeluarkannya. Menjumlahkannya
// bersama biaya nyata menghitung ganda begitu barangnya datang dan fakturnya
// terbit. Keduanya dilaporkan terpisah, dan `exposure` menyatukannya untuk
// pertanyaan yang berbeda: "masih boleh belanja lagi?".

/** Sumber biaya yang disatukan. Urutannya menentukan urutan tampil. */
export const SUMBER = ['upah', 'faktur', 'belanja', 'po'] as const
export type Sumber = (typeof SUMBER)[number]

export interface BarisSumber {
  sumber: Sumber
  /** `numeric` dari Postgres tiba sebagai string. */
  nilai: number | string | null
  status: string
  /** Dibawa apa adanya untuk penelusuran; tak ikut perhitungan. */
  ref?: string | null
}

/**
 * Status yang DIHITUNG sebagai biaya, per sumber.
 *
 * Daftar PUTIH, bukan daftar hitam. Status baru yang belum dipertimbangkan
 * otomatis tidak ikut — daftar hitam akan meloloskan apa pun yang lupa
 * ditambahkan, dan yang lolos di sini menaikkan biaya proyek tanpa ada yang
 * memutuskannya. Gagal-tertutup, sesuai Ember [C] (CLAUDE.md §5.3).
 *
 * Kenapa faktur `unpaid` IKUT: faktur yang sudah terbit adalah biaya,
 * terlepas sudah dibayar atau belum. Yang belum dibayar tetap utang yang
 * harus dibayar — menundanya dari laporan membuat proyek terlihat lebih
 * untung daripada kenyataannya, persis sampai tagihannya jatuh tempo.
 */
const STATUS_DIHITUNG: Record<Sumber, ReadonlySet<string>> = {
  upah: new Set(['paid']),
  faktur: new Set(['paid', 'partial', 'unpaid']),
  belanja: new Set(['approved', 'paid']),
  // PO tak pernah masuk total — ia komitmen. Daftar ini menentukan komitmen
  // MANA yang masih mengikat; `draft`/`cancelled` sengaja di luar.
  //
  // Nilainya DISALIN dari `PO_MENGIKAT` di `routes/v1/cost-control.ts` — dan
  // diverifikasi ke basis 2026-08-08 (`fully_received:4 confirmed:1 draft:1
  // sent:1 cancelled:1`). Versi pertama modul ini menebak `['approved',
  // 'sent', 'partial', 'received']` dari ingatan; tak satu pun kecuali `sent`
  // benar-benar ada. Menebak nilai enum menghasilkan komitmen Rp 0 yang
  // terlihat seperti "memang belum ada PO".
  po: new Set(['sent', 'confirmed', 'partially_received', 'fully_received']),
}

/**
 * Status yang sudah pasti akan jadi biaya tapi belum disetujui.
 *
 * Tidak masuk total — laporan tak boleh berubah saat sesuatu ditolak. Tapi
 * dilaporkan terpisah, karena pembaca berhak tahu berapa yang membayangi.
 */
const STATUS_MENUNGGU: Record<Sumber, ReadonlySet<string>> = {
  upah: new Set(['submitted']),
  faktur: new Set([]),
  belanja: new Set(['submitted', 'pending']),
  po: new Set([]),
}

export interface RangkumanBelanja {
  /** Biaya yang SUDAH keluar/terbit. Ini angka "aktual". */
  total: number
  /** Uang yang terikat PO tapi belum jadi biaya. */
  komitmen: number
  /** `total + komitmen` — dipakai memutuskan "masih boleh belanja lagi?". */
  exposure: number
  /** Sudah pasti jadi biaya, belum disetujui. Tak masuk total. */
  menunggu: number
  /** Rincian per sumber. SELALU memuat seluruh `SUMBER`, termasuk yang nol. */
  per_sumber: Record<Sumber, number>
  /** Baris berstatus tak dikenal — dilewati, tapi terlihat. */
  tak_dikenal: number
  /** Baris bernilai NaN/tak terbaca — dilewati, tapi terlihat. */
  nilai_cacat: number
}

/**
 * Angka dari Postgres. NaN dan yang tak terbaca dikembalikan `null`.
 *
 * Bukan sekadar kerapian: Postgres `numeric` MENERIMA NaN — terbukti di repo
 * ini — dan satu baris NaN meracuni `SUM()` seluruh laporan tanpa gejala.
 * Nilai negatif TIDAK dibuang: koreksi dan retur nyata terjadi, dan biaya
 * yang dikoreksi turun memang harus menurunkan total.
 */
function angka(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Rangkum baris-baris biaya dari beberapa sumber jadi satu angka yang bisa
 * ditelusuri.
 *
 * INVARIAN yang diuji (`__tests__/belanja-aktual.test.ts`):
 *  1. upah `draft` TIDAK dihitung; `submitted` dilaporkan terpisah
 *  2. faktur `unpaid` DIHITUNG (utang tetap biaya)
 *  3. PO tak pernah masuk `total` — ia `komitmen`
 *  4. status tak dikenal dilewati DAN dihitung (gagal-tertutup, terlihat)
 *  5. NaN tak meracuni total, dan barisnya dihitung cacat
 *  6. `per_sumber` selalu memuat seluruh sumber — nol yang DINYATAKAN adalah
 *     jawaban; nol yang tak muncul adalah pertanyaan
 */
export function rangkumBelanjaAktual(baris: BarisSumber[]): RangkumanBelanja {
  const per: Record<Sumber, number> = { upah: 0, faktur: 0, belanja: 0, po: 0 }
  let komitmen = 0
  let menunggu = 0
  let takDikenal = 0
  let cacat = 0

  for (const r of baris) {
    const n = angka(r.nilai)
    if (n === null) { cacat++; continue }

    const dihitung = STATUS_DIHITUNG[r.sumber]
    const tunggu = STATUS_MENUNGGU[r.sumber]
    if (!dihitung) { takDikenal++; continue }

    if (dihitung.has(r.status)) {
      if (r.sumber === 'po') komitmen += n
      else per[r.sumber] += n
      continue
    }
    if (tunggu?.has(r.status)) { menunggu += n; continue }
    takDikenal++
  }

  const total = per.upah + per.faktur + per.belanja
  return {
    total,
    komitmen,
    exposure: total + komitmen,
    menunggu,
    per_sumber: per,
    tak_dikenal: takDikenal,
    nilai_cacat: cacat,
  }
}

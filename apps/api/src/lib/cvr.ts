// CVR — Cost Value Reconciliation, per SCOPE BORONGAN.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA, DAN KENAPA PER SCOPE
// ══════════════════════════════════════════════════════════════════════════
//
// CVR adalah 🔴 TERAKHIR di taksonomi yang bukan "jangan dibangun". F5-1
// menyebutnya *"inilah yang membedakan ERP kontraktor dari pencatat biaya"*:
// ia mengadu **biaya terpakai** vs **nilai terpasang**.
//
// ── Kenapa penundaannya dicabut sebagian
//
// Ditunda 2026-08-07 dengan alasan yang benar saat itu: sisi biaya kosong
// (`project_expenses` 0 baris). Diukur ulang 2026-08-08 — separuh alasannya
// sudah tidak berlaku:
//
//   sisi BIAYA                 ✅ `belanja-aktual.ts`, Rp 168 juta terbukti
//   per COST CODE              ❌ `work_scopes.rab_category_id` 0 dari 20
//   per SCOPE BORONGAN         ✅ `weekly_wage_reports.scope_id` 50/50 terisi
//
// Yang dibangun karena itu adalah CVR yang bisa dijawab **jujur hari ini**:
// per scope borongan mandor. Ruang lingkupnya dinyatakan di layar, bukan
// disamarkan sebagai "CVR" tanpa kualifikasi — karena pembaca yang mengira
// ini mencakup seluruh biaya proyek akan salah menyimpulkan.
//
// ── Nilai TERPASANG, bukan nilai kontrak
//
// Yang diadu adalah `borongan × progres`, bukan nilai borongan mentah.
// Membandingkan biaya-sampai-hari-ini dengan nilai-kontrak-penuh membuat
// SETIAP scope terlihat untung besar sampai pekerjaan hampir selesai — lalu
// tiba-tiba rugi di akhir, saat sudah terlambat berbuat apa pun.
//
// ── Rugi harus TERLIHAT
//
// Diukur pada data nyata: "Renovasi Total" 70% selesai, nilai terpasang
// Rp 98 juta, upah terpakai Rp 102 juta — **rugi Rp 4 juta**. Meratakannya ke
// nol, atau menenggelamkannya di total proyek yang masih untung, menghapus
// satu-satunya sinyal yang bisa ditindaklanjuti selagi pekerjaan berjalan.

export interface BarisScope {
  scope_id: string
  scope_name: string
  /** `numeric` dari Postgres tiba sebagai string. */
  borongan_value: number | string | null
  progress_pct: number | string | null
  /** Upah yang SUDAH dibayar untuk scope ini. */
  terpakai: number | string | null
  /** Berapa laporan upah tercatat — membedakan "belum ada" dari "belum dicatat". */
  jumlah_laporan: number
}

/**
 * Bacaan satu scope.
 *
 * `keadaan` sengaja bukan sekadar untung/rugi: dua keadaan lain menuntut
 * tindakan yang sama sekali berbeda, dan menyamakannya dengan "untung"
 * menyembunyikan keduanya.
 */
export type KeadaanCvr =
  | 'untung'
  | 'rugi'
  | 'impas'
  /** Progres berjalan tapi NOL biaya tercatat — mencurigakan, bukan untung. */
  | 'tanpa_biaya'
  | 'belum_mulai'
  /** Scope harian (borongan nol) — CVR tak berlaku, jangan dikarang. */
  | 'tak_berlaku'

export interface HasilCvr {
  scope_id: string
  scope_name: string
  borongan: number
  progress_pct: number
  /** `borongan × progres` — bagian yang sudah jadi hak. */
  nilai_terpasang: number
  terpakai: number
  /** `nilai_terpasang − terpakai`. NEGATIF berarti rugi, dan dibiarkan negatif. */
  selisih: number
  /** Persen terhadap nilai terpasang. `null` bila tak bisa dihitung. */
  margin_pct: number | null
  keadaan: KeadaanCvr
  jumlah_laporan: number
}

/**
 * Angka dari Postgres; NaN dan yang tak terbaca jadi 0.
 *
 * Postgres `numeric` MENERIMA NaN — terbukti di repo ini — dan satu baris
 * NaN meracuni SUM seluruh laporan.
 */
function angka(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Hitung CVR satu scope.
 *
 * INVARIAN yang diuji (`__tests__/cvr.test.ts`):
 *  1. nilai terpasang = borongan × progres, progres dibatasi 0..100
 *  2. selisih negatif DIBIARKAN negatif — rugi harus terlihat
 *  3. impas dibedakan dari untung: margin nol di tengah jalan berarti sisa
 *     pekerjaan dikerjakan tanpa cadangan
 *  4. progres berjalan + nol biaya = `tanpa_biaya` (mencurigakan), bukan untung
 *  5. borongan nol = `tak_berlaku` (scope harian), bukan dihitung jadi angka
 *  6. margin `null` saat nilai terpasang nol — bukan 0%, yang berarti "impas"
 */
export function hitungCvr(b: BarisScope): HasilCvr {
  const borongan = angka(b.borongan_value)
  // Dibatasi 0..100: progres > 100 nyata terjadi (salah input, atau pekerjaan
  // tambah yang belum masuk kontrak), dan nilai terpasang tak boleh melebihi
  // yang disepakati — kelebihannya bukan hak yang bisa ditagih.
  const progres = Math.min(100, Math.max(0, angka(b.progress_pct)))
  const terpakai = angka(b.terpakai)

  const dasar = {
    scope_id: b.scope_id,
    scope_name: b.scope_name,
    borongan,
    progress_pct: progres,
    terpakai,
    jumlah_laporan: b.jumlah_laporan,
  }

  // Scope harian: nilai terpasangnya tak bisa diturunkan dari progres.
  // Dinyatakan tak berlaku, bukan dihitung jadi angka yang menyesatkan.
  if (borongan <= 0) {
    return {
      ...dasar, nilai_terpasang: 0, selisih: 0 - terpakai,
      margin_pct: null, keadaan: 'tak_berlaku',
    }
  }

  const nilaiTerpasang = (borongan * progres) / 100
  const selisih = nilaiTerpasang - terpakai

  const keadaan: KeadaanCvr =
    progres <= 0 && terpakai <= 0 ? 'belum_mulai'
    // Progres berjalan tanpa satu pun biaya tercatat. Selisihnya besar dan
    // positif, dan itu justru tanda bahaya: biayanya ada di suatu tempat yang
    // tak terlihat laporan ini.
    : progres > 0 && terpakai <= 0 ? 'tanpa_biaya'
    : selisih < 0 ? 'rugi'
    : selisih > 0 ? 'untung'
    : 'impas'

  return {
    ...dasar,
    nilai_terpasang: nilaiTerpasang,
    selisih,
    // `null`, bukan 0: nol persen berarti "impas", dan itu klaim yang tak
    // dimiliki datanya saat penyebutnya nol.
    margin_pct: nilaiTerpasang > 0 ? (selisih / nilaiTerpasang) * 100 : null,
    keadaan,
  }
}

export interface RingkasanCvr {
  baris: HasilCvr[]
  /**
   * Total dari scope yang CVR-nya BERLAKU saja (borongan).
   *
   * Scope harian dikeluarkan dari ketiga total ini. Diukur 2026-08-08 pada
   * proyek Pak Andi: dua scope harian menyumbang Rp 46,6 juta biaya TANPA
   * nilai terpasang, membuat `total_selisih` −Rp 2,6 juta padahal **nol**
   * scope berstatus rugi. Layar lalu menampilkan angka merah di sebelah
   * kalimat "seluruh pekerjaan di atas biayanya" — dua pernyataan yang
   * saling membantah, dan keduanya benar menurut sumbernya sendiri.
   *
   * Mencampur yang berlaku dengan yang tidak menghasilkan angka yang tak
   * bisa dibaca sebagai apa pun.
   */
  total_nilai_terpasang: number
  total_terpakai: number
  total_selisih: number
  /**
   * Biaya scope HARIAN — dilaporkan terpisah, bukan dibuang.
   *
   * Ia biaya nyata dan harus terlihat; ia hanya tak bisa diadu dengan nilai
   * terpasang. Membuangnya diam-diam membuat total biaya di layar ini
   * berbeda dari `/belanja-aktual` untuk proyek yang sama.
   */
  terpakai_harian: number
  jumlah_rugi: number
  jumlah_tanpa_biaya: number
  /** Scope harian yang CVR-nya tak berlaku — dihitung supaya cakupannya jelas. */
  jumlah_tak_berlaku: number
}

/** Urutan tampil: yang menuntut tindakan lebih dulu. */
const URUTAN: Record<KeadaanCvr, number> = {
  rugi: 0,
  tanpa_biaya: 1,
  impas: 2,
  untung: 3,
  belum_mulai: 4,
  tak_berlaku: 5,
}

/**
 * Ringkas seluruh scope satu proyek.
 *
 * Yang RUGI naik ke atas — itu satu-satunya baris yang menuntut tindakan, dan
 * daftar yang mengurutkannya di bawah membuatnya tak pernah dibaca.
 */
export function ringkasCvr(daftar: BarisScope[]): RingkasanCvr {
  const baris = daftar.map(hitungCvr).sort((a, b) =>
    URUTAN[a.keadaan] - URUTAN[b.keadaan]
    // Dalam keadaan yang sama: nilai mutlak selisih terbesar lebih dulu.
    || Math.abs(b.selisih) - Math.abs(a.selisih))

  // Total HANYA dari scope yang CVR-nya berlaku. Lihat alasannya di
  // `RingkasanCvr.total_nilai_terpasang`.
  const berlaku = baris.filter((x) => x.keadaan !== 'tak_berlaku')
  const harian = baris.filter((x) => x.keadaan === 'tak_berlaku')

  return {
    baris,
    total_nilai_terpasang: berlaku.reduce((s, x) => s + x.nilai_terpasang, 0),
    total_terpakai: berlaku.reduce((s, x) => s + x.terpakai, 0),
    total_selisih: berlaku.reduce((s, x) => s + x.selisih, 0),
    terpakai_harian: harian.reduce((s, x) => s + x.terpakai, 0),
    jumlah_rugi: baris.filter((x) => x.keadaan === 'rugi').length,
    jumlah_tanpa_biaya: baris.filter((x) => x.keadaan === 'tanpa_biaya').length,
    jumlah_tak_berlaku: baris.filter((x) => x.keadaan === 'tak_berlaku').length,
  }
}

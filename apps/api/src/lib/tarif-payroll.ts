// TARIF PAYROLL (G2a) — tarif sebagai DATA, bukan konstanta.
//
// ══════════════════════════════════════════════════════════════════════════
// ATURAN YANG TAK BISA DITAWAR
// ══════════════════════════════════════════════════════════════════════════
//
// **Berkas ini tidak memuat satu pun angka tarif.** Tak ada PTKP, tak ada
// lapisan PPh 21, tak ada persentase BPJS — bahkan sebagai "contoh" atau
// "fallback".
//
// R-011 (2026-08-11) mencabut larangan membangun payroll dengan syarat yang
// diucapkan founder sendiri lewat alasan penolakan aslinya:
//
//   "aturan pajak berubah tiap tahun; salah hitung = urusan hukum, bukan bug"
//
// Konsekuensinya lebih tajam daripada kelihatannya: **fungsi di sini
// mengembalikan `null` saat tarif belum ada, dan pemanggilnya WAJIB
// menampilkan "tarif belum ditetapkan"** — bukan menghitung dengan angka
// bawaan yang kelihatan wajar.
//
// Alasannya bukan kehati-hatian berlebihan. Slip gaji yang salah keluar
// dengan tampilan meyakinkan: nama benar, periode benar, potongan tampak
// masuk akal. Penerimanya tak punya cara tahu bahwa angkanya lahir dari
// tebakan seorang programmer, bukan dari peraturan.
//
// ── Kenapa `null`, bukan 0
//
// Nol adalah jawaban. "Potongan PPh 21 Anda Rp 0" adalah pernyataan yang
// bisa salah dan tampak sah. `null` bukan jawaban — ia memaksa pemanggilnya
// memutuskan apa yang ditampilkan, dan satu-satunya yang jujur adalah
// mengatakan tarifnya belum ada.
//
// ── Kenapa pemilihan periode memakai "terbesar yang <= tanggal"
//
// Tarif tidak diganti, ia ditambah dengan tanggal berlaku baru (migrasi 284).
// Slip Januari harus tetap bisa dihitung ulang dengan tarif Januari, bahkan
// sesudah tarif berubah di Juli — kalau tidak, riwayat penggajian tak bisa
// diaudit dan perbaikan retroaktif mustahil dibedakan dari kesalahan.

export type JenisTarif = 'ptkp' | 'ter_pph21' | 'bpjs'

export interface BarisTarif {
  id: string
  urutan: number
  kunci: string
  label: string | null
  /** `numeric` dari Postgres tiba sebagai string, dan bisa berisi NaN. */
  batas_bawah: number | string | null
  batas_atas: number | string | null
  nilai_nominal: number | string | null
  nilai_persen: number | string | null
  persen_perusahaan: number | string | null
  persen_karyawan: number | string | null
}

export interface PeriodeTarif {
  id: string
  jenis: JenisTarif
  /** `YYYY-MM-DD`. */
  berlaku_sejak: string
  dasar_hukum: string
  baris: BarisTarif[]
}

/**
 * Angka dari Postgres. NaN dan yang tak terbaca jadi `null`.
 *
 * Postgres `numeric` MENERIMA NaN — terbukti di repo ini — dan satu NaN
 * meracuni seluruh perhitungan gaji tanpa satu pun galat.
 */
export function angka(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null

  // ⚠ `Number('')` adalah **0**, bukan NaN — begitu juga `Number('   ')`.
  //
  // Tanpa penjagaan ini, kolom tarif yang dikosongkan di form (yang tiba
  // sebagai `''`) terbaca sebagai tarif NOL, bukan sebagai "belum diisi".
  // Hasilnya persis yang modul ini ada untuk mencegah: potongan Rp 0 yang
  // tampak sah, tanpa satu pun peringatan bahwa tarifnya hilang.
  //
  // Ditemukan oleh test-nya sendiri saat ditulis — kodenya yang salah.
  const s = String(v).trim()
  if (s === '') return null

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Periode yang BERLAKU pada sebuah tanggal: `berlaku_sejak` terbesar yang
 * tidak melewati tanggal itu.
 *
 * INVARIAN yang diuji (`__tests__/tarif-payroll.test.ts`):
 *  1. periode yang berlaku PERSIS di tanggalnya ikut terpilih (`<=`, bukan `<`)
 *  2. periode masa depan TIDAK terpilih — tarif Juli tak berlaku untuk slip
 *     Januari, bahkan kalau ia satu-satunya yang ada
 *  3. `null` bila belum ada periode mana pun yang berlaku
 *  4. urutan masukan tak berpengaruh
 */
export function periodeBerlaku(
  periode: PeriodeTarif[],
  jenis: JenisTarif,
  tanggal: string,
): PeriodeTarif | null {
  const layak = periode
    .filter((p) => p.jenis === jenis && p.berlaku_sejak <= tanggal)
    // Perbandingan string sah untuk `YYYY-MM-DD` — leksikografis sama dengan
    // kronologis. Memakai `new Date()` di sini justru menambah zona waktu ke
    // perbandingan yang tak butuh jam sama sekali.
    .sort((a, b) => b.berlaku_sejak.localeCompare(a.berlaku_sejak))
  return layak[0] ?? null
}

export interface KesiapanTarif {
  siap: boolean
  /** Jenis yang belum punya periode berlaku pada tanggal itu. */
  belum_ditetapkan: JenisTarif[]
  /** Jenis yang punya periode tapi NOL baris — lebih menyesatkan daripada kosong. */
  kosong: JenisTarif[]
}

const SEMUA_JENIS: JenisTarif[] = ['ptkp', 'ter_pph21', 'bpjs']

/**
 * Apakah payroll boleh dihitung untuk sebuah tanggal.
 *
 * INVARIAN yang diuji:
 *  1. `siap` = false bila ADA SATU jenis pun yang belum ditetapkan
 *  2. periode yang ada tapi NOL BARIS dilaporkan TERPISAH — ia lolos
 *     pemeriksaan "sudah ada periode" tetapi tak bisa menghitung apa pun,
 *     dan itu bentuk kegagalan yang paling sulit dilihat
 *  3. daftar kosong → ketiga jenis dilaporkan belum ditetapkan
 */
export function kesiapanTarif(periode: PeriodeTarif[], tanggal: string): KesiapanTarif {
  const belum: JenisTarif[] = []
  const kosong: JenisTarif[] = []

  for (const j of SEMUA_JENIS) {
    const p = periodeBerlaku(periode, j, tanggal)
    if (!p) { belum.push(j); continue }
    // Periode tanpa baris: "sudah ditetapkan" menurut keberadaan, tetapi
    // menghitung dengannya menghasilkan nol potongan — slip yang tampak sah
    // dengan angka yang salah. Dilaporkan terpisah supaya layar bisa
    // membedakan "belum diisi" dari "diisi tapi kosong".
    if (p.baris.length === 0) kosong.push(j)
  }

  return { siap: belum.length === 0 && kosong.length === 0, belum_ditetapkan: belum, kosong }
}

/**
 * PTKP setahun menurut status keluarga. `null` bila tak ada tarifnya.
 *
 * INVARIAN yang diuji:
 *  1. status yang tak ada di tabel → `null`, BUKAN 0
 *  2. pencocokan kunci tak peka besar-kecil dan spasi — 'k/1', 'K/1 ' sama
 *     ('TK/0' vs 'tk/0' sudah pernah jadi sumber galat di repo ini)
 */
export function ptkpSetahun(periode: PeriodeTarif | null, status: string): number | null {
  if (!periode) return null
  const kunci = status.trim().toUpperCase()
  const b = periode.baris.find((x) => x.kunci.trim().toUpperCase() === kunci)
  return b ? angka(b.nilai_nominal) : null
}

/**
 * Tarif TER PPh 21 (persen) untuk kategori & penghasilan bulanan tertentu.
 *
 * `null` bila kategorinya tak ada ATAU penghasilannya tak masuk satu lapisan
 * pun — keduanya berarti tabel tarifnya belum lengkap, dan itu harus terlihat
 * bukan diam-diam jadi 0%.
 *
 * INVARIAN yang diuji:
 *  1. batas bawah INKLUSIF, batas atas EKSKLUSIF — persis di batas atas masuk
 *     lapisan BERIKUTNYA, bukan lapisan itu. Salah satu arah membuat satu
 *     nilai penghasilan dihitung dua kali atau tak sama sekali
 *  2. lapisan terakhir tanpa `batas_atas` menampung sisanya
 *  3. penghasilan di bawah lapisan terendah → `null`, bukan 0
 *  4. kategori yang tak ada → `null`
 */
export function tarifTer(
  periode: PeriodeTarif | null,
  kategori: string,
  penghasilanBulanan: number,
): number | null {
  if (!periode) return null
  const kat = kategori.trim().toUpperCase()

  const lapisan = periode.baris.filter((x) => x.kunci.trim().toUpperCase() === kat)
  if (lapisan.length === 0) return null

  for (const l of lapisan) {
    const bawah = angka(l.batas_bawah)
    const atas = angka(l.batas_atas)
    // Bawah inklusif, atas eksklusif. Peraturan menulis lapisan sebagai
    // "di atas X sampai dengan Y", dan menerjemahkannya jadi dua sisi
    // inklusif membuat nilai persis Y cocok di DUA lapisan — yang pertama
    // menang, dan itu bergantung pada urutan baris.
    const cocokBawah = bawah === null || penghasilanBulanan >= bawah
    const cocokAtas = atas === null || penghasilanBulanan < atas
    if (cocokBawah && cocokAtas) return angka(l.nilai_persen)
  }
  return null
}

export interface IuranBpjs {
  kunci: string
  label: string | null
  /** Rupiah, sudah dibulatkan. `null` bila persennya tak ada. */
  perusahaan: number | null
  karyawan: number | null
  /** Upah yang dipakai — bisa lebih kecil dari gaji bila ada batas atas. */
  dasar_upah: number
  /** Batas atas upah menggigit (gaji melebihi ceiling). */
  kena_batas: boolean
}

/**
 * Iuran BPJS per jenis. `null` bila tarifnya belum ada.
 *
 * INVARIAN yang diuji:
 *  1. batas atas upah (ceiling) MENGGIGIT — gaji di atasnya dihitung dari
 *     ceiling, bukan dari gaji penuh. Mengabaikannya membuat iuran JP
 *     karyawan bergaji tinggi berkali lipat dari yang seharusnya
 *  2. `kena_batas` ditandai supaya layar bisa menjelaskan kenapa angkanya
 *     tak sesuai persentase × gaji
 *  3. pembulatan ke rupiah penuh, bukan sen — setoran BPJS bulat
 *  4. iuran yang hanya ditanggung satu pihak tetap mengembalikan `null`
 *     untuk pihak lain, bukan 0 (0 berarti "ditanggung, sebesar nol")
 */
export function hitungBpjs(
  periode: PeriodeTarif | null,
  upahBulanan: number,
): IuranBpjs[] | null {
  if (!periode || periode.baris.length === 0) return null

  return periode.baris
    .slice()
    .sort((a, b) => a.urutan - b.urutan)
    .map((b) => {
      const ceiling = angka(b.batas_atas)
      const kenaBatas = ceiling !== null && upahBulanan > ceiling
      const dasar = kenaBatas ? ceiling! : upahBulanan

      const pp = angka(b.persen_perusahaan)
      const pk = angka(b.persen_karyawan)

      return {
        kunci: b.kunci,
        label: b.label,
        // Dibulatkan ke rupiah penuh: setoran BPJS tak mengenal sen, dan
        // menyimpan pecahan membuat total bulanan meleset dari jumlah
        // barisnya.
        perusahaan: pp === null ? null : Math.round((dasar * pp) / 100),
        karyawan: pk === null ? null : Math.round((dasar * pk) / 100),
        dasar_upah: dasar,
        kena_batas: kenaBatas,
      }
    })
}

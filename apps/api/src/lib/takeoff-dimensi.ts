// Take-off dimensional (431) — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// `estimate_items.quantity` masuk sebagai ANGKA JADI. Satu-satunya pemeriksaan
// yang dilaluinya sebelum menjadi rupiah ada di `estimate-versions.ts`:
//
//     if (typeof b.quantity !== 'number' || b.quantity <= 0) { … }
//
// lalu ia dikalikan HSP oleh `computeRabLineTotal` dan mendarat di
// `estimate_items.amount`. Volume 84,5 m³ yang benar dan volume 84,5 m³ yang
// salah ketik dari 8,45 masuk lewat pintu yang sama — dan sesudah masuk,
// keduanya terlihat identik. Tak ada kolom yang menyimpan p × l × t yang
// melahirkannya, jadi "kenapa volumenya segini?" hanya bisa dijawab dengan
// membuka gambar dan menghitung ulang dari nol.
//
// Berkas ini adalah sisi HITUNG-nya: satu rumus, empat bentuk, nol I/O.
// Rutenya (`estimate-versions.ts`) hanya memanggil ini — nol aritmetika ad-hoc
// di route, pola yang sama dengan `computeRebarBar` di `rab-compute.ts`.
//
// ── Kenapa PURE (dan kenapa itu bukan formalitas)
//
// Kesalahan volume tidak menimbulkan galat: ia menghasilkan angka yang terlihat
// wajar. Satu-satunya cara menangkapnya adalah golden test yang membandingkan
// keluaran dengan angka yang dihitung tangan — dan itu hanya murah kalau
// fungsinya bisa dipanggil tanpa basis, tanpa login, tanpa fixture.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Bentuk perhitungan. Daftar TERTUTUP — sengaja bukan string bebas.
 *
 * Rumusnya sama untuk semua (p × l × t × jumlah × faktor); yang berbeda hanya
 * dimensi mana yang ikut. Daftar tertutup membuat tiga hal mungkin sekaligus:
 * UI bisa menyembunyikan kolom yang tak relevan, CHECK di DB (migrasi 431) bisa
 * menuntut dimensi yang wajib, dan fungsi ini bisa menolak bentuk karangan.
 * Menambah metode = migrasi maju, dan itu memang disengaja — bentuk perhitungan
 * volume bukan hal yang boleh diketik pengguna.
 */
export type MetodeTakeoff = 'volume' | 'luas' | 'dinding' | 'panjang'

/** Dimensi yang WAJIB terisi per metode — kembaran CHECK `takeoff_dimensi_dimensi_wajib`. */
export const DIMENSI_WAJIB: Record<MetodeTakeoff, ReadonlyArray<'panjang_m' | 'lebar_m' | 'tinggi_m'>> = {
  volume: ['panjang_m', 'lebar_m', 'tinggi_m'], // galian, beton, urugan  → m³
  luas: ['panjang_m', 'lebar_m'],               // lantai, plesteran, atap → m²
  dinding: ['panjang_m', 'tinggi_m'],           // pasangan bata (tebal di AHSP per-m²) → m²
  panjang: ['panjang_m'],                       // sloof, pipa, keliling → m'
}

/** Satuan hasil per metode — dipakai UI supaya angka tak tampil tanpa satuan. */
export const SATUAN_HASIL: Record<MetodeTakeoff, string> = {
  volume: 'm³', luas: 'm²', dinding: 'm²', panjang: 'm',
}

export const METODE_SAH = Object.keys(DIMENSI_WAJIB) as MetodeTakeoff[]

/**
 * Batas atas faktor — kembaran CHECK `faktor > 0 AND faktor <= 10` di 431.
 *
 * Faktor menampung hal yang di lapangan memang berubah-ubah: gembur galian
 * (1,2–1,3 tergantung jenis tanah), susut urugan padat, tebal siar pasangan.
 * Yang wajar tak pernah melewati satuan digit; 10 memberi ruang lebih dari
 * cukup sambil tetap menahan salah ketik yang menggandakan volume 100×.
 */
export const FAKTOR_MAKS = 10

export interface BarisTakeoffInput {
  uraian: string
  metode: MetodeTakeoff
  panjangM?: number | null
  lebarM?: number | null
  tinggiM?: number | null
  /** Jumlah bagian identik (12 pondasi P1 yang sama). Default 1. */
  jumlah?: number | null
  /** Faktor koreksi lapangan. Default 1 = tanpa koreksi. */
  faktor?: number | null
}

export interface BarisTakeoffHasil {
  uraian: string
  metode: MetodeTakeoff
  panjangM: number | null
  lebarM: number | null
  tinggiM: number | null
  jumlah: number
  faktor: number
  /** Hasil satu bagian SEBELUM dikali jumlah & faktor — inilah yang dicocokkan ke gambar. */
  volumeSatuan: number
  hasilVolume: number
  satuan: string
  /** Perhitungan sebagai teks, mis. "12,5 × 0,8 × 0,6 × 4 × 1,25 = 30 m³". */
  rumus: string
}

/** Galat perhitungan take-off — dibedakan supaya route bisa memulangkan 400, bukan 500. */
export class GalatTakeoff extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GalatTakeoff'
  }
}

/** Angka untuk ditempel di rumus: desimal Indonesia, tanpa nol ekor yang tak berarti. */
function angka(n: number): string {
  return String(Number(n.toFixed(4))).replace('.', ',')
}

/**
 * Satu baris take-off: p × l × t × jumlah × faktor.
 *
 * MELEMPAR (bukan memulangkan angka cacat) bila masukan tak sah. Alasannya sama
 * dengan CHECK di 431: metode 'volume' yang lupa tinggi akan menghasilkan angka
 * yang TERLIHAT WAJAR kalau NULL diperlakukan sebagai 1 — dan angka wajar yang
 * salah adalah kegagalan yang tak pernah memicu kecurigaan siapa pun.
 */
export function hitungBarisTakeoff(input: BarisTakeoffInput): BarisTakeoffHasil {
  const uraian = (input.uraian ?? '').trim()
  if (uraian.length === 0) {
    // Tanpa nama, 40 baris take-off jadi deretan angka yang tak bisa dicocokkan
    // kembali ke gambar setahun kemudian — itu justru guna tabel ini.
    throw new GalatTakeoff('uraian wajib diisi — tanpa nama, baris take-off tak bisa dicocokkan ke gambar')
  }
  if (!METODE_SAH.includes(input.metode)) {
    throw new GalatTakeoff(`metode wajib salah satu dari: ${METODE_SAH.join(', ')}`)
  }

  const dim = { panjang_m: input.panjangM, lebar_m: input.lebarM, tinggi_m: input.tinggiM }
  const wajib = DIMENSI_WAJIB[input.metode]

  for (const k of wajib) {
    const v = dim[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new GalatTakeoff(`metode '${input.metode}' butuh ${k} berupa angka > 0`)
    }
  }
  // Dimensi yang TIDAK dipakai metode ini harus kosong, bukan diam-diam
  // diabaikan. Kalau seseorang mengisi tinggi pada metode 'luas', ia mengira
  // tinggi itu ikut dihitung — dan hasilnya akan meleset tanpa satu pun gejala.
  for (const k of ['panjang_m', 'lebar_m', 'tinggi_m'] as const) {
    if (wajib.includes(k)) continue
    const v = dim[k]
    if (v !== undefined && v !== null) {
      throw new GalatTakeoff(`metode '${input.metode}' tidak memakai ${k} — kosongkan, jangan diisi`)
    }
  }

  const jumlah = input.jumlah ?? 1
  if (typeof jumlah !== 'number' || !Number.isFinite(jumlah) || jumlah <= 0) {
    throw new GalatTakeoff('jumlah wajib angka > 0')
  }
  const faktor = input.faktor ?? 1
  if (typeof faktor !== 'number' || !Number.isFinite(faktor) || faktor <= 0) {
    // Faktor 0 membuat SELURUH baris menguap jadi volume 0, dan nol adalah
    // angka yang tak pernah terlihat mencurigakan di kolom volume.
    throw new GalatTakeoff('faktor wajib angka > 0')
  }
  if (faktor > FAKTOR_MAKS) {
    throw new GalatTakeoff(`faktor maksimal ${FAKTOR_MAKS} — di atas itu hampir pasti salah ketik`)
  }

  const dipakai = wajib.map(k => dim[k] as number)
  const volumeSatuan = dipakai.reduce((a, b) => a * b, 1)
  const hasilVolume = volumeSatuan * jumlah * faktor

  const bagian = [...dipakai.map(angka), angka(jumlah), angka(faktor)]
  const satuan = SATUAN_HASIL[input.metode]

  return {
    uraian,
    metode: input.metode,
    panjangM: input.panjangM ?? null,
    lebarM: input.lebarM ?? null,
    tinggiM: input.tinggiM ?? null,
    jumlah,
    faktor,
    volumeSatuan,
    hasilVolume,
    satuan,
    // Rumus dibawa sebagai TEKS supaya layar bisa memperlihatkan dari mana
    // volumenya datang tanpa menyusun ulang perkaliannya sendiri — dua tempat
    // yang menyusun rumus yang sama pasti menyimpang cepat atau lambat.
    rumus: `${bagian.join(' × ')} = ${angka(hasilVolume)} ${satuan}`,
  }
}

export interface RekapTakeoff {
  /** Σ hasil_volume seluruh baris — inilah yang DIUSULKAN ke estimate_items.quantity. */
  totalVolume: number
  jumlahBaris: number
  satuan: string | null
}

/**
 * Rekap seluruh baris take-off satu item.
 *
 * Satuan dipulangkan hanya bila SEMUA baris satuannya sama. Campuran m³ dan m'
 * dalam satu item berarti take-off-nya keliru dipasang, dan menjumlahkannya
 * menghasilkan angka tak bermakna yang tetap terlihat seperti angka — jadi
 * satuannya `null`, dan UI wajib memperlihatkannya sebagai peringatan.
 */
export function rekapTakeoff(baris: Array<{ hasilVolume: number; metode: MetodeTakeoff }>): RekapTakeoff {
  const satuanSet = new Set(baris.map(b => SATUAN_HASIL[b.metode]))
  return {
    totalVolume: baris.reduce((a, b) => a + b.hasilVolume, 0),
    jumlahBaris: baris.length,
    satuan: satuanSet.size === 1 ? [...satuanSet][0] : null,
  }
}

export interface SelisihTerapan {
  /** Volume yang sedang dipakai RAB (`estimate_items.quantity`). */
  quantityRab: number
  /** Σ hasil take-off terkini. */
  totalTakeoff: number
  selisih: number
  /** TRUE bila keduanya sama (dalam toleransi numeric(_,4) DB). */
  sinkron: boolean
}

/**
 * Beda antara volume yang DIPAKAI RAB dan volume yang DIHASILKAN take-off.
 *
 * Ini sinyal yang justru hilang kalau take-off menimpa `quantity` otomatis:
 * selisih berarti take-off sudah direvisi tapi RAB belum menyusul — keadaan
 * yang SAH (mungkin memang disengaja), tapi harus KELIHATAN.
 *
 * Toleransi 0,0001 mengikuti presisi kolomnya (`numeric(16,4)`): membandingkan
 * dengan `===` akan menandai selisih pembulatan digit ke-15 sebagai "tidak
 * sinkron", dan peringatan yang menyala tanpa sebab akan diabaikan orang —
 * lalu peringatan yang benar ikut terabaikan bersamanya.
 */
export function bandingkanTerapan(quantityRab: number, totalTakeoff: number): SelisihTerapan {
  const selisih = totalTakeoff - quantityRab
  return {
    quantityRab, totalTakeoff, selisih,
    sinkron: Math.abs(selisih) < 0.0001,
  }
}

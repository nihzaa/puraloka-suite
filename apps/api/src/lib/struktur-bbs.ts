// Bar Bending Schedule (BBS) — daftar potong & bengkok besi. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Fase 1 menghasilkan tonase besi per elemen: "kolom ini butuh 244 kg D16".
// Itu cukup untuk RAP, dan TIDAK cukup untuk membeli dan memotong.
//
// Besi dibeli per batang (lonjor 12 m di Indonesia) dan dipotong menurut daftar
// bengkokan. Antara "244 kg" dan "potong 12 batang D16 @ 4.49 m dengan kait 135°
// di kedua ujung" ada pekerjaan yang selama ini dikerjakan tangan — dan di
// situlah selisih antara RAP dan belanja nyata lahir:
//
//   · kait 135° tak dihitung        → besi kurang ±8%
//   · panjang penyaluran diabaikan  → sambungan tak cukup, atau besi terbuang
//   · sisa potongan tak dilacak     → tonase beli ≠ tonase pasang
//
// ── Yang dipelajari dari workbook (sheet "Gambar Kerja")
//
// Saya sempat MELAPORKAN SALAH bahwa BBS tidak ada di sana. Ia ada, lengkap:
// nomor batang · tipe · Ø · panjang tiap segmen · jumlah · berat. Pencarian
// pertama gagal karena memakai kata kunci Indonesia sementara tabelnya berkode
// angka. Rumus-rumusnya diverifikasi ulang dan tercatat di test.
// ══════════════════════════════════════════════════════════════════════════════

import { KOEF_BERAT_BESI } from './struktur-beton'

/** Panjang lonjor baku di Indonesia, m. */
export const PANJANG_LONJOR_M = 12

/**
 * Berat besi per meter, kg/m — turunan fisika.
 *
 * Workbook memakai bentuk ¼π(d/1000)²·7850 yang identik dengan
 * `KOEF_BERAT_BESI · d²` (0.0061654 = π/4 × 7850 × 1e-6). Diverifikasi test.
 */
export const beratPerMeter = (dMm: number) => KOEF_BERAT_BESI * dMm * dMm

/**
 * Panjang kait, m — SNI 2847 §25.3.
 *
 *     kait 135° (sengkang) : 6·db, minimal 50 mm
 *     kait 90°  (tulangan) : 12·db
 *
 * Workbook memakai `ROUNDUP(MAX(6·db, 0.05), 2)` — dibulatkan ke atas 2
 * desimal (cm terdekat), karena itu satuan yang dipakai orang di lapangan.
 * Ditiru supaya angkanya bisa dibandingkan langsung.
 */
export function panjangKaitM(dMm: number, sudut: 135 | 90 = 135): number {
  const kali = sudut === 135 ? 6 : 12
  const mentah = Math.max(kali * dMm / 1000, 0.05)
  return Math.ceil(mentah * 100) / 100
}

/**
 * Panjang penyaluran (development length), m — SNI 2847 §25.4.2.
 *
 *     ld = (fy · ψt · ψe) / (1.1 · λ · √f'c) · db / 10    [pendekatan lazim]
 *
 * Disederhanakan ke bentuk yang dipakai praktik Indonesia dan workbook:
 * **40·db** untuk tulangan tarik biasa. Bentuk lengkapnya bergantung faktor
 * lokasi & pelapisan yang belum diketahui saat estimasi.
 *
 * ⚠ Angka 40·db adalah PENDEKATAN yang dipakai untuk ESTIMASI. Untuk gambar
 * kerja bertanda tangan, ld wajib dihitung dengan rumus penuh — dan itu
 * dinyatakan di `catatan` hasil, bukan didiamkan.
 */
export function panjangPenyaluranM(dMm: number, faktor = 40): number {
  return faktor * dMm / 1000
}

/**
 * Bentuk bengkokan — menentukan berapa kait yang ikut dihitung.
 *
 * ⚠ `kait-1` ADA karena workbook memakainya, dan itu benar secara teknis:
 * tulangan tumpuan balok menerus berkait di ujung BEBAS saja; ujung satunya
 * menerus ke bentang berikutnya dan tak perlu dibengkokkan.
 *
 * Diverifikasi dari sel AD68 workbook: `SUM(AA68:AJ69)` menjumlahkan segmen
 * 4.39 m dengan SATU kait 0.10 m → 4.49 m. Percobaan pertama saya memakai dua
 * kait dan menghasilkan 4.59 — melebihkan besi 2.2% pada tiap tulangan
 * tumpuan, yang di proyek nyata jadi tonase berlebih yang dibayar percuma.
 */
export type BentukBatang =
  | 'lurus'        // batang lurus tanpa bengkokan
  | 'kait-1'       // lurus + kait di SATU ujung (tumpuan balok menerus)
  | 'kait-2'       // lurus + kait di kedua ujung (ujung bebas keduanya)
  | 'sengkang'     // persegi tertutup + 2 kait 135°
  | 'sengkang-u'   // U terbuka (sengkang balok tanpa penutup atas)

export interface BatangBBS {
  /** Nomor urut dalam daftar — dipakai menandai di gambar kerja. */
  nomor: number
  /** Keterangan peruntukan, mis. "Tulangan atas tumpuan kiri". */
  uraian: string
  bentuk: BentukBatang
  /** BjTP = polos, BjTS = sirip/deform. */
  tipe: 'BjTP' | 'BjTS'
  diameterMm: number
  /** Panjang tiap segmen lurus, m — TIDAK termasuk kait. */
  segmenM: number[]
  /** Panjang kait per ujung, m. 0 bila tak berkait. */
  kaitM: number
  /** Jumlah kait pada batang ini (0, 1, atau 2). */
  jumlahKait: number
  /**
   * Sudut kait yang dipakai — IKUT DISIMPAN, bukan disimpulkan ulang.
   *
   * Tanpa medan ini `gabungBBS` kehilangan informasinya: tulangan tumpuan
   * berkait 135° (0.10 m) tersusun ulang sebagai 90° (0.20 m) dan tonasenya
   * bertambah diam-diam. Terukur 11.36 kg pada proyek contoh — tanpa satu pun
   * galat, karena angkanya tetap terlihat wajar.
   */
  sudutKait: 135 | 90
  /** Jumlah batang identik. */
  jumlah: number
  /** Panjang satu batang termasuk kait, m. */
  panjangSatuanM: number
  /** Panjang total seluruh batang, m. */
  panjangTotalM: number
  beratKgPerM: number
  totalKg: number
}

export interface RekapPotong {
  tipe: 'BjTP' | 'BjTS'
  diameterMm: number
  /** Total panjang yang dibutuhkan, m. */
  panjangDibutuhkanM: number
  /** Jumlah lonjor yang harus DIBELI (dibulatkan ke atas). */
  lonjorDibeli: number
  /** Panjang yang dibeli, m. */
  panjangDibeliM: number
  /** Sisa potongan, m — selisih beli vs pakai. */
  sisaM: number
  /** Sisa dalam persen — pemborosan yang bisa ditekan. */
  sisaPersen: number
  totalKgDibutuhkan: number
  totalKgDibeli: number
}

export interface HasilBBS {
  batang: BatangBBS[]
  rekap: RekapPotong[]
  /** Berat total yang DIPASANG, kg. */
  totalKgTerpasang: number
  /** Berat total yang harus DIBELI, kg (termasuk sisa potongan). */
  totalKgDibeli: number
  catatan: string[]
}

/** Bentuk masukan satu jenis batang, sebelum dihitung. */
export interface InputBatang {
  uraian: string
  bentuk: BentukBatang
  tipe: 'BjTP' | 'BjTS'
  diameterMm: number
  /** Segmen lurus, m. Untuk sengkang: sisi-sisinya. */
  segmenM: number[]
  jumlah: number
  /** Sudut kait. Default 135 untuk sengkang, 90 untuk lainnya. */
  sudutKait?: 135 | 90
}

/**
 * Hitung satu batang: panjang satuan, total, berat.
 *
 * Jumlah kait DITURUNKAN dari bentuk, bukan diminta — itu menutup kelas
 * kesalahan "lupa mencentang kait" yang membuat tonase kurang tanpa gejala:
 *
 *     lurus       0 kait
 *     kait-1      1 kait   ← tumpuan balok menerus (ujung satunya menyambung)
 *     kait-2      2 kait
 *     sengkang    2 kait 135°
 *     sengkang-u  2 kait 135°
 */
export function hitungBatang(input: InputBatang, nomor: number): BatangBBS {
  const { uraian, bentuk, tipe, diameterMm, segmenM, jumlah } = input
  if (!(diameterMm > 0)) throw new Error(`${uraian}: diameter harus > 0`)
  if (!(jumlah > 0) || !Number.isInteger(jumlah)) {
    throw new Error(`${uraian}: jumlah harus bilangan bulat > 0`)
  }
  if (segmenM.length === 0) throw new Error(`${uraian}: tak ada segmen`)
  for (const s of segmenM) {
    if (!(s > 0)) throw new Error(`${uraian}: panjang segmen harus > 0 (ada ${s})`)
  }

  const jumlahKait = bentuk === 'lurus' ? 0 : bentuk === 'kait-1' ? 1 : 2
  const sudut = input.sudutKait ?? (bentuk.startsWith('sengkang') ? 135 : 90)
  const kaitM = jumlahKait > 0 ? panjangKaitM(diameterMm, sudut) : 0

  const panjangSegmen = segmenM.reduce((s, x) => s + x, 0)
  const panjangSatuanM = panjangSegmen + jumlahKait * kaitM
  const panjangTotalM = panjangSatuanM * jumlah
  const beratKgPerM = beratPerMeter(diameterMm)

  return {
    nomor, uraian, bentuk, tipe, diameterMm,
    segmenM: [...segmenM], kaitM, jumlahKait, sudutKait: sudut, jumlah,
    panjangSatuanM, panjangTotalM, beratKgPerM,
    totalKg: panjangTotalM * beratKgPerM,
  }
}

/**
 * Susun BBS lengkap beserta rekap pembelian.
 *
 * ── Kenapa rekap pembelian ikut dihitung
 *
 * Tonase TERPASANG dan tonase DIBELI berbeda, dan selisihnya bukan nol:
 * besi dibeli per lonjor 12 m, dan sisa potongan yang tak terpakai tetap
 * dibayar. RAP yang memakai tonase terpasang akan selalu kurang.
 *
 * ⚠ Perhitungan sisa di sini SEDERHANA: total panjang ÷ 12, dibulatkan ke atas
 * per diameter. Ia TIDAK melakukan optimasi pola potong (cutting stock) —
 * yang bisa menekan sisa dengan menggabungkan potongan berbeda panjang dalam
 * satu lonjor. Angka sisa di sini karena itu adalah BATAS ATAS yang aman,
 * bukan ramalan terbaik, dan itu dinyatakan di catatan.
 */
export function susunBBS(daftar: InputBatang[]): HasilBBS {
  if (daftar.length === 0) {
    return {
      batang: [], rekap: [], totalKgTerpasang: 0, totalKgDibeli: 0,
      catatan: ['Daftar batang kosong — tak ada yang bisa disusun.'],
    }
  }

  const batang = daftar.map((d, i) => hitungBatang(d, i + 1))
  const catatan: string[] = []

  // Rekap per (tipe, diameter) — satuan yang dibeli.
  const peta = new Map<string, RekapPotong>()
  for (const b of batang) {
    const kunci = `${b.tipe}|${b.diameterMm}`
    const ada = peta.get(kunci)
    if (ada) {
      ada.panjangDibutuhkanM += b.panjangTotalM
      ada.totalKgDibutuhkan += b.totalKg
    } else {
      peta.set(kunci, {
        tipe: b.tipe, diameterMm: b.diameterMm,
        panjangDibutuhkanM: b.panjangTotalM,
        lonjorDibeli: 0, panjangDibeliM: 0, sisaM: 0, sisaPersen: 0,
        totalKgDibutuhkan: b.totalKg, totalKgDibeli: 0,
      })
    }
  }

  const rekap = [...peta.values()]
  for (const r of rekap) {
    r.lonjorDibeli = Math.ceil(r.panjangDibutuhkanM / PANJANG_LONJOR_M)
    r.panjangDibeliM = r.lonjorDibeli * PANJANG_LONJOR_M
    r.sisaM = r.panjangDibeliM - r.panjangDibutuhkanM
    r.sisaPersen = r.panjangDibeliM > 0 ? r.sisaM / r.panjangDibeliM * 100 : 0
    r.totalKgDibeli = r.panjangDibeliM * beratPerMeter(r.diameterMm)
  }
  rekap.sort((a, b) => a.tipe.localeCompare(b.tipe) || a.diameterMm - b.diameterMm)

  const totalKgTerpasang = batang.reduce((s, b) => s + b.totalKg, 0)
  const totalKgDibeli = rekap.reduce((s, r) => s + r.totalKgDibeli, 0)

  // Batang lebih panjang dari lonjor WAJIB disambung — itu menambah besi dan
  // biaya yang tak terlihat di tonase mana pun bila didiamkan.
  const kepanjangan = batang.filter((b) => b.panjangSatuanM > PANJANG_LONJOR_M)
  if (kepanjangan.length > 0) {
    catatan.push(`${kepanjangan.length} jenis batang lebih panjang dari lonjor `
      + `${PANJANG_LONJOR_M} m (terpanjang ${Math.max(...kepanjangan.map((b) => b.panjangSatuanM)).toFixed(2)} m) — `
      + 'perlu SAMBUNGAN LEWATAN yang belum dihitung di sini. Tambahkan '
      + 'panjang lewatan ke segmennya, atau besi akan kurang di lapangan.')
  }

  const sisaTerbesar = rekap.reduce((a, b) => (b.sisaPersen > a.sisaPersen ? b : a), rekap[0])
  if (sisaTerbesar && sisaTerbesar.sisaPersen > 15) {
    catatan.push(`Sisa potongan ${sisaTerbesar.tipe} Ø${sisaTerbesar.diameterMm} `
      + `mencapai ${sisaTerbesar.sisaPersen.toFixed(1)}% — angka ini BATAS ATAS `
      + '(tanpa optimasi pola potong). Pemotongan yang menggabungkan beberapa '
      + 'panjang dalam satu lonjor bisa menekannya.')
  }

  catatan.push('Panjang penyaluran memakai pendekatan 40·db yang lazim untuk '
    + 'ESTIMASI. Untuk gambar kerja bertanda tangan, ld wajib dihitung dengan '
    + 'rumus penuh SNI 2847 §25.4.2 (faktor lokasi, pelapisan, dan λ).')

  return { batang, rekap, totalKgTerpasang, totalKgDibeli, catatan }
}

// ── Pembangun BBS dari elemen ────────────────────────────────────────────────

export interface InputBbsBalok {
  bMm: number
  hMm: number
  panjangM: number
  selimutMm: number
  dUtamaMm: number
  /** Jumlah tulangan bawah (momen positif). */
  nBawah: number
  /** Jumlah tulangan atas (momen negatif tumpuan). */
  nAtas: number
  dSengkangMm: number
  /** Jarak sengkang di daerah tumpuan (L/4 tiap ujung), mm. */
  jarakSengkangTumpuanMm: number
  /** Jarak sengkang di daerah lapangan (L/2 tengah), mm. */
  jarakSengkangLapanganMm: number
  jumlahBalok?: number
}

/**
 * BBS balok — mengikuti pembagian zona workbook: L/4 · L/2 · L/4.
 *
 * Pembagian itu bukan hiasan: gaya geser terbesar ada di tumpuan, jadi
 * sengkang di sana lebih rapat. Menghitung satu jarak untuk seluruh bentang
 * menghasilkan tonase yang salah di kedua arah sekaligus — terlalu banyak di
 * tengah, terlalu sedikit di ujung.
 */
export function bbsBalok(input: InputBbsBalok): HasilBBS {
  const {
    bMm, hMm, panjangM, selimutMm, dUtamaMm, nBawah, nAtas,
    dSengkangMm, jarakSengkangTumpuanMm, jarakSengkangLapanganMm,
  } = input
  if (!(panjangM > 0)) throw new Error('Panjang balok harus > 0')
  if (!(bMm > 0 && hMm > 0)) throw new Error('Dimensi balok harus > 0')

  const n = input.jumlahBalok ?? 1
  const ldM = panjangPenyaluranM(dUtamaMm)

  // Sisi inti sengkang.
  const intiBM = (bMm - 2 * selimutMm) / 1000
  const intiHM = (hMm - 2 * selimutMm) / 1000
  if (intiBM <= 0 || intiHM <= 0) throw new Error('Selimut melebihi dimensi balok')

  // Jumlah sengkang per zona: L/4 di kedua ujung, L/2 di tengah.
  const nSengkangTumpuan = Math.ceil(panjangM / 4 * 1000 / jarakSengkangTumpuanMm)
  const nSengkangLapangan = Math.ceil(panjangM / 2 * 1000 / jarakSengkangLapanganMm)

  // Tulangan tumpuan: MIN(0.75·L, 2·(L/4) + 40·db) — rumus workbook Z68.
  const panjangTumpuanM = Math.min(0.75 * panjangM, 2 * (panjangM / 4) + ldM)

  const daftar: InputBatang[] = [
    {
      uraian: 'Tulangan bawah — lurus sepanjang bentang + penyaluran',
      bentuk: 'kait-2', tipe: 'BjTS', diameterMm: dUtamaMm,
      segmenM: [panjangM + 2 * ldM], jumlah: nBawah * n,
    },
    /*
      Tulangan tumpuan berkait SATU ujung (yang bebas); ujung satunya menerus
      ke bentang berikutnya. Diverifikasi ke workbook AD68 = 4.49 m =
      4.39 (segmen) + 0.10 (satu kait 6·db).

      Memakai dua kait — tebakan pertama saya — melebihkan 2.2% per batang.
    */
    {
      uraian: 'Tulangan atas tumpuan kiri',
      bentuk: 'kait-1', tipe: 'BjTS', diameterMm: dUtamaMm,
      segmenM: [panjangTumpuanM], jumlah: nAtas * n, sudutKait: 135,
    },
    {
      uraian: 'Tulangan atas tumpuan kanan',
      bentuk: 'kait-1', tipe: 'BjTS', diameterMm: dUtamaMm,
      segmenM: [panjangTumpuanM], jumlah: nAtas * n, sudutKait: 135,
    },
    {
      uraian: `Sengkang tumpuan @${jarakSengkangTumpuanMm} (2 zona L/4)`,
      bentuk: 'sengkang', tipe: 'BjTP', diameterMm: dSengkangMm,
      segmenM: [intiBM, intiHM, intiBM, intiHM],
      jumlah: nSengkangTumpuan * 2 * n,
    },
    {
      uraian: `Sengkang lapangan @${jarakSengkangLapanganMm} (zona L/2)`,
      bentuk: 'sengkang', tipe: 'BjTP', diameterMm: dSengkangMm,
      segmenM: [intiBM, intiHM, intiBM, intiHM],
      jumlah: nSengkangLapangan * n,
    },
  ]

  return susunBBS(daftar)
}

export interface InputBbsKolom {
  bMm: number
  hMm: number
  tinggiM: number
  selimutMm: number
  dUtamaMm: number
  nTulangan: number
  dSengkangMm: number
  jarakSengkangMm: number
  jumlahKolom?: number
}

/**
 * BBS kolom persegi.
 *
 * Tulangan utama ditambah penyaluran di kedua ujung (menembus balok di atas
 * dan pilecap/sloof di bawah) — panjang kolom saja akan kurang.
 */
export function bbsKolom(input: InputBbsKolom): HasilBBS {
  const {
    bMm, hMm, tinggiM, selimutMm, dUtamaMm, nTulangan,
    dSengkangMm, jarakSengkangMm,
  } = input
  if (!(tinggiM > 0)) throw new Error('Tinggi kolom harus > 0')

  const n = input.jumlahKolom ?? 1
  const ldM = panjangPenyaluranM(dUtamaMm)
  const intiBM = (bMm - 2 * selimutMm) / 1000
  const intiHM = (hMm - 2 * selimutMm) / 1000
  if (intiBM <= 0 || intiHM <= 0) throw new Error('Selimut melebihi dimensi kolom')

  const nSengkang = Math.ceil(tinggiM * 1000 / jarakSengkangMm) + 1

  return susunBBS([
    {
      uraian: 'Tulangan utama kolom + penyaluran 2 ujung',
      bentuk: 'kait-2', tipe: 'BjTS', diameterMm: dUtamaMm,
      segmenM: [tinggiM + 2 * ldM], jumlah: nTulangan * n,
    },
    {
      uraian: `Sengkang kolom @${jarakSengkangMm}`,
      bentuk: 'sengkang', tipe: 'BjTP', diameterMm: dSengkangMm,
      segmenM: [intiBM, intiHM, intiBM, intiHM],
      jumlah: nSengkang * n,
    },
  ])
}

/** Gabungkan beberapa BBS jadi satu daftar — untuk rekap proyek. */
export function gabungBBS(daftar: HasilBBS[]): HasilBBS {
  const batang: BatangBBS[] = []
  for (const h of daftar) {
    for (const b of h.batang) batang.push({ ...b, nomor: batang.length + 1 })
  }
  if (batang.length === 0) return susunBBS([])

  // Rekap dihitung ULANG dari gabungan, bukan menjumlah rekap masing-masing —
  // kalau dijumlah, sisa potongan terhitung berkali-kali padahal batang dari
  // elemen berbeda bisa dipotong dari lonjor yang sama.
  const hasil = susunBBS(batang.map((b) => ({
    uraian: b.uraian, bentuk: b.bentuk, tipe: b.tipe,
    diameterMm: b.diameterMm,
    // Segmen dikembalikan tanpa kait — `hitungBatang` menambahkannya lagi.
    segmenM: b.segmenM, jumlah: b.jumlah,
    // ⚠ `sudutKait` WAJIB ikut. Tanpanya `hitungBatang` memakai bawaan per
    // bentuk (90° untuk kait-1/kait-2), sehingga tulangan tumpuan yang
    // aslinya 135° tersusun ulang lebih panjang — tonase bertambah diam-diam.
    sudutKait: b.sudutKait,
  })))

  const catatanUnik = [...new Set(daftar.flatMap((h) => h.catatan))]
  return { ...hasil, catatan: [...new Set([...hasil.catatan, ...catatanUnik])] }
}

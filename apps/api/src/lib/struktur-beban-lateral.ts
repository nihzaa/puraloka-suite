// BEBAN LATERAL — gempa statik ekuivalen, angin, dan simpangan antar tingkat.
// PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA, DAN KENAPA IA PRASYARAT
// ══════════════════════════════════════════════════════════════════════════════
//
// Sampai 2026-08-19 seluruh modul struktur di aplikasi ini menghitung beban
// GRAVITASI saja. Akibatnya bukan sekadar "ada yang kurang": tiga modul lain
// menyebutkan batasnya sendiri dengan menunjuk berkas yang belum ada —
//
//   struktur-sloof.ts   "gaya tarik aksial akibat gempa belum diperiksa"
//   struktur-baja.ts    "sambungan belum diperiksa"
//   struktur-kolom      diagram P-M lengkap, tetapi Mu-nya diketik tangan
//
// Berkas inilah yang menyediakan Mu itu.
//
// ── Kenapa STATIK EKUIVALEN, bukan analisa dinamik
//
// SNI 1726:2019 §7.6 mengizinkan prosedur gaya lateral ekuivalen untuk
// bangunan reguler yang tidak terlalu tinggi. Itu mencakup hampir seluruh
// pekerjaan kontraktor menengah: ruko, rumah tinggal, gudang, kantor 2–4
// lantai. Analisa dinamik (respons spektrum) butuh model 3D dan matriks
// kekakuan — di luar cakupan aplikasi ini, dan menyediakannya setengah jalan
// lebih berbahaya daripada tidak sama sekali.
//
// Batas keberlakuannya DIPERIKSA, bukan dianggap: bangunan yang melewati batas
// itu ditandai, bukan dihitung diam-diam dengan rumus yang tak berlaku.
//
// ── Kenapa DRIFT ikut di sini
//
// Simpangan antar tingkat adalah satu-satunya pemeriksaan gempa yang gagalnya
// TIDAK meruntuhkan bangunan tetapi merusak isinya: dinding retak, kusen
// terjepit, kaca pecah, pipa putus. Kerusakan yang muncul pada gempa sedang —
// yang pasti terjadi beberapa kali seumur bangunan — sementara keruntuhan
// hanya diperhitungkan untuk gempa besar yang mungkin tak pernah datang.
//
// Ia dihitung dari gaya yang sama, jadi memisahkannya ke berkas lain berarti
// dua tempat yang harus dibaca untuk satu pertanyaan.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa } from './struktur-beton.js'

/**
 * Kategori desain seismik (KDS) — SNI 1726:2019 Tabel 8 & 9.
 *
 * Menentukan sistem struktur apa yang boleh dipakai dan seberapa ketat
 * pendetailannya. Bukan sekadar label: bangunan KDS D di wilayah yang sama
 * butuh sengkang jauh lebih rapat daripada KDS B.
 */
export type KategoriSeismik = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

/**
 * Sistem penahan gaya gempa dan koefisiennya — SNI 1726:2019 Tabel 12.
 *
 * `R`  = koefisien modifikasi respons (makin besar = makin daktail = gaya
 *        rencana makin kecil, tetapi pendetailannya makin ketat)
 * `Cd` = faktor pembesaran simpangan
 * `omega0` = faktor kuat lebih (untuk elemen yang tak boleh leleh)
 *
 * Hanya sistem yang lazim dipakai kontraktor menengah. Memilih R yang salah
 * adalah kesalahan paling mahal di seluruh perhitungan gempa: R = 8 alih-alih
 * R = 3 mengecilkan gaya rencana 2,7× — dan bangunannya tetap berdiri sampai
 * gempa datang.
 */
export const SISTEM_STRUKTUR = {
  rangka_pemikul_momen_khusus: { R: 8, Cd: 5.5, omega0: 3, nama: 'Rangka pemikul momen khusus (beton)' },
  rangka_pemikul_momen_menengah: { R: 5, Cd: 4.5, omega0: 3, nama: 'Rangka pemikul momen menengah (beton)' },
  rangka_pemikul_momen_biasa: { R: 3, Cd: 2.5, omega0: 3, nama: 'Rangka pemikul momen biasa (beton)' },
  dinding_geser_khusus: { R: 6, Cd: 5, omega0: 2.5, nama: 'Dinding geser beton khusus' },
  dinding_geser_biasa: { R: 5, Cd: 4.5, omega0: 2.5, nama: 'Dinding geser beton biasa' },
  rangka_baja_bresing_konsentrik: { R: 6, Cd: 5, omega0: 2, nama: 'Rangka baja bresing konsentrik khusus' },
} as const

export type SistemStruktur = keyof typeof SISTEM_STRUKTUR

/**
 * Kategori risiko bangunan & faktor keutamaan Ie — SNI 1726:2019 Tabel 3 & 4.
 *
 * Rumah sakit dan pemadam kebakaran (KR IV) dirancang untuk gaya 1,5× lebih
 * besar bukan karena bangunannya lebih berharga, melainkan karena ia harus
 * TETAP BERFUNGSI sesudah gempa saat semua orang membutuhkannya.
 */
export const KATEGORI_RISIKO = {
  I: { Ie: 1.0, nama: 'Risiko rendah (gudang, bangunan pertanian)' },
  II: { Ie: 1.0, nama: 'Risiko biasa (rumah, ruko, kantor, sekolah kecil)' },
  III: { Ie: 1.25, nama: 'Risiko tinggi (sekolah besar, mal, gedung pertemuan)' },
  IV: { Ie: 1.5, nama: 'Risiko sangat tinggi (rumah sakit, pemadam, pembangkit)' },
} as const

export type KategoriRisiko = keyof typeof KATEGORI_RISIKO

/**
 * Koefisien Ct dan x untuk perioda fundamental pendekatan — SNI 1726 §7.8.2.1.
 *
 * Ta = Ct · hn^x
 */
export const KOEF_PERIODA = {
  rangka_beton: { Ct: 0.0466, x: 0.9, nama: 'Rangka beton pemikul momen' },
  rangka_baja: { Ct: 0.0724, x: 0.8, nama: 'Rangka baja pemikul momen' },
  lainnya: { Ct: 0.0488, x: 0.75, nama: 'Sistem struktur lainnya' },
} as const

export type TipeRangka = keyof typeof KOEF_PERIODA

/**
 * Batas simpangan antar tingkat — SNI 1726:2019 Tabel 20, sebagai pecahan
 * tinggi tingkat.
 *
 * Bangunan KR IV dibatasi lebih ketat (0,010) karena ia harus tetap berfungsi:
 * pipa gas yang putus dan pintu yang terjepit membuat rumah sakit tak bisa
 * dipakai meski strukturnya utuh.
 */
export const BATAS_DRIFT = {
  I: 0.020, II: 0.020, III: 0.015, IV: 0.010,
} as const

/** Batas tinggi bangunan untuk prosedur statik ekuivalen, m. SNI 1726 §7.6. */
export const TINGGI_MAKS_STATIK_M = 40

export interface Tingkat {
  /** Nama tingkat — "Lantai 2", "Atap". Dipakai di keluaran supaya bisa dibaca. */
  nama: string
  /** Tinggi tingkat ini dari dasar, m. */
  tinggiM: number
  /** Berat seismik tingkat ini (beban mati + sebagian hidup), kN. */
  beratKn: number
}

export interface InputGempa {
  tingkat: Tingkat[]
  /** Percepatan spektral periode pendek yang sudah disesuaikan situs, g. */
  sds: number
  /** Percepatan spektral periode 1 detik yang sudah disesuaikan situs, g. */
  sd1: number
  /** Periode transisi panjang, detik. Umumnya 6–20 untuk Indonesia. */
  tlDetik?: number
  sistem: SistemStruktur
  risiko: KategoriRisiko
  tipeRangka: TipeRangka
  kategoriSeismik: KategoriSeismik
}

export interface GayaTingkat {
  nama: string
  tinggiM: number
  beratKn: number
  /** Gaya lateral yang bekerja di tingkat ini, kN. */
  gayaKn: number
  /** Gaya geser yang dipikul tingkat ini dan di bawahnya, kN. */
  geserKn: number
  /** Bagian dari gaya total, 0–1. */
  porsi: number
}

export interface HasilGempa {
  periksa: Periksa[]
  aman: boolean
  /** Gaya geser dasar, kN. */
  vKn: number
  /** Koefisien respons seismik yang dipakai. */
  cs: number
  /** Perioda fundamental pendekatan, detik. */
  taDetik: number
  /** Eksponen distribusi k — 1 untuk T ≤ 0,5 s, 2 untuk T ≥ 2,5 s. */
  k: number
  gaya: GayaTingkat[]
  catatan: string[]
  antara: Record<string, number>
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Gaya gempa statik ekuivalen — SNI 1726:2019 §7.8.
 *
 * Alur: berat total → perioda → koefisien Cs → geser dasar V → distribusi ke
 * tiap tingkat. Tiap langkahnya dipulangkan supaya bisa diperiksa; angka geser
 * dasar yang muncul tanpa asal-usul tak bisa dibantah maupun dibenarkan.
 */
export function analisaGempaStatik(input: InputGempa): HasilGempa {
  const { tingkat, sds, sd1, sistem, risiko, tipeRangka, kategoriSeismik } = input

  if (!tingkat.length) throw new Error('Minimal satu tingkat')
  positif('SDS', sds)
  positif('SD1', sd1)

  const sis = SISTEM_STRUKTUR[sistem]
  if (!sis) throw new Error(`sistem struktur tak dikenal: ${sistem}`)
  const kr = KATEGORI_RISIKO[risiko]
  if (!kr) throw new Error(`kategori risiko tak dikenal: ${risiko}`)
  const kp = KOEF_PERIODA[tipeRangka]
  if (!kp) throw new Error(`tipe rangka tak dikenal: ${tipeRangka}`)

  for (const t of tingkat) {
    positif(`tinggi tingkat "${t.nama}"`, t.tinggiM)
    positif(`berat tingkat "${t.nama}"`, t.beratKn)
  }

  /*
    Tingkat WAJIB urut dari bawah ke atas. Urutan yang acak menghasilkan
    distribusi gaya yang terbalik — gaya terbesar di lantai bawah alih-alih di
    atap — dan hasilnya tetap "masuk akal" bagi yang tak memeriksa.
  */
  for (let i = 1; i < tingkat.length; i++) {
    if (tingkat[i].tinggiM <= tingkat[i - 1].tinggiM) {
      throw new Error(
        `Tingkat harus urut dari bawah ke atas: "${tingkat[i].nama}" `
        + `(${tingkat[i].tinggiM} m) tidak lebih tinggi daripada `
        + `"${tingkat[i - 1].nama}" (${tingkat[i - 1].tinggiM} m).`,
      )
    }
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  const wTotalKn = tingkat.reduce((s, t) => s + t.beratKn, 0)
  const hnM = tingkat[tingkat.length - 1].tinggiM
  const tl = input.tlDetik ?? 20

  // ── Perioda fundamental pendekatan (§7.8.2.1) ────────────────────────────
  const taDetik = kp.Ct * hnM ** kp.x

  // ── Koefisien respons seismik Cs (§7.8.1.1) ──────────────────────────────
  const csHitung = sds / (sis.R / kr.Ie)

  /*
    Cs dibatasi ATAS oleh perioda: bangunan bertingkat banyak berperioda
    panjang dan tak menerima percepatan sebesar bangunan pendek. Batas ini
    yang membuat gedung tinggi tidak dirancang untuk gaya yang mustahil.
  */
  const csMaks = taDetik <= tl
    ? sd1 / (taDetik * (sis.R / kr.Ie))
    : (sd1 * tl) / (taDetik ** 2 * (sis.R / kr.Ie))

  /*
    Cs juga dibatasi BAWAH — 0,044·SDS·Ie ≥ 0,01. Tanpa batas ini, bangunan
    sangat lentur menerima gaya rencana mendekati nol, dan tak ada bangunan
    yang boleh dirancang tanpa ketahanan lateral sama sekali.
  */
  const csMin = Math.max(0.044 * sds * kr.Ie, 0.01)

  let cs = Math.min(csHitung, csMaks)
  let csDibatasiOleh = cs === csMaks ? 'batas atas (perioda)' : 'rumus dasar'
  if (cs < csMin) { cs = csMin; csDibatasiOleh = 'batas bawah' }

  const vKn = cs * wTotalKn

  // ── Distribusi vertikal (§7.8.3) ─────────────────────────────────────────
  /*
    Eksponen k memiringkan distribusi ke atas untuk bangunan berperioda
    panjang: pada T ≥ 2,5 s gaya di atap hampir dua kali lipat distribusi
    linear. Memakai k = 1 untuk semua bangunan mengecilkan gaya di tingkat
    atas — tempat yang paling banyak bergerak.
  */
  const k = taDetik <= 0.5 ? 1 : taDetik >= 2.5 ? 2 : 1 + (taDetik - 0.5) / 2

  const wh = tingkat.map((t) => t.beratKn * t.tinggiM ** k)
  const whTotal = wh.reduce((s, x) => s + x, 0)

  const gayaMentah = tingkat.map((t, i) => ({
    nama: t.nama,
    tinggiM: t.tinggiM,
    beratKn: t.beratKn,
    porsi: wh[i] / whTotal,
    gayaKn: (wh[i] / whTotal) * vKn,
  }))

  /* Geser tingkat = jumlah gaya di tingkat ini dan SEMUA yang di atasnya. */
  const gaya: GayaTingkat[] = gayaMentah.map((g, i) => ({
    ...g,
    gayaKn: Math.round(g.gayaKn * 1e4) / 1e4,
    porsi: Math.round(g.porsi * 1e6) / 1e6,
    geserKn: Math.round(
      gayaMentah.slice(i).reduce((s, x) => s + x.gayaKn, 0) * 1e4,
    ) / 1e4,
  }))

  // ── Batas keberlakuan prosedur ───────────────────────────────────────────
  periksa.push({
    nama: 'Tinggi untuk prosedur statik',
    nilai: hnM,
    syarat: TINGGI_MAKS_STATIK_M,
    satuan: 'm',
    aman: hnM <= TINGGI_MAKS_STATIK_M,
    rasio: Math.round((hnM / TINGGI_MAKS_STATIK_M) * 1e4) / 1e4,
    rumus: `hn ≤ ${TINGGI_MAKS_STATIK_M} m (SNI 1726 §7.6 — di atas ini butuh analisa dinamik)`,
  })
  if (hnM > TINGGI_MAKS_STATIK_M) {
    catatan.push(
      `Bangunan setinggi ${hnM} m MELEWATI batas prosedur statik ekuivalen `
      + `(${TINGGI_MAKS_STATIK_M} m). Angka di bawah tetap dihitung supaya bisa `
      + 'dibandingkan, tetapi TIDAK SAH sebagai dasar desain — bangunan setinggi '
      + 'ini butuh analisa respons spektrum yang belum ada di aplikasi ini.',
    )
  }

  /*
    KDS A tak perlu perhitungan gempa sama sekali (§7.5), tetapi tetap butuh
    ikatan minimum. Menghitungnya tak berbahaya; yang berbahaya adalah
    menganggap KDS A berarti "tak ada gaya lateral".
  */
  if (kategoriSeismik === 'A') {
    catatan.push(
      'Kategori desain seismik A: SNI 1726 §7.5 tidak menuntut perhitungan '
      + 'gempa, hanya gaya ikatan minimum 1% berat tingkat. Angka di bawah '
      + 'boleh dipakai sebagai pembanding, tetapi yang mengikat adalah gaya '
      + 'ikatan minimum itu.',
    )
  }

  catatan.push(
    `Cs = ${cs.toFixed(5)} ditentukan oleh ${csDibatasiOleh} `
    + `(rumus dasar ${csHitung.toFixed(5)}, batas atas ${csMaks.toFixed(5)}, `
    + `batas bawah ${csMin.toFixed(5)}). R = ${sis.R} dari sistem `
    + `"${sis.nama}" — memilih R yang salah adalah kesalahan paling mahal di `
    + 'seluruh perhitungan gempa: R = 8 alih-alih 3 mengecilkan gaya rencana '
    + '2,7 kali, dan bangunannya tetap berdiri sampai gempa datang.',
  )
  catatan.push(
    `Perioda pendekatan Ta = ${kp.Ct} × ${hnM}^${kp.x} = ${taDetik.toFixed(4)} s, `
    + `eksponen distribusi k = ${k.toFixed(3)}. Perioda ini PENDEKATAN; perioda `
    + 'sesungguhnya dari analisa modal boleh lebih panjang, dan itu MENGECILKAN '
    + 'gaya — karena itu SNI membatasinya dengan Cu·Ta yang belum diperiksa di sini.',
  )
  catatan.push(
    'Yang dihitung di sini SATU ARAH. Bangunan harus diperiksa pada dua arah '
    + 'ortogonal, dan untuk KDS C ke atas juga kombinasi 100%+30%. Torsi '
    + 'akibat eksentrisitas massa/kekakuan juga belum diperhitungkan.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    vKn: Math.round(vKn * 1e4) / 1e4,
    cs: Math.round(cs * 1e6) / 1e6,
    taDetik: Math.round(taDetik * 1e4) / 1e4,
    k: Math.round(k * 1e4) / 1e4,
    gaya,
    catatan,
    antara: {
      wTotalKn: Math.round(wTotalKn * 1e4) / 1e4,
      hnM,
      R: sis.R,
      Cd: sis.Cd,
      Ie: kr.Ie,
      csHitung: Math.round(csHitung * 1e6) / 1e6,
      csMaks: Math.round(csMaks * 1e6) / 1e6,
      csMin: Math.round(csMin * 1e6) / 1e6,
    },
  }
}

// ── ANGIN ────────────────────────────────────────────────────────────────────

/**
 * Kategori eksposur — SNI 1727:2020 §26.7.
 *
 * B = perkotaan rapat, C = terbuka, D = tepi pantai/danau.
 * Kd = faktor arah angin (0,85 untuk bangunan gedung).
 */
export const EKSPOSUR = {
  B: { alpha: 7.0, zg: 365.76, nama: 'Perkotaan/pinggiran rapat' },
  C: { alpha: 9.5, zg: 274.32, nama: 'Terbuka, halangan tersebar' },
  D: { alpha: 11.5, zg: 213.36, nama: 'Datar tanpa halangan, tepi air' },
} as const

export type Eksposur = keyof typeof EKSPOSUR

export const KD_GEDUNG = 0.85
/** Faktor efek tiupan angin untuk bangunan kaku — SNI 1727 §26.11. */
export const G_KAKU = 0.85

export interface InputAngin {
  /** Kecepatan angin dasar, m/s. */
  vMs: number
  eksposur: Eksposur
  /** Tinggi bangunan, m. */
  tinggiM: number
  /** Lebar bidang yang tertiup angin, m. */
  lebarM: number
  /** Koefisien tekanan sisi angin datang. Bawaan +0,8 (SNI 1727 Gbr 27.3-1). */
  cpTekan?: number
  /** Koefisien tekanan sisi belakang. Bawaan −0,5. */
  cpHisap?: number
  /** Faktor topografi. Bawaan 1,0 (datar). */
  kzt?: number
}

export interface HasilAngin {
  /** Tekanan velositas pada tinggi bangunan, N/m². */
  qzNPerM2: number
  /** Tekanan rencana total (tekan + hisap), N/m². */
  pNPerM2: number
  /** Gaya angin total pada bidang, kN. */
  gayaKn: number
  kz: number
  catatan: string[]
}

/**
 * Gaya angin pada bidang vertikal — SNI 1727:2020 prosedur terarah
 * disederhanakan.
 *
 * Dipakai untuk gudang, kanopi, dan bangunan rendah — tempat angin sering
 * mengalahkan gempa. Rangka atap baja ringan yang dihitung tanpa angin adalah
 * penyebab atap terbang yang paling sering, dan atap yang terbang tak
 * memberi peringatan lebih dulu.
 */
export function analisaAngin(input: InputAngin): HasilAngin {
  const { vMs, eksposur, tinggiM, lebarM } = input
  positif('kecepatan angin', vMs)
  positif('tinggi', tinggiM)
  positif('lebar', lebarM)

  const eks = EKSPOSUR[eksposur]
  if (!eks) throw new Error(`eksposur tak dikenal: ${eksposur}`)

  const cpTekan = input.cpTekan ?? 0.8
  const cpHisap = input.cpHisap ?? -0.5
  const kzt = input.kzt ?? 1.0

  /*
    Kz dihitung pada tinggi bangunan, dengan lantai bawah dibatasi 4,6 m —
    di bawah itu kekasaran permukaan membuat rumus tak berlaku, dan
    mengekstrapolasinya menghasilkan tekanan yang terlalu kecil.
  */
  const z = Math.max(tinggiM, 4.6)
  const kz = 2.01 * (z / eks.zg) ** (2 / eks.alpha)

  /* qz = 0,613 · Kz · Kzt · Kd · V²  (SI, N/m²) */
  const qzNPerM2 = 0.613 * kz * kzt * KD_GEDUNG * vMs ** 2

  /*
    Tekanan rencana menjumlahkan sisi TEKAN dan sisi HISAP. Menghitung sisi
    tekan saja mengecilkan gaya total 38% — dan sisi hisap itulah yang
    mencabut atap dan menghancurkan dinding penutup.
  */
  const pNPerM2 = qzNPerM2 * G_KAKU * (cpTekan - cpHisap)
  const gayaKn = (pNPerM2 * tinggiM * lebarM) / 1000

  return {
    qzNPerM2: Math.round(qzNPerM2 * 100) / 100,
    pNPerM2: Math.round(pNPerM2 * 100) / 100,
    gayaKn: Math.round(gayaKn * 1e4) / 1e4,
    kz: Math.round(kz * 1e4) / 1e4,
    catatan: [
      `Tekanan menjumlahkan sisi TEKAN (Cp ${cpTekan}) dan sisi HISAP `
      + `(Cp ${cpHisap}). Menghitung sisi tekan saja mengecilkan gaya total `
      + `${Math.round((1 - cpTekan / (cpTekan - cpHisap)) * 100)}% — dan sisi `
      + 'hisap itulah yang mencabut atap.',
      `Eksposur ${eksposur} (${eks.nama}). Eksposur yang salah menggeser `
      + 'tekanan sampai 40%: bangunan di tepi pantai yang dihitung sebagai '
      + 'perkotaan rapat menerima gaya jauh lebih kecil daripada seharusnya.',
      'Prosedur ini untuk bangunan KAKU bertingkat rendah pada bidang '
      + 'VERTIKAL. Beban angin pada atap (terutama hisap di tepi dan sudut, '
      + 'yang jauh lebih besar) belum dihitung.',
    ],
  }
}

// ── SIMPANGAN ANTAR TINGKAT ──────────────────────────────────────────────────

export interface InputDrift {
  /** Simpangan elastis tiap tingkat hasil analisa, mm. Urut bawah ke atas. */
  simpanganElastisMm: number[]
  /** Tinggi tiap tingkat (bukan kumulatif), m. Urut sama. */
  tinggiTingkatM: number[]
  /** Faktor pembesaran simpangan sistem. */
  cd: number
  /** Faktor keutamaan. */
  ie: number
  risiko: KategoriRisiko
}

export interface HasilDrift {
  periksa: Periksa[]
  aman: boolean
  tingkat: Array<{
    indeks: number
    /** Simpangan antar tingkat yang DIPERBESAR, mm. */
    driftMm: number
    /** Sebagai pecahan tinggi tingkat. */
    rasio: number
    batas: number
    aman: boolean
  }>
  catatan: string[]
}

/**
 * Periksa simpangan antar tingkat — SNI 1726:2019 §7.12.
 *
 * Simpangan elastis hasil analisa DIPERBESAR dengan Cd/Ie sebelum dibandingkan
 * batas. Melewatkan pembesaran ini adalah kesalahan yang paling sering: ia
 * membuat bangunan yang sebenarnya melewati batas 2–5 kali lipat terlihat
 * aman.
 */
export function analisaDrift(input: InputDrift): HasilDrift {
  const { simpanganElastisMm, tinggiTingkatM, cd, ie, risiko } = input

  if (simpanganElastisMm.length !== tinggiTingkatM.length) {
    throw new Error(
      `Jumlah simpangan (${simpanganElastisMm.length}) tak sama dengan jumlah `
      + `tinggi tingkat (${tinggiTingkatM.length})`,
    )
  }
  if (!simpanganElastisMm.length) throw new Error('Minimal satu tingkat')
  positif('Cd', cd)
  positif('Ie', ie)

  const batasRasio = BATAS_DRIFT[risiko]
  if (batasRasio === undefined) throw new Error(`kategori risiko tak dikenal: ${risiko}`)

  const periksa: Periksa[] = []
  const tingkat = simpanganElastisMm.map((deltaE, i) => {
    positif(`tinggi tingkat ${i + 1}`, tinggiTingkatM[i])
    const sebelumnya = i === 0 ? 0 : simpanganElastisMm[i - 1]
    /* Simpangan ANTAR tingkat, bukan simpangan total dari dasar. */
    const selisihElastis = deltaE - sebelumnya
    const driftMm = (selisihElastis * cd) / ie
    const rasio = driftMm / (tinggiTingkatM[i] * 1000)
    const aman = rasio <= batasRasio

    periksa.push({
      nama: `Simpangan tingkat ${i + 1}`,
      nilai: Math.round(rasio * 1e5) / 1e5,
      syarat: batasRasio,
      satuan: '× tinggi',
      aman,
      rasio: Math.round((rasio / batasRasio) * 1e4) / 1e4,
      rumus: `Δ = δe·Cd/Ie ≤ ${batasRasio}·h (SNI 1726 Tabel 20, KR ${risiko})`,
    })

    return {
      indeks: i + 1,
      driftMm: Math.round(driftMm * 100) / 100,
      rasio: Math.round(rasio * 1e5) / 1e5,
      batas: batasRasio,
      aman,
    }
  })

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    tingkat,
    catatan: [
      `Simpangan elastis DIPERBESAR dengan Cd/Ie = ${cd}/${ie} = `
      + `${(cd / ie).toFixed(3)} sebelum dibandingkan batas. Melewatkan `
      + 'pembesaran ini membuat bangunan yang sebenarnya melewati batas '
      + 'beberapa kali lipat terlihat aman — kesalahan yang paling sering '
      + 'terjadi pada pemeriksaan simpangan.',
      'Kegagalan simpangan TIDAK meruntuhkan bangunan; ia meretakkan dinding, '
      + 'menjepit kusen, memecahkan kaca, dan memutus pipa. Kerusakan itu '
      + 'muncul pada gempa SEDANG — yang pasti terjadi beberapa kali seumur '
      + 'bangunan — sementara keruntuhan hanya diperhitungkan untuk gempa besar.',
      'Simpangan yang dimasukkan harus hasil analisa struktur pada gaya gempa '
      + 'RENCANA (bukan gaya layan), dan pada arah yang sama dengan gayanya.',
    ],
  }
}

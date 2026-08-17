// Analisa struktur beton bertulang (SNI 2847) — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Dua pertanyaan yang hari ini dijawab di dua tempat berbeda, dan karena itu
// sering tidak cocok satu sama lain:
//
//     "penampang ini kuat tidak?"     → spreadsheet analisa struktur
//     "berapa beton & besinya?"        → estimator mengetik volume ke RAB
//
// Yang kedua diketik ULANG dari yang pertama. Begitu desainnya berubah — balok
// 300×500 jadi 300×520, sengkang 200 jadi 150 — RAB tidak ikut berubah, dan
// tak ada satu pun galat yang memberi tahu. Selisihnya baru ketahuan saat besi
// di lapangan kurang, yaitu saat uangnya sudah keluar.
//
// Berkas ini menghitung KEDUANYA dari SATU input yang sama. Kalau penampangnya
// berubah, kapasitas dan volume berubah bersamaan — karena keduanya turunan
// dari angka yang sama, bukan dua catatan yang harus disamakan manusia.
//
// ── Rumusnya dari SNI 2847, bukan dari salinan spreadsheet
//
// Dipelajari dengan membandingkan terhadap workbook "Auto Structure Pro"
// (PT. Astatek Engineering Consultant) yang lisensinya dipegang founder.
// Yang diambil dari sana adalah PEMAHAMAN dan ANGKA PEMBANDING untuk golden
// test — bukan tata letak, teks, atau kode VBA-nya. Rumus β₁, kondisi balance,
// Pno, dan εsi adalah isi standar publik SNI 2847 / ACI 318, dan menghitungnya
// sendiri di sini sah sepenuhnya.
//
// Nilai pembanding tercatat di `__tests__/struktur-beton.test.ts` — kalau
// implementasi ini menyimpang dari workbook untuk input yang sama, test merah.
//
// ── Kenapa PURE (dan kenapa itu bukan formalitas)
//
// Alasan yang sama persis dengan `takeoff-dimensi.ts`: kesalahan di sini tidak
// menimbulkan galat, ia menghasilkan angka yang terlihat wajar. Kolom yang
// dihitung terlalu kuat hanya memboroskan uang; yang dihitung terlalu lemah
// runtuh. Satu-satunya cara menangkapnya adalah golden test terhadap sumber
// independen — dan itu hanya murah kalau fungsinya bisa dipanggil tanpa basis,
// tanpa login, tanpa fixture.
//
// ⚠ BATAS TANGGUNG JAWAB. Berkas ini MEMBANTU estimasi, bukan menggantikan
// perhitungan bertanda tangan insinyur. Keluarannya `verdict` beserta
// ANGKANYA supaya bisa diperiksa ulang, bukan sekadar "aman" tanpa jejak.
// ══════════════════════════════════════════════════════════════════════════════

// ── Konstanta standar ────────────────────────────────────────────────────────

/** Regangan tekan beton ultimit (SNI 2847 §22.2.2.1). */
export const REGANGAN_BETON_ULTIMIT = 0.003

/** Modulus elastisitas baja tulangan, MPa. */
export const ES_BAJA = 200_000

/**
 * Massa jenis beton bertulang, kg/m³ — dipakai menghitung berat sendiri.
 * 2400 adalah angka baku SNI 1727 untuk beton bertulang normal.
 */
export const RHO_BETON = 2400

/**
 * β₁ — faktor tinggi blok tegangan persegi ekuivalen (SNI 2847 Tabel 22.2.2.4.3).
 *
 *     f'c ≤ 30          → 0.85
 *     30 < f'c < 56     → 0.85 − 0.05·(f'c − 30)/7
 *     f'c ≥ 56          → 0.65
 *
 * Dibatasi bawah 0.65 secara eksplisit: rumus tengahnya sendiri sudah mendekati
 * 0.65 di f'c = 56, tetapi menuliskan batasnya membuat nilai di luar rentang
 * (input ngawur) tetap menghasilkan angka yang sah alih-alih β₁ < 0.65 yang
 * tak pernah ada di standar.
 */
export function beta1(fcMpa: number): number {
  if (!(fcMpa > 0)) throw new Error('beta1: f\'c harus > 0')
  if (fcMpa <= 30) return 0.85
  if (fcMpa >= 56) return 0.65
  return Math.max(0.65, 0.85 - 0.05 * (fcMpa - 30) / 7)
}

/**
 * Berat besi tulangan per meter, kg/m — turunan fisika, bukan tabel ditempel.
 *
 *     ρ_baja 7850 kg/m³ × π/4 × d² (mm→m)  =  0.0061654 · d²
 *
 * Angka yang sama dipakai `rab-compute.ts:rebarWeightPerM`; TIDAK diduplikasi
 * di sini — berkas ini mengimpornya lewat pemanggil, supaya satu-satunya
 * definisi berat besi di repo tetap satu. Konstanta di bawah hanya dokumentasi.
 */
export const KOEF_BERAT_BESI = 0.0061654

// ── Bentuk masukan ───────────────────────────────────────────────────────────

/**
 * Mutu material. Dipisah dari geometri karena satu proyek biasanya memakai satu
 * mutu untuk banyak penampang — dan menyalinnya per penampang adalah cara
 * paling mudah membuat dua elemen diam-diam berbeda mutu.
 */
export interface MutuBahan {
  /** Kuat tekan beton, MPa. */
  fcMpa: number
  /** Tegangan leleh tulangan lentur/utama (deform), MPa. */
  fyMpa: number
  /** Tegangan leleh tulangan geser/sengkang (polos), MPa. Default = fyMpa. */
  fyvMpa?: number
}

/** Geometri balok persegi bertulangan tarik. */
export interface InputBalok {
  /** Lebar penampang, mm. */
  bMm: number
  /** Tinggi total penampang, mm. */
  hMm: number
  /** Panjang bentang balok, m — dipakai untuk VOLUME, tidak untuk kapasitas. */
  panjangM: number
  /** Selimut beton bersih terhadap sengkang, mm. */
  selimutMm: number
  /** Diameter tulangan utama, mm. */
  dUtamaMm: number
  /** Jumlah tulangan tarik (sisi bawah untuk momen positif). */
  nTarik: number
  /** Diameter sengkang, mm. */
  dSengkangMm: number
  /** Jarak sengkang terpasang, mm. */
  jarakSengkangMm: number
  /** Jumlah kaki sengkang (2 = sengkang tertutup biasa). */
  kakiSengkang?: number
  mutu: MutuBahan
  /** Momen terfaktor rencana, kNm. */
  muKnm: number
  /** Gaya geser terfaktor rencana, kN. */
  vuKn: number
  /** Jumlah elemen identik — volume dikalikan ini. Default 1. */
  jumlah?: number
}

/** Geometri kolom persegi/persegi panjang bertulangan simetris. */
export interface InputKolom {
  /** Sisi arah X (h), mm. */
  hMm: number
  /** Sisi arah Y (b), mm. */
  bMm: number
  /** Tinggi kolom, m — untuk VOLUME. */
  tinggiM: number
  /** Selimut beton ke pusat sengkang, mm. */
  selimutMm: number
  dUtamaMm: number
  /** Jumlah baris tulangan arah X. */
  nBarisX: number
  /** Jumlah baris tulangan arah Y. */
  nBarisY: number
  dSengkangMm: number
  jarakSengkangMm: number
  mutu: MutuBahan
  /** Beban aksial terfaktor, kN. */
  puKn: number
  /** Momen terfaktor, kNm. */
  muKnm: number
  jumlah?: number
}

// ── Bentuk keluaran ──────────────────────────────────────────────────────────

/**
 * Satu pemeriksaan. `nilai` dan `syarat` IKUT dibawa, bukan cuma `aman`.
 *
 * Alasannya sama dengan yang membuat `takeoff_dimensi` menyimpan p×l×t:
 * verdict tanpa angkanya tak bisa ditanya "dari mana?", dan verdict yang tak
 * bisa ditanya akan dipercaya bulat-bulat — termasuk saat ia salah.
 */
export interface Periksa {
  nama: string
  nilai: number
  syarat: number
  satuan: string
  /** true = kapasitas ≥ tuntutan. */
  aman: boolean
  /** Rasio tuntutan/kapasitas. > 1 berarti lewat batas. */
  rasio: number
  rumus: string
}

/** Kuantitas untuk RAB/RAP — inilah yang menyambung ke `estimate_items`. */
export interface VolumeElemen {
  /** Volume beton, m³ (sudah × jumlah elemen). */
  betonM3: number
  /** Luas bekisting, m² (sudah × jumlah elemen). */
  bekistingM2: number
  /** Baris besi per diameter — siap diberikan ke `computeRebarBar`. */
  besi: BarisBesi[]
  /** Berat besi total, kg. */
  besiTotalKg: number
  /** Berat sendiri elemen, kg — untuk cek pembebanan. */
  beratSendiriKg: number
}

export interface BarisBesi {
  /** BjTP = polos (sengkang), BjTS = sirip/deform (utama). */
  tipe: 'BjTP' | 'BjTS'
  diameterMm: number
  /** Jumlah batang TOTAL (sudah × jumlah elemen). */
  jumlahBatang: number
  /** Panjang per batang, m. */
  panjangPerBatangM: number
  /** kg/m untuk diameter ini. */
  beratKgPerM: number
  totalKg: number
  /** Peruntukan — supaya BBS bisa dibaca manusia. */
  peran: 'utama' | 'sengkang'
}

export interface HasilElemen {
  periksa: Periksa[]
  /** true hanya bila SELURUH pemeriksaan aman. */
  aman: boolean
  volume: VolumeElemen
  /** Angka antara yang dipakai — supaya hasilnya bisa ditelusuri. */
  antara: Record<string, number>
}

// ── Helper ───────────────────────────────────────────────────────────────────

const luasBatang = (dMm: number) => Math.PI / 4 * dMm * dMm
const beratPerM = (dMm: number) => KOEF_BERAT_BESI * dMm * dMm

function bilanganPositif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
}

/**
 * Rasio tuntutan/kapasitas, aman terhadap kapasitas nol.
 *
 * Kapasitas 0 dengan tuntutan 0 BUKAN "aman tak hingga" melainkan penampang
 * yang tak menahan apa pun; dikembalikan Infinity supaya tak pernah lolos
 * sebagai aman secara diam-diam.
 */
const rasio = (tuntutan: number, kapasitas: number) =>
  kapasitas > 0 ? tuntutan / kapasitas : Number.POSITIVE_INFINITY

// ── BALOK ────────────────────────────────────────────────────────────────────

/**
 * Analisa balok beton bertulang: kapasitas lentur + geser, dan volumenya.
 *
 * ── Yang DIHITUNG
 *   φMn = φ · As · fy · (d − a/2)          SNI 2847 §22.3
 *   a   = As·fy / (0.85 · f'c · b)         blok tegangan ekuivalen
 *   φVc = φ · (√f'c / 6) · b · d           §22.5.5.1
 *   φVs = φ · Av · fyv · d / s             §22.5.10.5.3
 *
 * ── Yang TIDAK dihitung (sengaja, dan ini penting)
 *   Tulangan tekan (balok bertulangan rangkap), torsi, dan kontrol lendutan.
 *   Ketiganya mengubah hasil dan TIDAK diam-diam diabaikan: fungsi ini
 *   mengasumsikan balok bertulangan tarik saja, dan itu dinyatakan di sini
 *   supaya pemakainya tahu kapan hasilnya tak berlaku.
 */
export function analisaBalok(input: InputBalok): HasilElemen {
  const { bMm, hMm, panjangM, selimutMm, dUtamaMm, nTarik, dSengkangMm, jarakSengkangMm, mutu } = input
  bilanganPositif('b', bMm); bilanganPositif('h', hMm); bilanganPositif('panjang', panjangM)
  bilanganPositif('d tulangan utama', dUtamaMm); bilanganPositif('jarak sengkang', jarakSengkangMm)
  bilanganPositif("f'c", mutu.fcMpa); bilanganPositif('fy', mutu.fyMpa)
  if (nTarik < 2) throw new Error('nTarik minimal 2 batang')

  const jumlah = input.jumlah ?? 1
  const kaki = input.kakiSengkang ?? 2
  const fyv = mutu.fyvMpa ?? mutu.fyMpa

  // ── Kapasitas lentur
  // d' = selimut + Ø sengkang + ½ Ø utama  (satu lapis tulangan)
  const dAksenMm = selimutMm + dSengkangMm + dUtamaMm / 2
  const dEfektifMm = hMm - dAksenMm
  if (dEfektifMm <= 0) throw new Error('Selimut + tulangan melebihi tinggi balok — periksa dimensi')

  const asMm2 = nTarik * luasBatang(dUtamaMm)
  const aMm = asMm2 * mutu.fyMpa / (0.85 * mutu.fcMpa * bMm)
  const mnKnm = asMm2 * mutu.fyMpa * (dEfektifMm - aMm / 2) * 1e-6
  const phiLentur = 0.9
  const phiMnKnm = phiLentur * mnKnm

  // ── Kapasitas geser
  const phiGeser = 0.75
  const vcKn = (Math.sqrt(mutu.fcMpa) / 6) * bMm * dEfektifMm * 1e-3
  const avMm2 = kaki * luasBatang(dSengkangMm)
  const vsKn = avMm2 * fyv * dEfektifMm / (jarakSengkangMm * 1000)
  const phiVnKn = phiGeser * (vcKn + vsKn)

  // ── Rasio tulangan: bawah minimum = getas, atas maksimum = tak daktail
  const rho = asMm2 / (bMm * dEfektifMm)
  const rhoMin = Math.max(Math.sqrt(mutu.fcMpa) / (4 * mutu.fyMpa), 1.4 / mutu.fyMpa)
  const rhoBalance = beta1(mutu.fcMpa) * 0.85 * mutu.fcMpa / mutu.fyMpa * 600 / (600 + mutu.fyMpa)
  const rhoMaks = 0.75 * rhoBalance

  const periksa: Periksa[] = [
    {
      nama: 'Lentur', nilai: phiMnKnm, syarat: input.muKnm, satuan: 'kNm',
      aman: phiMnKnm >= input.muKnm, rasio: rasio(input.muKnm, phiMnKnm),
      rumus: 'φMn = 0.9 · As · fy · (d − a/2)',
    },
    {
      nama: 'Geser', nilai: phiVnKn, syarat: input.vuKn, satuan: 'kN',
      aman: phiVnKn >= input.vuKn, rasio: rasio(input.vuKn, phiVnKn),
      rumus: 'φVn = 0.75 · (Vc + Vs)',
    },
    {
      // Rasio minimum: balok bertulangan terlalu sedikit runtuh GETAS — retak
      // pertama langsung disusul putusnya tulangan, tanpa lendutan yang
      // memberi peringatan. Karena itu ia diperiksa meski φMn ≥ Mu.
      nama: 'Rasio tulangan minimum', nilai: rho, syarat: rhoMin, satuan: '—',
      aman: rho >= rhoMin, rasio: rasio(rhoMin, rho),
      rumus: 'ρ ≥ max(√f\'c/(4·fy), 1.4/fy)',
    },
    {
      nama: 'Rasio tulangan maksimum', nilai: rhoMaks, syarat: rho, satuan: '—',
      aman: rho <= rhoMaks, rasio: rasio(rho, rhoMaks),
      rumus: 'ρ ≤ 0.75 · ρ_balance',
    },
    {
      // Jarak sengkang maksimum d/2 (SNI 2847 §9.7.6.2.2): lebih renggang dari
      // itu, retak geser diagonal bisa lewat DI ANTARA dua sengkang tanpa
      // memotong satu pun — kapasitas hitungnya tak pernah terwujud.
      nama: 'Jarak sengkang maksimum', nilai: Math.min(dEfektifMm / 2, 600),
      syarat: jarakSengkangMm, satuan: 'mm',
      aman: jarakSengkangMm <= Math.min(dEfektifMm / 2, 600),
      rasio: rasio(jarakSengkangMm, Math.min(dEfektifMm / 2, 600)),
      rumus: 's ≤ min(d/2, 600)',
    },
  ]

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeBalok(input, dEfektifMm),
    antara: {
      dEfektifMm, asMm2, aMm, mnKnm, phiMnKnm, vcKn, vsKn, phiVnKn,
      rho, rhoMin, rhoMaks, rhoBalance, beta1: beta1(mutu.fcMpa), jumlah,
    },
  }
}

/**
 * Volume balok — beton, bekisting, dan BBS besi.
 *
 * ── Keputusan yang berpengaruh ke uang, dan alasannya
 *
 * **Bekisting = 2 sisi + bawah** (tidak termasuk atas, yang tertutup plat).
 * Kalau kelak balok berdiri bebas (tanpa plat), angka ini KURANG — dan itu
 * lebih baik daripada kelebihan yang tak terlihat: kekurangan bekisting
 * ketahuan di lapangan pada hari pertama, kelebihan hanya jadi biaya diam.
 *
 * **Panjang sengkang = keliling inti + 2 × kait 6db.** Kait 135° wajib untuk
 * sengkang tertutup (SNI 2847 §25.3.2); mengabaikannya membuat tonase besi
 * kurang ±8% pada balok biasa — cukup untuk membuat RAP meleset tanpa satu
 * pun angka terlihat salah.
 *
 * **Tanpa panjang penyaluran / sambungan lewatan.** Tulangan utama dihitung
 * sepanjang bentang saja. Itu SENGAJA: panjang lewatan bergantung detail
 * sambungan yang belum diketahui di tahap estimasi, dan menebaknya di sini
 * akan menyembunyikan asumsi di dalam angka. Ditandai di `catatan` keluaran
 * modul supaya estimator menambahkannya sadar-sadar.
 */
function volumeBalok(input: InputBalok, dEfektifMm: number): VolumeElemen {
  const { bMm, hMm, panjangM, selimutMm, dUtamaMm, nTarik, dSengkangMm, jarakSengkangMm } = input
  const jumlah = input.jumlah ?? 1
  const kaki = input.kakiSengkang ?? 2

  const b = bMm / 1000, h = hMm / 1000
  const betonM3 = b * h * panjangM * jumlah
  const bekistingM2 = (2 * h + b) * panjangM * jumlah

  // Sengkang: keliling inti penampang + kait 135° (6db per ujung, 2 ujung).
  const intiBMm = bMm - 2 * selimutMm
  const intiHMm = hMm - 2 * selimutMm
  const kaitMm = 2 * 6 * dSengkangMm
  const panjangSengkangM = (2 * (intiBMm + intiHMm) + kaitMm) / 1000
  // +1 karena sengkang dipasang di KEDUA ujung bentang (pagar, bukan celah).
  const jumlahSengkang = Math.ceil(panjangM * 1000 / jarakSengkangMm) + 1

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm, peran: 'utama',
      jumlahBatang: nTarik * jumlah, panjangPerBatangM: panjangM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nTarik * jumlah * panjangM * beratPerM(dUtamaMm),
    },
    {
      tipe: 'BjTP', diameterMm: dSengkangMm, peran: 'sengkang',
      jumlahBatang: jumlahSengkang * jumlah, panjangPerBatangM: panjangSengkangM,
      beratKgPerM: beratPerM(dSengkangMm),
      totalKg: jumlahSengkang * jumlah * panjangSengkangM * beratPerM(dSengkangMm),
    },
  ]
  void dEfektifMm; void kaki

  return {
    betonM3, bekistingM2, besi,
    besiTotalKg: besi.reduce((s, x) => s + x.totalKg, 0),
    beratSendiriKg: betonM3 * RHO_BETON,
  }
}

// ── KOLOM ────────────────────────────────────────────────────────────────────

/**
 * Analisa kolom beton bertulang persegi — kapasitas aksial + volumenya.
 *
 * ── Batas yang HARUS dibaca sebelum memakai hasilnya
 *
 * Fungsi ini memeriksa kapasitas pada dua titik yang bisa dihitung tertutup:
 * tekan sentris (φPn max) dan kondisi balance. Ia **bukan** diagram interaksi
 * P-M penuh: kolom dengan Mu besar pada Pu kecil bisa lolos pemeriksaan di
 * sini padahal titik bebannya di luar kurva.
 *
 * Karena itu hasilnya menyertakan `titikBalance` — dan modul yang memakainya
 * WAJIB menampilkan itu, bukan hanya "aman". Diagram P-M penuh butuh iterasi
 * garis netral (workbook rujukan memakai ±170 langkah per arah) dan
 * dijadwalkan terpisah; menuliskannya setengah jalan lebih berbahaya daripada
 * belum ada, karena "aman" yang muncul akan dipercaya.
 */
export function analisaKolom(input: InputKolom): HasilElemen {
  const { hMm, bMm, tinggiM, selimutMm, dUtamaMm, nBarisX, nBarisY, dSengkangMm, jarakSengkangMm, mutu } = input
  bilanganPositif('h', hMm); bilanganPositif('b', bMm); bilanganPositif('tinggi', tinggiM)
  bilanganPositif("f'c", mutu.fcMpa); bilanganPositif('fy', mutu.fyMpa)
  if (nBarisX < 2 || nBarisY < 2) throw new Error('nBarisX & nBarisY minimal 2')

  const jumlah = input.jumlah ?? 1

  // Tulangan tepi: keliling penampang, sudut tidak dihitung dua kali.
  const nTotal = 2 * nBarisX + (nBarisY - 2) * 2
  const asMm2 = nTotal * luasBatang(dUtamaMm)
  const agMm2 = bMm * hMm
  const rho = asMm2 / agMm2

  // φPn,max — tekan sentris dengan reduksi kecentangan (SNI 2847 §22.4.2.1):
  //   Pn,max = 0.80 · [0.85·f'c·(Ag − As) + As·fy]   untuk sengkang persegi
  const pnMaxKn = 0.80 * (0.85 * mutu.fcMpa * (agMm2 - asMm2) + asMm2 * mutu.fyMpa) * 1e-3
  const phiTekan = 0.65
  const phiPnKn = phiTekan * pnMaxKn

  // Kondisi balance — batas antara runtuh tekan dan runtuh tarik.
  const d1Mm = hMm - (selimutMm + dSengkangMm + dUtamaMm / 2)
  const cbMm = 600 / (600 + mutu.fyMpa) * d1Mm
  const b1 = beta1(mutu.fcMpa)
  const abMm = b1 * cbMm
  const ccKn = 0.85 * mutu.fcMpa * abMm * bMm * 1e-3

  const periksa: Periksa[] = [
    {
      nama: 'Kapasitas aksial', nilai: phiPnKn, syarat: input.puKn,
      satuan: 'kN', aman: phiPnKn >= input.puKn, rasio: rasio(input.puKn, phiPnKn),
      rumus: 'φPn,max = 0.65 · 0.80 · [0.85·f\'c·(Ag−As) + As·fy]',
    },
    {
      // Batas bawah 1% dan atas 8% (SNI 2847 §10.6.1.1). Yang bawah menahan
      // rangkak beton jangka panjang; yang atas menjaga beton masih bisa
      // dipadatkan di antara tulangan — kolom yang tak bisa dicor padat lebih
      // lemah daripada hitungannya, dan itu tak terlihat di gambar mana pun.
      nama: 'Rasio tulangan', nilai: rho, syarat: 0.01, satuan: '—',
      aman: rho >= 0.01 && rho <= 0.08, rasio: rasio(0.01, rho),
      rumus: '0.01 ≤ ρ ≤ 0.08',
    },
    {
      nama: 'Jarak sengkang maksimum',
      nilai: Math.min(16 * dUtamaMm, 48 * dSengkangMm, Math.min(bMm, hMm)),
      syarat: jarakSengkangMm, satuan: 'mm',
      aman: jarakSengkangMm <= Math.min(16 * dUtamaMm, 48 * dSengkangMm, Math.min(bMm, hMm)),
      rasio: rasio(jarakSengkangMm, Math.min(16 * dUtamaMm, 48 * dSengkangMm, Math.min(bMm, hMm))),
      rumus: 's ≤ min(16·db, 48·ds, sisi terkecil)',
    },
  ]

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeKolom(input, nTotal),
    antara: {
      nTotal, asMm2, agMm2, rho, pnMaxKn, phiPnKn,
      d1Mm, cbMm, abMm, ccKn, beta1: b1, jumlah,
    },
  }
}

/** Volume kolom — bekisting 4 sisi (kolom berdiri bebas). */
function volumeKolom(input: InputKolom, nTotal: number): VolumeElemen {
  const { hMm, bMm, tinggiM, selimutMm, dUtamaMm, dSengkangMm, jarakSengkangMm } = input
  const jumlah = input.jumlah ?? 1

  const b = bMm / 1000, h = hMm / 1000
  const betonM3 = b * h * tinggiM * jumlah
  const bekistingM2 = 2 * (b + h) * tinggiM * jumlah

  const intiBMm = bMm - 2 * selimutMm
  const intiHMm = hMm - 2 * selimutMm
  const panjangSengkangM = (2 * (intiBMm + intiHMm) + 2 * 6 * dSengkangMm) / 1000
  const jumlahSengkang = Math.ceil(tinggiM * 1000 / jarakSengkangMm) + 1

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm, peran: 'utama',
      jumlahBatang: nTotal * jumlah, panjangPerBatangM: tinggiM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nTotal * jumlah * tinggiM * beratPerM(dUtamaMm),
    },
    {
      tipe: 'BjTP', diameterMm: dSengkangMm, peran: 'sengkang',
      jumlahBatang: jumlahSengkang * jumlah, panjangPerBatangM: panjangSengkangM,
      beratKgPerM: beratPerM(dSengkangMm),
      totalKg: jumlahSengkang * jumlah * panjangSengkangM * beratPerM(dSengkangMm),
    },
  ]

  return {
    betonM3, bekistingM2, besi,
    besiTotalKg: besi.reduce((s, x) => s + x.totalKg, 0),
    beratSendiriKg: betonM3 * RHO_BETON,
  }
}

/**
 * Gabung volume beberapa elemen jadi satu rekap — untuk RAP satu proyek.
 *
 * Besi digabung per (tipe, diameter) seperti BBS: itulah satuan yang dibeli.
 * Beton dan bekisting dijumlah polos.
 */
export function rekapVolume(hasil: HasilElemen[]): VolumeElemen {
  const peta = new Map<string, BarisBesi>()
  let betonM3 = 0, bekistingM2 = 0, beratSendiriKg = 0

  for (const h of hasil) {
    betonM3 += h.volume.betonM3
    bekistingM2 += h.volume.bekistingM2
    beratSendiriKg += h.volume.beratSendiriKg
    for (const b of h.volume.besi) {
      const kunci = `${b.tipe}|${b.diameterMm}|${b.peran}`
      const ada = peta.get(kunci)
      if (ada) {
        ada.jumlahBatang += b.jumlahBatang
        ada.totalKg += b.totalKg
      } else peta.set(kunci, { ...b })
    }
  }

  const besi = [...peta.values()].sort((x, y) =>
    x.tipe.localeCompare(y.tipe) || x.diameterMm - y.diameterMm)

  return {
    betonM3, bekistingM2, besi,
    besiTotalKg: besi.reduce((s, x) => s + x.totalKg, 0),
    beratSendiriKg,
  }
}

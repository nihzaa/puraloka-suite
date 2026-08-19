// Analisa struktur baja profil (SNI 1729:2020 / AISC 360) — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Diukur di basis ini: tabel `steel_profiles` sudah berisi 58 profil (23 WF,
// 9 H-beam, 26 siku) lengkap dengan dimensi dan berat per meter — dipasang
// migrasi 122. Yang TIDAK ada: apa pun yang menghitung apakah profil itu KUAT.
//
// Akibatnya estimator memilih profil dari daftar, mengalikan panjangnya dengan
// berat per meter, dan mendapat angka rupiah yang terlihat wajar — tanpa
// seorang pun pernah memeriksa apakah WF 200 itu memang sanggup memikul
// bebannya. Kesalahan pilih profil tak menimbulkan galat: ia menimbulkan
// bangunan yang melendut, bergetar saat dilewati, atau roboh.
//
// ── Kenapa BUKAN replikasi workbook
//
// Sembilan workbook "Auto Structure Pro" seluruhnya beton dan tanah — nol
// modul baja (diukur, bukan ditaksir). Jadi tak ada angka pembanding dari
// sana. Yang dipakai sebagai rujukan: SNI 1729:2020, yang mengadopsi AISC 360
// dan tersedia publik.
//
// Konsekuensinya untuk pengujian: golden test tak bisa mengadu ke workbook.
// Gantinya, tiap rumus diuji terhadap CONTOH TERHITUNG TANGAN yang ditulis
// lengkap di test — sumber independen yang sama fungsinya.
//
// ── Empat hal yang menentukan kekuatan balok baja, dan urutan pentingnya
//
//   1. Lentur      Mn = Zx · fy         (penampang kompak, bentang pendek)
//   2. Tekuk lateral  Mn turun bila sayap tekan tak dipegang cukup rapat
//   3. Geser       Vn = 0.6 · fy · Aw
//   4. LENDUTAN    δ ≤ L/240 atau L/360
//
// Nomor 4 sering yang MENENTUKAN pada baja, bukan kekuatannya — dan itu
// kebalikan dari beton. Baja jauh lebih kuat per satuan berat, sehingga
// profil yang kuat secara tegangan bisa melendut terasa saat dilewati orang.
// Balok yang "aman tapi bergoyang" adalah keluhan penghuni nomor satu pada
// struktur baja, dan ia tak pernah muncul di pemeriksaan tegangan.
//
// ⚠ BATAS TANGGUNG JAWAB. Membantu estimasi & pemeriksaan awal, BUKAN
// menggantikan perhitungan bertanda tangan insinyur. Sambungan dihitung di
// berkas TERPISAH (`struktur-baja-sambungan.ts`) karena masukannya sama sekali
// berbeda — dan pada struktur baja, sambungan justru titik gagal paling
// sering, jadi ia tak boleh terlewat hanya karena berada di berkas lain.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa, VolumeElemen, BarisBesi } from './struktur-beton'

/** Modulus elastisitas baja struktur, MPa. */
export const ES_BAJA_STRUKTUR = 200_000

/** Massa jenis baja, kg/m³ — untuk berat sendiri. */
export const RHO_BAJA = 7850

/**
 * Faktor reduksi kekuatan (SNI 1729:2020 §B3.1, DFBK/LRFD).
 *
 * Lentur & tarik lebih tinggi daripada tekan karena kegagalan tekan
 * (tekuk) jauh lebih sensitif terhadap ketidaksempurnaan awal batang —
 * kelengkungan sisa dari pabrik dan eksentrisitas pemasangan.
 */
export const PHI = { lentur: 0.90, geser: 0.90, tarik: 0.90, tekan: 0.85 } as const

/**
 * Dimensi profil, sesuai kolom tabel `steel_profiles`.
 *
 * `h` tinggi total · `b` lebar sayap · `t1` tebal badan · `t2` tebal sayap.
 * Penamaan itu mengikuti tabel yang SUDAH ADA di basis, bukan diperbaiki jadi
 * `tw`/`tf` — mengganti nama berarti dua penamaan hidup berdampingan, dan
 * yang membaca tak tahu mana yang berlaku.
 */
export interface ProfilBaja {
  /** Penamaan seperti di tabel: "200x100x5.5x8". */
  designation: string
  /** WF · H · L (siku). */
  profile_type: string
  hMm: number
  bMm: number
  /** Tebal badan (web), mm. */
  t1Mm: number
  /** Tebal sayap (flange), mm. */
  t2Mm: number
  /** Berat per meter, kg/m — dari tabel, bukan dihitung ulang. */
  beratKgPerM: number
  /** Panjang batang standar yang dijual, m. */
  panjangStandarM: number
}

/** Mutu baja. BJ 37 (fy 240) dan BJ 41 (fy 250) paling umum di Indonesia. */
export interface MutuBaja {
  /** Tegangan leleh, MPa. */
  fyMpa: number
  /** Tegangan putus, MPa. */
  fuMpa: number
}

export interface InputBalokBaja {
  profil: ProfilBaja
  mutu: MutuBaja
  /** Bentang balok, m. */
  bentangM: number
  /**
   * Jarak antar pengaku lateral sayap tekan, m.
   *
   * Inilah yang paling sering salah diisi: kalau balok dicor menyatu dengan
   * pelat beton, sayap atasnya terpegang PENUH dan nilainya nol. Kalau balok
   * telanjang (gudang, kanopi), nilainya jarak antar gording atau bracing.
   *
   * Mengisinya nol padahal baloknya telanjang membuat kapasitas terhitung
   * jauh lebih besar dari yang sebenarnya — dan itu kesalahan yang tak
   * meninggalkan gejala sampai baloknya berputar saat dibebani.
   */
  jarakPengakuM: number
  /** Momen terfaktor, kNm. */
  muKnm: number
  /** Geser terfaktor, kN. */
  vuKn: number
  /**
   * Beban merata layan (tanpa faktor) untuk hitung lendutan, kN/m.
   *
   * Beban LAYAN, bukan terfaktor: lendutan diperiksa terhadap beban yang
   * benar-benar bekerja sehari-hari, bukan terhadap beban ekstrem berfaktor.
   * Memakai beban terfaktor membuat lendutan terhitung ~40% lebih besar dan
   * profil jadi boros tanpa alasan.
   */
  bebanLayanKnPerM: number
  /** Batas lendutan: L/nilai. 240 untuk atap, 360 untuk lantai. */
  batasLendutan?: number
  /** Jumlah batang identik — volume dikalikan ini. */
  jumlah?: number
}

export interface HasilBalokBaja {
  periksa: Periksa[]
  aman: boolean
  volume: VolumeElemen
  antara: Record<string, number>
  catatan: string[]
}

/**
 * Jenis profil yang rumus penampangnya BERLAKU di berkas ini.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * KENAPA INI PENJAGA, BUKAN SEKADAR DAFTAR
 *
 * Seluruh rumus penampang di bawah (`inersiaX`, `modulusPlastis`,
 * `radiusGirasiY`) menurunkan bentuknya dari SATU asumsi: profil I simetris
 * ganda — dua sayap sama besar, badan di tengah, simetris terhadap kedua sumbu.
 *
 * WF dan H memenuhi itu. Yang TIDAK:
 *
 *   CNP (kanal C)  sayapnya hanya di SATU sisi badan. Tak simetris terhadap
 *                  sumbu Y, punya titik pusat geser di luar penampang, dan
 *                  cenderung MEMUNTIR saat dibebani — perilaku yang tak ada
 *                  sama sekali pada WF.
 *   INP            sayapnya MIRING 14%, jadi tebalnya berubah sepanjang lebar.
 *   L (siku)       sumbu utamanya MIRING, bukan tegak-datar.
 *
 * Dipakai apa adanya, rumus di bawah memberi angka yang TERLIHAT WAJAR untuk
 * ketiganya — dan itulah bahayanya. Tak ada galat, tak ada nilai negatif,
 * cuma kapasitas yang salah. Untuk CNP selisihnya bisa 20-40% ke arah yang
 * TIDAK aman karena puntirnya diabaikan.
 *
 * Karena itu jenis yang tak didukung DITOLAK, bukan dihitung dengan
 * peringatan: peringatan bisa dilewati, angka yang sudah tampil di layar
 * akan dipakai.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export const PROFIL_DIDUKUNG = ['WF', 'H'] as const

/** Alasan kenapa sebuah jenis profil belum bisa dihitung berkas ini. */
export const ALASAN_TAK_DIDUKUNG: Record<string, string> = {
  CNP: 'Kanal C bersayap satu sisi: tak simetris terhadap sumbu Y, titik pusat '
    + 'gesernya di luar penampang, dan ia MEMUNTIR saat dibebani. Rumus profil '
    + 'I memberi kapasitas 20-40% terlalu besar untuknya.',
  C: 'Kanal C bersayap satu sisi — lihat CNP.',
  INP: 'Sayap INP MIRING 14%, tebalnya berubah sepanjang lebar sayap. Rumus '
    + 'profil I bersayap seragam tak berlaku.',
  L: 'Siku punya sumbu utama yang MIRING, bukan tegak-datar. Lentur terhadap '
    + 'sumbu tegak menghasilkan lendutan menyamping sekaligus.',
}

/**
 * Pastikan profil boleh dihitung rumus di berkas ini.
 *
 * Dipanggil di awal tiap fungsi analisa. Melempar, bukan memulangkan
 * peringatan — lihat alasannya di `PROFIL_DIDUKUNG`.
 */
export function pastikanProfilDidukung(p: ProfilBaja): void {
  const jenis = (p.profile_type || '').toUpperCase()
  if ((PROFIL_DIDUKUNG as readonly string[]).includes(jenis)) return

  const alasan = ALASAN_TAK_DIDUKUNG[jenis]
    ?? 'Bentuk penampangnya tak dikenali rumus profil I di modul ini.'
  throw new Error(
    `Profil ${p.profile_type} ${p.designation} belum bisa dihitung modul ini. `
    + `${alasan} `
    + `Volume dan beratnya TETAP bisa dipakai untuk RAB (berat per meter dari `
    + `tabel), yang belum bisa hanya pemeriksaan kekuatannya.`,
  )
}

/** Luas penampang WF/H dari dimensinya, mm². */
export function luasPenampang(p: ProfilBaja): number {
  const { hMm: h, bMm: b, t1Mm: tw, t2Mm: tf } = p
  // Dua sayap + badan di antaranya. Fillet (lengkungan sudut) diabaikan —
  // ia menambah ~3-5% dan mengabaikannya konservatif.
  return 2 * b * tf + (h - 2 * tf) * tw
}

/**
 * Momen inersia terhadap sumbu kuat (Ix), mm⁴.
 *
 * Persegi panjang penuh b×h dikurangi dua persegi panjang kosong di sisi
 * badan — cara paling sedikit langkah dan paling mudah diperiksa ulang.
 */
export function inersiaX(p: ProfilBaja): number {
  const { hMm: h, bMm: b, t1Mm: tw, t2Mm: tf } = p
  const hDalam = h - 2 * tf
  const bKosong = (b - tw) / 2
  return (b * h ** 3) / 12 - (2 * bKosong * hDalam ** 3) / 12
}

/** Modulus penampang elastis Sx, mm³. */
export function modulusElastis(p: ProfilBaja): number {
  return inersiaX(p) / (p.hMm / 2)
}

/**
 * Modulus penampang PLASTIS Zx, mm³.
 *
 * Zx dipakai untuk kapasitas lentur penampang kompak (SNI 1729 §F2.1), bukan
 * Sx. Bedanya nyata: Zx/Sx untuk WF berkisar 1,10–1,18, jadi memakai Sx
 * membuang 10–18% kapasitas — dan pada baja yang dijual per kilogram, itu
 * langsung jadi rupiah.
 */
export function modulusPlastis(p: ProfilBaja): number {
  const { hMm: h, bMm: b, t1Mm: tw, t2Mm: tf } = p
  const hDalam = h - 2 * tf
  // Sayap: luas × jarak ke sumbu netral, dua sayap.
  const sayap = 2 * (b * tf) * ((h - tf) / 2)
  // Badan: penampang persegi, Z = t·d²/4.
  const badan = (tw * hDalam ** 2) / 4
  return sayap + badan
}

/** Radius girasi terhadap sumbu lemah (ry), mm — menentukan tekuk lateral. */
export function radiusGirasiY(p: ProfilBaja): number {
  const { hMm: h, bMm: b, t1Mm: tw, t2Mm: tf } = p
  const hDalam = h - 2 * tf
  const iy = (2 * tf * b ** 3) / 12 + (hDalam * tw ** 3) / 12
  return Math.sqrt(iy / luasPenampang(p))
}

/**
 * Klasifikasi penampang: kompak, tak-kompak, atau langsing.
 *
 * SNI 1729:2020 Tabel B4.1b. Penampang langsing tak bisa mencapai kekuatan
 * plastisnya — sayap atau badannya menekuk lokal lebih dulu, seperti kaleng
 * yang penyok. Seluruh profil WF pabrikan Indonesia biasanya kompak, tetapi
 * memeriksanya tetap perlu: profil impor dan profil bikinan (built-up) tidak
 * selalu.
 */
export function klasifikasiPenampang(
  p: ProfilBaja, fyMpa: number,
): { sayap: 'kompak' | 'tak-kompak' | 'langsing'; badan: 'kompak' | 'tak-kompak' | 'langsing' } {
  const akarEfy = Math.sqrt(ES_BAJA_STRUKTUR / fyMpa)

  // Sayap: setengah lebar terhadap tebalnya.
  const lambdaSayap = (p.bMm / 2) / p.t2Mm
  const lpSayap = 0.38 * akarEfy
  const lrSayap = 1.0 * akarEfy

  // Badan: tinggi bersih terhadap tebalnya.
  const lambdaBadan = (p.hMm - 2 * p.t2Mm) / p.t1Mm
  const lpBadan = 3.76 * akarEfy
  const lrBadan = 5.70 * akarEfy

  return {
    sayap: lambdaSayap <= lpSayap ? 'kompak' : lambdaSayap <= lrSayap ? 'tak-kompak' : 'langsing',
    badan: lambdaBadan <= lpBadan ? 'kompak' : lambdaBadan <= lrBadan ? 'tak-kompak' : 'langsing',
  }
}

/**
 * Kapasitas lentur nominal Mn, kNm — dengan pengaruh tekuk lateral.
 *
 * Tiga daerah (SNI 1729 §F2.2), dan yang membedakannya adalah jarak pengaku
 * lateral Lb:
 *
 *   Lb ≤ Lp        plastis penuh, Mn = Mp = Zx·fy
 *   Lp < Lb ≤ Lr   turun LINIER — daerah tekuk tak-elastis
 *   Lb > Lr        tekuk elastis, turun tajam mengikuti 1/Lb²
 *
 * Balok yang sayap atasnya terpegang pelat beton punya Lb = 0 dan selalu
 * berada di daerah pertama. Balok telanjang di gudang bisa punya Lb = 6 m dan
 * kehilangan separuh kapasitasnya — perbedaan yang tak terlihat dari
 * profilnya sendiri.
 */
export function kapasitasLentur(
  p: ProfilBaja, mutu: MutuBaja, jarakPengakuM: number,
): { mnKnm: number; daerah: 'plastis' | 'tak-elastis' | 'elastis'; lpM: number; lrM: number } {
  const zx = modulusPlastis(p)
  const sx = modulusElastis(p)
  const ry = radiusGirasiY(p)
  const fy = mutu.fyMpa

  const mpKnm = (zx * fy) / 1e6
  const lb = jarakPengakuM * 1000

  // Lp — batas bentang plastis (§F2-5).
  const lp = 1.76 * ry * Math.sqrt(ES_BAJA_STRUKTUR / fy)

  /*
    Lr — batas tekuk elastis.

    Rumus penuh §F2-6 memakai konstanta torsi J dan konstanta warping Cw, yang
    TIDAK ada di tabel `steel_profiles`. Dipakai pendekatan yang lazim untuk
    profil I simetris ganda: Lr ≈ π·ry·√(E/(0,7·fy)).

    Pendekatan ini KONSERVATIF (memberi Lr lebih kecil, sehingga penurunan
    kapasitas mulai lebih awal) dan selisihnya terhadap rumus penuh berkisar
    5–15% untuk WF pabrikan. Disebut di `catatan` keluaran — asumsi yang tak
    tertulis akan dipakai sebagai kepastian.
  */
  const lr = Math.PI * ry * Math.sqrt(ES_BAJA_STRUKTUR / (0.7 * fy))

  if (lb <= lp) {
    return { mnKnm: mpKnm, daerah: 'plastis', lpM: lp / 1000, lrM: lr / 1000 }
  }

  const mrKnm = (0.7 * fy * sx) / 1e6   // momen batas leleh sayap tekan

  if (lb <= lr) {
    // Interpolasi linier antara Mp (di Lp) dan Mr (di Lr) — §F2-2.
    const mn = mpKnm - (mpKnm - mrKnm) * ((lb - lp) / (lr - lp))
    return { mnKnm: Math.min(mn, mpKnm), daerah: 'tak-elastis', lpM: lp / 1000, lrM: lr / 1000 }
  }

  // Tekuk elastis — §F2-3 disederhanakan (tanpa J, Cw; sejalan dengan Lr di atas).
  const fcr = (Math.PI ** 2 * ES_BAJA_STRUKTUR) / (lb / ry) ** 2
  const mn = (fcr * sx) / 1e6
  return { mnKnm: Math.min(mn, mpKnm), daerah: 'elastis', lpM: lp / 1000, lrM: lr / 1000 }
}

/**
 * Kapasitas geser nominal Vn, kN (§G2.1).
 *
 * Hanya BADAN yang menahan geser — sayap hampir tak berperan. Aw = h × tw
 * memakai tinggi TOTAL, sesuai definisi SNI untuk profil gilas.
 */
export function kapasitasGeser(p: ProfilBaja, mutu: MutuBaja): number {
  const aw = p.hMm * p.t1Mm
  return (0.6 * mutu.fyMpa * aw) / 1000
}

/**
 * Lendutan maksimum balok sederhana berbeban merata, mm.
 *
 *     δ = 5·w·L⁴ / (384·E·I)
 *
 * Dipisah jadi fungsi sendiri karena inilah yang paling sering MENENTUKAN
 * pada baja — dan yang paling sering dilupakan karena tegangannya sudah aman.
 */
export function lendutanMerata(
  p: ProfilBaja, bentangM: number, bebanKnPerM: number,
): number {
  const w = bebanKnPerM            // kN/m
  const l = bentangM * 1000        // mm
  const ei = ES_BAJA_STRUKTUR * inersiaX(p)   // MPa·mm⁴ = N·mm²
  // w kN/m = w N/mm. Jadi tak perlu konversi panjang lagi.
  return (5 * w * l ** 4) / (384 * ei)
}

function bilanganPositif(nama: string, v: number): void {
  if (!(v > 0)) throw new Error(`${nama} harus > 0`)
}

const rasio = (tuntutan: number, kapasitas: number) =>
  kapasitas > 0 ? tuntutan / kapasitas : Number.POSITIVE_INFINITY

/**
 * Analisa balok baja: lentur, geser, lendutan, dan volume untuk RAP.
 *
 * Lendutan diperiksa SEJAJAR dengan kekuatan, bukan sebagai catatan tambahan.
 * Balok yang lulus tegangan tetapi gagal lendutan tetap `aman: false` — karena
 * lantai yang terasa mengayun saat dilewati adalah kegagalan bagi penghuninya,
 * betapa pun amannya secara tegangan.
 */
export function analisaBalokBaja(input: InputBalokBaja): HasilBalokBaja {
  const { profil, mutu, bentangM, jarakPengakuM, muKnm, vuKn, bebanLayanKnPerM } = input
  bilanganPositif('Bentang', bentangM)
  bilanganPositif('Tinggi profil', profil.hMm)
  bilanganPositif('fy', mutu.fyMpa)
  if (jarakPengakuM < 0) throw new Error('Jarak pengaku lateral tak boleh negatif')

  const jumlah = input.jumlah ?? 1
  const batas = input.batasLendutan ?? 360
  const catatan: string[] = []

  const kelas = klasifikasiPenampang(profil, mutu.fyMpa)
  const lentur = kapasitasLentur(profil, mutu, jarakPengakuM)
  const phiMnKnm = PHI.lentur * lentur.mnKnm
  const phiVnKn = PHI.geser * kapasitasGeser(profil, mutu)

  const lendutanMm = lendutanMerata(profil, bentangM, bebanLayanKnPerM)
  const lendutanIjinMm = (bentangM * 1000) / batas

  const periksa: Periksa[] = [
    {
      nama: 'Lentur baja', nilai: phiMnKnm, syarat: muKnm, satuan: 'kNm',
      aman: phiMnKnm >= muKnm, rasio: rasio(muKnm, phiMnKnm),
      rumus: 'φMn = 0.90 · Mn  (Mn dari SNI 1729 §F2, memperhitungkan tekuk lateral)',
    },
    {
      nama: 'Geser baja', nilai: phiVnKn, syarat: vuKn, satuan: 'kN',
      aman: phiVnKn >= vuKn, rasio: rasio(vuKn, phiVnKn),
      rumus: 'φVn = 0.90 · 0.6 · fy · Aw   (hanya BADAN yang menahan geser)',
    },
    {
      /*
        LENDUTAN — sering yang menentukan pada baja, dan itu kebalikan beton.

        Baja jauh lebih kuat per satuan berat, sehingga profil yang aman secara
        tegangan bisa melendut terasa saat dilewati. "Aman tapi bergoyang"
        adalah keluhan penghuni nomor satu pada struktur baja, dan ia tak
        pernah muncul di pemeriksaan tegangan.
      */
      nama: 'Lendutan', nilai: lendutanIjinMm, syarat: lendutanMm, satuan: 'mm',
      aman: lendutanMm <= lendutanIjinMm, rasio: rasio(lendutanMm, lendutanIjinMm),
      rumus: `δ = 5wL⁴/(384EI) ≤ L/${batas}  (beban LAYAN, bukan terfaktor)`,
    },
  ]

  if (kelas.sayap !== 'kompak' || kelas.badan !== 'kompak') {
    /*
      Penampang tak-kompak/langsing DILAPORKAN, dan kapasitasnya TIDAK
      dikoreksi di sini.

      Koreksi tekuk lokal (§F3, §F5) butuh rumus terpisah per kelas, dan
      menerapkannya setengah-setengah menghasilkan angka yang terlihat
      lengkap sambil salah. Yang jujur: nyatakan bahwa hasilnya berlaku untuk
      penampang kompak, dan profil ini bukan.
    */
    catatan.push(
      `Penampang TIDAK kompak (sayap: ${kelas.sayap}, badan: ${kelas.badan}). `
      + 'Kapasitas lentur di atas dihitung dengan asumsi penampang kompak, '
      + 'sehingga NILAINYA TERLALU BESAR untuk profil ini — tekuk lokal '
      + 'sayap/badan belum diperhitungkan. Perlu perhitungan §F3/§F5 terpisah.',
    )
  }

  if (jarakPengakuM === 0) {
    catatan.push(
      'Sayap tekan dianggap TERPEGANG PENUH (jarak pengaku 0) — benar bila '
      + 'balok menyatu dengan pelat beton di atasnya. Untuk balok telanjang '
      + '(gudang, kanopi, rangka atap), isi jarak antar gording atau bracing: '
      + 'kapasitasnya bisa turun sampai separuh.',
    )
  }

  catatan.push(
    'Lr dihitung dengan pendekatan π·ry·√(E/0,7fy) karena konstanta torsi J '
    + 'dan warping Cw tidak tersedia di tabel profil. Pendekatan ini '
    + 'KONSERVATIF (5–15% lebih kecil dari rumus penuh SNI 1729 §F2-6).',
  )

  /*
    Catatan ini sempat berbunyi "sambungan TIDAK dihitung" — dan itu benar
    sampai `struktur-baja-sambungan.ts` ada. Membiarkannya berarti menyuruh
    orang menghitung sendiri sesuatu yang sudah tersedia, dan itu kelas cacat
    yang sama dengan catatan basi mana pun: ia terbaca sebagai kepastian.
  */
  catatan.push(
    'SAMBUNGAN belum diperiksa oleh perhitungan batang ini — pada struktur '
    + 'baja, sambungan justru titik gagal paling sering. Hitung terpisah '
    + 'lewat analisa sambungan baut/las dengan gaya dari elemen ini.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeBalokBaja(input, jumlah),
    antara: {
      luasMm2: luasPenampang(profil),
      ixMm4: inersiaX(profil),
      sxMm3: modulusElastis(profil),
      zxMm3: modulusPlastis(profil),
      ryMm: radiusGirasiY(profil),
      mnKnm: lentur.mnKnm, phiMnKnm, phiVnKn,
      lpM: lentur.lpM, lrM: lentur.lrM,
      lendutanMm, lendutanIjinMm, jumlah,
    },
    catatan,
  }
}

/**
 * Volume & berat untuk RAP.
 *
 * Baja dibeli per KILOGRAM, bukan per meter kubik — jadi yang menentukan
 * adalah beratnya. `betonM3` tetap diisi nol supaya bentuknya sama dengan
 * elemen beton dan `rekapVolume` bisa menjumlahkannya bersama-sama.
 */
function volumeBalokBaja(input: InputBalokBaja, jumlah: number): VolumeElemen {
  const { profil, bentangM } = input
  const beratKg = profil.beratKgPerM * bentangM * jumlah

  /*
    PEMBELIAN DIHITUNG PER BATANG STANDAR, bukan per meter terpasang.

    Baja dijual per batang 12 m (atau 6 m). Balok 5 m berarti satu batang 12 m
    dipotong, dan sisa 7 m-nya belum tentu terpakai. Melaporkan 5 m sebagai
    kebutuhan membuat RAP kekurangan — persis kelas cacat yang sama dengan
    lonjor besi beton di `struktur-bbs.ts`.

    Yang dilaporkan KEDUANYA: terpasang (untuk berat struktur) dan dibeli
    (untuk rupiah), supaya selisihnya terlihat alih-alih tersembunyi.
  */
  const panjangStandar = profil.panjangStandarM > 0 ? profil.panjangStandarM : 12
  const batangPerElemen = Math.ceil(bentangM / panjangStandar)
  const batangTotal = batangPerElemen * jumlah
  const beratDibeliKg = batangTotal * panjangStandar * profil.beratKgPerM

  const besi: BarisBesi[] = [
    {
      // Baja profil dicatat sebagai BjTS supaya masuk rekap besi yang sama;
      // `peran` yang membedakannya dari tulangan beton.
      tipe: 'BjTS',
      diameterMm: profil.hMm,      // tinggi profil sebagai penanda ukuran
      peran: `profil ${profil.profile_type} ${profil.designation}`,
      jumlahBatang: batangTotal,
      panjangPerBatangM: panjangStandar,
      beratKgPerM: profil.beratKgPerM,
      totalKg: beratDibeliKg,
    },
  ]

  return {
    // Baja tak punya volume beton maupun bekisting — nol, dan itu jawaban
    // yang benar, bukan data yang hilang.
    betonM3: 0,
    bekistingM2: 0,
    besi,
    besiTotalKg: beratDibeliKg,
    beratSendiriKg: beratKg,
  }
}

// ── KOLOM BAJA: tekan + tekuk ────────────────────────────────────────────────

export interface InputKolomBaja {
  profil: ProfilBaja
  mutu: MutuBaja
  /** Tinggi kolom, m. */
  tinggiM: number
  /**
   * Faktor panjang efektif K (SNI 1729 Tabel C-A-7.1).
   *
   *   0,65  jepit–jepit
   *   0,80  jepit–sendi
   *   1,00  sendi–sendi  ← paling umum & paling aman untuk rangka bergoyang
   *   2,00  jepit–bebas (kantilever, mis. tiang lampu)
   *
   * Nilai bawaan 1,0 dipilih bukan karena paling sering benar, melainkan
   * karena paling AMAN saat orang tak mengisinya: K yang ditaksir terlalu
   * kecil membuat kapasitas terhitung jauh lebih besar dari kenyataan, dan
   * kesalahan itu tak meninggalkan gejala sampai kolomnya menekuk.
   */
  faktorK?: number
  /** Beban aksial tekan terfaktor, kN. */
  puKn: number
  jumlah?: number
}

export interface HasilKolomBaja {
  periksa: Periksa[]
  aman: boolean
  volume: VolumeElemen
  antara: Record<string, number>
  catatan: string[]
}

/**
 * Kapasitas tekan nominal Pn, kN (SNI 1729 §E3).
 *
 * ── Kenapa sumbu LEMAH yang dipakai
 *
 * Kolom menekuk ke arah yang paling mudah — dan untuk profil I, itu selalu
 * sumbu lemah (ry), bukan sumbu kuat. Memakai rx menghasilkan kapasitas
 * 3–4 kali lipat lebih besar dari kenyataan.
 *
 * Kalau kolom dipegang ke arah lemahnya (mis. oleh dinding pengisi atau
 * bracing), itu keadaan khusus yang harus dinyatakan pemakainya lewat panjang
 * efektif yang berbeda per sumbu — dan modul ini SENGAJA tidak menerimanya,
 * karena membiarkan dua nilai K membuat orang mengisi yang menguntungkan.
 *
 * ── Dua daerah tekuk
 *
 *   λc ≤ 4,71·√(E/fy)   tekuk TAK-ELASTIS — bahan sempat meleleh sebagian
 *   λc >  4,71·√(E/fy)  tekuk ELASTIS — batangnya melengkung sebelum meleleh
 *
 * Kolom pendek gagal karena bahannya menyerah; kolom langsing gagal karena
 * bentuknya. Keduanya butuh rumus berbeda, dan menyamakannya membuat kolom
 * langsing terhitung jauh lebih kuat dari kenyataan.
 */
export function kapasitasTekan(
  p: ProfilBaja, mutu: MutuBaja, tinggiM: number, faktorK = 1.0,
): { pnKn: number; daerah: 'tak-elastis' | 'elastis'; kelangsingan: number } {
  const ag = luasPenampang(p)
  const ry = radiusGirasiY(p)
  const fy = mutu.fyMpa

  // Kelangsingan efektif — pakai ry (sumbu LEMAH), lihat alasan di atas.
  const lambda = (faktorK * tinggiM * 1000) / ry

  // Tegangan tekuk Euler.
  const fe = (Math.PI ** 2 * ES_BAJA_STRUKTUR) / lambda ** 2

  const batas = 4.71 * Math.sqrt(ES_BAJA_STRUKTUR / fy)

  let fcr: number
  let daerah: 'tak-elastis' | 'elastis'
  if (lambda <= batas) {
    // §E3-2: sebagian penampang sempat meleleh sebelum menekuk.
    fcr = Math.pow(0.658, fy / fe) * fy
    daerah = 'tak-elastis'
  } else {
    // §E3-3: menekuk sepenuhnya elastis, jauh sebelum leleh.
    fcr = 0.877 * fe
    daerah = 'elastis'
  }

  return { pnKn: (fcr * ag) / 1000, daerah, kelangsingan: lambda }
}

/**
 * Analisa kolom baja.
 *
 * Kelangsingan DIPERIKSA TERPISAH dari kapasitas, meski keduanya turunan dari
 * angka yang sama. Alasannya: kolom dengan KL/r di atas 200 secara teknis
 * masih punya kapasitas terhitung, tetapi ia sudah tak bisa dipasang dengan
 * lurus — kelengkungan dari pengangkutan dan pemasangan saja sudah cukup
 * membuatnya jauh lebih lemah dari hitungan. SNI membatasinya 200 untuk batang
 * tekan, dan batas itu tentang KEBISAAN DIBANGUN, bukan tentang rumus.
 */
export function analisaKolomBaja(input: InputKolomBaja): HasilKolomBaja {
  const { profil, mutu, tinggiM, puKn } = input
  bilanganPositif('Tinggi kolom', tinggiM)
  bilanganPositif('fy', mutu.fyMpa)

  const jumlah = input.jumlah ?? 1
  const k = input.faktorK ?? 1.0
  const catatan: string[] = []

  const kelas = klasifikasiPenampang(profil, mutu.fyMpa)
  const tekan = kapasitasTekan(profil, mutu, tinggiM, k)
  const phiPnKn = PHI.tekan * tekan.pnKn

  const BATAS_KELANGSINGAN = 200

  const periksa: Periksa[] = [
    {
      nama: 'Tekan kolom baja', nilai: phiPnKn, syarat: puKn,
      satuan: 'kN', aman: phiPnKn >= puKn, rasio: rasio(puKn, phiPnKn),
      rumus: 'φPn = 0.85 · Fcr · Ag   (Fcr dari SNI 1729 §E3, sumbu LEMAH)',
    },
    {
      nama: 'Kelangsingan kolom', nilai: BATAS_KELANGSINGAN, syarat: tekan.kelangsingan,
      satuan: '—', aman: tekan.kelangsingan <= BATAS_KELANGSINGAN,
      rasio: tekan.kelangsingan / BATAS_KELANGSINGAN,
      rumus: 'KL/r ≤ 200 — batas tentang KEBISAAN DIBANGUN, bukan tentang rumus',
    },
  ]

  if (kelas.sayap !== 'kompak' || kelas.badan !== 'kompak') {
    catatan.push(
      `Penampang TIDAK kompak (sayap: ${kelas.sayap}, badan: ${kelas.badan}). `
      + 'Kapasitas tekan di atas belum memperhitungkan tekuk lokal — nilainya '
      + 'TERLALU BESAR untuk profil ini. Perlu perhitungan §E7 terpisah.',
    )
  }

  if (input.faktorK === undefined) {
    catatan.push(
      'Faktor panjang efektif K dianggap 1,0 (sendi–sendi). Isi sesuai kondisi '
      + 'nyata: 0,65 jepit–jepit · 0,80 jepit–sendi · 2,0 kantilever. K yang '
      + 'ditaksir terlalu kecil membuat kapasitas terhitung jauh lebih besar '
      + 'dari kenyataan, tanpa gejala sampai kolomnya menekuk.',
    )
  }

  catatan.push(
    'Kapasitas dihitung terhadap sumbu LEMAH — kolom menekuk ke arah yang '
    + 'paling mudah. Bila kolom dipegang ke arah lemahnya (dinding pengisi, '
    + 'bracing), kapasitas nyatanya lebih besar; itu perlu perhitungan '
    + 'terpisah per sumbu.',
  )

  catatan.push(
    'Kolom ini dianggap menerima tekan MURNI. Bila ada momen (kolom tepi, '
    + 'rangka bergoyang, beban angin), perlu pemeriksaan interaksi §H1 yang '
    + 'BELUM dihitung di sini.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeBatangBaja(profil, tinggiM, jumlah),
    antara: {
      luasMm2: luasPenampang(profil),
      ryMm: radiusGirasiY(profil),
      kelangsingan: tekan.kelangsingan,
      pnKn: tekan.pnKn, phiPnKn, faktorK: k, jumlah,
    },
    catatan,
  }
}

/**
 * Volume satu batang baja — dipakai balok maupun kolom.
 *
 * Dipisah dari `volumeBalokBaja` karena keduanya identik, dan dua salinan
 * berarti dua tempat yang bisa menyimpang saat aturan pembelian berubah.
 */
function volumeBatangBaja(
  profil: ProfilBaja, panjangM: number, jumlah: number,
): VolumeElemen {
  const beratKg = profil.beratKgPerM * panjangM * jumlah
  const panjangStandar = profil.panjangStandarM > 0 ? profil.panjangStandarM : 12
  const batangTotal = Math.ceil(panjangM / panjangStandar) * jumlah
  const beratDibeliKg = batangTotal * panjangStandar * profil.beratKgPerM

  return {
    betonM3: 0,
    bekistingM2: 0,
    besi: [{
      tipe: 'BjTS',
      diameterMm: profil.hMm,
      peran: `profil ${profil.profile_type} ${profil.designation}`,
      jumlahBatang: batangTotal,
      panjangPerBatangM: panjangStandar,
      beratKgPerM: profil.beratKgPerM,
      totalKg: beratDibeliKg,
    }],
    besiTotalKg: beratDibeliKg,
    beratSendiriKg: beratKg,
  }
}

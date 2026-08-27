// SAMBUNGAN KAYU & SEKRUP BAJA RINGAN — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// TITIK GAGAL SESUNGGUHNYA PADA RANGKA ATAP
// ══════════════════════════════════════════════════════════════════════════════
//
// Empat modul di aplikasi ini menyebutkan hal yang sama sebagai batasnya:
//
//   struktur-atap-ringan  "pada kuda-kuda kayu, sambungan hampir selalu lebih
//                          lemah daripada batangnya — batang yang cukup tak
//                          menjamin kuda-kudanya cukup"
//   struktur-atap-ringan  "sambungan sekrup … hampir selalu lebih lemah
//                          daripada batangnya"
//   struktur-baja-rangka  "SAMBUNGAN belum diperiksa oleh perhitungan batang
//                          ini — pada struktur baja, sambungan justru titik
//                          gagal paling sering"
//
// Ketiganya benar, dan sampai berkas ini ada, aplikasi menghitung batang
// dengan teliti lalu menyerahkan titik gagal sesungguhnya ke perkiraan.
//
// ── Kenapa sambungan kayu berbeda dari sambungan baja
//
// Baja gagal karena bahannya kalah: baut putus, las retak, pelat sobek. Kayu
// gagal karena BENTUKNYA berubah — alat sambung menekan serat sampai lubangnya
// melonjong, dan sambungan jadi longgar jauh sebelum ada yang patah.
//
// Karena itu yang menentukan bukan kuat tarik pakunya melainkan:
//
//   TUMPU KAYU     tekanan alat sambung pada dinding lubang
//   JARAK KE TEPI  terlalu dekat → kayu pecah membelah serat, dan itu
//                  kegagalan getas tanpa peringatan
//   TEBAL KAYU     paku yang menembus terlalu pendek tercabut
//
// ── Sekrup baja ringan: yang menahan bukan sekrupnya
//
// Sekrup self-drilling pada baja 0,75 mm bisa gagal empat cara, dan yang
// paling sering BUKAN sekrupnya yang putus melainkan:
//
//   TILTING        sekrup miring karena pelatnya terlalu tipis menahannya
//   BEARING        lubang melonjong, pelat sobek di sekeliling sekrup
//   PULL-OUT       sekrup tercabut dari pelat yang lebih tebal
//   PULL-OVER      kepala sekrup menembus pelat tipis
//
// Menghitung sambungan baja ringan dengan rumus baut biasa melewatkan
// keempatnya — dan pada baja setipis itu, keempatnya mengendalikan.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa } from './struktur-beton.js'
import { KELAS_KAYU, FAKTOR_DURASI, FAKTOR_KADAR_AIR } from './struktur-atap-ringan.js'
import type { KelasKayu, DurasiBeban, KadarAir } from './struktur-atap-ringan.js'

/** Alat sambung kayu yang lazim di Indonesia. */
export type AlatSambungKayu = 'paku' | 'baut' | 'pelat_gigi'

/**
 * Jarak minimum alat sambung, sebagai kelipatan diameternya — SNI 7973 §12.
 *
 * `tepiSejajar`  = jarak ke ujung kayu SEARAH gaya
 * `tepiTegak`    = jarak ke sisi kayu tegak lurus gaya
 * `antarAlat`    = jarak antar alat sambung searah gaya
 *
 * Yang paling sering dilanggar `tepiSejajar` — tukang memasang paku terlalu
 * dekat ujung supaya "kelihatan rapi", dan kayunya membelah mengikuti serat.
 * Belah itu kegagalan GETAS: tak ada lendutan yang memberi peringatan.
 */
export const JARAK_MIN = {
  paku: { tepiSejajar: 15, tepiTegak: 5, antarAlat: 15 },
  baut: { tepiSejajar: 7, tepiTegak: 4, antarAlat: 4 },
  pelat_gigi: { tepiSejajar: 8, tepiTegak: 5, antarAlat: 8 },
} as const

/**
 * Kedalaman penetrasi minimum paku, kelipatan diameter — SNI 7973 §12.3.
 *
 * Paku yang menembus terlalu pendek tercabut; kapasitasnya berkurang
 * sebanding kedalamannya, dan di bawah 6d ia praktis tak menahan apa pun.
 */
export const PENETRASI_MIN_D = 6
export const PENETRASI_PENUH_D = 12

export interface InputSambunganKayu {
  alat: AlatSambungKayu
  /** Diameter alat sambung, mm. */
  diameterMm: number
  /** Jumlah alat sambung. */
  jumlahAlat: number
  /** Tebal kayu utama (yang ditembus), mm. */
  tebalUtamaMm: number
  /** Tebal kayu sisi (pelat penyambung), mm. */
  tebalSisiMm: number
  /** Kedalaman penetrasi ke kayu utama, mm. Untuk paku. */
  penetrasiMm: number
  kelas: KelasKayu
  durasi: DurasiBeban
  kadarAir: KadarAir
  /**
   * Sudut gaya terhadap arah serat kayu, derajat (0..90).
   *
   * 0 = sejajar serat (arah batang), 90 = tegak lurus. Pada kuda-kuda hampir
   * SELALU menyudut: batang diagonal bertemu batang horizontal di titik
   * buhul, dan sudut itu yang menentukan.
   *
   * Bawaan 0 — dan itu arah yang PALING KUAT, jadi mengosongkannya memberi
   * hasil yang optimistis. Catatan hasil menyatakan hal itu.
   *
   * Hanya berpengaruh pada BAUT. Paku berdiameter kecil menekan serat yang
   * sangat sedikit; SNI 7973 §12.3 memakai satu nilai tanpa memandang arah.
   */
  sudutTerhadapSeratDerajat?: number
  /** Gaya yang disalurkan sambungan, kN. */
  gayaKn: number
  /** Jarak alat sambung terdekat ke ujung kayu searah gaya, mm. */
  jarakTepiSejajarMm: number
  /** Jarak ke sisi kayu tegak lurus gaya, mm. */
  jarakTepiTegakMm: number
  /** Jarak antar alat sambung searah gaya, mm. Nol bila hanya satu. */
  jarakAntarAlatMm: number
}

export interface HasilSambunganKayu {
  periksa: Periksa[]
  aman: boolean
  kapasitas: {
    /** Kapasitas satu alat sambung, kN. */
    perAlatKn: number
    /** Kapasitas total sambungan, kN. */
    totalKn: number
    /** Faktor penetrasi 0–1 (paku yang kurang dalam berkurang kapasitasnya). */
    faktorPenetrasi: number
    /** Kuat tumpu kayu terkoreksi, MPa. */
    tumpuMpa: number
  }
  catatan: string[]
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Sambungan kayu — paku, baut, atau pelat gigi.
 *
 * Yang menentukan kapasitasnya TUMPU KAYU, bukan kuat alat sambungnya. Kayu
 * gagal karena lubangnya melonjong, bukan karena pakunya putus.
 */
export function analisaSambunganKayu(input: InputSambunganKayu): HasilSambunganKayu {
  const {
    alat, diameterMm, jumlahAlat, tebalUtamaMm, tebalSisiMm, penetrasiMm,
    kelas, durasi, kadarAir, gayaKn,
    jarakTepiSejajarMm, jarakTepiTegakMm, jarakAntarAlatMm,
  } = input

  positif('diameter alat sambung', diameterMm)
  positif('jumlah alat sambung', jumlahAlat)
  positif('tebal kayu utama', tebalUtamaMm)
  positif('tebal kayu sisi', tebalSisiMm)
  positif('gaya', gayaKn)

  const k = KELAS_KAYU[kelas]
  if (!k) throw new Error(`kelas kayu tak dikenal: ${kelas}`)
  const cd = FAKTOR_DURASI[durasi]
  if (!cd) throw new Error(`durasi beban tak dikenal: ${durasi}`)
  const cm = FAKTOR_KADAR_AIR[kadarAir]
  if (!cm) throw new Error(`kadar air tak dikenal: ${kadarAir}`)
  const jm = JARAK_MIN[alat]
  if (!jm) throw new Error(`alat sambung tak dikenal: ${alat}`)

  const catatan: string[] = []
  const periksa: Periksa[] = []

  /*
    Kuat tumpu kayu (dowel bearing) diperkirakan dari kelas kuatnya. SNI 7973
    memberi Fe = 77·G untuk paku dan Fe∥ = 77·G^1,84 untuk baut; di sini
    diturunkan dari kuat tekan sejajar yang sudah tercatat per kelas —
    pendekatan yang cukup untuk perencanaan awal, dan disebutkan sebagai
    pendekatan di catatan.
  */
  const tumpuSejajarMpa = k.fc * cm * (alat === 'baut' ? 1.0 : 1.3)

  /*
    ══════════════════════════════════════════════════════════════════════════
    HANKINSON — kayu jauh lebih lemah saat ditekan MELINTANG serat

    Kuat tumpu di atas berlaku untuk gaya SEJAJAR serat. Kalau gayanya
    menyudut — dan pada kuda-kuda hampir SELALU menyudut, karena batang
    diagonal bertemu batang horizontal di titik buhul — kuat tumpunya turun
    mengikuti rumus Hankinson:

                    Fe∥ · Fe⊥
        Feθ = ─────────────────────────
              Fe∥·sin²θ + Fe⊥·cos²θ

    Selisihnya besar. Melintang serat, kayu hanya sekitar SEPEREMPAT kuat
    sejajarnya (SNI 7973: Fe⊥ ≈ Fe∥/4 untuk baut berdiameter lazim). Pada
    45° kapasitasnya sudah turun sekitar 40%.

    ── Kenapa PAKU tak terpengaruh, dan itu bukan kelalaian

    Paku berdiameter kecil menekan serat yang sangat sedikit, dan seratnya
    menutup kembali di belakang paku. SNI 7973 §12.3 karena itu memakai satu
    nilai Fe untuk paku tanpa memandang arah gaya. Baut berdiameter besar
    lain: ia benar-benar memampatkan serat, dan arahnya menentukan.

    Menerapkan Hankinson ke paku akan MENGECILKAN kapasitasnya tanpa dasar,
    dan sambungan paku yang terlalu konservatif berarti tukang memasang
    dua kali lebih banyak paku — yang justru membelah kayunya.
    ══════════════════════════════════════════════════════════════════════════
  */
  const sudut = input.sudutTerhadapSeratDerajat ?? 0
  if (!Number.isFinite(sudut) || sudut < 0 || sudut > 90) {
    throw new Error(
      `Sudut terhadap serat harus 0..90 derajat (diterima: ${sudut}). `
      + '0 = gaya sejajar serat (arah batang), 90 = tegak lurus serat.',
    )
  }

  const RASIO_MELINTANG = 0.25
  const rad = (sudut * Math.PI) / 180
  const feSejajar = tumpuSejajarMpa
  const feMelintang = tumpuSejajarMpa * RASIO_MELINTANG

  /* Paku: satu nilai, tanpa memandang arah (SNI 7973 §12.3). */
  const tumpuMpa = alat === 'baut'
    ? (feSejajar * feMelintang)
      / (feSejajar * Math.sin(rad) ** 2 + feMelintang * Math.cos(rad) ** 2)
    : tumpuSejajarMpa

  // ── Faktor penetrasi (paku) ──────────────────────────────────────────────
  /*
    Paku yang menembus terlalu pendek tercabut. Di bawah 6d ia praktis tak
    menahan apa pun; penuh pada 12d. Antara keduanya kapasitasnya sebanding.
  */
  let faktorPenetrasi = 1
  if (alat === 'paku') {
    positif('penetrasi', penetrasiMm)
    const rasioP = penetrasiMm / diameterMm
    faktorPenetrasi = rasioP >= PENETRASI_PENUH_D
      ? 1
      : Math.max(0, (rasioP - PENETRASI_MIN_D) / (PENETRASI_PENUH_D - PENETRASI_MIN_D))

    periksa.push({
      nama: 'Kedalaman paku',
      nilai: Math.round(rasioP * 100) / 100,
      syarat: PENETRASI_MIN_D,
      satuan: '× diameter',
      aman: rasioP >= PENETRASI_MIN_D,
      rasio: Math.round((PENETRASI_MIN_D / rasioP) * 1e4) / 1e4,
      rumus: `penetrasi ≥ ${PENETRASI_MIN_D}d; penuh pada ${PENETRASI_PENUH_D}d`,
    })

    if (rasioP < PENETRASI_PENUH_D && rasioP >= PENETRASI_MIN_D) {
      catatan.push(
        `Paku menembus ${rasioP.toFixed(1)}× diameternya — di bawah ${PENETRASI_PENUH_D}d, `
        + `jadi kapasitasnya tinggal ${(faktorPenetrasi * 100).toFixed(0)}%. `
        + 'Pakai paku lebih panjang, atau tambah jumlahnya.',
      )
    }
  }

  // ── Kapasitas per alat: MODA LELEH, bukan tumpu penuh ────────────────────
  /*
    ⚠ Versi pertama memakai `Fe · d · t` dan memberi 8,29 kN untuk paku 5 mm
    pada kayu kelas II. Acuan lapangan: 0,8–1,2 kN. Salah TUJUH KALI, dan ke
    arah yang berbahaya — sambungan yang sebenarnya kurang akan lolos.

    Sebabnya: `Fe · d · t` adalah kapasitas TUMPU PENUH pelat, dan itu hanya
    tercapai kalau alat sambungnya KAKU SEMPURNA. Paku tidak kaku — ia ikut
    MELENTUR, dan sambungan leleh jauh sebelum kayunya tertumpu penuh.

    SNI 7973 §12.3 memberi enam moda leleh (Im, Is, II, IIIm, IIIs, IV); yang
    menentukan pada paku hampir selalu MODA IV — paku melentur di kedua sisi
    bidang geser:

        Z_IV = (d² / Rd) · √( 2·Fe·Fyb / (3·(1 + Re)) )

    Ketahuan bukan dari test melainkan dari MEMBANDINGKAN keluarannya dengan
    angka yang dikenal tukang. 7,46 kN per paku "terlihat wajar" bagi yang tak
    pernah memasang paku.
  */
  const tebalMenentukanMm = Math.min(tebalSisiMm, alat === 'paku' ? penetrasiMm : tebalUtamaMm)

  let perAlatN: number
  if (alat === 'baut') {
    /*
      Baut jauh lebih kaku daripada paku, tetapi TETAP melentur pada baut
      kecil. Moda IIIs (baut melentur di satu sisi) yang biasanya menentukan
      pada sambungan kayu-ke-kayu dua irisan.
    */
    const fybBaut = 400
    const modaIIIs = (2.2 * diameterMm * tebalMenentukanMm * tumpuMpa)
      / (1 + 2 * (tumpuMpa / fybBaut))
    const tumpuPenuh = tumpuMpa * diameterMm * tebalMenentukanMm
    perAlatN = Math.min(modaIIIs, tumpuPenuh)
  } else if (alat === 'paku') {
    /*
      Moda IV. Fyb 600 MPa untuk paku baja lunak; Rd 2,2 adalah faktor
      reduksi SNI 7973 Tabel 12.3.1B untuk alat sambung berdiameter kecil.
    */
    const FYB_PAKU = 600
    const RD_PAKU = 2.2
    const modaIV = (diameterMm ** 2 / RD_PAKU)
      * Math.sqrt((2 * tumpuMpa * FYB_PAKU) / (3 * 2))
    /* Tumpu penuh tetap jadi batas atas — moda IV tak boleh melebihinya. */
    const tumpuPenuh = tumpuMpa * diameterMm * tebalMenentukanMm
    perAlatN = Math.min(modaIV, tumpuPenuh)
  } else {
    /*
      Pelat gigi berpaku: kapasitasnya ditentukan PABRIK dan tak bisa dihitung
      dari sifat kayunya. Yang dipakai di sini pendekatan konservatif dari
      luas gigi; angka sesungguhnya harus diambil dari sertifikat produknya.
    */
    perAlatN = 0.6 * tumpuMpa * diameterMm * tebalMenentukanMm
  }

  perAlatN *= faktorPenetrasi * cd
  const perAlatKn = perAlatN / 1000

  /*
    Alat sambung BANYAK tidak menghasilkan kapasitas sebanding jumlahnya:
    yang di ujung menerima lebih besar daripada yang di tengah. Faktor grup
    0,9 untuk lebih dari 4 alat sambung — pendekatan konservatif.
  */
  const faktorGrup = jumlahAlat > 4 ? 0.9 : 1
  const totalKn = perAlatKn * jumlahAlat * faktorGrup

  periksa.push({
    nama: 'Kapasitas sambungan',
    nilai: Math.round(totalKn * 100) / 100,
    syarat: Math.round(gayaKn * 100) / 100,
    satuan: 'kN',
    aman: totalKn >= gayaKn,
    rasio: totalKn > 0 ? Math.round((gayaKn / totalKn) * 1e4) / 1e4 : Infinity,
    rumus: 'Z (moda leleh SNI 7973 §12.3) · Cd · Cg ≥ gaya — alat sambungnya '
      + 'ikut MELENTUR, jadi bukan tumpu penuh',
  })

  // ── Jarak — kegagalan GETAS bila dilanggar ───────────────────────────────
  const minSejajarMm = jm.tepiSejajar * diameterMm
  periksa.push({
    nama: 'Jarak ke ujung kayu',
    nilai: jarakTepiSejajarMm,
    syarat: Math.round(minSejajarMm),
    satuan: 'mm',
    aman: jarakTepiSejajarMm >= minSejajarMm,
    rasio: jarakTepiSejajarMm > 0
      ? Math.round((minSejajarMm / jarakTepiSejajarMm) * 1e4) / 1e4
      : Infinity,
    rumus: `≥ ${jm.tepiSejajar}d searah gaya — di bawah ini kayu MEMBELAH`,
  })

  const minTegakMm = jm.tepiTegak * diameterMm
  periksa.push({
    nama: 'Jarak ke sisi kayu',
    nilai: jarakTepiTegakMm,
    syarat: Math.round(minTegakMm),
    satuan: 'mm',
    aman: jarakTepiTegakMm >= minTegakMm,
    rasio: jarakTepiTegakMm > 0
      ? Math.round((minTegakMm / jarakTepiTegakMm) * 1e4) / 1e4
      : Infinity,
    rumus: `≥ ${jm.tepiTegak}d tegak lurus gaya`,
  })

  if (jumlahAlat > 1) {
    const minAntarMm = jm.antarAlat * diameterMm
    periksa.push({
      nama: 'Jarak antar alat sambung',
      nilai: jarakAntarAlatMm,
      syarat: Math.round(minAntarMm),
      satuan: 'mm',
      aman: jarakAntarAlatMm >= minAntarMm,
      rasio: jarakAntarAlatMm > 0
        ? Math.round((minAntarMm / jarakAntarAlatMm) * 1e4) / 1e4
        : Infinity,
      rumus: `≥ ${jm.antarAlat}d searah gaya`,
    })
  }

  if (jarakTepiSejajarMm < minSejajarMm) {
    catatan.push(
      `Jarak ke ujung kayu ${jarakTepiSejajarMm} mm di bawah minimum `
      + `${Math.round(minSejajarMm)} mm (${jm.tepiSejajar}× diameter). Kayu akan `
      + 'MEMBELAH mengikuti seratnya, dan belah itu kegagalan GETAS — tak ada '
      + 'lendutan yang memberi peringatan lebih dulu. Ini pelanggaran yang '
      + 'paling sering: tukang memasang alat sambung terlalu dekat ujung '
      + 'supaya kelihatan rapi.',
    )
  }

  catatan.push(
    `Kapasitas dihitung dari MODA LELEH (SNI 7973 §12.3), bukan tumpu penuh `
    + `kayu (${tumpuMpa.toFixed(1)} MPa). Alat sambungnya ikut MELENTUR, dan `
    + 'sambungan leleh jauh sebelum kayunya tertumpu penuh — memakai Fe·d·t '
    + 'polos memberi angka sekitar TUJUH KALI lebih besar daripada yang '
    + 'sesungguhnya, ke arah yang berbahaya.',
  )
  if (jumlahAlat > 4) {
    catatan.push(
      `Faktor grup ${faktorGrup} dipakai untuk ${jumlahAlat} alat sambung: yang di `
      + 'ujung menerima gaya lebih besar daripada yang di tengah, jadi '
      + 'kapasitasnya tidak sebanding jumlahnya.',
    )
  }
  /*
    SUDUT terhadap serat — dinyatakan SELALU, termasuk saat 0.

    Bawaannya 0 derajat, dan itu arah yang PALING KUAT. Diam saat 0 berarti
    hasil yang optimistis lolos tanpa ada yang tahu bahwa sudutnya tak
    pernah diisi — dan pada kuda-kuda, sudut 0 justru yang jarang.
  */
  if (alat === 'baut') {
    if (sudut === 0) {
      catatan.push(
        'Sudut gaya terhadap serat dianggap 0° (SEJAJAR serat) karena tak '
        + 'diisi — dan itu arah yang PALING KUAT. Pada kuda-kuda, batang '
        + 'diagonal bertemu batang horizontal menyudut, dan kapasitasnya '
        + 'turun mengikuti rumus Hankinson: pada 45° tinggal 40%, pada 90° '
        + 'tinggal 25%. Isi sudutnya kalau sambungannya memang menyudut.',
      )
    } else {
      const rasio = tumpuMpa / tumpuSejajarMpa
      catatan.push(
        `Gaya menyudut ${sudut}° terhadap serat, jadi kuat tumpunya `
        + `${(rasio * 100).toFixed(0)}% dari nilai sejajar serat (rumus `
        + 'Hankinson, SNI 7973 §12.3.3). Kayu jauh lebih lemah ditekan '
        + 'MELINTANG serat — melintang penuh hanya seperempatnya.',
      )
    }
  } else {
    catatan.push(
      'Sudut terhadap serat TIDAK berpengaruh pada paku: diameternya kecil, '
      + 'seratnya menutup kembali di belakangnya, dan SNI 7973 §12.3 memakai '
      + 'satu nilai tanpa memandang arah. Pada BAUT sudut itu menentukan.',
    )
  }
  catatan.push(
    'Kuat tumpu kayu di sini DITURUNKAN dari kelas kuatnya, bukan dari uji '
    + 'dowel bearing. Cukup untuk perencanaan awal; sambungan yang menentukan '
    + 'pada bangunan penting sebaiknya memakai nilai dari SNI 7973 Tabel 12.3.',
  )
  if (alat === 'pelat_gigi') {
    catatan.push(
      'PELAT GIGI BERPAKU: kapasitasnya ditentukan PABRIK dan tak bisa dihitung '
      + 'dari sifat kayunya. Angka di sini pendekatan konservatif — ambil nilai '
      + 'sesungguhnya dari sertifikat produk sebelum dipakai untuk perencanaan.',
    )
  }
  catatan.push(
    'Yang BELUM diperiksa: sambungan yang memikul MOMEN (bukan hanya gaya '
    + 'searah), dan pelat gigi berpaku yang kapasitasnya ditentukan pabrik — '
    + 'keduanya butuh data yang tak ada di sini.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    kapasitas: {
      perAlatKn: Math.round(perAlatKn * 1e4) / 1e4,
      totalKn: Math.round(totalKn * 1e4) / 1e4,
      faktorPenetrasi: Math.round(faktorPenetrasi * 1e4) / 1e4,
      tumpuMpa: Math.round(tumpuMpa * 100) / 100,
    },
    catatan,
  }
}

// ── SEKRUP BAJA RINGAN ───────────────────────────────────────────────────────

/** Faktor tahanan sambungan baja ringan — SNI 7971 §5. */
export const PHI_SEKRUP = 0.5

/** Mutu baja ringan G550, MPa. */
export const FU_BAJA_RINGAN = 550

export interface InputSekrupBajaRingan {
  /** Diameter sekrup, mm. Lazim 4,8 atau 5,5. */
  diameterMm: number
  /** Jumlah sekrup di sambungan. */
  jumlahSekrup: number
  /** Tebal pelat yang bersentuhan dengan kepala sekrup, mm. */
  tebal1Mm: number
  /** Tebal pelat yang tidak bersentuhan kepala, mm. */
  tebal2Mm: number
  /** Kuat tarik pelat, MPa. */
  fuMpa: number
  /** Gaya GESER yang disalurkan, kN. */
  gayaGeserKn: number
  /** Gaya TARIK (cabut) yang bekerja, kN. Nol bila tak ada. */
  gayaTarikKn: number
  /** Jarak sekrup ke tepi pelat searah gaya, mm. */
  jarakTepiMm: number
}

export interface HasilSekrupBajaRingan {
  periksa: Periksa[]
  aman: boolean
  kapasitas: {
    /** Kapasitas geser per sekrup, kN — nilai TERKECIL dari tilting & bearing. */
    geserPerSekrupKn: number
    /** Moda yang mengendalikan. */
    modaGeser: string
    tiltingKn: number
    bearing1Kn: number
    bearing2Kn: number
    /** Kapasitas tarik cabut per sekrup, kN. */
    pullOutKn: number
    pullOverKn: number
  }
  catatan: string[]
}

/**
 * Sambungan sekrup self-drilling pada baja ringan — SNI 7971 §5.4.
 *
 * Empat moda kegagalan diperiksa, dan yang paling sering BUKAN sekrupnya yang
 * putus. Menghitungnya dengan rumus baut biasa melewatkan keempatnya.
 */
export function analisaSekrupBajaRingan(
  input: InputSekrupBajaRingan,
): HasilSekrupBajaRingan {
  const {
    diameterMm, jumlahSekrup, tebal1Mm, tebal2Mm, fuMpa,
    gayaGeserKn, gayaTarikKn, jarakTepiMm,
  } = input

  positif('diameter sekrup', diameterMm)
  positif('jumlah sekrup', jumlahSekrup)
  positif('tebal pelat 1', tebal1Mm)
  positif('tebal pelat 2', tebal2Mm)
  positif('fu pelat', fuMpa)
  positif('jarak ke tepi', jarakTepiMm)
  if (gayaGeserKn < 0 || gayaTarikKn < 0) {
    throw new Error('Gaya tak boleh negatif')
  }
  if (gayaGeserKn === 0 && gayaTarikKn === 0) {
    throw new Error('Isi gaya geser atau gaya tarik — sambungan tanpa gaya tak perlu dihitung')
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  const t1 = Math.min(tebal1Mm, tebal2Mm)
  const t2 = Math.max(tebal1Mm, tebal2Mm)

  // ── GESER: tilting vs bearing ────────────────────────────────────────────
  /*
    TILTING — sekrup MIRING karena pelatnya terlalu tipis menahannya tegak.
    Berlaku saat kedua pelat setebal sama; pada t2/t1 ≥ 2,5 sekrup tetap tegak
    dan hanya bearing yang berlaku.
  */
  const rasioTebal = t2 / t1
  const tiltingN = 4.2 * Math.sqrt(t2 ** 3 * diameterMm) * fuMpa
  const bearing1N = 2.7 * t1 * diameterMm * fuMpa
  const bearing2N = 2.7 * t2 * diameterMm * fuMpa

  let geserN: number
  let modaGeser: string
  if (rasioTebal <= 1.0) {
    geserN = Math.min(tiltingN, bearing1N, bearing2N)
    modaGeser = geserN === tiltingN ? 'tilting (sekrup miring)' : 'bearing (lubang melonjong)'
  } else if (rasioTebal >= 2.5) {
    geserN = Math.min(bearing1N, bearing2N)
    modaGeser = 'bearing (lubang melonjong)'
  } else {
    /* Antara 1,0 dan 2,5: interpolasi linear — SNI 7971 §5.4.2.3. */
    const vLower = Math.min(tiltingN, bearing1N, bearing2N)
    const vUpper = Math.min(bearing1N, bearing2N)
    geserN = vLower + ((rasioTebal - 1) / 1.5) * (vUpper - vLower)
    modaGeser = 'antara tilting dan bearing (interpolasi)'
  }

  const geserPerSekrupKn = (PHI_SEKRUP * geserN) / 1000
  const geserTotalKn = geserPerSekrupKn * jumlahSekrup

  if (gayaGeserKn > 0) {
    periksa.push({
      nama: 'Geser sambungan sekrup',
      nilai: Math.round(geserTotalKn * 100) / 100,
      syarat: Math.round(gayaGeserKn * 100) / 100,
      satuan: 'kN',
      aman: geserTotalKn >= gayaGeserKn,
      rasio: geserTotalKn > 0
        ? Math.round((gayaGeserKn / geserTotalKn) * 1e4) / 1e4
        : Infinity,
      rumus: `φVn = ${PHI_SEKRUP}·min(tilting, bearing) × jumlah — SNI 7971 §5.4.2`,
    })
  }

  // ── TARIK: pull-out vs pull-over ─────────────────────────────────────────
  /*
    PULL-OUT  sekrup tercabut dari pelat yang lebih tebal (ulirnya lepas)
    PULL-OVER kepala sekrup MENEMBUS pelat tipis

    Yang kedua paling sering pada atap: angin menghisap penutup, kepala sekrup
    menembus lembaran, dan atapnya terbang meski sekrupnya masih menancap
    utuh di kasonya.
  */
  const pullOutN = 0.85 * t2 * diameterMm * fuMpa
  const pullOverN = 1.5 * t1 * diameterMm * fuMpa
  const pullOutKn = (PHI_SEKRUP * pullOutN) / 1000
  const pullOverKn = (PHI_SEKRUP * pullOverN) / 1000
  const tarikPerSekrupKn = Math.min(pullOutKn, pullOverKn)
  const tarikTotalKn = tarikPerSekrupKn * jumlahSekrup

  if (gayaTarikKn > 0) {
    periksa.push({
      nama: 'Tarik cabut sekrup',
      nilai: Math.round(tarikTotalKn * 100) / 100,
      syarat: Math.round(gayaTarikKn * 100) / 100,
      satuan: 'kN',
      aman: tarikTotalKn >= gayaTarikKn,
      rasio: tarikTotalKn > 0
        ? Math.round((gayaTarikKn / tarikTotalKn) * 1e4) / 1e4
        : Infinity,
      rumus: `φNt = ${PHI_SEKRUP}·min(pull-out, pull-over) × jumlah`,
    })

    if (pullOverKn < pullOutKn) {
      catatan.push(
        'Yang mengendalikan PULL-OVER: kepala sekrup menembus pelat tipis. '
        + 'Ini yang paling sering pada atap — angin menghisap penutup, kepala '
        + 'sekrup menembus lembarannya, dan atap terbang meski sekrupnya masih '
        + 'menancap utuh di kasonya. Pakai sekrup berkepala lebar atau ring '
        + 'penahan (washer).',
      )
    }
  }

  // ── Jarak ke tepi ────────────────────────────────────────────────────────
  const jarakMinMm = 3 * diameterMm
  periksa.push({
    nama: 'Jarak sekrup ke tepi',
    nilai: jarakTepiMm,
    syarat: Math.round(jarakMinMm),
    satuan: 'mm',
    aman: jarakTepiMm >= jarakMinMm,
    rasio: Math.round((jarakMinMm / jarakTepiMm) * 1e4) / 1e4,
    rumus: '≥ 3d — di bawah ini pelat sobek dari tepinya (SNI 7971 §5.4.2.4)',
  })

  // ── Interaksi geser + tarik ──────────────────────────────────────────────
  if (gayaGeserKn > 0 && gayaTarikKn > 0) {
    /*
      Sekrup yang memikul geser DAN tarik bersamaan gagal lebih cepat daripada
      salah satunya sendiri. Ini keadaan yang lazim pada atap: berat penutup
      menggeser, angin menghisap.
    */
    const interaksi = (gayaGeserKn / geserTotalKn) + (gayaTarikKn / tarikTotalKn)
    periksa.push({
      nama: 'Interaksi geser + tarik',
      nilai: Math.round(interaksi * 1000) / 1000,
      syarat: 1.3,
      satuan: '',
      aman: interaksi <= 1.3,
      rasio: Math.round((interaksi / 1.3) * 1e4) / 1e4,
      rumus: 'V/Vn + N/Nn ≤ 1,3 — sekrup memikul keduanya bersamaan',
    })
  }

  catatan.push(
    `Moda geser yang mengendalikan: ${modaGeser} (t2/t1 = ${rasioTebal.toFixed(2)}). `
    + 'Menghitung sambungan baja ringan dengan rumus baut biasa melewatkan '
    + 'tilting sepenuhnya — dan pada pelat setipis ini, tilting sering yang '
    + 'menentukan.',
  )
  catatan.push(
    `Faktor tahanan ${PHI_SEKRUP} jauh lebih kecil daripada baut biasa (0,75). `
    + 'Bukan kehati-hatian berlebihan: sambungan baja tipis punya sebaran '
    + 'kekuatan yang jauh lebih lebar, dan pemasangannya sangat bergantung '
    + 'ketelitian tukang.',
  )
  catatan.push(
    'Yang BELUM diperiksa: sekrup yang dipasang MIRING atau terlalu kencang '
    + '(ulirnya rusak dan kapasitasnya hilang), korosi galvanis antara sekrup '
    + 'dan pelat berbeda lapisan, dan kelelahan akibat angin berulang.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    kapasitas: {
      geserPerSekrupKn: Math.round(geserPerSekrupKn * 1e4) / 1e4,
      modaGeser,
      tiltingKn: Math.round(((PHI_SEKRUP * tiltingN) / 1000) * 1e4) / 1e4,
      bearing1Kn: Math.round(((PHI_SEKRUP * bearing1N) / 1000) * 1e4) / 1e4,
      bearing2Kn: Math.round(((PHI_SEKRUP * bearing2N) / 1000) * 1e4) / 1e4,
      pullOutKn: Math.round(pullOutKn * 1e4) / 1e4,
      pullOverKn: Math.round(pullOverKn * 1e4) / 1e4,
    },
    catatan,
  }
}

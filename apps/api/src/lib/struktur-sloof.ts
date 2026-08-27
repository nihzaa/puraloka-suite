// SLOOF (tie beam) — analisa lentur, geser, dan volume. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA SLOOF PUNYA MODUL SENDIRI, BUKAN MEMAKAI `analisaBalok`
// ══════════════════════════════════════════════════════════════════════════════
//
// Secara mekanika sloof memang balok, dan `analisaBalok` menghitung lenturnya
// dengan benar. Tetapi memakai balok apa adanya melewatkan tiga hal yang justru
// menentukan ukuran sloof di lapangan:
//
//   1. **Bebannya dihitung, bukan diketik.** Beban sloof hampir selalu berat
//      dinding di atasnya + berat sendiri, dan itu bisa dihitung dari tinggi
//      dinding × berat jenis pasangan. Estimator yang harus menghitung Mu
//      sendiri di kertas akan salah, dan salahnya tak terlihat karena angka
//      momen tak punya "rasa benar" seperti dimensi.
//
//   2. **Tulangan SIMETRIS atas-bawah.** Sloof memikul momen dua arah: positif
//      di tengah bentang, negatif di atas tumpuan (kolom). Balok lantai boleh
//      bertulangan bawah lebih banyak; sloof yang ditulangi begitu retak di
//      atas tumpuan. Modul ini mensyaratkan atas = bawah dan MENOLAK yang
//      tidak — bukan sekadar memperingatkan.
//
//   3. **Sloof tidak boleh melendut bebas seperti balok lantai.** Ia menyatu
//      dengan tanah dan pondasi; yang menentukan tingginya bukan lendutan
//      melainkan ANGKA MINIMUM praktis (h ≥ L/15 dan ≥ 200 mm) supaya ia cukup
//      kaku menyatukan pondasi saat tanah bergerak tak seragam. Itulah fungsi
//      utamanya — "tie beam", pengikat.
//
// ── Yang TIDAK dihitung di sini
//
// Gaya TARIK aksial akibat gempa (SNI 2847 §18.13.3 mensyaratkan sloof
// penghubung pondasi memikul 10% beban aksial kolom terbesar). Itu butuh gaya
// gempa yang belum dihitung modul mana pun di repo ini, dan menebaknya lebih
// berbahaya daripada menyebutnya belum ada. Disebutkan di `catatan`.
// ══════════════════════════════════════════════════════════════════════════════

import { analisaBalok, type HasilElemen, type InputBalok } from './struktur-beton.js'

/**
 * Berat jenis pasangan dinding, kN/m³.
 *
 * Angka SNI 1727 Tabel C3-1. Ditulis eksplisit dan bisa ditimpa: dinding bata
 * ringan (6,5) dan bata merah (17) berbeda hampir tiga kali lipat, dan memakai
 * bawaan yang salah menggeser seluruh perhitungan sloof.
 */
export const BERAT_DINDING_KN_M3 = {
  bata_merah: 17,
  batako: 12,
  bata_ringan: 6.5,
} as const

export type JenisDinding = keyof typeof BERAT_DINDING_KN_M3

/** Berat volume beton bertulang, kN/m³ — SNI 1727. */
export const BERAT_BETON_KN_M3 = 24

/**
 * Tinggi minimum sloof sebagai pecahan bentang.
 *
 * Bukan syarat lendutan (sloof tak melendut bebas) melainkan KEKAKUAN: sloof
 * yang terlalu langsing tak sanggup menyatukan pondasi saat tanah turun tak
 * seragam, dan retak yang muncul justru di dinding di atasnya — kerusakan yang
 * terlihat pemilik bangunan sementara sebabnya di bawah tanah.
 */
export const RASIO_TINGGI_MIN = 1 / 15

/** Tinggi mutlak minimum, mm — praktik lapangan; di bawah ini sengkang tak muat. */
export const TINGGI_MIN_MM = 200

export interface InputSloof {
  bMm: number
  hMm: number
  /** Bentang bersih antar kolom/pondasi, m. */
  bentangM: number
  selimutMm: number
  dUtamaMm: number
  /**
   * Jumlah tulangan bawah. Tulangan ATAS wajib sama — lihat kepala berkas.
   */
  nBawah: number
  /** Jumlah tulangan atas. Wajib = `nBawah`; ditolak bila tidak. */
  nAtas: number
  dSengkangMm: number
  jarakSengkangMm: number
  mutu: { fcMpa: number; fyMpa: number }
  /** Tinggi dinding yang dipikul, m. Nol bila sloof tak memikul dinding. */
  tinggiDindingM: number
  /** Tebal dinding, m. */
  tebalDindingM: number
  jenisDinding: JenisDinding
  /** Berat jenis dinding, kN/m³ — menimpa `jenisDinding` bila diisi. */
  beratDindingKnM3?: number
  /** Beban merata tambahan, kN/m (mis. lantai yang bertumpu langsung). */
  bebanTambahanKnPerM?: number
  jumlah?: number
}

export interface HasilSloof extends HasilElemen {
  /** Beban yang DIHITUNG, bukan diketik — supaya bisa diperiksa. */
  beban: {
    dindingKnPerM: number
    beratSendiriKnPerM: number
    tambahanKnPerM: number
    totalKnPerM: number
    /** Momen rencana yang dipakai, kNm. */
    muKnm: number
    /** Gaya geser rencana yang dipakai, kN. */
    vuKn: number
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Analisa sloof.
 *
 * Bebannya DIHITUNG dari dinding + berat sendiri, lalu momen dan gesernya
 * diturunkan dengan anggapan JEPIT-JEPIT (wL²/12) — bukan tumpuan sederhana.
 *
 * Alasannya bukan kenyamanan: sloof dicor menyatu dengan kolom dan pondasi,
 * jadi ujungnya tertahan berputar. Memakai wL²/8 (tumpuan sederhana) memberi
 * momen lapangan 50% lebih besar — konservatif untuk lapangan, tetapi
 * MENYESATKAN untuk tumpuan, tempat momen negatifnya justru terbesar dan
 * tulangan atasnya sering dilupakan.
 */
export function analisaSloof(input: InputSloof): HasilSloof {
  const {
    bMm, hMm, bentangM, selimutMm, dUtamaMm, nBawah, nAtas,
    dSengkangMm, jarakSengkangMm, mutu,
    tinggiDindingM, tebalDindingM, jenisDinding,
  } = input

  positif('b', bMm)
  positif('h', hMm)
  positif('bentang', bentangM)
  positif('d tulangan utama', dUtamaMm)
  positif('jarak sengkang', jarakSengkangMm)
  positif("f'c", mutu.fcMpa)
  positif('fy', mutu.fyMpa)

  if (nBawah < 2) throw new Error('nBawah minimal 2 batang')
  if (nAtas !== nBawah) {
    /*
      DITOLAK, bukan diperingatkan.

      Sloof memikul momen dua arah — positif di lapangan, negatif di atas
      tumpuan — dan besarnya SAMA pada anggapan jepit-jepit. Tulangan atas yang
      lebih sedikit membuat sloof retak tepat di atas kolom, tempat yang paling
      sulit diperbaiki sesudah dinding berdiri.

      Peringatan tak cukup: catatan yang bisa dilewati akan dilewati.
    */
    throw new Error(
      `Sloof harus bertulangan SIMETRIS: nAtas (${nAtas}) wajib sama dengan `
      + `nBawah (${nBawah}). Momen negatif di atas tumpuan sama besar dengan `
      + 'momen positif di lapangan, dan tulangan atas yang kurang membuat sloof '
      + 'retak tepat di atas kolom.',
    )
  }

  const catatan: string[] = []

  // ── Beban ────────────────────────────────────────────────────────────────
  const beratJenis = input.beratDindingKnM3 ?? BERAT_DINDING_KN_M3[jenisDinding]
  if (!beratJenis) throw new Error(`jenis dinding tak dikenal: ${jenisDinding}`)

  const dindingKnPerM = tinggiDindingM > 0
    ? tinggiDindingM * tebalDindingM * beratJenis
    : 0
  const beratSendiriKnPerM = (bMm / 1000) * (hMm / 1000) * BERAT_BETON_KN_M3
  const tambahanKnPerM = input.bebanTambahanKnPerM ?? 0
  const totalKnPerM = dindingKnPerM + beratSendiriKnPerM + tambahanKnPerM

  /*
    ⚠ Cek "beban total nol" SENGAJA TIDAK ADA di sini — dan itu hasil test yang
    merah.

    Versi pertama melemparnya, tetapi keadaan itu MUSTAHIL: berat sendiri
    (b × h × 24) selalu > 0 karena b dan h sudah dipastikan positif di atas.
    Cek yang tak pernah bisa benar adalah kode mati yang terbaca seperti
    penjagaan — pembacanya menyangka ada perlindungan yang sebenarnya tak ada.

    Yang PERLU diperingatkan justru sebaliknya: sloof yang hanya memikul berat
    sendiri. Itu sah (sloof pengikat murni tanpa dinding di atasnya), tetapi
    jauh lebih sering berarti tinggi dindingnya lupa diisi — dan sloof yang
    dihitung tanpa beban dinding keluar jauh lebih kecil daripada seharusnya.
  */
  if (dindingKnPerM === 0 && tambahanKnPerM === 0) {
    catatan.push(
      'Sloof ini dihitung HANYA dengan berat sendirinya — tak ada dinding '
      + 'maupun beban tambahan. Itu sah untuk sloof pengikat murni, tetapi '
      + 'lebih sering berarti tinggi dinding lupa diisi. Sloof yang dihitung '
      + 'tanpa beban dinding keluar jauh lebih kecil daripada seharusnya.',
    )
  }

  /*
    Faktor beban 1,2D. Seluruh beban di sini beban MATI (dinding, berat
    sendiri); beban hidup tak bekerja pada sloof kecuali ada lantai yang
    bertumpu langsung, dan itu masuk lewat `bebanTambahanKnPerM` yang pemakainya
    sendiri harus sudah memfaktorkan.
  */
  const wu = 1.2 * totalKnPerM
  const muKnm = (wu * bentangM * bentangM) / 12
  const vuKn = (wu * bentangM) / 2

  // ── Kekakuan minimum ─────────────────────────────────────────────────────
  const hMinRasio = bentangM * 1000 * RASIO_TINGGI_MIN
  const hMin = Math.max(hMinRasio, TINGGI_MIN_MM)
  if (hMm < hMin) {
    catatan.push(
      `Tinggi sloof ${hMm} mm di bawah minimum praktis ${Math.round(hMin)} mm `
      + `(bentang ${bentangM} m ÷ 15, minimal ${TINGGI_MIN_MM} mm). Sloof yang `
      + 'terlalu langsing tak sanggup menyatukan pondasi saat tanah turun tak '
      + 'seragam — retaknya muncul di DINDING, dan sebabnya tak terlihat.',
    )
  }

  // ── Lentur & geser lewat modul balok ─────────────────────────────────────
  /*
    Perhitungan penampangnya TIDAK disalin: dipakai `analisaBalok` yang sudah
    ber-golden-test 42 kasus. Yang ditambahkan modul ini adalah bebannya,
    syarat simetri, dan syarat kekakuan — bukan rumus lentur kedua yang bisa
    menyimpang saat yang pertama diperbaiki.
  */
  const dasar: InputBalok = {
    bMm, hMm, panjangM: bentangM, selimutMm, dUtamaMm,
    nTarik: nBawah, nTekan: nAtas,
    dSengkangMm, jarakSengkangMm, mutu,
    muKnm, vuKn,
    jumlah: input.jumlah,
  }
  const hasil = analisaBalok(dasar)

  catatan.push(...hasil.catatan)
  catatan.push(
    'Gaya TARIK aksial akibat gempa belum diperiksa. SNI 2847 §18.13.3 '
    + 'mensyaratkan sloof penghubung pondasi memikul 10% beban aksial kolom '
    + 'terbesar; itu butuh gaya gempa yang belum dihitung modul mana pun di '
    + 'aplikasi ini. Untuk bangunan di wilayah gempa menengah–tinggi, periksa '
    + 'terpisah.',
  )
  catatan.push(
    `Beban DIHITUNG dari dinding ${tinggiDindingM} m × ${tebalDindingM} m × `
    + `${beratJenis} kN/m³ = ${dindingKnPerM.toFixed(2)} kN/m, ditambah berat `
    + `sendiri ${beratSendiriKnPerM.toFixed(2)} kN/m`
    + (tambahanKnPerM > 0 ? ` dan tambahan ${tambahanKnPerM} kN/m` : '')
    + `. Momen memakai wL²/12 (jepit-jepit), bukan wL²/8 — sloof dicor menyatu `
    + 'dengan kolom dan pondasi, jadi ujungnya tertahan berputar.',
  )

  return {
    ...hasil,
    catatan,
    beban: {
      dindingKnPerM: Math.round(dindingKnPerM * 1e4) / 1e4,
      beratSendiriKnPerM: Math.round(beratSendiriKnPerM * 1e4) / 1e4,
      tambahanKnPerM,
      totalKnPerM: Math.round(totalKnPerM * 1e4) / 1e4,
      muKnm: Math.round(muKnm * 1e4) / 1e4,
      vuKn: Math.round(vuKn * 1e4) / 1e4,
    },
  }
}

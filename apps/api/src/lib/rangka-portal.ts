// apps/api/src/lib/rangka-portal.ts
// Lapis 2 solver rangka 2D: merakit BALOK MENERUS dari geometri bangunan.
//
// Berbeda dari `rangka-matriks.ts` dan `rangka-model.ts` yang BUTA SNI, berkas
// ini tahu SNI — ia menerjemahkan mutu beton jadi modulus elastis dan dimensi
// penampang jadi inersia, lalu menyerahkan seluruh perhitungan strukturnya ke
// `analisaRangka2D`. Nol matematika kekakuan di sini; itu sengaja, supaya
// hanya ada SATU tempat yang bisa salah.
//
// ── Satuan (dipaku, mengikuti lapis di bawahnya)
//   bentangM m · bMm/hMm mm · fcMpa MPa · qKnM kN/m
//   Keluaran: momen kNm · geser kN · aksial kN · lendutan mm.
//
// ⚠ `momenKnm.maks/min` dan `momenTumpuanKnm` dibaca dari deret 11 TITIK
// SAMPEL milik `analisaRangka2D`, bukan dari puncak analitis. Untuk tumpuan
// itu tak jadi soal — tumpuan SELALU jatuh di x = 0 dan x = L, keduanya titik
// sampel. Untuk momen LAPANGAN, puncaknya bisa jatuh di antara dua sampel:
// balok menerus dua bentang berpuncak di x = 0,375 L, dan jaring 0,1 L
// terdekat hanya sampai 0,4 L (50,400 vs 50,625 kNm — meleset 0,44%).
// Lihat catatan penyimpangan di test.

import {
  analisaRangka2D,
  type BatangModel,
  type HasilBatang,
  type Simpul,
} from './rangka-model.js'

export interface InputBalokMenerus {
  /** Panjang tiap bentang, m, urut dari kiri. Minimal satu, semuanya > 0. */
  bentangM: number[]
  /** Lebar penampang balok, mm. */
  bMm: number
  /** Tinggi penampang balok, mm. */
  hMm: number
  /** Mutu beton f'c, MPa. */
  fcMpa: number
  /** Beban merata terfaktor, kN/m, POSITIF = ke arah gravitasi. */
  qKnM: number
}

export interface HasilBalokMenerus {
  batang: HasilBatang[]
  /**
   * Momen di tiap tumpuan, kNm. Panjangnya = jumlah tumpuan = bentang + 1.
   * Diambil dari ujung batang yang bertemu di tumpuan itu.
   */
  momenTumpuanKnm: number[]
  catatan: string[]
}

const CATATAN_BALOK_MENERUS =
  'Balok menerus dianggap bertumpu bebas di setiap tumpuan (tanpa kekakuan '
  + 'kolom). Untuk portal, pakai `analisaPortal`.'

/**
 * Modulus elastis beton normal, MPa.
 *
 * SNI 2847:2019 §19.2.2.1 — Ec = 4700·√f'c untuk beton normal (wc antara
 * 1440 dan 2560 kg/m³ memakai rumus §19.2.2.1(a); rumus ini adalah bentuk
 * sederhananya untuk wc = 2320 kg/m³).
 */
function modulusBeton(fcMpa: number): number {
  return 4700 * Math.sqrt(fcMpa)
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Balok menerus di atas tumpuan sederhana — lapis 2.
 *
 * Merakit `n+1` simpul mendatar dan satu batang per bentang, lalu menyerahkan
 * perhitungannya ke `analisaRangka2D`. Tumpuan pertama `sendi` (menahan geser
 * mendatar sekali saja), sisanya `rol-x` — persis balok menerus statis tak
 * tentu yang lazim, bukan rangka yang tertahan mendatar di banyak tempat.
 *
 * @throws bila bentang kosong / ada bentang ≤ 0 / penampang atau mutu ≤ 0.
 */
export function analisaBalokMenerus(input: InputBalokMenerus): HasilBalokMenerus {
  // ── 1. Validasi.
  const { bentangM, bMm, hMm, fcMpa, qKnM } = input
  if (!Array.isArray(bentangM) || bentangM.length === 0) {
    throw new Error('Balok menerus butuh minimal satu bentang (bentangM kosong)')
  }
  bentangM.forEach((L, i) => {
    if (!Number.isFinite(L) || L <= 0) {
      throw new Error(
        `Bentang ke-${i + 1} harus angka > 0 (diterima: ${L})`,
      )
    }
  })
  positif('b (lebar penampang)', bMm)
  positif('h (tinggi penampang)', hMm)
  positif("f'c (mutu beton)", fcMpa)
  positif('q (beban merata)', qKnM)

  // ── 2-3. Bahan & penampang.
  const eMpa = modulusBeton(fcMpa)
  const iMm4 = bMm * hMm ** 3 / 12   // inersia penampang persegi
  const aMm2 = bMm * hMm

  // ── 4. Simpul di x = 0, L1, L1+L2, … ; semuanya di y = 0.
  //    Tumpuan pertama `sendi`, sisanya `rol-x`: satu tahanan mendatar saja,
  //    supaya balok bebas memuai dan tak ada gaya aksial palsu.
  const simpul: Simpul[] = []
  let x = 0
  simpul.push({ nama: 'T1', xM: 0, yM: 0, tumpuan: 'sendi' })
  bentangM.forEach((L, i) => {
    x += L
    simpul.push({ nama: `T${i + 2}`, xM: x, yM: 0, tumpuan: 'rol-x' })
  })

  // ── 5. Satu batang per bentang, beban merata sama untuk semuanya.
  const batang: BatangModel[] = bentangM.map((_, i) => ({
    nama: `B${i + 1}`,
    dari: i,
    ke: i + 1,
    eMpa,
    aMm2,
    iMm4,
    qKnM,
  }))

  // ── 6. Serahkan ke lapis bawah, lalu baca momen di tiap tumpuan.
  const h = analisaRangka2D(simpul, batang, [])

  /*
    Momen tumpuan diambil dari deret titik batang yang bertemu di sana:
    tumpuan ke-i adalah ujung KANAN batang i−1 dan ujung KIRI batang i.
    Tumpuan pertama memakai ujung kiri batang pertama; sisanya memakai ujung
    kanan batang sebelumnya — keduanya sama besar di tumpuan interior (momen
    menerus), jadi pilihan mana pun sah.

    x = 0 dan x = L SELALU titik sampel, jadi angka tumpuan di sini eksak —
    tak ada kesalahan jaring seperti pada momen lapangan.
  */
  const momenTumpuanKnm: number[] = []
  const b0 = h.batang[0]!
  momenTumpuanKnm.push(b0.momenKnm.di[0]!.nilai)
  h.batang.forEach((b) => {
    const ujung = b.momenKnm.di[b.momenKnm.di.length - 1]!
    momenTumpuanKnm.push(ujung.nilai)
  })

  // ── 7. Catatan: batas dari lapis bawah + batas khusus balok menerus.
  return {
    batang: h.batang,
    momenTumpuanKnm,
    catatan: [...h.catatan, CATATAN_BALOK_MENERUS],
  }
}

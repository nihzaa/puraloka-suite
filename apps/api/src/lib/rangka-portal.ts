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
// ⚠ `momenTumpuanKnm` dibaca dari deret 11 TITIK SAMPEL milik
// `analisaRangka2D`, dan untuk tumpuan itu tak jadi soal — tumpuan SELALU
// jatuh di x = 0 dan x = L, keduanya titik sampel.
//
// `momenKnm.maks/min` dan `lendutanMm.maks` TIDAK lagi terbatas pada jaring
// itu: sejak 2026-09-01 keduanya menyertakan puncak analitis di antara dua
// sampel. Peringatan lama di sini berbunyi "meleset 0,44%" dan itu sudah
// TIDAK berlaku — balok menerus dua bentang kini memulangkan 50,625 kNm,
// bukan 50,400. Deret `di[]` tetap 11 titik untuk menggambar diagram.

import {
  analisaRangka2D,
  type BatangModel,
  type BebanTitik,
  type HasilBatang,
  type Simpul,
} from './rangka-model.js'
import type { GayaTingkat } from './struktur-beban-lateral.js'

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

// ══════════════════════════════════════════════════════════════════════════════
// LAPIS 3 — PORTAL (rangka bergoyang, kolom + balok menyatu kaku)
// ══════════════════════════════════════════════════════════════════════════════

export interface InputPortal {
  /** Bentang antar-kolom, m (satu bentang, dua kolom). */
  bentangM: number
  /** Tinggi tiap lantai, m — sama untuk semua lantai. */
  tinggiM: number
  /** Banyaknya lantai di atas dasar. Minimal 1. */
  jumlahLantai: number
  /** Penampang balok, mm. */
  balok: { bMm: number; hMm: number }
  /** Penampang kolom, mm. */
  kolom: { bMm: number; hMm: number }
  /** Mutu beton f'c, MPa — dipakai untuk balok DAN kolom. */
  fcMpa: number
  /** Beban merata terfaktor di tiap balok, kN/m, POSITIF = ke bawah. */
  qKnM: number
  /**
   * Gaya lateral per lantai, kN, urut dari lantai 1 ke atas. Indeks `t`
   * berarti gaya yang bekerja di lantai `t+1` (elevasi `(t+1)·tinggiM`).
   *
   * Sengaja diterima APA ADANYA — `analisaGempaStatik` sudah menghitungnya,
   * dan menghitung ulang di sini akan membuat dua sumber kebenaran yang bisa
   * menyimpang tanpa satu pun galat. Dipakai penuh di lapis 4.
   */
  gayaLateralKn?: number[]
}

export interface HasilPortal {
  batang: HasilBatang[]
  catatan: string[]
}

const CATATAN_PORTAL =
  'Portal 2D satu bidang; kekakuan arah tegak lurus tak ditinjau.'

/**
 * Portal bertingkat satu bentang — lapis 3.
 *
 * Merakit kolom dan balok jadi rangka kaku, lalu menyerahkan perhitungannya
 * ke `analisaRangka2D`. Yang membedakannya dari `analisaBalokMenerus`: balok
 * di sini TIDAK bertumpu bebas — ia menyatu kaku dengan kolom, sehingga
 * sebagian momennya berpindah ke kolom.
 *
 * ⚠ Momen tumpuan baloknya jatuh di antara 0 (kolom sangat lunak → balok
 * mendekati SEDERHANA, yang momen tumpuannya NOL) dan wL²/12 (kolom sangat
 * kaku → mendekati JEPIT-JEPIT). Diukur: kolom 50²→0,03 · 400²→41,93 ·
 * 2000²→59,88 kNm pada balok 300×500, L=6, w=20.
 *
 * Komentar versi pertama di sini menulis batasnya "antara wL²/12 dan wL²/8"
 * dan itu SALAH ARAH: wL²/8 adalah momen LAPANGAN balok sederhana, bukan
 * momen tumpuannya. Yang dipakai test justru identitas yang lebih tajam dan
 * tak bergantung kekakuan sama sekali:
 *
 *     M tumpuan + M lapangan = wL²/8   PERSIS, kekakuan kolom berapa pun
 *
 * Penamaan batang DIPAKAI PEMANGGIL untuk memilah: kolom berawalan `K`,
 * balok berawalan `B`. Jangan mengubahnya tanpa mengubah pemanggilnya.
 *
 * @throws bila geometri, penampang, atau mutu tak masuk akal.
 */
export function analisaPortal(input: InputPortal): HasilPortal {
  // ── 1. Validasi.
  const { bentangM, tinggiM, jumlahLantai, balok, kolom, fcMpa, qKnM } = input
  positif('bentang', bentangM)
  positif('tinggi lantai', tinggiM)
  if (!Number.isInteger(jumlahLantai) || jumlahLantai < 1) {
    throw new Error(
      `Portal butuh minimal 1 lantai, bilangan bulat (diterima: ${jumlahLantai})`,
    )
  }
  positif('b (lebar balok)', balok.bMm)
  positif('h (tinggi balok)', balok.hMm)
  positif('b (lebar kolom)', kolom.bMm)
  positif('h (tinggi kolom)', kolom.hMm)
  positif("f'c (mutu beton)", fcMpa)
  /*
    ⚠ `qKnM` boleh NOL — dan itu bukan kelalaian. Lapis 4 memeriksa beban
    lateral secara TERISOLASI dengan mematikan gravitasi; menolak nol di sini
    akan membuat kasus itu mustahil diuji. Yang ditolak hanya bukan-angka.
  */
  if (!Number.isFinite(qKnM)) {
    throw new Error(`q (beban merata) harus angka (diterima: ${qKnM})`)
  }

  // ── 2. Bahan & penampang. E sama untuk balok dan kolom (satu mutu beton).
  const eMpa = modulusBeton(fcMpa)
  const balokI = balok.bMm * balok.hMm ** 3 / 12
  const balokA = balok.bMm * balok.hMm
  const kolomI = kolom.bMm * kolom.hMm ** 3 / 12
  const kolomA = kolom.bMm * kolom.hMm

  /*
    ── 3. Simpul: dua per lantai (kiri x=0, kanan x=bentang), lantai 0 = dasar.
    Indeks simpul lantai t: kiri = 2t, kanan = 2t+1. Rumus indeks ini dipakai
    di tiga tempat di bawah; menyimpannya sebagai fungsi kecil lebih murah
    daripada menuliskan `2*t` berulang dan salah di salah satunya.
  */
  const kiri = (t: number) => 2 * t
  const kanan = (t: number) => 2 * t + 1

  const simpul: Simpul[] = []
  for (let t = 0; t <= jumlahLantai; t++) {
    // Hanya kaki portal yang dijepit; simpul lantai atas bebas bergerak —
    // itulah yang membuat portal BERGOYANG di bawah beban lateral.
    const tumpuan: Simpul['tumpuan'] = t === 0 ? 'jepit' : 'bebas'
    simpul.push({ nama: `S${t}Ki`, xM: 0, yM: t * tinggiM, tumpuan })
    simpul.push({ nama: `S${t}Ka`, xM: bentangM, yM: t * tinggiM, tumpuan })
  }

  // ── 4-5. Batang: dua kolom per lantai, satu balok per lantai di atas dasar.
  const batang: BatangModel[] = []
  for (let t = 0; t < jumlahLantai; t++) {
    // Kolom TANPA `qKnM` — beban merata gravitasi bekerja pada balok, bukan
    // pada kolom. Memberinya ke kolom membuat kolom terlentur oleh beban yang
    // tak ada, dan aksial kolomnya jadi salah.
    batang.push({
      nama: `K${t + 1}Ki`, dari: kiri(t), ke: kiri(t + 1),
      eMpa, aMm2: kolomA, iMm4: kolomI,
    })
    batang.push({
      nama: `K${t + 1}Ka`, dari: kanan(t), ke: kanan(t + 1),
      eMpa, aMm2: kolomA, iMm4: kolomI,
    })
    // Balok hanya di lantai t+1 (≥ 1) — tak ada balok di elevasi dasar.
    batang.push({
      nama: `B${t + 1}`, dari: kiri(t + 1), ke: kanan(t + 1),
      eMpa, aMm2: balokA, iMm4: balokI, qKnM,
    })
  }

  /*
    ── 6. Gaya lateral: dipasang di simpul KIRI lantai t+1, arah +X.

    Simpul kiri saja, bukan dibagi dua — balok yang menyatu kaku menyalurkan
    gaya itu ke kolom kanan lewat kekakuan aksialnya sendiri, jadi hasil
    goyangannya sama. Menaruhnya di satu simpul membuat masukannya persis
    sama bentuknya dengan keluaran `analisaGempaStatik` (satu angka per
    lantai), tanpa pembagian yang bisa salah di tengah jalan.
  */
  const bebanTitik: BebanTitik[] = []
  const lateral = input.gayaLateralKn ?? []
  lateral.forEach((fxKn, t) => {
    if (!Number.isFinite(fxKn)) {
      throw new Error(`gayaLateralKn[${t}] harus angka (diterima: ${fxKn})`)
    }
    if (t >= jumlahLantai) {
      throw new Error(
        `gayaLateralKn punya ${lateral.length} nilai untuk ${jumlahLantai} `
        + 'lantai — gaya di lantai yang tak ada tak akan pernah bekerja, dan '
        + 'diamnya bukan galat.',
      )
    }
    if (fxKn !== 0) bebanTitik.push({ simpul: kiri(t + 1), fxKn })
  })

  // ── 7. Serahkan ke lapis bawah; teruskan catatannya + batas khusus portal.
  const h = analisaRangka2D(simpul, batang, bebanTitik)
  return {
    batang: h.batang,
    catatan: [...h.catatan, CATATAN_PORTAL],
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LAPIS 4 — BEBAN LATERAL (gempa)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Memetakan hasil `analisaGempaStatik` ke masukan `gayaLateralKn` milik
 * `analisaPortal`.
 *
 * ⚠ TAK ADA PERHITUNGAN DI SINI, DAN ITU SENGAJA.
 *
 * `analisaGempaStatik` di `struktur-beban-lateral.ts` SUDAH menghitung
 * distribusi gaya per tingkat lengkap dengan seluruh jalurnya (berat total →
 * perioda → Cs → geser dasar V → distribusi Cvx menurut SNI 1726:2019 §7.8.3).
 * Menghitungnya ulang di sini akan membuat DUA SUMBER KEBENARAN untuk angka
 * yang sama: keduanya benar hari ini, lalu salah satunya diperbaiki dan yang
 * lain tidak, dan sejak itu layar memperlihatkan satu angka sementara solver
 * memakai angka lain — tanpa satu pun galat, karena dua rumus yang menyimpang
 * tidak melempar apa pun.
 *
 * Ini pola cacat yang sama yang dijaga `audit-takeoff-kembar-sepakat.mjs` untuk
 * rumus take-off. Bedanya, di sini penyimpangan itu dicegah di akarnya: fungsi
 * ini hanya MENYALIN, jadi tak ada rumus kedua yang bisa menyimpang.
 *
 * @param tingkat keluaran `analisaGempaStatik(...).gaya`, urut lantai 1 ke atas
 * @returns `gayaKn` tiap tingkat, kN — siap dipakai `InputPortal.gayaLateralKn`
 */
export function gayaLateralDariGempa(tingkat: GayaTingkat[]): number[] {
  return tingkat.map((t) => t.gayaKn)
}

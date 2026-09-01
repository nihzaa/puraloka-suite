// apps/api/src/lib/rangka-truss.ts
// Rangka batang (truss) 2D — lapis 5. PURE, tanpa I/O.
//
// Modul ini merakit model truss dan memulangkan gaya aksial tiap batang
// berikut ARAHnya (tarik/tekan). Ia menumpang `analisaRangka2D` sepenuhnya;
// nol matriks kekakuan baru ditulis di sini.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA TRUSS DIMODELKAN LEWAT SOLVER PORTAL — dan bagaimana sendinya dibuat
// ══════════════════════════════════════════════════════════════════════════════
//
// `analisaRangka2D` memodelkan batang BERLENTUR dengan sambungan KAKU (portal).
// Truss adalah hal lain: sambungannya SENDI, jadi batangnya hanya boleh memikul
// gaya AKSIAL — tak ada momen yang bisa menyeberang simpul.
//
// Ketimbang menulis solver kedua (elemen batang 4 DOF) yang harus dijaga
// sejajar dengan yang pertama selamanya, sendinya dibuat dengan memberi inersia
// yang sangat kecil: `I_TRUSS = 1e-6 mm⁴`. Kekakuan lentur sebanding dengan EI,
// jadi pada I sekecil itu batangnya praktis tak menahan lentur sama sekali dan
// seluruh gaya mengalir lewat suku aksial EA/L — persis perilaku truss.
//
// ⚠ Ini keputusan PEMODELAN, bukan konstanta bahan. Tak ada penampang nyata
// berinersia 1e-6 mm⁴; angka ini dipilih supaya suku lentur tenggelam terhadap
// suku aksial, bukan karena ia menggambarkan sesuatu di dunia nyata. Tanpa
// komentar ini, pembaca berikutnya akan mengira ada salah ketik dan
// "memperbaikinya" jadi angka yang masuk akal — dan trussnya diam-diam berubah
// jadi portal, dengan momen yang seharusnya tak ada.
//
// ── Kenapa 1e-6 dan bukan lebih besar (DIUKUR, bukan ditebak)
// Risiko I terlalu kecil adalah matriks yang ill-conditioned: `selesaikan`
// melempar "singular" untuk struktur yang sebenarnya stabil. Itu diukur pada
// kasus segitiga (P=20, L=4, θ=45°, A=2000 mm², E=200.000 MPa) sebelum dipaku:
//
//   I = 1e-6 → 14,142136 kN  (simpangan 0,00000% terhadap P/(2 sin θ))
//   I = 1e-3 → 14,142136 kN  (0,00000%)
//   I = 1e-2 → 14,142136 kN  (0,00000%)
//   I = 1e+0 → 14,142136 kN  (0,00000%)
//   I = 1e+2 → 14,142135 kN  (0,00001%)
//   I = 1e+4 → 14,142055 kN  (0,00057%)
//
// 1e-6 tidak melempar dan tidak menyimpang — jadi tak ada alasan menaikkannya.
// Yang perlu dicatat justru arah sebaliknya: makin BESAR I, makin jauh dari
// jawaban truss, karena lentur mulai ikut memikul. Kalau suatu hari angka ini
// perlu dinaikkan (geometri lain, batang jauh lebih panjang), ukur lagi tabel
// di atas — simpangannya wajib tetap < 0,1% terhadap P/(2 sin θ).

import {
  analisaRangka2D,
  type Simpul,
  type BatangModel,
  type BebanTitik,
} from './rangka-model.js'

/** Modulus elastis bawaan: baja struktural, 200.000 MPa. */
const E_BAJA_MPA = 200_000

/**
 * Inersia semu batang truss, mm⁴. Lihat penjelasan panjang di header berkas:
 * ini cara membuat sambungan SENDI di solver yang aslinya memodelkan portal,
 * bukan sifat penampang yang sesungguhnya.
 */
const I_TRUSS_MM4 = 1e-6

export interface SimpulTruss {
  nama: string
  xM: number
  yM: number
  /** Tanpa `tumpuan` = simpul bebas (buhul di dalam rangka). */
  tumpuan?: 'sendi' | 'rol-x'
}

export interface BatangTruss {
  nama: string
  /** Indeks simpul awal di `simpul`. */
  dari: number
  /** Indeks simpul akhir. */
  ke: number
  aMm2: number
}

export interface BebanTruss {
  /** Indeks simpul di `simpul`. */
  simpul: number
  /** Gaya arah Y global, kN. NEGATIF = ke bawah (gravitasi). */
  fyKn: number
}

export interface InputTruss {
  simpul: SimpulTruss[]
  batang: BatangTruss[]
  beban: BebanTruss[]
  /** Modulus elastis, MPa. Bawaan 200.000 (baja). */
  eMpa?: number
}

export interface HasilBatangTruss {
  nama: string
  /** Gaya aksial, kN. NEGATIF = tekan, POSITIF = tarik. */
  gayaKn: number
  arah: 'tarik' | 'tekan'
}

export interface HasilTruss {
  batang: HasilBatangTruss[]
  catatan: string[]
}

const CATATAN_TRUSS =
  'Sambungan dianggap SENDI sempurna; momen sekunder akibat kekakuan '
  + 'sambungan nyata tak ditinjau.'

/*
  ⚠ `analisaRangka2D` selalu menyertakan catatan 'Sambungan dianggap kaku
  sempurna' — benar untuk portal, SALAH untuk truss. Kalau catatan itu ikut
  terbawa apa adanya, hasil truss membawa DUA pernyataan yang bertentangan
  (kaku sempurna DAN sendi sempurna) di layar yang sama, dan pembacanya tak
  punya cara tahu mana yang berlaku. Karena itu ia disaring keluar, bukan
  sekadar ditimpa catatan baru di bawahnya.
*/
const POLA_CATATAN_KAKU = /kaku sempurna/i

/**
 * Analisis rangka batang bidang.
 *
 * Memulangkan `gayaKn` tiap batang — angka yang selama ini harus DIISI SENDIRI
 * pemakai `analisaRangka()` di `struktur-baja-rangka.ts` sebagai masukan.
 *
 * @throws bila geometri tak masuk akal atau truss LABIL (tumpuan kurang).
 *   Diteruskan apa adanya dari `analisaRangka2D`: penyelesai yang memulangkan
 *   angka raksasa memberi sesuatu yang TERLIHAT seperti hasil, dan angka itu
 *   akan dipakai memilih profil baja tanpa satu pun galat.
 */
export function analisaTruss(input: InputTruss): HasilTruss {
  const eMpa = input.eMpa ?? E_BAJA_MPA

  if (input.simpul.length < 2) {
    throw new Error(`Truss butuh minimal 2 simpul (diterima: ${input.simpul.length})`)
  }
  if (input.batang.length < 1) {
    throw new Error('Truss butuh minimal 1 batang')
  }

  const simpul: Simpul[] = input.simpul.map((s) => ({
    nama: s.nama,
    xM: s.xM,
    yM: s.yM,
    // Buhul dalam tak punya tumpuan; `analisaRangka2D` menuntut nilai eksplisit.
    tumpuan: s.tumpuan ?? 'bebas',
  }))

  const batang: BatangModel[] = input.batang.map((b) => {
    if (!(b.aMm2 > 0)) {
      throw new Error(`Batang ${b.nama}: luas penampang harus > 0 (diterima: ${b.aMm2})`)
    }
    return {
      nama: b.nama,
      dari: b.dari,
      ke: b.ke,
      eMpa,
      aMm2: b.aMm2,
      iMm4: I_TRUSS_MM4,
      // Tanpa `qKnM`: truss hanya dibebani DI BUHUL. Beban merata di tengah
      // batang menimbulkan lentur, dan batang truss tak dimodelkan untuk itu.
    }
  })

  const beban: BebanTitik[] = input.beban.map((p) => ({
    simpul: p.simpul,
    fyKn: p.fyKn,
  }))

  const hasil = analisaRangka2D(simpul, batang, beban)

  return {
    batang: hasil.batang.map((b) => ({
      nama: b.nama,
      gayaKn: b.aksialKn,
      /*
        KONVENSI ARAH — mengikuti `HasilBatang.aksialKn` di `rangka-model.ts`:
        NEGATIF = tekan, POSITIF = tarik.

        Ini bukan detail kosmetik. Batang TEKAN dibatasi TEKUK (kapasitasnya
        turun drastis dengan kelangsingan); batang TARIK tidak. Menukar
        keduanya membuat batang tekuk lolos pemeriksaan yang salah — dan
        kesalahan itu tak menimbulkan galat apa pun, ia menunggu sampai beban
        penuh datang. Dibuktikan lewat mutasi wajib Task 6.

        Nol dimasukkan ke 'tarik' dengan sengaja: batang tanpa gaya tak perlu
        diperiksa tekuk, dan memberinya 'tekan' hanya menambah peringatan palsu.
      */
      arah: b.aksialKn < 0 ? 'tekan' : 'tarik',
    })),
    catatan: [
      ...hasil.catatan.filter((c) => !POLA_CATATAN_KAKU.test(c)),
      CATATAN_TRUSS,
    ],
  }
}

// Mesin rekomendasi tulangan — mengusulkan pembesian, bukan memeriksanya.
// PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Sampai hari ini seluruh modul struktur di repo ini bekerja SATU ARAH:
//
//     user isi Ø16, 3 batang, sengkang Ø8-150  →  kami jawab AMAN / TIDAK
//
// Itu pemeriksa, dan pemeriksa hanya berguna bagi orang yang sudah punya
// jawabannya. Yang bertanya "balok 25/40 bentang 4 m kuat nggak, besinya
// berapa?" tidak punya jawaban itu — dan justru dialah mayoritas pemakainya:
// pelaksana lapangan, estimator, engineer muda yang sedang menaksir dimensi.
//
// Berkas ini membalik arahnya:
//
//     user isi dimensi + beban  →  kami usulkan Ø16, 3 batang, sengkang Ø8-150
//
// ── YANG PALING PENTING: berkas ini TIDAK MENGHITUNG STRUKTUR
//
// Tak ada satu pun rumus SNI di sini. Yang dilakukan hanya: susun kandidat →
// panggil `analisaBalok`/`analisaKolom` yang sudah ada → saring yang aman →
// pilih yang paling hemat.
//
// Itu keputusan sengaja, dan alasannya keras. Kalau berkas ini menghitung
// ulang φMn sendiri, repo ini punya DUA sumber kebenaran untuk kapasitas
// lentur — dan dua implementasi yang menyimpang tidak mengeluarkan galat:
// pemeriksa bilang AMAN, mesin saran bilang AMAN, tapi keduanya memakai angka
// berbeda. Ini pola cacat yang sama persis dengan yang dijaga
// `audit-takeoff-kembar-sepakat.mjs`, dan cara paling murah menutupnya adalah
// tidak pernah membuat kembarannya.
//
// Konsekuensinya juga menguntungkan: tiap perbaikan pada pemeriksa langsung
// dipakai mesin saran, tanpa disentuh. Termasuk ρmin/ρmax — keduanya sudah
// jadi `Periksa` di `analisaBalok`, jadi kandidat yang melanggarnya tersaring
// dengan sendirinya. Mesin ini tidak perlu tahu SNI 2847 §9.6 sama sekali.
//
// ── BATAS TANGGUNG JAWAB
//
// Usulan di sini adalah ESTIMASI AWAL, bukan gambar kerja bertanda tangan.
// Ia mewarisi seluruh batas `analisaBalok`/`analisaKolom` — antara lain:
// tulangan tarik saja (tanpa tulangan tekan), tanpa torsi, tanpa kontrol
// lendutan, kolom uniaksial. Batas-batas itu ikut dibawa di `catatan` hasil,
// bukan didiamkan.
//
// Momen dan geser terfaktor (Mu, Vu) tetap MASUKAN. Menghitungnya butuh
// analisa portal, dan itu pekerjaan lain yang belum ada di repo ini.
// ══════════════════════════════════════════════════════════════════════════════

import {
  analisaBalok,
  analisaKolom,
  type MutuBahan,
  type HasilElemen,
} from './struktur-beton.js'
import {
  analisaBebanBalok,
  type InputBebanBalok,
  type HasilBebanBalok,
} from './struktur-beban-balok.js'

// ── Ruang pencarian ──────────────────────────────────────────────────────────

/**
 * Diameter tulangan yang BENAR-BENAR DIJUAL di Indonesia, mm.
 *
 * Bukan daftar bebas. Besi Ø14 dan Ø18 tidak beredar sebagai barang standar,
 * dan usulan yang tak bisa dibeli tak berguna sebagai usulan — ia hanya
 * memindahkan pekerjaan mencari padanan ke orang di toko besi.
 *
 * Ø10 sengaja IKUT meski jarang jadi tulangan utama balok: ia tulangan utama
 * yang wajar untuk pelat dan elemen kecil, dan membuangnya membuat mesin
 * mengusulkan besi lebih besar dari yang perlu pada beban ringan.
 */
export const DIAMETER_PASAR = [10, 13, 16, 19, 22, 25] as const

/** Diameter sengkang yang lazim. Sengkang Ø19+ tak dipakai di gedung biasa. */
export const DIAMETER_SENGKANG = [8, 10, 13] as const

/**
 * Jarak sengkang yang dicoba, mm — kelipatan 25 supaya bisa dilaksanakan.
 *
 * Tukang memasang sengkang dengan meteran, bukan kaliper. Jarak 137 mm yang
 * "optimal" secara hitungan akan dipasang jadi 140 atau 135 di lapangan —
 * jadi mengusulkannya berarti mengusulkan sesuatu yang tak akan terjadi.
 *
 * Batas atas 250 mm: di atas itu sengkang terlalu renggang untuk mengekang
 * tulangan utama, dan pemeriksa memang akan menolaknya lewat pemeriksaan
 * geser — tapi mencobanya pun sia-sia.
 */
export const JARAK_SENGKANG = [100, 125, 150, 175, 200, 225, 250] as const

/**
 * Rasio kritis tertinggi yang masih dianggap menyisakan cadangan.
 *
 * ── Kenapa ambang ini ADA (dan kenapa "paling hemat" saja tidak cukup)
 *
 * Meminimalkan kg tanpa syarat lain SELALU memenangkan kandidat yang pas-pasan
 * lolos — tiap gram cadangan membuat sebuah kandidat kalah hemat. Diukur pada
 * balok 300×520 sebelum ambang ini ada, enam kombinasi beban berturut-turut
 * terpilih di rasio: 0.94 · 0.94 · 0.95 · 0.96 · 0.96 · 0.99.
 *
 * Semuanya sah menurut SNI. Semuanya juga buruk sebagai rekayasa: beban
 * rencana bergeser sepanjang umur bangunan — dinding dipindah, finishing
 * diganti granit, atap ditambah tandon — dan elemen yang dirancang di 0.99
 * melewati batas tanpa satu pun gejala.
 *
 * 0.90 dipilih karena menyisakan ±10% ruang, cukup untuk perubahan lazim,
 * dan pada pengukuran hanya menambah besi beberapa persen.
 *
 * ⚠ Ini KENYAMANAN, bukan keamanan. Kalau tak ada kandidat di bawah ambang
 * ini, mesin TETAP mengusulkan yang aman menurut SNI dan menyatakan bahwa
 * cadangannya tipis. Menolak mengusulkan apa pun akan mendorong pemakainya
 * mencari angka dari tempat lain yang tak diperiksa siapa-siapa.
 */
export const BATAS_RASIO_NYAMAN = 0.90

/**
 * Batas jumlah tulangan tarik yang dicoba dalam satu lapis.
 *
 * Maksimum 6, bukan 10. Batang tipis berjumlah banyak menang secara berat
 * (7D10 = 49.8 kg pernah mengalahkan 4D13) tetapi kalah di segala hal lain:
 * lebih banyak titik ikat, celah antar batang lebih sempit sehingga agregat
 * beton sulit lewat, dan lebih banyak peluang salah pasang. Yang dihemat
 * beberapa kilogram; yang dibayar adalah mutu pengecoran.
 */
const N_TARIK_MIN = 2
const N_TARIK_MAKS = 6

/** Batas baris tulangan kolom per sisi (bertulangan simetris). */
const N_BARIS_MIN = 2
const N_BARIS_MAKS = 5

/** Kenaikan tinggi yang dicoba saat mencari dimensi minimum, mm. */
const LANGKAH_TINGGI_MM = 50
/** Sejauh mana tinggi boleh dinaikkan saat mencari usul dimensi, mm. */
const BATAS_TAMBAH_TINGGI_MM = 400

/** Berapa alternatif ikut dilaporkan selain yang terpilih. */
const JUMLAH_ALTERNATIF = 3

// ── Bentuk masukan ───────────────────────────────────────────────────────────

/** Balok — TANPA tulangan. Itulah yang membedakannya dari `InputBalok`. */
export interface InputSaranBalok {
  bMm: number
  hMm: number
  panjangM: number
  selimutMm: number
  mutu: MutuBahan
  /** Momen terfaktor rencana, kNm. */
  muKnm: number
  /** Gaya geser terfaktor rencana, kN. */
  vuKn: number
  /** Jumlah elemen identik. Default 1. */
  jumlah?: number
}

/** Kolom — TANPA tulangan. */
export interface InputSaranKolom {
  bMm: number
  hMm: number
  tinggiM: number
  selimutMm: number
  mutu: MutuBahan
  /** Beban aksial terfaktor, kN. */
  puKn: number
  /** Momen terfaktor, kNm. */
  muKnm: number
  jumlah?: number
}

// ── Bentuk keluaran ──────────────────────────────────────────────────────────

/** Satu usulan pembesian balok, lengkap dengan bukti kelayakannya. */
export interface UsulanBalok {
  dUtamaMm: number
  nTarik: number
  dSengkangMm: number
  jarakSengkangMm: number
  /** Berat besi elemen ini, kg — dasar pemilihan "paling hemat". */
  besiKg: number
  /**
   * Rasio tuntutan/kapasitas TERTINGGI di antara seluruh pemeriksaan.
   *
   * Ikut dibawa karena "aman" saja tak cukup untuk memilih: usulan dengan
   * rasio 0.98 dan 0.62 sama-sama lolos, tapi yang pertama tak menyisakan
   * ruang sama sekali untuk perubahan beban di lapangan.
   */
  rasioKritis: number
  /** Nama pemeriksaan yang paling mepet — supaya rasio di atas bisa ditanya. */
  pemeriksaanKritis: string
}

/** Satu usulan pembesian kolom (bertulangan simetris). */
export interface UsulanKolom {
  dUtamaMm: number
  nBarisX: number
  nBarisY: number
  /** Jumlah batang total pada penampang — turunan, dibawa supaya tak dihitung ulang pembacanya. */
  nTotal: number
  dSengkangMm: number
  jarakSengkangMm: number
  besiKg: number
  rasioKritis: number
  pemeriksaanKritis: string
}

export interface HasilSaran<T> {
  /** true bila ada kombinasi yang lolos SELURUH pemeriksaan. */
  berhasil: boolean
  /** Usulan terbaik. `undefined` bila tak ada yang lolos — jangan ditebak. */
  terpilih?: T
  /** Usulan lain yang juga lolos, diurut dari yang paling hemat. */
  alternatif: T[]
  /**
   * Tinggi minimum yang membuat elemen ini bisa dibesi, mm.
   *
   * Hanya terisi saat `berhasil === false`, dan hanya bila pencarian
   * menemukannya. Nilainya SUDAH DIBUKTIKAN: mesin menjalankan ulang
   * pencarian pada tinggi itu dan memastikannya lolos, bukan menaksir.
   */
  usulTinggiMm?: number
  /** Berapa kombinasi yang dicoba — supaya hasil "tak ada" bisa dipercaya. */
  kandidatDicoba: number
  /** Asumsi, batas, dan sebab kegagalan. WAJIB ikut terbaca bersama angkanya. */
  catatan: string[]
}

// ── Helper ───────────────────────────────────────────────────────────────────


function bilanganPositif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

function bilanganTakNegatif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v < 0) {
    throw new Error(`${nama} harus angka >= 0 (diterima: ${v})`)
  }
}

/**
 * Ambil pemeriksaan paling mepet dari hasil analisa.
 *
 * Dipakai dua kali: menandai rasio kritis usulan yang lolos, dan menyebut
 * sebab kegagalan saat tak ada yang lolos. Keduanya butuh jawaban yang sama —
 * "pemeriksaan mana yang paling menentukan di sini?"
 */
function palingMepet(hasil: HasilElemen): { nama: string; rasio: number } {
  let nama = '—'
  let rasio = 0
  for (const p of hasil.periksa) {
    // Infinity muncul saat kapasitas nol; ia tetap "paling mepet" yang sah.
    if (p.rasio > rasio) {
      rasio = p.rasio
      nama = p.nama
    }
  }
  return { nama, rasio }
}

/**
 * Apakah tulangan muat dalam satu lapis?
 *
 * Pemeriksa TIDAK memeriksa ini — ia menerima nTarik berapa pun dan menghitung
 * kapasitasnya. Jadi tanpa saringan di sini, mesin bisa mengusulkan 10 batang
 * D25 pada balok selebar 250 mm: aman di atas kertas, mustahil dirakit.
 *
 * Jarak bersih antar tulangan minimal 25 mm (SNI 2847 §25.2.1), diambil
 * sebagai max(25, db) — pada db besar, jarak bersih mengikuti diameternya.
 */
function muatSatuLapis(
  bMm: number, selimutMm: number, dSengkangMm: number,
  dUtamaMm: number, n: number,
): boolean {
  if (n < 2) return false
  const lebarBersih = bMm - 2 * selimutMm - 2 * dSengkangMm
  const jarakBersihMin = Math.max(25, dUtamaMm)
  const perlu = n * dUtamaMm + (n - 1) * jarakBersihMin
  return perlu <= lebarBersih
}

/**
 * Urutan pemenang: paling hemat besi, lalu diameter terkecil.
 *
 * Kriteria kedua bukan hiasan. Dua kombinasi bisa berselisih berat < 1%
 * (mis. 4D16 vs 3D19); yang berdiameter lebih kecil lebih mudah dibengkokkan
 * dan lebih toleran terhadap kesalahan penempatan. Tanpa kriteria kedua,
 * pemenang ditentukan urutan pencarian — yang berarti berubah diam-diam
 * setiap kali daftar kandidat disusun ulang.
 */
function bandingkanHemat<T extends { besiKg: number; dUtamaMm: number }>(a: T, b: T): number {
  if (Math.abs(a.besiKg - b.besiKg) > 1e-9) return a.besiKg - b.besiKg
  return a.dUtamaMm - b.dUtamaMm
}

/**
 * Urutkan: yang bercadangan lebih dulu, masing-masing dari yang paling hemat.
 *
 * Dua lapis, bukan satu rumus gabungan. Rumus gabungan (mis. skor =
 * kg × rasio) akan membuat kandidat berbahaya bisa menang dengan cukup hemat,
 * dan membuat alasan kemenangan tak bisa dijelaskan ke pemakainya. Dua lapis
 * tetap bisa dibaca: "yang ini menang karena bercadangan DAN paling ringan
 * di antara yang bercadangan".
 *
 * Yang TIDAK dilakukan: membuang kandidat mepet. Semuanya tetap dibawa —
 * hanya urutannya yang berubah — supaya elemen yang memang mustahil diberi
 * cadangan tetap dapat usulan, bukan jalan buntu.
 */
function urutkanPilihan<T extends { besiKg: number; dUtamaMm: number; rasioKritis: number }>(
  kandidat: T[],
): T[] {
  const bercadangan = kandidat.filter((k) => k.rasioKritis <= BATAS_RASIO_NYAMAN).sort(bandingkanHemat)
  const mepet = kandidat.filter((k) => k.rasioKritis > BATAS_RASIO_NYAMAN).sort(bandingkanHemat)
  return [...bercadangan, ...mepet]
}

/** Batas yang diwarisi dari pemeriksa — ikut dibawa ke tiap hasil. */
const CATATAN_BATAS_BALOK = [
  'Usulan ini ESTIMASI AWAL, bukan pengganti gambar kerja bertanda tangan insinyur.',
  'Kapasitas lentur dihitung sebagai balok bertulangan TARIK saja; tulangan atas tidak menambah kapasitas.',
  'Torsi dan kontrol lendutan BELUM diperiksa.',
  'Berat besi belum termasuk panjang penyaluran, kait, dan sambungan lewatan — pakai BBS untuk tonase belanja.',
]

const CATATAN_BATAS_KOLOM = [
  'Usulan ini ESTIMASI AWAL, bukan pengganti gambar kerja bertanda tangan insinyur.',
  'Kolom diperiksa terhadap momen UNIAKSIAL; momen biaksial belum ditinjau.',
  'Berat besi belum termasuk panjang penyaluran, kait, dan sambungan lewatan — pakai BBS untuk tonase belanja.',
]

// ── BALOK ────────────────────────────────────────────────────────────────────

/**
 * Usulkan pembesian balok dari dimensi & beban.
 *
 * Menyusun kandidat (Ø utama × jumlah × Ø sengkang × jarak), menjalankan
 * masing-masing lewat `analisaBalok`, menyaring yang SELURUH pemeriksaannya
 * aman, lalu memilih yang paling hemat besi.
 *
 * Kandidat yang membuat pemeriksa melempar galat (mis. selimut + tulangan
 * melebihi tinggi balok) diperlakukan sebagai TIDAK LOLOS, bukan sebagai
 * kerusakan — geometri yang mustahil memang salah satu bentuk kegagalan yang
 * sedang dicari.
 */
export function sarankanBalok(input: InputSaranBalok): HasilSaran<UsulanBalok> {
  bilanganPositif('b', input.bMm)
  bilanganPositif('h', input.hMm)
  bilanganPositif('panjang', input.panjangM)
  bilanganPositif('selimut', input.selimutMm)
  bilanganPositif("f'c", input.mutu.fcMpa)
  bilanganPositif('fy', input.mutu.fyMpa)
  bilanganTakNegatif('Mu', input.muKnm)
  bilanganTakNegatif('Vu', input.vuKn)

  const { lolos, dicoba, terdekat } = cariKandidatBalok(input)

  const catatan: string[] = []
  if (lolos.length > 0) {
    const terpilih = lolos[0]!
    if (terpilih.rasioKritis > BATAS_RASIO_NYAMAN) {
      catatan.push(
        `Cadangan TIPIS: usulan terpilih memakai ${(terpilih.rasioKritis * 100).toFixed(0)}% `
        + `kapasitas pada "${terpilih.pemeriksaanKritis}". Aman menurut SNI, tetapi tak ada `
        + 'kombinasi lain yang menyisakan ruang — pertimbangkan memperbesar dimensi.',
      )
    }
    catatan.push(...CATATAN_BATAS_BALOK)
    return {
      berhasil: true,
      terpilih,
      alternatif: lolos.slice(1, 1 + JUMLAH_ALTERNATIF),
      kandidatDicoba: dicoba,
      catatan,
    }
  }

  // ── Tak ada yang lolos: sebutkan SEBABNYA, lalu cari dimensi yang bisa.
  if (terdekat) {
    catatan.push(
      `Tak ada kombinasi tulangan yang cukup untuk balok ${input.bMm}×${input.hMm} mm `
      + `dengan Mu=${input.muKnm} kNm dan Vu=${input.vuKn} kN.`,
      `Yang paling mendekati pun masih gagal pada "${terdekat.nama}" `
      + `(rasio ${terdekat.rasio.toFixed(2)}; aman bila ≤ 1.00).`,
    )
  } else {
    catatan.push(
      `Tak ada kombinasi tulangan yang bisa dirakit pada balok ${input.bMm}×${input.hMm} mm — `
      + 'periksa lebar, selimut, dan tinggi penampang.',
    )
  }

  const usulTinggiMm = cariTinggiMinimumBalok(input)
  if (usulTinggiMm) {
    catatan.push(
      `Dengan lebar ${input.bMm} mm tetap, tinggi minimum yang bisa dibesi adalah `
      + `${usulTinggiMm} mm (sudah diuji, bukan taksiran).`,
    )
  } else {
    catatan.push(
      `Menaikkan tinggi sampai ${input.hMm + BATAS_TAMBAH_TINGGI_MM} mm pun belum cukup — `
      + 'perbesar lebar penampang, naikkan mutu beton, atau kurangi bentang.',
    )
  }
  catatan.push(...CATATAN_BATAS_BALOK)

  return { berhasil: false, alternatif: [], usulTinggiMm, kandidatDicoba: dicoba, catatan }
}

/** Pencarian inti balok — dipakai juga oleh pencari tinggi minimum. */
function cariKandidatBalok(input: InputSaranBalok): {
  lolos: UsulanBalok[]
  dicoba: number
  terdekat?: { nama: string; rasio: number }
} {
  const lolos: UsulanBalok[] = []
  let dicoba = 0
  let terdekat: { nama: string; rasio: number } | undefined

  for (const dUtamaMm of DIAMETER_PASAR) {
    for (let nTarik = N_TARIK_MIN; nTarik <= N_TARIK_MAKS; nTarik++) {
      for (const dSengkangMm of DIAMETER_SENGKANG) {
        // Sengkang tak boleh lebih besar dari tulangan utama — tak lazim
        // dan tak dijual sebagai rakitan.
        if (dSengkangMm > dUtamaMm) continue
        if (!muatSatuLapis(input.bMm, input.selimutMm, dSengkangMm, dUtamaMm, nTarik)) continue

        for (const jarakSengkangMm of JARAK_SENGKANG) {
          dicoba++
          let hasil: HasilElemen
          try {
            hasil = analisaBalok({
              bMm: input.bMm, hMm: input.hMm, panjangM: input.panjangM,
              selimutMm: input.selimutMm, mutu: input.mutu,
              muKnm: input.muKnm, vuKn: input.vuKn,
              dUtamaMm, nTarik, dSengkangMm, jarakSengkangMm,
              jumlah: input.jumlah,
            })
          } catch {
            // Geometri mustahil (mis. d efektif <= 0) = tidak lolos, bukan crash.
            continue
          }

          const mepet = palingMepet(hasil)
          if (!hasil.aman) {
            if (!terdekat || mepet.rasio < terdekat.rasio) terdekat = mepet
            continue
          }

          lolos.push({
            dUtamaMm, nTarik, dSengkangMm, jarakSengkangMm,
            besiKg: hasil.volume.besiTotalKg,
            rasioKritis: mepet.rasio,
            pemeriksaanKritis: mepet.nama,
          })
        }
      }
    }
  }

  const urut = urutkanPilihan(lolos)
  return { lolos: urut, dicoba, terdekat }
}

/**
 * Cari tinggi minimum yang membuat balok bisa dibesi.
 *
 * Menaikkan h bertahap dan MENJALANKAN pencarian penuh di tiap langkah —
 * bukan menaksir dari rasio. Alasannya: rasio lentur tidak berubah linear
 * terhadap h (d efektif masuk ke lengan momen), jadi ekstrapolasi dari satu
 * rasio akan meleset, dan usul dimensi yang meleset lebih buruk daripada
 * tak ada usul: ia terlihat seperti jawaban.
 */
function cariTinggiMinimumBalok(input: InputSaranBalok): number | undefined {
  for (
    let tambah = LANGKAH_TINGGI_MM;
    tambah <= BATAS_TAMBAH_TINGGI_MM;
    tambah += LANGKAH_TINGGI_MM
  ) {
    const hMm = input.hMm + tambah
    const { lolos } = cariKandidatBalok({ ...input, hMm })
    if (lolos.length > 0) return hMm
  }
  return undefined
}

// ── KOLOM ────────────────────────────────────────────────────────────────────

/**
 * Usulkan pembesian kolom bertulangan simetris dari dimensi & beban.
 *
 * Kolom disusun sebagai kisi nBarisX × nBarisY dengan tulangan di keliling —
 * itulah bentuk yang diterima `analisaKolom`, dan itu pula yang dirakit di
 * lapangan. Karena simetris, mesin hanya mencari kombinasi baris, bukan
 * penempatan batang satu per satu.
 */
export function sarankanKolom(input: InputSaranKolom): HasilSaran<UsulanKolom> {
  bilanganPositif('b', input.bMm)
  bilanganPositif('h', input.hMm)
  bilanganPositif('tinggi', input.tinggiM)
  bilanganPositif('selimut', input.selimutMm)
  bilanganPositif("f'c", input.mutu.fcMpa)
  bilanganPositif('fy', input.mutu.fyMpa)
  bilanganTakNegatif('Pu', input.puKn)
  bilanganTakNegatif('Mu', input.muKnm)

  const lolos: UsulanKolom[] = []
  let dicoba = 0
  let terdekat: { nama: string; rasio: number } | undefined

  for (const dUtamaMm of DIAMETER_PASAR) {
    // Tulangan utama kolom < Ø13 tak lazim dan tak memenuhi praktik umum.
    if (dUtamaMm < 13) continue

    for (let nBarisX = N_BARIS_MIN; nBarisX <= N_BARIS_MAKS; nBarisX++) {
      for (let nBarisY = N_BARIS_MIN; nBarisY <= N_BARIS_MAKS; nBarisY++) {
        for (const dSengkangMm of DIAMETER_SENGKANG) {
          if (dSengkangMm > dUtamaMm) continue
          // Batang di tiap sisi harus muat — diperiksa untuk kedua arah.
          if (!muatSatuLapis(input.hMm, input.selimutMm, dSengkangMm, dUtamaMm, nBarisX)) continue
          if (!muatSatuLapis(input.bMm, input.selimutMm, dSengkangMm, dUtamaMm, nBarisY)) continue

          for (const jarakSengkangMm of JARAK_SENGKANG) {
            dicoba++
            let hasil: HasilElemen
            try {
              hasil = analisaKolom({
                bMm: input.bMm, hMm: input.hMm, tinggiM: input.tinggiM,
                selimutMm: input.selimutMm, mutu: input.mutu,
                puKn: input.puKn, muKnm: input.muKnm,
                dUtamaMm, nBarisX, nBarisY, dSengkangMm, jarakSengkangMm,
                jumlah: input.jumlah,
              })
            } catch {
              continue
            }

            const mepet = palingMepet(hasil)
            if (!hasil.aman) {
              if (!terdekat || mepet.rasio < terdekat.rasio) terdekat = mepet
              continue
            }

            // Tulangan keliling: total = 2·(X + Y) − 4 sudut yang terhitung dua kali.
            const nTotal = 2 * (nBarisX + nBarisY) - 4
            lolos.push({
              dUtamaMm, nBarisX, nBarisY, nTotal, dSengkangMm, jarakSengkangMm,
              besiKg: hasil.volume.besiTotalKg,
              rasioKritis: mepet.rasio,
              pemeriksaanKritis: mepet.nama,
            })
          }
        }
      }
    }
  }

  const urut = urutkanPilihan(lolos)

  const catatan: string[] = []
  if (urut.length > 0) {
    const terpilih = urut[0]!
    if (terpilih.rasioKritis > BATAS_RASIO_NYAMAN) {
      catatan.push(
        `Cadangan TIPIS: usulan terpilih memakai ${(terpilih.rasioKritis * 100).toFixed(0)}% `
        + `kapasitas pada "${terpilih.pemeriksaanKritis}". Aman menurut SNI, tetapi tak ada `
        + 'kombinasi lain yang menyisakan ruang — pertimbangkan memperbesar penampang kolom.',
      )
    }
    catatan.push(...CATATAN_BATAS_KOLOM)
    return {
      berhasil: true,
      terpilih,
      alternatif: urut.slice(1, 1 + JUMLAH_ALTERNATIF),
      kandidatDicoba: dicoba,
      catatan,
    }
  }

  if (terdekat) {
    catatan.push(
      `Tak ada kombinasi tulangan yang cukup untuk kolom ${input.bMm}×${input.hMm} mm `
      + `dengan Pu=${input.puKn} kN dan Mu=${input.muKnm} kNm.`,
      `Yang paling mendekati pun masih gagal pada "${terdekat.nama}" `
      + `(rasio ${terdekat.rasio.toFixed(2)}; aman bila ≤ 1.00).`,
      'Perbesar penampang kolom atau naikkan mutu beton.',
    )
  } else {
    catatan.push(
      `Tak ada kombinasi tulangan yang bisa dirakit pada kolom ${input.bMm}×${input.hMm} mm — `
      + 'penampang terlalu kecil untuk selimut dan tulangan yang dipersyaratkan.',
    )
  }
  catatan.push(...CATATAN_BATAS_KOLOM)

  return { berhasil: false, alternatif: [], kandidatDicoba: dicoba, catatan }
}

// ── DARI BEBAN ───────────────────────────────────────────────────────────────
//
// Semua di atas menerima Mu/Vu sebagai ANGKA JADI. Bagian ini menutup celah
// terakhir: menghitungnya dari beban lebih dulu, lalu mengusulkan tulangannya.
//
// Kenapa ini penting — alasannya sudah ditulis `struktur-beban-balok.ts` dan
// layak diulang di sini karena berlaku dua kali lipat untuk mesin saran:
//
//     "Dimensi yang salah ketik terlihat (balok 3000 mm jelas keliru). Momen
//      yang salah TIDAK: 120 kNm dan 210 kNm sama-sama terlihat wajar."
//
// Mesin saran memperbesar akibatnya. Pemeriksa yang diberi momen salah menjawab
// "aman" untuk balok yang tak kuat — satu kesalahan. Mesin saran yang diberi
// momen salah MENGUSULKAN tulangan untuk balok yang tak kuat, dan usulan
// terbaca sebagai jawaban resmi, bukan sebagai sesuatu yang perlu diperiksa.

/** Beban balok — bentuk yang sama dengan `InputBebanBalok`, tanpa dimensinya. */
export type BebanBalok = Omit<InputBebanBalok, 'bMm' | 'hMm'>

export interface InputSaranDariBeban {
  bMm: number
  hMm: number
  panjangM: number
  selimutMm: number
  mutu: MutuBahan
  /** Beban — dari katalog SNI 1727, bukan angka ingatan. */
  beban: BebanBalok
  jumlah?: number
}

export interface HasilSaranDariBeban extends HasilSaran<UsulanBalok> {
  /**
   * Beban yang DIPAKAI, apa adanya dari `analisaBebanBalok`.
   *
   * WAJIB ditampilkan pemanggil, tidak boleh sekadar dipakai diam-diam.
   * Pemakai yang tak pernah melihat "Mu = 120 kNm" tak punya kesempatan
   * berkata "kok kecil sekali untuk bentang segitu" — dan itu satu-satunya
   * pemeriksaan yang tersisa, karena momen salah tak menimbulkan galat.
   */
  beban: HasilBebanBalok
}

/**
 * Usulkan pembesian balok DARI BEBAN — Mu/Vu dihitung, bukan diminta.
 *
 * ⚠ TIDAK menghitung ulang apa pun. Mu dan Vu datang utuh dari
 * `analisaBebanBalok` dan diteruskan apa adanya ke `sarankanBalok`. Sekali
 * angkanya dibulatkan di sini "biar rapi di layar", yang tampil di layar dan
 * yang dipakai memilih tulangan menjadi dua angka berbeda — keduanya terlihat
 * wajar, keduanya konsisten sendiri, dan tak ada satu pun galat yang menunjuk
 * selisihnya. Dijaga test `struktur-saran-dari-beban.test.ts`.
 *
 * `catatan` menggabungkan batas KEDUA modul. Batas beban ("koefisien
 * perkiraan, bukan analisa rangka") sama pentingnya dengan batas tulangan:
 * tanpa itu pemakainya mengira angkanya lebih pasti daripada sebenarnya.
 */
export function sarankanBalokDariBeban(
  input: InputSaranDariBeban,
): HasilSaranDariBeban {
  // Modul beban memvalidasi masukannya sendiri dan MELEMPAR bila tak lengkap.
  // Galat itu sengaja TIDAK ditangkap: beban hidup yang hilang diam-diam
  // menjadi nol akan mengusulkan tulangan untuk balok yang tak memikul apa pun.
  const beban = analisaBebanBalok({
    ...input.beban,
    bMm: input.bMm,
    hMm: input.hMm,
  })

  const saran = sarankanBalok({
    bMm: input.bMm,
    hMm: input.hMm,
    panjangM: input.panjangM,
    selimutMm: input.selimutMm,
    mutu: input.mutu,
    muKnm: beban.muKnm,
    vuKn: beban.vuKn,
    ...(input.jumlah == null ? {} : { jumlah: input.jumlah }),
  })

  return {
    ...saran,
    beban,
    // Batas beban lebih dulu: ia menjelaskan DARI MANA angkanya, dan itu
    // yang perlu dibaca sebelum menilai usulannya.
    catatan: [...beban.catatan, ...saran.catatan],
  }
}

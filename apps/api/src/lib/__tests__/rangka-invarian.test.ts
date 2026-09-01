// apps/api/src/lib/__tests__/rangka-invarian.test.ts
//
// Test PROPERTI (bukan test contoh) untuk solver rangka 2D.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA — dan kenapa 45 test tangan tidak cukup
// ══════════════════════════════════════════════════════════════════════════════
//
// Test yang sudah ada memakai TUJUH kasus tangan, semuanya geometri jinak:
// bentang sama panjang, penampang seragam, beban merata, sebagian besar
// simetris. Kasus simetris adalah tempat kesalahan bersembunyi paling baik —
// di sana banyak suku yang salah SALING MENIADAKAN, dan hasilnya tetap benar
// karena alasan yang salah. Balik satu tanda di matriks rotasi: pada portal
// simetris berbeban gravitasi murni, sebagian besar angkanya tak bergerak.
//
// Yang diuji di sini bukan "apakah angka X sama dengan tabel Gere &
// Timoshenko", melainkan sifat yang berlaku untuk struktur APA PUN:
// KESEIMBANGAN. Struktur yang diam tidak boleh punya gaya sisa. Itu benar
// untuk geometri seburuk apa pun, dan karena itu ia bisa diuji atas ratusan
// kombinasi acak yang tak seorang pun sempat hitung tangan.
//
// Empat cacat modul ini yang semuanya LOLOS 45 test tangan (rumus satuan
// meleset 1000×, integrasi lendutan salah 1,6-22%, puncak momen terlewat
// jaring cuplikan, batas fisika terbalik) menunjukkan polanya: yang tak
// diperiksa TIDAK menimbulkan galat. Ia memulangkan angka yang terlihat wajar.
//
// ══════════════════════════════════════════════════════════════════════════════
// DUA LUBANG VERIFIKASI — SUDAH DITUTUP 2026-09-01
// ══════════════════════════════════════════════════════════════════════════════
//
// Versi pertama berkas ini harus MEREKONSTRUKSI gaya ujung batang, karena
// `analisaRangka2D` cuma memulangkan `HasilBatang[]`:
//
//     f[0] = −aksialKn              f[3] = −f[0]
//     f[1] = geserKn.di[0].nilai    f[4] = q·L − f[1]
//     f[2] = −momenKnm.di[0].nilai  f[5] = momenKnm.di[terakhir].nilai
//
// ⚠ TIGA DARI ENAM ITU DERIVASI, BUKAN LAPORAN.
//
// `f[3]`, `f[4]`, dan `f[5]` dihitung dari keseimbangan BATANG — dan
// keseimbangan batang itu sendiri adalah sifat bawaan `kLokal`, bukan hasil
// yang diukur (diukur: baris1+baris4 = 0 dan baris2+baris5+L·baris4 = 0 untuk
// keenam kolomnya, persis nol). Akibatnya cacat yang HANYA merusak ujung
// KEDUA batang lolos seluruh berkas ini tanpa satu pun galat: ujung kedua tak
// pernah dibaca, ia disimpulkan dari sesuatu yang selalu benar.
//
// Lubang kedua bukan cuma masalah test. Reaksi tumpuan tak bisa diminta sama
// sekali, jadi insinyur yang memeriksa hasil di layar juga tak bisa
// mencocokkan ΣFy tanpa menghitung ulang sendiri — dan yang tak bisa
// dicocokkan tak pernah diperiksa siapa pun.
//
// ── Yang berubah
// `analisaRangka2D` sekarang memulangkan `reaksi` (tiap simpul bertumpu, sumbu
// global) dan `gayaUjung` (enam angka LOKAL per batang, MENTAH). Berkas ini
// memakai keduanya apa adanya: ujung kedua DIBACA, reaksi DIBACA. Tak ada lagi
// yang disimpulkan dari keseimbangan yang bawaannya sudah benar.
//
// Ditutupnya lubang (1) DIBUKTIKAN lewat mutasi: `f[4]` dikalikan 1,01 —
// pelanggaran yang hanya menyentuh ujung kedua — memerahkan invarian simpul
// dan ΣFy. Pada versi rekonstruksi, mutasi yang sama tetap HIJAU.
//
// Yang tertangkap, dan tetap jadi alasan utama berkas ini ada:
//
//   • perakitan K global (peta DOF, penjumlahan sumbangan tiap batang)
//   • matriks rotasi Tᵀ·k·T dan arah pemakaiannya (T vs Tᵀ)
//   • konversi FEF lokal → global dan tandanya
//   • pembuangan baris/kolom DOF tertahan
//   • penyelesai Gauss
//   • gaya ujung KEDUA batang — sejak 2026-09-01

import { describe, it, expect } from 'vitest'
import {
  analisaRangka2D,
  type Simpul,
  type BatangModel,
  type BebanTitik,
} from '../rangka-model.js'
import { analisaBalokMenerus, analisaPortal } from '../rangka-portal.js'
import { analisaTruss, type InputTruss } from '../rangka-truss.js'

// ══════════════════════════════════════════════════════════════════════════════
// PEMBANGKIT ACAK BERBENIH — deterministik, wajib
// ══════════════════════════════════════════════════════════════════════════════

/*
  LCG (Numerical Recipes: a = 1664525, c = 1013904223, m = 2³²).

  ⚠ SENGAJA BUKAN `Math.random()`. Test properti yang gagal itu berguna hanya
  kalau bisa DIULANG: yang perlu diketahui dari kegagalan bukan "ada yang
  salah" melainkan "kasus ke-137 dengan benih 20260901 salah, ini angkanya".
  Dengan `Math.random()` kegagalan muncul sekali, hilang saat dijalankan ulang,
  dan berubah jadi test yang "kadang merah" — yang di akhirnya selalu dimatikan
  orang, bukan diperbaiki.

  LCG ini sengaja sederhana dan ditulis di sini, bukan diimpor: ia bagian dari
  ALAT UKUR, dan alat ukur yang bisa berubah di luar berkas ini membuat angka
  kasus gagal tak bisa dipercaya lintas versi.
*/
function bikinAcak(benih: number) {
  let s = benih >>> 0
  return {
    /** [0,1) */
    next(): number {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 0x1_0000_0000
    },
    /** Bilangan riil di [lo,hi). */
    riil(lo: number, hi: number): number {
      return lo + this.next() * (hi - lo)
    },
    /** Bilangan bulat di [lo,hi]. */
    bulat(lo: number, hi: number): number {
      return lo + Math.floor(this.next() * (hi - lo + 1))
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// REKONSTRUKSI GAYA UJUNG BATANG
// ══════════════════════════════════════════════════════════════════════════════

/** Gaya ujung batang di sumbu LOKAL: [N1, V1, M1, N2, V2, M2]. */
interface GayaUjung {
  lokal: number[]
  /** Gaya yang diberikan SIMPUL AWAL kepada batang, sumbu GLOBAL: [Fx, Fy, M]. */
  diAwal: { fx: number; fy: number; m: number }
  /** Gaya yang diberikan SIMPUL AKHIR kepada batang, sumbu GLOBAL. */
  diAkhir: { fx: number; fy: number; m: number }
}

/**
 * Memutar keenam gaya ujung LOKAL yang dipulangkan modul ke sumbu global.
 *
 * ⚠ `f` DIBACA APA ADANYA dari `hasil.gayaUjung`, TIDAK direkonstruksi.
 * Itulah perubahan yang menutup lubang (1) — lihat header berkas. Jangan
 * "menyederhanakan" ini kembali jadi turunan dari `HasilBatang`: yang hilang
 * bukan kerapian, melainkan kemampuan menangkap cacat di ujung kedua.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠ ARAH `f`: SIMPUL → BATANG, BUKAN SEBALIKNYA. DIUKUR, BUKAN DIBACA.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Komentar `gayaDalam` di `rangka-model.ts` pernah berbunyi *"`f` … adalah
 * gaya yang DIBERIKAN batang kepada simpul-simpulnya"*. Draf pertama berkas
 * ini mempercayainya, dan SELURUH pemeriksaan ΣFx/ΣFy/ΣM merah dengan sisa
 * relatif yang persis 2,0 — tanda khas tanda terbalik: reaksi yang seharusnya
 * +R terhitung −R, jadi ΣF = −R + beban = −2R.
 *
 * Yang benar diukur pada KANTILEVER jepit-kiri, q = 20 kN/m, L = 6 m:
 *
 *     gayaUjung[0].f[1]  =  +120 kN  =  +qL
 *
 * Reaksi tegak jepit kantilever adalah qL ke ATAS. Jadi `f[1]` bertanda sama
 * dengan reaksi tumpuan — ia gaya yang SIMPUL berikan kepada BATANG (yang
 * juga sama dengan geser internal di ujung awal). Yang batang berikan kepada
 * simpul adalah lawannya, −f.
 *
 * Akibatnya untuk aljabar keseimbangan simpul:
 *
 *     Σ(−f) + beban_luar + reaksi = 0
 *     → arah BEBAS   :  Σf = beban_luar          (sisanya harus nol)
 *     → arah TERTAHAN:  reaksi = Σf − beban_luar
 *
 * ── Kenapa ini ditulis panjang
 * Tanda terbalik di PEMERIKSA sama berbahayanya dengan tanda terbalik di
 * solver, dengan satu bedanya: ia merah, jadi ia ketahuan. Yang tak boleh
 * terjadi adalah "diperbaiki" dengan membalik tanda sampai hijau tanpa tahu
 * mana yang benar — itu menghasilkan pemeriksa yang hijau untuk solver yang
 * salah. Karena itu arahnya DIUKUR pada kasus yang jawabannya diketahui
 * (kantilever), bukan ditebak dari komentar.
 *
 * Memutarnya ke global memakai Tᵀ (transpos rotasi); momen tak ikut berputar —
 * rangka bidang, momen selalu terhadap sumbu Z yang sama.
 */
function putarKeGlobal(
  f: readonly number[],
  cos: number,
  sin: number,
): GayaUjung {
  const [f0, f1, f2, f3, f4, f5] = [f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, f[5]!]

  // Tᵀ untuk pasangan (N,V): [Fx,Fy] = [N·cos − V·sin, N·sin + V·cos]
  return {
    lokal: [f0, f1, f2, f3, f4, f5],
    diAwal: { fx: f0 * cos - f1 * sin, fy: f0 * sin + f1 * cos, m: f2 },
    diAkhir: { fx: f3 * cos - f4 * sin, fy: f3 * sin + f4 * cos, m: f5 },
  }
}

/** Skala besaran kasus — dipakai membuat toleransi RELATIF, bukan mutlak. */
function skalaGaya(nilai: number[]): number {
  return Math.max(1, ...nilai.map(Math.abs))
}

// ══════════════════════════════════════════════════════════════════════════════
// PEMERIKSA KESEIMBANGAN — inti berkas ini
// ══════════════════════════════════════════════════════════════════════════════

interface Kasus {
  simpul: Simpul[]
  batang: BatangModel[]
  beban: BebanTitik[]
  /** Label untuk pesan gagal — tanpa ini, kasus ke-137 tak bisa dicari. */
  label: string
}

interface Sisa {
  /** Sisa terbesar keseimbangan tiap SIMPUL, relatif terhadap skala beban. */
  simpulRelatif: number
  /** Simpul mana yang paling besar sisanya — untuk mengecilkan kasus gagal. */
  simpulTerburuk: string
  /** ΣFx, ΣFy, ΣM keseluruhan struktur (reaksi + beban), relatif. */
  globalFxRelatif: number
  globalFyRelatif: number
  globalMRelatif: number
  /**
   * Selisih relatif antara `reaksi` yang dipulangkan modul dan yang
   * diturunkan pemeriksa ini dari gaya ujung batang. Dua jalur, satu jawaban.
   */
  reaksiSelisihRelatif: number
  /** Simpul bertumpu mana yang paling besar selisihnya. */
  reaksiTerburuk: string
  /** Jumlah baris `reaksi` — wajib = jumlah simpul BERTUMPU, bukan semua. */
  jumlahReaksi: number
  /** Berapa simpul yang memang bertumpu di kasus ini. */
  jumlahBertumpu: number
}

/** DOF yang ditahan tiap tumpuan — SALINAN dari `rangka-model.ts` (sengaja). */
const DITAHAN_UJI: Record<Simpul['tumpuan'], { x: boolean; y: boolean; m: boolean }> = {
  bebas: { x: false, y: false, m: false },
  sendi: { x: true, y: true, m: false },
  'rol-x': { x: false, y: true, m: false },
  jepit: { x: true, y: true, m: true },
}

/**
 * Memeriksa keseimbangan sebuah kasus, memulangkan sisa RELATIF.
 *
 * ── Yang diperiksa
 *
 * 1. KESEIMBANGAN TIAP SIMPUL. Di simpul BEBAS (tanpa tumpuan), jumlah gaya
 *    yang diberikan semua batang yang bertemu di sana, ditambah beban luar
 *    di simpul itu, harus NOL. Ini yang paling tajam: ia memeriksa PERAKITAN
 *    matriks, bukan cuma hasil akhirnya. Peta DOF yang tertukar, sumbangan
 *    batang yang masuk ke baris salah, rotasi yang dipakai terbalik — semua
 *    muncul di sini sebagai sisa, dan tak satu pun muncul sebagai galat.
 *
 * 2. REAKSI TUMPUAN diturunkan dari simpul yang PUNYA tumpuan: reaksi =
 *    (gaya batang + beban luar) yang tersisa di arah yang ditahan. Ini bukan
 *    pengukuran independen — ia definisi. Tapi ia membuat pemeriksaan (3)
 *    mungkin, dan (3) memang independen.
 *
 * 3. ΣFx, ΣFy, ΣM SELURUH STRUKTUR. Reaksi (dari 2) + seluruh beban luar +
 *    seluruh beban merata batang harus nol, termasuk momennya terhadap titik
 *    acuan sembarang. Kalau (1) lolos dan (3) gagal, yang salah ada di
 *    penerapan tumpuan atau beban merata — bukan di perakitan.
 *
 * ⚠ Arah yang DITAHAN tumpuan dilewati di (1): di sana memang ada gaya sisa,
 * dan gaya sisa itulah reaksinya. Memeriksanya nol di situ akan memerahkan
 * setiap kasus yang benar.
 */
function periksaKeseimbangan(k: Kasus): Sisa {
  const h = analisaRangka2D(k.simpul, k.batang, k.beban)

  const geo = k.batang.map((b) => {
    const a = k.simpul[b.dari]!
    const z = k.simpul[b.ke]!
    const dx = z.xM - a.xM
    const dy = z.yM - a.yM
    const lM = Math.hypot(dx, dy)
    return { lM, cos: dx / lM, sin: dy / lM }
  })

  /*
    Gaya ujung DIBACA dari keluaran modul, termasuk f[3]/f[4]/f[5]. Sebelum
    2026-09-01 ketiganya direkonstruksi dari keseimbangan batang — sifat
    bawaan `kLokal`, jadi selalu benar, jadi tak pernah menangkap apa pun.
  */
  const gu = k.batang.map((_b, e) =>
    putarKeGlobal(h.gayaUjung[e]!.f, geo[e]!.cos, geo[e]!.sin))

  /*
    Skala referensi: besaran gaya terbesar yang muncul di kasus ini. Toleransi
    MUTLAK tak bisa dipakai — kasus dengan beban 5 kN/m dan kasus dengan 60
    kN/m pada bentang 12 m berbeda dua orde besaran, dan toleransi yang pas
    untuk yang kecil akan meloloskan cacat 1% pada yang besar.
  */
  const semuaGaya: number[] = []
  for (const g of gu) semuaGaya.push(...g.lokal)
  for (const p of k.beban) {
    semuaGaya.push(p.fxKn ?? 0, p.fyKn ?? 0, p.mKnm ?? 0)
  }
  k.batang.forEach((b, e) => semuaGaya.push((b.qKnM ?? 0) * geo[e]!.lM))
  const skala = skalaGaya(semuaGaya)

  /*
    ── 1. Keseimbangan tiap simpul; sekaligus MEMBANDINGKAN reaksi yang
    dipulangkan modul terhadap reaksi yang diturunkan pemeriksa ini sendiri.

    Sebelum 2026-09-01 pemeriksa ini MENDEFINISIKAN reaksinya sendiri, dan
    definisi tak pernah bisa salah — ia cuma membuat (3) mungkin. Sekarang
    `reaksiModul` datang dari modul dan `reaksiTurunan` dari pemeriksa;
    keduanya wajib cocok, dan yang dipakai di (3) adalah punya MODUL. Kalau
    modul memberi reaksi yang salah, ia merah di dua tempat sekaligus.
  */
  const reaksiModul = k.simpul.map(() => ({ fx: 0, fy: 0, m: 0 }))
  for (const r of h.reaksi) {
    reaksiModul[r.simpul] = { fx: r.fxKn, fy: r.fyKn, m: r.mKnm }
  }
  const reaksiTurunan = k.simpul.map(() => ({ fx: 0, fy: 0, m: 0 }))
  let simpulRelatif = 0
  let simpulTerburuk = '(tak ada)'

  k.simpul.forEach((s, i) => {
    let fx = 0
    let fy = 0
    let m = 0

    k.batang.forEach((b, e) => {
      const g = gu[e]!
      // Σf = jumlah gaya yang SIMPUL ini berikan ke batang-batang yang
      // bertemu di sini. Momen ujung batang bekerja terhadap simpulnya
      // sendiri, jadi tak perlu dipindah — lengan momennya nol.
      if (b.dari === i) { fx += g.diAwal.fx; fy += g.diAwal.fy; m += g.diAwal.m }
      if (b.ke === i) { fx += g.diAkhir.fx; fy += g.diAkhir.fy; m += g.diAkhir.m }
    })

    /*
      ⚠ TANDA — lihat blok panjang di `gayaUjung`. `f` adalah gaya SIMPUL →
      BATANG, jadi keseimbangan simpul berbunyi:

          Σf = beban_luar + reaksi

      Di arah BEBAS tak ada reaksi, jadi sisanya (Σf − beban_luar) harus NOL.
      Di arah TERTAHAN, sisa itu JUSTRU reaksinya.

      Membaliknya tak menimbulkan galat — ia memberi sisa yang persis dua kali
      beban, angka yang terlihat seperti cacat solver padahal cacat pemeriksa.
      Itu yang terjadi di draf pertama berkas ini.
    */
    let ex = 0
    let ey = 0
    let em = 0
    for (const p of k.beban) {
      if (p.simpul === i) { ex += p.fxKn ?? 0; ey += p.fyKn ?? 0; em += p.mKnm ?? 0 }
    }

    const tahan = DITAHAN_UJI[s.tumpuan]!
    if (tahan.x) { reaksiTurunan[i]!.fx = fx - ex } else { simpulRelatif = Math.max(simpulRelatif, Math.abs(fx - ex) / skala) }
    if (tahan.y) { reaksiTurunan[i]!.fy = fy - ey } else { simpulRelatif = Math.max(simpulRelatif, Math.abs(fy - ey) / skala) }
    if (tahan.m) { reaksiTurunan[i]!.m = m - em } else { simpulRelatif = Math.max(simpulRelatif, Math.abs(m - em) / skala) }

    const sisaSimpul = Math.max(
      tahan.x ? 0 : Math.abs(fx - ex),
      tahan.y ? 0 : Math.abs(fy - ey),
      tahan.m ? 0 : Math.abs(m - em),
    ) / skala
    if (sisaSimpul >= simpulRelatif) simpulTerburuk = `${s.nama} (indeks ${i})`
  })

  // ── 3. Keseimbangan SELURUH struktur.
  //
  // Titik acuan momen sengaja BUKAN titik asal: (0,0) sering berimpit dengan
  // sebuah tumpuan, dan tumpuan yang berimpit acuan tak menyumbang momen sama
  // sekali — reaksi mendatarnya bisa salah tanpa terlihat. Acuan digeser ke
  // tempat yang tak istimewa.
  const xAcuan = -3.7
  const yAcuan = 2.9

  let sFx = 0
  let sFy = 0
  let sM = 0

  // Yang dipakai di sini reaksi MILIK MODUL — bukan turunan pemeriksa. Kalau
  // modul salah, ΣF/ΣM ikut merah; kalau ia cuma memindahkannya dari satu
  // simpul ke simpul lain, yang merah adalah pembandingan di bawah.
  k.simpul.forEach((s, i) => {
    const r = reaksiModul[i]!
    sFx += r.fx
    sFy += r.fy
    sM += r.m + (s.xM - xAcuan) * r.fy - (s.yM - yAcuan) * r.fx
  })

  for (const p of k.beban) {
    const s = k.simpul[p.simpul]!
    const fx = p.fxKn ?? 0
    const fy = p.fyKn ?? 0
    sFx += fx
    sFy += fy
    sM += (p.mKnm ?? 0) + (s.xM - xAcuan) * fy - (s.yM - yAcuan) * fx
  }

  /*
    Beban merata batang: q POSITIF = ke arah GRAVITASI = −y LOKAL batang.
    Untuk batang miring, −y lokal BUKAN −Y global — komponennya:
        arah −y lokal di global = (sin, −cos)
    jadi resultan qL bekerja ke arah (q·L·sin, −q·L·cos), di titik TENGAH
    batang.

    ⚠ Ini sumber kesalahan yang mudah: menganggap q selalu vertikal benar
    untuk balok mendatar (sin=0, cos=1 → (0,−qL), memang ke bawah) dan SALAH
    untuk batang miring. Kasus acak di berkas ini semuanya bertulang mendatar
    dan tegak, tapi truss dan rumusnya tetap ditulis lengkap supaya pemeriksa
    ini tetap benar kalau suatu hari batang miring berbeban merata diuji.
  */
  k.batang.forEach((b, e) => {
    const q = b.qKnM ?? 0
    if (q === 0) return
    const g = geo[e]!
    const a = k.simpul[b.dari]!
    const z = k.simpul[b.ke]!
    const total = q * g.lM
    const fx = total * g.sin
    const fy = -total * g.cos
    const xT = (a.xM + z.xM) / 2
    const yT = (a.yM + z.yM) / 2
    sFx += fx
    sFy += fy
    sM += (xT - xAcuan) * fy - (yT - yAcuan) * fx
  })

  // Skala momen berbeda dari skala gaya: ia bergantung lengan. Dipakai
  // lengan terbesar yang muncul, minimal 1 m.
  const lengan = Math.max(1, ...k.simpul.map((s) =>
    Math.max(Math.abs(s.xM - xAcuan), Math.abs(s.yM - yAcuan))))

  /*
    ── 4. Reaksi modul vs reaksi turunan pemeriksa.

    Dua jalur yang harus bertemu di satu jawaban. Modul menurunkannya di dalam
    `panenReaksi`; pemeriksa ini menurunkannya sendiri dari gaya ujung yang
    juga dipulangkan modul. Keduanya memakai aljabar yang sama, jadi ini BUKAN
    pengukuran yang sepenuhnya bebas — yang ia tangkap adalah penyaringan arah
    tertahan yang salah, simpul yang tertukar, dan simpul bebas yang ikut
    terdaftar. Yang menangkap kesalahan aljabarnya sendiri adalah tiga kasus
    tangan di `rangka-model.test.ts`, yang jawabannya diketahui dari tabel.
  */
  let reaksiSelisihRelatif = 0
  let reaksiTerburuk = '(tak ada)'
  let jumlahBertumpu = 0
  k.simpul.forEach((s, i) => {
    if (s.tumpuan === 'bebas') return
    jumlahBertumpu++
    const a = reaksiModul[i]!
    const b = reaksiTurunan[i]!
    const d = Math.max(
      Math.abs(a.fx - b.fx) / skala,
      Math.abs(a.fy - b.fy) / skala,
      Math.abs(a.m - b.m) / (skala * lengan),
    )
    if (d > reaksiSelisihRelatif) {
      reaksiSelisihRelatif = d
      reaksiTerburuk = `${s.nama} (indeks ${i})`
    }
  })

  return {
    simpulRelatif,
    simpulTerburuk,
    globalFxRelatif: Math.abs(sFx) / skala,
    globalFyRelatif: Math.abs(sFy) / skala,
    globalMRelatif: Math.abs(sM) / (skala * lengan),
    reaksiSelisihRelatif,
    reaksiTerburuk,
    jumlahReaksi: h.reaksi.length,
    jumlahBertumpu,
  }
}

/*
  ── TOLERANSI

  1e-9 relatif. Bukan angka yang ditawar sampai hijau: ia diturunkan dari
  presisi double (~2,2e-16) dikalikan pembesaran wajar eliminasi Gauss pada
  matriks portal 3 lantai (kondisi ~1e6-1e7 karena EA/L jauh lebih besar dari
  EI/L³). 1e-16 × 1e7 ≈ 1e-9.

  ⚠ Toleransi LONGGAR menyembunyikan cacat. Cacat "integrasi lendutan salah
  1,6-22%" akan lolos toleransi 1e-2 dengan mudah, dan toleransi 1e-2
  "terlihat ketat" bagi yang tak menghitung skalanya. Kalau suatu hari
  toleransi ini perlu dilonggarkan, yang wajib ditulis bukan angka barunya
  melainkan ALASANNYA — kasus mana, kondisi matriks berapa.
*/
const TOL = 1e-9

// ══════════════════════════════════════════════════════════════════════════════
// PEMBANGKIT KASUS ACAK
// ══════════════════════════════════════════════════════════════════════════════

interface Ragam {
  lantai: number
  bentangCount: number
  bentang: number[]
  tinggi: number[]
  qPerLantai: number[]
  lateral: number[]
  fcMpa: number
}

/**
 * Portal bertingkat TAK BERATURAN: bentang boleh beda panjang, tinggi lantai
 * boleh beda, penampang boleh beda antar lantai, beban merata boleh beda tiap
 * lantai, beban lateral boleh nol atau bersamaan dengan gravitasi.
 *
 * Ini yang TIDAK ada di 7 kasus tangan. `analisaPortal` sendiri hanya bisa
 * membuat portal satu bentang berpenampang seragam dan tinggi seragam — jadi
 * kasus di sini dirakit langsung ke `analisaRangka2D`, lapis yang paling
 * mungkin salah dan paling sedikit diuji terhadap geometri tak beraturan.
 */
function bikinPortalTakBeraturan(r: ReturnType<typeof bikinAcak>, no: number): { kasus: Kasus; ragam: Ragam } {
  const lantai = r.bulat(1, 3)
  const bentangCount = r.bulat(1, 4)

  const bentang: number[] = []
  for (let j = 0; j < bentangCount; j++) bentang.push(r.riil(2, 12))

  const tinggi: number[] = []
  for (let t = 0; t < lantai; t++) tinggi.push(r.riil(2.5, 5))

  const fcMpa = r.riil(17, 35)
  const eMpa = 4700 * Math.sqrt(fcMpa)

  // Simpul: (bentangCount+1) kolom × (lantai+1) baris.
  const nKolom = bentangCount + 1
  const xKolom: number[] = [0]
  for (const b of bentang) xKolom.push(xKolom[xKolom.length - 1]! + b)
  const yLantai: number[] = [0]
  for (const t of tinggi) yLantai.push(yLantai[yLantai.length - 1]! + t)

  const simpul: Simpul[] = []
  const idx = (t: number, j: number) => t * nKolom + j
  for (let t = 0; t <= lantai; t++) {
    for (let j = 0; j < nKolom; j++) {
      /*
        Dasar dijepit SEMUA. Campuran sendi/rol di dasar portal bertingkat
        sering menghasilkan mekanisme (labil) yang membuat solver melempar,
        dan kasus yang melempar tak menguji keseimbangan apa pun — ia cuma
        mengurangi jumlah kasus yang benar-benar dijalankan tanpa terlihat.
      */
      simpul.push({
        nama: `S${t}_${j}`,
        xM: xKolom[j]!,
        yM: yLantai[t]!,
        tumpuan: t === 0 ? 'jepit' : 'bebas',
      })
    }
  }

  // Penampang BERBEDA antar lantai — inilah yang tak pernah diuji.
  const batang: BatangModel[] = []
  const qPerLantai: number[] = []
  for (let t = 0; t < lantai; t++) {
    const kb = r.riil(200, 800)
    const kh = r.riil(200, 800)
    const kA = kb * kh
    const kI = kb * kh ** 3 / 12
    for (let j = 0; j < nKolom; j++) {
      batang.push({
        nama: `K${t + 1}_${j}`,
        dari: idx(t, j),
        ke: idx(t + 1, j),
        eMpa, aMm2: kA, iMm4: kI,
      })
    }
    const bb = r.riil(200, 800)
    const bh = r.riil(200, 800)
    const bA = bb * bh
    const bI = bb * bh ** 3 / 12
    const q = r.riil(5, 60)
    qPerLantai.push(q)
    for (let j = 0; j < bentangCount; j++) {
      batang.push({
        nama: `B${t + 1}_${j}`,
        dari: idx(t + 1, j),
        ke: idx(t + 1, j + 1),
        eMpa, aMm2: bA, iMm4: bI,
        qKnM: q,
      })
    }
  }

  /*
    Beban lateral: sepertiga kasus TANPA lateral sama sekali (gravitasi murni),
    sepertiga lateral saja, sepertiga keduanya bersamaan.

    Kenapa nol harus ikut diuji: cabang `if (fxKn !== 0)` di `analisaPortal`
    dan cabang `if (qKnM === 0)` di `fixedEndLokal` adalah jalur kode yang
    BERBEDA. Kasus acak yang selalu punya kedua beban tak pernah melewati
    jalur nol, dan jalur nol persis tempat "beban yang diam-diam hilang"
    bersembunyi.
  */
  const modus = no % 3
  const lateral: number[] = []
  for (let t = 0; t < lantai; t++) {
    lateral.push(modus === 0 ? 0 : r.riil(0, 100))
  }
  const beban: BebanTitik[] = []
  lateral.forEach((fx, t) => {
    if (fx !== 0) beban.push({ simpul: idx(t + 1, 0), fxKn: fx })
  })
  if (modus === 1) {
    // Lateral saja: matikan gravitasi.
    for (const b of batang) if (b.qKnM !== undefined) b.qKnM = 0
  }

  return {
    kasus: {
      simpul, batang, beban,
      label: `portal#${no} lantai=${lantai} bentang=[${bentang.map((v) => v.toFixed(3)).join(',')}] `
        + `tinggi=[${tinggi.map((v) => v.toFixed(3)).join(',')}] `
        + `q=[${qPerLantai.map((v) => v.toFixed(3)).join(',')}] `
        + `lateral=[${lateral.map((v) => v.toFixed(3)).join(',')}] fc=${fcMpa.toFixed(3)}`,
    },
    ragam: { lantai, bentangCount, bentang, tinggi, qPerLantai, lateral, fcMpa },
  }
}

/**
 * Balok menerus bentang TAK SAMA, penampang seragam (sesuai `InputBalokMenerus`),
 * dirakit langsung ke lapis 1 supaya jumlah bentang dan panjangnya bebas.
 */
function bikinBalokTakSama(r: ReturnType<typeof bikinAcak>, no: number): Kasus {
  const n = r.bulat(1, 4)
  const bentang: number[] = []
  for (let i = 0; i < n; i++) bentang.push(r.riil(2, 12))
  const fcMpa = r.riil(17, 35)
  const eMpa = 4700 * Math.sqrt(fcMpa)
  const bMm = r.riil(200, 800)
  const hMm = r.riil(200, 800)
  const q = r.riil(5, 60)

  const simpul: Simpul[] = [{ nama: 'T1', xM: 0, yM: 0, tumpuan: 'sendi' }]
  let x = 0
  bentang.forEach((L, i) => {
    x += L
    simpul.push({ nama: `T${i + 2}`, xM: x, yM: 0, tumpuan: 'rol-x' })
  })
  const batang: BatangModel[] = bentang.map((_, i) => ({
    nama: `B${i + 1}`, dari: i, ke: i + 1,
    eMpa, aMm2: bMm * hMm, iMm4: bMm * hMm ** 3 / 12, qKnM: q,
  }))

  return {
    simpul, batang, beban: [],
    label: `balok#${no} bentang=[${bentang.map((v) => v.toFixed(3)).join(',')}] `
      + `b=${bMm.toFixed(1)} h=${hMm.toFixed(1)} q=${q.toFixed(3)} fc=${fcMpa.toFixed(3)}`,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST
// ══════════════════════════════════════════════════════════════════════════════

const BENIH = 20260901

describe('invarian keseimbangan — portal tak beraturan, ratusan kombinasi', () => {
  /*
    240 kasus, benih tetap. Angka ini bukan hiasan: dengan 3 modus beban ×
    lantai 1-3 × bentang 1-4, ruang kombinasi kasarnya 36 bentuk, jadi 240
    memberi rata-rata ~7 penarikan acak per bentuk untuk dimensi kontinu
    (bentang, tinggi, penampang, beban, mutu).
  */
  const JUMLAH = 240

  const r = bikinAcak(BENIH)
  const kasus: { kasus: Kasus; ragam: Ragam }[] = []
  for (let i = 0; i < JUMLAH; i++) kasus.push(bikinPortalTakBeraturan(r, i))

  it(`membangkitkan ${JUMLAH} kasus dengan ragam yang benar-benar berbeda`, () => {
    /*
      Penjaga terhadap pembangkit yang rusak. Pembangkit yang selalu
      memulangkan kasus SAMA tetap membuat 240 test hijau — dan hijaunya tak
      berarti apa-apa. Ini kesalahan yang tak menimbulkan galat: 240 salinan
      satu kasus terlihat persis seperti 240 kasus.
    */
    expect(kasus).toHaveLength(JUMLAH)
    const bentuk = new Set(kasus.map((k) => `${k.ragam.lantai}x${k.ragam.bentangCount}`))
    expect(bentuk.size).toBe(12)   // lantai 1-3 × bentang 1-4

    const tanpaLateral = kasus.filter((k) => k.ragam.lateral.every((v) => v === 0))
    expect(tanpaLateral.length).toBeGreaterThan(50)

    const adaLateral = kasus.filter((k) => k.ragam.lateral.some((v) => v !== 0))
    expect(adaLateral.length).toBeGreaterThan(100)

    // Gravitasi DAN lateral bersamaan — modus 2.
    const keduanya = kasus.filter((k, i) =>
      i % 3 === 2 && k.ragam.lateral.some((v) => v !== 0) && k.ragam.qPerLantai.some((v) => v > 0))
    expect(keduanya.length).toBeGreaterThan(50)

    // Penampang benar-benar berbeda antar lantai pada kasus bertingkat.
    const bertingkat = kasus.find((k) => k.ragam.lantai >= 2)!
    const kolomLantai1 = bertingkat.kasus.batang.find((b) => b.nama.startsWith('K1_'))!
    const kolomLantai2 = bertingkat.kasus.batang.find((b) => b.nama.startsWith('K2_'))!
    expect(kolomLantai1.iMm4).not.toBeCloseTo(kolomLantai2.iMm4, 6)

    // Bentang benar-benar tak sama pada kasus berbentang banyak.
    const banyakBentang = kasus.find((k) => k.ragam.bentangCount >= 2)!
    expect(banyakBentang.ragam.bentang[0]!).not.toBeCloseTo(banyakBentang.ragam.bentang[1]!, 6)
  })

  it('ΣFy = 0 — reaksi tegak = total beban tegak, tiap kasus', () => {
    const gagal: string[] = []
    for (const { kasus: k } of kasus) {
      const s = periksaKeseimbangan(k)
      if (!(s.globalFyRelatif < TOL)) {
        gagal.push(`${k.label} → ΣFy sisa relatif ${s.globalFyRelatif.toExponential(4)}`)
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('ΣFx = 0 — reaksi mendatar = total beban mendatar, tiap kasus', () => {
    const gagal: string[] = []
    for (const { kasus: k } of kasus) {
      const s = periksaKeseimbangan(k)
      if (!(s.globalFxRelatif < TOL)) {
        gagal.push(`${k.label} → ΣFx sisa relatif ${s.globalFxRelatif.toExponential(4)}`)
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('ΣM = 0 di titik acuan sembarang, tiap kasus', () => {
    const gagal: string[] = []
    for (const { kasus: k } of kasus) {
      const s = periksaKeseimbangan(k)
      if (!(s.globalMRelatif < TOL)) {
        gagal.push(`${k.label} → ΣM sisa relatif ${s.globalMRelatif.toExponential(4)}`)
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('reaksi yang DIPULANGKAN modul = reaksi yang diturunkan dari gaya ujung', () => {
    /*
      Ini yang membuat `reaksi` bukan sekadar medan baru yang percaya diri.
      Sekaligus memeriksa dua hal yang tak menimbulkan galat kalau salah:

        • jumlah barisnya = jumlah simpul BERTUMPU, bukan semua simpul. Simpul
          bebas yang ikut terdaftar membuat ΣFy menghitung gaya dalam batang
          sebagai reaksi — angka yang besarnya masuk akal dan tandanya benar.
        • arah yang TAK ditahan dipaku nol. Rol-x yang melaporkan fxKn dari
          gaya sisa memberi reaksi mendatar yang secara fisik tak bisa ada.
    */
    const gagal: string[] = []
    for (const { kasus: k } of kasus) {
      const s = periksaKeseimbangan(k)
      if (s.jumlahReaksi !== s.jumlahBertumpu) {
        gagal.push(`${k.label} → ${s.jumlahReaksi} baris reaksi untuk ${s.jumlahBertumpu} simpul bertumpu`)
      }
      if (!(s.reaksiSelisihRelatif < TOL)) {
        gagal.push(`${k.label} → reaksi ${s.reaksiTerburuk} beda ${s.reaksiSelisihRelatif.toExponential(4)}`)
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('gayaUjung UJUNG KEDUA benar-benar dibaca — bukan disimpulkan', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      INI TEST YANG MENUTUP LUBANG (1). Baca header berkas.
      ══════════════════════════════════════════════════════════════════════

      Sebelum `gayaUjung` ada, f[3]/f[4]/f[5] direkonstruksi dari keseimbangan
      batang: f[3] = −f[0], f[4] = qL − f[1], f[5] = momen di titik terakhir.
      Ketiganya SELALU cocok, apa pun yang solver lakukan, karena keseimbangan
      batang adalah sifat bawaan `kLokal`.

      Yang diperiksa di sini: f yang dipulangkan modul MEMENUHI keseimbangan
      batangnya sendiri — pengukuran yang baru punya arti sesudah ketiganya
      dilaporkan alih-alih diturunkan. Kalau solver merusak ujung kedua saja
      (mis. mengalikan f[4] dengan 1,01), ini merah; pada versi rekonstruksi
      ia tetap hijau karena f[4] tak pernah datang dari solver.

      Ketiga persamaannya, sumbu lokal batang panjang L berbeban merata q:
        aksial : f[0] + f[3] = 0
        geser  : f[1] + f[4] = q·L
        momen  : f[2] + f[5] + f[4]·L = q·L²/2
      Yang terakhir adalah momen terhadap ujung AWAL: momen kedua ujung,
      ditambah geser ujung akhir dikali lengan L, sama dengan momen beban
      merata terhadap ujung awal.
    */
    const gagal: string[] = []
    for (const { kasus: k } of kasus) {
      const h = analisaRangka2D(k.simpul, k.batang, k.beban)
      expect(h.gayaUjung).toHaveLength(k.batang.length)

      k.batang.forEach((b, e) => {
        const f = h.gayaUjung[e]!.f
        const a = k.simpul[b.dari]!
        const z = k.simpul[b.ke]!
        const L = Math.hypot(z.xM - a.xM, z.yM - a.yM)
        const q = b.qKnM ?? 0
        const skala = Math.max(1, ...f.map(Math.abs), Math.abs(q * L))

        const sisaN = Math.abs(f[0] + f[3]) / skala
        const sisaV = Math.abs(f[1] + f[4] - q * L) / skala
        const sisaM = Math.abs(f[2] + f[5] + f[4] * L - q * L ** 2 / 2) / (skala * Math.max(1, L))

        if (!(sisaN < TOL)) gagal.push(`${k.label} ${b.nama} → aksial ${sisaN.toExponential(4)}`)
        if (!(sisaV < TOL)) gagal.push(`${k.label} ${b.nama} → geser ${sisaV.toExponential(4)}`)
        if (!(sisaM < TOL)) gagal.push(`${k.label} ${b.nama} → momen ${sisaM.toExponential(4)}`)
      })
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('keseimbangan TIAP SIMPUL — memeriksa perakitan matriks, bukan hasil akhir', () => {
    /*
      Yang paling tajam dari keempatnya. ΣFy/ΣFx/ΣM global bisa tetap nol
      meski sumbangan sebuah batang masuk ke baris DOF yang salah, asalkan
      kesalahannya berpasangan — dan pada geometri teratur ia sering
      berpasangan. Keseimbangan per simpul tidak memaafkan itu: gaya yang
      salah tempat muncul sebagai sisa di dua simpul sekaligus.
    */
    const gagal: string[] = []
    for (const { kasus: k } of kasus) {
      const s = periksaKeseimbangan(k)
      if (!(s.simpulRelatif < TOL)) {
        gagal.push(
          `${k.label} → simpul ${s.simpulTerburuk} sisa relatif `
          + s.simpulRelatif.toExponential(4),
        )
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })
})

describe('invarian keseimbangan — balok menerus bentang TAK SAMA', () => {
  /*
    Tujuh kasus tangan yang ada semuanya berbentang sama. Bentang tak sama
    adalah tempat momen tumpuan TIDAK lagi simetris, dan distribusi reaksinya
    tak bisa ditebak dari hafalan — persis kondisi di mana kesalahan yang
    saling meniadakan di kasus simetris berhenti meniadakan.
  */
  const JUMLAH = 120
  const r = bikinAcak(BENIH ^ 0x5eed)
  const kasus: Kasus[] = []
  for (let i = 0; i < JUMLAH; i++) kasus.push(bikinBalokTakSama(r, i))

  it(`${JUMLAH} balok: seimbang di tiap simpul, ΣFy, ΣFx, dan ΣM`, () => {
    const gagal: string[] = []
    for (const k of kasus) {
      const s = periksaKeseimbangan(k)
      if (!(s.simpulRelatif < TOL)) gagal.push(`${k.label} → simpul ${s.simpulTerburuk} ${s.simpulRelatif.toExponential(4)}`)
      if (!(s.globalFyRelatif < TOL)) gagal.push(`${k.label} → ΣFy ${s.globalFyRelatif.toExponential(4)}`)
      if (!(s.globalFxRelatif < TOL)) gagal.push(`${k.label} → ΣFx ${s.globalFxRelatif.toExponential(4)}`)
      if (!(s.globalMRelatif < TOL)) gagal.push(`${k.label} → ΣM ${s.globalMRelatif.toExponential(4)}`)
      // Reaksi modul vs turunan pemeriksa, dan jumlah barisnya.
      if (!(s.reaksiSelisihRelatif < TOL)) gagal.push(`${k.label} → reaksi ${s.reaksiTerburuk} ${s.reaksiSelisihRelatif.toExponential(4)}`)
      if (s.jumlahReaksi !== s.jumlahBertumpu) gagal.push(`${k.label} → ${s.jumlahReaksi} reaksi vs ${s.jumlahBertumpu} bertumpu`)
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('ΣfyKn reaksi = qL total — dibaca dari `reaksi`, bukan dihitung ulang', () => {
    /*
      Balok menerus bentang tak sama: total beban = q × Σbentang, dan seluruh
      reaksi tegaknya harus berjumlah persis itu — POSITIF, karena reaksi
      adalah gaya yang TUMPUAN berikan kepada struktur.

      Ini yang bisa dilakukan insinyur di layar tanpa menghitung ulang apa pun,
      dan itulah alasan kedua `reaksi` ada. Sebelum ini, angka pembandingnya
      tak pernah keluar dari modul sama sekali.
    */
    const gagal: string[] = []
    for (const k of kasus) {
      const h = analisaRangka2D(k.simpul, k.batang, k.beban)
      const total = k.batang.reduce((s, b, e) => {
        const a = k.simpul[b.dari]!
        const z = k.simpul[b.ke]!
        void e
        return s + (b.qKnM ?? 0) * Math.hypot(z.xM - a.xM, z.yM - a.yM)
      }, 0)
      const sFy = h.reaksi.reduce((s, r) => s + r.fyKn, 0)
      const rel = Math.abs(sFy - total) / Math.max(1, total)
      if (!(rel < TOL)) {
        gagal.push(`${k.label} → ΣfyKn ${sFy.toFixed(6)} vs qL total ${total.toFixed(6)} (rel ${rel.toExponential(4)})`)
      }
      // Tumpuan sendi/rol saja — tak satu pun jepit, jadi momen reaksi nol.
      for (const r of h.reaksi) {
        if (r.mKnm !== 0) gagal.push(`${k.label} → ${r.nama} mKnm ${r.mKnm} bukan nol pada tumpuan tanpa jepit`)
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('identitas M tumpuan + M lapangan = wL²/8 — berlaku TANPA syarat keseragaman', () => {
    /*
      Untuk SETIAP bentang balok menerus di bawah beban merata w, berlaku:

          |M_tumpuan rata-rata| + M_lapangan_puncak = wL²/8

      di mana M_tumpuan rata-rata = (M_kiri + M_kanan)/2 dan M_lapangan_puncak
      diukur dari garis penghubung kedua momen tumpuan.

      Ini identitas parabola beban merata — ia TIDAK bergantung pada bentang
      tetangga, penampang, atau apakah bentangnya sama panjang. Karena itu ia
      bisa diuji pada bentang tak sama, di mana tabel hafalan (wL²/8, wL²/10,
      wL²/11) sudah tak berlaku sama sekali.

      Dinyatakan lewat gaya ujung: M(x) = −M1 + V1·x − q·x²/2, jadi
      selisih antara puncak parabola dan tali busurnya = q·L²/8 persis.
    */
    const gagal: string[] = []
    for (const k of kasus) {
      const h = analisaRangka2D(k.simpul, k.batang, k.beban)
      h.batang.forEach((b, e) => {
        const bm = k.batang[e]!
        const q = bm.qKnM!
        const L = k.simpul[bm.ke]!.xM - k.simpul[bm.dari]!.xM
        const mKiri = b.momenKnm.di[0]!.nilai
        const mKanan = b.momenKnm.di[b.momenKnm.di.length - 1]!.nilai

        // Nilai parabola di tengah dikurangi rata-rata kedua ujung = qL²/8.
        const M1 = -mKiri
        const V1 = b.geserKn.di[0]!.nilai
        const mTengah = -M1 + V1 * (L / 2) - q * (L / 2) ** 2 / 2
        const selisih = mTengah - (mKiri + mKanan) / 2
        const harap = q * L ** 2 / 8
        const rel = Math.abs(selisih - harap) / Math.max(1, Math.abs(harap))
        if (!(rel < TOL)) {
          gagal.push(`${k.label} batang ${b.nama} → ${selisih.toFixed(9)} vs ${harap.toFixed(9)} (rel ${rel.toExponential(4)})`)
        }
      })
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TRUSS SELAIN SEGITIGA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Keseimbangan tiap BUHUL truss: jumlah gaya batang yang bertemu di sebuah
 * buhul = beban luar di buhul itu.
 *
 * Untuk truss, gaya batang di buhul sepenuhnya AKSIAL dan arahnya sepanjang
 * batang. Gaya TARIK (positif) menarik buhul MENUJU batang; jadi gaya yang
 * batang berikan ke buhul awal = +N·(cos,sin) dan ke buhul akhir =
 * −N·(cos,sin).
 *
 * ⚠ Truss di modul ini dimodelkan dengan I = 1e-6 mm⁴, bukan elemen batang
 * sejati. Artinya masih ada geser dan momen ujung yang SANGAT KECIL tapi
 * bukan nol, dan keseimbangan buhul karena itu tak eksak sampai 1e-9. Yang
 * diukur di bawah: seberapa besar sisanya sesungguhnya — bukan ditebak.
 */
function sisaBuhulTruss(input: InputTruss): { maks: number; buhul: string } {
  const hasil = analisaTruss(input)
  const gaya = new Map(hasil.batang.map((b) => [b.nama, b.gayaKn]))

  let maks = 0
  let buhul = '(tak ada)'
  const skala = Math.max(1, ...input.beban.map((p) => Math.abs(p.fyKn)),
    ...hasil.batang.map((b) => Math.abs(b.gayaKn)))

  input.simpul.forEach((s, i) => {
    let fx = 0
    let fy = 0
    for (const b of input.batang) {
      const N = gaya.get(b.nama)!
      const a = input.simpul[b.dari]!
      const z = input.simpul[b.ke]!
      const L = Math.hypot(z.xM - a.xM, z.yM - a.yM)
      const cos = (z.xM - a.xM) / L
      const sin = (z.yM - a.yM) / L
      if (b.dari === i) { fx += N * cos; fy += N * sin }
      if (b.ke === i) { fx -= N * cos; fy -= N * sin }
    }
    for (const p of input.beban) if (p.simpul === i) fy += p.fyKn

    // Arah yang ditahan tumpuan dilewati — di sana sisanya adalah reaksi.
    const t = s.tumpuan
    const cekX = t === undefined
    const cekY = t === undefined
    const sisa = Math.max(cekX ? Math.abs(fx) : 0, cekY ? Math.abs(fy) : 0) / skala
    if (sisa > maks) { maks = sisa; buhul = s.nama }
  })

  return { maks, buhul }
}

describe('truss SELAIN segitiga — keseimbangan tiap buhul', () => {
  /*
    Test truss yang ada hanya memakai SATU segitiga (3 buhul, 3 batang).
    Segitiga adalah truss yang paling tak bisa salah: ia statis tertentu,
    simetris, dan jawabannya P/(2 sin θ) bisa dihitung di kepala. Truss
    Pratt/Howe berbuhul banyak punya batang diagonal yang arah gayanya
    BERBEDA (Pratt: diagonal tarik, Howe: diagonal tekan) — dan itu persis
    yang membedakan pemilihan profil, karena batang tekan dibatasi tekuk.
  */

  /** Truss Pratt 6 buhul: batang bawah 3 bentang, batang atas 2, diagonal ke bawah-luar. */
  function trussPratt(): InputTruss {
    const L = 3   // panjang tiap panel, m
    const H = 2.5 // tinggi truss, m
    return {
      simpul: [
        { nama: 'B0', xM: 0, yM: 0, tumpuan: 'sendi' },
        { nama: 'B1', xM: L, yM: 0 },
        { nama: 'B2', xM: 2 * L, yM: 0 },
        { nama: 'B3', xM: 3 * L, yM: 0, tumpuan: 'rol-x' },
        { nama: 'A1', xM: L, yM: H },
        { nama: 'A2', xM: 2 * L, yM: H },
      ],
      batang: [
        { nama: 'BB0', dari: 0, ke: 1, aMm2: 2400 },
        { nama: 'BB1', dari: 1, ke: 2, aMm2: 2400 },
        { nama: 'BB2', dari: 2, ke: 3, aMm2: 2400 },
        { nama: 'AA0', dari: 4, ke: 5, aMm2: 3000 },
        { nama: 'V1', dari: 1, ke: 4, aMm2: 1200 },
        { nama: 'V2', dari: 2, ke: 5, aMm2: 1200 },
        { nama: 'D0', dari: 0, ke: 4, aMm2: 1800 },
        { nama: 'D1', dari: 4, ke: 2, aMm2: 1800 },   // Pratt: diagonal turun ke tengah
        { nama: 'D2', dari: 5, ke: 3, aMm2: 1800 },
      ],
      beban: [
        { simpul: 4, fyKn: -40 },
        { simpul: 5, fyKn: -55 },   // TAK SIMETRIS — sengaja
      ],
    }
  }

  /** Truss Howe 5 buhul, diagonal berlawanan arah dari Pratt. */
  function trussHowe(): InputTruss {
    const L = 4
    const H = 3
    return {
      simpul: [
        { nama: 'B0', xM: 0, yM: 0, tumpuan: 'sendi' },
        { nama: 'B1', xM: L, yM: 0 },
        { nama: 'B2', xM: 2 * L, yM: 0, tumpuan: 'rol-x' },
        { nama: 'A0', xM: 0, yM: H },
        { nama: 'A1', xM: L, yM: H },
      ],
      batang: [
        { nama: 'BB0', dari: 0, ke: 1, aMm2: 2000 },
        { nama: 'BB1', dari: 1, ke: 2, aMm2: 2000 },
        { nama: 'V0', dari: 0, ke: 3, aMm2: 1500 },
        { nama: 'V1', dari: 1, ke: 4, aMm2: 1500 },
        { nama: 'AA0', dari: 3, ke: 4, aMm2: 2500 },
        { nama: 'D0', dari: 3, ke: 1, aMm2: 1600 },   // Howe: diagonal turun ke luar
        { nama: 'D1', dari: 4, ke: 2, aMm2: 1600 },
      ],
      beban: [
        { simpul: 3, fyKn: -30 },
        { simpul: 4, fyKn: -70 },
      ],
    }
  }

  /*
    ⚠ TOLERANSI TRUSS: SAMA KETATNYA, dan itu hasil PENGUKURAN — bukan
    perkiraan yang kebetulan lolos.

    Dugaan awal berkas ini keliru dan layak dicatat supaya tak diulang.
    Alasannya masuk akal di atas kertas: truss di modul ini bukan elemen
    batang sejati melainkan batang LENTUR dengan I = 1e-6 mm⁴, jadi kekakuan
    lenturnya tak nol dan mestinya menyisakan geser ujung kecil yang tak
    tertangkap penjumlahan gaya AKSIAL saja. Kesimpulannya: toleransi truss
    harus lebih longgar.

    DIUKUR pada Pratt 6 buhul (P = 40 & 55 kN tak simetris), sisa keempat
    buhul bebasnya:

        B1  fx 4,263e-14   fy 0,000e+0
        B2  fx 2,931e-14   fy −7,105e-14
        A1  fx −5,773e-14  fy 4,263e-14
        A2  fx −7,105e-15  fy 4,263e-14

    Semuanya orde 1e-14 — lima orde besaran DI BAWAH 1e-9, yaitu presisi
    double biasa, bukan sisa lentur. I = 1e-6 memang membuat suku lenturnya
    tenggelam sepenuhnya, persis seperti yang diklaim header
    `rangka-truss.ts`. Jadi ambangnya tetap 1e-9.

    Kenapa dugaan yang keliru ini tidak dihapus saja: toleransi yang
    dilonggarkan "untuk berjaga-jaga" adalah cara paling sopan mematikan
    sebuah pemeriksa. Yang berikutnya menaikkan angka ini wajib menempelkan
    pengukuran seperti di atas, bukan alasan seperti di paragraf kedua.
  */
  const TOL_TRUSS = 1e-9

  it('Pratt 6 buhul, beban TAK simetris: tiap buhul seimbang', () => {
    const s = sisaBuhulTruss(trussPratt())
    // Pesan gagal menyebut buhulnya — tanpa itu, "1,3e-4" tak bisa dilacak
    // ke tempatnya di antara enam buhul.
    expect(`${s.buhul} ${s.maks < TOL_TRUSS}`).toBe(`${s.buhul} true`)
  })

  it('Howe 5 buhul: tiap buhul seimbang', () => {
    const s = sisaBuhulTruss(trussHowe())
    expect(s.maks).toBeLessThan(TOL_TRUSS)
  })

  it('Pratt vs Howe: arah diagonal BERBEDA — kalau sama, salah satunya salah', () => {
    /*
      Bukan sekadar keseimbangan. Ini memeriksa bahwa solver benar-benar
      membedakan topologi: pada Pratt (diagonal miring ke arah tengah)
      diagonal luar TARIK; pada Howe (miring ke arah luar) diagonal luar
      TEKAN. Solver yang mengabaikan arah batang akan memberi tanda yang sama
      untuk keduanya, dan itu tak menimbulkan galat — ia cuma membuat batang
      tekan lolos pemeriksaan tekuk yang tak pernah dijalankan.
    */
    const pratt = analisaTruss(trussPratt())
    const howe = analisaTruss(trussHowe())

    const d0Pratt = pratt.batang.find((b) => b.nama === 'D0')!
    const d0Howe = howe.batang.find((b) => b.nama === 'D0')!

    expect(d0Pratt.arah).toBe('tekan')   // B0 → A1, memikul geser tumpuan
    expect(d0Howe.arah).toBe('tarik')    // A0 → B1, arah kebalikannya
    expect(Math.sign(d0Pratt.gayaKn)).not.toBe(Math.sign(d0Howe.gayaKn))
  })

  it('truss acak berbenih: 60 variasi Pratt, tiap buhul tetap seimbang', () => {
    /*
      Geometri truss diacak — panjang panel, tinggi, luas penampang, dan beban
      di tiap buhul atas (termasuk NOL di sebagian buhul). Yang TIDAK diacak:
      topologinya, karena topologi acak menghasilkan truss labil yang membuat
      solver melempar, dan kasus yang melempar tak menguji apa pun.
    */
    const r = bikinAcak(BENIH ^ 0x7a55)
    const gagal: string[] = []
    for (let i = 0; i < 60; i++) {
      const L = r.riil(2, 6)
      const H = r.riil(1.5, 4)
      const a1 = r.riil(800, 4000)
      const a2 = r.riil(800, 4000)
      const a3 = r.riil(800, 4000)
      // Sebagian buhul sengaja TANPA beban — jalur `fyKn: 0` perlu dilewati.
      const p1 = i % 4 === 0 ? 0 : -r.riil(5, 120)
      const p2 = i % 5 === 0 ? 0 : -r.riil(5, 120)
      if (p1 === 0 && p2 === 0) continue   // truss tanpa beban tak menguji apa pun

      const input: InputTruss = {
        simpul: [
          { nama: 'B0', xM: 0, yM: 0, tumpuan: 'sendi' },
          { nama: 'B1', xM: L, yM: 0 },
          { nama: 'B2', xM: 2 * L, yM: 0 },
          { nama: 'B3', xM: 3 * L, yM: 0, tumpuan: 'rol-x' },
          { nama: 'A1', xM: L, yM: H },
          { nama: 'A2', xM: 2 * L, yM: H },
        ],
        batang: [
          { nama: 'BB0', dari: 0, ke: 1, aMm2: a1 },
          { nama: 'BB1', dari: 1, ke: 2, aMm2: a1 },
          { nama: 'BB2', dari: 2, ke: 3, aMm2: a1 },
          { nama: 'AA0', dari: 4, ke: 5, aMm2: a2 },
          { nama: 'V1', dari: 1, ke: 4, aMm2: a3 },
          { nama: 'V2', dari: 2, ke: 5, aMm2: a3 },
          { nama: 'D0', dari: 0, ke: 4, aMm2: a3 },
          { nama: 'D1', dari: 4, ke: 2, aMm2: a3 },
          { nama: 'D2', dari: 5, ke: 3, aMm2: a3 },
        ],
        beban: [{ simpul: 4, fyKn: p1 }, { simpul: 5, fyKn: p2 }],
      }
      const s = sisaBuhulTruss(input)
      if (!(s.maks < TOL_TRUSS)) {
        gagal.push(
          `truss#${i} L=${L.toFixed(3)} H=${H.toFixed(3)} `
          + `A=[${a1.toFixed(0)},${a2.toFixed(0)},${a3.toFixed(0)}] `
          + `P=[${p1.toFixed(3)},${p2.toFixed(3)}] → buhul ${s.buhul} sisa ${s.maks.toExponential(4)}`,
        )
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('ΣFy truss = total beban — reaksi diturunkan dari batang di tumpuan', () => {
    const input = trussPratt()
    const hasil = analisaTruss(input)
    const gaya = new Map(hasil.batang.map((b) => [b.nama, b.gayaKn]))

    let reaksiY = 0
    input.simpul.forEach((s, i) => {
      if (s.tumpuan === undefined) return
      let fy = 0
      for (const b of input.batang) {
        const N = gaya.get(b.nama)!
        const a = input.simpul[b.dari]!
        const z = input.simpul[b.ke]!
        const L = Math.hypot(z.xM - a.xM, z.yM - a.yM)
        const sin = (z.yM - a.yM) / L
        if (b.dari === i) fy += N * sin
        if (b.ke === i) fy -= N * sin
      }
      reaksiY += -fy
    })

    const totalBeban = input.beban.reduce((s, p) => s + p.fyKn, 0)
    const skala = Math.max(1, Math.abs(totalBeban))
    expect(Math.abs(reaksiY + totalBeban) / skala).toBeLessThan(TOL_TRUSS)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// INVARIAN LAPIS ATAS — lewat API publik `analisaPortal` / `analisaBalokMenerus`
// ══════════════════════════════════════════════════════════════════════════════

describe('invarian lapis 2-3 lewat API publiknya', () => {
  it('analisaBalokMenerus: momen di kedua ujung bentang tepi = 0, bentang apa pun', () => {
    /*
      Balok menerus bertumpu sederhana: momen di tumpuan PALING LUAR selalu
      nol, tak peduli berapa bentang atau seberapa tak samanya. Kalau ia bukan
      nol, tumpuan luarnya diam-diam jadi jepit — dan momen tumpuan yang tak
      seharusnya ada akan menaruh tulangan atas di tempat yang tak butuh,
      sementara lapangannya kurang.
    */
    const r = bikinAcak(BENIH ^ 0xbeef)
    const gagal: string[] = []
    for (let i = 0; i < 40; i++) {
      const n = r.bulat(1, 4)
      const bentangM: number[] = []
      for (let j = 0; j < n; j++) bentangM.push(r.riil(2, 12))
      const q = r.riil(5, 60)
      const h = analisaBalokMenerus({
        bentangM,
        bMm: r.riil(200, 800),
        hMm: r.riil(200, 800),
        fcMpa: r.riil(17, 35),
        qKnM: q,
      })
      const skala = q * Math.max(...bentangM) ** 2
      const m0 = h.momenTumpuanKnm[0]!
      const mAkhir = h.momenTumpuanKnm[h.momenTumpuanKnm.length - 1]!
      if (Math.abs(m0) / skala > TOL) gagal.push(`balok#${i} M tumpuan awal ${m0.toExponential(4)}`)
      if (Math.abs(mAkhir) / skala > TOL) gagal.push(`balok#${i} M tumpuan akhir ${mAkhir.toExponential(4)}`)
      expect(h.momenTumpuanKnm).toHaveLength(n + 1)
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('analisaPortal: M tumpuan balok + M lapangan = wL²/8, kekakuan kolom berapa pun', () => {
    /*
      Identitas yang disebut di komentar `analisaPortal` sendiri. Diuji di
      sini atas kombinasi acak — bukan satu kasus tangan — termasuk penampang
      kolom yang jauh lebih kecil DAN jauh lebih besar dari baloknya, yaitu
      dua ujung rentang di mana perilakunya mendekati balok sederhana dan
      mendekati jepit-jepit.
    */
    const r = bikinAcak(BENIH ^ 0xca5e)
    const gagal: string[] = []
    for (let i = 0; i < 40; i++) {
      const bentangM = r.riil(2, 12)
      const q = r.riil(5, 60)
      const h = analisaPortal({
        bentangM,
        tinggiM: r.riil(2.5, 5),
        jumlahLantai: r.bulat(1, 3),
        balok: { bMm: r.riil(200, 800), hMm: r.riil(200, 800) },
        kolom: { bMm: r.riil(200, 800), hMm: r.riil(200, 800) },
        fcMpa: r.riil(17, 35),
        qKnM: q,
      })
      for (const b of h.batang) {
        if (!b.nama.startsWith('B')) continue
        const mKiri = b.momenKnm.di[0]!.nilai
        const mKanan = b.momenKnm.di[b.momenKnm.di.length - 1]!.nilai
        const M1 = -mKiri
        const V1 = b.geserKn.di[0]!.nilai
        const mTengah = -M1 + V1 * (bentangM / 2) - q * (bentangM / 2) ** 2 / 2
        const selisih = mTengah - (mKiri + mKanan) / 2
        const harap = q * bentangM ** 2 / 8
        const rel = Math.abs(selisih - harap) / Math.abs(harap)
        if (!(rel < TOL)) {
          gagal.push(`portal#${i} ${b.nama} L=${bentangM.toFixed(3)} q=${q.toFixed(3)} → ${selisih.toFixed(6)} vs ${harap.toFixed(6)}`)
        }
      }
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })

  it('portal lateral MURNI: ΣFy reaksi = 0 dan Σ momen guling = Σ(F·h)', () => {
    /*
      Beban lateral saja, gravitasi dimatikan. Dua hal sekaligus:

        • total reaksi TEGAK harus nol — gaya mendatar tak menciptakan berat.
          Kolom kiri tertarik ke atas persis sebanyak kolom kanan tertekan.
        • momen guling: Σ(gaya lateral × tingginya) harus ditahan oleh kopel
          reaksi tegak + momen jepit di dasar.

      Ini tak bisa dilihat dari kasus gravitasi mana pun, dan kasus gravitasi
      itulah 6 dari 7 kasus tangan yang ada.
    */
    const r = bikinAcak(BENIH ^ 0x1a7e)
    const gagal: string[] = []
    for (let i = 0; i < 40; i++) {
      const lantai = r.bulat(1, 3)
      const tinggiM = r.riil(2.5, 5)
      const bentangM = r.riil(2, 12)
      const lateral: number[] = []
      for (let t = 0; t < lantai; t++) lateral.push(r.riil(1, 100))

      const kb = r.riil(200, 800)
      const kh = r.riil(200, 800)
      const bb = r.riil(200, 800)
      const bh = r.riil(200, 800)
      const fcMpa = r.riil(17, 35)
      const eMpa = 4700 * Math.sqrt(fcMpa)

      // Dirakit ulang ke lapis 1 supaya reaksinya bisa dipanen dari gaya ujung.
      const simpul: Simpul[] = []
      for (let t = 0; t <= lantai; t++) {
        simpul.push({ nama: `S${t}Ki`, xM: 0, yM: t * tinggiM, tumpuan: t === 0 ? 'jepit' : 'bebas' })
        simpul.push({ nama: `S${t}Ka`, xM: bentangM, yM: t * tinggiM, tumpuan: t === 0 ? 'jepit' : 'bebas' })
      }
      const batang: BatangModel[] = []
      for (let t = 0; t < lantai; t++) {
        batang.push({ nama: `K${t + 1}Ki`, dari: 2 * t, ke: 2 * (t + 1), eMpa, aMm2: kb * kh, iMm4: kb * kh ** 3 / 12 })
        batang.push({ nama: `K${t + 1}Ka`, dari: 2 * t + 1, ke: 2 * (t + 1) + 1, eMpa, aMm2: kb * kh, iMm4: kb * kh ** 3 / 12 })
        batang.push({ nama: `B${t + 1}`, dari: 2 * (t + 1), ke: 2 * (t + 1) + 1, eMpa, aMm2: bb * bh, iMm4: bb * bh ** 3 / 12, qKnM: 0 })
      }
      const beban: BebanTitik[] = lateral.map((fx, t) => ({ simpul: 2 * (t + 1), fxKn: fx }))

      const k: Kasus = { simpul, batang, beban, label: `lateral#${i} lantai=${lantai}` }
      const s = periksaKeseimbangan(k)
      if (!(s.simpulRelatif < TOL)) gagal.push(`${k.label} simpul ${s.simpulTerburuk} ${s.simpulRelatif.toExponential(4)}`)
      if (!(s.globalFyRelatif < TOL)) gagal.push(`${k.label} ΣFy ${s.globalFyRelatif.toExponential(4)}`)
      if (!(s.globalFxRelatif < TOL)) gagal.push(`${k.label} ΣFx ${s.globalFxRelatif.toExponential(4)}`)
      if (!(s.globalMRelatif < TOL)) gagal.push(`${k.label} ΣM ${s.globalMRelatif.toExponential(4)}`)
    }
    expect(gagal.slice(0, 5).join('\n')).toBe('')
    expect(gagal).toHaveLength(0)
  })
})

describe('BATANG MIRING berbeban merata — jalur yang tak tersentuh acakan', () => {
  /*
    ⚠ Lubang yang DIAKUI penulis berkas ini sendiri: seluruh 540 kombinasi acak
    memakai batang MENDATAR atau TEGAK saja. Pada batang mendatar cos=1, sin=0,
    sehingga T dan Tᵀ memberi angka yang sama — penukaran keduanya di
    `panenReaksi` tak akan terlihat.

    Batang MIRING adalah satu-satunya yang memaksa transformasi bekerja penuh:
    beban merata searah −y LOKAL menghasilkan resultan GLOBAL (qL·sin, −qL·cos),
    dua komponen yang keduanya bukan nol.

    Segitiga 3-4-5 dipilih supaya sin=0,6 dan cos=0,8 — pecahan yang tepat,
    jadi selisih sekecil apa pun bukan galat pembulatan.
  */
  const E = 200_000, A = 150_000, I = 300 * 500 ** 3 / 12, q = 20

  it.each([
    ['3-4-5 (sin 0,6 · cos 0,8)', 4, 3],
    ['45° (sin = cos)', 5, 5],
    ['tegak (cos = 0)', 0, 4],
    ['mendatar (sin = 0) — pembanding', 6, 0],
  ])('%s: ΣR + Σbeban = 0', (_nama, dx, dy) => {
    const L = Math.hypot(dx, dy)
    const h = analisaRangka2D(
      [{ nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
        { nama: 'B', xM: dx, yM: dy, tumpuan: 'jepit' }],
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: q }],
      [])

    const R = h.reaksi.reduce((a, r) => ({ fx: a.fx + r.fxKn, fy: a.fy + r.fyKn }),
      { fx: 0, fy: 0 })
    const cos = dx / L, sin = dy / L
    /* Resultan beban merata lokal, dibawa ke sumbu global. */
    const bebanX = q * L * sin
    const bebanY = -q * L * cos

    const skala = q * L
    expect(Math.abs(R.fx + bebanX) / skala).toBeLessThan(1e-9)
    expect(Math.abs(R.fy + bebanY) / skala).toBeLessThan(1e-9)
  })
})

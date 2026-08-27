/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BEBAN MATI & HIDUP → MOMEN DAN GAYA LINTANG — PURE, tanpa I/O
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── Celah yang ditutup
 *
 * `analisaBalok` menerima `muKnm` dan `vuKn` sebagai ANGKA JADI: momen rencana
 * harus dihitung sendiri di kertas, lalu diketik. Itu persis yang modul sloof
 * SENGAJA hindari, dan alasannya tertulis di halaman UI-nya:
 *
 *     "Estimator yang harus menghitung momen sloof sendiri di kertas akan
 *      salah, dan salahnya tak terlihat karena angka momen tak punya 'rasa
 *      benar' seperti dimensi."
 *
 * Dimensi yang salah ketik terlihat (balok 3000 mm jelas keliru). Momen yang
 * salah TIDAK: 120 kNm dan 210 kNm sama-sama terlihat wajar, dan yang salah
 * menghasilkan balok yang lolos pemeriksaan tapi tak kuat.
 *
 * Modul ini menghitungnya dari beban — yang bisa diperiksa orang lain.
 *
 * ── Yang DIHITUNG dan yang TIDAK
 *
 * Yang dihitung: balok di atas dua tumpuan (sederhana maupun menerus-perkiraan),
 * beban merata + beban terpusat, kombinasi 1,2D + 1,6L (SNI 1727:2020 §2.3.1).
 *
 * Yang TIDAK: analisa rangka statis tak tentu yang sesungguhnya — distribusi
 * momen antar-batang, kekakuan relatif kolom-balok, goyangan portal. Itu
 * pekerjaan pemodelan rangka, dan modul ini TIDAK berpura-pura menggantikannya.
 * Batas itu dinyatakan di `catatan` tiap hasil, bukan disembunyikan.
 *
 * ── Kenapa PURE
 *
 * Sama dengan seluruh `lib/struktur-*`: kesalahan momen tak menimbulkan galat,
 * ia menghasilkan angka yang terlihat wajar. Satu-satunya yang menangkapnya
 * adalah test yang membandingkan dengan hitungan tangan — dan itu hanya murah
 * kalau fungsinya bisa dipanggil tanpa basis, tanpa login, tanpa fixture.
 */

import {
  bebanDindingDari, fungsiRuang, lapisMatiDari,
} from './struktur-katalog-beban.js'

/** Satu lapis beban mati tambahan (finishing, plafon, MEP, dinding). */
export interface LapisBebanMati {
  nama: string
  /** kN/m² untuk beban luasan, atau kN/m untuk beban garis di atas balok. */
  nilai: number
}

export type SkemaBalok = 'sederhana' | 'menerus-tepi' | 'menerus-tengah' | 'kantilever'

export interface InputBebanBalok {
  bentangM: number
  /** Lebar daerah yang dipikul balok ini (m) — setengah bentang kiri + kanan. */
  lebarPikulM: number
  bMm: number
  hMm: number
  /** Tebal pelat yang dipikul (mm). 0 bila balok tak memikul pelat. */
  tebalPelatMm: number
  /*
    Beban mati bisa diberikan dua cara:

      `bebanMatiTambahan` — daftar {nama, nilai} apa adanya (jalur lama)
      `lapisMati`         — daftar KUNCI katalog, mis. ["keramik-spesi"]

    Yang kedua lebih disukai: angkanya datang dari katalog yang bisa
    diperiksa, bukan dari ingatan orang yang mengisi form.
  */
  bebanMatiTambahan?: LapisBebanMati[]
  /** Kunci lapisan dari `LAPIS_MATI` — diubah jadi angka oleh modul ini. */
  lapisMati?: readonly string[]
  /*
    Beban hidup: ANGKA atau FUNGSI RUANG.

    `fungsiRuangKunci` lebih disukai — SNI 1727 Tabel 4.3-1 sudah menetapkan
    angkanya per fungsi, dan selisih antar-fungsi besar (hunian 1,92 vs
    ruang rapat 4,79 vs rak perpustakaan 7,18 kN/m²). Angka yang diketik
    dari ingatan tak punya "rasa salah": 2,5 untuk ruang rapat terlihat
    wajar, dan baloknya lolos dengan beban separuh dari seharusnya.
  */
  bebanHidupKnM2?: number
  fungsiRuangKunci?: string
  /** Beban garis di atas balok, mis. dinding bata (kN/m). */
  bebanDindingKnM?: number
  /** Atau: jenis dinding dari katalog + tingginya — dihitung jadi kN/m. */
  jenisDinding?: string
  tinggiDindingM?: number
  /** Beban terpusat di tengah bentang (kN) — mis. balok anak yang bertumpu. */
  bebanTerpusatKn?: number
  skema?: SkemaBalok
  /** Berat jenis beton, kN/m³. Bawaan 24 (SNI 1727 Tabel bahan). */
  beratJenisBetonKnM3?: number
}

export interface HasilBebanBalok {
  /** Beban mati terfaktor & tak terfaktor (kN/m). */
  qMatiKnM: number
  qHidupKnM: number
  /** 1,2D + 1,6L (kN/m). */
  quKnM: number
  /** Beban terpusat terfaktor (kN). */
  puKn: number
  muKnm: number
  vuKn: number
  /** Rincian penyusun beban mati — supaya bisa diperiksa satu per satu. */
  rincianMati: Array<{ nama: string; knM: number }>
  /** Pembagi momen yang dipakai (8 untuk sederhana, dst). */
  pembagiMomen: number
  skema: SkemaBalok
  catatan: string[]
}

/*
  Koefisien momen per skema.

  Balok sederhana: wL²/8 — eksak untuk tumpuan sendi-rol.

  Menerus: SNI 2847 §6.5 mengizinkan koefisien PERKIRAAN (wL²/10, wL²/11,
  wL²/16) dengan syarat yang ketat — bentang hampir sama, beban merata,
  L/D ≤ 3. Yang dipakai di sini nilai yang LAZIM dan konservatif untuk
  perencanaan awal, dan syaratnya disebutkan di catatan.

  ⚠ Kantilever memakai wL²/2 — dan itu DELAPAN KALI lipat balok sederhana
  pada bentang yang sama. Salah memilih skema di sini adalah kesalahan yang
  paling mahal di modul ini, karena hasilnya tetap "terlihat wajar".
*/
const PEMBAGI_MOMEN: Record<SkemaBalok, number> = {
  sederhana: 8,
  'menerus-tepi': 10,
  'menerus-tengah': 11,
  kantilever: 2,
}

/** Gaya lintang: sederhana & menerus qL/2; kantilever qL penuh. */
const FAKTOR_GESER: Record<SkemaBalok, number> = {
  sederhana: 0.5,
  'menerus-tepi': 0.55,
  'menerus-tengah': 0.5,
  kantilever: 1,
}

function angkaWajib(nilai: unknown, nama: string, { bolehNol = false } = {}): number {
  const n = Number(nilai)
  if (!Number.isFinite(n)) throw new Error(`${nama} wajib angka (diterima: ${nilai})`)
  if (n < 0) throw new Error(`${nama} tak boleh negatif (diterima: ${n})`)
  if (!bolehNol && n === 0) throw new Error(`${nama} harus lebih besar dari nol`)
  return n
}

/**
 * Hitung momen & gaya lintang rencana dari beban mati dan beban hidup.
 *
 * Memulangkan juga RINCIAN penyusun beban matinya, supaya tiap suku bisa
 * diperiksa orang lain — angka `qu` tunggal tak bisa diaudit siapa pun.
 */
export function analisaBebanBalok(input: InputBebanBalok): HasilBebanBalok {
  /*
    ── Pilihan katalog diterjemahkan jadi angka LEBIH DULU

    Sesudah titik ini, sisa fungsi hanya berurusan dengan angka — tak ada
    cabang "kalau pakai katalog" yang berserakan di bawah. Dua jalur yang
    bercabang di banyak tempat adalah dua jalur yang bisa berselisih.
  */
  const dariKatalog = input.lapisMati?.length ? lapisMatiDari(input.lapisMati) : []
  const dariAngka = Array.isArray(input.bebanMatiTambahan) ? input.bebanMatiTambahan : null

  if (!dariAngka && !input.lapisMati) {
    /*
      Keduanya HILANG ditolak — bukan dianggap nol. Beban mati tambahan yang
      diam-diam nol membuat balok terlihat jauh lebih kuat: finishing,
      plafon, dan MEP lazimnya 1,5-2,5 kN/m², setara sepertiga beban hidup
      hunian.
    */
    throw new Error(
      'Beban mati tambahan wajib diisi: `lapisMati` (kunci katalog) atau '
      + '`bebanMatiTambahan` (daftar angka). Kirim [] bila memang tak ada — '
      + 'daftar yang HILANG diperlakukan sebagai kesalahan, bukan nol.')
  }

  /*
    Beban hidup: fungsi ruang MENANG atas angka yang diketik.

    Kalau keduanya diisi, yang dipakai adalah angka SNI — karena itu yang
    bisa diperiksa orang lain. Membiarkan angka bebas menimpa tabel berarti
    tabelnya cuma hiasan.
  */
  let hidupKnM2Efektif = input.bebanHidupKnM2
  let namaFungsi: string | null = null
  if (input.fungsiRuangKunci) {
    const f = fungsiRuang(input.fungsiRuangKunci)
    if (!f) {
      throw new Error(`Fungsi ruang "${input.fungsiRuangKunci}" tak dikenal.`)
    }
    hidupKnM2Efektif = f.bebanHidupKnM2
    namaFungsi = f.nama
  }
  if (hidupKnM2Efektif === undefined || hidupKnM2Efektif === null) {
    throw new Error(
      'Beban hidup wajib: pilih `fungsiRuangKunci` (SNI 1727 Tabel 4.3-1) '
      + 'atau isi `bebanHidupKnM2` langsung.')
  }

  /* Dinding: katalog (jenis + tinggi) atau kN/m langsung. */
  let dindingEfektif = Number(input.bebanDindingKnM ?? 0)
  let namaDinding: string | null = null
  if (input.jenisDinding) {
    dindingEfektif = bebanDindingDari(input.jenisDinding, Number(input.tinggiDindingM))
    namaDinding = input.jenisDinding
  }

  const bentang = angkaWajib(input.bentangM, 'Bentang balok (bentangM)')
  const lebarPikul = angkaWajib(input.lebarPikulM, 'Lebar daerah pikul (lebarPikulM)', { bolehNol: true })
  const b = angkaWajib(input.bMm, 'Lebar balok (bMm)')
  const h = angkaWajib(input.hMm, 'Tinggi balok (hMm)')
  const tebalPelat = angkaWajib(input.tebalPelatMm, 'Tebal pelat (tebalPelatMm)', { bolehNol: true })
  const hidupKnM2 = angkaWajib(hidupKnM2Efektif, 'Beban hidup', { bolehNol: true })

  const skema: SkemaBalok = input.skema ?? 'sederhana'
  if (!PEMBAGI_MOMEN[skema]) {
    throw new Error(`Skema balok tak dikenal: ${skema}. Pilihan: ${Object.keys(PEMBAGI_MOMEN).join(', ')}`)
  }

  const bjBeton = Number(input.beratJenisBetonKnM3 ?? 24)
  const catatan: string[] = []
  const rincianMati: Array<{ nama: string; knM: number }> = []

  /* 1. Berat sendiri balok — selalu ada, tak pernah boleh lupa. */
  const beratSendiri = (b / 1000) * (h / 1000) * bjBeton
  rincianMati.push({ nama: `Berat sendiri balok ${b}×${h}`, knM: beratSendiri })

  /* 2. Berat pelat yang dipikul. */
  if (tebalPelat > 0 && lebarPikul > 0) {
    const beratPelat = (tebalPelat / 1000) * bjBeton * lebarPikul
    rincianMati.push({ nama: `Pelat t=${tebalPelat} mm × lebar pikul ${lebarPikul} m`, knM: beratPelat })
  }

  /* 3. Beban mati tambahan (kN/m² × lebar pikul). */
  /*
    Katalog dan angka DIGABUNG, bukan salah satu.

    Sebagian proyek memakai katalog untuk lapisan baku lalu menambahkan satu
    beban khusus yang tak ada daftarnya (mis. kolam ikan di lantai 2).
    Memaksa memilih salah satu membuat kasus itu tak bisa dihitung sama
    sekali.
  */
  for (const lapis of [...dariKatalog, ...(dariAngka ?? [])]) {
    const nilai = Number(lapis?.nilai)
    if (!Number.isFinite(nilai) || nilai < 0) {
      throw new Error(`Beban mati "${lapis?.nama ?? '(tanpa nama)'}" bukan angka sah: ${lapis?.nilai}`)
    }
    rincianMati.push({
      nama: `${lapis?.nama ?? 'Beban mati'} (${nilai} kN/m² × ${lebarPikul} m)`,
      knM: nilai * lebarPikul,
    })
  }

  /* 4. Dinding di atas balok — beban GARIS, tak dikali lebar pikul. */
  const dinding = dindingEfektif
  if (dinding > 0) {
    rincianMati.push({ nama: 'Dinding di atas balok', knM: dinding })
  }

  const qMatiKnM = rincianMati.reduce((a, x) => a + x.knM, 0)
  const qHidupKnM = hidupKnM2 * lebarPikul

  /*
    Kombinasi 1,2D + 1,6L — SNI 1727:2020 §2.3.1 kombinasi 2.

    Kombinasi lain (termasuk gempa) TIDAK dihitung di sini: gempa butuh
    berat seismik seluruh bangunan, bukan satu balok. Modul
    `struktur-beban-lateral` yang menanganinya.
  */
  const quKnM = 1.2 * qMatiKnM + 1.6 * qHidupKnM
  const puKn = 1.6 * Number(input.bebanTerpusatKn ?? 0)

  const pembagiMomen = PEMBAGI_MOMEN[skema]
  const momenMerata = (quKnM * bentang * bentang) / pembagiMomen
  /*
    Beban terpusat di tengah bentang: PL/4 untuk balok sederhana.
    Untuk menerus dipakai PL/8 (perkiraan), kantilever PL penuh.
  */
  const pembagiTerpusat = skema === 'kantilever' ? 1 : skema === 'sederhana' ? 4 : 8
  const momenTerpusat = skema === 'kantilever'
    ? puKn * bentang
    : (puKn * bentang) / pembagiTerpusat

  const muKnm = momenMerata + momenTerpusat
  const vuKn = quKnM * bentang * FAKTOR_GESER[skema] + puKn * (skema === 'kantilever' ? 1 : 0.5)

  // ── Catatan & batas ───────────────────────────────────────────────────────
  catatan.push(
    `Kombinasi beban 1,2D + 1,6L (SNI 1727:2020 §2.3.1). D = ${qMatiKnM.toFixed(2)} kN/m, `
    + `L = ${qHidupKnM.toFixed(2)} kN/m, qu = ${quKnM.toFixed(2)} kN/m.`)

  if (skema === 'sederhana') {
    catatan.push(
      'Momen memakai wL²/8 — EKSAK untuk balok di atas dua tumpuan sederhana. '
      + 'Bila baloknya sebenarnya MENERUS, angka ini terlalu besar di tengah '
      + 'dan NOL di tumpuan, padahal tumpuan menerus justru bermomen negatif '
      + 'besar. Pilih skema yang sesuai.')
  } else if (skema === 'kantilever') {
    catatan.push(
      'KANTILEVER: momen wL²/2 — delapan kali balok sederhana pada bentang '
      + 'yang sama, dan momennya di TUMPUAN, bukan di tengah. Tulangan tarik '
      + 'harus di ATAS. Salah menaruhnya membuat balok runtuh pada beban jauh '
      + 'di bawah rencana.')
  } else {
    catatan.push(
      `Momen memakai koefisien PERKIRAAN wL²/${pembagiMomen} (SNI 2847 §6.5). `
      + 'Sah hanya bila: bentang bersebelahan tak berbeda >20%, beban merata, '
      + 'dan beban hidup ≤ 3× beban mati. Di luar itu perlu analisa rangka.')
  }

  catatan.push(
    'Yang BELUM diperhitungkan: kekakuan relatif kolom-balok, goyangan portal, '
    + 'dan redistribusi momen. Modul ini menghitung balok sebagai batang '
    + 'terpisah — bukan pengganti pemodelan rangka.')

  if (dinding > 0) {
    catatan.push(
      (namaDinding
        ? `Dinding "${namaDinding}" setinggi ${input.tinggiDindingM} m = `
          + `${Math.round(dinding * 100) / 100} kN/m. `
        : '')
      + 'Beban dinding dihitung sebagai beban GARIS penuh sepanjang balok. '
      + 'Bila dindingnya berpintu/berjendela, angka ini konservatif.')
  }

  if (namaFungsi) {
    /*
      Fungsi ruangnya DISEBUT di hasil. Angka 4,79 kN/m² tanpa keterangan tak
      bisa diperiksa siapa pun; "Restoran (SNI 1727 Tabel 4.3-1)" bisa.
    */
    catatan.push(
      `Beban hidup ${hidupKnM2} kN/m² dari fungsi ruang "${namaFungsi}" `
      + '(SNI 1727:2020 Tabel 4.3-1) — dipilih dari katalog, bukan diketik.')
  } else if (qHidupKnM > 0) {
    catatan.push(
      `Beban hidup ${hidupKnM2} kN/m² DIKETIK LANGSUNG, bukan dari tabel SNI. `
      + 'Pilih fungsi ruangnya bila memungkinkan: selisih antar-fungsi besar '
      + '(hunian 1,92 · kantor 2,40 · ruang rapat 4,79 · rak perpustakaan 7,18).')
  }

  return {
    qMatiKnM, qHidupKnM, quKnM, puKn,
    muKnm, vuKn,
    rincianMati, pembagiMomen, skema, catatan,
  }
}

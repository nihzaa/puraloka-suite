// Rangka batang baja: kuda-kuda & gording (SNI 1729:2020). PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Kuda-kuda adalah bentuk struktur baja yang PALING SERING dibangun di
// Indonesia — gudang, pabrik, kanopi, gedung olahraga — dan modul ini belum
// bisa menghitungnya sama sekali. Yang ada baru balok, kolom, dan sambungan
// batang tunggal.
//
// ── Kenapa rangka batang butuh perhitungan sendiri
//
// Batang pada rangka kuda-kuda hanya menerima TARIK atau TEKAN murni — tak ada
// lentur, karena sambungannya dianggap sendi. Itu membuatnya jauh lebih efisien
// daripada balok: bahan bekerja penuh di seluruh penampang.
//
// Tetapi konsekuensinya: batang TEKAN pada rangka bisa jauh lebih langsing
// daripada kolom, dan tekuk jadi penentu hampir selalu. Batang tarik justru
// sebaliknya — ia bisa setipis apa pun secara kekuatan, dan yang membatasinya
// adalah KELANGSINGAN supaya tak melendut sendiri oleh beratnya dan bergetar
// saat angin.
//
// ── Yang paling sering salah: batang yang berganti tanda
//
// Angin hisap (uplift) MEMBALIK arah gaya pada rangka atap: batang bawah yang
// biasanya tarik jadi tekan, dan batang yang dirancang tipis karena "cuma
// tarik" mendadak harus menahan tekan. Ini penyebab runtuh kuda-kuda yang
// paling sering di Indonesia — atap terangkat saat angin kencang, bukan roboh
// karena beban berat.
//
// Karena itu modul ini MENUNTUT arah gaya dinyatakan, dan memperingatkan bila
// sebuah batang hanya diperiksa untuk satu arah.
//
// ⚠ BATAS TANGGUNG JAWAB. Yang dihitung: kapasitas BATANG pada gaya yang
// diberikan. Yang TIDAK: analisis struktur untuk MENCARI gaya batangnya
// (butuh metode joint/section atau perangkat lunak analisis), dan sambungan
// buhulnya. Gaya batang harus datang dari perhitungan atau perangkat lain.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa, VolumeElemen } from './struktur-beton.js'
import {
  luasPenampang, radiusGirasiY, kapasitasTekan, klasifikasiPenampang,
  PHI, type ProfilBaja, type MutuBaja,
} from './struktur-baja.js'

/** Arah gaya pada satu batang rangka. */
export type ArahGaya = 'tarik' | 'tekan'

export interface BatangRangka {
  /** Nama batang: "A1", "diagonal-3", "batang bawah". */
  nama: string
  profil: ProfilBaja
  /** Panjang batang (jarak antar titik buhul), m. */
  panjangM: number
  /**
   * Gaya terfaktor, kN. POSITIF = tarik, NEGATIF = tekan.
   *
   * Satu angka bertanda, bukan dua medan terpisah: memisahkannya membuat
   * seseorang bisa mengisi keduanya dan modul harus menebak mana yang berlaku.
   */
  gayaKn: number
  /**
   * Gaya BALIK akibat angin hisap, kN — bila ada.
   *
   * Diisi bila batang ini berganti tanda pada kombinasi beban angin. Batang
   * bawah kuda-kuda yang biasanya TARIK bisa jadi TEKAN saat atap terangkat,
   * dan batang tipis yang dirancang untuk tarik akan menekuk.
   */
  gayaBalikKn?: number
  /**
   * Faktor panjang efektif K. Bawaan 1,0 (sendi-sendi) — lazim untuk rangka
   * batang karena sambungan buhul memang mendekati sendi.
   */
  faktorK?: number
}

export interface InputRangka {
  /** Nama rangka: "KK-1", "kuda-kuda bentang 12 m". */
  nama: string
  mutu: MutuBaja
  batang: BatangRangka[]
  /** Jumlah rangka identik — volume dikalikan ini. */
  jumlah?: number
}

export interface HasilBatangRangka {
  nama: string
  arah: ArahGaya
  periksa: Periksa[]
  aman: boolean
  kelangsingan: number
  catatan: string[]
}

export interface HasilRangka {
  periksa: Periksa[]
  aman: boolean
  batang: HasilBatangRangka[]
  volume: VolumeElemen
  antara: Record<string, number>
  catatan: string[]
}

/**
 * Batas kelangsingan (SNI 1729 §D1 & §E2).
 *
 *   TEKAN 200 — soal bisa-dibangun: batang langsing sudah melengkung sejak
 *               dari pabrik dan bertambah bengkok saat diangkut.
 *   TARIK 300 — batang tarik tak bisa menekuk, tetapi yang terlalu langsing
 *               MELENDUT oleh beratnya sendiri dan BERGETAR saat angin.
 *               Getaran itu melelahkan sambungannya, dan kelelahan tak
 *               terlihat sampai sambungannya retak.
 */
export const BATAS_KELANGSINGAN = { tekan: 200, tarik: 300 } as const

function bilanganPositif(nama: string, v: number): void {
  if (!(v > 0)) throw new Error(`${nama} harus > 0`)
}

const rasio = (tuntutan: number, kapasitas: number) =>
  kapasitas > 0 ? tuntutan / kapasitas : Number.POSITIVE_INFINITY

/**
 * Kapasitas TARIK nominal, kN (SNI 1729 §D2).
 *
 * Dua keadaan batas, dan yang menentukan bisa berbeda per batang:
 *
 *   leleh penampang UTUH    Pn = Fy · Ag
 *   putus penampang NETO    Pn = Fu · Ae     (Ae = luas dikurangi lubang baut)
 *
 * Yang kedua sering terlupa: batang tarik yang disambung dengan baut punya
 * lubang, dan lubang itu mengurangi luas justru di tempat gayanya penuh.
 * Batang yang lulus "leleh" bisa PUTUS di lubang bautnya.
 */
export function kapasitasTarik(
  p: ProfilBaja, mutu: MutuBaja, luasNetoMm2?: number,
): { phiPnKn: number; penentu: 'leleh' | 'putus'; phi: number } {
  const ag = luasPenampang(p)
  const ae = luasNetoMm2 ?? ag

  const leleh = (mutu.fyMpa * ag) / 1000
  const putus = (mutu.fuMpa * ae) / 1000

  /*
    Yang dipulangkan nilai BER-PHI, bukan nominal.

    Percobaan pertama memulangkan `pnKn` nominal sementara keputusan "mana yang
    menentukan" dibuat SESUDAH phi diterapkan — sehingga nilainya bisa tak
    konsisten dengan penentunya. Test menangkapnya: profil berlubang
    memulangkan `pnKn` 444 kN (nominal leleh) padahal penentunya 'putus'
    (415 kN ber-phi).

    Angka nominal tanpa phi tak dipakai siapa pun di modul ini, dan
    memulangkannya cuma mengundang pemakaian yang salah.

    phi berbeda untuk kedua keadaan batas: 0,90 leleh, 0,75 putus — karena
    putus terjadi mendadak sementara leleh memberi peringatan berupa
    perpanjangan yang terlihat.
  */
  const phiLeleh = PHI.tarik * leleh
  const phiPutus = 0.75 * putus

  return phiLeleh <= phiPutus
    ? { phiPnKn: phiLeleh, penentu: 'leleh', phi: PHI.tarik }
    : { phiPnKn: phiPutus, penentu: 'putus', phi: 0.75 }
}

/**
 * Analisa satu batang rangka.
 *
 * Arah gaya menentukan pemeriksaan mana yang berlaku — dan gaya BALIK
 * diperiksa terpisah, karena batang yang berganti tanda harus lulus KEDUANYA.
 */
export function analisaBatangRangka(
  b: BatangRangka, mutu: MutuBaja,
): HasilBatangRangka {
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA `pastikanProfilDidukung` TIDAK dipanggil di sini — dan apa gantinya
    ══════════════════════════════════════════════════════════════════════════

    Sempat dipasang 2026-08-27, lalu DICABUT pada hari yang sama setelah diukur:
    ia merahkan 33 test yang sah. Sebabnya modul ini memang DIRANCANG untuk
    siku — `L 70x70x7` adalah data ujinya, karena siku profil paling lazim
    untuk batang diagonal rangka — dan bagian yang menanganinya sudah benar:
    berat per meter dari tabel, volume, dan potong-batang standar 6 m.

    Yang meminjam rumus profil I hanya bagian KEKUATAN TEKAN: `radiusGirasiY`
    memakai Iy profil I, sementara siku menekuk terhadap sumbu utama yang
    MIRING (dan bisa tekuk torsi-lentur). Pagar total mematikan volume & tarik
    yang sah demi menahan satu bagian — obat yang lebih merusak dari penyakit.

    Karena itu peringatannya ditempel pada hasilnya (`catatan`), tempat ia
    terbaca oleh yang memakai angkanya, bukan lemparan yang menutup modul.

    ⚠ Ini bukan perbaikan, melainkan pengungkapan. Rumus siku yang benar
    (sumbu utama miring + shear lag pada sambungan satu kaki, SNI 1729)
    tercatat sebagai keputusan terbuka di `RATIFIKASI.md` (R-018) — arah teknisnya
    milik founder, bukan saya.
  */
  const jenisProfil = (b.profil.profile_type || '').toUpperCase()
  const pinjamRumusI = !['WF', 'H'].includes(jenisProfil)
  bilanganPositif(`Panjang batang ${b.nama}`, b.panjangM)

  const catatan: string[] = []

  /*
    Peringatan ditempel pada TIAP hasil yang memakai rumus pinjaman — bukan
    sekali di dokumentasi. Yang membaca angka kapasitas tekan di layar tak
    pernah membuka berkas ini.
  */
  if (pinjamRumusI) {
    catatan.push(
      `Batang ${b.nama} berprofil ${b.profil.profile_type} memakai rumus `
      + 'kelangsingan profil I. Untuk siku (sumbu utama MIRING) dan kanal, '
      + 'kapasitas TEKAN yang dihasilkan TERLALU BESAR — periksakan ke '
      + 'perencana sebelum dipakai sebagai dasar. Berat, volume, dan '
      + 'kapasitas TARIK tetap sah.',
    )
  }

  const k = b.faktorK ?? 1.0
  const ry = radiusGirasiY(b.profil)
  const kelangsingan = (k * b.panjangM * 1000) / ry
  const arah: ArahGaya = b.gayaKn >= 0 ? 'tarik' : 'tekan'
  const besar = Math.abs(b.gayaKn)

  const periksa: Periksa[] = []

  if (arah === 'tekan') {
    const tekan = kapasitasTekan(b.profil, mutu, b.panjangM, k)
    const phiPn = PHI.tekan * tekan.pnKn
    periksa.push({
      nama: 'Tekan batang rangka', nilai: phiPn, syarat: besar,
      satuan: 'kN', aman: phiPn >= besar, rasio: rasio(besar, phiPn),
      rumus: 'phiPn = 0.85 x Fcr x Ag (SNI 1729 §E3, sumbu LEMAH)',
    })
  } else {
    const tarik = kapasitasTarik(b.profil, mutu)
    const phiPn = tarik.phiPnKn
    periksa.push({
      nama: 'Tarik batang rangka', nilai: phiPn, syarat: besar,
      satuan: 'kN', aman: phiPn >= besar, rasio: rasio(besar, phiPn),
      rumus: tarik.penentu === 'leleh'
        ? 'phiPn = 0.90 x Fy x Ag (leleh penampang utuh)'
        : 'phiPn = 0.75 x Fu x Ae (putus di penampang berlubang baut)',
    })
    catatan.push(
      'Luas NETO (dikurangi lubang baut) tak diisi, jadi dianggap sama dengan '
      + 'luas utuh. Batang tarik yang disambung BAUT punya lubang tepat di '
      + 'tempat gayanya penuh — dan batang yang lulus leleh bisa PUTUS di '
      + 'lubang bautnya. Isi luas neto bila sambungannya berbaut.',
    )
  }

  const batas = BATAS_KELANGSINGAN[arah]
  periksa.push({
    nama: `Kelangsingan batang (${arah})`, nilai: batas, syarat: kelangsingan,
    satuan: '—', aman: kelangsingan <= batas, rasio: kelangsingan / batas,
    rumus: arah === 'tekan'
      ? 'KL/r <= 200 — batas soal BISA DIBANGUN, bukan rumus'
      : 'KL/r <= 300 — batang tarik terlalu langsing MELENDUT & BERGETAR',
  })

  /*
    GAYA BALIK — penyebab runtuh kuda-kuda paling sering di Indonesia.

    Angin hisap membalik arah gaya: batang bawah yang biasanya tarik jadi
    tekan. Batang yang dirancang tipis karena "cuma tarik" mendadak harus
    menahan tekan, dan ia menekuk. Atap terangkat saat angin kencang, bukan
    roboh karena beban berat.
  */
  if (b.gayaBalikKn !== undefined && b.gayaBalikKn !== 0) {
    const arahBalik: ArahGaya = b.gayaBalikKn >= 0 ? 'tarik' : 'tekan'
    const besarBalik = Math.abs(b.gayaBalikKn)

    if (arahBalik === 'tekan') {
      const tekan = kapasitasTekan(b.profil, mutu, b.panjangM, k)
      const phiPn = PHI.tekan * tekan.pnKn
      periksa.push({
        nama: 'Tekan saat gaya BERBALIK (angin hisap)', nilai: phiPn,
        syarat: besarBalik, satuan: 'kN',
        aman: phiPn >= besarBalik, rasio: rasio(besarBalik, phiPn),
        rumus: 'Batang tarik yang BERBALIK jadi tekan saat angin hisap — '
          + 'penyebab runtuh kuda-kuda paling sering',
      })
    } else {
      const tarik = kapasitasTarik(b.profil, mutu)
      const phiPn = tarik.phiPnKn
      periksa.push({
        nama: 'Tarik saat gaya BERBALIK', nilai: phiPn, syarat: besarBalik,
        satuan: 'kN', aman: phiPn >= besarBalik, rasio: rasio(besarBalik, phiPn),
        rumus: 'phiPn = 0.90 x Fy x Ag pada kombinasi beban yang membalik',
      })
    }
  } else if (arah === 'tarik') {
    catatan.push(
      'GAYA BALIK tidak diisi. Pada rangka ATAP, angin hisap membalik arah '
      + 'gaya: batang tarik jadi TEKAN, dan batang tipis yang dirancang untuk '
      + 'tarik akan MENEKUK. Ini penyebab runtuh kuda-kuda paling sering di '
      + 'Indonesia — atap terangkat saat angin kencang. Isi gaya balik bila '
      + 'rangka ini menahan atap.',
    )
  }

  const kelas = klasifikasiPenampang(b.profil, mutu.fyMpa)
  if (arah === 'tekan' && (kelas.sayap !== 'kompak' || kelas.badan !== 'kompak')) {
    catatan.push(
      `Penampang batang ${b.nama} TIDAK kompak (sayap: ${kelas.sayap}, `
      + `badan: ${kelas.badan}) — kapasitas tekannya belum memperhitungkan `
      + 'tekuk lokal, jadi nilainya TERLALU BESAR.',
    )
  }

  return {
    nama: b.nama,
    arah,
    periksa,
    aman: periksa.every((p) => p.aman),
    kelangsingan,
    catatan,
  }
}

/**
 * Analisa rangka batang lengkap.
 *
 * Verdict rangka = SELURUH batangnya aman. Satu batang yang gagal
 * menggagalkan rangkanya, karena rangka batang tak punya jalur beban
 * cadangan: setiap batang memikul bagiannya sendiri, dan yang putus membuat
 * rangka jadi mekanisme yang runtuh seketika.
 *
 * Itu berbeda dari struktur portal beton, yang bisa menyalurkan beban lewat
 * jalur lain saat satu bagian meleleh — dan perbedaan itu sering diremehkan.
 */
export function analisaRangka(input: InputRangka): HasilRangka {
  const { mutu, batang } = input
  if (batang.length === 0) throw new Error('Rangka harus punya minimal satu batang')

  const jumlah = input.jumlah ?? 1
  const hasilBatang = batang.map((b) => analisaBatangRangka(b, mutu))

  const gagal = hasilBatang.filter((h) => !h.aman)
  const periksa: Periksa[] = [
    {
      nama: 'Seluruh batang rangka aman', nilai: batang.length - gagal.length,
      syarat: batang.length, satuan: 'batang',
      aman: gagal.length === 0,
      rasio: batang.length > 0 ? gagal.length / batang.length : 0,
      rumus: 'Rangka batang tak punya jalur beban cadangan — satu batang '
        + 'yang putus membuatnya jadi mekanisme yang runtuh seketika',
    },
  ]

  const catatan: string[] = []
  if (gagal.length > 0) {
    catatan.push(
      `${gagal.length} batang tidak aman: ${gagal.map((g) => g.nama).join(', ')}. `
      + 'Rangka batang TAK punya jalur beban cadangan — berbeda dari portal '
      + 'beton yang bisa menyalurkan beban lewat jalur lain saat satu bagian '
      + 'meleleh.',
    )
  }

  // Catatan tiap batang ikut naik, tanpa duplikat.
  for (const h of hasilBatang) {
    for (const c of h.catatan) if (!catatan.includes(c)) catatan.push(c)
  }

  catatan.push(
    'GAYA BATANG harus datang dari analisis struktur (metode buhul/potongan '
    + 'atau perangkat lunak). Modul ini memeriksa apakah profil sanggup '
    + 'menahan gaya yang DIBERIKAN — ia tidak mencari gayanya.',
  )

  catatan.push(
    'SAMBUNGAN BUHUL (pelat simpul, baut/las di titik pertemuan) tidak '
    + 'dihitung di sini. Pada rangka batang, buhul menerima gaya dari beberapa '
    + 'batang sekaligus dan sering jadi bagian yang paling sulit — hitung '
    + 'terpisah lewat analisa sambungan.',
  )

  return {
    periksa,
    aman: gagal.length === 0,
    batang: hasilBatang,
    volume: volumeRangka(batang, jumlah),
    antara: {
      jumlahBatang: batang.length,
      jumlahGagal: gagal.length,
      panjangTotalM: batang.reduce((s, b) => s + b.panjangM, 0) * jumlah,
      jumlah,
    },
    catatan,
  }
}

/**
 * Volume rangka — dijumlahkan per PROFIL, bukan per batang.
 *
 * Kuda-kuda 20 batang dengan 3 jenis profil menghasilkan 3 baris pembelian,
 * bukan 20. Yang dipesan adalah profilnya, sejumlah total panjangnya.
 */
function volumeRangka(batang: BatangRangka[], jumlah: number): VolumeElemen {
  const perProfil = new Map<string, { profil: ProfilBaja; panjangM: number }>()

  for (const b of batang) {
    const kunci = `${b.profil.profile_type}|${b.profil.designation}`
    const ada = perProfil.get(kunci)
    if (ada) ada.panjangM += b.panjangM * jumlah
    else perProfil.set(kunci, { profil: b.profil, panjangM: b.panjangM * jumlah })
  }

  const besi = [...perProfil.values()].map(({ profil, panjangM }) => {
    const panjangStandar = profil.panjangStandarM > 0 ? profil.panjangStandarM : 12
    /*
      Batang dihitung dari TOTAL panjang, bukan per batang rangka.

      Kuda-kuda dengan 8 batang diagonal @1,5 m butuh 12 m total = 1 batang
      standar, bukan 8. Menghitung per batang membuat RAP delapan kali lipat.
      Pemotongan memang menyisakan potongan, tetapi potongan rangka biasanya
      terpakai untuk batang lain karena panjangnya beragam.
    */
    const batangBeli = Math.ceil(panjangM / panjangStandar)
    return {
      tipe: 'BjTS' as const,
      diameterMm: profil.hMm,
      peran: `profil ${profil.profile_type} ${profil.designation}`,
      jumlahBatang: batangBeli,
      panjangPerBatangM: panjangStandar,
      beratKgPerM: profil.beratKgPerM,
      totalKg: batangBeli * panjangStandar * profil.beratKgPerM,
    }
  })

  const terpasangKg = [...perProfil.values()]
    .reduce((s, { profil, panjangM }) => s + profil.beratKgPerM * panjangM, 0)

  return {
    betonM3: 0,
    bekistingM2: 0,
    besi,
    besiTotalKg: besi.reduce((s, b) => s + b.totalKg, 0),
    beratSendiriKg: terpasangKg,
  }
}

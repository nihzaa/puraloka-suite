/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENURUNAN PONDASI — yang meretakkan bangunan bukan turunnya, melainkan
 * turun TAK SAMA RATA
 *
 * Seluruh pemeriksaan pondasi di aplikasi ini menjawab satu pertanyaan:
 * "apakah tanahnya sanggup memikul tanpa runtuh?" Itu pertanyaan tentang
 * KERUNTUHAN, dan jawabannya hampir selalu ya.
 *
 * Yang merusak bangunan biasanya bukan itu. Bangunan bisa turun sepuluh
 * sentimeter dengan selamat asalkan turunnya BERSAMA-SAMA — Menara Pisa turun
 * tiga meter dan masih berdiri. Yang meretakkan dinding, memacetkan pintu, dan
 * memutus pipa adalah SELISIH penurunan antara satu kolom dengan kolom
 * sebelahnya.
 *
 * ── Kenapa ini sering dilewatkan
 *
 * Daya dukung izin (`qa`) yang dipakai di seluruh modul pondasi SUDAH memuat
 * angka keamanan 3, dan angka itu diturunkan dari keruntuhan geser. Pada pasir
 * padat, batasan penurunan hampir selalu terpenuhi dengan sendirinya. Pada
 * LEMPUNG LUNAK tidak: pondasi bisa lulus daya dukung dengan SF 3 dan tetap
 * turun 8 cm, dan 8 cm yang tak seragam meretakkan seluruh bangunan.
 *
 * Karena itu modul ini memisahkan dua hal yang selalu tertukar:
 *
 *   penurunan TOTAL     — berapa sentimeter bangunan turun
 *   penurunan DIFERENSIAL — berapa selisihnya antar kolom, dan seberapa
 *                            miring lantai jadinya (distorsi sudut)
 *
 * Yang kedua yang punya ambang kerusakan, dan yang kedua yang jarang dihitung.
 *
 * ── Batas yang JUJUR
 *
 * Ini perhitungan PERKIRAAN untuk perencanaan awal, bukan pengganti
 * penyelidikan tanah. Penurunan konsolidasi lempung butuh uji oedometer
 * (indeks Cc, angka pori e₀, tegangan prakonsolidasi) yang hanya didapat dari
 * pengeboran dan uji laboratorium. Yang dipakai di sini korelasi dari N-SPT —
 * praktik lapangan yang lazim, dengan sebaran yang lebar.
 *
 * Modul ini MENYATAKAN sebarannya, bukan menyembunyikannya di balik satu
 * angka yang terlihat pasti.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { Periksa } from './struktur-beton.js'

/** Jenis tanah pendukung — menentukan cara penurunannya dihitung. */
export type JenisTanahPenurunan =
  | 'pasir'          // penurunan SEKETIKA, selesai saat konstruksi selesai
  | 'lempung'        // penurunan KONSOLIDASI, berlanjut bertahun-tahun
  | 'lempung_kaku'   // di antaranya

/**
 * Batas distorsi sudut (δ/L) menurut jenis kerusakan yang mulai muncul.
 *
 * Angka Bjerrum (1963), yang masih menjadi acuan sampai sekarang dan dipakai
 * SNI 8460. Ditulis sebagai 1/N supaya terbaca seperti di pustaka.
 *
 * Yang penting dipahami: ambangnya BUKAN tentang runtuh. Bangunan pada
 * distorsi 1/150 masih berdiri kokoh — dindingnya yang retak, pintunya yang
 * macet, dan lantainya yang terasa miring saat berjalan.
 */
export const BATAS_DISTORSI = {
  /** Retak rambut pada dinding pengisi mulai muncul. */
  retakDindingRingan: 1 / 500,
  /** Retak jelas terlihat, pintu & jendela mulai macet. */
  retakJelas: 1 / 300,
  /** Kerusakan struktural mulai mungkin — balok & kolom ikut terpengaruh. */
  kerusakanStruktural: 1 / 150,
} as const

/**
 * Batas penurunan TOTAL yang lazim, mm.
 *
 * Lebih longgar daripada yang diduga orang: bangunan boleh turun beberapa
 * sentimeter asalkan seragam. Yang mengikat justru distorsi sudutnya.
 */
export const BATAS_PENURUNAN_TOTAL_MM = {
  pondasi_dangkal: 25,   // Terzaghi & Peck untuk pondasi telapak di pasir
  raft: 50,              // raft menyebar beban, boleh lebih besar
} as const

/**
 * Faktor pengali sebaran perkiraan.
 *
 * Korelasi N-SPT → penurunan punya sebaran LEBAR: hasil sesungguhnya lazim
 * berkisar setengah sampai dua kali perkiraannya. Angka ini dipakai untuk
 * MENYATAKAN sebaran itu, bukan untuk menakut-nakuti.
 */
export const SEBARAN_PERKIRAAN = 2.0

export interface InputPenurunan {
  /** Lebar pondasi (sisi pendek), m. */
  lebarM: number
  /** Panjang pondasi, m. Untuk telapak bujur sangkar = lebarM. */
  panjangM: number
  /** Tekanan neto yang bekerja ke tanah, kPa. */
  tekananNetoKnM2: number
  /** Jenis tanah pendukung. */
  jenisTanah: JenisTanahPenurunan
  /**
   * Nilai N-SPT rata-rata pada kedalaman pengaruh (sekitar 2B di bawah dasar
   * pondasi). Bukan nilai di satu titik.
   */
  nSpt: number
  /**
   * Jarak ke pondasi tetangga, m — untuk menghitung distorsi sudut.
   * Kosongkan bila hanya ingin penurunan total.
   */
  jarakKolomM?: number
  /**
   * Penurunan pondasi tetangga, mm. Kalau kosong tetapi `jarakKolomM` diisi,
   * dipakai anggapan lazim: selisih = 50% penurunan terbesar (Bjerrum).
   */
  penurunanTetanggaMm?: number
  /** Raft (pondasi rakit) punya batas total yang lebih longgar. */
  raft?: boolean
}

export interface HasilPenurunan {
  periksa: Periksa[]
  aman: boolean
  catatan: string[]
  antara: {
    /** Penurunan seketika (elastis), mm. */
    seketikaMm: number
    /** Penurunan konsolidasi (lempung), mm. Nol untuk pasir. */
    konsolidasiMm: number
    /** Total, mm. */
    totalMm: number
    /** Batas atas sebaran perkiraan, mm. */
    perkiraanAtasMm: number
    /** Selisih terhadap pondasi tetangga, mm. */
    diferensialMm: number
    /** Distorsi sudut δ/L, tanpa satuan. */
    distorsi: number
    /** Distorsi dinyatakan sebagai 1/N — bentuk yang dipakai pustaka. */
    distorsiSatuPer: number
    /** Modulus tanah yang diturunkan dari N-SPT, kPa. */
    modulusKnM2: number
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Modulus elastisitas tanah dari N-SPT, kPa.
 *
 * Korelasi lapangan yang lazim (Bowles): pasir Es ≈ 500(N+15), lempung
 * bergantung kekakuannya. Sebarannya lebar — inilah sumber ketidakpastian
 * terbesar di seluruh perhitungan ini, dan modul ini menyatakannya.
 */
function modulusTanah(nSpt: number, jenis: JenisTanahPenurunan): number {
  switch (jenis) {
    /* Bowles: Es ≈ 500(N+15) kPa untuk pasir. */
    case 'pasir': return 500 * (nSpt + 15)

    /*
      ══════════════════════════════════════════════════════════════════════
      LEMPUNG — angka ini SUDAH DIKOREKSI, dan koreksinya penting.

      Versi pertama memakai `250 × N` dan `400 × N`, dan hasilnya tak masuk
      akal: telapak 2×2 m pada tekanan 150 kPa memberi penurunan 588 mm.
      Setengah meter bukan penurunan — itu keruntuhan, dan pemeriksaan daya
      dukung sudah menahannya lebih dulu. Angka setinggi itu di layar hanya
      membuat pembacanya berhenti percaya pada seluruh modul.

      Sebabnya dua, dan keduanya kesalahan saya:

        1. `250 × N` memberi Es 1.500 kPa untuk N=6 — jauh di bawah pustaka.
           Lempung lunak lazimnya 3.000-15.000 kPa; angka saya seperlima
           batas bawahnya.

        2. Faktor konsolidasi 2,5× DITUMPUK di atas penurunan elastis yang
           sudah terlalu besar. Kesalahan berlipat, bukan bertambah.

      Diganti dengan korelasi undrained shear strength: cu ≈ 6·N (kPa), lalu
      Es ≈ 300·cu untuk lempung lunak-sedang (Duncan & Buchignani). Untuk
      N=6 hasilnya 10.800 kPa — di dalam rentang pustaka.
      ══════════════════════════════════════════════════════════════════════
    */
    case 'lempung_kaku': {
      const cu = 6 * nSpt
      return 500 * cu                    // lempung kaku: rasio lebih tinggi
    }
    case 'lempung': {
      const cu = 6 * nSpt
      return 300 * cu
    }
  }
}

/**
 * Faktor pengaruh bentuk untuk penurunan elastis (Steinbrenner, disederhanakan).
 *
 * Pondasi memanjang turun lebih banyak daripada bujur sangkar pada tekanan
 * yang sama — bebannya menyebar ke tanah yang lebih dalam.
 */
function faktorBentuk(panjangM: number, lebarM: number): number {
  const rasio = panjangM / lebarM
  if (rasio <= 1) return 1.12          // bujur sangkar
  if (rasio >= 10) return 2.10         // memanjang (menerus)
  /* Interpolasi linear di antaranya — cukup untuk perencanaan awal. */
  return 1.12 + ((rasio - 1) / 9) * (2.10 - 1.12)
}

export function analisaPenurunan(input: InputPenurunan): HasilPenurunan {
  const {
    lebarM: B, panjangM: L, tekananNetoKnM2: q, jenisTanah, nSpt,
  } = input

  positif('Lebar pondasi', B)
  positif('Panjang pondasi', L)
  positif('Tekanan neto', q)
  positif('N-SPT', nSpt)
  if (L < B) {
    throw new Error(
      `Panjang (${L} m) tak boleh lebih kecil daripada lebar (${B} m) — `
      + 'lebar adalah sisi PENDEK. Tukar keduanya.',
    )
  }
  if (nSpt > 60) {
    throw new Error(
      `N-SPT ${nSpt} di luar batas wajar (> 60). Nilai setinggi itu berarti `
      + 'batuan atau lapisan sangat padat, dan korelasi penurunan di sini '
      + 'tak berlaku — penurunannya dapat diabaikan, tetapi jangan diangkakan '
      + 'dari rumus ini.',
    )
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  const es = modulusTanah(nSpt, jenisTanah)
  const If = faktorBentuk(L, B)

  /*
    ── PENURUNAN SEKETIKA (elastis)

      Si = q · B · If · (1 − ν²) / Es

    Poisson ν = 0,3 untuk pasir, 0,5 untuk lempung jenuh (tak berubah volume
    seketika — air belum sempat keluar).
  */
  const nu = jenisTanah === 'pasir' ? 0.3 : 0.5
  const seketikaMm = ((q * B * If * (1 - nu * nu)) / es) * 1000

  /*
    ── PENURUNAN KONSOLIDASI — hanya pada lempung, dan inilah yang berbahaya.

    Pada pasir, penurunan selesai saat konstruksi selesai; pemiliknya bahkan
    tak menyadarinya. Pada lempung, air pori harus keluar lebih dulu, dan itu
    berlangsung BERTAHUN-TAHUN — retak muncul setelah bangunan dihuni,
    setelah masa pemeliharaan habis, dan setelah semua orang mengira
    pekerjaannya selesai.

    Perkiraan kasar dari korelasi N-SPT. Nilai sesungguhnya butuh uji
    oedometer, dan modul ini mengatakannya.
  */
  let konsolidasiMm = 0
  if (jenisTanah !== 'pasir') {
    /*
      Faktor konsolidasi terhadap penurunan seketika.

      Versi pertama memakai 2,5× untuk lempung lunak, DAN modulus yang
      terlalu kecil — dua kesalahan yang berlipat, bukan bertambah, dan
      hasilnya 588 mm.

      Angka yang dipakai sekarang mengikuti perbandingan yang lazim di
      pustaka: pada lempung normally-consolidated, konsolidasi sekitar
      1-2× penurunan seketika; pada lempung kaku (overconsolidated) jauh
      lebih kecil karena tegangan prakonsolidasinya belum terlampaui.

      Tetap PERKIRAAN. Angka yang bisa dipercaya butuh uji oedometer, dan
      catatan di bawah mengatakannya.
    */
    const faktorKonsolidasi = jenisTanah === 'lempung' ? 1.5 : 0.5
    konsolidasiMm = seketikaMm * faktorKonsolidasi
    catatan.push(
      `Penurunan KONSOLIDASI ${konsolidasiMm.toFixed(1)} mm diperkirakan `
      + `${faktorKonsolidasi}× penurunan seketika. Pada lempung, air pori `
      + 'harus keluar lebih dulu dan itu berlangsung BERTAHUN-TAHUN — retak '
      + 'muncul setelah bangunan dihuni, setelah masa pemeliharaan habis, '
      + 'dan setelah semua orang mengira pekerjaannya selesai.',
    )
  }

  const totalMm = seketikaMm + konsolidasiMm
  const perkiraanAtasMm = totalMm * SEBARAN_PERKIRAAN

  /* ── Penurunan TOTAL terhadap batasnya ─────────────────────────────────── */
  const batasTotal = input.raft
    ? BATAS_PENURUNAN_TOTAL_MM.raft
    : BATAS_PENURUNAN_TOTAL_MM.pondasi_dangkal

  periksa.push({
    nama: 'Penurunan total',
    nilai: Math.round(totalMm * 10) / 10,
    syarat: batasTotal,
    satuan: 'mm',
    aman: totalMm <= batasTotal,
    rasio: Math.round((totalMm / batasTotal) * 1e4) / 1e4,
    rumus: `Si = q·B·If·(1−ν²)/Es (If ${If.toFixed(2)}, Es ${Math.round(es)} kPa, `
      + `ν ${nu})${konsolidasiMm > 0 ? ' + konsolidasi' : ''} ≤ ${batasTotal} mm`,
  })

  /* ── Penurunan DIFERENSIAL & distorsi sudut ────────────────────────────── */
  let diferensialMm = 0
  let distorsi = 0

  if (input.jarakKolomM != null) {
    positif('Jarak antar kolom', input.jarakKolomM)

    /*
      Selisih penurunan. Bila penurunan tetangga tak diketahui, dipakai
      anggapan Bjerrum: selisihnya sekitar 50% penurunan terbesar. Anggapan
      itu DINYATAKAN, bukan disembunyikan — pengguna yang punya angka
      sesungguhnya harus mengisinya.
    */
    if (input.penurunanTetanggaMm != null) {
      diferensialMm = Math.abs(totalMm - input.penurunanTetanggaMm)
    } else {
      diferensialMm = totalMm * 0.5
      catatan.push(
        'Penurunan pondasi tetangga tak diisi, jadi selisihnya dianggap 50% '
        + 'dari penurunan terbesar (anggapan Bjerrum untuk pondasi telapak '
        + 'pada tanah tak seragam). Kalau Anda punya angka sesungguhnya, '
        + 'isikan — anggapan ini bisa terlalu besar pada tanah seragam, dan '
        + 'terlalu kecil pada tanah yang berubah drastis antar titik.',
      )
    }

    distorsi = diferensialMm / (input.jarakKolomM * 1000)

    periksa.push({
      nama: 'Lantai tidak miring berlebihan',
      nilai: Math.round(distorsi * 1e6) / 1e6,
      syarat: BATAS_DISTORSI.retakJelas,
      satuan: 'δ/L',
      aman: distorsi <= BATAS_DISTORSI.retakJelas,
      rasio: Math.round((distorsi / BATAS_DISTORSI.retakJelas) * 1e4) / 1e4,
      rumus: `δ/L = ${diferensialMm.toFixed(1)} mm / ${input.jarakKolomM} m `
        + `≤ 1/${Math.round(1 / BATAS_DISTORSI.retakJelas)} (Bjerrum 1963, `
        + 'ambang retak jelas & pintu macet)',
    })

    /*
      Ambang KEDUA, jauh lebih longgar: kerusakan struktural. Dipisahkan
      karena akibatnya berbeda jenis — yang pertama soal kenyamanan dan
      penampilan, yang kedua soal keselamatan.
    */
    periksa.push({
      nama: 'Struktur tidak rusak oleh penurunan',
      nilai: Math.round(distorsi * 1e6) / 1e6,
      syarat: BATAS_DISTORSI.kerusakanStruktural,
      satuan: 'δ/L',
      aman: distorsi <= BATAS_DISTORSI.kerusakanStruktural,
      rasio: Math.round((distorsi / BATAS_DISTORSI.kerusakanStruktural) * 1e4) / 1e4,
      rumus: `δ/L ≤ 1/${Math.round(1 / BATAS_DISTORSI.kerusakanStruktural)} `
        + '(Bjerrum 1963, ambang kerusakan struktural)',
    })

    if (distorsi > BATAS_DISTORSI.retakDindingRingan
        && distorsi <= BATAS_DISTORSI.retakJelas) {
      catatan.push(
        `Distorsi 1/${Math.round(1 / distorsi)} berada di antara ambang retak `
        + 'rambut (1/500) dan retak jelas (1/300). Dindingnya kemungkinan '
        + 'akan retak rambut — tidak berbahaya, tetapi akan diprotes pemilik '
        + 'dan sebaiknya disampaikan SEBELUM dibangun, bukan sesudah.',
      )
    }
  } else {
    catatan.push(
      'Penurunan DIFERENSIAL tidak diperiksa karena jarak antar kolom '
      + '(`jarakKolomM`) belum diisi. Padahal itulah yang meretakkan '
      + 'bangunan: turun bersama-sama sepuluh sentimeter aman, turun berbeda '
      + 'dua sentimeter antar kolom sudah meretakkan dinding.',
    )
  }

  /* ── Catatan yang selalu ada ───────────────────────────────────────────── */
  catatan.push(
    `Perkiraan ini berdasarkan korelasi N-SPT (N ${nSpt} → Es `
    + `${Math.round(es)} kPa), bukan uji laboratorium. Sebarannya LEBAR: hasil `
    + `sesungguhnya lazim berkisar ${(totalMm / SEBARAN_PERKIRAAN).toFixed(1)}`
    + `–${perkiraanAtasMm.toFixed(1)} mm. Untuk bangunan penting atau tanah `
    + 'lempung tebal, angka yang bisa dipercaya hanya datang dari pengeboran '
    + 'dan uji oedometer.',
  )
  catatan.push(
    'Daya dukung izin (qa) yang dipakai pemeriksaan pondasi lain menahan '
    + 'KERUNTUHAN tanah, bukan penurunan. Pondasi bisa lulus daya dukung '
    + 'dengan angka keamanan 3 dan tetap turun berlebihan — pada lempung '
    + 'lunak itu justru yang lazim terjadi.',
  )
  catatan.push(
    'Yang BELUM diperiksa: penurunan akibat penurunan muka air tanah, '
    + 'penurunan akibat beban di sebelah bangunan (timbunan, bangunan baru), '
    + 'konsolidasi sekunder (creep) yang berlanjut setelah konsolidasi utama '
    + 'selesai, dan penurunan pada tanah ekspansif yang justru MENGEMBANG '
    + 'saat basah.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    catatan,
    antara: {
      seketikaMm: Math.round(seketikaMm * 100) / 100,
      konsolidasiMm: Math.round(konsolidasiMm * 100) / 100,
      totalMm: Math.round(totalMm * 100) / 100,
      perkiraanAtasMm: Math.round(perkiraanAtasMm * 100) / 100,
      diferensialMm: Math.round(diferensialMm * 100) / 100,
      distorsi: Math.round(distorsi * 1e6) / 1e6,
      distorsiSatuPer: distorsi > 0 ? Math.round(1 / distorsi) : 0,
      modulusKnM2: Math.round(es),
    },
  }
}

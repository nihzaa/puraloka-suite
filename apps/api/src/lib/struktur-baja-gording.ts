// Gording, bracing, dan interaksi tekan+momen (SNI 1729:2020). PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// TIGA SISA YANG SEBELUMNYA DINYATAKAN "BELUM DIHITUNG"
// ══════════════════════════════════════════════════════════════════════════════
//
// Modul baja menyatakan tiga hal belum dihitung, dan menyatakannya di catatan
// keluaran supaya tak dikira sudah diperiksa. Ketiganya ditutup di sini:
//
//   1. GORDING          balok atap yang miring mengikuti kemiringan atap
//   2. BRACING          batang pengaku yang menahan rangka dari goyang
//   3. INTERAKSI P-M    kolom yang menerima tekan DAN momen bersamaan
//
// ── Kenapa gording butuh perhitungan sendiri, bukan sekadar `analisaBalokBaja`
//
// Gording dipasang MIRING mengikuti atap. Akibatnya beban gravitasi — yang
// selalu tegak lurus ke bawah — terurai jadi dua komponen terhadap sumbu
// gordingnya:
//
//     tegak lurus atap    ditahan sumbu KUAT profil   (kuat)
//     sejajar atap        ditahan sumbu LEMAH profil  (jauh lebih lemah)
//
// Komponen kedua itulah yang sering dilupakan. Untuk atap kemiringan 30°,
// setengah bebannya jatuh ke sumbu lemah — dan sumbu lemah profil kanal C
// hanya sekitar seperlima kekuatan sumbu kuatnya. Gording yang dihitung
// sebagai balok biasa akan MELENDUT KE SAMPING dan memuntir, meski hitungan
// sumbu kuatnya aman.
//
// ⚠ BATAS TANGGUNG JAWAB. Membantu estimasi & pemeriksaan awal, BUKAN
// menggantikan perhitungan bertanda tangan insinyur.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa, VolumeElemen } from './struktur-beton'
import {
  inersiaX, modulusElastis, modulusPlastis, luasPenampang, radiusGirasiY,
  kapasitasLentur, kapasitasTekan, ES_BAJA_STRUKTUR, PHI,
  type ProfilBaja, type MutuBaja,
} from './struktur-baja'

function bilanganPositif(nama: string, v: number): void {
  if (!(v > 0)) throw new Error(`${nama} harus > 0`)
}

const rasio = (tuntutan: number, kapasitas: number) =>
  kapasitas > 0 ? tuntutan / kapasitas : Number.POSITIVE_INFINITY

// ── GORDING ──────────────────────────────────────────────────────────────────

export interface InputGording {
  profil: ProfilBaja
  mutu: MutuBaja
  /** Bentang gording (jarak antar kuda-kuda), m. */
  bentangM: number
  /** Kemiringan atap, derajat. 0 = datar. */
  kemiringanDerajat: number
  /**
   * Beban merata terfaktor tegak lurus BIDANG HORIZONTAL, kN/m.
   *
   * Beban gravitasi (berat penutup atap, air hujan, pekerja) selalu vertikal
   * ke bawah — bukan tegak lurus atap. Penguraiannya ke sumbu profil dilakukan
   * di sini supaya pemakai tak perlu menghitungnya sendiri, dan supaya tak ada
   * yang lupa bahwa komponen sumbu lemah itu ada.
   */
  bebanVertikalKnPerM: number
  /**
   * Beban angin tegak lurus BIDANG ATAP, kN/m. Positif = menekan atap,
   * negatif = MENGHISAP (mengangkat).
   *
   * Angin bekerja tegak lurus permukaan, bukan vertikal — jadi ia tak perlu
   * diurai. Dan tandanya penting: angin hisap membalik arah lendutan dan
   * membuat sayap BAWAH gording jadi sayap tekan, yang biasanya tak terpegang
   * apa pun.
   */
  bebanAnginKnPerM?: number
  /** Beban layan (tanpa faktor) untuk hitung lendutan, kN/m. */
  bebanLayanKnPerM: number
  /**
   * Jarak antar penahan sagrod (batang penahan gording ke arah miring), m.
   *
   * Sagrod adalah besi yang menahan gording agar tak melorot ke bawah
   * sepanjang bidang atap. Tanpa sagrod, seluruh bentang harus ditahan sumbu
   * lemah profil — dan itu hampir selalu gagal untuk bentang di atas 4 m.
   *
   * Kosong = tak ada sagrod, seluruh bentang dianggap tanpa penahan.
   */
  jarakSagrodM?: number
  /** Batas lendutan: L/nilai. Atap biasanya 240. */
  batasLendutan?: number
  jumlah?: number
}

export interface HasilGording {
  periksa: Periksa[]
  aman: boolean
  volume: VolumeElemen
  antara: Record<string, number>
  catatan: string[]
}

/**
 * Momen inersia sumbu LEMAH (Iy), mm⁴.
 *
 * Dipisah dari `inersiaX` karena gording justru sumbu lemah yang menentukan —
 * dan menghitungnya ulang di dalam fungsi analisa akan menyembunyikannya dari
 * pengujian.
 */
export function inersiaY(p: ProfilBaja): number {
  const { hMm: h, bMm: b, t1Mm: tw, t2Mm: tf } = p
  const hDalam = h - 2 * tf
  return (2 * tf * b ** 3) / 12 + (hDalam * tw ** 3) / 12
}

/** Modulus penampang elastis sumbu lemah (Sy), mm³. */
export function modulusElastisY(p: ProfilBaja): number {
  return inersiaY(p) / (p.bMm / 2)
}

/**
 * Analisa gording atap.
 *
 * Yang membedakannya dari balok biasa: beban vertikal DIURAI ke dua sumbu
 * profil menurut kemiringan atap, dan keduanya diperiksa BERSAMA lewat rumus
 * interaksi — bukan sendiri-sendiri.
 *
 * Memeriksanya sendiri-sendiri adalah kesalahan yang lazim: gording bisa lulus
 * pemeriksaan sumbu kuat DAN sumbu lemah masing-masing, tetapi gagal saat
 * keduanya bekerja bersamaan. Tegangan di sudut penampang adalah JUMLAH
 * keduanya.
 */
export function analisaGording(input: InputGording): HasilGording {
  const {
    profil, mutu, bentangM, kemiringanDerajat,
    bebanVertikalKnPerM, bebanLayanKnPerM,
  } = input
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA TIDAK DITOLAK, PADAHAL RUMUSNYA DIPINJAM
    ══════════════════════════════════════════════════════════════════════════

    `pastikanProfilDidukung` sempat dipasang di sini 2026-08-27 dan DICABUT
    pada hari yang sama: ia merahkan 15 test yang sah. Modul ini memang
    DIRANCANG untuk kanal — `CNP 150x65x20x3.2` adalah data ujinya, karena
    gording di lapangan justru paling sering memakai kanal.

    Yang dipinjam hanya RUMUSNYA. `inersiaY()` di berkas ini adalah rumus
    profil I bersayap DUA sisi:

        2 * tf * b^3 / 12  +  hDalam * tw^3 / 12

    Kanal C bersayap satu sisi, dan sumbu lemah justru yang MENENTUKAN pada
    gording (lihat catatan `inersiaY`). Diukur sebelum penanda ini: WF, CNP,
    dan siku berdimensi sama menghasilkan rasio IDENTIK 0.4155385014771352.

    Menolaknya akan mematikan berat, volume, dan potong-batang yang semuanya
    sudah benar untuk kanal — obat yang lebih merusak dari penyakit. Jadi
    peringatannya ditempel pada HASIL, tempat ia terbaca oleh yang memakai
    angkanya, bukan lemparan yang menutup modul.

    ⚠ Ini pengungkapan, bukan perbaikan. Rumus kanal yang benar tercatat
    sebagai keputusan terbuka di `RATIFIKASI.md` (R-018) — arah teknisnya milik
    founder.
  */
  const pinjamRumusI = !['WF', 'H'].includes((profil.profile_type || '').toUpperCase())
  bilanganPositif('Bentang gording', bentangM)
  bilanganPositif('Beban vertikal', bebanVertikalKnPerM)
  if (kemiringanDerajat < 0 || kemiringanDerajat >= 90) {
    throw new Error('Kemiringan atap harus 0-89 derajat')
  }

  const jumlah = input.jumlah ?? 1
  const batas = input.batasLendutan ?? 240
  const catatan: string[] = []

  /*
    Peringatan ditempel pada TIAP hasil yang memakai rumus pinjaman —
    bukan sekali di dokumentasi. Yang membaca angkanya di layar tak
    pernah membuka berkas ini.
  */
  if (pinjamRumusI) {
    catatan.push(
      `Gording profil ${profil.profile_type} memakai rumus profil I bersayap dua `
      + 'sisi. Untuk kanal, kekakuan sumbu LEMAH — yang justru menentukan pada '
      + 'gording — jadi terlalu besar. Periksakan ke perencana sebelum dipakai '
      + 'sebagai dasar. Berat, volume, dan potong-batang tetap sah.',
    )
  }

  const theta = (kemiringanDerajat * Math.PI) / 180
  const angin = input.bebanAnginKnPerM ?? 0

  /*
    ── PENGURAIAN BEBAN

    Beban vertikal q terurai jadi:
      qx = q·cos θ   tegak lurus atap  → ditahan sumbu KUAT
      qy = q·sin θ   sejajar atap      → ditahan sumbu LEMAH

    Beban angin sudah tegak lurus permukaan, jadi ia langsung menambah/
    mengurangi komponen sumbu kuat saja.
  */
  const qKuat = bebanVertikalKnPerM * Math.cos(theta) + angin
  const qLemah = bebanVertikalKnPerM * Math.sin(theta)

  // Sagrod memotong bentang sumbu lemah — itu seluruh gunanya.
  const bentangLemahM = input.jarakSagrodM && input.jarakSagrodM > 0
    ? Math.min(input.jarakSagrodM, bentangM)
    : bentangM

  const muKuatKnm = (Math.abs(qKuat) * bentangM ** 2) / 8
  const muLemahKnm = (qLemah * bentangLemahM ** 2) / 8

  /*
    Sayap tekan gording dianggap TERPEGANG oleh penutup atap yang disekrup
    padanya — itu keadaan yang lazim. Tetapi HANYA saat atap menekan; saat
    angin MENGHISAP, sayap bawah jadi sayap tekan dan ia tak terpegang apa pun.
  */
  const anginMenghisap = angin < 0 && Math.abs(angin) > bebanVertikalKnPerM * Math.cos(theta)
  const lbKuat = anginMenghisap ? bentangM : 0

  const lentur = kapasitasLentur(profil, mutu, lbKuat)
  const phiMnKuat = PHI.lentur * lentur.mnKnm

  // Kapasitas sumbu lemah: Mn = Zy·fy, dibatasi 1,6·My (SNI §F6.1).
  const zy = modulusPlastisY(profil)
  const sy = modulusElastisY(profil)
  const mnLemah = Math.min((zy * mutu.fyMpa) / 1e6, (1.6 * sy * mutu.fyMpa) / 1e6)
  const phiMnLemah = PHI.lentur * mnLemah

  /*
    ── INTERAKSI DUA SUMBU (SNI 1729 §H1.1)

        Mux/φMnx + Muy/φMny ≤ 1,0

    Diperiksa sebagai SATU verdict, bukan dua. Gording bisa lulus masing-masing
    sumbu tetapi gagal bersama — tegangan di sudut penampang adalah JUMLAH
    keduanya, dan sudut itulah yang leleh lebih dulu.
  */
  const interaksi = rasio(muKuatKnm, phiMnKuat) + rasio(muLemahKnm, phiMnLemah)

  // Lendutan: dua arah, digabung sebagai resultan.
  const ix = inersiaX(profil)
  const iy = inersiaY(profil)
  const qLayanKuat = bebanLayanKnPerM * Math.cos(theta)
  const qLayanLemah = bebanLayanKnPerM * Math.sin(theta)
  const dKuat = (5 * qLayanKuat * (bentangM * 1000) ** 4) / (384 * ES_BAJA_STRUKTUR * ix)
  const dLemah = (5 * qLayanLemah * (bentangLemahM * 1000) ** 4) / (384 * ES_BAJA_STRUKTUR * iy)
  const dTotal = Math.hypot(dKuat, dLemah)
  const dIjin = (bentangM * 1000) / batas

  const periksa: Periksa[] = [
    {
      nama: 'Lentur gording dua arah', nilai: 1, syarat: interaksi,
      satuan: '—', aman: interaksi <= 1, rasio: interaksi,
      rumus: 'Mux/phiMnx + Muy/phiMny <= 1.0 — sumbu kuat DAN lemah bekerja BERSAMA',
    },
    {
      nama: 'Lendutan gording', nilai: dIjin, syarat: dTotal,
      satuan: 'mm', aman: dTotal <= dIjin, rasio: rasio(dTotal, dIjin),
      rumus: `resultan lendutan dua arah <= L/${batas}`,
    },
  ]

  if (kemiringanDerajat > 0 && !input.jarakSagrodM) {
    catatan.push(
      `Atap miring ${kemiringanDerajat}° TANPA sagrod: seluruh bentang `
      + `${bentangM} m harus ditahan sumbu LEMAH profil, yang hanya sekitar `
      + 'seperlima kekuatan sumbu kuatnya. Untuk bentang di atas 4 m ini '
      + 'hampir selalu gagal — pasang sagrod di tengah bentang, dan '
      + 'kapasitasnya naik empat kali lipat.',
    )
  }

  if (anginMenghisap) {
    catatan.push(
      'Angin MENGHISAP lebih besar dari beban gravitasi: arah lendutan '
      + 'BERBALIK, dan sayap BAWAH gording jadi sayap tekan. Sayap bawah tak '
      + 'terpegang penutup atap, jadi kapasitas lenturnya turun drastis — '
      + 'itu sudah diperhitungkan di atas. Pastikan ada penahan sayap bawah '
      + '(sag rod atau bracing) bila rasionya mepet.',
    )
  } else if (angin === 0) {
    catatan.push(
      'Beban ANGIN tidak diisi. Pada atap, angin hisap sering LEBIH BESAR '
      + 'daripada beban gravitasi — terutama pada atap ringan (metal, '
      + 'fiberglass). Gording yang aman untuk beban gravitasi bisa gagal saat '
      + 'angin kencang, dan atap terangkat bersama gordingnya.',
    )
  }

  catatan.push(
    'Sayap tekan dianggap TERPEGANG penutup atap yang disekrup padanya '
    + '(keadaan lazim). Bila penutup atap dipasang dengan klip geser atau '
    + 'belum terpasang saat pembebanan, kapasitasnya lebih kecil dari ini.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeBatang(profil, bentangM, jumlah),
    antara: {
      qKuatKnPerM: qKuat, qLemahKnPerM: qLemah,
      muKuatKnm, muLemahKnm, phiMnKuatKnm: phiMnKuat, phiMnLemahKnm: phiMnLemah,
      interaksi, bentangLemahM,
      lendutanKuatMm: dKuat, lendutanLemahMm: dLemah,
      lendutanTotalMm: dTotal, lendutanIjinMm: dIjin,
      jumlah,
    },
    catatan,
  }
}

/** Modulus plastis sumbu lemah (Zy), mm³. */
export function modulusPlastisY(p: ProfilBaja): number {
  const { hMm: h, bMm: b, t1Mm: tw, t2Mm: tf } = p
  const hDalam = h - 2 * tf
  // Dua sayap: masing-masing persegi panjang tf × b, Z = tf·b²/4 per sayap.
  const sayap = 2 * (tf * b ** 2) / 4
  // Badan: persegi panjang hDalam × tw terhadap sumbu vertikal.
  const badan = (hDalam * tw ** 2) / 4
  return sayap + badan
}

// ── INTERAKSI TEKAN + MOMEN (kolom tepi, rangka bergoyang) ───────────────────

export interface InputInteraksi {
  profil: ProfilBaja
  mutu: MutuBaja
  /** Tinggi/panjang batang, m. */
  panjangM: number
  /** Faktor panjang efektif K. */
  faktorK?: number
  /** Gaya tekan aksial terfaktor, kN. */
  puKn: number
  /** Momen terfaktor sumbu kuat, kNm. */
  muxKnm: number
  /** Momen terfaktor sumbu lemah, kNm. */
  muyKnm?: number
  /** Jarak pengaku lateral sayap tekan, m. */
  jarakPengakuM?: number
}

/**
 * Interaksi tekan + lentur (SNI 1729 §H1.1).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * KENAPA INI TAK BISA DIPERIKSA TERPISAH
 *
 * Kolom tepi, kolom rangka portal, dan kolom yang menahan angin selalu
 * menerima tekan DAN momen bersamaan. Memeriksanya terpisah — "tekannya aman,
 * momennya aman" — adalah kesalahan yang menghasilkan kolom yang gagal pada
 * beban jauh di bawah kedua batas itu.
 *
 * Sebabnya: gaya tekan MEMPERBESAR momen. Kolom yang sudah melengkung sedikit
 * karena momen akan melengkung lebih jauh karena tekannya bekerja pada
 * lengkungan itu (efek P-Delta), dan momen tambahan itu melengkungkannya lagi.
 *
 * Rumus interaksi menangkap saling-pengaruh itu:
 *
 *     Pu/φPn ≥ 0,2   →   Pu/φPn + (8/9)(Mux/φMnx + Muy/φMny) ≤ 1,0
 *     Pu/φPn <  0,2   →   Pu/(2φPn) + (Mux/φMnx + Muy/φMny) ≤ 1,0
 *
 * Dua rumus, karena perilakunya berbeda: batang bertekan besar berperilaku
 * seperti kolom, batang bertekan kecil seperti balok.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function analisaInteraksiTekanMomen(input: InputInteraksi): HasilGording {
  const { profil, mutu, panjangM, puKn, muxKnm } = input
  /*
    Sama seperti `analisaGording` — `kapasitasLentur`, `kapasitasTekan`, dan
    `modulusElastisY` semuanya rumus profil I. Diukur 2026-08-27: WF, CNP, dan
    siku berdimensi sama menghasilkan rasio interaksi IDENTIK
    3.4835937579027876.
  */
  const pinjamRumusI = !['WF', 'H'].includes((profil.profile_type || '').toUpperCase())
  bilanganPositif('Panjang batang', panjangM)

  const k = input.faktorK ?? 1.0
  const muy = input.muyKnm ?? 0
  const lb = input.jarakPengakuM ?? panjangM
  const catatan: string[] = []

  /*
    Peringatan ditempel pada TIAP hasil yang memakai rumus pinjaman —
    bukan sekali di dokumentasi. Yang membaca angkanya di layar tak
    pernah membuka berkas ini.
  */
  if (pinjamRumusI) {
    catatan.push(
      `Batang profil ${profil.profile_type} memakai rumus kelangsingan profil I. `
      + 'Kanal dan siku bisa tekuk TORSI-LENTUR, ragam yang rumus ini tak '
      + 'punya sukunya — kapasitas tekan yang dihasilkan terlalu besar. '
      + 'Periksakan ke perencana sebelum dipakai sebagai dasar.',
    )
  }

  const tekan = kapasitasTekan(profil, mutu, panjangM, k)
  const phiPn = PHI.tekan * tekan.pnKn

  const lentur = kapasitasLentur(profil, mutu, lb)
  const phiMnx = PHI.lentur * lentur.mnKnm

  const zy = modulusPlastisY(profil)
  const sy = modulusElastisY(profil)
  const phiMny = PHI.lentur * Math.min((zy * mutu.fyMpa) / 1e6, (1.6 * sy * mutu.fyMpa) / 1e6)

  const rp = rasio(puKn, phiPn)
  const rm = rasio(muxKnm, phiMnx) + (muy > 0 ? rasio(muy, phiMny) : 0)

  const besar = rp >= 0.2
  const interaksi = besar ? rp + (8 / 9) * rm : rp / 2 + rm

  const periksa: Periksa[] = [
    {
      nama: 'Interaksi tekan + momen', nilai: 1, syarat: interaksi,
      satuan: '—', aman: interaksi <= 1, rasio: interaksi,
      rumus: besar
        ? 'Pu/phiPn + (8/9)(Mux/phiMnx + Muy/phiMny) <= 1.0  (tekan dominan)'
        : 'Pu/(2 phiPn) + (Mux/phiMnx + Muy/phiMny) <= 1.0  (lentur dominan)',
    },
  ]

  catatan.push(
    `Perilaku ${besar ? 'TEKAN' : 'LENTUR'} dominan (Pu/phiPn = ${rp.toFixed(3)}). `
    + 'Gaya tekan MEMPERBESAR momen: kolom yang sudah melengkung sedikit karena '
    + 'momen akan melengkung lebih jauh karena tekannya bekerja pada lengkungan '
    + 'itu. Memeriksa tekan dan momen TERPISAH melewatkan saling-pengaruh ini.',
  )

  catatan.push(
    'Efek orde-kedua (P-Delta) belum dihitung eksplisit — rumus interaksi ini '
    + 'sudah memperhitungkannya secara pendekatan untuk rangka TAK bergoyang. '
    + 'Untuk rangka BERGOYANG (tanpa bracing atau dinding geser), momennya '
    + 'harus diperbesar lebih dulu lewat analisis orde-kedua, dan itu belum '
    + 'ada di sini.',
  )

  return {
    periksa,
    aman: interaksi <= 1,
    volume: volumeBatang(profil, panjangM, 1),
    antara: {
      phiPnKn: phiPn, phiMnxKnm: phiMnx, phiMnyKnm: phiMny,
      rasioTekan: rp, rasioMomen: rm, interaksi,
      kelangsingan: tekan.kelangsingan,
    },
    catatan,
  }
}

// ── BRACING (batang pengaku) ─────────────────────────────────────────────────

export interface InputBracing {
  profil: ProfilBaja
  mutu: MutuBaja
  /** Panjang batang bracing, m. */
  panjangM: number
  /**
   * Gaya tekan/tarik terfaktor pada bracing, kN.
   *
   * Positif = tarik, negatif = tekan. Bracing silang (X) biasanya dirancang
   * TARIK saja — batang yang tertekan dibiarkan menekuk, dan pasangannya yang
   * bekerja. Itu keputusan rancangan yang harus dinyatakan, bukan disimpulkan.
   */
  gayaKn: number
  /**
   * Bracing ini dirancang menahan TARIK saja (sistem silang)?
   *
   * Bila true, batang tekan tak diperiksa tekuk — karena memang dibiarkan
   * menekuk. Bila false (bracing tunggal), tekuk WAJIB diperiksa.
   */
  tarikSaja?: boolean
  /** Gaya yang harus ditahan sistem bracing keseluruhan, kN — untuk kekakuan. */
  gayaSistemKn?: number
}

/**
 * Analisa batang bracing.
 *
 * Bracing punya syarat yang tak dimiliki batang lain: selain KUAT, ia harus
 * cukup KAKU. Bracing yang kuat tetapi lentur membiarkan rangka bergoyang
 * lebih dulu sebelum bracingnya sempat bekerja — dan goyangan itulah yang
 * merusak dinding pengisi serta membuat penghuni tak nyaman.
 */
export function analisaBracing(input: InputBracing): HasilGording {
  const { profil, mutu, panjangM, gayaKn } = input
  /*
    `luasPenampang` dan `kapasitasTekan` keduanya rumus profil I — dan bracing
    justru sering memakai siku (data uji modul ini `L 70x70x7`).

    Untuk siku ada kekeliruan KEDUA: kapasitas tariknya dihitung `Fy x Ag`
    penuh, padahal siku yang disambung lewat SATU kakinya mengalami
    keterlambatan geser (shear lag) — SNI 1729 menuntut `Ae = U x An` dengan
    U < 1. Menghitungnya sebagai Ag penuh melebihkan kapasitas tarik justru
    pada pemakaian yang paling lazim. Keduanya masuk peringatan di bawah.
  */
  const pinjamRumusI = !['WF', 'H'].includes((profil.profile_type || '').toUpperCase())
  bilanganPositif('Panjang bracing', panjangM)

  const catatan: string[] = []

  /*
    Peringatan ditempel pada TIAP hasil yang memakai rumus pinjaman —
    bukan sekali di dokumentasi. Yang membaca angkanya di layar tak
    pernah membuka berkas ini.
  */
  if (pinjamRumusI) {
    catatan.push(
      `Bracing profil ${profil.profile_type} memakai rumus profil I. Untuk `
      + 'siku, kapasitas TEKAN terlalu besar (sumbu utama miring), dan '
      + 'kapasitas TARIK dihitung Fy x Ag penuh tanpa faktor shear lag '
      + '(SNI 1729 menuntut Ae = U x An untuk sambungan satu kaki). '
      + 'Periksakan ke perencana sebelum dipakai sebagai dasar.',
    )
  }
  const tarikSaja = input.tarikSaja ?? false
  const arah = gayaKn >= 0 ? 'tarik' : 'tekan'
  const besar = Math.abs(gayaKn)

  const periksa: Periksa[] = []

  if (arah === 'tarik' || tarikSaja) {
    const ag = luasPenampang(profil)
    const phiPn = PHI.tarik * (mutu.fyMpa * ag) / 1000
    periksa.push({
      nama: 'Tarik bracing', nilai: phiPn, syarat: besar,
      satuan: 'kN', aman: phiPn >= besar, rasio: rasio(besar, phiPn),
      rumus: 'phiPn = 0.90 x Fy x Ag',
    })
  } else {
    const tekan = kapasitasTekan(profil, mutu, panjangM, 1.0)
    const phiPn = PHI.tekan * tekan.pnKn
    periksa.push({
      nama: 'Tekan bracing', nilai: phiPn, syarat: besar,
      satuan: 'kN', aman: phiPn >= besar, rasio: rasio(besar, phiPn),
      rumus: 'phiPn = 0.85 x Fcr x Ag — bracing TUNGGAL wajib menahan tekan',
    })
  }

  /*
    KEKAKUAN — syarat yang tak dimiliki batang lain.

    SNI 1729 Lampiran 6 menuntut bracing punya kekakuan minimum, bukan cuma
    kekuatan. Bracing yang kuat tetapi lentur membiarkan rangka bergoyang lebih
    dulu sebelum bracingnya sempat bekerja.

    Pendekatan yang dipakai: kelangsingan bracing dibatasi 200 seperti batang
    tekan lain — bukan rumus kekakuan penuh (yang butuh perpindahan izin
    rangka), tetapi ia menangkap bracing yang terlalu langsing.
  */
  const ry = radiusGirasiY(profil)
  const kelangsingan = (panjangM * 1000) / ry
  periksa.push({
    nama: 'Kelangsingan bracing', nilai: 200, syarat: kelangsingan,
    satuan: '—', aman: kelangsingan <= 200, rasio: kelangsingan / 200,
    rumus: 'L/r <= 200 — bracing harus KAKU, bukan cuma kuat',
  })

  if (tarikSaja) {
    catatan.push(
      'Dirancang TARIK SAJA (sistem silang): batang yang tertekan dibiarkan '
      + 'menekuk, dan pasangannya yang bekerja. Sistem ini HANYA sah bila '
      + 'kedua diagonal benar-benar terpasang dan tersambung dengan baik — '
      + 'bila satu diagonal hilang atau kendur, rangkanya tak terkekang sama '
      + 'sekali ke arah itu.',
    )
  }

  catatan.push(
    'Kekakuan diperiksa lewat batas kelangsingan (pendekatan), bukan rumus '
    + 'kekakuan penuh SNI 1729 Lampiran 6 yang menuntut perpindahan izin '
    + 'rangka. Untuk rangka tinggi atau berdinding kaca, periksa dengan rumus '
    + 'penuh — goyangan yang tak terasa bagi struktur bisa memecahkan kaca.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeBatang(profil, panjangM, 1),
    antara: { kelangsingan, gayaKn, luasMm2: luasPenampang(profil) },
    catatan,
  }
}

/** Volume satu batang baja — sama polanya dengan modul baja lain. */
function volumeBatang(profil: ProfilBaja, panjangM: number, jumlah: number): VolumeElemen {
  const panjangStandar = profil.panjangStandarM > 0 ? profil.panjangStandarM : 12
  const batangTotal = Math.ceil(panjangM / panjangStandar) * jumlah
  const beratDibeli = batangTotal * panjangStandar * profil.beratKgPerM

  return {
    betonM3: 0,
    bekistingM2: 0,
    besi: [{
      tipe: 'BjTS',
      diameterMm: profil.hMm,
      peran: `profil ${profil.profile_type} ${profil.designation}`,
      jumlahBatang: batangTotal,
      panjangPerBatangM: panjangStandar,
      beratKgPerM: profil.beratKgPerM,
      totalKg: beratDibeli,
    }],
    besiTotalKg: beratDibeli,
    beratSendiriKg: profil.beratKgPerM * panjangM * jumlah,
  }
}

/** Diekspor untuk pengujian — modulus elastis sumbu kuat dipakai pembanding. */
export const _internal = { modulusElastis, modulusPlastis }

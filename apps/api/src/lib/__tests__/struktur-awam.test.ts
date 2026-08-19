import { describe, it, expect } from 'vitest'
import {
  jelaskan, daftarTerjemahan, ringkasanAwam, tingkatBahaya, AMBANG_MEPET,
  PEMERIKSAAN_BINER, apakahBiner,
} from '../struktur-awam'
import { analisaBalok, analisaKolom } from '../struktur-beton'
import { analisaPlat } from '../struktur-plat'
import { analisaFootplat } from '../struktur-footplat'
import { analisaPilecap } from '../struktur-pilecap'
import { analisaKolomBulat } from '../struktur-kolom-bulat'
import { analisaTiang } from '../struktur-tiang'
import { analisaKolomLengkap } from '../struktur-kolom-lengkap'
import { analisaBalokBaja, analisaKolomBaja } from '../struktur-baja'
import { analisaSloof } from '../struktur-sloof'
import { analisaTangga } from '../struktur-tangga'
import { analisaBalokT } from '../struktur-balok-t'
import { analisaGempaStatik, analisaDrift } from '../struktur-beban-lateral'
import { analisaPondasiMenerus, analisaRaft } from '../struktur-pondasi-dangkal'
import {
  analisaDindingPenahan, analisaDindingGeser, analisaGempaDinding,
} from '../struktur-dinding'
import { analisaPenurunan } from '../struktur-penurunan'
import { analisaKolomKomposit, analisaBondek } from '../struktur-komposit'
import { analisaGusset, analisaSambunganMomen } from '../struktur-baja-sambungan-lanjut'
import { analisaKudaKudaKayu, analisaBajaRingan } from '../struktur-atap-ringan'
import {
  analisaSambunganKayu, analisaSekrupBajaRingan,
} from '../struktur-sambungan-ringan'
import {
  analisaSambunganBaut, analisaSambunganLas, MUTU_BAUT,
} from '../struktur-baja-sambungan'
import { analisaBasePlate, analisaAngkur } from '../struktur-baja-tumpuan'
import { analisaRangka } from '../struktur-baja-rangka'
import {
  analisaGording, analisaInteraksiTekanMomen, analisaBracing,
} from '../struktur-baja-gording'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENJAGA: TIAP PEMERIKSAAN WAJIB PUNYA TERJEMAHAN AWAM
 *
 * Yang memutuskan membangun sering BUKAN insinyur — pemilik proyek, klien,
 * manajer. Bagi mereka "φMn = 0.9 · As · fy · (d − a/2)" tak bisa ditindak, dan
 * yang tak bisa ditindak akan diterima begitu saja, TERMASUK saat ia merah.
 *
 * Penjaga ini menjalankan SELURUH modul analisa, mengumpulkan tiap nama
 * pemeriksaan yang benar-benar bisa muncul, lalu menuntut semuanya punya
 * terjemahan. Menambah pemeriksaan baru tanpa menerjemahkannya = MERAH.
 *
 * Yang dijaga bukan kelengkapan kamus demi kerapian: istilah teknik yang bocor
 * ke layar orang awam adalah verdict yang tak dipahami — dan verdict merah yang
 * tak dipahami akan dilewati.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const mutu = { fcMpa: 25, fyMpa: 400, fyvMpa: 240 }

/**
 * Menjalankan SELURUH modul analisa sekali, memulangkan hasilnya apa adanya.
 *
 * Dipisah dari `semuaNamaPemeriksaan()` supaya fixture yang sama — yang sudah
 * terbukti sah karena dipakai penjaga terjemahan awam — bisa dipakai juga oleh
 * penjaga RASIO BERHINGGA di bawah. Dua daftar fixture terpisah berarti dua
 * tempat yang bisa menyimpang, dan yang menyimpang tak akan ketahuan.
 */
function semuaHasilAnalisa(): Array<{ periksa: ReadonlyArray<{ nama: string; rasio: number }> }> {
  const hasil: Array<{ periksa: ReadonlyArray<{ nama: string; rasio: number }> }> = [
    /*
      Sloof & tangga — dua elemen beton yang paling sering muncul di RAB nyata
      dan paling lama tak punya penguji. Tangga membawa tiga pemeriksaan yang
      tak ada di elemen lain (Blondel, tinggi anak tangga, lebar injakan), dan
      ketiganya justru yang paling perlu diterjemahkan: orang yang membaca
      "Blondel 617 mm" tak tahu itu berarti tangganya nyaman dinaiki.
    */
    /*
      Balok T & beban lateral. Yang terakhir membawa pemeriksaan yang paling
      sulit dipahami orang non-teknis — "simpangan tingkat 2 = 0,0056" tak
      berarti apa-apa sampai diterjemahkan jadi "dindingnya akan retak saat
      gempa sedang".
    */
    /*
      Pondasi dangkal & dinding. Empat pemeriksaan yang khas di sini —
      stabilitas guling, stabilitas geser, resultan di inti telapak, dan
      urutan lentur-vs-geser — semuanya butuh terjemahan: "SF guling 2,3" tak
      berarti apa-apa sampai dijelaskan bahwa dinding bisa berputar ke depan.
    */
    /* Enam modul terakhir — menutup cakupan pondasi sampai atap. */
    analisaKolomKomposit({
      jenis: 'terbungkus', asBajaMm2: 6353, inersiaBajaMm4: 1.34e7,
      lebarBetonMm: 400, tinggiBetonMm: 400, panjangTekukM: 3.5,
      asTulanganMm2: 1256, mutuBaja: { fyMpa: 240 }, mutuBeton: { fcMpa: 30 },
      mutuTulangan: { fyMpa: 400 }, puKn: 3000,
    }),
    analisaBondek({
      bentangM: 2.5, tebalTotalMm: 120, tinggiGelombangMm: 50, tebalBajaMm: 0.75,
      asBondekMm2PerM: 1300, inersiaBondekMm4PerM: 540000,
      mutuBondek: { fyMpa: 550 }, mutuBeton: { fcMpa: 25 },
      bebanHidupKpa: 2.5, bebanMatiTambahanKpa: 1.2, luasM2: 100,
    }),
    analisaGusset({
      tebalMm: 10, lebarSambunganMm: 150, panjangSambunganMm: 200,
      panjangBebasMm: 80, gayaKn: -300, mutu: { fyMpa: 240, fuMpa: 370 },
      agvMm2: 4000, anvMm2: 3000, antMm2: 1500,
    }),
    analisaSambunganMomen({
      tipe: 'pelat_ujung', tinggiBalokMm: 400, tebalSayapMm: 13, lebarSayapMm: 200,
      muKnm: 150, vuKn: 80, inersiaBalokMm4: 2.37e8, bentangM: 6,
      kekakuanKnmPerRad: 50000, asBautTarikMm2: 1200, fuBautMpa: 800,
      mutu: { fyMpa: 240, fuMpa: 370 },
    }),
    analisaKudaKudaKayu({
      kelas: 'II', lebarMm: 60, tinggiMm: 120, panjangM: 3,
      gayaKn: -15, momenKnm: 0.5, durasi: 'tetap', kadarAir: 'kering',
      lebarTumpuanMm: 80, gayaTumpuKn: 12,
    }),
    analisaBajaRingan({
      profil: 'C75_075', panjangM: 1.5, gayaKn: -4,
      jarakKudaKudaM: 1.2, lapisanGM2: 100, lingkungan: 'biasa',
    }),
    analisaPondasiMenerus({
      jenis: 'batu_kali', lebarBawahM: 0.6, lebarAtasM: 0.3, tinggiM: 0.6,
      panjangM: 40, kedalamanM: 0.8, bebanKnPerM: 25, qaKnM2: 150,
    }),
    analisaRaft({
      panjangM: 12, lebarM: 8, tebalMm: 400, bebanTotalKn: 4800,
      eksentrisitasXM: 0.5, eksentrisitasYM: 0.3, qaKnM2: 120,
      selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150, mutu, bentangKolomM: 4,
    }),
    analisaDindingPenahan({
      tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4,
      panjangTelapakM: 2, tebalTelapakM: 0.4, kakiM: 0.5,
      gammaTanahKnM3: 18, phiDerajat: 30, qaKnM2: 200, panjangDindingM: 20,
      selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150, mutu,
    }),
    analisaDindingGeser({
      panjangM: 4, tebalMm: 250, tinggiM: 12,
      vuKn: 800, muKnm: 6000, puKn: 1500,
      rhoHorizontal: 0.003, rhoVertikal: 0.003, asUjungMm2: 2000,
      selimutMm: 40, dUtamaMm: 13, jarakUtamaMm: 200, mutu,
    }),
    analisaBalokT({
      bwMm: 200, hMm: 400, hfMm: 120, bentangBersihM: 4, jarakAsAsM: 3,
      selimutMm: 30, dUtamaMm: 16, nTarik: 3, nAtas: 2,
      dSengkangMm: 8, jarakSengkangMm: 150, mutu,
      muPositifKnm: 60, muNegatifKnm: 40, vuKn: 70,
    }),
    analisaGempaStatik({
      tingkat: [
        { nama: 'Lantai 2', tinggiM: 4, beratKn: 600 },
        { nama: 'Atap', tinggiM: 8, beratKn: 400 },
      ],
      sds: 0.7, sd1: 0.4, sistem: 'rangka_pemikul_momen_menengah',
      risiko: 'II', tipeRangka: 'rangka_beton', kategoriSeismik: 'D',
    }),
    analisaDrift({
      simpanganElastisMm: [5, 12], tinggiTingkatM: [4, 4],
      cd: 4.5, ie: 1.0, risiko: 'II',
    }),
    analisaSloof({
      bMm: 150, hMm: 250, bentangM: 3, selimutMm: 30, dUtamaMm: 12,
      nBawah: 2, nAtas: 2, dSengkangMm: 8, jarakSengkangMm: 150, mutu,
      tinggiDindingM: 3, tebalDindingM: 0.15, jenisDinding: 'bata_merah',
    }),
    analisaTangga({
      tebalPelatMm: 120, lebarM: 1.2, tinggiM: 3.2,
      optredeMm: 175, antredeMm: 280, selimutMm: 20,
      dUtamaMm: 10, jarakUtamaMm: 150, dBagiMm: 8, jarakBagiMm: 200,
      mutu, pemakaian: 'hunian',
    }),
    analisaBalok({
      bMm: 300, hMm: 520, panjangM: 6, selimutMm: 30, dUtamaMm: 16,
      nTarik: 5, dSengkangMm: 8, jarakSengkangMm: 150, mutu, muKnm: 120, vuKn: 90,
    }),
    analisaKolom({
      hMm: 400, bMm: 400, tinggiM: 3.5, selimutMm: 40, dUtamaMm: 19,
      nBarisX: 3, nBarisY: 3, dSengkangMm: 10, jarakSengkangMm: 150,
      mutu, puKn: 1500, muKnm: 80,
    }),
    analisaKolomLengkap({
      hMm: 400, bMm: 400, tinggiM: 3.5, selimutMm: 40, dUtamaMm: 19,
      nBarisX: 3, nBarisY: 3, dSengkangMm: 10, jarakSengkangMm: 150,
      mutu, puKn: 1500, muKnm: 80,
    }) as never,
    analisaKolomBulat({
      diameterMm: 400, tinggiM: 3.5, selimutMm: 40, dUtamaMm: 16, nTulangan: 8,
      dPengekangMm: 10, jarakPengekangMm: 150, pengekang: 'sengkang',
      mutu, puKn: 1200, muKnm: 60,
    }),
    analisaPlat({
      lxM: 3.5, lyM: 4, hM: 0.12, selimutMm: 20,
      dTulanganMm: 10, jarakTulanganMm: 150,
      tumpuan: { y1: 'menerus', y2: 'menerus', x1: 'menerus', x2: 'menerus' },
      mutu, bebanMatiTambahan: [{ nama: 'Finishing', nilai: 1.2 }],
      bebanHidupKnM2: 2.5,
    }),
    analisaFootplat({
      lxM: 1.5, lyM: 1.5, hM: 0.3, bxM: 0.4, byM: 0.4, pxM: 0.75, pyM: 0.75,
      zM: 1.5, gammaTanahKnM3: 17, letakKolom: 'tengah', mutu,
      dAksenM: 0.07, dTulanganMm: 13, jarakTulanganMm: 150,
      pukKn: 400, muxKnm: 20, muyKnm: 20, qaKnM2: 300,
    }),
    analisaPilecap({
      nx: 2, ny: 2, dxM: 1.2, dyM: 1.2, axM: 0.5, ayM: 0.5,
      diameterTiangM: 0.4, bxM: 0.4, byM: 0.4, hM: 0.5, zM: 1,
      gammaTanahKnM3: 18, letakKolom: 'tengah', mutu,
      dAksenM: 0.08, dTulanganMm: 16, jarakTulanganMm: 150,
      pukKn: 1200, muxKnm: 40, muyKnm: 40, pIjinTiangKn: 425,
    }),
    analisaTiang({
      diameterM: 0.4, panjangM: 16, fcMpa: 36.6,
      lapisan: Array.from({ length: 8 }, () => ({ tebalM: 2, nSpt: 20 })),
      bebanRencanaKn: 300,
    }) as never,
    /*
      BAJA IKUT — dan penjaga ini langsung membuktikan gunanya.

      Modul baja lahir sesudah kamus awam ditulis, dan ketiga pemeriksaannya
      (Lentur baja, Geser baja, Lendutan) TAK punya terjemahan sama sekali.
      Ketahuannya bukan dari membaca kode melainkan dari audit lintas-modul
      yang menjalankan keduanya berdampingan.

      Modul baru yang lupa didaftarkan di sini akan lolos tanpa gejala —
      karena itu daftarnya diperiksa terhadap apa yang NYATA dihasilkan, dan
      tiap modul baru wajib ditambahkan ke fungsi ini.
    */
    analisaBalokBaja({
      profil: {
        designation: '200x100x5.5x8', profile_type: 'WF',
        hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
        beratKgPerM: 21.3333, panjangStandarM: 12,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      bentangM: 6, jarakPengakuM: 0, muKnm: 30, vuKn: 60, bebanLayanKnPerM: 3,
    }) as never,
    /*
      KOLOM BAJA & SAMBUNGAN ikut — dan audit yang sama menangkap keduanya.

      Sesudah baja balok didaftarkan, saya menambah kolom baja dan sambungan
      baut/las. Ketujuh pemeriksaan barunya TAK punya terjemahan sama sekali,
      dan penjaga ini tak menangkapnya karena modulnya belum terdaftar di
      fungsi ini.

      Itu kelemahan penjaga yang terulang dua kali: ia hanya menjaga apa yang
      DIDAFTARKAN. Menambah modul tanpa menambahkannya ke sini lolos tanpa
      gejala. Belum ada cara memaksanya otomatis tanpa memindai berkas —
      dan itu pekerjaan penjaga skrip, bukan test.
    */
    analisaKolomBaja({
      profil: {
        designation: '200x100x5.5x8', profile_type: 'WF',
        hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
        beratKgPerM: 21.3333, panjangStandarM: 12,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      tinggiM: 3, puKn: 100,
    }) as never,
    analisaSambunganBaut({
      diameterMm: 16, mutu: MUTU_BAUT['A325'], jumlahBaut: 4, bidangGeser: 1,
      tebalPelatMm: 8, mutuPelat: { fyMpa: 240, fuMpa: 370 }, vuKn: 150,
    }) as never,
    analisaSambunganLas({
      ukuranMm: 6, panjangMm: 200, fuElektrodaMpa: 490,
      mutuPelat: { fyMpa: 240, fuMpa: 370 }, tebalPelatMm: 10, vuKn: 100,
    }) as never,
    /*
      BASE PLATE, ANGKUR, dan RANGKA BATANG ikut.

      Ketiganya modul baru, dan `audit-modul-struktur-terdaftar.mjs` MENANGKAP
      keduanya sebelum sempat lolos — persis kelalaian yang sama sudah terjadi
      dua kali sebelumnya (baja balok, lalu kolom+sambungan), dan kali ini
      penjaga skripnya yang menemukan, bukan audit manual.
    */
    analisaBasePlate({
      profil: {
        designation: '200x100x5.5x8', profile_type: 'WF',
        hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
        beratKgPerM: 21.3333, panjangStandarM: 12,
      },
      mutuPelat: { fyMpa: 240, fuMpa: 370 },
      panjangPelatMm: 350, lebarPelatMm: 350, tebalPelatMm: 30,
      fcBetonMpa: 25, puKn: 500,
    }) as never,
    analisaAngkur({
      diameterMm: 16, mutu: MUTU_BAUT['A325'], jumlahAngkur: 4,
      kedalamanMm: 300, fcBetonMpa: 25, tuKn: 100, vuKn: 60,
    }) as never,
    analisaGording({
      profil: {
        designation: '150x65x20x3.2', profile_type: 'CNP',
        hMm: 150, bMm: 65, t1Mm: 3.2, t2Mm: 3.2,
        beratKgPerM: 8.01, panjangStandarM: 6,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      bentangM: 4, kemiringanDerajat: 30,
      bebanVertikalKnPerM: 1.2, bebanLayanKnPerM: 0.9, jarakSagrodM: 2,
    }) as never,
    analisaInteraksiTekanMomen({
      profil: {
        designation: '200x100x5.5x8', profile_type: 'WF',
        hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
        beratKgPerM: 21.3333, panjangStandarM: 12,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      panjangM: 3.5, puKn: 100, muxKnm: 10,
    }) as never,
    analisaBracing({
      profil: {
        designation: '70x70x7', profile_type: 'L',
        hMm: 70, bMm: 70, t1Mm: 7, t2Mm: 7,
        beratKgPerM: 7.38, panjangStandarM: 6,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      panjangM: 3, gayaKn: 40,
    }) as never,
    /*
      SAMBUNGAN rangka atap — yang paling perlu diterjemahkan dari seluruh
      modul di sini, dan justru yang paling sulit.

      Pemeriksaannya bernama "moda leleh", "jarak ke ujung kayu", "tarik cabut
      sekrup", "pull-over". Yang membaca layar adalah tukang atap dan pemilik
      rumah, dan bagi mereka istilah-istilah itu kosong — padahal keputusan
      yang bergantung padanya sederhana dan bisa ditindak hari itu juga:
      geser pakunya menjauh dari ujung kayu, tambah satu baris sekrup.
    */
    analisaSambunganKayu({
      alat: 'paku', diameterMm: 4.1, jumlahAlat: 8,
      tebalUtamaMm: 60, tebalSisiMm: 30, penetrasiMm: 45,
      kelas: 'II', durasi: 'tetap', kadarAir: 'kering',
      gayaKn: 6,
      jarakTepiSejajarMm: 70, jarakTepiTegakMm: 25, jarakAntarAlatMm: 45,
    }) as never,
    analisaSambunganKayu({
      /* baut — moda leleh yang lain, dan pemeriksaan yang lain pula */
      alat: 'baut', diameterMm: 12, jumlahAlat: 4,
      tebalUtamaMm: 80, tebalSisiMm: 40, penetrasiMm: 40,
      kelas: 'I', durasi: 'sepuluh_menit', kadarAir: 'basah',
      gayaKn: 25,
      jarakTepiSejajarMm: 100, jarakTepiTegakMm: 60, jarakAntarAlatMm: 60,
    }) as never,
    analisaSekrupBajaRingan({
      diameterMm: 4.8, jumlahSekrup: 4, tebal1Mm: 0.75, tebal2Mm: 1,
      fuMpa: 550, gayaGeserKn: 3, gayaTarikKn: 1.2, jarakTepiMm: 15,
    }) as never,
    /*
      GEMPA pada dinding penahan — pemeriksaan yang paling perlu diterjemahkan.

      Yang memutuskan membangun dinding penahan hampir tak pernah insinyur:
      pemilik rumah berlahan undak, atau pengembang yang memotong lereng.
      Bagi mereka "Kae 0,46" kosong, sementara akibatnya sangat nyata.
    */
    analisaGempaDinding({
      tinggiM: 3, gammaTanahKnM3: 18, phiDerajat: 30, pgaG: 0.3,
      momenGulingStatisKnm: 24, momenPenahanKnm: 62,
    }) as never,
    /*
      PENURUNAN pondasi — tiga pemeriksaan yang paling sering disalahpahami,
      termasuk oleh orang teknis: pondasi yang lulus daya dukung disangka
      otomatis aman terhadap penurunan.

      Bagi pemilik bangunan akibatnya sangat kelihatan (dinding retak, pintu
      macet), tetapi sebabnya ada di bawah tanah — dan tanpa penjelasan ia
      akan disalahkan ke tukang atau ke mutu batanya.
    */
    analisaPenurunan({
      lebarM: 2, panjangM: 2, tekananNetoKnM2: 150,
      jenisTanah: 'lempung', nSpt: 8, jarakKolomM: 4,
    }) as never,
    analisaRangka({
      nama: 'KK-1', mutu: { fyMpa: 240, fuMpa: 370 },
      batang: [
        {
          nama: 'atas', panjangM: 2, gayaKn: -100,
          profil: {
            designation: '150x75x5x7', profile_type: 'WF',
            hMm: 150, bMm: 75, t1Mm: 5, t2Mm: 7,
            beratKgPerM: 14, panjangStandarM: 12,
          },
        },
        {
          nama: 'bawah', panjangM: 2, gayaKn: 80, gayaBalikKn: -20,
          profil: {
            designation: '70x70x7', profile_type: 'L',
            hMm: 70, bMm: 70, t1Mm: 7, t2Mm: 7,
            beratKgPerM: 7.38, panjangStandarM: 6,
          },
        },
      ],
    }) as never,
  ]
  return hasil
}

/** Nama pemeriksaan yang NYATA muncul dari seluruh modul. */
function semuaNamaPemeriksaan(): string[] {
  return [...new Set(semuaHasilAnalisa().flatMap((h) => h.periksa.map((p) => p.nama)))]
}

describe('tiap rasio BERHINGGA — Infinity/NaN tak boleh sampai ke layar', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    Ditemukan 2026-08-19 dengan MEMOTRET LAYAR, bukan dari satu pun test.

    Balok baja yang kehilangan dua medan wajib menampilkan batang kekuatan
    bertuliskan **Infinity%** dan lendutan **NaN** di panel detail.

    Yang membuatnya berbahaya bukan angka anehnya. Verdict di atasnya berbunyi
    "TIDAK AMAN — 2 pemeriksaan tidak terpenuhi", dan itu terbaca sebagai
    kesimpulan TEKNIK, bukan keluhan tentang input. Pembacanya akan
    memperbesar profilnya — dan angkanya tetap Infinity.

    Sebabnya bisa terulang di modul mana pun: `undefined < 0` adalah FALSE,
    jadi pemeriksaan berbentuk `if (x < 0) throw` TIDAK menahan medan yang
    HILANG. Hampir tiap modul memakai pola serupa di suatu tempat.

    Memakai fixture yang SAMA dengan penjaga terjemahan awam — keduanya
    menuntut hal yang berbeda dari satu himpunan input yang sudah terbukti sah.
    ══════════════════════════════════════════════════════════════════════════
  */
  it('tak ada satu pun rasio Infinity atau NaN', () => {
    const cacat: string[] = []
    for (const h of semuaHasilAnalisa()) {
      for (const p of h.periksa) {
        if (!Number.isFinite(p.rasio)) cacat.push(`${p.nama} = ${p.rasio}`)
      }
    }
    expect(
      cacat,
      'Batang persen di layar dibangun dari rasio ini. Infinity/NaN muncul '
      + 'sebagai "Infinity%" kepada orang yang memakai layar ini justru karena '
      + `tak paham rumusnya. Yang cacat: ${cacat.join(', ')}`,
    ).toHaveLength(0)
  })

  it('rasio tak boleh NEGATIF — persen negatif tak punya arti di layar', () => {
    const negatif: string[] = []
    for (const h of semuaHasilAnalisa()) {
      for (const p of h.periksa) {
        if (Number.isFinite(p.rasio) && p.rasio < 0) {
          negatif.push(`${p.nama} = ${p.rasio}`)
        }
      }
    }
    expect(negatif, negatif.join(', ')).toHaveLength(0)
  })

  it('modul yang diuji tak boleh menyusut diam-diam', () => {
    /*
      Angkanya dipaku supaya modul yang hilang dari fixture (mis. saat
      seseorang "membersihkan" test yang merah) ketahuan sebagai perubahan
      yang disengaja, bukan hilang senyap.
    */
    expect(semuaHasilAnalisa().length).toBeGreaterThanOrEqual(30)
  })
})

describe('setiap pemeriksaan bisa dijelaskan ke orang non-teknis', () => {
  it('TIDAK ADA pemeriksaan tanpa terjemahan', () => {
    const tanpa = semuaNamaPemeriksaan().filter((n) => jelaskan(n) === null)
    expect(tanpa, `pemeriksaan tanpa terjemahan awam: ${tanpa.join(', ')}`)
      .toHaveLength(0)
  })

  it('tiap terjemahan menyebut APA, RISIKO, dan TINDAKAN', () => {
    /*
      Ketiganya wajib. Penjelasan tanpa TINDAKAN adalah jalan buntu — ia
      membuat orang tahu ada masalah tanpa tahu harus apa, dan itu lebih buruk
      daripada tak menjelaskan sama sekali.
    */
    for (const nama of daftarTerjemahan()) {
      const p = jelaskan(nama)!
      expect(p.judul.length, `${nama}: judul kosong`).toBeGreaterThan(5)
      expect(p.apa.length, `${nama}: 'apa' terlalu pendek`).toBeGreaterThan(40)
      expect(p.risiko.length, `${nama}: 'risiko' terlalu pendek`).toBeGreaterThan(40)
      expect(p.tindakan.length, `${nama}: 'tindakan' terlalu pendek`).toBeGreaterThan(20)
    }
  })

  it('terjemahan TIDAK memakai istilah teknik yang justru mau dihindari', () => {
    /*
      Penjelasan yang berbunyi "φMn harus ≥ Mu" bukan terjemahan — ia cuma
      menyalin masalahnya. Simbol dan singkatan teknik dilarang muncul di
      medan yang dibaca orang awam.

      `judul` dan `apa` dijaga paling ketat: itu yang dibaca lebih dulu.
    */
    const istilah = /φ|ρ|\bMn\b|\bMu\b|\bVn\b|\bVu\b|\bAs\b|f'c|\bfy\b|kNm|MPa/
    for (const nama of daftarTerjemahan()) {
      const p = jelaskan(nama)!
      expect(istilah.test(p.judul), `${nama}: judul memakai istilah teknik`).toBe(false)
      expect(istilah.test(p.apa), `${nama}: 'apa' memakai istilah teknik`).toBe(false)
      expect(istilah.test(p.risiko), `${nama}: 'risiko' memakai istilah teknik`).toBe(false)
    }
  })

  it('nama pemeriksaan yang tak dikenal memulangkan null, bukan kalimat umum', () => {
    /*
      Kalimat umum ("konsultasikan ke ahli") menyamarkan pemeriksaan yang belum
      diterjemahkan — tak ada yang tahu ada yang kurang. `null` bisa dihitung
      penjaga.
    */
    expect(jelaskan('Pemeriksaan Yang Belum Ada')).toBeNull()
  })
})

describe('tingkatBahaya — "aman" dan "aman tapi mepet" dibedakan', () => {
  it('gagal → bahaya, apa pun rasionya', () => {
    expect(tingkatBahaya(0.1, false)).toBe('bahaya')
    expect(tingkatBahaya(2.0, false)).toBe('bahaya')
  })

  it('lulus tapi ≥ 90% kapasitas → mepet', () => {
    expect(tingkatBahaya(AMBANG_MEPET, true)).toBe('mepet')
    expect(tingkatBahaya(0.99, true)).toBe('mepet')
  })

  it('lulus dengan cadangan → aman', () => {
    expect(tingkatBahaya(0.89, true)).toBe('aman')
    expect(tingkatBahaya(0.2, true)).toBe('aman')
  })
})

describe('ringkasanAwam — satu kalimat yang bisa ditindak', () => {
  const P = (nama: string, aman: boolean, rasio: number) => ({ nama, aman, rasio })

  it('menyebut NAMA AWAM pemeriksaan yang gagal, bukan istilah teknis', () => {
    const r = ringkasanAwam([P('Lentur', false, 1.4), P('Geser', true, 0.5)])
    expect(r.tingkat).toBe('bahaya')
    expect(r.kalimat).toMatch(/kekuatan menahan lenturan/i)
    // Istilah teknisnya TIDAK muncul.
    expect(r.kalimat).not.toMatch(/φMn|Lentur\b/)
  })

  it('beberapa gagal → jumlahnya disebut, semuanya dinamai', () => {
    const r = ringkasanAwam([
      P('Lentur', false, 1.4), P('Geser', false, 1.1), P('As minimum', true, 0.3),
    ])
    expect(r.kalimat).toMatch(/2 pemeriksaan/)
    expect(r.kalimat).toMatch(/lenturan/i)
    expect(r.kalimat).toMatch(/sobek/i)
  })

  it('"aman tapi mepet" TIDAK dibulatkan jadi "aman"', () => {
    /*
      Rasio 0,98 dan 0,42 sama-sama lulus, tetapi cuma satu yang masih aman
      kalau beban bertambah sedikit — dan beban bertambah sedikit PASTI terjadi
      (finishing lebih tebal, penghuni lebih banyak, renovasi).
    */
    const r = ringkasanAwam([P('Lentur', true, 0.98), P('Geser', true, 0.3)])
    expect(r.tingkat).toBe('mepet')
    expect(r.kalimat).toMatch(/MEPET/)
    expect(r.kalimat).toMatch(/98%/)
  })

  it('aman dengan cadangan → menyebut BERAPA cadangannya', () => {
    const r = ringkasanAwam([P('Lentur', true, 0.4), P('Geser', true, 0.25)])
    expect(r.tingkat).toBe('aman')
    expect(r.kalimat).toMatch(/40%/)
    expect(r.kalimat).toMatch(/60% cadangan/)
  })

  it('gagal MENANG atas mepet — rasio tertinggi tak menutupi yang merah', () => {
    // Yang gagal rasionya lebih RENDAH dari yang mepet: verdict tetap bahaya.
    const r = ringkasanAwam([P('Lentur', false, 0.5), P('Geser', true, 0.99)])
    expect(r.tingkat).toBe('bahaya')
  })

  it('pemeriksaan BINER tak menghasilkan kalimat "terpakai 0%"', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      DITEMUKAN SAAT MENGUJI RANGKA BATANG LEWAT API HIDUP.

      Rangka yang seluruh batangnya aman melaporkan "terpakai 0% dari
      kapasitasnya, masih tersisa 100% cadangan" — verdict-nya benar, tetapi
      kalimatnya omong kosong: pemeriksaan "seluruh batang aman" tak punya
      konsep cadangan sama sekali.

      Rasio 0 pada pemeriksaan biner berarti "tak terjadi", bukan "kapasitas
      terpakai nol".
      ══════════════════════════════════════════════════════════════════════
    */
    const r = ringkasanAwam([P('Seluruh batang rangka aman', true, 0)])
    expect(r.tingkat).toBe('aman')
    expect(r.kalimat).not.toMatch(/0%/)
    expect(r.kalimat).not.toMatch(/100% cadangan/)
    expect(r.kalimat).toMatch(/seluruh pemeriksaan terpenuhi/i)
  })

  it('biner + berskala → yang berskala yang dilaporkan persennya', () => {
    const r = ringkasanAwam([
      P('Tanah tidak terangkat', true, 0),
      P('Lentur', true, 0.55),
    ])
    expect(r.kalimat).toMatch(/55%/)
  })

  it('belum ada pemeriksaan → dinyatakan, bukan diklaim aman', () => {
    const r = ringkasanAwam([])
    expect(r.kalimat).toMatch(/Belum ada pemeriksaan/i)
  })
})

describe('pemeriksaan biner — lulus/gagal, bukan "seberapa terpakai"', () => {
  it('daftar biner semuanya punya terjemahan', () => {
    for (const n of PEMERIKSAAN_BINER) {
      expect(jelaskan(n), `${n} tak ada di kamus`).not.toBeNull()
    }
  })

  it('nama biner benar-benar MUNCUL di modul analisa', () => {
    /*
      Daftar yang menyebut nama yang tak pernah muncul adalah daftar basi:
      ia terlihat lengkap sambil tak menjaga apa pun. Diperiksa terhadap
      pemeriksaan yang NYATA dihasilkan modul, bukan terhadap ingatan.
    */
    const nyata = semuaNamaPemeriksaan()
    for (const n of PEMERIKSAAN_BINER) {
      expect(nyata, `${n} tak pernah muncul di modul mana pun`).toContain(n)
    }
  })

  it('apakahBiner membedakan yang biner dari yang berskala', () => {
    expect(apakahBiner('Tanah tidak terangkat')).toBe(true)
    expect(apakahBiner('Lentur')).toBe(false)
  })

  it('pemeriksaan biner yang LULUS memang berasio nol — itu sebabnya perlu dibedakan', () => {
    /*
      Inilah alasan konkretnya, diukur bukan ditaksir: footplat yang aman
      memulangkan rasio 0 untuk "Tanah tidak terangkat". Digambar sebagai
      batang persen, hasilnya "0%" — dan pembaca non-teknis menyangka
      kapasitasnya NOL, kebalikan dari artinya.
    */
    const h = analisaFootplat({
      lxM: 1.5, lyM: 1.5, hM: 0.3, bxM: 0.4, byM: 0.4, pxM: 0.75, pyM: 0.75,
      zM: 1.5, gammaTanahKnM3: 17, letakKolom: 'tengah', mutu,
      dAksenM: 0.07, dTulanganMm: 13, jarakTulanganMm: 150,
      pukKn: 400, muxKnm: 20, muyKnm: 20, qaKnM2: 300,
    })
    const p = h.periksa.find((x) => x.nama === 'Tanah tidak terangkat')!
    expect(p.aman).toBe(true)
    expect(p.rasio).toBe(0)
  })
})

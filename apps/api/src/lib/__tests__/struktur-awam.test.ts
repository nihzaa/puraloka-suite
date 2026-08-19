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
import {
  analisaSambunganBaut, analisaSambunganLas, MUTU_BAUT,
} from '../struktur-baja-sambungan'
import { analisaBasePlate, analisaAngkur } from '../struktur-baja-tumpuan'
import { analisaRangka } from '../struktur-baja-rangka'

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

/** Menjalankan seluruh modul, mengumpulkan nama pemeriksaan yang NYATA muncul. */
function semuaNamaPemeriksaan(): string[] {
  const hasil: Array<{ periksa: ReadonlyArray<{ nama: string }> }> = [
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
      diameterMm: 16, mutu: MUTU_BAUT['A325'], jumlah: 4, bidangGeser: 1,
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
      diameterMm: 16, mutu: MUTU_BAUT['A325'], jumlah: 4,
      kedalamanMm: 300, fcBetonMpa: 25, tuKn: 100, vuKn: 60,
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
  return [...new Set(hasil.flatMap((h) => h.periksa.map((p) => p.nama)))]
}

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

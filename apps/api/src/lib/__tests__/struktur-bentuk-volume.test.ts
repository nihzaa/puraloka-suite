import { describe, it, expect } from 'vitest'
import { rekapVolume } from '../struktur-beton'

/* Semua modul yang memulangkan volume — didaftar SATU KALI di sini. */
import { analisaBalok, analisaKolom } from '../struktur-beton'
import { analisaPlat } from '../struktur-plat'
import { analisaFootplat } from '../struktur-footplat'
import { analisaSloof } from '../struktur-sloof'
import { analisaTangga } from '../struktur-tangga'
import { analisaBalokT } from '../struktur-balok-t'
import { analisaPondasiMenerus, analisaRaft } from '../struktur-pondasi-dangkal'
import { analisaDindingPenahan, analisaDindingGeser } from '../struktur-dinding'
import { analisaKolomKomposit, analisaBondek } from '../struktur-komposit'
import { analisaKudaKudaKayu, analisaBajaRingan } from '../struktur-atap-ringan'
import { analisaBalokBaja } from '../struktur-baja'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BENTUK VOLUME SERAGAM — satu modul yang menyimpang meruntuhkan REKAP PROYEK
 *
 * ── Cacat yang melahirkan berkas ini
 *
 * `struktur-atap-ringan.ts` sempat memulangkan bentuk khusus — `{ kayuM3 }`
 * untuk kayu dan `{ beratKg }` untuk baja ringan — alih-alih `VolumeElemen`
 * kanonik. Akibatnya:
 *
 *     GET …/struktur/rekap-volume  →  HTTP 500
 *
 * Bukan satu baris yang hilang dari total: SELURUH halaman rekap gagal begitu
 * ada satu elemen kayu di proyek. `rekapVolume` membaca `h.volume.besi` dan
 * bentuk khusus tak punya medan itu.
 *
 * Yang membuatnya lolos: rute memeriksa "apakah volumenya ADA", bukan "apakah
 * BENTUKNYA benar" — dan objek `{ kayuM3 }` memang ada.
 *
 * TypeScript pun tak menangkapnya, karena tiap modul mendeklarasikan tipe
 * volumenya sendiri; tak ada satu tempat yang memaksa keseragaman.
 *
 * ── Kenapa test, bukan skrip penjaga
 *
 * Yang diperiksa adalah PERILAKU fungsi, bukan teks kode. Skrip yang membaca
 * berkas hanya bisa menebak dari nama medan; test ini benar-benar memanggil
 * tiap modul dan memberikan hasilnya ke `rekapVolume` — kalau ada yang
 * menyimpang, ia runtuh di sini, bukan di layar estimator.
 *
 * ⚠ Modul BARU yang memulangkan volume WAJIB ditambahkan ke daftar di bawah.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const mutu = { fcMpa: 25, fyMpa: 400 }

/** Tiap entri: nama modul + hasil analisanya. */
const SEMUA: Array<{ nama: string; hasil: { volume?: unknown } }> = [
  {
    nama: 'balok',
    hasil: analisaBalok({
      bMm: 300, hMm: 520, panjangM: 6, selimutMm: 30, dUtamaMm: 16,
      nTarik: 5, dSengkangMm: 8, jarakSengkangMm: 150, mutu, muKnm: 120, vuKn: 90,
    }),
  },
  {
    nama: 'kolom',
    hasil: analisaKolom({
      hMm: 400, bMm: 400, tinggiM: 3.5, selimutMm: 40, dUtamaMm: 19,
      nBarisX: 3, nBarisY: 3, dSengkangMm: 10, jarakSengkangMm: 150,
      mutu, puKn: 1500, muKnm: 80,
    }),
  },
  {
    nama: 'plat',
    hasil: analisaPlat({
      lxM: 3.5, lyM: 4, hM: 0.12, selimutMm: 20,
      dTulanganMm: 10, jarakTulanganMm: 150,
      tumpuan: { y1: 'menerus', y2: 'menerus', x1: 'menerus', x2: 'menerus' },
      mutu, bebanMatiTambahan: [{ nama: 'Finishing', nilai: 1.2 }],
      bebanHidupKnM2: 2.5, luasM2: 200,
    } as never),
  },
  {
    nama: 'footplat',
    hasil: analisaFootplat({
      lxM: 1.5, lyM: 1.5, hM: 0.3, bxM: 0.4, byM: 0.4, pxM: 0.75, pyM: 0.75,
      zM: 1.5, gammaTanahKnM3: 17, letakKolom: 'tengah', mutu,
      dAksenM: 0.07, dTulanganMm: 13, jarakTulanganMm: 150,
      pukKn: 400, muxKnm: 20, muyKnm: 20, qaKnM2: 300,
    } as never),
  },
  {
    nama: 'sloof',
    hasil: analisaSloof({
      bMm: 150, hMm: 250, bentangM: 3, selimutMm: 30, dUtamaMm: 12,
      nBawah: 2, nAtas: 2, dSengkangMm: 8, jarakSengkangMm: 150, mutu,
      tinggiDindingM: 3, tebalDindingM: 0.15, jenisDinding: 'bata_merah',
    }),
  },
  {
    nama: 'tangga',
    hasil: analisaTangga({
      tebalPelatMm: 150, lebarM: 1.2, tinggiM: 3.2,
      optredeMm: 175, antredeMm: 280, selimutMm: 20,
      dUtamaMm: 12, jarakUtamaMm: 150, dBagiMm: 8, jarakBagiMm: 200,
      mutu, pemakaian: 'hunian',
    }),
  },
  {
    nama: 'balok_t',
    hasil: analisaBalokT({
      bwMm: 200, hMm: 400, hfMm: 120, bentangBersihM: 4, jarakAsAsM: 3,
      selimutMm: 30, dUtamaMm: 16, nTarik: 3, nAtas: 2,
      dSengkangMm: 8, jarakSengkangMm: 150, mutu,
      muPositifKnm: 60, muNegatifKnm: 40, vuKn: 70,
    }),
  },
  {
    nama: 'pondasi_menerus',
    hasil: analisaPondasiMenerus({
      jenis: 'batu_kali', lebarBawahM: 0.6, lebarAtasM: 0.3, tinggiM: 0.6,
      panjangM: 40, kedalamanM: 0.8, bebanKnPerM: 25, qaKnM2: 150,
    }),
  },
  {
    nama: 'raft',
    hasil: analisaRaft({
      panjangM: 12, lebarM: 8, tebalMm: 400, bebanTotalKn: 4800,
      eksentrisitasXM: 0.5, eksentrisitasYM: 0.3, qaKnM2: 120,
      selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150, mutu, bentangKolomM: 4,
    }),
  },
  {
    nama: 'dinding_penahan',
    hasil: analisaDindingPenahan({
      tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4,
      panjangTelapakM: 2, tebalTelapakM: 0.4, kakiM: 0.5,
      gammaTanahKnM3: 18, phiDerajat: 30, qaKnM2: 200, panjangDindingM: 20,
      selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150, mutu,
    }),
  },
  {
    nama: 'dinding_geser',
    hasil: analisaDindingGeser({
      panjangM: 4, tebalMm: 250, tinggiM: 12,
      vuKn: 800, muKnm: 6000, puKn: 1500,
      rhoHorizontal: 0.003, rhoVertikal: 0.003, asUjungMm2: 2000,
      selimutMm: 40, dUtamaMm: 13, jarakUtamaMm: 200, mutu,
    }),
  },
  {
    nama: 'kolom_komposit',
    hasil: analisaKolomKomposit({
      jenis: 'terbungkus', asBajaMm2: 6353, inersiaBajaMm4: 1.34e7,
      lebarBetonMm: 400, tinggiBetonMm: 400, panjangTekukM: 3.5,
      asTulanganMm2: 1256, mutuBaja: { fyMpa: 240 }, mutuBeton: { fcMpa: 30 },
      mutuTulangan: { fyMpa: 400 }, puKn: 3000,
    }),
  },
  {
    nama: 'bondek',
    hasil: analisaBondek({
      bentangM: 2.5, tebalTotalMm: 120, tinggiGelombangMm: 50, tebalBajaMm: 0.75,
      asBondekMm2PerM: 1300, inersiaBondekMm4PerM: 540000,
      mutuBondek: { fyMpa: 550 }, mutuBeton: { fcMpa: 25 },
      bebanHidupKpa: 2.5, bebanMatiTambahanKpa: 1.2, luasM2: 100,
    }),
  },
  {
    nama: 'kuda_kuda_kayu',
    hasil: analisaKudaKudaKayu({
      kelas: 'II', lebarMm: 60, tinggiMm: 120, panjangM: 3,
      gayaKn: -15, momenKnm: 0.5, durasi: 'tetap', kadarAir: 'kering',
      lebarTumpuanMm: 80, gayaTumpuKn: 12,
    }),
  },
  {
    nama: 'baja_ringan',
    hasil: analisaBajaRingan({
      profil: 'C75_100', panjangM: 1.5, gayaKn: -4,
      jarakKudaKudaM: 1.2, lapisanGM2: 100, lingkungan: 'biasa',
    }),
  },
  {
    nama: 'baja_balok',
    hasil: analisaBalokBaja({
      profil: {
        designation: '200x100x5.5x8', profile_type: 'WF',
        hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
        beratKgPerM: 21.3333, panjangStandarM: 12,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      bentangM: 6, jarakPengakuM: 0, muKnm: 30, vuKn: 60, bebanLayanKnPerM: 3,
    } as never),
  },
]

describe('bentuk VolumeElemen seragam di seluruh modul', () => {
  it.each(SEMUA.map((x) => [x.nama, x.hasil] as const))(
    '%s memulangkan volume berbentuk kanonik',
    (_nama, hasil) => {
      const v = hasil.volume as Record<string, unknown> | undefined
      /* Modul tanpa volume (sambungan, angkur) tak masuk daftar ini. */
      expect(v, 'modul ini seharusnya punya volume').toBeDefined()

      expect(typeof v!.betonM3, 'betonM3 harus number').toBe('number')
      expect(typeof v!.bekistingM2, 'bekistingM2 harus number').toBe('number')
      expect(Array.isArray(v!.besi), 'besi harus ARRAY — inilah yang runtuh').toBe(true)
      expect(typeof v!.besiTotalKg, 'besiTotalKg harus number').toBe('number')
      expect(typeof v!.beratSendiriKg, 'beratSendiriKg harus number').toBe('number')

      /* Tak ada NaN yang menyelinap — NaN menular ke seluruh rekap. */
      expect(Number.isFinite(v!.betonM3 as number)).toBe(true)
      expect(Number.isFinite(v!.besiTotalKg as number)).toBe(true)
    },
  )

  it('tiap baris besi berbentuk BarisBesi lengkap', () => {
    for (const { nama, hasil } of SEMUA) {
      const v = hasil.volume as { besi: Array<Record<string, unknown>> }
      for (const b of v.besi) {
        expect(typeof b.tipe, `${nama}: tipe`).toBe('string')
        expect(typeof b.diameterMm, `${nama}: diameterMm`).toBe('number')
        expect(typeof b.jumlahBatang, `${nama}: jumlahBatang`).toBe('number')
        expect(typeof b.totalKg, `${nama}: totalKg`).toBe('number')
        expect(typeof b.peran, `${nama}: peran`).toBe('string')
        expect(Number.isFinite(b.totalKg as number), `${nama}: totalKg finite`).toBe(true)
      }
    }
  })

  it('rekapVolume SANGGUP menjumlahkan SEMUANYA sekaligus', () => {
    /*
      ⚠ Inilah test yang akan merah pada cacat aslinya.

      `rekap-volume` seluruh proyek runtuh HTTP 500 begitu ada satu elemen
      kayu — dan tak ada satu test pun yang menangkapnya, karena setiap modul
      diuji SENDIRI-SENDIRI. Yang runtuh adalah penjumlahannya.
    */
    const r = rekapVolume(SEMUA.map((x) => x.hasil as { volume: never }))
    expect(Number.isFinite(r.betonM3)).toBe(true)
    expect(Number.isFinite(r.besiTotalKg)).toBe(true)
    expect(Array.isArray(r.besi)).toBe(true)
    expect(r.betonM3).toBeGreaterThan(0)
  })

  it('DAFTAR di berkas ini tidak boleh tertinggal dari modulnya', () => {
    /*
      Angka ini dipaku SENGAJA. Modul baru yang memulangkan volume harus
      ditambahkan ke daftar di atas — dan test ini merah sampai seseorang
      benar-benar menambahkannya, bukan sekadar menaikkan angkanya.

      Tanpa ini, modul baru yang bentuk volumenya menyimpang lolos persis
      seperti kayu dan baja ringan lolos.
    */
    expect(SEMUA.length).toBe(16)
  })
})

describe('modul TANPA volume — dan itu benar', () => {
  it('sebagian modul baja memang tak bervolume, dan rute tahu itu', () => {
    /*
      Sambungan baut, las, angkur, interaksi, gusset, dan sambungan momen
      menghitung KAPASITAS, bukan kuantitas material — jadi mereka memang tak
      punya `volume`, dan `TANPA_VOLUME` di rute menyebutkan mereka.

      Yang penting bukan memaksa semuanya bervolume, melainkan: yang PUNYA
      volume bentuknya harus kanonik (diuji di blok atas), dan yang TIDAK
      punya harus terdaftar supaya rekap melaporkannya sebagai "sengaja
      dilewati", bukan sebagai kegagalan.

      Daftar itu diperiksa `audit-jenis-volume-terdaftar.mjs`, bukan di sini —
      ia membandingkan kode rute dengan modulnya, dan itu pemeriksaan teks
      yang lebih tepat dikerjakan skrip.
    */
    expect(SEMUA.every((x) => x.hasil.volume !== undefined)).toBe(true)
  })
})

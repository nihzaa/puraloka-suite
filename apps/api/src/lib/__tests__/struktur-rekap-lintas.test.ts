import { describe, it, expect } from 'vitest'
import { analisaBalok, analisaKolom, rekapVolume } from '../struktur-beton'
import { analisaPlat } from '../struktur-plat'
import { analisaFootplat } from '../struktur-footplat'
import { analisaPilecap } from '../struktur-pilecap'
import { analisaKolomBulat } from '../struktur-kolom-bulat'
import { analisaTiang } from '../struktur-tiang'

/**
 * REKAP LINTAS MODUL — jalur ke RAP.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Delapan modul Fase 1 masing-masing lulus testnya sendiri, dan itu TIDAK
 * membuktikan mereka bisa dipakai bersama. Audit silang menemukan celah yang
 * tak terlihat dari test mana pun:
 *
 *     rekapVolume(hasil: HasilElemen[])
 *
 * `HasilElemen` adalah tipe milik balok & kolom persegi saja. Pelat, footplat,
 * pilecap, dan kolom bulat punya tipe hasil sendiri — jadi keempatnya TAK BISA
 * direkap, dan jalur ke RAP putus tepat di tempat yang paling dibutuhkan: satu
 * proyek nyata berisi kelima jenis elemen sekaligus.
 *
 * Test ini menutupnya, dan menjaganya tetap tertutup: menambah modul baru yang
 * bentuk `volume`-nya menyimpang akan langsung merah di sini.
 */

const BALOK = analisaBalok({
  bMm: 300, hMm: 500, panjangM: 6, selimutMm: 30,
  dUtamaMm: 16, nTarik: 5, dSengkangMm: 8, jarakSengkangMm: 150,
  mutu: { fcMpa: 30, fyMpa: 400 }, muKnm: 100, vuKn: 80, jumlah: 12,
})

const KOLOM = analisaKolom({
  hMm: 400, bMm: 400, tinggiM: 3.5, selimutMm: 40,
  dUtamaMm: 16, nBarisX: 3, nBarisY: 3,
  dSengkangMm: 10, jarakSengkangMm: 150,
  mutu: { fcMpa: 30, fyMpa: 400 }, puKn: 800, muKnm: 50, jumlah: 8,
})

const KOLOM_BULAT = analisaKolomBulat({
  diameterMm: 400, tinggiM: 3.5, nTulangan: 8, selimutMm: 40,
  dUtamaMm: 16, dPengekangMm: 10, jarakPengekangMm: 150,
  pengekang: 'sengkang', mutu: { fcMpa: 30, fyMpa: 400 },
  puKn: 700, muKnm: 40, jumlah: 4,
})

const PLAT = analisaPlat({
  lyM: 4, lxM: 3.5, hM: 0.12,
  tumpuan: { y1: 'menerus', y2: 'menerus', x1: 'menerus', x2: 'menerus' },
  dTulanganMm: 10, jarakTulanganMm: 150, selimutMm: 20,
  mutu: { fcMpa: 30, fyMpa: 400 },
  bebanMatiTambahan: [{ nama: 'Finishing', nilai: 1.2 }],
  bebanHidupKnM2: 2.5, luasM2: 200,
})

const FOOTPLAT = analisaFootplat({
  lxM: 1.5, lyM: 1.5, hM: 0.3, bxM: 0.4, byM: 0.4, pxM: 0.75, pyM: 0.75,
  zM: 1.5, gammaTanahKnM3: 17, letakKolom: 'tengah',
  mutu: { fcMpa: 30, fyMpa: 400 },
  dAksenM: 0.07, dTulanganMm: 13, jarakTulanganMm: 150,
  pukKn: 400, muxKnm: 20, muyKnm: 20, qaKnM2: 300, jumlah: 8,
})

const PILECAP = analisaPilecap({
  nx: 2, ny: 2, dxM: 1.2, dyM: 1.2, axM: 0.5, ayM: 0.5,
  diameterTiangM: 0.4, bxM: 0.4, byM: 0.4, hM: 0.5, zM: 1,
  gammaTanahKnM3: 18, letakKolom: 'tengah',
  mutu: { fcMpa: 30, fyMpa: 400 },
  dAksenM: 0.08, dTulanganMm: 16, jarakTulanganMm: 150,
  pukKn: 1200, muxKnm: 40, muyKnm: 40, pIjinTiangKn: 425, jumlah: 2,
})

const TIANG = analisaTiang({
  diameterM: 0.4, panjangM: 16, fcMpa: 36.6,
  lapisan: Array(8).fill(null).map(() => ({ tebalM: 2, nSpt: 20 })),
  bebanRencanaKn: 300, jumlah: 6,
})

const SEMUA = [BALOK, KOLOM, KOLOM_BULAT, PLAT, FOOTPLAT, PILECAP]

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * TIANG PANCANG — cacat yang memutus jalur RAP, ditemukan lewat AUDIT.
 *
 * `HasilTiang.volume` semula hanya `{ betonM3, jumlahTiang, totalPanjangM }`.
 * Begitu tiang ikut direkap bersama elemen lain, `rekapVolume` crash:
 *
 *     TypeError: h.volume.besi is not iterable
 *
 * TypeScript TIDAK menangkapnya — `rekapVolume` menerima bentuk struktural
 * `{ volume: VolumeElemen }`, dan objek yang kekurangan medan hanya gagal saat
 * dijalankan. Test per-modul juga tidak: tiap modul lulus sendiri-sendiri.
 *
 * Kelas cacat yang sama dengan dua temuan Fase 1 (jalur RAP putus, besi pelat
 * kurang 14×) — dan itu sebabnya audit silang dijadikan test, bukan
 * pemeriksaan sekali jalan.
 * ══════════════════════════════════════════════════════════════════════════════
 */
describe('tiang pancang ikut jalur RAP', () => {
  it('volume tiang berbentuk VolumeElemen lengkap', () => {
    expect(Array.isArray(TIANG.volume.besi)).toBe(true)
    expect(typeof TIANG.volume.bekistingM2).toBe('number')
    expect(typeof TIANG.volume.besiTotalKg).toBe('number')
    expect(typeof TIANG.volume.beratSendiriKg).toBe('number')
  })

  it('bekisting & besi NOL — pracetak, bukan data hilang', () => {
    // Tiang pancang datang jadi dari pabrik: tak ada bekisting di proyek,
    // tulangannya sudah terpasang. Nol di sini adalah jawaban, bukan lubang.
    expect(TIANG.volume.bekistingM2).toBe(0)
    expect(TIANG.volume.besi).toEqual([])
    expect(TIANG.volume.besiTotalKg).toBe(0)
    // Betonnya TIDAK nol — tiangnya tetap volume beton yang dibeli.
    expect(TIANG.volume.betonM3).toBeGreaterThan(0)
    expect(TIANG.volume.beratSendiriKg).toBeCloseTo(TIANG.volume.betonM3 * 2400, 6)
  })

  it('bisa direkap bersama SELURUH elemen lain tanpa crash', () => {
    const r = rekapVolume([...SEMUA, TIANG])
    expect(r.betonM3).toBeCloseTo(
      SEMUA.reduce((s, e) => s + e.volume.betonM3, 0) + TIANG.volume.betonM3, 9)
    // Besi tiang nol, jadi tak menambah — tetapi juga tak merusak.
    expect(r.besiTotalKg).toBeCloseTo(
      SEMUA.reduce((s, e) => s + e.volume.besiTotalKg, 0), 6)
  })

  it('medan khas tiang tetap ada di sampingnya', () => {
    expect(TIANG.volume.jumlahTiang).toBe(6)
    expect(TIANG.volume.totalPanjangM).toBe(96)
  })
})

describe('rekapVolume menerima SELURUH jenis elemen', () => {
  it('kelima tipe hasil bisa direkap bersama — tanpa cast, tanpa adapter', () => {
    // Kalau `rekapVolume` menuntut HasilElemen[] lagi, baris ini gagal COMPILE.
    const r = rekapVolume(SEMUA)
    expect(r.betonM3).toBeGreaterThan(0)
    expect(r.besi.length).toBeGreaterThan(0)
  })

  it('beton dijumlah dari seluruh elemen', () => {
    const r = rekapVolume(SEMUA)
    const manual = SEMUA.reduce((s, e) => s + e.volume.betonM3, 0)
    expect(r.betonM3).toBeCloseTo(manual, 9)
  })

  it('bekisting & berat sendiri ikut dijumlah', () => {
    const r = rekapVolume(SEMUA)
    expect(r.bekistingM2).toBeCloseTo(
      SEMUA.reduce((s, e) => s + e.volume.bekistingM2, 0), 9)
    expect(r.beratSendiriKg).toBeCloseTo(
      SEMUA.reduce((s, e) => s + e.volume.beratSendiriKg, 0), 6)
  })

  it('besi digabung per (tipe, diameter, peran) — satuan yang DIBELI', () => {
    const r = rekapVolume(SEMUA)
    // Total kg harus kekal, apa pun cara pengelompokannya.
    const totalManual = SEMUA.reduce((s, e) => s + e.volume.besiTotalKg, 0)
    expect(r.besiTotalKg).toBeCloseTo(totalManual, 6)

    // Tak ada kunci ganda: (tipe|diameter|peran) unik.
    const kunci = r.besi.map((b) => `${b.tipe}|${b.diameterMm}|${b.peran}`)
    expect(new Set(kunci).size).toBe(kunci.length)
  })

  it('D16 dari balok, kolom, kolom bulat & pilecap MENYATU jadi satu baris', () => {
    const r = rekapVolume(SEMUA)
    const d16utama = r.besi.filter((b) => b.diameterMm === 16 && b.peran === 'utama')
    expect(d16utama).toHaveLength(1)
    // Jumlah batangnya = gabungan keempat sumber.
    const manual = SEMUA.reduce((s, e) => s + e.volume.besi
      .filter((b) => b.diameterMm === 16 && b.peran === 'utama')
      .reduce((t, b) => t + b.jumlahBatang, 0), 0)
    expect(d16utama[0].jumlahBatang).toBe(manual)
  })

  it('urutan hasil rekap stabil — tipe lalu diameter', () => {
    const r = rekapVolume(SEMUA)
    const urut = [...r.besi].sort((a, b) =>
      a.tipe.localeCompare(b.tipe) || a.diameterMm - b.diameterMm)
    expect(r.besi).toEqual(urut)
  })

  it('rekap sebagian = jumlah rekap bagiannya (asosiatif)', () => {
    // Sifat ini yang membuat rekap per-lantai lalu per-gedung sah.
    const a = rekapVolume([BALOK, KOLOM, KOLOM_BULAT])
    const b = rekapVolume([PLAT, FOOTPLAT, PILECAP])
    const gabung = rekapVolume(SEMUA)
    expect(a.betonM3 + b.betonM3).toBeCloseTo(gabung.betonM3, 9)
    expect(a.besiTotalKg + b.besiTotalKg).toBeCloseTo(gabung.besiTotalKg, 6)
  })

  it('daftar kosong → nol bersih, bukan NaN', () => {
    const r = rekapVolume([])
    expect(r.betonM3).toBe(0)
    expect(r.besiTotalKg).toBe(0)
    expect(r.besi).toEqual([])
  })
})

describe('kewajaran angka rekap — penjaga satuan', () => {
  const r = rekapVolume(SEMUA)

  /**
   * Rasio besi terhadap beton adalah angka yang dikenal betul insinyur:
   * bangunan gedung biasa 80–200 kg/m³. Di luar itu hampir pasti ada satuan
   * yang tertukar — mm vs m, kg vs ton.
   *
   * Ini penjaga yang menangkap kelas kesalahan yang tak bisa ditangkap test
   * per-modul: tiap modul benar sendiri, tetapi salah satu memakai satuan
   * berbeda dan baru terlihat saat dijumlahkan.
   */
  it('rasio besi/beton masuk akal untuk bangunan gedung (60–250 kg/m³)', () => {
    const rasio = r.besiTotalKg / r.betonM3
    expect(rasio).toBeGreaterThan(60)
    expect(rasio).toBeLessThan(250)
  })

  it('berat sendiri konsisten dengan volume beton (ρ 2400 kg/m³)', () => {
    expect(r.beratSendiriKg / r.betonM3).toBeCloseTo(2400, 6)
  })

  it('bekisting per m³ beton wajar (2–12 m²/m³)', () => {
    // Pelat tipis luas menaikkan angka ini; kolom/balok menurunkannya.
    const rasio = r.bekistingM2 / r.betonM3
    expect(rasio).toBeGreaterThan(2)
    expect(rasio).toBeLessThan(12)
  })
})

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENJAGA CATATAN — batas yang tak tertulis akan dipakai sebagai kebenaran.
 *
 * Angka volume dari modul-modul ini masuk ke RAP, dan RAP jadi dasar pemesanan
 * besi. Setiap modul punya batas yang SELALU berlaku dan tak bisa dihitung dari
 * inputnya:
 *
 *   balok/kolom       — panjang penyaluran, kait, sambungan lewatan
 *   pelat             — kait ujung & lewatan
 *   footplat/pilecap  — stek kolom (dowel); pilecap juga stek tiang
 *   tiang             — kapasitas BAHAN saja bila tak ada data tanah
 *
 * Batas itu sempat hidup hanya sebagai komentar di dalam berkas sumber —
 * tempat yang tak pernah dibaca orang yang memakai angkanya. Diukur pada
 * balok 300×520 L=6m: BBS memberi 1,26× berat Fase 1; stek kolom pada
 * fondasi 2×2 dengan kolom 8D19 sekitar 28% tulangan fondasi.
 *
 * Penjaga ini menuntut catatan itu ADA pada hasil yang SELURUH pemeriksaannya
 * hijau — bukan hanya saat elemennya bermasalah. Yang hasilnya baik-baik saja
 * justru yang langsung dipakai untuk memesan.
 * ══════════════════════════════════════════════════════════════════════════════
 */
describe('setiap modul membawa batasnya sendiri, bukan hanya angkanya', () => {
  /*
    TIANG IKUT — pengecualian sebelumnya adalah kesalahan saya.

    Alasan yang saya tulis: "tiang tak punya batas penyaluran (precast,
    tulangan pabrikan)". Benar, tetapi itu justru membuat batasnya LEBIH
    berbahaya, bukan tak ada: tiang memulangkan besi 0 kg dan bekisting 0 m²,
    dan nol di layar rekap tak bisa membedakan dirinya dari "belum dihitung".

    Diukur: `analisaTiang` dengan data tanah lengkap memulangkan `catatan`
    KOSONG. Estimator yang merekap 6 tiang melihat "besi 0,0 kg" tanpa satu
    kata pun keterangan.

    Penjaga yang mengecualikan kasus tersulitnya sendiri bukan penjaga.
  */
  const bercatatan: Array<[string, { catatan: string[]; aman: boolean }]> = [
    ['balok', BALOK], ['kolom', KOLOM], ['kolom bulat', KOLOM_BULAT],
    ['pelat', PLAT], ['footplat', FOOTPLAT], ['pilecap', PILECAP],
    ['tiang', TIANG],
  ]

  it.each(bercatatan)('%s punya catatan meski seluruh pemeriksaannya hijau', (_n, h) => {
    expect(Array.isArray(h.catatan)).toBe(true)
    expect(h.catatan.length).toBeGreaterThan(0)
  })

  it('catatan menyebut BATAS VOLUME, bukan sekadar peringatan desain', () => {
    /*
      Perbedaan yang dijaga di sini: "pelat terlalu tipis" adalah peringatan
      DESAIN — muncul hanya saat ada masalah, dan orang yang hasilnya hijau
      tak pernah melihatnya. Yang harus selalu ada adalah batas KUANTITAS,
      karena itulah yang dipakai memesan besi.
    */
    const batasVolume = /penyaluran|lewatan|kait|stek|dowel|pracetak/i
    for (const [nama, h] of bercatatan) {
      expect(
        h.catatan.some((c) => batasVolume.test(c)),
        `${nama} tak menyebut satu pun batas volume besi`,
      ).toBe(true)
    }
  })

  it('tiang: batasnya disebut saat data tanah tak ada', () => {
    // Tiang tak punya batas penyaluran (precast, tulangan pabrikan), tetapi
    // punya batas yang jauh lebih berbahaya: angka tanpa data tanah BUKAN
    // daya dukung. Dijaga terpisah karena bentuk batasnya beda.
    const tanpaTanah = analisaTiang({
      diameterM: 0.4, panjangM: 16, fcMpa: 36.6,
      lapisan: [], bebanRencanaKn: 300, jumlah: 6,
    })
    expect(tanpaTanah.catatan.join(' ')).toMatch(/BUKAN daya dukung/i)
  })
})

import { describe, it, expect } from 'vitest'
import { analisaBalok, analisaKolom, rekapVolume } from '../struktur-beton'
import { analisaPlat } from '../struktur-plat'
import { analisaFootplat } from '../struktur-footplat'
import { analisaPilecap } from '../struktur-pilecap'
import { analisaKolomBulat } from '../struktur-kolom-bulat'

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

const SEMUA = [BALOK, KOLOM, KOLOM_BULAT, PLAT, FOOTPLAT, PILECAP]

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

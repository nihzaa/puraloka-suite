import { describe, it, expect } from 'vitest'
import { analisaKolomLengkap, analisaKolomBulatLengkap } from '../struktur-kolom-lengkap'
import { analisaKolom, rekapVolume, type InputKolom } from '../struktur-beton'
import { analisaKolomBulat, type InputKolomBulat } from '../struktur-kolom-bulat'

/**
 * PENYAMBUNG kolom + diagram P-M — pembuktian bahwa batas Fase 1 TERTUTUP.
 *
 * Sampai Fase 1, kedua modul kolom hanya memeriksa dua titik dan menyatakan
 * batasnya di `catatan`. Test di sini membuktikan tiga hal:
 *
 *   1. verdict P-M ditambahkan, bukan menimpa pemeriksaan lama
 *   2. kolom yang LOLOS cek aksial bisa GAGAL cek P-M — dan itu tertangkap
 *   3. catatan "BUKAN diagram penuh" hilang karena sudah tidak benar
 */

const PERSEGI: InputKolom = {
  hMm: 400, bMm: 400, tinggiM: 3.5, selimutMm: 30,
  dUtamaMm: 16, nBarisX: 4, nBarisY: 4,
  dSengkangMm: 8, jarakSengkangMm: 150,
  mutu: { fcMpa: 55, fyMpa: 420 },
  puKn: 1250, muKnm: 60,
}

const BULAT: InputKolomBulat = {
  diameterMm: 500, tinggiM: 3.5, nTulangan: 12, selimutMm: 35,
  dUtamaMm: 19, dPengekangMm: 10, jarakPengekangMm: 75,
  pengekang: 'sengkang', mutu: { fcMpa: 35, fyMpa: 400 },
  puKn: 1500, muKnm: 100,
}

describe('kolom persegi lengkap', () => {
  const h = analisaKolomLengkap(PERSEGI)

  it('pemeriksaan dasar DIPERTAHANKAN, verdict P-M DITAMBAHKAN', () => {
    const dasar = analisaKolom(PERSEGI)
    // Seluruh pemeriksaan lama masih ada…
    for (const p of dasar.periksa) {
      expect(h.periksa.some((x) => x.nama === p.nama), p.nama).toBe(true)
    }
    // …plus satu yang baru.
    expect(h.periksa).toHaveLength(dasar.periksa.length + 1)
    expect(h.periksa.at(-1)!.nama).toBe('Titik beban pada diagram P-M')
  })

  it('catatan "BUKAN diagram P-M penuh" DIBUANG — batasnya sudah ditutup', () => {
    expect(h.catatan.some((c) => /BUKAN diagram interaksi P-M penuh/i.test(c)))
      .toBe(false)
  })

  it('kurva dihitung penuh, bukan dua titik', () => {
    expect(h.diagram.titik.length).toBeGreaterThan(100)
    expect(h.diagram.phiPnMaksKn).toBeGreaterThan(0)
    expect(h.diagram.phiMnMaksKnm).toBeGreaterThan(0)
  })

  it('beban ringan → aman di kedua pemeriksaan', () => {
    expect(h.aman).toBe(true)
    expect(h.titikBeban.aman).toBe(true)
  })

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * INILAH ALASAN FASE 2 ADA.
   *
   * Momen besar pada aksial kecil: pemeriksaan aksial MELOLOSKANNYA, verdict
   * P-M menangkapnya. Tanpa penyambung ini, kolom seperti itu mendapat
   * verdict "aman" yang salah.
   * ══════════════════════════════════════════════════════════════════════════
   */
  it('momen besar + aksial kecil: cek aksial LOLOS, cek P-M GAGAL', () => {
    const bahaya: InputKolom = { ...PERSEGI, puKn: 200, muKnm: 900 }

    // Modul lama (Fase 1) menyatakan AMAN — dan itu salah.
    const lama = analisaKolom(bahaya)
    expect(lama.periksa.find((p) => p.nama === 'Kapasitas aksial')!.aman).toBe(true)
    expect(lama.aman).toBe(true)

    // Modul lengkap menangkapnya.
    const baru = analisaKolomLengkap(bahaya)
    expect(baru.periksa.find((p) => p.nama === 'Kapasitas aksial')!.aman).toBe(true)
    expect(baru.titikBeban.aman).toBe(false)
    expect(baru.aman).toBe(false)
    expect(baru.catatan.some((c) => /DI LUAR kurva/.test(c))).toBe(true)
  })

  it('verdict P-M dan aksial DIPISAH — supaya terlihat mana yang menentukan', () => {
    const bahaya = analisaKolomLengkap({ ...PERSEGI, puKn: 200, muKnm: 900 })
    const aksial = bahaya.periksa.find((p) => p.nama === 'Kapasitas aksial')!
    const pm = bahaya.periksa.find((p) => p.nama === 'Titik beban pada diagram P-M')!
    // Menggabungkannya jadi satu akan menyembunyikan bahwa yang kurang adalah
    // kapasitas MOMEN, bukan aksial — dan itu menentukan apa yang diperbesar.
    expect(aksial.aman).toBe(true)
    expect(pm.aman).toBe(false)
    expect(pm.satuan).toBe('kNm')
    expect(pm.rumus).toContain('interpolasi kurva')
  })

  it('beban aksial berlebih → kedua pemeriksaan merah', () => {
    const berat = analisaKolomLengkap({ ...PERSEGI, puKn: 99_999, muKnm: 10 })
    expect(berat.periksa.find((p) => p.nama === 'Kapasitas aksial')!.aman).toBe(false)
    expect(berat.titikBeban.aman).toBe(false)
  })

  /**
   * KONVERGENSI kurva — bukan sekadar "hasilnya mirip".
   *
   * Percobaan pertama menuntut 50 dan 500 langkah menghasilkan angka yang sama
   * dalam 0.5 kNm, dan MERAH: selisihnya 1.72. Diukur konvergensinya:
   *
   *       50 langkah → 322.8588
   *      100         → 324.4369   Δ 1.5781
   *      200         → 324.5759   Δ 0.1390
   *      400         → 324.5792   Δ 0.0033
   *      800         → 324.5793   Δ 0.0001
   *     3200         → 324.5795   Δ 0.0001
   *
   * Jadi bukan kurvanya yang tak stabil — 50 langkah memang terlalu kasar
   * untuk menangkap puncak. Sejak 200 selisihnya < 0.05%, sejak 400 sudah
   * mantap di 4 desimal.
   *
   * Test ini menguji SIFAT yang benar (konvergen & monoton mengecil), bukan
   * kesamaan dua angka sembarang — dan itu menjaga hal yang sebenarnya
   * penting: menaikkan ketelitian tak boleh mengubah jawaban.
   */
  it('kurva KONVERGEN saat langkah dinaikkan — selisih mengecil, verdict tetap', () => {
    const nilai = [100, 200, 400, 800].map((n) =>
      analisaKolomLengkap(PERSEGI, n).titikBeban.phiMnPadaPuKnm)

    // Selisih berturut-turut harus mengecil (konvergen).
    const delta = nilai.slice(1).map((v, i) => Math.abs(v - nilai[i]))
    for (let i = 1; i < delta.length; i++) {
      expect(delta[i], `Δ${i} tidak mengecil`).toBeLessThanOrEqual(delta[i - 1])
    }

    // Pada 400 ke atas, hasilnya sudah mantap dalam 0.01 kNm.
    expect(nilai[3]).toBeCloseTo(nilai[2], 1)

    // Verdict TIDAK berubah oleh ketelitian — ini yang paling penting.
    for (const n of [50, 100, 200, 500, 1000]) {
      expect(analisaKolomLengkap(PERSEGI, n).aman, `langkah ${n}`).toBe(true)
    }
  })

  it('default 200 langkah sudah akurat < 0.1% terhadap 1600', () => {
    const bawaan = analisaKolomLengkap(PERSEGI).titikBeban.phiMnPadaPuKnm
    const acuan = analisaKolomLengkap(PERSEGI, 1600).titikBeban.phiMnPadaPuKnm
    expect(Math.abs(bawaan - acuan) / acuan * 100).toBeLessThan(0.1)
  })
})

describe('kolom lingkaran lengkap', () => {
  const h = analisaKolomBulatLengkap(BULAT)

  it('pemeriksaan dasar dipertahankan + verdict P-M', () => {
    const dasar = analisaKolomBulat(BULAT)
    expect(h.periksa).toHaveLength(dasar.periksa.length + 1)
    expect(h.periksa.at(-1)!.nama).toBe('Titik beban pada diagram P-M')
  })

  it('catatan lama dibuang, catatan BATAS LINGKARAN ditambahkan', () => {
    // Yang satu sudah tidak benar (dibuang); yang lain masih berlaku dan
    // WAJIB ikut supaya pemakainya tahu kapan hasilnya perlu diverifikasi.
    expect(h.catatan.some((c) => /BUKAN diagram interaksi P-M penuh/i.test(c)))
      .toBe(false)
    expect(h.catatan.some((c) => /lebar EKUIVALEN/i.test(c))).toBe(true)
    expect(h.catatan.some((c) => /tembereng/i.test(c))).toBe(true)
  })

  it('faktor pengekang diteruskan ke kurva — spiral ≠ sengkang', () => {
    const sengkang = analisaKolomBulatLengkap(BULAT)
    const spiral = analisaKolomBulatLengkap({ ...BULAT, pengekang: 'spiral', jarakPengekangMm: 70 })
    // Spiral: faktor 0.85 & φ 0.75 → puncak kurva lebih tinggi.
    expect(spiral.diagram.phiPnMaksKn).toBeGreaterThan(sengkang.diagram.phiPnMaksKn)
  })

  it('momen besar + aksial kecil tertangkap juga pada lingkaran', () => {
    const bahaya = analisaKolomBulatLengkap({ ...BULAT, puKn: 150, muKnm: 1200 })
    expect(bahaya.titikBeban.aman).toBe(false)
    expect(bahaya.aman).toBe(false)
  })
})

/**
 * AUDIT SILANG dijadikan TEST — bukan pemeriksaan sekali jalan.
 *
 * Dua cacat terparah Fase 1 (jalur RAP putus, besi pelat kurang 14×) ditemukan
 * lewat audit silang, bukan test. Pelajarannya diterapkan di sini: sifat yang
 * diperiksa audit langsung dikunci jadi test, supaya ia menjaga terus.
 */
describe('audit silang — sifat yang harus berlaku di SELURUH rentang beban', () => {
  /**
   * Penambahan verdict P-M TIDAK BOLEH melonggarkan apa pun.
   *
   * Kalau ada kombinasi (Pu, Mu) yang ditolak modul lama tetapi diloloskan
   * modul lengkap, artinya penyambungnya menelan verdict — dan Fase 2 justru
   * membuat keadaan lebih buruk daripada Fase 1.
   */
  it('modul lengkap TIDAK PERNAH lebih longgar dari modul dasar (42 kombinasi)', () => {
    let diuji = 0
    for (const puKn of [100, 300, 600, 1000, 2000, 3000, 4000]) {
      for (const muKnm of [10, 50, 100, 200, 400, 800]) {
        const lama = analisaKolom({ ...PERSEGI, puKn, muKnm })
        const baru = analisaKolomLengkap({ ...PERSEGI, puKn, muKnm })
        if (!lama.aman) {
          expect(baru.aman, `Pu=${puKn} Mu=${muKnm}: dasar TIDAK aman tapi lengkap AMAN`)
            .toBe(false)
        }
        diuji++
      }
    }
    expect(diuji).toBe(42)
  })

  it('volume TETAP terbawa lewat penyambung — jalur RAP tak putus', () => {
    // Cacat Fase 1 yang persis begini: modul benar sendiri, jalurnya putus
    // saat disambungkan.
    const p = analisaKolomLengkap(PERSEGI)
    const b = analisaKolomBulatLengkap(BULAT)
    expect(p.dasar.volume.betonM3).toBeGreaterThan(0)
    expect(b.dasar.volume.betonM3).toBeGreaterThan(0)
    expect(p.dasar.volume.besi.length).toBeGreaterThan(0)
  })

  it('hasil penyambung bisa direkap bersama elemen lain', () => {
    const r = rekapVolume([
      analisaKolomLengkap(PERSEGI).dasar,
      analisaKolomBulatLengkap(BULAT).dasar,
    ])
    expect(r.betonM3).toBeCloseTo(
      analisaKolom(PERSEGI).volume.betonM3
      + analisaKolomBulat(BULAT).volume.betonM3, 9)
    expect(r.besiTotalKg).toBeGreaterThan(0)
  })
})

describe('tak ada impor melingkar', () => {
  it('kedua fungsi bisa dipanggil — modul termuat utuh', () => {
    // Lingkaran impor di TypeScript tidak selalu gagal compile; ia bisa lolos
    // lalu memulangkan `undefined` saat runtime pada modul yang dimuat belakangan.
    // Test ini membuktikan keduanya benar-benar terpanggil.
    expect(typeof analisaKolomLengkap).toBe('function')
    expect(typeof analisaKolomBulatLengkap).toBe('function')
    expect(analisaKolomLengkap(PERSEGI).diagram.titik.length).toBeGreaterThan(0)
    expect(analisaKolomBulatLengkap(BULAT).diagram.titik.length).toBeGreaterThan(0)
  })
})

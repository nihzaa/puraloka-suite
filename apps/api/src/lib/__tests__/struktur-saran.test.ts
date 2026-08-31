// Mesin rekomendasi tulangan — test DULU (TDD), implementasi menyusul.
//
// ══════════════════════════════════════════════════════════════════════════════
// YANG DIUJI DI SINI, DAN KENAPA BENTUKNYA BEGINI
// ══════════════════════════════════════════════════════════════════════════════
//
// Mesin saran TIDAK menghitung struktur. Ia menyusun kandidat, memanggil
// `analisaBalok`/`analisaKolom` yang sudah teruji, lalu memilih. Karena itu
// test di sini TIDAK mengulang rumus SNI — itu sudah tugas
// `struktur-beton.test.ts`. Yang diuji di sini adalah PERILAKU MEMILIH.
//
// ── Properti kunci (test terpenting di berkas ini)
//
// Apa pun yang diusulkan mesin ini, menjalankannya kembali lewat pemeriksa
// HARUS aman. Itu satu-satunya jaminan yang membuat mesin tak bisa
// mengusulkan hal berbahaya — dan ia diuji sebagai properti atas BANYAK
// masukan, bukan satu contoh yang kebetulan lolos.
//
// Kenapa ini bukan test biasa: usul tulangan yang salah tidak menimbulkan
// galat. Ia menghasilkan angka yang tampak wajar, disalin ke gambar kerja,
// lalu dicor. Kelas cacat "salah tanpa gejala" hanya bisa ditutup dengan
// memeriksa hasilnya terhadap sumber kebenaran yang independen — di sini,
// pemeriksa yang sudah lebih dulu ada dan tak tahu-menahu soal mesin saran.
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { analisaBalok, analisaKolom, type MutuBahan } from '../struktur-beton.js'
import {
  sarankanBalok,
  sarankanKolom,
  DIAMETER_PASAR,
  BATAS_RASIO_NYAMAN,
  type InputSaranBalok,
  type InputSaranKolom,
} from '../struktur-saran.js'

/** K300 ≈ f'c 25 MPa, BjTS 420 — kombinasi paling lazim di proyek Indonesia. */
const MUTU: MutuBahan = { fcMpa: 25, fyMpa: 420, fyvMpa: 280 }

describe('sarankanBalok', () => {
  /**
   * Balok 300×520 L=6m — dimensi contoh yang sudah dipakai di seluruh repo
   * (lihat data contoh halaman struktur dan catatan BBS di HasilElemen).
   */
  const balokLazim: InputSaranBalok = {
    bMm: 300, hMm: 520, panjangM: 6, selimutMm: 30,
    mutu: MUTU, muKnm: 120, vuKn: 90,
  }

  it('mengusulkan tulangan untuk balok yang wajar', () => {
    const hasil = sarankanBalok(balokLazim)

    expect(hasil.berhasil).toBe(true)
    expect(hasil.terpilih).toBeDefined()
    expect(hasil.terpilih!.nTarik).toBeGreaterThanOrEqual(2)
    expect(DIAMETER_PASAR).toContain(hasil.terpilih!.dUtamaMm)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // PROPERTI KUNCI — usul apa pun WAJIB lolos pemeriksa
  // ══════════════════════════════════════════════════════════════════════════
  it('PROPERTI: setiap usulan lolos analisaBalok — atas 24 kombinasi beban', () => {
    const bebanUji: Array<{ muKnm: number; vuKn: number }> = []
    for (const mu of [40, 80, 120, 160, 200, 260]) {
      for (const vu of [50, 90, 140, 200]) bebanUji.push({ muKnm: mu, vuKn: vu })
    }

    let diuji = 0
    for (const beban of bebanUji) {
      const hasil = sarankanBalok({ ...balokLazim, ...beban })
      if (!hasil.berhasil) continue // kegagalan diuji terpisah di bawah

      const t = hasil.terpilih!
      // Jalankan usulan itu lewat pemeriksa — sumber kebenaran yang
      // sama sekali tak tahu-menahu soal mesin saran.
      const verifikasi = analisaBalok({
        bMm: balokLazim.bMm, hMm: balokLazim.hMm, panjangM: balokLazim.panjangM,
        selimutMm: balokLazim.selimutMm, mutu: MUTU,
        muKnm: beban.muKnm, vuKn: beban.vuKn,
        dUtamaMm: t.dUtamaMm, nTarik: t.nTarik,
        dSengkangMm: t.dSengkangMm, jarakSengkangMm: t.jarakSengkangMm,
      })

      const gagal = verifikasi.periksa.filter((p) => !p.aman).map((p) => p.nama)
      expect(gagal, `Mu=${beban.muKnm} Vu=${beban.vuKn} → usul tidak aman: ${gagal.join(', ')}`).toEqual([])
      diuji++
    }

    // Kalau nol kombinasi berhasil, test di atas lolos secara hampa.
    expect(diuji, 'tak satu pun kombinasi menghasilkan usulan — test jadi hampa').toBeGreaterThan(10)
  })

  it('yang terpilih paling hemat besi di antara yang menyisakan cadangan', () => {
    const hasil = sarankanBalok(balokLazim)
    expect(hasil.berhasil).toBe(true)

    // Semua alternatif yang ikut dilaporkan harus >= berat yang terpilih.
    for (const alt of hasil.alternatif) {
      expect(alt.besiKg).toBeGreaterThanOrEqual(hasil.terpilih!.besiKg)
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // CADANGAN — kenapa "paling hemat" saja menghasilkan rekayasa yang buruk
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Meminimalkan kg TANPA syarat lain selalu memenangkan kandidat yang PAS-PASAN
  // lolos: tiap gram cadangan berarti kalah hemat. Diukur pada balok 300×520
  // sebelum aturan ini ada — enam kombinasi beban, rasio kritis terpilih:
  // 0.94 · 0.94 · 0.95 · 0.96 · 0.96 · 0.99. Tak satu pun menyisakan ruang.
  //
  // Itu sah menurut SNI dan buruk di lapangan: beban rencana bergeser (dinding
  // pindah, finishing lebih berat, keramik ganti granit) dan elemen yang
  // dirancang di 0.99 langsung lewat batas tanpa ada yang tahu.
  it('menyisakan cadangan — tak mengusulkan yang pas-pasan lolos', () => {
    for (const [muKnm, vuKn] of [[40, 50], [80, 90], [120, 90], [160, 140], [200, 140]]) {
      const hasil = sarankanBalok({ ...balokLazim, muKnm: muKnm!, vuKn: vuKn! })
      if (!hasil.berhasil) continue
      expect(
        hasil.terpilih!.rasioKritis,
        `Mu=${muKnm} Vu=${vuKn} terpilih di rasio ${hasil.terpilih!.rasioKritis.toFixed(2)} — tanpa cadangan`,
      ).toBeLessThanOrEqual(BATAS_RASIO_NYAMAN)
    }
  })

  it('tidak mengusulkan tulangan tipis berjumlah banyak', () => {
    // 7D10 pernah menang untuk Mu=40 semata karena paling ringan. Batang tipis
    // sebanyak itu menyulitkan perakitan dan pengecoran tanpa memberi manfaat.
    const hasil = sarankanBalok({ ...balokLazim, muKnm: 40, vuKn: 50 })
    expect(hasil.berhasil).toBe(true)
    expect(hasil.terpilih!.nTarik).toBeLessThanOrEqual(6)
  })

  it('cadangan TIDAK dipaksakan bila mustahil — keamanan di atas kenyamanan', () => {
    // Saat hanya kandidat mepet yang lolos, mesin tetap mengusulkannya (aman
    // menurut SNI) dan MENGATAKAN bahwa cadangannya tipis — bukan menyerah,
    // bukan pula diam. Elemen berat dekat batas kapasitas penampang.
    const mepet = sarankanBalok({ ...balokLazim, muKnm: 285, vuKn: 210 })
    if (mepet.berhasil && mepet.terpilih!.rasioKritis > BATAS_RASIO_NYAMAN) {
      expect(mepet.catatan.join(' ')).toMatch(/mepet|cadangan/i)
    }
  })

  it('jarak sengkang bulat kelipatan 25 mm — bisa dilaksanakan tukang', () => {
    for (const mu of [60, 120, 180]) {
      const hasil = sarankanBalok({ ...balokLazim, muKnm: mu })
      if (!hasil.berhasil) continue
      expect(hasil.terpilih!.jarakSengkangMm % 25).toBe(0)
    }
  })

  it('memakai HANYA diameter yang dijual di pasar', () => {
    const hasil = sarankanBalok(balokLazim)
    expect(hasil.berhasil).toBe(true)
    for (const kandidat of [hasil.terpilih!, ...hasil.alternatif]) {
      expect(DIAMETER_PASAR).toContain(kandidat.dUtamaMm)
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // KEGAGALAN — terus terang, bukan menebak
  // ══════════════════════════════════════════════════════════════════════════
  it('balok terlalu kecil: gagal terus terang + usul tinggi minimum', () => {
    // 150×200 dengan Mu 200 kNm — mustahil, berapa pun tulangannya.
    const hasil = sarankanBalok({
      bMm: 150, hMm: 200, panjangM: 6, selimutMm: 30,
      mutu: MUTU, muKnm: 200, vuKn: 150,
    })

    expect(hasil.berhasil).toBe(false)
    expect(hasil.terpilih).toBeUndefined()
    // Wajib menyebut pemeriksaan mana yang jebol — bukan diam.
    expect(hasil.catatan.join(' ')).toMatch(/lentur|geser|momen/i)
  })

  it('usul tinggi minimum yang diberikan BENAR-BENAR bisa lolos', () => {
    const kecil: InputSaranBalok = {
      bMm: 250, hMm: 300, panjangM: 6, selimutMm: 30,
      mutu: MUTU, muKnm: 180, vuKn: 120,
    }
    const hasil = sarankanBalok(kecil)

    if (!hasil.berhasil && hasil.usulTinggiMm) {
      // Usul dimensi tak boleh sekadar angka lebih besar — ia harus terbukti.
      const ulang = sarankanBalok({ ...kecil, hMm: hasil.usulTinggiMm })
      expect(ulang.berhasil, `usul h=${hasil.usulTinggiMm} ternyata tetap gagal`).toBe(true)
    }
  })

  it('menolak masukan tak masuk akal, bukan mengusulkan diam-diam', () => {
    expect(() => sarankanBalok({ ...balokLazim, bMm: 0 })).toThrow()
    expect(() => sarankanBalok({ ...balokLazim, muKnm: -5 })).toThrow()
  })
})

describe('sarankanKolom', () => {
  const kolomLazim: InputSaranKolom = {
    bMm: 400, hMm: 400, tinggiM: 3.5, selimutMm: 40,
    mutu: MUTU, puKn: 900, muKnm: 60,
  }

  it('mengusulkan tulangan simetris untuk kolom yang wajar', () => {
    const hasil = sarankanKolom(kolomLazim)

    expect(hasil.berhasil).toBe(true)
    // Kolom bertulangan simetris: baris X dan Y masing-masing minimal 2.
    expect(hasil.terpilih!.nBarisX).toBeGreaterThanOrEqual(2)
    expect(hasil.terpilih!.nBarisY).toBeGreaterThanOrEqual(2)
  })

  it('PROPERTI: setiap usulan kolom lolos analisaKolom', () => {
    let diuji = 0
    for (const pu of [500, 900, 1400, 2000]) {
      for (const mu of [20, 60, 110]) {
        const hasil = sarankanKolom({ ...kolomLazim, puKn: pu, muKnm: mu })
        if (!hasil.berhasil) continue

        const t = hasil.terpilih!
        const verifikasi = analisaKolom({
          bMm: kolomLazim.bMm, hMm: kolomLazim.hMm, tinggiM: kolomLazim.tinggiM,
          selimutMm: kolomLazim.selimutMm, mutu: MUTU, puKn: pu, muKnm: mu,
          dUtamaMm: t.dUtamaMm, nBarisX: t.nBarisX, nBarisY: t.nBarisY,
          dSengkangMm: t.dSengkangMm, jarakSengkangMm: t.jarakSengkangMm,
        })

        const gagal = verifikasi.periksa.filter((p) => !p.aman).map((p) => p.nama)
        expect(gagal, `Pu=${pu} Mu=${mu} → usul tidak aman: ${gagal.join(', ')}`).toEqual([])
        diuji++
      }
    }
    expect(diuji, 'tak satu pun kombinasi berhasil — test hampa').toBeGreaterThan(4)
  })

  it('kolom terlalu kecil untuk bebannya: gagal terus terang', () => {
    const hasil = sarankanKolom({
      bMm: 150, hMm: 150, tinggiM: 3.5, selimutMm: 40,
      mutu: MUTU, puKn: 3000, muKnm: 200,
    })
    expect(hasil.berhasil).toBe(false)
    expect(hasil.catatan.length).toBeGreaterThan(0)
  })
})

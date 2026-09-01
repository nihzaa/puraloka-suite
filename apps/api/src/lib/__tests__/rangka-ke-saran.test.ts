import { describe, it, expect } from 'vitest'
import { analisaPortal } from '../rangka-portal.js'
import { analisaBalok } from '../struktur-beton.js'
import { sarankanDariRangka, type InputSaranDariRangka } from '../rangka-ke-saran.js'

const MASUKAN: InputSaranDariRangka = {
  portal: {
    bentangM: 6, tinggiM: 3.5, jumlahLantai: 1,
    balok: { bMm: 300, hMm: 500 },
    kolom: { bMm: 400, hMm: 400 },
    fcMpa: 25, qKnM: 20,
  },
  selimutMm: 30,
  mutu: { fcMpa: 25, fyMpa: 420, fyvMpa: 280 },
}

describe('sarankanDariRangka', () => {
  it('mengusulkan tulangan untuk SETIAP batang portal', () => {
    const h = sarankanDariRangka(MASUKAN)
    // 1 lantai = 2 kolom + 1 balok
    expect(h.batang).toHaveLength(3)
    expect(h.batang.filter((b) => b.jenis === 'kolom')).toHaveLength(2)
    expect(h.batang.filter((b) => b.jenis === 'balok')).toHaveLength(1)
  })

  it('Mu/Vu yang dipakai IDENTIK dengan keluaran solver — nol hitungan kedua', () => {
    /*
      Pelajaran 5b43d275: sambungan yang membulatkan "biar rapi di layar"
      membuat angka yang tampil dan angka yang memilih tulangan berbeda.
      Keduanya terlihat wajar, tak ada galat.
    */
    const h = sarankanDariRangka(MASUKAN)
    const solver = analisaPortal(MASUKAN.portal)

    for (const s of h.batang) {
      const asli = solver.batang.find((b) => b.nama === s.nama)!
      const muAsli = Math.max(Math.abs(asli.momenKnm.maks), Math.abs(asli.momenKnm.min))
      const vuAsli = Math.max(Math.abs(asli.geserKn.maks), Math.abs(asli.geserKn.min))
      expect(s.muKnm).toBe(muAsli)
      expect(s.vuKn).toBe(vuAsli)
    }
  })

  it('usulan balok BENAR-BENAR aman terhadap Mu/Vu yang dilaporkannya', () => {
    const h = sarankanDariRangka(MASUKAN)
    const balok = h.batang.find((b) => b.jenis === 'balok')!
    if (!balok.saran.berhasil) return   // kegagalan diuji terpisah

    const t = balok.saran.terpilih as { dUtamaMm: number; nTarik: number; dSengkangMm: number; jarakSengkangMm: number }
    const verifikasi = analisaBalok({
      bMm: MASUKAN.portal.balok.bMm, hMm: MASUKAN.portal.balok.hMm,
      panjangM: MASUKAN.portal.bentangM, selimutMm: MASUKAN.selimutMm,
      mutu: MASUKAN.mutu, muKnm: balok.muKnm, vuKn: balok.vuKn,
      dUtamaMm: t.dUtamaMm, nTarik: t.nTarik,
      dSengkangMm: t.dSengkangMm, jarakSengkangMm: t.jarakSengkangMm,
    })
    const gagal = verifikasi.periksa.filter((p) => !p.aman).map((p) => p.nama)
    expect(gagal, `usul tak aman: ${gagal.join(', ')}`).toEqual([])
  })

  it('kolom memakai aksial dari solver, bukan nol', () => {
    /*
      Kolom yang diberi Pu = 0 akan diusulkan tulangan minimum — dan itu
      terlihat wajar. Aksialnya HARUS datang dari solver.
    */
    const h = sarankanDariRangka(MASUKAN)
    for (const k of h.batang.filter((b) => b.jenis === 'kolom')) {
      expect(k.puKn).toBeGreaterThan(0)
    }
  })

  it('membawa catatan solver DAN catatan tulangan', () => {
    const gabung = sarankanDariRangka(MASUKAN).catatan.join(' ')
    expect(gabung).toMatch(/elastis linier/i)     // dari solver
    expect(gabung).toMatch(/ESTIMASI AWAL/i)      // dari mesin tulangan
  })
})

/*
  ══════════════════════════════════════════════════════════════════════════════
  REAKSI TUMPUAN — kenapa ini diuji, dan kenapa ΣFy yang jadi porosnya
  ══════════════════════════════════════════════════════════════════════════════

  Reaksi tumpuan ditampilkan di layar BUKAN supaya insinyur punya satu tabel
  angka lagi. Tabel angka tanpa pembanding tak membuktikan apa pun — ia hanya
  memindahkan kepercayaan dari solver ke tabel, dan pembacanya tetap harus
  percaya. Yang membuatnya bernilai adalah SATU angka yang bisa dihitung
  pembacanya sendiri di atas kertas:

      ΣFy reaksi  =  total beban vertikal  =  q × L

  Insinyur yang melihat 120,00 kN untuk q=20, L=6 tahu solvernya menutup
  keseimbangan tanpa membaca satu baris pun kode matriks kekakuan. Kalau
  invarian itu tidak diuji di sini, menampilkannya di layar tak menambah
  kepercayaan apa pun — ia cuma memindahkan tempat berbohongnya.
*/
describe('sarankanDariRangka — reaksi tumpuan', () => {
  it('memulangkan reaksi untuk SETIAP simpul bertumpu', () => {
    const h = sarankanDariRangka(MASUKAN)
    expect(h.rangka.reaksi).toBeDefined()
    // Portal 1 lantai: dua kaki dijepit, simpul lantai atas bebas.
    expect(h.rangka.reaksi).toHaveLength(2)
    for (const r of h.rangka.reaksi) {
      expect(Number.isFinite(r.fxKn)).toBe(true)
      expect(Number.isFinite(r.fyKn)).toBe(true)
      expect(Number.isFinite(r.mKnm)).toBe(true)
      expect(r.nama).toMatch(/^S0/)   // hanya lantai dasar yang bertumpu
    }
  })

  it('ΣFy reaksi = total beban vertikal (q × L) — invarian yang JADI ALASAN fitur ini ada', () => {
    const h = sarankanDariRangka(MASUKAN)
    const sumFy = h.rangka.reaksi.reduce((a, r) => a + r.fyKn, 0)
    const totalBeban = MASUKAN.portal.qKnM * MASUKAN.portal.bentangM   // 20 × 6 = 120
    expect(totalBeban).toBe(120)
    expect(sumFy).toBeCloseTo(totalBeban, 6)
  })

  it('ΣFx reaksi = 0 saat tak ada beban lateral', () => {
    const h = sarankanDariRangka(MASUKAN)
    const sumFx = h.rangka.reaksi.reduce((a, r) => a + r.fxKn, 0)
    expect(sumFx).toBeCloseTo(0, 6)
  })

  it('ΣFy tetap menutup saat ADA beban lateral — gaya mendatar tak menambah berat', () => {
    /*
      Beban lateral bekerja di X. Kalau ΣFy ikut bergeser karenanya, yang
      salah bukan bebannya melainkan pemanenan reaksinya — dan itu justru
      kelas cacat yang tak melempar apa pun.
    */
    const masukan: InputSaranDariRangka = {
      ...MASUKAN,
      portal: { ...MASUKAN.portal, gayaLateralKn: [15] },
    }
    const h = sarankanDariRangka(masukan)
    const sumFy = h.rangka.reaksi.reduce((a, r) => a + r.fyKn, 0)
    const sumFx = h.rangka.reaksi.reduce((a, r) => a + r.fxKn, 0)
    expect(sumFy).toBeCloseTo(120, 6)
    expect(sumFx).toBeCloseTo(-15, 6)   // reaksi melawan beban luar
  })

  it('reaksi IDENTIK dengan analisaPortal langsung — nol hitungan kedua', () => {
    /*
      Alasan yang sama dengan test Mu/Vu di atas: sambungan yang mengolah
      ulang angkanya membuat layar dan solver menyimpang tanpa satu pun galat.
    */
    const h = sarankanDariRangka(MASUKAN)
    const solver = analisaPortal(MASUKAN.portal)
    expect(h.rangka.reaksi).toEqual(solver.reaksi)
  })

  it('meneruskan gayaUjung apa adanya — satu entri per batang', () => {
    const h = sarankanDariRangka(MASUKAN)
    const solver = analisaPortal(MASUKAN.portal)
    expect(h.rangka.gayaUjung).toEqual(solver.gayaUjung)
    expect(h.rangka.gayaUjung).toHaveLength(h.rangka.batang.length)
  })
})

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

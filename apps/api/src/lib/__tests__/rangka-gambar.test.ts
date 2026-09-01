// apps/api/src/lib/__tests__/rangka-gambar.test.ts
import { describe, it, expect } from 'vitest'
import { analisaBalokMenerus } from '../rangka-portal.js'
import { gambarDiagramRangka } from '../rangka-gambar.js'

/** Balok menerus dua bentang — puncak momennya di x=0,375L, DI ANTARA cuplikan. */
function balokUji() {
  const h = analisaBalokMenerus({
    bentangM: [6, 6], bMm: 300, hMm: 500, fcMpa: 25, qKnM: 20,
  })
  return h.batang[0]!
}

describe('gambarDiagramRangka', () => {
  it('menghasilkan SVG yang sah dengan viewBox', () => {
    const svg = gambarDiagramRangka(balokUji(), 6)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('menggambar TIGA panel: momen, geser, lendutan', () => {
    const svg = gambarDiagramRangka(balokUji(), 6)
    expect(svg).toMatch(/MOMEN/i)
    expect(svg).toMatch(/GESER/i)
    expect(svg).toMatch(/LENDUTAN/i)
  })

  it('memakai deret titik SOLVER, bukan menggambar dari rumus', () => {
    /*
      Inti test ini. Penggambar yang menghitung ulang bentuk diagramnya dari
      rumus akan menggambar sesuatu yang BUKAN hasil solver — dan selisihnya
      tak terlihat karena keduanya "berbentuk parabola".

      Cara memeriksanya: ubah SATU titik di deret, lalu tuntut SVG-nya
      berubah. Penggambar yang mengabaikan deret akan menghasilkan SVG
      yang sama persis.
    */
    const asli = balokUji()
    const svgAsli = gambarDiagramRangka(asli, 6)

    const diubah: typeof asli = {
      ...asli,
      momenKnm: {
        ...asli.momenKnm,
        di: asli.momenKnm.di.map((t, i) =>
          i === 5 ? { ...t, nilai: t.nilai * 0.5 } : t),
      },
    }
    expect(gambarDiagramRangka(diubah, 6)).not.toBe(svgAsli)
  })

  it('menandai nilai KRITIS, bukan cuma nilai cuplikan tertinggi', () => {
    /*
      `momenKnm.maks` memakai puncak ANALITIS (perbaikan e8a59e25): 50,625
      untuk balok ini, sementara cuplikan tertinggi cuma 50,400. Label di
      diagram WAJIB memakai yang pertama — kalau ia memakai maksimum deret,
      angka di layar lebih kecil dari yang dipakai memilih tulangan, dan
      keduanya terlihat wajar.
    */
    const b = balokUji()
    const svg = gambarDiagramRangka(b, 6)
    expect(b.momenKnm.maks).toBeCloseTo(50.625, 3)     // prasyarat
    expect(svg).toMatch(/50[.,]6/)                      // label memakai 50,6…
  })

  it('menolak panjang batang tak sah', () => {
    expect(() => gambarDiagramRangka(balokUji(), 0)).toThrow(/panjang/i)
    expect(() => gambarDiagramRangka(balokUji(), -3)).toThrow(/panjang/i)
  })

  it('aman terhadap batang tanpa lendutan berarti (semua nol)', () => {
    /*
      Kolom tanpa beban merata bisa memberi deret lendutan nol seluruhnya.
      Penskalaan yang membagi dengan rentang nol menghasilkan NaN di
      koordinat SVG — gambar kosong tanpa satu pun galat.
    */
    const b = balokUji()
    const nol: typeof b = {
      ...b,
      lendutanMm: { maks: 0, di: b.lendutanMm.di.map((t) => ({ ...t, nilai: 0 })) },
    }
    const svg = gambarDiagramRangka(nol, 6)
    expect(svg).not.toMatch(/NaN/)
  })
})

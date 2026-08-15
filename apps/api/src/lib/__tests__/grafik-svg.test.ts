/**
 * GRAFIK SVG — dan lubang data yang HARUS tetap terlihat sebagai lubang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PUNYA TEST SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Grafik adalah satu-satunya keluaran asisten yang dipercaya orang TANPA
 * membaca angkanya. Kalau ia memuluskan minggu yang tak pernah dilaporkan,
 * hasilnya bukan sekadar cacat tampilan — ia kebohongan yang paling sulit
 * dibantah, karena terlihat rapi dan resmi.
 *
 * Yang dibuktikan:
 *
 *   1. titik `null` MEMUTUS garis (dua `M`), bukan disambung lurus
 *   2. data kosong → kalimat "belum ada data", BUKAN grafik datar di nol
 *   3. label sumbu X dijarangkan supaya tak jadi tumpukan tinta
 *   4. teks judul/label di-escape — nama proyek boleh memuat `&` dan `<`
 *   5. SVG-nya sah dan berukuran benar
 */
import { describe, it, expect } from 'vitest'
import { grafikGarisSvg, WARNA_DERET } from '../grafik-svg.js'

const deret = (titik: Array<number | null>) => [
  { nama: 'Rencana', warna: WARNA_DERET.rencana, titik },
]

describe('grafik garis', () => {
  it('LUBANG data memutus garis, bukan disambung', () => {
    /*
      Inti berkas ini.

      Minggu tanpa laporan digambar sebagai putus. Menyambungnya menggambar
      garis lurus melintasi minggu yang tak pernah dilaporkan — dan garis itu
      terlihat persis seperti pekerjaan yang berjalan mulus.
    */
    const svg = grafikGarisSvg({
      judul: 'Uji',
      labelX: ['M1', 'M2', 'M3', 'M4'],
      deret: deret([10, null, 30, 40]),
    })

    const jalur = svg.match(/<path d="([^"]+)"/)?.[1] ?? ''
    // Dua segmen terpisah ⇒ dua perintah `M`.
    expect((jalur.match(/M/g) ?? []).length).toBe(2)
  })

  it('garis UTUH kalau datanya utuh', () => {
    const svg = grafikGarisSvg({
      judul: 'Uji',
      labelX: ['M1', 'M2', 'M3'],
      deret: deret([10, 20, 30]),
    })
    const jalur = svg.match(/<path d="([^"]+)"/)?.[1] ?? ''
    expect((jalur.match(/M/g) ?? []).length).toBe(1)
    expect((jalur.match(/L/g) ?? []).length).toBe(2)
  })

  it('data KOSONG → kalimat, bukan grafik datar di nol', () => {
    // Grafik datar di nol terbaca "semuanya nol" — kesimpulan yang sama sekali
    // berbeda dari "belum ada datanya".
    const svg = grafikGarisSvg({
      judul: 'Proyek Baru',
      labelX: ['M1', 'M2'],
      deret: deret([null, null]),
    })
    expect(svg).toContain('Belum ada data')
    expect(svg).not.toContain('<path')
  })

  it('label X DIJARANGKAN saat titiknya banyak', () => {
    // 52 minggu di lebar 900px = satu label tiap 16px; yang terbaca cuma
    // tumpukan tinta.
    const labelX = Array.from({ length: 52 }, (_, i) => `M${i + 1}`)
    const svg = grafikGarisSvg({
      judul: 'Setahun',
      labelX,
      deret: deret(labelX.map((_, i) => i)),
    })
    const jumlahLabel = (svg.match(/>M\d+</g) ?? []).length
    expect(jumlahLabel).toBeGreaterThan(0)
    expect(jumlahLabel).toBeLessThanOrEqual(14)
  })

  it('teks di-ESCAPE — nama proyek boleh memuat & dan <', () => {
    // Nama proyek datang dari basis. Tanpa escape, satu `&` merusak seluruh
    // SVG dan gambarnya gagal render tanpa pesan yang menyebut sebabnya.
    const svg = grafikGarisSvg({
      judul: 'CV Jaya & Sons <Cimahi>',
      labelX: ['M1'],
      deret: deret([5]),
    })
    expect(svg).toContain('CV Jaya &amp; Sons &lt;Cimahi&gt;')
    expect(svg).not.toContain('& Sons')
  })

  it('SVG sah dan berukuran benar', () => {
    const svg = grafikGarisSvg({
      judul: 'Uji', labelX: ['M1', 'M2'], deret: deret([1, 2]), lebar: 640, tinggi: 360,
    })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('width="640"')
    expect(svg).toContain('height="360"')
  })

  it('satu titik saja tak melempar', () => {
    // `n - 1` jadi 0 → pembagian nol. Proyek yang baru punya satu minggu data
    // bukan kasus langka.
    expect(() =>
      grafikGarisSvg({ judul: 'Satu', labelX: ['M1'], deret: deret([42]) }),
    ).not.toThrow()
  })

  it('nilai NEGATIF ikut tergambar — deviasi bisa minus', () => {
    const svg = grafikGarisSvg({
      judul: 'Deviasi', labelX: ['M1', 'M2'], deret: deret([-5, 10]),
    })
    expect(svg).toContain('<path')
  })
})

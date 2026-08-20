/**
 * DIAGRAM BEBAN / MOMEN / GAYA LINTANG.
 *
 * ⚠ Test ini memeriksa BENTUK dan TATA LETAK, bukan keindahan. Empat cacat di
 * modul ini ditemukan dengan MERENDER dan MELIHAT, bukan dari test:
 *
 *   1. `rgba()` tak dikenali perender -> seluruh bidang jadi HITAM PEKAT
 *   2. label "+96,26 kN" menimpa judul "DIAGRAM GAYA LINTANG"
 *   3. label Mu jatuh di luar bidang parabolanya
 *   4. pada KANTILEVER, judul panel momen tertimpa label Mu — kasus sederhana
 *      tampak sempurna, jadi hanya kantilever yang memperlihatkannya
 *
 * Yang bisa dijaga test adalah pengulangannya. Yang menemukannya tetap mata.
 */
import { describe, it, expect } from 'vitest'
import { analisaBebanBalok } from '../struktur-beban-balok.js'
import { gambarDiagramBeban } from '../struktur-gambar-beban.js'

const DASAR = {
  bentangM: 6, lebarPikulM: 3, bMm: 300, hMm: 500, tebalPelatMm: 120,
  bebanMatiTambahan: [{ nama: 'Finishing', nilai: 1.5 }],
  bebanHidupKnM2: 2.5,
}
const sederhana = () => gambarDiagramBeban(analisaBebanBalok(DASAR), 6)
const kantilever = () => gambarDiagramBeban(
  analisaBebanBalok({ ...DASAR, skema: 'kantilever', bentangM: 2.5 }), 2.5)

/** Ambil semua <text> beserta posisinya. */
function labelDari(svg: string) {
  return [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), isi: m[3] }))
}

describe('SVG yang sah dan bisa ditampilkan', () => {
  it('memulangkan SVG utuh ber-aria-label', () => {
    const svg = sederhana()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toMatch(/aria-label="[^"]+"/)
  })

  it('TIDAK memakai rgba() — perender menjatuhkannya ke hitam pekat', () => {
    /*
      Cacat nomor 1. SVG-nya sah, tak ada galat, tak ada peringatan — bidang
      diagramnya cuma jadi blok hitam yang menutupi garis batasnya sendiri.
    */
    expect(sederhana()).not.toMatch(/rgba\(/)
    expect(kantilever()).not.toMatch(/rgba\(/)
    /* Transparansi tetap ada, lewat mekanisme yang dikenali semua perender. */
    expect(sederhana()).toMatch(/fill-opacity="0\.\d+"/)
  })

  it('bentang tak sah DITOLAK, bukan menggambar kanvas kosong', () => {
    expect(() => gambarDiagramBeban(analisaBebanBalok(DASAR), 0)).toThrow(/bentang/i)
    expect(() => gambarDiagramBeban(analisaBebanBalok(DASAR), NaN)).toThrow(/bentang/i)
  })
})

describe('bentuk diagram membedakan skema — inilah gunanya digambar', () => {
  it('momen SEDERHANA memuncak di TENGAH, kantilever di TUMPUAN', () => {
    /*
      Ini pembedaan yang tak terlihat dari angka: 144 kNm dan 100 kNm
      sama-sama "momen yang wajar". Yang membedakan adalah DI MANA
      puncaknya — dan itu yang menentukan letak tulangan tarik.
    */
    const s = labelDari(sederhana()).find((l) => /^Mu =/.test(l.isi))!
    const k = labelDari(kantilever()).find((l) => /^Mu =/.test(l.isi))!
    expect(s).toBeDefined()
    expect(k).toBeDefined()
    /* Sederhana: label puncak dekat tengah kanvas (W=520 -> ~260). */
    expect(Math.abs(s.x - 260)).toBeLessThan(60)
    /* Kantilever: label puncak di sisi KIRI (dekat jepit). */
    expect(k.x).toBeLessThan(160)
  })

  it('menyatakan sisi tarik, dan berbeda antar skema', () => {
    /*
      Salah menaruh tulangan tarik karena salah baca sisi adalah kegagalan
      yang tak menimbulkan galat apa pun — balok runtuh jauh di bawah beban
      rencana.
    */
    expect(sederhana()).toMatch(/tarik di BAWAH/)
    expect(kantilever()).toMatch(/tarik di ATAS/)
  })

  it('kantilever menggambar tumpuan JEPIT, sederhana menggambar sendi-rol', () => {
    expect(kantilever()).toMatch(/JEPIT/)
    expect(sederhana()).not.toMatch(/JEPIT/)
  })

  it('beban terpusat memunculkan penanda Pu', () => {
    const tanpa = gambarDiagramBeban(analisaBebanBalok(DASAR), 6)
    const dengan = gambarDiagramBeban(
      analisaBebanBalok({ ...DASAR, bebanTerpusatKn: 40 }), 6)
    expect(tanpa).not.toMatch(/Pu =/)
    expect(dengan).toMatch(/Pu =/)
  })
})

describe('tata letak — label tak boleh saling menimpa', () => {
  /*
    Diperiksa dengan membandingkan POSISI label, bukan dengan melihat.

    AMBANG 20 px, dan angka itu DIUKUR — bukan ditebak. Versi pertama memakai
    12 px dan MELEWATKAN tabrakan yang jelas terlihat di gambar: judul
    "DIAGRAM MOMEN" di y=164 dan label "Mu = 100,28 kNm" di y=179,4 —
    berselisih 15,4 px, lolos ambang 12, padahal huruf setinggi 11-12 px
    pada baseline sedekat itu saling menyentuh.

    Ketahuan dari MUTASI: judul dikembalikan ke posisi lama, test tetap
    hijau. Pemeriksa tata letak yang tak bisa merah adalah hiasan.
  */
  const bertabrakan = (svg: string) => {
    const l = labelDari(svg)
    const tabrak: string[] = []
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const a = l[i]
        const b = l[j]
        if (!a.isi.trim() || !b.isi.trim()) continue
        /* Perkiraan lebar: 0,55 × ukuran font × jumlah huruf. */
        const lebarA = a.isi.length * 7
        const lebarB = b.isi.length * 7
        const dekatY = Math.abs(a.y - b.y) < 20
        const tumpangX = Math.abs(a.x - b.x) < (lebarA + lebarB) / 2 * 0.75
        if (dekatY && tumpangX) tabrak.push(`"${a.isi}" ↔ "${b.isi}"`)
      }
    }
    return tabrak
  }

  it('SEDERHANA: tak ada label bertumpuk', () => {
    expect(bertabrakan(sederhana())).toEqual([])
  })

  it('KANTILEVER: tak ada label bertumpuk', () => {
    /*
      Kasus inilah yang memperlihatkan cacat nomor 4 — momen kantilever
      digambar ke ATAS, dan judul panelnya ikut tertimpa. Sederhana tampak
      sempurna, jadi menguji satu skema saja tidak cukup.
    */
    expect(bertabrakan(kantilever())).toEqual([])
  })

  it('seluruh label berada DI DALAM kanvas', () => {
    /*
      Label di luar viewBox tak terlihat sama sekali — dan ketiadaannya
      terbaca seperti angka yang memang tak dihitung.
    */
    for (const svg of [sederhana(), kantilever()]) {
      const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!
      const [W, H] = [Number(vb[1]), Number(vb[2])]
      for (const l of labelDari(svg)) {
        expect(l.y).toBeGreaterThan(0)
        expect(l.y).toBeLessThan(H)
        expect(l.x).toBeGreaterThanOrEqual(0)
        expect(l.x).toBeLessThanOrEqual(W)
      }
    }
  })
})

describe('angka di gambar cocok dengan hasil hitungnya', () => {
  it('Mu dan Vu yang tertulis sama dengan yang dihitung', () => {
    /*
      Gambar yang menampilkan angka BERBEDA dari hasil hitung adalah cacat
      terburuk di modul ini: dua sumber kebenaran untuk satu angka, dan yang
      dipercaya orang adalah yang tergambar.
    */
    const h = analisaBebanBalok(DASAR)
    const svg = gambarDiagramBeban(h, 6)
    expect(svg).toContain(`${Math.round(h.muKnm * 100) / 100}`)
    expect(svg).toContain(`${Math.round(h.vuKn * 100) / 100}`)
  })

  it('menyebut kombinasi beban dan pembagi momennya', () => {
    /* Supaya bisa diperiksa orang lain tanpa membuka kode. */
    const svg = sederhana()
    expect(svg).toMatch(/1,2D \+ 1,6L/)
    expect(svg).toMatch(/wL²\/8/)
  })
})

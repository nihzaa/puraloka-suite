import { describe, it, expect } from 'vitest'
import {
  posisiTulangan, gambarPenampang, gambarBatang, gambarDiagramPM, amankanTeks,
  gambarPenampangLingkaran, posisiTulanganLingkaran,
  gambarPotonganPelat, gambarPondasi, gambarTiang,
  type InputGambarPenampang,
} from '../struktur-gambar'
import { diagramPM, penampangPersegi, cekTitikBeban } from '../struktur-diagram-pm'

/**
 * PENGGAMBAR SVG.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CARA MENGUJI GAMBAR — dan kenapa BUKAN dengan mencocokkan string SVG
 *
 * Menguji `expect(svg).toContain('<circle cx="46"')` akan merah setiap kali
 * warna, urutan elemen, atau pembulatan berubah — padahal gambarnya benar.
 * Test seperti itu menghambat perbaikan alih-alih menjaga kebenaran.
 *
 * Yang diuji di sini:
 *   1. POSISI TULANGAN sebagai ANGKA (`posisiTulangan` dipisah justru untuk ini)
 *   2. SIFAT struktural SVG — well-formed, viewBox masuk akal, elemen ada
 *   3. KEAMANAN — teks pengguna tak bisa merusak dokumen
 *
 * Rupa gambarnya dinilai mata, dan itu memang tugas manusia.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const BALOK: InputGambarPenampang = {
  bMm: 300, hMm: 520, selimutMm: 30, dSengkangMm: 8,
  tulanganBawah: [3, 2], tulanganAtas: [2],
  dUtamaMm: 16,
}

describe('posisiTulangan — angka, bukan gambar', () => {
  const p = posisiTulangan(BALOK)

  it('jumlah batang sesuai lapis yang diminta', () => {
    expect(p.bawah).toHaveLength(5)   // 3 + 2
    expect(p.atas).toHaveLength(2)
  })

  it('batang terluar berjarak selimut + Ø sengkang + ½Ø utama dari tepi', () => {
    // 30 + 8 + 8 = 46 mm
    const tepi = 30 + 8 + 16 / 2
    expect(Math.min(...p.bawah.map((b) => b.xMm))).toBeCloseTo(tepi, 9)
    expect(Math.max(...p.bawah.map((b) => b.xMm))).toBeCloseTo(300 - tepi, 9)
  })

  it('lapis bawah pertama di dekat sisi bawah, atas di dekat sisi atas', () => {
    const tepi = 46
    const lapis1Bawah = p.bawah.filter((b) => b.yMm === 520 - tepi)
    expect(lapis1Bawah).toHaveLength(3)
    expect(p.atas.every((b) => b.yMm === tepi)).toBe(true)
  })

  it('lapis kedua bergeser sejauh 25 + Ø (bawaan)', () => {
    const lapis2 = p.bawah.filter((b) => b.yMm !== 520 - 46)
    expect(lapis2).toHaveLength(2)
    expect(lapis2[0].yMm).toBeCloseTo(520 - 46 - (25 + 16), 9)
  })

  it('batang tersebar MERATA — jarak antar batang sama', () => {
    const lapis1 = p.bawah.filter((b) => b.yMm === 520 - 46).sort((a, b) => a.xMm - b.xMm)
    const jarak = lapis1.slice(1).map((b, i) => b.xMm - lapis1[i].xMm)
    for (const j of jarak) expect(j).toBeCloseTo(jarak[0], 9)
  })

  it('satu batang → tepat di tengah, bukan di tepi', () => {
    const satu = posisiTulangan({ ...BALOK, tulanganBawah: [1], tulanganAtas: [] })
    expect(satu.bawah).toHaveLength(1)
    expect(satu.bawah[0].xMm).toBeCloseTo(150, 9)
  })

  it('lapis kosong tak menghasilkan batang', () => {
    const kosong = posisiTulangan({ ...BALOK, tulanganBawah: [], tulanganAtas: [0] })
    expect(kosong.bawah).toHaveLength(0)
    expect(kosong.atas).toHaveLength(0)
  })

  it('menolak selimut yang melebihi lebar penampang', () => {
    expect(() => posisiTulangan({ ...BALOK, selimutMm: 200 }))
      .toThrow(/melebihi lebar/)
    expect(() => posisiTulangan({ ...BALOK, bMm: 0 })).toThrow()
  })

  it('penampang lebar → jarak antar batang membesar (skala benar)', () => {
    const sempit = posisiTulangan({ ...BALOK, bMm: 300, tulanganBawah: [4], tulanganAtas: [] })
    const lebar = posisiTulangan({ ...BALOK, bMm: 600, tulanganBawah: [4], tulanganAtas: [] })
    const js = sempit.bawah[1].xMm - sempit.bawah[0].xMm
    const jl = lebar.bawah[1].xMm - lebar.bawah[0].xMm
    expect(jl).toBeGreaterThan(js)
  })
})

describe('gambarPenampang — SVG utuh & masuk akal', () => {
  const svg = gambarPenampang(BALOK, { judul: 'B1 300×520' })

  it('dokumen SVG well-formed: dibuka & ditutup, ber-namespace', () => {
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    // Tag berpasangan seimbang.
    expect((svg.match(/<svg/g) ?? []).length).toBe(1)
    expect((svg.match(/<\/svg>/g) ?? []).length).toBe(1)
  })

  it('memuat beton, sengkang, dan SEMUA batang tulangan', () => {
    const p = posisiTulangan(BALOK)
    // 7 batang → 7 lingkaran.
    expect((svg.match(/<circle/g) ?? []).length).toBe(p.bawah.length + p.atas.length)

    /*
      Beton digambar TIGA lapis rect (isi polos → arsir → garis tepi) plus
      satu rect sengkang. Jumlah pastinya bukan yang penting — yang dijaga:
      beton ADA, sengkang ADA, dan arsirnya terpasang.

      Test versi pertama menuntut tepat 2 rect, dan langsung merah begitu
      arsir ditambahkan — padahal gambarnya justru membaik. Test yang
      menghitung elemen menghambat perbaikan; test yang memeriksa MAKSUD tidak.
    */
    expect(svg).toContain('fill="url(#arsir)"')            // arsir beton terpasang
    expect(svg).toContain(`stroke="${'#2563eb'}"`)          // sengkang ada
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  /**
   * NOTASI TULANGAN — yang membedakan gambar KERJA dari sketsa.
   *
   * Tanpa "3D16" di sebelah batang, tukang besi tak tahu apa yang dipasang.
   * Ditambahkan setelah gambar dirender dan diperiksa mata: versi pertama
   * hanya menggambar lingkaran merah tanpa keterangan apa pun.
   */
  it('menulis notasi tulangan per lapis (3D16, 2D16) + notasi sengkang', () => {
    expect(svg).toContain('>3D16</text>')   // lapis bawah terluar, 3 batang
    expect(svg).toContain('>2D16</text>')   // lapis kedua & atas, 2 batang
    expect(svg).toContain('>P8</text>')     // sengkang polos Ø8
  })

  it('menulis label selimut — informasi yang wajib ada di gambar kerja', () => {
    expect(svg).toContain('selimut 30 mm')
  })

  it('notasi mengikuti jumlah & diameter sesungguhnya', () => {
    const lain = gambarPenampang({
      ...BALOK, tulanganBawah: [4], tulanganAtas: [2], dUtamaMm: 22, dSengkangMm: 10,
    })
    expect(lain).toContain('>4D22</text>')
    expect(lain).toContain('>2D22</text>')
    expect(lain).toContain('>P10</text>')
  })

  /**
   * Tebal garis sengkang punya BATAS BAWAH.
   *
   * Versi pertama memakai `t * 1.1` polos; pada penampang 250×400 hasilnya
   * 1.76 unit dan sengkang nyaris tak terlihat di sebelah tulangan D13.
   * Terlihat begitu dirender, tak terlihat dari test mana pun sampai ini
   * ditulis.
   */
  it('sengkang tetap terbaca pada penampang kecil (≥ 60% diameter)', () => {
    const kecil = gambarPenampang({
      bMm: 250, hMm: 400, selimutMm: 25, dSengkangMm: 8,
      tulanganBawah: [2], tulanganAtas: [2], dUtamaMm: 13,
    })
    const sengkang = kecil.match(/stroke="#2563eb" stroke-width="([\d.]+)"/)!
    expect(Number(sengkang[1])).toBeGreaterThanOrEqual(8 * 0.6)
  })

  it('viewBox mencakup seluruh penampang plus margin', () => {
    const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/)!
    const [, x, y, w, h] = m.map(Number)
    expect(x).toBeLessThan(0)          // margin kiri
    expect(y).toBeLessThan(0)          // margin atas
    expect(w).toBeGreaterThan(300)     // lebih lebar dari benda
    expect(h).toBeGreaterThan(520)
  })

  it('punya aria-label — bisa dibaca pembaca layar', () => {
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="B1 300×520"')
  })

  it('dimensi bisa dimatikan', () => {
    const tanpa = gambarPenampang(BALOK, { dimensi: false })
    expect(tanpa).not.toContain('mm</text>')
    expect(svg).toContain('mm</text>')
  })

  it('angka dimensi menyebut ukuran SEBENARNYA', () => {
    expect(svg).toContain('>300 mm</text>')
    expect(svg).toContain('>520 mm</text>')
  })

  it('penampang bujur sangkar & pipih sama-sama terbentuk', () => {
    for (const [b, h] of [[400, 400], [200, 900], [1000, 250]] as [number, number][]) {
      const s = gambarPenampang({ ...BALOK, bMm: b, hMm: h })
      expect(s).toContain('<svg')
      expect(s).toContain('</svg>')
    }
  })

  it('tebal garis menskala — penampang besar tak bergaris rambut', () => {
    const kecil = gambarPenampang({ ...BALOK, bMm: 200, hMm: 200 })
    const besar = gambarPenampang({ ...BALOK, bMm: 1200, hMm: 1200 })
    const tebal = (s: string) => Number(s.match(/stroke-width="([\d.]+)"/)![1])
    expect(tebal(besar)).toBeGreaterThan(tebal(kecil))
  })
})

/**
 * KEAMANAN — teks pengguna tak boleh merusak dokumen.
 *
 * Judul & uraian datang dari input (nama elemen, catatan estimator). Satu
 * karakter `<` yang lolos merusak seluruh SVG; dan bila kelak gambar ini
 * ditampilkan di halaman web, ia jadi celah penyisipan skrip.
 */
describe('keamanan teks', () => {
  it('karakter khusus dilolos-kan', () => {
    expect(amankanTeks('<script>')).toBe('&lt;script&gt;')
    expect(amankanTeks('a & b')).toBe('a &amp; b')
    expect(amankanTeks('"kutip"')).toBe('&quot;kutip&quot;')
  })

  it('judul berisi tag TIDAK menghasilkan tag di SVG', () => {
    const svg = gambarPenampang(BALOK, { judul: '<script>alert(1)</script>' })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    // Dokumen tetap utuh.
    expect((svg.match(/<svg/g) ?? []).length).toBe(1)
  })

  it('uraian batang juga diamankan', () => {
    const svg = gambarBatang({
      segmenM: [4.39], kaitM: 0.1, jumlahKait: 1, sudutKait: 135,
      diameterMm: 16, uraian: '<b>Tumpuan</b>',
    })
    expect(svg).not.toContain('<b>')
    expect(svg).toContain('&lt;b&gt;')
  })
})

describe('gambarBatang — sketsa bentuk untuk tabel BBS', () => {
  it('batang lurus: satu garis utama, tanpa kait', () => {
    const svg = gambarBatang({
      segmenM: [12], kaitM: 0, jumlahKait: 0, sudutKait: 90, diameterMm: 16,
    })
    expect((svg.match(/<line/g) ?? []).length).toBe(1)
    expect(svg).not.toContain('kait')
  })

  it('kait-1 menambah satu garis, kait-2 menambah dua', () => {
    const dasar = { segmenM: [4.39], kaitM: 0.1, sudutKait: 135 as const, diameterMm: 16 }
    const satu = gambarBatang({ ...dasar, jumlahKait: 1 })
    const dua = gambarBatang({ ...dasar, jumlahKait: 2 })
    expect((satu.match(/<line/g) ?? []).length).toBe(2)   // utama + 1 kait
    expect((dua.match(/<line/g) ?? []).length).toBe(3)    // utama + 2 kait
  })

  it('menyebut sudut & panjang kait di gambar', () => {
    const svg = gambarBatang({
      segmenM: [4.39], kaitM: 0.1, jumlahKait: 1, sudutKait: 135, diameterMm: 16,
    })
    expect(svg).toContain('kait 135°')
    expect(svg).toContain('100 mm')   // 0.1 m
  })

  it('sengkang (≥4 segmen) digambar sebagai persegi tertutup', () => {
    const svg = gambarBatang({
      segmenM: [0.24, 0.46, 0.24, 0.46], kaitM: 0.05, jumlahKait: 2,
      sudutKait: 135, diameterMm: 8,
    })
    expect(svg).toContain('<rect')
    // Ukuran sisi ditulis dalam mm.
    expect(svg).toContain('>240</text>')
    expect(svg).toContain('>460</text>')
  })

  it('diameter selalu ditulis', () => {
    const svg = gambarBatang({
      segmenM: [3], kaitM: 0, jumlahKait: 0, sudutKait: 90, diameterMm: 19,
    })
    expect(svg).toContain('Ø19')
  })

  /**
   * SKEMATIS, bukan berskala — dan itu DISENGAJA.
   *
   * Batang 12 m dan sengkang 0.24 m harus muat di sel tabel yang sama
   * tingginya. Sketsa berskala membuat sengkang jadi garis tipis tak terbaca.
   */
  it('ukuran kanvas SAMA untuk batang 0.3 m dan 12 m', () => {
    const pendek = gambarBatang({ segmenM: [0.3], kaitM: 0, jumlahKait: 0, sudutKait: 90, diameterMm: 8 })
    const panjang = gambarBatang({ segmenM: [12], kaitM: 0, jumlahKait: 0, sudutKait: 90, diameterMm: 8 })
    const vb = (s: string) => s.match(/viewBox="([^"]+)"/)![1]
    expect(vb(pendek)).toBe(vb(panjang))
  })

  it('menolak daftar segmen kosong', () => {
    expect(() => gambarBatang({
      segmenM: [], kaitM: 0, jumlahKait: 0, sudutKait: 90, diameterMm: 16,
    })).toThrow(/tak ada segmen/)
  })
})

describe('gambarDiagramPM — memperlihatkan verdict yang sudah dihitung', () => {
  const p = penampangPersegi({
    bMm: 400, hMm: 400, selimutMm: 30, dUtamaMm: 16, dSengkangMm: 8,
    nBarisTegakLurus: 4, nBarisSearah: 4, mutu: { fcMpa: 55, fyMpa: 420 },
  })
  const d = diagramPM(p, 120)

  it('kurva jadi satu polyline berisi titik daerah TEKAN', () => {
    const svg = gambarDiagramPM({ kurva: d.titik })
    expect(svg).toContain('<polyline')
    const titik = svg.match(/points="([^"]+)"/)![1].trim().split(/\s+/)
    // Daerah tarik dipotong secara bawaan — lihat test khususnya di bawah.
    const tekan = d.titik.filter((t) => t.phiPnKn >= 0).length
    expect(titik).toHaveLength(tekan)
    expect(tekan).toBeLessThan(120)   // memang ada yang dipotong
  })

  it('sumbu diberi label satuan — tanpa itu angkanya tak berarti', () => {
    const svg = gambarDiagramPM({ kurva: d.titik })
    expect(svg).toContain('φMn (kNm)')
    expect(svg).toContain('φPn (kN)')
  })

  /**
   * Titik beban DIWARNAI menurut verdict — bukan diserahkan ke mata.
   *
   * Inilah yang membedakannya dari grafik Excel: di sana pengguna menakar
   * sendiri apakah titiknya di dalam kurva.
   */
  it('titik aman hijau, titik di luar kurva merah', () => {
    const svg = gambarDiagramPM({
      kurva: d.titik,
      beban: [
        { muKnm: 50, puKn: 1200, label: 'L1' },     // di dalam
        { muKnm: 900, puKn: 200, label: 'L2' },     // jauh di luar
      ],
    })
    expect(svg).toContain('#16a34a')   // hijau
    expect(svg).toContain('#dc2626')   // merah
    expect(svg).toContain('>L1</text>')
    expect(svg).toContain('>L2</text>')
  })

  it('tanpa titik beban tetap menghasilkan kurva', () => {
    const svg = gambarDiagramPM({ kurva: d.titik })
    expect(svg).toContain('<polyline')
    expect(svg).not.toContain('#16a34a')
  })

  it('menolak kurva yang terlalu pendek untuk digambar', () => {
    expect(() => gambarDiagramPM({ kurva: [{ phiMnKnm: 1, phiPnKn: 1 }] }))
      .toThrow(/minimal 2 titik/)
  })

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * WARNA GAMBAR TIDAK BOLEH BERBEDA DARI VERDICT RESMI.
   *
   * Ini penjaga terpenting di berkas ini. Gambar dan angka menjawab pertanyaan
   * yang sama; kalau keduanya berbeda, yang dipercaya orang adalah yang dilihat
   * — dan itu bisa gambar yang salah.
   *
   * Versi pertama mewarnai titik memakai "titik kurva TERDEKAT menurut φPn".
   * Pada bagian kurva yang menanjak tajam, titik terdekat bisa punya φMn jauh
   * berbeda dari kapasitas pada Pu sesungguhnya — jadi hijau/merahnya bisa
   * salah. Diganti interpolasi, cara yang sama persis dengan `cekTitikBeban`.
   * ══════════════════════════════════════════════════════════════════════════
   */
  /*
    ⚠ Titik uji dipilih TEPAT DI GARIS BATAS, bukan angka bulat sembarang.

    Versi pertama test ini memakai Pu ∈ {200, 800, 1500, 2500, 4000} dan
    Mu ∈ {30, 150, 300, 700} — dan MUTASI "kembali ke titik-terdekat" LOLOS
    hijau. Sebabnya: pada nilai-nilai itu kedua metode kebetulan memberi
    verdict yang sama, karena Mu-nya jauh dari batas kapasitas.

    Diukur: 165 nilai Pu menghasilkan φMn berbeda antara interpolasi dan
    titik-terdekat. Yang membedakan verdict hanyalah Mu yang jatuh DI ANTARA
    kedua nilai itu. Karena itu titik uji di bawah dihitung dari kurvanya
    sendiri — Mu = tepat di kapasitas, ±0.5% — sehingga selisih sekecil apa
    pun antara dua metode langsung mengubah warna.
  */
  it('warna titik SELALU cocok dengan verdict cekTitikBeban — DI GARIS BATAS', () => {
    const uji: { puKn: number; muKnm: number }[] = []
    for (const puKn of [50, 100, 175, 260, 400, 700, 1200, 2000, 3000, 4000]) {
      const kap = cekTitikBeban(d, puKn, 0).phiMnPadaPuKnm
      // Tepat di bawah dan tepat di atas kapasitas — keduanya harus benar.
      uji.push({ puKn, muKnm: kap * 0.995 })
      uji.push({ puKn, muKnm: kap * 1.005 })
    }

    const svg = gambarDiagramPM({
      kurva: d.titik,
      beban: uji.map((u, i) => ({ ...u, label: `T${i}` })),
    })

    // Hitung berapa yang aman menurut verdict resmi…
    const amanResmi = uji.filter((u) => cekTitikBeban(d, u.puKn, u.muKnm).aman).length

    /*
      …dan berapa LINGKARAN hijau di gambar.

      ⚠ Dihitung dari `<circle …fill="#16a34a"`, bukan dari warna saja: label
      teks memakai warna yang sama, jadi mencocokkan `fill="#16a34a"` polos
      menghitung tiap titik DUA KALI. Test versi pertama saya begitu, dan
      hasilnya 22 vs 11 — terlihat seperti cacat kode padahal cacat test.
    */
    const hijau = (svg.match(/<circle[^>]*fill="#16a34a"/g) ?? []).length
    const merah = (svg.match(/<circle[^>]*fill="#dc2626"/g) ?? []).length

    expect(hijau).toBe(amanResmi)
    expect(hijau + merah).toBe(uji.length)
    // Uji ini tak berarti kalau semuanya kebetulan aman atau semuanya gagal.
    expect(hijau).toBeGreaterThan(0)
    expect(merah).toBeGreaterThan(0)
  })

  /**
   * Daerah TARIK dipotong secara bawaan — dan itu keputusan tampilan, bukan
   * perhitungan.
   *
   * Pada penampang contoh, 68 dari 150 titik ber-φPn negatif. Menampilkannya
   * membuat setengah tinggi grafik terpakai untuk daerah yang hampir tak
   * pernah dipakai kolom gedung, dan kurvanya menembus keluar bingkai.
   */
  it('daerah tarik (φPn < 0) dipotong secara bawaan', () => {
    const adaTarik = d.titik.filter((t) => t.phiPnKn < 0)
    expect(adaTarik.length).toBeGreaterThan(0)   // memang ada di kurva

    const bawaan = gambarDiagramPM({ kurva: d.titik })
    const penuh = gambarDiagramPM({ kurva: d.titik, sertakanTarik: true })

    const jumlahTitik = (s: string) => s.match(/points="([^"]+)"/)![1].trim().split(/\s+/).length
    expect(jumlahTitik(bawaan)).toBe(d.titik.length - adaTarik.length)
    expect(jumlahTitik(penuh)).toBe(d.titik.length)
  })

  it('kurva yang seluruhnya tarik → melempar dengan saran yang jelas', () => {
    expect(() => gambarDiagramPM({
      kurva: [{ phiMnKnm: 10, phiPnKn: -100 }, { phiMnKnm: 20, phiPnKn: -200 }],
    })).toThrow(/sertakanTarik/)
  })

  it('titik beban di luar rentang kurva tak merusak dokumen', () => {
    const svg = gambarDiagramPM({
      kurva: d.titik,
      beban: [{ muKnm: 99_999, puKn: 99_999 }],
    })
    expect((svg.match(/<svg/g) ?? []).length).toBe(1)
    expect(svg).toContain('</svg>')
  })
})

describe('integrasi — gambar dari hasil modul struktur', () => {
  it('kurva dari diagramPM langsung bisa digambar tanpa penyesuaian', () => {
    const p = penampangPersegi({
      bMm: 350, hMm: 600, selimutMm: 40, dUtamaMm: 19, dSengkangMm: 10,
      nBarisTegakLurus: 3, nBarisSearah: 4, mutu: { fcMpa: 30, fyMpa: 400 },
    })
    const svg = gambarDiagramPM({ kurva: diagramPM(p, 80).titik, judul: 'K1 350×600' })
    expect(svg).toContain('K1 350×600')
    expect(svg).toContain('<polyline')
  })

  it('penampang & diagram bisa dibuat dari input yang sama', () => {
    const penampangSvg = gambarPenampang({
      bMm: 400, hMm: 400, selimutMm: 40, dSengkangMm: 10,
      tulanganBawah: [4], tulanganAtas: [4], dUtamaMm: 16,
    }, { judul: 'K1' })
    expect(penampangSvg).toContain('<svg')
    // 8 batang: 4 atas + 4 bawah.
    expect((penampangSvg.match(/<circle/g) ?? []).length).toBe(8)
  })
})

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * GAMBAR UNTUK EMPAT JENIS YANG SEBELUMNYA TAK PUNYA APA-APA
 *
 * Diukur lewat API hidup: dari 7 jenis elemen, hanya balok & kolom persegi yang
 * menghasilkan gambar. Kolom bulat hanya punya diagram P-M (kurva kapasitas
 * tanpa pernah memperlihatkan susunan tulangan yang menghasilkannya), sementara
 * pelat, footplat, dan pilecap TIDAK punya gambar sama sekali.
 *
 * Pelat justru elemen bertonase besi TERBESAR (1.746 kg pada contoh 200 m²,
 * dua puluh kali balok tunggal) — dan estimator memesan besi terbanyak untuk
 * elemen yang tak bisa ia lihat gambarnya.
 * ══════════════════════════════════════════════════════════════════════════════
 */
describe('gambarPenampangLingkaran — kolom bulat', () => {
  const IN = {
    diameterMm: 400, selimutMm: 40, dPengekangMm: 10, dUtamaMm: 16,
    nTulangan: 8, pengekang: 'sengkang' as const,
  }

  it('menggambar SEMUA batang yang diminta', () => {
    const svg = gambarPenampangLingkaran(IN)
    // 3 lingkaran beton (isi, arsir, tepi) + 1 pengekang + 8 tulangan = 12.
    expect((svg.match(/<circle/g) ?? []).length).toBe(12)
  })

  it('batang disebar merata pada lingkaran inti', () => {
    const t = posisiTulanganLingkaran(IN)
    expect(t).toHaveLength(8)
    // Semua berjarak sama dari pusat.
    const r = t.map((p) => Math.hypot(p.xMm - 200, p.yMm - 200))
    for (const x of r) expect(x).toBeCloseTo(r[0], 9)
    // Jari-jarinya = R − selimut − Øpengekang − ½Øutama = 200−40−10−8 = 142.
    expect(r[0]).toBeCloseTo(142, 9)
  })

  it('batang PERTAMA di ATAS, bukan di kanan', () => {
    // Konvensi gambar kolom. Kalau mulai dari 0°, kolom 4-batang tergambar
    // miring 45° — salah, dan hanya terlihat kalau dirender.
    const t = posisiTulanganLingkaran({ ...IN, nTulangan: 4 })
    expect(t[0].xMm).toBeCloseTo(200, 6)
    expect(t[0].yMm).toBeLessThan(200)
  })

  it('spiral DIBEDAKAN dari sengkang cincin', () => {
    /*
      Bukan hiasan: keduanya beda cara pasang, beda harga, dan beda faktor φ
      (0,75 vs 0,65). Gambar yang menyamakannya membuat pelaksana memasang
      yang salah.
    */
    const spiral = gambarPenampangLingkaran({ ...IN, pengekang: 'spiral' })
    const cincin = gambarPenampangLingkaran({ ...IN, pengekang: 'sengkang' })
    expect(spiral).toMatch(/stroke-dasharray/)
    expect(spiral).toMatch(/Spiral/)
    expect(cincin).toMatch(/Sengkang/)
  })

  it('selimut terlalu tebal → tak ada batang, bukan koordinat negatif', () => {
    expect(posisiTulanganLingkaran({ ...IN, selimutMm: 300 })).toHaveLength(0)
  })

  it('menolak diameter nol alih-alih menggambar titik', () => {
    expect(() => gambarPenampangLingkaran({ ...IN, diameterMm: 0 })).toThrow(/Diameter/)
  })
})

describe('gambarPotonganPelat', () => {
  const IN = {
    bentangM: 4, tebalM: 0.12, dTulanganMm: 10, jarakTulanganMm: 150, selimutMm: 20,
  }

  it('menyatakan bahwa gambarnya SEPOTONG, bukan seluruh bentang', () => {
    /*
      Pelat 4 m × 120 mm punya rasio 33:1 — digambar utuh ia jadi garis rambut.
      Yang digambar sepotong, dan pemotongannya HARUS dinyatakan: gambar
      sepotong yang mengaku utuh membuat orang salah membaca panjangnya.
    */
    const svg = gambarPotonganPelat(IN)
    expect(svg).toMatch(/potongan/i)
    expect(svg).toMatch(/dari bentang/i)
  })

  it('pelat pendek TIDAK ditandai terpotong', () => {
    const svg = gambarPotonganPelat({ ...IN, bentangM: 0.9 })
    expect(svg).not.toMatch(/dari bentang/i)
  })

  it('dua lapis tulangan — atas DAN bawah', () => {
    const svg = gambarPotonganPelat(IN)
    expect(svg).toMatch(/dua lapis/i)
    // Batang digambar berpasangan, jadi jumlahnya genap dan > 0.
    const n = (svg.match(/<circle/g) ?? []).length
    expect(n).toBeGreaterThan(0)
    expect(n % 2).toBe(0)
  })

  it('notasi tulangan menerus TANPA angka nol di depan', () => {
    // "0D10-150" adalah omong kosong di gambar kerja; yang benar "D10-150".
    const svg = gambarPotonganPelat(IN)
    expect(svg).toMatch(/D10-150/)
    expect(svg).not.toMatch(/0D10/)
  })

  it('menolak jarak tulangan nol alih-alih menggantung', () => {
    expect(() => gambarPotonganPelat({ ...IN, jarakTulanganMm: 0 })).toThrow(/Jarak/)
  })
})

describe('gambarPondasi — footplat & pilecap', () => {
  const FOOT = {
    lxM: 1.5, lyM: 1.5, hM: 0.3, bxM: 0.4, byM: 0.4,
    dTulanganMm: 13, jarakTulanganMm: 150,
  }
  const PILE = {
    ...FOOT, lxM: 2.2, lyM: 2.2, hM: 0.5, dTulanganMm: 16, diameterTiangM: 0.4,
    tiang: [
      { xM: -0.6, yM: -0.6 }, { xM: 0.6, yM: -0.6 },
      { xM: -0.6, yM: 0.6 }, { xM: 0.6, yM: 0.6 },
    ],
  }

  it('memuat DENAH dan POTONGAN dalam satu gambar', () => {
    /*
      Disatukan karena yang harus dicocokkan orang di lapangan adalah posisi
      tiang terhadap tebal poer — dua gambar terpisah membuat pencocokan itu
      jadi pekerjaan pembaca.
    */
    const svg = gambarPondasi(FOOT)
    expect(svg).toMatch(/DENAH/)
    expect(svg).toMatch(/POTONGAN/)
  })

  it('footplat: ada garis tanah, TIDAK ada tiang', () => {
    const svg = gambarPondasi(FOOT)
    expect(svg).not.toMatch(/tiang/i)
  })

  it('pilecap: menggambar tiang sebanyak yang diberikan', () => {
    const svg = gambarPondasi(PILE)
    expect(svg).toMatch(/4 tiang/)
    // 4 lingkaran tiang di denah + batang tulangan pada potongan.
    expect((svg.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('tiang digambar pada koordinat NYATA, bukan simetris begitu saja', () => {
    /*
      Grup tiang yang TAK simetris justru yang paling perlu diperiksa
      gambarnya — di sanalah beban per tiang paling timpang.
    */
    const miring = gambarPondasi({
      ...PILE, tiang: [{ xM: -0.8, yM: 0 }, { xM: 0.3, yM: 0 }],
    })
    // 2,2 m → pusat 1100 mm; tiang di −800 dan +300 mm.
    expect(miring).toMatch(/cx="300"/)
    expect(miring).toMatch(/cx="1400"/)
  })

  it('notasi tulangan pondasi tanpa nol di depan', () => {
    expect(gambarPondasi(FOOT)).toMatch(/D13-150 dua arah/)
    expect(gambarPondasi(FOOT)).not.toMatch(/0D13/)
  })

  it('menolak dimensi nol', () => {
    expect(() => gambarPondasi({ ...FOOT, hM: 0 })).toThrow(/Dimensi/)
  })
})

describe('gambarTiang — potongan + profil tanah', () => {
  const IN = {
    diameterM: 0.4, panjangM: 16,
    lapisan: [
      { tebalM: 3, nSpt: 8 }, { tebalM: 4, nSpt: 12 },
      { tebalM: 5, nSpt: 25 }, { tebalM: 6, nSpt: 42 },
    ],
    pIjinKn: 412.5, penentu: 'SPT (Meyerhof)',
  }

  it('menggambar SETIAP lapisan tanah beserta N-SPT-nya', () => {
    /*
      Tiang satu-satunya elemen yang kapasitasnya ditentukan sesuatu DI LUAR
      dirinya. Gambar tanpa profil tanah membuat dua tiang berdimensi identik
      dengan kapasitas berbeda tiga kali lipat terlihat sama persis.
    */
    const svg = gambarTiang(IN)
    for (const n of [8, 12, 25, 42]) expect(svg).toMatch(new RegExp(`N-SPT ${n}`))
  })

  it('tebal tiap lapisan PROPORSIONAL, bukan dibagi rata', () => {
    const svg = gambarTiang(IN)
    // Lapisan 3 m dan 6 m harus punya height berbeda 2×.
    const tinggi = [...svg.matchAll(/<rect[^>]*height="([\d.]+)"/g)]
      .map((m) => Number(m[1]))
    expect(tinggi).toContain(3000)
    expect(tinggi).toContain(6000)
  })

  it('menyebut APA yang membatasi, bukan hanya angkanya', () => {
    /*
      "P ijin 300 kN" saja tak bisa ditindak: kalau BAHAN yang membatasi,
      memperpanjang tiang tak menolong; kalau TANAH, justru itu satu-satunya
      yang menolong.
    */
    const svg = gambarTiang(IN)
    expect(svg).toMatch(/P ijin 412\.5 kN/)
    expect(svg).toMatch(/ditentukan SPT \(Meyerhof\)/)
  })

  it('tanpa kapasitas → tetap menggambar, tanpa baris kosong', () => {
    const svg = gambarTiang({ ...IN, pIjinKn: undefined, penentu: undefined })
    expect(svg).toMatch(/^<svg/)
    expect(svg).not.toMatch(/P ijin/)
  })

  it('viewBox memuat baris terpanjang — tak ada teks terpotong', () => {
    /*
      Cacat yang dua kali terjadi dan dua kali hanya terlihat dari gambarnya:
      viewBox ditaksir dari kelipatan margin, lalu judul terpotong di kiri dan
      baris "ditentukan SPT (Meyerhof)" terpotong di kanan.

      Yang dijaga: tepi kanan viewBox ≥ perkiraan lebar baris terpanjang.
    */
    const svg = gambarTiang({ ...IN, penentu: 'Sondir dengan nama metode yang panjang sekali' })
    const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/)!
    const x = Number(vb[1]), w = Number(vb[3])
    const ukuranTeks = 16000 / 34
    const perkiraan = ukuranTeks * 0.92 * 'P ijin 000.0 kN — ditentukan Sondir dengan nama metode yang panjang sekali'.length * 0.58
    expect(x + w).toBeGreaterThanOrEqual(perkiraan)
  })

  it('menolak dimensi nol', () => {
    expect(() => gambarTiang({ ...IN, panjangM: 0 })).toThrow(/Dimensi/)
  })
})

describe('SVG tak bisa disusupi lewat teks pengguna', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA PENJAGA INI ADA, DAN KENAPA SEKARANG

    Halaman `/estimasi/struktur` menanam SVG ini lewat
    `dangerouslySetInnerHTML` — satu-satunya cara membuat gambar teknik bisa
    diperbesar tanpa buram dan tetap terbaca pembaca layar (`<img src="data:">`
    kehilangan keduanya).

    Yang membuat itu boleh: SELURUH teks yang masuk SVG lewat `amankanTeks()`.
    Tetapi "boleh" itu bergantung pada satu fungsi yang bisa saja dilewati
    penggambar berikutnya — dan kalau dilewati, kode nama elemen yang diketik
    pengguna berubah jadi jalur eksekusi skrip di peramban orang lain.

    Judul dan `penentu` diuji karena keduanya berasal dari data pengguna:
    judul dari `kode`+`nama` elemen, `penentu` dari nama metode.
    ══════════════════════════════════════════════════════════════════════════
  */
  const JAHAT = '</text><script>alert(1)</script><text>'

  it('judul jahat tidak menghasilkan <script> di penampang', () => {
    const svg = gambarPenampang(
      { bMm: 300, hMm: 500, selimutMm: 30, dSengkangMm: 8, dUtamaMm: 16,
        tulanganBawah: [3], tulanganAtas: [2] },
      { judul: JAHAT })
    expect(svg).not.toMatch(/<script/i)
    expect(svg).toMatch(/&lt;script/)
  })

  it('judul & penentu jahat tidak lolos di gambar tiang', () => {
    const svg = gambarTiang(
      { diameterM: 0.4, panjangM: 16, lapisan: [{ tebalM: 16, nSpt: 20 }],
        pIjinKn: 300, penentu: JAHAT },
      { judul: JAHAT })
    expect(svg).not.toMatch(/<script/i)
  })

  it('judul jahat tidak lolos di gambar pondasi & potongan pelat', () => {
    expect(gambarPondasi(
      { lxM: 1.5, lyM: 1.5, hM: 0.3, bxM: 0.4, byM: 0.4,
        dTulanganMm: 13, jarakTulanganMm: 150 },
      { judul: JAHAT })).not.toMatch(/<script/i)

    expect(gambarPotonganPelat(
      { bentangM: 4, tebalM: 0.12, dTulanganMm: 10, jarakTulanganMm: 150, selimutMm: 20 },
      { judul: JAHAT })).not.toMatch(/<script/i)

    expect(gambarPenampangLingkaran(
      { diameterMm: 400, selimutMm: 40, dPengekangMm: 10, dUtamaMm: 16, nTulangan: 8 },
      { judul: JAHAT })).not.toMatch(/<script/i)
  })

  it('kutip ganda di judul TIDAK memutus atribut aria-label', () => {
    /*
      Yang berbahaya bukan kata "onload" muncul di keluaran — melainkan
      atributnya TERPUTUS sehingga `onload` jadi atribut SVG yang sungguhan.

      Percobaan pertama saya menguji `not.toMatch(/onload=/)` dan MERAH,
      padahal keluarannya aman: kutipnya sudah jadi `&quot;`, jadi seluruh
      muatan tetap berada DI DALAM nilai atribut. Assertion itu menguji
      kemunculan huruf, bukan bahaya — dan test yang merah untuk keluaran yang
      benar sama merugikannya dengan test yang hijau untuk keluaran yang salah.

      Yang diperiksa sekarang: nilai atribut hanya berakhir pada kutip yang
      TIDAK berasal dari pengguna.
    */
    const svg = gambarPenampang(
      { bMm: 300, hMm: 500, selimutMm: 30, dSengkangMm: 8, dUtamaMm: 16,
        tulanganBawah: [3], tulanganAtas: [2] },
      { judul: '" onload="alert(1)' })

    const label = svg.match(/aria-label="([^"]*)"/)
    expect(label).not.toBeNull()
    // Muatannya utuh di dalam atribut, dengan kutip yang sudah dilolos.
    expect(label![1]).toContain('&quot; onload=&quot;alert(1)')
    /*
      Dan tak ada atribut `onload` SUNGGUHAN.

      Dua percobaan sebelumnya salah dengan cara yang layak dicatat:

        `/onload=/`          — MERAH untuk keluaran yang benar; ia menguji
                               kemunculan HURUF, bukan bahaya.
        `/<[^>]*\sonload=/`  — juga merah; `[^>]*` ikut mencakup teks di DALAM
                               nilai atribut, karena di sana memang tak ada `>`.
        `DOMParser`          — tak tersedia di lingkungan test node ini.

      Yang benar: BUANG dulu seluruh isi nilai atribut, lalu cari `onload=` di
      sisanya. Kalau muatan pengguna tetap terkurung di dalam kutip, ia ikut
      terbuang dan tak ada apa pun yang tersisa untuk ditemukan.
    */
    const hanyaStruktur = svg
      .replace(/="[^"]*"/g, '=""')       // buang isi nilai atribut
      .replace(/>[^<]*</g, '><')          // buang isi teks antar-tag
    expect(hanyaStruktur).not.toMatch(/onload/i)
  })
})

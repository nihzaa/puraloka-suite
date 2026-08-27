import { describe, it, expect } from 'vitest'
import { titikProfilBaja, gambarProfilBaja } from '../struktur-gambar'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENAMPANG PROFIL BAJA
 *
 * Geometri diuji sebagai ANGKA lewat `titikProfilBaja()`, bukan lewat string
 * SVG — pelajaran yang sama dengan `posisiTulangan()`: bentuk penampang adalah
 * hal yang harus benar, dan memeriksanya lewat teks SVG akan rapuh terhadap
 * perubahan gaya gambar yang tak mengubah bentuknya sama sekali.
 *
 * Yang diuji lewat SVG hanya hal yang memang tentang SVG: viewBox berukuran
 * positif, dan angka yang dijanjikan muncul di dalamnya.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** WF 200x100x5,5x8 — profil nyata dari tabel, bukan angka karangan. */
const WF = { hMm: 200, bMm: 100, twMm: 5.5, tfMm: 8, bentuk: 'WF' }

describe('titikProfilBaja — bentuk penampang sebagai angka', () => {
  it('WF punya dua belas titik: dua sayap + badan di tengah', () => {
    const t = titikProfilBaja(WF)
    expect(t).toHaveLength(12)
  })

  it('badan WF berada TEPAT di tengah lebar sayap', () => {
    /*
      Kalau badannya bergeser, gambar memperlihatkan profil yang tak simetris
      sementara rumusnya mengandaikan simetri — dan yang membaca gambar akan
      menyangka ia memesan profil yang berbeda.
    */
    const t = titikProfilBaja(WF)
    const xKiriBadan = (WF.bMm - WF.twMm) / 2
    const xKananBadan = xKiriBadan + WF.twMm

    const xs = t.map(([x]) => x)
    expect(xs).toContain(xKiriBadan)
    expect(xs).toContain(xKananBadan)
    /* Jarak dari tepi kiri ke badan = jarak badan ke tepi kanan. */
    expect(xKiriBadan).toBeCloseTo(WF.bMm - xKananBadan, 10)
  })

  it('tinggi total dan lebar sayap benar-benar terpakai', () => {
    const t = titikProfilBaja(WF)
    const xs = t.map(([x]) => x)
    const ys = t.map(([, y]) => y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(WF.bMm)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(WF.hMm)
  })

  it('KANAL (C): badan di SATU sisi, bukan di tengah', () => {
    /*
      Menggambar kanal sebagai I membuat sumbu lemahnya terlihat simetris
      padahal tidak — dan justru ketaksimetrisan itu yang membuat kanal
      terpuntir saat dibebani. Gambar yang menyembunyikan itu menyesatkan
      lebih jauh daripada tak menggambar.
    */
    const t = titikProfilBaja({ hMm: 150, bMm: 65, twMm: 20, tfMm: 6, bentuk: 'C' })
    expect(t).toHaveLength(8)

    /*
      Diperiksa sebagai KETAKSIMETRISAN, bukan dengan mencari titik di
      ketinggian tengah — tepi kiri kanal adalah satu garis lurus dari [0,0]
      ke [0,h], jadi memang TAK ADA simpul di tengahnya. Versi pertama uji ini
      mencari simpul itu dan merah, padahal bentuknya sudah benar.

      Yang membedakan kanal dari I justru ini: sisi kiri RATA — badan menempel
      tepi, jadi tak ada takik sama sekali di sana — sementara sisi kanan
      bertakik dua kali.

      (Menghitung jumlah simpul di kiri vs kanan TIDAK membedakannya: pada
      profil ini kebetulan 4 lawan 4. Uji yang lulus karena kebetulan angka
      sama buruknya dengan uji yang merah karena kebetulan.)
    */
    /* Tepi kiri lurus penuh: hanya dua titik di x = 0, yaitu ujung-ujungnya. */
    expect(t.filter(([x]) => x === 0)).toEqual([[0, 0], [0, 150]])

    /* Sisi kanan bertakik: ada titik di x = b pada EMPAT ketinggian berbeda. */
    expect(t.filter(([x]) => x === 65)).toHaveLength(4)
  })

  it('kanal TIDAK sama dengan WF berdimensi sama', () => {
    const dim = { hMm: 150, bMm: 65, twMm: 20, tfMm: 6 }
    const c = titikProfilBaja({ ...dim, bentuk: 'C' })
    const wf = titikProfilBaja({ ...dim, bentuk: 'WF' })
    expect(c).not.toEqual(wf)
  })

  it('siku (L) punya enam titik — dua kaki, tanpa sayap kedua', () => {
    const t = titikProfilBaja({ hMm: 70, bMm: 70, twMm: 7, tfMm: 7, bentuk: 'L' })
    expect(t).toHaveLength(6)
  })

  it('bentuk yang tak dikenal jatuh ke WF, bukan melempar', () => {
    /*
      Jatuh ke bentuk paling umum lebih baik daripada menolak: elemennya
      sudah dihitung, dan gambar yang tak terbit membuat pengguna menyangka
      elemennya bermasalah. Nama bentuknya tetap dicetak apa adanya.
    */
    const t = titikProfilBaja({ ...WF, bentuk: 'IWF-KHUSUS' })
    expect(t).toHaveLength(12)
  })

  it('bentuk case-insensitive — "wf" sama dengan "WF"', () => {
    expect(titikProfilBaja({ ...WF, bentuk: 'wf' }))
      .toEqual(titikProfilBaja({ ...WF, bentuk: 'WF' }))
  })
})

describe('titikProfilBaja — input mustahil ditolak, bukan digambar', () => {
  it('dimensi nol atau negatif ditolak', () => {
    for (const rusak of [
      { ...WF, hMm: 0 }, { ...WF, bMm: -100 },
      { ...WF, twMm: 0 }, { ...WF, tfMm: -8 },
    ]) {
      expect(() => titikProfilBaja(rusak)).toThrow(/harus > 0/)
    }
  })

  it('dua sayap setinggi profilnya ditolak', () => {
    /*
      tf = h/2 berarti tak ada badan sama sekali. Digambar apa adanya,
      hasilnya kotak pejal yang terlihat seperti profil sah.
    */
    expect(() => titikProfilBaja({ ...WF, tfMm: 100 })).toThrow(/sayap/)
    expect(() => titikProfilBaja({ ...WF, tfMm: 120 })).toThrow(/sayap/)
  })

  it('badan selebar sayapnya ditolak', () => {
    expect(() => titikProfilBaja({ ...WF, twMm: 100 })).toThrow(/badan/)
  })
})

describe('gambarProfilBaja — SVG yang benar-benar bisa ditampilkan', () => {
  it('menghasilkan SVG dengan viewBox berukuran POSITIF', () => {
    /*
      viewBox berukuran nol menghasilkan gambar KOSONG tanpa satu pun galat,
      dan berkasnya tetap terlihat wajar dari luar. Cacat ini pernah lolos
      tsc dan test di modul gambar lain — hanya terlihat dari gambarnya.
    */
    const svg = gambarProfilBaja(WF)
    const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)
    expect(m).not.toBeNull()
    expect(Number(m![3])).toBeGreaterThan(0)
    expect(Number(m![4])).toBeGreaterThan(0)
  })

  it('TEBAL BADAN dan TEBAL SAYAP dicetak TERPISAH', () => {
    /*
      Inilah alasan utama gambar ini ada. Keduanya berdampingan di penamaan
      profil ("200x100x5,5x8") dan tertukar tanpa gejala sampai batangnya
      datang ke lapangan.
    */
    const svg = gambarProfilBaja(WF)
    expect(svg).toContain('badan 5.5')
    expect(svg).toContain('sayap 8')
  })

  it('tinggi dan lebar ikut tercetak', () => {
    const svg = gambarProfilBaja(WF)
    expect(svg).toContain('h 200')
    expect(svg).toContain('b 100')
  })

  it('judul dan penamaan dilewatkan pelolosan — bukan celah penyisipan', () => {
    /*
      Judul datang dari nama elemen yang ditulis PENGGUNA. Satu karakter `<`
      merusak seluruh dokumen SVG, dan bila SVG-nya ditampilkan di web ia
      menjadi celah penyisipan.
    */
    const svg = gambarProfilBaja(
      { ...WF, designation: '<script>x</script>' },
      { judul: 'BB<1> & "utama"' },
    )
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;')
  })

  it('dimensi bisa dimatikan — gambar tetap terbit', () => {
    const svg = gambarProfilBaja(WF, { dimensi: false })
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('badan 5.5')
  })

  it('profil ramping dan profil gemuk sama-sama menghasilkan viewBox positif', () => {
    /*
      Rasio ekstrem adalah tempat viewBox biasanya runtuh: margin dihitung
      dari dimensi terbesar, dan pada profil sangat pipih margin itu bisa
      menelan gambarnya.
    */
    for (const p of [
      { hMm: 900, bMm: 300, twMm: 16, tfMm: 28 },   // WF berat
      { hMm: 100, bMm: 100, twMm: 6, tfMm: 8 },     // H kecil
      { hMm: 75, bMm: 35, twMm: 0.75, tfMm: 0.75 }, // baja ringan C75
    ]) {
      const svg = gambarProfilBaja(p)
      const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)!
      expect(Number(m[3]), JSON.stringify(p)).toBeGreaterThan(0)
      expect(Number(m[4]), JSON.stringify(p)).toBeGreaterThan(0)
    }
  })

  it('SVG punya aria-label — pembaca layar tak menemui gambar tanpa nama', () => {
    const svg = gambarProfilBaja(WF, { judul: 'BB-1' })
    expect(svg).toMatch(/aria-label="[^"]+"/)
    expect(svg).toContain('role="img"')
  })
})

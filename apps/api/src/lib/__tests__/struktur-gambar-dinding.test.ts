import { describe, it, expect } from 'vitest'
import { gambarDindingPenahan } from '../struktur-gambar'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * POTONGAN DINDING PENAHAN
 *
 * Dinding penahan bisa runtuh TANPA satu pun bahannya gagal — betonnya utuh,
 * tulangannya utuh, dan dindingnya terguling atau tergeser sebagai satu benda.
 * Karena itu gambarnya memuat hal yang tak ada di gambar elemen lain: tekanan
 * tanah yang mendorongnya, tekanan tumpu di bawah telapaknya, dan angka
 * keamanannya.
 *
 * Yang diuji di sini adalah hal-hal yang KELIHATAN SALAH tanpa gejala:
 * keadaan tumit terangkat yang tak dibedakan, dan angka keamanan kurang yang
 * dicetak dengan warna yang sama seperti yang cukup.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Dinding taman 3 m — proporsi yang lazim dan aman. */
const AMAN = {
  tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4, panjangTelapakM: 2.2,
  tebalTelapakM: 0.4, kakiM: 0.6,
  qMaksKnM2: 118, qMinKnM2: 42, sfGuling: 2.14, sfGeser: 1.73, paKnPerM: 31.5,
}

describe('gambarDindingPenahan — SVG yang bisa ditampilkan', () => {
  it('viewBox berukuran POSITIF', () => {
    const svg = gambarDindingPenahan(AMAN)
    const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)
    expect(m).not.toBeNull()
    expect(Number(m![3])).toBeGreaterThan(0)
    expect(Number(m![4])).toBeGreaterThan(0)
  })

  it('proporsi ekstrem tetap menghasilkan viewBox positif', () => {
    for (const p of [
      { ...AMAN, tinggiM: 8, panjangTelapakM: 5 },       // tinggi
      { ...AMAN, tinggiM: 1.2, panjangTelapakM: 3.5 },   // pendek & lebar
      { ...AMAN, kakiM: 0 },                              // tanpa kaki
    ]) {
      const m = gambarDindingPenahan(p)
        .match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)!
      expect(Number(m[3]), JSON.stringify(p)).toBeGreaterThan(0)
      expect(Number(m[4]), JSON.stringify(p)).toBeGreaterThan(0)
    }
  })

  it('dimensi utama dan angka keamanan tercetak', () => {
    const svg = gambarDindingPenahan(AMAN)
    expect(svg).toContain('B 2.2 m')
    expect(svg).toContain('H 3 m')
    expect(svg).toContain('SF guling 2.14')
    expect(svg).toContain('SF geser 1.73')
    expect(svg).toContain('Pa 31.5 kN/m')
  })

  it('judul dilewatkan pelolosan — bukan celah penyisipan', () => {
    const svg = gambarDindingPenahan(AMAN, { judul: 'DP<1> & "utama"' })
    expect(svg).not.toContain('<script')
    expect(svg).toContain('&lt;')
  })

  it('dua baris SF tak SALING MENIMPA', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Ditemukan dari POTRET LAYAR, bukan dari test — dan itu sebabnya uji ini
      ditulis belakangan.

      Versi pertama menaruh dua baris berjarak `uk * 1.05` untuk teks setinggi
      `uk * 0.82`, dan keduanya bertumpuk. SVG-nya sah, angkanya benar, dan
      tak satu pun pemeriksaan bisa menyatakan dua teks saling menimpa.

      Yang membacanya melihat "SF guling 4.76" dengan garis merah menyilang di
      tengahnya — terbaca seperti peringatan pada angka yang justru aman.
      ══════════════════════════════════════════════════════════════════════
    */
    const svg = gambarDindingPenahan(AMAN)
    const baris = [...svg.matchAll(
      /<text x="[-\d.]+" y="([-\d.]+)" font-size="([\d.]+)"[^>]*>([^<]*SF[^<]*)</g,
    )]
    expect(baris.length, 'dua baris SF harus ada').toBe(2)

    const [a, b] = baris.map((m) => ({ y: Number(m[1]), ukuran: Number(m[2]) }))
    const jarak = Math.abs(a.y - b.y)
    const tinggiTeks = Math.max(a.ukuran, b.ukuran)

    /*
      Ambangnya 1,4 × tinggi teks — dan angka itu DIUKUR lewat mutasi, bukan
      dipilih karena terdengar aman.

      Perjalanannya:

        ambang 1,0  → mutasi `uk * 1.05` (cacat aslinya) LOLOS, karena
                      1,05·uk memang lebih besar daripada 0,82·uk
        ambang 1,25 → mutasi yang sama LOLOS juga: rasionya 1,28
        ambang 1,4  → mutasi MERAH; yang terpasang sekarang berasio 1,65

      Dua ambang pertama adalah uji yang lolos pada cacat yang justru
      melahirkannya — yaitu uji yang tak menjaga apa pun. Baru mutasi yang
      memperlihatkannya.
    */
    expect(
      jarak / tinggiTeks,
      `jarak antar baris ${jarak} terhadap tinggi teks ${tinggiTeks} = `
      + `${(jarak / tinggiTeks).toFixed(2)}× — di bawah 1,4× keduanya `
      + 'bertumpuk atau bersentuhan di layar',
    ).toBeGreaterThanOrEqual(1.4)
  })

  it('seluruh teks berada DI DALAM viewBox — tak terpotong', () => {
    /*
      Teks yang jatuh di luar viewBox tak digambar sama sekali, dan SVG-nya
      tetap sah. Angka keamanan yang hilang dari gambar adalah angka yang
      tak dibaca.
    */
    const svg = gambarDindingPenahan(AMAN, { judul: 'DP-1' })
    const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)!
    const atas = Number(vb[2])
    const bawah = atas + Number(vb[4])

    for (const m of svg.matchAll(/<text x="[-\d.]+" y="([-\d.]+)"/g)) {
      const y = Number(m[1])
      expect(y, `teks di y=${y} keluar dari viewBox [${atas}, ${bawah}]`)
        .toBeGreaterThan(atas)
      expect(y).toBeLessThan(bawah)
    }
  })

  it('punya role dan aria-label', () => {
    const svg = gambarDindingPenahan(AMAN, { judul: 'DP-1' })
    expect(svg).toContain('role="img"')
    expect(svg).toMatch(/aria-label="[^"]+"/)
  })
})

describe('gambarDindingPenahan — keadaan berbahaya WAJIB terlihat berbeda', () => {
  it('TUMIT TERANGKAT ditandai, bukan digambar seperti yang aman', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Bila qMin ≤ 0, resultan keluar dari inti sepertiga tengah dan ujung
      tumit tak menekan tanah sama sekali. Dinding lalu berputar pelan-pelan
      selama bertahun-tahun tanpa pernah benar-benar runtuh — dan tak ada
      SATU ANGKA pun di layar yang memperlihatkannya.

      Digambar sama seperti keadaan aman, gambar itu justru MENENANGKAN
      pembacanya. Itu lebih buruk daripada tak menggambar.
      ══════════════════════════════════════════════════════════════════════
    */
    const terangkat = gambarDindingPenahan({ ...AMAN, qMaksKnM2: 210, qMinKnM2: -18 })
    expect(terangkat).toContain('TUMIT TERANGKAT')
    expect(terangkat).toContain('#dc2626')

    const aman = gambarDindingPenahan(AMAN)
    expect(aman).not.toContain('TUMIT TERANGKAT')
  })

  it('qMin tepat NOL sudah dihitung terangkat — batasnya inklusif', () => {
    /*
      q = 0 berarti tanah di ujung tumit TIDAK menekan. Menganggapnya masih
      aman ("kan belum negatif") melewatkan tepat keadaan batasnya.
    */
    const svg = gambarDindingPenahan({ ...AMAN, qMinKnM2: 0 })
    expect(svg).toContain('TUMIT TERANGKAT')
  })

  it('SF kurang dicetak MERAH, SF cukup tidak', () => {
    /*
      Angka keamanan yang kurang dicetak dengan warna yang sama seperti yang
      cukup adalah angka yang tak dibaca. Pembaca gambar kerja memindai, tak
      membandingkan tiap angka ke ambangnya.
    */
    const kurang = gambarDindingPenahan({
      ...AMAN, sfGuling: 1.12, sfGeser: 0.94,
      qMaksKnM2: 210, qMinKnM2: 42,   // tumit TIDAK terangkat, supaya merahnya
    })                                 // benar-benar datang dari SF
    expect(kurang).toContain('SF guling 1.12')
    expect(kurang).toContain('#dc2626')

    const cukup = gambarDindingPenahan(AMAN)
    expect(cukup).not.toContain('#dc2626')
  })

  it('SF tepat di ambang 1,5 dianggap CUKUP, di bawahnya tidak', () => {
    const pas = gambarDindingPenahan({ ...AMAN, sfGuling: 1.5, sfGeser: 1.5 })
    expect(pas).not.toContain('#dc2626')

    const kurangSedikit = gambarDindingPenahan({ ...AMAN, sfGuling: 1.49, sfGeser: 1.5 })
    expect(kurangSedikit).toContain('#dc2626')
  })
})

describe('gambarDindingPenahan — geometri mustahil ditolak, bukan digambar', () => {
  it('dimensi nol atau negatif ditolak', () => {
    for (const rusak of [
      { ...AMAN, tinggiM: 0 }, { ...AMAN, tebalBawahM: -0.4 },
      { ...AMAN, panjangTelapakM: 0 }, { ...AMAN, tebalTelapakM: 0 },
    ]) {
      expect(() => gambarDindingPenahan(rusak)).toThrow(/harus > 0/)
    }
  })

  it('telapak setinggi dindingnya ditolak', () => {
    /*
      Tebal telapak = tinggi total berarti tak ada badan sama sekali.
      Digambar apa adanya, hasilnya kotak pejal yang terlihat seperti
      dinding sah.
    */
    expect(() => gambarDindingPenahan({ ...AMAN, tebalTelapakM: 3 }))
      .toThrow(/setinggi/)
  })

  it('kaki + badan melebihi telapak ditolak', () => {
    /*
      Bentuk yang mustahil dibangun: badannya menjorok keluar dari
      telapaknya. Digambar apa adanya, hasilnya terlihat seperti dinding
      dengan tumit negatif — dan pembacanya tak punya cara tahu itu mustahil.
    */
    expect(() => gambarDindingPenahan({ ...AMAN, kakiM: 2 }))
      .toThrow(/melebihi panjang telapak/)
  })

  it('kaki NOL sah — dinding yang seluruh telapaknya tumit', () => {
    /*
      Bentuk nyata: dinding yang menempel batas lahan tak boleh punya kaki
      ke depan. Menolaknya akan memaksa pengguna mengarang dimensi.
    */
    expect(() => gambarDindingPenahan({ ...AMAN, kakiM: 0 })).not.toThrow()
  })

  it('tanpa data stabilitas, gambar TETAP terbit', () => {
    /*
      Bentuknya tetap berguna walau angkanya belum ada — dan gambar yang
      menolak terbit membuat pengguna menyangka elemennya bermasalah.
    */
    const svg = gambarDindingPenahan({
      tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4,
      panjangTelapakM: 2.2, tebalTelapakM: 0.4, kakiM: 0.6,
    })
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('SF guling')
  })
})

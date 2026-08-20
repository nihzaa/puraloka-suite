/**
 * KATALOG BEBAN — beban hidup dari SNI, beban mati dari pilihan material.
 *
 * Angka SNI diuji terhadap nilai yang tertulis di tabelnya, bukan terhadap
 * keluaran fungsinya sendiri. Angka tabel yang salah ketik tak menimbulkan
 * galat apa pun: baloknya tetap lolos pemeriksaan, hanya dengan beban yang
 * bukan beban sesungguhnya.
 */
import { describe, it, expect } from 'vitest'
import {
  FUNGSI_RUANG, JENIS_DINDING, LAPIS_MATI,
  bebanDindingDari, fungsiRuang, lapisMatiDari,
} from '../struktur-katalog-beban.js'
import { analisaBebanBalok } from '../struktur-beban-balok.js'

describe('beban hidup — SNI 1727:2020 Tabel 4.3-1', () => {
  it('angka pokok cocok dengan tabelnya', () => {
    expect(fungsiRuang('hunian')?.bebanHidupKnM2).toBe(1.92)
    expect(fungsiRuang('kantor')?.bebanHidupKnM2).toBe(2.40)
    expect(fungsiRuang('restoran')?.bebanHidupKnM2).toBe(4.79)
    expect(fungsiRuang('perpustakaan-rak')?.bebanHidupKnM2).toBe(7.18)
    expect(fungsiRuang('tangga')?.bebanHidupKnM2).toBe(4.79)
  })

  it('ruang rapat kursi LEPAS jauh lebih berat dari yang TETAP', () => {
    /*
      Perbedaan yang paling sering terlewat: kursi yang bisa dipindah membuat
      orang berkerumun, dan SNI menaikkannya dari 2,87 ke 4,79 kN/m².
    */
    const tetap = fungsiRuang('rapat-kursi-tetap')!.bebanHidupKnM2
    const lepas = fungsiRuang('rapat-kursi-lepas')!.bebanHidupKnM2
    expect(lepas).toBeGreaterThan(tetap * 1.5)
  })

  it('atap yang DAPAT DIAKSES lima kali atap biasa', () => {
    /*
      Atap yang "sekadar bisa dinaiki" sering terlanjur dipakai sebagai teras.
      0,96 -> 4,79 kN/m².
    */
    expect(fungsiRuang('atap-taman')!.bebanHidupKnM2)
      .toBeGreaterThan(fungsiRuang('atap-datar')!.bebanHidupKnM2 * 4)
  })

  it('kunci yang tak dikenal memulangkan null, bukan angka karangan', () => {
    expect(fungsiRuang('ruang-naga')).toBeNull()
  })

  it('tiap entri punya kunci UNIK', () => {
    /*
      Kunci kembar membuat `find` memulangkan yang pertama diam-diam — dan
      yang kedua tak pernah bisa dipilih siapa pun.
    */
    const kunci = FUNGSI_RUANG.map((x) => x.kunci)
    expect(new Set(kunci).size).toBe(kunci.length)
  })

  it('tiap beban hidup masuk akal (0,5 – 15 kN/m²)', () => {
    /* Salah ketik satu digit (19,2 alih-alih 1,92) tertangkap di sini. */
    for (const f of FUNGSI_RUANG) {
      expect(f.bebanHidupKnM2).toBeGreaterThan(0.5)
      expect(f.bebanHidupKnM2).toBeLessThan(15)
    }
  })
})

describe('beban mati — dipilih, bukan diketik', () => {
  it('kunci katalog berubah jadi {nama, nilai}', () => {
    const l = lapisMatiDari(['keramik-spesi', 'plafon-gypsum'])
    expect(l).toHaveLength(2)
    expect(l[0].nilai).toBe(0.77)
    expect(l[1].nilai).toBe(0.20)
  })

  it('kunci tak dikenal DILEMPAR, tidak dilewati diam-diam', () => {
    /*
      Lapisan yang hilang membuat beban mati lebih RINGAN dari seharusnya —
      arah kesalahan yang berbahaya, dan tak ada gejalanya.
    */
    expect(() => lapisMatiDari(['keramik-spesi', 'karpet-terbang']))
      .toThrow(/karpet-terbang/)
  })

  it('TIDAK memuat berat sendiri balok maupun pelat', () => {
    /*
      Keduanya sudah dihitung `analisaBebanBalok` dari dimensi. Menaruhnya di
      katalog membuatnya terhitung DUA KALI — dan dua kali beban mati
      menghasilkan balok jauh lebih besar dari perlu, tanpa satu pun galat.
    */
    for (const l of LAPIS_MATI) {
      expect(l.nama.toLowerCase()).not.toMatch(/berat sendiri|balok beton|pelat beton/)
    }
  })

  it('partisi dapat-dipindah ada di katalog — SNI mewajibkannya', () => {
    /*
      SNI 1727 §4.3.2: partisi yang dapat dipindah WAJIB dihitung minimum
      0,72 kN/m², walau denahnya belum menunjukkan satu partisi pun.
    */
    const p = LAPIS_MATI.find((x) => /partisi/i.test(x.nama))
    expect(p).toBeDefined()
    expect(p!.knM2).toBeGreaterThanOrEqual(0.72)
  })
})

describe('dinding — beban GARIS, bukan luasan', () => {
  it('bata ringan lebih ringan dari bata merah', () => {
    const merah = JENIS_DINDING.find((x) => x.kunci === 'bata-merah-plester')!.knM2
    const ringan = JENIS_DINDING.find((x) => x.kunci === 'bata-ringan-plester')!.knM2
    expect(ringan).toBeLessThan(merah)
  })

  it('kN/m dihitung dari kN/m² × tinggi', () => {
    expect(bebanDindingDari('bata-merah-plester', 3)).toBeCloseTo(2.5 * 3, 6)
  })

  it('tinggi nol atau bukan angka DITOLAK', () => {
    expect(() => bebanDindingDari('bata-merah-plester', 0)).toThrow(/tinggi/i)
    expect(() => bebanDindingDari('bata-merah-plester', NaN)).toThrow(/tinggi/i)
  })

  it('jenis tak dikenal ditolak dengan menyebut pilihannya', () => {
    expect(() => bebanDindingDari('tembok-ajaib', 3)).toThrow(/bata-merah-plester/)
  })
})

describe('terpasang di analisaBebanBalok', () => {
  const DASAR = {
    bentangM: 6, lebarPikulM: 3, bMm: 300, hMm: 500, tebalPelatMm: 120,
  }

  it('fungsi ruang memberi angka SNI, bukan angka ketikan', () => {
    const h = analisaBebanBalok({
      ...DASAR, lapisMati: ['keramik-spesi'], fungsiRuangKunci: 'restoran',
    })
    /* 4,79 kN/m² × 3 m lebar pikul = 14,37 kN/m */
    expect(h.qHidupKnM).toBeCloseTo(4.79 * 3, 6)
  })

  it('fungsi ruang MENANG atas angka yang diketik', () => {
    /*
      Kalau angka bebas bisa menimpa tabel, tabelnya cuma hiasan. Yang dipakai
      harus yang bisa diperiksa orang lain.
    */
    const h = analisaBebanBalok({
      ...DASAR, lapisMati: [], fungsiRuangKunci: 'hunian', bebanHidupKnM2: 99,
    })
    expect(h.qHidupKnM).toBeCloseTo(1.92 * 3, 6)
  })

  it('hasilnya MENYEBUT fungsi ruangnya', () => {
    /*
      Angka 4,79 tanpa keterangan tak bisa diperiksa siapa pun;
      "Restoran (SNI 1727 Tabel 4.3-1)" bisa.
    */
    const h = analisaBebanBalok({
      ...DASAR, lapisMati: [], fungsiRuangKunci: 'restoran',
    })
    expect(h.catatan.join(' ')).toMatch(/Restoran/i)
    expect(h.catatan.join(' ')).toMatch(/1727/)
  })

  it('angka yang DIKETIK ditandai sebagai bukan-dari-tabel', () => {
    const h = analisaBebanBalok({
      ...DASAR, bebanMatiTambahan: [], bebanHidupKnM2: 2.5,
    })
    expect(h.catatan.join(' ')).toMatch(/DIKETIK LANGSUNG/)
  })

  it('katalog dan angka bisa DIGABUNG', () => {
    /*
      Sebagian proyek memakai katalog untuk lapisan baku lalu menambahkan satu
      beban khusus yang tak ada daftarnya. Memaksa memilih salah satu membuat
      kasus itu tak bisa dihitung sama sekali.
    */
    const h = analisaBebanBalok({
      ...DASAR,
      lapisMati: ['keramik-spesi'],
      bebanMatiTambahan: [{ nama: 'Kolam ikan', nilai: 2.0 }],
      fungsiRuangKunci: 'hunian',
    })
    const nama = h.rincianMati.map((x) => x.nama).join(' ')
    expect(nama).toMatch(/Keramik/i)
    expect(nama).toMatch(/Kolam ikan/i)
  })

  it('dinding dari katalog jadi beban GARIS, tak dikali lebar pikul', () => {
    /*
      Mengalikannya dengan lebar pikul melipatgandakan beban dinding sebesar
      lebar pikul — 3× pada kasus ini.
    */
    const tanpa = analisaBebanBalok({ ...DASAR, lapisMati: [], fungsiRuangKunci: 'hunian' })
    const dengan = analisaBebanBalok({
      ...DASAR, lapisMati: [], fungsiRuangKunci: 'hunian',
      jenisDinding: 'bata-merah-plester', tinggiDindingM: 3,
    })
    expect(dengan.qMatiKnM - tanpa.qMatiKnM).toBeCloseTo(7.5, 6)
  })

  it('beban hidup yang HILANG SAMA SEKALI ditolak', () => {
    expect(() => analisaBebanBalok({ ...DASAR, lapisMati: [] } as never))
      .toThrow(/beban hidup/i)
  })

  it('beban mati yang HILANG SAMA SEKALI ditolak', () => {
    expect(() => analisaBebanBalok({ ...DASAR, fungsiRuangKunci: 'hunian' } as never))
      .toThrow(/beban mati/i)
  })
})

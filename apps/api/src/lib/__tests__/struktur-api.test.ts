import { describe, it, expect } from 'vitest'
import {
  analisaKetahananApi, tingkatTercapai,
  AXIS_MIN_MM, DIMENSI_MIN_MM, AXIS_MAKS_WAJAR_MM, TINGKAT_API,
} from '../struktur-api'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KETAHANAN API — beton tidak terbakar, tetapi TULANGANNYA meleleh
 *
 * Salah paham yang paling mahal tentang beton: karena ia tak terbakar, orang
 * menyangka bangunan beton aman dari kebakaran. Yang memikul beban bukan
 * betonnya melainkan tulangan di dalamnya, dan baja kehilangan lebih dari
 * separuh kekuatannya pada 550 °C — suhu yang dicapai kebakaran ruangan biasa
 * dalam sekitar sepuluh menit.
 *
 * Angka acuannya dari Eurocode 2 Bagian 1-2 (yang menjadi acuan SNI 2847
 * untuk hal ini), bukan dari keluaran kode ini sendiri.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Balok 300 mm, selimut & tulangan yang lazim di Indonesia. */
const BALOK = {
  elemen: 'balok' as const,
  tingkatDimintaMenit: 120 as const,
  selimutBersihMm: 40,
  dSengkangMm: 10,
  dUtamaMm: 19,
  dimensiTerkecilMm: 300,
}

describe('AXIS DISTANCE — besaran yang selalu tertukar dengan selimut bersih', () => {
  it('a = selimut + Ø sengkang + ½ Ø utama', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Dua besaran yang selalu tertukar di lapangan:

        selimut bersih   permukaan beton → permukaan SENGKANG
        axis distance    permukaan beton → PUSAT tulangan utama

      Tabel api memakai yang KEDUA, sementara gambar kerja dan pengawasan
      lapangan memakai yang PERTAMA. Memasukkan selimut bersih ke tabel api
      memberi ketahanan yang terlalu optimistis.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaKetahananApi(BALOK)
    expect(h.antara.axisMm).toBeCloseTo(40 + 10 + 9.5, 3)
  })

  it('selisihnya DINYATAKAN — cukup untuk menggeser satu tingkat penuh', () => {
    const h = analisaKetahananApi(BALOK)
    expect(h.catatan.some(
      (c) => /AXIS DISTANCE/.test(c) && /BUKAN selimut bersih/.test(c),
    )).toBe(true)
  })

  it('sengkang NOL sah — pelat & dinding memang tak bersengkang', () => {
    const h = analisaKetahananApi({
      elemen: 'pelat', tingkatDimintaMenit: 60,
      selimutBersihMm: 20, dSengkangMm: 0, dUtamaMm: 10,
      dimensiTerkecilMm: 120,
    })
    expect(h.antara.axisMm).toBeCloseTo(25, 3)
  })
})

describe('tingkat yang TERCAPAI — bukan cuma lulus/gagal', () => {
  it('selimut 40 mm pada balok 300 mm mencapai 90 menit', () => {
    /*
      Angka ini yang membuat modul berguna: yang membaca perlu tahu SEBERAPA
      kurang, bukan cuma bahwa ia kurang. "Tercapai 90, diminta 120" bisa
      ditindak; "tidak memenuhi" tidak.
    */
    const h = analisaKetahananApi(BALOK)
    expect(h.antara.tercapaiMenit).toBe(90)
    expect(h.aman).toBe(false)          // diminta 120
  })

  it('selimut tipis 20 mm runtuh ke 30 menit', () => {
    /*
      20 mm lazim dipakai di rumah tinggal. Hasilnya ketahanan api setengah
      jam — dan setengah jam adalah selisih antara penghuni sempat keluar dan
      tidak.
    */
    const h = analisaKetahananApi({
      ...BALOK, selimutBersihMm: 20, dSengkangMm: 8, dUtamaMm: 16,
      dimensiTerkecilMm: 200,
    })
    expect(h.antara.tercapaiMenit).toBe(30)
  })

  it('tingkat tercapai NAIK saat selimut ditebalkan', () => {
    const tingkat = [20, 30, 40, 55, 70, 85].map(
      (s) => analisaKetahananApi({ ...BALOK, selimutBersihMm: s })
        .antara.tercapaiMenit,
    )
    for (let i = 1; i < tingkat.length; i++) {
      expect(tingkat[i], `selimut naik tetapi tingkat turun di langkah ${i}`)
        .toBeGreaterThanOrEqual(tingkat[i - 1])
    }
  })

  it('tingkat tercapai DIBATASI dimensi, bukan hanya selimut', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Lolos pada percobaan mutasi pertama, dan itu memperlihatkan lubangnya.

      Uji "balok kecil GAGAL meski selimutnya tebal" di bawah memeriksa
      `periksa[]` — dua baris terpisah, dan yang dimensinya memang merah.
      Tetapi `tingkatTercapai()` yang mengabaikan dimensi tetap lolos, karena
      tak ada yang memeriksa ANGKANYA.

      Akibatnya di layar: "Penampang cukup tebal — TIDAK" berdampingan dengan
      "tercapai 240 menit". Dua kalimat yang saling membantah, dan pembacanya
      akan percaya yang lebih menyenangkan.
      ══════════════════════════════════════════════════════════════════════
    */
    /* Selimut sangat tebal, penampang sangat kecil. */
    expect(tingkatTercapai('balok', 90, 100)).toBeLessThanOrEqual(30)

    /* Dimensi 100 mm hanya memenuhi tingkat 30 menit (tabel: 80 mm). */
    expect(tingkatTercapai('balok', 90, 100)).toBe(30)

    /* Naikkan dimensinya saja → tingkatnya ikut naik. */
    expect(tingkatTercapai('balok', 90, 300)).toBeGreaterThan(
      tingkatTercapai('balok', 90, 100),
    )

    /* Dan lewat modulnya, bukan cuma fungsi telanjangnya. */
    const h = analisaKetahananApi({
      ...BALOK, selimutBersihMm: 70, dimensiTerkecilMm: 150,
    })
    expect(h.antara.tercapaiMenit, 'penampang 150 mm tak boleh mencapai 120 menit')
      .toBeLessThan(120)
  })

  it('nol bila di bawah tingkat terendah', () => {
    /*
      Nol berarti TIDAK MENCAPAI 30 menit — bukan "belum dihitung". Catatannya
      menyatakan itu dengan kalimat, bukan angka.
    */
    expect(tingkatTercapai('balok', 10, 300)).toBe(0)
    const h = analisaKetahananApi({
      ...BALOK, selimutBersihMm: 5, dSengkangMm: 0, dUtamaMm: 10,
    })
    expect(h.antara.tercapaiMenit).toBe(0)
    expect(h.catatan.some((c) => /TIDAK MENCAPAI/.test(c))).toBe(true)
    expect(h.catatan.some((c) => /550/.test(c))).toBe(true)
  })

  it('tabelnya MONOTON: tingkat lebih tinggi menuntut selimut lebih tebal', () => {
    /*
      Menahan seseorang menyalin ulang tabelnya dengan satu angka tertukar.
      Tabel yang tak monoton akan memberi hasil yang aneh tanpa gejala.
    */
    for (const elemen of ['balok', 'kolom', 'pelat', 'dinding'] as const) {
      for (let i = 1; i < TINGKAT_API.length; i++) {
        const t = TINGKAT_API[i]
        const sebelum = TINGKAT_API[i - 1]
        expect(AXIS_MIN_MM[elemen][t], `${elemen} axis ${sebelum}→${t}`)
          .toBeGreaterThanOrEqual(AXIS_MIN_MM[elemen][sebelum])
        expect(DIMENSI_MIN_MM[elemen][t], `${elemen} dimensi ${sebelum}→${t}`)
          .toBeGreaterThanOrEqual(DIMENSI_MIN_MM[elemen][sebelum])
      }
    }
  })
})

describe('DIMENSI penampang — selimut tebal tak menolong bila penampangnya kecil', () => {
  it('balok kecil GAGAL meski selimutnya tebal', () => {
    /*
      Panas masuk dari dua sisi dan bertemu di tengah. Balok selebar 150 mm
      tak bisa mencapai 120 menit berapa pun selimutnya — dan itu berlawanan
      dengan dugaan orang, yang menyangka menebalkan selimut selalu menolong.
    */
    const h = analisaKetahananApi({
      ...BALOK, selimutBersihMm: 70, dimensiTerkecilMm: 150,
    })
    const axis = h.periksa.find((p) => p.nama === 'Tulangan terlindungi dari api')!
    const dim = h.periksa.find((p) => p.nama === 'Penampang cukup tebal menahan api')!
    expect(axis.aman).toBe(true)        // selimutnya cukup
    expect(dim.aman).toBe(false)        // penampangnya tidak
    expect(h.aman).toBe(false)
  })

  it('dua pemeriksaan TERPISAH, karena tindakannya berbeda', () => {
    /*
      Selimut kurang → tambah beton decking (murah, saat mengikat tulangan).
      Penampang kurang → perbesar balok (mahal, mengubah gambar & volume).

      Menggabungkannya jadi satu "tidak tahan api" membuat pembacanya tak
      tahu mana yang harus diubah.
    */
    const h = analisaKetahananApi(BALOK)
    const nama = h.periksa.map((p) => p.nama)
    expect(nama).toContain('Tulangan terlindungi dari api')
    expect(nama).toContain('Penampang cukup tebal menahan api')
  })
})

describe('selimut TERLALU TEBAL juga diperiksa', () => {
  it('a di atas ambang wajar ditandai TIDAK aman', () => {
    /*
      Bukan soal api melainkan soal kapasitas: selimut tebal mengurangi
      tinggi efektif, jadi kapasitas lenturnya turun. Betonnya di luar
      tulangan juga lebih mudah terkelupas karena tak ada yang menahannya.
    */
    const h = analisaKetahananApi({
      ...BALOK, selimutBersihMm: 100, dimensiTerkecilMm: 400,
    })
    const p = h.periksa.find((x) => x.nama === 'Selimut tidak berlebihan')!
    expect(p.aman).toBe(false)
    expect(h.antara.axisMm).toBeGreaterThan(AXIS_MAKS_WAJAR_MM)
  })

  it('selimut lazim TIDAK dituduh berlebihan', () => {
    const p = analisaKetahananApi(BALOK).periksa
      .find((x) => x.nama === 'Selimut tidak berlebihan')!
    expect(p.aman).toBe(true)
  })
})

describe('tiap ELEMEN punya tabelnya sendiri', () => {
  it('pelat menuntut selimut jauh lebih tipis daripada balok', () => {
    /*
      Pelat terpapar api dari SATU sisi (bawah), balok dari tiga sisi. Memakai
      tabel balok untuk pelat memberi selimut yang jauh lebih tebal daripada
      perlunya — dan selimut berlebih mengurangi kapasitas lenturnya.
    */
    expect(AXIS_MIN_MM.pelat[120]).toBeLessThan(AXIS_MIN_MM.balok[120])
    expect(DIMENSI_MIN_MM.pelat[120]).toBeLessThan(DIMENSI_MIN_MM.balok[120])
  })

  it('kolom menuntut dimensi paling besar', () => {
    /* Kolom terpapar dari SEMUA sisi, dan kegagalannya meruntuhkan bangunan. */
    expect(DIMENSI_MIN_MM.kolom[120]).toBeGreaterThan(DIMENSI_MIN_MM.balok[120])
  })

  it('elemen tak dikenal ditolak dengan menyebut yang ada', () => {
    expect(() => analisaKetahananApi({
      ...BALOK, elemen: 'tiang' as never,
    })).toThrow(/balok, kolom, pelat, dinding/)
  })
})

describe('yang DITOLAK', () => {
  it('tingkat api di luar tabel ditolak — angkanya dari PERATURAN', () => {
    /*
      45 menit terdengar masuk akal tetapi tak ada di tabel mana pun. Angka
      ini datang dari peraturan bangunan, bukan dari perhitungan struktur,
      dan mengarangnya berarti mengarang persyaratannya.
    */
    expect(() => analisaKetahananApi({
      ...BALOK, tingkatDimintaMenit: 45 as never,
    })).toThrow(/peraturan bangunan/)
  })

  it('dimensi & selimut nol ditolak dengan menyebut medannya', () => {
    expect(() => analisaKetahananApi({ ...BALOK, selimutBersihMm: 0 }))
      .toThrow(/Selimut bersih/)
    expect(() => analisaKetahananApi({ ...BALOK, dUtamaMm: 0 }))
      .toThrow(/tulangan utama/)
    expect(() => analisaKetahananApi({ ...BALOK, dimensiTerkecilMm: 0 }))
      .toThrow(/Dimensi terkecil/)
  })

  it('Ø sengkang negatif ditolak, nol diterima', () => {
    expect(() => analisaKetahananApi({ ...BALOK, dSengkangMm: -5 }))
      .toThrow(/sengkang/)
    expect(() => analisaKetahananApi({ ...BALOK, dSengkangMm: 0 })).not.toThrow()
  })
})

describe('dua lapis: angka untuk insinyur, kalimat untuk yang memutuskan', () => {
  it('tiap pemeriksaan membawa RUMUS yang bisa diperiksa ulang', () => {
    const h = analisaKetahananApi(BALOK)
    for (const p of h.periksa) {
      expect(p.rumus, `${p.nama} tanpa rumus`).toBeTruthy()
      expect(p.rumus!.length).toBeGreaterThan(20)
    }
  })

  it('catatan menyatakan bahwa ini ditentukan SAAT TULANGAN DIIKAT', () => {
    /*
      Ketahanan api tak bisa ditambahkan sesudah bangunan berdiri. Yang
      membaca perlu tahu bahwa ini keputusan lapangan, bukan keputusan yang
      bisa ditunda.
    */
    const h = analisaKetahananApi(BALOK)
    expect(h.catatan.some(
      (c) => /SAAT TULANGAN DIIKAT/.test(c) && /decking/.test(c),
    )).toBe(true)
  })

  it('catatan menyatakan bahwa ini metode TABULASI, bukan analisa kebakaran', () => {
    const h = analisaKetahananApi(BALOK)
    expect(h.catatan.some((c) => /TABULASI/.test(c))).toBe(true)
    expect(h.catatan.some((c) => /rumah sakit|gedung tinggi/.test(c))).toBe(true)
  })

  it('catatan menyatakan apa yang BELUM diperiksa', () => {
    const h = analisaKetahananApi(BALOK)
    expect(h.catatan.some((c) => /BELUM diperiksa/.test(c))).toBe(true)
    expect(h.catatan.some((c) => /spalling/i.test(c))).toBe(true)
  })

  it('tiap rasio BERHINGGA', () => {
    for (const selimut of [5, 20, 40, 100]) {
      for (const t of TINGKAT_API) {
        const h = analisaKetahananApi({
          ...BALOK, selimutBersihMm: selimut, tingkatDimintaMenit: t,
        })
        for (const p of h.periksa) {
          expect(Number.isFinite(p.rasio), `${p.nama} = ${p.rasio}`).toBe(true)
        }
      }
    }
  })
})

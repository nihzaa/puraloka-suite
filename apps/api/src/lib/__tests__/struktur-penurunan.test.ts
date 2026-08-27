import { describe, it, expect } from 'vitest'
import {
  analisaPenurunan, BATAS_DISTORSI, BATAS_PENURUNAN_TOTAL_MM,
  SEBARAN_PERKIRAAN,
} from '../struktur-penurunan'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENURUNAN PONDASI — yang meretakkan bangunan bukan turunnya, melainkan
 * turun TAK SAMA RATA
 *
 * Seluruh pemeriksaan pondasi lain menjawab "apakah tanahnya sanggup memikul
 * tanpa runtuh?". Yang merusak bangunan biasanya bukan itu: bangunan bisa
 * turun sepuluh sentimeter dengan selamat asalkan BERSAMA-SAMA.
 *
 * Angka acuannya dari rentang pustaka geoteknik, bukan dari keluaran kode ini
 * sendiri — golden test yang mencatat keluarannya sendiri hanya membuktikan
 * kode itu tak berubah.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Telapak 2×2 m pada tekanan 150 kPa — kasus rumah tinggal yang lazim. */
const DASAR = {
  lebarM: 2, panjangM: 2, tekananNetoKnM2: 150,
} as const

describe('besaran penurunan MASUK AKAL — bukan angka yang bikin orang berhenti percaya', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    Uji ini ada karena versi pertama modul ini memberi 588 mm untuk lempung
    lunak. Setengah meter bukan penurunan melainkan keruntuhan — dan
    pemeriksaan daya dukung sudah menahannya lebih dulu.

    Dua kesalahan yang berlipat: modulus lempung seperlima nilai pustaka, DAN
    faktor konsolidasi 2,5× ditumpuk di atasnya. Tak satu pun test versi
    pertama menangkapnya, karena semuanya menguji BENTUK (ada `periksa`,
    rasio berhingga) bukan BESARAN.
    ══════════════════════════════════════════════════════════════════════════
  */
  it.each([
    ['pasir', 30, 5, 25],
    ['pasir', 15, 10, 35],
    ['lempung_kaku', 20, 2, 20],
    ['lempung', 8, 20, 80],
  ] as const)('%s N=%i → penurunan %i..%i mm', (jenisTanah, nSpt, min, maks) => {
    const h = analisaPenurunan({ ...DASAR, jenisTanah, nSpt })
    expect(h.antara.totalMm, `${jenisTanah} N=${nSpt} → ${h.antara.totalMm} mm`)
      .toBeGreaterThan(min)
    expect(h.antara.totalMm).toBeLessThan(maks)
  })

  it('modulus tanah berada di rentang PUSTAKA, bukan seperlimanya', () => {
    /*
      Lempung lunak lazimnya 3.000-15.000 kPa; lempung kaku 15.000-75.000.
      Versi pertama memberi 1.500 kPa untuk N=6 — dan dari situlah 588 mm
      lahir.
    */
    const lunak = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung', nSpt: 6 })
    expect(lunak.antara.modulusKnM2).toBeGreaterThanOrEqual(3000)
    expect(lunak.antara.modulusKnM2).toBeLessThanOrEqual(20000)

    const kaku = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung_kaku', nSpt: 20 })
    expect(kaku.antara.modulusKnM2).toBeGreaterThanOrEqual(15000)
    expect(kaku.antara.modulusKnM2).toBeLessThanOrEqual(90000)
  })

  it('tanah yang lebih padat turun lebih sedikit — monoton', () => {
    const turun = [5, 10, 20, 30, 40].map(
      (n) => analisaPenurunan({ ...DASAR, jenisTanah: 'pasir', nSpt: n }).antara.totalMm,
    )
    for (let i = 1; i < turun.length; i++) {
      expect(turun[i], `N naik tetapi penurunan naik di langkah ${i}`)
        .toBeLessThan(turun[i - 1])
    }
  })

  it('LEMPUNG turun lebih banyak daripada PASIR pada N yang sama', () => {
    const pasir = analisaPenurunan({ ...DASAR, jenisTanah: 'pasir', nSpt: 10 })
    const lempung = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung', nSpt: 10 })
    expect(lempung.antara.totalMm).toBeGreaterThan(pasir.antara.totalMm)
  })

  it('pasir TIDAK punya penurunan konsolidasi', () => {
    /*
      Pada pasir, penurunan selesai saat konstruksi selesai — pemiliknya
      bahkan tak menyadarinya. Memberinya konsolidasi berarti menakut-nakuti
      dengan angka yang tak akan terjadi.
    */
    const h = analisaPenurunan({ ...DASAR, jenisTanah: 'pasir', nSpt: 20 })
    expect(h.antara.konsolidasiMm).toBe(0)
    expect(h.antara.totalMm).toBeCloseTo(h.antara.seketikaMm, 6)
  })

  it('pondasi MEMANJANG turun lebih banyak daripada bujur sangkar', () => {
    /*
      Bebannya menyebar ke tanah yang lebih dalam. Ini yang membuat pondasi
      menerus di bawah dinding panjang berperilaku berbeda dari telapak
      kolom, pada tekanan yang persis sama.
    */
    const bujur = analisaPenurunan({ ...DASAR, jenisTanah: 'pasir', nSpt: 20 })
    const panjang = analisaPenurunan({
      ...DASAR, panjangM: 20, jenisTanah: 'pasir', nSpt: 20,
    })
    expect(panjang.antara.totalMm).toBeGreaterThan(bujur.antara.totalMm)
  })
})

describe('DIFERENSIAL — inilah yang meretakkan, bukan penurunan totalnya', () => {
  it('distorsi sudut dihitung dari selisih dibagi jarak', () => {
    const h = analisaPenurunan({
      ...DASAR, jenisTanah: 'pasir', nSpt: 15,
      jarakKolomM: 4, penurunanTetanggaMm: 5,
    })
    const selisih = Math.abs(h.antara.totalMm - 5)
    expect(h.antara.diferensialMm).toBeCloseTo(selisih, 2)
    /*
      Toleransi 5 desimal, bukan 6: modul membulatkan distorsi ke 6 desimal,
      jadi menuntut kecocokan pada desimal ke-6 berarti menuntut lebih teliti
      daripada angka yang dipulangkannya sendiri.
    */
    expect(h.antara.distorsi).toBeCloseTo(selisih / 4000, 5)
  })

  it('DUA ambang terpisah: retak & kerusakan struktural', () => {
    /*
      Akibatnya berbeda JENIS, bukan berbeda derajat. Yang pertama soal
      kenyamanan dan penampilan (dinding retak, pintu macet); yang kedua soal
      keselamatan. Menggabungkannya jadi satu ambang membuat pembacanya tak
      tahu mana yang sedang dilanggar.
    */
    const h = analisaPenurunan({
      ...DASAR, jenisTanah: 'lempung', nSpt: 8, jarakKolomM: 4,
    })
    const nama = h.periksa.map((p) => p.nama)
    expect(nama).toContain('Lantai tidak miring berlebihan')
    expect(nama).toContain('Struktur tidak rusak oleh penurunan')

    /* Ambang struktural JAUH lebih longgar. */
    expect(BATAS_DISTORSI.kerusakanStruktural)
      .toBeGreaterThan(BATAS_DISTORSI.retakJelas)
    expect(BATAS_DISTORSI.retakJelas)
      .toBeGreaterThan(BATAS_DISTORSI.retakDindingRingan)
  })

  it('turun BANYAK tapi SERAGAM tetap aman — dan itu intinya', () => {
    /*
      Menara Pisa turun tiga meter dan masih berdiri. Yang meretakkan adalah
      SELISIHNYA. Uji ini yang membedakan modul ini dari sekadar "berapa
      sentimeter turunnya".
    */
    const h = analisaPenurunan({
      lebarM: 3, panjangM: 3, tekananNetoKnM2: 200,
      jenisTanah: 'lempung', nSpt: 10,
      jarakKolomM: 6,
      /* Tetangga turun HAMPIR SAMA — selisihnya kecil. */
      penurunanTetanggaMm: 0,
    })
    const distorsiPeriksa = h.periksa.find(
      (p) => p.nama === 'Lantai tidak miring berlebihan',
    )!
    /* Set tetangga = penurunan yang sama persis → distorsi nol. */
    const seragam = analisaPenurunan({
      lebarM: 3, panjangM: 3, tekananNetoKnM2: 200,
      jenisTanah: 'lempung', nSpt: 10, jarakKolomM: 6,
      penurunanTetanggaMm: h.antara.totalMm,
    })
    expect(seragam.antara.distorsi).toBeCloseTo(0, 6)
    expect(seragam.periksa.find(
      (p) => p.nama === 'Lantai tidak miring berlebihan',
    )!.aman).toBe(true)

    /* Sementara yang selisihnya besar TIDAK aman. */
    expect(distorsiPeriksa.nilai).toBeGreaterThan(0)
  })

  it('tanpa jarak kolom, distorsi TIDAK dikarang — dan ketiadaannya dinyatakan', () => {
    const h = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung', nSpt: 8 })
    expect(h.periksa.some((p) => /miring/.test(p.nama))).toBe(false)
    expect(h.catatan.some((c) => /DIFERENSIAL tidak diperiksa/.test(c))).toBe(true)
  })

  it('anggapan Bjerrum 50% DINYATAKAN, bukan disembunyikan', () => {
    /*
      Kalau penurunan tetangga tak diisi, modul memakai anggapan. Anggapan
      yang tak dinyatakan adalah angka karangan yang terlihat seperti hasil
      hitungan.
    */
    const h = analisaPenurunan({
      ...DASAR, jenisTanah: 'pasir', nSpt: 15, jarakKolomM: 4,
    })
    expect(h.antara.diferensialMm).toBeCloseTo(h.antara.totalMm * 0.5, 2)
    expect(h.catatan.some((c) => /50%/.test(c) && /Bjerrum/i.test(c))).toBe(true)
  })
})

describe('batas TOTAL — raft lebih longgar daripada telapak', () => {
  it('raft memakai ambang yang lebih besar', () => {
    /* Raft menyebar beban; penurunannya lebih seragam, jadi boleh lebih besar. */
    expect(BATAS_PENURUNAN_TOTAL_MM.raft)
      .toBeGreaterThan(BATAS_PENURUNAN_TOTAL_MM.pondasi_dangkal)

    const telapak = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung', nSpt: 9 })
    const raft = analisaPenurunan({
      ...DASAR, jenisTanah: 'lempung', nSpt: 9, raft: true,
    })
    const pT = telapak.periksa.find((p) => p.nama === 'Penurunan total')!
    const pR = raft.periksa.find((p) => p.nama === 'Penurunan total')!
    expect(pR.syarat).toBeGreaterThan(pT.syarat as number)
  })
})

describe('yang DITOLAK dan yang DINYATAKAN', () => {
  it('lebar > panjang ditolak — lebar adalah sisi PENDEK', () => {
    expect(() => analisaPenurunan({
      lebarM: 5, panjangM: 2, tekananNetoKnM2: 150,
      jenisTanah: 'pasir', nSpt: 20,
    })).toThrow(/sisi PENDEK|Tukar/)
  })

  it('N-SPT di luar batas wajar ditolak, bukan dihitung', () => {
    /*
      N > 60 berarti batuan atau lapisan sangat padat, dan korelasi di sini
      tak berlaku. Penurunannya memang dapat diabaikan — tetapi jangan
      diangkakan dari rumus yang tak berlaku.
    */
    expect(() => analisaPenurunan({
      ...DASAR, jenisTanah: 'pasir', nSpt: 80,
    })).toThrow(/batas wajar/)
  })

  it('dimensi & tekanan nol ditolak dengan menyebut medannya', () => {
    expect(() => analisaPenurunan({ ...DASAR, lebarM: 0, jenisTanah: 'pasir', nSpt: 20 }))
      .toThrow(/Lebar pondasi/)
    expect(() => analisaPenurunan({ ...DASAR, tekananNetoKnM2: 0, jenisTanah: 'pasir', nSpt: 20 }))
      .toThrow(/Tekanan neto/)
    expect(() => analisaPenurunan({ ...DASAR, jenisTanah: 'pasir', nSpt: 0 }))
      .toThrow(/N-SPT/)
  })

  it('SEBARAN perkiraan dinyatakan sebagai rentang, bukan satu angka pasti', () => {
    /*
      Korelasi N-SPT punya sebaran lebar. Menyajikan satu angka membuat
      pembacanya menyangka ketelitiannya jauh lebih tinggi daripada yang ada.
    */
    const h = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung', nSpt: 10 })
    expect(h.antara.perkiraanAtasMm)
      .toBeCloseTo(h.antara.totalMm * SEBARAN_PERKIRAAN, 2)
    expect(h.catatan.some((c) => /–/.test(c) && /mm/.test(c))).toBe(true)
  })

  it('catatan menyatakan bahwa qa menahan KERUNTUHAN, bukan penurunan', () => {
    /*
      Inilah salah paham yang membuat batas ini lama terbuka: orang menyangka
      pondasi yang lulus daya dukung otomatis aman terhadap penurunan.
    */
    const h = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung', nSpt: 10 })
    expect(h.catatan.some((c) => /KERUNTUHAN/.test(c) && /qa/i.test(c))).toBe(true)
  })

  it('catatan menyatakan apa yang BELUM diperiksa', () => {
    const h = analisaPenurunan({ ...DASAR, jenisTanah: 'lempung', nSpt: 10 })
    expect(h.catatan.some((c) => /BELUM diperiksa/.test(c))).toBe(true)
  })
})

describe('dua lapis: angka untuk insinyur, kalimat untuk yang memutuskan', () => {
  it('tiap pemeriksaan membawa RUMUS yang bisa diperiksa ulang', () => {
    const h = analisaPenurunan({
      ...DASAR, jenisTanah: 'lempung', nSpt: 10, jarakKolomM: 4,
    })
    for (const p of h.periksa) {
      expect(p.rumus, `${p.nama} tanpa rumus`).toBeTruthy()
      expect(p.rumus!.length).toBeGreaterThan(20)
    }
  })

  it('distorsi juga disajikan sebagai 1/N — bentuk yang dipakai pustaka', () => {
    const h = analisaPenurunan({
      ...DASAR, jenisTanah: 'lempung', nSpt: 8, jarakKolomM: 4,
    })
    expect(h.antara.distorsiSatuPer).toBeGreaterThan(0)
    expect(h.antara.distorsiSatuPer)
      .toBeCloseTo(Math.round(1 / h.antara.distorsi), 0)
  })

  it('tiap rasio BERHINGGA — Infinity/NaN tak boleh sampai ke batang persen', () => {
    for (const nSpt of [4, 10, 25, 50]) {
      for (const jenisTanah of ['pasir', 'lempung', 'lempung_kaku'] as const) {
        const h = analisaPenurunan({ ...DASAR, jenisTanah, nSpt, jarakKolomM: 4 })
        for (const p of h.periksa) {
          expect(Number.isFinite(p.rasio), `${jenisTanah} ${p.nama} = ${p.rasio}`)
            .toBe(true)
        }
      }
    }
  })
})

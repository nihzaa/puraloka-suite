import { describe, it, expect } from 'vitest'
import {
  analisaGempaDinding, FAKTOR_KH_DARI_PGA, TINGGI_TANGKAP_GEMPA,
  SF_GULING_GEMPA_MIN,
} from '../struktur-dinding'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MONONOBE-OKABE — dinding yang aman saat diam bisa runtuh saat bergoyang
 *
 * Batas yang paling lama terbuka di modul dinding penahan, dan yang paling
 * berbahaya dibiarkan: Indonesia rawan gempa, dan dinding penahan yang roboh
 * tidak retak dulu — ia menimbun apa pun di bawahnya sekaligus.
 *
 * Angka acuannya dari pustaka Mononobe-Okabe yang lazim dikutip, bukan dari
 * hasil kode ini sendiri. Golden test yang mencatat keluaran kodenya sendiri
 * hanya membuktikan kode itu tak berubah — bukan bahwa ia benar.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const DASAR = {
  tinggiM: 4, gammaTanahKnM3: 18, phiDerajat: 35,
}

describe('Kae — dicocokkan ke nilai PUSTAKA, bukan ke keluaran sendiri', () => {
  /*
    φ=35°, β=0, δ=0, dinding tegak. Nilai yang lazim dikutip di pustaka
    geoteknik. Toleransi 0,006 — pustaka membulatkan ke tiga desimal dan
    sebagian mengabaikan kv, jadi menuntut kecocokan sempurna akan menolak
    rumus yang benar.
  */
  it.each([
    [0, 0.271],
    [0.1, 0.322],
    [0.2, 0.383],
    [0.3, 0.462],
  ])('kh=%s → Kae ≈ %s', (kh, harap) => {
    const h = analisaGempaDinding({ ...DASAR, pgaG: kh / FAKTOR_KH_DARI_PGA })
    expect(Math.abs(h.antara.kae - harap), `Kae=${h.antara.kae}`)
      .toBeLessThan(0.006)
  })

  it('kh = SETENGAH PGA — dipaku pada angka, bukan diturunkan dari konstantanya', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Uji Kae di atas menghitung `pgaG` dari `FAKTOR_KH_DARI_PGA`, jadi
      mengubah konstanta itu MENGGESER uji dan kode bersamaan — ujinya tetap
      hijau. Ketahuan lewat mutasi: `0.5 → 1.0` lolos.

      Angkanya karena itu dipaku di sini. 0,5 bukan pilihan gaya: percepatan
      puncak hanya terjadi sesaat sementara dinding merespons percepatan
      RATA-RATA selama guncangan (AASHTO, diikuti SNI 8460). Memakai PGA
      penuh menggandakan tambahan dorongan dan memberi dinding yang jauh
      lebih mahal tanpa menambah keselamatan yang sepadan.
      ══════════════════════════════════════════════════════════════════════
    */
    expect(FAKTOR_KH_DARI_PGA).toBe(0.5)

    /* Dan akibatnya benar-benar terpakai: PGA 0,4 g harus memberi kh 0,2. */
    const h = analisaGempaDinding({ ...DASAR, pgaG: 0.4 })
    expect(h.antara.kh).toBeCloseTo(0.2, 6)
    expect(h.catatan.some((c) => /0\.5 × PGA|0,5 × PGA/.test(c))).toBe(true)
  })

  it('kh = 0 memulangkan Kae PERSIS sama dengan Ka statis', () => {
    /*
      Uji kewarasan terkuat di berkas ini: tanpa gempa, Mononobe-Okabe HARUS
      runtuh menjadi Rankine. Kalau tidak, rumusnya salah tulis — dan
      kesalahan itu tak akan terlihat dari angka mana pun yang "kelihatan
      masuk akal".
    */
    const h = analisaGempaDinding({ ...DASAR, pgaG: 0 })
    expect(h.antara.kae).toBeCloseTo(h.antara.ka, 6)
    expect(h.antara.kenaikanPersen).toBeCloseTo(0, 3)
  })

  it('Kae naik MONOTON terhadap percepatan', () => {
    const kae = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(
      (pga) => analisaGempaDinding({ ...DASAR, pgaG: pga }).antara.kae,
    )
    for (let i = 1; i < kae.length; i++) {
      expect(kae[i], `pga naik tetapi Kae turun di langkah ${i}`)
        .toBeGreaterThan(kae[i - 1])
    }
  })

  it('tanah yang lebih kuat memberi dorongan yang lebih kecil', () => {
    const lemah = analisaGempaDinding({ ...DASAR, phiDerajat: 25, pgaG: 0.3 })
    const kuat = analisaGempaDinding({ ...DASAR, phiDerajat: 40, pgaG: 0.3 })
    expect(kuat.antara.kae).toBeLessThan(lemah.antara.kae)
  })
})

describe('kenaikan dorongan — besarnya yang membuat batas ini perlu ditutup', () => {
  it('pada PGA 0,3 g dorongan naik puluhan persen', () => {
    /*
      0,3 g lazim di Jawa & Sumatera. Kalau kenaikannya kecil, batas ini tak
      perlu ditutup sama sekali — uji ini yang membenarkan keberadaannya.
    */
    const h = analisaGempaDinding({ ...DASAR, pgaG: 0.3 })
    expect(h.antara.kenaikanPersen).toBeGreaterThan(20)
    expect(h.antara.tambahanKnPerM).toBeGreaterThan(0)
  })

  it('tambahan gempa = Pae − Pa statis, tak pernah negatif', () => {
    for (const pga of [0, 0.05, 0.2, 0.5]) {
      const h = analisaGempaDinding({ ...DASAR, pgaG: pga })
      expect(h.antara.tambahanKnPerM).toBeGreaterThanOrEqual(0)
      expect(h.antara.paeKnPerM).toBeGreaterThanOrEqual(h.antara.paStatisKnPerM - 1e-6)
    }
  })
})

describe('SF guling saat gempa — lengan yang lebih panjang, bukan hanya gaya', () => {
  it('titik tangkap 0,6H dipakai, bukan H/3', () => {
    /*
      Inilah yang membuat gempa memperburuk guling LEBIH PARAH daripada
      kenaikan gayanya sendiri: gayanya lebih besar DAN lengannya lebih
      panjang. Menghitungnya di H/3 seperti tekanan statis akan memberi SF
      yang terlalu optimistis.
    */
    const h = analisaGempaDinding({
      ...DASAR, pgaG: 0.3,
      momenGulingStatisKnm: 40, momenPenahanKnm: 120,
    })
    const p = h.periksa.find((x) => x.nama === 'Tidak terguling saat gempa')!
    const momenTambahan = h.antara.tambahanKnPerM * (TINGGI_TANGKAP_GEMPA * DASAR.tinggiM)
    expect(p.nilai).toBeCloseTo(120 / (40 + momenTambahan), 3)
    expect(p.rumus).toContain('0.6H')
  })

  it('dinding bertelapak PENDEK gagal saat gempa meski lulus statis', () => {
    /*
      Kasus yang membuat modul ini ada. Momen penahan 55 kNm cukup untuk
      guling statis 40 kNm (SF 1,38 — di bawah 1,5 tetapi masih berdiri),
      dan langsung kurang begitu tambahan gempa masuk.
    */
    const h = analisaGempaDinding({
      ...DASAR, pgaG: 0.3,
      momenGulingStatisKnm: 40, momenPenahanKnm: 55,
    })
    const p = h.periksa.find((x) => x.nama === 'Tidak terguling saat gempa')!
    expect(p.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('ambang gempa LEBIH RENDAH daripada statis — dan itu disengaja', () => {
    /*
      Gempa adalah beban SESAAT. Menuntut 1,5 saat gempa akan membuat tiap
      dinding taman setebal dinding bendungan.
    */
    expect(SF_GULING_GEMPA_MIN).toBeLessThan(1.5)
    expect(SF_GULING_GEMPA_MIN).toBeGreaterThanOrEqual(1.1)
  })

  it('tanpa momen statis, pemeriksaan guling TIDAK dikarang', () => {
    /*
      Memberi SF tanpa tahu momen penahannya berarti mengarang. Yang benar:
      tak memulangkan pemeriksaan itu sama sekali.
    */
    const h = analisaGempaDinding({ ...DASAR, pgaG: 0.3 })
    expect(h.periksa.some((x) => x.nama === 'Tidak terguling saat gempa')).toBe(false)

    /*
      Dan `periksa` memang KOSONG di keadaan ini — bukan diisi angka
      informasi supaya "terlihat ada isinya".

      Versi pertama menaruh "Kenaikan dorongan" di sini dengan `aman: true`
      dan rasio yang memperlihatkan besarnya. Di layar hasilnya batang HIJAU
      bertuliskan "128%", dan bagi pembaca non-teknis angka di atas 100% pada
      batang kekuatan berarti satu hal: melewati batas. Hijau dan 128%
      bersamaan hanya membingungkan — dan yang membingungkan akan diabaikan,
      termasuk saat ia sungguhan merah.

      Angkanya tetap ada, di `catatan` (untuk yang membaca) dan `antara`
      (untuk yang menghitung ulang).
    */
    expect(h.periksa).toHaveLength(0)
    expect(h.antara.kenaikanPersen).toBeGreaterThan(0)
    expect(h.catatan.some((c) => /Dorongan tanah saat gempa/.test(c))).toBe(true)
  })
})

describe('yang DITOLAK — dan ditolak lebih baik daripada angka yang salah', () => {
  it('dinding TERKUNCI (basement) ditolak, bukan diberi angka terlalu kecil', () => {
    /*
      Mononobe-Okabe mengandaikan tanah boleh mengembang sedikit. Dinding
      basement yang terkunci pelat lantai tak memberi ruang itu, dan
      tekanannya mendekati keadaan DIAM yang jauh lebih besar.

      Memberi angka aktif di sana = memberi angka yang terlalu kecil untuk
      elemen yang kegagalannya menimbun orang.
    */
    expect(() => analisaGempaDinding({
      ...DASAR, pgaG: 0.3, bolehBergeser: false,
    })).toThrow(/terkunci|at-rest|DIAM/i)
  })

  it('percepatan yang MELONGSORKAN tanahnya sendiri ditolak', () => {
    /*
      Akar rumusnya menjadi negatif bila θ > (φ − β). Artinya bukan "rumus
      gagal" melainkan tanahnya sendiri sudah longsor — dinding setebal apa
      pun tak menolong. Dipaksa hitung, hasilnya NaN yang lolos ke layar.
    */
    expect(() => analisaGempaDinding({
      ...DASAR, phiDerajat: 20, pgaG: 0.9,
    })).toThrow(/longsor/i)
  })

  it('lereng lebih curam daripada sudut geser tanahnya ditolak', () => {
    expect(() => analisaGempaDinding({
      ...DASAR, pgaG: 0.2, kemiringanTanahDerajat: 40,
    })).toThrow(/kemiringan tanah/i)
  })

  it('PGA hilang atau negatif ditolak dengan menyebut medannya', () => {
    for (const rusak of [
      { ...DASAR, pgaG: -0.1 },
      { ...DASAR } as never,
    ]) {
      expect(() => analisaGempaDinding(rusak as never)).toThrow(/pgaG/)
    }
  })

  it('dimensi mustahil ditolak', () => {
    expect(() => analisaGempaDinding({ ...DASAR, tinggiM: 0, pgaG: 0.3 }))
      .toThrow(/Tinggi dinding/)
    expect(() => analisaGempaDinding({ ...DASAR, phiDerajat: 95, pgaG: 0.3 }))
      .toThrow(/< 90/)
  })
})

describe('dua lapis: angka untuk insinyur, kalimat untuk yang memutuskan', () => {
  it('tiap pemeriksaan membawa RUMUS yang bisa diperiksa ulang', () => {
    const h = analisaGempaDinding({
      ...DASAR, pgaG: 0.3, momenGulingStatisKnm: 40, momenPenahanKnm: 120,
    })
    for (const p of h.periksa) {
      expect(p.rumus, `${p.nama} tanpa rumus`).toBeTruthy()
      expect(p.rumus!.length).toBeGreaterThan(20)
    }
  })

  it('catatan menyebut BESARNYA kenaikan dalam persen, bukan hanya koefisien', () => {
    /*
      "Kae 0,462" tak bisa ditindak oleh yang memutuskan membangun.
      "Dorongan naik 55%" bisa.
    */
    const h = analisaGempaDinding({ ...DASAR, pgaG: 0.3 })
    expect(h.catatan.some((c) => /%/.test(c) && /naik/i.test(c))).toBe(true)
  })

  it('catatan menyatakan apa yang BELUM diperiksa', () => {
    const h = analisaGempaDinding({ ...DASAR, pgaG: 0.3 })
    expect(h.catatan.some((c) => /BELUM diperiksa/.test(c))).toBe(true)
  })

  it('tiap rasio BERHINGGA — Infinity/NaN tak boleh sampai ke batang persen', () => {
    for (const pga of [0, 0.1, 0.3, 0.5]) {
      const h = analisaGempaDinding({
        ...DASAR, pgaG: pga, momenGulingStatisKnm: 40, momenPenahanKnm: 120,
      })
      for (const p of h.periksa) {
        expect(Number.isFinite(p.rasio), `${p.nama} rasio=${p.rasio}`).toBe(true)
      }
    }
  })
})

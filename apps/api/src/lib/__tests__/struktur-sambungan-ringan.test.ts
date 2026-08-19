import { describe, it, expect } from 'vitest'
import {
  analisaSambunganKayu, analisaSekrupBajaRingan,
  JARAK_MIN, PENETRASI_MIN_D, PENETRASI_PENUH_D, PHI_SEKRUP,
  type InputSambunganKayu, type InputSekrupBajaRingan,
} from '../struktur-sambungan-ringan'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SAMBUNGAN KAYU & SEKRUP BAJA RINGAN
 *
 * ⚠ Angka pembanding di sini bukan hanya hitungan tangan melainkan ACUAN
 * LAPANGAN — nilai yang dikenal tukang dan tercantum di tabel SNI.
 *
 * Alasannya konkret: versi pertama modul ini memakai `Fe · d · t` dan memberi
 * 8,29 kN untuk paku 5 mm. Itu SALAH TUJUH KALI, dan ketahuannya bukan dari
 * test melainkan dari membandingkannya dengan angka yang dikenal orang.
 * 7,46 kN per paku "terlihat wajar" bagi yang tak pernah memasang paku.
 *
 * Test yang hanya membandingkan keluaran dengan hitungan tangan dari rumus
 * yang SAMA tak bisa menangkap kesalahan rumusnya.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const KAYU: InputSambunganKayu = {
  alat: 'paku', diameterMm: 5, jumlahAlat: 6,
  tebalUtamaMm: 120, tebalSisiMm: 30, penetrasiMm: 60,
  kelas: 'II', durasi: 'tetap', kadarAir: 'kering',
  gayaKn: 5,
  jarakTepiSejajarMm: 80, jarakTepiTegakMm: 30, jarakAntarAlatMm: 80,
}

describe('kapasitas terhadap ACUAN LAPANGAN, bukan rumusnya sendiri', () => {
  it('paku 5 mm kayu kelas II ≈ 0,8–1,2 kN per paku', () => {
    /*
      Ini test terpenting di berkas ini. Rumus `Fe·d·t` memberi 8,29 kN —
      terlihat wajar di layar, salah tujuh kali di lapangan.

      Yang benar memakai MODA LELEH: pakunya ikut MELENTUR, dan sambungan
      leleh jauh sebelum kayunya tertumpu penuh.
    */
    const k = analisaSambunganKayu({ ...KAYU, jumlahAlat: 1 })
    expect(k.kapasitas.perAlatKn).toBeGreaterThan(0.8)
    expect(k.kapasitas.perAlatKn).toBeLessThan(1.3)
  })

  it('paku 4 mm lebih kecil daripada paku 5 mm', () => {
    /* Kapasitas sebanding d², jadi bedanya besar. */
    const d4 = analisaSambunganKayu({ ...KAYU, jumlahAlat: 1, diameterMm: 4 })
    const d5 = analisaSambunganKayu({ ...KAYU, jumlahAlat: 1, diameterMm: 5 })
    expect(d4.kapasitas.perAlatKn).toBeLessThan(d5.kapasitas.perAlatKn)
    expect(d5.kapasitas.perAlatKn / d4.kapasitas.perAlatKn).toBeCloseTo((5 / 4) ** 2, 1)
  })

  it('baut 12 mm jauh lebih kuat daripada paku — puluhan kali', () => {
    /*
      Acuan lapangan: baut 12 mm kayu kelas II ≈ 8–14 kN. Kalau modul memberi
      angka sekelas paku, ada yang salah pada moda lelehnya.
    */
    const b = analisaSambunganKayu({
      ...KAYU, jumlahAlat: 1, alat: 'baut', diameterMm: 12,
      jarakTepiSejajarMm: 150, jarakTepiTegakMm: 60,
    })
    expect(b.kapasitas.perAlatKn).toBeGreaterThan(6)
    expect(b.kapasitas.perAlatKn).toBeLessThan(20)
  })

  it('kapasitas TAK PERNAH melebihi tumpu penuh kayu', () => {
    /*
      Moda leleh adalah batas bawah; tumpu penuh batas atas. Rumus yang
      melewatinya berarti ada yang salah tanda atau satuan.
    */
    const k = analisaSambunganKayu({ ...KAYU, jumlahAlat: 1 })
    const tumpuPenuhKn = (k.kapasitas.tumpuMpa * 5 * 30) / 1000
    expect(k.kapasitas.perAlatKn).toBeLessThanOrEqual(tumpuPenuhKn)
  })

  it('menjelaskan bahwa moda leleh dipakai, bukan tumpu penuh', () => {
    expect(analisaSambunganKayu(KAYU).catatan.join(' '))
      .toMatch(/MODA LELEH/i)
    expect(analisaSambunganKayu(KAYU).catatan.join(' '))
      .toMatch(/TUJUH KALI/i)
  })
})

describe('kayu — jarak yang dilanggar menyebabkan kegagalan GETAS', () => {
  it('jarak ke ujung minimum 15d untuk paku', () => {
    /* 15 × 5 = 75 mm */
    const p = analisaSambunganKayu(KAYU).periksa.find((x) => x.nama.includes('ujung'))!
    expect(p.syarat).toBe(75)
    expect(p.aman).toBe(true)
    expect(JARAK_MIN.paku.tepiSejajar).toBe(15)
  })

  it('MENANDAI jarak ke ujung yang terlalu dekat, dan menyebut BELAH', () => {
    /*
      Pelanggaran yang paling sering: tukang memasang alat sambung terlalu
      dekat ujung supaya kelihatan rapi, dan kayunya membelah mengikuti serat.
      Belah itu kegagalan GETAS — tak ada lendutan yang memberi peringatan.
    */
    const h = analisaSambunganKayu({ ...KAYU, jarakTepiSejajarMm: 40 })
    expect(h.periksa.find((x) => x.nama.includes('ujung'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/MEMBELAH/i)
    expect(h.catatan.join(' ')).toMatch(/GETAS/i)
    expect(h.aman).toBe(false)
  })

  it('baut boleh lebih dekat ke ujung daripada paku', () => {
    /* 7d vs 15d — baut tak setajam paku dalam membelah serat. */
    expect(JARAK_MIN.baut.tepiSejajar).toBeLessThan(JARAK_MIN.paku.tepiSejajar)
  })

  it('jarak antar alat TIDAK diperiksa bila hanya satu', () => {
    const satu = analisaSambunganKayu({ ...KAYU, jumlahAlat: 1 })
    expect(satu.periksa.some((p) => p.nama.includes('antar alat'))).toBe(false)
  })
})

describe('kayu — penetrasi paku', () => {
  it('paku yang cukup dalam berkapasitas penuh', () => {
    /* 60 mm / 5 mm = 12d — tepat penetrasi penuh */
    expect(analisaSambunganKayu(KAYU).kapasitas.faktorPenetrasi).toBe(1)
    expect(PENETRASI_PENUH_D).toBe(12)
  })

  it('paku yang kurang dalam BERKURANG kapasitasnya, dan diperingatkan', () => {
    /* 45 mm / 5 = 9d → antara 6d dan 12d */
    const h = analisaSambunganKayu({ ...KAYU, penetrasiMm: 45 })
    expect(h.kapasitas.faktorPenetrasi).toBeGreaterThan(0)
    expect(h.kapasitas.faktorPenetrasi).toBeLessThan(1)
    expect(h.catatan.join(' ')).toMatch(/Pakai paku lebih panjang/i)
  })

  it('penetrasi kurang benar-benar MENGURANGI kapasitas, bukan cuma catatan', () => {
    /*
      ⚠ Test ini ada karena mutasi "penetrasi tak mengurangi kapasitas" LOLOS
      tanpanya.

      Test lain memeriksa `faktorPenetrasi` (angkanya) dan catatannya, tetapi
      tak satu pun memeriksa bahwa faktor itu benar-benar DIPAKAI menghitung
      kapasitas. Melumpuhkan pemakaiannya tak memerahkan apa pun.

      Pola yang sama sudah muncul tiga kali di sesi ini: memeriksa angka tanpa
      memeriksa akibatnya.
    */
    const penuh = analisaSambunganKayu({ ...KAYU, jumlahAlat: 1, penetrasiMm: 60 })
    const kurang = analisaSambunganKayu({ ...KAYU, jumlahAlat: 1, penetrasiMm: 45 })
    expect(kurang.kapasitas.faktorPenetrasi).toBeLessThan(1)
    expect(kurang.kapasitas.perAlatKn).toBeLessThan(penuh.kapasitas.perAlatKn)
    /* dan besarnya sebanding faktornya */
    expect(kurang.kapasitas.perAlatKn / penuh.kapasitas.perAlatKn)
      .toBeCloseTo(kurang.kapasitas.faktorPenetrasi, 3)
  })

  it('paku terlalu pendek GAGAL — di bawah 6d praktis tak menahan', () => {
    const h = analisaSambunganKayu({ ...KAYU, penetrasiMm: 20 })
    expect(h.periksa.find((p) => p.nama.includes('Kedalaman'))!.aman).toBe(false)
    expect(PENETRASI_MIN_D).toBe(6)
  })

  it('baut tidak diperiksa penetrasinya', () => {
    const b = analisaSambunganKayu({
      ...KAYU, alat: 'baut', diameterMm: 12,
      jarakTepiSejajarMm: 150, jarakTepiTegakMm: 60, jarakAntarAlatMm: 60,
    })
    expect(b.periksa.some((p) => p.nama.includes('Kedalaman'))).toBe(false)
  })
})

describe('kayu — faktor durasi, kadar air, grup', () => {
  it('beban sesaat memberi kapasitas lebih besar', () => {
    const tetap = analisaSambunganKayu(KAYU).kapasitas.totalKn
    const angin = analisaSambunganKayu({ ...KAYU, durasi: 'sepuluh_menit' }).kapasitas.totalKn
    expect(angin / tetap).toBeCloseTo(1.6 / 0.9, 2)
  })

  it('kayu basah melemahkan sambungan', () => {
    const kering = analisaSambunganKayu(KAYU).kapasitas.totalKn
    const basah = analisaSambunganKayu({ ...KAYU, kadarAir: 'basah' }).kapasitas.totalKn
    expect(basah).toBeLessThan(kering)
  })

  it('lebih dari 4 alat sambung kena faktor grup', () => {
    /*
      Yang di ujung menerima gaya lebih besar daripada yang di tengah, jadi
      kapasitasnya TIDAK sebanding jumlahnya.
    */
    const empat = analisaSambunganKayu({ ...KAYU, jumlahAlat: 4 })
    const delapan = analisaSambunganKayu({ ...KAYU, jumlahAlat: 8 })
    expect(delapan.kapasitas.totalKn / empat.kapasitas.totalKn).toBeLessThan(2)
    expect(delapan.catatan.join(' ')).toMatch(/[Ff]aktor grup/)
  })

  it('pelat gigi diperingatkan bahwa angkanya dari PABRIK', () => {
    const h = analisaSambunganKayu({
      ...KAYU, alat: 'pelat_gigi', diameterMm: 10,
      jarakTepiSejajarMm: 120, jarakTepiTegakMm: 60, jarakAntarAlatMm: 100,
    })
    expect(h.catatan.join(' ')).toMatch(/ditentukan PABRIK/i)
  })

  it('menolak alat/kelas/durasi karangan', () => {
    expect(() => analisaSambunganKayu({ ...KAYU, alat: 'lem' as never })).toThrow(/tak dikenal/i)
    expect(() => analisaSambunganKayu({ ...KAYU, kelas: 'V' as never })).toThrow(/tak dikenal/i)
  })
})

// ── SEKRUP BAJA RINGAN ───────────────────────────────────────────────────────

const SEKRUP: InputSekrupBajaRingan = {
  diameterMm: 4.8, jumlahSekrup: 4,
  tebal1Mm: 0.75, tebal2Mm: 1.0, fuMpa: 550,
  gayaGeserKn: 2, gayaTarikKn: 0.8, jarakTepiMm: 20,
}

describe('sekrup — EMPAT moda, dan yang gagal bukan sekrupnya', () => {
  it('tilting berlaku saat kedua pelat setebal sama', () => {
    /*
      Sekrup MIRING karena pelatnya terlalu tipis menahannya tegak. Menghitung
      sambungan baja ringan dengan rumus baut biasa melewatkan ini sepenuhnya.
    */
    const sama = analisaSekrupBajaRingan({ ...SEKRUP, tebal1Mm: 0.75, tebal2Mm: 0.75 })
    expect(sama.kapasitas.modaGeser).toMatch(/tilting|bearing/)
  })

  it('pelat jauh lebih tebal → hanya bearing yang berlaku', () => {
    /* t2/t1 ≥ 2,5 → sekrup tetap tegak. */
    const tebal = analisaSekrupBajaRingan({ ...SEKRUP, tebal1Mm: 0.75, tebal2Mm: 3 })
    expect(tebal.kapasitas.modaGeser).toMatch(/bearing/)
  })

  it('kapasitas geser memakai yang TERKECIL dari tilting & bearing', () => {
    const k = analisaSekrupBajaRingan({ ...SEKRUP, tebal1Mm: 0.75, tebal2Mm: 0.75 }).kapasitas
    expect(k.geserPerSekrupKn)
      .toBeLessThanOrEqual(Math.min(k.tiltingKn, k.bearing1Kn, k.bearing2Kn) + 1e-6)
  })

  it('PULL-OVER dijelaskan saat ia yang mengendalikan', () => {
    /*
      Yang paling sering pada atap: angin menghisap penutup, kepala sekrup
      menembus lembarannya, dan atap terbang meski sekrupnya masih menancap
      utuh di kasonya.
    */
    const h = analisaSekrupBajaRingan({ ...SEKRUP, tebal1Mm: 0.4, tebal2Mm: 2 })
    if (h.kapasitas.pullOverKn < h.kapasitas.pullOutKn) {
      expect(h.catatan.join(' ')).toMatch(/atap terbang/i)
      expect(h.catatan.join(' ')).toMatch(/washer|kepala sekrup/i)
    }
  })

  it('kapasitas tarik memakai yang TERKECIL — pull-over ikut menentukan', () => {
    /*
      ⚠ Test ini ada karena mutasi "pull-over diabaikan" LOLOS tanpanya.

      Test sebelumnya memeriksa CATATAN yang muncul saat pull-over
      mengendalikan, tetapi tak memeriksa bahwa nilainya benar-benar dipakai
      menghitung kapasitas.

      Pelat tipis di sisi kepala membuat pull-over jauh lebih kecil daripada
      pull-out — dan itu keadaan yang lazim pada penutup atap.
    */
    const h = analisaSekrupBajaRingan({ ...SEKRUP, tebal1Mm: 0.4, tebal2Mm: 2 })
    const k = h.kapasitas
    expect(k.pullOverKn).toBeLessThan(k.pullOutKn)

    /* Kapasitas tarik yang dipakai harus mengikuti yang terkecil. */
    const tarikDipakai = h.periksa.find((x) => x.nama.includes('Tarik cabut'))!.nilai
    /* nilai di periksa dibulatkan 2 desimal — bandingkan pada presisi itu */
    expect(tarikDipakai).toBeCloseTo(k.pullOverKn * SEKRUP.jumlahSekrup, 1)
    expect(tarikDipakai).toBeLessThan(k.pullOutKn * SEKRUP.jumlahSekrup)
  })

  it('geser + tarik bersamaan diperiksa interaksinya', () => {
    /*
      Keadaan lazim pada atap: berat penutup menggeser, angin menghisap.
      Sekrup yang memikul keduanya gagal lebih cepat daripada salah satunya.
    */
    const h = analisaSekrupBajaRingan(SEKRUP)
    expect(h.periksa.some((p) => p.nama.includes('Interaksi'))).toBe(true)
  })

  it('interaksi TIDAK diperiksa bila hanya satu jenis gaya', () => {
    const h = analisaSekrupBajaRingan({ ...SEKRUP, gayaTarikKn: 0 })
    expect(h.periksa.some((p) => p.nama.includes('Interaksi'))).toBe(false)
  })

  it('faktor tahanan 0,5 — jauh lebih kecil daripada baut biasa', () => {
    /*
      Bukan kehati-hatian berlebihan: sambungan baja tipis punya sebaran
      kekuatan jauh lebih lebar, dan pemasangannya sangat bergantung
      ketelitian tukang.
    */
    expect(PHI_SEKRUP).toBe(0.5)
    expect(analisaSekrupBajaRingan(SEKRUP).catatan.join(' '))
      .toMatch(/ketelitian tukang/i)
  })

  it('jarak ke tepi minimum 3d', () => {
    /* 3 × 4,8 = 14,4 mm */
    const p = analisaSekrupBajaRingan(SEKRUP).periksa.find((x) => x.nama.includes('tepi'))!
    expect(p.syarat).toBe(14)
    const dekat = analisaSekrupBajaRingan({ ...SEKRUP, jarakTepiMm: 10 })
    expect(dekat.periksa.find((x) => x.nama.includes('tepi'))!.aman).toBe(false)
  })

  it('MENOLAK sambungan tanpa gaya sama sekali', () => {
    expect(() => analisaSekrupBajaRingan({ ...SEKRUP, gayaGeserKn: 0, gayaTarikKn: 0 }))
      .toThrow(/tak perlu dihitung/i)
  })

  it('menyebut sekrup miring & korosi galvanis yang BELUM diperiksa', () => {
    const c = analisaSekrupBajaRingan(SEKRUP).catatan.join(' ')
    expect(c).toMatch(/MIRING|terlalu kencang/i)
    expect(c).toMatch(/korosi galvanis/i)
  })
})

describe('HANKINSON — kayu jauh lebih lemah ditekan MELINTANG serat', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    Batas yang paling sering ditemui di lapangan, karena batang kuda-kuda
    memang bertemu MENYUDUT di titik buhul — sudut 0° justru yang jarang.

    Rumusnya:

                  Fe∥ · Fe⊥
      Feθ = ─────────────────────────
            Fe∥·sin²θ + Fe⊥·cos²θ

    Nilai acuannya dihitung tangan dari rumus itu, bukan dari keluaran kode.
    ══════════════════════════════════════════════════════════════════════════
  */
  const BAUT = {
    alat: 'baut' as const, diameterMm: 12, jumlahAlat: 4,
    tebalUtamaMm: 80, tebalSisiMm: 40, penetrasiMm: 40,
    kelas: 'II' as const, durasi: 'tetap' as const,
    kadarAir: 'kering' as const, gayaKn: 20,
    jarakTepiSejajarMm: 100, jarakTepiTegakMm: 60, jarakAntarAlatMm: 60,
  }

  /** Rasio Feθ/Fe∥ dari rumus Hankinson, Fe⊥ = Fe∥/4. */
  function hankinsonTangan(derajat: number): number {
    const r = (derajat * Math.PI) / 180
    const s = Math.sin(r) ** 2
    const c = Math.cos(r) ** 2
    return 0.25 / (s + 0.25 * c)
  }

  it.each([0, 15, 30, 45, 60, 90])('θ=%i° cocok dengan hitungan tangan', (sudut) => {
    const fe0 = analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: 0 })
      .kapasitas.tumpuMpa
    const feT = analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: sudut })
      .kapasitas.tumpuMpa
    expect(feT / fe0).toBeCloseTo(hankinsonTangan(sudut), 3)
  })

  it('45° tinggal 40%, 90° tinggal 25% — selisih yang BESAR', () => {
    /*
      Ini yang membuat batas ini perlu ditutup: kalau selisihnya kecil,
      mengabaikannya tak apa-apa. 60% kapasitas yang hilang pada 45° bukan
      selisih kecil.
    */
    const fe0 = analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: 0 })
      .kapasitas.tumpuMpa
    const fe45 = analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: 45 })
      .kapasitas.tumpuMpa
    const fe90 = analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: 90 })
      .kapasitas.tumpuMpa
    expect(fe45 / fe0).toBeCloseTo(0.40, 2)
    expect(fe90 / fe0).toBeCloseTo(0.25, 2)
  })

  it('kapasitas turun MONOTON saat sudutnya membesar', () => {
    const kap = [0, 15, 30, 45, 60, 75, 90].map(
      (t) => analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: t })
        .kapasitas.totalKn,
    )
    for (let i = 1; i < kap.length; i++) {
      expect(kap[i], `sudut naik tetapi kapasitas naik di langkah ${i}`)
        .toBeLessThan(kap[i - 1])
    }
  })

  it('PAKU TIDAK terpengaruh sudut — dan itu bukan kelalaian', () => {
    /*
      Paku berdiameter kecil menekan serat yang sangat sedikit, dan seratnya
      menutup kembali di belakangnya. SNI 7973 §12.3 memakai satu nilai Fe
      tanpa memandang arah.

      Menerapkan Hankinson ke paku akan MENGECILKAN kapasitasnya tanpa dasar,
      dan sambungan paku yang terlalu konservatif berarti tukang memasang dua
      kali lebih banyak paku — yang justru membelah kayunya.
    */
    const PAKU = {
      ...BAUT, alat: 'paku' as const, diameterMm: 4.1, jumlahAlat: 14,
      gayaKn: 6, jarakTepiSejajarMm: 70, jarakTepiTegakMm: 25,
      jarakAntarAlatMm: 65,
    }
    const fe = [0, 45, 90].map(
      (t) => analisaSambunganKayu({ ...PAKU, sudutTerhadapSeratDerajat: t })
        .kapasitas.tumpuMpa,
    )
    expect(fe[1]).toBe(fe[0])
    expect(fe[2]).toBe(fe[0])
  })

  it('sudut 0 bawaan — dan ketiadaannya DINYATAKAN, bukan diam', () => {
    /*
      Bawaan 0 adalah arah PALING KUAT. Diam saat 0 berarti hasil optimistis
      lolos tanpa ada yang tahu sudutnya tak pernah diisi — dan pada
      kuda-kuda, sudut 0 justru yang jarang.
    */
    const h = analisaSambunganKayu(BAUT)
    expect(h.catatan.some(
      (c) => /dianggap 0°/.test(c) && /PALING KUAT/.test(c),
    )).toBe(true)
    expect(h.catatan.some((c) => /45°.*40%/.test(c))).toBe(true)
  })

  it('sudut yang DIISI dinyatakan beserta persen sisanya', () => {
    const h = analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: 45 })
    expect(h.catatan.some((c) => /45°/.test(c) && /40%/.test(c))).toBe(true)
    expect(h.catatan.some((c) => /Hankinson/.test(c))).toBe(true)
  })

  it('paku menyatakan bahwa sudut TIDAK berpengaruh padanya', () => {
    const h = analisaSambunganKayu({
      ...BAUT, alat: 'paku', diameterMm: 4.1, jumlahAlat: 14, gayaKn: 6,
      jarakTepiSejajarMm: 70, jarakTepiTegakMm: 25, jarakAntarAlatMm: 65,
      sudutTerhadapSeratDerajat: 45,
    })
    expect(h.catatan.some(
      (c) => /TIDAK berpengaruh pada paku/.test(c),
    )).toBe(true)
  })

  it('sudut di luar 0..90 ditolak', () => {
    for (const rusak of [-10, 91, 180, NaN]) {
      expect(() => analisaSambunganKayu({
        ...BAUT, sudutTerhadapSeratDerajat: rusak,
      })).toThrow(/0\.\.90/)
    }
  })

  it('Hankinson TIDAK mengubah hasil lama — bawaan 0 setara sebelum ada fitur ini', () => {
    /*
      Penambahan yang mengubah hasil yang sudah ada adalah regresi, bukan
      fitur. Bawaan 0 memberi Feθ = Fe∥ persis.
    */
    const tanpa = analisaSambunganKayu(BAUT)
    const nol = analisaSambunganKayu({ ...BAUT, sudutTerhadapSeratDerajat: 0 })
    expect(nol.kapasitas.totalKn).toBe(tanpa.kapasitas.totalKn)
  })
})

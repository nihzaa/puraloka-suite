import { describe, it, expect } from 'vitest'
import {
  analisaGording, analisaInteraksiTekanMomen, analisaBracing,
  inersiaY, modulusElastisY, modulusPlastisY,
} from '../struktur-baja-gording'
import { inersiaX } from '../struktur-baja'
import type { ProfilBaja, MutuBaja } from '../struktur-baja'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * TIGA SISA YANG SEBELUMNYA DINYATAKAN "BELUM DIHITUNG"
 *
 * Modul baja menyatakan ketiganya belum dihitung di catatan keluarannya, supaya
 * tak dikira sudah diperiksa. Sekarang ditutup — dan pernyataan lamanya jadi
 * basi, yang berarti test yang menguncinya harus ikut diperbarui.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const CNP150: ProfilBaja = {
  designation: '150x65x20x3.2', profile_type: 'CNP',
  hMm: 150, bMm: 65, t1Mm: 3.2, t2Mm: 3.2,
  beratKgPerM: 8.01, panjangStandarM: 6,
}
const WF200: ProfilBaja = {
  designation: '200x100x5.5x8', profile_type: 'WF',
  hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
  beratKgPerM: 21.3333, panjangStandarM: 12,
}
const SIKU: ProfilBaja = {
  designation: '70x70x7', profile_type: 'L',
  hMm: 70, bMm: 70, t1Mm: 7, t2Mm: 7,
  beratKgPerM: 7.38, panjangStandarM: 6,
}
const BJ37: MutuBaja = { fyMpa: 240, fuMpa: 370 }

describe('sifat penampang sumbu LEMAH', () => {
  it('Iy jauh lebih kecil dari Ix — itu sebabnya gording miring berbahaya', () => {
    /*
      WF200: Ix ≈ 17,6 juta mm⁴, Iy ≈ 1,4 juta mm⁴ — selisih 12x.

      Gording yang dipasang miring menyalurkan sebagian bebannya ke sumbu
      lemah, dan sumbu lemah hanya sepersekian kekuatan sumbu kuat. Gording
      yang dihitung sebagai balok biasa akan melendut KE SAMPING dan memuntir,
      meski hitungan sumbu kuatnya aman.
    */
    const ix = inersiaX(WF200)
    const iy = inersiaY(WF200)
    expect(iy).toBeLessThan(ix / 8)
  })

  it('Zy > Sy, seperti pada sumbu kuat', () => {
    expect(modulusPlastisY(WF200)).toBeGreaterThan(modulusElastisY(WF200))
  })

  it('Iy dihitung dari dua sayap + badan', () => {
    /*
      sayap 2 × 8 × 100³/12 = 2 × 666.667 = 1.333.333
      badan 184 × 5,5³/12 = 184 × 13,865 = 2.551
      Iy ≈ 1.335.884 mm⁴
    */
    expect(inersiaY(WF200)).toBeCloseTo(1_335_884, -1)
  })
})

describe('gording — beban terurai ke DUA sumbu', () => {
  const dasar = {
    profil: CNP150, mutu: BJ37, bentangM: 4,
    kemiringanDerajat: 30,
    bebanVertikalKnPerM: 1.2, bebanLayanKnPerM: 0.9,
    jarakSagrodM: 2,
    bebanAnginKnPerM: 0.3,
  }

  it('atap DATAR: seluruh beban ke sumbu kuat, nol ke sumbu lemah', () => {
    const h = analisaGording({ ...dasar, kemiringanDerajat: 0 })
    expect(h.antara.qLemahKnPerM).toBeCloseTo(0, 9)
    expect(h.antara.qKuatKnPerM).toBeCloseTo(1.2 + 0.3, 6)
  })

  it('atap 30 DERAJAT: setengah beban jatuh ke sumbu LEMAH', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Inilah yang paling sering dilupakan.

      sin 30° = 0,5 — jadi separuh beban gravitasi ditahan sumbu lemah, yang
      hanya sekitar seperlima kekuatan sumbu kuat pada profil kanal.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaGording(dasar)
    expect(h.antara.qLemahKnPerM).toBeCloseTo(1.2 * 0.5, 6)
    expect(h.antara.qKuatKnPerM).toBeCloseTo(1.2 * Math.cos(Math.PI / 6) + 0.3, 6)
  })

  it('dua sumbu diperiksa BERSAMA lewat interaksi, bukan sendiri-sendiri', () => {
    /*
      Gording bisa lulus pemeriksaan sumbu kuat DAN sumbu lemah masing-masing,
      tetapi gagal saat keduanya bekerja bersamaan — tegangan di sudut
      penampang adalah JUMLAH keduanya, dan sudut itulah yang leleh lebih dulu.
    */
    const h = analisaGording(dasar)
    const lentur = h.periksa.find((p) => p.nama === 'Lentur gording dua arah')!
    expect(lentur.rumus).toMatch(/Mux\/phiMnx \+ Muy\/phiMny/)
    expect(lentur.rumus).toMatch(/BERSAMA/)
  })

  it('SAGROD memotong bentang sumbu lemah — kapasitasnya naik', () => {
    /*
      Momen berbanding kuadrat bentang: sagrod di tengah membuat bentang
      lemahnya separuh, jadi momennya SEPEREMPAT. Itu perbaikan yang jauh
      lebih murah daripada memperbesar profil.
    */
    const tanpa = analisaGording({ ...dasar, jarakSagrodM: undefined })
    const dengan = analisaGording({ ...dasar, jarakSagrodM: 2 })
    expect(dengan.antara.muLemahKnm as number)
      .toBeCloseTo((tanpa.antara.muLemahKnm as number) / 4, 3)
    expect(dengan.antara.interaksi as number)
      .toBeLessThan(tanpa.antara.interaksi as number)
  })

  it('atap miring TANPA sagrod diberi peringatan beserta ANGKANYA', () => {
    const h = analisaGording({ ...dasar, jarakSagrodM: undefined })
    expect(h.catatan.join(' ')).toMatch(/TANPA sagrod/)
    expect(h.catatan.join(' ')).toMatch(/seperlima kekuatan sumbu kuat/)
    expect(h.catatan.join(' ')).toMatch(/empat kali lipat/)
  })

  it('ANGIN HISAP membalik arah, dan sayap bawah jadi tekan', () => {
    /*
      Sayap bawah gording tak terpegang penutup atap. Saat angin menghisap
      lebih kuat dari gravitasi, sayap bawah jadi sayap tekan yang tak
      terpegang apa pun — dan kapasitas lenturnya turun drastis.
    */
    const h = analisaGording({ ...dasar, bebanAnginKnPerM: -3 })
    expect(h.catatan.join(' ')).toMatch(/Angin MENGHISAP/)
    expect(h.catatan.join(' ')).toMatch(/sayap BAWAH/)
  })

  it('angin TIDAK diisi → diperingatkan, karena hisap sering lebih besar', () => {
    const h = analisaGording({ ...dasar, bebanAnginKnPerM: 0 })
    expect(h.catatan.join(' ')).toMatch(/Beban ANGIN tidak diisi/)
    expect(h.catatan.join(' ')).toMatch(/atap ringan/)
  })

  it('lendutan digabung sebagai RESULTAN dua arah', () => {
    // Lendutan miring ke samping DAN ke bawah; yang terasa resultannya.
    const h = analisaGording(dasar)
    const dk = h.antara.lendutanKuatMm as number
    const dl = h.antara.lendutanLemahMm as number
    expect(h.antara.lendutanTotalMm).toBeCloseTo(Math.hypot(dk, dl), 6)
  })

  it('menolak kemiringan mustahil', () => {
    expect(() => analisaGording({ ...dasar, kemiringanDerajat: 95 })).toThrow(/0-89/)
    expect(() => analisaGording({ ...dasar, kemiringanDerajat: -5 })).toThrow(/0-89/)
  })
})

describe('interaksi tekan + momen — tak bisa diperiksa terpisah', () => {
  const dasar = {
    profil: WF200, mutu: BJ37, panjangM: 3.5,
    puKn: 300, muxKnm: 15,
  }

  it('kolom yang lulus tekan DAN momen sendiri-sendiri bisa GAGAL bersama', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      INI ALASAN RUMUS INTERAKSI ADA.

      Gaya tekan MEMPERBESAR momen: kolom yang sudah melengkung sedikit karena
      momen akan melengkung lebih jauh karena tekannya bekerja pada lengkungan
      itu, dan momen tambahan itu melengkungkannya lagi.

      Diuji dengan angka: cari kombinasi yang masing-masing di bawah batas
      tetapi jumlahnya melewati.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaInteraksiTekanMomen({ ...dasar, puKn: 100, muxKnm: 10 })
    const rp = h.antara.rasioTekan as number
    const rm = h.antara.rasioMomen as number

    // Diukur: rp 0,623 · rm 0,766 · interaksi 1,304.
    expect(rp).toBeLessThan(1)      // tekannya sendiri AMAN (62% kapasitas)
    expect(rm).toBeLessThan(1)      // momennya sendiri AMAN (77% kapasitas)
    expect(h.aman).toBe(false)      // tetapi BERSAMA-nya TIDAK
    expect(h.antara.interaksi as number).toBeGreaterThan(1)
  })

  it('dua rumus berbeda: tekan dominan vs lentur dominan', () => {
    /*
      Batang bertekan besar berperilaku seperti kolom; bertekan kecil seperti
      balok. Menyamakannya membuat salah satu golongan dihitung terlalu
      longgar.
    */
    const tekanBesar = analisaInteraksiTekanMomen({ ...dasar, puKn: 500, muxKnm: 5 })
    const tekanKecil = analisaInteraksiTekanMomen({ ...dasar, puKn: 20, muxKnm: 20 })
    expect(tekanBesar.periksa[0].rumus).toMatch(/8\/9/)
    expect(tekanKecil.periksa[0].rumus).toMatch(/Pu\/\(2 phiPn\)/)
    expect(tekanBesar.catatan.join(' ')).toMatch(/TEKAN dominan/)
    expect(tekanKecil.catatan.join(' ')).toMatch(/LENTUR dominan/)
  })

  it('momen sumbu lemah IKUT bila diisi', () => {
    const tanpa = analisaInteraksiTekanMomen(dasar)
    const dengan = analisaInteraksiTekanMomen({ ...dasar, muyKnm: 5 })
    expect(dengan.antara.interaksi as number)
      .toBeGreaterThan(tanpa.antara.interaksi as number)
  })

  it('rangka BERGOYANG dinyatakan butuh analisis orde-kedua', () => {
    /*
      Rumus interaksi ini memperhitungkan P-Delta secara pendekatan untuk
      rangka TAK bergoyang. Rangka tanpa bracing atau dinding geser butuh
      momen yang diperbesar lebih dulu — dan itu belum ada di sini.
    */
    const h = analisaInteraksiTekanMomen(dasar)
    expect(h.catatan.join(' ')).toMatch(/rangka BERGOYANG/)
    expect(h.catatan.join(' ')).toMatch(/orde-kedua/)
    expect(h.catatan.join(' ')).toMatch(/belum ada di sini/)
  })
})

describe('bracing — harus KUAT dan KAKU', () => {
  const dasar = {
    profil: SIKU, mutu: BJ37, panjangM: 3.0, gayaKn: 40,
  }

  it('bracing tarik memadai → aman', () => {
    const h = analisaBracing(dasar)
    expect(h.aman).toBe(true)
  })

  it('bracing TUNGGAL bertekan wajib diperiksa tekuk', () => {
    const h = analisaBracing({ ...dasar, gayaKn: -40 })
    expect(h.periksa.map((p) => p.nama)).toContain('Tekan bracing')
    expect(h.periksa.find((p) => p.nama === 'Tekan bracing')!.rumus)
      .toMatch(/TUNGGAL wajib menahan tekan/)
  })

  it('bracing SILANG "tarik saja" tak diperiksa tekuk — dan itu dinyatakan', () => {
    /*
      Batang yang tertekan dibiarkan menekuk, pasangannya yang bekerja. Sistem
      ini HANYA sah bila kedua diagonal benar-benar terpasang — bila satu
      hilang atau kendur, rangkanya tak terkekang sama sekali ke arah itu.
    */
    const h = analisaBracing({ ...dasar, gayaKn: -40, tarikSaja: true })
    expect(h.periksa.map((p) => p.nama)).toContain('Tarik bracing')
    expect(h.periksa.map((p) => p.nama)).not.toContain('Tekan bracing')
    expect(h.catatan.join(' ')).toMatch(/kedua diagonal benar-benar terpasang/)
    expect(h.catatan.join(' ')).toMatch(/tak terkekang sama sekali/)
  })

  it('KEKAKUAN diperiksa — bracing kuat tapi lentur tak menolong', () => {
    /*
      Bracing yang kuat tetapi lentur membiarkan rangka bergoyang lebih dulu
      sebelum bracingnya sempat bekerja. Goyangan itulah yang merusak dinding
      pengisi dan membuat penghuni tak nyaman.
    */
    const h = analisaBracing({ ...dasar, panjangM: 8 })
    const kaku = h.periksa.find((p) => p.nama === 'Kelangsingan bracing')!
    expect(kaku.aman).toBe(false)
    expect(kaku.rumus).toMatch(/KAKU, bukan cuma kuat/)
    expect(h.aman).toBe(false)
  })

  it('batas kekakuan penuh dinyatakan sebagai pendekatan', () => {
    const h = analisaBracing(dasar)
    expect(h.catatan.join(' ')).toMatch(/pendekatan/)
    expect(h.catatan.join(' ')).toMatch(/memecahkan kaca/)
  })
})

describe('volume — bentuknya sama dengan modul lain', () => {
  it('gording, interaksi, dan bracing semuanya memulangkan VolumeElemen', () => {
    const g = analisaGording({
      profil: CNP150, mutu: BJ37, bentangM: 4, kemiringanDerajat: 15,
      bebanVertikalKnPerM: 1, bebanLayanKnPerM: 0.8,
    })
    const b = analisaBracing({ profil: SIKU, mutu: BJ37, panjangM: 3, gayaKn: 30 })
    for (const h of [g, b]) {
      expect(h.volume.betonM3).toBe(0)
      expect(Array.isArray(h.volume.besi)).toBe(true)
      expect(typeof h.volume.besiTotalKg).toBe('number')
    }
    // Gording 4 m dari batang 6 m → 1 batang.
    expect(g.volume.besi[0].jumlahBatang).toBe(1)
  })
})


describe('profil pinjaman rumus DIUNGKAPKAN, bukan didiamkan', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA BLOK INI ADA
    ══════════════════════════════════════════════════════════════════════════

    Modul ini memang DIRANCANG untuk kanal dan siku — `CNP 150x65x20x3.2` dan
    `L 70x70x7` adalah data ujinya, karena itulah profil yang dipakai di
    lapangan untuk gording dan bracing. Berat, volume, dan potong-batang
    semuanya sudah benar untuk keduanya.

    Yang DIPINJAM hanya rumus kekuatannya. `inersiaY()` di modul ini adalah
    rumus profil I bersayap DUA sisi; kanal bersayap satu sisi, dan siku punya
    sumbu utama yang MIRING. Diukur 2026-08-27 — WF, CNP, dan siku berdimensi
    sama menghasilkan angka IDENTIK sampai digit terakhir:

        gording   rasio interaksi  0.4155385014771352
        interaksi rasio            3.4835937579027876

    `pastikanProfilDidukung` sempat dipasang di sini dan DICABUT pada hari yang
    sama: ia merahkan 15 test yang sah dan mematikan volume yang benar — obat
    yang lebih merusak dari penyakit. Gantinya peringatan pada HASIL, tempat ia
    terbaca oleh yang memakai angkanya.

    Test ini yang menahan supaya peringatan itu tak hilang diam-diam — persis
    kelas cacat yang menghasilkan seluruh temuan hari itu: sesuatu yang ada di
    kode, terbaca benar, dan tak pernah dijalankan.
  */

  const mk = (jenis: string): ProfilBaja => ({
    designation: `${jenis} uji`, profile_type: jenis,
    hMm: 150, bMm: 75, t1Mm: 5, t2Mm: 7,
    beratKgPerM: 14, panjangStandarM: 6,
  })

  const gording = (p: ProfilBaja) => analisaGording({
    profil: p, mutu: BJ37, bentangM: 4, kemiringanDerajat: 15,
    bebanVertikalKnPerM: 2, bebanLayanKnPerM: 1.5,
  })
  const interaksi = (p: ProfilBaja) => analisaInteraksiTekanMomen({
    profil: p, mutu: BJ37, panjangM: 3, puKn: 100, muxKnm: 10, muyKnm: 2,
  })
  const bracing = (p: ProfilBaja) => analisaBracing({
    profil: p, mutu: BJ37, panjangM: 4, gayaKn: 80,
  })

  const peringatan = (h: { catatan?: string[] }) =>
    (h.catatan ?? []).filter((c) => /rumus profil I|kelangsingan profil I/.test(c))

  it.each(['CNP', 'C', 'INP', 'L'])('gording profil %s diberi peringatan', (j) => {
    expect(peringatan(gording(mk(j)))).toHaveLength(1)
  })

  it.each(['CNP', 'L'])('interaksi & bracing profil %s diberi peringatan', (j) => {
    expect(peringatan(interaksi(mk(j)))).toHaveLength(1)
    expect(peringatan(bracing(mk(j)))).toHaveLength(1)
  })

  it.each(['WF', 'H'])('profil %s TIDAK diberi peringatan — rumusnya memang untuknya', (j) => {
    expect(peringatan(gording(mk(j)))).toHaveLength(0)
    expect(peringatan(interaksi(mk(j)))).toHaveLength(0)
    expect(peringatan(bracing(mk(j)))).toHaveLength(0)
  })

  it('huruf kecil ikut terdeteksi — data profil datang dari tabel', () => {
    /*
      `steel_profiles` bisa memuat `cnp` huruf kecil. Perbandingan peka huruf
      akan melewatkannya DIAM-DIAM, dan diam adalah bentuk kegagalan yang
      persis hendak ditutup di sini.
    */
    expect(peringatan(gording(mk('cnp')))).toHaveLength(1)
    expect(peringatan(gording(mk('wf')))).toHaveLength(0)
  })

  it('peringatannya MENYEBUT apa yang masih sah — bukan sekadar melarang', () => {
    /*
      Peringatan yang cuma bilang "angka ini salah" membuat orang membuang
      seluruh hasilnya, termasuk berat & volume yang benar dan sudah masuk RAB.
    */
    const c = peringatan(gording(mk('CNP')))[0]
    expect(c).toMatch(/Berat, volume/)
    expect(c).toMatch(/perencana/)
  })

  it('menyebut ARAH kesalahannya — terlalu besar, bukan sekadar "berbeda"', () => {
    /*
      Arahnya yang menentukan tindakan. Kapasitas yang terlalu BESAR berarti
      hasilnya tak aman; yang terlalu kecil hanya boros. Peringatan yang tak
      menyebut arah membiarkan pembacanya menebak.
    */
    expect(peringatan(interaksi(mk('CNP')))[0]).toMatch(/terlalu besar/i)
    expect(peringatan(bracing(mk('L')))[0]).toMatch(/terlalu besar/i)
  })
})

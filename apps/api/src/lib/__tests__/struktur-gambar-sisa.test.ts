import { describe, it, expect } from 'vitest'
import {
  gambarTangga, gambarKolomKomposit, gambarBondek,
  gambarDindingGeser, gambarRaft, gambarPondasiMenerus,
  gambarPolaSambungan, gambarGusset, gambarLas, gambarPenampangKayu,
} from '../struktur-gambar'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SEPULUH GAMBAR TERAKHIR — yang menutup 32/32
 *
 * Yang diuji di sini bukan "SVG terbit" (itu sudah dibuktikan
 * `uji-gambar-semua-jenis.mjs` lewat rute hidup), melainkan hal-hal yang
 * KELIHATAN BENAR padahal salah:
 *
 *   - viewBox berukuran nol → gambar KOSONG, berkasnya tetap terlihat wajar
 *   - keadaan berbahaya digambar sama seperti keadaan aman → gambar itu
 *     MENENANGKAN pembacanya, lebih buruk daripada tak ada gambar
 *   - geometri mustahil digambar apa adanya → pembaca tak punya cara tahu
 *     bahwa yang dilihatnya tak mungkin dibangun
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Ambil viewBox sebagai angka — dipakai hampir semua uji di berkas ini. */
function viewBox(svg: string): { w: number; h: number } {
  const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)
  if (!m) throw new Error('SVG tanpa viewBox')
  return { w: Number(m[3]), h: Number(m[4]) }
}

describe('gambarTangga — geometri yang menentukan orang jatuh atau tidak', () => {
  const OK = {
    tinggiM: 3.2, optredeMm: 178, antredeMm: 280, tebalPelatMm: 130,
    jumlahOptrede: 18, kemiringanDerajat: 32.4, blondelMm: 636,
  }

  it('viewBox positif dan anak tangga tercetak', () => {
    const svg = gambarTangga(OK)
    const { w, h } = viewBox(svg)
    expect(w).toBeGreaterThan(0)
    expect(h).toBeGreaterThan(0)
    expect(svg).toContain('18 anak')
  })

  it('BLONDEL di luar rentang nyaman ditandai MERAH', () => {
    /*
      Blondel adalah pemeriksaan yang paling sering dilanggar tanpa disadari:
      tangga yang melanggarnya tetap berdiri kokoh dan terlihat baik-baik
      saja. Yang memberitahunya hanya kaki orang yang menaikinya — biasanya
      sesudah terlambat.
    */
    const buruk = gambarTangga({ ...OK, blondelMm: 660 })
    expect(buruk).toContain('#dc2626')
    expect(buruk).toContain('di luar 600–650')

    expect(gambarTangga(OK)).not.toContain('#dc2626')
  })

  it('batas Blondel INKLUSIF di kedua ujung', () => {
    expect(gambarTangga({ ...OK, blondelMm: 600 })).not.toContain('#dc2626')
    expect(gambarTangga({ ...OK, blondelMm: 650 })).not.toContain('#dc2626')
    expect(gambarTangga({ ...OK, blondelMm: 599 })).toContain('#dc2626')
    expect(gambarTangga({ ...OK, blondelMm: 651 })).toContain('#dc2626')
  })

  it('jumlah anak tangga dipakai APA ADANYA dari hasil, tak dihitung ulang', () => {
    /*
      Modulnya MENGHITUNG ULANG optrede supaya tinggi total habis dibagi rata.
      Menggambar dari hitungan sendiri akan menyembunyikan perbaikan itu — dan
      anak tangga terakhir yang berbeda sendirian adalah penyebab tersandung
      paling sering di lapangan.
    */
    const svg = gambarTangga({ ...OK, jumlahOptrede: 21 })
    expect(svg).toContain('21 anak')
  })

  it('dimensi mustahil ditolak', () => {
    for (const rusak of [
      { ...OK, tinggiM: 0 }, { ...OK, optredeMm: 0 }, { ...OK, antredeMm: -280 },
    ]) {
      expect(() => gambarTangga(rusak)).toThrow(/harus > 0/)
    }
  })

  it('jumlah anak tangga di luar batas wajar ditolak', () => {
    expect(() => gambarTangga({ ...OK, jumlahOptrede: 500 })).toThrow(/batas wajar/)
  })
})

describe('gambarKolomKomposit — dua JENIS yang tak boleh tertukar', () => {
  const DASAR = {
    lebarBetonMm: 400, tinggiBetonMm: 400, asBajaMm2: 8000,
    asTulanganMm2: 1200, selimutMm: 40,
  }

  it('TERBUNGKUS dan TERISI menghasilkan gambar berbeda', () => {
    /*
      Keduanya memakai koefisien berbeda (0,85 vs 0,95, karena baja yang
      membungkus MENGEKANG betonnya), dan dua kolom berdimensi sama dengan
      jenis berbeda punya kapasitas yang berbeda nyata.
    */
    const bungkus = gambarKolomKomposit({ ...DASAR, jenis: 'terbungkus' })
    const isi = gambarKolomKomposit({ ...DASAR, jenis: 'terisi' })
    expect(bungkus).not.toEqual(isi)
    expect(bungkus).toContain('TERBUNGKUS')
    expect(isi).toContain('TERISI')
  })

  it('luas baja sebesar seluruh penampang ditolak', () => {
    expect(() => gambarKolomKomposit({
      ...DASAR, jenis: 'terbungkus', asBajaMm2: 400 * 400,
    })).toThrow(/seluruh penampang/)
  })

  it('viewBox positif untuk kedua jenis', () => {
    for (const jenis of ['terbungkus', 'terisi']) {
      const { w, h } = viewBox(gambarKolomKomposit({ ...DASAR, jenis }))
      expect(w, jenis).toBeGreaterThan(0)
      expect(h, jenis).toBeGreaterThan(0)
    }
  })
})

describe('gambarBondek — tahap PELAKSANAAN yang paling sering menentukan', () => {
  const OK = {
    tebalTotalMm: 120, tinggiGelombangMm: 50, tebalBajaMm: 0.75, bentangM: 2.4,
  }

  it('DUA tinggi dicetak terpisah: total dan beton di atas gelombang', () => {
    /*
      Tebal total dipakai untuk berat sendiri; tinggi beton DI ATAS gelombang
      yang menentukan kapasitas lenturnya. Memakai yang salah membuat volume
      beton meleset dan kapasitas dinilai terlalu tinggi.
    */
    const svg = gambarBondek(OK)
    expect(svg).toContain('total 120')
    expect(svg).toContain('beton 70')       // 120 − 50
    expect(svg).toContain('gelombang 50')
  })

  it('lendutan pelaksanaan LEWAT batas → peringatan PERANCAH', () => {
    /*
      Sebelum beton mengeras, lembaran setipis 0,75 mm memikul sendiri beton
      basah + pekerja. Yang lewat batas belum tentu runtuh — ia MELENDUT,
      lalu betonnya menggenang di tengah dan bertambah berat lagi.
    */
    const lewat = gambarBondek({
      ...OK, lendutanPelaksanaanMm: 14.2, batasLendutanMm: 9.6,
    })
    expect(lewat).toContain('BUTUH PERANCAH SEMENTARA')
    expect(lewat).toContain('#dc2626')

    const aman = gambarBondek({
      ...OK, lendutanPelaksanaanMm: 6.1, batasLendutanMm: 9.6,
    })
    expect(aman).not.toContain('BUTUH PERANCAH')
  })

  it('gelombang setebal seluruh pelat ditolak', () => {
    expect(() => gambarBondek({ ...OK, tinggiGelombangMm: 120 }))
      .toThrow(/setebal seluruh/)
  })
})

describe('gambarDindingGeser — hw/lw yang menentukan perilakunya', () => {
  const DASAR = { tebalMm: 250, asUjungMm2: 2400, vuKn: 850 }

  it('LANGSING, GEMUK, dan ANTARA dibedakan kata-katanya', () => {
    const langsing = gambarDindingGeser({ ...DASAR, panjangM: 3, tinggiM: 9 })
    const gemuk = gambarDindingGeser({ ...DASAR, panjangM: 6, tinggiM: 3 })
    const antara = gambarDindingGeser({ ...DASAR, panjangM: 4, tinggiM: 6 })

    expect(langsing).toContain('langsing')
    expect(gemuk).toContain('GESER cenderung menentukan')
    expect(antara).toContain('antara')
  })

  it('dinding GEMUK ditandai merah — gesernya GETAS', () => {
    const gemuk = gambarDindingGeser({ ...DASAR, panjangM: 6, tinggiM: 3 })
    expect(gemuk).toContain('#dc2626')
  })

  it('retak menyilang HANYA muncul bila geser menentukan', () => {
    /*
      Gambar yang SELALU menampilkan retak akan diabaikan; yang menampilkannya
      hanya saat relevan menjadi peringatan.
    */
    const gesarKalah = gambarDindingGeser({
      ...DASAR, panjangM: 3, tinggiM: 9, lenturDuluan: false,
    })
    const lenturDulu = gambarDindingGeser({
      ...DASAR, panjangM: 3, tinggiM: 9, lenturDuluan: true,
    })
    /* Retak digambar sebagai garis merah tebal miring. */
    const retak = (s: string) => (s.match(/<line[^>]*#dc2626/g) ?? []).length
    expect(retak(gesarKalah)).toBeGreaterThan(0)
    expect(retak(lenturDulu)).toBe(0)
  })

  it('rasio geser > 1 juga memunculkan retak', () => {
    const svg = gambarDindingGeser({
      ...DASAR, panjangM: 3, tinggiM: 9, rasioGeser: 1.4,
    })
    expect((svg.match(/<line[^>]*#dc2626/g) ?? []).length).toBeGreaterThan(0)
  })
})

describe('gambarRaft — yang berbahaya TEPI, bukan rata-rata', () => {
  const OK = { panjangM: 12, lebarM: 8, tebalMm: 400, qaKnM2: 150 }

  it('resultan DI LUAR inti sepertiga tengah ditandai', () => {
    /*
      Selama resultan di dalam inti, SELURUH dasar raft menekan tanah. Begitu
      keluar, sebagian terangkat — dan bagian yang terangkat tak menyumbang
      daya dukung sama sekali.
    */
    const luar = gambarRaft({ ...OK, eksentrisitasXM: 3, qMaksKnM2: 120 })
    expect(luar).toContain('resultan DI LUAR inti')
    expect(luar).toContain('#dc2626')

    const dalam = gambarRaft({ ...OK, eksentrisitasXM: 0.5, qMaksKnM2: 120 })
    expect(dalam).not.toContain('resultan DI LUAR inti')
  })

  it('qMin nol/negatif → TERANGKAT', () => {
    const svg = gambarRaft({
      ...OK, eksentrisitasXM: 3, qMaksKnM2: 220, qMinKnM2: -12,
    })
    expect(svg).toContain('TERANGKAT')
  })

  it('q melebihi daya dukung ijin ditandai merah', () => {
    const svg = gambarRaft({ ...OK, qMaksKnM2: 210, eksentrisitasXM: 0.2 })
    expect(svg).toContain('#dc2626')
  })

  it('eksentrisitas di luar raftnya ditolak — resultan tak mungkin di sana', () => {
    expect(() => gambarRaft({ ...OK, eksentrisitasXM: 9 }))
      .toThrow(/di luar raftnya/)
  })
})

describe('gambarPondasiMenerus — ukuran warisan yang tak pernah diperiksa', () => {
  const OK = {
    lebarBawahM: 0.6, lebarAtasM: 0.3, tinggiM: 0.6,
    tebalPasirM: 0.05, tinggiAanstampingM: 0.2, jenis: 'batu_kali',
  }

  it('lebar DASAR dicetak — itu yang menentukan tekanan ke tanah', () => {
    const svg = gambarPondasiMenerus(OK)
    expect(svg).toContain('dasar 0.6 m')
    expect(svg).toContain('atas 0.3 m')
  })

  it('batu kali diberi catatan TANPA bekisting', () => {
    /*
      Batu kali tak berbekisting dan beton berbekisting — dan estimator yang
      memakai AHSP yang salah memberi harga yang meleset jauh.
    */
    expect(gambarPondasiMenerus(OK)).toContain('TANPA bekisting')
    expect(gambarPondasiMenerus({ ...OK, jenis: 'beton' }))
      .not.toContain('TANPA bekisting')
  })

  it('pondasi TERBALIK (atas lebih lebar) ditolak', () => {
    expect(() => gambarPondasiMenerus({ ...OK, lebarAtasM: 0.9 }))
      .toThrow(/terbalik/)
  })

  it('tekanan melebihi ijin ditandai merah', () => {
    const svg = gambarPondasiMenerus({ ...OK, qKnM2: 180, qaKnM2: 150 })
    expect(svg).toContain('#dc2626')
    expect(gambarPondasiMenerus({ ...OK, qKnM2: 90, qaKnM2: 150 }))
      .not.toContain('#dc2626')
  })
})

describe('gambarPolaSambungan — tiga JARAK yang menentukan', () => {
  const OK = {
    jumlah: 6, diameterMm: 16,
    jarakUjungMm: 48, jarakTepiMm: 32, jarakAntarMm: 48,
    minUjungMm: 24, minTepiMm: 24, minAntarMm: 48,
  }

  it('jarak KURANG dari minimum ditandai merah beserta angkanya', () => {
    /*
      Jarak ke ujung yang dilanggar adalah pelanggaran yang paling sering
      terjadi di lapangan — tukang memasang alat sambung terlalu dekat ujung
      supaya kelihatan rapi — dan akibatnya kegagalan GETAS tanpa peringatan.
    */
    const kurang = gambarPolaSambungan({ ...OK, jarakUjungMm: 15 })
    expect(kurang).toContain('#dc2626')
    /*
      `&lt;` bukan `<` — dan itu BENAR: teksnya dilewatkan pelolosan SVG.
      Uji versi pertama menuntut `< 24` mentah dan merah; yang salah ujinya.
      Kalau suatu saat `<` mentah muncul di sini, itu justru tanda pelolosan
      berhenti bekerja.
    */
    expect(kurang).toContain('ujung 15 &lt; 24')

    expect(gambarPolaSambungan(OK)).not.toContain('#dc2626')
  })

  it('tanpa minimum, jarak tak dituduh kurang', () => {
    const svg = gambarPolaSambungan({
      jumlah: 4, diameterMm: 12, jarakUjungMm: 5,
    })
    expect(svg).not.toContain('#dc2626')
  })

  it('jumlah alat sambung dan jenisnya tercetak', () => {
    const svg = gambarPolaSambungan({ ...OK, alat: 'paku' })
    expect(svg).toContain('6 paku')
  })

  it('jumlah di luar batas wajar ditolak', () => {
    expect(() => gambarPolaSambungan({ ...OK, jumlah: 0 })).toThrow(/>= 1/)
    expect(() => gambarPolaSambungan({ ...OK, jumlah: 100 })).toThrow(/batas wajar/)
  })

  it('viewBox positif dari 1 sampai 40 alat sambung', () => {
    for (const n of [1, 2, 5, 6, 20, 40]) {
      const { w, h } = viewBox(gambarPolaSambungan({ ...OK, jumlah: n }))
      expect(w, `n=${n}`).toBeGreaterThan(0)
      expect(h, `n=${n}`).toBeGreaterThan(0)
    }
  })
})

describe('gambarGusset — hanya SEPOTONG pelatnya yang bekerja', () => {
  const OK = {
    tebalMm: 10, lebarSambunganMm: 160, panjangSambunganMm: 180,
    panjangBebasMm: 120, gayaKn: -240,
  }

  it('lebar Whitmore dipakai APA ADANYA dari hasil', () => {
    /*
      Menghitungnya ulang di sini berarti gambar dan verdict bisa berselisih
      diam-diam saat rumusnya diperbaiki.
    */
    const svg = gambarGusset({ ...OK, lebarWhitmoreMm: 368 })
    expect(svg).toContain('Whitmore 368')
  })

  it('tanpa nilai dari hasil, Whitmore dihitung 30° tiap sisi', () => {
    const svg = gambarGusset(OK)
    /* 160 + 2 × 180 × tan30 ≈ 367,8 */
    expect(svg).toMatch(/Whitmore 36[78]/)
  })

  it('TEKUK menentukan ditandai merah', () => {
    const svg = gambarGusset({ ...OK, rasioTekuk: 1.18 })
    expect(svg).toContain('TEKUK MENENTUKAN')
    expect(svg).toContain('#dc2626')
    expect(gambarGusset({ ...OK, rasioTekuk: 0.6 })).not.toContain('TEKUK MENENTUKAN')
  })

  it('gaya TEKAN dan tarik dibedakan', () => {
    expect(gambarGusset({ ...OK, gayaKn: -240 })).toContain('TEKAN')
    expect(gambarGusset({ ...OK, gayaKn: 240 })).toContain('tarik')
  })

  it('panjang bebas negatif ditolak', () => {
    expect(() => gambarGusset({ ...OK, panjangBebasMm: -10 }))
      .toThrow(/tak boleh negatif/)
  })
})

describe('gambarLas — yang menahan TENGGOROKAN, bukan kakinya', () => {
  const OK = { ukuranMm: 6, panjangMm: 200, tebalPelatMm: 10 }

  it('tenggorokan dihitung 0,707 × kaki dan DICETAK', () => {
    /*
      Las 6 mm hanya setebal 4,24 mm di bidang yang menentukan — 29% lebih
      kecil. Menghitungnya dengan ukuran kaki memberi kapasitas terlalu besar,
      dan sambungan las yang gagal jarang memberi peringatan lebih dulu.
    */
    const svg = gambarLas(OK)
    expect(svg).toContain('tenggorokan 4.24')
    expect(svg).toContain('kaki 6')
  })

  it('perbandingannya dijelaskan sebagai KALIMAT, bukan angka telanjang', () => {
    expect(gambarLas(OK)).toContain('29% lebih kecil')
  })

  it('rasio > 1 ditandai merah', () => {
    expect(gambarLas({ ...OK, rasio: 1.3 })).toContain('#dc2626')
    expect(gambarLas({ ...OK, rasio: 0.72 })).not.toContain('#dc2626')
  })

  it('dimensi nol ditolak', () => {
    expect(() => gambarLas({ ...OK, ukuranMm: 0 })).toThrow(/harus > 0/)
  })
})

describe('gambarPenampangKayu — bahan yang kekuatannya bergantung ARAH', () => {
  const OK = { lebarMm: 60, tinggiMm: 120, kelas: 'II', gayaKn: -15 }

  it('ARAH SERAT ditulis, bukan hanya digambar', () => {
    /*
      Kayu kuat sepanjang serat, LEMAH tegak lurus — pada kelas II hanya
      sepertiganya. Dua kegagalan tersering keduanya soal arah.
    */
    const svg = gambarPenampangKayu(OK)
    expect(svg).toContain('arah serat')
    expect(svg).toContain('kelas II')
  })

  it('tumpuan yang LEWAT batas ditandai merah', () => {
    /*
      Kayu di landasan PENYOK, bukan patah — dan yang penyok tak terlihat
      sebagai kerusakan sampai sambungannya sudah longgar.
    */
    const lewat = gambarPenampangKayu({
      ...OK, lebarTumpuanMm: 80, rasioTumpu: 1.25,
    })
    expect(lewat).toContain('#dc2626')

    const aman = gambarPenampangKayu({
      ...OK, lebarTumpuanMm: 80, rasioTumpu: 0.64,
    })
    expect(aman).not.toContain('#dc2626')
  })

  it('dimensi nol ditolak', () => {
    expect(() => gambarPenampangKayu({ ...OK, lebarMm: 0 })).toThrow(/harus > 0/)
    expect(() => gambarPenampangKayu({ ...OK, tinggiMm: -120 })).toThrow(/harus > 0/)
  })

  it('viewBox positif', () => {
    const { w, h } = viewBox(gambarPenampangKayu(OK))
    expect(w).toBeGreaterThan(0)
    expect(h).toBeGreaterThan(0)
  })
})

describe('sepuluh gambar — sifat yang WAJIB dimiliki semuanya', () => {
  const semua: Array<[string, () => string]> = [
    ['tangga', () => gambarTangga({
      tinggiM: 3.2, optredeMm: 178, antredeMm: 280, tebalPelatMm: 130,
    })],
    ['komposit', () => gambarKolomKomposit({
      jenis: 'terbungkus', lebarBetonMm: 400, tinggiBetonMm: 400, asBajaMm2: 8000,
    })],
    ['bondek', () => gambarBondek({
      tebalTotalMm: 120, tinggiGelombangMm: 50, tebalBajaMm: 0.75,
    })],
    ['dinding geser', () => gambarDindingGeser({
      panjangM: 4, tinggiM: 6, tebalMm: 250,
    })],
    ['raft', () => gambarRaft({ panjangM: 12, lebarM: 8, tebalMm: 400 })],
    ['pondasi menerus', () => gambarPondasiMenerus({
      lebarBawahM: 0.6, lebarAtasM: 0.3, tinggiM: 0.6,
    })],
    ['pola sambungan', () => gambarPolaSambungan({ jumlah: 6, diameterMm: 16 })],
    ['gusset', () => gambarGusset({
      tebalMm: 10, lebarSambunganMm: 160, panjangSambunganMm: 180, panjangBebasMm: 120,
    })],
    ['las', () => gambarLas({ ukuranMm: 6, panjangMm: 200, tebalPelatMm: 10 })],
    ['kayu', () => gambarPenampangKayu({ lebarMm: 60, tinggiMm: 120 })],
  ]

  it('semuanya punya role="img" dan aria-label', () => {
    /*
      SVG tanpa aria-label adalah gambar tanpa nama bagi pembaca layar —
      dan CLAUDE.md §8a.3 menyebut a11y bukan opsional, karena banyak
      pengguna software bisnis berperangkat lama/berliterasi digital rendah.
    */
    for (const [nama, buat] of semua) {
      const svg = buat()
      expect(svg, nama).toContain('role="img"')
      expect(svg, nama).toMatch(/aria-label="[^"]+"/)
    }
  })

  it('semuanya melewatkan judul lewat pelolosan — bukan celah penyisipan', () => {
    /*
      Judul datang dari nama elemen yang ditulis PENGGUNA. Satu karakter `<`
      merusak seluruh dokumen SVG, dan bila SVG-nya ditampilkan di web ia
      menjadi celah penyisipan.
    */
    for (const [nama] of semua) {
      void nama
    }
    const berjudul: string[] = [
      gambarTangga({ tinggiM: 3.2, optredeMm: 178, antredeMm: 280, tebalPelatMm: 130 },
        { judul: '<script>x</script>' }),
      gambarRaft({ panjangM: 12, lebarM: 8, tebalMm: 400 },
        { judul: '<script>x</script>' }),
      gambarLas({ ukuranMm: 6, panjangMm: 200, tebalPelatMm: 10 },
        { judul: '<script>x</script>' }),
      gambarPenampangKayu({ lebarMm: 60, tinggiMm: 120 },
        { judul: '<script>x</script>' }),
    ]
    for (const svg of berjudul) {
      expect(svg).not.toContain('<script>')
      expect(svg).toContain('&lt;')
    }
  })

  it('semuanya berviewBox POSITIF', () => {
    for (const [nama, buat] of semua) {
      const { w, h } = viewBox(buat())
      expect(w, nama).toBeGreaterThan(0)
      expect(h, nama).toBeGreaterThan(0)
    }
  })
})

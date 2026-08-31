// Menyambung BEBAN → Mu/Vu → USULAN TULANGAN. Test dulu (TDD).
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA, TERPISAH DARI `struktur-saran.test.ts`
// ══════════════════════════════════════════════════════════════════════════════
//
// `sarankanBalok` menerima Mu dan Vu sebagai ANGKA JADI. Itu berguna bagi yang
// sudah menghitung momennya — dan tak berguna bagi mayoritas yang bertanya
// "balok 25/40 bentang 4 m besinya berapa?", karena justru momen itulah yang
// tak mereka punya.
//
// `analisaBebanBalok` sudah menghitungnya dari beban sejak lama, lengkap dengan
// katalog SNI 1727. Yang belum ada cuma SAMBUNGANNYA.
//
// ── Yang diuji di sini: SAMBUNGAN, bukan hitungan
//
// Rumus beban sudah diuji `struktur-beban-balok.test.ts`; rumus tulangan sudah
// diuji `struktur-saran.test.ts`. Mengulangnya di sini hanya akan membuat dua
// tempat yang harus diperbarui saat rumusnya berubah — dan yang terlupa akan
// merah tanpa sebab yang jelas.
//
// Yang diuji: bahwa sambungannya TIDAK MENGHITUNG ULANG apa pun. Mu yang
// dipakai `sarankanBalok` harus IDENTIK dengan yang dipulangkan
// `analisaBebanBalok` — bukan mirip, bukan dibulatkan.
//
// ⚠ Kenapa itu penting sampai perlu test sendiri: kalau sambungan ini
// menghitung ulang (mis. membulatkan Mu ke satu desimal "biar rapi di layar"),
// yang muncul adalah usulan tulangan untuk momen yang BUKAN momen yang
// ditampilkan di layar. Keduanya terlihat wajar, keduanya konsisten sendiri,
// dan tak ada satu pun galat. Itu kelas cacat yang sama dengan yang dijaga
// `audit-takeoff-kembar-sepakat.mjs`.
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { analisaBebanBalok } from '../struktur-beban-balok.js'
import { analisaBalok, type MutuBahan } from '../struktur-beton.js'
import {
  sarankanBalok,
  sarankanBalokDariBeban,
  type InputSaranDariBeban,
} from '../struktur-saran.js'

const MUTU: MutuBahan = { fcMpa: 25, fyMpa: 420, fyvMpa: 280 }

/**
 * Balok hunian 300×500, bentang 5 m, memikul pelat 120 mm selebar 3 m,
 * berkeramik, dengan dinding bata ringan setinggi 3 m di atasnya.
 *
 * Semuanya lewat KATALOG, bukan angka ketikan — itu bentuk yang dianjurkan
 * `struktur-beban-balok.ts` dan yang akan dipakai layarnya.
 */
const BALOK_HUNIAN: InputSaranDariBeban = {
  bMm: 300, hMm: 500, panjangM: 5, selimutMm: 30, mutu: MUTU,
  beban: {
    bentangM: 5,
    lebarPikulM: 3,
    tebalPelatMm: 120,
    lapisMati: ['keramik-spesi'],
    fungsiRuangKunci: 'hunian',
    jenisDinding: 'bata-ringan-plester',
    tinggiDindingM: 3,
    skema: 'menerus-tengah',
  },
}

describe('sarankanBalokDariBeban', () => {
  it('menghasilkan usulan tanpa Mu/Vu diketik pemakainya', () => {
    const hasil = sarankanBalokDariBeban(BALOK_HUNIAN)

    expect(hasil.berhasil).toBe(true)
    expect(hasil.terpilih).toBeDefined()
    expect(hasil.terpilih!.nTarik).toBeGreaterThanOrEqual(2)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // YANG PALING PENTING — nol hitungan kedua
  // ══════════════════════════════════════════════════════════════════════════
  it('Mu/Vu yang dipakai IDENTIK dengan analisaBebanBalok — bukan dihitung ulang', () => {
    const hasil = sarankanBalokDariBeban(BALOK_HUNIAN)
    const langsung = analisaBebanBalok({
      bMm: BALOK_HUNIAN.bMm, hMm: BALOK_HUNIAN.hMm,
      ...BALOK_HUNIAN.beban,
    })

    // Sama PERSIS, bukan toBeCloseTo — pembulatan sekecil apa pun berarti
    // layar dan usulan memakai dua angka yang berbeda.
    expect(hasil.beban.muKnm).toBe(langsung.muKnm)
    expect(hasil.beban.vuKn).toBe(langsung.vuKn)
    expect(hasil.beban.quKnM).toBe(langsung.quKnM)

    /*
      ⚠ Ketiga baris di atas TIDAK CUKUP, dan itu TERBUKTI lewat mutasi:
      membungkus Mu dengan `Math.round(x*10)/10` sebelum diteruskan ke
      `sarankanBalok` membuat seluruh berkas ini tetap HIJAU. Sebabnya
      `hasil.beban` datang langsung dari modul beban — ia tak pernah menyentuh
      angka yang BENAR-BENAR dipakai memilih tulangan.

      Pada contoh ini bedanya nyata: 72.89999999999999 -> 72.9.

      Jadi yang diperiksa di bawah adalah PEMAKAIANNYA: usulan yang dipilih
      harus identik dengan usulan dari `sarankanBalok` yang diberi Mu/Vu apa
      adanya.
    */
    const tanpaBeban = sarankanBalok({
      bMm: BALOK_HUNIAN.bMm, hMm: BALOK_HUNIAN.hMm,
      panjangM: BALOK_HUNIAN.panjangM, selimutMm: BALOK_HUNIAN.selimutMm,
      mutu: MUTU, muKnm: langsung.muKnm, vuKn: langsung.vuKn,
    })
    expect(hasil.terpilih).toEqual(tanpaBeban.terpilih)

    /*
      Perbandingan usulan saja TIDAK cukup — terbukti lewat dua mutasi yang
      LOLOS: `Math.round(mu*10)/10` dan bahkan `Math.floor(mu)`.

      Dua sebabnya, dan keduanya perlu diketahui sebelum menambah test di sini:

        1. Ruang pencarian kasar (6 diameter x 5 jumlah x 3 sengkang x 7 jarak),
           jadi menggeser Mu sedikit jarang membalik kandidat yang menang.
        2. Pada balok contoh di atas, pemeriksaan yang KRITIS ternyata "Jarak
           sengkang maksimum" — batas GEOMETRI yang tak memuat Mu sama sekali.
           Berapa pun Mu digeser, rasio kritisnya tak bergerak.

      Karena itu kepekaan terhadap Mu diuji di test TERPISAH di bawah, dengan
      balok yang LENTURNYA menentukan. Di sini cukup dipastikan usulannya sama.
    */
  })

  /**
   * Balok kantor bentang 8 m — dipilih KHUSUS karena LENTUR yang menentukan.
   *
   * Balok hunian di atas tidak bisa dipakai untuk ini: pemeriksaan kritisnya
   * "Jarak sengkang maksimum", batas geometri yang tak memuat Mu. Test
   * kepekaan Mu di atas balok itu akan HIJAU selamanya, apa pun yang terjadi
   * pada momennya — dan itu bukan test, itu hiasan.
   */
  const BALOK_LENTUR_KRITIS: InputSaranDariBeban = {
    bMm: 300, hMm: 600, panjangM: 8, selimutMm: 30, mutu: MUTU,
    beban: {
      bentangM: 8, lebarPikulM: 3, tebalPelatMm: 130,
      lapisMati: ['keramik-spesi'], fungsiRuangKunci: 'kantor',
      skema: 'sederhana',
    },
  }

  it('PEKA terhadap Mu — hitungan kedua sekecil apa pun ketahuan', () => {
    const hasil = sarankanBalokDariBeban(BALOK_LENTUR_KRITIS)
    expect(hasil.berhasil).toBe(true)
    // Prasyarat test ini. Kalau suatu hari lentur tak lagi menentukan di sini,
    // test ini berhenti menjaga apa pun — dan baris ini yang memberitahu.
    expect(
      hasil.terpilih!.pemeriksaanKritis,
      'fixture tak lagi lentur-kritis — test kepekaan Mu jadi hampa, ganti fixturenya',
    ).toBe('Lentur')

    // Rasio kritis WAJIB cocok dengan Mu yang dilaporkan, sampai digit terakhir.
    // Membulatkan Mu di jalur sambungan menggeser angka ini.
    const rasioSeharusnya = analisaBalok({
      bMm: BALOK_LENTUR_KRITIS.bMm, hMm: BALOK_LENTUR_KRITIS.hMm,
      panjangM: BALOK_LENTUR_KRITIS.panjangM,
      selimutMm: BALOK_LENTUR_KRITIS.selimutMm, mutu: MUTU,
      muKnm: hasil.beban.muKnm, vuKn: hasil.beban.vuKn,
      dUtamaMm: hasil.terpilih!.dUtamaMm, nTarik: hasil.terpilih!.nTarik,
      dSengkangMm: hasil.terpilih!.dSengkangMm,
      jarakSengkangMm: hasil.terpilih!.jarakSengkangMm,
    }).periksa.reduce((m, p) => (p.rasio > m ? p.rasio : m), 0)

    expect(
      hasil.terpilih!.rasioKritis,
      'rasio kritis tak cocok dengan Mu yang dilaporkan — ada hitungan kedua di jalur ini',
    ).toBe(rasioSeharusnya)
  })

  it('usulannya BENAR-BENAR aman terhadap Mu/Vu yang dilaporkannya sendiri', () => {
    const hasil = sarankanBalokDariBeban(BALOK_HUNIAN)
    expect(hasil.berhasil).toBe(true)
    const t = hasil.terpilih!

    // Jalankan lewat pemeriksa, memakai beban yang DILAPORKAN hasil ini.
    // Kalau sambungannya memberi Mu berbeda ke sarankanBalok, test ini merah.
    const verifikasi = analisaBalok({
      bMm: BALOK_HUNIAN.bMm, hMm: BALOK_HUNIAN.hMm,
      panjangM: BALOK_HUNIAN.panjangM, selimutMm: BALOK_HUNIAN.selimutMm,
      mutu: MUTU,
      muKnm: hasil.beban.muKnm, vuKn: hasil.beban.vuKn,
      dUtamaMm: t.dUtamaMm, nTarik: t.nTarik,
      dSengkangMm: t.dSengkangMm, jarakSengkangMm: t.jarakSengkangMm,
    })

    const gagal = verifikasi.periksa.filter((p) => !p.aman).map((p) => p.nama)
    expect(gagal, `usul tidak aman terhadap bebannya sendiri: ${gagal.join(', ')}`).toEqual([])
  })

  it('rincian penyusun beban ikut terbawa — supaya angkanya bisa diperiksa', () => {
    const hasil = sarankanBalokDariBeban(BALOK_HUNIAN)

    // Berat sendiri, pelat, keramik, dinding — masing-masing terpisah.
    expect(hasil.beban.rincianMati.length).toBeGreaterThanOrEqual(3)
    const nama = hasil.beban.rincianMati.map((r) => r.nama).join(' ').toLowerCase()
    expect(nama).toMatch(/pelat/)
    expect(nama).toMatch(/dinding/)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // CATATAN — batas kedua modul WAJIB ikut, tak boleh salah satu hilang
  // ══════════════════════════════════════════════════════════════════════════
  it('catatan beban DAN catatan tulangan sama-sama terbawa', () => {
    const hasil = sarankanBalokDariBeban(BALOK_HUNIAN)
    const gabung = hasil.catatan.join(' ')

    // Dari mesin tulangan: batas tanggung jawab.
    expect(gabung).toMatch(/ESTIMASI AWAL/i)
    // Dari modul beban: koefisien perkiraan, BUKAN analisa rangka.
    // Tanpa ini pemakainya mengira angkanya lebih pasti daripada sebenarnya.
    expect(gabung).toMatch(/perkiraan|pendekatan|rangka|menerus/i)
  })

  it('skema kantilever menghasilkan momen jauh lebih besar — dan usulannya ikut', () => {
    /*
      wL²/2 vs wL²/11 — lima setengah kali lipat. Kalau sambungan ini
      mengabaikan `skema` (mis. selalu memakai bawaan 'sederhana'), test ini
      merah. Itu kesalahan yang paling mahal di modul beban, dan hasilnya
      tetap "terlihat wajar".
    */
    const menerus = sarankanBalokDariBeban(BALOK_HUNIAN)
    const kantilever = sarankanBalokDariBeban({
      ...BALOK_HUNIAN,
      beban: { ...BALOK_HUNIAN.beban, skema: 'kantilever' },
    })

    expect(kantilever.beban.muKnm).toBeGreaterThan(menerus.beban.muKnm * 3)
  })

  it('beban yang terlalu berat: gagal terus terang + usul tinggi', () => {
    const berat = sarankanBalokDariBeban({
      bMm: 200, hMm: 250, panjangM: 7, selimutMm: 30, mutu: MUTU,
      beban: {
        bentangM: 7, lebarPikulM: 5, tebalPelatMm: 150,
        lapisMati: ['keramik-spesi'],
        fungsiRuangKunci: 'perpustakaan-rak',
        skema: 'sederhana',
      },
    })

    expect(berat.berhasil).toBe(false)
    // Bebannya tetap DILAPORKAN meski gagal — tanpa itu pemakainya tak tahu
    // seberapa jauh dari cukup, dan tak bisa memutuskan apa yang diubah.
    expect(berat.beban.muKnm).toBeGreaterThan(0)
    expect(berat.catatan.join(' ')).toMatch(/lentur|geser|tak ada kombinasi/i)
  })

  it('menolak beban tak lengkap, bukan mengarang bawaan', () => {
    // Tanpa fungsi ruang MAUPUN angka beban hidup: modul beban akan menolak.
    // Yang tak boleh terjadi: diam-diam memakai 0 lalu mengusulkan tulangan
    // untuk balok yang tak memikul apa-apa.
    /*
      ⚠ `toThrow()` polos TIDAK CUKUP di sini, dan itu terbukti: versi pertama
      test ini HIJAU sebelum `sarankanBalokDariBeban` ada sama sekali — galat
      "bukan sebuah fungsi" pun memenuhinya. Test yang tak bisa gagal karena
      alasan yang benar tak menjaga apa pun.

      Karena itu pesannya dicocokkan: harus menyebut beban hidupnya.
    */
    expect(() => sarankanBalokDariBeban({
      ...BALOK_HUNIAN,
      beban: { ...BALOK_HUNIAN.beban, fungsiRuangKunci: undefined },
    })).toThrow(/beban hidup|fungsi ruang/i)
  })
})

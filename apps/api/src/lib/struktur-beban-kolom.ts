/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BEBAN AKSIAL KOLOM — dari lantai yang dipikulnya, bukan diketik
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── Kenapa terpisah dari balok
 *
 * Balok memikul beban LUASAN di sepanjang bentangnya; momennya wL²/8. Kolom
 * memikul beban TITIK yang menumpuk dari setiap lantai di atasnya, dan
 * angkanya bertambah ke bawah:
 *
 *     lantai atap  : 1 lantai  ->  Pu kecil
 *     lantai dasar : N lantai  ->  Pu N kali lipat + berat kolom sendiri
 *
 * Menyalin rumus balok ke kolom akan menghasilkan angka yang sama sekali
 * berbeda kelasnya, dan tetap "terlihat wajar" — kN adalah kN.
 *
 * ── Yang membuat kolom berbahaya: REDUKSI beban hidup
 *
 * SNI 1727:2020 §4.7 mengizinkan beban hidup DIKURANGI untuk elemen yang
 * memikul luas besar, karena mustahil seluruh lantai penuh serentak. Kolom
 * lantai dasar gedung 8 lantai memikul ratusan m² — reduksinya bisa mencapai
 * 40%, dan mengabaikannya membuat kolom jauh lebih besar dari perlu.
 *
 * Tapi reduksi itu punya SYARAT, dan menerapkannya di tempat yang salah
 * berbahaya. Modul ini menerapkannya HANYA bila syaratnya terpenuhi, dan
 * menyebutkan angkanya di catatan supaya bisa diperiksa.
 *
 * ── Yang TIDAK dihitung
 *
 * Momen kolom akibat portal (kekakuan balok-kolom, goyangan) TIDAK dihitung —
 * itu pekerjaan pemodelan rangka. Momen tetap diketik, dan batas itu
 * dinyatakan, bukan disembunyikan.
 */

import { fungsiRuang, lapisMatiDari } from './struktur-katalog-beban.js'

export interface InputBebanKolom {
  /** Luas lantai yang dipikul kolom ini per lantai (m²). */
  luasTributariM2: number
  /** Berapa lantai yang ditumpu kolom ini (termasuk atap). */
  jumlahLantai: number
  /** Tinggi antar-lantai (m) — untuk berat sendiri kolom. */
  tinggiLantaiM: number
  bMm: number
  hMm: number
  tebalPelatMm: number
  /** Kunci lapisan dari katalog. */
  lapisMati?: readonly string[]
  bebanMatiTambahan?: Array<{ nama: string; nilai: number }>
  /** Fungsi ruang (SNI 1727 Tabel 4.3-1) atau angka langsung. */
  fungsiRuangKunci?: string
  bebanHidupKnM2?: number
  /** Beban dinding yang dipikul kolom lewat balok (kN/m²) — opsional. */
  bebanDindingKnM2?: number
  /** Terapkan reduksi beban hidup SNI 1727 §4.7. Bawaan: true. */
  pakaiReduksi?: boolean
  beratJenisBetonKnM3?: number
}

export interface HasilBebanKolom {
  /** Beban aksial terfaktor (kN) — inilah `puKn` untuk analisa kolom. */
  puKn: number
  /** Tak terfaktor, untuk pemeriksaan layan. */
  pMatiKn: number
  pHidupKn: number
  /** Beban hidup sesudah reduksi (kN). */
  pHidupTereduksiKn: number
  /** Faktor reduksi yang dipakai (1 = tanpa reduksi). */
  faktorReduksi: number
  /** Luas tributari kumulatif (m²) — dasar reduksi. */
  luasKumulatifM2: number
  rincian: Array<{ nama: string; kn: number }>
  catatan: string[]
}

function angka(nilai: unknown, nama: string, { bolehNol = false } = {}): number {
  const n = Number(nilai)
  if (!Number.isFinite(n)) throw new Error(`${nama} wajib angka (diterima: ${nilai})`)
  if (n < 0) throw new Error(`${nama} tak boleh negatif (diterima: ${n})`)
  if (!bolehNol && n === 0) throw new Error(`${nama} harus lebih besar dari nol`)
  return n
}

/**
 * Faktor reduksi beban hidup — SNI 1727:2020 §4.7.2.
 *
 *     L = Lo × (0,25 + 4,57/√(KLL·AT))
 *
 * dengan KLL = 4 untuk kolom dalam, dan batas bawah 0,4 (kolom memikul lebih
 * dari satu lantai).
 *
 * ⚠ TIDAK berlaku untuk: beban hidup > 4,79 kN/m² pada tempat berkumpul,
 * garasi parkir umum, dan atap. Penerapan di sana membuat elemen kurang kuat,
 * dan itu arah kesalahan yang berbahaya — karena itu dijaga di pemanggilnya.
 */
export function faktorReduksiBebanHidup(
  luasKumulatifM2: number, kll = 4,
): number {
  const at = Number(luasKumulatifM2)
  if (!Number.isFinite(at) || at <= 0) return 1
  const klAt = kll * at
  /*
    Di bawah 37,2 m² (400 ft²) tak ada reduksi sama sekali — SNI menetapkan
    reduksi hanya bila KLL·AT ≥ 37,2 m².
  */
  if (klAt < 37.2) return 1
  const f = 0.25 + 4.57 / Math.sqrt(klAt)
  /* Batas bawah 0,4 untuk elemen yang memikul >1 lantai. */
  return Math.max(0.4, Math.min(1, f))
}

/** Hitung beban aksial kolom dari lantai yang dipikulnya. */
export function analisaBebanKolom(input: InputBebanKolom): HasilBebanKolom {
  const luas = angka(input.luasTributariM2, 'Luas tributari (luasTributariM2)')
  const nLantai = angka(input.jumlahLantai, 'Jumlah lantai (jumlahLantai)')
  const tinggiLantai = angka(input.tinggiLantaiM, 'Tinggi lantai (tinggiLantaiM)')
  const b = angka(input.bMm, 'Lebar kolom (bMm)')
  const h = angka(input.hMm, 'Tinggi penampang kolom (hMm)')
  const tebalPelat = angka(input.tebalPelatMm, 'Tebal pelat (tebalPelatMm)', { bolehNol: true })

  if (!Number.isInteger(nLantai)) {
    throw new Error(`Jumlah lantai harus bilangan bulat (diterima: ${input.jumlahLantai})`)
  }

  /* ── Beban mati: sama polanya dengan balok ── */
  const dariKatalog = input.lapisMati?.length ? lapisMatiDari(input.lapisMati) : []
  const dariAngka = Array.isArray(input.bebanMatiTambahan) ? input.bebanMatiTambahan : null
  if (!dariAngka && !input.lapisMati) {
    throw new Error(
      'Beban mati tambahan wajib diisi: `lapisMati` (kunci katalog) atau '
      + '`bebanMatiTambahan` (daftar angka). Kirim [] bila memang tak ada.')
  }

  /* ── Beban hidup: fungsi ruang menang atas angka ── */
  let hidupKnM2 = input.bebanHidupKnM2
  let namaFungsi: string | null = null
  if (input.fungsiRuangKunci) {
    const f = fungsiRuang(input.fungsiRuangKunci)
    if (!f) throw new Error(`Fungsi ruang "${input.fungsiRuangKunci}" tak dikenal.`)
    hidupKnM2 = f.bebanHidupKnM2
    namaFungsi = f.nama
  }
  if (hidupKnM2 === undefined || hidupKnM2 === null) {
    throw new Error(
      'Beban hidup wajib: pilih `fungsiRuangKunci` (SNI 1727 Tabel 4.3-1) '
      + 'atau isi `bebanHidupKnM2` langsung.')
  }
  const hidup = angka(hidupKnM2, 'Beban hidup', { bolehNol: true })

  const bjBeton = Number(input.beratJenisBetonKnM3 ?? 24)
  const catatan: string[] = []
  const rincian: Array<{ nama: string; kn: number }> = []

  /* 1. Pelat semua lantai. */
  if (tebalPelat > 0) {
    const perLantai = (tebalPelat / 1000) * bjBeton * luas
    rincian.push({
      nama: `Pelat t=${tebalPelat} mm × ${luas} m² × ${nLantai} lantai`,
      kn: perLantai * nLantai,
    })
  }

  /* 2. Lapisan finishing semua lantai. */
  let matiTambahanKnM2 = 0
  for (const l of [...dariKatalog, ...(dariAngka ?? [])]) {
    const n = Number(l?.nilai)
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`Beban mati "${l?.nama ?? '(tanpa nama)'}" bukan angka sah: ${l?.nilai}`)
    }
    matiTambahanKnM2 += n
  }
  if (matiTambahanKnM2 > 0) {
    rincian.push({
      nama: `Finishing ${matiTambahanKnM2.toFixed(2)} kN/m² × ${luas} m² × ${nLantai} lantai`,
      kn: matiTambahanKnM2 * luas * nLantai,
    })
  }

  /* 3. Dinding, bila ada. */
  const dinding = Number(input.bebanDindingKnM2 ?? 0)
  if (dinding > 0) {
    rincian.push({
      nama: `Dinding ${dinding} kN/m² × ${luas} m² × ${nLantai} lantai`,
      kn: dinding * luas * nLantai,
    })
  }

  /*
    4. Berat sendiri KOLOM — sering terlupa, dan pada gedung tinggi ia bukan
    angka kecil: kolom 400×400 setinggi 3,5 m × 8 lantai = 107 kN, setara
    beban hidup 22 m² lantai kantor.
  */
  const beratKolom = (b / 1000) * (h / 1000) * bjBeton * tinggiLantai * nLantai
  rincian.push({
    nama: `Berat sendiri kolom ${b}×${h} × ${tinggiLantai} m × ${nLantai} lantai`,
    kn: beratKolom,
  })

  const pMatiKn = rincian.reduce((a, x) => a + x.kn, 0)
  const pHidupKn = hidup * luas * nLantai

  /*
    ── REDUKSI beban hidup (SNI 1727 §4.7)

    Mustahil seluruh lantai penuh serentak. Kolom lantai dasar gedung 8 lantai
    memikul ratusan m², dan reduksinya bisa mencapai 40%.

    TIDAK diterapkan bila:
      · beban hidup > 4,79 kN/m² (tempat berkumpul — orang memang berkerumun)
      · parkir umum
      · atap
    Menerapkannya di sana membuat elemen KURANG kuat.
  */
  const luasKumulatif = luas * nLantai
  const bolehReduksi = (input.pakaiReduksi ?? true)
    && hidup <= 4.79
    && !/parkir/i.test(input.fungsiRuangKunci ?? '')
    && !/atap/i.test(input.fungsiRuangKunci ?? '')
  const faktorReduksi = bolehReduksi ? faktorReduksiBebanHidup(luasKumulatif) : 1
  const pHidupTereduksiKn = pHidupKn * faktorReduksi

  const puKn = 1.2 * pMatiKn + 1.6 * pHidupTereduksiKn

  // ── Catatan ───────────────────────────────────────────────────────────────
  catatan.push(
    `Beban aksial dari ${nLantai} lantai × ${luas} m² tributari. `
    + `D = ${pMatiKn.toFixed(1)} kN, L = ${pHidupKn.toFixed(1)} kN`
    + (faktorReduksi < 1 ? ` (tereduksi jadi ${pHidupTereduksiKn.toFixed(1)} kN)` : '')
    + `. Pu = 1,2D + 1,6L = ${puKn.toFixed(1)} kN.`)

  if (namaFungsi) {
    catatan.push(
      `Beban hidup ${hidup} kN/m² dari fungsi ruang "${namaFungsi}" `
      + '(SNI 1727:2020 Tabel 4.3-1) — dipilih dari katalog, bukan diketik.')
  }

  if (faktorReduksi < 1) {
    catatan.push(
      `Beban hidup DIREDUKSI ${Math.round((1 - faktorReduksi) * 100)}% `
      + `(faktor ${faktorReduksi.toFixed(3)}) atas luas kumulatif `
      + `${luasKumulatif.toFixed(0)} m² — SNI 1727:2020 §4.7.2, L = Lo(0,25 + 4,57/√(KLL·AT)) `
      + 'dengan KLL = 4. Reduksi ini sah karena mustahil seluruh lantai penuh serentak.')
  } else if (input.pakaiReduksi === false) {
    catatan.push('Reduksi beban hidup SENGAJA dimatikan — hasilnya konservatif.')
  } else if (hidup > 4.79) {
    catatan.push(
      `Beban hidup ${hidup} kN/m² melebihi 4,79 — reduksi SNI §4.7 TIDAK berlaku `
      + 'untuk tempat berkumpul. Di sana orang memang berkerumun serentak.')
  }

  catatan.push(
    'Yang BELUM dihitung: momen kolom akibat portal (kekakuan balok-kolom, '
    + 'goyangan, dan beban gempa). Modul ini menghitung beban AKSIAL saja — '
    + 'momen tetap harus dimasukkan dari analisa rangka.')

  if (nLantai > 1) {
    catatan.push(
      'Angka ini untuk kolom yang memikul SELURUH lantai di atasnya. Kolom di '
      + 'lantai atas memikul lebih sedikit — hitung terpisah per lantai bila '
      + 'ukurannya berbeda.')
  }

  return {
    puKn, pMatiKn, pHidupKn, pHidupTereduksiKn,
    faktorReduksi, luasKumulatifM2: luasKumulatif,
    rincian, catatan,
  }
}

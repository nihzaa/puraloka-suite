/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DIAGRAM M / V / LENDUTAN DARI DERET TITIK SOLVER RANGKA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── Kenapa berkas BARU, bukan memakai ulang `gambarDiagramBeban`
 *
 * `gambarDiagramBeban` terikat ke `HasilBebanBalok` (koefisien pendekatan) dan
 * menggambar bentuknya dari RUMUS: parabola `4x(1−x)` untuk balok sederhana,
 * `(1−x)²` untuk kantilever. Bentuk itu benar hanya untuk dua skema yang
 * memang dikenalnya.
 *
 * Solver rangka punya deret titik NYATA — `HasilBatang.momenKnm.di[]` dan
 * saudara-saudaranya, hasil penyelesaian kekakuan langsung. Itu data yang
 * lebih baik. Menggambarnya lewat adaptor ke bentuk lama berarti menampilkan
 * diagram yang BUKAN hasil solvernya: balok menerus yang momen tumpuannya
 * negatif akan digambar sebagai parabola tunggal yang nol di kedua ujung, dan
 * selisihnya tak terlihat karena keduanya "berbentuk parabola".
 *
 * Karena itu penggambar ini tak menghitung apa pun tentang bentuk. Ia hanya
 * menskalakan dan menghubungkan titik yang sudah dihitung solver.
 *
 * ── Yang TIDAK boleh dihitung ulang di sini: nilai kritis
 *
 * Label puncak memakai `momenKnm.maks/min` dan `geserKn.maks/min`, bukan
 * `Math.max(...di)`. Solver sengaja memisahkan keduanya: `di[]` adalah 11
 * cuplikan untuk MENGGAMBAR, sedangkan `maks/min` sudah memuat puncak
 * ANALITIS yang jarang jatuh di titik cuplikan.
 *
 * Terukur pada balok menerus dua bentang (w=20, L=6): puncak sesungguhnya
 * 50,625 kNm, cuplikan tertinggi 50,400 kNm. Kalau label memakai maksimum
 * deret, angka di layar LEBIH KECIL dari angka yang dipakai memilih tulangan —
 * dan keduanya sama-sama terlihat wajar.
 *
 * ── Tata letak
 *
 * Tiga panel bertumpuk pada satu sumbu-x yang sama (pola `struktur-gambar-
 * beban.ts`), supaya posisi puncak momen, lompatan geser, dan puncak lendutan
 * bisa dibaca sejajar. Lebar dan margin sengaja SAMA dengan `gambarDiagram-
 * Beban` (520 / 46) supaya keduanya sejajar bila ditampilkan berdampingan.
 *
 * PURE — tanpa I/O, seperti seluruh `struktur-*.ts` dan `rangka-*.ts`.
 */

import type { HasilBatang, TitikNilai } from './rangka-model.js'

const WARNA = {
  batang: '#1f2937',
  momen: '#dc2626',
  geser: '#059669',
  lendutan: '#7c3aed',
  dimensi: '#6b7280',
  teks: '#111827',
} as const

function amankanTeks(s: string): string {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

function bulat(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Angka gaya Indonesia — koma desimal, dua angka di belakang koma.
 *
 * Konsisten dengan penggambar lain di modul ini. `toLocaleString` sengaja
 * TIDAK dipakai: hasilnya bergantung locale mesin/proses, dan SVG yang sama
 * lalu berbeda antara mesin pengembang dan server — selisih yang tak
 * menimbulkan galat apa pun.
 */
function angka(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return bulat(n).toFixed(2).replace('.', ',')
}

function teks(x: number, y: number, isi: string, ukuran: number,
  warna: string = WARNA.teks, anchor = 'middle'): string {
  return `<text x="${bulat(x)}" y="${bulat(y)}" font-size="${ukuran}" fill="${warna}" `
    + `text-anchor="${anchor}" font-family="system-ui, sans-serif">${amankanTeks(isi)}</text>`
}

function garis(x1: number, y1: number, x2: number, y2: number,
  warna: string, tebal = 2, putus = false): string {
  return `<line x1="${bulat(x1)}" y1="${bulat(y1)}" x2="${bulat(x2)}" y2="${bulat(y2)}" `
    + `stroke="${warna}" stroke-width="${tebal}"${putus ? ' stroke-dasharray="4 3"' : ''} />`
}

export interface OpsiDiagramRangka {
  /** Lebar render, px. viewBox tetap 520 — hanya atribut `width` yang berubah. */
  lebar?: number
  /** Judul yang dibacakan pembaca layar; bila kosong dirakit dari nilai kritis. */
  uraian?: string
}

/** Lebar kanvas & margin — SAMA dengan `gambarDiagramBeban` (sejajar bila berdampingan). */
const W = 520
const MARGIN = 46
const LEBAR_GAMBAR = W - 2 * MARGIN

/*
  Tinggi & jarak antar-panel — angka ini hasil MELIHAT, bukan hitungan.

  Tiap panel butuh ruang di ATAS garis nolnya (untuk nilai positif + judul
  panel) dan di BAWAH (untuk nilai negatif + label). Panel yang lebih rapat
  membuat label puncak panel atas menimpa judul panel di bawahnya — persis
  cacat yang tercatat di `struktur-gambar-beban.ts` ("+96,26 kN" menimpa
  "DIAGRAM GAYA LINTANG").

  Momen menerus PUNYA nilai negatif di tumpuan, jadi tiap panel di sini
  harus menyediakan ruang dua arah — beda dengan penggambar lama yang tahu
  arah diagramnya dari skema.
*/
const AMPLITUDO = 42        // simpangan maksimum kurva dari garis nol, px
const RUANG_LABEL = 22      // ruang tambahan supaya label tak keluar bidang
/**
 * Kira-kira selebar judul panel terpanjang ("DIAGRAM GAYA LINTANG / GESER
 * (kN)" ~250 px pada 12 px system-ui). Dipakai menggeser label yang terdorong
 * ke baris judul supaya tak berdesakan dengannya.
 *
 * Angka hasil MELIHAT, bukan mengukur glif: geseran yang terlalu kecil
 * menyisakan desakan, yang terlalu besar melempar label ke tengah bidang dan
 * memutus kaitannya dengan titik yang diwakilinya.
 */
const LEBAR_JUDUL_PX = 262
const TINGGI_PANEL = 2 * (AMPLITUDO + RUANG_LABEL)   // 128
const JUDUL_KE_NOL = AMPLITUDO + RUANG_LABEL          // judul di tepi atas panel

/**
 * Diagram momen, gaya lintang, dan lendutan satu batang hasil solver rangka.
 *
 * @param batang   keluaran solver — deret titiknya dipakai APA ADANYA
 * @param panjangM panjang batang, m (bentang untuk balok, tinggi untuk kolom)
 *
 * @throws bila `panjangM` tak sah. Melempar itu sengaja: panjang nol membuat
 *   seluruh koordinat-x menjadi Infinity/NaN, dan SVG-nya tetap sah — gambar
 *   kosong tanpa satu pun galat.
 */
export function gambarDiagramRangka(
  batang: HasilBatang, panjangM: number, opsi: OpsiDiagramRangka = {},
): string {
  if (!Number.isFinite(panjangM) || panjangM <= 0) {
    throw new Error(
      `gambarDiagramRangka: panjang batang ${batang.nama} tak sah (${panjangM}) — harus angka > 0`,
    )
  }

  const bagian: string[] = []
  /** Label kritis yang benar-benar tergambar — sumber tunggal `aria-label`. */
  const terbaca: string[] = []

  /* Garis nol tiap panel. Kepala gambar 30 px untuk nama batang. */
  const KEPALA = 30
  const yMomen = KEPALA + JUDUL_KE_NOL
  const yGeser = yMomen + TINGGI_PANEL
  const yLendut = yGeser + TINGGI_PANEL
  const H = yLendut + AMPLITUDO + RUANG_LABEL + 26   // + kaki keterangan

  const px = (m: number) => MARGIN + (m / panjangM) * LEBAR_GAMBAR

  // ── Kepala: nama batang + aksial (satu-satunya besaran yang tak berdiagram).
  bagian.push(teks(MARGIN, 18, `BATANG ${batang.nama}`, 12, WARNA.batang, 'start'))
  /*
    Arah aksial hanya disebut bila BESARANNYA berarti. Balok mendatar memberi
    aksial −0 (nol negatif), dan `< 0` menjadikannya "tekan" — sedangkan
    format dua desimalnya menulis "0,00". Sebelum ini terbaca "0,00 kN
    (tarik)": nol yang diberi arah, keterangan yang mengaku tahu lebih banyak
    daripada angkanya sendiri.
  */
  const aksialBerarti = Math.abs(batang.aksialKn) >= 0.005
  bagian.push(teks(MARGIN + LEBAR_GAMBAR, 18,
    `aksial ${angka(batang.aksialKn)} kN`
    + (aksialBerarti ? ` (${batang.aksialKn < 0 ? 'tekan' : 'tarik'})` : ''),
    10, WARNA.dimensi, 'end'))

  panel(bagian, terbaca, {
    yNol: yMomen,
    judul: 'DIAGRAM MOMEN (kNm)',
    warna: WARNA.momen,
    di: batang.momenKnm.di,
    /*
      Nilai KRITIS dari solver — bukan dari deret. Lihat header berkas:
      50,625 vs 50,400 pada balok menerus, dan yang kecil terlihat wajar.
    */
    kritisAtas: batang.momenKnm.maks,
    kritisBawah: batang.momenKnm.min,
    px,
    /*
      Konvensi teknik sipil: momen digambar di sisi SERAT TARIK. Momen positif
      (serat bawah tertarik, lihat header `rangka-model.ts`) digambar ke BAWAH.
      Menggambarnya terbalik membuat orang menaruh tulangan di sisi yang salah.
    */
    positifKeAtas: false,
    satuan: 'kNm',
  })

  panel(bagian, terbaca, {
    yNol: yGeser,
    /*
      Judulnya menyebut KEDUANYA: "gaya lintang" istilah SNI, "geser" kata
      yang dipakai orang lapangan. Plan Step 3 menuntut panel GESER, dan
      pembaca layar mendapat frasa yang sama dengan yang terbaca di layar.
    */
    judul: 'DIAGRAM GAYA LINTANG / GESER (kN)',
    warna: WARNA.geser,
    di: batang.geserKn.di,
    kritisAtas: batang.geserKn.maks,
    kritisBawah: batang.geserKn.min,
    px,
    positifKeAtas: true,
    satuan: 'kN',
  })

  /*
    Lendutan TIDAK punya `min` (lihat `HasilBatang`) — `maks` adalah |lendutan|
    terbesar, jadi tandanya hilang. Nilai kritisnya karena itu diambil dari
    titik deret yang |nilai|-nya terbesar, supaya labelnya jatuh di sisi yang
    benar; besarannya sendiri tetap dari `lendutanMm.maks` yang sudah memuat
    puncak analitis hasil bagi-dua di solver.
  */
  const puncakLendut = batang.lendutanMm.di.reduce<TitikNilai | undefined>(
    (t, p) => (t && Math.abs(t.nilai) >= Math.abs(p.nilai) ? t : p), undefined)
  const lendutTurun = (puncakLendut?.nilai ?? 0) < 0
  panel(bagian, terbaca, {
    yNol: yLendut,
    judul: 'DIAGRAM LENDUTAN (mm)',
    warna: WARNA.lendutan,
    di: batang.lendutanMm.di,
    /* Hanya satu label: besaran kritisnya tunggal, ditaruh di sisi lengkungnya. */
    kritisAtas: lendutTurun ? 0 : batang.lendutanMm.maks,
    kritisBawah: lendutTurun ? -batang.lendutanMm.maks : 0,
    px,
    /* Lendutan ke bawah bernilai negatif → digambar ke bawah: apa adanya. */
    positifKeAtas: true,
    satuan: 'mm',
  })

  // ── Kaki: sumbu-x, satu-satunya keterangan panjang batang.
  bagian.push(garis(MARGIN, H - 18, MARGIN + LEBAR_GAMBAR, H - 18, WARNA.dimensi, 1))
  bagian.push(teks(MARGIN, H - 6, 'x = 0', 9, WARNA.dimensi, 'start'))
  bagian.push(teks(MARGIN + LEBAR_GAMBAR / 2, H - 6,
    `L = ${angka(panjangM)} m`, 10, WARNA.dimensi))
  bagian.push(teks(MARGIN + LEBAR_GAMBAR, H - 6,
    `x = ${angka(panjangM)} m`, 9, WARNA.dimensi, 'end'))

  /*
    ⚠ `aria-label` dirakit dari `terbaca` — deretan label yang BENAR-BENAR
    tergambar — bukan dari `batang.*` lagi.

    Alasannya ditemukan lewat mutasi wajib Step 5a, yang SELAMAT: saat label
    tampak diganti ke maksimum deret (50,40), `aria-label` masih dirakit
    sendiri dari `momenKnm.maks` dan tetap memuat "50,63". Testnya hijau
    karena `toMatch` mencari di SELURUH SVG.

    Dua sumber untuk satu angka berarti pembaca layar dan pembaca awas bisa
    diberi tahu dua nilai berbeda, dan keduanya terlihat wajar — bentuk cacat
    yang sama dengan pembulatan 5b43d275. Satu sumber menutupnya.
  */
  const judul = opsi.uraian
    ?? `Diagram momen, gaya lintang, dan lendutan batang ${batang.nama} `
      + `sepanjang ${angka(panjangM)} m — ${terbaca.join('; ')}`
      + `; aksial ${angka(batang.aksialKn)} kN`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" `
    + `width="${opsi.lebar ?? W}" role="img" aria-label="${amankanTeks(judul)}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

interface Panel {
  yNol: number
  judul: string
  warna: string
  /** Deret titik SOLVER — inilah yang membuat diagram memakai hitungannya. */
  di: TitikNilai[]
  kritisAtas: number
  kritisBawah: number
  px: (m: number) => number
  positifKeAtas: boolean
  satuan: string
  /** Diisi `panel()`; dipakai `labelKritis` menaruh label di luar kurva. */
  skala?: number
}

/** Satu panel diagram: judul, garis nol, kurva dari deret titik, label kritis. */
function panel(keluar: string[], terbaca: string[], p: Panel): void {
  const { yNol, warna, px } = p

  /*
    Skala dari deret INI SENDIRI, bukan dari skala bersama: momen kNm dan
    lendutan mm berbeda dua orde besaran, dan skala bersama membuat salah
    satunya rata dengan garis nol.

    Nilai kritis ikut masuk pembanding — puncak analitis bisa MELEBIHI seluruh
    cuplikan (50,625 > 50,400), dan skala yang hanya melihat deret membuat
    labelnya menunjuk angka yang lebih besar daripada kurva yang digambar.

    Pembagi nol → pakai 1. Kolom tanpa beban merata memberi deret lendutan nol
    seluruhnya; membagi dengan rentang nol menghasilkan NaN di koordinat SVG —
    gambar kosong tanpa satu pun galat.
  */
  const puncak = Math.max(
    ...p.di.map((t) => Math.abs(t.nilai)),
    Math.abs(p.kritisAtas), Math.abs(p.kritisBawah),
  )
  const skala = puncak > 0 && Number.isFinite(puncak) ? AMPLITUDO / puncak : 0
  p.skala = skala

  /** Nilai → koordinat y. Arah sumbu SVG ke bawah, jadi tanda dibalik. */
  const arah = p.positifKeAtas ? -1 : 1
  const y = (nilai: number) => yNol + arah * nilai * skala

  const yJudul = yNol - JUDUL_KE_NOL + 10
  keluar.push(teks(MARGIN, yJudul, p.judul, 11, warna, 'start'))
  keluar.push(garis(MARGIN, yNol, MARGIN + LEBAR_GAMBAR, yNol, WARNA.dimensi, 1))

  /*
    Polyline dari `di[]` — INI yang membuat diagram memakai hitungan solver.
    Menggantinya dengan rumus (parabola, segitiga) menggambar sesuatu yang
    bukan hasil solvernya; dijaga test "memakai deret titik SOLVER".
  */
  const titik = p.di.map((t) => `${bulat(px(t.xM))},${bulat(y(t.nilai))}`)
  if (titik.length > 0) {
    /* Bidang terisi supaya tanda (di atas / di bawah garis nol) langsung terbaca. */
    keluar.push(
      `<polygon points="${bulat(px(p.di[0]!.xM))},${bulat(yNol)} ${titik.join(' ')} `
      + `${bulat(px(p.di[p.di.length - 1]!.xM))},${bulat(yNol)}" `
      + `fill="${warna}" fill-opacity="0.13" stroke="none" />`)
    keluar.push(`<polyline points="${titik.join(' ')}" fill="none" `
      + `stroke="${warna}" stroke-width="2" />`)
  }

  /*
    Label nilai kritis. Ditaruh DI DALAM bidang diagramnya (55% amplitudo),
    bukan di luar — di luar ia menabrak judul panel berikutnya, cacat yang
    sudah pernah terjadi di penggambar lama.

    Nilai yang praktis nol tak diberi label: "0,00 kNm" di kedua sisi garis
    nol hanya menambah keramaian, dan dua label yang berimpit di garis yang
    sama saling menimpa.
  */
  const ambang = puncak * 1e-6
  const berskala = { ...p, skala, yJudul }
  const catat = (nilai: number) => {
    keluar.push(labelKritis(berskala, nilai, yNol, arah))
    terbaca.push(`${p.judul.replace(/^DIAGRAM /, '').replace(/ \(.*\)$/, '').toLowerCase()} `
      + `${angka(nilai)} ${p.satuan}`)
  }
  if (Math.abs(p.kritisAtas) > ambang) catat(p.kritisAtas)
  if (Math.abs(p.kritisBawah) > ambang) catat(p.kritisBawah)
}

/**
 * Label satu nilai kritis, ditaruh di sisi tempat kurvanya berada.
 *
 * Posisi-x mengikuti titik deret yang paling dekat ke nilai itu, supaya label
 * jatuh di dekat puncaknya — bukan selalu di tengah, yang untuk momen tumpuan
 * (puncaknya di ujung) menaruh angka di tempat kurvanya justru nol.
 */
function labelKritis(
  p: Panel & { skala: number; yJudul: number }, nilai: number,
  yNol: number, arah: number,
): string {
  const dekat = p.di.reduce<TitikNilai | undefined>(
    (t, q) => (t && Math.abs(t.nilai - nilai) <= Math.abs(q.nilai - nilai) ? t : q),
    undefined)
  const xM = dekat?.xM ?? 0
  const rasio = p.di.length > 1
    ? (xM - p.di[0]!.xM) / (p.di[p.di.length - 1]!.xM - p.di[0]!.xM || 1)
    : 0.5

  /*
    Jangkar teks digeser di dekat tepi: label 'middle' di x=0 separuhnya
    keluar dari viewBox, dan yang keluar bidang tak terbaca sama sekali.
  */
  const anchor = rasio < 0.12 ? 'start' : rasio > 0.88 ? 'end' : 'middle'

  /*
    Jangkar 'start'/'end' menaruh teks MULAI/BERAKHIR persis di titiknya, dan
    di x=0 / x=L itu berarti separuh glif jatuh di luar viewBox — terpotong,
    tak terbaca. Terlihat hanya dari MERENDER: "45,00 kN" terpangkas di tepi
    kiri dan "−45,00 kN" di tepi kanan, keduanya SVG yang sah.
  */
  const geser = rasio < 0.12 ? 4 : rasio > 0.88 ? -4 : 0
  const x = p.px(xM) + geser

  /*
    Label ditaruh DI LUAR puncak kurvanya, di pita RUANG_LABEL yang memang
    disediakan untuk itu — bukan di dalam bidang diagram.

    Sebelum ini labelnya duduk di 0,62·AMPLITUDO, yang untuk nilai kritis
    justru TEPAT di lintasan kurvanya sendiri: "50,63 kNm" tercoret garis
    momennya, "−90,00 kNm" tertimpa garis yang menanjak. Test tak bisa
    melihatnya; hanya merender yang bisa.

    `skala` dipakai supaya jaraknya mengikuti tinggi kurva SUNGGUHAN di titik
    itu, bukan selalu amplitudo penuh — label untuk nilai yang jauh dari
    puncak tak perlu melayang tinggi.
  */
  const arahNilai = Math.sign(nilai || 1)
  const yPuncak = yNol + arah * nilai * p.skala
  let yLabel = yPuncak + arah * arahNilai * 13

  /*
    ⚠ BARIS JUDUL PANEL DIPESAN — label tak boleh naik ke sana.

    Terlihat hanya dari MERENDER bentang KEDUA: puncak momen −90 kNm ada di
    ujung KIRI batang B2, jadi labelnya mendarat tepat di atas teks "DIAGRAM
    MOMEN (kNm)" — dua tulisan bertumpuk jadi bubur yang tak terbaca. Bentang
    pertama tampak sempurna karena puncaknya di ujung kanan, jauh dari judul.
    Satu kanvas, dua batang, satu tabrakan; persis pola yang sudah tercatat
    di `struktur-gambar-beban.ts`.

    Yang terlalu tinggi didorong turun ke bawah baris judul. Ruangnya ada:
    itulah gunanya RUANG_LABEL.
  */
  const batasAtas = p.yJudul + 12
  const didorong = yLabel < batasAtas
  if (didorong) yLabel = batasAtas

  /*
    ⚠ DUA hal yang masing-masing wajar, tapi BERSAMAAN membuat label
    berdesakan dengan judul panelnya.

    Ketika nilai ekstrem jatuh di ujung KIRI (x≈0), jangkarnya 'start' — teks
    mulai persis di tepi kiri bidang, tempat judul panel juga mulai. Kalau
    label itu SEKALIGUS terdorong turun ke `batasAtas`, keduanya berbaris di
    kolom yang sama, hanya berbeda 12 px: "DIAGRAM GAYA LINTANG / GESER (kN)"
    dengan "60,00 kN" menempel tepat di bawahnya.

    Terlihat pada balok portal B1 — geser ekstremnya memang di x=0 — dan
    TIDAK terlihat pada kolom, yang ekstremnya di ujung kanan. Satu
    penggambar, dua jenis batang, satu tabrakan; pola yang sama dengan
    tabrakan bentang kedua di atas.

    Digeser MENDATAR sejauh judulnya, bukan diturunkan lagi: menurunkannya
    akan menabrak kurva, dan itu justru cacat yang blok di atas perbaiki.
  */
  const xAkhir = didorong && anchor === 'start' ? x + LEBAR_JUDUL_PX : x

  return teks(xAkhir, yLabel, `${angka(nilai)} ${p.satuan}`, 11, p.warna, anchor)
}

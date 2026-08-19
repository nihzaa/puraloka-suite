// Penggambar SVG penampang & detail — pengganti VBA `Shapes.AddLine` workbook.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA SVG, DAN KENAPA HASILNYA LEBIH BAIK DARIPADA VERSI EXCEL
// ══════════════════════════════════════════════════════════════════════════════
//
// VBA workbook menggambar dengan `Shapes.AddLine`, `AddShape`, `AddTextbox` —
// primitif garis, bentuk, dan teks yang ditempel di atas sel. Ketiganya punya
// padanan langsung di SVG (`<line>`, `<rect>`/`<circle>`, `<text>`), jadi
// pemindahannya bukan penulisan ulang melainkan penerjemahan.
//
// Yang membuat versi ini lebih baik — dan ini keluhan yang tertulis di catatan
// update pembuatnya sendiri:
//
//     "Row dan Column tidak dikunci, sehingga posisi gambar yang kurang sesuai
//      bisa diatur dengan mengatur tinggi dan lebar Row dan Column…
//      Lakukan Step 1 dan 2 sampai posisi gambar diperkirakan sudah sesuai."
//
// Di Excel, gambar ditempel di atas grid sel: mengubah tinggi baris menggeser
// gambarnya, dan pengguna harus mengulang-ulang sampai tak tumpang tindih.
// SVG punya sistem koordinatnya sendiri — masalah itu TIDAK ADA. Ditambah:
// bisa di-zoom tanpa pecah, bisa dicetak pada skala apa pun, dan bisa dibaca
// program lain.
//
// ── Skala: mm nyata → satuan gambar
//
// Semua dimensi masuk dalam mm (satuan gambar teknik), dan `viewBox` disetel
// supaya gambar mengisi kanvas berapa pun ukurannya. Tak ada "autoscale" yang
// harus diatur tangan seperti sel D15 workbook.
// ══════════════════════════════════════════════════════════════════════════════

/** Warna baku — mengikuti konvensi gambar kerja: garis hitam, tulangan merah. */
export const WARNA = {
  beton: '#1f2937',
  betonIsi: '#f3f4f6',
  tulangan: '#dc2626',
  sengkang: '#2563eb',
  dimensi: '#6b7280',
  teks: '#111827',
} as const

export interface OpsiGambar {
  /** Lebar kanvas dalam piksel CSS. Tinggi mengikuti rasio. */
  lebarPx?: number
  /** Ruang kosong di sekeliling gambar, dalam mm. */
  marginMm?: number
  /** Tampilkan garis & angka dimensi. */
  dimensi?: boolean
  /** Judul di atas gambar. */
  judul?: string
}

/** Satu batang tulangan pada penampang, koordinat pusat dalam mm. */
export interface TitikTulangan {
  xMm: number
  yMm: number
  diameterMm: number
}

// ── Utilitas SVG ─────────────────────────────────────────────────────────────

/**
 * Membungkus teks agar aman dimasukkan ke SVG.
 *
 * Judul & label datang dari input pengguna (nama elemen, catatan). Tanpa
 * pelolosan ini, satu karakter `<` merusak seluruh dokumen SVG — dan bila
 * SVG-nya kelak ditampilkan di web, ia jadi celah penyisipan.
 */
export function amankanTeks(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const bulat = (n: number, d = 2) => Number(n.toFixed(d))

function garis(x1: number, y1: number, x2: number, y2: number, warna: string, tebal = 2, putus = false) {
  return `<line x1="${bulat(x1)}" y1="${bulat(y1)}" x2="${bulat(x2)}" y2="${bulat(y2)}" `
    + `stroke="${warna}" stroke-width="${tebal}"${putus ? ' stroke-dasharray="12 8"' : ''}/>`
}

/**
 * ⚠ `warna: string`, bukan `= WARNA.teks` polos.
 *
 * `WARNA` dideklarasikan `as const`, jadi tipe parameter yang disimpulkan dari
 * nilai bawaannya adalah literal `'#111827'` — bukan `string`. Akibatnya
 * memanggil `teks(..., WARNA.dimensi)` GAGAL COMPILE meski warnanya sah.
 *
 * Test tak menangkap ini (334 hijau) karena vitest mentranspilasi tanpa
 * memeriksa tipe; yang menangkapnya `tsc --noEmit`. Itu sebabnya keduanya
 * dijalankan, bukan salah satu.
 */
function teks(x: number, y: number, isi: string, ukuran: number, warna: string = WARNA.teks, anchor = 'middle') {
  return `<text x="${bulat(x)}" y="${bulat(y)}" font-size="${bulat(ukuran)}" fill="${warna}" `
    + `text-anchor="${anchor}" font-family="system-ui, sans-serif">${amankanTeks(isi)}</text>`
}

// ── Penampang balok / kolom persegi ──────────────────────────────────────────

export interface InputGambarPenampang {
  /** Lebar penampang, mm. */
  bMm: number
  /** Tinggi penampang, mm. */
  hMm: number
  /** Selimut beton bersih ke sengkang, mm. */
  selimutMm: number
  /** Diameter sengkang, mm. */
  dSengkangMm: number
  /** Tulangan sisi bawah: jumlah per lapis, dari lapis terluar. */
  tulanganBawah: number[]
  /** Tulangan sisi atas: jumlah per lapis, dari lapis terluar. */
  tulanganAtas: number[]
  /** Diameter tulangan utama, mm. */
  dUtamaMm: number
  /** Jarak bersih antar lapis tulangan, mm. Default 25 + Ø. */
  jarakLapisMm?: number
}

/**
 * Susun posisi tiap batang tulangan pada penampang.
 *
 * DIPISAH dari penggambaran supaya bisa diuji sebagai angka — posisi batang
 * adalah hal yang harus benar, dan memeriksanya lewat string SVG akan rapuh.
 *
 * Batang disebar merata pada lebar bersih (di dalam sengkang), simetris
 * terhadap sumbu vertikal. Satu batang di tengah bila jumlahnya ganjil.
 */
export function posisiTulangan(input: InputGambarPenampang): {
  bawah: TitikTulangan[]
  atas: TitikTulangan[]
} {
  const { bMm, hMm, selimutMm, dSengkangMm, dUtamaMm } = input
  if (!(bMm > 0 && hMm > 0)) throw new Error('Dimensi penampang harus > 0')

  const jarakLapis = input.jarakLapisMm ?? (25 + dUtamaMm)
  // Pusat batang lapis terluar: selimut + Ø sengkang + ½ Ø utama.
  const tepiMm = selimutMm + dSengkangMm + dUtamaMm / 2
  const lebarBersih = bMm - 2 * tepiMm
  if (lebarBersih < 0) throw new Error('Selimut + sengkang melebihi lebar penampang')

  const sebar = (n: number, yMm: number): TitikTulangan[] => {
    if (n <= 0) return []
    if (n === 1) return [{ xMm: bMm / 2, yMm, diameterMm: dUtamaMm }]
    const jarak = lebarBersih / (n - 1)
    return Array.from({ length: n }, (_, i) => ({
      xMm: tepiMm + i * jarak, yMm, diameterMm: dUtamaMm,
    }))
  }

  const bawah = input.tulanganBawah.flatMap((n, lapis) =>
    sebar(n, hMm - tepiMm - lapis * jarakLapis))
  const atas = input.tulanganAtas.flatMap((n, lapis) =>
    sebar(n, tepiMm + lapis * jarakLapis))

  return { bawah, atas }
}

/**
 * Gambar penampang balok/kolom persegi dengan tulangan & sengkang.
 *
 * Keluarannya SVG utuh (`<svg>…</svg>`) yang bisa langsung ditulis ke berkas,
 * ditanam di HTML, atau dikirim ke pencetak — tanpa pustaka apa pun.
 */
/**
 * Notasi tulangan gaya gambar kerja: "3D16" / "2P8-150".
 *
 * Konvensi Indonesia: D = deform (BjTS), P = polos (BjTP). Angka di depan
 * jumlah batang, di belakang jaraknya bila berulang.
 */
export function notasiTulangan(jumlah: number, diameterMm: number, tipe: 'D' | 'P' = 'D', jarakMm?: number): string {
  /*
    `jumlah <= 0` berarti tulangan MENERUS — dinotasikan tanpa angka di depan.

    Pelat, footplat, dan pilecap memakai tulangan per meter lari: notasi
    bakunya "D10-150" (Ø10 tiap 150 mm), bukan jumlah batang tertentu.
    Melewatkan 0 sebagai "jumlah tak relevan" menghasilkan **"0D10-150"** di
    gambar kerja — terbaca di tangkapan layar, dan omong kosong bagi yang
    memesan besi.
  */
  const dasar = jumlah > 0 ? `${jumlah}${tipe}${diameterMm}` : `${tipe}${diameterMm}`
  return jarakMm ? `${dasar}-${jarakMm}` : dasar
}

/**
 * Garis dimensi lengkap: garis ukur + dua tick miring 45° + teks.
 *
 * Tick miring (bukan panah) adalah konvensi gambar arsitektur/struktur
 * Indonesia dan ISO 129. Versi pertama berkas ini hanya menggambar garis
 * bantu tegak lurus tanpa tick — terbaca sebagai garis biasa, bukan dimensi.
 */
function dimensi(
  x1: number, y1: number, x2: number, y2: number,
  label: string, t: number, ukuranTeks: number, tegak = false,
): string[] {
  const out: string[] = []
  const tick = ukuranTeks * 0.45
  out.push(garis(x1, y1, x2, y2, WARNA.dimensi, t * 0.7))

  // Tick 45° di kedua ujung.
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    out.push(garis(x - tick / 2, y - tick / 2, x + tick / 2, y + tick / 2, WARNA.dimensi, t * 0.7))
  }

  if (tegak) {
    const cx = x1 - ukuranTeks * 0.45
    const cy = (y1 + y2) / 2
    out.push(`<text x="${bulat(cx)}" y="${bulat(cy)}" font-size="${bulat(ukuranTeks)}" `
      + `fill="${WARNA.dimensi}" text-anchor="middle" font-family="system-ui, sans-serif" `
      + `transform="rotate(-90 ${bulat(cx)} ${bulat(cy)})">${amankanTeks(label)}</text>`)
  } else {
    out.push(teks((x1 + x2) / 2, y1 - ukuranTeks * 0.35, label, ukuranTeks, WARNA.dimensi))
  }
  return out
}

export function gambarPenampang(input: InputGambarPenampang, opsi: OpsiGambar = {}): string {
  const { bMm, hMm, selimutMm, dSengkangMm, dUtamaMm } = input
  const margin = opsi.marginMm ?? Math.max(bMm, hMm) * 0.42
  const pakaiDimensi = opsi.dimensi ?? true

  const { bawah, atas } = posisiTulangan(input)

  // Ruang tambahan di kanan untuk notasi tulangan ("3D16").
  const ruangNotasi = pakaiDimensi ? margin * 1.15 : 0
  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = bMm + 2 * margin + ruangNotasi
  const vbH = hMm + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(bMm, hMm) / 250
  const ukuranTeks = Math.max(bMm, hMm) / 18

  const bagian: string[] = []

  /*
    ── ARSIR BETON
    Konvensi gambar teknik: penampang beton diarsir. Tanpa arsir, penampang
    terbaca sebagai kotak kosong — dan pada gambar bergabung dengan elemen
    lain, sulit membedakan mana yang terpotong dan mana yang tampak.
    Dibuat sangat halus supaya tak mengalahkan tulangan.
  */
  const jarakArsir = Math.max(bMm, hMm) / 22
  bagian.push(
    `<defs><pattern id="arsir" width="${bulat(jarakArsir)}" height="${bulat(jarakArsir)}" `
    + `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${bulat(jarakArsir)}" `
    + `stroke="#cbd5e1" stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  // Beton: isi polos + arsir di atasnya, lalu garis tepi tebal.
  bagian.push(`<rect x="0" y="0" width="${bulat(bMm)}" height="${bulat(hMm)}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(bMm)}" height="${bulat(hMm)}" fill="url(#arsir)"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(bMm)}" height="${bulat(hMm)}" `
    + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.6)}"/>`)

  /*
    ── SENGKANG
    Digambar sebagai GARIS TIPIS mengikuti sumbu batang, bukan pita setebal
    diameternya. Versi pertama memakai `stroke-width = dSengkangMm` (8 mm pada
    penampang 300 mm) dan hasilnya terlihat seperti pita biru — bukan
    tulangan.

    Radius sudut = 2·db, bukan 2×diameter dalam satuan gambar: bengkokan
    sengkang memang punya jari-jari dalam ±2db (SNI 2847 §25.3.2), tetapi
    pada skala penampang itu nyaris tajam.
  */
  const sx = selimutMm, sy = selimutMm
  const sw = bMm - 2 * selimutMm
  const sh = hMm - 2 * selimutMm
  if (sw > 0 && sh > 0) {
    const r = Math.min(2 * dSengkangMm, sw / 8, sh / 8)
    /*
      Tebal garis sengkang: proporsional ukuran gambar, TETAPI tak boleh
      lebih tipis dari 60% diameter sesungguhnya.

      Versi sebelumnya memakai `t * 1.1` polos — pada penampang 250×400
      hasilnya 1.76 unit dan sengkang nyaris tak terlihat di sebelah tulangan
      D13. Batas bawah membuatnya tetap terbaca tanpa kembali jadi "pita"
      seperti versi yang memakai diameter penuh.
    */
    const tebalSengkang = Math.max(t * 1.1, dSengkangMm * 0.6)
    bagian.push(`<rect x="${bulat(sx)}" y="${bulat(sy)}" width="${bulat(sw)}" height="${bulat(sh)}" `
      + `rx="${bulat(r)}" ry="${bulat(r)}" fill="none" `
      + `stroke="${WARNA.sengkang}" stroke-width="${bulat(tebalSengkang)}"/>`)
  }

  // Tulangan — lingkaran berdiameter SESUNGGUHNYA, bergaris tepi supaya
  // batang yang berdekatan tetap bisa dibedakan.
  for (const b of [...bawah, ...atas]) {
    bagian.push(`<circle cx="${bulat(b.xMm)}" cy="${bulat(b.yMm)}" r="${bulat(b.diameterMm / 2)}" `
      + `fill="${WARNA.tulangan}" stroke="#7f1d1d" stroke-width="${bulat(t * 0.35)}"/>`)
  }

  if (pakaiDimensi) {
    const off = margin * 0.6

    // Garis bantu dari benda ke garis dimensi (extension line).
    bagian.push(garis(0, hMm, 0, hMm + off * 1.18, WARNA.dimensi, t * 0.5))
    bagian.push(garis(bMm, hMm, bMm, hMm + off * 1.18, WARNA.dimensi, t * 0.5))
    bagian.push(...dimensi(0, hMm + off, bMm, hMm + off, `${bulat(bMm, 0)} mm`, t, ukuranTeks))

    bagian.push(garis(0, 0, -off * 1.18, 0, WARNA.dimensi, t * 0.5))
    bagian.push(garis(0, hMm, -off * 1.18, hMm, WARNA.dimensi, t * 0.5))
    bagian.push(...dimensi(-off, 0, -off, hMm, `${bulat(hMm, 0)} mm`, t, ukuranTeks, true))

    /*
      ── NOTASI TULANGAN — inilah yang membuatnya gambar KERJA, bukan sketsa.

      Tanpa "3D16" di sebelah tulangan, tukang besi tak tahu apa yang harus
      dipasang. Garis penunjuk (leader) ditarik dari batang terluar tiap lapis.
    */
    const xNot = bMm + off * 0.9
    const tulisLapis = (jml: number[], titik: TitikTulangan[], dariAtas: boolean) => {
      let mulai = 0
      for (const [i, n] of jml.entries()) {
        if (n <= 0) { continue }
        const batang = titik.slice(mulai, mulai + n)
        mulai += n
        if (batang.length === 0) continue
        const y = batang[0].yMm
        const xUjung = Math.max(...batang.map((b) => b.xMm))
        bagian.push(garis(xUjung + dUtamaMm, y, xNot - ukuranTeks * 0.3, y, WARNA.tulangan, t * 0.5))
        bagian.push(teks(xNot, y + ukuranTeks * 0.32,
          notasiTulangan(n, dUtamaMm, 'D'), ukuranTeks * 0.95, WARNA.tulangan, 'start'))
        void i; void dariAtas
      }
    }
    tulisLapis(input.tulanganAtas, atas, true)
    tulisLapis(input.tulanganBawah, bawah, false)

    // Notasi sengkang & selimut.
    if (sw > 0 && sh > 0) {
      const ys = hMm / 2
      bagian.push(garis(sx + sw, ys, xNot - ukuranTeks * 0.3, ys, WARNA.sengkang, t * 0.5))
      bagian.push(teks(xNot, ys + ukuranTeks * 0.32,
        `P${dSengkangMm}`, ukuranTeks * 0.95, WARNA.sengkang, 'start'))
    }
    bagian.push(teks(bMm / 2, hMm + off + ukuranTeks * 1.5,
      `selimut ${bulat(selimutMm, 0)} mm`, ukuranTeks * 0.8, WARNA.dimensi))
  }

  if (opsi.judul) {
    bagian.push(teks(bMm / 2, -margin * 0.55, opsi.judul, ukuranTeks * 1.25))
  }

  const lebarPx = opsi.lebarPx ?? 420
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Penampang')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Detail bengkokan satu batang (bar shape) ─────────────────────────────────

export interface InputGambarBatang {
  /** Panjang tiap segmen lurus, m. */
  segmenM: number[]
  /** Panjang kait, m. 0 bila tak berkait. */
  kaitM: number
  jumlahKait: number
  sudutKait: 135 | 90
  diameterMm: number
  /** Keterangan yang ditulis di bawah gambar. */
  uraian?: string
}

/**
 * Gambar bentuk satu batang untuk kolom "Sketsa" pada tabel BBS.
 *
 * Dibuat SKEMATIS, bukan berskala: batang 12 m dan 0.3 m harus muat di sel
 * tabel yang sama tingginya. Yang benar-benar penting di sini adalah BENTUK
 * (lurus, berkait satu, berkait dua, persegi tertutup) dan ANGKA di tiap
 * segmen — bukan panjang relatifnya.
 *
 * Itu keputusan sadar, dan sebabnya ditulis supaya tak "diperbaiki" jadi
 * berskala oleh orang berikutnya: sketsa berskala membuat sengkang 240×460 mm
 * terlihat sebagai garis tipis di sebelah tulangan 12 m.
 */
export function gambarBatang(input: InputGambarBatang, opsi: OpsiGambar = {}): string {
  const { segmenM, kaitM, jumlahKait, sudutKait, diameterMm } = input
  if (segmenM.length === 0) throw new Error('gambarBatang: tak ada segmen')

  /*
    Tinggi 108, bukan 90.

    Sengkang butuh tiga baris teks di bawah gambarnya (ukuran sisi, keterangan
    kait, lalu uraian) — pada kanvas 90 px keterangan kait dan uraian saling
    menimpa. Terlihat begitu dirender, tak terlihat dari test mana pun.
  */
  const W = 300, H = 108
  const t = 3
  const bagian: string[] = []

  const kaitPanjang = 18
  const isSengkang = segmenM.length >= 4

  if (isSengkang) {
    /*
      Sengkang tertutup: persegi dengan sudut membulat halus + DUA kait 135°
      yang menekuk KE DALAM.

      Versi pertama menggambar kait keluar dari sudut kanan atas dengan arah
      sembarang, dan hasilnya terlihat seperti garis nyasar. Kait 135° yang
      benar menekuk ke DALAM penampang — itu justru gunanya: mengunci inti
      beton saat selimut luar pecah. Kait yang menghadap keluar tak menahan
      apa pun, dan itu kesalahan pemasangan yang nyata di lapangan.
    */
    const x0 = 62, y0 = 24, w = 166, h = 44
    bagian.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="4" `
      + `fill="none" stroke="${WARNA.tulangan}" stroke-width="${t}"/>`)

    // Dua kait di sudut kanan atas, menekuk masuk ±135°.
    const kx = x0 + w, ky = y0
    bagian.push(garis(kx, ky, kx - kaitPanjang * 0.72, ky + kaitPanjang * 0.72, WARNA.tulangan, t))
    bagian.push(garis(kx, ky, kx - kaitPanjang * 0.1, ky + kaitPanjang, WARNA.tulangan, t))

    // Ukuran sisi + penanda kait.
    bagian.push(teks(x0 + w / 2, y0 - 7, `${bulat(segmenM[0] * 1000, 0)}`, 13, WARNA.dimensi))
    bagian.push(teks(x0 - 18, y0 + h / 2 + 4, `${bulat(segmenM[1] * 1000, 0)}`, 13, WARNA.dimensi))
    bagian.push(teks(x0 + w / 2, y0 + h + 16,
      `kait ${sudutKait}° · ${bulat(kaitM * 1000, 0)} mm × ${jumlahKait}`, 10, WARNA.dimensi))
  } else {
    // Batang lurus mendatar; kait digambar menekuk ke bawah di ujung.
    const x0 = jumlahKait >= 1 ? 45 : 25
    const x1 = jumlahKait === 2 ? W - 45 : W - 25
    const y = 45
    bagian.push(garis(x0, y, x1, y, WARNA.tulangan, t))

    const arah = sudutKait === 135 ? 0.7 : 1  // 135° menekuk lebih landai
    if (jumlahKait >= 1) {
      bagian.push(garis(x0, y, x0 - kaitPanjang * arah, y + kaitPanjang, WARNA.tulangan, t))
    }
    if (jumlahKait === 2) {
      bagian.push(garis(x1, y, x1 + kaitPanjang * arah, y + kaitPanjang, WARNA.tulangan, t))
    }
    bagian.push(teks((x0 + x1) / 2, y - 10, `${bulat(segmenM[0] * 1000, 0)}`, 14, WARNA.dimensi))
    if (jumlahKait > 0) {
      bagian.push(teks((x0 + x1) / 2, y + 26,
        `kait ${sudutKait}° · ${bulat(kaitM * 1000, 0)} mm × ${jumlahKait}`, 11, WARNA.dimensi))
    }
  }

  if (input.uraian) bagian.push(teks(W / 2, H - 6, input.uraian, 11, WARNA.teks))
  bagian.push(teks(W - 8, 16, `Ø${diameterMm}`, 13, WARNA.tulangan, 'end'))

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" `
    + `width="${opsi.lebarPx ?? W}" role="img" `
    + `aria-label="${amankanTeks(input.uraian ?? 'Bentuk batang')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Diagram interaksi P-M ────────────────────────────────────────────────────

export interface InputGambarPM {
  /** Titik kurva: pasangan (φMn, φPn) dalam kNm & kN. */
  kurva: { phiMnKnm: number; phiPnKn: number }[]
  /** Titik beban yang diperiksa. */
  beban?: { muKnm: number; puKn: number; label?: string }[]
  judul?: string
  /**
   * Sertakan daerah TARIK (φPn < 0).
   *
   * Kolom bisa tertarik, dan kurvanya benar-benar turun di bawah sumbu — pada
   * penampang contoh, 68 dari 150 titik ber-φPn negatif. Tetapi kolom bangunan
   * gedung hampir selalu tertekan, dan menyertakan daerah tarik membuat:
   *
   *   · setengah tinggi grafik terpakai untuk daerah yang tak dipakai
   *   · kurva menembus keluar bingkai sumbu (terlihat seperti cacat gambar)
   *
   * Bawaannya `false` — daerah tekan saja. Setel `true` bila kolom memang
   * dirancang menahan tarik (mis. kolom tepi berangka portal tinggi).
   */
  sertakanTarik?: boolean
}

/**
 * Diagram interaksi P-M sebagai SVG.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * Di workbook, inilah satu-satunya cara membaca verdict kolom: pengguna
 * melihat apakah titik bebannya jatuh di dalam kurva. `cekTitikBeban` sudah
 * menggantikannya dengan verdict ALJABAR — gambar ini untuk MEMPERLIHATKAN
 * hasil itu, bukan untuk jadi dasar keputusan.
 *
 * Titik beban diwarnai menurut verdict yang sudah dihitung, jadi orang tak
 * perlu menakar jarak dengan mata.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function gambarDiagramPM(input: InputGambarPM, opsi: OpsiGambar = {}): string {
  if (input.kurva.length < 2) throw new Error('gambarDiagramPM: kurva minimal 2 titik')

  /*
    Daerah tarik dipotong secara BAWAAN — lihat alasan di `sertakanTarik`.

    Pemotongan dilakukan di sini, bukan di `diagramPM`: kurvanya sendiri harus
    lengkap (verdict `cekTitikBeban` memakainya, dan kolom tarik memang ada);
    yang disesuaikan hanya apa yang DITAMPILKAN.
  */
  const kurva = input.sertakanTarik
    ? input.kurva
    : input.kurva.filter((k) => k.phiPnKn >= 0)

  if (kurva.length < 2) {
    throw new Error('gambarDiagramPM: setelah daerah tarik dipotong, kurva '
      + 'tersisa < 2 titik. Setel `sertakanTarik: true` bila kolom ini memang '
      + 'dirancang menahan tarik.')
  }

  const W = 480, H = 400
  const pad = { kiri: 62, kanan: 18, atas: 34, bawah: 46 }
  const plotW = W - pad.kiri - pad.kanan
  const plotH = H - pad.atas - pad.bawah

  const beban = input.beban ?? []
  const maksM = Math.max(...kurva.map((k) => k.phiMnKnm), ...beban.map((b) => b.muKnm), 1)
  const maksP = Math.max(...kurva.map((k) => k.phiPnKn), ...beban.map((b) => b.puKn), 1)
  // Sumbu diberi ruang 8% supaya titik di tepi tak menempel bingkai.
  const skalaM = plotW / (maksM * 1.08)
  const skalaP = plotH / (maksP * 1.08)

  const px = (mn: number) => pad.kiri + mn * skalaM
  const py = (pn: number) => pad.atas + plotH - pn * skalaP

  const bagian: string[] = []

  // Sumbu
  bagian.push(garis(pad.kiri, pad.atas, pad.kiri, pad.atas + plotH, WARNA.dimensi, 1.5))
  bagian.push(garis(pad.kiri, pad.atas + plotH, pad.kiri + plotW, pad.atas + plotH, WARNA.dimensi, 1.5))

  // Garis bantu tiap 25%
  for (let i = 1; i <= 4; i++) {
    const y = pad.atas + plotH - (plotH / 1.08) * (i / 4)
    bagian.push(garis(pad.kiri, y, pad.kiri + plotW, y, '#e5e7eb', 1))
    bagian.push(teks(pad.kiri - 6, y + 4, `${Math.round(maksP * i / 4)}`, 10, WARNA.dimensi, 'end'))
  }
  for (let i = 1; i <= 4; i++) {
    const x = pad.kiri + (plotW / 1.08) * (i / 4)
    bagian.push(teks(x, pad.atas + plotH + 16, `${Math.round(maksM * i / 4)}`, 10, WARNA.dimensi))
  }

  // Kurva kapasitas — diurutkan menurut φPn supaya polyline-nya tidak zig-zag.
  const urut = [...kurva].sort((a, b) => b.phiPnKn - a.phiPnKn)
  const titik = urut.map((k) => `${bulat(px(k.phiMnKnm))},${bulat(py(k.phiPnKn))}`).join(' ')
  bagian.push(`<polyline points="${titik}" fill="none" stroke="${WARNA.sengkang}" stroke-width="2.5"/>`)

  /*
    Titik beban — warna dari INTERPOLASI, bukan "titik kurva terdekat".

    Versi pertama memakai titik terdekat menurut φPn, dan itu bisa memberi
    warna yang salah: pada bagian kurva yang menanjak tajam, titik terdekat
    bisa punya φMn yang jauh berbeda dari kapasitas pada Pu sesungguhnya.

    Cara di sini sama persis dengan `cekTitikBeban` di `struktur-diagram-pm`
    — jadi warna di gambar TIDAK PERNAH berbeda dari verdict yang dilaporkan.
    Dua sumber kebenaran untuk satu pertanyaan adalah cara paling mudah
    membuat gambar dan angka saling bertentangan.
  */
  const naik = [...kurva].sort((a, b) => a.phiPnKn - b.phiPnKn)
  const kapasitasPada = (puKn: number): number => {
    for (let i = 0; i < naik.length - 1; i++) {
      if (naik[i].phiPnKn <= puKn && puKn <= naik[i + 1].phiPnKn) {
        const rentang = naik[i + 1].phiPnKn - naik[i].phiPnKn
        const t = rentang > 0 ? (puKn - naik[i].phiPnKn) / rentang : 0
        return naik[i].phiMnKnm + t * (naik[i + 1].phiMnKnm - naik[i].phiMnKnm)
      }
    }
    // Di luar rentang kurva: pakai ujung terdekat.
    return puKn < naik[0].phiPnKn ? naik[0].phiMnKnm : naik[naik.length - 1].phiMnKnm
  }

  for (const b of beban) {
    const aman = b.puKn <= Math.max(...kurva.map((k) => k.phiPnKn))
      && b.muKnm <= kapasitasPada(b.puKn)
    const w = aman ? '#16a34a' : '#dc2626'
    bagian.push(`<circle cx="${bulat(px(b.muKnm))}" cy="${bulat(py(b.puKn))}" r="5" `
      + `fill="${w}" stroke="#fff" stroke-width="1.5"/>`)
    if (b.label) {
      bagian.push(teks(px(b.muKnm) + 9, py(b.puKn) - 7, b.label, 10, w, 'start'))
    }
  }

  bagian.push(teks(pad.kiri + plotW / 2, H - 8, 'φMn (kNm)', 12, WARNA.teks))
  bagian.push(`<text x="14" y="${bulat(pad.atas + plotH / 2)}" font-size="12" fill="${WARNA.teks}" `
    + `text-anchor="middle" font-family="system-ui, sans-serif" `
    + `transform="rotate(-90 14 ${bulat(pad.atas + plotH / 2)})">φPn (kN)</text>`)
  if (input.judul) bagian.push(teks(W / 2, 20, input.judul, 13))

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" `
    + `width="${opsi.lebarPx ?? W}" role="img" `
    + `aria-label="${amankanTeks(input.judul ?? 'Diagram interaksi P-M')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Penampang LINGKARAN (kolom bulat) ────────────────────────────────────────

export interface InputGambarLingkaran {
  /** Diameter kolom, mm. */
  diameterMm: number
  /** Selimut beton bersih ke pengekang, mm. */
  selimutMm: number
  /** Diameter pengekang (sengkang cincin / spiral), mm. */
  dPengekangMm: number
  /** Diameter tulangan utama, mm. */
  dUtamaMm: number
  /** Jumlah tulangan utama, disebar merata pada lingkaran. */
  nTulangan: number
  /** Spiral digambar sebagai garis putus; sengkang cincin sebagai garis utuh. */
  pengekang?: 'spiral' | 'sengkang'
}

/**
 * Posisi tiap batang pada kolom bulat — DIPISAH supaya bisa diuji sebagai angka.
 *
 * Batang disebar merata pada lingkaran inti (di dalam pengekang). Batang
 * pertama diletakkan di ATAS (sudut −90°), bukan di kanan (0°): itu konvensi
 * gambar kolom, dan membuat kolom 4-batang tergambar sebagai belah ketupat
 * yang benar alih-alih miring 45°.
 */
export function posisiTulanganLingkaran(input: InputGambarLingkaran): TitikTulangan[] {
  const { diameterMm, selimutMm, dPengekangMm, dUtamaMm, nTulangan } = input
  if (!(nTulangan > 0)) return []

  // Jari-jari lingkaran pusat batang: R − selimut − Øpengekang − ½Øutama.
  const rInti = diameterMm / 2 - selimutMm - dPengekangMm - dUtamaMm / 2
  if (rInti <= 0) return []

  const pusat = diameterMm / 2
  return Array.from({ length: nTulangan }, (_, i) => {
    const sudut = -Math.PI / 2 + (2 * Math.PI * i) / nTulangan
    return {
      xMm: pusat + rInti * Math.cos(sudut),
      yMm: pusat + rInti * Math.sin(sudut),
      diameterMm: dUtamaMm,
    }
  })
}

/**
 * Penampang kolom bulat — pasangan `gambarPenampang` untuk elemen lingkaran.
 *
 * Sebelum ini, kolom bulat adalah satu-satunya elemen yang punya diagram P-M
 * tetapi TIDAK punya gambar penampang: pembaca gambar kerja melihat kurva
 * kapasitas tanpa pernah melihat susunan tulangan yang menghasilkannya.
 *
 * Spiral dibedakan dari sengkang cincin lewat garis putus — bukan hiasan:
 * keduanya beda cara pasang, beda harga, dan beda faktor φ (0,75 vs 0,65).
 * Gambar yang menyamakan keduanya membuat pelaksana memasang yang salah.
 */
export function gambarPenampangLingkaran(
  input: InputGambarLingkaran, opsi: OpsiGambar = {},
): string {
  const { diameterMm: D, selimutMm, dPengekangMm, dUtamaMm, nTulangan } = input
  if (!(D > 0)) throw new Error('Diameter kolom harus > 0')

  const margin = opsi.marginMm ?? D * 0.42
  const pakaiDimensi = opsi.dimensi ?? true
  const spiral = (input.pengekang ?? 'sengkang') === 'spiral'

  const ruangNotasi = pakaiDimensi ? margin * 1.15 : 0
  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = D + 2 * margin + ruangNotasi
  const vbH = D + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = D / 250
  const ukuranTeks = D / 18
  const pusat = D / 2
  const bagian: string[] = []

  // Arsir beton — konvensi yang sama dengan penampang persegi.
  const jarakArsir = D / 22
  bagian.push(
    `<defs><pattern id="arsirL" width="${bulat(jarakArsir)}" height="${bulat(jarakArsir)}" `
    + `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${bulat(jarakArsir)}" `
    + `stroke="#cbd5e1" stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  bagian.push(`<circle cx="${bulat(pusat)}" cy="${bulat(pusat)}" r="${bulat(D / 2)}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<circle cx="${bulat(pusat)}" cy="${bulat(pusat)}" r="${bulat(D / 2)}" fill="url(#arsirL)"/>`)
  bagian.push(`<circle cx="${bulat(pusat)}" cy="${bulat(pusat)}" r="${bulat(D / 2)}" `
    + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.6)}"/>`)

  // Pengekang: lingkaran pada garis pusatnya, tebal minimal 60% diameter —
  // alasan yang sama dengan sengkang persegi (lihat `gambarPenampang`).
  const rPengekang = D / 2 - selimutMm - dPengekangMm / 2
  if (rPengekang > 0) {
    const tebal = Math.max(t * 1.1, dPengekangMm * 0.6)
    bagian.push(`<circle cx="${bulat(pusat)}" cy="${bulat(pusat)}" r="${bulat(rPengekang)}" `
      + `fill="none" stroke="${WARNA.sengkang}" stroke-width="${bulat(tebal)}"`
      + (spiral ? ` stroke-dasharray="${bulat(D / 14)} ${bulat(D / 22)}"` : '')
      + `/>`)
  }

  for (const b of posisiTulanganLingkaran(input)) {
    bagian.push(`<circle cx="${bulat(b.xMm)}" cy="${bulat(b.yMm)}" r="${bulat(b.diameterMm / 2)}" `
      + `fill="${WARNA.tulangan}" stroke="#7f1d1d" stroke-width="${bulat(t * 0.35)}"/>`)
  }

  if (pakaiDimensi) {
    const off = margin * 0.6
    bagian.push(garis(0, D, 0, D + off * 1.18, WARNA.dimensi, t * 0.5))
    bagian.push(garis(D, D, D, D + off * 1.18, WARNA.dimensi, t * 0.5))
    bagian.push(...dimensi(0, D + off, D, D + off, `Ø${bulat(D, 0)} mm`, t, ukuranTeks))

    // Notasi: jumlah & diameter batang, lalu pengekangnya beserta jenisnya.
    const xNot = D + off * 0.5
    bagian.push(teks(xNot, pusat - ukuranTeks * 0.4,
      notasiTulangan(nTulangan, dUtamaMm), ukuranTeks, WARNA.tulangan, 'start'))
    bagian.push(teks(xNot, pusat + ukuranTeks * 0.9,
      `${spiral ? 'Spiral' : 'Sengkang'} Ø${bulat(dPengekangMm, 0)}`,
      ukuranTeks * 0.9, WARNA.sengkang, 'start'))
    bagian.push(teks(xNot, pusat + ukuranTeks * 2.2,
      `selimut ${bulat(selimutMm, 0)} mm`, ukuranTeks * 0.8, WARNA.dimensi, 'start'))
  }

  if (opsi.judul) {
    bagian.push(teks(pusat, -margin * 0.55, opsi.judul, ukuranTeks * 1.25))
  }

  const lebarPx = opsi.lebarPx ?? 420
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Penampang kolom bulat')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Potongan PELAT ───────────────────────────────────────────────────────────

export interface InputGambarPelat {
  /** Bentang yang digambar (arah potongan), m. */
  bentangM: number
  /** Tebal pelat, m. */
  tebalM: number
  /** Diameter tulangan, mm. */
  dTulanganMm: number
  /** Jarak tulangan, mm. */
  jarakTulanganMm: number
  /** Selimut beton bersih, mm. */
  selimutMm: number
}

/**
 * Potongan melintang pelat dengan tulangan atas & bawah.
 *
 * Pelat sebelumnya tak punya gambar apa pun — padahal ia elemen dengan tonase
 * besi TERBESAR di gedung bertingkat (diukur pada contoh 200 m²: 1.746 kg,
 * dua puluh kali balok tunggal). Estimator memesan besi terbanyak justru untuk
 * elemen yang tak bisa ia lihat gambarnya.
 *
 * Digambar sebagai POTONGAN, bukan denah: yang menentukan kebutuhan besi
 * adalah jarak antar batang dan posisinya terhadap tebal, dan keduanya hanya
 * terbaca dari potongan.
 */
export function gambarPotonganPelat(
  input: InputGambarPelat, opsi: OpsiGambar = {},
): string {
  const { bentangM, tebalM, dTulanganMm, jarakTulanganMm, selimutMm } = input
  if (!(bentangM > 0 && tebalM > 0)) throw new Error('Bentang & tebal pelat harus > 0')
  if (!(jarakTulanganMm > 0)) throw new Error('Jarak tulangan harus > 0')

  // Semua dalam mm supaya sekelas dengan gambar penampang.
  const L = bentangM * 1000
  const H = tebalM * 1000

  /*
    Panjang yang DIGAMBAR dibatasi.

    Pelat 8 m dengan tebal 120 mm punya rasio 66:1 — digambar apa adanya, ia
    jadi garis rambut selebar layar dan tulangannya tak terlihat sama sekali.
    Yang digambar potongan sepanjang 12× tebal (cukup memuat beberapa jarak
    tulangan), dan pemotongannya DINYATAKAN lewat garis putus di kedua ujung —
    bukan disamarkan seolah itu seluruh bentangnya.
  */
  const Lgambar = Math.min(L, Math.max(H * 12, jarakTulanganMm * 4.5))
  const terpotong = Lgambar < L - 1

  const margin = opsi.marginMm ?? Math.max(Lgambar, H) * 0.16
  const pakaiDimensi = opsi.dimensi ?? true
  const t = Math.max(Lgambar, H) / 250
  const ukuranTeks = Math.max(Lgambar, H) / 26

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.5 : 0)
  const vbW = Lgambar + 2 * margin
  const vbH = H + 2 * margin + (opsi.judul ? margin * 0.5 : 0) + (pakaiDimensi ? margin * 0.9 : 0)

  const bagian: string[] = []
  const jarakArsir = Math.max(H / 6, Lgambar / 60)
  bagian.push(
    `<defs><pattern id="arsirP" width="${bulat(jarakArsir)}" height="${bulat(jarakArsir)}" `
    + `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${bulat(jarakArsir)}" `
    + `stroke="#cbd5e1" stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  bagian.push(`<rect x="0" y="0" width="${bulat(Lgambar)}" height="${bulat(H)}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(Lgambar)}" height="${bulat(H)}" fill="url(#arsirP)"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(Lgambar)}" height="${bulat(H)}" `
    + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.6)}"/>`)

  // Tulangan memanjang (terpotong → lingkaran) pada lapis atas & bawah.
  const yBawah = H - selimutMm - dTulanganMm / 2
  const yAtas = selimutMm + dTulanganMm / 2
  const n = Math.floor(Lgambar / jarakTulanganMm) + 1
  /*
    Jari-jari batang dibatasi DUA arah.

    Batas bawah supaya batang tetap terlihat pada gambar pelat panjang; batas
    ATAS (12% tebal) supaya ia tak mendominasi. Pelat t=120 dengan D10
    digambar apa adanya membuat dua lapis tulangan memakan sepertiga tebalnya
    — terbaca seperti pelat yang penuh besi, dan itu memberi kesan yang salah
    tentang kerapatannya.
  */
  const rTul = Math.min(Math.max(dTulanganMm / 2, t * 1.6), H * 0.12)
  for (let i = 0; i < n; i++) {
    const x = selimutMm + i * jarakTulanganMm
    if (x > Lgambar - selimutMm) break
    for (const y of [yBawah, yAtas]) {
      bagian.push(`<circle cx="${bulat(x)}" cy="${bulat(y)}" r="${bulat(rTul)}" `
        + `fill="${WARNA.tulangan}" stroke="#7f1d1d" stroke-width="${bulat(t * 0.35)}"/>`)
    }
  }

  // Tulangan arah tegak lurus: garis menerus di belakang batang terpotong.
  for (const y of [yBawah, yAtas]) {
    bagian.push(garis(selimutMm, y, Lgambar - selimutMm, y,
      WARNA.sengkang, bulat(Math.max(t * 0.8, dTulanganMm * 0.35))))
  }

  // Tanda potong — menyatakan bahwa gambar ini SEPOTONG, bukan seluruh bentang.
  if (terpotong) {
    bagian.push(garis(Lgambar, -H * 0.18, Lgambar, H * 1.18, WARNA.dimensi, t * 0.8, true))
    bagian.push(teks(Lgambar - ukuranTeks * 0.3, -H * 0.24,
      `⟨ potongan ${bulat(Lgambar / 1000, 2)} m dari bentang ${bulat(bentangM, 2)} m ⟩`,
      ukuranTeks * 0.85, WARNA.dimensi, 'end'))
  }

  if (pakaiDimensi) {
    const off = margin * 0.55
    bagian.push(garis(0, H, -off * 1.2, H, WARNA.dimensi, t * 0.5))
    bagian.push(garis(0, 0, -off * 1.2, 0, WARNA.dimensi, t * 0.5))
    bagian.push(...dimensi(-off, 0, -off, H, `t ${bulat(H, 0)} mm`, t, ukuranTeks, true))

    // Jarak antar batang — angka yang menentukan tonase besi pelat.
    if (n >= 2) {
      const x1 = selimutMm, x2 = selimutMm + jarakTulanganMm
      const yD = H + off
      bagian.push(garis(x1, H, x1, yD * 1.04, WARNA.dimensi, t * 0.5))
      bagian.push(garis(x2, H, x2, yD * 1.04, WARNA.dimensi, t * 0.5))
      bagian.push(...dimensi(x1, yD, x2, yD, `s ${bulat(jarakTulanganMm, 0)}`, t, ukuranTeks))
    }

    bagian.push(teks(Lgambar / 2, H + off * 2.1,
      notasiTulangan(0, dTulanganMm, 'D', jarakTulanganMm) + ' — dua lapis (atas & bawah)',
      ukuranTeks * 0.95, WARNA.tulangan))
  }

  if (opsi.judul) bagian.push(teks(Lgambar / 2, -margin * 0.6, opsi.judul, ukuranTeks * 1.2))

  const lebarPx = opsi.lebarPx ?? 560
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Potongan pelat')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── PONDASI: denah + potongan (footplat & pilecap) ───────────────────────────

export interface InputGambarPondasi {
  /** Lebar pondasi arah X, m. */
  lxM: number
  /** Lebar pondasi arah Y, m. */
  lyM: number
  /** Tebal pondasi, m. */
  hM: number
  /** Lebar kolom arah X, m. */
  bxM: number
  /** Lebar kolom arah Y, m. */
  byM: number
  /** Diameter tulangan, mm. */
  dTulanganMm: number
  /** Jarak tulangan, mm. */
  jarakTulanganMm: number
  /**
   * Tiang di bawah pilecap — koordinat dari PUSAT pondasi, m.
   * Kosong untuk footplat (bertumpu tanah).
   */
  tiang?: { xM: number; yM: number }[]
  /** Diameter tiang, m — dipakai bila `tiang` diisi. */
  diameterTiangM?: number
}

/**
 * Denah pondasi + potongannya dalam SATU gambar.
 *
 * Footplat dan pilecap sebelumnya tak punya gambar apa pun. Keduanya
 * digambar oleh fungsi yang sama karena bedanya cuma satu: apa yang ada di
 * BAWAHNYA — tanah (footplat) atau kelompok tiang (pilecap).
 *
 * Denah dan potongan disatukan, bukan dipisah jadi dua gambar: yang harus
 * dicocokkan orang di lapangan adalah posisi tiang terhadap tebal poer, dan
 * dua gambar terpisah membuat pencocokan itu jadi pekerjaan pembaca.
 *
 * Susunan tiang digambar dari koordinat NYATA hasil `bebanPerTiang`, bukan
 * digambar simetris begitu saja — grup tiang yang tak simetris adalah justru
 * yang paling perlu diperiksa gambarnya.
 */
export function gambarPondasi(
  input: InputGambarPondasi, opsi: OpsiGambar = {},
): string {
  const { lxM, lyM, hM, bxM, byM, dTulanganMm, jarakTulanganMm } = input
  if (!(lxM > 0 && lyM > 0 && hM > 0)) throw new Error('Dimensi pondasi harus > 0')

  // mm sebagai satuan gambar.
  const LX = lxM * 1000, LY = lyM * 1000, H = hM * 1000
  const BX = bxM * 1000, BY = byM * 1000
  const tiang = input.tiang ?? []
  const DT = (input.diameterTiangM ?? 0) * 1000

  const skala = Math.max(LX, LY)
  const margin = opsi.marginMm ?? skala * 0.2
  const pakaiDimensi = opsi.dimensi ?? true
  const t = skala / 250
  const ukuranTeks = skala / 24

  // Potongan diletakkan DI BAWAH denah, dipisah jarak yang jelas.
  const jarakAntar = skala * 0.42   // memuat kolom yang menjulang + label POTONGAN
  const yPotongan = LY + jarakAntar

  const vbX = -margin
  // Ruang atas: judul (1,05·margin) + garis dimensi (0,5·margin) + napas.
  const vbY = -margin - (opsi.judul ? margin * 0.85 : 0)
  const vbW = LX + 2 * margin * 1.2
  const vbH = yPotongan + H + 2.9 * margin + (opsi.judul ? margin * 0.85 : 0)

  const bagian: string[] = []
  const jarakArsir = skala / 26
  bagian.push(
    `<defs><pattern id="arsirF" width="${bulat(jarakArsir)}" height="${bulat(jarakArsir)}" `
    + `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${bulat(jarakArsir)}" `
    + `stroke="#cbd5e1" stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  // ── DENAH
  bagian.push(`<rect x="0" y="0" width="${bulat(LX)}" height="${bulat(LY)}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(LX)}" height="${bulat(LY)}" fill="url(#arsirF)"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(LX)}" height="${bulat(LY)}" `
    + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.6)}"/>`)

  // Jaring tulangan bawah — dua arah, digambar sesuai jarak sesungguhnya.
  const tebalJaring = Math.max(t * 0.6, dTulanganMm * 0.3)
  for (let x = jarakTulanganMm / 2; x < LX; x += jarakTulanganMm) {
    bagian.push(garis(x, 0, x, LY, WARNA.tulangan, bulat(tebalJaring)))
  }
  for (let y = jarakTulanganMm / 2; y < LY; y += jarakTulanganMm) {
    bagian.push(garis(0, y, LX, y, WARNA.sengkang, bulat(tebalJaring)))
  }

  // Kolom di tengah — garis putus karena ia BERADA DI ATAS bidang potong.
  const kx = (LX - BX) / 2, ky = (LY - BY) / 2
  bagian.push(`<rect x="${bulat(kx)}" y="${bulat(ky)}" width="${bulat(BX)}" height="${bulat(BY)}" `
    + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.2)}" stroke-dasharray="${bulat(skala / 40)} ${bulat(skala / 60)}"/>`)

  // Tiang (pilecap) — lingkaran pada posisi nyatanya.
  for (const p of tiang) {
    bagian.push(`<circle cx="${bulat(LX / 2 + p.xM * 1000)}" cy="${bulat(LY / 2 + p.yM * 1000)}" `
      + `r="${bulat(DT / 2)}" fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.2)}"/>`)
  }

  /*
    Label bagian ditaruh di KIRI-ATAS benda, bukan di tengah.

    Versi pertama meletakkan "POTONGAN" di tengah-atas — dan di sana persis
    berdiri kolomnya, sehingga tulisannya tertimpa kotak kolom. Terlihat di
    tangkapan layar, tak terlihat sama sekali dari kode.
  */
  bagian.push(teks(0, -margin * 0.2, 'DENAH', ukuranTeks * 0.95, WARNA.dimensi, 'start'))

  // ── POTONGAN
  const yP = yPotongan
  bagian.push(`<rect x="0" y="${bulat(yP)}" width="${bulat(LX)}" height="${bulat(H)}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<rect x="0" y="${bulat(yP)}" width="${bulat(LX)}" height="${bulat(H)}" fill="url(#arsirF)"/>`)
  bagian.push(`<rect x="0" y="${bulat(yP)}" width="${bulat(LX)}" height="${bulat(H)}" `
    + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.6)}"/>`)

  // Kolom berdiri di atas pondasi — digambar terpotong di tepi atas gambar.
  /*
    Tinggi kolom yang tampak dibatasi 60% tebal poer, bukan 85%.

    Pada pilecap tebal 500 mm, 85% berarti kolom menjulang 425 mm ke atas dan
    menabrak label "POTONGAN" — terlihat di tangkapan layar. Yang perlu
    disampaikan gambar ini cuma "ada kolom berdiri di sini", bukan tinggi
    kolomnya (yang memang bukan milik gambar pondasi).
  */
  const tinggiKolom = H * 0.6
  bagian.push(`<rect x="${bulat(kx)}" y="${bulat(yP - tinggiKolom)}" width="${bulat(BX)}" height="${bulat(tinggiKolom)}" `
    + `fill="${WARNA.betonIsi}" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.4)}"/>`)

  // Tulangan bawah pada potongan.
  /*
    URUTAN GAMBAR PENTING: garis arah-lain DULU, baru batang terpotong.

    Versi pertama menggambar lingkaran lebih dulu lalu menimpanya dengan
    garis biru — hasilnya batang merah nyaris hilang di balik garis. Di gambar
    kerja, batang terpotong (yang dihitung jumlahnya) harus lebih menonjol
    daripada batang menerus yang cuma menunjukkan arah.

    Jari-jarinya juga dinaikkan: pada pondasi 1,5 m, D13 hanya 0,9% lebar
    gambar — digambar apa adanya ia jadi titik yang tak terbaca.
  */
  const yTul = yP + H - (dTulanganMm * 2.4)
  const rTul = Math.max(dTulanganMm / 2, skala / 130)

  bagian.push(garis(dTulanganMm * 2, yTul, LX - dTulanganMm * 2, yTul,
    WARNA.sengkang, bulat(Math.max(t * 0.7, dTulanganMm * 0.3))))
  for (let x = jarakTulanganMm / 2; x < LX; x += jarakTulanganMm) {
    bagian.push(`<circle cx="${bulat(x)}" cy="${bulat(yTul)}" r="${bulat(rTul)}" `
      + `fill="${WARNA.tulangan}" stroke="#7f1d1d" stroke-width="${bulat(t * 0.35)}"/>`)
  }

  if (tiang.length) {
    // Tiang menembus ke bawah — digambar terpotong, sepanjang 60% tebal poer.
    const panjangTampak = H * 0.6
    const xUnik = [...new Set(tiang.map((p) => bulat(p.xM, 3)))]
    for (const xm of xUnik) {
      const x = LX / 2 + xm * 1000
      bagian.push(`<rect x="${bulat(x - DT / 2)}" y="${bulat(yP + H)}" `
        + `width="${bulat(DT)}" height="${bulat(panjangTampak)}" `
        + `fill="${WARNA.betonIsi}" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.2)}"/>`)
    }
    bagian.push(teks(LX / 2, yP + H + panjangTampak + ukuranTeks * 1.1,
      `${tiang.length} tiang Ø${bulat(DT, 0)} mm`, ukuranTeks * 0.85, WARNA.dimensi))
  } else {
    // Footplat: garis tanah di bawah dasar pondasi.
    const yTanah = yP + H
    bagian.push(garis(-margin * 0.5, yTanah, LX + margin * 0.5, yTanah, WARNA.dimensi, t * 1.1))
    for (let x = -margin * 0.4; x < LX + margin * 0.5; x += skala / 18) {
      bagian.push(garis(x, yTanah, x - skala / 40, yTanah + skala / 40, WARNA.dimensi, t * 0.5))
    }
  }

  bagian.push(teks(0, yP - ukuranTeks * 1.6, 'POTONGAN', ukuranTeks * 0.95, WARNA.dimensi, 'start'))

  if (pakaiDimensi) {
    const off = margin * 0.5
    bagian.push(...dimensi(0, -off, LX, -off, `${bulat(lxM, 2)} m`, t, ukuranTeks))
    bagian.push(...dimensi(-off, 0, -off, LY, `${bulat(lyM, 2)} m`, t, ukuranTeks, true))
    bagian.push(...dimensi(LX + off, yP, LX + off, yP + H, `t ${bulat(H, 0)}`, t, ukuranTeks, true))
    // Diberi jarak dari label tiang di atasnya — keduanya sempat bertabrakan.
    const yNotasi = yP + H
      + (tiang.length ? H * 0.6 + ukuranTeks * 2.9 : ukuranTeks * 1.8)
    bagian.push(teks(LX / 2, yNotasi,
      notasiTulangan(0, dTulanganMm, 'D', jarakTulanganMm) + ' dua arah',
      ukuranTeks * 0.95, WARNA.tulangan))
  }

  if (opsi.judul) bagian.push(teks(LX / 2, -margin * 1.05, opsi.judul, ukuranTeks * 1.2))

  const lebarPx = opsi.lebarPx ?? 480
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Denah & potongan pondasi')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── TIANG PANCANG: potongan memanjang + profil tanah ─────────────────────────

export interface InputGambarTiang {
  /** Diameter tiang, m. */
  diameterM: number
  /** Panjang tiang, m. */
  panjangM: number
  /** Lapisan tanah dari permukaan ke bawah. */
  lapisan: { tebalM: number; nSpt?: number; qcKgCm2?: number }[]
  /** Daya dukung ijin yang MENENTUKAN, kN. */
  pIjinKn?: number
  /** Apa yang membatasi: 'bahan' atau nama metode tanah. */
  penentu?: string
}

/**
 * Potongan memanjang tiang beserta profil tanahnya.
 *
 * Tiang adalah satu-satunya elemen yang daya dukungnya ditentukan oleh sesuatu
 * DI LUAR dirinya — lapisan tanah yang ditembusnya. Gambar yang hanya
 * menampilkan tiangnya tanpa tanah menyembunyikan justru variabel yang
 * menentukan, dan membuat dua tiang berdimensi identik dengan kapasitas
 * berbeda tiga kali lipat terlihat sama persis.
 *
 * Karena itu N-SPT tiap lapisan ikut ditulis: itulah angka yang, kalau
 * berubah, mengubah verdict-nya.
 */
export function gambarTiang(input: InputGambarTiang, opsi: OpsiGambar = {}): string {
  const { diameterM, panjangM, lapisan } = input
  if (!(diameterM > 0 && panjangM > 0)) throw new Error('Dimensi tiang harus > 0')

  const D = diameterM * 1000
  const L = panjangM * 1000

  /*
    Skala VERTIKAL dan HORIZONTAL sengaja berbeda.

    Tiang Ø400 sepanjang 16 m punya rasio 40:1 — digambar sebangun ia jadi
    garis rambut. Konvensi gambar geoteknik memang memakai skala terdistorsi
    untuk profil tiang; yang penting proporsi ANTAR LAPISAN tetap benar,
    karena itulah yang dibaca.
  */
  const lebarGambar = Math.max(D * 3.4, L / 12)
  const skalaX = lebarGambar / D

  const margin = L * 0.07
  const pakaiDimensi = opsi.dimensi ?? true
  const t = L / 320
  const ukuranTeks = L / 34

  /*
    ViewBox DIUKUR dari isi terjauh, bukan ditaksir.

    Versi pertama memakai kelipatan `margin` yang saya karang, dan hasilnya
    terlihat begitu dirender: judul terpotong di kiri, label N-SPT terpotong
    di kanan, "tahanan ujung" dan baris P-ijin hilang di bawah. Semuanya lolos
    tsc dan lolos test — cacat viewBox hanya terlihat dari gambarnya.

    Sekarang tiap tepi dihitung dari elemen terjauh ke arah itu:
      kiri   — teks "gesekan selimut" + garis dimensi panjang tiang
      kanan  — kolom tanah + label N-SPT (ditaksir 13 karakter)
      bawah  — ujung runcing + dua baris teks di bawahnya
  */
  const xTanahKanan = lebarGambar * 1.5 + lebarGambar * 1.62
  const lebarLabelNSpt = ukuranTeks * 0.82 * 13 * 0.55
  const tepiKiri = -(lebarGambar * 0.55 + ukuranTeks * 8)

  /*
    Tepi kanan harus memuat BARIS TERPANJANG, bukan hanya label N-SPT.

    Versi sebelumnya cuma menghitung kolom tanah — dan baris
    "P ijin 412.5 kN — ditentukan SPT (Meyerhof)" (±44 karakter) terpotong
    jadi "…SPT (Meye". Cacat yang persis sama dengan yang baru saja diperbaiki
    di atasnya, terulang karena saya menaksir lagi alih-alih mengukur.

    Lebar teks ditaksir dari jumlah karakter × ukuran font: SVG tak
    menyediakan pengukuran teks tanpa mesin render, jadi taksiran konservatif
    (0,58 em per karakter untuk sans-serif) adalah yang paling jujur di sini.
  */
  const barisBawah = `P ijin 000.0 kN — ditentukan ${input.penentu ?? ''}`.length
  const lebarBarisBawah = ukuranTeks * 0.92 * barisBawah * 0.58
  const tepiKanan = Math.max(xTanahKanan + lebarLabelNSpt, lebarBarisBawah)
  const tepiBawah = L + lebarGambar * 2.35 + ukuranTeks * 1.6

  const vbX = tepiKiri - margin * 0.5
  const vbY = -(lebarGambar * 0.35 + (opsi.judul ? margin * 1.6 : margin * 0.8))
  const vbW = (tepiKanan - tepiKiri) + margin
  const vbH = (tepiBawah - vbY) + margin * 0.6

  const bagian: string[] = []
  const xTiang = 0
  const xTanah = lebarGambar * 1.5

  // ── Profil tanah, digambar sesuai tebal sesungguhnya.
  let y = 0
  const abu = ['#e2e8f0', '#cbd5e1']
  lapisan.forEach((lap, k) => {
    const h = lap.tebalM * 1000
    if (h <= 0) return
    bagian.push(`<rect x="${bulat(xTanah)}" y="${bulat(y)}" width="${bulat(lebarGambar * 1.5)}" height="${bulat(h)}" `
      + `fill="${abu[k % 2]}" stroke="#94a3b8" stroke-width="${bulat(t * 0.6)}"/>`)
    const label = lap.nSpt != null ? `N-SPT ${lap.nSpt}`
      : lap.qcKgCm2 != null ? `qc ${lap.qcKgCm2}` : '—'
    bagian.push(teks(xTanah + lebarGambar * 1.62, y + h / 2 + ukuranTeks * 0.32,
      `${label}  (${bulat(lap.tebalM, 1)} m)`, ukuranTeks * 0.82, WARNA.teks, 'start'))
    y += h
  })

  // Garis muka tanah.
  bagian.push(garis(xTiang - lebarGambar * 0.6, 0, xTanah + lebarGambar * 1.5, 0,
    WARNA.dimensi, t * 1.3))
  for (let x = xTiang - lebarGambar * 0.55; x < xTanah; x += lebarGambar * 0.35) {
    bagian.push(garis(x, 0, x - lebarGambar * 0.18, -lebarGambar * 0.18, WARNA.dimensi, t * 0.6))
  }

  // ── Tiang.
  bagian.push(`<rect x="${bulat(xTiang)}" y="0" width="${bulat(lebarGambar)}" height="${bulat(L)}" `
    + `fill="${WARNA.betonIsi}" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.8)}"/>`)

  // Ujung tiang dibuat runcing — konvensi tiang pancang, dan menyatakan bahwa
  // tahanan ujung (end bearing) bekerja di sana.
  bagian.push(`<path d="M ${bulat(xTiang)} ${bulat(L)} L ${bulat(xTiang + lebarGambar / 2)} ${bulat(L + lebarGambar * 0.85)} `
    + `L ${bulat(xTiang + lebarGambar)} ${bulat(L)} Z" `
    + `fill="${WARNA.betonIsi}" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.8)}"/>`)

  // Panah gesekan selimut di kiri + tahanan ujung di bawah.
  /*
    Dua label mekanisme dijadikan SATU baris keterangan di bawah gambar.

    Ditaruh di kiri, ia menimpa garis dimensi ("kan selimut" di atas "L 16 m").
    Ditaruh di celah antara tiang dan tanah, ia menimpa badan tiang — celahnya
    memang tak cukup lebar untuk teks. Keduanya terlihat di tangkapan layar,
    tak satu pun terlihat dari kode.

    Sebagai keterangan di bawah, keduanya terbaca utuh dan justru lebih jelas:
    yang perlu disampaikan adalah bahwa kapasitas tiang datang dari DUA
    mekanisme, bukan menunjuk lokasi persisnya pada gambar.
  */
  bagian.push(teks(xTiang, L + lebarGambar * 1.5,
    'Kapasitas = gesekan selimut + tahanan ujung',
    ukuranTeks * 0.8, WARNA.sengkang, 'start'))

  if (pakaiDimensi) {
    const off = lebarGambar * 0.55
    bagian.push(...dimensi(xTiang - off, 0, xTiang - off, L,
      `L ${bulat(panjangM, 1)} m`, t, ukuranTeks, true))
    bagian.push(teks(xTiang + lebarGambar / 2, -lebarGambar * 0.35,
      `Ø${bulat(D, 0)} mm`, ukuranTeks * 0.95, WARNA.teks))

    if (input.pIjinKn != null) {
      /*
        Kapasitas DAN penentunya ditulis bersama.

        "P ijin 300 kN" saja tak bisa ditindak: kalau yang membatasi BAHAN,
        memperpanjang tiang tak menolong; kalau yang membatasi TANAH, justru
        itu satu-satunya yang menolong. Menyebut penentunya membuat gambar ini
        bisa dipakai mengambil keputusan, bukan cuma dibaca.
      */
      bagian.push(teks(xTiang, L + lebarGambar * 2.35,
        `P ijin ${bulat(input.pIjinKn, 1)} kN` + (input.penentu ? ` — ditentukan ${input.penentu}` : ''),
        ukuranTeks * 0.92, WARNA.tulangan, 'start'))
    }
  }

  if (opsi.judul) {
    bagian.push(teks(xTiang + lebarGambar / 2, -margin * 1.0, opsi.judul, ukuranTeks * 1.15))
  }

  const lebarPx = opsi.lebarPx ?? 380
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Potongan tiang pancang')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── METERAN KEKUATAN — visual untuk yang TIDAK mengerti teknik ────────────────

export interface BarisMeteran {
  /** Judul versi awam ("Kekuatan menahan lenturan"). */
  judul: string
  /** Rasio tuntutan/kapasitas. 1,0 = tepat di batas. */
  rasio: number
  aman: boolean
  /**
   * Pemeriksaan BINER — lulus atau gagal, tanpa "seberapa terpakai".
   *
   * Dua pemeriksaan berperilaku begini: "Tanah tidak terangkat" dan "Tidak ada
   * tiang tercabut". Keduanya memakai `rasio: 0` saat lulus, karena memang tak
   * ada kapasitas yang terpakai — yang ditanya cuma "terjadi atau tidak".
   *
   * Digambar sebagai batang, hasilnya "0%" dengan alur kosong — dan pembaca
   * non-teknis menyangka kapasitasnya NOL, yaitu kebalikan dari artinya.
   * Terlihat di tangkapan layar sebagai satu baris yang mengganggu di tengah
   * meteran yang lain masuk akal.
   */
  biner?: boolean
}

/**
 * Meteran batang: seberapa banyak kapasitas tiap pemeriksaan sudah terpakai.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * KENAPA VISUAL, BUKAN TABEL ANGKA
 *
 * Tabel "153,15 ≥ 83,20 kNm · aman" benar dan bisa diperiksa insinyur. Tetapi
 * yang memutuskan membangun sering bukan insinyur, dan bagi mereka baris itu
 * cuma dua angka: tak terlihat mana yang longgar dan mana yang nyaris lewat.
 *
 * Batang yang panjangnya sebanding dengan pemakaian kapasitas menjawab itu
 * dalam sekali lihat — dan yang paling penting: batang 98% dan batang 42%
 * terlihat BERBEDA JAUH, padahal keduanya sama-sama berlabel "aman".
 *
 * ── Kenapa garis batas digambar, bukan cuma warna
 *
 * Warna saja tak cukup: sekitar 8% laki-laki mengalami buta warna merah-hijau,
 * dan mereka melihat batang merah dan hijau nyaris sama. Garis batas vertikal
 * di 100% membuat "lewat batas" terbaca dari POSISI, bukan dari warna — dan
 * posisi bisa dilihat semua orang.
 *
 * Angka persennya juga ditulis, karena grafik tanpa angka tak bisa dijadikan
 * rujukan saat orang berdiskusi.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function gambarMeteranKekuatan(
  baris: BarisMeteran[], opsi: OpsiGambar = {},
): string {
  if (!baris.length) throw new Error('Meteran butuh minimal satu pemeriksaan')

  // Satuan gambar = piksel logis; tak ada dimensi fisik di sini.
  const W = 1000
  const tinggiBaris = 56
  const jarakBaris = 16
  const xLabel = 0
  const lebarLabel = 380
  const xBatang = lebarLabel + 24
  const lebarBatang = W - xBatang - 90     // sisakan ruang untuk angka persen
  const atas = opsi.judul ? 54 : 12

  const H = atas + baris.length * (tinggiBaris + jarakBaris) + 46
  const t = 1.6
  const teksUkuran = 17

  const bagian: string[] = []

  if (opsi.judul) {
    bagian.push(teks(0, 26, opsi.judul, teksUkuran * 1.25, WARNA.teks, 'start'))
  }

  /*
    ── SKALA DUA BAGIAN, bukan linier

    Rasio bisa jauh melewati 1: pondasi yang kurang setengahnya punya rasio
    2,0 atau lebih, dan geser pons bisa 2,6.

    Skala linier 0–130% (percobaan pertama) membuat batang 148% dan 260%
    berakhir di titik yang SAMA PERSIS — keduanya mentok di ujung. Terlihat di
    tangkapan layar: dua pemeriksaan dengan tingkat kekurangan yang jauh
    berbeda tergambar identik, padahal yang satu perlu diperbesar sedikit dan
    yang lain perlu dirancang ulang.

    Sekarang 0–100% memakai 70% lebar (bagian yang paling sering dibaca dan
    paling butuh ketelitian), sisanya 30% lebar memuat 100%–400% secara
    logaritmik. Di atas 400% ujungnya bergerigi — konvensi grafik untuk
    "nilainya di luar sumbu", bukan disamarkan seolah pas di tepi.

    Garis batas 100% karena itu berada tepat di 70% lebar batang: posisi tetap,
    mudah dibandingkan antar baris.
  */
  const PORSI_AMAN = 0.7          // 0–100% menempati 70% lebar
  const RASIO_MAKS = 4.0          // di atas ini: bergerigi
  const x100 = xBatang + lebarBatang * PORSI_AMAN

  /** Rasio → panjang batang, dua bagian. */
  const panjangBatang = (r: number): number => {
    if (r <= 1) return lebarBatang * PORSI_AMAN * Math.max(r, 0)
    const lebih = Math.min(r, RASIO_MAKS)
    // Logaritmik: 100%→0, 400%→penuh. log(1)=0, jadi tak ada pembagian nol.
    const bagian = Math.log(lebih) / Math.log(RASIO_MAKS)
    return lebarBatang * (PORSI_AMAN + (1 - PORSI_AMAN) * bagian)
  }

  baris.forEach((b, i) => {
    const y = atas + i * (tinggiBaris + jarakBaris)
    const yTengah = y + tinggiBaris / 2

    // Warna mengikuti tingkat bahaya yang sama dengan `struktur-awam.ts`.
    const warna = !b.aman ? WARNA.tulangan
      : b.rasio >= 0.9 ? '#d97706'      // amber — "mepet"
      : '#059669'                        // hijau — aman berjarak
    const warnaLatar = !b.aman ? '#fee2e2' : b.rasio >= 0.9 ? '#fef3c7' : '#d1fae5'

    bagian.push(teks(xLabel, yTengah + teksUkuran * 0.34, b.judul, teksUkuran, WARNA.teks, 'start'))

    /*
      Pemeriksaan biner: lencana "terpenuhi"/"TIDAK", bukan batang persen.
      Digambar di posisi batang supaya barisnya tetap sejajar dengan yang lain.
    */
    if (b.biner) {
      const lebarLencana = 190
      bagian.push(`<rect x="${bulat(xBatang)}" y="${bulat(y + 14)}" `
        + `width="${lebarLencana}" height="${bulat(tinggiBaris - 28)}" rx="6" `
        + `fill="${b.aman ? '#d1fae5' : '#fee2e2'}" `
        + `stroke="${b.aman ? '#059669' : WARNA.tulangan}" stroke-width="${t * 1.2}"/>`)
      bagian.push(teks(xBatang + lebarLencana / 2, yTengah + teksUkuran * 0.34,
        b.aman ? 'terpenuhi' : 'TIDAK terpenuhi',
        teksUkuran * 0.9, b.aman ? '#059669' : WARNA.tulangan))
      return
    }


    // Alur batang (kapasitas penuh) — supaya "sisa" ikut terlihat, bukan
    // hanya yang terpakai.
    bagian.push(`<rect x="${bulat(xBatang)}" y="${bulat(y + 14)}" `
      + `width="${bulat(lebarBatang)}" height="${bulat(tinggiBaris - 28)}" `
      + `rx="6" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="${t}"/>`)

    const terpakai = panjangBatang(b.rasio)
    bagian.push(`<rect x="${bulat(xBatang)}" y="${bulat(y + 14)}" `
      + `width="${bulat(Math.max(terpakai, 2))}" height="${bulat(tinggiBaris - 28)}" `
      + `rx="6" fill="${warnaLatar}" stroke="${warna}" stroke-width="${t * 1.2}"/>`)

    // Ujung bergerigi bila nilainya melewati skala.
    if (b.rasio > RASIO_MAKS) {
      const xu = xBatang + lebarBatang
      const yA = y + 14, yB = y + tinggiBaris - 14
      bagian.push(`<path d="M ${bulat(xu - 10)} ${bulat(yA)} L ${bulat(xu)} ${bulat((yA + yB) / 2)} `
        + `L ${bulat(xu - 10)} ${bulat(yB)}" fill="none" stroke="${warna}" stroke-width="${t * 1.6}"/>`)
    }

    bagian.push(teks(xBatang + lebarBatang + 12, yTengah + teksUkuran * 0.34,
      `${Math.round(b.rasio * 100)}%`, teksUkuran, warna, 'start'))
  })

  /*
    GARIS BATAS 100% digambar TERAKHIR supaya berada di atas semua batang.

    Inilah yang membuat verdict terbaca tanpa warna: apa pun warnanya, batang
    yang ujungnya melewati garis ini berarti lewat batas.
  */
  const yAkhir = atas + baris.length * (tinggiBaris + jarakBaris) - jarakBaris
  bagian.push(garis(x100, atas - 4, x100, yAkhir + 6, '#334155', t * 1.6, true))
  bagian.push(teks(x100, yAkhir + 30, 'batas aman (100%)', teksUkuran * 0.82, '#334155'))

  const lebarPx = opsi.lebarPx ?? 720
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${bulat(H)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Meteran pemakaian kapasitas')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Penampang profil BAJA ────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENAMPANG PROFIL BAJA — satu gambar untuk sepuluh jenis elemen
 *
 * Sampai 2026-08-19, dari 32 jenis elemen hanya TUJUH yang menghasilkan gambar,
 * dan ketujuhnya beton. Seluruh sisi baja — balok, kolom, gording, bracing,
 * rangka, base plate, angkur, sambungan, interaksi — tak punya satu pun.
 *
 * Yang membuatnya berarti bukan kerapian. Estimator memesan baja dari GAMBAR,
 * dan angka yang paling sering salah pesan adalah TEBAL BADAN vs TEBAL SAYAP:
 * keduanya ditulis berdampingan di penamaan profil ("200x100x5,5x8") dan
 * tertukar tanpa gejala sampai batangnya datang.
 *
 * Karena itu gambar ini menandai keduanya TERPISAH dengan garis penunjuk
 * masing-masing, bukan hanya mencetak ulang penamaannya.
 *
 * ── Yang TIDAK digambar, dan kenapa
 *
 * Fillet (lengkungan sudut antara badan dan sayap) diabaikan — sama seperti
 * `luasPenampang()` mengabaikannya. Kalau gambar memperlihatkan fillet
 * sementara perhitungannya tidak, gambar itu menjanjikan ketelitian yang tak
 * ada di angkanya.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarProfilBaja {
  /** Tinggi profil, mm. */
  hMm: number
  /** Lebar sayap, mm. */
  bMm: number
  /** Tebal badan (web), mm. */
  twMm: number
  /** Tebal sayap (flange), mm. */
  tfMm: number
  /** WF · H · C · L — menentukan bentuk yang digambar. */
  bentuk?: string
  /** Penamaan dari tabel, dicetak sebagai catatan. */
  designation?: string
}

/** Warna baja — dibedakan dari beton supaya dua gambar tak tertukar sekilas. */
const WARNA_BAJA = '#334155'
const WARNA_BAJA_ISI = '#e2e8f0'

/**
 * Titik-titik tepi luar penampang, searah jarum jam dari kiri-atas.
 *
 * DIPISAH dari penggambaran supaya bisa diuji sebagai ANGKA. Bentuk penampang
 * adalah hal yang harus benar, dan memeriksanya lewat string SVG akan rapuh —
 * pelajaran yang sama dengan `posisiTulangan()`.
 */
export function titikProfilBaja(input: InputGambarProfilBaja): Array<[number, number]> {
  const { hMm: h, bMm: b, twMm: tw, tfMm: tf } = input
  if (!(h > 0) || !(b > 0) || !(tw > 0) || !(tf > 0)) {
    throw new Error('Dimensi profil harus > 0')
  }
  if (2 * tf >= h) throw new Error('Dua tebal sayap tak boleh setinggi profilnya')
  if (tw >= b) throw new Error('Tebal badan tak boleh selebar sayapnya')

  const bentuk = (input.bentuk ?? 'WF').toUpperCase()

  /*
    Profil C (kanal) — badan di SATU sisi, bukan di tengah. Menggambarnya
    sebagai I membuat sumbu lemahnya terlihat simetris padahal tidak, dan
    justru ketaksimetrisan itu yang membuat kanal terpuntir saat dibebani.
  */
  if (bentuk === 'C' || bentuk === 'CNP' || bentuk === 'KANAL') {
    return [
      [0, 0], [b, 0], [b, tf], [tw, tf],
      [tw, h - tf], [b, h - tf], [b, h], [0, h],
    ]
  }

  /* Siku (L) — dua kaki, tanpa sayap kedua. */
  if (bentuk === 'L' || bentuk === 'SIKU') {
    return [[0, 0], [tw, 0], [tw, h - tf], [b, h - tf], [b, h], [0, h]]
  }

  /* WF / H / INP — badan di tengah, dua sayap. */
  const x1 = (b - tw) / 2
  const x2 = x1 + tw
  return [
    [0, 0], [b, 0], [b, tf], [x2, tf],
    [x2, h - tf], [b, h - tf], [b, h], [0, h],
    [0, h - tf], [x1, h - tf], [x1, tf], [0, tf],
  ]
}

export function gambarProfilBaja(
  input: InputGambarProfilBaja,
  opsi: OpsiGambar = {},
): string {
  const { hMm: h, bMm: b, twMm: tw, tfMm: tf } = input
  const titik = titikProfilBaja(input)

  const margin = opsi.marginMm ?? Math.max(b, h) * 0.45
  const pakaiDimensi = opsi.dimensi ?? true
  const ruangNotasi = pakaiDimensi ? margin * 1.3 : 0

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = b + 2 * margin + ruangNotasi
  const vbH = h + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(b, h) / 250
  const ukuranTeks = Math.max(b, h) / 18

  const bagian: string[] = []

  /* Arsir baja: garis rapat 45°, konvensi berbeda dari beton. */
  const jarakArsir = Math.max(b, h) / 34
  bagian.push(
    `<defs><pattern id="arsirBaja" width="${bulat(jarakArsir)}" height="${bulat(jarakArsir)}" `
    + `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${bulat(jarakArsir)}" `
    + `stroke="#94a3b8" stroke-width="${bulat(t * 0.55)}"/></pattern></defs>`)

  const d = titik.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${bulat(x)},${bulat(y)}`).join(' ') + ' Z'
  bagian.push(`<path d="${d}" fill="${WARNA_BAJA_ISI}"/>`)
  bagian.push(`<path d="${d}" fill="url(#arsirBaja)"/>`)
  bagian.push(`<path d="${d}" fill="none" stroke="${WARNA_BAJA}" stroke-width="${bulat(t * 1.7)}"/>`)

  if (pakaiDimensi) {
    const off = margin * 0.42
    const xNot = b + off * 1.1

    /* Tinggi total (h) — di kiri. */
    bagian.push(garis(-off, 0, -off, h, WARNA.dimensi, t * 0.7))
    bagian.push(garis(-off - t * 3, 0, -off + t * 3, 0, WARNA.dimensi, t * 0.7))
    bagian.push(garis(-off - t * 3, h, -off + t * 3, h, WARNA.dimensi, t * 0.7))
    bagian.push(
      `<g transform="translate(${bulat(-off - ukuranTeks * 0.6)},${bulat(h / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(ukuranTeks * 0.95)}" fill="${WARNA.dimensi}" `
      + `text-anchor="middle">h ${bulat(h, 0)}</text></g>`)

    /* Lebar sayap (b) — di bawah. */
    bagian.push(garis(0, h + off, b, h + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(b / 2, h + off + ukuranTeks * 1.15,
      `b ${bulat(b, 0)}`, ukuranTeks * 0.95, WARNA.dimensi))

    /*
      ── TEBAL BADAN dan TEBAL SAYAP, ditunjuk TERPISAH.

      Inilah alasan utama gambar ini ada. Keduanya ditulis berdampingan di
      penamaan profil ("200x100x5,5x8") dan tertukar tanpa gejala sampai
      batangnya datang ke lapangan. Angka di daftar tak mencegah itu; garis
      penunjuk ke bagian yang dimaksud mencegahnya.
    */
    const yBadan = h / 2
    const xBadan = (b + tw) / 2
    bagian.push(garis(xBadan, yBadan, xNot - ukuranTeks * 0.3, yBadan, WARNA_BAJA, t * 0.5))
    bagian.push(teks(xNot, yBadan + ukuranTeks * 0.32,
      `badan ${bulat(tw, 1)}`, ukuranTeks * 0.9, WARNA_BAJA, 'start'))

    const ySayap = tf / 2
    bagian.push(garis(b * 0.72, ySayap, xNot - ukuranTeks * 0.3, ySayap, WARNA_BAJA, t * 0.5))
    bagian.push(teks(xNot, ySayap + ukuranTeks * 0.32,
      `sayap ${bulat(tf, 1)}`, ukuranTeks * 0.9, WARNA_BAJA, 'start'))

    if (input.designation) {
      bagian.push(teks(b / 2, h + off + ukuranTeks * 2.4,
        amankanTeks(`${(input.bentuk ?? 'WF').toUpperCase()} ${input.designation}`),
        ukuranTeks * 0.85, WARNA.dimensi))
    }
  }

  if (opsi.judul) {
    bagian.push(teks(b / 2, -margin * 0.55, opsi.judul, ukuranTeks * 1.25))
  }

  const lebarPx = opsi.lebarPx ?? 420
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Penampang profil baja')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Potongan DINDING PENAHAN TANAH ───────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DINDING PENAHAN — gambar yang MENJELASKAN verdict-nya, bukan sekadar bentuknya
 *
 * Dinding penahan adalah satu-satunya elemen di aplikasi ini yang bisa runtuh
 * TANPA satu pun bahannya gagal: betonnya utuh, tulangannya utuh, dan
 * dindingnya terguling atau tergeser sebagai satu benda. Tiga dari empat
 * pemeriksaannya bukan tentang kekuatan bahan sama sekali.
 *
 * Karena itu gambar ini memuat tiga hal yang tak ada di gambar elemen lain:
 *
 *   1. SEGITIGA TEKANAN TANAH di belakang badan — beban yang mendorongnya,
 *      dan bentuk segitiganya menjelaskan kenapa dorongan tumbuh dengan
 *      KUADRAT tinggi, bukan sebanding tingginya.
 *   2. TRAPESIUM TEKANAN TUMPU di bawah telapak — dan bila resultan keluar
 *      dari inti sepertiga tengah, ujung tumitnya TERANGKAT. Itu keadaan yang
 *      tak bisa dibaca dari angka mana pun tanpa gambar.
 *   3. Angka keamanan guling & geser dicetak di gambarnya.
 *
 * ── Kenapa bukan sekadar batang persen
 *
 * Meteran kekuatan menjawab "seberapa terpakai". Untuk dinding penahan,
 * pertanyaan yang sesungguhnya adalah "apa yang harus saya UBAH" — dan
 * jawabannya hampir selalu tentang GEOMETRI (perpanjang tumit, tambah kaki),
 * bukan tentang mutu beton. Geometri hanya bisa ditunjukkan dengan gambar.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarDindingPenahan {
  /** Tinggi total dinding (badan + telapak), m. */
  tinggiM: number
  /** Tebal badan di puncak, m. */
  tebalAtasM: number
  /** Tebal badan di dasar, m. */
  tebalBawahM: number
  /** Panjang telapak (kaki + tebal badan + tumit), m. */
  panjangTelapakM: number
  /** Tebal telapak, m. */
  tebalTelapakM: number
  /** Panjang kaki (sisi depan, arah tanah lebih rendah), m. */
  kakiM: number
  /** Tekanan tumpu maksimum di bawah telapak, kPa. */
  qMaksKnM2?: number
  /** Tekanan tumpu minimum. Nol atau negatif = tumit TERANGKAT. */
  qMinKnM2?: number
  /** Angka keamanan guling. */
  sfGuling?: number
  /** Angka keamanan geser. */
  sfGeser?: number
  /** Gaya dorong tanah per meter, kN/m. */
  paKnPerM?: number
}

/**
 * Merah PERINGATAN — dipakai HANYA untuk keadaan yang perlu ditindak.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * Dibuat terpisah sesudah `#dc2626` terbukti memikul DUA arti sekaligus:
 * "bahaya" (SF kurang, tumit terangkat, jarak dilanggar) dan "gaya tekan"
 * (lewat `WARNA.tulangan`, yang kebetulan bernilai sama).
 *
 * Dua arti pada satu warna membuat warna itu berhenti berarti apa-apa: pembaca
 * yang melihat merah pada gambar batang tekan yang sehat belajar bahwa merah
 * tak selalu berarti masalah — dan pelajaran itu terbawa ke gambar berikutnya
 * yang merahnya sungguhan.
 *
 * Ketahuan dari uji yang menuntut "gambar aman TIDAK memuat merah". Uji itu
 * merah, dan yang salah bukan ujinya.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export const WARNA_BAHAYA = '#dc2626'

/**
 * Ungu TEKAN — gaya tekan pada batang, BUKAN peringatan.
 *
 * Dipilih ungu, bukan oranye/kuning, karena keduanya sudah dipakai tanah dan
 * kayu di berkas ini.
 */
const WARNA_TEKAN = '#7c3aed'

/**
 * Aksen NETRAL untuk penandaan yang bukan peringatan — garis ukur, anak panah
 * gaya, isian penanda.
 *
 * Ada karena `WARNA.tulangan` bernilai `#dc2626`, sama persis dengan merah
 * peringatan. Memakainya untuk hiasan membuat gambar yang sehat penuh merah,
 * dan uji "gambar aman TIDAK memuat merah" — satu-satunya cara memeriksa
 * bahwa peringatan masih berarti — jadi mustahil ditulis.
 *
 * `WARNA.tulangan` tetap dipakai untuk TULANGAN pada gambar beton, tempat
 * merah memang konvensi gambar teknik dan tak bersaing dengan peringatan.
 */
const WARNA_AKSEN = '#ea580c'

const WARNA_TANAH = '#a16207'
const WARNA_TEKANAN = '#0891b2'

/** Ambang angka keamanan yang lazim untuk guling & geser (SNI 8460). */
const SF_MINIMUM = 1.5

export function gambarDindingPenahan(
  input: InputGambarDindingPenahan,
  opsi: OpsiGambar = {},
): string {
  const {
    tinggiM: H, tebalAtasM: ta, tebalBawahM: tb,
    panjangTelapakM: B, tebalTelapakM: tt, kakiM: kaki,
  } = input

  for (const [nama, v] of [
    ['Tinggi dinding', H], ['Tebal atas', ta], ['Tebal bawah', tb],
    ['Panjang telapak', B], ['Tebal telapak', tt],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }
  if (tt >= H) throw new Error('Tebal telapak tak boleh setinggi dindingnya')
  if (!(kaki >= 0)) throw new Error('Panjang kaki tak boleh negatif')
  if (kaki + tb > B) throw new Error('Kaki + tebal badan melebihi panjang telapak')

  /* Digambar dalam MILIMETER supaya sekeluarga dengan gambar lain. */
  const S = 1000
  const h = H * S, bAtas = ta * S, bBawah = tb * S
  const b = B * S, tTel = tt * S, xKaki = kaki * S
  const hBadan = h - tTel

  const margin = opsi.marginMm ?? Math.max(b, h) * 0.4
  const pakaiDimensi = opsi.dimensi ?? true
  /* Ruang kanan untuk segitiga tekanan tanah + angkanya. */
  const ruangKanan = pakaiDimensi ? margin * 1.5 : 0

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = b + 2 * margin + ruangKanan
  const vbH = h + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(b, h) / 260
  const uk = Math.max(b, h) / 20

  const bagian: string[] = []

  const jarakArsir = Math.max(b, h) / 24
  bagian.push(
    `<defs><pattern id="arsirDinding" width="${bulat(jarakArsir)}" `
    + `height="${bulat(jarakArsir)}" patternUnits="userSpaceOnUse" `
    + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" `
    + `y2="${bulat(jarakArsir)}" stroke="#cbd5e1" `
    + `stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  /*
    ── TANAH DI BELAKANG, digambar lebih dulu supaya betonnya di atasnya.
    Sisi belakang = sisi TUMIT, yaitu kanan pada gambar ini.
  */
  const xBelakang = xKaki + bBawah
  bagian.push(
    `<rect x="${bulat(xBelakang)}" y="0" width="${bulat(Math.max(0, b - xBelakang))}" `
    + `height="${bulat(hBadan)}" fill="${WARNA_TANAH}" opacity="0.14"/>`)

  /* Badan dinding: trapesium, karena tebal atas biasanya ≠ tebal bawah. */
  const badan: Array<[number, number]> = [
    [xKaki, 0], [xKaki + bAtas, 0],
    [xKaki + bBawah, hBadan], [xKaki, hBadan],
  ]
  const dBadan = badan
    .map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${bulat(x)},${bulat(y)}`)
    .join(' ') + ' Z'

  bagian.push(`<path d="${dBadan}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<path d="${dBadan}" fill="url(#arsirDinding)"/>`)
  bagian.push(`<path d="${dBadan}" fill="none" stroke="${WARNA.beton}" `
    + `stroke-width="${bulat(t * 1.6)}"/>`)

  /* Telapak. */
  for (const [isi, stroke] of [
    [WARNA.betonIsi, ''], ['url(#arsirDinding)', ''], ['none', WARNA.beton],
  ] as Array<[string, string]>) {
    bagian.push(
      `<rect x="0" y="${bulat(hBadan)}" width="${bulat(b)}" height="${bulat(tTel)}" `
      + `fill="${isi}"`
      + (stroke ? ` stroke="${stroke}" stroke-width="${bulat(t * 1.6)}"` : '')
      + `/>`)
  }

  if (pakaiDimensi) {
    /*
      ── SEGITIGA TEKANAN TANAH
      Nol di permukaan, maksimum di dasar. Bentuk segitiganya menjelaskan
      kenapa dorongan tumbuh dengan KUADRAT tinggi: luasnya ½·ka·γ·H².
      Menggambarnya sebagai persegi (dorongan merata) adalah kesalahpahaman
      yang paling sering pada orang yang belum pernah menghitungnya — dan
      yang membuat orang menyangka menaikkan dinding setengah meter hanya
      menambah dorongan sedikit.
    */
    const lebarSegitiga = margin * 0.9
    const xT = b + margin * 0.18
    bagian.push(
      `<path d="M${bulat(xT)},0 L${bulat(xT + lebarSegitiga)},${bulat(hBadan)} `
      + `L${bulat(xT)},${bulat(hBadan)} Z" fill="${WARNA_TANAH}" opacity="0.3" `
      + `stroke="${WARNA_TANAH}" stroke-width="${bulat(t * 0.9)}"/>`)

    /* Tiga anak panah dorongan, makin panjang ke bawah. */
    for (const f of [0.35, 0.65, 0.95]) {
      const y = hBadan * f
      const pj = lebarSegitiga * f
      bagian.push(garis(xT + pj, y, xT, y, WARNA_TANAH, t * 0.8))
      bagian.push(
        `<path d="M${bulat(xT)},${bulat(y)} l${bulat(uk * 0.4)},${bulat(-uk * 0.22)} `
        + `l0,${bulat(uk * 0.44)} Z" fill="${WARNA_TANAH}"/>`)
    }
    if (input.paKnPerM != null) {
      bagian.push(teks(xT + lebarSegitiga * 0.5, hBadan + uk * 1.15,
        `Pa ${bulat(input.paKnPerM, 1)} kN/m`, uk * 0.8, WARNA_TANAH))
    }

    /*
      ── TRAPESIUM TEKANAN TUMPU di bawah telapak.

      Bila `qMin <= 0`, resultan keluar dari inti sepertiga tengah dan ujung
      TUMIT TERANGKAT — tanah di sana tak menekan sama sekali. Itu keadaan
      yang tak terbaca dari satu angka pun tanpa gambar, dan yang membuat
      dinding berputar pelan-pelan selama bertahun-tahun tanpa pernah
      benar-benar runtuh.
    */
    const qMaks = input.qMaksKnM2
    const qMin = input.qMinKnM2
    if (qMaks != null && qMaks > 0) {
      const skala = (h * 0.17) / qMaks
      const yDasar = hBadan + tTel
      const hKiri = Math.max(0, qMaks * skala)
      const hKanan = Math.max(0, (qMin ?? 0) * skala)
      const terangkat = qMin != null && qMin <= 0

      bagian.push(
        `<path d="M0,${bulat(yDasar)} L${bulat(b)},${bulat(yDasar)} `
        + `L${bulat(b)},${bulat(yDasar + hKanan)} L0,${bulat(yDasar + hKiri)} Z" `
        + `fill="${terangkat ? '#dc2626' : WARNA_TEKANAN}" opacity="0.28" `
        + `stroke="${terangkat ? '#dc2626' : WARNA_TEKANAN}" `
        + `stroke-width="${bulat(t * 0.9)}"/>`)

      bagian.push(teks(0, yDasar + hKiri + uk * 1.05,
        `q ${bulat(qMaks, 0)} kPa`, uk * 0.78, WARNA_TEKANAN, 'start'))

      if (terangkat) {
        bagian.push(teks(b, yDasar + uk * 2.1,
          'TUMIT TERANGKAT', uk * 0.82, '#dc2626', 'end'))
      }
    }

    /* Dimensi utama. */
    const off = margin * 0.4
    bagian.push(garis(0, h + off, b, h + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(b / 2, h + off + uk * 1.1,
      `B ${bulat(B, 2)} m`, uk * 0.85, WARNA.dimensi))

    bagian.push(garis(-off, 0, -off, h, WARNA.dimensi, t * 0.7))
    bagian.push(
      `<g transform="translate(${bulat(-off - uk * 0.55)},${bulat(h / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(uk * 0.85)}" fill="${WARNA.dimensi}" text-anchor="middle">`
      + `H ${bulat(H, 2)} m</text></g>`)

    /*
      ── ANGKA KEAMANAN dicetak DI GAMBAR.

      Guling dan geser adalah dua dari tiga cara dinding ini runtuh, dan
      keduanya tak terlihat sama sekali dari bentuknya. Yang membaca gambar
      tanpa angka ini akan menilainya dari "kelihatan kokoh" — penilaian yang
      justru paling sering keliru pada dinding penahan: dinding yang tebal
      dan berat bisa tetap terguling kalau telapaknya kurang panjang.
    */
    const barisSf: Array<[string, boolean]> = []
    if (input.sfGuling != null) {
      barisSf.push([`SF guling ${bulat(input.sfGuling, 2)}`, input.sfGuling < SF_MINIMUM])
    }
    if (input.sfGeser != null) {
      barisSf.push([`SF geser ${bulat(input.sfGeser, 2)}`, input.sfGeser < SF_MINIMUM])
    }
    barisSf.forEach(([isi, kurang], k) => {
      bagian.push(teks(0, -margin * 0.14 + k * uk * 1.05,
        isi, uk * 0.82, kurang ? '#dc2626' : WARNA.dimensi, 'start'))
    })
  }

  if (opsi.judul) {
    bagian.push(teks(b / 2, -margin * 0.55, opsi.judul, uk * 1.2))
  }

  const lebarPx = opsi.lebarPx ?? 520
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Potongan dinding penahan tanah')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Potongan TANGGA ──────────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * TANGGA — satu-satunya elemen yang kegagalannya BUKAN runtuh
 *
 * Semua elemen lain di aplikasi ini gagal dengan cara yang sama: bahannya kalah
 * dan bendanya runtuh. Tangga tidak. Tangga yang kuat sempurna tetap gagal
 * kalau ORANG TERJATUH DI ATASNYA — dan itu kegagalan yang jauh lebih sering
 * terjadi daripada tangga beton yang patah.
 *
 * Tiga pemeriksaannya karena itu bukan tentang kekuatan sama sekali: langkah
 * nyaman (Blondel), tinggi anak tangga, lebar injakan. Ketiganya GEOMETRI, dan
 * geometri hanya bisa diperiksa dengan mata pada gambar.
 *
 * ── Yang digambar, dan kenapa justru ini
 *
 * Potongan SAMPING dengan anak tangga sungguhan, bukan bidang miring polos.
 * Alasannya konkret: pelanggaran optrede/antrede terlihat sebagai anak tangga
 * yang terlalu curam atau terlalu sempit — bentuk yang langsung dikenali
 * siapa pun, termasuk yang tak pernah membaca SNI.
 *
 * Anak tangga TERAKHIR digambar apa adanya. Kalau tinggi total tak habis dibagi
 * optrede, anak terakhir jadi berbeda tinggi — dan anak tangga yang berbeda
 * sendirian adalah penyebab tersandung yang paling sering di lapangan. Modulnya
 * sudah menghitung ulang optrede supaya rata; gambar ini memperlihatkan
 * hasilnya, jadi kalau suatu saat perhitungan itu rusak, gambarnya yang
 * memberi tahu.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarTangga {
  /** Tinggi total yang ditempuh, m. */
  tinggiM: number
  /** Tinggi satu anak tangga (yang DIPAKAI, sesudah dibulatkan), mm. */
  optredeMm: number
  /** Lebar satu injakan, mm. */
  antredeMm: number
  /** Tebal pelat tangga, mm. */
  tebalPelatMm: number
  /** Jumlah anak tangga. */
  jumlahOptrede?: number
  /** Kemiringan, derajat. */
  kemiringanDerajat?: number
  /** Nilai Blondel (2·optrede + antrede), mm. */
  blondelMm?: number
}

/** Rentang Blondel yang nyaman, mm — SNI 03-1728 & praktik lapangan. */
const BLONDEL_MIN = 600
const BLONDEL_MAKS = 650

export function gambarTangga(
  input: InputGambarTangga,
  opsi: OpsiGambar = {},
): string {
  const { tinggiM: H, optredeMm: o, antredeMm: a, tebalPelatMm: tp } = input

  for (const [nama, v] of [
    ['Tinggi tangga', H], ['Optrede', o], ['Antrede', a], ['Tebal pelat', tp],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }

  const h = H * 1000
  /*
    Jumlah anak tangga diambil dari HASIL bila ada, bukan dihitung ulang.
    Menghitungnya dua kali berarti gambar dan verdict bisa berselisih diam-diam
    saat pembulatannya diperbaiki — aturan yang sama dengan pilecap & dinding.
  */
  const n = input.jumlahOptrede ?? Math.max(1, Math.round(h / o))
  if (!Number.isFinite(n) || n < 1) throw new Error('Jumlah anak tangga tak masuk akal')
  if (n > 60) throw new Error('Jumlah anak tangga di luar batas wajar (> 60)')

  const panjangDatar = n * a
  const margin = opsi.marginMm ?? Math.max(panjangDatar, h) * 0.3
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = panjangDatar + 2 * margin
  const vbH = h + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(panjangDatar, h) / 300
  const uk = Math.max(panjangDatar, h) / 26

  const bagian: string[] = []

  const jarakArsir = Math.max(panjangDatar, h) / 30
  bagian.push(
    `<defs><pattern id="arsirTangga" width="${bulat(jarakArsir)}" `
    + `height="${bulat(jarakArsir)}" patternUnits="userSpaceOnUse" `
    + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" `
    + `y2="${bulat(jarakArsir)}" stroke="#cbd5e1" `
    + `stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  /*
    ── PROFIL ANAK TANGGA, dari bawah ke atas.

    y = 0 di PUNCAK (konvensi SVG), jadi anak pertama ada di y = h.
    Digambar sebagai satu poligon tertutup: garis tangga (bertangga) di atas,
    dan sisi bawahnya sejajar-miring setebal pelat.
  */
  const atas: Array<[number, number]> = [[0, h]]
  for (let k = 0; k < n; k++) {
    const yNaik = h - (k + 1) * o
    atas.push([k * a, yNaik])          // naik satu optrede
    atas.push([(k + 1) * a, yNaik])    // maju satu antrede
  }

  /*
    Sisi bawah pelat: tegak lurus terhadap bidang miring, bukan vertikal.
    Digeser sejauh tebal pelat pada arah normal kemiringannya — inilah tebal
    yang sesungguhnya dipakai perhitungan lentur, dan menggambarnya vertikal
    membuat pelat terlihat lebih tebal daripada yang dihitung.
  */
  const panjangMiring = Math.hypot(panjangDatar, h)
  const nx = (h / panjangMiring) * tp
  const ny = (panjangDatar / panjangMiring) * tp

  const bawah: Array<[number, number]> = [
    [panjangDatar + nx, h - n * o + ny],
    [nx, h + ny],
  ]

  const semua = [...atas, ...bawah]
  const d = semua
    .map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${bulat(x)},${bulat(y)}`)
    .join(' ') + ' Z'

  bagian.push(`<path d="${d}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<path d="${d}" fill="url(#arsirTangga)"/>`)
  bagian.push(`<path d="${d}" fill="none" stroke="${WARNA.beton}" `
    + `stroke-width="${bulat(t * 1.7)}" stroke-linejoin="round"/>`)

  if (pakaiDimensi) {
    /*
      ── SATU anak tangga diberi ukuran, bukan semuanya.

      Memberi ukuran pada tiap anak tangga membuat gambar penuh angka yang
      sama berulang-ulang, dan yang berulang tak dibaca. Yang diberi ukuran
      anak KEDUA — anak pertama sering menempel lantai dan tampak berbeda.
    */
    const kUkur = Math.min(1, n - 1)
    const yU = h - (kUkur + 1) * o
    const xU = kUkur * a

    bagian.push(garis(xU - uk * 1.3, yU + o, xU - uk * 1.3, yU, WARNA_AKSEN, t * 0.8))
    bagian.push(teks(xU - uk * 1.55, yU + o / 2 + uk * 0.28,
      `${bulat(o, 0)}`, uk * 0.78, WARNA_AKSEN, 'end'))

    bagian.push(garis(xU, yU - uk * 0.9, xU + a, yU - uk * 0.9, WARNA.sengkang, t * 0.8))
    bagian.push(teks(xU + a / 2, yU - uk * 1.15,
      `${bulat(a, 0)}`, uk * 0.78, WARNA.sengkang))

    /* Tinggi total & panjang datar. */
    const off = margin * 0.35
    bagian.push(garis(panjangDatar + off, 0, panjangDatar + off, h, WARNA.dimensi, t * 0.7))
    bagian.push(
      `<g transform="translate(${bulat(panjangDatar + off + uk * 0.55)},${bulat(h / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(uk * 0.8)}" fill="${WARNA.dimensi}" text-anchor="middle">`
      + `H ${bulat(H, 2)} m</text></g>`)

    bagian.push(garis(0, h + off, panjangDatar, h + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(panjangDatar / 2, h + off + uk * 1.05,
      `${n} anak × ${bulat(a, 0)} mm`, uk * 0.8, WARNA.dimensi))

    /*
      ── BLONDEL dicetak, dan MERAH bila di luar rentang nyaman.

      Ini pemeriksaan yang paling sering dilanggar tanpa disadari, karena
      tangga yang melanggarnya tetap berdiri kokoh dan terlihat baik-baik
      saja. Yang memberitahunya hanya kaki orang yang menaikinya — biasanya
      sesudah terlambat.
    */
    const bl = input.blondelMm ?? (2 * o + a)
    const blKurang = bl < BLONDEL_MIN || bl > BLONDEL_MAKS
    const barisAtas: string[] = [`Blondel ${bulat(bl, 0)} mm`]
    if (input.kemiringanDerajat != null) {
      barisAtas.push(`kemiringan ${bulat(input.kemiringanDerajat, 1)}°`)
    }
    barisAtas.forEach((isi, k) => {
      const merah = k === 0 && blKurang
      bagian.push(teks(0, -margin * 0.12 + k * uk * 1.0,
        isi, uk * 0.8, merah ? '#dc2626' : WARNA.dimensi, 'start'))
    })
    if (blKurang) {
      bagian.push(teks(panjangDatar, -margin * 0.12,
        `di luar ${BLONDEL_MIN}–${BLONDEL_MAKS}`, uk * 0.76, '#dc2626', 'end'))
    }
  }

  if (opsi.judul) {
    bagian.push(teks(panjangDatar / 2, -margin * 0.55, opsi.judul, uk * 1.1))
  }

  const lebarPx = opsi.lebarPx ?? 560
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Potongan tangga')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Penampang KOLOM KOMPOSIT ─────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KOLOM KOMPOSIT — dua bahan yang harus terlihat sebagai DUA bahan
 *
 * Kolom komposit adalah baja dan beton yang bekerja sebagai satu benda, dan
 * justru karena itu gambarnya harus memperlihatkan keduanya TERPISAH. Yang
 * membedakan kolom komposit TERBUNGKUS (encased) dari yang TERISI (filled)
 * bukan angka melainkan susunannya:
 *
 *   terbungkus — profil baja DI DALAM beton, ada selimut & tulangan
 *   terisi     — beton DI DALAM pipa/kotak baja, tanpa selimut
 *
 * Keduanya memakai rumus yang berbeda (koefisien 0,85 vs 0,95, karena baja
 * yang membungkus MENGEKANG betonnya), dan dua kolom berdimensi sama dengan
 * jenis berbeda punya kapasitas yang berbeda nyata. Dari daftar angka,
 * perbedaan itu cuma satu kata; dari gambar, ia langsung terlihat.
 *
 * ── Yang TIDAK digambar
 *
 * Bentuk profil bajanya tidak digambar teliti — modulnya sendiri hanya
 * menerima LUAS dan INERSIA baja, bukan dimensinya. Menggambar WF yang
 * detail berarti mengarang dimensi yang tak pernah masuk perhitungan, dan
 * gambar yang mengarang lebih buruk daripada gambar yang menyederhanakan.
 * Yang digambar: kotak baja berskala luas sebenarnya, ditandai jelas.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarKolomKomposit {
  /** 'terbungkus' (encased) atau 'terisi' (filled). */
  jenis: string
  /** Lebar penampang beton, mm. */
  lebarBetonMm: number
  /** Tinggi penampang beton, mm. */
  tinggiBetonMm: number
  /** Luas penampang baja, mm². */
  asBajaMm2: number
  /** Luas tulangan longitudinal, mm². */
  asTulanganMm2?: number
  /** Selimut beton, mm — hanya berarti pada jenis terbungkus. */
  selimutMm?: number
}

export function gambarKolomKomposit(
  input: InputGambarKolomKomposit,
  opsi: OpsiGambar = {},
): string {
  const { lebarBetonMm: b, tinggiBetonMm: h, asBajaMm2: as } = input

  for (const [nama, v] of [
    ['Lebar beton', b], ['Tinggi beton', h], ['Luas baja', as],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }
  if (as >= b * h) {
    throw new Error('Luas baja tak boleh sebesar seluruh penampangnya')
  }

  const terisi = /terisi|filled/i.test(input.jenis)
  const selimut = input.selimutMm ?? 40

  const margin = opsi.marginMm ?? Math.max(b, h) * 0.42
  const pakaiDimensi = opsi.dimensi ?? true
  const ruangNotasi = pakaiDimensi ? margin * 1.25 : 0

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = b + 2 * margin + ruangNotasi
  const vbH = h + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(b, h) / 250
  const uk = Math.max(b, h) / 19

  const bagian: string[] = []
  const jarakArsir = Math.max(b, h) / 22
  bagian.push(
    `<defs><pattern id="arsirKomposit" width="${bulat(jarakArsir)}" `
    + `height="${bulat(jarakArsir)}" patternUnits="userSpaceOnUse" `
    + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" `
    + `y2="${bulat(jarakArsir)}" stroke="#cbd5e1" `
    + `stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  /*
    ── TERISI: baja di LUAR, beton di dalam.
    Tebal dinding baja diturunkan dari luasnya — keliling × tebal = luas.
  */
  if (terisi) {
    const tebal = Math.max(as / (2 * (b + h)), Math.max(b, h) / 90)
    bagian.push(`<rect x="0" y="0" width="${bulat(b)}" height="${bulat(h)}" `
      + `fill="#e2e8f0"/>`)
    bagian.push(
      `<rect x="${bulat(tebal)}" y="${bulat(tebal)}" `
      + `width="${bulat(Math.max(0, b - 2 * tebal))}" `
      + `height="${bulat(Math.max(0, h - 2 * tebal))}" fill="${WARNA.betonIsi}"/>`)
    bagian.push(
      `<rect x="${bulat(tebal)}" y="${bulat(tebal)}" `
      + `width="${bulat(Math.max(0, b - 2 * tebal))}" `
      + `height="${bulat(Math.max(0, h - 2 * tebal))}" fill="url(#arsirKomposit)"/>`)
    bagian.push(`<rect x="0" y="0" width="${bulat(b)}" height="${bulat(h)}" `
      + `fill="none" stroke="#334155" stroke-width="${bulat(t * 1.8)}"/>`)
  } else {
    /*
      ── TERBUNGKUS: beton di luar, profil baja di dalam, plus tulangan sudut.
      Kotak baja berskala luas sebenarnya (akar kuadratnya), bukan bentuk WF
      yang dikarang — modulnya tak pernah tahu dimensi profilnya.
    */
    bagian.push(`<rect x="0" y="0" width="${bulat(b)}" height="${bulat(h)}" fill="${WARNA.betonIsi}"/>`)
    bagian.push(`<rect x="0" y="0" width="${bulat(b)}" height="${bulat(h)}" fill="url(#arsirKomposit)"/>`)
    bagian.push(`<rect x="0" y="0" width="${bulat(b)}" height="${bulat(h)}" `
      + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.6)}"/>`)

    const sisi = Math.sqrt(as)
    const bw = Math.min(sisi, b - 2 * selimut)
    const bh = Math.min(sisi, h - 2 * selimut)
    bagian.push(
      `<rect x="${bulat((b - bw) / 2)}" y="${bulat((h - bh) / 2)}" `
      + `width="${bulat(bw)}" height="${bulat(bh)}" fill="#94a3b8" `
      + `stroke="#334155" stroke-width="${bulat(t * 1.3)}"/>`)

    /* Tulangan longitudinal di empat sudut, bila ada. */
    if ((input.asTulanganMm2 ?? 0) > 0) {
      const dBatang = Math.max(Math.sqrt((input.asTulanganMm2! / 4) * 4 / Math.PI), b / 28)
      for (const [x, y] of [
        [selimut, selimut], [b - selimut, selimut],
        [selimut, h - selimut], [b - selimut, h - selimut],
      ]) {
        bagian.push(`<circle cx="${bulat(x)}" cy="${bulat(y)}" `
          + `r="${bulat(dBatang / 2)}" fill="${WARNA_AKSEN}"/>`)
      }
    }
  }

  if (pakaiDimensi) {
    const off = margin * 0.4
    bagian.push(garis(0, h + off, b, h + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(b / 2, h + off + uk * 1.1, `${bulat(b, 0)} mm`, uk * 0.85, WARNA.dimensi))

    bagian.push(garis(-off, 0, -off, h, WARNA.dimensi, t * 0.7))
    bagian.push(
      `<g transform="translate(${bulat(-off - uk * 0.55)},${bulat(h / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(uk * 0.85)}" fill="${WARNA.dimensi}" text-anchor="middle">`
      + `${bulat(h, 0)} mm</text></g>`)

    /*
      JENIS dicetak sebagai kata, bukan hanya tersirat dari gambarnya.
      Terbungkus dan terisi memakai koefisien berbeda (0,85 vs 0,95), dan
      pembaca yang salah mengenali jenisnya akan salah menilai kapasitasnya.
    */
    bagian.push(teks(b + off * 0.55, uk * 1.0,
      terisi ? 'TERISI (filled)' : 'TERBUNGKUS (encased)',
      uk * 0.8, '#334155', 'start'))
    bagian.push(teks(b + off * 0.55, uk * 2.0,
      `As baja ${bulat(as, 0)} mm²`, uk * 0.76, WARNA.dimensi, 'start'))
  }

  if (opsi.judul) {
    bagian.push(teks(b / 2, -margin * 0.55, opsi.judul, uk * 1.2))
  }

  const lebarPx = opsi.lebarPx ?? 440
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Penampang kolom komposit')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Potongan BONDEK ──────────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BONDEK — gelombangnya BUKAN hiasan, ia yang memikul
 *
 * Bondek diperiksa DUA tahap, dan tahap PELAKSANAAN yang paling sering
 * menentukan: sebelum beton mengeras, lembaran baja setebal kurang dari satu
 * milimeter memikul sendiri seluruh beton basah + pekerja + alat. Sesudah
 * mengeras, keduanya bekerja sama.
 *
 * Gelombangnya yang membuat tahap pertama mungkin — lembaran rata setebal
 * 0,75 mm akan melendut jauh sebelum betonnya terisi penuh. Gambar yang
 * memperlihatkannya sebagai pelat rata menyembunyikan justru bagian yang
 * membuatnya bekerja, dan membuat orang menyangka penyangga sementara
 * (perancah) tak diperlukan.
 *
 * Karena itu yang digambar adalah POTONGAN MELINTANG gelombangnya, dengan
 * TINGGI EFEKTIF beton di atas gelombang ditandai terpisah dari tebal total —
 * dua angka yang sering tertukar, dan yang tertukar membuat volume beton
 * salah hitung.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarBondek {
  /** Tebal total pelat (dari dasar gelombang ke permukaan beton), mm. */
  tebalTotalMm: number
  /** Tinggi gelombang bondek, mm. */
  tinggiGelombangMm: number
  /** Tebal lembaran baja, mm. */
  tebalBajaMm: number
  /** Jarak antar puncak gelombang, mm. Default 200 (bondek lazim). */
  jarakGelombangMm?: number
  /** Bentang, m — dicetak sebagai catatan. */
  bentangM?: number
  /** Lendutan tahap pelaksanaan, mm. */
  lendutanPelaksanaanMm?: number
  /** Batas lendutan tahap pelaksanaan, mm. */
  batasLendutanMm?: number
}

export function gambarBondek(
  input: InputGambarBondek,
  opsi: OpsiGambar = {},
): string {
  const {
    tebalTotalMm: H, tinggiGelombangMm: hg, tebalBajaMm: tb,
  } = input
  const jarak = input.jarakGelombangMm ?? 200

  for (const [nama, v] of [
    ['Tebal total', H], ['Tinggi gelombang', hg],
    ['Tebal baja', tb], ['Jarak gelombang', jarak],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }
  if (hg >= H) {
    throw new Error('Tinggi gelombang tak boleh setebal seluruh pelatnya')
  }

  /* Tiga gelombang cukup memperlihatkan polanya tanpa membuat gambar panjang. */
  const nGel = 3
  const lebar = nGel * jarak
  const margin = opsi.marginMm ?? Math.max(lebar, H) * 0.3
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = lebar + 2 * margin
  const vbH = H + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(lebar, H) / 320
  const uk = Math.max(lebar, H) / 24

  const bagian: string[] = []
  const jarakArsir = Math.max(lebar, H) / 34
  bagian.push(
    `<defs><pattern id="arsirBondek" width="${bulat(jarakArsir)}" `
    + `height="${bulat(jarakArsir)}" patternUnits="userSpaceOnUse" `
    + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" `
    + `y2="${bulat(jarakArsir)}" stroke="#cbd5e1" `
    + `stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  /*
    Beton: dari permukaan (y = 0) sampai dasar gelombang (y = H), tetapi
    bagian bawahnya mengikuti bentuk gelombang bondeknya.
  */
  const lembah = jarak * 0.34   // lebar dasar gelombang
  const jalurBondek: string[] = []
  const titikBeton: Array<[number, number]> = [[0, 0], [lebar, 0]]

  for (let k = nGel - 1; k >= 0; k--) {
    const x0 = k * jarak
    /* Dari kanan ke kiri supaya poligon betonnya tertutup benar. */
    titikBeton.push([x0 + jarak, H - hg])
    titikBeton.push([x0 + jarak - (jarak - lembah) / 2, H])
    titikBeton.push([x0 + (jarak - lembah) / 2, H])
    titikBeton.push([x0, H - hg])
  }

  for (let k = 0; k < nGel; k++) {
    const x0 = k * jarak
    jalurBondek.push(
      `${k === 0 ? 'M' : 'L'}${bulat(x0)},${bulat(H - hg)} `
      + `L${bulat(x0 + (jarak - lembah) / 2)},${bulat(H)} `
      + `L${bulat(x0 + jarak - (jarak - lembah) / 2)},${bulat(H)} `
      + `L${bulat(x0 + jarak)},${bulat(H - hg)}`)
  }

  const dBeton = titikBeton
    .map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${bulat(x)},${bulat(y)}`)
    .join(' ') + ' Z'

  bagian.push(`<path d="${dBeton}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<path d="${dBeton}" fill="url(#arsirBondek)"/>`)
  bagian.push(`<path d="${dBeton}" fill="none" stroke="${WARNA.beton}" `
    + `stroke-width="${bulat(t * 1.4)}"/>`)

  /*
    ── LEMBARAN BONDEK, digambar sebagai GARIS TEBAL mengikuti gelombangnya.

    Tebal sesungguhnya (0,75–1 mm) tak terlihat pada skala ini; digambar
    setebal itu, ia hilang sama sekali. Ditebalkan supaya terlihat, dan
    angkanya dicetak — supaya yang membaca tak menyangka bajanya setebal
    yang tergambar.
  */
  bagian.push(
    `<path d="${jalurBondek.join(' ')}" fill="none" stroke="#334155" `
    + `stroke-width="${bulat(Math.max(tb * 2.5, t * 2.2))}" `
    + `stroke-linejoin="round" stroke-linecap="round"/>`)

  if (pakaiDimensi) {
    const off = margin * 0.35

    /*
      ── DUA TINGGI yang sering tertukar, ditandai TERPISAH.

      Tebal total (H) dipakai untuk berat sendiri; tinggi beton DI ATAS
      gelombang (H − hg) yang menentukan kapasitas lenturnya. Memakai yang
      salah membuat volume beton meleset dan kapasitas dinilai terlalu
      tinggi.
    */
    bagian.push(garis(-off, 0, -off, H, WARNA.dimensi, t * 0.8))
    bagian.push(
      `<g transform="translate(${bulat(-off - uk * 0.5)},${bulat(H / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(uk * 0.8)}" fill="${WARNA.dimensi}" text-anchor="middle">`
      + `total ${bulat(H, 0)}</text></g>`)

    bagian.push(garis(lebar + off, 0, lebar + off, H - hg, WARNA.sengkang, t * 0.8))
    bagian.push(teks(lebar + off + uk * 0.35, (H - hg) / 2 + uk * 0.28,
      `beton ${bulat(H - hg, 0)}`, uk * 0.74, WARNA.sengkang, 'start'))

    bagian.push(garis(lebar + off, H - hg, lebar + off, H, '#334155', t * 0.8))
    bagian.push(teks(lebar + off + uk * 0.35, H - hg / 2 + uk * 0.28,
      `gelombang ${bulat(hg, 0)}`, uk * 0.74, '#334155', 'start'))

    bagian.push(teks(0, H + off + uk * 1.0,
      `bondek ${bulat(tb, 2)} mm`, uk * 0.76, '#334155', 'start'))

    /*
      ── LENDUTAN TAHAP PELAKSANAAN, bila diketahui.

      Inilah tahap yang paling sering menentukan, dan yang paling sering
      dilupakan: sebelum beton mengeras, lembaran setipis ini memikul sendiri
      beton basah + pekerja. Merah bila melewati batasnya — dan yang melewati
      batas belum tentu runtuh, ia MELENDUT, lalu betonnya menggenang di
      tengah dan bertambah berat lagi.
    */
    if (input.lendutanPelaksanaanMm != null && input.batasLendutanMm != null) {
      const lewat = input.lendutanPelaksanaanMm > input.batasLendutanMm
      bagian.push(teks(lebar, H + off + uk * 1.0,
        `lendutan pelaksanaan ${bulat(input.lendutanPelaksanaanMm, 1)} / `
        + `${bulat(input.batasLendutanMm, 1)} mm`,
        uk * 0.76, lewat ? '#dc2626' : WARNA.dimensi, 'end'))
      if (lewat) {
        bagian.push(teks(lebar, H + off + uk * 2.0,
          'BUTUH PERANCAH SEMENTARA', uk * 0.78, '#dc2626', 'end'))
      }
    }
  }

  if (opsi.judul) {
    bagian.push(teks(lebar / 2, -margin * 0.55, opsi.judul, uk * 1.1))
  }

  const lebarPx = opsi.lebarPx ?? 560
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Potongan pelat bondek')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Tampak DINDING GESER ─────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DINDING GESER — yang menentukan adalah PERBANDINGAN tinggi terhadap panjang
 *
 * Dinding geser berperilaku sama sekali berbeda tergantung kelangsingannya, dan
 * itu satu-satunya hal yang tak bisa dibaca dari daftar angka tanpa membagi dua
 * bilangan di kepala:
 *
 *   hw/lw ≥ 2  — LANGSING, berperilaku seperti kolom kantilever; lentur yang
 *                menentukan, dan itu keadaan yang DIINGINKAN (ia meleleh pelan
 *                dan memberi peringatan)
 *   hw/lw ≤ 1  — GEMUK, geser yang menentukan; kegagalannya GETAS
 *
 * Gambar tampak memperlihatkan perbandingan itu langsung sebagai bentuk. Yang
 * membaca "panjang 4 m, tinggi 3,5 m" tak otomatis melihat bahwa dindingnya
 * gemuk; yang melihat gambarnya tak bisa tidak melihatnya.
 *
 * ── Retak menyilang digambar hanya bila geser MENENTUKAN
 *
 * Bukan hiasan: retak diagonal adalah bentuk kegagalan geser, dan ia hanya
 * muncul di gambar ketika pemeriksaannya memang mengarah ke sana. Gambar yang
 * selalu menampilkan retak akan diabaikan; gambar yang menampilkannya hanya
 * saat relevan menjadi peringatan.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarDindingGeser {
  /** Panjang dinding (arah gaya gempa), m. */
  panjangM: number
  /** Tinggi dinding, m. */
  tinggiM: number
  /** Tebal dinding, mm. */
  tebalMm: number
  /** Luas tulangan ujung (boundary element), mm². */
  asUjungMm2?: number
  /** Geser terfaktor, kN. */
  vuKn?: number
  /** Kapasitas geser terpakai, 0..n. */
  rasioGeser?: number
  /** Lentur meleleh lebih dulu daripada geser? */
  lenturDuluan?: boolean
}

export function gambarDindingGeser(
  input: InputGambarDindingGeser,
  opsi: OpsiGambar = {},
): string {
  const { panjangM: L, tinggiM: H, tebalMm: tw } = input

  for (const [nama, v] of [
    ['Panjang dinding', L], ['Tinggi dinding', H], ['Tebal dinding', tw],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }

  const l = L * 1000
  const h = H * 1000
  const aspek = H / L

  const margin = opsi.marginMm ?? Math.max(l, h) * 0.32
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = l + 2 * margin
  const vbH = h + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(l, h) / 300
  const uk = Math.max(l, h) / 24

  const bagian: string[] = []
  const jarakArsir = Math.max(l, h) / 26
  bagian.push(
    `<defs><pattern id="arsirGeser" width="${bulat(jarakArsir)}" `
    + `height="${bulat(jarakArsir)}" patternUnits="userSpaceOnUse" `
    + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" `
    + `y2="${bulat(jarakArsir)}" stroke="#cbd5e1" `
    + `stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)

  bagian.push(`<rect x="0" y="0" width="${bulat(l)}" height="${bulat(h)}" fill="${WARNA.betonIsi}"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(l)}" height="${bulat(h)}" fill="url(#arsirGeser)"/>`)
  bagian.push(`<rect x="0" y="0" width="${bulat(l)}" height="${bulat(h)}" `
    + `fill="none" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.7)}"/>`)

  /*
    ── ELEMEN UJUNG (boundary element) di kedua sisi.

    Di sinilah tulangan terkonsentrasi, dan di sinilah lentur ditahan. Yang
    membacanya perlu tahu bahwa menambah tulangan DI SINI menaikkan kekuatan
    LENTUR — dan pada dinding yang gesernya sudah mepet, itu justru
    MEMPERBURUK urutan kegagalannya.
  */
  if ((input.asUjungMm2 ?? 0) > 0) {
    const lebarUjung = Math.min(l * 0.15, tw * 2.5)
    for (const x of [0, l - lebarUjung]) {
      bagian.push(
        `<rect x="${bulat(x)}" y="0" width="${bulat(lebarUjung)}" height="${bulat(h)}" `
        + `fill="${WARNA_AKSEN}" opacity="0.16" stroke="${WARNA_AKSEN}" `
        + `stroke-width="${bulat(t * 0.9)}" stroke-dasharray="${bulat(t * 4)},${bulat(t * 3)}"/>`)
    }
    bagian.push(teks(l * 0.075, h * 0.5, 'ujung', uk * 0.7, WARNA_AKSEN))
  }

  /*
    ── RETAK MENYILANG, hanya bila GESER yang menentukan.

    Kegagalan geser terjadi TIBA-TIBA: retak diagonal muncul dan melebar
    dalam hitungan detik, tanpa lendutan yang memberi peringatan lebih dulu.
    Digambar hanya saat pemeriksaannya memang mengarah ke sana.
  */
  const gesarMenentukan = input.lenturDuluan === false
    || (input.rasioGeser != null && input.rasioGeser > 1)
  if (gesarMenentukan) {
    for (const [x1, y1, x2, y2] of [
      [l * 0.12, h * 0.86, l * 0.62, h * 0.16],
      [l * 0.38, h * 0.9, l * 0.88, h * 0.2],
    ]) {
      bagian.push(
        `<line x1="${bulat(x1)}" y1="${bulat(y1)}" x2="${bulat(x2)}" y2="${bulat(y2)}" `
        + `stroke="#dc2626" stroke-width="${bulat(t * 2.2)}" stroke-linecap="round" `
        + `opacity="0.75"/>`)
    }
  }

  /* Anak panah gaya gempa di puncak. */
  if (input.vuKn != null) {
    const y = -margin * 0.2
    bagian.push(garis(-margin * 0.55, y, l * 0.42, y, WARNA.sengkang, t * 1.2))
    bagian.push(
      `<path d="M${bulat(l * 0.42)},${bulat(y)} l${bulat(-uk * 0.5)},${bulat(-uk * 0.26)} `
      + `l0,${bulat(uk * 0.52)} Z" fill="${WARNA.sengkang}" transform="rotate(180 ${bulat(l * 0.42)} ${bulat(y)})"/>`)
    bagian.push(teks(l * 0.44, y + uk * 0.3,
      `V ${bulat(input.vuKn, 0)} kN`, uk * 0.78, WARNA.sengkang, 'start'))
  }

  if (pakaiDimensi) {
    const off = margin * 0.34
    bagian.push(garis(0, h + off, l, h + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(l / 2, h + off + uk * 1.05,
      `lw ${bulat(L, 2)} m · tebal ${bulat(tw, 0)} mm`, uk * 0.78, WARNA.dimensi))

    bagian.push(garis(-off, 0, -off, h, WARNA.dimensi, t * 0.7))
    bagian.push(
      `<g transform="translate(${bulat(-off - uk * 0.5)},${bulat(h / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(uk * 0.8)}" fill="${WARNA.dimensi}" text-anchor="middle">`
      + `hw ${bulat(H, 2)} m</text></g>`)

    /*
      ── PERBANDINGAN hw/lw dicetak beserta ARTINYA, bukan angkanya saja.

      "1,4" tak berarti apa-apa bagi yang membaca; "gemuk — geser cenderung
      menentukan" bisa ditindak.
    */
    const sifat = aspek >= 2
      ? 'langsing — lentur cenderung menentukan'
      : aspek <= 1
        ? 'gemuk — GESER cenderung menentukan'
        : 'antara — keduanya bisa menentukan'
    bagian.push(teks(0, -margin * 0.12,
      `hw/lw ${bulat(aspek, 2)}`, uk * 0.85, WARNA.dimensi, 'start'))
    bagian.push(teks(l, -margin * 0.12,
      sifat, uk * 0.76, aspek <= 1 ? '#dc2626' : WARNA.dimensi, 'end'))
  }

  if (opsi.judul) {
    bagian.push(teks(l / 2, -margin * 0.52, opsi.judul, uk * 1.1))
  }

  const lebarPx = opsi.lebarPx ?? 520
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Tampak dinding geser')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Denah RAFT (pondasi rakit) ───────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RAFT — yang berbahaya adalah TEPI, bukan rata-rata
 *
 * Pondasi rakit hampir selalu dinilai dari tekanan RATA-RATA (beban ÷ luas),
 * dan angka itu hampir selalu aman. Yang membuatnya gagal adalah tekanan di
 * TEPI: begitu resultan beban bergeser dari pusat, tekanan di satu sisi naik
 * jauh di atas rata-rata sementara sisi seberangnya turun — bahkan bisa
 * TERANGKAT.
 *
 * Gambar denah memperlihatkan eksentrisitas itu sebagai jarak yang bisa
 * dilihat, dan menandai sudut mana yang paling tertekan. Dari daftar angka,
 * "eksentrisitas 0,4 m" terdengar kecil; dari denah selebar 8 m dengan titik
 * resultan yang jelas bergeser, ia tak lagi terdengar kecil.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarRaft {
  /** Panjang raft, m. */
  panjangM: number
  /** Lebar raft, m. */
  lebarM: number
  /** Tebal raft, mm. */
  tebalMm: number
  /** Eksentrisitas resultan arah X, m. */
  eksentrisitasXM?: number
  /** Eksentrisitas resultan arah Y, m. */
  eksentrisitasYM?: number
  /** Tekanan tepi maksimum, kPa. */
  qMaksKnM2?: number
  /** Tekanan tepi minimum. Nol/negatif = TERANGKAT. */
  qMinKnM2?: number
  /** Daya dukung ijin, kPa. */
  qaKnM2?: number
}

export function gambarRaft(
  input: InputGambarRaft,
  opsi: OpsiGambar = {},
): string {
  const { panjangM: L, lebarM: B, tebalMm: tebal } = input

  for (const [nama, v] of [
    ['Panjang raft', L], ['Lebar raft', B], ['Tebal raft', tebal],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }

  const l = L * 1000
  const b = B * 1000
  const ex = (input.eksentrisitasXM ?? 0) * 1000
  const ey = (input.eksentrisitasYM ?? 0) * 1000

  if (Math.abs(ex) > l / 2 || Math.abs(ey) > b / 2) {
    throw new Error('Eksentrisitas di luar raftnya — resultan tak mungkin di sana')
  }

  const margin = opsi.marginMm ?? Math.max(l, b) * 0.3
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = l + 2 * margin
  const vbH = b + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(l, b) / 320
  const uk = Math.max(l, b) / 26

  const bagian: string[] = []

  bagian.push(`<rect x="0" y="0" width="${bulat(l)}" height="${bulat(b)}" `
    + `fill="${WARNA.betonIsi}" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.7)}"/>`)

  /*
    ── INTI SEPERTIGA TENGAH (kern).

    Selama resultan berada di dalamnya, SELURUH dasar raft menekan tanah.
    Begitu keluar, sebagian raft terangkat — dan bagian yang terangkat itu
    tak menyumbang daya dukung sama sekali, sehingga sisanya harus memikul
    semuanya.
  */
  const kernX = l / 6
  const kernY = b / 6
  bagian.push(
    `<rect x="${bulat(l / 2 - kernX)}" y="${bulat(b / 2 - kernY)}" `
    + `width="${bulat(2 * kernX)}" height="${bulat(2 * kernY)}" fill="none" `
    + `stroke="${WARNA.sengkang}" stroke-width="${bulat(t * 1.1)}" `
    + `stroke-dasharray="${bulat(t * 5)},${bulat(t * 4)}"/>`)
  bagian.push(teks(l / 2, b / 2 - kernY - uk * 0.35,
    'inti sepertiga tengah', uk * 0.68, WARNA.sengkang))

  /* Titik resultan. */
  const xr = l / 2 + ex
  const yr = b / 2 + ey
  const diLuarInti = Math.abs(ex) > kernX || Math.abs(ey) > kernY

  bagian.push(garis(l / 2, b / 2, xr, yr, WARNA.dimensi, t * 0.9, true))
  bagian.push(
    `<circle cx="${bulat(xr)}" cy="${bulat(yr)}" r="${bulat(uk * 0.34)}" `
    + `fill="${diLuarInti ? '#dc2626' : WARNA_AKSEN}"/>`)
  bagian.push(teks(xr, yr - uk * 0.6, 'R', uk * 0.72,
    diLuarInti ? '#dc2626' : WARNA_AKSEN))

  /*
    ── SUDUT PALING TERTEKAN ditandai.

    Tekanan maksimum selalu di sudut yang searah dengan pergeseran resultan.
    Menandainya membuat pembaca tahu di mana harus memeriksa tanah dan di
    mana penurunan akan paling besar.
  */
  if (input.qMaksKnM2 != null) {
    const sx = ex >= 0 ? l : 0
    const sy = ey >= 0 ? b : 0
    const lewat = input.qaKnM2 != null && input.qMaksKnM2 > input.qaKnM2
    bagian.push(
      `<circle cx="${bulat(sx)}" cy="${bulat(sy)}" r="${bulat(uk * 0.85)}" `
      + `fill="${lewat ? '#dc2626' : WARNA_TEKANAN}" opacity="0.3"/>`)
    bagian.push(teks(
      sx === 0 ? uk * 0.4 : l - uk * 0.4,
      sy === 0 ? uk * 1.5 : b - uk * 0.7,
      `q ${bulat(input.qMaksKnM2, 0)} kPa`,
      uk * 0.72, lewat ? '#dc2626' : WARNA_TEKANAN,
      sx === 0 ? 'start' : 'end'))
  }

  if (input.qMinKnM2 != null && input.qMinKnM2 <= 0) {
    const sx = ex >= 0 ? 0 : l
    const sy = ey >= 0 ? 0 : b
    bagian.push(teks(
      sx === 0 ? uk * 0.4 : l - uk * 0.4,
      sy === 0 ? uk * 0.9 : b - uk * 1.5,
      'TERANGKAT', uk * 0.75, '#dc2626', sx === 0 ? 'start' : 'end'))
  }

  if (pakaiDimensi) {
    const off = margin * 0.34
    bagian.push(garis(0, b + off, l, b + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(l / 2, b + off + uk * 1.05,
      `${bulat(L, 2)} m × ${bulat(B, 2)} m · tebal ${bulat(tebal, 0)} mm`,
      uk * 0.78, WARNA.dimensi))

    if (input.eksentrisitasXM != null || input.eksentrisitasYM != null) {
      bagian.push(teks(0, -margin * 0.12,
        `e ${bulat(input.eksentrisitasXM ?? 0, 3)} / ${bulat(input.eksentrisitasYM ?? 0, 3)} m`,
        uk * 0.78, diLuarInti ? '#dc2626' : WARNA.dimensi, 'start'))
      if (diLuarInti) {
        bagian.push(teks(l, -margin * 0.12,
          'resultan DI LUAR inti', uk * 0.76, '#dc2626', 'end'))
      }
    }
  }

  if (opsi.judul) {
    bagian.push(teks(l / 2, -margin * 0.52, opsi.judul, uk * 1.1))
  }

  const lebarPx = opsi.lebarPx ?? 520
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Denah pondasi rakit')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Potongan PONDASI MENERUS ─────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PONDASI MENERUS — ukuran warisan yang tak pernah diperiksa
 *
 * Pondasi batu kali 60/30/60 diwariskan turun-temurun di Indonesia dan dipakai
 * hampir di semua rumah tinggal, biasanya tanpa satu pun perhitungan. Sering
 * memang cukup — dan justru karena sering cukup, yang TIDAK cukup lolos tanpa
 * dicurigai siapa pun.
 *
 * Yang digambar potongan melintangnya lengkap dengan lapisan di bawahnya
 * (pasir urug, aanstamping), karena dua hal:
 *
 *   1. lebar DASAR yang menentukan tekanan ke tanah, bukan lebar atasnya —
 *      dan pada trapesium keduanya berbeda jauh;
 *   2. aanstamping & pasir urug sering dilupakan di RAB padahal selalu
 *      dikerjakan, sehingga volumenya muncul sebagai "biaya tak terduga".
 *
 * Batu kali TIDAK berbekisting (§ volume), dan penyebarannya 60° — itu
 * sebabnya lebar dasarnya tak boleh ditentukan sembarangan.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarPondasiMenerus {
  /** Lebar dasar pondasi, m. */
  lebarBawahM: number
  /** Lebar puncak pondasi, m. */
  lebarAtasM: number
  /** Tinggi badan pondasi, m. */
  tinggiM: number
  /** Kedalaman dasar dari muka tanah, m. */
  kedalamanM?: number
  /** Tebal pasir urug, m. */
  tebalPasirM?: number
  /** Tinggi aanstamping (batu kosong), m. */
  tinggiAanstampingM?: number
  /** Tekanan ke tanah, kPa. */
  qKnM2?: number
  /** Daya dukung ijin, kPa. */
  qaKnM2?: number
  /** 'batu_kali' atau 'beton'. */
  jenis?: string
}

export function gambarPondasiMenerus(
  input: InputGambarPondasiMenerus,
  opsi: OpsiGambar = {},
): string {
  const { lebarBawahM: Bb, lebarAtasM: Ba, tinggiM: Ht } = input

  for (const [nama, v] of [
    ['Lebar bawah', Bb], ['Lebar atas', Ba], ['Tinggi pondasi', Ht],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }
  if (Ba > Bb) {
    throw new Error('Lebar atas tak boleh melebihi lebar bawah — pondasi terbalik')
  }

  const bb = Bb * 1000, ba = Ba * 1000, ht = Ht * 1000
  const tPasir = (input.tebalPasirM ?? 0) * 1000
  const tAan = (input.tinggiAanstampingM ?? 0) * 1000
  const totalH = ht + tAan + tPasir

  const margin = opsi.marginMm ?? Math.max(bb, totalH) * 0.42
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = bb + 2 * margin
  const vbH = totalH + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(bb, totalH) / 280
  const uk = Math.max(bb, totalH) / 20

  const bagian: string[] = []
  const batuKali = !/beton/i.test(input.jenis ?? 'batu_kali')

  /* Pasir urug paling bawah. */
  let y = totalH
  if (tPasir > 0) {
    y -= tPasir
    bagian.push(`<rect x="0" y="${bulat(y)}" width="${bulat(bb)}" height="${bulat(tPasir)}" `
      + `fill="#fde68a" stroke="${WARNA.dimensi}" stroke-width="${bulat(t * 0.8)}"/>`)
    bagian.push(teks(bb / 2, y + tPasir / 2 + uk * 0.25,
      `pasir ${bulat(tPasir, 0)}`, uk * 0.6, '#92400e'))
  }
  if (tAan > 0) {
    y -= tAan
    bagian.push(`<rect x="0" y="${bulat(y)}" width="${bulat(bb)}" height="${bulat(tAan)}" `
      + `fill="#d6d3d1" stroke="${WARNA.dimensi}" stroke-width="${bulat(t * 0.8)}"/>`)
    bagian.push(teks(bb / 2, y + tAan / 2 + uk * 0.25,
      `aanstamping ${bulat(tAan, 0)}`, uk * 0.6, '#57534e'))
  }

  /* Badan pondasi: trapesium. */
  const xAtas = (bb - ba) / 2
  const dBadan = `M0,${bulat(y)} L${bulat(bb)},${bulat(y)} `
    + `L${bulat(bb - xAtas)},${bulat(y - ht)} L${bulat(xAtas)},${bulat(y - ht)} Z`

  const jarakArsir = Math.max(bb, totalH) / 22
  if (batuKali) {
    /*
      Batu kali digambar dengan pola BATU, bukan arsir beton — keduanya
      berperilaku dan berharga sangat berbeda, dan gambar yang menyamakannya
      membuat estimator memakai AHSP yang salah.
    */
    bagian.push(
      `<defs><pattern id="polaBatu" width="${bulat(jarakArsir * 1.4)}" `
      + `height="${bulat(jarakArsir)}" patternUnits="userSpaceOnUse">`
      + `<circle cx="${bulat(jarakArsir * 0.45)}" cy="${bulat(jarakArsir * 0.5)}" `
      + `r="${bulat(jarakArsir * 0.3)}" fill="none" stroke="#a8a29e" `
      + `stroke-width="${bulat(t * 0.7)}"/></pattern></defs>`)
    bagian.push(`<path d="${dBadan}" fill="#e7e5e4"/>`)
    bagian.push(`<path d="${dBadan}" fill="url(#polaBatu)"/>`)
  } else {
    bagian.push(
      `<defs><pattern id="arsirPondasi" width="${bulat(jarakArsir)}" `
      + `height="${bulat(jarakArsir)}" patternUnits="userSpaceOnUse" `
      + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" `
      + `y2="${bulat(jarakArsir)}" stroke="#cbd5e1" `
      + `stroke-width="${bulat(t * 0.5)}"/></pattern></defs>`)
    bagian.push(`<path d="${dBadan}" fill="${WARNA.betonIsi}"/>`)
    bagian.push(`<path d="${dBadan}" fill="url(#arsirPondasi)"/>`)
  }
  bagian.push(`<path d="${dBadan}" fill="none" stroke="${WARNA.beton}" `
    + `stroke-width="${bulat(t * 1.7)}"/>`)

  if (pakaiDimensi) {
    const off = margin * 0.38

    bagian.push(garis(0, totalH + off, bb, totalH + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(bb / 2, totalH + off + uk * 1.05,
      `dasar ${bulat(Bb, 2)} m`, uk * 0.8, WARNA.dimensi))

    bagian.push(garis(xAtas, -off * 0.55, bb - xAtas, -off * 0.55, WARNA.dimensi, t * 0.7))
    bagian.push(teks(bb / 2, -off * 0.55 - uk * 0.3,
      `atas ${bulat(Ba, 2)} m`, uk * 0.74, WARNA.dimensi))

    bagian.push(garis(-off, y - ht, -off, y, WARNA.dimensi, t * 0.7))
    bagian.push(
      `<g transform="translate(${bulat(-off - uk * 0.5)},${bulat(y - ht / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(uk * 0.78)}" fill="${WARNA.dimensi}" text-anchor="middle">`
      + `${bulat(Ht, 2)} m</text></g>`)

    /*
      ── TEKANAN KE TANAH, dan lebar DASAR yang menentukannya.

      Pada trapesium, lebar atas dan lebar dasar berbeda jauh, dan yang
      menentukan tekanan ke tanah hanya yang dasar. Salah memakai lebar atas
      memberi tekanan yang tampak dua kali lebih besar daripada sesungguhnya —
      atau sebaliknya, menyembunyikan pondasi yang memang kurang lebar.
    */
    if (input.qKnM2 != null) {
      const lewat = input.qaKnM2 != null && input.qKnM2 > input.qaKnM2
      bagian.push(teks(0, -margin * 0.12,
        `q ${bulat(input.qKnM2, 0)} kPa`
        + (input.qaKnM2 != null ? ` / ijin ${bulat(input.qaKnM2, 0)}` : ''),
        uk * 0.78, lewat ? '#dc2626' : WARNA_TEKANAN, 'start'))
    }
    if (batuKali) {
      bagian.push(teks(bb, -margin * 0.12,
        'batu kali — TANPA bekisting', uk * 0.72, WARNA.dimensi, 'end'))
    }
  }

  if (opsi.judul) {
    bagian.push(teks(bb / 2, -margin * 0.55, opsi.judul, uk * 1.1))
  }

  const lebarPx = opsi.lebarPx ?? 460
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Potongan pondasi menerus')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Pola SAMBUNGAN berbaut / bersekrup / berpaku ─────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * POLA SAMBUNGAN — satu gambar untuk baut, gusset, sekrup, dan paku
 *
 * Sambungan adalah titik gagal paling sering pada struktur baja, dan pada
 * rangka atap kayu ia hampir selalu lebih lemah daripada batangnya. Tetapi
 * yang membuatnya gagal jarang berupa kekurangan jumlah alat sambung — hampir
 * selalu berupa PENEMPATANNYA:
 *
 *   terlalu dekat UJUNG   → bahan membelah/sobek ke arah ujung, GETAS
 *   terlalu dekat TEPI    → tepi pecah, alat sambung kehilangan pegangan
 *   terlalu RAPAT         → semuanya menekan serat/bahan yang sama, dan
 *                            menambah alat sambung justru MEMPERLEMAH
 *
 * Ketiganya adalah JARAK, dan jarak hanya bisa diperiksa dengan mata. Daftar
 * angka "jarak ke ujung 20 mm, minimum 61 mm" benar tetapi tak menunjukkan
 * seperti apa yang benar; gambar menunjukkannya.
 *
 * ── Kenapa satu gambar untuk empat jenis
 *
 * Baut baja, gusset, sekrup baja ringan, dan paku kayu berbeda rumusnya tetapi
 * SAMA bentuk gambarnya: pelat/batang dengan sederet alat sambung dan tiga
 * jarak yang diperiksa. Menulis empat gambar berarti empat tempat yang bisa
 * menyimpang dari satu bentuk yang sama.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarPolaSambungan {
  /** Jumlah alat sambung. */
  jumlah: number
  /** Diameter alat sambung, mm. */
  diameterMm: number
  /** Jarak dari alat sambung terluar ke UJUNG bahan (arah gaya), mm. */
  jarakUjungMm?: number
  /** Jarak dari alat sambung ke TEPI bahan (tegak lurus gaya), mm. */
  jarakTepiMm?: number
  /** Jarak antar alat sambung, mm. */
  jarakAntarMm?: number
  /** Minimum yang disyaratkan untuk jarak ujung, mm. */
  minUjungMm?: number
  /** Minimum untuk jarak tepi, mm. */
  minTepiMm?: number
  /** Minimum untuk jarak antar, mm. */
  minAntarMm?: number
  /** Jenis alat: 'baut' | 'sekrup' | 'paku' | 'las'. */
  alat?: string
  /** Gaya yang dipindahkan sambungan, kN. */
  gayaKn?: number
}

export function gambarPolaSambungan(
  input: InputGambarPolaSambungan,
  opsi: OpsiGambar = {},
): string {
  const { jumlah: n, diameterMm: d } = input

  if (!Number.isFinite(n) || n < 1) throw new Error('Jumlah alat sambung harus >= 1')
  if (n > 40) throw new Error('Jumlah alat sambung di luar batas wajar (> 40)')
  if (!(d > 0)) throw new Error('Diameter alat sambung harus > 0')

  /*
    Susunan: satu baris bila <= 5, dua baris bila lebih. Ini bukan usulan
    perencanaan melainkan cara MENGGAMBAR — susunan sungguhannya ditentukan
    perencana, dan modul analisanya tak menerima tata letak.
  */
  const nBaris = n <= 5 ? 1 : 2
  const perBaris = Math.ceil(n / nBaris)

  const jUjung = input.jarakUjungMm ?? d * 3
  const jTepi = input.jarakTepiMm ?? d * 2
  const jAntar = input.jarakAntarMm ?? d * 3

  const lebar = 2 * jUjung + (perBaris - 1) * jAntar
  const tinggi = 2 * jTepi + (nBaris - 1) * jAntar

  const margin = opsi.marginMm ?? Math.max(lebar, tinggi) * 0.42
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = lebar + 2 * margin
  const vbH = tinggi + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(lebar, tinggi) / 250
  const uk = Math.max(lebar, tinggi) / 17

  const bagian: string[] = []

  /* Pelat / batang yang disambung. */
  bagian.push(`<rect x="0" y="0" width="${bulat(lebar)}" height="${bulat(tinggi)}" `
    + `fill="#e2e8f0" stroke="#334155" stroke-width="${bulat(t * 1.6)}"/>`)

  /* Alat sambung. */
  const pusat: Array<[number, number]> = []
  let sisa = n
  for (let r = 0; r < nBaris; r++) {
    const diBaris = Math.min(perBaris, sisa)
    sisa -= diBaris
    for (let k = 0; k < diBaris; k++) {
      pusat.push([jUjung + k * jAntar, jTepi + r * jAntar])
    }
  }
  for (const [x, y] of pusat) {
    bagian.push(`<circle cx="${bulat(x)}" cy="${bulat(y)}" r="${bulat(d / 2)}" `
      + `fill="#fff" stroke="#334155" stroke-width="${bulat(t * 1.1)}"/>`)
    bagian.push(`<circle cx="${bulat(x)}" cy="${bulat(y)}" r="${bulat(d * 0.16)}" `
      + `fill="#334155"/>`)
  }

  /* Anak panah gaya. */
  if (input.gayaKn != null) {
    const y = tinggi / 2
    bagian.push(garis(lebar, y, lebar + margin * 0.5, y, WARNA_AKSEN, t * 1.2))
    bagian.push(
      `<path d="M${bulat(lebar + margin * 0.5)},${bulat(y)} `
      + `l${bulat(-uk * 0.42)},${bulat(-uk * 0.22)} l0,${bulat(uk * 0.44)} Z" `
      + `fill="${WARNA_AKSEN}" transform="rotate(180 ${bulat(lebar + margin * 0.5)} ${bulat(y)})"/>`)
    bagian.push(teks(lebar + margin * 0.55, y - uk * 0.35,
      `${bulat(input.gayaKn, 1)} kN`, uk * 0.72, WARNA_AKSEN, 'start'))
  }

  if (pakaiDimensi) {
    /*
      ── TIGA JARAK, masing-masing MERAH bila di bawah minimumnya.

      Inilah alasan gambar ini ada. Jarak ke ujung yang dilanggar adalah
      pelanggaran yang paling sering terjadi di lapangan — tukang memasang
      alat sambung terlalu dekat ujung supaya kelihatan rapi — dan akibatnya
      kegagalan GETAS tanpa peringatan.
    */
    const off = margin * 0.34
    const gambarJarak = (
      x1: number, y1: number, x2: number, y2: number,
      nilai: number, minimum: number | undefined, label: string,
      tegak: boolean,
    ) => {
      const kurang = minimum != null && nilai < minimum
      const w = kurang ? '#dc2626' : WARNA.dimensi
      bagian.push(garis(x1, y1, x2, y2, w, t * 0.8))
      const isi = `${label} ${bulat(nilai, 0)}`
        + (kurang ? ` < ${bulat(minimum!, 0)}` : '')
      if (tegak) {
        bagian.push(
          `<g transform="translate(${bulat(x1 - uk * 0.32)},${bulat((y1 + y2) / 2)}) rotate(-90)">`
          + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
          + `font-size="${bulat(uk * 0.66)}" fill="${w}" text-anchor="middle">`
          + `${amankanTeks(isi)}</text></g>`)
      } else {
        bagian.push(teks((x1 + x2) / 2, y1 - uk * 0.28, isi, uk * 0.66, w))
      }
    }

    gambarJarak(0, -off * 0.5, jUjung, -off * 0.5,
      jUjung, input.minUjungMm, 'ujung', false)
    gambarJarak(-off * 0.5, 0, -off * 0.5, jTepi,
      jTepi, input.minTepiMm, 'tepi', true)
    if (perBaris > 1) {
      gambarJarak(jUjung, tinggi + off * 0.5, jUjung + jAntar, tinggi + off * 0.5,
        jAntar, input.minAntarMm, 'antar', false)
    }

    bagian.push(teks(lebar / 2, tinggi + off * 0.5 + uk * 0.95,
      `${n} ${input.alat ?? 'baut'} Ø${bulat(d, 1)} mm`, uk * 0.74, WARNA.dimensi))
  }

  if (opsi.judul) {
    bagian.push(teks(lebar / 2, -margin * 0.58, opsi.judul, uk * 0.95))
  }

  const lebarPx = opsi.lebarPx ?? 480
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Pola sambungan')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Pelat buhul (GUSSET) dengan lebar efektif Whitmore ───────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * GUSSET — hanya SEPOTONG pelatnya yang bekerja, dan itu tak terlihat
 *
 * Kesalahpahaman yang paling mahal pada pelat buhul: menyangka SELURUH lebar
 * pelat memikul gaya batangnya. Yang sesungguhnya bekerja hanya sepotong yang
 * menyebar 30° dari baris alat sambung pertama — lebar efektif Whitmore.
 *
 * Pelat selebar 400 mm bisa jadi hanya 180 mm-nya yang bekerja, dan
 * memperlebar pelat TIDAK menolong kalau penyebarannya sudah terhalang tepi.
 * Dari daftar angka, "lebar efektif 180 mm" pada "pelat 400 mm" terbaca seperti
 * kesalahan input. Dari gambar, ia terbaca sebagai bentuk.
 *
 * ── Yang paling sering dilewatkan sama sekali
 *
 * TEKUK pelat buhul keluar bidang. Perancang memeriksa bautnya, memeriksa
 * lasnya, dan pelatnya sendiri melengkung — persis seperti kolom pendek yang
 * terlalu langsing. Panjang bebas yang menentukannya digambar sebagai jarak
 * yang bisa dilihat, bukan angka di daftar.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarGusset {
  /** Tebal pelat buhul, mm. */
  tebalMm: number
  /** Lebar daerah sambungan (baris alat sambung), mm. */
  lebarSambunganMm: number
  /** Panjang daerah sambungan sepanjang batang, mm. */
  panjangSambunganMm: number
  /** Panjang bebas dari baris terakhir ke tumpuan, mm — penentu TEKUK. */
  panjangBebasMm: number
  /** Lebar efektif Whitmore hasil hitungan, mm. */
  lebarWhitmoreMm?: number
  /** Gaya batang, kN. Negatif = tekan (tekuk relevan). */
  gayaKn?: number
  /** Rasio terpakai tekuk, 0..n. */
  rasioTekuk?: number
}

/** Sudut sebar Whitmore — 30° tiap sisi dari sumbu batang. */
const SUDUT_WHITMORE_GAMBAR = 30

export function gambarGusset(
  input: InputGambarGusset,
  opsi: OpsiGambar = {},
): string {
  const {
    tebalMm: tp, lebarSambunganMm: lw, panjangSambunganMm: lp,
    panjangBebasMm: lb,
  } = input

  for (const [nama, v] of [
    ['Tebal pelat', tp], ['Lebar sambungan', lw], ['Panjang sambungan', lp],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }
  if (!(lb >= 0)) throw new Error('Panjang bebas tak boleh negatif')

  /*
    Lebar Whitmore diambil dari HASIL bila ada. Menghitungnya ulang di sini
    berarti gambar dan verdict bisa berselisih diam-diam saat rumusnya
    diperbaiki — aturan yang sama dengan pilecap, dinding, dan tangga.
  */
  const tan30 = Math.tan((SUDUT_WHITMORE_GAMBAR * Math.PI) / 180)
  const lwEfektif = input.lebarWhitmoreMm ?? (lw + 2 * lp * tan30)

  /* Pelat digambar cukup besar untuk memuat penyebarannya. */
  const lebar = Math.max(lwEfektif * 1.25, lw * 1.6)
  const tinggi = lp + lb + Math.max(lw * 0.5, lp * 0.5)

  const margin = opsi.marginMm ?? Math.max(lebar, tinggi) * 0.34
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = lebar + 2 * margin
  const vbH = tinggi + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(lebar, tinggi) / 280
  const uk = Math.max(lebar, tinggi) / 20

  const bagian: string[] = []
  const xTengah = lebar / 2

  /* Pelat buhul. */
  bagian.push(`<rect x="0" y="0" width="${bulat(lebar)}" height="${bulat(tinggi)}" `
    + `fill="#e2e8f0" stroke="#334155" stroke-width="${bulat(t * 1.6)}"/>`)

  /*
    ── DAERAH WHITMORE: trapesium yang menyebar 30° dari baris pertama.
    Inilah bagian yang SUNGGUHAN bekerja.
  */
  const yAwal = uk * 0.6
  const yAkhir = yAwal + lp
  const dWhit = `M${bulat(xTengah - lw / 2)},${bulat(yAwal)} `
    + `L${bulat(xTengah + lw / 2)},${bulat(yAwal)} `
    + `L${bulat(xTengah + lwEfektif / 2)},${bulat(yAkhir)} `
    + `L${bulat(xTengah - lwEfektif / 2)},${bulat(yAkhir)} Z`
  bagian.push(`<path d="${dWhit}" fill="${WARNA.sengkang}" opacity="0.2" `
    + `stroke="${WARNA.sengkang}" stroke-width="${bulat(t * 1.1)}" `
    + `stroke-dasharray="${bulat(t * 5)},${bulat(t * 4)}"/>`)

  /*
    Bagian pelat DI LUAR daerah Whitmore ditandai redup — memperlebar pelat
    di sini tak menambah kapasitas sama sekali, dan itu perbaikan yang paling
    sering dicoba orang lebih dulu.
  */
  bagian.push(teks(xTengah, yAkhir + uk * 0.85,
    `Whitmore ${bulat(lwEfektif, 0)} mm`, uk * 0.72, WARNA.sengkang))

  /* Baris alat sambung, dua baris sederhana sebagai penanda. */
  const dBaut = Math.max(lw / 8, uk * 0.3)
  for (const [yb, n] of [[yAwal, 3], [yAkhir, 3]] as Array<[number, number]>) {
    for (let k = 0; k < n; k++) {
      const x = xTengah - lw / 2 + (k * lw) / (n - 1)
      bagian.push(`<circle cx="${bulat(x)}" cy="${bulat(yb)}" r="${bulat(dBaut / 2)}" `
        + `fill="#fff" stroke="#334155" stroke-width="${bulat(t)}"/>`)
    }
  }

  /*
    ── PANJANG BEBAS — penentu TEKUK keluar bidang.
    Digambar sebagai jarak, karena itulah satu-satunya cara ia terlihat.
  */
  if (pakaiDimensi && lb > 0) {
    const tekuk = (input.rasioTekuk ?? 0) > 1
    const w = tekuk ? '#dc2626' : WARNA_AKSEN
    bagian.push(garis(xTengah, yAkhir, xTengah, yAkhir + lb, w, t * 1.1))
    bagian.push(garis(xTengah - uk * 0.3, yAkhir, xTengah + uk * 0.3, yAkhir, w, t * 0.8))
    bagian.push(garis(xTengah - uk * 0.3, yAkhir + lb, xTengah + uk * 0.3, yAkhir + lb, w, t * 0.8))
    bagian.push(teks(xTengah + uk * 0.45, yAkhir + lb / 2,
      `bebas ${bulat(lb, 0)}`, uk * 0.68, w, 'start'))
    if (tekuk) {
      bagian.push(teks(xTengah, yAkhir + lb + uk * 0.9,
        'TEKUK MENENTUKAN', uk * 0.72, '#dc2626'))
    }
  }

  if (pakaiDimensi) {
    const off = margin * 0.34
    bagian.push(garis(0, tinggi + off, lebar, tinggi + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(lebar / 2, tinggi + off + uk * 0.95,
      `pelat tebal ${bulat(tp, 1)} mm`, uk * 0.74, WARNA.dimensi))

    if (input.gayaKn != null) {
      const tekan = input.gayaKn < 0
      bagian.push(teks(0, -margin * 0.12,
        `${tekan ? 'TEKAN' : 'tarik'} ${bulat(Math.abs(input.gayaKn), 1)} kN`,
        uk * 0.76, tekan ? WARNA_TEKAN : WARNA.dimensi, 'start'))
    }
  }

  if (opsi.judul) {
    bagian.push(teks(lebar / 2, -margin * 0.55, opsi.judul, uk * 1.0))
  }

  const lebarPx = opsi.lebarPx ?? 460
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Pelat buhul')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── SAMBUNGAN LAS ────────────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * LAS SUDUT — yang menahan adalah TENGGOROKAN, bukan kakinya
 *
 * Ukuran las yang ditulis di gambar ("las 6 mm") adalah panjang KAKI-nya, dan
 * hampir semua orang menyangka itulah tebal yang menahan. Yang sesungguhnya
 * menahan adalah TENGGOROKAN (throat) — bidang tersempit di tengah las,
 * sebesar 0,707 × kaki.
 *
 * Selisihnya bukan sedikit: las 6 mm hanya setebal 4,24 mm di bidang yang
 * menentukan, yaitu 29% lebih kecil. Menghitungnya dengan ukuran kaki memberi
 * kapasitas yang terlalu besar, dan sambungan las yang gagal jarang memberi
 * peringatan lebih dulu.
 *
 * Gambar ini memperlihatkan keduanya sekaligus: segitiga las dengan kakinya,
 * dan garis tenggorokan yang memotongnya. Itu satu-satunya cara membuat
 * perbedaan 0,707 itu terasa nyata bagi yang belum pernah menghitungnya.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarLas {
  /** Ukuran kaki las, mm. */
  ukuranMm: number
  /** Panjang total las, mm. */
  panjangMm: number
  /** Tebal pelat yang disambung, mm. */
  tebalPelatMm: number
  /** Gaya geser terfaktor, kN. */
  vuKn?: number
  /** Rasio terpakai, 0..n. */
  rasio?: number
}

/** Faktor tenggorokan las sudut: sin 45°. */
const FAKTOR_TENGGOROKAN = 0.707

export function gambarLas(
  input: InputGambarLas,
  opsi: OpsiGambar = {},
): string {
  const { ukuranMm: a, panjangMm: L, tebalPelatMm: tp } = input

  for (const [nama, v] of [
    ['Ukuran las', a], ['Panjang las', L], ['Tebal pelat', tp],
  ] as const) {
    if (!(v > 0)) throw new Error(`${nama} harus > 0`)
  }

  /*
    Penampang las digambar BESAR (bukan berskala terhadap panjangnya), karena
    yang perlu dilihat adalah hubungan kaki–tenggorokan. Las 6 mm pada pelat
    sepanjang 200 mm, digambar berskala, akan jadi titik.
  */
  const skala = Math.max(a, tp)
  const lebar = skala * 4.2
  const tinggi = skala * 3.4

  const margin = opsi.marginMm ?? Math.max(lebar, tinggi) * 0.36
  const pakaiDimensi = opsi.dimensi ?? true

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = lebar + 2 * margin
  const vbH = tinggi + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(lebar, tinggi) / 240
  const uk = Math.max(lebar, tinggi) / 16

  const bagian: string[] = []

  /* Dua pelat bertemu siku. */
  const xSudut = lebar * 0.42
  const ySudut = tinggi * 0.62
  bagian.push(`<rect x="0" y="${bulat(ySudut)}" width="${bulat(lebar)}" `
    + `height="${bulat(tp)}" fill="#cbd5e1" stroke="#334155" `
    + `stroke-width="${bulat(t * 1.3)}"/>`)
  bagian.push(`<rect x="${bulat(xSudut)}" y="${bulat(ySudut - tinggi * 0.55)}" `
    + `width="${bulat(tp)}" height="${bulat(tinggi * 0.55)}" fill="#cbd5e1" `
    + `stroke="#334155" stroke-width="${bulat(t * 1.3)}"/>`)

  /* Las sudut: segitiga siku-siku berkaki `a`. */
  const dLas = `M${bulat(xSudut)},${bulat(ySudut)} `
    + `L${bulat(xSudut - a)},${bulat(ySudut)} `
    + `L${bulat(xSudut)},${bulat(ySudut - a)} Z`
  bagian.push(`<path d="${dLas}" fill="${WARNA_AKSEN}" opacity="0.55" `
    + `stroke="${WARNA_AKSEN}" stroke-width="${bulat(t * 1.2)}"/>`)

  /*
    ── GARIS TENGGOROKAN: bidang tersempit, tegak lurus sisi miring.
    Inilah yang menahan, dan inilah yang tak pernah tergambar di mana pun.
  */
  const tebalTeng = a * FAKTOR_TENGGOROKAN
  const xm = xSudut - a / 2
  const ym = ySudut - a / 2
  bagian.push(garis(xSudut, ySudut, xm, ym, '#0f172a', t * 2.0))
  bagian.push(teks(xm - uk * 0.25, ym - uk * 0.2,
    `tenggorokan ${bulat(tebalTeng, 2)}`, uk * 0.62, '#0f172a', 'end'))

  if (pakaiDimensi) {
    /* Kaki las, mendatar. */
    bagian.push(garis(xSudut - a, ySudut + tp + uk * 0.4, xSudut,
      ySudut + tp + uk * 0.4, WARNA_AKSEN, t * 0.9))
    bagian.push(teks(xSudut - a / 2, ySudut + tp + uk * 1.1,
      `kaki ${bulat(a, 1)}`, uk * 0.66, WARNA_AKSEN))

    /*
      Perbandingannya dicetak sebagai KALIMAT, bukan hanya dua angka.
      "0,707" tak berarti apa-apa; "29% lebih kecil daripada kakinya" berarti.
    */
    bagian.push(teks(0, -margin * 0.1,
      `tenggorokan = 0,707 × kaki (29% lebih kecil)`,
      uk * 0.64, WARNA.dimensi, 'start'))
    bagian.push(teks(lebar, -margin * 0.1,
      `panjang las ${bulat(L, 0)} mm`, uk * 0.64, WARNA.dimensi, 'end'))

    if (input.rasio != null) {
      const lewat = input.rasio > 1
      bagian.push(teks(lebar, tinggi + margin * 0.3,
        `terpakai ${bulat(input.rasio * 100, 0)}%`,
        uk * 0.68, lewat ? '#dc2626' : WARNA.dimensi, 'end'))
    }
  }

  if (opsi.judul) {
    bagian.push(teks(lebar / 2, -margin * 0.55, opsi.judul, uk * 0.95))
  }

  const lebarPx = opsi.lebarPx ?? 440
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Potongan las sudut')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

// ── Penampang KAYU ───────────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KAYU — bahan yang kekuatannya bergantung ARAH, dan arah itu tak berangka
 *
 * Beton dan baja sama kuat ke segala arah. Kayu tidak: sepanjang seratnya ia
 * sangat kuat, tegak lurus seratnya ia lemah — pada kelas II, kuat tekan tegak
 * lurus serat hanya SEPERTIGA kuat tekan sejajarnya.
 *
 * Itulah kenapa penampang kayu digambar dengan GARIS SERAT, bukan sebagai
 * kotak polos. Yang membaca gambar perlu melihat ke mana seratnya menghadap,
 * karena di situlah letak dua kegagalan yang paling sering:
 *
 *   TUMPUAN  — kayu ditekan tegak lurus serat di landasannya, dan ia PENYOK
 *              (bukan patah). Sambungan lalu longgar tanpa ada yang retak.
 *   BELAH    — alat sambung terlalu dekat ujung mendorong serat sampai kayu
 *              terbelah mengikuti aratnya, kegagalan GETAS tanpa peringatan.
 *
 * Keduanya tak terlihat pada gambar tanpa serat, dan keduanya sudah diperiksa
 * modulnya. Gambar ini membuat pemeriksaan itu bisa dipahami.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface InputGambarKayu {
  /** Lebar penampang, mm. */
  lebarMm: number
  /** Tinggi penampang, mm. */
  tinggiMm: number
  /** Kelas kayu (I..IV), dicetak sebagai catatan. */
  kelas?: string
  /** Panjang batang, m. */
  panjangM?: number
  /** Gaya batang, kN. Negatif = tekan. */
  gayaKn?: number
  /** Lebar landasan tumpuan, mm — bidang tekan tegak lurus serat. */
  lebarTumpuanMm?: number
  /** Rasio terpakai tumpuan tegak lurus serat, 0..n. */
  rasioTumpu?: number
}

const WARNA_KAYU = '#b45309'
const WARNA_KAYU_ISI = '#fef3c7'

export function gambarPenampangKayu(
  input: InputGambarKayu,
  opsi: OpsiGambar = {},
): string {
  const { lebarMm: b, tinggiMm: h } = input

  if (!(b > 0)) throw new Error('Lebar penampang harus > 0')
  if (!(h > 0)) throw new Error('Tinggi penampang harus > 0')

  const margin = opsi.marginMm ?? Math.max(b, h) * 0.45
  const pakaiDimensi = opsi.dimensi ?? true
  const ruangNotasi = pakaiDimensi ? margin * 1.1 : 0

  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = b + 2 * margin + ruangNotasi
  const vbH = h + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  const t = Math.max(b, h) / 240
  const uk = Math.max(b, h) / 17

  const bagian: string[] = []

  bagian.push(`<rect x="0" y="0" width="${bulat(b)}" height="${bulat(h)}" `
    + `fill="${WARNA_KAYU_ISI}"/>`)

  /*
    ── GARIS SERAT, sejajar sumbu panjang batang.
    Digambar melengkung tipis supaya terbaca sebagai serat kayu, bukan sebagai
    tulangan atau garis arsir beton.
  */
  const nSerat = 5
  for (let k = 1; k <= nSerat; k++) {
    const y = (h * k) / (nSerat + 1)
    const lengkung = h / 26
    bagian.push(
      `<path d="M0,${bulat(y)} Q${bulat(b * 0.3)},${bulat(y - lengkung)} `
      + `${bulat(b * 0.55)},${bulat(y)} T${bulat(b)},${bulat(y)}" `
      + `fill="none" stroke="${WARNA_KAYU}" stroke-width="${bulat(t * 0.8)}" `
      + `opacity="0.5"/>`)
  }

  bagian.push(`<rect x="0" y="0" width="${bulat(b)}" height="${bulat(h)}" `
    + `fill="none" stroke="${WARNA_KAYU}" stroke-width="${bulat(t * 1.8)}"/>`)

  if (pakaiDimensi) {
    const off = margin * 0.42

    bagian.push(garis(0, h + off, b, h + off, WARNA.dimensi, t * 0.7))
    bagian.push(teks(b / 2, h + off + uk * 1.05,
      `${bulat(b, 0)} mm`, uk * 0.82, WARNA.dimensi))

    bagian.push(garis(-off, 0, -off, h, WARNA.dimensi, t * 0.7))
    bagian.push(
      `<g transform="translate(${bulat(-off - uk * 0.5)},${bulat(h / 2)}) rotate(-90)">`
      + `<text x="0" y="0" font-family="ui-sans-serif,system-ui,sans-serif" `
      + `font-size="${bulat(uk * 0.82)}" fill="${WARNA.dimensi}" text-anchor="middle">`
      + `${bulat(h, 0)} mm</text></g>`)

    /* Arah serat ditulis, bukan hanya digambar — supaya tak salah tafsir. */
    bagian.push(teks(b + off * 0.5, h * 0.42,
      'arah serat →', uk * 0.68, WARNA_KAYU, 'start'))

    if (input.kelas) {
      bagian.push(teks(b + off * 0.5, h * 0.62,
        `kelas ${input.kelas}`, uk * 0.72, WARNA.dimensi, 'start'))
    }

    /*
      ── TUMPUAN tegak lurus serat, kegagalan yang paling sering pada kayu.
      Kayu di landasan PENYOK, bukan patah — dan yang penyok tak terlihat
      sebagai kerusakan sampai sambungannya sudah longgar.
    */
    if (input.lebarTumpuanMm != null && input.lebarTumpuanMm > 0) {
      const lewat = (input.rasioTumpu ?? 0) > 1
      const lt = Math.min(input.lebarTumpuanMm, b)
      bagian.push(
        `<rect x="${bulat((b - lt) / 2)}" y="${bulat(h)}" width="${bulat(lt)}" `
        + `height="${bulat(uk * 0.32)}" fill="${lewat ? '#dc2626' : WARNA.sengkang}" `
        + `opacity="0.55"/>`)
      bagian.push(teks(b / 2, h + uk * 0.95,
        `tumpuan ${bulat(input.lebarTumpuanMm, 0)} mm`,
        uk * 0.62, lewat ? '#dc2626' : WARNA.sengkang))
    }

    if (input.gayaKn != null) {
      const tekan = input.gayaKn < 0
      bagian.push(teks(0, -margin * 0.12,
        `${tekan ? 'TEKAN' : 'tarik'} ${bulat(Math.abs(input.gayaKn), 1)} kN`,
        uk * 0.74, tekan ? WARNA_TEKAN : WARNA.dimensi, 'start'))
    }
  }

  if (opsi.judul) {
    bagian.push(teks(b / 2, -margin * 0.55, opsi.judul, uk * 1.05))
  }

  const lebarPx = opsi.lebarPx ?? 420
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bulat(vbX)} ${bulat(vbY)} ${bulat(vbW)} ${bulat(vbH)}" `
    + `width="${lebarPx}" role="img" aria-label="${amankanTeks(opsi.judul ?? 'Penampang kayu')}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

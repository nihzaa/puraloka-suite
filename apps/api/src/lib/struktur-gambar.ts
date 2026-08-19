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

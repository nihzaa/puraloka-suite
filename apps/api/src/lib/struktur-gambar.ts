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
export function gambarPenampang(input: InputGambarPenampang, opsi: OpsiGambar = {}): string {
  const { bMm, hMm, selimutMm, dSengkangMm } = input
  const margin = opsi.marginMm ?? Math.max(bMm, hMm) * 0.35
  const pakaiDimensi = opsi.dimensi ?? true

  const { bawah, atas } = posisiTulangan(input)

  // viewBox: seluruh gambar + margin. Titik (0,0) di sudut kiri atas beton.
  const vbX = -margin
  const vbY = -margin - (opsi.judul ? margin * 0.4 : 0)
  const vbW = bMm + 2 * margin
  const vbH = hMm + 2 * margin + (opsi.judul ? margin * 0.4 : 0)

  // Tebal garis diskalakan terhadap ukuran benda supaya tetap terlihat
  // proporsional pada penampang 200 mm maupun 1200 mm.
  const t = Math.max(bMm, hMm) / 250
  const ukuranTeks = Math.max(bMm, hMm) / 16

  const bagian: string[] = []

  // Beton
  bagian.push(`<rect x="0" y="0" width="${bulat(bMm)}" height="${bulat(hMm)}" `
    + `fill="${WARNA.betonIsi}" stroke="${WARNA.beton}" stroke-width="${bulat(t * 1.5)}"/>`)

  // Sengkang — persegi di dalam selimut, sudut dibulatkan seperti aslinya.
  const sx = selimutMm
  const sy = selimutMm
  const sw = bMm - 2 * selimutMm
  const sh = hMm - 2 * selimutMm
  if (sw > 0 && sh > 0) {
    const r = Math.min(dSengkangMm * 2, sw / 4, sh / 4)
    bagian.push(`<rect x="${bulat(sx)}" y="${bulat(sy)}" width="${bulat(sw)}" height="${bulat(sh)}" `
      + `rx="${bulat(r)}" ry="${bulat(r)}" fill="none" `
      + `stroke="${WARNA.sengkang}" stroke-width="${bulat(Math.max(dSengkangMm, t))}"/>`)
  }

  // Tulangan — lingkaran penuh, ukuran sesuai diameter sesungguhnya.
  for (const b of [...bawah, ...atas]) {
    bagian.push(`<circle cx="${bulat(b.xMm)}" cy="${bulat(b.yMm)}" r="${bulat(b.diameterMm / 2)}" `
      + `fill="${WARNA.tulangan}"/>`)
  }

  // Dimensi
  if (pakaiDimensi) {
    const off = margin * 0.55
    // Lebar (bawah)
    bagian.push(garis(0, hMm + off, bMm, hMm + off, WARNA.dimensi, t))
    bagian.push(garis(0, hMm, 0, hMm + off * 1.15, WARNA.dimensi, t * 0.6))
    bagian.push(garis(bMm, hMm, bMm, hMm + off * 1.15, WARNA.dimensi, t * 0.6))
    bagian.push(teks(bMm / 2, hMm + off - ukuranTeks * 0.35, `${bulat(bMm, 0)} mm`,
      ukuranTeks, WARNA.dimensi))
    // Tinggi (kiri)
    bagian.push(garis(-off, 0, -off, hMm, WARNA.dimensi, t))
    bagian.push(garis(-off * 1.15, 0, 0, 0, WARNA.dimensi, t * 0.6))
    bagian.push(garis(-off * 1.15, hMm, 0, hMm, WARNA.dimensi, t * 0.6))
    bagian.push(`<text x="${bulat(-off - ukuranTeks * 0.35)}" y="${bulat(hMm / 2)}" `
      + `font-size="${bulat(ukuranTeks)}" fill="${WARNA.dimensi}" text-anchor="middle" `
      + `font-family="system-ui, sans-serif" `
      + `transform="rotate(-90 ${bulat(-off - ukuranTeks * 0.35)} ${bulat(hMm / 2)})">`
      + `${bulat(hMm, 0)} mm</text>`)
  }

  if (opsi.judul) {
    bagian.push(teks(bMm / 2, -margin * 0.5, opsi.judul, ukuranTeks * 1.15))
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

  const W = 300, H = 90
  const t = 3
  const bagian: string[] = []

  const kaitPanjang = 18
  const isSengkang = segmenM.length >= 4

  if (isSengkang) {
    // Persegi tertutup + dua kait miring di sudut kanan atas.
    const x0 = 60, y0 = 22, w = 170, h = 46
    bagian.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" `
      + `fill="none" stroke="${WARNA.tulangan}" stroke-width="${t}"/>`)
    bagian.push(garis(x0 + w, y0, x0 + w + kaitPanjang, y0 - kaitPanjang * 0.7, WARNA.tulangan, t))
    bagian.push(garis(x0 + w, y0, x0 + w + kaitPanjang * 0.3, y0 + kaitPanjang, WARNA.tulangan, t))
    // Ukuran sisi.
    bagian.push(teks(x0 + w / 2, y0 - 6, `${bulat(segmenM[0] * 1000, 0)}`, 13, WARNA.dimensi))
    bagian.push(teks(x0 - 16, y0 + h / 2 + 4, `${bulat(segmenM[1] * 1000, 0)}`, 13, WARNA.dimensi))
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

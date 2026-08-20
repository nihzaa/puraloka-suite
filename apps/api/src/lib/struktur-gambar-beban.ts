/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DIAGRAM BEBAN, MOMEN, DAN GAYA LINTANG — yang khas terlihat di SAP/ETABS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Modul gambar yang sudah ada memuat 20 fungsi, dan SEMUANYA penampang atau
 * detail: penampang balok, diagram P-M, pola sambungan, denah pondasi. Nol
 * diagram beban.
 *
 * Padahal yang paling sering dicari orang saat memeriksa perhitungan justru
 * bentuk ini: "bebannya seperti apa, momennya di mana yang terbesar, dan
 * gesernya di mana".
 *
 * ── Kenapa gambar, bukan tabel angka
 *
 * Dua kesalahan yang paling mahal di perhitungan balok TAK TERLIHAT dari
 * angka, tapi langsung terlihat dari bentuknya:
 *
 *   · KANTILEVER yang dihitung sebagai balok sederhana. Angkanya wajar
 *     (momen kNm biasa), tapi bentuk diagramnya berbeda total: kantilever
 *     memuncak di TUMPUAN, sederhana memuncak di TENGAH. Salah menaruh
 *     tulangan tarik karena ini membuat balok runtuh jauh di bawah rencana.
 *
 *   · Beban terpusat yang lupa dimasukkan. Diagram gaya lintangnya kehilangan
 *     "lompatan" yang khas — dan lompatan yang hilang jauh lebih mudah
 *     dilihat daripada selisih 12 kN pada satu angka.
 *
 * ── Konvensi tanda: momen POSITIF digambar ke BAWAH
 *
 * Ini konvensi teknik sipil (bukan matematika): diagram momen digambar di
 * sisi SERAT TARIK. Balok sederhana bermomen positif → serat tarik di bawah →
 * diagram di bawah garis. Kantilever bermomen negatif → tarik di ATAS →
 * diagram di atas garis.
 *
 * Menggambarnya terbalik membuat orang menaruh tulangan di sisi yang salah,
 * dan itu kegagalan yang tak menimbulkan galat apa pun.
 */

import type { HasilBebanBalok } from './struktur-beban-balok.js'

const WARNA = {
  batang: '#1f2937',
  beban: '#2563eb',
  momen: '#dc2626',
  geser: '#059669',
  dimensi: '#6b7280',
  teks: '#111827',
  /*
    Isi dipisah dari opasitasnya (`fill` + `fill-opacity`), BUKAN `rgba()`.

    Ditemukan dengan MELIHAT hasil render: `rgba()` tak dikenali sebagian
    perender SVG, dan yang tak dikenali jatuh ke HITAM PEKAT — diagramnya
    jadi blok hitam yang menutupi garis batasnya sendiri. Tak ada galat,
    tak ada peringatan; SVG-nya sah, cuma tak terbaca.
  */
  isiMomen: '#dc2626',
  isiGeser: '#059669',
} as const

function amankanTeks(s: string): string {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

function bulat(n: number): number {
  return Math.round(n * 100) / 100
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

export interface OpsiDiagram {
  lebarPx?: number
  /** Judul yang dibacakan pembaca layar. */
  uraian?: string
}

/**
 * Diagram beban + momen + gaya lintang untuk satu balok.
 *
 * Tiga panel bertumpuk pada satu sumbu-x yang SAMA, supaya posisi puncak momen
 * dan lompatan geser bisa dibaca sejajar. Menggambarnya di tiga kanvas terpisah
 * membuat pembacanya harus mencocokkan sendiri, dan itu justru langkah tempat
 * kesalahan baca terjadi.
 */
export function gambarDiagramBeban(
  hasil: HasilBebanBalok, bentangM: number, opsi: OpsiDiagram = {},
): string {
  if (!Number.isFinite(bentangM) || bentangM <= 0) {
    throw new Error(`gambarDiagramBeban: bentang tak sah (${bentangM})`)
  }

  const W = 520
  const M = 46           // margin kiri/kanan
  const L = W - 2 * M    // panjang gambar batang, px

  /* Tinggi tiap panel — angka ini hasil MELIHAT, bukan hitungan.
     Panel yang lebih pendek membuat label puncak menimpa sumbunya. */
  /*
    Jarak antar-panel hasil MELIHAT, bukan hitungan.

    Pada tata letak sebelumnya label "+96,26 kN" menimpa judul "DIAGRAM
    GAYA LINTANG", dan label Mu jatuh di luar bidang diagramnya. Keduanya
    SVG yang sah — hanya tak terbaca.
  */
  const yBatang = 78
  const yMomen = 208
  const yGeser = 330
  const H = 392

  const bagian: string[] = []
  const kantilever = hasil.skema === 'kantilever'

  const px = (m: number) => M + (m / bentangM) * L

  // ══ PANEL 1: beban & tumpuan ══════════════════════════════════════════════
  bagian.push(teks(M, 22, 'BEBAN RENCANA', 11, WARNA.dimensi, 'start'))

  /* Anak panah beban merata — arah ke BAWAH (gravitasi). */
  const nPanah = 11
  for (let i = 0; i <= nPanah; i++) {
    const x = M + (i / nPanah) * L
    bagian.push(garis(x, 36, x, yBatang - 4, WARNA.beban, 1.4))
    bagian.push(
      `<path d="M ${bulat(x)} ${yBatang} l -3.2 -6 l 6.4 0 z" fill="${WARNA.beban}" />`)
  }
  bagian.push(garis(M, 36, M + L, 36, WARNA.beban, 2))
  bagian.push(teks(M + L / 2, 30,
    `qu = ${bulat(hasil.quKnM)} kN/m`, 11, WARNA.beban))

  /* Beban terpusat, bila ada — inilah yang membuat "lompatan" di geser. */
  if (hasil.puKn > 0) {
    const xP = kantilever ? M + L : M + L / 2
    bagian.push(garis(xP, 12, xP, yBatang - 4, WARNA.momen, 2.6))
    bagian.push(
      `<path d="M ${bulat(xP)} ${yBatang} l -4.5 -9 l 9 0 z" fill="${WARNA.momen}" />`)
    bagian.push(teks(xP, 9, `Pu = ${bulat(hasil.puKn)} kN`, 10, WARNA.momen))
  }

  /* Batang. */
  bagian.push(garis(M, yBatang, M + L, yBatang, WARNA.batang, 4))

  /*
    Tumpuan — bentuknya membedakan skema, dan bentuk itu yang paling cepat
    memberi tahu pembaca bahwa skemanya salah pilih.
  */
  if (kantilever) {
    /* Jepit di kiri: batang vertikal + arsir. */
    bagian.push(garis(M, yBatang - 22, M, yBatang + 22, WARNA.batang, 4))
    for (let i = -20; i <= 20; i += 7) {
      bagian.push(garis(M, yBatang + i, M - 9, yBatang + i + 6, WARNA.batang, 1.4))
    }
    bagian.push(teks(M - 4, yBatang + 40, 'JEPIT', 9, WARNA.dimensi, 'end'))
    bagian.push(teks(M + L, yBatang + 20, 'bebas', 9, WARNA.dimensi))
  } else {
    /* Sendi (segitiga) kiri, rol (segitiga + garis) kanan. */
    bagian.push(`<path d="M ${M} ${yBatang} l -9 16 l 18 0 z" fill="none" `
      + `stroke="${WARNA.batang}" stroke-width="2" />`)
    bagian.push(`<path d="M ${M + L} ${yBatang} l -9 16 l 18 0 z" fill="none" `
      + `stroke="${WARNA.batang}" stroke-width="2" />`)
    bagian.push(garis(M + L - 12, yBatang + 20, M + L + 12, yBatang + 20, WARNA.batang, 2))
  }

  /* Dimensi bentang. */
  bagian.push(garis(M, yBatang + 46, M + L, yBatang + 46, WARNA.dimensi, 1))
  bagian.push(teks(M + L / 2, yBatang + 42, `L = ${bentangM} m`, 11, WARNA.dimensi))

  // ══ PANEL 2: momen ════════════════════════════════════════════════════════
  /*
    Judul panel momen ditaruh di sisi yang BERLAWANAN dengan diagramnya.

    Momen kantilever digambar ke ATAS, dan judul di atas garis ikut ditimpa
    label Mu-nya. Terlihat hanya dari merender kantilever — kasus sederhana
    tampak sempurna. Kanvas yang sama, dua skema, satu tabrakan.
  */
  bagian.push(teks(M, kantilever ? yMomen + 30 : yMomen - 44,
    'DIAGRAM MOMEN (kNm)', 11, WARNA.momen, 'start'))
  bagian.push(garis(M, yMomen, M + L, yMomen, WARNA.dimensi, 1))

  const tinggiMomen = 52
  /*
    Momen digambar di sisi SERAT TARIK (konvensi teknik sipil):
    balok sederhana → positif → ke BAWAH; kantilever → negatif → ke ATAS.
  */
  const arahM = kantilever ? -1 : 1
  const titikM: string[] = []
  const N = 40
  for (let i = 0; i <= N; i++) {
    const x = i / N
    /*
      Bentuk momen:
        sederhana/menerus : parabola, nol di tumpuan, puncak di tengah
        kantilever        : parabola, puncak di JEPIT, nol di ujung bebas
    */
    const rasio = kantilever ? (1 - x) ** 2 : 4 * x * (1 - x)
    titikM.push(`${bulat(px(x * bentangM))},${bulat(yMomen + arahM * rasio * tinggiMomen)}`)
  }
  bagian.push(`<polygon points="${M},${yMomen} ${titikM.join(' ')} ${M + L},${yMomen}" `
    + `fill="${WARNA.isiMomen}" fill-opacity="0.15" stroke="${WARNA.momen}" stroke-width="2" />`)

  /*
    Label puncak ditaruh DI DALAM bidang diagramnya (setengah tinggi), bukan
    di luarnya — di luar ia menabrak judul panel berikutnya.
  */
  /* Kantilever: label digeser lebih jauh dari jepit dan lebih tinggi —
     di dekat jepit bidangnya paling sempit, dan labelnya menyentuh garis
     miring diagramnya sendiri. */
  const xPuncakM = kantilever ? M + 14 : M + L / 2
  const yPuncakM = yMomen + arahM * tinggiMomen * (kantilever ? 0.72 : 0.55)
  bagian.push(teks(xPuncakM, yPuncakM,
    `Mu = ${bulat(hasil.muKnm)} kNm`, 12, WARNA.momen,
    kantilever ? 'start' : 'middle'))

  /* Keterangan sisi tarik — inilah yang menentukan letak tulangan. */
  bagian.push(teks(M + L, yMomen + arahM * (tinggiMomen + 16),
    kantilever ? 'tarik di ATAS' : 'tarik di BAWAH', 10, WARNA.momen, 'end'))

  // ══ PANEL 3: gaya lintang ═════════════════════════════════════════════════
  bagian.push(teks(M, yGeser - 44, 'DIAGRAM GAYA LINTANG (kN)', 11, WARNA.geser, 'start'))
  bagian.push(garis(M, yGeser, M + L, yGeser, WARNA.dimensi, 1))

  const tinggiV = 40
  if (kantilever) {
    /* Kantilever: maksimum di jepit, turun linier ke nol di ujung. */
    bagian.push(`<polygon points="${M},${yGeser} ${M},${bulat(yGeser - tinggiV)} `
      + `${M + L},${yGeser}" fill="${WARNA.isiGeser}" fill-opacity="0.15" stroke="${WARNA.geser}" stroke-width="2" />`)
    bagian.push(teks(M + 46, yGeser - tinggiV * 0.45, `Vu = ${bulat(hasil.vuKn)} kN`, 11, WARNA.geser))
  } else {
    /*
      Balok sederhana: +V di kiri, melintasi nol di tengah, −V di kanan.
      Bentuk "dua segitiga berlawanan" ini yang khas — dan lompatan di tengah
      muncul bila ada beban terpusat.
    */
    bagian.push(`<polygon points="${M},${yGeser} ${M},${bulat(yGeser - tinggiV)} `
      + `${M + L / 2},${yGeser} ${M + L},${bulat(yGeser + tinggiV)} ${M + L},${yGeser}" `
      + `fill="${WARNA.isiGeser}" fill-opacity="0.15" stroke="${WARNA.geser}" stroke-width="2" />`)
    bagian.push(teks(M + 44, yGeser - tinggiV * 0.42, `+${bulat(hasil.vuKn)} kN`, 11, WARNA.geser))
    bagian.push(teks(M + L - 44, yGeser + tinggiV * 0.62, `−${bulat(hasil.vuKn)} kN`, 11, WARNA.geser))
  }

  /* Ringkasan beban di kaki gambar — dua lapis pembaca, seperti lembar PDF. */
  bagian.push(teks(M, H - 12,
    `D = ${bulat(hasil.qMatiKnM)} kN/m · L = ${bulat(hasil.qHidupKnM)} kN/m `
    + `· 1,2D + 1,6L · wL²/${hasil.pembagiMomen}`, 10, WARNA.dimensi, 'start'))

  const judul = opsi.uraian
    ?? `Diagram beban, momen, dan gaya lintang balok bentang ${bentangM} m — `
      + `Mu ${bulat(hasil.muKnm)} kNm, Vu ${bulat(hasil.vuKn)} kN`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" `
    + `width="${opsi.lebarPx ?? W}" role="img" aria-label="${amankanTeks(judul)}">`,
    ...bagian,
    '</svg>',
  ].join('\n')
}

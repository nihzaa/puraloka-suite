/**
 * ══════════════════════════════════════════════════════════════════════════════
 * LEMBAR PERHITUNGAN → PDF
 *
 * Menggambar struktur dokumen dari `struktur-lembar.ts`. DIPISAH dari
 * penyusunnya supaya susunannya bisa diuji tanpa pdfkit — alasan yang sama
 * dengan `posisiTulangan()` yang dipisah dari `gambarPenampang()`.
 *
 * ── Bentuknya mengikuti lembar perhitungan teknik, dan itu FUNGSI bukan gaya
 *
 * Yang membedakan lembar perhitungan dari cetakan layar:
 *
 *   NOMOR HALAMAN "n dari N"   supaya ketahuan kalau ada halaman hilang saat
 *                              difotokopi atau dikirim
 *   KOP BERULANG               tiap halaman berdiri sendiri; halaman yang
 *                              terlepas masih bisa dilacak asalnya
 *   TABEL BERGARIS             mata mengikuti baris tanpa tersesat ke baris
 *                              sebelahnya — pada tabel 12 kolom itu nyata
 *   VERDICT DI KOLOM TETAP     pemeriksa memindai satu kolom, bukan membaca
 *                              tiap baris
 *   RUMUS DI BAWAH BARISNYA    supaya "dari mana angka ini" terjawab tanpa
 *                              membalik halaman
 *
 * ── Yang TIDAK dilakukan
 *
 * Gambar SVG TIDAK ditanam ke PDF. pdfkit tak bisa merender SVG tanpa pustaka
 * tambahan, dan menambah dependensi untuk itu berarti satu lagi hal yang bisa
 * rusak saat dipasang di mesin lain. Yang dicetak: PERNYATAAN bahwa gambarnya
 * ada beserta cara membukanya — jujur, dan tak menjanjikan yang tak ada.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import PDFDocument from 'pdfkit'
import type { LembarPerhitungan, BagianElemen } from './struktur-lembar.js'

/** Margin halaman, poin (1 pt = 1/72 inci). */
const M = 42
/** Lebar kertas A4 dalam poin. */
const LEBAR_A4 = 595.28
/** Tinggi kertas A4. */
const TINGGI_A4 = 841.89
/** Lebar area tulis. */
const W = LEBAR_A4 - 2 * M
/** Batas bawah sebelum ganti halaman — menyisakan ruang untuk kaki halaman. */
const BATAS_BAWAH = TINGGI_A4 - M - 26

const ABU = '#6b7280'
const GARIS = '#d1d5db'
const MERAH = '#b91c1c'
const KUNING = '#a16207'
const HIJAU = '#15803d'

/** Warna per tingkat bahaya — sama artinya dengan di layar. */
function warnaTingkat(t: 'aman' | 'mepet' | 'bahaya'): string {
  return t === 'bahaya' ? MERAH : t === 'mepet' ? KUNING : HIJAU
}

/** Angka bergaya Indonesia: koma desimal, titik ribuan. */
function num(v: number, desimal = 2): string {
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('id-ID', {
    minimumFractionDigits: 0, maximumFractionDigits: desimal,
  })
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ALIH-AKSARA lambang teknik ke huruf yang bisa dicetak Helvetica.
 *
 * pdfkit memakai font bawaan PDF (Helvetica) ber-encoding WinAnsi, dan
 * WinAnsi TIDAK memuat lambang Yunani maupun matematika. Rumus struktur penuh
 * dengan keduanya:
 *
 *     φMn = 0.9 · As · fy · (d − a/2)
 *     ρ ≥ max(√f'c/(4·fy), 1.4/fy)
 *
 * Yang tercetak tanpa penanganan: `<dÖâÒãr2rgrB!"ó"` — bukan galat, bukan
 * kosong, melainkan SAMPAH yang terlihat seperti kerusakan berkas. Ketahuan
 * hanya karena teks PDF-nya dibaca kembali; PDF-nya sendiri terbit normal
 * 16 KB tanpa satu pun peringatan.
 *
 * ── Kenapa DIALIH-AKSARA, bukan dibuang
 *
 * Membuang lambangnya menghasilkan `Mn = 0.9  As  fy  (d  a/2)` — rumus yang
 * kehilangan operatornya, dan rumus tanpa operator tak bisa dihitung ulang.
 * Padahal seluruh gunanya justru supaya bisa dihitung ulang.
 *
 * Alih-aksara memakai penulisan yang lazim di buku teknik Indonesia
 * (`phi`, `rho`, `sqrt`), jadi pembacanya tetap mengenalinya.
 *
 * ── Menanam font Unicode DITOLAK
 *
 * Bisa saja menanam TTF ber-Unicode, tetapi itu menambah berkas font ke repo
 * dan satu lagi hal yang bisa hilang saat dipasang di mesin lain. Untuk
 * dokumen yang harus terbit di lapangan, huruf yang pasti ada mengalahkan
 * lambang yang cantik.
 * ══════════════════════════════════════════════════════════════════════════════
 */
const ALIH_AKSARA: ReadonlyArray<readonly [RegExp, string]> = [
  /*
    ── Yang DIALIHAKSARAKAN: lambang yang Helvetica/WinAnsi tak punya.

    Diukur, bukan ditebak. Tiap kandidat dicetak lalu teksnya dibaca ulang
    dari aliran PDF-nya. Yang di bawah ini pulang sebagai bita ganda
    (`≥` → `"e`, `φ` → `<e`, `θ` → `;`) — itu glif font Symbol yang
    nyasar, bukan huruf yang tercetak.
  */
  [/φ/g, 'phi'], [/ρ/g, 'rho'], [/β/g, 'beta'], [/γ/g, 'gamma'],
  [/Δ/g, 'delta'], [/δ/g, 'delta'], [/θ/g, 'theta'], [/α/g, 'alpha'],
  [/λ/g, 'lambda'], [/ν/g, 'nu'], [/Σ/g, 'sigma'], [/π/g, 'pi'],
  /*
    `√` jadi `sqrt ` DENGAN spasi di belakang: tanpa itu `√f'c` menjadi
    `sqrtf'c` yang terbaca sebagai satu kata dan kehilangan artinya.
  */
  [/√\s*/g, 'sqrt '], [/≥/g, '>='], [/≤/g, '<='], [/≠/g, '!='], [/≈/g, '~='],
  /*
    `→` TIDAK punya padanan WinAnsi dan selama ini DIBUANG diam-diam —
    "(permukaan → PUSAT tulangan)" tercetak "(permukaan  PUSAT tulangan)",
    kalimat yang kehilangan arah bacanya tanpa satu pun gejala.
  */
  [/→/g, '->'], [/←/g, '<-'],
  /*
    ── Yang TIDAK dialihaksarakan lagi: semuanya ADA di WinAnsi.

    Versi pertama meratakan `—` jadi `--`, `·` jadi `*`, dan `³` jadi `^3`
    "demi aman". Itu memperburuk hasil tanpa alasan: lembar bertanda tangan
    yang menulis `0,936 m^3` dan `SNI 2847:2019 -- Persyaratan` terbaca
    seperti keluaran terminal, bukan dokumen teknis.

    Yang tetap dialihaksarakan di kelompok ini hanya `−` (MINUS SIGN,
    U+2212) yang memang di luar Latin-1 — beda dari tanda hubung biasa.
  */
  /*
    ── EM/EN DASH: DIALIHAKSARAKAN, dan ini koreksi atas kesalahan saya.

    Saya sempat mengeluarkannya dari daftar ini karena probe saya melaporkan
    "BISA". Probe itu salah: ia hanya memeriksa hasilnya tidak kosong,
    padahal untuk `—` hasilnya justru string KOSONG — tanda ia DIBUANG.

    Akibatnya terlihat di lembar sungguhan: "SNI 2847:2019  Persyaratan",
    "TIDAK AMAN  besinya cukup terlindung" — kalimat yang kehilangan
    pemisahnya dan terbaca seperti dua potongan yang tak berhubungan.

    Persis kelas cacat yang modul ini dibangun untuk mencegah, dan ia lolos
    karena pemeriksa rumus tak melihat kalimat biasa.
  */
  [/[—–]/g, '-'], [/−/g, '-'],
  [/[“”]/g, '"'], [/[‘’]/g, "'"], [/…/g, '...'],
]
/**
 * Membuat teks aman untuk Helvetica/WinAnsi.
 *
 * Dipakai pada SETIAP teks yang masuk PDF — bukan hanya rumus. Nama elemen
 * dan catatan pun ditulis pengguna, dan satu karakter di luar WinAnsi
 * merusak seluruh baris tanpa gejala.
 */
export function amanUntukPdf(teks: string): string {
  let t = teks
  for (const [pola, ganti] of ALIH_AKSARA) t = t.replace(pola, ganti)
  /*
    Sisa karakter di luar Latin-1 dibuang, BUKAN dibiarkan: satu karakter
    tak terpetakan cukup untuk membuat pdfkit mencetak sampah.
  */
  return t.replace(/[^\x20-\xFF\n]/g, '')
}

function tglPanjang(iso: string): string {
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

type Doc = InstanceType<typeof PDFDocument>

/**
 * Susun PDF lembar perhitungan.
 *
 * Memulangkan Buffer supaya pemanggilnya bebas memilih: dikirim sebagai
 * balasan HTTP, disimpan, atau dilampirkan ke surel.
 */
export function susunPdfLembar(lembar: LembarPerhitungan): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4', margin: M, autoFirstPage: true,
    /*
      `bufferPages` WAJIB untuk menulis nomor halaman "n dari N".

      Tanpa itu tiap halaman langsung dikirim ke aliran keluaran, dan
      `switchToPage(0)` melempar "out of bounds, current buffer covers pages
      3 to 3" — halaman sebelumnya sudah tak bisa disentuh lagi.

      Total halaman baru diketahui SESUDAH seluruh isi digambar, jadi nomor
      halaman memang harus ditulis belakangan.
    */
    bufferPages: true,
    info: {
      Title: `${lembar.judul} — ${lembar.proyek.nama}`,
      Author: lembar.penerbit.nama,
      Subject: `Nomor ${lembar.nomor}`,
    },
  })

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const selesai = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  /*
    Nomor halaman ditulis BELAKANGAN, sesudah total halamannya diketahui.
    "Halaman 3" saja tak memberi tahu apakah ada halaman 4 yang hilang;
    "Halaman 3 dari 7" memberi tahu.
  */
  let y = M

  const kop = () => {
    doc.font('Helvetica-Bold').fontSize(11)
      .fillColor('#000')
      .text(amanUntukPdf(lembar.penerbit.nama.toUpperCase()), M, M, { width: W })
    let yy = doc.y
    const barisKop = [
      lembar.penerbit.alamat,
      [lembar.penerbit.kota, lembar.penerbit.telepon].filter(Boolean).join(' · '),
    ].filter((x) => x && String(x).trim())
    for (const b of barisKop) {
      doc.font('Helvetica').fontSize(7.5).fillColor(ABU)
        .text(amanUntukPdf(String(b)), M, yy, { width: W })
      yy = doc.y
    }
    yy += 3
    doc.moveTo(M, yy).lineTo(M + W, yy).lineWidth(1).strokeColor('#111').stroke()
    return yy + 9
  }

  /** Ganti halaman bila sisa ruangnya kurang. */
  const ruang = (butuh: number) => {
    if (y + butuh > BATAS_BAWAH) {
      doc.addPage()
      y = kop()
    }
  }

  const judulBagian = (teks: string) => {
    ruang(26)
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111')
      .text(amanUntukPdf(teks.toUpperCase()), M, y, { width: W })
    y = doc.y + 2
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor(GARIS).stroke()
    y += 6
  }

  const teksKecil = (teks: string, opsi: { warna?: string; ukuran?: number } = {}) => {
    doc.font('Helvetica').fontSize(opsi.ukuran ?? 8).fillColor(opsi.warna ?? '#111')
    const tinggi = doc.heightOfString(teks, { width: W })
    ruang(tinggi + 2)
    doc.font('Helvetica').fontSize(opsi.ukuran ?? 8).fillColor(opsi.warna ?? '#111')
      .text(amanUntukPdf(String(teks)), M, y, { width: W, align: 'left' })
    y = doc.y + 1
  }

  // ══ HALAMAN 1: kop, identitas, ikhtisar ═══════════════════════════════════
  y = kop()

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111')
    .text(amanUntukPdf(String(lembar.judul)), M, y, { width: W, align: 'center' })
  y = doc.y + 8

  /* Identitas dokumen — dua kolom supaya ringkas. */
  const kiri = [
    ['Nomor', lembar.nomor],
    ['Proyek', lembar.proyek.nama],
    ['Lokasi', lembar.proyek.lokasi ?? '—'],
  ]
  const kanan = [
    ['Tanggal', tglPanjang(lembar.tanggal)],
    ['Jumlah elemen', String(lembar.ikhtisar.jumlahElemen)],
    ['Memenuhi syarat', `${lembar.ikhtisar.jumlahAman} dari ${lembar.ikhtisar.jumlahElemen}`],
  ]
  const kolomW = (W - 16) / 2
  const yAwal = y
  for (const [label, isi] of kiri) {
    doc.font('Helvetica').fontSize(8).fillColor(ABU)
      .text(amanUntukPdf(String(`${label}`)), M, y, { width: 78, continued: false })
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
      .text(amanUntukPdf(String(`: ${isi}`)), M + 78, y, { width: kolomW - 78 })
    y = Math.max(doc.y, y + 11)
  }
  let yKanan = yAwal
  for (const [label, isi] of kanan) {
    doc.font('Helvetica').fontSize(8).fillColor(ABU)
      .text(amanUntukPdf(String(`${label}`)), M + kolomW + 16, yKanan, { width: 82 })
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
      .text(amanUntukPdf(String(`: ${isi}`)), M + kolomW + 16 + 82, yKanan, { width: kolomW - 82 })
    yKanan = Math.max(doc.y, yKanan + 11)
  }
  y = Math.max(y, yKanan) + 8

  /*
    ── RINGKASAN untuk yang MEMUTUSKAN, di halaman pertama.

    Yang memutuskan membangun sering bukan insinyur. Menaruh kalimat ini di
    belakang angka-angka teknis berarti ia takkan dibaca — dan verdict merah
    yang tak dibaca akan dilewati.
  */
  const warnaIkhtisar = lembar.ikhtisar.jumlahTidakAman > 0 ? MERAH
    : lembar.ikhtisar.jumlahBelumDihitung > 0 ? KUNING : HIJAU
  doc.font('Helvetica').fontSize(9)
  const tinggiRingkas = doc.heightOfString(lembar.ikhtisar.kalimat, { width: W - 16 })
  ruang(tinggiRingkas + 18)
  doc.rect(M, y, W, tinggiRingkas + 14).lineWidth(0.8)
    .fillAndStroke('#fafafa', warnaIkhtisar)
  doc.font('Helvetica').fontSize(9).fillColor('#111')
    .text(amanUntukPdf(String(lembar.ikhtisar.kalimat)), M + 8, y + 7, { width: W - 16 })
  y += tinggiRingkas + 20

  /* Acuan standar. */
  judulBagian('Acuan standar')
  for (const a of lembar.acuan) teksKecil(`• ${a}`, { warna: ABU, ukuran: 7.5 })
  y += 6

  // ══ TIAP ELEMEN ═══════════════════════════════════════════════════════════
  for (const [i, b] of lembar.bagian.entries()) {
    gambarBagian(doc, b, i + 1, {
      ruang, judulBagian, teksKecil,
      getY: () => y, setY: (v: number) => { y = v },
    })
  }

  // ══ BATAS + TANDA TANGAN, di halaman yang SAMA ════════════════════════════
  /*
    Yang menandatangani harus melihat apa yang TIDAK diperiksa sebelum
    membubuhkan namanya. Kalau ruangnya tak cukup untuk keduanya, keduanya
    pindah halaman bersama-sama — bukan batasnya tertinggal di halaman lalu.
  */
  ruang(190)
  judulBagian('Batas tanggung jawab')
  for (const t of lembar.batas) teksKecil(`• ${t}`, { ukuran: 7.5 })
  y += 14

  const lebarTtd = (W - 30) / lembar.tandaTangan.length
  const yTtd = y
  for (const [i, t] of lembar.tandaTangan.entries()) {
    const x = M + i * (lebarTtd + 30)
    doc.font('Helvetica').fontSize(8).fillColor(ABU)
      .text(amanUntukPdf(String(t.peran)), x, yTtd, { width: lebarTtd, align: 'center' })
    /* Ruang tanda tangan — tinggi tetap supaya kedua kolom sejajar. */
    const yGaris = yTtd + 46
    doc.moveTo(x + 10, yGaris).lineTo(x + lebarTtd - 10, yGaris)
      .lineWidth(0.6).strokeColor('#111').stroke()
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
      .text(amanUntukPdf(t.nama ?? '( ................................ )'), x, yGaris + 4,
        { width: lebarTtd, align: 'center' })
  }
  y = yTtd + 70

  // ══ Nomor halaman "n dari N" ══════════════════════════════════════════════
  const total = doc.bufferedPageRange().count
  for (let p = 0; p < total; p++) {
    doc.switchToPage(p)
    doc.font('Helvetica').fontSize(7).fillColor(ABU)
      .text(amanUntukPdf(String(`${lembar.nomor}  ·  Halaman ${p + 1} dari ${total}`)),
        M, TINGGI_A4 - M - 12, { width: W, align: 'center' },
      )
  }

  doc.end()
  return selesai
}

/** Alat bantu tata letak yang dipinjamkan ke penggambar bagian. */
interface Tata {
  ruang: (butuh: number) => void
  judulBagian: (teks: string) => void
  teksKecil: (teks: string, opsi?: { warna?: string; ukuran?: number }) => void
  getY: () => number
  setY: (v: number) => void
}

/** Gambar satu bagian elemen. */
/**
 * Diagram momen & gaya lintang, digambar LANGSUNG dengan pdfkit.
 *
 * ── Kenapa digambar ulang, bukan menanam SVG-nya
 *
 * Kepala berkas ini menyatakan alasannya: pdfkit tak bisa merender SVG tanpa
 * pustaka tambahan, dan menambah dependensi berarti satu lagi hal yang bisa
 * rusak saat dipasang di mesin lain.
 *
 * Tapi diagram beban TIDAK butuh SVG — ia cuma garis, kurva, dan teks, dan
 * pdfkit menggambar ketiganya secara asli. Jadi yang ditanam bukan berkasnya,
 * melainkan bentuknya.
 *
 * ── Kenapa ini penting untuk lembar BERTANDA TANGAN
 *
 * Yang menandatangani memeriksa dua hal yang tak terlihat dari angka:
 * di mana momen memuncak, dan di sisi mana serat tariknya. Kantilever yang
 * dihitung sebagai balok sederhana punya angka yang sama wajarnya — yang
 * membedakan hanya bentuknya.
 */
function gambarDiagramKeLembar(
  doc: Doc, t: Tata,
  d: { muKnm: number; vuKn: number; skema: string; bentangM: number; quKnM: number },
): void {
  const kantilever = d.skema === 'kantilever'
  const M = 42
  const L = 240          // lebar diagram, pt
  const tinggi = 26

  /* Dua panel berdampingan supaya hemat tinggi halaman. */
  /*
    Ruang 130 pt, bukan 96 — hasil MELIHAT PDF-nya, bukan hitungan.

    Pada 96 pt kurva momen terpotong di batas bawah dan garis gaya lintang
    keluar dari areanya sendiri. Keduanya PDF yang sah, dan angkanya tetap
    benar — hanya bentuknya yang tak bisa dibaca. Padahal justru BENTUK itu
    alasan diagram ini ada di lembar bertanda tangan.
  */
  t.ruang(130)
  const y0 = t.getY() + 16

  doc.font('Helvetica-Bold').fontSize(7).fillColor(ABU)
    .text(amanUntukPdf('DIAGRAM MOMEN (kNm)'), M, y0 - 9, { width: L })

  /* Sumbu. */
  doc.strokeColor('#9aa3ad').lineWidth(0.5)
    .moveTo(M, y0 + tinggi).lineTo(M + L, y0 + tinggi).stroke()

  /*
    Momen digambar di sisi SERAT TARIK (konvensi teknik sipil):
    sederhana -> positif -> ke BAWAH sumbu; kantilever -> ke ATAS.
  */
  doc.strokeColor('#dc2626').lineWidth(1)
  const N = 28
  for (let i = 0; i <= N; i++) {
    const x = i / N
    const rasio = kantilever ? (1 - x) ** 2 : 4 * x * (1 - x)
    const px = M + x * L
    const py = y0 + tinggi + (kantilever ? -1 : 1) * rasio * tinggi
    if (i === 0) doc.moveTo(px, py)
    else doc.lineTo(px, py)
  }
  doc.stroke()

  doc.font('Helvetica').fontSize(6.5).fillColor('#dc2626')
    .text(amanUntukPdf(
      `Mu ${num(d.muKnm)} kNm - tarik di ${kantilever ? 'ATAS' : 'BAWAH'}`),
      M, y0 + tinggi + (kantilever ? -tinggi - 12 : tinggi + 3), { width: L })

  /* ── Panel geser, di sebelah kanan ── */
  const M2 = M + L + 22
  const L2 = 190
  doc.font('Helvetica-Bold').fontSize(7).fillColor(ABU)
    .text(amanUntukPdf('GAYA LINTANG (kN)'), M2, y0 - 9, { width: L2 })
  doc.strokeColor('#9aa3ad').lineWidth(0.5)
    .moveTo(M2, y0 + tinggi).lineTo(M2 + L2, y0 + tinggi).stroke()

  doc.strokeColor('#059669').lineWidth(1)
  if (kantilever) {
    doc.moveTo(M2, y0 + tinggi - tinggi).lineTo(M2 + L2, y0 + tinggi).stroke()
  } else {
    doc.moveTo(M2, y0 + tinggi - tinggi)
      .lineTo(M2 + L2 / 2, y0 + tinggi)
      .lineTo(M2 + L2, y0 + tinggi + tinggi).stroke()
  }
  doc.font('Helvetica').fontSize(6.5).fillColor('#059669')
    .text(amanUntukPdf(`Vu ${num(d.vuKn)} kN`),
      M2, y0 + tinggi + tinggi + 3, { width: L2 })

  /* Keterangan bebannya — supaya angkanya bisa diperiksa dari lembar ini. */
  doc.font('Helvetica').fontSize(6).fillColor(ABU)
    .text(amanUntukPdf(
      `qu ${num(d.quKnM)} kN/m - bentang ${d.bentangM} m - skema ${d.skema}`),
      M, y0 + tinggi * 2 + 14, { width: 460 })

  t.setY(y0 + tinggi * 2 + 26)
}

function gambarBagian(doc: Doc, b: BagianElemen, nomor: number, t: Tata): void {
  t.judulBagian(`${nomor}. ${b.kode}${b.nama ? ` — ${b.nama}` : ''}  (${b.jenis})`)

  /* Ringkasan awam per elemen. */
  t.teksKecil(b.ringkasanAwam, { warna: warnaTingkat(b.tingkat), ukuran: 8 })
  t.setY(t.getY() + 4)

  /* ── Tabel INPUT, tiga kolom supaya hemat halaman ───────────────────────── */
  if (b.input.length) {
    t.ruang(20)
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ABU)
      .text(amanUntukPdf(String('DATA MASUKAN')), M, t.getY(), { width: W })
    t.setY(doc.y + 3)

    /*
      DUA LAPIS dalam satu baris — persis permintaan yang mengikat modul ini:
      terbaca oleh yang tak paham teknis, TANPA menghilangkan yang dibutuhkan
      yang paham.

        Lebar b                    300 mm
        bMm                                     <- abu, kecil

      Baris atas untuk pemilik proyek; baris bawah untuk insinyur yang
      mencocokkan lembar ini dengan input JSON-nya. Menghapus salah satunya
      mengorbankan satu pihak: kunci mentah saja mengusir yang awam, label
      saja membuat lembarnya tak bisa diaudit terhadap sumbernya.
    */
    const kol = 3
    const lebarKol = W / kol
    const perKol = Math.ceil(b.input.length / kol)
    const yMulai = t.getY()
    let yTertinggi = yMulai
    for (let c = 0; c < kol; c++) {
      let yy = yMulai
      for (const it of b.input.slice(c * perKol, (c + 1) * perKol)) {
        const xKol = M + c * lebarKol
        doc.font('Helvetica').fontSize(7).fillColor(ABU)
          .text(amanUntukPdf(String(it.medan)), xKol, yy, { width: lebarKol * 0.55 })

        /* Nilai + satuannya. Angka tanpa satuan di lembar teknis adalah
           angka yang belum selesai — 300 bisa mm, bisa kN. */
        const nilaiTampil = it.satuan
          ? `${it.nilai} ${it.satuan}`
          : String(it.nilai)
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#111')
          .text(amanUntukPdf(nilaiTampil), xKol + lebarKol * 0.55, yy,
            { width: lebarKol * 0.42, align: 'right' })

        /* Kunci asli, sekecil mungkin — jejak ke sumber datanya. */
        doc.font('Helvetica').fontSize(5.2).fillColor('#9aa3ad')
          .text(amanUntukPdf(String(it.kunci)), xKol, yy + 7.4,
            { width: lebarKol * 0.9 })
        yy += 15
      }
      yTertinggi = Math.max(yTertinggi, yy)
    }
    t.setY(yTertinggi + 6)
  }

  /* ── Tabel PEMERIKSAAN ──────────────────────────────────────────────────── */
  if (b.periksa.length) {
    t.ruang(28)
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ABU)
      .text(amanUntukPdf(String('PEMERIKSAAN')), M, t.getY(), { width: W })
    t.setY(doc.y + 3)

    /* Kepala tabel. */
    const KOL = { nama: 0, nilai: 232, syarat: 300, satuan: 368, pakai: 410, hasil: 462 }
    const gambarKepala = () => {
      const yh = t.getY()
      doc.rect(M, yh, W, 13).fill('#f3f4f6')
      doc.font('Helvetica-Bold').fontSize(6.8).fillColor(ABU)
      doc.text(amanUntukPdf(String('PEMERIKSAAN')), M + 3, yh + 4, { width: KOL.nilai - 6 })
      doc.text(amanUntukPdf(String('NILAI')), M + KOL.nilai, yh + 4, { width: 62, align: 'right' })
      doc.text(amanUntukPdf(String('SYARAT')), M + KOL.syarat, yh + 4, { width: 62, align: 'right' })
      doc.text(amanUntukPdf(String('SAT.')), M + KOL.satuan, yh + 4, { width: 38 })
      doc.text(amanUntukPdf(String('TERPAKAI')), M + KOL.pakai, yh + 4, { width: 46, align: 'right' })
      doc.text(amanUntukPdf(String('HASIL')), M + KOL.hasil, yh + 4, { width: W - KOL.hasil - 3, align: 'right' })
      t.setY(yh + 14)
    }
    gambarKepala()

    for (const p of b.periksa) {
      /* Tinggi baris: nama + rumus di bawahnya. */
      doc.font('Helvetica').fontSize(7)
      const tinggiNama = doc.heightOfString(p.judulAwam ?? p.nama, { width: KOL.nilai - 6 })
      doc.font('Helvetica-Oblique').fontSize(6)
      const tinggiRumus = p.rumus
        ? doc.heightOfString(p.rumus, { width: W - 10 }) + 2 : 0
      const tinggiBaris = Math.max(tinggiNama, 9) + tinggiRumus + 5

      const sebelum = t.getY()
      t.ruang(tinggiBaris + 4)
      /* Kalau ganti halaman, kepala tabel digambar ulang. */
      if (t.getY() < sebelum) gambarKepala()

      const yb = t.getY()
      doc.font('Helvetica').fontSize(7).fillColor('#111')
        .text(amanUntukPdf(String(p.judulAwam ?? p.nama)), M + 3, yb + 1, { width: KOL.nilai - 6 })
      doc.font('Helvetica').fontSize(7).fillColor('#111')
        .text(num(p.nilai), M + KOL.nilai, yb + 1, { width: 62, align: 'right' })
      doc.text(num(p.syarat), M + KOL.syarat, yb + 1, { width: 62, align: 'right' })
      doc.fillColor(ABU).text(amanUntukPdf(String(p.satuan)), M + KOL.satuan, yb + 1, { width: 38 })
      doc.fillColor(warnaTingkat(p.tingkat))
        .text(amanUntukPdf(String(p.persen == null ? '—' : `${p.persen}%`)),
          M + KOL.pakai, yb + 1, { width: 46, align: 'right' })
      doc.font('Helvetica-Bold').fontSize(7)
        .fillColor(p.aman ? HIJAU : MERAH)
        .text(amanUntukPdf(String(p.aman ? 'OK' : 'TIDAK')), M + KOL.hasil, yb + 1,
          { width: W - KOL.hasil - 3, align: 'right' })

      /*
        RUMUS di bawah barisnya, bukan di lampiran terpisah.

        "Dari mana angka ini?" harus terjawab tanpa membalik halaman —
        pemeriksa yang harus mencari-cari akan berhenti memeriksa.
      */
      if (p.rumus) {
        doc.font('Helvetica-Oblique').fontSize(6).fillColor(ABU)
          .text(amanUntukPdf(String(p.rumus)), M + 8, yb + Math.max(tinggiNama, 9) + 1, { width: W - 14 })
      }

      const yAkhir = yb + tinggiBaris
      doc.moveTo(M, yAkhir).lineTo(M + W, yAkhir)
        .lineWidth(0.4).strokeColor(GARIS).stroke()
      t.setY(yAkhir + 1)
    }
    t.setY(t.getY() + 5)
  }

  /* ── VOLUME untuk RAB ───────────────────────────────────────────────────── */
  if (b.volume.length) {
    t.ruang(20)
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ABU)
      .text(amanUntukPdf(String('VOLUME UNTUK RAB')), M, t.getY(), { width: W })
    t.setY(doc.y + 3)
    for (const v of b.volume) {
      doc.font('Helvetica').fontSize(7.5).fillColor('#111')
        .text(amanUntukPdf(String(v.uraian)), M + 6, t.getY(), { width: 200 })
      doc.font('Helvetica-Bold').fontSize(7.5)
        .text(amanUntukPdf(`${num(v.nilai, 3)} ${v.satuan}`), M + 206, t.getY(),
          { width: 100, align: 'right' })
      t.setY(t.getY() + 10)
    }
    t.setY(t.getY() + 4)
  }

  /*
    ── DIAGRAM momen & geser: DIGAMBAR, bukan cuma dinyatakan

    Hanya untuk elemen yang momennya DIHITUNG dari beban. Elemen yang
    momennya diketik langsung tak punya bentuk yang pernah dihitung siapa
    pun — menggambarnya berarti mengarang bentuk di dokumen bertanda
    tangan.
  */
  if (b.diagram) gambarDiagramKeLembar(doc, t, b.diagram)

  /* ── GAMBAR: dinyatakan ada, tidak ditanam ──────────────────────────────── */
  if (b.gambar.length) {
    t.teksKecil(
      `Gambar kerja tersedia di aplikasi (${b.gambar.map((g) => g.judul).join(', ')}) — `
      + 'buka elemen ini di layar Analisa Struktur untuk melihatnya.',
      { warna: ABU, ukuran: 7 },
    )
  }

  /* ── CATATAN & BATAS per elemen ─────────────────────────────────────────── */
  if (b.catatan.length) {
    t.ruang(18)
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ABU)
      .text(amanUntukPdf(String('CATATAN & BATAS')), M, t.getY(), { width: W })
    t.setY(doc.y + 3)
    for (const c of b.catatan) {
      t.teksKecil(`• ${c}`, { warna: ABU, ukuran: 6.8 })
    }
  }

  t.setY(t.getY() + 10)
}

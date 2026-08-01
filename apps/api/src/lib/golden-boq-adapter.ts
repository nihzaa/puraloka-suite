/**
 * ADAPTER BoQ Excel → GoldenFixture (ROADMAP #17).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG SEBENARNYA DIBUKTIKAN DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Klaim "kemampuan sistem = Excel" selama ini hanya terbukti pada level HSP
 * per item — satu baris analisa, dibandingkan satu per satu. Yang belum pernah
 * dibuktikan: apakah SELURUH DOKUMEN RAB, dari item paling bawah sampai grand
 * total, menghasilkan angka yang sama.
 *
 * Perbedaannya bukan akademis. Kesalahan yang tak terlihat di level item bisa
 * menumpuk jadi jutaan di level dokumen: pembulatan yang berbeda arah,
 * subtotal yang dihitung dari angka bulat vs angka penuh, PPN dari basis yang
 * berbeda. Itulah yang membuat RAB sistem dan RAB Excel berselisih meski tiap
 * barisnya "kelihatan sama".
 *
 * ── Kenapa adapter, bukan fixture yang diketik
 *
 * RAB Cibuluh punya **147 baris item di 12 divisi**. Mengetiknya sebagai
 * fixture berarti menyalin 147 angka dengan tangan — dan satu salah ketik akan
 * membuat test gagal pada hal yang bukan cacat sistem, atau lebih buruk: LULUS
 * padahal salah, karena angka yang saya ketik kebetulan cocok dengan hasil
 * sistem yang keliru.
 *
 * Membaca langsung dari Excel menghapus kelas kesalahan itu sepenuhnya.
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * Adapter ini tidak MENGHITUNG apa pun. Ia hanya membaca angka yang tertulis
 * di Excel dan menyusunnya jadi bentuk yang bisa dibandingkan. Kalau ia ikut
 * menghitung, ia akan menghasilkan angka yang "sesuai harapan" dan test-nya
 * membandingkan sistem dengan dirinya sendiri — bukan dengan Excel.
 */

/** Bentuk baris mentah dari `sheet_to_json(..., { header: 1 })`. */
export type BarisExcel = Array<string | number | null | undefined>

/**
 * Peta kolom sheet BoQ.
 *
 * Diverifikasi langsung ke berkas (2026-08-01), bukan diasumsikan dari format
 * RAB pada umumnya — tiap kontraktor menata kolomnya sendiri, dan menebak di
 * sini berarti membaca angka dari kolom yang salah tanpa satu pun gejala.
 */
export const KOLOM_BOQ = {
  nomor: 0,      // "1", "2", … untuk item; "I.", "II." untuk divisi
  uraian: 2,
  volume: 13,
  satuan: 14,
  hargaSatuan: 15,  // juga memuat label "Sub Total   Rp." / "TOTAL :"
  jumlah: 16,
} as const

export interface ItemBoQ {
  /** Kode gabungan divisi+nomor, mis. "I.1" — unik sepanjang dokumen. */
  code: string
  divisi: string
  uraian: string
  volume: number
  satuan: string
  /** Harga satuan yang TERTULIS di Excel. */
  hargaSatuan: number
  /** Jumlah yang TERTULIS di Excel (bukan hasil kali ulang). */
  jumlah: number
  /** Baris asal di sheet — untuk melacak saat ada selisih. */
  baris: number
}

export interface DivisiBoQ {
  kode: string
  nama: string
  /** Subtotal yang TERTULIS di Excel. */
  subtotal: number
  items: ItemBoQ[]
}

export interface HasilBacaBoQ {
  divisi: DivisiBoQ[]
  /** TOTAL yang tertulis di Excel. */
  totalTertulis: number | null
  /** Jumlah item yang volumenya kosong — dilaporkan, bukan disembunyikan. */
  itemTanpaVolume: number
  /**
   * Baris yang PUNYA NILAI tapi berada di luar rentang `SUM()` subtotalnya.
   *
   * ⚠️ Ini bukan cacat pembacaan — ini **temuan pada dokumen sumbernya**.
   * RAB Cibuluh punya "Retaining Wall" senilai Rp 37,8 juta di baris 30–33,
   * sementara rumus subtotal divisi III berbunyi `=SUM(Q34:Q65)` — mulai dari
   * baris 34. Uangnya tertulis di dokumen tapi TIDAK ikut dijumlahkan.
   *
   * Bisa disengaja (pekerjaan dibatalkan tapi barisnya ditinggal) atau salah
   * ketik rentang saat menyisipkan baris. Yang tak boleh dilakukan sistem:
   * memutuskan sendiri mana yang benar. Ia melaporkan, founder yang memutuskan.
   */
  diLuarSubtotal: Array<{ divisi: string; uraian: string; nilai: number; baris: number }>
  /**
   * Catatan yang WAJIB ditampilkan bersama hasilnya. Berisi hal-hal yang
   * membuat perbandingan tidak bisa dianggap mutlak.
   */
  catatan: string[]
}

const angka = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const teks = (v: unknown): string => (v == null ? '' : String(v).trim())

/**
 * Baris divisi: nomornya angka romawi berakhir TITIK ("I.", "XII.").
 *
 * ⚠️ Titiknya WAJIB. Versi pertama memakai `/^[IVXLC]+\.?$/` — titik opsional —
 * dan itu menerima huruf `C` sebagai romawi 100. Di RAB nyata, `C` adalah
 * sub-kelompok "C. Kolom dan Balok" DI DALAM divisi III, dan salah
 * mengelompokkannya membuat subtotal divisi III terbaca Rp 0 sementara
 * sub-kelompok C mengklaim Rp 1,15 M yang bukan miliknya. Selisihnya
 * Rp 550 juta — dan itu bukan cacat Excel, melainkan cacat pembacaan.
 *
 * Pelajarannya: struktur RAB nyata lebih dalam dari yang diasumsikan
 * (divisi → sub-kelompok → item → sub-baris), dan pola yang "cukup untuk
 * contoh" akan menghasilkan angka yang salah pada dokumen sungguhan.
 */
function adalahDivisi(r: BarisExcel): boolean {
  const n = teks(r[KOLOM_BOQ.nomor])
  // Titik OPSIONAL — di RAB nyata ada `IX` dan `XIV` tanpa titik. Yang
  // membedakan divisi dari sub-kelompok bukan titiknya, melainkan PANJANG:
  // sub-kelompok selalu satu huruf (A, B, C, D). Romawi ≥2 huruf pasti divisi,
  // dan romawi 1 huruf yang sah (`I`, `V`, `X`) selalu ditulis bertitik di
  // dokumen ini — sementara `C` sub-kelompok tak pernah bertitik.
  if (teks(r[KOLOM_BOQ.uraian]).length === 0) return false
  if (/^[IVXL]{2,}\.?$/.test(n)) return true
  return /^[IVXL]\.$/.test(n)
}

/**
 * Baris sub-kelompok: nomornya SATU huruf kapital ("A", "B", "C").
 *
 * Sub-kelompok punya subtotalnya sendiri di RAB nyata, dan subtotal itu SUDAH
 * termasuk dalam subtotal divisi induknya. Menjumlahkan keduanya berarti
 * menghitung uang yang sama dua kali.
 */
function adalahSubKelompok(r: BarisExcel): boolean {
  const n = teks(r[KOLOM_BOQ.nomor])
  return /^[A-Z]$/.test(n) && teks(r[KOLOM_BOQ.uraian]).length > 0
}

/** Baris item: nomornya angka biasa DAN punya uraian. */
function adalahItem(r: BarisExcel): boolean {
  const n = r[KOLOM_BOQ.nomor]
  return (typeof n === 'number' || /^\d+$/.test(teks(n))) && teks(r[KOLOM_BOQ.uraian]).length > 0
}

/**
 * Sub-baris: TANPA nomor, tapi punya uraian & jumlah — mis. "- Pondasi Beton
 * K225" di bawah item "Retaining Wall W1".
 *
 * Inilah yang benar-benar membawa angka di divisi berstruktur dalam. Item
 * induknya sering kosong (ia cuma judul), jadi mengabaikan sub-baris berarti
 * kehilangan seluruh nilai divisi itu.
 */
function adalahSubBaris(r: BarisExcel): boolean {
  const n = teks(r[KOLOM_BOQ.nomor])
  // ⚠️ Uraian TIDAK diwajibkan. Versi pertama menuntutnya ada, dan itu membuang
  // baris 36–37 RAB Cibuluh — dua baris beruang Rp 109.337.202 yang kolom
  // uraiannya kosong karena teksnya ditulis di kolom lain (sel gabungan).
  // Selisihnya persis sebesar itu, dan gejalanya menyesatkan: subtotal divisi
  // III terlihat "meleset", seolah Excel yang salah.
  //
  // Yang menentukan sebuah baris membawa uang adalah NILAINYA, bukan apakah
  // ia sempat diberi nama.
  return n === '' && angka(r[KOLOM_BOQ.jumlah]) !== 0
}

/** Baris subtotal: kolom hargaSatuan memuat label "Sub Total". */
function adalahSubtotal(r: BarisExcel): boolean {
  return /sub\s*total/i.test(teks(r[KOLOM_BOQ.hargaSatuan]))
}

function adalahTotal(r: BarisExcel): boolean {
  return /^total\s*:?$/i.test(teks(r[KOLOM_BOQ.hargaSatuan]))
}

/**
 * Baca sheet BoQ jadi struktur divisi → item.
 *
 * Seluruh angka diambil APA ADANYA dari Excel. Yang dihitung ulang hanya
 * dilakukan di lapisan pembanding, bukan di sini.
 */
/**
 * Rentang baris yang benar-benar dijumlahkan subtotal, dibaca dari RUMUS Excel.
 *
 * ── Kenapa rumusnya, bukan posisinya
 *
 * Asumsi "subtotal menjumlahkan semua baris sejak judul divisi" TERBUKTI SALAH
 * di RAB nyata: subtotal divisi III berbunyi `=SUM(Q34:Q65)` padahal divisinya
 * dimulai baris 28. Lima baris pertama (Rp 37,8 juta) tak ikut.
 *
 * Membandingkan dengan asumsi berarti menuduh Excel meleset Rp 109 juta —
 * padahal Excel konsisten dengan rumusnya sendiri, dan yang keliru adalah
 * pembacaan kita. Uji paritas yang menuduh sumbernya salah lebih berbahaya
 * daripada tak ada uji sama sekali: ia melatih orang mengabaikan hasilnya.
 *
 * Kunci: nomor baris Excel (1-based) dari sel subtotal → { dari, sampai }.
 */
export function bacaRentangSubtotal(
  sheet: Record<string, { f?: string } | undefined>,
  kolomJumlah = KOLOM_BOQ.jumlah,
): Map<number, { dari: number; sampai: number }> {
  const peta = new Map<number, { dari: number; sampai: number }>()
  const huruf = String.fromCharCode(65 + kolomJumlah) // 16 → 'Q'
  for (const [addr, sel] of Object.entries(sheet)) {
    if (!addr.startsWith(huruf) || !sel?.f) continue
    // ⚠️ `[A-Z]+`, BUKAN `\w+`. `\w` mencakup ANGKA, jadi `\w+(\d+)` pada
    // "Q12" membuat `\w+` melahap "Q1" dan grup angka hanya menangkap "2".
    // Rentang jadi 2..7 alih-alih 12..17 — dan akibatnya SELURUH item terbuang
    // dari perbandingan, sementara laporannya terlihat rapi: "9 divisi, 0 item".
    // Kelas kesalahan yang paling berbahaya: regex yang cocok tapi salah.
    const m = /^SUM\([A-Z]+(\d+):[A-Z]+(\d+)\)$/i.exec(sel.f.trim())
    if (!m) continue
    const barisSel = Number(addr.slice(huruf.length))
    if (!Number.isFinite(barisSel)) continue
    peta.set(barisSel, { dari: Number(m[1]), sampai: Number(m[2]) })
  }
  return peta
}

export function bacaBoQ(
  rows: BarisExcel[],
  /**
   * Rentang SUM dari rumus Excel. Bila tak diberikan, adapter jatuh ke asumsi
   * posisi — dan asumsi itu SALAH pada dokumen berstruktur dalam. Karena itu
   * ketiadaannya dicatat sebagai keterbatasan, bukan didiamkan.
   */
  rentangSum?: Map<number, { dari: number; sampai: number }>,
): HasilBacaBoQ {
  const divisi: DivisiBoQ[] = []
  const catatan: string[] = []
  let aktif: DivisiBoQ | null = null
  let subKelompokAktif: string | null = null
  /** Divisi sudah punya subtotal — baris sesudahnya bukan miliknya lagi. */
  let ditutup = false
  let totalTertulis: number | null = null
  let tanpaVolume = 0
  const diLuarSubtotal: HasilBacaBoQ["diLuarSubtotal"] = []

  rows.forEach((r, i) => {
    if (!r || r.length === 0) return

    if (adalahDivisi(r)) {
      // Nomor divisi bisa GANDA di RAB nyata — dokumen ini punya `IV.` dua
      // kali (PEKERJAAN BAJA & PEKERJAAN PASANGAN, salah ketik yang tak
      // pernah diperbaiki). Kode dibuat unik dengan akhiran; tanpa itu, dua
      // divisi berbeda dianggap satu dan subtotalnya saling menimpa.
      const kodeMentah = teks(r[KOLOM_BOQ.nomor]).replace(/\.$/, '')
      const sudahAda = divisi.filter((d) => d.kode.replace(/#\d+$/, '') === kodeMentah).length
      if (sudahAda > 0) {
        catatan.push(
          `Nomor divisi "${kodeMentah}" muncul ${sudahAda + 1}× di Excel ` +
          `(baris ${i + 1}: ${teks(r[KOLOM_BOQ.uraian])}). Dibedakan otomatis; ` +
          'periksa penomoran dokumen aslinya.',
        )
      }
      aktif = {
        kode: sudahAda > 0 ? `${kodeMentah}#${sudahAda + 1}` : kodeMentah,
        nama: teks(r[KOLOM_BOQ.uraian]),
        subtotal: 0,
        items: [],
      }
      divisi.push(aktif)
      ditutup = false
      // Sub-kelompok tak boleh terbawa ke divisi berikutnya — kalau terbawa,
      // kode item di divisi baru akan menyandang huruf dari divisi lama.
      subKelompokAktif = null
      return
    }

    if (adalahSubtotal(r)) {
      if (!aktif) {
        catatan.push(`Baris ${i + 1}: subtotal tanpa divisi induk — format tak seperti yang diasumsikan.`)
        return
      }
      // Subtotal sub-kelompok DIABAIKAN: ia sudah tercakup di subtotal divisi
      // induknya. Menjumlahkan keduanya = menghitung uang yang sama dua kali.
      // Yang dipakai adalah subtotal TERAKHIR sebelum divisi berikutnya —
      // itulah subtotal divisi.
      aktif.subtotal = angka(r[KOLOM_BOQ.jumlah])
      // Rentang SUM dibaca dari rumus Excel — bukan diasumsikan dari posisi.
      // `i` 0-based, baris Excel 1-based.
      const rentang = rentangSum?.get(i + 1)
      if (rentang) {
        const luar = aktif.items.filter((it) => it.baris < rentang.dari || it.baris > rentang.sampai)
        for (const it of luar) {
          diLuarSubtotal.push({ divisi: aktif.kode, uraian: it.uraian, nilai: it.jumlah, baris: it.baris })
        }
        // Item di luar rentang DIBUANG dari divisi: Excel tak menghitungnya,
        // jadi membandingkan dengannya berarti membandingkan dua hal berbeda.
        // Nilainya tetap dilaporkan lewat `diLuarSubtotal`.
        aktif.items = aktif.items.filter((it) => it.baris >= rentang.dari && it.baris <= rentang.sampai)
      }
      subKelompokAktif = null
      // Divisi DITUTUP setelah subtotalnya. Baris ber-nilai yang muncul
      // sesudah ini — sebelum divisi berikutnya — TIDAK masuk hitungan Excel,
      // jadi tak boleh masuk hitungan kita.
      //
      // Bukan hipotetis: baris 68 "Kolom" berdiri di antara subtotal divisi
      // III dan judul divisi IV. Memasukkannya membuat subtotal III terlihat
      // meleset Rp 109 juta — padahal Excel-nya benar dan pembacaan kita yang
      // salah. Ini justru kelas kesalahan yang paling berbahaya di uji
      // paritas: menuduh sumber yang benar.
      ditutup = true
      return
    }

    if (adalahTotal(r)) {
      totalTertulis = angka(r[KOLOM_BOQ.jumlah])
      return
    }

    if (adalahSubKelompok(r)) {
      subKelompokAktif = teks(r[KOLOM_BOQ.nomor])
      return
    }

    // Item ATAU sub-baris — keduanya membawa angka. Di divisi berstruktur
    // dalam, item induk sering cuma judul (volume & jumlah kosong) dan yang
    // benar-benar bernilai adalah sub-barisnya.
    const bawaAngka = (adalahItem(r) || adalahSubBaris(r)) && aktif && !ditutup
    if (bawaAngka && aktif) {
      const vol = angka(r[KOLOM_BOQ.volume])
      const jml = angka(r[KOLOM_BOQ.jumlah])
      // Baris tanpa nilai sama sekali = judul, bukan item. Memasukkannya
      // membuat hitungan "94 item" menyesatkan.
      if (vol === 0 && jml === 0) { tanpaVolume++; return }

      const nomor = teks(r[KOLOM_BOQ.nomor])
      const prefiks = subKelompokAktif ? `${aktif.kode}${subKelompokAktif}` : aktif.kode
      aktif.items.push({
        code: `${prefiks}.${nomor || `b${i + 1}`}`,
        divisi: aktif.kode,
        uraian: teks(r[KOLOM_BOQ.uraian]),
        volume: vol,
        satuan: teks(r[KOLOM_BOQ.satuan]),
        hargaSatuan: angka(r[KOLOM_BOQ.hargaSatuan]),
        jumlah: jml,
        baris: i + 1,
      })
    }
  })

  if (tanpaVolume > 0) {
    catatan.push(
      `${tanpaVolume} item bervolume kosong (jumlahnya Rp 0). Ada di RAB nyata — ` +
      'pekerjaan yang dibatalkan atau belum diukur. Tak memengaruhi total.',
    )
  }

  if (diLuarSubtotal.length > 0) {
    const t = diLuarSubtotal.reduce((s, x) => s + x.nilai, 0)
    catatan.push(
      `${diLuarSubtotal.length} baris senilai Rp ${Math.round(t).toLocaleString('id-ID')} ` +
      'PUNYA nilai tapi berada DI LUAR rentang SUM subtotalnya — uangnya tertulis di ' +
      'dokumen tapi tak ikut dijumlahkan. Bisa disengaja (pekerjaan batal, barisnya ' +
      'ditinggal) atau salah ketik rentang saat menyisipkan baris. Periksa dokumen aslinya.',
    )
  }
  if (!rentangSum) {
    catatan.push(
      'Rentang SUM tak dibaca dari rumus Excel — perbandingan memakai ASUMSI posisi ' +
      '(semua baris sejak judul divisi). Asumsi itu terbukti salah pada dokumen ' +
      'berstruktur dalam; hasilnya bisa menuduh Excel meleset padahal tidak.',
    )
  }
  return { divisi, totalTertulis, itemTanpaVolume: tanpaVolume, diLuarSubtotal, catatan }
}

// ── Pembanding ──────────────────────────────────────────────────────────────

export interface SelisihBaris {
  level: 'item' | 'divisi' | 'total'
  label: string
  /** Angka yang tertulis di Excel. */
  excel: number
  /** Angka hasil perhitungan ulang dari komponennya. */
  hitung: number
  selisih: number
  lolos: boolean
  /** Lokasi di sheet, untuk ditelusuri. */
  baris?: number
}

export interface LaporanParitas {
  /** Seluruh pemeriksaan, termasuk yang lolos. */
  periksa: SelisihBaris[]
  jumlahPeriksa: number
  jumlahGagal: number
  /** Total selisih absolut — ukuran seberapa jauh, bukan sekadar lolos/tidak. */
  totalSelisihAbsolut: number
  lolos: boolean
  catatan: string[]
}

/**
 * Toleransi rupiah.
 *
 * 0,5 rupiah, bukan 0. Excel menyimpan hasil dalam biner floating-point, jadi
 * `126,72 × 127.190` bisa menghasilkan `...16,799999999` alih-alih `...16,8`.
 * Menuntut kesamaan bit-per-bit akan menghasilkan kegagalan yang bukan tentang
 * kebenaran, dan test yang gagal karena hal yang bukan cacat akan diabaikan
 * orang — itu jauh lebih berbahaya daripada toleransi setengah rupiah.
 */
export const TOLERANSI_RP = 0.5

/**
 * Periksa konsistensi internal dokumen Excel: apakah angka yang TERTULIS
 * konsisten dengan komponennya sendiri.
 *
 * ── Kenapa ini dilakukan SEBELUM membandingkan dengan sistem
 *
 * Kalau Excel-nya sendiri tak konsisten (subtotal ≠ jumlah item-nya), maka
 * "sistem berbeda dari Excel" jadi pernyataan yang tak bermakna — berbeda dari
 * yang mana? Pemeriksaan ini menetapkan apakah dokumen sumbernya layak
 * dijadikan acuan.
 *
 * Tiga level, dari bawah ke atas (GOLDEN-FILE-SPEC §D):
 *   1. item.jumlah  = volume × hargaSatuan
 *   2. divisi.subtotal = Σ item.jumlah
 *   3. total        = Σ divisi.subtotal
 */
export function periksaKonsistensi(hasil: HasilBacaBoQ): LaporanParitas {
  const periksa: SelisihBaris[] = []

  for (const d of hasil.divisi) {
    for (const it of d.items) {
      const hitung = it.volume * it.hargaSatuan
      const selisih = it.jumlah - hitung
      periksa.push({
        level: 'item',
        label: `${it.code} ${it.uraian.slice(0, 40)}`,
        excel: it.jumlah,
        hitung,
        selisih,
        lolos: Math.abs(selisih) <= TOLERANSI_RP,
        baris: it.baris,
      })
    }

    const jumlahItem = d.items.reduce((s, it) => s + it.jumlah, 0)
    const selisihDiv = d.subtotal - jumlahItem
    periksa.push({
      level: 'divisi',
      label: `${d.kode}. ${d.nama.slice(0, 40)}`,
      excel: d.subtotal,
      hitung: jumlahItem,
      selisih: selisihDiv,
      lolos: Math.abs(selisihDiv) <= TOLERANSI_RP,
    })
  }

  const jumlahDivisi = hasil.divisi.reduce((s, d) => s + d.subtotal, 0)
  if (hasil.totalTertulis != null) {
    const selisihTotal = hasil.totalTertulis - jumlahDivisi
    periksa.push({
      level: 'total',
      label: 'TOTAL BIAYA',
      excel: hasil.totalTertulis,
      hitung: jumlahDivisi,
      selisih: selisihTotal,
      lolos: Math.abs(selisihTotal) <= TOLERANSI_RP,
    })
  }

  const gagal = periksa.filter((p) => !p.lolos)
  return {
    periksa,
    jumlahPeriksa: periksa.length,
    jumlahGagal: gagal.length,
    totalSelisihAbsolut: Math.round(gagal.reduce((s, p) => s + Math.abs(p.selisih), 0) * 100) / 100,
    lolos: gagal.length === 0,
    catatan: hasil.catatan,
  }
}

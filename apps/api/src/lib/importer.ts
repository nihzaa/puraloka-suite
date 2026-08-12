/**
 * IMPORTER GENERIK — unggah → petakan → pratinjau → commit (TJS-P3).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ALL-OR-NOTHING, DAN APA YANG SALAH DENGAN YANG SUDAH ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `routes/v1/rab.ts` sudah punya importer Excel, dan bentuknya adalah persis
 * yang item ini hendak cegah: ia **menghapus data lama lebih dulu**, lalu
 * insert bertahap. Kalau gagal di tengah — satu baris rusak, satu constraint
 * menolak — data lama sudah hilang dan yang baru belum masuk.
 *
 * Yang dibangun di sini: satu transaksi. Berhasil seluruhnya, atau tak ada
 * yang berubah sama sekali.
 *
 * ── Kenapa pemetaan DETERMINISTIK, bukan AI
 *
 * Pemetaan kolom ("Nama Barang" → `name`) menggoda diserahkan ke model
 * bahasa. Tetapi impor terjadi sekali di awal onboarding, hasilnya menjadi
 * dasar seluruh data pelanggan, dan **kesalahannya tak terlihat**: kolom
 * harga yang salah dipetakan ke kolom stok menghasilkan angka yang wajar
 * di kedua tempat.
 *
 * Skor kemiripan bisa dijelaskan, diulang, dan dikoreksi. Model bahasa yang
 * menjawab berbeda pada dua unggahan identik tak bisa dipercaya untuk itu —
 * dan pengguna tak punya cara tahu ia berubah pikiran.
 *
 * Semua pemetaan otomatis di sini hanyalah USULAN. Yang menentukan tetap
 * orang yang mengunggah.
 */

/** Satu kolom target yang bisa diisi importer. */
export interface KolomTarget {
  kunci: string
  label: string
  jenis: 'teks' | 'angka' | 'tanggal' | 'bool'
  wajib: boolean
  /** Kata lain yang lazim dipakai di berkas orang. */
  alias?: string[]
}

export interface SkemaImpor {
  kunci: string
  label: string
  keterangan: string
  kolom: KolomTarget[]
}

/**
 * Menormalkan judul kolom untuk dibandingkan.
 *
 * Huruf kecil, tanpa tanda baca, spasi tunggal. "Nama Barang", "nama_barang",
 * dan "NAMA BARANG " harus dianggap sama — kalau tidak, satu berkas dari
 * Excel dan satu dari Google Sheets tak akan pernah cocok dengan aturan yang
 * sama.
 */
export function normalkan(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Skor kemiripan 0..1 antara judul kolom berkas dan sebuah kolom target.
 *
 * Bertingkat, dari yang paling meyakinkan ke yang paling longgar:
 *
 *   1.00  sama persis setelah dinormalkan
 *   0.95  cocok dengan salah satu alias
 *   0.80  salah satunya memuat yang lain seutuhnya
 *   0..0.7  proporsi kata yang sama
 *
 * Angka-angka ini KESEPAKATAN, bukan turunan dari apa pun — ditulis di satu
 * tempat supaya bisa diubah sekali, bukan tersebar sebagai konstanta ajaib.
 */
export function skorKemiripan(judulBerkas: string, kolom: KolomTarget): number {
  const a = normalkan(judulBerkas)
  if (!a) return 0

  const kandidat = [kolom.kunci, kolom.label, ...(kolom.alias ?? [])].map(normalkan)

  if (kandidat.includes(a)) {
    // Sama persis dengan kunci/label = 1; dengan alias = 0.95, supaya
    // kecocokan langsung selalu menang atas alias saat keduanya ada.
    const utama = [kolom.kunci, kolom.label].map(normalkan)
    return utama.includes(a) ? 1 : 0.95
  }

  for (const k of kandidat) {
    if (!k) continue
    if (a.includes(k) || k.includes(a)) return 0.8
  }

  const kataA = new Set(a.split(' ').filter(Boolean))
  let terbaik = 0
  for (const k of kandidat) {
    const kataK = k.split(' ').filter(Boolean)
    if (kataK.length === 0) continue
    const sama = kataK.filter((w) => kataA.has(w)).length
    // Dibagi jumlah kata TERBANYAK, bukan yang tersedikit: "nama" vs
    // "nama barang jadi" tak boleh dianggap 100% cocok hanya karena satu
    // katanya sama.
    const skor = sama / Math.max(kataK.length, kataA.size)
    if (skor > terbaik) terbaik = skor
  }
  // Dibatasi 0.7 supaya kecocokan kata tak pernah menyamai kecocokan penuh.
  return Math.min(terbaik, 0.7)
}

/** Ambang di bawah ini tak diusulkan sama sekali — tebakan lemah lebih buruk
 *  daripada tak menebak, karena ia terlihat seperti jawaban. */
export const AMBANG_USUL = 0.5

export interface UsulPemetaan {
  kolomBerkas: string
  kolomTarget: string | null
  skor: number
}

/**
 * Mengusulkan pemetaan tiap kolom berkas ke kolom target.
 *
 * Satu kolom target hanya boleh dipakai SEKALI. Tanpa aturan itu, berkas
 * dengan "Nama" dan "Nama Lengkap" akan memetakan keduanya ke `name`, dan
 * yang belakangan diam-diam menimpa yang pertama.
 */
export function usulkanPemetaan(
  judulBerkas: string[],
  skema: SkemaImpor,
): UsulPemetaan[] {
  const terpakai = new Set<string>()
  const hasil: UsulPemetaan[] = []

  // Diurutkan dari skor tertinggi supaya kecocokan terbaik memilih lebih
  // dulu — bukan yang kebetulan muncul di kolom paling kiri.
  //
  // Indeksnya dari `forEach`, BUKAN `indexOf` — berkas dengan dua kolom
  // berjudul sama akan membuat `indexOf` selalu menjawab indeks pertama,
  // sehingga kolom kedua tak pernah masuk daftar kandidat.
  //
  // ⚠ TIDAK TERTUTUP MUTATION TEST — dinyatakan, bukan disembunyikan.
  //
  // Mengembalikan `indexOf` tak membuat satu test pun merah, dan sebabnya
  // jujur: hasil akhirnya KEBETULAN sama. Kolom kedua yang tak masuk daftar
  // berakhir `pilihan.get(1) === undefined` → `kolomTarget: null`, yang
  // persis sama dengan hasil aturan "satu target hanya sekali".
  //
  // Dua jalan berbeda menuju jawaban yang sama, jadi tak ada masukan yang
  // bisa membedakannya dari luar. Yang membuatnya tetap layak diperbaiki:
  // begitu aturan "satu target sekali" kelak dilonggarkan (mis. mengizinkan
  // dua kolom berkas menulis ke target yang sama), `indexOf` akan mulai
  // salah — dan saat itu tak ada test yang menangkapnya.
  const semua: Array<{ i: number; kolom: string; skor: number }> = []
  judulBerkas.forEach((j, i) => {
    for (const k of skema.kolom) {
      const s = skorKemiripan(j, k)
      if (s >= AMBANG_USUL) semua.push({ i, kolom: k.kunci, skor: s })
    }
  })
  semua.sort((x, y) => y.skor - x.skor)

  const pilihan = new Map<number, { kolom: string; skor: number }>()
  for (const s of semua) {
    if (pilihan.has(s.i) || terpakai.has(s.kolom)) continue
    pilihan.set(s.i, { kolom: s.kolom, skor: s.skor })
    terpakai.add(s.kolom)
  }

  judulBerkas.forEach((j, i) => {
    const p = pilihan.get(i)
    hasil.push({
      kolomBerkas: j,
      kolomTarget: p?.kolom ?? null,
      skor: p?.skor ?? 0,
    })
  })

  return hasil
}

export interface GalatBaris {
  baris: number
  kolom: string | null
  pesan: string
}

export interface HasilValidasi {
  /** Baris yang siap ditulis — HANYA kalau `galat` kosong. */
  siap: Array<Record<string, unknown>>
  galat: GalatBaris[]
  /** Kolom wajib yang tak dipetakan ke mana pun. */
  wajibHilang: string[]
}

/**
 * Angka dari sel.
 *
 * `Number('')` adalah 0 — sel kosong akan diam-diam jadi nol, dan pada kolom
 * harga itu berarti barang gratis yang lolos seluruh validasi.
 */
export function angkaSel(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (s === '') return null
  // ── Format Indonesia vs Inggris, dan kenapa keduanya harus dibedakan
  //
  //   "1.250.000"     ID  → 1250000   (titik ribuan, tanpa desimal)
  //   "1.250.000,50"  ID  → 1250000.5 (titik ribuan, koma desimal)
  //   "1,250,000"     EN  → 1250000   (koma ribuan)
  //   "1250.5"        EN  → 1250.5    (titik desimal)
  //
  // Yang membedakan: pemisah TERAKHIR. Kalau ia diikuti tepat 1–2 digit dan
  // hanya muncul sekali, ia desimal; selain itu ia pemisah ribuan.
  //
  // Versi pertama hanya menangani kasus berkoma-desimal, sehingga
  // "1.250.000" jatuh ke cabang `replace(/,/g,'')` dan menghasilkan
  // `Number('1.250.000')` = NaN → null. Harga hilang seluruhnya, dan
  // validasi menolaknya sebagai "harus angka" — pesan yang membuat orang
  // mengira berkasnya salah, padahal parsernya.
  const punyaKoma = s.includes(',')
  const punyaTitik = s.includes('.')

  let bersih: string
  if (punyaKoma && punyaTitik) {
    // Yang muncul TERAKHIR adalah desimalnya.
    bersih = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')   // ID: 1.250.000,50
      : s.replace(/,/g, '')                      // EN: 1,250,000.50
  } else if (punyaKoma) {
    // Koma tunggal dengan 1–2 digit di belakang = desimal (ID).
    bersih = /^-?\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (punyaTitik) {
    // Titik tunggal dengan 1–2 digit = desimal (EN). Sisanya ribuan (ID).
    bersih = /^-?\d+\.\d{1,2}$/.test(s) ? s : s.replace(/\./g, '')
  } else {
    bersih = s
  }

  const n = Number(bersih)
  return Number.isFinite(n) ? n : null
}

const TANGGAL_ISO = /^\d{4}-\d{2}-\d{2}$/
const TANGGAL_ID = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/

/** Tanggal dari sel → `YYYY-MM-DD`, atau null kalau tak terbaca. */
export function tanggalSel(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '') return null
  if (TANGGAL_ISO.test(s)) return s
  const m = s.match(TANGGAL_ID)
  if (m) {
    const [, d, bl, th] = m
    const dd = d.padStart(2, '0')
    const mm = bl.padStart(2, '0')
    // Dibaca sebagai hari/bulan/tahun — format yang dipakai di Indonesia.
    // Ambiguitas 03/04/2026 tak bisa diselesaikan dari datanya sendiri;
    // memilih satu tafsir dan MENULISKANNYA lebih baik daripada menebak
    // per-baris, yang menghasilkan berkas dengan dua tafsir sekaligus.
    if (Number(mm) < 1 || Number(mm) > 12) return null
    if (Number(dd) < 1 || Number(dd) > 31) return null
    return `${th}-${mm}-${dd}`
  }
  return null
}

/** Bool dari sel — menerima kata yang lazim dipakai orang. */
export function boolSel(v: unknown): boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === '') return null
  if (['ya', 'y', 'true', '1', 'aktif', 'iya'].includes(s)) return true
  if (['tidak', 't', 'false', '0', 'nonaktif', 'no'].includes(s)) return false
  return null
}

/**
 * Memvalidasi seluruh baris terhadap skema + pemetaan.
 *
 * ── TIDAK menulis apa pun
 *
 * Fungsi ini murni: ia membaca dan mengembalikan hasil. Itu kriteria yang
 * diminta item TJS-P3 — validasi yang menulis ke tabel target berarti
 * "pratinjau" sudah mengubah data, dan membatalkannya menuntut menghapus
 * yang baru saja masuk.
 *
 * ── Semua galat dikumpulkan, bukan berhenti di yang pertama
 *
 * Berhenti di galat pertama membuat pengguna memperbaiki berkas 40 baris
 * dalam 40 putaran unggah. Yang dikembalikan: seluruh galat sekaligus.
 */
export function validasi(
  baris: Array<Record<string, unknown>>,
  skema: SkemaImpor,
  pemetaan: Record<string, string>,
): HasilValidasi {
  const galat: GalatBaris[] = []
  const siap: Array<Record<string, unknown>> = []

  // Kolom target → kolom berkas (dibalik dari pemetaan yang dikirim UI).
  const targetKe = new Map<string, string>()
  for (const [berkas, target] of Object.entries(pemetaan)) {
    if (target) targetKe.set(target, berkas)
  }

  const wajibHilang = skema.kolom
    .filter((k) => k.wajib && !targetKe.has(k.kunci))
    .map((k) => k.label)

  if (wajibHilang.length > 0) {
    // Tak ada gunanya memvalidasi baris kalau kolom wajibnya tak dipetakan —
    // seluruh baris akan gagal dengan pesan yang sama.
    return { siap: [], galat: [], wajibHilang }
  }

  baris.forEach((b, i) => {
    const nomor = i + 2   // +2: baris 1 judul, dan orang menghitung dari 1
    const keluar: Record<string, unknown> = {}

    for (const k of skema.kolom) {
      const asal = targetKe.get(k.kunci)
      if (!asal) continue
      const mentah = b[asal]

      if (k.jenis === 'angka') {
        const n = angkaSel(mentah)
        if (n === null) {
          if (k.wajib) galat.push({ baris: nomor, kolom: k.label, pesan: 'harus angka dan tak boleh kosong' })
        } else keluar[k.kunci] = n
        continue
      }
      if (k.jenis === 'tanggal') {
        const t = tanggalSel(mentah)
        if (t === null) {
          if (k.wajib) galat.push({ baris: nomor, kolom: k.label, pesan: 'tanggal tak terbaca (pakai YYYY-MM-DD atau DD/MM/YYYY)' })
        } else keluar[k.kunci] = t
        continue
      }
      if (k.jenis === 'bool') {
        const v = boolSel(mentah)
        if (v === null) {
          if (k.wajib) galat.push({ baris: nomor, kolom: k.label, pesan: 'isi Ya atau Tidak' })
        } else keluar[k.kunci] = v
        continue
      }

      const s = mentah === null || mentah === undefined ? '' : String(mentah).trim()
      if (s === '') {
        if (k.wajib) galat.push({ baris: nomor, kolom: k.label, pesan: 'wajib diisi' })
      } else keluar[k.kunci] = s
    }

    siap.push(keluar)
  })

  // `siap` HANYA dipakai kalau nol galat — dikembalikan apa adanya supaya
  // pratinjau bisa menampilkan hasil parsing meski ada galat, tanpa
  // pemanggil pernah tergoda menulisnya.
  return { siap, galat, wajibHilang }
}

/** Batas baris per impor. Bukan kesopanan — satu transaksi raksasa mengunci
 *  tabel dan membuat seluruh aplikasi menunggu. */
export const BATAS_BARIS = 5000

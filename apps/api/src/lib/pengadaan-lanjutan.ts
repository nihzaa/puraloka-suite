// PENGADAAN LANJUTAN — kontrak payung, expediting, nota kredit. PURE.
//
// ════════════════════════════════════════════════════════════════════════════
// EMPAT HAL YANG MODUL INI TOLAK TAMPILKAN SEBAGAI KABAR BAIK
// ════════════════════════════════════════════════════════════════════════════
//
// 1. **Kontrak payung "aktif" yang kuotanya sudah habis.** Statusnya hijau,
//    sisa kuotanya nol. PO berikutnya akan ditarik di luar harga kontrak —
//    dan itu baru ketahuan saat tagihannya datang dengan harga berbeda.
//
// 2. **Keterlambatan yang dihitung dari JANJI VENDOR, bukan kebutuhan kita.**
//    Vendor menjanjikan tanggal 20, kita butuh tanggal 10. Barang datang
//    tanggal 20 = "tepat janji" dan telat 10 hari sekaligus. Yang menentukan
//    pekerjaan berhenti atau tidak adalah yang KEDUA.
//
// 3. **Nota kredit yang disetujui tapi tak pernah diterapkan.** Potongannya
//    disepakati, tagihan penuh tetap dibayar. Uangnya hilang dengan seluruh
//    persetujuan lengkap — dan tak ada satu pun kolom yang berteriak.
//
// 4. **Rata-rata keterlambatan yang menelan satu barang tertahan.** Sembilan
//    PO tepat waktu dan satu tertahan tiga minggu punya rata-rata 2 hari.
//    Yang menghentikan pekerjaan adalah yang satu itu.

/** Ubah NUMERIC-dari-Postgres (string) atau number jadi number. */
function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Selisih hari `dari` → `sampai` (positif bila `sampai` di masa depan). */
function selisihHari(dari: string, sampai: string): number {
  const a = new Date(dari.slice(0, 10) + 'T00:00:00Z').getTime()
  const b = new Date(sampai.slice(0, 10) + 'T00:00:00Z').getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

// ── Kontrak payung ──────────────────────────────────────────────────────────

export interface ItemPayung {
  id: string
  uraian: string
  satuan: string
  harga_satuan: number | string
  kuota: number | string
  terpakai?: number | string | null
}

export interface KontrakPayung {
  id: string
  nomor: string
  judul?: string | null
  supplier_id?: string | null
  pemasok_nama?: string | null
  berlaku_dari: string
  berlaku_sampai: string
  pagu_nilai?: number | string | null
  status: string
  item?: ItemPayung[]
}

/** Sisa kuota di bawah persen ini disebut "hampir habis". */
export const AMBANG_KUOTA_TIPIS = 0.15

/** Hari sebelum kedaluwarsa saat kontrak mulai disebut "segera berakhir". */
export const AMBANG_PAYUNG_SEGERA = 30

export interface HasilItemPayung extends ItemPayung {
  sisa: number
  /** Persen terpakai 0-100. */
  persenTerpakai: number
  habis: boolean
  hampirHabis: boolean
  /** Nilai yang sudah ditarik (terpakai × harga). */
  nilaiTerpakai: number
}

export type StatusPayung =
  | 'aktif'
  | 'kuota_habis'
  | 'segera_berakhir'
  | 'kedaluwarsa'
  | 'belum_mulai'
  | 'tak_aktif'

export interface HasilPayung extends KontrakPayung {
  statusNyata: StatusPayung
  sisaHari: number | null
  itemDinilai: HasilItemPayung[]
  /** Nilai seluruh penarikan. */
  nilaiTerpakai: number
  /** Sisa pagu nilai. `null` bila kontrak tak berpagu nilai. */
  sisaPagu: number | null
  /**
   * `true` bila status tersimpan 'aktif' TAPI kuota/pagu sudah habis atau
   * masa berlakunya lewat.
   *
   * PO berikutnya akan ditarik di luar harga kontrak, dan itu baru ketahuan
   * saat tagihannya datang dengan harga berbeda.
   */
  aktifTapiTakBisaDipakai: boolean
}

export function nilaiKontrakPayung(
  daftar: KontrakPayung[],
  hariIni: string,
): { kontrak: HasilPayung[]; aktif: number; kuotaHabis: number; segeraBerakhir: number; aktifTapiTakBisaDipakai: number } {
  const hasil: HasilPayung[] = daftar.map((k) => {
    const itemDinilai: HasilItemPayung[] = (k.item ?? []).map((i) => {
      const kuota = angka(i.kuota) ?? 0
      const terpakai = angka(i.terpakai) ?? 0
      const harga = angka(i.harga_satuan) ?? 0
      const sisa = Math.round((kuota - terpakai) * 1000) / 1000
      return {
        ...i,
        sisa,
        persenTerpakai: kuota > 0 ? Math.round((terpakai / kuota) * 1000) / 10 : 0,
        habis: sisa <= 0,
        hampirHabis: sisa > 0 && kuota > 0 && sisa / kuota <= AMBANG_KUOTA_TIPIS,
        nilaiTerpakai: Math.round(terpakai * harga),
      }
    })

    const nilaiTerpakai = itemDinilai.reduce((s, i) => s + i.nilaiTerpakai, 0)
    const pagu = angka(k.pagu_nilai)
    const sisaPagu = pagu == null ? null : Math.round(pagu - nilaiTerpakai)

    const sisaHari = selisihHari(hariIni, k.berlaku_sampai)
    const belumMulai = selisihHari(hariIni, k.berlaku_dari) > 0

    // SELURUH item habis = kuota habis. Satu item habis belum tentu:
    // kontrak bisa memuat sepuluh material, dan sembilan masih tersedia.
    const semuaHabis = itemDinilai.length > 0 && itemDinilai.every((i) => i.habis)
    const paguHabis = sisaPagu != null && sisaPagu <= 0

    let statusNyata: StatusPayung
    if (k.status !== 'aktif' && k.status !== 'habis') statusNyata = 'tak_aktif'
    else if (sisaHari < 0) statusNyata = 'kedaluwarsa'
    else if (semuaHabis || paguHabis) statusNyata = 'kuota_habis'
    else if (belumMulai) statusNyata = 'belum_mulai'
    else if (sisaHari <= AMBANG_PAYUNG_SEGERA) statusNyata = 'segera_berakhir'
    else statusNyata = 'aktif'

    return {
      ...k,
      statusNyata,
      sisaHari,
      itemDinilai,
      nilaiTerpakai,
      sisaPagu,
      aktifTapiTakBisaDipakai:
        k.status === 'aktif' && (sisaHari < 0 || semuaHabis || paguHabis),
    }
  })

  return {
    kontrak: hasil,
    aktif: hasil.filter((k) => k.statusNyata === 'aktif').length,
    kuotaHabis: hasil.filter((k) => k.statusNyata === 'kuota_habis').length,
    segeraBerakhir: hasil.filter((k) => k.statusNyata === 'segera_berakhir').length,
    aktifTapiTakBisaDipakai: hasil.filter((k) => k.aktifTapiTakBisaDipakai).length,
  }
}

/**
 * Bisakah PO menarik `jumlah` dari item kontrak ini?
 *
 * Dipakai SEBELUM menyimpan. Constraint DB menolak `terpakai > kuota`, tapi
 * pesan galatnya (23514) tak memberi tahu sisa berapa — dan yang mengisi
 * form butuh angkanya, bukan penolakan.
 */
export function bolehTarikKuota(
  item: ItemPayung,
  jumlah: number | string,
): { boleh: boolean; sisa: number; alasan: string | null } {
  const kuota = angka(item.kuota) ?? 0
  const terpakai = angka(item.terpakai) ?? 0
  const minta = angka(jumlah) ?? 0
  const sisa = Math.round((kuota - terpakai) * 1000) / 1000

  if (minta <= 0) {
    return { boleh: false, sisa, alasan: 'Jumlah penarikan harus lebih dari nol' }
  }
  if (minta > sisa) {
    return {
      boleh: false, sisa,
      alasan: `Sisa kuota ${item.uraian} tinggal ${sisa} ${item.satuan} — permintaan ${minta} melebihinya`,
    }
  }
  return { boleh: true, sisa, alasan: null }
}

// ── Expediting ──────────────────────────────────────────────────────────────

export interface Expediting {
  id: string
  po_id: string
  po_number?: string | null
  pemasok_nama?: string | null
  status: string
  /** Tanggal yang DIBUTUHKAN (dari PO). */
  butuh_tanggal?: string | null
  /** Tanggal yang DIJANJIKAN vendor. */
  janji_vendor?: string | null
  perkiraan_tiba?: string | null
  tiba_aktual?: string | null
  lokasi_terkini?: string | null
  sebab_tertahan?: string | null
}

/** Hari telat sebelum sebuah kiriman disebut KRITIS. */
export const AMBANG_TELAT_KRITIS = 7

export interface HasilExpediting extends Expediting {
  /**
   * Telat terhadap KEBUTUHAN kita — bukan terhadap janji vendor.
   *
   * Negatif = masih ada waktu. Inilah angka yang menentukan pekerjaan
   * berhenti atau tidak.
   */
  telatHari: number | null
  /**
   * Telat terhadap JANJI VENDOR. Dibawa terpisah karena ini percakapan yang
   * berbeda: vendor yang menepati janjinya tapi janjinya sudah terlambat
   * sejak awal bukan vendor yang mengecewakan — yang salah penjadwalannya.
   */
  telatDariJanji: number | null
  /** Vendor menjanjikan tanggal yang SUDAH lebih lambat dari kebutuhan. */
  janjiSudahTelat: boolean
  kritis: boolean
  sudahTiba: boolean
}

export function nilaiExpediting(
  daftar: Expediting[],
  hariIni: string,
): {
  kiriman: HasilExpediting[]
  telat: number
  kritis: number
  tertahan: number
  janjiSudahTelat: number
  /** Telat TERPARAH, bukan rata-rata. */
  telatTerparah: number | null
} {
  const hasil: HasilExpediting[] = daftar.map((e) => {
    const sudahTiba = e.status === 'tiba' && !!e.tiba_aktual
    // Acuan pembanding: tanggal tiba kalau sudah tiba, kalau belum hari ini.
    const acuan = sudahTiba ? e.tiba_aktual! : (e.perkiraan_tiba ?? hariIni)

    const telatHari = e.butuh_tanggal ? selisihHari(e.butuh_tanggal, acuan) : null
    const telatDariJanji = e.janji_vendor ? selisihHari(e.janji_vendor, acuan) : null

    const janjiSudahTelat =
      !!e.butuh_tanggal && !!e.janji_vendor &&
      selisihHari(e.butuh_tanggal, e.janji_vendor) > 0

    return {
      ...e,
      telatHari,
      telatDariJanji,
      janjiSudahTelat,
      // Yang sudah tiba tak bisa "kritis" lagi — keterlambatannya sudah
      // terjadi dan tercatat, bukan sesuatu yang masih bisa dikejar.
      kritis: !sudahTiba && telatHari != null && telatHari >= AMBANG_TELAT_KRITIS,
      sudahTiba,
    }
  })

  const telatBelumTiba = hasil.filter((e) => !e.sudahTiba && (e.telatHari ?? 0) > 0)

  return {
    kiriman: hasil,
    telat: telatBelumTiba.length,
    kritis: hasil.filter((e) => e.kritis).length,
    tertahan: hasil.filter((e) => e.status === 'tertahan').length,
    janjiSudahTelat: hasil.filter((e) => e.janjiSudahTelat).length,
    // TERPARAH, bukan rata-rata: sembilan PO tepat waktu dan satu tertahan
    // tiga minggu punya rata-rata 2 hari — dan yang menghentikan pekerjaan
    // adalah yang satu itu.
    telatTerparah: telatBelumTiba.length
      ? Math.max(...telatBelumTiba.map((e) => e.telatHari ?? 0))
      : null,
  }
}

// ── Nota kredit ─────────────────────────────────────────────────────────────

export interface NotaKredit {
  id: string
  nomor: string
  tanggal?: string | null
  jenis: string
  jumlah: number | string
  status: string
  supplier_id?: string | null
  pemasok_nama?: string | null
  supplier_invoice_id?: string | null
  diputuskan_pada?: string | null
  diterapkan_pada?: string | null
}

/** Hari sesudah disetujui sebelum nota kredit disebut MENGGANTUNG. */
export const AMBANG_KREDIT_MENGGANTUNG = 14

export interface HasilNotaKredit extends NotaKredit {
  jumlahAngka: number
  /** Hari sejak disetujui. `null` bila belum diputuskan. */
  umurSetujuHari: number | null
  /**
   * Disetujui, belum diterapkan, dan sudah lewat ambang.
   *
   * Potongannya disepakati tapi tagihan penuh tetap dibayar — uang hilang
   * dengan seluruh persetujuan lengkap, dan tak satu pun kolom berteriak.
   */
  menggantung: boolean
}

export function nilaiNotaKredit(
  daftar: NotaKredit[],
  hariIni: string,
): {
  nota: HasilNotaKredit[]
  totalDisetujui: number
  totalDiterapkan: number
  /** Nilai yang disetujui TAPI belum mengurangi tagihan. */
  nilaiMenggantung: number
  menggantung: number
} {
  const hasil: HasilNotaKredit[] = daftar.map((n) => {
    const umur = n.diputuskan_pada
      ? selisihHari(n.diputuskan_pada, hariIni)
      : null

    return {
      ...n,
      jumlahAngka: angka(n.jumlah) ?? 0,
      umurSetujuHari: umur,
      menggantung:
        n.status === 'disetujui' &&
        !n.diterapkan_pada &&
        umur != null &&
        umur >= AMBANG_KREDIT_MENGGANTUNG,
    }
  })

  const disetujui = hasil.filter((n) => n.status === 'disetujui' || n.status === 'diterapkan')
  const diterapkan = hasil.filter((n) => n.status === 'diterapkan')
  const gantung = hasil.filter((n) => n.menggantung)

  return {
    nota: hasil,
    totalDisetujui: Math.round(disetujui.reduce((s, n) => s + n.jumlahAngka, 0)),
    totalDiterapkan: Math.round(diterapkan.reduce((s, n) => s + n.jumlahAngka, 0)),
    nilaiMenggantung: Math.round(gantung.reduce((s, n) => s + n.jumlahAngka, 0)),
    menggantung: gantung.length,
  }
}

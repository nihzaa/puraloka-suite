/**
 * RANTAI KONTRAK — LD arah kontraktor, EOT, dan register jaminan (ROADMAP #16).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUKAN "TINGGAL PAKAI penalty engine 091"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 091 membangun mesin denda yang **arahnya berlawanan**: denda untuk
 * KLIEN yang telat MEMBAYAR invoice. Yang dibutuhkan tender pemerintah adalah
 * kebalikannya — *liquidated damages* untuk KONTRAKTOR yang telat MENYELESAIKAN
 * pekerjaan. Uang mengalir ke arah yang berbeda, pihak yang dirugikan berbeda,
 * dan yang paling penting: **dasar perhitungannya berbeda.**
 *
 * Denda telat bayar dihitung dari tanggal jatuh tempo invoice, yang tetap.
 * LD dihitung dari tanggal selesai kontrak, yang BISA BERGESER secara sah lewat
 * EOT (*extension of time*) — perpanjangan waktu karena hal di luar kendali
 * kontraktor: cuaca ekstrem, keterlambatan lahan, perubahan lingkup dari
 * pemberi kerja.
 *
 * Itulah sebabnya EOT tak bisa dipisah dari LD. Menghitung LD dari `end_date`
 * mentah berarti **menagih denda atas keterlambatan yang sudah dimaafkan
 * secara kontraktual** — dan itu bukan sekadar angka salah, itu tagihan yang
 * tak bisa dipertahankan di hadapan pemberi kerja.
 *
 * ── Yang DIPAKAI ULANG dari 091
 *
 * `daysLateWIB()` dan pola `resolve*Terms()` netral arah — keduanya murni
 * aritmetika kalender WIB dan COALESCE override. Dipakai ulang, tidak ditulis
 * ulang. Yang baru hanyalah: tanggal efektif dari EOT, dan basis LD.
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * EOT `diajukan` TIDAK menggeser tanggal. Hanya yang `disetujui` yang berlaku.
 * Kalau pengajuan sudah cukup untuk menunda denda, tiap kontraktor yang telat
 * tinggal mengajukan EOT dan dendanya berhenti — mekanismenya jadi tak berarti.
 */

import { daysLateWIB } from './penalty.js'

// ── EOT ─────────────────────────────────────────────────────────────────────

export type StatusEOT = 'diajukan' | 'disetujui' | 'ditolak'

export interface BarisEOT {
  id?: string
  /** Tambahan hari kalender. Boleh 0 (EOT yang disetujui tanpa tambahan hari). */
  hariTambahan: number
  status: StatusEOT
  /** Tanggal keputusan; hanya informatif untuk urutan. */
  tanggalKeputusan?: string | null
}

export interface HasilTanggalEfektif {
  /** Tanggal kontrak asli, tak pernah berubah. */
  tanggalAsli: string
  /** Tanggal setelah seluruh EOT yang DISETUJUI. */
  tanggalEfektif: string
  /** Total hari yang ditambahkan oleh EOT disetujui. */
  totalHariEOT: number
  /** Berapa pengajuan yang masih menggantung — penting ditampilkan bersama LD. */
  eotMenggantung: number
}

function keHariEpoch(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000)
}

function dariHariEpoch(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Tanggal selesai EFEKTIF = tanggal kontrak + seluruh EOT yang DISETUJUI.
 *
 * Pengajuan yang masih `diajukan` tidak menggeser apa pun, tapi jumlahnya
 * dikembalikan supaya UI bisa menyatakan "denda ini dihitung dengan 2 pengajuan
 * EOT belum diputus" — angka LD yang benar hari ini bisa berubah besok, dan
 * menyembunyikan itu membuat orang menagih terlalu dini.
 */
export function tanggalSelesaiEfektif(
  tanggalKontrak: string,
  daftarEOT: BarisEOT[],
): HasilTanggalEfektif {
  const disetujui = daftarEOT.filter((e) => e.status === 'disetujui')
  // Hari negatif diabaikan, bukan dikurangi: EOT adalah PERPANJANGAN. Nilai
  // negatif berarti salah input, dan memajukan tenggat diam-diam akan
  // MENAMBAH denda — kerugian yang muncul dari kesalahan ketik.
  const total = disetujui.reduce((s, e) => s + Math.max(0, Math.trunc(e.hariTambahan || 0)), 0)

  return {
    tanggalAsli: tanggalKontrak.slice(0, 10),
    tanggalEfektif: dariHariEpoch(keHariEpoch(tanggalKontrak) + total),
    totalHariEOT: total,
    eotMenggantung: daftarEOT.filter((e) => e.status === 'diajukan').length,
  }
}

// ── Liquidated Damages (arah kontraktor) ────────────────────────────────────

/**
 * Dasar perhitungan LD.
 *
 * `nilai_kontrak` — praktik Perpres 12/2021 untuk kontrak lump-sum:
 *   1‰ per hari dari nilai kontrak, maksimum 5%.
 * `sisa_pekerjaan` — dipakai bila bagian yang selesai sudah diserahterimakan;
 *   dendanya proporsional terhadap yang BELUM selesai saja.
 */
export type BasisLD = 'nilai_kontrak' | 'sisa_pekerjaan'

export interface SyaratLD {
  aktif: boolean
  basis: BasisLD
  /** Fraksi per hari. 0.001 = 1‰ — konvensi seragam `financial_config`. */
  tarifPerHari: number
  /** Batas atas sebagai fraksi dari basis. 0.05 = 5%. */
  batasPct: number
  /** Hari tenggang sebelum denda mulai berjalan. */
  hariTenggang: number
}

export interface SyaratLDOverride {
  aktif?: boolean | null
  basis?: BasisLD | null
  tarifPerHari?: number | null
  batasPct?: number | null
  hariTenggang?: number | null
}

/** Syarat efektif = override proyek per-field bila ada, selain itu global. */
export function resolveSyaratLD(
  override: SyaratLDOverride | null | undefined,
  global: SyaratLD,
): SyaratLD {
  const o = override ?? {}
  return {
    aktif:        o.aktif        ?? global.aktif,
    basis:        o.basis        ?? global.basis,
    tarifPerHari: o.tarifPerHari ?? global.tarifPerHari,
    batasPct:     o.batasPct     ?? global.batasPct,
    hariTenggang: o.hariTenggang ?? global.hariTenggang,
  }
}

export interface InputLD {
  syarat: SyaratLD
  /** Nilai kontrak (sesudah CO disetujui — pemanggil yang meresolusi). */
  nilaiKontrak: number
  /** Progres fisik 0..100, dipakai bila basis = sisa_pekerjaan. */
  progressPct: number
  /** Tanggal kontrak asli. */
  tanggalKontrak: string
  /** Seluruh EOT proyek ini. */
  daftarEOT: BarisEOT[]
  /** Tanggal acuan: tanggal serah terima (otoritatif) atau hari ini (estimasi). */
  tanggalAcuan: string
  /** Denda diputihkan? Pemutihan butuh alasan + audit di lapisan API. */
  diputihkan?: boolean
}

export interface HasilLD {
  /** `true` bila ada denda yang benar-benar terhitung. */
  adaDenda: boolean
  hariTelat: number
  /** Nilai yang dijadikan dasar. */
  dasarPerhitungan: number
  /** Denda sebelum dibatasi. */
  dendaSebelumBatas: number
  /** Batas atas nominal. */
  batasNominal: number
  /** Denda final = min(sebelum batas, batas). */
  denda: number
  /** `true` bila denda menyentuh batas — sinyal kontrak layak diputus. */
  kenaBatas: boolean
  tanggal: HasilTanggalEfektif
  /** Kenapa dendanya nol / tak dihitung — supaya "0" tak ambigu. */
  alasan: string | null
}

const bulat2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number | null | undefined) => Number(v ?? 0) || 0

/**
 * Hitung LD. Fungsi yang SAMA dipakai untuk angka otoritatif (saat serah
 * terima) dan estimasi tampilan — bedanya hanya `tanggalAcuan`. Dua fungsi
 * berbeda akan menghasilkan dua angka berbeda untuk hal yang sama, dan
 * perbedaan itu selalu ditemukan pada saat paling buruk.
 */
export function hitungLD(input: InputLD): HasilLD {
  const tanggal = tanggalSelesaiEfektif(input.tanggalKontrak, input.daftarEOT)
  const kosong = (alasan: string): HasilLD => ({
    adaDenda: false, hariTelat: 0, dasarPerhitungan: 0,
    dendaSebelumBatas: 0, batasNominal: 0, denda: 0, kenaBatas: false,
    tanggal, alasan,
  })

  if (!input.syarat.aktif) return kosong('Denda keterlambatan tidak diaktifkan untuk proyek ini')
  if (input.diputihkan) return kosong('Denda diputihkan (waiver)')

  const hariTelat = daysLateWIB(
    tanggal.tanggalEfektif, input.tanggalAcuan, input.syarat.hariTenggang)
  if (hariTelat <= 0) {
    return kosong(
      tanggal.totalHariEOT > 0
        // Menyebut EOT-nya penting: tanpa itu pemberi kerja melihat "tidak
        // telat" pada proyek yang jelas lewat tanggal kontrak aslinya.
        ? `Tidak telat terhadap tanggal efektif ${tanggal.tanggalEfektif} (asli ${tanggal.tanggalAsli} + ${tanggal.totalHariEOT} hari EOT disetujui)`
        : 'Tidak melewati tanggal selesai kontrak',
    )
  }

  const kontrak = num(input.nilaiKontrak)
  const dasar = input.syarat.basis === 'sisa_pekerjaan'
    // Progres dijepit 0..100: nilai di luar itu menghasilkan dasar negatif
    // (denda negatif = kontraktor DIBAYAR karena telat) atau melebihi kontrak.
    ? bulat2(kontrak * (100 - Math.min(100, Math.max(0, num(input.progressPct)))) / 100)
    : kontrak

  if (dasar <= 0) {
    return {
      ...kosong('Pekerjaan sudah 100% selesai — tak ada sisa yang bisa didenda'),
      hariTelat, tanggal,
    }
  }

  const sebelumBatas = bulat2(dasar * num(input.syarat.tarifPerHari) * hariTelat)
  // Batas dihitung dari NILAI KONTRAK, bukan dari `dasar`. Kalau tidak, basis
  // sisa_pekerjaan akan punya batas yang menyusut seiring progres — makin
  // dekat selesai, makin kecil batas dendanya. Praktiknya kebalikan: batas 5%
  // adalah 5% dari nilai kontrak, titik.
  const batas = bulat2(kontrak * num(input.syarat.batasPct))
  const denda = batas > 0 ? Math.min(sebelumBatas, batas) : sebelumBatas

  return {
    adaDenda: denda > 0,
    hariTelat,
    dasarPerhitungan: dasar,
    dendaSebelumBatas: sebelumBatas,
    batasNominal: batas,
    denda: bulat2(denda),
    kenaBatas: batas > 0 && sebelumBatas >= batas,
    tanggal,
    alasan: null,
  }
}

// ── Register jaminan (bond) ─────────────────────────────────────────────────

export type JenisBond =
  | 'penawaran'      // bid bond
  | 'pelaksanaan'    // performance bond
  | 'uang_muka'      // advance payment bond
  | 'pemeliharaan'   // maintenance/retention bond

export interface BarisBond {
  id?: string
  jenis: JenisBond
  nilai: number
  tanggalTerbit: string
  tanggalKadaluarsa: string
  status: 'aktif' | 'dikembalikan' | 'dicairkan' | 'kadaluarsa'
}

export interface RingkasBond {
  totalAktif: number
  jumlahAktif: number
  /** Jaminan yang kadaluarsa ≤ N hari — uang yang bisa hangus bila terlewat. */
  segeraKadaluarsa: Array<BarisBond & { sisaHari: number }>
  /** Sudah lewat tanggal tapi statusnya masih 'aktif' — data yang perlu dirapikan. */
  telatDiperbarui: BarisBond[]
}

/**
 * Ringkas register jaminan pada tanggal acuan.
 *
 * Yang dijaga: **jaminan yang kadaluarsa tanpa diperpanjang adalah uang
 * hilang** — pemberi kerja bisa mencairkan, atau kontraktor kehilangan hak
 * ikut tender berikutnya. Karena itu yang ditonjolkan bukan totalnya,
 * melainkan yang segera jatuh tempo.
 */
export function ringkasBond(
  daftar: BarisBond[],
  tanggalAcuan: string,
  ambangHari = 30,
): RingkasBond {
  const acuan = keHariEpoch(tanggalAcuan)
  const aktif = daftar.filter((b) => b.status === 'aktif')

  const segera: Array<BarisBond & { sisaHari: number }> = []
  const telat: BarisBond[] = []

  for (const b of aktif) {
    const sisaHari = keHariEpoch(b.tanggalKadaluarsa) - acuan
    if (sisaHari < 0) telat.push(b)
    else if (sisaHari <= ambangHari) segera.push({ ...b, sisaHari })
  }

  return {
    totalAktif: bulat2(aktif.reduce((s, b) => s + num(b.nilai), 0)),
    jumlahAktif: aktif.length,
    // Yang paling mendesak di atas.
    segeraKadaluarsa: segera.sort((a, b) => a.sisaHari - b.sisaHari),
    telatDiperbarui: telat,
  }
}

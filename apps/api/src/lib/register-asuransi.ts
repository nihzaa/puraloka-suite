// F5 PEMBEDA — Register asuransi: bukti pertanggungan, dan CELAH-nya.
//
// ── Kenapa modul ini ada
//
// Diukur 2026-08-06: NOL tabel dan NOL kolom asuransi di seluruh basis.
// Kontrak konstruksi hampir selalu mensyaratkan polis (CAR/TPL/Jamsostek),
// dan saat klaim terjadi yang ditanya pertama adalah nomor polis + masa
// berlakunya. Tanpa register, jawabannya ada di map fisik seseorang.
//
// ── Kenapa CELAH, bukan sekadar daftar
//
// Daftar polis hanya menjawab "punya atau tidak". Yang menentukan saat klaim
// adalah "apakah tanggal kejadiannya tertanggung" — dan itu pertanyaan
// tentang periode, bukan tentang keberadaan dokumen.
//
// Tiga celah yang tak terlihat dari daftar biasa:
//
//   1. polis MULAI setelah proyek jalan  → hari-hari awal tanpa penanggung
//   2. polis BERAKHIR sebelum proyek usai → hari-hari akhir tanpa penanggung
//   3. polis sudah lewat masa berlakunya  → tak menanggung apa pun hari ini
//
// Ketiganya menghasilkan dokumen yang terlihat sah di lemari, dan tak berguna
// saat dibutuhkan.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Tanggal kalender → nomor hari. Sama dengan `lib/penalty.ts` supaya konsisten. */
function nomorHari(tanggal: string): number {
  return Math.floor(Date.parse(`${tanggal.slice(0, 10)}T00:00:00Z`) / 86_400_000)
}

export type JenisPolis = 'car' | 'tpl' | 'jamsostek' | 'car_tpl' | 'lainnya'

export interface BarisPolis {
  id: string
  project_id: string
  jenis: JenisPolis
  jenis_lain?: string | null
  nomor_polis: string
  penerbit: string
  nilai_pertanggungan?: number | string | null
  premi?: number | string | null
  periode_mulai: string
  periode_selesai: string
  tertanggung?: string | null
  status?: string | null
}

export interface BarisProyek {
  project_id: string
  project_name?: string
  /** Tanggal mulai proyek. null = tak bisa dihitung celahnya. */
  start_date?: string | null
  end_date?: string | null
}

export type StatusPolis =
  /** Berlaku hari ini. */
  | 'aktif'
  /** Masa berlakunya sudah lewat. */
  | 'kadaluarsa'
  /** Belum mulai berlaku — terbit, tapi belum menanggung apa pun. */
  | 'belum_berlaku'
  /** Akan berakhir dalam waktu dekat. */
  | 'segera_berakhir'
  /** Dibatalkan secara administratif. */
  | 'dibatalkan'

export interface PolisTerhitung {
  id: string
  project_id: string
  project_name: string
  jenis: JenisPolis
  /** Nama jenis siap-tampil; `jenis_lain` dipakai bila jenisnya `lainnya`. */
  jenis_label: string
  nomor_polis: string
  penerbit: string
  nilai_pertanggungan: number | null
  periode_mulai: string
  periode_selesai: string
  status: StatusPolis
  /** Sisa hari sampai berakhir. Negatif = sudah lewat. */
  sisa_hari: number
  /**
   * Hari masa proyek yang TIDAK tertanggung polis ini.
   *
   * null bila tanggal proyeknya tak diketahui — dan itu berbeda dari 0
   * ("tertanggung penuh"). Nol pada data yang tak diketahui adalah kabar
   * baik palsu.
   */
  celah_hari: number | null
  /** Polis mulai SESUDAH proyek jalan — hari awal tanpa penanggung. */
  celah_awal: number
  /** Polis berakhir SEBELUM proyek usai — hari akhir tanpa penanggung. */
  celah_akhir: number
}

export interface HasilRegister {
  polis: PolisTerhitung[]
  jumlah_aktif: number
  jumlah_kadaluarsa: number
  jumlah_segera_berakhir: number
  jumlah_belum_berlaku: number
  /** Polis yang meninggalkan hari proyek tanpa pertanggungan. */
  jumlah_ada_celah: number
  /**
   * Proyek yang TIDAK punya satu polis pun.
   *
   * Dinyatakan supaya "nol polis kadaluarsa" tak terbaca sebagai "semuanya
   * aman" — bisa jadi memang tak ada polisnya sama sekali.
   */
  proyek_tanpa_polis: Array<{ project_id: string; project_name: string }>
  total_nilai_pertanggungan: number
}

/** Ambang "segera berakhir", dalam hari. */
export const AMBANG_SEGERA_HARI = 30

const LABEL_JENIS: Record<JenisPolis, string> = {
  car: 'CAR (Contractor’s All Risk)',
  tpl: 'TPL (Tanggung Jawab Pihak Ketiga)',
  jamsostek: 'BPJS Ketenagakerjaan',
  car_tpl: 'CAR + TPL',
  lainnya: 'Lainnya',
}

/**
 * Hitung status dan celah pertanggungan tiap polis.
 *
 * `hariIni` diserahkan pemanggil (bukan `new Date()` di dalam) supaya
 * fungsinya MURNI: "sisa 3 hari" berubah tiap hari, dan test yang memakai
 * jam sistem akan berbeda hasilnya besok.
 *
 * INVARIANT yang diuji:
 *  - polis yang belum berlaku BUKAN "aktif"
 *  - celah dihitung dua arah (awal DAN akhir), tak saling menutupi
 *  - tanggal proyek tak diketahui → celah null, BUKAN 0
 *  - status `dibatalkan` menang atas perhitungan tanggal
 *  - proyek tanpa polis dinyatakan, tidak hilang dari laporan
 */
export function hitungRegisterAsuransi(
  polis: BarisPolis[],
  proyek: BarisProyek[],
  hariIni: string,
  ambangSegeraHari: number = AMBANG_SEGERA_HARI,
): HasilRegister {
  const petaProyek = new Map(proyek.map((p) => [p.project_id, p]))
  const iniNo = nomorHari(hariIni)

  const hasil: PolisTerhitung[] = polis.map((p) => {
    const pr = petaProyek.get(p.project_id)
    const mulaiNo = nomorHari(p.periode_mulai)
    const selesaiNo = nomorHari(p.periode_selesai)
    const sisa = selesaiNo - iniNo

    let status: StatusPolis
    if (p.status === 'dibatalkan') {
      // Pembatalan administratif MENANG atas perhitungan tanggal: polis yang
      // dibatalkan tak menanggung apa pun walau periodenya masih berjalan.
      status = 'dibatalkan'
    } else if (iniNo < mulaiNo) {
      status = 'belum_berlaku'
    } else if (sisa < 0) {
      status = 'kadaluarsa'
    } else if (sisa <= ambangSegeraHari) {
      status = 'segera_berakhir'
    } else {
      status = 'aktif'
    }

    // ── Celah pertanggungan terhadap masa proyek ──────────────────────────
    //
    // null bila tanggal proyeknya tak diketahui. Nol akan terbaca
    // "tertanggung penuh" — kabar baik palsu pada data yang tak diketahui.
    let celahAwal = 0
    let celahAkhir = 0
    let celah: number | null = null

    if (pr?.start_date && pr?.end_date) {
      const pMulai = nomorHari(pr.start_date)
      const pSelesai = nomorHari(pr.end_date)
      // Dua arah dihitung TERPISAH lalu dijumlahkan. Menghitungnya sebagai
      // satu selisih membuat celah awal dan akhir saling menutupi: polis
      // yang telat 10 hari di depan tapi lebih 10 hari di belakang akan
      // terbaca "pas", padahal 10 hari pertama tak tertanggung.
      celahAwal = Math.max(0, mulaiNo - pMulai)
      celahAkhir = Math.max(0, pSelesai - selesaiNo)
      celah = celahAwal + celahAkhir
    }

    return {
      id: p.id,
      project_id: p.project_id,
      project_name: pr?.project_name ?? '—',
      jenis: p.jenis,
      jenis_label: p.jenis === 'lainnya' && p.jenis_lain ? p.jenis_lain : LABEL_JENIS[p.jenis],
      nomor_polis: p.nomor_polis,
      penerbit: p.penerbit,
      nilai_pertanggungan: p.nilai_pertanggungan == null ? null : angka(p.nilai_pertanggungan),
      periode_mulai: p.periode_mulai.slice(0, 10),
      periode_selesai: p.periode_selesai.slice(0, 10),
      status,
      sisa_hari: sisa,
      celah_hari: celah,
      celah_awal: celahAwal,
      celah_akhir: celahAkhir,
    }
  })

  // Yang paling mendesak lebih dulu: kadaluarsa, lalu segera berakhir.
  // Polis yang sudah mati adalah risiko yang sedang berjalan, bukan arsip.
  const urutan: Record<StatusPolis, number> = {
    kadaluarsa: 0, segera_berakhir: 1, belum_berlaku: 2, aktif: 3, dibatalkan: 4,
  }
  hasil.sort((a, b) =>
    urutan[a.status] - urutan[b.status] ||
    (b.celah_hari ?? 0) - (a.celah_hari ?? 0) ||
    a.periode_selesai.localeCompare(b.periode_selesai))

  const punyaPolis = new Set(polis.map((p) => p.project_id))

  return {
    polis: hasil,
    jumlah_aktif: hasil.filter((p) => p.status === 'aktif').length,
    jumlah_kadaluarsa: hasil.filter((p) => p.status === 'kadaluarsa').length,
    jumlah_segera_berakhir: hasil.filter((p) => p.status === 'segera_berakhir').length,
    jumlah_belum_berlaku: hasil.filter((p) => p.status === 'belum_berlaku').length,
    jumlah_ada_celah: hasil.filter((p) => (p.celah_hari ?? 0) > 0).length,
    // Proyek tanpa polis DINYATAKAN. Tanpa ini, "nol polis kadaluarsa"
    // terbaca sebagai "semuanya aman" — padahal bisa jadi tak ada polisnya.
    proyek_tanpa_polis: proyek
      .filter((p) => !punyaPolis.has(p.project_id))
      .map((p) => ({ project_id: p.project_id, project_name: p.project_name ?? '—' })),
    total_nilai_pertanggungan: hasil
      .filter((p) => p.status !== 'kadaluarsa' && p.status !== 'dibatalkan')
      .reduce((s, p) => s + (p.nilai_pertanggungan ?? 0), 0),
  }
}

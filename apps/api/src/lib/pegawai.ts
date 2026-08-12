/**
 * DATA KEPEGAWAIAN — aturan pengelolaannya. PURE, tanpa I/O.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LUBANG YANG DITUTUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `sdm:pegawai:view` dan `sdm:pegawai:manage` ADA, DIBERIKAN ke dua peran, dan
 * dipakai policy RLS — tetapi **nol rute memakainya** (diukur 2026-08-12).
 *
 * Akibatnya data kepegawaian tak bisa dibuat maupun disunting dari mana pun:
 * 5 pegawai masuk lewat seed, 21 pengguna lain tak punya data sama sekali.
 * Yang menabraknya bukan galat melainkan kebuntuan — klaim perjalanan (G1)
 * menolak dengan *"hubungi HRD"*, dan HRD pun tak punya layarnya.
 */

/** Status PTKP yang dikenal PPh 21. */
export const STATUS_PTKP = [
  'TK/0', 'TK/1', 'TK/2', 'TK/3',
  'K/0', 'K/1', 'K/2', 'K/3',
  'K/I/0', 'K/I/1', 'K/I/2', 'K/I/3',
] as const
export type StatusPtkp = (typeof STATUS_PTKP)[number]

/** Kategori TER (Tarif Efektif Rata-rata) PMK 168/2023. */
export const KATEGORI_TER = ['A', 'B', 'C'] as const
export type KategoriTer = (typeof KATEGORI_TER)[number]

export interface MasukanPegawai {
  user_id?: string
  nomor_induk?: string | null
  jabatan?: string | null
  departemen?: string | null
  tanggal_masuk?: string | null
  tanggal_keluar?: string | null
  gaji_pokok?: number | string | null
  status_ptkp?: string | null
  kategori_ter?: string | null
  npwp?: string | null
  nomor_bpjs_tk?: string | null
  nomor_bpjs_kes?: string | null
  jam_standar?: number | string | null
  catatan?: string | null
}

export interface NilaiPegawai {
  nomor_induk: string | null
  jabatan: string | null
  departemen: string | null
  tanggal_masuk: string | null
  tanggal_keluar: string | null
  gaji_pokok: number | null
  status_ptkp: string | null
  kategori_ter: string | null
  npwp: string | null
  nomor_bpjs_tk: string | null
  nomor_bpjs_kes: string | null
  jam_standar: number
  catatan: string | null
}

export type HasilValidasi =
  | { ok: true; nilai: NilaiPegawai }
  | { ok: false; galat: string }

const TGL = /^\d{4}-\d{2}-\d{2}$/

/** Teks kosong → null. Kolom opsional yang berisi "" bukan data, itu kelalaian. */
function teks(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Nominal yang boleh KOSONG.
 *
 * `Number('')` bernilai 0, bukan NaN — kelas cacat yang berulang di repo ini.
 * Kosong ditangani SEBELUM konversi supaya "belum diisi" tak berubah jadi
 * "gaji nol rupiah". Bedanya nyata: yang pertama menunggu data HRD, yang
 * kedua sudah diputuskan bahwa orang ini tak digaji.
 */
function nominalOpsional(v: number | string | null | undefined): number | null | 'rusak' {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : 'rusak'
}

export function validasiPegawai(m: MasukanPegawai): HasilValidasi {
  const nomorInduk = teks(m.nomor_induk)
  if (nomorInduk !== null && nomorInduk.length > 40) {
    return { ok: false, galat: 'Nomor induk maksimal 40 karakter' }
  }

  const masuk = teks(m.tanggal_masuk)
  const keluar = teks(m.tanggal_keluar)
  if (masuk !== null && !TGL.test(masuk)) {
    return { ok: false, galat: 'tanggal_masuk harus berbentuk YYYY-MM-DD' }
  }
  if (keluar !== null && !TGL.test(keluar)) {
    return { ok: false, galat: 'tanggal_keluar harus berbentuk YYYY-MM-DD' }
  }
  if (masuk !== null && keluar !== null && keluar < masuk) {
    // Perbandingan STRING pada YYYY-MM-DD benar secara leksikal, dan
    // menghindari pergeseran zona waktu saat mem-parse Date.
    return {
      ok: false,
      galat: `Tanggal keluar (${keluar}) mendahului tanggal masuk (${masuk}) — `
        + 'masa kerja negatif membuat perhitungan pesangon dan cuti jadi tak masuk akal.',
    }
  }

  const gaji = nominalOpsional(m.gaji_pokok)
  if (gaji === 'rusak') return { ok: false, galat: 'Gaji pokok tak terbaca sebagai angka' }
  if (gaji !== null && gaji < 0) return { ok: false, galat: 'Gaji pokok tak boleh negatif' }

  // Jam standar WAJIB dan harus masuk akal: ia pembagi dalam perhitungan upah
  // lembur, dan nol membuat pembagian dengan nol.
  const jam = nominalOpsional(m.jam_standar)
  if (jam === 'rusak') return { ok: false, galat: 'Jam standar tak terbaca sebagai angka' }
  const jamPakai = jam ?? 8
  if (jamPakai <= 0 || jamPakai > 24) {
    return {
      ok: false,
      galat: 'Jam standar harus lebih dari 0 dan tak lebih dari 24 — ia pembagi '
        + 'dalam perhitungan upah lembur.',
    }
  }

  const ptkp = teks(m.status_ptkp)
  if (ptkp !== null && !STATUS_PTKP.includes(ptkp as StatusPtkp)) {
    return {
      ok: false,
      galat: `Status PTKP "${ptkp}" tak dikenal. Yang sah: ${STATUS_PTKP.join(', ')}.`,
    }
  }

  const ter = teks(m.kategori_ter)
  if (ter !== null && !KATEGORI_TER.includes(ter.toUpperCase() as KategoriTer)) {
    return { ok: false, galat: `Kategori TER "${ter}" tak dikenal. Yang sah: A, B, C.` }
  }

  const npwp = teks(m.npwp)
  if (npwp !== null && !/^[\d.\-\s]{15,25}$/.test(npwp)) {
    // Bentuk longgar dengan sengaja: NPWP ditulis bertitik (01.234.567.8-901.000)
    // maupun polos, dan menolak salah satu membuat orang menyalin ulang.
    return {
      ok: false,
      galat: 'NPWP hanya boleh berisi angka, titik, dan tanda hubung (15–25 karakter).',
    }
  }

  return {
    ok: true,
    nilai: {
      nomor_induk: nomorInduk,
      jabatan: teks(m.jabatan),
      departemen: teks(m.departemen),
      tanggal_masuk: masuk,
      tanggal_keluar: keluar,
      gaji_pokok: gaji,
      status_ptkp: ptkp,
      kategori_ter: ter === null ? null : ter.toUpperCase(),
      npwp,
      nomor_bpjs_tk: teks(m.nomor_bpjs_tk),
      nomor_bpjs_kes: teks(m.nomor_bpjs_kes),
      jam_standar: jamPakai,
      catatan: teks(m.catatan),
    },
  }
}

export interface BarisPegawai {
  id: string
  nomor_induk: string | null
  jabatan: string | null
  departemen: string | null
  tanggal_masuk: string | null
  tanggal_keluar: string | null
  npwp: string | null
  nomor_bpjs_tk: string | null
  nomor_bpjs_kes: string | null
  status_ptkp: string | null
}

export interface KelengkapanPegawai {
  lengkap: boolean
  kurang: string[]
  /** Berpengaruh ke PENGGAJIAN — bukan sekadar rapi. */
  kurangKritis: string[]
}

/**
 * Apa yang belum lengkap dari satu pegawai?
 *
 * ── Kenapa dipisah KRITIS dan biasa
 *
 * Data yang hilang tak sama beratnya. `npwp` dan `status_ptkp` yang kosong
 * membuat PPh 21 dihitung dengan tarif salah — itu uang yang keliru masuk ke
 * kantong orang atau ke kas negara. `departemen` yang kosong hanya membuat
 * laporannya kurang rapi.
 *
 * Menyamakan keduanya menghasilkan daftar panjang yang diabaikan orang, dan
 * yang kritis tenggelam di antaranya.
 */
export function periksaKelengkapan(p: BarisPegawai): KelengkapanPegawai {
  const kurang: string[] = []
  const kurangKritis: string[] = []

  if (!p.nomor_induk) kurang.push('nomor induk')
  if (!p.jabatan) kurang.push('jabatan')
  if (!p.departemen) kurang.push('departemen')
  if (!p.tanggal_masuk) kurangKritis.push('tanggal masuk')

  // Yang menyentuh perhitungan pajak & jaminan sosial.
  if (!p.status_ptkp) kurangKritis.push('status PTKP')
  if (!p.npwp) kurangKritis.push('NPWP')
  if (!p.nomor_bpjs_tk) kurang.push('BPJS Ketenagakerjaan')
  if (!p.nomor_bpjs_kes) kurang.push('BPJS Kesehatan')

  return {
    lengkap: kurang.length === 0 && kurangKritis.length === 0,
    kurang,
    kurangKritis,
  }
}

/** Aktif = belum ada tanggal keluar, atau keluarnya masih di masa depan. */
export function masihAktif(p: { tanggal_keluar: string | null }, hariIni: string): boolean {
  if (!p.tanggal_keluar) return true
  return p.tanggal_keluar > hariIni
}

export interface RingkasPegawai {
  total: number
  aktif: number
  keluar: number
  /** Aktif TAPI ada data kritis yang kosong — ini yang mendesak. */
  kritisKosong: number
}

export function ringkasPegawai(
  daftar: readonly BarisPegawai[],
  hariIni: string,
): RingkasPegawai {
  let aktif = 0
  let kritis = 0

  for (const p of daftar) {
    if (masihAktif(p, hariIni)) {
      aktif++
      // Yang sudah keluar TIDAK dihitung kritis: datanya memang tak akan
      // dilengkapi lagi, dan menghitungnya membuat angka mendesak tak pernah
      // bisa turun ke nol.
      if (periksaKelengkapan(p).kurangKritis.length > 0) kritis++
    }
  }

  return {
    total: daftar.length,
    aktif,
    keluar: daftar.length - aktif,
    kritisKosong: kritis,
  }
}

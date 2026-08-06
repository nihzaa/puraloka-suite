// ════════════════════════════════════════════════════════════════════════════
// Kontras WCAG 2.1 untuk warna merek situs publik.
//
// ── Kenapa memvalidasi PASANGAN, bukan warna tunggal
//
// Kuning merek Puraloka #FFD600 memberi 11,77:1 di atas #001F3D tapi 1,41:1 di
// atas putih. Warna yang sama, dua verdikt. Validator yang menilai warna
// tunggal akan menolak warna merek perusahaan sendiri — dan itulah alasan
// kuning nyaris tak muncul di dashboard yang berlatar terang, sementara di
// landing berlatar navy ia justru satu-satunya aksen yang aman (spec §4.2).
//
// ── Kenapa latar harus DIUKUR, bukan diasumsikan putih
//
// `globals.css` mencatat kasusnya: `--warning` (#B45309) lolos di putih
// (5,02:1) dan di `--warning-bg` (4,84:1), tapi GAGAL di latar biru muda
// #ebf2ff dengan 4,46:1 — kurang 0,04 dari ambang, dan itu 95 pelanggaran di
// satu halaman. Asumsi "latarnya putih" adalah sumber kesalahan itu.
//
// Pure: tak menyentuh DB, tak membaca env, tak punya efek samping. Bisa diuji
// tanpa Postgres.
// ════════════════════════════════════════════════════════════════════════════

export type PeranWarna = 'teks' | 'teks-besar' | 'non-teks'

export type HasilValidasi = {
  lulus: boolean
  rasio: number
  ambang: number
  latar: string
  pesan?: string
}

/**
 * Latar tempat aksen landing benar-benar duduk (spec §5.1).
 * Ketiganya adalah titik henti `--grad-navy`.
 */
export const LATAR_LANDING = ['#001F3D', '#003366', '#0059B3'] as const

const AMBANG: Record<PeranWarna, number> = {
  teks: 4.5,
  'teks-besar': 3,
  'non-teks': 3,
}

const POLA_HEX = /^#[0-9a-f]{6}$/i

function keLinear(kanal: number): number {
  const c = kanal / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function luminansi(hex: string): number | null {
  if (!POLA_HEX.test(hex)) return null
  const n = Number.parseInt(hex.slice(1), 16)
  return (
    0.2126 * keLinear((n >> 16) & 255) +
    0.7152 * keLinear((n >> 8) & 255) +
    0.0722 * keLinear(n & 255)
  )
}

/**
 * Rasio kontras WCAG antara dua warna.
 * Mengembalikan 0 bila salah satu hex tak sah — bukan NaN, supaya pemanggil
 * yang lupa memeriksa tetap mendapat angka yang gagal ambang, bukan angka
 * yang lolos setiap perbandingan.
 */
export function rasioKontras(fg: string, bg: string): number {
  const a = luminansi(fg)
  const b = luminansi(bg)
  if (a === null || b === null) return 0
  const [terang, gelap] = a > b ? [a, b] : [b, a]
  return (terang + 0.05) / (gelap + 0.05)
}

export function validasiPasangan(
  fg: string,
  bg: string,
  peran: PeranWarna,
): HasilValidasi {
  const ambang = AMBANG[peran]

  if (!POLA_HEX.test(fg) || !POLA_HEX.test(bg)) {
    return {
      lulus: false,
      rasio: 0,
      ambang,
      latar: bg,
      pesan: 'Warna harus berformat #RRGGBB, misalnya #FFD600.',
    }
  }

  const rasio = rasioKontras(fg, bg)
  if (rasio >= ambang) return { lulus: true, rasio, ambang, latar: bg }

  // Arah perbaikan ditentukan latarnya: di latar terang warna harus lebih
  // gelap, di latar gelap harus lebih terang. Pesan "kontras kurang" tanpa
  // arah membuat admin menebak-nebak.
  const latarTerang = (luminansi(bg) ?? 0) > 0.18

  return {
    lulus: false,
    rasio,
    ambang,
    latar: bg,
    pesan:
      `${fg} di atas ${bg} hanya ${rasio.toFixed(2)}:1 — syarat ${ambang}:1. ` +
      `Pilih warna yang lebih ${latarTerang ? 'gelap' : 'terang'}.`,
  }
}

/**
 * Menguji satu warna aksen terhadap SELURUH latar landing.
 *
 * Gagal di salah satu latar = gagal. Sengaja bukan rata-rata: aksen yang
 * terbaca di dua latar lalu hilang di latar ketiga tetap menghasilkan teks
 * yang tak terbaca di sebagian halaman.
 */
export function validasiAksen(hex: string): HasilValidasi[] {
  return LATAR_LANDING.map((bg) => validasiPasangan(hex, bg, 'teks'))
}

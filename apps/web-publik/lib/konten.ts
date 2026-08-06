import { resolveTenant } from './tenant'

// ════════════════════════════════════════════════════════════════════════════
// Bentuk payload `/api/v1/public/situs` + pembaca yang aman dipakai di JSX.
//
// Semua teks halaman datang dari sini. Aturan yang mengikat (spec §1): NOL
// string konten di berkas .tsx. Kalau sebuah kalimat bisa berubah tanpa deploy,
// ia tinggal di DB, bukan di komponen.
// ════════════════════════════════════════════════════════════════════════════

export type Media = {
  path_storage: string
  alt: string
  lebar: number
  tinggi: number
  urutan: number
}

export type Kategori = {
  kunci: string
  judul: string
  ringkasan: string | null
  lokasi: string | null
  lingkup: string | null
  urutan: number
  media: Media[]
}

export type Milestone = {
  tahun: number
  judul: string
  keterangan: string | null
  urutan: number
}

export type Legalitas = { kode: string; judul: string; urutan: number }
export type Seksi = { kunci: string; aktif: boolean; urutan: number; varian: string }
export type Merek = {
  warna_utama: string
  warna_aksen: string
  logo_path: string | null
}

export type KontenSitus = {
  konten: Record<string, unknown>
  kategori: Kategori[]
  milestone: Milestone[]
  legalitas: Legalitas[]
  seksi: Seksi[]
  merek: Merek | null
}

/**
 * Membaca satu kunci konten sebagai teks.
 *
 * Mengembalikan string kosong bila kunci tak ada — bukan "undefined" yang
 * tercetak di halaman. Komponen memutuskan sendiri apa yang dilakukan saat
 * kosong (umumnya: tidak merender elemennya).
 */
export function teks(k: KontenSitus, kunci: string, baku = ''): string {
  const v = k.konten[kunci]
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return baku
}

/** URL publik satu varian lebar sebuah media. */
export function urlMedia(path: string, lebar: 640 | 1280 | 1920): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return `${base}/storage/v1/object/public/situs/${path}-${lebar}.webp`
}

/** srcSet tiga varian — browser memilih sesuai lebar layar dan DPR. */
export function srcSetMedia(path: string): string {
  return ([640, 1280, 1920] as const)
    .map((w) => `${urlMedia(path, w)} ${w}w`)
    .join(', ')
}

export async function ambilKonten(): Promise<KontenSitus> {
  // Gagal cepat bila situs belum dikonfigurasi — sebelum permintaan jaringan.
  resolveTenant()

  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) throw new Error('NEXT_PUBLIC_API_URL belum diset.')

  const r = await fetch(`${base}/api/v1/public/situs`, {
    // Tag dipakai revalidate-on-save: admin menyimpan → API memanggil
    // /api/revalidate → tag ini dibuang → pengunjung berikutnya dapat versi baru.
    next: { revalidate: 300, tags: ['situs'] },
  })
  if (!r.ok) throw new Error(`API situs menjawab ${r.status}`)

  const { data } = (await r.json()) as { data: KontenSitus }
  return data
}

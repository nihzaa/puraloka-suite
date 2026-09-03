
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
/**
 * `varian` = BENTUK (baku | grid | carousel | split).
 * `nada`   = WARNA  (navy | terang) — sumbu TERPISAH, ditambahkan migrasi 236.
 *
 * Dipisah karena keduanya ortogonal: satu seksi bisa 'grid' DAN 'terang'
 * sekaligus. Memaksakannya ke satu kolom membuat tiap kombinasi butuh
 * nilainya sendiri, dan daftarnya tumbuh berlipat tiap sumbu baru.
 *
 * `nada` opsional di tipe ini supaya payload lama (sebelum 236 ter-deploy)
 * tetap terbaca — halaman jatuh ke navy, bukan gagal.
 */
export type Seksi = {
  kunci: string
  aktif: boolean
  urutan: number
  varian: string
  nada?: 'navy' | 'terang'
}
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

/*
 * ⚠ `ambilKonten()` PINDAH ke `konten-server.ts`.
 *
 * Diukur 2026-09-04: `next build` gagal dengan *"You're importing a module
 * that depends on next/headers"*. Berkas ini dipakai KOMPONEN (`teks`,
 * `urlMedia`, `srcSetMedia`, tipe), jadi ia ikut ke bundle klien — dan
 * `ambilKonten()` di dalamnya menyeret `next/headers` ke sana.
 *
 * Impor dinamis di dalam fungsi TIDAK menolong: Turbopack tetap
 * menganalisisnya.
 *
 * `tsc --noEmit` HIJAU selama itu — typecheck tak menjalankan bundler, jadi
 * ia tak tahu apa-apa soal batas server/klien. Keluarga yang sama dengan
 * mobile yang `tsc` hijau tapi Metro gagal (CLAUDE.md §7a).
 *
 * Pemisahannya: berkas INI murni (aman di mana pun), `konten-server.ts`
 * menyentuh permintaan.
 */

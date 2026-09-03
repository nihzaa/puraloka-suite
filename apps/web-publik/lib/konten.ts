import { resolveHost, tenantCadangan } from './tenant'

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

export async function ambilKonten(): Promise<KontenSitus> {
  /*
   * Tenant ditentukan dari HOSTNAME permintaan (migrasi 564), bukan env.
   *
   * Hostnya dikirim sebagai header `x-situs-host`; API yang memetakannya ke
   * company lewat `situs_company_dari_host()`. Satu tempat yang boleh
   * memetakan host → company adalah tempat yang juga menyaring datanya.
   *
   * `tenantCadangan()` hanya hidup di luar produksi — di produksi, host yang
   * tak terdaftar HARUS gagal, bukan jatuh ke company tertentu.
   */
  const host = await resolveHost()
  const cadangan = tenantCadangan()

  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) throw new Error('NEXT_PUBLIC_API_URL belum diset.')

  const r = await fetch(`${base}/api/v1/public/situs`, {
    // Hanya TAG, tanpa `revalidate: <detik>`.
    //
    // Keduanya bersamaan membuat entri punya dua penentu kesegaran, dan yang
    // berbasis waktu menang: `revalidateTag('situs')` membalas sukses sementara
    // halaman tetap menyajikan HTML lama sampai jendela waktunya habis. Itu
    // terbukti saat pengujian — DB berubah, API benar, revalidate 200, halaman
    // tak bergerak.
    //
    // Dengan tag saja: konten bertahan di cache sampai admin menyimpan, lalu
    // langsung terbit. Tak ada permintaan DB per pengunjung, dan tak ada jeda
    // yang membuat admin mengira simpanannya gagal.
    headers: {
      'x-situs-host': host,
      ...(cadangan ? { 'x-situs-company-cadangan': cadangan } : {}),
    },
    next: { tags: ['situs'] },
  })
  if (!r.ok) throw new Error(`API situs menjawab ${r.status}`)

  const { data } = (await r.json()) as { data: KontenSitus }
  return data
}

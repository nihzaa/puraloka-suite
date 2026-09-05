import { tenantCadangan } from './tenant'
import { resolveHost } from './tenant-server'
import type { KontenSitus } from './konten'

// ════════════════════════════════════════════════════════════════════════════
// Pengambilan konten situs — SERVER SAJA.
//
// Dipisah dari `konten.ts` karena berkas itu dipakai komponen dan ikut ke
// bundle klien. `next/headers` tak ada di browser, dan Turbopack menolak
// build-nya — termasuk lewat impor dinamis.
// ════════════════════════════════════════════════════════════════════════════

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
  // Impor DINAMIS: `ambilKonten()` hanya dipanggil dari jalur server, tapi
  // berkas ini ikut tertarik ke bundle klien lewat `teks()` yang dipakai
  // komponen. Impor statis `server-only` akan menggagalkan build; impor di
  // dalam fungsi tak pernah dijalankan browser.
  const { resolveHost } = await import('./tenant-server')
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

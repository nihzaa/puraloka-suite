import { headers } from 'next/headers'
import { rapikanHost } from './tenant'

// ════════════════════════════════════════════════════════════════════════════
// Pengambilan hostname — SERVER SAJA.
//
// Dipisah dari `tenant.ts` karena berkas itu ikut tertarik ke Client Component
// lewat `Proses.tsx`, dan `next/headers` tak ada di browser. `tsc` hijau atas
// keadaan itu; `next build` yang menolaknya.
//
// ⚠ Paket `server-only` TIDAK dipakai: ia belum terpasang di workspace ini,
// dan menambahkannya cuma untuk penanda berarti satu dependensi baru demi
// satu baris. Next 16 sendiri sudah menolak `next/headers` di bundle klien —
// pelanggarannya tetap gagal saat build, hanya pesannya kurang langsung.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hostname permintaan yang sedang berjalan.
 *
 * ⚠ `x-forwarded-host` didahulukan. Di balik nginx, `host` berisi nama
 * internal kontainer, bukan alamat yang diketik pengunjung. Headernya
 * dipasang di ketujuh blok proxy (`infra/nginx-puraloka.conf`).
 */
export async function resolveHost(): Promise<string> {
  const h = await headers()
  const host = rapikanHost(h.get('x-forwarded-host') ?? h.get('host'))

  if (!host) {
    throw new Error(
      'Hostname permintaan kosong. Situs publik tidak tahu konten milik siapa.',
    )
  }
  return host
}

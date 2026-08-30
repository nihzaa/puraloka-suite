import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // Deploy VPS (2026-08-30). Tanpa ini image Docker harus memuat SELURUH
  // node_modules monorepo — ratusan MB dependensi build yang tak pernah
  // dipakai saat runtime.
  //
  // ⚠ Konsekuensinya: `next start` TIDAK dipakai di produksi. Yang dijalankan
  // `node apps/web-publik/server.js`, dan `.next/static` + `public/` harus
  // DISALIN manual ke sebelahnya — kalau terlewat, halaman terbuka TANPA CSS.
  output: 'standalone',
  // Monorepo: akar jejak berkas di akar repo, bukan apps/web-publik.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Foto compro dilayani Supabase Storage (bucket `situs`, public). Host-nya
  // didaftarkan supaya next/image boleh mengoptimasinya.
  //
  // Pipeline impor sudah menghasilkan tiga varian webp per foto, jadi
  // next/image di sini bertugas memilih varian — bukan mengubah ukuran ulang.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: new URL(
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://localhost',
        ).hostname,
        pathname: '/storage/v1/object/public/situs/**',
      },
    ],
  },
}

export default nextConfig

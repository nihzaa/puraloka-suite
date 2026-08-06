import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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

import type { Metadata } from 'next'
import { ambilKonten, teks } from '@/lib/konten'
import './globals.css'

// Metadata pun datang dari DB — judul dan deskripsi SEO bisa diubah admin
// tanpa deploy, sama seperti isi halaman.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const k = await ambilKonten()
    return {
      title: teks(k, 'meta.judul', 'Puraloka Persada'),
      description: teks(k, 'meta.deskripsi'),
    }
  } catch {
    // Situs belum dikonfigurasi atau API mati. Metadata tak boleh menjatuhkan
    // seluruh halaman — galat sebenarnya akan muncul di page.tsx dengan
    // pesan yang jauh lebih berguna.
    return { title: 'Puraloka Persada' }
  }
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <a href="#isi" className="lewati">
          Lewati ke konten
        </a>
        {children}
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { JudulHalaman } from "@/components/judul-halaman";
import PendaftarServiceWorker from "@/components/pendaftar-sw";
import { NAVY, GELAP } from "@/lib/warna-merek";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  // `template` membuat setiap halaman cukup menyebut namanya sendiri, lalu
  // Next.js menambahkan " · Puraloka Suite". Tanpa ini, ~50 tab bertuliskan
  // teks yang sama persis — dan orang yang membuka lima tab sekaligus (hal
  // biasa saat menyusun tagihan) tak bisa membedakan satu pun.
  title: {
    default: "Puraloka Suite",
    template: "%s · Puraloka Suite",
  },
  description: "Manajemen konstruksi, dari lapangan sampai laporan.",
  // `icon.svg` di app/ dipungut otomatis; ini melengkapi untuk layar utama iOS.
  appleWebApp: { title: "Puraloka", capable: true, statusBarStyle: "default" },
};

// Tema bilah alamat peramban seluler mengikuti warna merek, bukan putih
// bawaan. Dipisah per skema supaya tak ada bilah putih menyala di mode gelap.
//
// ⚠️ Di `viewport`, BUKAN `metadata` — Next.js memindahkannya di App Router
// dan memperingatkan (tapi tetap merender) kalau salah tempat. Peringatan
// yang dibiarkan akan tenggelam di antara log lain, lalu perilakunya berubah
// diam-diam saat Next.js menghapus jalur lamanya.
//
// Nilainya dari `lib/warna-merek`, bukan hex di sini: <meta> dibaca peramban
// sebelum CSS mana pun dimuat, jadi `var(--aksen)` di posisi ini hanyalah
// teks mati. Berkas itu adalah SATU-SATUNYA tempat hex merek boleh hidup.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: NAVY },
    { media: "(prefers-color-scheme: dark)", color: GELAP },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <ThemeProvider>
          {/* Di root, bukan di (dashboard): portal klien dan portal mandor
              juga butuh judul yang jelas. */}
          <JudulHalaman />
          <PendaftarServiceWorker />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

"use client";

/**
 * LAPANGAN — kerangka modul: navigasi antar-bagian.
 *
 * ── Kenapa layout ini SENGAJA setipis ini
 *
 * Tidak seperti `kas/layout.tsx`, layout ini TIDAK memasang judul, tombol
 * aksi global, atau kartu pembungkus. Alasannya bukan selera: tiga halaman
 * anak (`punch-list`, `inspeksi`, `submittal`) sudah lebih dulu ada, dan
 * masing-masing membawa pembungkus `--w-page`-nya sendiri lengkap dengan
 * judul, pemilih proyek, dan tombol aksinya. Membungkusnya lagi di sini
 * menghasilkan dua padding bertumpuk dan dua judul di satu layar.
 *
 * `kas` bisa memakai pola yang lebih tebal karena halaman anaknya DIPECAH
 * dari satu berkas dan ditulis ulang bersama layoutnya. Di sini sebaliknya:
 * syarat kerjanya adalah mempertahankan seluruh perilaku halaman yang sudah
 * ada. Jadi yang ditambahkan hanya satu hal yang memang belum ada — jalan
 * antar-bagian — dan lebar strip navigasinya dipatok token yang SAMA
 * (`--w-page`) supaya ia sejajar dengan isi halaman di bawahnya, bukan
 * melayang lebih lebar.
 *
 * ── Kenapa tak ada lencana angka di navigasi
 *
 * `kas` bisa menaruh "3 menunggu" di sampingnya karena `/api/v1/cash/summary`
 * menjawab seluruh modul dalam satu panggilan. Modul lapangan tak punya
 * padanannya: punch, inspeksi, dan submittal semuanya hanya dilayani rute
 * bersarang per-proyek. Mengisinya berarti satu permintaan per proyek per
 * bagian, di setiap halaman modul ini. Lencana yang absen jauh lebih murah
 * daripada angka yang menyesatkan — dan nol yang dikarang terbaca sebagai
 * "tidak ada yang perlu saya kerjakan".
 */

import { NavBagian, type Bagian } from "@/components/nav-bagian";

const BAGIAN: Bagian[] = [
  { href: "/lapangan", label: "Ringkasan" },
  { href: "/lapangan/punch-list", label: "Punch List" },
  { href: "/lapangan/inspeksi", label: "Inspeksi" },
  { href: "/lapangan/submittal", label: "Submittal" },
];

export default function LapanganLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div style={{
        width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
        padding: "var(--pad-atas) var(--pad-x) 0",
      }}>
        <NavBagian bagian={BAGIAN} />
      </div>
      {children}
    </>
  );
}

"use client";

/**
 * JUDUL HALAMAN — menyetel <title> tab peramban sesuai rute yang dibuka.
 *
 * ── Kenapa perlu, dan kenapa tak bisa pakai `export const metadata`
 *
 * Sebelum ini, ~50 halaman semuanya bertuliskan "Puraloka Suite" di tab.
 * Orang yang membuka lima tab sekaligus — hal biasa saat menyusun tagihan
 * sambil memeriksa progres — tak bisa membedakan satu pun. Riwayat peramban
 * juga jadi tak berguna: lima puluh entri dengan nama yang sama.
 *
 * `export const metadata` adalah cara Next.js yang benar, tapi ia hanya
 * bekerja di server component. Seluruh halaman dashboard di aplikasi ini
 * `"use client"` (butuh state, fetch, interaksi), jadi jalur itu tertutup.
 * Menuliskan <title> lewat effect adalah jalan yang tersisa.
 *
 * ── Kenapa satu peta rute, bukan prop di tiap halaman
 *
 * Prop per halaman berarti 50 tempat yang bisa lupa diisi, dan yang lupa
 * akan diam-diam memakai judul bawaan. Peta terpusat membuat halaman baru
 * yang belum terdaftar KETAHUAN — ia jatuh ke nama rutenya sendiri, yang
 * terlihat mentah dan menuntut diperbaiki.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Rute → judul. Diurutkan dari yang PALING SPESIFIK, karena pencocokannya
 * memakai `startsWith` dan yang pertama cocok menang. `/kas/transfer` harus
 * berada di atas `/kas`, atau ia tak akan pernah terpilih.
 */
const JUDUL: Array<[string, string]> = [
  ["/dashboard", "Dashboard"],
  ["/proyek", "Proyek"],
  ["/keuangan", "Keuangan"],
  ["/kas", "Kas & Pengeluaran"],
  ["/piutang", "Piutang"],
  ["/mandor", "Mandor & Subkontraktor"],
  ["/procurement", "Pengadaan"],
  ["/kontrak", "Kontrak"],
  ["/estimasi", "Estimasi & RAB"],
  ["/akuntansi", "Akuntansi"],
  ["/laporan", "Laporan"],
  ["/lapangan", "Operasi Lapangan"],
  ["/aset", "Alat & Aset"],
  ["/klien", "Klien"],
  ["/tender", "Tender"],
  ["/kalender", "Kalender"],
  ["/audit", "Jejak Audit"],
  ["/notifications", "Notifikasi"],
  ["/pengaturan", "Pengaturan"],
  ["/users", "Pengguna"],
  ["/sistem", "Sistem"],
  ["/login", "Masuk"],
  ["/portal", "Portal Klien"],
  ["/mandor-portal", "Portal Mandor"],
  ["/pm-portal", "Portal PM"],
];

/** Rute yang tak terdaftar → ubah "/anu-itu/123" jadi "Anu Itu". */
function dariRute(pathname: string): string {
  const potongan = pathname.split("/").filter(Boolean)[0]
  if (!potongan) return "Puraloka Suite"
  return potongan
    .split("-")
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(" ")
}

export function JudulHalaman() {
  const pathname = usePathname();

  useEffect(() => {
    const cocok = JUDUL.find(([rute]) =>
      rute === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(rute)
    );
    const nama = cocok ? cocok[1] : dariRute(pathname);
    // Pola yang sama dengan `metadata.title.template` di app/layout.tsx, jadi
    // halaman server dan halaman klien terbaca seragam di bilah tab.
    document.title = nama === "Puraloka Suite" ? nama : `${nama} · Puraloka Suite`;
  }, [pathname]);

  return null;
}

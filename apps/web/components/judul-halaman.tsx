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

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MENU_CACHE_KEY } from "@/lib/api";

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

/** Satu baris menu — bentuk yang sama dengan `judul-bagian.tsx`. */
interface NodeMenu {
  label: string;
  href: string | null;
  children?: NodeMenu[];
}

function ratakan(n: NodeMenu[]): NodeMenu[] {
  const hasil: NodeMenu[] = [];
  for (const x of n) {
    hasil.push(x);
    if (x.children?.length) hasil.push(...ratakan(x.children));
  }
  return hasil;
}

function JudulHalamanIsi() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menu, setMenu] = useState<NodeMenu[]>([]);

  /*
    Menu dibaca dari CACHE localStorage saja — TIDAK memanggil `/api/v1/menu`.

    `JudulBagian` sudah memanggilnya di tiap halaman dashboard dan menuliskan
    hasilnya ke cache yang sama. Komponen ini dirender di root layout (portal
    klien & mandor ikut memakainya), jadi memanggil sendiri berarti satu
    permintaan tambahan di SETIAP halaman, hanya demi teks di bilah tab.

    Kalau cache belum ada — kunjungan pertama, sebelum menu termuat — peta
    statis di bawah tetap menjawab. Judul tab yang menyebut modul lebih baik
    daripada judul yang kosong, dan begitu menu tersimpan, judulnya menajam
    sampai ke nama sub-halaman.
  */
  useEffect(() => {
    try {
      const c = localStorage.getItem(MENU_CACHE_KEY);
      if (c) {
        const dariCache = JSON.parse(c) as NodeMenu[];
        if (Array.isArray(dariCache)) queueMicrotask(() => setMenu(dariCache));
      }
    } catch { /* cache rusak bukan alasan judul gagal */ }
  }, [pathname]);

  useEffect(() => {
    const kueri = params?.toString();
    const penuh = kueri ? `${pathname}?${kueri}` : pathname;

    /*
      Urutan pencocokan SAMA PERSIS dengan `judul-bagian.tsx`: cocok penuh
      (termasuk query) dulu, baru tanpa query. Dua sub-menu bisa berbagi
      pathname dan dibedakan HANYA oleh query — `/procurement/lanjutan?bagian=
      payung` lawan `?bagian=nota`. Tanpa langkah pertama, keduanya bernama
      sama di bilah tab, dan itu justru kasus yang paling butuh dibedakan:
      keduanya biasa dibuka berdampingan.
    */
    const rata = ratakan(menu).filter((n) => n.href);
    const node = rata.find((n) => n.href === penuh) ?? rata.find((n) => n.href === pathname);

    let nama: string;
    if (node?.label) {
      nama = node.label;
    } else {
      const cocok = JUDUL.find(([rute]) =>
        rute === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(rute)
      );
      nama = cocok ? cocok[1] : dariRute(pathname);
    }

    // Pola yang sama dengan `metadata.title.template` di app/layout.tsx, jadi
    // halaman server dan halaman klien terbaca seragam di bilah tab.
    document.title = nama === "Puraloka Suite" ? nama : `${nama} · Puraloka Suite`;
  }, [pathname, params, menu]);

  return null;
}

/**
 * `useSearchParams()` menuntut batas Suspense-nya sendiri, atau build Next
 * gagal di halaman yang kebetulan diprerender lebih dulu — bukan di berkas
 * yang bersalah. Pola yang sama dipakai `sidebar.tsx` dan `judul-bagian.tsx`.
 */
export function JudulHalaman() {
  return (
    <Suspense fallback={null}>
      <JudulHalamanIsi />
    </Suspense>
  );
}

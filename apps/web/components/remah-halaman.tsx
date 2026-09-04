"use client";

/**
 * TINGKAT TERAKHIR BREADCRUMB — nama HALAMAN, bukan nama modul.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur di peramban 2026-08-12:
 *
 *     rute                 breadcrumb                     judul halaman
 *     /keuangan/kasbon     "Puraloka Suite / Keuangan"    "Kasbon"
 *     /procurement/stok    "Puraloka Suite / Pengadaan"   "Stok Material"
 *     /mutu/ncr            "Puraloka Suite / Mutu & K3"   "Register NCR"
 *     /sdm/timesheet       "Puraloka Suite / Sdm"         "Absensi & Timesheet"
 *
 * `breadcrumbMap` di `topbar.tsx` mencocokkan PREFIX, jadi seluruh cabang
 * `/keuangan/*` menghasilkan satu label yang sama. Untuk halaman ikhtisar itu
 * benar. Untuk sub-halaman ia berhenti tepat sebelum satu-satunya potongan
 * yang menjawab "saya di mana".
 *
 * Akibatnya paling jelas pada `/sdm/timesheet`: tak ada entri `/sdm`, jadi
 * cadangannya menurunkan nama dari URL dan menampilkan **"Sdm"** — mentah,
 * persis seperti yang diperingatkan komentar cadangan itu sendiri.
 *
 * ── Kenapa dari `menu_items`, bukan daftar baru
 *
 * Sudah ada TIGA daftar rute→nama di aplikasi ini: `menu_items` (DB),
 * `JUDUL` di `judul-halaman.tsx` (judul tab peramban), dan `breadcrumbMap`
 * di `topbar.tsx`. Dibandingkan terhadap DB, `breadcrumbMap` sudah
 * menyimpang di 18 dari 23 entri.
 *
 * Sebagian besar penyimpangan itu SENGAJA dan benar — breadcrumb menyebut
 * modul ("Keuangan") sementara sidebar menyebut halaman ("Ringkasan
 * Keuangan"). Tapi sebagian lagi cuma pembusukan: "Alat & Aset" vs
 * "Aset & Alat" (urutan kata terbalik), "Dashboard" vs "Beranda" (bahasa
 * Inggris di aplikasi berbahasa Indonesia).
 *
 * Daftar keempat akan membusuk dengan cara yang sama. `JudulBagian` sudah
 * memutuskan hal ini untuk judul halaman dan alasannya berlaku sama persis
 * di sini: label yang dilihat orang di sidebar dan yang dibacanya di
 * breadcrumb HARUS kata yang sama, atau ia mengira salah klik.
 *
 * ── Kenapa hanya muncul untuk SUB-halaman
 *
 * Di `/keuangan` sendiri, breadcrumb "Keuangan / Ringkasan Keuangan"
 * mengulang dirinya. Tingkat terakhir hanya ditambahkan bila labelnya
 * benar-benar berbeda dari label modul yang sudah tampil.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MENU_CACHE_KEY } from "@/lib/api";
import { muatMenu } from "@/lib/muat-menu";

interface NodeMenu {
  key: string;
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

function RemahIsi({ modul }: { modul: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menu, setMenu] = useState<NodeMenu[]>([]);

  useEffect(() => {
    // `localStorage`, BUKAN `sessionStorage`.
    //
    // Versi pertama menebak `sessionStorage` dan komponennya diam-diam
    // mengembalikan `null` di setiap halaman — cache-nya selalu kosong, jadi
    // tak ada label, tak ada galat, tak ada gejala apa pun selain breadcrumb
    // yang tetap dua tingkat. Ketahuan dari pengukuran peramban, bukan dari
    // kode: `sidebar.tsx:538` menulisnya ke `localStorage`.
    try {
      const mentah = localStorage.getItem(MENU_CACHE_KEY);
      /*
        Hidrasi dari localStorage — nilainya tak ada saat render pertama.

        Peta menu ditulis ke localStorage oleh `sidebar.tsx`; breadcrumb
        membacanya supaya tak menampilkan dua tingkat generik sebelum jaringan
        menjawab. Nilai itu tak bisa jadi state awal karena localStorage tak ada
        di server.

        Effect ini berdependensi kosong dan berjalan sekali.
      */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (mentah) setMenu(JSON.parse(mentah));
    } catch {
      /* cache rusak/ditolak — breadcrumb tetap dua tingkat, bukan crash */
    }

    /*
      Cadangan jaringan lewat `muatMenu()` — permintaan DISATUKAN dengan
      `JudulBagian`, yang dirender di halaman yang sama.

      Sebelum 2026-09-05 keduanya memanggil `/api/v1/menu` sendiri-sendiri.
      Diukur di produksi: 9 panggilan untuk 5 halaman, 59,5 KB per panggilan.
      Cache saja tak cukup pada muat pertama — breadcrumb yang baru muncul
      setelah kunjungan kedua terbaca seperti kerusakan acak.
    */
    let batal = false;
    muatMenu<NodeMenu>()
      .then((daftar) => { if (!batal) setMenu(daftar); })
      .catch(() => { /* dua tingkat sudah cukup; jangan gagalkan topbar */ });
    return () => { batal = true; };
  }, []);

  const label = useMemo(() => {
    if (!menu.length) return null;
    const rata = ratakan(menu);
    const q = params.get("bagian");

    // Paling spesifik dulu: `?bagian=` membedakan sub-menu yang berbagi rute
    // (migrasi 233), jadi ia harus menang atas pencocokan path polos.
    const tepat =
      (q && rata.find((n) => n.href === `${pathname}?bagian=${q}`)) ||
      rata.find((n) => n.href === pathname);

    if (!tepat) return null;
    // Sama dengan yang sudah tampil → jangan diulang.
    return tepat.label === modul ? null : tepat.label;
  }, [menu, pathname, params, modul]);

  if (!label) return null;

  return (
    <>
      <span aria-hidden style={{ fontSize: 13, color: "var(--border-strong)" }}>/</span>
      <span style={{
        fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
      }}>{label}</span>
    </>
  );
}

/**
 * Batas Suspense ditanggung komponen, bukan pemanggil.
 *
 * `useSearchParams()` memaksa Next 16 menolak prerender halaman yang
 * memuatnya tanpa batas Suspense — dan galatnya muncul di halaman yang
 * kebetulan diprerender lebih dulu, bukan di berkas yang bersalah. Pola dan
 * alasannya sama dengan `JudulBagian`, tempat KELIMA pemanggil melupakannya.
 *
 * Fallback `null`: tingkat terakhir memang boleh tak ada, jadi tak perlu
 * rangka penahan tempat.
 */
export function RemahHalaman({ modul }: { modul: string }) {
  return (
    <Suspense fallback={null}>
      <RemahIsi modul={modul} />
    </Suspense>
  );
}

"use client";

/**
 * IZIN yang aman terhadap hydration.
 *
 * ── Masalah yang diselesaikan
 *
 * `hasPermission()` membaca daftar permission dari `localStorage`. Di
 * server localStorage tidak ada, jadi ia selalu mengembalikan `false`;
 * di klien ia `true` untuk pemakai yang berwenang. Memanggilnya langsung
 * saat render membuat pohon server dan pohon klien BERBEDA:
 *
 *     {bolehKelola && <button>Jurnal Baru</button>}
 *
 * Server merender lima tombol, klien merender enam. React menemukan
 * ketidakcocokan itu, membuang seluruh pohon hasil server, lalu merender
 * ulang semuanya di klien.
 *
 * Akibatnya bukan sekadar peringatan di konsol:
 *
 *   • seluruh halaman dirender dua kali pada muat pertama — pemborosan
 *     yang paling terasa di HP lapangan, tempat halaman ini dipakai;
 *   • HTML dari server praktis terbuang, jadi keuntungan SSR hilang;
 *   • pada kasus terburuk isi sempat berkedip antara dua bentuk.
 *
 * Terlihat sebagai "2 Issues" di overlay Next.js pada 17 halaman.
 *
 * ── Kenapa `useSyncExternalStore`, bukan `useEffect`
 *
 * Pola `useState(false)` + `useEffect(() => setBoleh(true))` juga
 * menghilangkan ketidakcocokan, tapi dengan dua ongkos: ia menambah
 * satu render lagi, dan ia melanggar `react-hooks/set-state-in-effect`
 * yang dijaga lint repo ini.
 *
 * `useSyncExternalStore` dirancang persis untuk keadaan ini — nilai yang
 * berbeda antara server dan klien. Argumen ketiganya adalah "snapshot
 * server", dan React memakainya saat SSR lalu beralih ke nilai klien
 * setelah hydration selesai, TANPA menganggapnya ketidakcocokan.
 *
 * Pola ini sudah dipakai di `/mutu/ncr`; berkas ini hanya mengangkatnya
 * supaya tak disalin ulang di 17 tempat dengan cara yang sedikit
 * berbeda-beda.
 */

import { useSyncExternalStore } from "react";
import { hasPermission } from "@/lib/api";

/**
 * Daftar permission tak berubah selama satu sesi halaman — perubahannya
 * datang lewat login/logout, yang memuat ulang aplikasi. Jadi tak ada
 * yang perlu di-subscribe, dan fungsi berlangganan ini sengaja tidak
 * melakukan apa pun.
 */
const takBerlangganan = () => () => {};

/** Selalu `false` di server: di sana localStorage tak ada. */
const dariServer = () => false;

/**
 * @example
 *   const bolehKelola = useIzin("gl:manage");
 *   {bolehKelola && <Tombol>Jurnal Baru</Tombol>}
 */
export function useIzin(kunci: string): boolean {
  return useSyncExternalStore(
    takBerlangganan,
    () => hasPermission(kunci),
    dariServer,
  );
}

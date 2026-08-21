"use client";

/**
 * PENGGUNA BERJALAN yang aman terhadap hydration.
 *
 * ── Masalah yang diselesaikan
 *
 * `getStoredUser()` (`lib/api.ts`) membaca `puraloka_user` dari
 * `localStorage`. Di server localStorage tidak ada, jadi ia SELALU
 * mengembalikan `null`; di klien ia mengembalikan objek user sungguhan.
 * Memanggilnya langsung saat render membuat pohon server dan pohon klien
 * BERBEDA — persis masalah yang sama dengan `hasPermission()` yang sudah
 * diselesaikan `useIzin` (`lib/use-izin.ts`), dituliskan lengkap di sana:
 * render dobel, HTML SSR terbuang, dan pada kasus terburuk isi berkedip.
 *
 * Dipakai `mutu/ncr/[id]/page.tsx` untuk memutuskan `sayaPelapor` (gerbang
 * SoD di UI — pelapor NCR tak boleh menutup temuannya sendiri; backend
 * `ncr.ts` PATCH `/status` tetap penegak akhir, ini cuma kenyamanan supaya
 * tombol tak terlihat bisa ditekan lalu ditolak 403).
 *
 * ── Kenapa `useSyncExternalStore`, bukan `useEffect`
 *
 * Sama seperti `useIzin`: `useEffect` menambah satu render lagi dan
 * melanggar `react-hooks/set-state-in-effect`. `useSyncExternalStore`
 * dirancang persis untuk nilai yang berbeda server/klien, dan React
 * memakai snapshot server saat SSR lalu beralih ke nilai klien sesudah
 * hydration TANPA menganggapnya ketidakcocokan.
 */

import { useSyncExternalStore } from "react";
import { getStoredUser, type PuralokaUser } from "@/lib/api";

/**
 * User yang tersimpan tak berubah selama satu sesi halaman — perubahannya
 * datang lewat login/logout, yang memuat ulang aplikasi (`logout()` di
 * `lib/api.ts` memanggil ulang alur, bukan mutasi diam-diam). Jadi tak ada
 * yang perlu di-subscribe.
 */
const takBerlangganan = () => () => {};

/** Selalu `null` di server: di sana localStorage tak ada. */
const dariServer = () => null;

/**
 * @example
 *   const pengguna = usePengguna();
 *   const sayaPelapor = pengguna?.id === ncr.dilaporkan_oleh;
 */
export function usePengguna(): PuralokaUser | null {
  return useSyncExternalStore(
    takBerlangganan,
    () => getStoredUser(),
    dariServer,
  );
}

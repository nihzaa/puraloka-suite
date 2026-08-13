"use client";

/**
 * SUDAH TERPASANG DI KLIEN? — tanpa `useEffect`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua berkas menyalin hook yang sama persis:
 *
 *     function useMount() {
 *       const [m, setM] = useState(false);
 *       useEffect(() => setM(true), []);
 *       return m;
 *     }
 *
 * Ia dipakai sebagai gerbang `if (!mounted) return null` — menahan render
 * pertama supaya isi yang bergantung pada API peramban (portal, `Date`,
 * `localStorage`) tak menghasilkan HTML server yang berbeda dari klien.
 * Tujuannya benar; caranya yang mahal.
 *
 * ── Kenapa `useEffect` salah untuk pertanyaan ini
 *
 * `setState` di dalam efek memaksa React merender DUA KALI setiap kali
 * komponennya pertama muncul: sekali dengan `false`, lalu sekali lagi dengan
 * `true` sesudah efeknya jalan. Untuk komponen berisi tabel ratusan baris,
 * render kedua itu bukan gratis.
 *
 * Aturan `react-hooks/set-state-in-effect` menandainya, dan alasannya bukan
 * gaya: React 19 memperlakukan pola ini sebagai kesalahan yang akan makin
 * mahal saat concurrent rendering benar-benar dipakai.
 *
 * ── `useSyncExternalStore` menjawabnya tanpa render kedua
 *
 * Hook ini punya dua pembaca terpisah — satu untuk klien, satu untuk server.
 * Server memakai `getServerSnapshot` (`false`), klien memakai `getSnapshot`
 * (`true`), dan React tahu keduanya berbeda TANPA perlu efek: hidrasi sudah
 * membedakan keduanya sejak awal.
 *
 * `subscribe` mengembalikan fungsi kosong karena nilainya tak pernah berubah
 * sesudah hidrasi — tak ada yang perlu didengarkan.
 *
 * ── Nama
 *
 * "Terpasang", bukan "mounted": berkas-berkas lain di repo ini memakai bahasa
 * Indonesia untuk nama domain, dan hook ini akan dipakai berdampingan dengan
 * `useIzin`, `useTabUrl`, `useAngkaBergerak`.
 */

import { useSyncExternalStore } from "react";

/** Tak ada yang perlu didengarkan — nilainya tetap sesudah hidrasi. */
const langganan = () => () => {};
const diKlien = () => true;
const diServer = () => false;

/**
 * `false` pada render server & hidrasi pertama, `true` sesudahnya.
 *
 * Pakai untuk menahan isi yang HANYA sah di peramban:
 *
 *     const terpasang = useTerpasang();
 *     if (!terpasang) return null;
 *     return createPortal(<Dialog />, document.body);
 */
export function useTerpasang(): boolean {
  return useSyncExternalStore(langganan, diKlien, diServer);
}

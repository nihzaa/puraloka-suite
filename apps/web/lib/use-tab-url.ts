"use client";

// ============================================================================
// TAB YANG HIDUP DI URL — supaya sub-menu bisa menunjuknya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-07: **96 item menu masih berbagi 21 href**. Yang terbesar
// justru halaman yang SUDAH punya tab lengkap:
//
//     /estimasi   11 item menu   6 tab (katalog · harga · komposer · rap …)
//     /laporan     8 item menu   9 tab (ringkasan · wip · pajak · mandor …)
//     /akuntansi   2 item menu   5 tab (akun · jurnal · besar · neraca …)
//
// Jadi "Analisa Varians", "Price Book", dan "Cost Code / CBS" semuanya
// mendarat di `/estimasi` dengan tab **Komposer** terbuka — bukan di tab yang
// mereka janjikan. Isinya ADA, hanya satu klik lagi, tapi orang harus menebak
// tab mana. Itu cukup untuk membuat sub-menu terasa tak bisa dipercaya.
//
// Sebabnya sederhana: tab disimpan di `useState`, dan `useState` tak bisa
// ditunjuk dari luar. Nol halaman di repo ini membaca tab dari URL.
//
// ── Yang berubah dengan hook ini
//
//   • `/estimasi?tab=harga` membuka tab Harga — jadi menu bisa menunjuknya
//   • tombol "back" peramban mengembalikan tab sebelumnya
//   • tab yang sedang dibuka bisa DISALIN dan dikirim ke orang lain
//
// Yang ketiga sering diremehkan: "lihat analisa varians proyek ini" yang tak
// bisa ditautkan harus disampaikan sebagai instruksi klik.
//
// ── Kenapa `replace`, bukan `push`
//
// Berpindah tab bukan berpindah halaman. Dengan `push`, menekan "back" lima
// kali hanya memutar ulang tab yang tadi dibuka — dan orang mengira aplikasinya
// macet. `replace` membuat "back" mengembalikan mereka ke halaman sebelumnya,
// yang memang yang diharapkan.
//
// ── Nilai tak dikenal diabaikan, bukan dijadikan galat
//
// `?tab=ngawur` memakai nilai awal. URL datang dari luar — dari tautan lama,
// dari salin-tempel yang terpotong, dari mesin pencari — dan halaman yang
// menampilkan galat karena satu parameter salah lebih buruk daripada halaman
// yang membuka tab pertamanya.
//
// ⚠️ Halaman yang memakai hook ini WAJIB dibungkus `<Suspense>`.
// `useSearchParams` memaksa render sisi klien, dan tanpa batas Suspense
// `pnpm build` gagal saat prerender. Sudah pernah terjadi di `/jadwal`.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Tab yang tersimpan di query string (`?tab=...`).
 *
 * @param sah      daftar nilai yang diterima — nilai di luar ini diabaikan
 * @param awal     tab saat URL tak menyebutkannya
 * @param nama     nama parameter (default `"tab"`)
 * @returns `[tab, setTab]` — sama seperti `useState`, jadi pemanggil tak perlu
 *          berubah selain menukar barisnya
 */
export function useTabUrl<T extends string>(
  sah: readonly T[],
  awal: T,
  nama = "tab",
): [T, (t: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const dariUrl = params.get(nama);
  const cocok = dariUrl && (sah as readonly string[]).includes(dariUrl)
    ? (dariUrl as T)
    : null;

  const [tab, setTabState] = useState<T>(cocok ?? awal);

  // URL adalah sumbernya, bukan salinan. Tanpa efek ini, menekan "back" akan
  // mengubah URL tapi meninggalkan tab pada nilai lamanya — dua sumber
  // kebenaran yang berselisih, dan yang terlihat adalah yang salah.
  useEffect(() => {
    /*
      MENYINKRONKAN state dengan URL — persis tugas effect.

      Tab yang aktif hidup di dua tempat: query URL (supaya bisa di-bookmark
      dan di-share) dan state React. Effect ini menarik yang kedua mengikuti
      yang pertama saat URL berubah dari luar — tombol Back, tautan dalam,
      atau muat ulang.

      Penjaganya `cocok !== tab`: tanpa perbedaan, tak ada setState, jadi
      render berjenjang yang dicegah aturan v7 tak bisa terjadi.
    */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cocok && cocok !== tab) setTabState(cocok);
  }, [cocok, tab]);

  const setTab = useCallback((t: T) => {
    setTabState(t);
    const q = new URLSearchParams(Array.from(params.entries()));
    q.set(nama, t);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [router, pathname, params, nama]);

  return [tab, setTab];
}

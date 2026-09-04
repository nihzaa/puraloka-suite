"use client";

// ============================================================================
// MUAT MENU — satu permintaan bersama, dengan ETag
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-09-05 terhadap produksi, berpindah lima halaman:
//
//     total panggilan /api/v1/menu : 9      (sampai 3x per halaman)
//     ukuran satu balasan          : 59,5 KB
//     total terkirim               : 536 KB
//
// Untuk data yang IDENTIK di seluruh aplikasi. Tiga komponen memanggilnya
// sendiri-sendiri — `judul-bagian`, `remah-halaman`, dan `sidebar` — dan
// ketiganya dirender bersamaan di tiap halaman dashboard.
//
// Bagi staf kantor berjaringan kabel itu tak terasa. Bagi mandor di lapangan
// dengan sinyal 3G dan kuota terbatas, tiap perpindahan halaman membuang
// ~120 KB percuma, dan menu adalah permintaan TERBERAT di 8 dari 10 halaman
// yang diukur (800ms – 1,7 detik).
//
// ── Yang sudah ada dan tak pernah dipakai
//
// `MENU_ETAG_KEY` sudah dideklarasikan di `lib/api.ts` sejak lama, dan
// `logout()` rajin menghapusnya. Tapi tak ada satu baris pun yang MENULIS
// atau MEMBACA-nya. Servernya sendiri sudah siap — diukur langsung:
//
//     tanpa If-None-Match : HTTP 200 · 60.957 byte
//     dengan If-None-Match: HTTP 304 · 0 byte
//
// Jadi penghematannya bukan sesuatu yang perlu dibangun, cuma disambungkan.
// Bentuk yang sama dengan `useData` yang dibangun lalu tak dipakai satu
// halaman pun selama berhari-hari.
//
// ── Dua lapis, bukan satu
//
//   1. PENYATU permintaan — tiga komponen yang meminta bersamaan berbagi
//      SATU promise. Ini yang memangkas 3 panggilan jadi 1.
//   2. ETag — panggilan yang tersisa membalas 304 tanpa muatan bila menu tak
//      berubah. Ini yang memangkas 59,5 KB jadi nol.
//
// Lapis pertama saja tak cukup: pindah halaman tetap memicu permintaan baru.
// Lapis kedua saja tak cukup: tiga permintaan 304 tetap tiga bolak-balik
// jaringan, dan di 3G tiap bolak-balik ratusan milidetik.
//
// ── Yang SENGAJA tidak dilakukan
//
// Menu TIDAK disimpan selamanya di memori proses. Katalog menu berbeda
// per-perusahaan (`company_menu_settings`), dan pengguna bisa berganti
// perusahaan tanpa memuat ulang halaman. Cache yang tak pernah kedaluwarsa
// akan menampilkan menu perusahaan sebelumnya — tanpa galat, tanpa gejala.
// Karena itu penyatuan hanya berlaku selama permintaan itu BERJALAN.
// ============================================================================

import { api, MENU_CACHE_KEY, MENU_ETAG_KEY } from "@/lib/api";

export interface NodeMenuRingkas {
  key?: string;
  href?: string | null;
  label?: string;
  icon?: string | null;
  children?: NodeMenuRingkas[];
}

/** Permintaan yang sedang berjalan — dibagi ke semua pemanggil bersamaan. */
let sedangJalan: Promise<unknown[]> | null = null;

/** Baca cache tanpa menyentuh jaringan. Dipakai untuk render pertama. */
export function menuDariCache<T = NodeMenuRingkas>(): T[] | null {
  if (typeof window === "undefined") return null;
  try {
    const c = localStorage.getItem(MENU_CACHE_KEY);
    if (!c) return null;
    const d = JSON.parse(c);
    return Array.isArray(d) ? (d as T[]) : null;
  } catch {
    return null; // cache rusak bukan alasan halaman gagal
  }
}

/**
 * Ambil menu: satu permintaan bersama, ber-ETag, hasilnya ditulis ke cache.
 *
 * Tak pernah melempar — menu yang gagal dimuat bukan alasan halaman gagal.
 * Pemanggil yang butuh tahu bisa membandingkan hasilnya dengan cache.
 */
export function muatMenu<T = NodeMenuRingkas>(): Promise<T[]> {
  if (sedangJalan) return sedangJalan as Promise<T[]>;

  /*
    ETag hanya dikirim kalau MUATANNYA benar-benar ada di tangan.

    Kehati-hatian ini diambil dari `sidebar.tsx`, yang sudah memakai ETag
    dengan benar sejak lama: mengirim ETag tanpa punya cache berarti meminta
    304 lalu tak punya apa pun untuk ditampilkan — menu kosong tanpa satu pun
    pesan galat. Bisa terjadi kalau cache terhapus (kuota penuh, mode privat)
    sementara ETag-nya selamat.
  */
  const punyaCache = menuDariCache() !== null;
  const etag = punyaCache
    ? (() => { try { return localStorage.getItem(MENU_ETAG_KEY); } catch { return null; } })()
    : null;

  sedangJalan = api
    .get("/api/v1/menu", {
      headers: etag ? { "If-None-Match": etag } : undefined,
      /*
        304 BUKAN kegagalan. Tanpa baris ini axios melemparnya sebagai galat,
        `catch` di bawah menelannya, dan menu jatuh ke daftar kosong — halaman
        kehilangan judul dan breadcrumb justru saat cache-nya paling segar.
      */
      validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
    })
    .then((r) => {
      if (r.status === 304) {
        return menuDariCache() ?? [];
      }
      const data = r.data as unknown;
      const daftar = Array.isArray(data)
        ? data
        : ((data as { menu?: unknown[] })?.menu ?? []);

      try {
        localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(daftar));
        const et = r.headers?.etag ?? (r.headers as Record<string, string>)?.["etag"];
        if (et) localStorage.setItem(MENU_ETAG_KEY, et);
      } catch { /* kuota localStorage penuh: menu tetap terpakai kali ini */ }

      return daftar;
    })
    .catch(() => menuDariCache() ?? [])
    .finally(() => { sedangJalan = null; });

  return sedangJalan as Promise<T[]>;
}

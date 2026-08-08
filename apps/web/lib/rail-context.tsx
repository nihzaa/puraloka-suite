"use client";

/**
 * KONTEKS RAIL — jembatan dari HALAMAN ke SHELL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KONTEKS, BUKAN PROP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-08: rail harus **menempel di kanan, setinggi layar, dan
 * TIDAK ikut ter-scroll** saat halaman digulung.
 *
 * Itu mustahil selama rail berada di dalam `<main>` yang scroll — elemen
 * `position: sticky` hanya menempel di dalam wadah scroll-nya sendiri, dan
 * wadah itulah yang bergerak. Jadi rail harus jadi **kolom sejajar `<main>`
 * di `layout.tsx`**, bukan anak halaman.
 *
 * Tapi ISI rail ditentukan halaman (kalender di beranda, sesuatu yang lain di
 * halaman kas). Halaman berada JAUH di bawah layout dalam pohon React, jadi
 * ia tak bisa mengirim prop ke atas. Konteks adalah jalur yang benar.
 *
 * ── Kenapa bukan portal
 *
 * `createPortal` juga bisa. Ditolak karena isinya harus ikut menentukan
 * apakah kolomnya DIRENDER sama sekali: halaman tanpa rail tak boleh
 * menyisakan kolom kosong 300px. Dengan portal, layout tak pernah tahu
 * apakah ada yang akan mengisi — dan kolom kosong itu persis cacat yang
 * dihindari `HalamanIkhtisar` sejak awal.
 *
 * ── Halaman mana yang punya rail
 *
 * Keputusan founder 2026-08-08: **halaman dashboard saja** (beranda + 8 induk
 * grup). Halaman DAFTAR tetap lebar penuh — 300px yang tak berarti apa-apa di
 * dashboard akan memotong tabel 12 kolom di laptop 1366px, dan itu halaman
 * kerja harian.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";

interface NilaiRail {
  isi: ReactNode | null;
  /** Dipanggil halaman saat mount; `null` saat unmount. */
  pasang: (isi: ReactNode | null) => void;
}

const KonteksRail = createContext<NilaiRail | null>(null);

export function PenyediaRail({ children }: { children: ReactNode }) {
  const [isi, setIsi] = useState<ReactNode | null>(null);
  const pasang = useCallback((nilai: ReactNode | null) => setIsi(nilai), []);
  const nilai = useMemo(() => ({ isi, pasang }), [isi, pasang]);
  return <KonteksRail.Provider value={nilai}>{children}</KonteksRail.Provider>;
}

/** Dipakai `layout.tsx` untuk merender kolomnya. */
export function useIsiRail(): ReactNode | null {
  return useContext(KonteksRail)?.isi ?? null;
}

/**
 * Dipakai HALAMAN untuk mengisi rail.
 *
 * `deps` wajib disebut pemanggil — isi rail biasanya bergantung data yang
 * datang belakangan, dan tanpa deps yang benar rail membeku pada render
 * pertama (saat datanya masih null) lalu tak pernah diperbarui.
 */
export function usePasangRail(isi: ReactNode | null, deps: readonly unknown[]) {
  const ctx = useContext(KonteksRail);
  const pasang = ctx?.pasang;

  useEffect(() => {
    if (!pasang) return;
    pasang(isi);
    // Dikosongkan saat halaman ditinggalkan. Tanpa ini, rail halaman
    // SEBELUMNYA tetap terpasang di halaman berikutnya yang tak punya rail —
    // dan isinya terlihat masuk akal, jadi cacatnya tak kentara.
    return () => pasang(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasang, ...deps]);
}

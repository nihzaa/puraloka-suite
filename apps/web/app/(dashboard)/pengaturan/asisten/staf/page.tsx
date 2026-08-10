"use client";

/**
 * Asisten staf — satu asisten, satu halaman.
 *
 * Isinya di `_bersama/kartu-asisten.tsx`: sebelum pemecahan keempat asisten
 * dirender dari SATU `.map()`, jadi perilakunya dijamin sama. Menyalin
 * JSX-nya ke empat berkas akan membuang jaminan itu.
 *
 * Kunci datanya `staff` (kontrak API `/ai/config/:asisten`), slug rutenya
 * `staf` — kunci tak diterjemahkan karena mengubahnya berarti migrasi data.
 */

import { KartuAsisten } from "../_bersama/kartu-asisten";

export default function Halaman() {
  return <KartuAsisten asisten="staff" />;
}

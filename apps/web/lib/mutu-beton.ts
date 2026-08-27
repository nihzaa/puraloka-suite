/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PADANAN MUTU BETON K ↔ f'c — sisi WEB
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ Berkas ini KEMBARAN dari `apps/api/src/lib/struktur-mutu-nyata.ts`.
 *
 * Duplikasi ini disengaja dan TIDAK disukai. Alasannya: `apps/web` tak boleh
 * mengimpor dari `apps/api`, dan `packages/shared` terdaftar di workspace
 * tetapi KOSONG (CLAUDE.md §4).
 *
 * Yang menahannya tetap sama adalah penjaga CI
 * `apps/api/scripts/audit-mutu-beton-sepakat.mjs` — ia membandingkan konstanta
 * dan tabel padanan di kedua berkas, dan MERAH kalau menyimpang.
 *
 * Kenapa itu penting: kalau faktor di satu sisi disesuaikan, angka K di layar
 * tak lagi cocok dengan f'c yang dipakai menghitung — dan yang membaca layar
 * akan memesan beton kelas yang salah tanpa satu pun gejala.
 *
 * Kalau `packages/shared` suatu saat diisi, pindahkan keduanya ke sana dan
 * hapus penjaganya.
 */

export const KG_CM2_PER_MPA = 10.197;
export const FAKTOR_KUBUS_KE_SILINDER = 0.83;

/** MPa (silinder) → kg/cm² (kubus). */
export function silinderKeKubusKgCm2(mpa: number): number {
  return (mpa * KG_CM2_PER_MPA) / FAKTOR_KUBUS_KE_SILINDER;
}

/*
  Padanan kelas SNI ↔ K yang lazim dipakai di lapangan Indonesia.

  BUKAN hasil pembagian: fc 20/25/30/35 adalah kelas SILINDER baku SNI 2847,
  yang sudah punya padanan K konvensional sendiri. Menghitungnya balik
  menghasilkan angka yang tak bisa dipesan ke batching plant mana pun
  (fc 30 → K-369).
*/
const PADANAN_SNI: ReadonlyArray<readonly [number, number]> = [
  [15, 175], [17.5, 200], [20, 250], [25, 300], [30, 350], [35, 400], [40, 450],
];

const KELAS_K = [100, 125, 150, 175, 200, 225, 250, 275, 300, 350, 400, 450, 500];

/**
 * f'c (MPa) → label mutu K yang bisa dibaca orang lapangan.
 *
 * `"K-350"` untuk kelas baku SNI, `"~K-230"` untuk nilai di luar daftar.
 * Tanda ~ memberi tahu pembacanya bahwa angka itu TURUNAN, bukan kelas yang
 * tertulis di dokumen pesanan.
 */
export function labelK(fcMpa: number): string | null {
  if (!Number.isFinite(fcMpa) || fcMpa <= 0) return null;

  for (const [fc, k] of PADANAN_SNI) {
    if (Math.abs(fcMpa - fc) < 0.05) return `K-${k}`;
  }

  const k = silinderKeKubusKgCm2(fcMpa);
  const dekat = KELAS_K.reduce((a, b) => (Math.abs(b - k) < Math.abs(a - k) ? b : a));
  if (Math.abs(dekat - k) / dekat <= 0.04) return `~K-${dekat}`;
  return `~K-${Math.round(k)}`;
}

/**
 * Tampilan mutu beton lengkap: `"25 MPa (K-300)"`.
 *
 * MPa tetap di DEPAN — itu angka yang benar-benar masuk rumus (SNI 2847) dan
 * yang tertulis di lembar bertanda tangan. Menaruh K di depan membuat orang
 * mengira K yang masuk rumus, lalu mengetik 300 ke medan f'c: beton dianggap
 * hampir 15× lebih kuat.
 */
export function tampilMutuBeton(fcMpa: number): string {
  if (!Number.isFinite(fcMpa) || fcMpa <= 0) return String(fcMpa);
  const k = labelK(fcMpa);
  const angka = Math.round(fcMpa * 100) / 100;
  return k ? `${angka} MPa (${k})` : `${angka} MPa`;
}

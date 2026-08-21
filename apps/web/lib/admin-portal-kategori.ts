import { PETA_MENU, type GrupMenu } from "@/lib/peta-menu";

// ============================================================================
// Kategori "Lainnya" — Portal Admin/Direktur. Tahap 0 (Task 1).
//
// Pola IDENTIK `pm-portal-kategori.ts` — jangan didesain ulang. Kategori
// yang SUDAH punya halaman portal admin dibangun, diisi manual satu-per-satu
// tiap Tahap selesai membangun grup itu — BUKAN dihitung dari permission live
// (lib/peta-menu.ts tidak menyimpan field permission per grup).
// ============================================================================

/**
 * Kategori yang admin/direktur punya minimal satu permission di dalamnya —
 * dipakai halaman "Lainnya" supaya kategori kosong tak pernah tampil.
 *
 * Permission per-item BELUM dicek di sini (itu terjadi saat halaman modulnya
 * sendiri dibuka, lewat requirePermission API) — fungsi ini hanya menyaring
 * KATEGORI yang relevan secara kasar, dari daftar modul yang plan ini bangun
 * (Tahap 1-7, lihat docs/superpowers/plans/
 * 2026-08-22-portal-admin-direktur-lengkap.md).
 *
 * Tahap 0 (Task 1): KOSONG — belum ada halaman portal admin yang dibangun
 * sama sekali. Diisi progresif tiap Tahap berikutnya, sama seperti
 * `pm-portal-kategori.ts`.
 */
const KATEGORI_AKTIF: string[] = []; // Tahap 0

export function kategoriUntukAdmin(): GrupMenu[] {
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}

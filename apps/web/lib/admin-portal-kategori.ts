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
 * Diisi manual satu-per-satu tiap Tahap selesai membangun grup itu — BUKAN
 * dihitung dari permission live (lib/peta-menu.ts tidak menyimpan field
 * permission per grup). Pola identik `pm-portal-kategori.ts`, jangan
 * didesain ulang.
 *
 * Tahap 1 (Task 3-4): "Laporan & BI" (g-laporan, item bi-eksekutif —
 * Dashboard Eksekutif jadi Beranda admin-portal) dan "Administrasi"
 * (g-sistem, item sy-inbox-approval — Menunggu Persetujuan) — KEDUA GRUP
 * diaktifkan meski Task 3/4 baru membangun SATU item di masing-masing;
 * item lain grup itu yang statusnya 'hidup' ikut tampil dengan fallback
 * href web (lihat `PETA_HREF_PORTAL` di `kategori/[key]/page.tsx` dan
 * catatan Task 5 Step 1).
 */
const KATEGORI_AKTIF: string[] = ["g-laporan", "g-sistem"]; // Tahap 1

export function kategoriUntukAdmin(): GrupMenu[] {
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}

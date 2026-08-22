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
 *
 * Tahap 2 (Task 7-11): "Kontrak" (g-kontrak, 12 item di `peta-menu.ts`
 * baris 121-136 — 8 punya halaman admin-portal sungguhan: kt-register,
 * kt-asuransi, kt-co, kt-eot, kt-ld, kt-bond, kt-claims, kt-surat; 4
 * sisanya — kt-termin, kt-retensi, kt-rfi, kt-subkon — di luar scope
 * Task 6-11, jatuh ke fallback href web) dan "Perencanaan" (g-jadwal,
 * 11 item di baris 138-152 — 4 punya halaman admin-portal, SEMUANYA
 * menunjuk satu halaman `/admin-portal/jadwal` yang ber-SegmentedTab
 * 4-arah (Task 11): jd-cpm (tab "Jalur Kritis"), jd-histogram (tab
 * "Sumber Daya"), jd-method (tab "Method Statement"), jd-baseline (tab
 * "Baseline") — pola identik web sendiri di mana `/jadwal?bagian=cpm`
 * dan `/jadwal?bagian=histogram` juga satu halaman yang sama (lihat
 * `href` jd-cpm/jd-histogram/jd-method di peta-menu.ts, semuanya
 * `/jadwal` dengan query berbeda). jd-delay dapat halamannya sendiri
 * (`/admin-portal/jadwal/keterlambatan`). Sisanya — jd-wbs, jd-gantt,
 * jd-kurva-s, jd-lookahead, jd-milestone, jd-evm — fallback href web,
 * karena keenamnya sudah punya jalur sendiri di halaman detail proyek
 * web (`tabProyek`) yang belum direplikasi ke admin-portal. Proyek
 * TIDAK di sini — bukan grup `peta-menu.ts` tersendiri, diakses lewat
 * NAV_ITEMS langsung (`admin-portal/layout.tsx`, href
 * /admin-portal/proyek).
 */
const KATEGORI_AKTIF: string[] = ["g-laporan", "g-sistem", "g-kontrak", "g-jadwal"]; // Tahap 1-2

export function kategoriUntukAdmin(): GrupMenu[] {
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}

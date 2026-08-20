import { PETA_MENU, type GrupMenu } from "@/lib/peta-menu";

// ============================================================================
// Kategori "Lainnya" — Portal PM. Task 9.
//
// Sebelum Task 9, halaman Lainnya adalah satu grid datar dari SEMUA modul
// yang sudah dibangun (Task 6-8 + K3/Punch/Inspeksi/Submittal/dst dari sesi
// sebelum plan ini) — makin banyak modul ditambahkan, makin panjang grid itu
// tanpa struktur. Task 9 menggantinya dengan navigasi 2-level (kategori →
// modul) memakai struktur 20 kategori resmi `lib/peta-menu.ts`, DISARING ke
// kategori yang relevan untuk portal PM.
// ============================================================================

/**
 * Kategori yang PM punya minimal satu permission di dalamnya — dipakai
 * halaman "Lainnya" (Task 9) supaya kategori kosong tak pernah tampil.
 *
 * Permission per-item BELUM dicek di sini (itu terjadi saat halaman
 * modulnya sendiri dibuka, lewat requirePermission API) — fungsi ini
 * hanya menyaring KATEGORI yang relevan secara kasar, dari daftar modul
 * yang plan ini bangun (Tahap 1-7). Modul yang belum dibangun (status
 * bukan 'hidup' atau belum sempat dikerjakan tahap ini) TIDAK muncul —
 * daftarnya di-maintain manual di sini seiring tiap Tahap selesai
 * (idealnya via array MODUL_PM_DIBANGUN yang tumbuh tiap task, BUKAN
 * lewat pengecekan permission runtime yang lebih kompleks dari yang
 * dibutuhkan fase ini).
 *
 * Tahap 1 (Task 6-9): dua kelompok sudah punya halaman portal PM —
 * "Mandor & Subkon" (g-subkon, Task 6-8) dan "Operasi Lapangan"
 * (g-lapangan, dibangun sesi SEBELUM plan Portal PM Lengkap ini: K3,
 * Punch List, Inspeksi/RFI, Submittal). Kategori lain (Kontrak, Budget,
 * dst) BELUM dibangun di portal PM — JANGAN ditambahkan ke daftar ini
 * sampai tahap yang membangunnya selesai, supaya kategori kosong/
 * setengah-jadi tak pernah tampil ke PM di HP.
 */
const KATEGORI_AKTIF = ["g-subkon", "g-lapangan"]; // Tahap 1 — tambah tiap tahap

export function kategoriUntukPm(): GrupMenu[] {
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}

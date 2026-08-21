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
 * Punch List, Inspeksi/RFI, Submittal).
 *
 * Tahap 2 (Task 11-16): dua kelompok lagi ditambahkan — "Kontrak"
 * (g-kontrak, Task 12-14: register, asuransi, klaim, EOT/LD/bond, surat)
 * dan "Perencanaan" (g-jadwal, Task 15: dua tab tambahan — histogram &
 * method statement — ditempel ke halaman `jadwal` yang sudah ada sejak
 * Tahap 1, plus analisa keterlambatan).
 *
 * Tahap 3 (Task 18-22): tiga kelompok lagi — "Budget & Cost Control"
 * (g-cost, Task 18-21: RAB, RAP, Markup, Kurva-S/EVM, Change Order,
 * Cashflow Forecast, Varians, Contingency), "Master Data" (g-master,
 * Task 18-19: AHSP/Master Resource, Price Book, Template WBS) dan
 * "Pra-Konstruksi" (g-crm, key `crm-*` menunjuk halaman g-cost/g-master
 * yang sama — estimating/BOQ/skenario/markup semuanya satu alur dengan
 * RAB & AHSP). Ketiganya diaktifkan BERSAMA karena key `md-*`/`crm-*`
 * menunjuk halaman portal yang sama dengan `cc-*` (lihat `PETA_HREF_PORTAL`
 * di `app/pm-portal/kategori/[key]/page.tsx`) — mengaktifkan `g-cost` saja
 * akan menyisakan `md-*`/`crm-*` fallback ke web padahal versi portalnya
 * sudah ada.
 *
 * Tahap 4 (Task 24-26): "Pengadaan" (g-procurement, Task 24 membangun
 * halamannya di `EKSTRA_PORTAL["g-lapangan"].px-procurement`, Task 26
 * MENGAKTIFKAN kategori resminya sendiri di sini supaya sembilan key `pr-*`
 * — MR, RFQ, tabulasi, PO, kontrak payung, GR, 3-way match, evaluasi vendor,
 * jadwal bayar, expediting — muncul di navigasi 2-level yang sama seperti
 * grup lain, bukan cuma lewat pintu belakang `px-procurement` di "Operasi
 * Lapangan"). `px-procurement` TETAP ada (tak dihapus — dua pintu ke
 * halaman yang sama bukan masalah, pola sama dengan `md-gudang`/`iv-gudang`
 * di Tahap 4 Task 25 dan `cc-*`/`crm-*`/`md-*` kembar di Tahap 3).
 * "Gudang & Material" (g-inventory, Task 25: ikhtisar, kelola lokasi, kartu
 * stok, transfer, rekonsiliasi) diaktifkan Task 25. Bukan seluruh key
 * `g-inventory`/`g-procurement` punya halaman portal PM tersendiri — lihat
 * `PETA_HREF_PORTAL` di `kategori/[key]/page.tsx` untuk yang mana dipetakan
 * dan yang mana sengaja dibiarkan fallback ke web (`iv-opname`/`iv-minstok`/
 * `gd-susut` dari Tahap 4 g-inventory; `pr-rfq`/`pr-tabulasi`/`pr-blanket`/
 * `pr-evaluasi`/`pr-expediting` dari g-procurement — semua dicatat sebagai
 * keputusan sengaja dengan alasan tertulis, bukan kelalaian, di
 * `PETA_HREF_PORTAL`).
 *
 * Kategori lain (Keuangan lanjutan, HSE, dst) BELUM dibangun di portal PM —
 * JANGAN ditambahkan ke daftar ini sampai tahap yang membangunnya selesai,
 * supaya kategori kosong/setengah-jadi tak pernah tampil ke PM di HP.
 */
const KATEGORI_AKTIF = ["g-subkon", "g-lapangan", "g-kontrak", "g-jadwal", "g-cost", "g-master", "g-crm", "g-inventory", "g-procurement"]; // Tahap 1-4

export function kategoriUntukPm(): GrupMenu[] {
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}

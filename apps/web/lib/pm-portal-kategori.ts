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
 * `pr-evaluasi`/`pr-expediting`/`pr-3way`/`pr-jadwal-bayar` dari
 * g-procurement — semua dicatat sebagai keputusan sengaja dengan alasan
 * tertulis, bukan kelalaian, di `PETA_HREF_PORTAL`. `pr-3way`/
 * `pr-jadwal-bayar` KHUSUSNYA ditambahkan ke daftar fallback ini sesudah
 * koreksi review Task 26 [Critical] — draf awal SALAH memetakan keduanya
 * ke `/pm-portal/procurement`, halaman yang TIDAK memuat kedua konsep itu
 * sama sekali, diverifikasi grep menyeluruh tanpa hasil).
 *
 * Tahap 5 (Task 28-30): "Rencana & Uji Mutu" (g-qaqc, BARU diaktifkan Task
 * 30) — `qc-rencana`/`qc-itp` ke halaman RMP+ITP gabungan (Task 30 Step 2-3),
 * `qc-uji` ke Hasil Uji Material (Task 30 Step 4), `qc-ncr` sudah dipetakan
 * Task 29. `qc-checklist`/`qc-capa`/`mutu-pelajaran`/`qc-audit` SENGAJA TIDAK
 * dipetakan — lihat catatan panjang di `PETA_HREF_PORTAL` (`kategori/[key]/
 * page.tsx`) untuk alasan masing-masing (checklist CRUD level-tiga di luar
 * scope, capa/pelajaran ranah CECEP bukan Mutu&K3 — Task 27 Temuan #6, audit
 * di luar 4 modul brief — Task 27 Temuan #4). Tiga entri grup AKTIF lama
 * (`lp-permit`/`sk-kepatuhan`/`sk-evaluasi`) juga diperbarui Task 30 dari
 * fallback web ke halaman portal Kepatuhan (Task 28), dan `lp-ncr` ke
 * `/pm-portal/mutu/ncr` (sudah dipetakan Task 29, tak berubah).
 *
 * Tahap 6 (Task 37): dua kelompok lagi ditambahkan — "Keuangan" (g-keuangan,
 * Task 32-36: Dashboard Keuangan, Register Piutang, Sertifikat IPC, Kas &
 * Pengeluaran, Buku Besar/Jurnal, Rekonsiliasi Bank) dan "Penagihan"
 * (g-tagih, key `tg-ipc`/`tg-nota-kredit`/`tg-retensi`/`tg-uangmuka` menunjuk
 * halaman portal yang sama dengan sebagian `g-keuangan` — lihat
 * `PETA_HREF_PORTAL` di `app/pm-portal/kategori/[key]/page.tsx`). Koreksi
 * juga terhadap catatan Tahap 4 di atas: `pr-blanket`/`pr-expediting`
 * (g-procurement) SEKARANG py halaman portal sendiri
 * (`/pm-portal/keuangan/pengadaan-lanjutan`, Task 36) — bukan lagi bagian
 * daftar fallback sengaja. HANYA `pr-rfq`/`pr-tabulasi`/`pr-evaluasi` yang
 * TETAP fallback web dengan alasan lama (tabel lebar multi-vendor tak cocok
 * kartu mobile).
 *
 * Tahap 7 (Task 39): "SDM & Payroll" (g-hr) diaktifkan — TIGA halaman baru
 * dibangun (Timesheet, Kompetensi & Rekrutmen dengan tiga tab, Cuti & Izin),
 * dipetakan lewat `hr-absensi`/`hr-cuti`/`hr-sertifikasi`/`hr-rekrutmen`/
 * `hr-kinerja` di `PETA_HREF_PORTAL` (`kategori/[key]/page.tsx`). Enam key
 * `g-hr` LAIN (`hr-karyawan`, `hr-payroll`, `hr-upah`, `hr-bpjs`, `hr-pph21`,
 * `hr-reimburse`) TIDAK dibangun Task 39 — TIDAK dipetakan, jatuh ke fallback
 * `it.href` web (`/users`, `/sdm/payroll`, `/mandor/upah`,
 * `/pengaturan/tarif-payroll` ×2, `/sdm/klaim-perjalanan`), pola sama dengan
 * key belum-dipetakan di kategori lain (lihat catatan Tahap 1-6 di atas).
 *
 * Tahap 7 (Task 40): "Alat & Aset" (g-aset) diaktifkan — DUA halaman baru
 * dibangun (register 3-tab: Register/Sewa/Perawatan Mendesak, dan detail
 * 2-tab: Ringkas/Penyusutan), dipetakan lewat `as-register`/`as-mutasi`/
 * `as-penyusutan`/`as-sewa`/`as-utilisasi`/`as-maintenance`/`as-opex`/
 * `as-gl` di `PETA_HREF_PORTAL` (`kategori/[key]/page.tsx`) — kedelapan key
 * grup ini SEMUA menunjuk `/pm-portal/aset` (satu halaman register yang
 * memuat register+mutasi+penyusutan+sewa+utilisasi sebagai tab/aksi di
 * dalamnya, sama pola `md-resource`/`crm-estimating` Tahap 3 yang
 * sama-sama menunjuk satu halaman `cecep/ahsp`), KECUALI `as-sewa` yang
 * menunjuk `/pm-portal/aset?tab=sewa` (langsung membuka tab Sewa, mengikuti
 * `href` aslinya di `lib/peta-menu.ts` baris 284) dan `as-maintenance`/
 * `as-opex`/`as-gl` yang menunjuk `/pm-portal/aset/[id]` TIDAK BISA
 * langsung dari daftar kategori (butuh memilih aset dulu) — ketiganya tetap
 * diarahkan ke `/pm-portal/aset` sebagai pintu masuk, sama seperti
 * `iv-gudang`/`md-gudang` Tahap 4 yang menunjuk ikhtisar dulu sebelum detail.
 *
 * Tahap 7 (Task 41): "Risiko & Kepatuhan" (g-risiko) diaktifkan — SATU
 * halaman baru dibangun (`/pm-portal/risiko`, dua tab: Register Risiko +
 * Perizinan), dipetakan lewat `rk-register`/`rk-mitigasi`/`rk-perizinan` di
 * `PETA_HREF_PORTAL` (ketiganya menunjuk satu halaman — mitigasi adalah tab
 * DI DALAM tab Risiko per baris, bukan halaman sendiri, sama pola
 * `qc-rencana`/`qc-itp` Tahap 5). `rk-kepatuhan` DAN `rk-sengketa` SENGAJA
 * TIDAK dipetakan: `rk-kepatuhan` sudah menunjuk `/kepatuhan?bagian=dokumen`
 * yang SAMA dengan `kep-dokumen` (fallback web memadai, modul ini bukan
 * scope Task 41). `rk-sengketa` TIDAK BOLEH dipetakan sama sekali — riset
 * Task 38 dikonfirmasi ULANG lewat query live `role_permissions`: KEDUA
 * baris role `pm` (global + tenant) NOL baris grant untuk `sengketa:view`
 * MAUPUN `sengketa:manage`. PM genuinely tak punya izin modul itu; fallback
 * web-nya (`/risiko/sengketa`) akan selalu 403 bagi PM, sama seperti klik
 * mengetik URL langsung — bukan cacat navigasi Task 41, karena modul itu
 * tetap `it.href` apa adanya (tak dihapus dari `peta-menu.ts`, hanya tak
 * ditambah entri portal untuknya).
 *
 * Tahap 7 (Task 41) juga menambahkan `md-klien` (grup `g-master`, SUDAH
 * aktif sejak awal) ke `PETA_HREF_PORTAL` → `/pm-portal/klien` (list +
 * detail, READ-ONLY: PM punya `clients:view` tapi bukan `clients:manage`).
 * Sebelumnya key ini fallback ke `it.href` web (`/klien`, form admin) —
 * sekarang menunjuk versi portal PM yang tanpa tombol tambah/edit.
 *
 * Kategori lain (Audit Trail lintas-modul, dst) BELUM dibangun di portal
 * PM — JANGAN ditambahkan ke daftar ini sampai tahap yang membangunnya
 * selesai, supaya kategori kosong/setengah-jadi tak pernah tampil ke PM
 * di HP.
 */
const KATEGORI_AKTIF = ["g-subkon", "g-lapangan", "g-kontrak", "g-jadwal", "g-cost", "g-master", "g-crm", "g-inventory", "g-procurement", "g-qaqc", "g-keuangan", "g-tagih", "g-hr", "g-aset", "g-risiko"]; // Tahap 1-7

export function kategoriUntukPm(): GrupMenu[] {
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}

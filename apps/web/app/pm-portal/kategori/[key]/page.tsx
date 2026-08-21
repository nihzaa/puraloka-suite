"use client";

// ============================================================================
// Detail Kategori — Portal PM. Task 9. Menampilkan daftar modul (ItemMenu) di
// dalam satu kategori, hanya yang status 'hidup' (§1 spec — modul belum
// hidup dilewati, bukan ditampilkan sebagai coming-soon).
// ============================================================================

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Building2, ShieldAlert,
  FileText, ShoppingCart, LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PETA_MENU } from "@/lib/peta-menu";
import EmptyState from "@/components/portal/EmptyState";
import { Folder } from "lucide-react";

/**
 * Peta href web (`/mandor/spk`, dst — key `ItemMenu` di `lib/peta-menu.ts`)
 * ke href portal PM (`/pm-portal/mandor-lengkap/spk`) — DIISI PROGRESIF tiap
 * Task menambah halaman baru. Item yang key-nya TAK ADA di sini masih
 * ditampilkan (status hidup di web), tapi tautannya ke path web asli sebagai
 * fallback sampai versi portalnya dibangun — BUKAN disembunyikan
 * (menyembunyikan modul yang PM tahu ada tapi belum bisa dibuka dari HP
 * lebih membingungkan daripada menautkannya ke web, meski itu bukan
 * pengalaman ideal, sampai tahap yang relevan selesai).
 *
 * Baris di bawah = SEMUA halaman portal PM yang sudah dibangun Task 6-8 dan
 * PUNYA key `ItemMenu` di grup `g-subkon`/`g-lapangan` (dikonfirmasi baca
 * ulang `lib/peta-menu.ts` + daftar direktori `app/pm-portal/`), bukan hanya
 * delapan contoh awal di draf plan sebelum riset Task 5 mengoreksinya:
 *   Task 6 — sk-paket (penugasan), sk-kasbon (kasbon), sk-opname (opname)
 *   Task 7 — sk-wo (spk), sk-tender (tender), sk-retensi (retensi),
 *            sk-backcharge (backcharge)
 *   Task 8 — sk-mandor (tukang)
 *   sk-settlement (mandor/upah settlement) dan tiga modul g-lapangan
 *   (lp-punch/lp-rfi/lp-submittal) dibangun SEBELUM plan Portal PM Lengkap
 *   ini, di sesi lain — tetap dipetakan di sini supaya tak jadi yatim
 *   sesudah grid datar diganti navigasi kategori.
 *   Mitra (Task 8) TIDAK di sini — key PETA_MENU-nya `md-subkon` tinggal di
 *   grup g-master (lihat EKSTRA_PORTAL di bawah untuk alasannya).
 *
 * Tahap 2 (Task 11-16, grup g-kontrak/g-jadwal, key persis dari
 * `lib/peta-menu.ts`, diverifikasi Task 11 riset + baca ulang saat Task 16):
 *   Task 12 — kt-register (register kontrak), kt-asuransi (register asuransi)
 *   Task 13 — kt-claims (klaim kontraktual), kt-eot/kt-ld/kt-bond (EOT, denda
 *             keterlambatan, register jaminan — satu halaman gabungan)
 *   Task 14 — kt-surat (surat masuk/keluar)
 *   Task 15 — jd-delay (analisa keterlambatan, halaman berdiri sendiri) dan
 *             dua tab BARU (histogram sumber daya, method statement) yang
 *             ditempel ke halaman `jadwal` yang SUDAH ADA sejak Tahap 1
 *             (jd-cpm/jd-histogram/jd-method/jd-milestone semua satu halaman,
 *             berbeda tab lewat SegmentedTab internal — bukan query string)
 *   kt-rfi TIDAK dibangun Task 12-15 — dipetakan ke `lp-rfi` yang sudah ada
 *   (Task 8/sebelum plan ini): RFI kontraktual (kt-rfi, ke konsultan) dan RFI
 *   lapangan (lp-rfi) beda modul di admin (lihat catatan kt-rfi di
 *   peta-menu.ts) tapi portal PM baru punya SATU halaman inspeksi/RFI —
 *   ditandai di sini, bukan diam-diam disamakan.
 *   kt-termin/kt-retensi/kt-subkon menunjuk halaman Tahap 1 yang SUDAH ADA
 *   (keuangan, retensi mandor-lengkap, penugasan) — bukan halaman baru
 *   Task 12-15, tapi key-nya baru aktif sekarang karena g-kontrak baru
 *   dinyalakan di KATEGORI_AKTIF.
 *   kt-co: UTANG, bukan selesai — lihat komentar di baris itu di bawah.
 *   jd-baseline SENGAJA TIDAK dipetakan: di peta-menu.ts key ini tak
 *   punya `href` sama sekali (hanya dicapai lewat /proyek/[id]/baseline,
 *   rute dinamis admin) — portal PM belum punya versi Tahap 2 ini, jadi
 *   fallback `it.href` jatuh ke `"#"` sebagaimana adanya sebelum Task 16.
 *
 * Tahap 3 (Task 18-22, grup g-cost/g-master/g-crm, key persis dari
 * `lib/peta-menu.ts`, diverifikasi baca ulang saat Task 22):
 *   Task 18 — cc-rab/crm-boq/crm-skenario/jd-wbs-terkait (RAB) ke
 *             cecep/rab, cc-rap/cc-revisi (RAP) ke cecep/rap
 *   Task 19 — md-resource/crm-estimating (AHSP/Master Resource) ke
 *             cecep/ahsp, md-price-book (Price Book) ke cecep/harga
 *   Task 20 — md-wbs/jd-wbs (Template WBS, dua key kembar yang sama-sama
 *             menunjuk /master/wbs di web) DIALIHKAN ke cecep/wbs, versi
 *             portal read-only Task 18 (PM punya cecep:cbs:view tapi bukan
 *             :manage — tombol "Terapkan" sengaja tak ada di sana),
 *             crm-markup (Markup & Margin) ke cecep/markup
 *   Task 21 — cc-etc/cc-bac/jd-gantt/jd-kurva-s/jd-evm (Kurva-S/EVM) ke
 *             cecep/kurva-s, cc-cashflow (Proyeksi Kas) ke cecep/kas,
 *             cc-varians (Analisa Varians) ke cecep/varians,
 *             cc-contingency (Contingency) ke cecep/contingency
 *   kt-co: UTANG Task 16 SEKARANG DILUNASI — Change Order sungguhan
 *          dibangun Task 21 di kontrak-lengkap/change-order (bukan hub
 *          `proyek/[id]` yang masih ditunda ke Task 26). Diarahkan ke
 *          sana, MENGGANTIKAN fallback `/pm-portal/kontrak` lama.
 *   jd-gantt diarahkan ke cecep/kurva-s sebagai APROKSIMASI, bukan Gantt
 *   visual sungguhan — dicatat UTANG di komentar `PETA_HREF_PORTAL`.
 *   cc-acl/cc-commitment/cc-pagu-material/cc-cvr/cc-profit/cc-wip TIDAK
 *   dipetakan — lihat komentar di baris masing-masing key di bawah untuk
 *   alasannya (tahap lain, atau fallback web tetap memadai).
 *
 * Tahap 4 (Task 25, grup g-inventory "Gudang & Material" BARU diaktifkan
 * `KATEGORI_AKTIF`; key persis dari `lib/peta-menu.ts`, diverifikasi baca
 * ulang saat Task 25):
 *   iv-gudang (Gudang Proyek) DAN md-gudang (grup g-master, "Gudang &
 *   Lokasi") SAMA-SAMA diarahkan ke halaman ikhtisar `gudang` — dua key
 *   PETA_MENU berbeda yang menunjuk satu konsep (ikhtisar lintas-gudang +
 *   tautan "Kelola Lokasi" di dalamnya), sama seperti pola cc-/crm-/md-
 *   yang saling tumpang tindih di Tahap 3. md-gudang TIDAK dipetakan
 *   langsung ke /gudang/lokasi — ikhtisar dulu, lokasi satu tap lagi
 *   (mengikuti struktur halaman Task 25 Step 2 yang punya link "Kelola
 *   Lokasi" sendiri, bukan duplikasi entri menu).
 *   iv-mutasi (Stok Masuk & Keluar) → gudang/stok (kartu stok + catat
 *   pemakaian/retur — lihat catatan cacat gerbang stocks/usage di halaman
 *   itu sendiri).
 *   iv-transfer → gudang/transfer (SUDAH ADA di `lib/peta-menu.ts` sebagai
 *   href langsung `/gudang/transfer` untuk web; portal PM Task 25
 *   membangun versi mobile terpisah di path yang sama polanya).
 *   iv-rekonsiliasi DAN iv-waste sama-sama → gudang/rekonsiliasi (satu
 *   halaman menjawab dua key PETA_MENU — keduanya memang menunjuk
 *   `lib/rekonsiliasi-material.ts` yang sama, dicatat eksplisit di
 *   `peta-menu.ts` sendiri: "susut tinggi" DIHITUNG dari fungsi yang sama
 *   dengan rekonsiliasi, bukan modul terpisah).
 *   iv-opname, iv-minstok, gd-susut SENGAJA TIDAK dipetakan — Task 25
 *   brief mencatat eksplisit: `iv-opname`/`stocks/opname` di luar scope
 *   (Task 26, gerbang cacat sama seperti stocks/usage — lihat catatan
 *   Task 26 di bawah, keputusan ini DIKONFIRMASI ULANG bukan diselesaikan),
 *   `iv-minstok` halaman terpisah di luar scope Task 25 (Task 26 memutuskan
 *   di bawah), `gd-susut` adalah CRUD data referensi tingkat
 *   perusahaan (peta resource↔material, rencana target %) yang SENGAJA
 *   tidak dibangun versi mobile-nya — jarang berubah, dikelola dari desktop,
 *   bukan kerja harian PM lapangan (lihat kepala `task-25-brief.md`).
 *   Ketiganya jatuh ke fallback `it.href` (web) sebagaimana pola existing.
 *
 * Tahap 4 (Task 26, grup g-procurement "Pengadaan" BARU diaktifkan
 * `KATEGORI_AKTIF`; key persis dari `lib/peta-menu.ts` §g-procurement):
 *   pr-mr (Material Request), pr-po (Purchase Order), pr-grn (Goods
 *   Receipt) diarahkan ke `/pm-portal/procurement` — satu halaman Task 24
 *   ber-tab (MR/PO/GR) yang memang memuat ketiga konsep ini masing-masing
 *   sebagai tab sendiri.
 *   ⚠ pr-3way (3-Way Match) DAN pr-jadwal-bayar (Jadwal Bayar Vendor)
 *   SENGAJA TIDAK dipetakan ke `/pm-portal/procurement` — koreksi review
 *   Task 26 (2026-08-21, Critical): draf awal task ini SALAH mengklaim
 *   kedua konsep itu "turunan/tampilan dari data PO+GR yang sama" di
 *   halaman itu. DIPERIKSA ULANG dengan grep menyeluruh direktori
 *   `apps/web/app/pm-portal/procurement/` untuk pola
 *   `3-way|3way|match|jatuh_tempo|due_date|payment|jadwal` — NOL hasil.
 *   Halaman procurement/PO hanya menampilkan status, total, tanggal
 *   KIRIM (bukan tanggal BAYAR), dan daftar item — tak ada UI pencocokan
 *   PO↔GR↔tagihan atau daftar jatuh tempo vendor DI MANA PUN di portal
 *   PM. Memetakan keduanya ke halaman itu bukan 404 (jadi
 *   `audit-nav-yatim.mjs` tak mendeteksinya) tapi menyesatkan secara
 *   produk: PM membuka menu berlabel "3-Way Match"/"Jadwal Bayar Vendor"
 *   dan mendarat di halaman yang sama sekali tak menjawab label itu.
 *   Keduanya sekarang fallback ke `it.href` web (`/procurement`, item-level
 *   href key-nya sendiri di `peta-menu.ts`) sampai ada halaman portal PM
 *   yang benar-benar menjawabnya.
 *   pr-rfq, pr-tabulasi (satu layar sama di web, lihat catatan key-nya
 *   sendiri di `peta-menu.ts`), pr-blanket (Kontrak Payung), pr-evaluasi
 *   (Evaluasi Vendor), pr-expediting SENGAJA TIDAK dipetakan — RFQ/Tabulasi/
 *   Evaluasi Vendor berbentuk tabel perbandingan multi-vendor lebar (banyak
 *   kolom harga berdampingan) yang secara struktural tak cocok jadi kartu
 *   mobile tanpa scroll horizontal berat (pola sama dengan Gantt Chart
 *   Task 22); Kontrak Payung+Expediting DITUNDA ke Tahap 6 supaya ditinjau
 *   bersama modul Keuangan yang punya pola wewenang PM sebagian serupa
 *   (PM boleh membuat kontrak payung tapi tak berwenang atas nota kredit
 *   terkait — bentuk approval sama rumitnya dengan `klaim:*`). Bersama
 *   pr-3way/pr-jadwal-bayar di atas, KEENAMNYA jatuh ke fallback `it.href`
 *   (web) — lihat `task-26-brief.md`/`task-26-report.md` untuk rincian
 *   per modul.
 *   ⚠ Koreksi Tahap 6 (Task 37): pr-blanket/pr-expediting SEKARANG py
 *   halaman portal sendiri (`/pm-portal/keuangan/pengadaan-lanjutan`, Task
 *   36) — paragraf di atas BENAR saat Task 26 ditulis (Tahap 4, sebelum
 *   Tahap 6 ada) tapi SALAH sesudahnya. Lihat entri PETA_HREF_PORTAL di
 *   bawah. HANYA pr-rfq/pr-tabulasi/pr-evaluasi yang TETAP fallback web
 *   dengan alasan lama (tabel lebar multi-vendor tak cocok kartu mobile).
 *   iv-minstok (grup g-inventory, BUKAN g-procurement, tapi diputuskan di
 *   sini karena Task 26 yang menuntaskannya): TETAP TIDAK dipetakan ke
 *   PETA_HREF_PORTAL — fallback ke `it.href` web (`/procurement/material`,
 *   sudah tertulis di key-nya sendiri di `peta-menu.ts`) adalah keputusan
 *   SENGAJA, bukan utang yang lupa diselesaikan. Alasannya sama persis
 *   dengan `cc-pagu-material` (Tahap 3, Task 22): `/procurement/material`
 *   adalah tabel MASTER DATA (nama/satuan/kategori/harga/`min_stock` per
 *   material, form create/edit penuh, gerbang `procurement:material:manage`)
 *   bukan layar transaksi harian — mengubah ambang minimum adalah tindakan
 *   jarang/sekali-setel per material, bukan sesuatu yang PM lakukan berkali-
 *   kali dari lapangan lewat HP. Membangun kartu mobile khusus untuk CRUD
 *   master data ini akan mendupliksi UI form desktop tanpa alasan kerja
 *   lapangan yang nyata.
 *   ⚠ DIPERIKSA, BUKAN DIASUMSIKAN: `/pm-portal/gudang/stok` (iv-mutasi,
 *   Task 25) TIDAK menampilkan `min_stock` sama sekali — hanya qty
 *   on-hand per proyek (dicek isi `gudang/stok/page.tsx` langsung). Jadi
 *   PM di HP TAK PUNYA satu pun tempat melihat peringatan stok minimum
 *   hari ini — bukan cuma tak bisa MENGUBAH ambangnya. Ini UTANG nyata,
 *   dicatat sebagai concern di `task-26-report.md`, bukan diselesaikan di
 *   sini: menampilkan peringatan (read-only) di `gudang/stok` adalah
 *   perubahan Task 25 punya wilayah (halaman itu), dan mengubah ambang
 *   tetap fallback web sebagaimana keputusan di atas.
 *
 * Tahap 5 (Task 29, grup g-lapangan — kategori sudah aktif sejak Tahap 1,
 * hanya key `lp-ncr` yang baru dipetakan): register NCR dapat halaman
 * portal PM sendiri (`/pm-portal/mutu/ncr` + `[id]`), menggantikan fallback
 * ke `/mutu/ncr` (web admin) yang sebelumnya dipakai `it.href`.
 * `audit-nav-yatim.mjs` menandai `/pm-portal/mutu/ncr` yatim sebelum baris
 * ini ditambahkan — diperbaiki di sini, bukan didaftarkan ke WAJAR skrip
 * itu, karena modul ini memang punya tempatnya sendiri di kategori yang
 * sudah aktif.
 *
 * Tahap 5 (Task 30, grup `g-qaqc` BARU diaktifkan `KATEGORI_AKTIF`; key
 * persis dari `lib/peta-menu.ts` §g-qaqc, diverifikasi ulang saat Task 30):
 *   qc-rencana DAN qc-itp → `/pm-portal/mutu/rencana` — SATU halaman
 *   gabungan (list RMP + detail per-RMP menampilkan ITP-nya, Task 30 Step
 *   2-3), sama pola `cc-rab`/`crm-boq` yang berbagi satu halaman Tahap 3.
 *   qc-uji → `/pm-portal/mutu/uji-material` (Task 30 Step 4).
 *   qc-ncr TETAP `/pm-portal/mutu/ncr` (Task 29, tak berubah — baris di
 *   bawah HANYA dipertahankan, bukan ditulis ulang, supaya key `g-lapangan`
 *   `lp-ncr` dan key `g-qaqc` `qc-ncr` konsisten menunjuk halaman yang sama).
 *   qc-checklist TETAP fallback ke web (`/lapangan/inspeksi`) — checklist
 *   inspeksi (`inspeksi_checklist`, `mutu.ts:44-190`) adalah CRUD level-KE-
 *   TIGA (inspeksi → checklist → tiap butir) yang bahkan desktop
 *   menempelkannya sebagai komponen KECIL di kartu inspeksi (`checklist-
 *   inspeksi.tsx`, dilipat) — di luar scope Task 30 (tak disebut brief, dan
 *   `/lapangan/inspeksi-rfi` portal SUDAH ada Task-dasar untuk RFI, BUKAN
 *   checklist yang sama; verifikasi ulang overlap sebelum mengerjakan kalau
 *   tahap lanjutan membutuhkannya).
 *   qc-capa/mutu-pelajaran SENGAJA TIDAK diisi — Task 27 Temuan #6, ranah
 *   CECEP bukan Mutu&K3, PM cuma `cecep:lessons:view`. Fallback web.
 *   qc-audit SENGAJA TIDAK diisi — Task 27 Temuan #4, di luar 4 modul
 *   brief (RMP/ITP/Uji Material/JSA lanjutan). Fallback web (`/mutu/audit`).
 *
 * Tahap 5 (Task 30, koreksi 3 entri grup AKTIF LAMA — g-lapangan/g-subkon
 * sudah aktif sejak Tahap 1, tapi ketiga key ini baru sekarang punya halaman
 * portal PM sendiri, Task 28 "Kepatuhan & Izin Kerja"): `lp-permit` (grup
 * `g-lapangan`) dan `sk-kepatuhan`/`sk-evaluasi` (grup `g-subkon`) diarahkan
 * ke `/pm-portal/kepatuhan` — sebelumnya TAK dipetakan sama sekali di sini
 * (fallback `it.href` web `/kepatuhan?bagian=...`, lihat catatan Tahap 4
 * `iv-minstok` untuk pola serupa "sengaja ditunda"), sekarang halaman
 * portalnya sudah ada (Task 28) jadi dipetakan sebagaimana mestinya.
 *
 * Tahap 6 (Task 37, grup `g-keuangan`/`g-tagih` BARU diaktifkan
 * `KATEGORI_AKTIF`; key persis dari `lib/peta-menu.ts` §g-keuangan
 * baris 291-313 dan §g-tagih baris 314-327, diverifikasi baca ulang saat
 * Task 37): sepuluh halaman baru Task 32-36 disambungkan sekaligus.
 *   fn-gl/fn-jurnal → `/pm-portal/keuangan/gl` (Task 34, Buku Besar + tab
 *   Jurnal Umum manual, satu halaman).
 *   fn-laporan → SAMA `/pm-portal/keuangan/gl` (tab Neraca & Laba-Rugi,
 *   endpoint `GET /gl/laporan` yang sama).
 *   fn-ar → `/pm-portal/keuangan/piutang` (Task 32, tab Aging).
 *   tg-retensi/tg-uangmuka → SAMA `/pm-portal/keuangan/piutang` (tab
 *   Retensi & tab DP — Register Piutang Task 32 menyerap ketiga konsep ini
 *   sebagai tab, bukan tiga halaman terpisah).
 *   fn-kas/fn-petty → `/pm-portal/keuangan/kas` (Task 33) — kas kecil
 *   BUKAN modul terpisah, satu jenis akun kas di halaman yang sama.
 *   fn-rekonsiliasi → `/pm-portal/keuangan/rekonsiliasi-bank` (Task 35).
 *   tg-ipc → `/pm-portal/keuangan/ipc` (Task 32) — BARU ditambahkan di sini
 *   (tak ada di PETA_HREF_PORTAL sama sekali sebelum Task 37), padanan
 *   portal dari `/keuangan/ipc` web.
 *   tg-nota-kredit/pr-blanket/pr-expediting → SAMA
 *   `/pm-portal/keuangan/pengadaan-lanjutan` (Task 36, tab Nota Kredit/
 *   Kontrak Payung/Expediting — satu halaman ber-tab untuk ketiga konsep,
 *   koreksi terhadap Tahap 4 yang menyisakan pr-blanket/pr-expediting
 *   fallback web "ditunda ke Tahap 6", lihat koreksi di komentar
 *   `pr-mr`/`pr-po`/`pr-grn` di bawah).
 *   fn-pajak/fn-efaktur SENGAJA TIDAK diisi — di luar riset Task 31,
 *   fallback web (`/laporan?tab=pajak`).
 *   gl-peta-akun/gl-jurnalkan SENGAJA TIDAK diisi — Task 31 Temuan #3, PM
 *   tak punya `gl:peta-akun:*`/`gl:jurnalkan`. Fallback web
 *   (`/akuntansi/peta-akun`, `/akuntansi/jurnalkan`).
 *   fn-ap SENGAJA TIDAK diisi — sama alasan Task 23/31, PM tak punya
 *   `procurement:payment:manage`. Fallback web (`/procurement/hutang`).
 *   fn-aset-tetap/fn-tutup-buku/fn-audit SENGAJA TIDAK diisi — di luar 4
 *   modul riset Task 31 (finance/cash/gl/rekonsiliasi), atau PM tak punya
 *   `gl:periode:*` (Task 31 Temuan #3). Fallback web.
 *   set-api-key/set-markup SENGAJA TIDAK diisi — di luar scope Keuangan
 *   sepenuhnya (Pengaturan/Master Data-Estimasi), tak disentuh Task 37.
 *
 * Tahap 7 (Task 39, grup `g-hr` "SDM & Payroll" BARU diaktifkan
 * `KATEGORI_AKTIF`; key persis dari `lib/peta-menu.ts` §g-hr baris 262-276):
 *   hr-absensi → `/pm-portal/sdm/timesheet` (Task 39 — timesheet staf kantor,
 *   PM py `sdm:timesheet:view`+`:manage` penuh, isi hari + ajukan bulan).
 *   hr-sertifikasi/hr-rekrutmen/hr-kinerja → SAMA
 *   `/pm-portal/sdm/kompetensi` (Task 39 — satu halaman tiga
 *   SegmentedTab: Sertifikat/Kinerja/Rekrutmen, READ-ONLY PENUH karena PM
 *   py `sdm:sertifikat:view`+`sdm:rekrutmen:view` TANPA satu pun `:manage`
 *   — diverifikasi LANGSUNG ke `role_permissions` tenant nyata, bukan cuma
 *   katalog `permissions`).
 *   hr-cuti → `/pm-portal/sdm/cuti` (Task 39 — PM py `sdm:cuti:view`+
 *   `:manage` untuk ajukan/batalkan cuti SENDIRI, TANPA `:approve`
 *   (setuju/tolak) atau `:hak` (koreksi jatah) — tombol keduanya TIDAK ADA).
 *   hr-karyawan/hr-payroll/hr-upah/hr-bpjs/hr-pph21/hr-reimburse SENGAJA
 *   TIDAK diisi — di luar tiga halaman Task 39, fallback `it.href` web
 *   (`/users`, `/sdm/payroll`, `/mandor/upah`, `/pengaturan/tarif-payroll`
 *   ×2, `/sdm/klaim-perjalanan`).
 */
const PETA_HREF_PORTAL: Record<string, string> = {
  "sk-paket": "/pm-portal/mandor-lengkap/penugasan",
  "sk-wo": "/pm-portal/mandor-lengkap/spk",
  "sk-tender": "/pm-portal/mandor-lengkap/tender",
  "sk-retensi": "/pm-portal/mandor-lengkap/retensi",
  "sk-backcharge": "/pm-portal/mandor-lengkap/backcharge",
  "sk-mandor": "/pm-portal/mandor-lengkap/tukang",
  "sk-kasbon": "/pm-portal/mandor-lengkap/kasbon",
  "sk-opname": "/pm-portal/mandor-lengkap/opname",
  "sk-settlement": "/pm-portal/mandor",
  "lp-punch": "/pm-portal/punch-list",
  "lp-rfi": "/pm-portal/inspeksi-rfi",
  "lp-submittal": "/pm-portal/submittal",
  // Tahap 2 (Task 16) — grup g-kontrak / g-jadwal.
  "kt-register": "/pm-portal/kontrak-lengkap/register",
  "kt-asuransi": "/pm-portal/kontrak-lengkap/asuransi",
  "kt-claims": "/pm-portal/kontrak-lengkap/klaim",
  "kt-eot": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-ld": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-bond": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-rfi": "/pm-portal/inspeksi-rfi",
  "kt-surat": "/pm-portal/kontrak-lengkap/surat",
  "kt-termin": "/pm-portal/keuangan",
  "kt-retensi": "/pm-portal/mandor-lengkap/retensi",
  "kt-subkon": "/pm-portal/mandor-lengkap/penugasan",
  // kt-co: UTANG Task 16 DILUNASI Task 21/22 — Change Order sungguhan kini
  // punya halaman portal sendiri (kontrak-lengkap/change-order), bukan lagi
  // fallback ringkasan kontrak Tahap 1.
  "kt-co": "/pm-portal/kontrak-lengkap/change-order",
  "jd-cpm": "/pm-portal/jadwal",
  "jd-histogram": "/pm-portal/jadwal",
  "jd-method": "/pm-portal/jadwal",
  "jd-milestone": "/pm-portal/jadwal",
  "jd-delay": "/pm-portal/kontrak-lengkap/keterlambatan",
  // Tahap 3 (Task 18-22) — grup g-cost / g-master / g-crm.
  "md-resource": "/pm-portal/cecep/ahsp",
  "md-price-book": "/pm-portal/cecep/harga",
  "md-wbs": "/pm-portal/cecep/wbs",
  "jd-wbs": "/pm-portal/cecep/wbs",
  "crm-estimating": "/pm-portal/cecep/ahsp",
  "crm-boq": "/pm-portal/cecep/rab",
  "crm-skenario": "/pm-portal/cecep/rab",
  "crm-markup": "/pm-portal/cecep/markup",
  "cc-rab": "/pm-portal/cecep/rab",
  "cc-rap": "/pm-portal/cecep/rap",
  "cc-revisi": "/pm-portal/cecep/rap",
  "cc-etc": "/pm-portal/cecep/kurva-s",
  "cc-cashflow": "/pm-portal/cecep/kas",
  "cc-varians": "/pm-portal/cecep/varians",
  "cc-contingency": "/pm-portal/cecep/contingency",
  "cc-bac": "/pm-portal/cecep/kurva-s",
  "jd-gantt": "/pm-portal/cecep/kurva-s",
  "jd-kurva-s": "/pm-portal/cecep/kurva-s",
  "jd-evm": "/pm-portal/cecep/kurva-s",
  // Tahap 4 (Task 25) — grup g-inventory (baru diaktifkan) + md-gudang
  // (g-master, sudah aktif sejak Tahap 3 tapi baru sekarang punya halaman
  // portal PM). Lihat catatan panjang di atas untuk alasan pemetaannya.
  "iv-gudang": "/pm-portal/gudang",
  "md-gudang": "/pm-portal/gudang",
  "iv-mutasi": "/pm-portal/gudang/stok",
  "iv-transfer": "/pm-portal/gudang/transfer",
  "iv-rekonsiliasi": "/pm-portal/gudang/rekonsiliasi",
  "iv-waste": "/pm-portal/gudang/rekonsiliasi",
  // Tahap 4 (Task 26) — grup g-procurement (baru diaktifkan). Lihat catatan
  // panjang di atas untuk alasan key yang SENGAJA tak dipetakan
  // (pr-3way/pr-jadwal-bayar — koreksi review Critical — dan
  // pr-rfq/pr-tabulasi/pr-evaluasi). pr-blanket/pr-expediting DIKOREKSI
  // Tahap 6 (Task 37) — lihat entri masing-masing di bawah, SEKARANG py
  // halaman portal sendiri, bukan lagi fallback web.
  "pr-mr": "/pm-portal/procurement",
  "pr-po": "/pm-portal/procurement",
  "pr-grn": "/pm-portal/procurement",
  // pr-3way DAN pr-jadwal-bayar SENGAJA TIDAK diisi di sini — halaman
  // /pm-portal/procurement TIDAK memuat konsep keduanya (diverifikasi grep
  // menyeluruh, nol hasil untuk "3-way|3way|match|jatuh_tempo|due_date|
  // payment|jadwal" di direktori itu). Fallback ke `it.href` web
  // (/procurement, item-level href masing-masing key di peta-menu.ts).
  // "iv-minstok" (g-inventory) SENGAJA TETAP TIDAK diisi — keputusan Task 26,
  // lihat catatan panjang di atas kepala PETA_HREF_PORTAL ini. Fallback ke
  // `it.href` web (/procurement/material), pola sama dengan cc-pagu-material.
  // Tahap 5 (Task 29) — grup g-lapangan, satu key baru.
  "lp-ncr": "/pm-portal/mutu/ncr",
  // Tahap 5 (Task 30) — grup g-qaqc (baru diaktifkan). Lihat catatan
  // panjang di atas untuk alasan qc-checklist/qc-capa/mutu-pelajaran/
  // qc-audit yang SENGAJA tak dipetakan.
  "qc-rencana": "/pm-portal/mutu/rencana",
  "qc-itp": "/pm-portal/mutu/rencana",
  "qc-uji": "/pm-portal/mutu/uji-material",
  "qc-ncr": "/pm-portal/mutu/ncr",
  // Tahap 5 (Task 30) — koreksi 3 entri grup AKTIF lama, sekarang py halaman
  // portal (Task 28 "Kepatuhan & Izin Kerja"). Lihat catatan panjang di atas.
  "lp-permit": "/pm-portal/kepatuhan",
  "sk-kepatuhan": "/pm-portal/kepatuhan",
  "sk-evaluasi": "/pm-portal/kepatuhan",
  // Tahap 6 (Task 37) — grup g-keuangan (baru diaktifkan). Lihat catatan
  // panjang di atas untuk alasan lengkap tiap key, termasuk yang SENGAJA
  // tak dipetakan (fn-pajak/fn-efaktur/gl-peta-akun/gl-jurnalkan/fn-ap/
  // fn-aset-tetap/fn-tutup-buku/fn-audit/set-api-key/set-markup).
  "fn-gl": "/pm-portal/keuangan/gl",
  "fn-jurnal": "/pm-portal/keuangan/gl",
  "fn-ar": "/pm-portal/keuangan/piutang",
  "fn-kas": "/pm-portal/keuangan/kas",
  "fn-petty": "/pm-portal/keuangan/kas",
  "fn-rekonsiliasi": "/pm-portal/keuangan/rekonsiliasi-bank",
  "fn-laporan": "/pm-portal/keuangan/gl",
  // Tahap 6 (Task 37) — grup g-tagih (baru diaktifkan). tg-progress/
  // tg-termin/tg-tambah/tg-invoice/tg-followup TIDAK diubah — semuanya
  // sudah `href: '/keuangan'`/`/keuangan/invoice`/`/piutang` web, dan
  // breakdown Tahap 6 ini TIDAK membangun invoice CRUD/termin baru.
  "tg-ipc": "/pm-portal/keuangan/ipc",
  "tg-nota-kredit": "/pm-portal/keuangan/pengadaan-lanjutan",
  "tg-retensi": "/pm-portal/keuangan/piutang",
  "tg-uangmuka": "/pm-portal/keuangan/piutang",
  // Tahap 6 (Task 37) — koreksi 2 entri grup g-procurement (fallback web
  // sejak Task 26, SEKARANG py halaman portal — lihat koreksi komentar di
  // atas kepala PETA_HREF_PORTAL ini dan di atas entri pr-mr/pr-po/pr-grn).
  "pr-blanket": "/pm-portal/keuangan/pengadaan-lanjutan",
  "pr-expediting": "/pm-portal/keuangan/pengadaan-lanjutan",
  // Tahap 7 (Task 39) — grup g-hr (baru diaktifkan). Lihat catatan panjang
  // di atas untuk alasan lengkap tiap key, termasuk yang SENGAJA tak
  // dipetakan (hr-karyawan/hr-payroll/hr-upah/hr-bpjs/hr-pph21/hr-reimburse).
  "hr-absensi": "/pm-portal/sdm/timesheet",
  "hr-cuti": "/pm-portal/sdm/cuti",
  "hr-sertifikasi": "/pm-portal/sdm/kompetensi",
  "hr-rekrutmen": "/pm-portal/sdm/kompetensi",
  "hr-kinerja": "/pm-portal/sdm/kompetensi",
  // Tahap 7 (Task 40) — grup g-aset "Alat & Aset" (baru diaktifkan). Delapan
  // key persis dari `lib/peta-menu.ts` §g-aset (as-register/as-mutasi/
  // as-penyusutan/as-sewa/as-utilisasi/as-maintenance/as-opex/as-gl) semuanya
  // menunjuk satu halaman register `/pm-portal/aset` (mutasi/penyusutan/
  // servis/biaya adalah tombol/tab DI DALAM detail aset, bukan halaman
  // terpisah) — pola sama `md-resource`/`crm-estimating` (Tahap 3) yang
  // sama-sama menunjuk satu halaman `cecep/ahsp`. as-sewa dikecualikan ke
  // `?tab=sewa` mengikuti `href` aslinya di peta-menu.ts (langsung membuka
  // tab Sewa). as-gl (tombol "Jurnalkan Periode Ini") KINI dipetakan —
  // koreksi review 2026-08-21: draf pertama brief menulis "PM TIDAK PUNYA
  // gl:manage" dan berencana membiarkannya fallback web; query live
  // `role_permissions` membuktikan itu SALAH, PM PUNYA `gl:manage` penuh
  // pada kedua baris role `pm` (global + tenant).
  "as-register": "/pm-portal/aset",
  "as-mutasi": "/pm-portal/aset",
  "as-penyusutan": "/pm-portal/aset",
  "as-sewa": "/pm-portal/aset?tab=sewa",
  "as-utilisasi": "/pm-portal/aset",
  "as-maintenance": "/pm-portal/aset",
  "as-opex": "/pm-portal/aset",
  "as-gl": "/pm-portal/aset",
  // Tahap berikutnya menambah baris di sini, sesuai key ItemMenu.
};

/**
 * Modul portal PM yang SUDAH ADA tapi key `ItemMenu`-nya tinggal di grup
 * PETA_MENU yang BELUM aktif di `kategoriUntukPm()`: Mitra (`md-subkon`,
 * grup g-master), K3 (`hse-inspeksi`, grup g-hse), Dokumen/Procurement
 * (halaman agregat lintas-modul di portal PM, tak dipetakan satu-ke-satu ke
 * satu key PETA_MENU — lihat komentar tiap halamannya di
 * `app/pm-portal/{dokumen,procurement}/page.tsx`). Tanpa baris ini,
 * keempatnya jadi TAK TERJANGKAU dari navigasi kategori — persis cacat yang
 * ingin dihindari Task 9 ("halaman yang sudah ada jangan sampai jadi tak
 * terjangkau setelah struktur navigasi diganti"). Ditempel ke "Operasi
 * Lapangan"/"Mandor & Subkon" karena itulah tempat PM mencarinya
 * sehari-hari di lapangan — sama seperti `lainnya/page.tsx` versi lama yang
 * menaruh semuanya berdampingan di satu grid. TIDAK mengubah
 * `PETA_MENU`/`KATEGORI_AKTIF` — ekstensi lokal ke halaman ini saja, dan
 * TIDAK dimaksudkan permanen: begitu grup g-hse/g-procurement diaktifkan di
 * tahap berikutnya, baris yang relevan pindah dari sini ke
 * PETA_HREF_PORTAL/KATEGORI_AKTIF yang semestinya.
 *
 * `px-jadwal` ("Jadwal & Baseline") dan `px-kontrak` ("Kontrak") DIHAPUS
 * dari sini Task 16 — g-kontrak/g-jadwal kini aktif dan PETA_HREF_PORTAL
 * di atas sudah menunjuk ke halaman yang SAMA (`jd-cpm` dkk. dan `kt-co`
 * keduanya → `/pm-portal/jadwal` dan `/pm-portal/kontrak`), jadi
 * mempertahankan baris ini akan menampilkan dua tautan kembar ke tujuan
 * yang sama pada kategori "Operasi Lapangan".
 *
 * Tahap 6 (Task 37) menambah `g-keuangan`: `/pm-portal/keuangan/dashboard`
 * (Task 32) adalah PINTU MASUK modul Keuangan (KPI + grafik tagih-vs-bayar +
 * umur piutang + tabel per-proyek, lihat komentar kepala halamannya) tapi
 * TAK PUNYA key `ItemMenu` sendiri di `lib/peta-menu.ts` — `fn-gl`/
 * `fn-laporan` menunjuk `/gl`, bukan `/dashboard`. Tanpa baris ini halaman
 * itu YATIM (dikonfirmasi `audit-nav-yatim.mjs`, satu-satunya dari sepuluh
 * halaman Task 32-36 yang tak tercakup PETA_HREF_PORTAL manapun) — pola
 * persis sama dengan Mitra/K3/Dokumen/Procurement di atas: halaman ada,
 * key resminya tak ada, jadi ditempel di sini sebagai entri ekstra.
 */
const EKSTRA_PORTAL: Record<string, { key: string; label: string; href: string; icon: LucideIcon }[]> = {
  "g-subkon": [
    { key: "md-subkon", label: "Mitra", href: "/pm-portal/mandor-lengkap/mitra", icon: Building2 },
  ],
  "g-lapangan": [
    { key: "hse-inspeksi", label: "K3", href: "/pm-portal/k3", icon: ShieldAlert },
    { key: "px-dokumen", label: "Dokumen", href: "/pm-portal/dokumen", icon: FileText },
    { key: "px-procurement", label: "Procurement", href: "/pm-portal/procurement", icon: ShoppingCart },
  ],
  "g-keuangan": [
    { key: "fn-dashboard", label: "Dashboard Keuangan", href: "/pm-portal/keuangan/dashboard", icon: LayoutDashboard },
  ],
};

export default function PmKategoriPage() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const grup = PETA_MENU.find((g) => g.key === key);

  if (!grup) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Kembali
        </button>
        <EmptyState icon={Folder} judul="Kategori tidak ditemukan" deskripsi="Kategori ini mungkin sudah dipindahkan." />
      </div>
    );
  }

  const itemHidup = grup.items.filter((it) => it.status === "hidup");
  const ekstra = EKSTRA_PORTAL[grup.key] ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}
      >
        <ChevronLeft size={16} aria-hidden="true" /> Kembali
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {grup.label}
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {itemHidup.map((it) => (
          <Link
            key={it.key}
            href={PETA_HREF_PORTAL[it.key] ?? it.href ?? "#"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: 16, borderRadius: 14, background: "var(--surface)",
              border: "1px solid var(--border)", textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{it.label}</span>
            <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
          </Link>
        ))}
        {ekstra.map((it) => {
          const EkstraIkon = it.icon;
          return (
            <Link
              key={it.key}
              href={it.href}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: 16, borderRadius: 14, background: "var(--surface)",
                border: "1px solid var(--border)", textDecoration: "none",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                <EkstraIkon size={16} color="var(--text-muted)" aria-hidden="true" />
                {it.label}
              </span>
              <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

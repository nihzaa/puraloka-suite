/**
 * PETA MENU ERP — 20 kelompok, 177 sub-menu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai hari ini sidebar hanya memuat 26 menu — yang kebetulan sudah dibangun.
 * Akibatnya tak seorang pun bisa melihat PETA: apa yang ada, apa yang belum,
 * dan di mana sebuah fitur akan tinggal nanti. Founder memintanya eksplisit:
 * daftarkan semua yang nantinya akan ada.
 *
 * Sumbernya `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` — 183 sub-menu terverifikasi
 * ke kode. Dikurangi 6 yang sudah dicoret owner (multi-currency, impor &
 * kepabeanan, transaksi antar-perusahaan) → 177.
 *
 * ── Kenapa satu berkas, bukan langsung SQL
 *
 * Migrasi SQL untuk 177 baris akan jadi 700+ baris `INSERT` yang mustahil
 * dibaca, dan tiap perubahan urutan berarti menulis ulang seluruhnya. Di sini
 * strukturnya bisa dibaca sebagai daftar, dan migrasi men-generate SQL-nya.
 * Berkas ini juga yang dipakai halaman coming-soon untuk tahu APA yang akan
 * dibangun di tiap rute — satu sumber, dua konsumen.
 *
 * ── Status: BUKAN hiasan
 *
 *   hidup   — sudah berfungsi end-to-end; `href` menunjuk tempat aslinya
 *   sebagian— ada tapi belum lengkap
 *   rencana — belum dibangun; halaman coming-soon
 *   eksternal—sengaja TIDAK dibangun, pakai tool lain (payroll, BPJS, PPh 21)
 *   gerbang — menunggu pemicu bisnis (QA/QC & HSE: "saat tender mensyaratkan")
 *
 * `eksternal` dan `gerbang` tetap muncul di sidebar — justru supaya terlihat
 * bahwa ia sudah DIPIKIRKAN dan diputuskan, bukan terlupa. Halamannya
 * menjelaskan alasannya.
 *
 * ── Fitur yang hidup DI DALAM proyek
 *
 * Kurva S, EVM, Gantt, RAB, Change Order bukan halaman berdiri sendiri — ia
 * tab di `/proyek/[id]`. Mengkliknya tanpa memilih proyek tak berarti apa-apa.
 * Ditandai `tabProyek`, dan halamannya menampilkan daftar proyek untuk dipilih
 * (pola Primavera/Odoo: menu = tempat kerja, bukan daftar fitur).
 */

export type StatusMenu = 'hidup' | 'sebagian' | 'rencana' | 'eksternal' | 'gerbang'

export interface ItemMenu {
  /** Kunci unik, dipakai sebagai `menu_items.key` dan segmen rute. */
  key: string
  label: string
  status: StatusMenu
  /**
   * Tujuan. `null` = halaman coming-soon di `/m/<key>`.
   * Diisi hanya bila fiturnya benar-benar hidup di situ.
   */
  href?: string
  /**
   * Tab di dalam detail proyek. Halaman `/m/<key>` menampilkan daftar proyek,
   * lalu membuka tab ini pada proyek yang dipilih.
   */
  tabProyek?: string
  /** Satu kalimat: apa yang dikerjakan di sini. Ditampilkan di coming-soon. */
  guna: string
  /** Kenapa belum ada / kenapa tak dibangun. Wajib untuk non-`hidup`. */
  catatan?: string
}

export interface GrupMenu {
  key: string
  label: string
  /** Nama ikon lucide. */
  icon: string
  urutan: number
  items: ItemMenu[]
}

export const PETA_MENU: GrupMenu[] = [
  {
    key: 'g-master', label: 'Master Data', icon: 'Database', urutan: 10,
    items: [
      { key: 'md-perusahaan', label: 'Badan Usaha', status: 'hidup', href: '/pengaturan/perusahaan', guna: 'Daftar badan usaha & entitas hukum yang dikelola.' },
      { key: 'md-coa', label: 'Chart of Accounts', status: 'hidup', href: '/akuntansi?tab=akun', guna: 'Bagan akun untuk buku besar.', catatan: 'Migrasi 167 (tenant-aware) + seed 170. Migrasi 047 DIPENSIUNKAN lewat R-001 — catatan lama "sengaja belum di-apply" SALAH dan berbahaya: yang memercayainya akan bekerja melawan ratifikasi.' },
      { key: 'md-cost-code', label: 'Cost Code / CBS', status: 'sebagian', href: '/estimasi', guna: 'Struktur kode biaya untuk mengelompokkan anggaran & realisasi.', catatan: 'Registry sudah ada; pemetaan ke material belum.' },
      { key: 'md-wbs-template', label: 'Template WBS', status: 'sebagian', guna: 'Kerangka pekerjaan siap pakai untuk proyek baru.', catatan: 'Tabel `cbs_templates` ada, UI pengelolaannya belum.' },
      { key: 'md-resource', label: 'Master Resource', status: 'sebagian', href: '/estimasi?tab=katalog', guna: 'Daftar tenaga, bahan, dan alat beserta satuannya.', catatan: 'Hidup di tab Katalog halaman Estimasi.' },
      { key: 'md-price-book', label: 'Price Book', status: 'sebagian', href: '/estimasi?tab=harga', guna: 'Harga satuan resource, ber-tanggal-berlaku.', catatan: 'Hidup di tab Harga halaman Estimasi.' },
      { key: 'md-satuan', label: 'Satuan', status: 'hidup', href: '/pengaturan/satuan', guna: 'Satuan ukur (m², m³, kg, batang) beserta dimensinya.' },
      { key: 'md-supplier', label: 'Supplier', status: 'hidup', href: '/procurement/supplier', guna: 'Daftar pemasok material & jasa.' },
      { key: 'md-prakualifikasi', label: 'Prakualifikasi Vendor', status: 'hidup', href: '/procurement/kualifikasi', guna: 'Penilaian kelayakan vendor sebelum diundang menawar.', catatan: 'Migrasi 210 · `routes/v1/vendor-kualifikasi.ts` · /procurement/kualifikasi.' },
      { key: 'md-subkon', label: 'Subkontraktor', status: 'sebagian', href: '/mandor', guna: 'Daftar subkontraktor beserta lingkup pekerjaannya.', catatan: 'Sistem mandor jadi padanan lokalnya; subkon formal ber-kontrak belum.' },
      { key: 'md-klien', label: 'Klien', status: 'hidup', href: '/klien', guna: 'Data pemberi kerja, perorangan maupun badan usaha.' },
      { key: 'md-karyawan', label: 'Karyawan (HR)', status: 'sebagian', href: '/master/karyawan', guna: 'Data staf & struktur organisasi.', catatan: 'Baru sebatas akun pengguna; data kepegawaian belum.' },
      { key: 'md-aset', label: 'Aset & Alat', status: 'hidup', href: '/aset', guna: 'Register alat milik perusahaan beserta nilai bukunya.' },
      { key: 'md-gudang', label: 'Gudang & Lokasi', status: 'sebagian', href: '/procurement', guna: 'Tempat penyimpanan material per proyek.', catatan: 'Stok sudah per-proyek; gudang sebagai entitas tersendiri belum.' },
      { key: 'md-pajak', label: 'Konfigurasi Pajak', status: 'hidup', href: '/pengaturan/keuangan', guna: 'Tarif PPh final & PPN, ber-tanggal-berlaku.' },
      { key: 'md-kalender', label: 'Kalender Kerja', status: 'hidup', href: '/kalender', guna: 'Hari libur & hari kerja efektif — dasar hitung durasi dan denda.', catatan: 'Pola mingguan per-company/proyek + hari libur. Libur ber-`tetap_bekerja` TETAP hari kerja: jejaknya disimpan (menentukan tarif upah) tanpa menggeser jadwal.' },
      { key: 'md-penomoran', label: 'Penomoran Dokumen', status: 'sebagian', href: '/master/penomoran', guna: 'Format & urutan nomor MR, PO, invoice, dan dokumen lain.', catatan: 'Counter per-company sudah jalan (migrasi 135); UI pengaturannya belum.' },
      { key: 'md-template-dok', label: 'Template Dokumen', status: 'sebagian', href: '/master/template-dokumen', guna: 'Kerangka kontrak, SPK, dan berita acara.', catatan: 'Kontrak PDF sudah bisa di-generate; template-nya belum bisa disunting.' },
    ],
  },
  {
    key: 'g-crm', label: 'Pra-Konstruksi', icon: 'Gavel', urutan: 20,
    items: [
      { key: 'crm-lead', label: 'Pipeline Prospek', status: 'sebagian', href: '/crm/prospek', guna: 'Prospek pekerjaan sebelum jadi tender resmi.', catatan: 'Ada sebagai status `prospek` di register tender.' },
      { key: 'crm-tender', label: 'Register Tender', status: 'hidup', href: '/tender', guna: 'Tender yang diikuti, nilai penawaran, dan hasilnya.' },
      { key: 'crm-gonogo', label: 'Keputusan Go / No-Go', status: 'hidup', href: '/tender', guna: 'Memutuskan ikut atau lewat, beserta alasannya.' },
      { key: 'crm-prakualifikasi', label: 'Dokumen Prakualifikasi', status: 'rencana', guna: 'Berkas administrasi & teknis untuk lolos prakualifikasi.', catatan: 'Diperlukan saat mulai ikut tender pemerintah.' },
      { key: 'crm-estimating', label: 'Estimating / AHSP', status: 'hidup', href: '/estimasi?tab=katalog', guna: 'Menyusun harga satuan dari analisa AHSP resmi.' },
      { key: 'crm-boq', label: 'Quantity Takeoff / BOQ', status: 'sebagian', href: '/estimasi', guna: 'Menghitung volume pekerjaan dari gambar.', catatan: 'Read-model BOQ sudah ada; input takeoff-nya belum.' },
      { key: 'crm-skenario', label: 'Skenario Penawaran', status: 'sebagian', guna: 'Membandingkan beberapa versi harga sebelum memutuskan.', catatan: 'Tabel `scenarios` ada, endpoint-nya belum.' },
      { key: 'crm-markup', label: 'Markup & Margin', status: 'rencana', guna: 'Menetapkan keuntungan, overhead, dan cadangan risiko.', catatan: 'BUK sudah dihitung di AHSP; pengaturan markup terpisah belum.' },
      { key: 'crm-eskalasi', label: 'Riwayat Harga Material', href: '/procurement/riwayat-harga', status: 'hidup', guna: 'Penyesuaian harga untuk kontrak jangka panjang.', catatan: 'Migrasi 197 (sengaja tanpa tabel baru — diturunkan dari histori PO) · `lib/riwayat-harga.ts` (15 test) · `GET /api/v1/riwayat-harga` · halaman sendiri. href-nya sudah terisi sejak lama sementara statusnya tetap `rencana` — kontradiksi di baris yang sama.' },
      { key: 'crm-proposal', label: 'Dokumen Penawaran', status: 'sebagian', href: '/crm/penawaran', guna: 'Menyusun surat penawaran lengkap untuk dikirim.', catatan: 'Baru kontrak/SPK PDF; proposal penawaran belum.' },
      { key: 'crm-bidbond', label: 'Jaminan Penawaran', status: 'hidup', href: '/proyek', tabProyek: 'sec-info', guna: 'Bid bond: jaminan bahwa penawaran serius.' },
      { key: 'crm-winloss', label: 'Analisa Menang/Kalah', status: 'hidup', href: '/tender', guna: 'Kenapa kalah — harga, atau syarat?' },
      { key: 'crm-backlog', label: 'Backlog / Order Book', status: 'hidup', href: '/tender', guna: 'Pekerjaan yang sudah dimenangkan tapi belum selesai.' },
    ],
  },
  {
    key: 'g-kontrak', label: 'Kontrak', icon: 'FileSignature', urutan: 30,
    items: [
      { key: 'kt-register', label: 'Register Kontrak', status: 'sebagian', href: '/proyek', guna: 'Daftar kontrak induk beserta nilai & jangka waktunya.', catatan: 'Data kontrak masih menempel di proyek; tabel kontrak tersendiri belum.' },
      { key: 'kt-termin', label: 'Termin Pembayaran', status: 'hidup', href: '/keuangan/pembayaran', guna: 'Jadwal penagihan bertahap sesuai kontrak.' },
      { key: 'kt-retensi', label: 'Retensi', status: 'hidup', href: '/piutang', guna: 'Uang tahanan yang dilepas setelah masa pemeliharaan.' },
      { key: 'kt-co', label: 'Change Order', status: 'hidup', href: '/proyek', tabProyek: 'sec-co', guna: 'Pekerjaan tambah/kurang yang mengubah nilai kontrak.' },
      { key: 'kt-claims', label: 'Claims', status: 'hidup', href: '/proyek', guna: 'Tuntutan biaya akibat hal di luar kendali kontraktor.', catatan: 'Migrasi 184 (`contract_claims`) · `lib/klaim-kontraktual.ts` (20 test) · 3 endpoint di `routes/v1/rantai-kontrak.ts` · `klaim-section.tsx` di halaman detail proyek. Status `rencana` sebelumnya SALAH — diukur 2026-08-07.' },
      { key: 'kt-rfi', label: 'RFI', status: 'hidup', href: '/kontrak/rfi', guna: 'Pertanyaan resmi ke konsultan/pemberi kerja beserta jawabannya.', catatan: 'Capability Tier-2 (ROADMAP #24). Berbeda dari RFI lapangan: yang dihitung di sini adalah berapa lama pekerjaan menggantung menunggu jawaban — angka yang dibawa ke klaim EOT.' },
      { key: 'kt-eot', label: 'Perpanjangan Waktu (EOT)', status: 'hidup', href: '/proyek', tabProyek: 'sec-info', guna: 'Tambahan waktu yang menghapus denda keterlambatan.' },
      { key: 'kt-ld', label: 'Denda Keterlambatan', status: 'hidup', href: '/proyek', tabProyek: 'sec-info', guna: 'Denda bila pekerjaan selesai melewati tanggal efektif.' },
      { key: 'kt-bond', label: 'Register Jaminan', status: 'hidup', href: '/proyek', tabProyek: 'sec-info', guna: 'Jaminan pelaksanaan, uang muka, dan pemeliharaan.' },
      { key: 'kt-asuransi', label: 'Asuransi', status: 'hidup', href: '/kontrak/asuransi', guna: 'Polis CAR/TPL beserta masa berlakunya.', catatan: 'Migrasi 199 (`polis_asuransi`) · `lib/register-asuransi.ts` · /kontrak/asuransi. Celah tanggal antar-polis dihitung, bukan sekadar didaftar.' },
      { key: 'kt-surat', label: 'Surat Masuk & Keluar', status: 'hidup', href: '/proyek', guna: 'Korespondensi resmi dengan pemberi kerja.', catatan: 'Migrasi 185 (`project_letters`) · `lib/surat-korespondensi.ts` (21 test) · `routes/v1/surat.ts` · `surat-section.tsx` di halaman detail proyek. Status `rencana` sebelumnya SALAH.' },
      { key: 'kt-subkon', label: 'Kontrak Subkontraktor', status: 'sebagian', href: '/mandor', guna: 'Perjanjian dengan subkon beserta lingkupnya.', catatan: 'Work scope mandor jadi padanannya.' },
    ],
  },
  {
    key: 'g-jadwal', label: 'Perencanaan', icon: 'CalendarRange', urutan: 40,
    items: [
      { key: 'jd-wbs', label: 'WBS Proyek', status: 'sebagian', href: '/proyek', tabProyek: 'sec-rab', guna: 'Pemecahan pekerjaan jadi paket yang bisa dijadwalkan.' },
      { key: 'jd-baseline', label: 'Baseline Schedule', status: 'rencana', guna: 'Jadwal yang dibekukan sebagai pembanding.', catatan: 'Tanggal rencana sudah ada di Gantt; pembekuan baseline belum.' },
      { key: 'jd-gantt', label: 'Gantt Chart', status: 'hidup', href: '/proyek', tabProyek: 'sec-gantt', guna: 'Jadwal batang beserta ketergantungan antar-pekerjaan.' },
      { key: 'jd-cpm', label: 'Jalur Kritis (CPM)', status: 'hidup', href: '/jadwal?bagian=cpm', guna: 'Rantai pekerjaan yang menentukan tanggal selesai.', catatan: 'Empat jenis relasi (FS/SS/FF/SF) + jeda. Lingkaran dependensi DINYATAKAN dan jalur kritisnya dikosongkan, bukan dikarang. Float negatif sebanding dengan besar keterlambatan — bukan -1 untuk semua.' },
      { key: 'jd-kurva-s', label: 'Kurva S', status: 'hidup', href: '/proyek', tabProyek: 'sec-kurvas', guna: 'Rencana vs realisasi progres dan serapan biaya.' },
      { key: 'jd-histogram', label: 'Histogram Sumber Daya', status: 'hidup', href: '/jadwal?bagian=histogram', guna: 'Kebutuhan tenaga & alat per periode.', catatan: 'Yang dilaporkan PUNCAK, bukan rata-rata: 40 orang di minggu 7 dan 4 di minggu 8 punya rata-rata 22 — angka yang tak pernah terjadi dan menyembunyikan kekurangan 15 orang.' },
      { key: 'jd-lookahead', label: 'Look-Ahead 3 Minggu', status: 'hidup', href: '/proyek', tabProyek: 'sec-lookahead', guna: 'Apa yang harus disiapkan minggu ini sampai 3 minggu ke depan.' },
      { key: 'jd-milestone', label: 'Milestone', status: 'hidup', href: '/proyek', tabProyek: 'sec-milestone', guna: 'Target pencapaian yang disepakati kontrak.' },
      { key: 'jd-evm', label: 'Earned Value (EVM)', status: 'hidup', href: '/proyek', tabProyek: 'sec-kurvas', guna: 'CPI, SPI, dan perkiraan biaya akhir proyek.' },
      { key: 'jd-delay', label: 'Analisa Keterlambatan', status: 'hidup', href: '/proyek/keterlambatan', guna: 'Menelusuri penyebab telat & siapa yang menanggung.', catatan: 'Migrasi 198 · `lib/analisa-keterlambatan.ts` · /proyek/keterlambatan. Telat yang sudah dimaafkan EOT ditampilkan terpisah, bukan dituduhkan.' },
      { key: 'jd-method', label: 'Method Statement', status: 'hidup', href: '/jadwal?bagian=method', guna: 'Cara kerja yang disetujui untuk pekerjaan berisiko.', catatan: 'Penolakan WAJIB beralasan (>=10 huruf) dan keputusan wajib bertanggal — constraint DB, bukan aturan UI. Kolom pengendalian risiko K3 ditandai merah kalau kosong.' },
    ],
  },
  {
    key: 'g-cost', label: 'Budget & Cost Control', icon: 'Calculator', urutan: 50,
    items: [
      { key: 'cc-rab', label: 'RAB', status: 'hidup', href: '/proyek', tabProyek: 'sec-rab', guna: 'Anggaran penawaran — harga jual ke klien.' },
      { key: 'cc-rap', label: 'RAP', status: 'hidup', href: '/estimasi?tab=rap', guna: 'Anggaran pelaksanaan — rencana belanja sebenarnya.' },
      { key: 'cc-revisi', label: 'Revisi Anggaran', status: 'hidup', href: '/estimasi', guna: 'Memindahkan pagu antar pos dengan jejak persetujuan.', catatan: 'Migrasi 138 (`rap_change_log`) — alasan WAJIB ditegakkan trigger DB, bukan validasi form · `POST/GET /api/v1/rap/:id/change-log` · UI di halaman Estimasi. Status `rencana` sebelumnya SALAH.' },
      { key: 'cc-commitment', label: 'Commitment Tracking', status: 'hidup', href: '/estimasi', guna: 'Uang yang sudah terikat PO & borongan, meski belum dibayar.' },
      { key: 'cc-acl', label: 'Actual Cost Ledger', status: 'sebagian', href: '/estimasi', guna: 'Seluruh biaya yang benar-benar terjadi, per cost code.' },
      { key: 'cc-etc', label: 'Cost-to-Complete', status: 'hidup', href: '/proyek', tabProyek: 'sec-kurvas', guna: 'Perkiraan sisa biaya sampai proyek selesai.' },
      { key: 'cc-cashflow', label: 'Proyeksi Kas', status: 'hidup', href: '/estimasi?tab=cashflow', guna: 'Perkiraan uang masuk & keluar per periode.' },
      { key: 'cc-contingency', label: 'Contingency', status: 'hidup', href: '/keuangan/contingency', guna: 'Cadangan risiko: berapa tersisa, dipakai untuk apa.', catatan: 'Migrasi 200 · `lib/contingency.ts` · /keuangan/contingency. Defisit ditampilkan negatif, bukan diratakan ke nol.' },
      { key: 'cc-varians', label: 'Analisa Varians', status: 'hidup', href: '/estimasi?tab=varians', guna: 'Anggaran vs komitmen vs aktual, per cost code.' },
      { key: 'cc-profit', label: 'Profitabilitas Proyek', status: 'hidup', href: '/keuangan/profitabilitas', guna: 'Laba per proyek dan per pos biaya.' },
      { key: 'cc-wip', label: 'WIP / PSAK', status: 'hidup', href: '/laporan?tab=wip', guna: 'Pengakuan pendapatan sesuai kemajuan pekerjaan.' },
      { key: 'cc-cvr', label: 'Cost Value Reconciliation', status: 'sebagian', href: '/keuangan/cvr', guna: 'Mencocokkan nilai pekerjaan yang terpasang dengan biaya yang terjadi — pekerjaan mana yang merugi SEKARANG.', catatan: '2026-08-08 · `lib/cvr.ts` (20 test) + `GET /projects/:id/cvr` (8 test) + `/keuangan/cvr`. **Sebagian**: cakupannya UPAH BORONGAN saja — material & faktur supplier belum bisa dipecah per pekerjaan (`work_scopes.rab_category_id` 0 dari 20). Cakupan itu dinyatakan di layar, bukan disamarkan. Nilai terpasang = borongan × progres, bukan nilai kontrak penuh.' },
      { key: 'cc-pagu-material', label: 'Pagu Belanja Material', status: 'hidup', href: '/procurement/material', guna: 'Batas belanja per material, dipakai menjaga kuota MR.' },
      { key: 'cc-bac', label: 'Cost Baseline (BAC)', status: 'hidup', href: '/proyek', tabProyek: 'sec-kurvas', guna: 'Dasar pembanding EVM — diambil dari pagu RAP terkunci.' },
    ],
  },
  {
    key: 'g-procurement', label: 'Pengadaan', icon: 'ShoppingCart', urutan: 60,
    items: [
      { key: 'pr-mr', label: 'Material Request', status: 'hidup', href: '/procurement/permintaan', guna: 'Permintaan material dari lapangan, dijaga kuota RAB.' },
      { key: 'pr-rfq', label: 'RFQ ke Vendor', status: 'hidup', href: '/procurement/rfq', guna: 'Meminta penawaran harga ke beberapa vendor sekaligus.', catatan: 'Migrasi 195 (`rfq`, `rfq_penawaran`) · `routes/v1/rfq.ts` · halaman /procurement/rfq.' },
      { key: 'pr-tabulasi', label: 'Perbandingan Penawaran', status: 'hidup', href: '/procurement/rfq', guna: 'Menjajarkan penawaran vendor untuk memilih yang terbaik.', catatan: 'Satu layar dengan RFQ-nya. Tabulasi DITURUNKAN tiap kali diminta (`lib/tabulasi-penawaran.ts`), tidak disimpan — supaya "termurah" tak bisa basi saat satu penawaran disunting.' },
      { key: 'pr-po', label: 'Purchase Order', status: 'hidup', href: '/procurement/pesanan', guna: 'Pesanan resmi ke supplier, terkirim & berjejak.' },
      { key: 'pr-blanket', label: 'Kontrak Payung', status: 'hidup', href: '/procurement/lanjutan?bagian=payung', guna: 'Harga tetap untuk pembelian berulang sepanjang periode.', catatan: 'Kuota per-item dijaga constraint DB (`terpakai <= kuota`) — PO tak bisa menarik 1.200 ton dari kontrak 1.000 ton. Kontrak berstatus `aktif` yang kuota/masanya habis ditandai TAK BISA DIPAKAI: PO berikutnya ditagih di luar harga kontrak.' },
      { key: 'pr-grn', label: 'Goods Receipt', status: 'hidup', href: '/procurement/penerimaan', guna: 'Penerimaan barang, otomatis menambah stok.' },
      { key: 'pr-3way', label: '3-Way Match', status: 'hidup', href: '/procurement', guna: 'Mencocokkan PO, penerimaan, dan tagihan sebelum bayar.' },
      { key: 'pr-evaluasi', label: 'Evaluasi Kinerja Vendor', status: 'hidup', href: '/procurement/kualifikasi', guna: 'Menilai ketepatan waktu & mutu tiap supplier.', catatan: 'Migrasi 210 (`evaluasi_vendor`) · `lib/vendor-penilaian.ts` · /procurement/kualifikasi. Skor berbobot + titik lemah per-dimensi.' },
      { key: 'pr-jadwal-bayar', label: 'Jadwal Bayar Vendor', status: 'hidup', href: '/procurement', guna: 'Utang supplier beserta jatuh temponya.' },
      { key: 'pr-expediting', label: 'Expediting & Logistik', status: 'hidup', href: '/procurement/lanjutan?bagian=expediting', guna: 'Mengejar pengiriman yang terlambat.', catatan: 'Telat diukur dari KEBUTUHAN kita, bukan janji vendor — keduanya ditampilkan supaya selisihnya terlihat. Yang dilaporkan telat TERPARAH, bukan rata-rata. Bukan `po_delivery_log` (itu jejak kirim dokumen PO, bukan pelacakan barang).' },
    ],
  },
  {
    key: 'g-inventory', label: 'Gudang & Material', icon: 'Package', urutan: 70,
    items: [
      { key: 'iv-gudang', label: 'Gudang Proyek', status: 'sebagian', href: '/procurement', guna: 'Tempat simpan material di lokasi kerja.' },
      { key: 'iv-mutasi', label: 'Stok Masuk & Keluar', status: 'hidup', href: '/procurement/stok', guna: 'Pencatatan pemakaian, pengembalian, dan penyesuaian.' },
      { key: 'iv-transfer', label: 'Transfer Antar Proyek', status: 'hidup', href: '/gudang/transfer', guna: 'Memindahkan material dari proyek yang berlebih.', catatan: 'Migrasi 193 (`stock_transfers`) · `routes/v1/transfer-stok.ts` · /gudang/transfer. Catatan lama "dicatat sebagai keluar-masuk terpisah" SALAH sejak migrasi 193.' },
      { key: 'iv-opname', label: 'Stock Opname', status: 'hidup', href: '/procurement', guna: 'Menghitung fisik dan mencocokkan dengan catatan.' },
      { key: 'iv-minstok', label: 'Minimum Stok', status: 'sebagian', href: '/procurement', guna: 'Peringatan saat stok menyentuh batas pesan ulang.' },
      { key: 'iv-rekonsiliasi', label: 'Rekonsiliasi Material', href: '/gudang/rekonsiliasi', status: 'gerbang', guna: 'Membandingkan kebutuhan teoritis RAB dengan pemakaian nyata.', catatan: 'Gerbang §D7 belum terbuka: pemetaan resource ↔ material baru cocok 0,1%, dan `project_expenses` belum punya atribusi item.' },
      { key: 'iv-waste', label: 'Tracking Waste', status: 'gerbang', guna: 'Mengukur susut & sisa material.', catatan: 'Hitungannya SUDAH JALAN: `lib/rekonsiliasi-material.ts` (34 test) menghitung `susut_pct` dengan ambang 5%, dan halamannya menandai "susut tinggi". Yang menggerbang bukan kode melainkan DATA — pemetaan resource↔material baru cocok 0,1%, jadi angkanya tak bisa dipercaya. Bukan `rencana`.' },
    ],
  },
  {
    key: 'g-subkon', label: 'Mandor & Subkon', icon: 'HardHat', urutan: 80,
    items: [
      { key: 'sk-paket', label: 'Paket Subkontrak', status: 'sebagian', href: '/mandor', guna: 'Membagi pekerjaan jadi paket yang disubkontrakkan.' },
      { key: 'sk-tender', label: 'Tender', status: 'hidup', href: '/mandor/tender', guna: 'Memilih subkon lewat penawaran, bukan penunjukan.', catatan: 'Migrasi 201+203 · `lib/tender-subkon.ts` · /mandor/tender. Menjawab kenapa borongan jatuh ke penawar tertentu.' },
      { key: 'sk-kontrak', label: 'Kontrak & BOQ Subkon', status: 'sebagian', href: '/mandor', guna: 'Lingkup kerja subkon beserta harga satuannya.' },
      { key: 'sk-wo', label: 'Work Order', status: 'sebagian', href: '/mandor', guna: 'Perintah kerja resmi ke subkon/mandor.' },
      { key: 'sk-opname', label: 'Opname Bersama', status: 'sebagian', href: '/proyek', tabProyek: 'sec-progress', guna: 'Pengukuran hasil kerja yang disepakati dua pihak.' },
      { key: 'sk-claim', label: 'Progress Claim', status: 'sebagian', href: '/mandor/penagihan', guna: 'Tagihan subkon berdasarkan hasil opname.' },
      { key: 'sk-retensi', label: 'Retensi', status: 'hidup', href: '/mandor/retensi', guna: 'Tahanan pembayaran subkon sampai masa pemeliharaan lewat.', catatan: 'Migrasi 183+188 · `lib/retensi-subkontrak.ts` · /mandor/retensi. Catatan lama "ke subkon belum" SALAH sejak migrasi 183.' },
      { key: 'sk-backcharge', label: 'Back-Charge', status: 'sebagian', href: '/mandor', guna: 'Potongan atas biaya yang seharusnya ditanggung subkon.' },
      { key: 'sk-evaluasi', label: 'Evaluasi Subkon', status: 'hidup', href: '/kepatuhan?bagian=evaluasi', guna: 'Menilai mutu & ketepatan waktu subkon.', catatan: 'Lima dimensi berbobot (K3 & kepatuhan 25%+20%). Kecelakaan kerja MENGGUGURKAN, bukan diratakan skor: subkon berskor K3 80 dengan satu kecelakaan bukan subkon yang aman.' },
      { key: 'sk-kepatuhan', label: 'Kepatuhan Subkon', status: 'hidup', href: '/kepatuhan?bagian=dokumen', guna: 'Memastikan izin, asuransi, dan pajak subkon berlaku.', catatan: 'Dokumen bercentang `terverifikasi` yang masa berlakunya HABIS ditandai khusus — centang itu hanya berarti seseorang pernah memeriksanya, bukan bahwa dokumennya masih hidup hari ini.' },
      { key: 'sk-mandor', label: 'Manajemen Mandor', status: 'hidup', href: '/mandor/tukang', guna: 'Penugasan mandor, lingkup kerja, dan rekapitulasinya.' },
      { key: 'sk-kasbon', label: 'Kasbon', status: 'hidup', href: '/mandor/kasbon', guna: 'Uang muka operasional mandor & tukang.' },
      { key: 'sk-upah', label: 'Upah Harian & Borongan', status: 'hidup', href: '/mandor/upah', guna: 'Pembayaran upah per hari, per borongan, atau per progres.' },
      { key: 'sk-settlement', label: 'Settlement Borongan', status: 'hidup', href: '/mandor', guna: 'Perhitungan akhir borongan setelah dipotong kasbon.' },
    ],
  },
  {
    key: 'g-lapangan', label: 'Operasi Lapangan', icon: 'ClipboardList', urutan: 90,
    items: [
      { key: 'lp-dpr', label: 'Laporan Harian', status: 'sebagian', href: '/proyek', tabProyek: 'sec-progress', guna: 'Catatan harian: pekerjaan, tenaga, cuaca, kendala.' },
      { key: 'lp-tenaga', label: 'Log Tenaga Kerja', status: 'sebagian', href: '/mandor', guna: 'Jumlah pekerja per hari per proyek.' },
      { key: 'lp-alat', label: 'Log Pemakaian Alat', status: 'hidup', href: '/aset/operasional', guna: 'Jam pakai alat, dasar hitung biaya & utilisasi.', catatan: 'Meter terkini diambil dari pembacaan TERTINGGI, bukan entri terbaru — koreksi mundur tak boleh membuat alat terlihat belum waktunya diservis.' },
      { key: 'lp-cuaca', label: 'Log Cuaca', status: 'sebagian', href: '/proyek', tabProyek: 'sec-progress', guna: 'Catatan cuaca — bukti pendukung pengajuan EOT.' },
      { key: 'lp-instruksi', label: 'Instruksi Lapangan', status: 'hidup', href: '/proyek', guna: 'Perintah tertulis dari pengawas ke pelaksana.', catatan: 'Migrasi 186 (`field_instructions`) · `lib/instruksi-lapangan.ts` (16 test) · `routes/v1/instruksi-lapangan.ts` · `instruksi-lapangan-section.tsx`. Status `rencana` sebelumnya SALAH.' },
      { key: 'lp-permit', label: 'Izin Kerja', status: 'hidup', href: '/kepatuhan?bagian=kesiapan', guna: 'Work permit untuk pekerjaan berisiko tinggi.', catatan: 'Pemutus WAJIB berbeda dari pengaju (constraint DB + permission terpisah `k3:permit:decide`). Izin berstatus `disetujui` yang jendela waktunya lewat ditandai TIDAK BERIZIN — izin kerja bukan dokumen abadi.' },
      { key: 'lp-rfi', label: 'Inspeksi', status: 'hidup', href: '/lapangan/inspeksi', guna: 'Permintaan pemeriksaan sebelum pekerjaan ditutup.', catatan: 'Capability Tier-2 (ROADMAP #24). Yang memutuskan lolos terpisah dari yang mengajukan; gagal boleh langsung jadi temuan punch list.' },
      { key: 'lp-submittal', label: 'Submittal', status: 'hidup', href: '/lapangan/submittal', guna: 'Pengajuan contoh material & gambar kerja untuk disetujui.', catatan: 'Capability Tier-2 (ROADMAP #24). Revisi dirantai ke pengajuan pertama — "ditolak 3× sebelum disetujui" adalah fakta yang menjelaskan keterlambatan pengadaan. Persetujuan lewat Workflow Engine, bukan status sendiri.' },
      { key: 'lp-ncr', label: 'Non-Conformance Report', status: 'hidup', href: '/mutu/ncr', guna: 'Laporan pekerjaan yang tak sesuai spesifikasi.', catatan: 'Migrasi 189 · `routes/v1/ncr.ts` · /mutu/ncr. Disposisi formal — itu yang membedakannya dari punch list.' },
      { key: 'lp-punch', label: 'Punch List', status: 'hidup', href: '/lapangan/punch-list', guna: 'Daftar cacat yang harus diperbaiki sebelum serah terima.', catatan: 'Capability Tier-2 (ROADMAP #24). Verifikasi terpisah dari perbaikan — pelaksana tak menutup perkaranya sendiri.' },
      { key: 'lp-foto', label: 'Dokumentasi Foto', status: 'hidup', href: '/proyek', tabProyek: 'sec-foto', guna: 'Foto progres, cacat, dan serah terima.' },
      { key: 'lp-serah', label: 'Serah Terima (PHO/FHO)', status: 'sebagian', href: '/proyek', guna: 'Berita acara serah terima pertama & akhir.' },
    ],
  },
  {
    key: 'g-qaqc', label: 'Mutu (QA/QC)', icon: 'BadgeCheck', urutan: 100,
    items: [
      { key: 'qc-rencana', label: 'Rencana Mutu Proyek', status: 'rencana', guna: 'Dokumen mutu yang disepakati di awal proyek.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender yang mensyaratkannya. Membangun sekarang berarti menebak bentuk yang diminta tender yang belum pernah diikuti.' },
      { key: 'qc-itp', label: 'Inspection & Test Plan', status: 'rencana', guna: 'Titik-titik pemeriksaan wajib beserta kriterianya.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'qc-checklist', label: 'Checklist Inspeksi', status: 'rencana', guna: 'Daftar periksa per jenis pekerjaan.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'qc-uji', label: 'Hasil Uji Material', status: 'rencana', guna: 'Hasil uji beton, tanah, dan baja dari laboratorium.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'qc-ncr', label: 'Register NCR', status: 'rencana', guna: 'Rekapitulasi ketidaksesuaian & tindak lanjutnya.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'qc-capa', label: 'Tindakan Korektif', status: 'rencana', guna: 'Perbaikan & pencegahan agar cacat tak berulang.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'qc-audit', label: 'Audit Mutu', status: 'rencana', guna: 'Pemeriksaan berkala penerapan sistem mutu.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
    ],
  },
  {
    key: 'g-hse', label: 'K3 & Lingkungan', icon: 'ShieldAlert', urutan: 110,
    items: [
      { key: 'hse-rk3k', label: 'RK3K', status: 'rencana', guna: 'Rencana K3 Kontrak — dokumen wajib tender pemerintah.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan. Syarat prakualifikasi proyek besar.' },
      { key: 'hse-jsa', label: 'Job Safety Analysis', status: 'rencana', guna: 'Analisa bahaya per jenis pekerjaan.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'hse-induksi', label: 'Induksi & Pelatihan K3', status: 'rencana', guna: 'Catatan pembekalan keselamatan pekerja baru.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'hse-apd', label: 'Alat Pelindung Diri', status: 'rencana', guna: 'Distribusi & pemeriksaan APD.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'hse-inspeksi', label: 'Inspeksi K3', status: 'rencana', guna: 'Pemeriksaan rutin kondisi keselamatan di lokasi.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'hse-insiden', label: 'Laporan Insiden', status: 'rencana', guna: 'Pencatatan kecelakaan & nyaris celaka.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
      { key: 'hse-lingkungan', label: 'Pengelolaan Lingkungan', status: 'rencana', guna: 'Limbah, kebisingan, dan dampak lingkungan.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender mensyaratkan.' },
    ],
  },
  {
    key: 'g-hr', label: 'SDM & Payroll', icon: 'Users', urutan: 120,
    items: [
      { key: 'hr-karyawan', label: 'Data Karyawan', status: 'sebagian', href: '/users', guna: 'Data staf beserta jabatan & aksesnya.' },
      { key: 'hr-rekrutmen', label: 'Rekrutmen', status: 'rencana', guna: 'Proses penerimaan karyawan baru.', catatan: 'Skala tim belum menuntutnya.' },
      { key: 'hr-absensi', label: 'Absensi & Timesheet', status: 'rencana', guna: 'Kehadiran staf kantor & jam kerja.', catatan: 'Berbeda dari upah harian mandor yang sudah ada.' },
      { key: 'hr-cuti', label: 'Cuti & Izin', status: 'rencana', guna: 'Pengajuan & saldo cuti.', catatan: 'Skala tim belum menuntutnya.' },
      { key: 'hr-payroll', label: 'Payroll Staf', status: 'rencana', guna: 'Gaji bulanan karyawan tetap.', catatan: 'Sempat ditandai eksternal dengan mengutip KEPUTUSAN-SCOPE §2 — padahal §2 justru MEMBALIKNYA jadi MASUK (2026-08-01 11:09; catatan ini ditulis 14:06, tiga jam sesudahnya). Dikoreksi 2026-08-09.' },
      { key: 'hr-upah', label: 'Upah Harian Lapangan', status: 'hidup', href: '/mandor/upah', guna: 'Upah mandor & tukang — sudah berjalan penuh.' },
      { key: 'hr-bpjs', label: 'BPJS & Potongan', status: 'rencana', guna: 'Potongan jaminan sosial karyawan.', catatan: 'Bagian dari payroll — ikut MASUK bersama hr-payroll (KEPUTUSAN-SCOPE §2).' },
      { key: 'hr-pph21', label: 'PPh 21', status: 'rencana', guna: 'Pajak penghasilan karyawan.', catatan: 'Ikut MASUK bersama hr-payroll. Aturannya memang berubah tiap tahun — itu alasan memakai tabel TER PMK-168/2023 yang bisa diperbarui sebagai data, bukan alasan tidak membangunnya.' },
      { key: 'hr-sertifikasi', label: 'Sertifikasi & Kompetensi', status: 'rencana', guna: 'SKA/SKT tenaga ahli beserta masa berlakunya.', catatan: 'Diperlukan sebagai syarat prakualifikasi tender.' },
      { key: 'hr-kinerja', label: 'Penilaian Kinerja', status: 'rencana', guna: 'Evaluasi berkala karyawan.', catatan: 'Skala tim belum menuntutnya.' },
      { key: 'hr-reimburse', label: 'Klaim Perjalanan', status: 'sebagian', href: '/kas', guna: 'Penggantian biaya perjalanan dinas.' },
    ],
  },
  {
    key: 'g-aset', label: 'Alat & Aset', icon: 'Truck', urutan: 130,
    items: [
      { key: 'as-register', label: 'Register Aset', status: 'hidup', href: '/aset', guna: 'Daftar alat milik perusahaan beserta kondisinya.' },
      { key: 'as-mutasi', label: 'Mutasi Antar Proyek', status: 'hidup', href: '/aset', guna: 'Perpindahan alat, lengkap dengan kondisi serah terima.' },
      { key: 'as-penyusutan', label: 'Penyusutan', status: 'hidup', href: '/aset', guna: 'Nilai buku alat — garis lurus atau saldo menurun.' },
      { key: 'as-sewa', label: 'Sewa Alat', status: 'hidup', href: '/aset?tab=sewa', guna: 'Alat yang disewa, beserta biaya berjalannya.' },
      { key: 'as-utilisasi', label: 'Utilisasi', status: 'hidup', href: '/aset', guna: 'Seberapa sering alat terpakai — alat menganggur = uang tertidur.' },
      { key: 'as-maintenance', label: 'Maintenance Terjadwal', status: 'hidup', href: '/aset/operasional', guna: 'Jadwal servis berkala agar alat tak rusak di tengah proyek.', catatan: 'Interval ganda: jam meter ATAU hari, mana yang tercapai lebih dulu. Kolom "dipicu oleh" menyebut yang mana — excavator 300 jam/bulan butuh oli meski jadwal 180-harinya baru separuh.' },
      { key: 'as-opex', label: 'Biaya Operasional Alat', status: 'hidup', href: '/aset/operasional', guna: 'BBM, operator, dan suku cadang per alat.', catatan: 'Biaya per jam bernilai "—" saat jam operasi nol, bukan angka hasil bagi-nol yang terlihat masuk akal.' },
      { key: 'as-gl', label: 'Penyusutan → Jurnal', status: 'sebagian', href: '/aset/operasional', guna: 'Mengirim beban penyusutan ke buku besar.', catatan: 'Tabel `penyusutan_alat` + kolom `journal_entry_id` sudah ada dan terisi (migrasi 211); penjurnalan otomatis ke GL menunggu R-001 (bentrok migrasi 047/167) diselesaikan.' },
    ],
  },
  {
    key: 'g-keuangan', label: 'Keuangan', icon: 'Landmark', urutan: 140,
    items: [
      { key: 'fn-gl', label: 'Buku Besar', status: 'hidup', href: '/akuntansi?tab=besar', guna: 'Jurnal seluruh transaksi — sumber laporan keuangan resmi.', catatan: 'Migrasi 167–175 · `routes/v1/gl.ts` (bagan akun, jurnal, posting, void, buku besar, neraca saldo, laporan) · halaman /akuntansi.' },
      { key: 'fn-jurnal', label: 'Jurnal Umum', status: 'hidup', href: '/akuntansi?tab=jurnal', guna: 'Input jurnal manual untuk penyesuaian.', catatan: 'Input jurnal manual + posting + void hidup di /akuntansi. Debit-kredit dijaga constraint DB, bukan hanya validasi form.' },
      { key: 'fn-ap', label: 'Utang Supplier', status: 'hidup', href: '/procurement/hutang', guna: 'Tagihan supplier, umur utang, dan jadwal bayar.' },
      { key: 'fn-ar', label: 'Piutang Klien', status: 'hidup', href: '/piutang', guna: 'Tagihan ke klien, umur piutang, dan tindak lanjutnya.' },
      { key: 'fn-kas', label: 'Kas & Bank', status: 'hidup', href: '/kas', guna: 'Saldo akun kas, transfer, dan pengeluaran.' },
      { key: 'fn-rekonsiliasi', label: 'Rekonsiliasi Bank', status: 'hidup', href: '/kas/rekonsiliasi', guna: 'Mencocokkan catatan kas dengan rekening koran.', catatan: 'Migrasi 234 (rekening_koran + baris + pencocokan + penyesuaian, RLS forced) · lib/rekonsiliasi-bank.ts 22 test · routes/v1/rekonsiliasi-bank.ts 15 test integrasi · 28 invarian DB · halaman /kas/rekonsiliasi. Impor CSV/Excel koran; integrasi API bank BUKAN prasyarat — kontraktor segmen ini mengunduh koran dari internet banking.' },
      { key: 'fn-petty', label: 'Kas Kecil', status: 'hidup', href: '/kas', guna: 'Pengeluaran kecil harian di lapangan.' },
      { key: 'fn-aset-tetap', label: 'Aset Tetap', status: 'sebagian', href: '/aset', guna: 'Nilai perolehan & penyusutan aset di neraca.', catatan: 'Register & penyusutan sudah ada; pencatatan ke neraca menunggu GL.' },
      { key: 'fn-pajak', label: 'PPN & PPh', status: 'hidup', href: '/laporan?tab=pajak', guna: 'Rekap pajak per invoice & per periode.' },
      { key: 'fn-efaktur', label: 'e-Faktur & e-Bupot', status: 'sebagian', href: '/laporan?tab=pajak', guna: 'Nomor faktur pajak & bukti potong.', catatan: 'Pencatatan nomor sudah ada; pembuatan berkasnya lewat aplikasi DJP.' },
      { key: 'fn-laporan', label: 'Laporan Keuangan', status: 'sebagian', href: '/akuntansi?tab=laporan', guna: 'Arus kas, neraca, dan laba-rugi.', catatan: 'Arus kas sudah ada; neraca & L/R menunggu GL.' },
      { key: 'fn-wip', label: 'Pengakuan Pendapatan', status: 'hidup', href: '/laporan?tab=wip', guna: 'WIP/PSAK: pendapatan diakui sesuai kemajuan, bukan sesuai tagihan.' },
      { key: 'fn-tutup-buku', label: 'Tutup Buku', status: 'rencana', guna: 'Mengunci periode agar angka lampau tak berubah.', catatan: 'Menunggu Modul 10 (GL).' },
      { key: 'fn-audit', label: 'Audit Trail', status: 'hidup', href: '/audit', guna: 'Rekam jejak perubahan data — append-only, tak bisa diubah.' },
    ],
  },
  {
    key: 'g-tagih', label: 'Penagihan', icon: 'Receipt', urutan: 150,
    items: [
      { key: 'tg-progress', label: 'Progress Billing', status: 'hidup', href: '/keuangan', guna: 'Tagihan berdasarkan kemajuan pekerjaan.' },
      { key: 'tg-termin', label: 'Termin', status: 'hidup', href: '/keuangan', guna: 'Penagihan bertahap sesuai jadwal kontrak.' },
      { key: 'tg-ipc', label: 'Interim Payment Certificate', status: 'hidup', href: '/keuangan/ipc', guna: 'Sertifikat pembayaran yang disahkan pengawas.', catatan: 'Migrasi 204 · `lib/sertifikat-ipc.ts` + `lib/ipc-progres.ts` · /keuangan/ipc. Progres yang diakui DIBEKUKAN saat penagihan, bukan dibaca ulang hari ini.' },
      { key: 'tg-retensi', label: 'Pelepasan Retensi', status: 'hidup', href: '/piutang', guna: 'Menagih uang tahanan setelah masa pemeliharaan.' },
      { key: 'tg-uangmuka', label: 'Pemotongan Uang Muka', status: 'hidup', href: '/piutang', guna: 'Mengembalikan uang muka lewat potongan tiap termin.' },
      { key: 'tg-tambah', label: 'Tagihan Pekerjaan Tambah', status: 'sebagian', href: '/keuangan', guna: 'Menagih change order yang sudah disetujui.' },
      { key: 'tg-invoice', label: 'Invoice & Faktur Pajak', status: 'hidup', href: '/keuangan/invoice', guna: 'Penerbitan invoice lengkap dengan pajaknya.' },
      { key: 'tg-followup', label: 'Follow-Up Penagihan', status: 'hidup', href: '/piutang', guna: 'Mengejar invoice yang lewat jatuh tempo.' },
      { key: 'tg-nota-kredit', label: 'Nota Kredit', status: 'hidup', href: '/procurement/lanjutan?bagian=nota', guna: 'Pengurangan tagihan yang sudah terbit.', catatan: 'Pemutus WAJIB berbeda dari pengaju (constraint DB). `disetujui` dan `diterapkan` adalah dua kejadian terpisah — jarak di antaranya persis yang membuat uang hilang dengan persetujuan lengkap, dan itu ditandai.' },
    ],
  },
  {
    key: 'g-dokumen', label: 'Dokumen', icon: 'FolderOpen', urutan: 160,
    items: [
      { key: 'dk-register', label: 'Register Dokumen', status: 'sebagian', href: '/proyek', tabProyek: 'sec-dokumen', guna: 'Daftar dokumen proyek beserta versinya.' },
      { key: 'dk-transmittal', label: 'Transmittal', status: 'hidup', href: '/dokumen/kendali?bagian=transmittal', guna: 'Bukti serah terima dokumen antar pihak.', catatan: 'Bukti KIRIM dan bukti TERIMA disimpan terpisah — keduanya klaim berbeda, dan selisihnya yang diperdebatkan saat pekerjaan salah gambar dibongkar. Yang tak berjawab >7 hari ditandai menggantung.' },
      { key: 'dk-gambar', label: 'Register Gambar', status: 'hidup', href: '/dokumen/kendali?bagian=gambar', guna: 'Gambar kerja beserta revisinya.', catatan: 'Gambar berstatus `berlaku` yang sudah punya revisi lebih tinggi ditandai USANG — dihitung dari perbandingan revisi, bukan dari kolom status yang mudah lupa diperbarui.' },
      { key: 'dk-notulen', label: 'Notulen Rapat', status: 'hidup', href: '/dokumen/kendali?bagian=notulen', guna: 'Catatan rapat & keputusan yang diambil.', catatan: 'Butir tindakan WAJIB punya penanggung jawab (constraint DB). Butir terbuka TANPA tenggat dihitung terpisah — ia tak akan pernah muncul sebagai `lewat tenggat`, hanya mengendap.' },
      { key: 'dk-approval', label: 'Approval Dokumen', status: 'hidup', href: '/pengaturan/approval', guna: 'Rantai persetujuan berjenjang yang bisa dikonfigurasi.' },
      { key: 'dk-distribusi', label: 'Matriks Distribusi', status: 'hidup', href: '/dokumen/kendali', guna: 'Siapa menerima dokumen jenis apa.', catatan: 'Penerima WAJIB bisa dihubungi: akun sistem ATAU surel ber-@ (constraint DB). Penerima yang tak bisa dihubungi bukan penerima.' },
      { key: 'dk-esign', label: 'Tanda Tangan Elektronik', status: 'sebagian', href: '/dokumen/kendali', guna: 'Pengesahan dokumen tanpa cetak.', catatan: 'Yang disimpan SIDIK SHA-256 isi dokumen saat ditandatangani (dihitung di server, bukan diterima dari klien) — bisa dibuktikan dokumennya tak berubah sesudahnya. e-meterai tersertifikasi Peruri BELUM; itu yang menjadikannya sebagian.' },
    ],
  },
  {
    key: 'g-risiko', label: 'Risiko & Kepatuhan', icon: 'AlertTriangle', urutan: 170,
    items: [
      { key: 'rk-register', label: 'Register Risiko', status: 'rencana', guna: 'Daftar risiko proyek beserta dampak & mitigasinya.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu tender yang mensyaratkan, atau proyek dengan nilai yang menuntutnya.' },
      { key: 'rk-mitigasi', label: 'Rencana Mitigasi', status: 'rencana', guna: 'Tindakan pencegahan per risiko.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu pemicu yang sama dengan register risiko.' },
      { key: 'rk-perizinan', label: 'Perizinan', status: 'rencana', guna: 'IMB/PBG, izin lingkungan, dan masa berlakunya.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Sekarang ditangani manual per proyek.' },
      { key: 'rk-kepatuhan', label: 'Kepatuhan Regulasi', status: 'rencana', guna: 'Daftar kewajiban regulasi & status pemenuhannya.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Menunggu pemicu bisnis.' },
      { key: 'rk-sengketa', label: 'Sengketa & Klaim', status: 'rencana', guna: 'Catatan perselisihan beserta dasar hukumnya.', catatan: 'Masuk lingkup 2026-08-11 (R-011 — founder mencabut seluruh larangan; pemicu "menunggu tender" tak lagi berlaku). Semoga tak pernah dipakai — tapi bila terjadi, catatannya menentukan.' },
    ],
  },
  {
    key: 'g-laporan', label: 'Laporan & BI', icon: 'BarChart3', urutan: 180,
    items: [
      { key: 'bi-eksekutif', label: 'Dashboard Eksekutif', status: 'hidup', href: '/dashboard', guna: 'Ringkasan seluruh proyek dalam satu layar.' },
      { key: 'bi-proyek', label: 'Dashboard per Proyek', status: 'sebagian', href: '/proyek', guna: 'KPI satu proyek: progres, biaya, dan kas.' },
      { key: 'bi-biaya', label: 'Laporan Biaya', status: 'hidup', href: '/procurement/laporan', guna: 'Rekap biaya per proyek, mandor, dan kategori.' },
      { key: 'bi-arus-kas', label: 'Laporan Arus Kas', status: 'hidup', href: '/keuangan/arus-kas', guna: 'Uang masuk & keluar per periode.' },
      { key: 'bi-portofolio', label: 'Portofolio Biaya', status: 'hidup', href: '/laporan?tab=portofolio', guna: 'Perbandingan serapan anggaran lintas proyek.' },
      { key: 'bi-kpi', label: 'KPI Perusahaan', status: 'sebagian', href: '/laporan', guna: 'CPI, SPI, margin, umur piutang, dan backlog.' },
      { key: 'bi-builder', label: 'Report Builder', status: 'rencana', guna: 'Menyusun laporan sendiri tanpa menunggu dibuatkan.', catatan: 'Berguna saat kebutuhan laporan mulai beragam.' },
      { key: 'bi-export', label: 'Ekspor Excel & PDF', status: 'hidup', href: '/laporan', guna: 'Mengunduh laporan untuk dibawa ke luar sistem.' },
      { key: 'bi-terjadwal', label: 'Laporan Terjadwal', status: 'sebagian', href: '/dokumen/kendali?bagian=jadwal', guna: 'Kirim laporan otomatis tiap periode.', catatan: 'Jadwal + deteksi MACET hidup (gagal 3x berturut ATAU telat >2x iramanya, meski nol galat tercatat — proses penjadwal yang mati tak meninggalkan galat). Pengiriman surel otomatisnya sendiri belum dijalankan.' },
    ],
  },
  {
    key: 'g-sistem', label: 'Administrasi', icon: 'Settings', urutan: 190,
    items: [
      { key: 'sy-user', label: 'Pengguna & Role', status: 'hidup', href: '/users', guna: 'Akun pengguna beserta perannya.' },
      { key: 'sy-permission', label: 'Matriks Izin', status: 'hidup', href: '/pengaturan/roles', guna: 'Hak akses per peran — berbasis capability, bukan jabatan.' },
      { key: 'sy-approval', label: 'Konfigurasi Approval', status: 'hidup', href: '/pengaturan/approval', guna: 'Rantai persetujuan yang bisa diubah tanpa deploy.' },
      { key: 'sy-inbox-approval', label: 'Menunggu Persetujuan', status: 'hidup', href: '/approval-inbox', guna: 'Antrean lintas modul: seluruh dokumen yang menunggu keputusan Anda dalam satu halaman.' },
      { key: 'sy-notifikasi', label: 'Aturan Notifikasi', status: 'hidup', href: '/pengaturan/notifikasi', guna: 'Siapa mendapat pemberitahuan apa.' },
      { key: 'sy-kredensial', label: 'Kredensial & Integrasi', status: 'hidup', href: '/pengaturan/kredensial', guna: 'Kunci API penyedia AI, WhatsApp, email — tersimpan terenkripsi per perusahaan, tak pernah ditampilkan kembali.' },
      { key: 'sy-penyedia-ai', label: 'Penyedia AI', status: 'hidup', href: '/pengaturan/penyedia-ai', guna: 'Model, batas token, dan batas biaya bulanan per asisten — beserta berapa yang sudah terpakai bulan ini.' },
      // Kunci sama persis dengan `menu_items.key` — penjaga
      // `audit-peta-menu-vs-db` mencocokkan per KEY, jadi kunci bergaya katalog
      // (`sy-asisten`) tetap terhitung drift meski entrinya ada.
      //
      // Halaman `/asisten` sempat ada lalu DIBATALKAN (founder 2026-08-10):
      // obrolannya pindah ke rail kanan supaya pertanyaan dan datanya
      // berdampingan. Yang tersisa di menu adalah pengaturannya.
      { key: 'ai-asisten', label: 'Perilaku Asisten', status: 'hidup', href: '/pengaturan/asisten', guna: 'Instruksi tambahan, batas langkah, dan data apa yang boleh dibaca tiap asisten. Sifat READ-ONLY tak bisa diubah dari sini.' },
      // Label & href SAMA PERSIS dengan `menu_items` — penjaga
      // `audit-peta-menu-vs-db` membandingkan keduanya, dan katalog yang
      // menyebut tujuan berbeda dari sidebar membohongi salah satu pembacanya.
      { key: 'ai-biaya', label: 'Pemakaian & Biaya', status: 'hidup', href: '/pengaturan/biaya-ai', guna: 'Berapa token dan rupiah terpakai bulan ini, per asisten dan per model.', },
      { key: 'ai-whatsapp', label: 'Kanal WhatsApp', status: 'hidup', href: '/pengaturan/whatsapp', guna: 'Nomor yang boleh bertanya ke asisten dan menerima notifikasi — terikat akun pengguna, bukan daftar putih.', catatan: 'DUA ARAH sejak TJS-D2: kirim (verifikasi nomor, notifikasi) dan terima (webhook masuk, asisten menjawab). Founder masih perlu mengisi WA_WEBHOOK_SECRET dan mendaftarkan URL webhook di Evolution.' },
      { key: 'ai-plafon-setujui', label: 'Plafon Asisten', status: 'hidup', href: '/pengaturan/plafon-asisten', guna: 'Sampai nominal berapa tiap orang boleh menyetujui lewat asisten — batas melekat pada ORANG, bukan pada nomor atau kanal.' },
      { key: 'ai-penyedia', label: 'Penyedia Layanan', status: 'hidup', href: '/pengaturan/penyedia', guna: 'Registry sambungan luar (AI, WhatsApp) dengan status kesehatan dan uji koneksi. Penyedianya DATA, bukan kode — menambahnya tak perlu deploy.' },
      { key: 'ai-alur', label: 'Alur Otomasi', status: 'hidup', href: '/otomasi/alur', guna: 'Katalog workflow n8n: status jalan terakhir, jejak 50 eksekusi, dan pemicu manual. Katalognya TERPISAH dari n8n supaya tetap terbaca saat n8n mati.', catatan: 'Founder perlu mengisi N8N_BASE_URL (dan N8N_API_KEY bila instance-nya menuntut) di halaman Kredensial sebelum alur bisa dipicu.' },
      { key: 'ai-riwayat', label: 'Riwayat Asisten', status: 'hidup', href: '/otomasi/riwayat', guna: 'Apa yang DIBICARAKAN dengan asisten dan apa yang benar-benar TERJADI — percakapan, galat tool, entitas asing (I-4), tulisan yang mendarat, dan biayanya.' },
      { key: 'sy-jadwal', label: 'Jadwal Tugas', status: 'hidup', href: '/pengaturan/jadwal', guna: 'Tugas berkala yang berjalan sendiri — cek tenggat & milestone tanpa perlu ada yang menekan tombol.' },
      { key: 'sy-penomoran', label: 'Konfigurasi Penomoran', status: 'sebagian', guna: 'Format nomor dokumen per jenis.', catatan: 'Counter per-company sudah jalan; UI-nya belum.' },
      { key: 'sy-audit', label: 'Audit Log', status: 'hidup', href: '/audit', guna: 'Jejak seluruh perubahan data.' },
      { key: 'sy-api', label: 'API & Integrasi', status: 'rencana', guna: 'Sambungan ke sistem luar: akuntansi, bank, pajak.', catatan: 'Butuh kredensial pihak ketiga dari founder.' },
      { key: 'sy-import', label: 'Impor & Ekspor Data', status: 'sebagian', href: '/estimasi', guna: 'Memasukkan data massal dari Excel.', catatan: 'Impor RAB & AHSP sudah ada; jenis data lain belum.' },
      { key: 'sy-modul', label: 'Modul & Feature Flag', status: 'hidup', href: '/pengaturan', guna: 'Menyalakan/mematikan modul tanpa deploy.' },
      { key: 'sy-sistem', label: 'Pemeliharaan Sistem', status: 'hidup', href: '/sistem', guna: 'Menjalankan pemeriksaan berkala secara manual.' },
    ],
  },
  {
    key: 'g-mobile', label: 'Aplikasi Lapangan', icon: 'Smartphone', urutan: 200,
    items: [
      { key: 'mb-absensi', label: 'Absensi Lapangan', status: 'hidup', href: '/mandor/absensi', guna: 'Kehadiran tukang dicatat dari HP di lokasi.', catatan: 'Migrasi 191 (`absensi_harian`) · `routes/v1/absensi.ts` (daftar, catat, rekap) · `mandor/absensi/page.tsx`. Diukur 2026-08-07.' },
      { key: 'mb-progres', label: 'Input Progres Mobile', status: 'sebagian', guna: 'Mandor melaporkan kemajuan langsung dari lapangan.', catatan: 'Sudah ada di aplikasi mobile Fase 1; belum dipakai operasional.' },
      { key: 'mb-geotag', label: 'Foto Geotag', status: 'hidup', guna: 'Foto dengan koordinat — bukti pekerjaan benar di lokasi.', catatan: 'Migrasi 190 menambah `lintang`/`bujur`/`akurasi_m`/`sumber_lokasi` + acuan lokasi proyek · `lib/geotag.ts` (17 test) · `components/penanda-lokasi.tsx`. Catatan lama "kolom GPS belum ada" SALAH sejak migrasi 190 — diukur ulang 2026-08-07.' },
      { key: 'mb-offline', label: 'Mode Offline', status: 'sebagian', guna: 'Tetap bisa mencatat saat sinyal hilang, lalu sinkron.', catatan: 'TULIS: `lib/antrean-offline.ts` (antre + kirim ulang). BACA: `lib/cache-baca.ts` (IndexedDB, jaringan-dulu, data cache SELALU bertanda usianya) — dibuktikan lewat peramban nyata `uji-baca-offline.mjs`, bukan test unit saja. Yang belum: foto belum ikut diantre.' },
      { key: 'mb-notif', label: 'Notifikasi Perangkat', status: 'sebagian', href: '/notifications', guna: 'Pemberitahuan langsung ke HP.', catatan: 'Web Push sudah dikonfigurasi; belum diverifikasi di perangkat nyata.' },
    ],
  },
]

/** Seluruh item, diratakan — untuk pencarian by-key. */
export const SEMUA_ITEM: Array<ItemMenu & { grupKey: string; grupLabel: string }> =
  PETA_MENU.flatMap((g) => g.items.map((i) => ({ ...i, grupKey: g.key, grupLabel: g.label })))

export function cariItem(key: string) {
  return SEMUA_ITEM.find((i) => i.key === key) ?? null
}

/** Rekap untuk verifikasi & tampilan. */
export function rekapStatus() {
  const r: Record<StatusMenu, number> = { hidup: 0, sebagian: 0, rencana: 0, eksternal: 0, gerbang: 0 }
  for (const i of SEMUA_ITEM) r[i.status]++
  return { total: SEMUA_ITEM.length, grup: PETA_MENU.length, ...r }
}

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
      { key: 'md-coa', label: 'Chart of Accounts', status: 'rencana', guna: 'Bagan akun untuk buku besar.', catatan: 'Menunggu Modul 10 (GL in-app). Skema sudah disiapkan migrasi 047 tapi sengaja belum di-apply — CoA wajib divalidasi akuntan lebih dulu.' },
      { key: 'md-cost-code', label: 'Cost Code / CBS', status: 'sebagian', href: '/estimasi', guna: 'Struktur kode biaya untuk mengelompokkan anggaran & realisasi.', catatan: 'Registry sudah ada; pemetaan ke material belum.' },
      { key: 'md-wbs-template', label: 'Template WBS', status: 'sebagian', guna: 'Kerangka pekerjaan siap pakai untuk proyek baru.', catatan: 'Tabel `cbs_templates` ada, UI pengelolaannya belum.' },
      { key: 'md-resource', label: 'Master Resource', status: 'sebagian', href: '/estimasi', guna: 'Daftar tenaga, bahan, dan alat beserta satuannya.', catatan: 'Hidup di tab Katalog halaman Estimasi.' },
      { key: 'md-price-book', label: 'Price Book', status: 'sebagian', href: '/estimasi', guna: 'Harga satuan resource, ber-tanggal-berlaku.', catatan: 'Hidup di tab Harga halaman Estimasi.' },
      { key: 'md-satuan', label: 'Satuan', status: 'hidup', href: '/pengaturan/satuan', guna: 'Satuan ukur (m², m³, kg, batang) beserta dimensinya.' },
      { key: 'md-supplier', label: 'Supplier', status: 'hidup', href: '/procurement', guna: 'Daftar pemasok material & jasa.' },
      { key: 'md-prakualifikasi', label: 'Prakualifikasi Vendor', status: 'rencana', guna: 'Penilaian kelayakan vendor sebelum diundang menawar.', catatan: 'Berguna saat jumlah vendor bertambah; sekarang masih ditangani manual.' },
      { key: 'md-subkon', label: 'Subkontraktor', status: 'sebagian', href: '/mandor', guna: 'Daftar subkontraktor beserta lingkup pekerjaannya.', catatan: 'Sistem mandor jadi padanan lokalnya; subkon formal ber-kontrak belum.' },
      { key: 'md-klien', label: 'Klien', status: 'hidup', href: '/klien', guna: 'Data pemberi kerja, perorangan maupun badan usaha.' },
      { key: 'md-karyawan', label: 'Karyawan', status: 'sebagian', href: '/users', guna: 'Data staf & struktur organisasi.', catatan: 'Baru sebatas akun pengguna; data kepegawaian belum.' },
      { key: 'md-aset', label: 'Aset & Alat', status: 'hidup', href: '/aset', guna: 'Register alat milik perusahaan beserta nilai bukunya.' },
      { key: 'md-gudang', label: 'Gudang & Lokasi', status: 'sebagian', href: '/procurement', guna: 'Tempat penyimpanan material per proyek.', catatan: 'Stok sudah per-proyek; gudang sebagai entitas tersendiri belum.' },
      { key: 'md-pajak', label: 'Konfigurasi Pajak', status: 'hidup', href: '/pengaturan/keuangan', guna: 'Tarif PPh final & PPN, ber-tanggal-berlaku.' },
      { key: 'md-kalender', label: 'Kalender Kerja', status: 'rencana', guna: 'Hari libur & hari kerja efektif — dasar hitung durasi dan denda.', catatan: 'Sekarang durasi dihitung hari kalender. Perlu saat kontrak memakai hari kerja.' },
      { key: 'md-penomoran', label: 'Penomoran Dokumen', status: 'sebagian', guna: 'Format & urutan nomor MR, PO, invoice, dan dokumen lain.', catatan: 'Counter per-company sudah jalan (migrasi 135); UI pengaturannya belum.' },
      { key: 'md-template-dok', label: 'Template Dokumen', status: 'sebagian', guna: 'Kerangka kontrak, SPK, dan berita acara.', catatan: 'Kontrak PDF sudah bisa di-generate; template-nya belum bisa disunting.' },
    ],
  },
  {
    key: 'g-crm', label: 'Pra-Konstruksi', icon: 'Gavel', urutan: 20,
    items: [
      { key: 'crm-lead', label: 'Pipeline Lead', status: 'sebagian', href: '/tender', guna: 'Prospek pekerjaan sebelum jadi tender resmi.', catatan: 'Ada sebagai status `prospek` di register tender.' },
      { key: 'crm-tender', label: 'Register Tender', status: 'hidup', href: '/tender', guna: 'Tender yang diikuti, nilai penawaran, dan hasilnya.' },
      { key: 'crm-gonogo', label: 'Keputusan Go / No-Go', status: 'hidup', href: '/tender', guna: 'Memutuskan ikut atau lewat, beserta alasannya.' },
      { key: 'crm-prakualifikasi', label: 'Dokumen Prakualifikasi', status: 'rencana', guna: 'Berkas administrasi & teknis untuk lolos prakualifikasi.', catatan: 'Diperlukan saat mulai ikut tender pemerintah.' },
      { key: 'crm-estimating', label: 'Estimating / AHSP', status: 'hidup', href: '/estimasi', guna: 'Menyusun harga satuan dari analisa AHSP resmi.' },
      { key: 'crm-boq', label: 'Quantity Takeoff / BOQ', status: 'sebagian', href: '/estimasi', guna: 'Menghitung volume pekerjaan dari gambar.', catatan: 'Read-model BOQ sudah ada; input takeoff-nya belum.' },
      { key: 'crm-skenario', label: 'Skenario Penawaran', status: 'sebagian', guna: 'Membandingkan beberapa versi harga sebelum memutuskan.', catatan: 'Tabel `scenarios` ada, endpoint-nya belum.' },
      { key: 'crm-markup', label: 'Markup & Margin', status: 'rencana', guna: 'Menetapkan keuntungan, overhead, dan cadangan risiko.', catatan: 'BUK sudah dihitung di AHSP; pengaturan markup terpisah belum.' },
      { key: 'crm-eskalasi', label: 'Eskalasi Harga', status: 'rencana', guna: 'Penyesuaian harga untuk kontrak jangka panjang.', catatan: 'Relevan untuk kontrak >1 tahun.' },
      { key: 'crm-proposal', label: 'Dokumen Penawaran', status: 'sebagian', guna: 'Menyusun surat penawaran lengkap untuk dikirim.', catatan: 'Baru kontrak/SPK PDF; proposal penawaran belum.' },
      { key: 'crm-bidbond', label: 'Jaminan Penawaran', status: 'hidup', href: '/proyek', tabProyek: 'kontrak', guna: 'Bid bond: jaminan bahwa penawaran serius.' },
      { key: 'crm-winloss', label: 'Analisa Menang/Kalah', status: 'hidup', href: '/tender', guna: 'Kenapa kalah — harga, atau syarat?' },
      { key: 'crm-backlog', label: 'Backlog / Order Book', status: 'hidup', href: '/tender', guna: 'Pekerjaan yang sudah dimenangkan tapi belum selesai.' },
    ],
  },
  {
    key: 'g-kontrak', label: 'Kontrak', icon: 'FileSignature', urutan: 30,
    items: [
      { key: 'kt-register', label: 'Register Kontrak', status: 'sebagian', href: '/proyek', guna: 'Daftar kontrak induk beserta nilai & jangka waktunya.', catatan: 'Data kontrak masih menempel di proyek; tabel kontrak tersendiri belum.' },
      { key: 'kt-termin', label: 'Termin Pembayaran', status: 'hidup', href: '/keuangan', guna: 'Jadwal penagihan bertahap sesuai kontrak.' },
      { key: 'kt-retensi', label: 'Retensi', status: 'hidup', href: '/piutang', guna: 'Uang tahanan yang dilepas setelah masa pemeliharaan.' },
      { key: 'kt-co', label: 'Change Order', status: 'hidup', href: '/proyek', tabProyek: 'change-order', guna: 'Pekerjaan tambah/kurang yang mengubah nilai kontrak.' },
      { key: 'kt-claims', label: 'Claims', status: 'rencana', guna: 'Tuntutan biaya akibat hal di luar kendali kontraktor.', catatan: 'Berbeda dari change order: claim belum tentu disetujui.' },
      { key: 'kt-eot', label: 'Perpanjangan Waktu (EOT)', status: 'hidup', href: '/proyek', tabProyek: 'kontrak', guna: 'Tambahan waktu yang menghapus denda keterlambatan.' },
      { key: 'kt-ld', label: 'Denda Keterlambatan', status: 'hidup', href: '/proyek', tabProyek: 'kontrak', guna: 'Denda bila pekerjaan selesai melewati tanggal efektif.' },
      { key: 'kt-bond', label: 'Register Jaminan', status: 'hidup', href: '/proyek', tabProyek: 'kontrak', guna: 'Jaminan pelaksanaan, uang muka, dan pemeliharaan.' },
      { key: 'kt-asuransi', label: 'Register Asuransi', status: 'rencana', guna: 'Polis CAR/TPL beserta masa berlakunya.', catatan: 'Syarat wajib di sebagian besar tender pemerintah.' },
      { key: 'kt-surat', label: 'Surat Masuk & Keluar', status: 'rencana', guna: 'Korespondensi resmi dengan pemberi kerja.', catatan: 'Penting saat sengketa — surat adalah bukti.' },
      { key: 'kt-subkon', label: 'Kontrak Subkontraktor', status: 'sebagian', href: '/mandor', guna: 'Perjanjian dengan subkon beserta lingkupnya.', catatan: 'Work scope mandor jadi padanannya.' },
    ],
  },
  {
    key: 'g-jadwal', label: 'Perencanaan', icon: 'CalendarRange', urutan: 40,
    items: [
      { key: 'jd-wbs', label: 'WBS Proyek', status: 'sebagian', href: '/proyek', tabProyek: 'rab', guna: 'Pemecahan pekerjaan jadi paket yang bisa dijadwalkan.' },
      { key: 'jd-baseline', label: 'Baseline Schedule', status: 'rencana', guna: 'Jadwal yang dibekukan sebagai pembanding.', catatan: 'Tanggal rencana sudah ada di Gantt; pembekuan baseline belum.' },
      { key: 'jd-gantt', label: 'Gantt Chart', status: 'hidup', href: '/proyek', tabProyek: 'gantt', guna: 'Jadwal batang beserta ketergantungan antar-pekerjaan.' },
      { key: 'jd-cpm', label: 'Jalur Kritis (CPM)', status: 'rencana', guna: 'Rantai pekerjaan yang menentukan tanggal selesai.', catatan: 'Ketergantungan sudah tercatat; perhitungan jalur kritisnya belum.' },
      { key: 'jd-kurva-s', label: 'Kurva S', status: 'hidup', href: '/proyek', tabProyek: 'kurva-s', guna: 'Rencana vs realisasi progres dan serapan biaya.' },
      { key: 'jd-histogram', label: 'Histogram Sumber Daya', status: 'rencana', guna: 'Kebutuhan tenaga & alat per periode.', catatan: 'Mencegah penumpukan kebutuhan di minggu yang sama.' },
      { key: 'jd-lookahead', label: 'Look-Ahead 3 Minggu', status: 'hidup', href: '/proyek', tabProyek: 'look-ahead', guna: 'Apa yang harus disiapkan minggu ini sampai 3 minggu ke depan.' },
      { key: 'jd-milestone', label: 'Milestone', status: 'hidup', href: '/proyek', tabProyek: 'milestone', guna: 'Target pencapaian yang disepakati kontrak.' },
      { key: 'jd-evm', label: 'Earned Value (EVM)', status: 'hidup', href: '/proyek', tabProyek: 'kurva-s', guna: 'CPI, SPI, dan perkiraan biaya akhir proyek.' },
      { key: 'jd-delay', label: 'Analisa Keterlambatan', status: 'rencana', guna: 'Menelusuri penyebab telat & siapa yang menanggung.', catatan: 'Dasar pengajuan EOT yang bisa dipertahankan.' },
      { key: 'jd-method', label: 'Method Statement', status: 'rencana', guna: 'Cara kerja yang disetujui untuk pekerjaan berisiko.', catatan: 'Sering diminta bersamaan dengan dokumen K3.' },
    ],
  },
  {
    key: 'g-cost', label: 'Budget & Cost Control', icon: 'Calculator', urutan: 50,
    items: [
      { key: 'cc-rab', label: 'RAB', status: 'hidup', href: '/proyek', tabProyek: 'rab', guna: 'Anggaran penawaran — harga jual ke klien.' },
      { key: 'cc-rap', label: 'RAP', status: 'hidup', href: '/estimasi', guna: 'Anggaran pelaksanaan — rencana belanja sebenarnya.' },
      { key: 'cc-revisi', label: 'Revisi Anggaran', status: 'rencana', guna: 'Memindahkan pagu antar pos dengan jejak persetujuan.', catatan: 'Tanpa ini, revisi terjadi diam-diam dan pagu kehilangan makna.' },
      { key: 'cc-commitment', label: 'Commitment Tracking', status: 'hidup', href: '/estimasi', guna: 'Uang yang sudah terikat PO & borongan, meski belum dibayar.' },
      { key: 'cc-acl', label: 'Actual Cost Ledger', status: 'sebagian', href: '/estimasi', guna: 'Seluruh biaya yang benar-benar terjadi, per cost code.' },
      { key: 'cc-etc', label: 'Cost-to-Complete', status: 'hidup', href: '/proyek', tabProyek: 'kurva-s', guna: 'Perkiraan sisa biaya sampai proyek selesai.' },
      { key: 'cc-cashflow', label: 'Proyeksi Kas', status: 'hidup', href: '/estimasi', guna: 'Perkiraan uang masuk & keluar per periode.' },
      { key: 'cc-contingency', label: 'Manajemen Contingency', status: 'rencana', guna: 'Cadangan risiko: berapa tersisa, dipakai untuk apa.', catatan: 'Tanpa pencatatan, cadangan habis tanpa ada yang menyadari.' },
      { key: 'cc-varians', label: 'Analisa Varians', status: 'hidup', href: '/estimasi', guna: 'Anggaran vs komitmen vs aktual, per cost code.' },
      { key: 'cc-profit', label: 'Profitabilitas Proyek', status: 'hidup', href: '/laporan', guna: 'Laba per proyek dan per pos biaya.' },
      { key: 'cc-wip', label: 'WIP / PSAK', status: 'hidup', href: '/laporan', guna: 'Pengakuan pendapatan sesuai kemajuan pekerjaan.' },
      { key: 'cc-cvr', label: 'Cost Value Reconciliation', status: 'rencana', guna: 'Mencocokkan nilai pekerjaan dengan biaya yang terjadi.', catatan: 'Laporan bulanan standar kontraktor besar Inggris/Australia.' },
      { key: 'cc-pagu-material', label: 'Pagu Belanja Material', status: 'hidup', href: '/estimasi', guna: 'Batas belanja per material, dipakai menjaga kuota MR.' },
      { key: 'cc-bac', label: 'Cost Baseline (BAC)', status: 'hidup', href: '/proyek', tabProyek: 'kurva-s', guna: 'Dasar pembanding EVM — diambil dari pagu RAP terkunci.' },
    ],
  },
  {
    key: 'g-procurement', label: 'Pengadaan', icon: 'ShoppingCart', urutan: 60,
    items: [
      { key: 'pr-mr', label: 'Material Request', status: 'hidup', href: '/procurement', guna: 'Permintaan material dari lapangan, dijaga kuota RAB.' },
      { key: 'pr-rfq', label: 'RFQ ke Vendor', status: 'rencana', guna: 'Meminta penawaran harga ke beberapa vendor sekaligus.', catatan: 'Sekarang PO dibuat langsung dari MR tanpa tahap penawaran.' },
      { key: 'pr-tabulasi', label: 'Perbandingan Penawaran', status: 'rencana', guna: 'Menjajarkan penawaran vendor untuk memilih yang terbaik.', catatan: 'Butuh RFQ lebih dulu.' },
      { key: 'pr-po', label: 'Purchase Order', status: 'hidup', href: '/procurement', guna: 'Pesanan resmi ke supplier, terkirim & berjejak.' },
      { key: 'pr-blanket', label: 'Kontrak Payung', status: 'rencana', guna: 'Harga tetap untuk pembelian berulang sepanjang periode.', catatan: 'Menghemat waktu untuk material yang dibeli terus-menerus.' },
      { key: 'pr-grn', label: 'Goods Receipt', status: 'hidup', href: '/procurement', guna: 'Penerimaan barang, otomatis menambah stok.' },
      { key: 'pr-3way', label: '3-Way Match', status: 'hidup', href: '/procurement', guna: 'Mencocokkan PO, penerimaan, dan tagihan sebelum bayar.' },
      { key: 'pr-evaluasi', label: 'Evaluasi Kinerja Vendor', status: 'rencana', guna: 'Menilai ketepatan waktu & mutu tiap supplier.', catatan: 'Datanya sudah terkumpul di GR; penilaiannya belum.' },
      { key: 'pr-jadwal-bayar', label: 'Jadwal Bayar Vendor', status: 'hidup', href: '/procurement', guna: 'Utang supplier beserta jatuh temponya.' },
      { key: 'pr-expediting', label: 'Expediting & Logistik', status: 'rencana', guna: 'Mengejar pengiriman yang terlambat.', catatan: 'Relevan saat material didatangkan dari luar kota.' },
    ],
  },
  {
    key: 'g-inventory', label: 'Gudang & Material', icon: 'Package', urutan: 70,
    items: [
      { key: 'iv-gudang', label: 'Gudang Proyek', status: 'sebagian', href: '/procurement', guna: 'Tempat simpan material di lokasi kerja.' },
      { key: 'iv-mutasi', label: 'Stok Masuk & Keluar', status: 'hidup', href: '/procurement', guna: 'Pencatatan pemakaian, pengembalian, dan penyesuaian.' },
      { key: 'iv-transfer', label: 'Transfer Antar Proyek', status: 'rencana', guna: 'Memindahkan material dari proyek yang berlebih.', catatan: 'Sekarang perpindahan dicatat sebagai keluar-masuk terpisah.' },
      { key: 'iv-opname', label: 'Stock Opname', status: 'hidup', href: '/procurement', guna: 'Menghitung fisik dan mencocokkan dengan catatan.' },
      { key: 'iv-minstok', label: 'Minimum Stok', status: 'sebagian', href: '/procurement', guna: 'Peringatan saat stok menyentuh batas pesan ulang.' },
      { key: 'iv-rekonsiliasi', label: 'Rekonsiliasi Material', status: 'gerbang', guna: 'Membandingkan kebutuhan teoritis RAB dengan pemakaian nyata.', catatan: 'Gerbang §D7 belum terbuka: pemetaan resource ↔ material baru cocok 0,1%, dan `project_expenses` belum punya atribusi item.' },
      { key: 'iv-waste', label: 'Tracking Waste', status: 'rencana', guna: 'Mengukur susut & sisa material.', catatan: 'Butuh rekonsiliasi material lebih dulu.' },
    ],
  },
  {
    key: 'g-subkon', label: 'Mandor & Subkon', icon: 'HardHat', urutan: 80,
    items: [
      { key: 'sk-paket', label: 'Paket Subkontrak', status: 'sebagian', href: '/mandor', guna: 'Membagi pekerjaan jadi paket yang disubkontrakkan.' },
      { key: 'sk-tender', label: 'Tender Subkontraktor', status: 'rencana', guna: 'Memilih subkon lewat penawaran, bukan penunjukan.', catatan: 'Relevan saat nilai paket cukup besar.' },
      { key: 'sk-kontrak', label: 'Kontrak & BOQ Subkon', status: 'sebagian', href: '/mandor', guna: 'Lingkup kerja subkon beserta harga satuannya.' },
      { key: 'sk-wo', label: 'Work Order', status: 'sebagian', href: '/mandor', guna: 'Perintah kerja resmi ke subkon/mandor.' },
      { key: 'sk-opname', label: 'Opname Bersama', status: 'sebagian', href: '/proyek', tabProyek: 'progress', guna: 'Pengukuran hasil kerja yang disepakati dua pihak.' },
      { key: 'sk-claim', label: 'Progress Claim', status: 'sebagian', href: '/mandor', guna: 'Tagihan subkon berdasarkan hasil opname.' },
      { key: 'sk-retensi', label: 'Retensi Subkon', status: 'rencana', guna: 'Tahanan pembayaran subkon sampai masa pemeliharaan lewat.', catatan: 'Retensi ke klien sudah ada; ke subkon belum.' },
      { key: 'sk-backcharge', label: 'Back-Charge', status: 'sebagian', href: '/mandor', guna: 'Potongan atas biaya yang seharusnya ditanggung subkon.' },
      { key: 'sk-evaluasi', label: 'Evaluasi Subkon', status: 'rencana', guna: 'Menilai mutu & ketepatan waktu subkon.', catatan: 'Dasar memutuskan pakai lagi atau tidak.' },
      { key: 'sk-kepatuhan', label: 'Kepatuhan Subkon', status: 'rencana', guna: 'Memastikan izin, asuransi, dan pajak subkon berlaku.', catatan: 'Risiko hukum bila subkon tak patuh terbawa ke kita.' },
      { key: 'sk-mandor', label: 'Manajemen Mandor', status: 'hidup', href: '/mandor', guna: 'Penugasan mandor, lingkup kerja, dan rekapitulasinya.' },
      { key: 'sk-kasbon', label: 'Kasbon', status: 'hidup', href: '/mandor', guna: 'Uang muka operasional mandor & tukang.' },
      { key: 'sk-upah', label: 'Upah Harian & Borongan', status: 'hidup', href: '/mandor', guna: 'Pembayaran upah per hari, per borongan, atau per progres.' },
      { key: 'sk-settlement', label: 'Settlement Borongan', status: 'hidup', href: '/mandor', guna: 'Perhitungan akhir borongan setelah dipotong kasbon.' },
    ],
  },
  {
    key: 'g-lapangan', label: 'Operasi Lapangan', icon: 'ClipboardList', urutan: 90,
    items: [
      { key: 'lp-dpr', label: 'Laporan Harian', status: 'sebagian', href: '/proyek', tabProyek: 'progress', guna: 'Catatan harian: pekerjaan, tenaga, cuaca, kendala.' },
      { key: 'lp-tenaga', label: 'Log Tenaga Kerja', status: 'sebagian', href: '/mandor', guna: 'Jumlah pekerja per hari per proyek.' },
      { key: 'lp-alat', label: 'Log Pemakaian Alat', status: 'rencana', guna: 'Jam pakai alat, dasar hitung biaya & utilisasi.', catatan: 'Register aset sudah ada; log jam pakainya belum.' },
      { key: 'lp-cuaca', label: 'Log Cuaca', status: 'sebagian', href: '/proyek', tabProyek: 'progress', guna: 'Catatan cuaca — bukti pendukung pengajuan EOT.' },
      { key: 'lp-instruksi', label: 'Instruksi Lapangan', status: 'rencana', guna: 'Perintah tertulis dari pengawas ke pelaksana.', catatan: 'Sekarang lewat WhatsApp, tak berjejak.' },
      { key: 'lp-permit', label: 'Izin Kerja', status: 'rencana', guna: 'Work permit untuk pekerjaan berisiko tinggi.', catatan: 'Wajib pada proyek yang menerapkan K3 formal.' },
      { key: 'lp-rfi', label: 'Request for Inspection', status: 'rencana', guna: 'Permintaan pemeriksaan sebelum pekerjaan ditutup.', catatan: 'Bagian Capability Tier-2 (ROADMAP #24).' },
      { key: 'lp-submittal', label: 'Submittal Register', status: 'rencana', guna: 'Pengajuan contoh material & gambar kerja untuk disetujui.', catatan: 'Bagian Capability Tier-2 (ROADMAP #24).' },
      { key: 'lp-ncr', label: 'Non-Conformance Report', status: 'rencana', guna: 'Laporan pekerjaan yang tak sesuai spesifikasi.', catatan: 'Bagian Capability Tier-2 (ROADMAP #24).' },
      { key: 'lp-punch', label: 'Punch List', status: 'rencana', guna: 'Daftar cacat yang harus diperbaiki sebelum serah terima.', catatan: 'Bagian Capability Tier-2 (ROADMAP #24).' },
      { key: 'lp-foto', label: 'Dokumentasi Foto', status: 'hidup', href: '/proyek', tabProyek: 'foto', guna: 'Foto progres, cacat, dan serah terima.' },
      { key: 'lp-serah', label: 'Serah Terima (PHO/FHO)', status: 'sebagian', href: '/proyek', guna: 'Berita acara serah terima pertama & akhir.' },
    ],
  },
  {
    key: 'g-qaqc', label: 'Mutu (QA/QC)', icon: 'BadgeCheck', urutan: 100,
    items: [
      { key: 'qc-rencana', label: 'Rencana Mutu Proyek', status: 'gerbang', guna: 'Dokumen mutu yang disepakati di awal proyek.', catatan: 'Menunggu tender yang mensyaratkannya. Membangun sekarang berarti menebak bentuk yang diminta tender yang belum pernah diikuti.' },
      { key: 'qc-itp', label: 'Inspection & Test Plan', status: 'gerbang', guna: 'Titik-titik pemeriksaan wajib beserta kriterianya.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'qc-checklist', label: 'Checklist Inspeksi', status: 'gerbang', guna: 'Daftar periksa per jenis pekerjaan.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'qc-uji', label: 'Hasil Uji Material', status: 'gerbang', guna: 'Hasil uji beton, tanah, dan baja dari laboratorium.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'qc-ncr', label: 'Register NCR', status: 'gerbang', guna: 'Rekapitulasi ketidaksesuaian & tindak lanjutnya.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'qc-capa', label: 'Tindakan Korektif', status: 'gerbang', guna: 'Perbaikan & pencegahan agar cacat tak berulang.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'qc-audit', label: 'Audit Mutu', status: 'gerbang', guna: 'Pemeriksaan berkala penerapan sistem mutu.', catatan: 'Menunggu tender mensyaratkan.' },
    ],
  },
  {
    key: 'g-hse', label: 'K3 & Lingkungan', icon: 'ShieldAlert', urutan: 110,
    items: [
      { key: 'hse-rk3k', label: 'RK3K', status: 'gerbang', guna: 'Rencana K3 Kontrak — dokumen wajib tender pemerintah.', catatan: 'Menunggu tender mensyaratkan. Syarat prakualifikasi proyek besar.' },
      { key: 'hse-jsa', label: 'Job Safety Analysis', status: 'gerbang', guna: 'Analisa bahaya per jenis pekerjaan.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'hse-induksi', label: 'Induksi & Pelatihan K3', status: 'gerbang', guna: 'Catatan pembekalan keselamatan pekerja baru.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'hse-apd', label: 'Alat Pelindung Diri', status: 'gerbang', guna: 'Distribusi & pemeriksaan APD.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'hse-inspeksi', label: 'Inspeksi K3', status: 'gerbang', guna: 'Pemeriksaan rutin kondisi keselamatan di lokasi.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'hse-insiden', label: 'Laporan Insiden', status: 'gerbang', guna: 'Pencatatan kecelakaan & nyaris celaka.', catatan: 'Menunggu tender mensyaratkan.' },
      { key: 'hse-lingkungan', label: 'Pengelolaan Lingkungan', status: 'gerbang', guna: 'Limbah, kebisingan, dan dampak lingkungan.', catatan: 'Menunggu tender mensyaratkan.' },
    ],
  },
  {
    key: 'g-hr', label: 'SDM & Payroll', icon: 'Users', urutan: 120,
    items: [
      { key: 'hr-karyawan', label: 'Data Karyawan', status: 'sebagian', href: '/users', guna: 'Data staf beserta jabatan & aksesnya.' },
      { key: 'hr-rekrutmen', label: 'Rekrutmen', status: 'rencana', guna: 'Proses penerimaan karyawan baru.', catatan: 'Skala tim belum menuntutnya.' },
      { key: 'hr-absensi', label: 'Absensi & Timesheet', status: 'rencana', guna: 'Kehadiran staf kantor & jam kerja.', catatan: 'Berbeda dari upah harian mandor yang sudah ada.' },
      { key: 'hr-cuti', label: 'Cuti & Izin', status: 'rencana', guna: 'Pengajuan & saldo cuti.', catatan: 'Skala tim belum menuntutnya.' },
      { key: 'hr-payroll', label: 'Payroll Staf', status: 'eksternal', guna: 'Gaji bulanan karyawan tetap.', catatan: 'Diputuskan memakai tool eksternal (KEPUTUSAN-SCOPE §2). Membangunnya berarti mengulang yang sudah beres di tempat lain, plus menanggung risiko salah hitung gaji.' },
      { key: 'hr-upah', label: 'Upah Harian Lapangan', status: 'hidup', href: '/mandor', guna: 'Upah mandor & tukang — sudah berjalan penuh.' },
      { key: 'hr-bpjs', label: 'BPJS & Potongan', status: 'eksternal', guna: 'Potongan jaminan sosial karyawan.', catatan: 'Bagian dari payroll eksternal.' },
      { key: 'hr-pph21', label: 'PPh 21', status: 'eksternal', guna: 'Pajak penghasilan karyawan.', catatan: 'Bagian dari payroll eksternal — aturannya berubah tiap tahun dan lebih aman ditangani penyedia yang memperbaruinya.' },
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
      { key: 'as-sewa', label: 'Sewa Alat', status: 'hidup', href: '/aset', guna: 'Alat yang disewa, beserta biaya berjalannya.' },
      { key: 'as-utilisasi', label: 'Utilisasi', status: 'hidup', href: '/aset', guna: 'Seberapa sering alat terpakai — alat menganggur = uang tertidur.' },
      { key: 'as-maintenance', label: 'Maintenance Terjadwal', status: 'rencana', guna: 'Jadwal servis berkala agar alat tak rusak di tengah proyek.', catatan: 'Status `perawatan` sudah ada; penjadwalannya belum.' },
      { key: 'as-opex', label: 'Biaya Operasional Alat', status: 'rencana', guna: 'BBM, operator, dan suku cadang per alat.', catatan: 'Menentukan biaya sesungguhnya per jam pakai.' },
      { key: 'as-gl', label: 'Penyusutan → Jurnal', status: 'rencana', guna: 'Mengirim beban penyusutan ke buku besar.', catatan: 'Kolom `journal_entry_id` sudah disiapkan; menunggu Modul 10 (GL).' },
    ],
  },
  {
    key: 'g-keuangan', label: 'Keuangan', icon: 'Landmark', urutan: 140,
    items: [
      { key: 'fn-gl', label: 'Buku Besar', status: 'rencana', guna: 'Jurnal seluruh transaksi — sumber laporan keuangan resmi.', catatan: 'Modul 10. Skema disiapkan migrasi 047 tapi sengaja belum di-apply: sekali angka masuk jurnal ia jadi rujukan resmi, jadi CoA wajib divalidasi akuntan lebih dulu.' },
      { key: 'fn-jurnal', label: 'Jurnal Umum', status: 'rencana', guna: 'Input jurnal manual untuk penyesuaian.', catatan: 'Menunggu Modul 10 (GL).' },
      { key: 'fn-ap', label: 'Utang Supplier', status: 'hidup', href: '/procurement', guna: 'Tagihan supplier, umur utang, dan jadwal bayar.' },
      { key: 'fn-ar', label: 'Piutang Klien', status: 'hidup', href: '/piutang', guna: 'Tagihan ke klien, umur piutang, dan tindak lanjutnya.' },
      { key: 'fn-kas', label: 'Kas & Bank', status: 'hidup', href: '/kas', guna: 'Saldo akun kas, transfer, dan pengeluaran.' },
      { key: 'fn-rekonsiliasi', label: 'Rekonsiliasi Bank', status: 'rencana', guna: 'Mencocokkan catatan kas dengan rekening koran.', catatan: 'Idealnya otomatis lewat integrasi bank.' },
      { key: 'fn-petty', label: 'Kas Kecil', status: 'hidup', href: '/kas', guna: 'Pengeluaran kecil harian di lapangan.' },
      { key: 'fn-aset-tetap', label: 'Aset Tetap', status: 'sebagian', href: '/aset', guna: 'Nilai perolehan & penyusutan aset di neraca.', catatan: 'Register & penyusutan sudah ada; pencatatan ke neraca menunggu GL.' },
      { key: 'fn-pajak', label: 'PPN & PPh', status: 'hidup', href: '/laporan', guna: 'Rekap pajak per invoice & per periode.' },
      { key: 'fn-efaktur', label: 'e-Faktur & e-Bupot', status: 'sebagian', href: '/laporan', guna: 'Nomor faktur pajak & bukti potong.', catatan: 'Pencatatan nomor sudah ada; pembuatan berkasnya lewat aplikasi DJP.' },
      { key: 'fn-laporan', label: 'Laporan Keuangan', status: 'sebagian', href: '/laporan', guna: 'Arus kas, neraca, dan laba-rugi.', catatan: 'Arus kas sudah ada; neraca & L/R menunggu GL.' },
      { key: 'fn-wip', label: 'Pengakuan Pendapatan', status: 'hidup', href: '/laporan', guna: 'WIP/PSAK: pendapatan diakui sesuai kemajuan, bukan sesuai tagihan.' },
      { key: 'fn-tutup-buku', label: 'Tutup Buku', status: 'rencana', guna: 'Mengunci periode agar angka lampau tak berubah.', catatan: 'Menunggu Modul 10 (GL).' },
      { key: 'fn-audit', label: 'Audit Trail', status: 'hidup', href: '/audit', guna: 'Rekam jejak perubahan data — append-only, tak bisa diubah.' },
    ],
  },
  {
    key: 'g-tagih', label: 'Penagihan', icon: 'Receipt', urutan: 150,
    items: [
      { key: 'tg-progress', label: 'Progress Billing', status: 'hidup', href: '/keuangan', guna: 'Tagihan berdasarkan kemajuan pekerjaan.' },
      { key: 'tg-termin', label: 'Termin', status: 'hidup', href: '/keuangan', guna: 'Penagihan bertahap sesuai jadwal kontrak.' },
      { key: 'tg-ipc', label: 'Interim Payment Certificate', status: 'rencana', guna: 'Sertifikat pembayaran yang disahkan pengawas.', catatan: 'Format standar tender pemerintah & proyek besar.' },
      { key: 'tg-retensi', label: 'Pelepasan Retensi', status: 'hidup', href: '/piutang', guna: 'Menagih uang tahanan setelah masa pemeliharaan.' },
      { key: 'tg-uangmuka', label: 'Pemotongan Uang Muka', status: 'hidup', href: '/piutang', guna: 'Mengembalikan uang muka lewat potongan tiap termin.' },
      { key: 'tg-tambah', label: 'Tagihan Pekerjaan Tambah', status: 'sebagian', href: '/keuangan', guna: 'Menagih change order yang sudah disetujui.' },
      { key: 'tg-invoice', label: 'Invoice & Faktur Pajak', status: 'hidup', href: '/keuangan', guna: 'Penerbitan invoice lengkap dengan pajaknya.' },
      { key: 'tg-followup', label: 'Follow-Up Penagihan', status: 'hidup', href: '/piutang', guna: 'Mengejar invoice yang lewat jatuh tempo.' },
      { key: 'tg-nota-kredit', label: 'Nota Kredit', status: 'rencana', guna: 'Pengurangan tagihan yang sudah terbit.', catatan: 'Diperlukan saat ada koreksi setelah invoice dikirim.' },
    ],
  },
  {
    key: 'g-dokumen', label: 'Dokumen', icon: 'FolderOpen', urutan: 160,
    items: [
      { key: 'dk-register', label: 'Register Dokumen', status: 'sebagian', href: '/proyek', tabProyek: 'dokumen', guna: 'Daftar dokumen proyek beserta versinya.' },
      { key: 'dk-transmittal', label: 'Transmittal', status: 'rencana', guna: 'Bukti serah terima dokumen antar pihak.', catatan: 'Penting saat sengketa: siapa menerima apa, kapan.' },
      { key: 'dk-gambar', label: 'Register Gambar', status: 'rencana', guna: 'Gambar kerja beserta revisinya.', catatan: 'Memakai gambar revisi lama adalah penyebab rework yang mahal.' },
      { key: 'dk-notulen', label: 'Notulen Rapat', status: 'rencana', guna: 'Catatan rapat & keputusan yang diambil.', catatan: 'Sekarang tersebar di WhatsApp.' },
      { key: 'dk-approval', label: 'Approval Dokumen', status: 'hidup', href: '/pengaturan/approval', guna: 'Rantai persetujuan berjenjang yang bisa dikonfigurasi.' },
      { key: 'dk-distribusi', label: 'Matriks Distribusi', status: 'rencana', guna: 'Siapa menerima dokumen jenis apa.', catatan: 'Menghindari dokumen penting tak sampai ke yang butuh.' },
      { key: 'dk-esign', label: 'Tanda Tangan Elektronik', status: 'rencana', guna: 'Pengesahan dokumen tanpa cetak.', catatan: 'Butuh penyedia e-meterai/e-sign tersertifikasi.' },
    ],
  },
  {
    key: 'g-risiko', label: 'Risiko & Kepatuhan', icon: 'AlertTriangle', urutan: 170,
    items: [
      { key: 'rk-register', label: 'Register Risiko', status: 'gerbang', guna: 'Daftar risiko proyek beserta dampak & mitigasinya.', catatan: 'Menunggu tender yang mensyaratkan, atau proyek dengan nilai yang menuntutnya.' },
      { key: 'rk-mitigasi', label: 'Rencana Mitigasi', status: 'gerbang', guna: 'Tindakan pencegahan per risiko.', catatan: 'Menunggu pemicu yang sama dengan register risiko.' },
      { key: 'rk-perizinan', label: 'Perizinan', status: 'gerbang', guna: 'IMB/PBG, izin lingkungan, dan masa berlakunya.', catatan: 'Sekarang ditangani manual per proyek.' },
      { key: 'rk-kepatuhan', label: 'Kepatuhan Regulasi', status: 'gerbang', guna: 'Daftar kewajiban regulasi & status pemenuhannya.', catatan: 'Menunggu pemicu bisnis.' },
      { key: 'rk-sengketa', label: 'Sengketa & Klaim', status: 'gerbang', guna: 'Catatan perselisihan beserta dasar hukumnya.', catatan: 'Semoga tak pernah dipakai — tapi bila terjadi, catatannya menentukan.' },
    ],
  },
  {
    key: 'g-laporan', label: 'Laporan & BI', icon: 'BarChart3', urutan: 180,
    items: [
      { key: 'bi-eksekutif', label: 'Dashboard Eksekutif', status: 'hidup', href: '/dashboard', guna: 'Ringkasan seluruh proyek dalam satu layar.' },
      { key: 'bi-proyek', label: 'Dashboard per Proyek', status: 'sebagian', href: '/proyek', guna: 'KPI satu proyek: progres, biaya, dan kas.' },
      { key: 'bi-biaya', label: 'Laporan Biaya', status: 'hidup', href: '/laporan', guna: 'Rekap biaya per proyek, mandor, dan kategori.' },
      { key: 'bi-arus-kas', label: 'Laporan Arus Kas', status: 'hidup', href: '/laporan', guna: 'Uang masuk & keluar per periode.' },
      { key: 'bi-portofolio', label: 'Portofolio Biaya', status: 'hidup', href: '/laporan', guna: 'Perbandingan serapan anggaran lintas proyek.' },
      { key: 'bi-kpi', label: 'KPI Perusahaan', status: 'sebagian', href: '/laporan', guna: 'CPI, SPI, margin, umur piutang, dan backlog.' },
      { key: 'bi-builder', label: 'Report Builder', status: 'rencana', guna: 'Menyusun laporan sendiri tanpa menunggu dibuatkan.', catatan: 'Berguna saat kebutuhan laporan mulai beragam.' },
      { key: 'bi-export', label: 'Ekspor Excel & PDF', status: 'hidup', href: '/laporan', guna: 'Mengunduh laporan untuk dibawa ke luar sistem.' },
      { key: 'bi-terjadwal', label: 'Laporan Terjadwal', status: 'rencana', guna: 'Kirim laporan otomatis tiap periode.', catatan: 'Butuh integrasi email yang sudah disiapkan di halaman Sistem.' },
    ],
  },
  {
    key: 'g-sistem', label: 'Administrasi', icon: 'Settings', urutan: 190,
    items: [
      { key: 'sy-user', label: 'Pengguna & Role', status: 'hidup', href: '/users', guna: 'Akun pengguna beserta perannya.' },
      { key: 'sy-permission', label: 'Matriks Izin', status: 'hidup', href: '/pengaturan/roles', guna: 'Hak akses per peran — berbasis capability, bukan jabatan.' },
      { key: 'sy-approval', label: 'Konfigurasi Approval', status: 'hidup', href: '/pengaturan/approval', guna: 'Rantai persetujuan yang bisa diubah tanpa deploy.' },
      { key: 'sy-notifikasi', label: 'Aturan Notifikasi', status: 'hidup', href: '/pengaturan/notifikasi', guna: 'Siapa mendapat pemberitahuan apa.' },
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
      { key: 'mb-absensi', label: 'Absensi Lapangan', status: 'rencana', guna: 'Kehadiran tukang dicatat dari HP di lokasi.', catatan: 'Butuh aplikasi mobile yang saat ini baru Fase 1.' },
      { key: 'mb-progres', label: 'Input Progres Mobile', status: 'sebagian', guna: 'Mandor melaporkan kemajuan langsung dari lapangan.', catatan: 'Sudah ada di aplikasi mobile Fase 1; belum dipakai operasional.' },
      { key: 'mb-geotag', label: 'Foto Geotag', status: 'rencana', guna: 'Foto dengan koordinat — bukti pekerjaan benar di lokasi.', catatan: 'Kolom GPS belum ada di `project_photos`.' },
      { key: 'mb-offline', label: 'Mode Offline', status: 'rencana', guna: 'Tetap bisa mencatat saat sinyal hilang, lalu sinkron.', catatan: 'Kriteria Kualitas #5 dinilai LEMAH terutama karena ini — banyak lokasi proyek tanpa sinyal stabil.' },
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

/**
 * PETA MODUL → BERKAS RUTE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PEMETAAN INI DITULIS TANGAN, BUKAN DITEBAK DARI NAMA BERKAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nama berkas rute TIDAK memberi tahu modul mana yang memilikinya. Contoh
 * nyata dari repo ini, semuanya diukur 2026-08-31:
 *
 *   `kepatuhan-k3.ts`    dipakai DUA modul (k3_lingkungan dan risiko)
 *   `mutu-ikhtisar.ts`   namanya "mutu", isinya tabel kepatuhan & K3
 *   `deret-modul.ts`     melayani EMPAT halaman ikhtisar sekaligus
 *   `spk.ts`             milik mandor, tapi juga muncul di kontrak
 *
 * Penjaga yang menebak dari nama akan salah pada keempatnya, dan salahnya ke
 * arah yang paling buruk: ia melapor hijau atas rute yang tak digerbang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA GOLONGAN, DAN KENAPA GOLONGAN KETIGA PALING BERBAHAYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   BERBAYAR   wajib punya `requireModul`. Kalau lupa → modul terjual tak
 *              ditegakkan, dan gejalanya cuma tagihan yang tak naik-naik.
 *
 *   PONDASI    tak boleh digerbang. Master data (AHSP, price book, satuan),
 *              klien, kalender. Estimasi tanpa AHSP bukan estimasi yang
 *              dibatasi — ia estimasi yang RUSAK.
 *
 *   PEMULIHAN  tak boleh digerbang, dan alasannya berbeda dari PONDASI:
 *              menggerbang langganan/pengaturan/ekspor mengunci pelanggan di
 *              luar pintu yang ia bayar untuk masuk. Azure memperlihatkan
 *              kegagalan ini — invoice terkunci, pembayaran swalayan mati,
 *              pelanggan harus menelepon dukungan untuk boleh membayar.
 *
 * Yang TIDAK terdaftar di sini sama sekali dianggap PONDASI — terbuka.
 * Keputusan founder 2026-08-31, dan alasannya ada di `gerbang-modul.ts`:
 * katalog selalu tertinggal dari kode, dan "tak terdaftar = tertutup"
 * membuat tiap modul baru lahir MATI untuk semua pelanggan.
 *
 * ⚠ Peta ini akan MEMBUSUK kalau tak dijaga — berkas rute baru lahir tiap
 * minggu. `audit-modul-punya-gerbang.mjs` yang menahannya.
 */

/** Berkas rute yang WAJIB punya `requireModul(<kunci>)`. */
export const MODUL_BERBAYAR: Record<string, readonly string[]> = {
  'modul.akuntansi': ['gl.ts', 'tutup-buku.ts', 'penjurnalan-otomatis.ts'],

  'modul.sdm': [
    'pegawai.ts',
    'payroll-staf.ts',
    'tarif-payroll.ts',
    'timesheet-staf.ts',
    'cuti-karyawan.ts',
    'kompetensi-sdm.ts',
    'klaim-perjalanan.ts',
  ],

  'modul.pengadaan': ['procurement.ts', 'rfq.ts', 'pengadaan-lanjutan.ts', 'riwayat-harga.ts'],

  'modul.gudang': [
    'gudang-ikhtisar.ts',
    'gudang-kelola.ts',
    'transfer-stok.ts',
    'susut-material.ts',
    'rekonsiliasi-material.ts',
    'material-klien.ts',
  ],

  'modul.alat': ['assets.ts', 'alat-operasional.ts'],

  'modul.risiko': ['risiko-proyek.ts'],

  'modul.crm': ['bids.ts', 'penawaran.ts', 'vendor-kualifikasi.ts'],

  'modul.uji_mutu': [
    'rencana-mutu.ts',
    'inspeksi.ts',
    'mutu.ts',
    'ncr.ts',
    'audit-mutu.ts',
    'mutu-ikhtisar.ts',
    'lessons-learned.ts',
  ],

  // ⚠ `kepatuhan-k3.ts` SENGAJA tidak di sini meski terkait K3: ia juga
  // melayani `/risiko/izin`. Berkas yang dipakai dua modul tak bisa
  // digerbang oleh salah satunya tanpa melubangi yang lain — lihat
  // BERBAGI di bawah.
  'modul.k3_lingkungan': ['k3-lapangan.ts'],

  'modul.ai': [
    'ai.ts',
    'ai-chat.ts',
    'ai-grafik.ts',
    'ai-ingatan.ts',
    'ai-riwayat.ts',
    'ai-tulis.ts',
    'sapa-proaktif.ts',
    'otomasi-alur.ts',
    'otomasi-terjadwal.ts',
    // ⚠ `otomasi-umpan.ts` SENGAJA tidak di sini, dan alasannya bukan
    // kelupaan: ia satu-satunya rute otomasi yang dijaga `requireApiKey`,
    // bukan `authenticate`. Company aktifnya datang dari
    // `request.apiKey.companyId` — sementara `requireModul` membaca
    // `request.companyId`, yang pada jalur API key TIDAK terisi.
    //
    // Memasang gerbang di sana akan menghasilkan gerbang yang DIAM: pulang
    // lebih awal pada setiap permintaan, tak pernah menolak, tanpa galat.
    // Itu lebih buruk daripada tak memasangnya, karena peta ini lalu
    // mengklaim perlindungan yang tak ada.
    //
    // Menutupnya butuh `requireModul` sadar jalur API key — pekerjaan
    // tersendiri, dicatat di RATIFIKASI/QUEUE, bukan ditambal di sini.
  ],
} as const

/**
 * Berkas yang DIPAKAI LEBIH DARI SATU modul.
 *
 * Menggerbangnya dengan salah satu kunci akan menutup sebagian modul yang
 * SUDAH dibayar pelanggan — kegagalan yang lebih mahal daripada kebocoran,
 * karena ia menghentikan orang yang sudah membayar.
 *
 * Didaftarkan supaya penjaga tak menuntut gerbang di sini, DAN supaya
 * keputusannya terlihat sebagai keputusan — bukan sebagai kelupaan.
 */
export const BERBAGI: Record<string, string> = {
  'kepatuhan-k3.ts': 'dipakai modul.k3_lingkungan DAN modul.risiko (/risiko/izin)',
  'deret-modul.ts': 'melayani ikhtisar keuangan, lapangan, gudang, dan mandor sekaligus',
  'spk.ts': 'dipakai modul.mandor DAN modul.kontrak',
  'submittal.ts': 'dipakai modul.lapangan DAN modul.dokumen',
  'surat.ts': 'dipakai modul.kontrak DAN modul.dokumen',
  'opname-bersama.ts': 'dipakai modul.mandor DAN modul.lapangan',
  'inspeksi.ts': 'dipakai modul.uji_mutu DAN modul.lapangan',
}

/**
 * Jalur pemulihan — TAK PERNAH boleh digerbang, oleh kunci apa pun.
 *
 * Bedanya dari PONDASI: kalau pondasi digerbang, produknya rusak. Kalau
 * jalur pemulihan digerbang, pelanggan TAK BISA MEMPERBAIKI keadaannya —
 * termasuk tak bisa membayar untuk membukanya kembali.
 */
export const JALUR_PEMULIHAN: readonly string[] = [
  'auth.ts',
  'settings.ts',
  'companies.ts',
  'users.ts',
  'roles.ts',
  // Halaman langganan pelanggan — tempat ia mencari tahu KENAPA sesuatu
  // tertutup. Menggerbangnya mengunci orang di luar pintu yang ia bayar untuk
  // masuk, dan pelanggan yang ingin membayar harus menelepon.
  'langganan-saya.ts',
  // ⚠ TIDAK ada `billing.ts`/`langganan.ts` di produk — saya sempat
  // mendaftarkan keduanya dari ingatan, dan keduanya berkas HANTU.
  // Langganan diurus konsol vendor (repo admin-saas), bukan produk ini.
  // Penjaga `audit-modul-punya-gerbang.mjs` menolak nama yang tak ada persis
  // supaya daftar ini tak pelan-pelan jadi daftar harapan.
] as const

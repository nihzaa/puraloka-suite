/**
 * KATALOG OTOMASI — penjelasan tiap alur, dalam bahasa yang dibaca manusia.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder, 2026-08-15: *"saya juga mau ada katalog otomasi nya di ui yaa
 * seperti project TJS, beserta semua penjelasan dan flow kerja otomasi
 * tersebut"*.
 *
 * Sebelum ini, satu-satunya cara mengetahui apa yang dikerjakan sebuah otomasi
 * adalah membaca handler-nya. Konsekuensinya bukan sekadar merepotkan — ia
 * SUDAH memakan biaya nyata:
 *
 *   · 2026-08-14, automation 3.5 nyaris dibangun ulang padahal sudah hidup
 *   · dua sesi berturut-turut salah menjawab "mana yang sudah/belum"
 *
 * Halaman Ikhtisar menjawab "sehat atau tidak". Halaman Riwayat menjawab
 * "kapan terakhir jalan". Tak satu pun menjawab **"sebenarnya ini
 * mengerjakan apa, dan kalau ia mengirim pesan, dari mana angkanya"** — dan
 * itulah pertanyaan yang dibawa orang yang baru menerima notifikasinya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KATALOG INI TIDAK AKAN MEMBUSUK SEPERTI YANG SEBELUMNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Repo ini sudah punya satu katalog otomasi:
 * `06-agentic-ai-and-automation-architecture.md`. Ia membusuk — tujuh otomasi
 * yang sudah hidup masih tertulis `Next` di sana, dan kolom `N/N/L/O` yang
 * dikira status ternyata prioritas. CLAUDE.md menyebutnya racun konteks paling
 * produktif di repo.
 *
 * Katalog INI berbeda pada satu hal yang menentukan: **ia tak menyimpan status
 * sama sekali.**
 *
 *   · yang tertulis di sini  → penjelasan, pemicu, langkah kerja, penempatan
 *   · yang DIUKUR saat baca  → hidup/mati, kapan terakhir jalan, berapa kali
 *
 * Yang bisa basi tidak ditulis; yang ditulis tidak bisa basi. Dan `kunci` tiap
 * entri dicocokkan dengan rute yang benar-benar terdaftar oleh
 * `audit-katalog-otomasi-nyata.mjs` — entri yang menjelaskan rute yang tak ada
 * memerahkan CI, begitu pula rute yang tak punya penjelasan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BAHASANYA UNTUK MANDOR, BUKAN UNTUK ENGINEER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026` dan CLAUDE.md §8a.3 sama-sama menyebut satu batasan:
 * banyak pengguna berliterasi digital rendah. Jadi `penjelasan` tak boleh
 * menyebut nama tabel, nama kolom, atau istilah teknis.
 *
 * Salah: "query `kasbons` dengan `settled_at IS NULL` melewati ambang"
 * Benar: "Mencari kasbon yang sudah disetujui tetapi belum dilunasi"
 *
 * Nama teknisnya tetap ada — di `kunci` dan `rute`, untuk yang memang
 * mencarinya.
 */

/** Di mana bagian ini benar-benar berjalan. */
export type Penempatan =
  /** Aturan, ambang, dan query — di dalam API. Menyentuh data ber-RLS. */
  | 'sistem'
  /** Pemicu jadwal, panggilan HTTP, format pesan, pengiriman WA — di n8n. */
  | 'n8n'

export type Pemicu =
  /** Berjalan pada jadwal (harian/mingguan) lewat n8n. */
  | 'jadwal'
  /** Berjalan saat sesuatu terjadi di sistem (peristiwa diterbitkan). */
  | 'peristiwa'
  /** Berjalan saat orang mengirim pesan WhatsApp ke asisten. */
  | 'percakapan'

export interface LangkahAlur {
  /** Di mana langkah ini terjadi — yang menjawab "dipasang di mana". */
  di: Penempatan
  /** Satu kalimat, tanpa istilah teknis. */
  teks: string
}

export interface EntriKatalog {
  /**
   * Kunci rute — potongan terakhir `/api/v1/otomasi/jalankan/<kunci>`.
   *
   * Ini yang dicocokkan penjaga ke kode. Untuk otomasi yang bukan rute
   * terjadwal (percakapan, peristiwa), lihat `kunci_bukan_rute`.
   */
  kunci: string
  /**
   * `true` bila `kunci` BUKAN nama rute terjadwal — mis. otomasi percakapan.
   *
   * Ditulis eksplisit, bukan ditebak penjaga dari `pemicu`: penjaga yang
   * menebak akan diam-diam berhenti memeriksa begitu ada pemicu jenis baru.
   */
  kunci_bukan_rute?: true
  /**
   * Nomor di katalog `06-agentic-ai-*.md`, untuk yang menelusuri ke sana.
   *
   * BOLEH lebih dari satu, dipisah koma — dan itu bukan kelonggaran melainkan
   * kenyataan yang sudah terjadi: `polis-berakhir` menjawab 5.7 DAN 9.2,
   * karena keduanya lahir dari satu panggilan `hitungRegisterAsuransi()`.
   *
   * Sebelum ini nomor keduanya hanya disebut di `catatan`, dan silang otomatis
   * di `lapor-otomasi-hidup.mjs` tak melihatnya — 9.2 terus terhitung "belum
   * dikerjakan" padahal rutenya hidup. Persis kelas kesalahan yang skrip itu
   * dibuat untuk mencegah.
   */
  nomor?: string
  /** Nama yang dibaca orang. Bukan nama teknis. */
  nama: string
  pemicu: Pemicu
  /**
   * Satu-dua kalimat: apa yang dicarinya, dan kenapa itu perlu dicari.
   *
   * Kalimat kedua sering lebih berharga daripada yang pertama — ia menjawab
   * "kenapa saya menerima pesan ini".
   */
  penjelasan: string
  /** Siapa yang biasanya menerima hasilnya. Bahasa peran, bukan nama izin. */
  penerima: string
  /** Langkah kerjanya, berurutan. Inilah "flow kerja" yang founder minta. */
  alur: ReadonlyArray<LangkahAlur>
  /**
   * Ambang yang bisa diubah di Pengaturan, kalau ada.
   *
   * Kuncinya sama persis dengan `AMBANG_OTOMASI` — supaya halaman katalog
   * bisa menautkannya langsung ke tempat mengubahnya.
   */
  ambang?: string
  /** Hal yang sering disalahpahami. Kosong kalau memang tak ada. */
  catatan?: string
}

/**
 * Langkah yang berulang di hampir semua otomasi terjadwal.
 *
 * Ditulis sekali, bukan disalin dua belas kali — bukan demi ringkas melainkan
 * demi jujur: kalau perilaku bersamanya berubah, ia berubah di satu tempat,
 * dan tak ada entri yang tertinggal menjelaskan perilaku lama.
 */
const LANGKAH_JADWAL: ReadonlyArray<LangkahAlur> = [
  { di: 'n8n', teks: 'Jadwal berjalan pada jam yang ditentukan, lalu memanggil sistem.' },
]

const LANGKAH_KIRIM: ReadonlyArray<LangkahAlur> = [
  { di: 'sistem', teks: 'Melewati yang sudah dikirimi hari ini, supaya tak ada pesan kembar.' },
  { di: 'sistem', teks: 'Menentukan siapa yang perlu tahu, lalu membuat notifikasinya.' },
  { di: 'n8n', teks: 'Merangkai kalimatnya dan mengirim lewat WhatsApp.' },
]

export const KATALOG_OTOMASI: ReadonlyArray<EntriKatalog> = [
  // ── Uang ────────────────────────────────────────────────────────────────
  {
    kunci: 'kasbon-outstanding',
    nomor: '2.10',
    nama: 'Kasbon belum dilunasi',
    pemicu: 'jadwal',
    penjelasan:
      'Mencari kasbon yang sudah disetujui tetapi belum juga dilunasi melewati '
      + 'batas waktu. Kasbon yang menggantung tak memunculkan galat apa pun — ia '
      + 'hanya diam sampai ada yang sadar uangnya tak pernah kembali.',
    penerima: 'Manajer proyek dan bagian keuangan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari kasbon yang disetujui, belum lunas, dan sudah lewat batas hari.' },
      { di: 'sistem', teks: 'Menghitung sudah berapa hari menggantung, lalu menaikkan tingkat mendesaknya bila dua kali lipat batas.' },
      ...LANGKAH_KIRIM,
    ],
  },
  {
    kunci: 'kasbon-tukang',
    nomor: '6.6',
    nama: 'Cicilan kasbon tukang',
    pemicu: 'jadwal',
    penjelasan:
      'Mengingatkan kasbon tukang yang cicilannya berhenti dipotong. Pemotongan '
      + 'sudah otomatis tiap laporan upah disetujui; yang hilang hanya pengingat '
      + 'saat pemotongan itu tak pernah terjadi.',
    penerima: 'Manajer proyek dan mandor bersangkutan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari kasbon tukang yang sisanya tak berkurang dalam rentang waktu tertentu.' },
      ...LANGKAH_KIRIM,
    ],
  },
  {
    kunci: 'invoice-terlambat',
    nomor: '2.6',
    nama: 'Tagihan lewat jatuh tempo',
    pemicu: 'jadwal',
    penjelasan:
      'Mencari tagihan ke klien yang sudah lewat tanggal jatuh tempo dan masih '
      + 'ada sisa yang belum dibayar.',
    penerima: 'Bagian keuangan dan manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari tagihan yang jatuh temponya lewat dan sisanya masih ada.' },
      { di: 'sistem', teks: 'Menghitung berapa hari terlambat dan berapa rupiah yang tertahan.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.invoice_terlambat.hari',
    catatan:
      'Yang diperiksa SISA TAGIHAN, bukan status. Tagihan yang dibayar sebagian '
      + 'sering tetap berstatus "terkirim", dan memeriksa status akan '
      + 'melewatkannya.',
  },
  {
    kunci: 'invoice-termin',
    nomor: '5.1',
    nama: 'Tagihan termin siap dibuat',
    pemicu: 'jadwal',
    penjelasan:
      'Menandai termin pembayaran yang syaratnya sudah terpenuhi tetapi '
      + 'tagihannya belum dibuat. Termin yang terlewat menahan uang masuk tanpa '
      + 'satu pun tanda di layar mana pun.',
    penerima: 'Bagian keuangan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencocokkan syarat tiap termin dengan kemajuan proyek yang tercatat.' },
      { di: 'sistem', teks: 'Menyisihkan termin yang tagihannya sudah pernah dibuat.' },
      ...LANGKAH_KIRIM,
    ],
  },
  {
    kunci: 'saldo-menipis',
    nomor: '2.11',
    nama: 'Saldo kas menipis',
    pemicu: 'jadwal',
    penjelasan:
      'Memberi tahu ketika saldo kas turun di bawah batas aman. Yang dijaga '
      + 'bukan angkanya melainkan waktunya — kas yang habis di tengah minggu '
      + 'menghentikan pekerjaan lapangan, bukan sekadar menunda pembayaran.',
    penerima: 'Bagian keuangan dan direksi',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Menjumlahkan saldo seluruh akun kas yang masih aktif.' },
      { di: 'sistem', teks: 'Membandingkannya dengan batas aman yang disetel di Pengaturan.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.saldo_menipis.rupiah',
  },
  {
    kunci: 'hutang-supplier',
    nomor: '2.2',
    nama: 'Pembayaran supplier mendekat',
    pemicu: 'jadwal',
    penjelasan:
      'Mengingatkan tagihan supplier SEBELUM jatuh tempo, bukan sesudah. '
      + 'Peringatan yang datang setelah terlambat tak lagi bisa dipakai untuk '
      + 'apa pun kecuali meminta maaf.',
    penerima: 'Bagian keuangan dan pengadaan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari tagihan supplier yang jatuh temponya tinggal beberapa hari lagi.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.hutang_supplier.hari',
  },

  // ── Proyek & jadwal ─────────────────────────────────────────────────────
  {
    kunci: 'progres-belum-lapor',
    nomor: '3.11',
    nama: 'Progres belum dilaporkan',
    pemicu: 'jadwal',
    penjelasan:
      'Menegur proyek aktif yang tak ada laporan kemajuannya dalam beberapa '
      + 'hari terakhir. Proyek yang berhenti dilaporkan terlihat sama persis '
      + 'dengan proyek yang berjalan lancar.',
    penerima: 'Mandor dan manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari proyek aktif yang catatan kemajuan terakhirnya sudah lama.' },
      ...LANGKAH_KIRIM,
    ],
  },
  {
    kunci: 'dependency-breach',
    nomor: '3.10',
    nama: 'Urutan pekerjaan bertabrakan',
    pemicu: 'jadwal',
    penjelasan:
      'Menemukan pekerjaan yang dijadwalkan mulai sebelum pekerjaan yang jadi '
      + 'syaratnya selesai. Tabrakan seperti ini baru terasa di lapangan, dan '
      + 'saat itu biayanya sudah keluar.',
    penerima: 'Manajer proyek dan penjadwal',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Menelusuri kaitan antar pekerjaan pada jadwal proyek.' },
      { di: 'sistem', teks: 'Menandai yang jarak waktunya melanggar syarat urutannya.' },
      ...LANGKAH_KIRIM,
    ],
    catatan: 'Aturannya sama persis dengan yang dipakai layar Gantt — satu sumber, bukan dua.',
  },
  {
    kunci: 'milestone-berisiko',
    nomor: '3.7',
    nama: 'Milestone terancam meleset',
    pemicu: 'jadwal',
    penjelasan:
      'Menandai milestone yang tenggatnya mendekat sementara pekerjaannya belum '
      + 'selesai — selagi masih ada waktu untuk berbuat sesuatu.',
    penerima: 'Manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari milestone yang tenggatnya tinggal beberapa hari dan belum ditandai selesai.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.milestone_berisiko.hari',
  },

  // ── Material & pengadaan ────────────────────────────────────────────────
  {
    kunci: 'stok-menipis',
    nomor: '3.5',
    nama: 'Stok material menipis',
    pemicu: 'jadwal',
    penjelasan:
      'Memberi tahu ketika stok material turun di bawah titik pesan ulang, '
      + 'lengkap dengan angkanya — sisa berapa, dan biasanya dipesan berapa.',
    penerima: 'Bagian pengadaan dan logistik',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membandingkan sisa stok tiap material dengan titik pesan ulangnya.' },
      { di: 'sistem', teks: 'Menyertakan angka sisa dan kebutuhan di dalam pesannya.' },
      ...LANGKAH_KIRIM,
    ],
    catatan:
      'Ia MEMPERINGATKAN, tidak membuat permintaan material otomatis. Ambang '
      + 'hanya tahu "kurang", bukan "berapa yang harus dibeli" — dan permintaan '
      + 'yang lahir sendiri akan menumpuk lalu berhenti dibaca.',
  },
  {
    kunci: 'gr-matching',
    nomor: '4.10',
    nama: 'Barang datang belum dicocokkan',
    pemicu: 'jadwal',
    penjelasan:
      'Mencari penerimaan barang yang belum dicocokkan dengan pesanan '
      + 'pembeliannya. Selisih yang tak pernah dicocokkan berubah jadi selisih '
      + 'yang tak bisa lagi ditelusuri.',
    penerima: 'Bagian pengadaan dan gudang',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencocokkan jumlah barang yang diterima dengan jumlah yang dipesan.' },
      { di: 'sistem', teks: 'Menandai yang selisihnya belum diselesaikan.' },
      ...LANGKAH_KIRIM,
    ],
  },
  {
    kunci: 'harga-material-naik',
    nomor: '4.9',
    nama: 'Harga material naik',
    pemicu: 'jadwal',
    penjelasan:
      'Memberi tahu ketika harga material naik melampaui batas persentase, '
      + 'dihitung dari riwayat harga yang tercatat.',
    penerima: 'Bagian pengadaan dan estimator',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membandingkan harga terbaru tiap material dengan harga sebelumnya.' },
      { di: 'sistem', teks: 'Menandai yang kenaikannya melewati batas persen.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.harga_material.persen',
    catatan:
      'Ini kenaikan yang SUDAH terjadi, bukan ramalan. Katalog lama menandainya '
      + '"prediktif"; menyebutnya begitu akan mengklaim lebih dari yang ia '
      + 'kerjakan.',
  },

  {
    kunci: 'evm-kinerja',
    nomor: '3.18',
    nama: 'Kinerja proyek menurun',
    pemicu: 'jadwal',
    penjelasan:
      'Menandai proyek yang jadwalnya tertinggal atau biayanya membengkak '
      + 'dibanding nilai pekerjaan yang sudah diselesaikan. Keduanya dihitung '
      + 'dari angka yang sama dengan layar Kurva-S, jadi tak mungkin berselisih.',
    penerima: 'Manajer proyek dan direksi',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mengambil daftar proyek yang sedang berjalan.' },
      { di: 'sistem', teks: 'Meminta perhitungan Kurva-S tiap proyek — perhitungan yang sama dengan yang dilihat di layar.' },
      { di: 'sistem', teks: 'Membandingkan indeks jadwal dan indeks biayanya dengan batas yang disetel.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.evm_spi.minimum',
    catatan:
      'Pesannya selalu menyebut berapa persen pekerjaan yang punya tanggal '
      + 'rencana. Proyek yang baru sebagian dijadwalkan menghasilkan angka yang '
      + 'terlihat sama meyakinkannya dengan proyek berjadwal penuh, padahal '
      + 'dasarnya jauh lebih tipis. Proyek yang belum punya anggaran sama '
      + 'sekali dilewati — itu ketiadaan data, bukan kinerja buruk.',
  },

  {
    kunci: 'polis-berakhir',
    // DUA nomor: satu rute menjawab keduanya. Lihat komentar `nomor` di atas.
    nomor: '5.7, 9.2',
    nama: 'Asuransi berakhir atau belum ada',
    pemicu: 'jadwal',
    penjelasan:
      'Memperingatkan polis asuransi yang mendekati akhir masa berlaku atau '
      + 'sudah lewat, dan menandai proyek yang belum punya polis sama sekali. '
      + 'Pekerjaan yang berjalan tanpa pertanggungan menanggung sendiri seluruh '
      + 'risikonya.',
    penerima: 'Yang mengurus kontrak dan yang memantau risiko',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca seluruh polis proyek yang sedang berjalan.' },
      { di: 'sistem', teks: 'Menghitung sisa masa berlakunya — perhitungan yang sama dengan layar Register Asuransi.' },
      { di: 'sistem', teks: 'Mendaftar proyek yang tak punya satu polis pun.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.polis_berakhir.hari',
    catatan:
      'Mengirim dua macam pesan yang berbeda tindakannya: polis yang berakhir '
      + 'diperpanjang, proyek tanpa polis diasuransikan. Menyamakan keduanya '
      + 'akan membuat salah satu tertahan karena yang lain sudah dikirim hari '
      + 'itu. Otomasi ini juga menjawab dua nomor katalog sekaligus — 5.7 dan '
      + '9.2 — karena keduanya lahir dari perhitungan yang sama.',
  },

  {
    kunci: 'transmittal-menggantung',
    nomor: '5.11',
    nama: 'Transmittal belum dikonfirmasi',
    pemicu: 'jadwal',
    penjelasan:
      'Menagih transmittal yang sudah dikirim tetapi belum dikonfirmasi '
      + 'diterima. Gambar revisi terakhir yang tak sampai tak menimbulkan tanda '
      + 'apa pun — pekerjaan berjalan dengan gambar lama, dan selisihnya baru '
      + 'terlihat di lapangan.',
    penerima: 'Yang mengelola dokumen dan pemimpin proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari transmittal berstatus terkirim yang belum ada konfirmasi terimanya.' },
      { di: 'sistem', teks: 'Menyisihkan yang masih dalam batas hari yang wajar.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.transmittal_menggantung.hari',
    catatan:
      'Yang menunggu persetujuan ditandai lebih mendesak — ada pekerjaan yang '
      + 'tertahan di ujung sana, bukan sekadar catatan yang belum lengkap. '
      + 'Otomasi ini TIDAK membuat transmittal sendiri: apa yang dikirim, ke '
      + 'siapa, dan untuk maksud apa hanya diketahui orang yang mengirimnya.',
  },

  {
    kunci: 'sertifikat-berakhir',
    nomor: '6.9',
    nama: 'Sertifikat pegawai berakhir',
    pemicu: 'jadwal',
    penjelasan:
      'Mengingatkan sertifikat keahlian pegawai yang mendekati atau sudah '
      + 'melewati masa berlakunya. Sertifikat yang mati membuat orangnya tak '
      + 'boleh mengerjakan pekerjaan tertentu, dan itu baru ketahuan saat '
      + 'diperiksa.',
    penerima: 'Bagian SDM',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca seluruh sertifikat pegawai perusahaan.' },
      { di: 'sistem', teks: 'Menilai masa berlakunya — perhitungan yang sama dengan layar Kompetensi SDM.' },
      { di: 'sistem', teks: 'Melewati yang sudah lewat terlalu lama supaya tak menagih tiap hari selamanya.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.sertifikat_berakhir.hari',
    catatan:
      'Ijazah dan sertifikat seumur hidup TIDAK ikut ditegur — keduanya '
      + 'ditandai tidak berjangka, dan membedakannya penting: tanpa itu orang '
      + 'akan ditegur soal ijazahnya. Sebaliknya, sertifikat yang ditandai '
      + 'berjangka tetapi tanggalnya kosong justru dianggap perlu tindakan — '
      + 'data yang tak lengkap tak boleh lolos sebagai sah.',
  },
  {
    kunci: 'k3-kepatuhan',
    nomor: '9.8',
    nama: 'Kepatuhan K3 proyek',
    pemicu: 'jadwal',
    penjelasan:
      'Menandai tiga hal berbeda di keselamatan kerja: temuan berat yang lewat '
      + 'tenggat belum ditutup, jenis temuan yang berulang, dan pekerja yang '
      + 'induksinya kedaluwarsa atau belum pernah diinduksi.',
    penerima: 'Petugas K3 dan manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca inspeksi K3 tiap proyek yang sedang berjalan, lalu temuannya.' },
      { di: 'sistem', teks: 'Merekap temuan — perhitungan yang sama dengan layar K3.' },
      { di: 'sistem', teks: 'Mencocokkan induksi dengan daftar pekerja aktif proyek itu.' },
      ...LANGKAH_KIRIM,
    ],
    catatan:
      'TIDAK mengirim "skor kepatuhan". Skor tunggal dari tujuh temuan bergerak '
      + 'belasan persen tiap satu penutupan, dan angka bising yang terlihat '
      + 'presisi lebih menyesatkan daripada tak ada angka. Yang dikirim tiga '
      + 'peringatan terpisah yang masing-masing bisa ditindaklanjuti. Proyek '
      + 'yang belum punya pekerja terdaftar dilewati — itu ketiadaan data, '
      + 'bukan kepatuhan buruk.',
  },

  {
    kunci: 'kepatuhan-dokumen',
    nomor: '9.1',
    nama: 'Dokumen kepatuhan & izin habis',
    pemicu: 'jadwal',
    penjelasan:
      'Menandai dokumen legalitas pihak ketiga dan izin proyek yang mendekati '
      + 'atau sudah melewati masa berlakunya. Izin yang mati membuat pekerjaan '
      + 'tak boleh berjalan, dan itu biasanya baru ketahuan saat ada yang '
      + 'memeriksa ke lokasi.',
    penerima: 'Bagian legal/kepatuhan dan pengurus perizinan proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca dokumen kepatuhan seluruh pihak yang tercatat.' },
      { di: 'sistem', teks: 'Menilai masa berlakunya — perhitungan yang sama dengan layar Kepatuhan.' },
      { di: 'sistem', teks: 'Memeriksa izin tiap proyek yang sedang berjalan.' },
      { di: 'sistem', teks: 'Melewati yang sudah lewat terlalu lama supaya tak menagih selamanya.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.kepatuhan_dokumen.hari',
    catatan:
      'Menyebut khusus dokumen yang masih bercentang "terverifikasi" padahal '
      + 'tanggalnya sudah lewat — itu keadaan paling berbahaya, karena centang '
      + 'hijau membuat orang berhenti memeriksanya. Dokumen yang memang tanpa '
      + 'masa berlaku (NPWP, BPJS) TIDAK ditegur. Izin kerja harian dan dokumen '
      + 'prakualifikasi sengaja tak termasuk — keduanya punya layar sendiri dan '
      + 'datanya belum terisi tanggal secara sistematis.',
  },

  {
    kunci: 'serapan-anggaran',
    nomor: '2.9',
    nama: 'Serapan anggaran tinggi',
    pemicu: 'jadwal',
    penjelasan:
      'Memberi tahu ketika belanja proyek mendekati atau melampaui pagunya. '
      + 'Angkanya diambil dari perhitungan yang sama dengan layar Portofolio '
      + 'Biaya, jadi tak mungkin berselisih.',
    penerima: 'Manajer proyek dan bagian keuangan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Meminta perhitungan portofolio biaya — perhitungan yang sama dengan yang dilihat di layar.' },
      { di: 'sistem', teks: 'Melewati proyek yang belum punya pagu sama sekali.' },
      { di: 'sistem', teks: 'Membandingkan serapannya dengan batas persen yang disetel.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.serapan_anggaran.persen',
    catatan:
      'Pesannya SELALU menyebut angka itu dihitung terhadap apa. Kalau dasarnya '
      + 'nilai RAB, serapan sesungguhnya lebih tinggi daripada yang tertulis — '
      + 'RAB adalah harga jual, bukan biaya. Proyek tanpa pagu dilewati: itu '
      + 'ketiadaan data, bukan penghematan.',
  },
  {
    kunci: 'absensi-berhenti',
    nomor: '6.3',
    nama: 'Absensi berhenti dicatat',
    pemicu: 'jadwal',
    penjelasan:
      'Memberi tahu ketika sebuah lingkup kerja berhenti dicatat absensinya '
      + 'beberapa hari. Tanpa absensi, upah tak bisa dihitung — dan yang tak '
      + 'tercatat biasanya baru ketahuan saat penggajian.',
    penerima: 'Yang mengurus mandor dan manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mengambil lingkup kerja yang masih berjalan di tiap proyek aktif.' },
      { di: 'sistem', teks: 'Mencari tanggal absensi terakhir tiap lingkup.' },
      { di: 'sistem', teks: 'Menandai yang jaraknya melewati batas hari.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.absensi_berhenti.hari',
    catatan:
      'Ini peringatan OPERASIONAL, bukan tuduhan kepada pekerja — satu pesan '
      + 'per lingkup kerja, bukan per orang. Katalog aslinya meminta juga '
      + '"jam kerja tak masuk akal", tetapi sistem ini tak mencatat jam masuk '
      + 'dan keluar sama sekali; yang ada hanya porsi hari, dan batasnya sudah '
      + 'dijaga basis. Lingkup yang belum pernah dicatat sekalipun dilewati — '
      + 'ia bisa saja baru dibuat.',
  },
  {
    kunci: 'subkon-tak-layak',
    nomor: '3.6',
    nama: 'Subkontraktor tak layak dipakai',
    pemicu: 'jadwal',
    penjelasan:
      'Menandai subkontraktor yang menurut evaluasi terakhirnya tak boleh '
      + 'dipakai — masuk daftar hitam, pernah ada kecelakaan, atau pelanggaran '
      + 'keselamatan berulang.',
    penerima: 'Bagian pengadaan dan kepatuhan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mengambil evaluasi TERBARU tiap subkontraktor.' },
      { di: 'sistem', teks: 'Menilainya — penilaian yang sama dengan layar Kepatuhan.' },
      ...LANGKAH_KIRIM,
    ],
    catatan:
      'Katalog aslinya meminta "skor kinerja menurun". Itu butuh dua periode '
      + 'penilaian untuk dibandingkan, dan hampir tak ada subkontraktor yang '
      + 'punya dua. Yang lebih mendesak justru keadaan hari ini: subkon yang '
      + 'tak boleh dipakai tetapi masih diundang adalah risiko yang berjalan, '
      + 'bukan kecenderungan. Hanya evaluasi TERBARU yang dinilai — yang sudah '
      + 'diperbaiki tak ditegur berdasar catatan lamanya.',
  },

  {
    /*
      `sapa-proaktif` BUKAN rute `otomasi/jalankan/*` — ia rute asisten
      (`/api/v1/asisten/sapa-proaktif`), tetapi terjadwal di `jadwal_tugas`
      persis seperti otomasi lain (harian 08:00, aktif).

      Didaftarkan di sini supaya silang ke katalog dokumen jujur: 1.5 dan 1.6
      selama ini terhitung "belum dikerjakan" padahal jalurnya hidup sejak
      2026-08-15. Itu kelas kesalahan yang sama dengan yang dikejar seluruh
      berkas ini.
    */
    kunci: 'sapa-proaktif',
    kunci_bukan_rute: true,
    nomor: '1.5, 1.6',
    nama: 'Sapaan harian asisten',
    pemicu: 'jadwal',
    penjelasan:
      'Asisten menyapa duluan pada jam yang berbeda tiap hari, membawa hal-hal '
      + 'yang perlu diketahui hari itu. Kalau tak ada yang perlu disebut, ia '
      + 'tetap menyapa ringan — supaya jelas jalurnya hidup.',
    penerima: 'Nomor WhatsApp yang terdaftar dan mengizinkan sapaan',
    alur: [
      { di: 'sistem', teks: 'Jam sapaan diundi sekali per hari di dalam jendela yang disetel.' },
      { di: 'sistem', teks: 'Melewati gerbang jam tenang, kuota harian, dan tombol berhenti.' },
      { di: 'sistem', teks: 'Asisten menyusun isinya sendiri dari data hari itu.' },
      { di: 'n8n', teks: 'Mengirimkannya lewat WhatsApp.' },
    ],
    catatan:
      'Ini satu-satunya otomasi yang memakai AI untuk menyusun isinya — sisanya '
      + 'aturan if-then murni. Jam sapaannya berbeda tiap hari supaya tak '
      + 'terbaca seperti mesin. Bisa dimatikan di Pengaturan → Jadwal Tugas.',
  },
  {
    /*
      1.4 "Ask Anything About Company" — asisten chat itu sendiri
      (`routes/v1/ai-chat.ts`), bukan otomasi terjadwal.

      Didaftarkan bukan untuk dijadwalkan melainkan supaya katalog UI
      menjelaskan seluruh jalur otomatis yang ada, dan supaya silang ke katalog
      dokumen berhenti menghitungnya sebagai utang.
    */
    kunci: 'asisten-tanya',
    kunci_bukan_rute: true,
    nomor: '1.4',
    nama: 'Tanya apa saja ke asisten',
    pemicu: 'percakapan',
    penjelasan:
      'Bertanya bebas tentang data perusahaan lewat WhatsApp atau layar '
      + 'asisten, dan hanya data yang boleh dilihat penanyanya yang terbaca.',
    penerima: 'Yang bertanya',
    alur: [
      { di: 'n8n', teks: 'Pesan WhatsApp masuk dan diteruskan ke sistem.' },
      { di: 'sistem', teks: 'Asisten memilih alat baca yang sesuai izin penanya.' },
      { di: 'sistem', teks: 'Menjawab dari data yang benar-benar terbaca, bukan dari ingatan.' },
      { di: 'n8n', teks: 'Jawabannya dikirim balik.' },
    ],
    catatan:
      'Asisten TIDAK PERNAH menyimpan apa pun dari percakapan biasa. Yang '
      + 'menulis hanya jalur berkonfirmasi — lihat otomasi bertanda "Lewat '
      + 'WhatsApp" di bawah.',
  },
  {
    /*
      4.6 — bukan fitur terpisah. Ia lahir dari `approval_steps.max_amount`
      yang sudah ada: PO di bawah plafon melewati langkah yang lebih sedikit.

      Didaftarkan supaya tak ada yang membangunnya ulang. Itu sudah nyaris
      terjadi pada automation 3.5 (2026-08-14).
    */
    kunci: 'po-fast-track',
    kunci_bukan_rute: true,
    nomor: '4.6',
    nama: 'Persetujuan PO jalur cepat',
    pemicu: 'peristiwa',
    penjelasan:
      'Pesanan pembelian bernilai kecil melewati langkah persetujuan yang lebih '
      + 'sedikit daripada yang besar, sesuai plafon yang disetel tiap tenant.',
    penerima: 'Mengurangi beban approver, bukan mengirim pesan',
    alur: [
      { di: 'sistem', teks: 'Saat PO diajukan, rantai persetujuannya dirakit dari plafon nominal.' },
      { di: 'sistem', teks: 'Langkah yang plafonnya di atas nilai PO dilewati.' },
    ],
    catatan:
      'BUKAN otomasi terjadwal dan bukan fitur tersendiri — ia perilaku rantai '
      + 'approval yang sudah ada. Didaftarkan di sini supaya tak ada yang '
      + 'membangunnya ulang; hal itu nyaris terjadi pada otomasi stok menipis.',
  },

  {
    /*
      Tiga tool BACA asisten — 1.7, 1.8, 6.7, 6.11 dijawab dua entri di sini.

      Didaftarkan bukan untuk dijadwalkan (ia menjawab saat ditanya, bukan
      mengirim tanpa diminta) melainkan supaya katalog UI menjelaskan seluruh
      jalur otomatis yang ada, dan supaya silang ke katalog dokumen berhenti
      menghitungnya sebagai utang.
    */
    kunci: 'tanya-uang',
    kunci_bukan_rute: true,
    nomor: '1.7, 1.8',
    nama: 'Tanya saldo & kasbon lewat WhatsApp',
    pemicu: 'percakapan',
    penjelasan:
      'Menanyakan saldo tiap rekening kas, atau kasbon seseorang sudah berapa '
      + 'yang belum lunas — dijawab langsung tanpa membuka aplikasi.',
    penerima: 'Yang bertanya',
    alur: [
      { di: 'n8n', teks: 'Pertanyaan masuk lewat WhatsApp.' },
      { di: 'sistem', teks: 'Asisten memilih alat baca yang sesuai izin penanya.' },
      { di: 'sistem', teks: 'Angkanya dihitung dari basis saat itu juga, bukan dari ingatan.' },
      { di: 'n8n', teks: 'Jawabannya dikirim balik.' },
    ],
    catatan:
      'Saldo kas dipisah per jenis rekening — kas besar, penampung, dan kas '
      + 'kecil. Menjumlahkan ketiganya menyembunyikan kas kecil yang menipis '
      + 'di lapangan. Kasbon memakai definisi "belum lunas" yang SAMA dengan '
      + 'otomasi Kasbon Belum Dilunasi, supaya dua angka tak pernah berselisih.',
  },
  {
    kunci: 'tanya-mandor',
    kunci_bukan_rute: true,
    nomor: '6.7, 6.11',
    nama: 'Tanya beban mandor lewat WhatsApp',
    pemicu: 'percakapan',
    penjelasan:
      'Menanyakan berapa tukang aktif dan berapa penugasan yang sedang '
      + 'dipegang tiap mandor — dipakai saat memutuskan siapa yang bisa '
      + 'ditambahi pekerjaan.',
    penerima: 'Yang bertanya',
    alur: [
      { di: 'n8n', teks: 'Pertanyaan masuk lewat WhatsApp.' },
      { di: 'sistem', teks: 'Menghitung tukang aktif dan penugasan per mandor.' },
      { di: 'n8n', teks: 'Jawabannya dikirim balik, yang paling ringan lebih dulu.' },
    ],
    catatan:
      'Jawabannya menyebut batasnya sendiri: ini BEBAN yang sedang dipegang, '
      + 'bukan jadwal kesediaan. Sistem ini tak mencatat kapan seorang mandor '
      + 'menyatakan diri kosong, dan tool yang tak menyatakan itu akan '
      + 'dipercaya lebih daripada pantas.',
  },

  {
    kunci: 'retensi-tertahan',
    nomor: '2.3',
    nama: 'Retensi tertahan belum diurus',
    pemicu: 'jadwal',
    penjelasan:
      'Menandai uang retensi yang masih tertahan pada proyek yang sudah lewat '
      + 'tanggal selesainya dan belum punya berita acara serah terima. Retensi '
      + 'yang tak diurus adalah uang perusahaan yang mengendap di pihak lain.',
    penerima: 'Bagian keuangan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mencari proyek yang punya nilai retensi dan sudah lewat tanggal selesai.' },
      { di: 'sistem', teks: 'Menghitung berapa yang benar-benar sudah dipotong di invoice.' },
      { di: 'sistem', teks: 'Melewati yang sudah punya berita acara serah terima.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.retensi_tertahan.hari',
    catatan:
      'Pesannya menyebut DUA angka: retensi yang disepakati di kontrak, dan '
      + 'yang benar-benar tercatat dipotong di invoice. Selisihnya justru inti '
      + 'peringatannya — retensi yang tak pernah muncul di invoice berarti '
      + 'potongannya tak pernah diterapkan, dan uangnya mungkin sudah '
      + 'dibayarkan penuh. Ini BUKAN peringatan jatuh tempo: sistem ini belum '
      + 'menyimpan tanggal berakhirnya masa pemeliharaan.',
  },
  {
    kunci: 'audit-aksi-berisiko',
    nomor: '5.12',
    nama: 'Ringkasan aksi berisiko harian',
    pemicu: 'jadwal',
    penjelasan:
      'Satu ringkasan sehari tentang hal-hal yang pantas dilihat di jejak '
      + 'kegiatan: perubahan izin dan kredensial, penghapusan banyak baris '
      + 'sekaligus, lonjakan aktivitas tak wajar, dan percobaan tulis lewat '
      + 'asisten yang ditolak.',
    penerima: 'Yang berwenang melihat jejak audit',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca seluruh jejak kegiatan 24 jam terakhir.' },
      { di: 'sistem', teks: 'Menandai aksi keamanan, penghapusan berklaster, dan lonjakan aktivitas.' },
      { di: 'sistem', teks: 'Kalau tak ada satu pun temuan, TIDAK mengirim apa pun.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.audit_ledakan.per_jam',
    catatan:
      'Katalog aslinya meminta "ringkasan akses dokumen sensitif". Itu belum '
      + 'bisa: belum ada satu pun dokumen tersimpan, dan tak ada penanda yang '
      + 'menyatakan sebuah dokumen rahasia. Yang dibangun semangat yang sama '
      + 'dari sumber yang benar-benar berisi. Tiga sinyal sengaja TIDAK '
      + 'dipakai meski terdengar masuk akal — alamat jaringan, jam kerja, dan '
      + 'akhir pekan — karena diukur ketiganya menyala untuk hampir semua '
      + 'kejadian, dan alarm yang selalu berbunyi berhenti didengar.',
  },

  {
    /*
      TANPA `nomor`, dan itu disengaja.

      Kandidat terdekat di katalog 7.10 *Contract Renewal Reminder*, tetapi
      bunyinya "peluang repeat business dari klien existing" — itu kontrak
      KLIEN. Yang ini kontrak PEMASOK (`kontrak_payung.supplier_id`).

      Menempelkan 7.10 padanya akan membuat katalog mengklaim sesuatu yang tak
      dikerjakan, dan yang mencari pengingat repeat-business menemukan otomasi
      pengadaan. Kosong lebih jujur daripada salah.
    */
    kunci: 'kontrak-payung-habis',
    nama: 'Kontrak payung segera habis',
    pemicu: 'jadwal',
    penjelasan:
      'Mengingatkan kontrak payung dengan pemasok yang mendekati akhir masa '
      + 'berlakunya. Sesudah tanggal itu, pemesanan di bawahnya berhenti bisa '
      + 'dibuat — dan biasanya baru ketahuan saat ada yang mencoba memesan.',
    penerima: 'Bagian pengadaan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca kontrak payung yang masih berstatus aktif.' },
      { di: 'sistem', teks: 'Menghitung sisa hari masa berlakunya.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.kontrak_payung.hari',
    catatan:
      'Ambangnya lebih panjang daripada dokumen lain (45 hari) karena '
      + 'memperbarui kontrak payung menuntut negosiasi ulang dengan pemasok, '
      + 'bukan sekadar memperpanjang berkas. Hanya yang berstatus aktif yang '
      + 'ditegur — yang draft belum berlaku, yang habis atau dibatalkan sudah '
      + 'selesai urusannya.',
  },

  // ── Lewat percakapan WhatsApp ───────────────────────────────────────────
  {
    kunci: 'catatan_progres',
    kunci_bukan_rute: true,
    /*
      TANPA `nomor`, dan itu hasil koreksi.

      Saya sempat memberinya `1.2`. Salah: 1.2 di `06-agentic-ai-*.md` adalah
      *Incoming Transfer Detection* — deteksi transfer bank masuk, yang butuh
      integrasi bank dan memang belum ada. Ketahuan saat silang otomatis di
      `lapor-otomasi-hidup.mjs` melaporkannya sebagai "sudah hidup".

      Seluruh baris 1.x di katalog itu keuangan atau tanya-jawab; tak ada satu
      pun yang berisi pelaporan progres lapangan. Jadi entri ini memang tak
      punya padanan di sana.

      Nomor yang salah lebih buruk daripada nomor yang kosong: ia membuat
      seseorang membuka baris katalog yang keliru, membaca prasyarat yang tak
      berlaku, lalu menyimpulkan sesuatu yang tak ada hubungannya.
    */
    nama: 'Lapor progres lewat WhatsApp',
    pemicu: 'percakapan',
    penjelasan:
      'Mandor mengirim pesan biasa — "cor lantai 2 sudah 60%" — dan asisten '
      + 'menyiapkan catatan kemajuannya. Catatannya baru tersimpan setelah orang '
      + 'menekan tombol konfirmasi.',
    penerima: 'Tersimpan di proyek yang disebut',
    alur: [
      { di: 'n8n', teks: 'Pesan WhatsApp masuk dan diteruskan ke sistem.' },
      { di: 'sistem', teks: 'Asisten memahami maksudnya dan menyiapkan isian, tanpa menyimpan apa pun.' },
      { di: 'sistem', teks: 'Sistem menerbitkan tombol konfirmasi yang berlaku 15 menit.' },
      { di: 'sistem', teks: 'Setelah tombol ditekan orang, barulah catatannya tersimpan.' },
    ],
    catatan:
      'Asisten TIDAK PERNAH menyimpan sendiri, di jenis apa pun. Itu yang '
      + 'membuat pesan berisi perintah tersembunyi tak berbahaya: ia bisa '
      + 'membuat asisten menyiapkan, ia tak bisa membuat orang menekan tombol.',
  },
  {
    kunci: 'temuan_punch',
    kunci_bukan_rute: true,
    nama: 'Catat temuan lapangan lewat WhatsApp',
    pemicu: 'percakapan',
    penjelasan:
      'Mencatat temuan yang dilihat langsung di lokasi — retak, bocor, '
      + 'sambungan meleset — pada saat berdiri di depannya, bukan setelah '
      + 'kembali ke kantor.',
    penerima: 'Masuk daftar temuan proyek',
    alur: [
      { di: 'n8n', teks: 'Pesan WhatsApp masuk dan diteruskan ke sistem.' },
      { di: 'sistem', teks: 'Asisten menyiapkan judul, lokasi, dan tingkat keparahannya.' },
      { di: 'sistem', teks: 'Setelah tombol konfirmasi ditekan, temuannya tercatat.' },
    ],
  },
  {
    kunci: 'pengeluaran',
    kunci_bukan_rute: true,
    nomor: '1.1',
    nama: 'Catat pengeluaran lewat WhatsApp',
    pemicu: 'percakapan',
    penjelasan:
      'Mencatat pengeluaran lapangan langsung dari pesan. Kategori ditebak dari '
      + 'kalimatnya dan bisa dikoreksi sebelum disimpan.',
    penerima: 'Masuk pengeluaran proyek',
    alur: [
      { di: 'n8n', teks: 'Pesan WhatsApp masuk dan diteruskan ke sistem.' },
      { di: 'sistem', teks: 'Asisten menyiapkan nominal, keperluan, dan kategorinya.' },
      { di: 'sistem', teks: 'Setelah tombol konfirmasi ditekan, pengeluarannya tercatat.' },
    ],
    catatan:
      'Ada batas nominal untuk jalur ini. Di atasnya, pengajuan lewat halaman '
      + 'Pengeluaran yang menampilkan angkanya besar-besar sebelum disimpan — '
      + 'salah ketik nol adalah kekeliruan termudah lewat percakapan.',
  },
  {
    kunci: 'permintaan_material',
    kunci_bukan_rute: true,
    nama: 'Minta material lewat WhatsApp',
    pemicu: 'percakapan',
    penjelasan:
      'Mengajukan permintaan material dari lapangan — "50 sak semen untuk cor '
      + 'lantai 2". Permintaannya masuk antrean persetujuan yang sama dengan '
      + 'pengajuan lewat halaman.',
    penerima: 'Bagian pengadaan',
    alur: [
      { di: 'n8n', teks: 'Pesan WhatsApp masuk dan diteruskan ke sistem.' },
      { di: 'sistem', teks: 'Asisten menyiapkan kebutuhan dan tanggal diperlukannya.' },
      { di: 'sistem', teks: 'Setelah tombol konfirmasi ditekan, permintaannya masuk antrean persetujuan.' },
    ],
    catatan:
      'Yang diajukan permintaan material, BUKAN pesanan pembelian. Yang di '
      + 'lapangan tahu apa yang kurang; harga dan supplier ditentukan tim '
      + 'pengadaan sesudahnya.',
  },
  {
    kunci: 'kasbon',
    kunci_bukan_rute: true,
    nama: 'Ajukan kasbon lewat WhatsApp',
    pemicu: 'percakapan',
    penjelasan:
      'Mengajukan kasbon dari lapangan tanpa membuka aplikasi. Pengajuannya '
      + 'masuk antrean persetujuan seperti biasa — tak ada uang yang berpindah '
      + 'sampai ada yang menyetujuinya.',
    penerima: 'Menunggu persetujuan sesuai rantai approval',
    alur: [
      { di: 'n8n', teks: 'Pesan WhatsApp masuk dan diteruskan ke sistem.' },
      { di: 'sistem', teks: 'Asisten menyiapkan nominal, keperluan, dan sumber dananya.' },
      { di: 'sistem', teks: 'Setelah tombol konfirmasi ditekan, kasbonnya masuk antrean persetujuan.' },
      { di: 'sistem', teks: 'Uang baru bergerak setelah kasbonnya disetujui orang yang berwenang.' },
    ],
    catatan:
      'Ada batas nominal untuk jalur ini — bukan batas kasbon, melainkan batas '
      + 'kepercayaan pada percakapan. Di atasnya, diajukan lewat halaman Kasbon.',
  },
  {
    kunci: 'penyusutan-belum-ditutup',
    nomor: '10.8',
    nama: 'Buku penyusutan alat belum ditutup',
    pemicu: 'jadwal',
    penjelasan:
      'Alat berkurang nilainya tiap bulan, dan pengurangan itu adalah biaya '
      + 'proyek. Selama belum dicatat, alat terlihat lebih berharga daripada '
      + 'yang sebenarnya dan biaya terlihat lebih kecil. Otomasi ini menagih '
      + 'dua hal yang berbeda: yang belum dihitung, dan yang sudah dihitung '
      + 'tetapi belum masuk buku besar.',
    penerima: 'Bagian keuangan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Memeriksa alat mana yang masih dalam masa manfaat.' },
      { di: 'sistem', teks: 'Membandingkan dengan catatan penyusutan bulan lalu.' },
      { di: 'sistem', teks: 'Memisahkan yang belum dihitung dari yang belum dijurnalkan.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.penyusutan_tutup.tanggal',
    catatan:
      'Otomasi ini TIDAK menghitung dan TIDAK menjurnalkan sendiri. Penyusutan '
      + 'masuk buku besar, dan baris yang muncul tanpa seorang pun menekan '
      + 'tombol adalah baris yang tak seorang pun merasa bertanggung jawab '
      + 'atasnya. Yang ditagih bulan LALU, bukan bulan berjalan — menagih buku '
      + 'yang belum bisa ditutup hanya melatih orang mengabaikan notifikasi.',
  },
  {
    kunci: 'perawatan-alat',
    nomor: '10.7',
    nama: 'Perawatan & sertifikasi alat jatuh tempo',
    pemicu: 'jadwal',
    penjelasan:
      'Mengingatkan servis berkala dan perpanjangan sertifikat alat berat '
      + 'sebelum tanggalnya lewat. Sertifikat yang kedaluwarsa membuat alatnya '
      + 'tidak boleh dioperasikan sama sekali — bukan sekadar kurang terawat.',
    penerima: 'Bagian peralatan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca jadwal perawatan yang masih aktif.' },
      { di: 'sistem', teks: 'Mengambil pembacaan jam operasi tertinggi tiap alat.' },
      { di: 'sistem', teks: 'Menghitung mana yang lebih dulu tercapai: jam atau tanggal.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.perawatan_alat.hari',
    catatan:
      'Katalog aslinya menyebut sertifikasi saja, tetapi di sistem ini '
      + 'sertifikasi TERSIMPAN sebagai jadwal perawatan berulang — jadi '
      + 'keduanya satu otomasi, bukan dua. Ia juga melaporkan alat yang belum '
      + 'punya jadwal sama sekali: tanpa itu, alat yang tak pernah dijadwalkan '
      + 'akan terlihat sehat selamanya.',
  },
  {
    kunci: 'konflik-mandor',
    nomor: '3.9',
    nama: 'Mandor dipegang dua proyek sekaligus',
    pemicu: 'jadwal',
    penjelasan:
      'Menemukan mandor yang jadwal pekerjaannya di dua proyek berbeda saling '
      + 'bertabrakan. Diberitahukan selagi tabrakannya belum mulai, supaya '
      + 'jadwalnya masih bisa digeser.',
    penerima: 'Manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca lingkup kerja aktif beserta tanggal mulai dan selesainya.' },
      { di: 'sistem', teks: 'Membandingkan tiap pasang lingkup milik mandor yang sama.' },
      { di: 'sistem', teks: 'Menghitung berapa hari keduanya bertabrakan.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.konflik_mandor.hari',
    catatan:
      'Hanya MANDOR, bukan alat. Alokasi alat disimpan sebagai satu penunjuk '
      + 'proyek pada tiap alat, jadi sebuah alat tak bisa menunjuk dua proyek '
      + 'sekaligus — "dialokasikan ganda" mustahil dinyatakan, dan otomasinya '
      + 'akan memicu nol selamanya. Tanggalnya dibaca dari lingkup kerja, '
      + 'karena penugasan mandor hanya menyimpan tanggal mulai tanpa akhir.',
  },
  {
    kunci: 'rab-harga-menyimpang',
    nomor: '3.12',
    nama: 'Harga satuan RAB menyimpang antar proyek',
    pemicu: 'jadwal',
    penjelasan:
      'Menemukan pekerjaan yang sama dihargai jauh berbeda di dua proyek. '
      + 'Satu di antaranya kemungkinan salah: yang kemahalan memakan margin, '
      + 'yang kemurahan dibayar sendiri.',
    penerima: 'Bagian estimasi',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mengumpulkan item RAB dari seluruh proyek.' },
      { di: 'sistem', teks: 'Mengelompokkan yang namanya dan satuannya sama.' },
      { di: 'sistem', teks: 'Membandingkan harga satuan termurah dengan termahal.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.rab_anomali.rasio',
    catatan:
      'Item bersatuan borongan (ls, paket, set) SENGAJA tidak dibandingkan — '
      + 'harganya memang menskala dengan besar proyek. Justru angka paling '
      + 'mencolok di basis ini semuanya bersatuan ls: "Air Kerja" Rp 800 ribu '
      + 'lawan Rp 10 juta, dan itu aritmetika, bukan penyimpangan. Kalau '
      + 'diikutkan, tiga temuan paling nyaring adalah tiga yang paling salah.',
  },
  {
    kunci: 'upah-menyimpang',
    nomor: '6.4',
    nama: 'Laporan upah menyimpang dari kebiasaannya',
    pemicu: 'jadwal',
    penjelasan:
      'Memeriksa laporan upah mingguan yang menunggu persetujuan, dan menandai '
      + 'yang jauh berbeda dari biasanya untuk pekerjaan yang sama. Diperiksa '
      + 'sebelum disetujui, bukan sesudah dibayar.',
    penerima: 'Yang berwenang menyetujui upah',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca laporan upah yang masih menunggu persetujuan.' },
      { di: 'sistem', teks: 'Mengambil riwayat upah lingkup kerja yang sama.' },
      { di: 'sistem', teks: 'Membandingkan dengan nilai tengah riwayat itu.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.upah_anomali.rasio',
    catatan:
      'Pembandingnya riwayat lingkup ITU SENDIRI, bukan rata-rata perusahaan: '
      + 'sebaran upah terukur sangat lebar, dan membandingkan dengan rata-rata '
      + 'semua orang akan menandai hampir semua hal. Dipakai nilai tengah, '
      + 'bukan rata-rata — satu minggu lembur besar akan menarik rata-rata '
      + 'naik dan membuat minggu normal berikutnya terlihat kekecilan. '
      + 'Berlaku dua arah: upah yang tiba-tiba separuh biasanya berarti '
      + 'pekerjaan berhenti.',
  },
  {
    kunci: 'kontrak-klien-berakhir',
    nomor: '7.10',
    nama: 'Kontrak klien mendekati akhir',
    pemicu: 'jadwal',
    penjelasan:
      'Mengingatkan proyek yang mendekati atau baru saja selesai, supaya '
      + 'pekerjaan berikutnya ditawarkan selagi kliennya masih sering '
      + 'dihubungi. Sesudah serah terima, hubungan itu mendingin cepat.',
    penerima: 'Yang mengurus hubungan klien',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca tanggal selesai seluruh proyek.' },
      { di: 'sistem', teks: 'Menghitung berapa proyek yang pernah dikerjakan untuk tiap klien.' },
      { di: 'sistem', teks: 'Menyusun pesan berisi nilai kontrak dan kontak kliennya.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.kontrak_klien.hari',
    catatan:
      'Ini pekerjaan PENJUALAN, bukan peringatan operasional — prioritasnya '
      + 'sengaja biasa supaya tak menyaingi peringatan yang menahan uang. '
      + 'Jendelanya dua arah: proyek yang baru selesai bulan lalu bukan '
      + 'peluang yang lebih kecil, melainkan lebih matang. Jangan tertukar '
      + 'dengan `kontrak-payung-habis` — yang itu kontrak PEMASOK.',
  },
  {
    kunci: 'insiden-k3-belum-ditutup',
    nomor: '3.15',
    nama: 'Insiden K3 belum ditutup',
    pemicu: 'jadwal',
    penjelasan:
      'Menegur insiden keselamatan kerja yang belum ditutup, dengan tenggang '
      + 'yang berbeda menurut beratnya. Kecelakaan berat berbunyi jauh lebih '
      + 'cepat daripada nyaris-celaka.',
    penerima: 'Petugas K3',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca insiden yang statusnya belum ditutup.' },
      { di: 'sistem', teks: 'Menghitung tenggang menurut jenis insidennya.' },
      { di: 'sistem', teks: 'Memisahkan insiden berat yang belum punya tindakan korektif.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.insiden_k3.hari',
    catatan:
      'Ambang tunggal untuk semua jenis adalah KESALAHAN, bukan '
      + 'penyederhanaan: dipasang longgar, kecelakaan berat menganggur '
      + 'berminggu-minggu; dipasang ketat, tiap nyaris-celaka berbunyi tiap '
      + 'hari sampai orang mematikan notifikasinya — dan yang mati ikut '
      + 'membungkam yang berat. Perbandingan antar jenis DIPAKU di kode dan '
      + 'sengaja tak bisa disetel. Temuan kedua terpisah: insiden berat tanpa '
      + 'satu pun tindakan korektif berarti penyebabnya masih di lokasi.',
  },
  {
    kunci: 'stok-di-bawah-minimum',
    nomor: '4.5',
    nama: 'Stok material di bawah batas minimum',
    pemicu: 'jadwal',
    penjelasan:
      'Memberitahu material yang stoknya sudah di bawah batas minimum, dan '
      + 'material yang belum punya batas sama sekali.',
    penerima: 'Bagian gudang',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Menjumlahkan stok di lokasi proyek dan di gudang.' },
      { di: 'sistem', teks: 'Membandingkan dengan batas minimum tiap material.' },
      { di: 'sistem', teks: 'Mendata material yang belum punya batas minimum.' },
      ...LANGKAH_KIRIM,
    ],
    catatan:
      'Yang paling penting di sini BUKAN stoknya: dari 24 material aktif, '
      + 'hanya SATU yang punya batas minimum. Otomasi yang cuma membaca batas '
      + 'akan melaporkan 23 sisanya aman selamanya — bukan karena stoknya '
      + 'cukup, melainkan karena tak ada yang pernah menuliskan berapa yang '
      + 'disebut cukup. Stok dijumlahkan dari dua tempat: membaca proyek saja '
      + 'membuat material yang menumpuk di gudang terlihat habis lalu dipesan '
      + 'lagi.',
  },
  {
    kunci: 'audit-mutu-lewat-jadwal',
    nomor: '3.14',
    nama: 'Audit mutu lewat jadwal',
    pemicu: 'jadwal',
    penjelasan:
      'Mengingatkan audit mutu yang sudah lewat tanggal rencananya, dan '
      + 'rencana mutu yang belum disahkan.',
    penerima: 'Penanggung jawab mutu',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca audit mutu yang belum selesai.' },
      { di: 'sistem', teks: 'Menghitung berapa hari lewat dari tanggal rencana.' },
      { di: 'sistem', teks: 'Memeriksa rencana mutu yang masih menunggu pengesahan.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.audit_mutu.hari',
    catatan:
      'Pesannya membedakan audit yang BELUM DIMULAI dari yang sudah berjalan '
      + 'tetapi belum selesai — tindakannya berbeda: yang satu butuh orang '
      + 'menetapkan tanggal, yang satu butuh orang menyelesaikan temuannya. '
      + 'Rencana mutu yang masih diajukan ikut ditegur karena selama belum '
      + 'sah, temuan audit di bawahnya berpijak pada dokumen yang belum '
      + 'berlaku.',
  },
  {
    kunci: 'izin-kedaluwarsa',
    nomor: '9.1',
    nama: 'Izin proyek & izin kerja kedaluwarsa',
    pemicu: 'jadwal',
    penjelasan:
      'Memeriksa izin dari pemerintah (PBG, izin lingkungan, pemanfaatan '
      + 'ruang) dan izin kerja internal yang mendekati atau melewati masa '
      + 'berlakunya, serta izin yang seharusnya terbit sebelum pekerjaan '
      + 'dimulai tetapi belum ada.',
    penerima: 'Bagian perizinan & K3',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca izin proyek yang sudah terbit dan masa berlakunya.' },
      { di: 'sistem', teks: 'Memeriksa izin penghalang yang belum terbit di proyek berjalan.' },
      { di: 'sistem', teks: 'Memeriksa izin kerja disetujui yang masa berlakunya habis.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.izin.hari',
    catatan:
      'Izin yang BELUM PERNAH terbit lebih genting daripada izin yang habis '
      + 'masa berlakunya — yang kedua pernah sah, yang pertama tidak pernah. '
      + 'Izin terbit yang tanggal akhirnya kosong dihitung dan DILAPORKAN '
      + 'terpisah: mungkin berlaku selamanya, mungkin tanggalnya belum diisi, '
      + 'dan keduanya terlihat sama di basis.',
  },
  {
    kunci: 'risiko-lewat-tinjau',
    nomor: '9.4',
    nama: 'Risiko lewat tenggat tinjau',
    pemicu: 'jadwal',
    penjelasan:
      'Menegur risiko proyek yang berhenti ditinjau ulang, dengan tenggang '
      + 'yang lebih pendek untuk risiko berskor tinggi.',
    penerima: 'Pemilik risiko & manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca risiko yang masih aktif beserta skornya.' },
      { di: 'sistem', teks: 'Menghitung tenggang menurut skor tiap risiko.' },
      { di: 'sistem', teks: 'Memisahkan risiko tinggi yang belum punya tenggat tinjau.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.risiko_tinjau.hari',
    catatan:
      'Yang ditegur bukan risikonya melainkan PENINJAUANNYA yang berhenti — '
      + 'daftar risiko yang tak pernah ditinjau berubah jadi dokumen '
      + 'kepatuhan yang tak seorang pun membacanya. Risiko tinggi yang belum '
      + 'punya tenggat tinjau ditegur terpisah: tanpa jadwal, ia tak akan '
      + 'pernah muncul di daftar lewat-tenggat mana pun, jadi risiko paling '
      + 'besar justru jadi yang paling mungkin terlupakan.',
  },
  {
    kunci: 'biaya-kembar',
    nomor: '2.7',
    nama: 'Dua pengeluaran kembar',
    pemicu: 'jadwal',
    penjelasan:
      'Menemukan satu nota yang tercatat dua kali: vendor dan nominalnya sama '
      + 'persis, tanggalnya berdekatan, tetapi uraiannya diketik berbeda.',
    penerima: 'Bagian keuangan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mengelompokkan biaya per proyek, vendor, dan nominal.' },
      { di: 'sistem', teks: 'Mencari pasangan yang tanggalnya berdekatan.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.biaya_kembar.hari',
    catatan:
      'Yang dicocokkan vendor + nominal + kedekatan tanggal, BUKAN uraiannya. '
      + 'Pencatatan ganda hampir tak pernah menghasilkan dua kalimat yang sama '
      + 'persis — orang kedua mengetik ulang dengan kata-katanya sendiri, dan '
      + 'mencocokkan teks akan melewatkan semuanya. Jendelanya sengaja pendek: '
      + 'sewa bulanan dari vendor yang sama juga punya nominal identik '
      + 'berulang, dan yang membedakannya cuma jarak hari.',
  },
  {
    kunci: 'biaya-berulang',
    nomor: '2.14',
    nama: 'Pengeluaran berulang tiap bulan',
    pemicu: 'jadwal',
    penjelasan:
      'Menemukan biaya yang muncul bulan demi bulan dengan nominal sama — '
      + 'sewa, langganan, retribusi — lalu menyebut berapa totalnya sejauh ini '
      + 'dan berapa setahun bila diteruskan.',
    penerima: 'Bagian keuangan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Mengelompokkan biaya per proyek, vendor, dan nominal.' },
      { di: 'sistem', teks: 'Menghitung di berapa BULAN BERBEDA ia muncul.' },
      { di: 'sistem', teks: 'Menghitung total sejauh ini dan perkiraan setahun.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.biaya_berulang.bulan',
    catatan:
      'Yang diberitahukan bukan "ada biaya berulang" — itu sudah jelas. Yang '
      + 'mengejutkan angka setahunnya: sewa Rp 3,5 juta sebulan adalah Rp 42 '
      + 'juta setahun, dan karena dicatat satu-satu tiap bulan, ia tak pernah '
      + 'muncul sebagai satu keputusan yang pernah disetujui seseorang. '
      + 'Dihitung dari BULAN BERBEDA, bukan jumlah baris: enam nota di bulan '
      + 'yang sama bukan biaya berulang, itu enam belanja.',
  },
  {
    kunci: 'margin-bocor',
    nomor: '2.5',
    nama: 'Margin bocor',
    pemicu: 'jadwal',
    penjelasan:
      'Memeriksa tiga hal yang memakan keuntungan proyek: rencana biaya yang '
      + 'lebih besar daripada nilai kontrak, biaya nyata yang mendekati atau '
      + 'melampaui RAB, dan proyek yang belum punya RAB sama sekali.',
    penerima: 'Bagian keuangan & manajer proyek',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Menjumlahkan RAB tiap proyek dari baris rinciannya saja.' },
      { di: 'sistem', teks: 'Menjumlahkan biaya yang sudah disetujui.' },
      { di: 'sistem', teks: 'Membandingkan RAB dengan nilai kontrak, dan biaya dengan RAB.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.margin_bocor.persen',
    catatan:
      'Temuan terbesarnya BUKAN kebocoran melainkan ketiadaan alat ukur: 13 '
      + 'dari 16 proyek tak punya satu pun baris RAB. Proyek tanpa RAB bukan '
      + 'proyek yang marginnya aman — ia proyek yang marginnya tak diketahui '
      + 'siapa pun, dan ia akan terus terlihat sehat karena tak ada angka '
      + 'pembandingnya. RAB dijumlahkan dari baris rincian SAJA; menjumlahkan '
      + 'seluruh jenjang menghitung ganda dan membuat tiap proyek terlihat '
      + 'rugi. Saat RAB melampaui kontrak, pesannya menyatakan KEDUANYA '
      + 'sebagai kemungkinan keliru — otomasi yang menebak mana yang salah '
      + 'akan menyuruh orang memperbaiki angka yang benar.',
  },
  {
    kunci: 'pemasok-terpencar',
    nomor: '4.11',
    nama: 'Material sama dibeli dari beberapa pemasok',
    pemicu: 'jadwal',
    penjelasan:
      'Menemukan material yang dipesan dari lebih dari satu pemasok dengan '
      + 'harga rata-rata yang berbeda, lalu menyebut berapa selisihnya atas '
      + 'volume yang sudah dipesan.',
    penerima: 'Bagian pengadaan',
    alur: [
      ...LANGKAH_JADWAL,
      { di: 'sistem', teks: 'Membaca item pesanan pembelian yang tidak dibatalkan.' },
      { di: 'sistem', teks: 'Menghitung harga rata-rata tiap pemasok, ditimbang volumenya.' },
      { di: 'sistem', teks: 'Membandingkan pemasok termurah dengan termahal.' },
      ...LANGKAH_KIRIM,
    ],
    ambang: 'otomasi.pemasok_terpencar.persen',
    catatan:
      'Angka selisihnya BATAS ATAS, bukan penghematan — dan pesannya '
      + 'menyatakan itu sendiri. Harga bisa berbeda karena tempo pembayaran, '
      + 'ongkos kirim, atau siapa yang sanggup mengantar hari itu juga. '
      + 'Otomasi yang menyodorkannya sebagai "potensi hemat" membuat orang '
      + 'mengejar angka yang tak pernah ada, lalu berhenti percaya. Yang '
      + 'berguna bukan angkanya melainkan pertanyaannya: kenapa material yang '
      + 'sama dibeli dengan dua harga? Dibaca dari `supplier_id` dan '
      + '`material_id` pada pesanan pembelian, BUKAN dari nama vendor di '
      + 'catatan biaya — teks bebas membuat tiap salah ketik jadi temuan palsu.',
  },
]

/** Pencarian satu entri. `null` bila tak ada, bukan melempar. */
export function entriKatalog(kunci: string): EntriKatalog | null {
  return KATALOG_OTOMASI.find((e) => e.kunci === kunci) ?? null
}

/** Kunci yang MEMANG rute terjadwal — dipakai penjaga dan rute ikhtisar. */
export function kunciRuteTerjadwal(): string[] {
  return KATALOG_OTOMASI.filter((e) => !e.kunci_bukan_rute).map((e) => e.kunci)
}

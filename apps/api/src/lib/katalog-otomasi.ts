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
  /** Nomor di katalog `06-agentic-ai-*.md`, untuk yang menelusuri ke sana. */
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
    nomor: '5.7',
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
]

/** Pencarian satu entri. `null` bila tak ada, bukan melempar. */
export function entriKatalog(kunci: string): EntriKatalog | null {
  return KATALOG_OTOMASI.find((e) => e.kunci === kunci) ?? null
}

/** Kunci yang MEMANG rute terjadwal — dipakai penjaga dan rute ikhtisar. */
export function kunciRuteTerjadwal(): string[] {
  return KATALOG_OTOMASI.filter((e) => !e.kunci_bukan_rute).map((e) => e.kunci)
}

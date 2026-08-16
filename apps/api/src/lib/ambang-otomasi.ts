/**
 * AMBANG OTOMASI — dari `company_settings`, bukan dari angka di kode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder, 2026-08-15: *"kalo bisa workflownya itu kalo bisa jangan di
 * hardcode langsung yaa"*.
 *
 * Tepat, dan tepat waktu: saya baru saja menulis `angka(q.ambang, 5_000_000)`
 * untuk automation 2.11 — lima juta yang saya pilih sendiri, untuk uang
 * perusahaan orang lain.
 *
 * Angka seperti itu bukan detail teknis. "Saldo di bawah berapa yang bikin
 * khawatir" berbeda antara kontraktor rumah tinggal dan kontraktor
 * infrastruktur, dan satu-satunya yang tahu adalah pemiliknya.
 *
 * ── Kenapa `company_settings`, bukan tabel baru
 *
 * Mekanismenya SUDAH ADA dan sudah dipakai — diukur: lima baris aktif
 * (`kasbon.limit.enabled`, `tax.ppn_rate`, `project.dp_default_pct`, …),
 * dibaca `lib/kasbon-limit.ts` dan `routes/v1/procurement.ts`, dengan halaman
 * pengaturannya sendiri.
 *
 * Membuat tabel `ambang_otomasi` terpisah berarti tempat KEDUA untuk hal yang
 * sama, dan pengguna harus tahu mana yang berlaku. Yang sudah ada dipakai.
 *
 * ── Kenapa tetap ada bawaan di kode
 *
 * Bukan hardcode yang mengikat, melainkan JARING: tenant yang belum mengisi
 * ambangnya tetap mendapat otomasi yang bekerja, alih-alih otomasi yang diam
 * karena satu baris pengaturan belum ada.
 *
 * Bedanya menentukan, dan sudah terbukti mahal: `stok-menipis` memakai kolom
 * `materials.min_stock` yang WAJIB diisi manusia — dari 24 material, satu yang
 * terisi, dan automation-nya diam berbulan-bulan sambil melaporkan sehat.
 *
 * Jadi urutannya: **pengaturan tenant → query → bawaan**. Yang pertama menang,
 * yang terakhir menjaga agar tak pernah mati diam.
 */

import type { FastifyRequest } from 'fastify'

/**
 * Katalog ambang yang dipakai otomasi terjadwal.
 *
 * Ditulis di satu tempat, bukan tersebar di tiap rute — supaya "ambang apa
 * saja yang bisa diatur tenant" bisa dijawab dengan membaca satu berkas, dan
 * supaya migrasi seed-nya tak berselisih dengan yang dibaca kode.
 *
 * `bawaan` sengaja konservatif: lebih baik otomasi menegur sedikit terlalu
 * sering (yang bisa dilonggarkan tenant) daripada diam untuk masalah nyata.
 */
export const AMBANG_OTOMASI = {
  'otomasi.invoice_terlambat.hari': {
    bawaan: 1,
    min: 0,
    max: 90,
    label: 'Hari keterlambatan invoice sebelum ditegur',
    judul: 'Tagihan lewat jatuh tempo',
    akibat:
      'Pesan dikirim setelah tagihan lewat jatuh tempo sekian hari. '
      + 'Angka kecil berarti tahu lebih cepat, tapi juga lebih sering '
      + 'menegur klien yang cuma telat sehari.',
    satuan: 'hari',
    langkah: 1,
  },
  'otomasi.saldo_menipis.rupiah': {
    bawaan: 5_000_000,
    min: 0,
    max: 1_000_000_000,
    label: 'Saldo kas minimum sebelum diperingatkan',
    judul: 'Saldo kas menipis',
    akibat:
      'Peringatan datang saat kas turun di bawah angka ini. Terlalu '
      + 'tinggi, ia berbunyi tiap minggu; terlalu rendah, Anda tahu saat '
      + 'sudah tak sempat memindahkan dana.',
    satuan: 'Rp',
    langkah: 500000,
  },
  'otomasi.milestone_berisiko.hari': {
    bawaan: 7,
    min: 1,
    max: 60,
    label: 'Hari sebelum tenggat milestone mulai ditegur',
    judul: 'Milestone mendekati tenggat',
    akibat:
      'Berapa hari sebelum tenggat milestone mulai diingatkan. Terlalu '
      + 'pendek, tak ada waktu mengejar; terlalu panjang, peringatannya '
      + 'sudah terlupa saat harinya tiba.',
    satuan: 'hari',
    langkah: 1,
  },
  'otomasi.hutang_supplier.hari': {
    bawaan: 7,
    min: 0,
    max: 60,
    label: 'Hari sebelum jatuh tempo hutang supplier ditegur',
    judul: 'Hutang pemasok jatuh tempo',
    akibat:
      'Berapa hari sebelum jatuh tempo bagian keuangan diingatkan. Ini '
      + 'menentukan apakah pemasok ditelepon lebih dulu, atau menelepon '
      + 'lebih dulu.',
    satuan: 'hari',
    langkah: 1,
  },
  'otomasi.harga_material.persen': {
    bawaan: 10,
    min: 1,
    max: 100,
    label: 'Kenaikan harga material yang dianggap signifikan (%)',
    judul: 'Kenaikan harga material',
    akibat:
      'Kenaikan sebesar ini dianggap layak diperiksa. Terlalu kecil, '
      + 'tiap fluktuasi wajar ikut berbunyi dan orang berhenti membaca.',
    satuan: '%',
    langkah: 1,
  },
  /*
    Dua ambang EVM, dan DESIMAL — satu-satunya di daftar ini.

    Dan pemotongan di `jepit()` HARUS mengikuti bentuknya — lihat komentar di
    sana. Saya sempat menulis di sini bahwa "`ambilAmbang` tak membulatkan
    (diperiksa)"; itu SALAH. `Math.trunc(0.75)` menghasilkan 0, lalu dijepit
    naik ke `min` — ambang 0.75 diam-diam jadi 0.1, dan otomasinya praktis
    berhenti menegur siapa pun tanpa satu pun galat. Test `otomasi-evm`
    menangkapnya; pembacaan kode saya tidak.

    Bawaan 0.90, bukan 1.00. SPI persis 1.00 hampir tak pernah terjadi pada
    proyek nyata; ambang di 1.00 berarti notifikasi yang selalu menyala, dan
    yang selalu menyala berhenti dibaca.
  */
  /*
    Bawaan 30 hari — sama dengan `AMBANG_SEGERA_HARI` di
    `lib/register-asuransi.ts`, dan itu disengaja.

    Kalau keduanya berbeda, layar Register Asuransi menandai polis "segera
    berakhir" pada hari yang berbeda dari hari notifikasinya dikirim — dan
    yang membuka layar sesudah menerima pesan menemukan status yang tak cocok
    dengan pesannya.
  */
  'otomasi.polis_berakhir.hari': {
    bawaan: 30,
    min: 1,
    max: 180,
    label: 'Hari sebelum polis asuransi berakhir mulai diperingatkan',
    judul: 'Polis asuransi berakhir',
    akibat:
      'Berapa hari sebelum polis habis mulai diingatkan. Perpanjangan '
      + 'asuransi butuh survei dan penawaran; angka kecil berarti sempat '
      + 'terjadi jeda tanpa pertanggungan.',
    satuan: 'hari',
    langkah: 5,
  },
  /*
    Bawaan 7 hari. Bukan angka bulat yang dipilih asal: konfirmasi terima
    dokumen konstruksi lazimnya seminggu, dan menegur lebih cepat dari itu
    membuat pesannya terbaca sebagai desakan alih-alih pengingat.
  */
  'otomasi.transmittal_menggantung.hari': {
    bawaan: 7,
    min: 1,
    max: 90,
    label: 'Hari transmittal terkirim tanpa konfirmasi sebelum ditegur',
    judul: 'Transmittal tanpa konfirmasi',
    akibat:
      'Berapa lama dokumen terkirim boleh menggantung tanpa konfirmasi '
      + 'penerima sebelum ditegur.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Bawaan 60 hari — SAMA dengan bawaan `nilaiSertifikat()` di
    `lib/kompetensi-sdm.ts`, dan itu disengaja.

    Kalau keduanya berbeda, layar Kompetensi SDM menandai sertifikat "akan
    habis" pada hari yang berbeda dari hari notifikasinya dikirim, dan yang
    membuka layar sesudah menerima pesan menemukan status yang tak cocok.
  */
  'otomasi.sertifikat_berakhir.hari': {
    bawaan: 60,
    min: 1,
    max: 365,
    label: 'Hari sebelum sertifikat pegawai berakhir mulai diperingatkan',
    judul: 'Sertifikat pegawai berakhir',
    akibat:
      'Berapa hari sebelum sertifikat habis mulai diingatkan. '
      + 'Sertifikat K3 yang mati membuat orangnya tak boleh bekerja di '
      + 'area tertentu.',
    satuan: 'hari',
    langkah: 5,
  },
  /*
    Batas BAWAH — berapa lama sebuah sertifikat yang sudah lewat masih
    ditegur.

    Diukur: satu sertifikat kedaluwarsa sejak 2025-05-31, empat belas bulan.
    Dedup harian menahan kembar DALAM satu hari, bukan lintas hari — tanpa
    batas ini otomasinya menegur dokumen yang sama tiap pagi selamanya, dan
    yang ditegur tiap hari berhenti dibaca.

    90 hari: cukup lama untuk perpanjangan yang tertunda, cukup pendek untuk
    berhenti menagih yang memang sudah ditinggalkan.
  */
  'otomasi.sertifikat_lewat.maks_hari': {
    bawaan: 90,
    min: 7,
    max: 730,
    label: 'Sertifikat yang lewat lebih lama dari ini berhenti ditegur',
    judul: 'Batas berhenti menegur sertifikat',
    akibat:
      'Sertifikat yang sudah lewat lebih lama dari ini berhenti '
      + 'ditegur. Tanpa batas ini, daftar terisi sertifikat lama yang '
      + 'orangnya mungkin sudah tak bekerja di sini, dan daftar yang tak '
      + 'pernah bisa dikosongkan berhenti dibuka.',
    satuan: 'hari',
    langkah: 10,
  },
  /*
    60 hari — SAMA dengan `AMBANG_SEGERA_HABIS` di `lib/kepatuhan-k3.ts`,
    yang juga dipakai `nilaiIzin()` sebagai bawaan.

    Kalau berbeda, layar Kepatuhan menandai dokumen "segera habis" pada hari
    yang berbeda dari hari notifikasinya dikirim.
  */
  'otomasi.kepatuhan_dokumen.hari': {
    bawaan: 60,
    min: 1,
    max: 365,
    label: 'Hari sebelum dokumen kepatuhan/izin habis mulai diperingatkan',
    judul: 'Dokumen kepatuhan habis',
    akibat:
      'Berapa hari sebelum dokumen atau izin mitra habis mulai '
      + 'diingatkan.',
    satuan: 'hari',
    langkah: 5,
  },
  /*
    Batas BAWAH. Diukur: satu dokumen sudah lewat 106 hari dan satu izin
    proyek lewat 283 hari. Dedup harian menahan kembar DALAM satu hari, bukan
    lintas hari — tanpa batas ini keduanya ditagih tiap minggu selamanya.
  */
  'otomasi.kepatuhan_lewat.maks_hari': {
    bawaan: 120,
    min: 7,
    max: 730,
    label: 'Dokumen/izin yang lewat lebih lama dari ini berhenti ditegur',
    judul: 'Batas berhenti menegur dokumen',
    akibat:
      'Dokumen yang lewat lebih lama dari ini berhenti ditegur, dengan '
      + 'alasan yang sama seperti sertifikat: daftar yang tak pernah '
      + 'kosong berhenti dibaca.',
    satuan: 'hari',
    langkah: 10,
  },
  /*
    Serapan anggaran. Bawaan 90% — bukan 100%.

    Peringatan yang baru berbunyi saat anggaran SUDAH terlampaui datang pada
    saat tak ada lagi yang bisa dilakukan. Sembilan puluh persen menyisakan
    ruang untuk memutuskan.
  */
  'otomasi.serapan_anggaran.persen': {
    bawaan: 90,
    min: 50,
    max: 200,
    label: 'Serapan anggaran (%) yang mulai diperingatkan',
    judul: 'Serapan anggaran proyek',
    akibat:
      'Peringatan datang saat serapan menyentuh persen ini. Di atas 100 '
      + 'berarti Anda baru tahu setelah anggarannya habis.',
    satuan: '%',
    langkah: 5,
  },
  /*
    Absensi berhenti dicatat. Bawaan 3 hari.

    Bukan tuduhan kepada pekerja melainkan peringatan operasional kepada yang
    mengurus mandor: tanpa absensi, upah tak bisa dihitung. Tiga hari cukup
    melewati satu hari libur tanpa berbunyi palsu.
  */
  'otomasi.absensi_berhenti.hari': {
    bawaan: 3,
    min: 1,
    max: 30,
    label: 'Hari tanpa catatan absensi sebelum lingkup kerja ditegur',
    judul: 'Absensi berhenti dicatat',
    akibat:
      'Berapa hari tanpa catatan absensi sebelum ditegur. Tanpa '
      + 'absensi, upah tak bisa dihitung; ini peringatan operasional, '
      + 'bukan tuduhan kepada pekerja.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Retensi tertahan. Bawaan 30 hari sesudah tanggal selesai proyek.

    Bukan tanggal jatuh tempo retensi — itu MUSTAHIL diukur: tak ada satu pun
    kolomnya di schema, dan satu-satunya durasi masa pemeliharaan ada di
    `serah_terima` yang nol baris. Yang diukur EKSPOSUR: berapa lama uang
    retensi tertahan sesudah pekerjaannya lewat waktu.
  */
  'otomasi.retensi_tertahan.hari': {
    bawaan: 30,
    min: 0,
    max: 365,
    label: 'Hari sesudah proyek selesai sebelum retensi tertahan ditegur',
    judul: 'Retensi tertahan',
    akibat:
      'Berapa hari sesudah proyek lewat tanggal selesai sebelum retensi '
      + 'yang tertahan ditagihkan perhatiannya.',
    satuan: 'hari',
    langkah: 5,
  },
  /*
    Opname bersama belum diverifikasi. Bawaan 7 hari.

    Pendek, dan alasannya bukan administratif: selama opname belum
    diverifikasi, mandor sudah mengerjakan tetapi belum bisa menagih. Yang
    menanggung keterlambatannya bukan perusahaan melainkan orang yang sudah
    bekerja.

    Tak berlaku untuk yang DISENGKETAKAN — itu tenggangnya nol, karena yang
    dibutuhkan orang ketiga yang memutuskan, sejak hari sengketanya dicatat.
  */
  'otomasi.opname_menggantung.hari': {
    bawaan: 7,
    min: 1,
    max: 60,
    label: 'Hari sebelum opname yang belum diverifikasi ditegur',
    judul: 'Opname belum diverifikasi',
    akibat:
      'Berapa hari opname bersama boleh menggantung. Yang tertahan di '
      + 'sini upah orang yang sudah bekerja; angka besar berarti mandor '
      + 'menunggu lebih lama sebelum ada yang tahu.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Ringkasan invoice melenceng dari buku pembayaran. Bawaan Rp 1.

    Hampir NOL dengan sengaja. Ini bukan ambang kewajaran melainkan pengaman
    terhadap pembulatan: selisih satu rupiah antara kolom ringkasan dan jumlah
    baris pembayaran tetap berarti keduanya tak sejalan.

    Uang yang diakui masuk tanpa bukti penerimaan bukan hal yang punya "batas
    wajar".
  */
  'otomasi.invoice_melenceng.rupiah': {
    bawaan: 1,
    min: 1,
    max: 1_000_000,
    label: 'Selisih rupiah minimum antara ringkasan invoice dan buku pembayaran',
    judul: 'Selisih invoice dengan buku pembayaran',
    akibat:
      'Selisih sekecil ini pun ditegur. Ini bukan batas kewajaran '
      + 'melainkan pengaman pembulatan; dilonggarkan, uang yang diakui '
      + 'masuk tanpa bukti akan lolos diam-diam.',
    satuan: 'Rp',
    langkah: 1,
  },
  /*
    Kuota kontrak payung menipis. Bawaan 80%.

    Bukan 100: menambah kuota menuntut negosiasi ulang dengan pemasok, bukan
    sekadar memesan lagi. Yang tahu di 80% masih sempat bicara; yang tahu di
    100% sudah terlanjur memesan di luar harga kontrak.
  */
  'otomasi.kuota_payung.persen': {
    bawaan: 80,
    min: 50,
    max: 100,
    label: 'Persen kuota kontrak payung terpakai sebelum diperingatkan',
    judul: 'Kuota kontrak payung menipis',
    akibat:
      'Berapa persen kuota terpakai sebelum diperingatkan. Kuota yang habis '
      + 'berarti pesanan berikutnya tak lagi tercakup harga kontrak, dan itu '
      + 'biasanya baru ketahuan saat tagihan datang dengan harga lain.',
    satuan: '%',
    langkah: 5,
  },
  /*
    Proyeksi selesai meleset. Bawaan 7 hari dari tanggal kontrak.

    Kecil, karena proyeksi yang meleset seminggu masih bisa dikejar dengan
    menambah orang; yang meleset sebulan menuntut renegosiasi. Yang berguna
    tahu selagi masih di rentang pertama.
  */
  'otomasi.proyeksi_selesai.hari': {
    bawaan: 7,
    min: 0,
    max: 180,
    label: 'Hari proyeksi selesai boleh lewat dari tanggal kontrak',
    judul: 'Proyeksi selesai lewat kontrak',
    akibat:
      'Berapa hari proyeksi tanggal selesai boleh melewati tanggal kontrak '
      + 'sebelum diperingatkan. Proyeksinya dihitung dari laju yang sudah '
      + 'terjadi, jadi ia berubah begitu lajunya berubah.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Progres berhenti dilaporkan. Bawaan 21 hari.

    Laju NOL adalah temuan, bukan kegagalan menghitung: proyek yang mandek di
    50% dengan target sudah lewat adalah sinyal keterlambatan terkuat yang
    ada. Terukur keenam proyek aktif terakhir melapor 2-4 bulan lalu.
  */
  'otomasi.proyeksi_selesai.diam': {
    bawaan: 21,
    min: 3,
    max: 180,
    label: 'Hari tanpa laporan progres sebelum proyek disebut mandek',
    judul: 'Progres berhenti dilaporkan',
    akibat:
      'Berapa hari tanpa laporan progres sebelum sebuah proyek disebut '
      + 'mandek. Tanpa laporan baru tak ada yang bisa memperkirakan kapan '
      + 'selesai — dan berhentinya laporan sendiri sering tanda pekerjaannya '
      + 'memang berhenti.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Pengeluaran pencilan. Bawaan 2 simpangan baku dari kebiasaan proyeknya.

    Pembandingnya proyek ITU SENDIRI, bukan rata-rata perusahaan: proyek
    gudang Rp 380 juta dan renovasi dapur Rp 90 juta memang berbelanja pada
    skala berbeda, dan membandingkannya menandai hampir semua hal.
  */
  'otomasi.biaya_pencilan.sigma': {
    bawaan: 2,
    min: 1,
    max: 6,
    label: 'Simpangan baku dari kebiasaan proyek sebelum pengeluaran ditandai',
    judul: 'Pengeluaran jauh di atas kebiasaan',
    akibat:
      'Seberapa jauh sebuah pengeluaran harus menyimpang dari kebiasaan '
      + 'proyeknya sendiri sebelum ditandai. Angka kecil menandai banyak '
      + 'belanja yang sebenarnya wajar; angka besar hanya menangkap yang '
      + 'sangat mencolok, dan yang sedang-sedang lolos.',
    satuan: 'simpangan baku',
    langkah: 0.5,
  },
  /*
    Riwayat minimum sebelum sebuah proyek punya sebaran yang bisa dipakai.

    Dengan tiga pengeluaran, satu belanja besar MEMBUAT simpangan bakunya
    sendiri lalu tampak wajar terhadap sebaran yang ia bentuk.
  */
  'otomasi.biaya_pencilan.minimum': {
    bawaan: 8,
    min: 3,
    max: 100,
    label: 'Jumlah pengeluaran minimum sebelum sebaran proyek bisa dipakai',
    judul: 'Riwayat minimum untuk menilai pengeluaran',
    akibat:
      'Berapa catatan pengeluaran yang harus ada sebelum sebuah proyek bisa '
      + 'dinilai. Terlalu rendah, satu belanja besar membentuk sebarannya '
      + 'sendiri lalu tampak wajar. Proyek yang riwayatnya kurang dilaporkan '
      + 'sebagai tak-bisa-dinilai, bukan didiamkan.',
    satuan: 'catatan',
    langkah: 1,
  },
  /*
    Stok tercatat melenceng dari buku gerakannya. Bawaan selisih 1 satuan.

    Hampir NOL, sama alasannya dengan ambang selisih invoice: ini bukan batas
    kewajaran melainkan pengaman pembulatan. Stok yang tak cocok dengan buku
    gerakannya berarti salah satunya salah, dan besar-kecilnya selisih tak
    mengubah fakta itu.
  */
  'otomasi.stok_melenceng.satuan': {
    bawaan: 1,
    min: 1,
    max: 1000,
    label: 'Selisih satuan minimum antara stok tercatat dan buku gerakan',
    judul: 'Stok tercatat lawan buku gerakan',
    akibat:
      'Selisih sekecil ini pun ditegur. Angka stok dipakai memutuskan '
      + '"perlu pesan lagi atau tidak": kalau lebih kecil daripada '
      + 'kenyataan, material dipesan padahal menumpuk; kalau lebih besar, '
      + 'pekerjaan berhenti menunggu barang yang dikira ada.',
    satuan: 'satuan',
    langkah: 1,
  },
  /*
    Material dibeli dari beberapa pemasok. Bawaan selisih 5%.

    Rendah dengan sengaja: selisih 5% pada material curah adalah uang yang
    nyata, dan pertanyaannya ("kenapa dua harga?") murah untuk ditanyakan.
    Yang mahal justru tak pernah menanyakannya.
  */
  'otomasi.pemasok_terpencar.persen': {
    bawaan: 5,
    min: 1,
    max: 100,
    label: 'Selisih harga antar pemasok (%) yang mulai dipertanyakan',
    judul: 'Selisih harga antar pemasok',
    akibat:
      'Selisih harga sebesar ini mulai dipertanyakan. Rendah dengan '
      + 'sengaja: pertanyaannya murah ditanyakan, yang mahal justru tak '
      + 'pernah menanyakannya.',
    satuan: '%',
    langkah: 1,
  },
  /*
    Margin bocor. Bawaan 85% dari RAB.

    Persen, bukan selisih rupiah: proyek Rp 100 juta dan proyek Rp 10 miliar
    tak bisa dinilai dengan angka mutlak yang sama.

    Di bawah 100 dengan sengaja — peringatan yang baru datang saat anggaran
    sudah habis tak bisa ditindaklanjuti siapa pun. Yang bisa ditindaklanjuti
    adalah 15% terakhir.
  */
  'otomasi.margin_bocor.persen': {
    bawaan: 85,
    min: 50,
    max: 200,
    label: 'Persen serapan RAB oleh biaya nyata yang mulai diperingatkan',
    judul: 'Biaya nyata menyentuh RAB',
    akibat:
      'Peringatan datang saat biaya menyentuh persen ini dari RAB. Di '
      + 'atas 100 berarti peringatannya baru datang setelah anggaran '
      + 'habis, dan tak ada lagi yang bisa dilakukan.',
    satuan: '%',
    langkah: 5,
  },
  /*
    Pengeluaran kembar. Bawaan jarak 3 hari.

    PENDEK, dan itu yang memisahkannya dari 2.14. Sewa bulanan dari vendor
    yang sama dengan nominal yang sama juga "vendor + nominal identik
    berulang" — yang membedakannya cuma jarak hari. Nota yang diinput ulang
    datang dalam hitungan jam sampai hari; biaya tetap datang tiap 30 hari.
  */
  'otomasi.biaya_kembar.hari': {
    bawaan: 3,
    min: 0,
    max: 30,
    label: 'Jarak hari maksimum dua pengeluaran disebut kembar',
    judul: 'Jarak dua pengeluaran kembar',
    akibat:
      'Dua biaya dengan pemasok dan nominal sama dalam jarak ini '
      + 'dianggap kemungkinan nota ganda. Dilebarkan sampai sebulan, '
      + 'seluruh sewa dan langganan bulanan ikut tertuduh.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Pengeluaran berulang. Bawaan 3 bulan BERBEDA.

    Bulan berbeda, bukan jumlah baris: enam nota di bulan yang sama bukan
    biaya berulang, itu enam belanja. Yang menandakan langganan adalah
    kehadirannya di bulan demi bulan.
  */
  'otomasi.biaya_berulang.bulan': {
    bawaan: 3,
    min: 2,
    max: 24,
    label: 'Jumlah bulan berbeda sebelum pengeluaran disebut berulang',
    judul: 'Bulan sebelum disebut berulang',
    akibat:
      'Berapa bulan berbeda sebuah biaya harus muncul sebelum disebut '
      + 'langganan. Dua bulan bisa kebetulan; tiga sudah pola.',
    satuan: 'bulan',
    langkah: 1,
  },
  /*
    Izin proyek mendekati akhir. Bawaan 60 hari.

    Panjang, karena mengurus perpanjangan PBG atau izin lingkungan menuntut
    berkas, biaya, dan antrean di dinas — bukan sekadar memperbarui tanggal.
  */
  'otomasi.izin.hari': {
    bawaan: 60,
    min: 1,
    max: 365,
    label: 'Hari sebelum izin proyek habis mulai diperingatkan',
    judul: 'Izin proyek habis',
    akibat:
      'Berapa hari sebelum izin pemerintah habis mulai diingatkan. '
      + 'Mengurus perpanjangan PBG atau izin lingkungan menuntut berkas, '
      + 'biaya, dan antrean di dinas.',
    satuan: 'hari',
    langkah: 5,
  },
  /*
    Risiko lewat tenggat tinjau. Bawaan 14 hari — tenggang PENUH untuk skor
    terendah, dan menyusut sebanding skornya (rumusnya di rute).

    Risiko berskor 16 yang telat ditinjau seminggu berbeda jauh dari risiko
    berskor 2 yang telat sebulan. Ambang tunggal memaksa memilih satu di
    antara dua kesalahan.
  */
  'otomasi.risiko_tinjau.hari': {
    bawaan: 14,
    min: 0,
    max: 180,
    label: 'Tenggang hari sesudah tenggat tinjau risiko (menyusut menurut skor)',
    judul: 'Tenggang tinjau risiko',
    akibat:
      'Tenggang untuk risiko berskor paling rendah. Risiko berskor '
      + 'tinggi mendapat tenggang jauh lebih pendek secara otomatis, dan '
      + 'perbandingannya tak bisa disetel terbalik.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Skor risiko yang disebut "tinggi". Bawaan 12 dari maksimum 25.

    Dipakai dua kali: menentukan prioritas notifikasi, dan menentukan risiko
    mana yang ditegur karena belum PUNYA tenggat tinjau sama sekali.
  */
  'otomasi.risiko_tinjau.skor': {
    bawaan: 12,
    min: 1,
    max: 25,
    label: 'Skor risiko yang dianggap tinggi (dampak × kemungkinan, 1–25)',
    judul: 'Skor yang disebut risiko tinggi',
    akibat:
      'Skor (dampak dikali kemungkinan, 1 sampai 25) yang dianggap '
      + 'tinggi. Dipakai dua kali: menentukan prioritas pesan, dan '
      + 'menentukan risiko mana yang ditegur karena belum punya tenggat '
      + 'tinjau sama sekali.',
    satuan: 'skor',
    langkah: 1,
  },
  /*
    Insiden K3 belum ditutup. Bawaan 7 hari — ambang DASAR, bukan tunggal.

    Rutenya mengalikannya dengan pengali per jenis yang DIPAKU di kode:
    fatal ×0 (hari itu juga) · kecelakaan berat ×0,2 · pencemaran ×0,5 ·
    kecelakaan ringan ×1 · kerusakan properti ×1,5 · nyaris celaka ×2.

    Yang boleh disetel tenant hanya seberapa cepat mereka menuntut penutupan.
    Perbandingan ANTAR jenis tidak boleh ikut disetel — membuat kecelakaan
    berat bisa dikonfigurasi lebih longgar daripada nyaris-celaka adalah
    pilihan yang tak boleh tersedia di UI mana pun.
  */
  'otomasi.insiden_k3.hari': {
    bawaan: 7,
    min: 1,
    max: 90,
    label: 'Hari dasar sebelum insiden K3 yang belum ditutup ditegur',
    judul: 'Tenggang penutupan insiden K3',
    akibat:
      'Tenggang DASAR. Tiap jenis insiden mengalikannya sendiri: '
      + 'kecelakaan berat berbunyi jauh lebih cepat, nyaris-celaka jauh '
      + 'lebih lambat. Perbandingan antar jenis sengaja tak bisa disetel.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Audit mutu lewat jadwal. Bawaan 3 hari sesudah tanggal rencana.

    Pendek, karena audit yang lewat menahan pekerjaan lain: temuan yang belum
    dikeluarkan berarti pekerjaan berikutnya berjalan di atas mutu yang belum
    diperiksa.
  */
  'otomasi.audit_mutu.hari': {
    bawaan: 3,
    min: 1,
    max: 90,
    label: 'Hari sesudah tanggal rencana sebelum audit mutu ditegur',
    judul: 'Audit mutu lewat jadwal',
    akibat:
      'Berapa hari sesudah tanggal rencana sebelum audit mutu ditegur. '
      + 'Audit yang lewat menahan pekerjaan lain: mutu berikutnya '
      + 'berjalan di atas yang belum diperiksa.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Harga satuan RAB menyimpang antar proyek. Bawaan 1,3× (selisih 30%).

    DESIMAL, dan itu penting: `jepit()` hanya membulatkan bila min DAN max
    keduanya bilangan bulat. Min 1.05 menjaga nilai pecahan tetap utuh —
    cacat yang sudah terjadi sekali, ketika ambang 0,75 diam-diam jadi 0.
  */
  'otomasi.rab_anomali.rasio': {
    bawaan: 1.3,
    min: 1.05,
    max: 5,
    label: 'Selisih harga satuan antar proyek yang mulai dipertanyakan (×)',
    judul: 'Selisih harga satuan antar proyek',
    akibat:
      'Berapa kali lipat selisih harga satuan yang mulai dipertanyakan. '
      + 'Nilai 1,3 berarti selisih 30 persen. Item borongan tak pernah '
      + 'dibandingkan, karena harganya memang menskala dengan besar '
      + 'proyek.',
    satuan: 'kali lipat',
    langkah: 0.05,
  },
  /*
    Laporan upah menyimpang. Bawaan 1,5× dari median lingkupnya sendiri.

    Berlaku DUA ARAH: 1,5× ke atas dan 1/1,5 ke bawah. Upah yang tiba-tiba
    separuh biasanya berarti pekerjaan berhenti — kabar yang sama pentingnya
    dengan upah yang tiba-tiba dobel.
  */
  'otomasi.upah_anomali.rasio': {
    bawaan: 1.5,
    min: 1.1,
    max: 5,
    label: 'Selisih upah mingguan dari kebiasaannya yang mulai diperiksa (×)',
    judul: 'Selisih upah dari kebiasaannya',
    akibat:
      'Berapa kali lipat upah mingguan boleh berbeda dari kebiasaan '
      + 'lingkup kerja itu sendiri. Berlaku dua arah: upah yang tiba-tiba '
      + 'separuh biasanya berarti pekerjaan berhenti.',
    satuan: 'kali lipat',
    langkah: 0.1,
  },
  /*
    Minggu riwayat minimum sebelum sebuah lingkup bisa dinilai. Bawaan 3.

    Satu minggu pembanding bukan kebiasaan, itu satu titik. Yang riwayatnya
    di bawah ini DILAPORKAN sebagai tak-bisa-dinilai, bukan dilewati diam.
  */
  'otomasi.upah_anomali.riwayat': {
    bawaan: 3,
    min: 1,
    max: 26,
    label: 'Minggu riwayat minimum sebelum upah bisa dibandingkan',
    judul: 'Riwayat minimum untuk menilai upah',
    akibat:
      'Berapa minggu riwayat yang harus ada sebelum sebuah lingkup bisa '
      + 'dinilai. Satu minggu pembanding bukan kebiasaan, itu satu titik. '
      + 'Yang riwayatnya kurang dilaporkan sebagai tak-bisa-dinilai, '
      + 'bukan didiamkan.',
    satuan: 'minggu',
    langkah: 1,
  },
  /*
    Kontrak klien mendekati akhir. Bawaan 60 hari, DUA ARAH.

    Sisi lampaunya disengaja: proyek yang baru selesai bulan lalu bukan
    peluang yang lebih kecil, melainkan lebih matang.
  */
  'otomasi.kontrak_klien.hari': {
    bawaan: 60,
    min: 7,
    max: 365,
    label: 'Jendela hari sebelum/sesudah proyek berakhir untuk menyapa klien',
    judul: 'Jendela menyapa klien',
    akibat:
      'Berapa hari sebelum DAN sesudah proyek berakhir klien layak '
      + 'disapa untuk pekerjaan berikutnya. Sisi sesudahnya disengaja: '
      + 'proyek yang baru selesai bukan peluang yang lebih kecil, '
      + 'melainkan lebih matang.',
    satuan: 'hari',
    langkah: 5,
  },
  /*
    Buku penyusutan belum ditutup. Bawaan tanggal 5.

    Yang diukur BUKAN "sudah tanggal berapa" melainkan "bulan lalu sudah
    lewat berapa lama tanpa ditutup". Menegur pada tanggal 1 adalah menegur
    orang yang memang belum sempat — penutupan buku butuh beberapa hari kerja.

    Diukur 2026-08-16: 14 dari 18 aset dalam masa manfaat belum punya baris
    penyusutan untuk periode 2026-07.
  */
  'otomasi.penyusutan_tutup.tanggal': {
    bawaan: 5,
    min: 1,
    max: 28,
    label: 'Tanggal berapa buku penyusutan bulan lalu mulai ditagih',
    judul: 'Tanggal menagih tutup buku penyusutan',
    akibat:
      'Tanggal berapa tiap bulan buku penyusutan bulan lalu mulai '
      + 'ditagih. Menagih pada tanggal 1 adalah menagih orang yang memang '
      + 'belum sempat.',
    satuan: 'tanggal',
    langkah: 1,
  },
  /*
    Perawatan & sertifikasi alat. Bawaan 14 hari sebelum jatuh tempo.

    Bukan hari-H: mendatangkan mekanik dan mengurus perpanjangan sertifikat
    Depnaker butuh antrean. Sertifikat yang kedaluwarsa membuat alatnya
    ILEGAL dipakai, bukan sekadar kurang terawat — dan itu risiko yang
    ditanggung proyek, bukan bengkel.
  */
  /*
    10.2 Predictive Maintenance. TERPISAH dari `perawatan_alat.hari` di bawah,
    dan itu keputusan sadar.

    `perawatan_alat.hari` menjawab "berapa hari sebelum tanggal jatuh tempo".
    Ambang ini menjawab pertanyaan LAIN: "berapa hari sebelum jam servis
    diperkirakan TERCAPAI menurut laju pemakaian". Angkanya boleh jauh lebih
    besar, karena inilah satu-satunya peringatan dini yang jalur jam punya —
    tanpa laju, jalur jam baru bersuara sesudah terlambat.
  */
  'otomasi.perawatan_prediksi.hari': {
    bawaan: 21,
    min: 3,
    max: 120,
    label: 'Hari sebelum jam servis diperkirakan tercapai',
    judul: 'Perkiraan perawatan dari laju pemakaian',
    akibat:
      'Alat yang jam servisnya masih jauh tetap diingatkan bila laju '
      + 'pemakaiannya membuat jatuh tempo tiba dalam sekian hari. Diukur pada '
      + 'data nyata: satu truk mixer memakai 6,7 jam/hari dengan sisa 190 jam '
      + '— jatuh tempo 28 hari lagi, dan tanpa ambang ini tak ada peringatan '
      + 'sama sekali sampai hari H. Memesan bengkel butuh antrean.',
    satuan: 'hari',
    langkah: 1,
  },

  /*
    Berapa pembacaan meter minimum sebelum lajunya dipercaya.

    Dua titik cukup secara matematika tetapi rapuh: satu hari kerja lembur
    membuat laju terlihat dua kali lipat, dan seluruh perkiraan ikut meleset.
    Nilainya sengaja bisa disetel — perusahaan yang mencatat meter tiap hari
    bisa menurunkannya, yang mencatat mingguan perlu menaikkannya.
  */
  'otomasi.perawatan_prediksi.min_pembacaan': {
    bawaan: 3,
    min: 2,
    max: 20,
    label: 'Pembacaan jam-meter minimum sebelum laju dipercaya',
    judul: 'Perkiraan perawatan dari laju pemakaian',
    akibat:
      'Makin kecil, makin cepat alat baru ikut diperkirakan — tetapi '
      + 'perkiraannya makin mudah meleset karena satu hari lembur. Alat yang '
      + 'pembacaannya kurang dari angka ini dilewati, bukan ditebak.',
    satuan: 'pembacaan',
    langkah: 1,
  },

  'otomasi.perawatan_alat.hari': {
    bawaan: 14,
    min: 1,
    max: 90,
    label: 'Hari sebelum jatuh tempo perawatan/sertifikasi alat diperingatkan',
    judul: 'Perawatan dan sertifikasi alat',
    akibat:
      'Berapa hari sebelum jatuh tempo servis atau sertifikat alat '
      + 'diingatkan. Mendatangkan mekanik dan mengurus sertifikat '
      + 'Depnaker butuh antrean.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Mandor dipegang dua proyek sekaligus. Bawaan tumpang tindih 14 hari.

    Serah-terima beberapa hari antar proyek itu NORMAL di lapangan — mandor
    menuntaskan pekerjaan terakhir sambil memulai yang baru. Yang tak normal
    adalah tumpang tindih berbulan-bulan.

    Diukur 2026-08-16: seluruh 21 pasangan yang tumpang tindih berdurasi
    minimal 32 hari, jadi ambang 14 tak menyaring apa pun HARI INI. Ia ada
    untuk data yang akan datang, dan itu dinyatakan supaya tak seorang pun
    menyimpulkan ambangnya sudah teruji menyaring.
  */
  'otomasi.konflik_mandor.hari': {
    bawaan: 14,
    min: 1,
    max: 180,
    label: 'Hari tumpang tindih minimum sebelum mandor dianggap bentrok',
    judul: 'Tumpang tindih mandor',
    akibat:
      'Berapa hari tumpang tindih sebelum mandor disebut bentrok. '
      + 'Serah-terima beberapa hari antar proyek itu normal di lapangan; '
      + 'yang tak normal berbulan-bulan.',
    satuan: 'hari',
    langkah: 1,
  },
  /*
    Ringkasan aksi berisiko harian. Ambang ledakan aksi per pengguna per jam.

    Bawaan 300 — diukur dari sebaran nyata: 188 bucket (pengguna×jam) dalam 7
    hari, 67 di atas 100, 24 di atas 500, puncak 2.151. Ambang 100 memicu
    belasan tiap hari; 300 menyisakan yang benar-benar menonjol.
  */
  'otomasi.audit_ledakan.per_jam': {
    bawaan: 300,
    min: 20,
    max: 5000,
    label: 'Aksi per pengguna per jam yang dianggap ledakan',
    judul: 'Ledakan aktivitas per jam',
    akibat:
      'Berapa aksi dalam satu jam oleh satu orang yang dianggap tak '
      + 'wajar. Terlalu rendah, impor data biasa ikut berbunyi.',
    satuan: 'aksi per jam',
    langkah: 25,
  },
  /*
    Klaster penghapusan: berapa baris dihapus satu pengguna pada satu tabel
    dalam sehari sebelum ditandai. Bawaan 20 — terukur 2 pasangan memicu hari
    ini, sementara ambang 10 memicu 8.
  */
  'otomasi.audit_hapus.klaster': {
    bawaan: 20,
    min: 3,
    max: 500,
    label: 'Jumlah penghapusan sepihak sebelum ditandai',
    judul: 'Penghapusan berklaster',
    akibat:
      'Berapa penghapusan oleh satu orang di satu tabel sebelum '
      + 'ditandai. Pembersihan data yang sah bisa menyentuh puluhan '
      + 'baris; angka ini memisahkannya dari penghapusan yang perlu '
      + 'ditanyakan.',
    satuan: 'baris',
    langkah: 5,
  },
  /*
    Kontrak payung. Bawaan 45 hari — lebih panjang daripada dokumen lain
    karena memperbaruinya menuntut negosiasi ulang dengan pemasok, bukan
    sekadar memperpanjang berkas.
  */
  'otomasi.kontrak_payung.hari': {
    bawaan: 45,
    min: 1,
    max: 180,
    label: 'Hari sebelum kontrak payung habis mulai diperingatkan',
    judul: 'Kontrak payung pemasok habis',
    akibat:
      'Berapa hari sebelum kontrak payung habis mulai diingatkan. Lebih '
      + 'panjang daripada dokumen lain karena memperbaruinya menuntut '
      + 'negosiasi ulang, bukan sekadar memperpanjang berkas.',
    satuan: 'hari',
    langkah: 5,
  },
  'otomasi.evm_spi.minimum': {
    bawaan: 0.9,
    min: 0.1,
    max: 1,
    label: 'Batas bawah indeks jadwal (SPI) — di bawah ini proyek tertinggal',
    judul: 'Batas bawah indeks jadwal (SPI)',
    akibat:
      'Di bawah angka ini proyek dianggap tertinggal dari jadwal. Nilai '
      + '1,0 berarti tepat sesuai rencana.',
    satuan: 'indeks',
    langkah: 0.05,
  },
  'otomasi.evm_cpi.minimum': {
    bawaan: 0.9,
    min: 0.1,
    max: 1,
    label: 'Batas bawah indeks biaya (CPI) — di bawah ini proyek boros',
    judul: 'Batas bawah indeks biaya (CPI)',
    akibat:
      'Di bawah angka ini proyek dianggap boros terhadap anggarannya. '
      + 'Nilai 1,0 berarti tepat sesuai rencana.',
    satuan: 'indeks',
    langkah: 0.05,
  },
} as const

export type KunciAmbang = keyof typeof AMBANG_OTOMASI

/**
 * Batasi ke rentang waras — angka di luar itu dipangkas, bukan ditolak.
 *
 * ── Kenapa `Math.trunc` HANYA untuk ambang bilangan bulat
 *
 * Bentuk pertama fungsi ini memotong SEMUA nilai dengan `Math.trunc`. Itu
 * benar selama seluruh ambang bilangan bulat (hari, rupiah, persen), dan
 * memang begitu sampai 2026-08-16.
 *
 * Kedua ambang EVM desimal (SPI/CPI, bawaan 0.9), dan `Math.trunc(0.75)`
 * menghasilkan **0** — lalu dijepit naik ke `min`. Jadi bukan sekadar
 * kehilangan ketelitian: ambang 0.75 diam-diam berubah jadi 0.1, dan otomasi
 * yang seharusnya menegur proyek di bawah 0.75 praktis tak pernah menegur
 * siapa pun. Nol notifikasi terlihat persis seperti "semua proyek sehat".
 *
 * Ditemukan test, bukan pembacaan kode — saya menulis komentar di
 * `AMBANG_OTOMASI` yang menyatakan "ambilAmbang tak membulatkan (diperiksa)",
 * dan pemeriksaan itu keliru.
 *
 * Sekarang pemotongan mengikuti BENTUK AMBANGNYA: bulat kalau bawaan dan
 * batasnya bulat, apa adanya kalau ada yang desimal. Ambang hari yang diberi
 * "7.9" tetap jadi 7 seperti sebelumnya.
 */
function jepit(n: number, min: number, max: number): number {
  const bulat = Number.isInteger(min) && Number.isInteger(max)
  return Math.min(Math.max(bulat ? Math.trunc(n) : n, min), max)
}

/**
 * Ambil ambang yang BERLAKU untuk tenant ini.
 *
 * Urutan: query (`?ambang=`) → `company_settings` → bawaan katalog.
 *
 * Query menang atas pengaturan karena ia dipakai untuk pengujian dan untuk
 * penjadwal yang sengaja memakai angka berbeda pada satu jalannya — bukan
 * untuk mengubah kebijakan. Kebijakan tetap di pengaturan.
 *
 * ⚠ Kegagalan baca TIDAK dilempar. Otomasi yang mati karena tabel pengaturan
 * sedang tak terbaca lebih merugikan daripada otomasi yang jalan dengan
 * bawaan — dan bawaannya sendiri sudah dipilih aman. Tetapi ia DICATAT, supaya
 * "kenapa ambangnya tidak terpakai" punya jejak.
 */
export async function ambilAmbang(
  request: FastifyRequest,
  kunci: KunciAmbang,
  dariQuery?: unknown,
): Promise<number> {
  const meta = AMBANG_OTOMASI[kunci]

  // 1. Query — menang, dan sengaja tak menyentuh basis.
  if (dariQuery !== undefined && dariQuery !== null && dariQuery !== '') {
    const n = Number(dariQuery)
    if (Number.isFinite(n)) return jepit(n, meta.min, meta.max)
  }

  // 2. Pengaturan tenant.
  const { data, error } = await request.db!
    .from('company_settings')
    .select('value')
    .eq('key', kunci)
    .maybeSingle()

  if (error) {
    request.log.warn(
      { err: error, kunci },
      'ambang otomasi: gagal baca company_settings — memakai bawaan',
    )
    return meta.bawaan
  }

  if (data) {
    const n = Number((data as { value?: unknown }).value)
    if (Number.isFinite(n)) return jepit(n, meta.min, meta.max)
    request.log.warn(
      { kunci, nilai: (data as { value?: unknown }).value },
      'ambang otomasi: nilai di company_settings bukan angka — memakai bawaan',
    )
  }

  // 3. Bawaan.
  return meta.bawaan
}

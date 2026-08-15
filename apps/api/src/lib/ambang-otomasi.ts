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
  },
  'otomasi.saldo_menipis.rupiah': {
    bawaan: 5_000_000,
    min: 0,
    max: 1_000_000_000,
    label: 'Saldo kas minimum sebelum diperingatkan',
  },
  'otomasi.milestone_berisiko.hari': {
    bawaan: 7,
    min: 1,
    max: 60,
    label: 'Hari sebelum tenggat milestone mulai ditegur',
  },
  'otomasi.hutang_supplier.hari': {
    bawaan: 7,
    min: 0,
    max: 60,
    label: 'Hari sebelum jatuh tempo hutang supplier ditegur',
  },
  'otomasi.harga_material.persen': {
    bawaan: 10,
    min: 1,
    max: 100,
    label: 'Kenaikan harga material yang dianggap signifikan (%)',
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
  },
  /*
    Perawatan & sertifikasi alat. Bawaan 14 hari sebelum jatuh tempo.

    Bukan hari-H: mendatangkan mekanik dan mengurus perpanjangan sertifikat
    Depnaker butuh antrean. Sertifikat yang kedaluwarsa membuat alatnya
    ILEGAL dipakai, bukan sekadar kurang terawat — dan itu risiko yang
    ditanggung proyek, bukan bengkel.
  */
  'otomasi.perawatan_alat.hari': {
    bawaan: 14,
    min: 1,
    max: 90,
    label: 'Hari sebelum jatuh tempo perawatan/sertifikasi alat diperingatkan',
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
  },
  'otomasi.evm_spi.minimum': {
    bawaan: 0.9,
    min: 0.1,
    max: 1,
    label: 'Batas bawah indeks jadwal (SPI) — di bawah ini proyek tertinggal',
  },
  'otomasi.evm_cpi.minimum': {
    bawaan: 0.9,
    min: 0.1,
    max: 1,
    label: 'Batas bawah indeks biaya (CPI) — di bawah ini proyek boros',
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

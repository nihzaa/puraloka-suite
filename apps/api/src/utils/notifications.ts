import { supabase } from './supabase.js'
import { terbitkanPeristiwa } from './terbit-peristiwa.js'
import { sendWebPushToUsers } from './webpush.js'
import { kirimPushNatifKeUsers } from './push-natif.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'kasbon_pending'
  | 'kasbon_submitted'
  | 'kasbon_approved'
  | 'kasbon_rejected'
  | 'invoice_created'
  | 'invoice_due'
  | 'invoice_overdue'
  | 'invoice_paid'
  | 'milestone_approaching'
  | 'milestone_overdue'
  | 'milestone_completed'
  | 'progress_submitted'
  | 'project_assigned'
  | 'project_status_changed'
  | 'wage_report_submitted'
  | 'change_order_submitted'
  | 'change_order_approved'
  | 'change_order_rejected'
  // Punch List (migrasi 156). Tiga tipe, bukan satu `punch_item`: penerima dan
  // urgensinya berbeda — yang ditugaskan perlu tahu SEGERA ada cacat atas
  // namanya, penemunya perlu tahu perkaranya sudah selesai atau dianggap tak
  // berlaku. Satu tipe generik membuat ketiganya tak bisa disaring terpisah,
  // dan pengaturan notifikasi per-jenis jadi mustahil.
  | 'punch_assigned'
  | 'punch_closed'
  | 'punch_rejected'
  // NCR (migrasi 189). Tiga tipe, bukan satu, dengan alasan yang sama seperti
  // punch: penerimanya berbeda dan urgensinya berbeda.
  //
  // `ncr_disposisi` dipisah karena ia keputusan berkonsekuensi biaya —
  // "terima apa adanya" berarti perusahaan menanggung ketidaksesuaian, dan
  // orang yang melaporkannya berhak tahu keputusan itu diambil.
  | 'ncr_assigned'
  | 'ncr_disposisi'
  | 'ncr_status'
  // Request for Inspection (migrasi 157). Terpisah dari punch karena
  // penerimanya berbeda: permintaan pergi ke yang berwenang memeriksa,
  // hasilnya kembali ke pemohon.
  | 'inspeksi_diminta'
  | 'inspeksi_lolos'
  | 'inspeksi_gagal'
  // Otomasi terjadwal (migrasi 331). Tipe SENDIRI, bukan menumpang
  // `kasbon_pending`, dan itu bukan soal kerapian:
  //
  // 1. Dedup harian di `otomasi-terjadwal.ts` menyaring `.eq('type', …)`.
  //    Menulis notifikasi ber-`kasbon_pending` lalu mencari
  //    `kasbon_outstanding` membuat dedup TAK PERNAH cocok — dan penjadwal
  //    mengirim ulang tiap 15 menit. Cacat ini nyata: ia lolos review dan
  //    baru ketahuan saat test dedup merah (141 notifikasi di panggilan kedua).
  //
  // 2. `kasbon_pending` sudah dipakai `check-deadlines` untuk kasbon yang
  //    MENUNGGU PERSETUJUAN. Yang di sini sudah disetujui tapi uangnya belum
  //    kembali — peristiwa berbeda, penerima berbeda, tindakan berbeda.
  //    Menyatukannya membuat pengaturan notifikasi per-jenis mustahil.
  | 'kasbon_outstanding'
  | 'worker_kasbon_reminder'
  | 'progress_belum_lapor'
  | 'gantt_dep_breach'
  // 4.10 — PO/GR tak cocok. Tipe sendiri karena penerimanya tim pengadaan,
  // bukan PM proyek, dan tindakannya memeriksa gudang bukan menata jadwal.
  | 'gr_tak_cocok'
  // 3.5 — stok di bawah ambang pesan-ulang.
  | 'stok_menipis'
  // 2.11 — saldo rekening kas di bawah ambang aman. Tipe sendiri karena
  // penerimanya pemegang `cash:manage` lintas proyek, dan rekening kas
  // memang tak terikat proyek mana pun.
  | 'saldo_menipis'
  // 2.2 — tagihan supplier mendekati/melewati jatuh tempo. Dibedakan dari
  // `invoice_overdue`: arah uangnya TERBALIK (yang ini kita yang bayar), dan
  // terlambat membayar merusak hubungan dagang — tak ada yang bisa dilakukan
  // sesudahnya kecuali meminta maaf.
  | 'hutang_supplier_jatuh_tempo'
  // 4.9 — harga aktif sebuah material naik signifikan dibanding sebelumnya.
  | 'harga_material_naik'
  // 3.18 — indeks jadwal (SPI) atau indeks biaya (CPI) proyek turun di bawah
  // ambang. SATU jenis untuk keduanya, bukan dua: yang menerima pesan ini
  // membuka proyek yang sama dan melihat kedua angka bersamaan, dan dua jenis
  // terpisah akan mengirim dua pesan untuk satu proyek yang sama di hari yang
  // sama — dedup harian bekerja per (jenis, record), jadi ia tak akan
  // menahannya.
  | 'evm_kinerja_menurun'
  // 5.7 — polis asuransi mendekati akhir masa berlaku atau sudah lewat.
  | 'polis_segera_berakhir'
  // 9.2 — proyek berjalan tanpa satu polis pun. TERPISAH dari yang di atas:
  // "polis berakhir" diperpanjang, "tak ada polis" diasuransikan — tindakan
  // yang berbeda, dan menyamakan jenisnya membuat dedup harian menahan salah
  // satunya secara keliru.
  | 'proyek_tanpa_asuransi'
  // 5.11 — transmittal sudah terkirim tetapi tak pernah dikonfirmasi diterima.
  // Gambar revisi terakhir yang tak sampai tak memunculkan galat apa pun;
  // pekerjaan berjalan dengan gambar lama, dan selisihnya baru terlihat di
  // lapangan.
  | 'transmittal_menggantung'
  // 6.9 — sertifikat pegawai mendekati/melewati masa berlaku.
  | 'sertifikat_berakhir'
  /*
    9.8 — TIGA jenis, bukan satu "skor K3".

    Bukan soal kerapian: dedup harian bekerja per (jenis, record). Satu jenis
    untuk ketiganya membuat dua di antaranya tertahan keliru pada hari yang
    sama, padahal tindakannya berbeda — menutup temuan, menyelidiki
    pengulangannya, dan menginduksi pekerja adalah tiga pekerjaan.
  */
  | 'k3_temuan_berat_menggantung'
  | 'k3_temuan_berulang'
  | 'k3_induksi_kedaluwarsa'
  // 9.1 — DUA jenis, karena tindakannya berbeda: dokumen PIHAK diperpanjang,
  // izin PROYEK menghentikan pekerjaan kalau `menghalangi_mulai`.
  | 'kepatuhan_dokumen'
  | 'izin_proyek_habis'
  // 2.9 — serapan anggaran proyek melampaui ambang.
  | 'serapan_anggaran'
  // 6.3 — lingkup kerja yang absensinya berhenti dicatat. Peringatan
  // OPERASIONAL kepada pengurus mandor, bukan tuduhan kepada pekerja.
  | 'absensi_berhenti'
  // 3.6 — subkontraktor yang menurut evaluasi terakhir tak boleh dipakai.
  | 'subkon_tak_layak'
  // 2.3 — uang retensi tertahan pada pekerjaan yang sudah lewat waktunya.
  | 'retensi_tertahan'
  // 5.12' — ringkasan aksi berisiko harian dari jejak audit. Tanda kutip
  // pada nomornya disengaja: 5.12 ASLI ("akses dokumen sensitif") mustahil
  // hari ini — `documents` dan `document_access_logs` sama-sama nol baris.
  | 'audit_aksi_berisiko'
  // Kontrak payung (blanket order) yang mendekati akhir masa berlaku.
  // TANPA nomor katalog — lihat komentar rutenya.
  | 'kontrak_payung_habis'
  | 'penyusutan_belum_dihitung'
  | 'penyusutan_belum_dijurnal'
  | 'perawatan_alat_jatuh_tempo'
  | 'alat_tanpa_jadwal_perawatan'
  // 10.2 Predictive Maintenance. `perawatan_diprediksi` memperingatkan
  // SEBELUM jam servis tercapai, memakai laju pemakaian terukur;
  // `alat_jam_tanpa_meter` menandai jadwal berbasis jam pada alat yang
  // jam-meternya tak pernah dicatat - jadwal yang tak akan pernah bisa
  // jatuh tempo, dan kerusakannya tak punya gejala apa pun.
  | 'perawatan_diprediksi'
  | 'alat_jam_tanpa_meter'
  // 2.12 Payment Timing. POLA lintas-invoice per klien, bukan satu tagihan
  // telat - tindakannya menaikkan uang muka, bukan menagih.
  | 'kebiasaan_bayar_klien'
  // 1.14 Weekly Digest. SATU pengirim ringkasan, bukan tiga - 8.11 dan 8.12
  // sengaja tidak dibangun; alasannya di rute `ringkasan-mingguan`.
  | 'ringkasan_mingguan'
  // 3.4 Material Consumption. Kekurangan terhadap RENCANA pada progres
  // sekarang - terlihat berminggu-minggu sebelum stok fisik menipis.
  | 'material_kurang'
  // 10.6 Maintenance Cost Trend. Alat yang mulai lebih sering RUSAK
  // daripada dirawat - tindakannya mengganti/menyewa, bukan menjadwalkan.
  | 'alat_tak_sehat'
  // 9.2 Insurance Coverage Gap. Termasuk celah yang TAK terlihat oleh
  // hitungan biasa: proyek ber-polis AKTIF yang jenisnya tak menanggung
  // pekerjaannya sendiri (TPL saja).
  | 'celah_asuransi'
  // TANPA NOMOR. Klien yang lama tak dikabari - BUKAN `progres-belum-lapor`
  // (3.11) yang menegur MANDOR soal disiplin catat. Ini soal hubungan
  // klien, dan tindakannya menelepon.
  | 'klien_didiamkan'
  // 10.4 Fleet Fuel Anomaly. LITER per jam operasi, bukan rupiah per
  // pengisian - rupiah tak bisa membedakan boros dari harga solak naik.
  | 'bbm_melonjak'
  // TANPA NOMOR. Uji material yang GAGAL tanpa NCR, atau yang hasilnya tak
  // pernah disimpulkan - yang kedua tak terhitung 'gagal' di laporan mana pun.
  | 'uji_material_gagal'
  // TANPA NOMOR. Barang yang sudah di-PO tetapi tak pernah sampai. Seluruh
  // otomasi pengadaan lain berhenti begitu PO terbit; `expediting` mencatat
  // apa yang terjadi SESUDAHNYA, dan tak satu pun otomasi membacanya.
  | 'barang_tertahan'
  // TANPA NOMOR. Klaim yang berhenti bergerak. Berbeda dari semua otomasi
  // lain di sini: sengketa tidak MEMBURUK bila didiamkan, ia KEDALUWARSA -
  // klaim yang benar isinya bisa gugur karena tenggat, tanpa gejala apa pun.
  | 'sengketa_menggantung'
  /*
    TUJUH JENIS BERTENGGAT — satu bentuk logika (`lib/tenggat-terlewat.ts`),
    tujuh tabel, dan TUJUH jenis notifikasi terpisah.

    Sengaja tidak digabung jadi satu jenis "tenggat_terlewat" berparameter.
    Alasannya dedup: `pembuatDedup` menahan kembar per (type, record_id), dan
    id dari tujuh tabel berbeda bisa saja sama. Lebih penting lagi, aturan
    penerima di `notification_rules` dikunci per `event_type` — satu jenis
    bersama berarti temuan K3 dan RFQ terkirim ke orang yang sama.
  */
  | 'punch_lewat_target'
  | 'ncr_lewat_target'
  | 'inspeksi_terlewat'
  | 'mitigasi_lewat_tenggat'
  | 'notulen_tak_ditindak'
  | 'temuan_k3_lewat_tenggat'
  | 'rfq_lewat_batas'
  | 'konflik_mandor'
  | 'rab_harga_menyimpang'
  | 'upah_menyimpang'
  | 'kontrak_klien_berakhir'
  | 'insiden_k3_menggantung'
  | 'insiden_k3_tanpa_tindakan'
  | 'stok_di_bawah_minimum'
  | 'material_tanpa_batas_minimum'
  | 'audit_mutu_lewat_jadwal'
  | 'rencana_mutu_belum_disetujui'
  | 'izin_proyek_kedaluwarsa'
  | 'izin_penghalang_belum_terbit'
  | 'izin_kerja_kedaluwarsa'
  | 'risiko_lewat_tinjau'
  | 'risiko_tinggi_tanpa_tenggat'
  | 'biaya_kembar'
  | 'biaya_berulang'
  | 'margin_rab_lampaui_kontrak'
  | 'margin_biaya_lampaui_rab'
  | 'proyek_tanpa_rab'
  | 'pemasok_terpencar'
  | 'invoice_ringkasan_melenceng'
  | 'invoice_status_melenceng'
  | 'kesiapan_audit'
  | 'opname_menggantung'
  | 'opname_disengketakan'
  | 'stok_melenceng'
  | 'stok_susut_berulang'
  | 'biaya_pencilan'
  | 'proyeksi_selesai_meleset'
  | 'progres_mandek'
  | 'po_luar_kontrak'
  | 'kuota_payung_menipis'
  | 'pengingat_asisten'
  | 'titipan_asisten'
  | 'general'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface NotificationParams {
  // ── `company_id` WAJIB, dan sengaja tidak opsional ────────────────────────
  //
  // Sampai 2026-08-03 kolom ini tidak ada di sini sama sekali: notifikasi
  // di-insert TANPA `company_id`, dan hanya berfungsi karena fallback
  // satu-tenant di `fn_isi_company_id()` — trigger yang mengisi otomatis
  // SELAMA `companies` berisi tepat satu baris, lalu berhenti mengisi begitu
  // ambigu (perilaku yang benar, migrasi 127).
  //
  // Artinya: pada hari perusahaan kedua lahir, SETIAP notifikasi akan ditolak
  // `NOT NULL` — dan kalau trigger itu dilonggarkan supaya "jalan", notifikasi
  // akan diam-diam masuk ke perusahaan yang salah. Ditemukan saat menaikkan
  // shard CI ke 6 (F0-16), bukan lewat review.
  //
  // Kenapa WAJIB (bukan `?:` dengan default): satu user bisa jadi anggota
  // beberapa perusahaan (ADR-011 D5), jadi `company_id` TIDAK bisa diturunkan
  // dari penerimanya. Ia harus datang dari PERISTIWA yang melahirkan
  // notifikasi itu — kasbon milik perusahaan mana, approval di perusahaan mana.
  // Membuatnya opsional berarti menyerahkan keputusan itu ke nilai default,
  // dan default apa pun akan salah untuk sebagian kasus.
  //
  // Dengan tipe wajib, TypeScript yang menemukan setiap pemanggil yang lupa —
  // bukan produksi.
  company_id: string

  user_id: string
  title: string
  message: string
  type: NotificationType
  priority?: NotificationPriority
  project_id?: string
  action_url?: string
  action_type?: string
  action_data?: Record<string, unknown>
}

// ── Single notification insert ─────────────────────────────────────────────────

export async function createNotification(params: NotificationParams): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    company_id:  params.company_id,
    user_id:     params.user_id,
    title:       params.title,
    message:     params.message,
    type:        params.type,
    priority:    params.priority ?? 'normal',
    project_id:  params.project_id ?? null,
    action_url:  params.action_url ?? null,
    action_type: params.action_type ?? null,
    action_data: params.action_data ?? null,
    channel:     'push',
    is_read:     false,
    is_actioned: false,
    sent_at:     new Date().toISOString(),
  })

  if (error) {
    // Non-fatal: log but never throw — notifications should never break the main flow
    console.error('[notifications] createNotification error:', error.message)
    return   // gagal simpan → jangan kirim push untuk notifikasi yang tak ada
  }

  void kirimPush([params.user_id], params)
}

// ── Batch insert ──────────────────────────────────────────────────────────────

export async function createNotifications(list: NotificationParams[]): Promise<void> {
  if (list.length === 0) return

  const rows = list.map(params => ({
    company_id:  params.company_id,
    user_id:     params.user_id,
    title:       params.title,
    message:     params.message,
    type:        params.type,
    priority:    params.priority ?? 'normal',
    project_id:  params.project_id ?? null,
    action_url:  params.action_url ?? null,
    action_type: params.action_type ?? null,
    action_data: params.action_data ?? null,
    channel:     'push',
    is_read:     false,
    is_actioned: false,
    sent_at:     new Date().toISOString(),
  }))

  const { error } = await supabase.from('notifications').insert(rows)

  if (error) {
    console.error('[notifications] createNotifications batch error:', error.message)
    return   // gagal simpan → jangan kirim push untuk notifikasi yang tak ada
  }

  // Push dikelompokkan per ISI, bukan per penerima: satu kejadian biasanya
  // menghasilkan pesan yang sama untuk banyak orang (mis. "kasbon menunggu
  // persetujuan" ke seluruh admin). Mengirim per-baris berarti N query ke
  // `users` untuk payload yang identik.
  const perPesan = new Map<string, { p: NotificationParams; ids: string[] }>()
  for (const p of list) {
    const kunci = `${p.title}\u0000${p.message}\u0000${p.action_url ?? ''}`
    const ada = perPesan.get(kunci)
    if (ada) ada.ids.push(p.user_id)
    else perPesan.set(kunci, { p, ids: [p.user_id] })
  }
  for (const { p, ids } of perPesan.values()) void kirimPush(ids, p)

  /*
    ── Terbitkan ke otomasi (2026-08-14)

    Enam alur berpemicu webhook di `otomasi_alur` tak pernah terpasang karena
    tak ada yang memanggil webhooknya. Peristiwanya sendiri sudah ada — semua
    lewat fungsi INI.

    Dipanggil SESUDAH `insert` berhasil (fungsi ini sudah `return` lebih dulu
    kalau simpan gagal): mengabarkan peristiwa yang tak tercatat di mana pun
    akan membuat n8n mengirim WhatsApp untuk sesuatu yang tak pernah terjadi.

    `void`, seperti `kirimPush` di atasnya — otomasi tak boleh menahan atau
    menjatuhkan tindakan yang sudah sah. Errornya dicatat di dalam, tidak
    ditelan.

    Satu terbitan per (company, jenis), bukan per penerima: satu kasbon
    diajukan adalah SATU peristiwa, sekalipun lima orang dikabari. Tanpa
    pengelompokan ini, satu kasbon memicu lima pesan WhatsApp yang sama.
  */
  const perPeristiwa = new Map<string, { p: NotificationParams; n: number }>()
  for (const p of list) {
    const kunci = `${p.company_id} ${p.type}`
    const ada = perPeristiwa.get(kunci)
    if (ada) ada.n += 1
    else perPeristiwa.set(kunci, { p, n: 1 })
  }
  for (const { p, n } of perPeristiwa.values()) {
    void terbitkanPeristiwa(p.company_id, p.type, p, n)
  }
}

/**
 * Kirim Web Push untuk notifikasi yang BARU TERSIMPAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BARU ADA SEKARANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `utils/webpush.ts` sudah lengkap sejak lama — VAPID terkonfigurasi, endpoint
 * subscribe hidup, service worker terpasang. Tapi `sendWebPush()` punya **nol
 * sebutan di seluruh `src/`** (diverifikasi grep 2026-08-01). Fungsi ini
 * menulis `channel: 'push'` ke DB tanpa pernah benar-benar mengirim push, dan
 * **nol** user punya `push_subscription` — konsisten, karena UI-nya juga tak
 * pernah memanggil `subscribeToPush()`.
 *
 * Versi sebelumnya menulis "nol dari 23 user". Penyebutnya sudah basi (26 per
 * 2026-08-09), dan angka mati di komentar adalah racun konteks yang CLAUDE.md
 * peringatkan. Yang penting pembilangnya, dan cara mengukurnya:
 *
 *   SELECT count(*) FILTER (WHERE push_subscription IS NOT NULL), count(*)
 *   FROM users;
 *
 * Jadi seluruh notifikasi selama ini IN-APP SAJA. Menguji di HP tak akan
 * membuktikan apa pun; yang putus adalah rantainya, bukan perangkatnya.
 *
 * ── Kenapa fire-and-forget, dan kenapa itu BUKAN kelalaian
 *
 * Push TIDAK boleh memblokir alur utama: kasbon yang berhasil disetujui tak
 * boleh gagal karena server push Google lambat. `void` di pemanggil disengaja,
 * dan `sendWebPushToUsers` sendiri sudah menelan seluruh errornya (termasuk
 * 410 Gone untuk subscription kedaluwarsa).
 *
 * ── Kenapa TIDAK dipanggil saat `error`
 *
 * Notifikasi yang gagal disimpan tak boleh dikirim push-nya: penerima akan
 * mengetuk push, membuka aplikasi, dan tak menemukan apa pun.
 */
async function kirimPush(userIds: string[], p: NotificationParams): Promise<void> {
  const muatan = {
    title: p.title,
    message: p.message,
    action_url: p.action_url,
  }

  try {
    /*
      ── DUA SALURAN, SATU CORONG (2026-08-16)

      Web Push menjangkau PERAMBAN; push natif menjangkau APLIKASI MOBILE.
      Keduanya dikirim dari fungsi yang sama dan sengaja demikian: notifikasi
      yang lahir di dua tempat akan berbeda isinya suatu hari — satu pihak
      memperbaiki judul, pihak lain tidak, dan tak ada test yang membandingkan
      keduanya karena keduanya "benar" menurut berkasnya masing-masing.

      Muatan `muatan` dibangun SEKALI di atas, bukan dua objek literal, supaya
      penyimpangan itu tak mungkin secara bentuk.

      `allSettled`, bukan `all`: Expo yang mati tak boleh membatalkan Web Push
      yang sudah terkirim, dan sebaliknya. `all` menolak pada kegagalan
      pertama dan menelan hasil saluran yang satunya.
    */
    const hasil = await Promise.allSettled([
      sendWebPushToUsers(userIds, muatan),
      kirimPushNatifKeUsers(userIds, muatan),
    ])

    // Kegagalan per-saluran DICATAT, tidak ditelan. Keduanya sudah menangani
    // errornya sendiri di dalam, jadi sampai ke sini berarti ada yang lolos —
    // dan itu justru yang perlu terlihat.
    const nama = ['web-push', 'push-natif']
    hasil.forEach((h, i) => {
      if (h.status === 'rejected') {
        console.error(`[notifications] ${nama[i]} gagal:`, (h.reason as Error)?.message)
      }
    })
  } catch (err) {
    // Kegagalan push tak boleh menyentuh alur utama.
    //
    // ⚠️ Impor STATIS, bukan `await import()`. Versi pertama memakai impor
    // dinamis (niatnya: `web-push` tak ikut dimuat di jalur yang tak
    // memerlukannya), dan itu membuat panggilan KEDUA dan seterusnya
    // tertelan diam-diam — dua pesan berbeda hanya satu yang terkirim.
    // Ditemukan test, bukan review; penghematan muatnya tak sebanding dengan
    // notifikasi yang hilang tanpa jejak.
    console.error('[notifications] push gagal:', (err as Error)?.message)
  }
}

// ── Resolusi penerima ─────────────────────────────────────────────────────────
//
// Sudah PINDAH ke Notification Routing Engine (2B): `resolveRecipients(eventType, ctx)`
// di utils/notification-routing.ts, yang membaca `notification_rules` — penerima
// jadi konfigurasi yang bisa diubah dari UI, bukan fungsi hardcoded.
//
// getAllAdmins() / getProjectAdminsAndPM() / getProjectMandors() SENGAJA DIHAPUS,
// bukan disisakan sebagai pembungkus: dua jalur resolusi = dua perilaku yang bisa
// menyimpang diam-diam, persis kesalahan shadow 1C yang sudah di-retire (ADR-006).

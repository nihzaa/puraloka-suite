import { supabase } from './supabase.js'
import { sendWebPushToUsers } from './webpush.js'

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
  try {
    await sendWebPushToUsers(userIds, {
      title: p.title,
      message: p.message,
      action_url: p.action_url,
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

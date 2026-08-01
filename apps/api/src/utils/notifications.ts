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
  // Request for Inspection (migrasi 157). Terpisah dari punch karena
  // penerimanya berbeda: permintaan pergi ke yang berwenang memeriksa,
  // hasilnya kembali ke pemohon.
  | 'inspeksi_diminta'
  | 'inspeksi_lolos'
  | 'inspeksi_gagal'
  | 'general'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface NotificationParams {
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
 * nol dari 23 user punya `push_subscription` — konsisten, karena UI-nya juga
 * tak pernah memanggil `subscribeToPush()`.
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

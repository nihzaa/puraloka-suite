/**
 * Web Push utility — kirim push notification ke browser via VAPID.
 *
 * Setup:
 *  1. Generate VAPID keys sekali: node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
 *  2. Tambah ke apps/api/.env:
 *       VAPID_PUBLIC_KEY=<publicKey>
 *       VAPID_PRIVATE_KEY=<privateKey>
 *       VAPID_SUBJECT=mailto:admin@puraloka.id
 *  3. Expose NEXT_PUBLIC_VAPID_PUBLIC_KEY di apps/web/.env.local untuk frontend
 *
 * Semua errors ditangani secara graceful — push gagal tidak pernah crash main flow.
 */

import webpush from 'web-push'

let _initialized = false

function ensureInit() {
  if (_initialized) return
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject    = process.env.VAPID_SUBJECT ?? 'mailto:admin@puraloka.id'

  if (!publicKey || !privateKey) {
    // VAPID not configured — push silently disabled
    return
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  _initialized = true
}

export interface PushPayload {
  title: string
  message: string
  action_url?: string
  notification_id?: string
  actions?: Array<{ action: string; title: string }>
}

export interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Kirim Web Push notification ke satu subscription.
 * Fire-and-forget — jangan await di main request handler.
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<void> {
  ensureInit()
  if (!_initialized) return

  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      JSON.stringify(payload),
      { TTL: 86400 }   // 24 jam
    )
  } catch (err: unknown) {
    // 410 Gone = subscription expired / revoked — log only
    const status = (err as any)?.statusCode
    if (status === 410 || status === 404) {
      console.warn('[webpush] Subscription expired, skipping:', (err as any)?.endpoint)
    } else {
      console.error('[webpush] Send error:', (err as Error)?.message)
    }
  }
}

/**
 * Kirim push ke banyak user sekaligus berdasarkan array user_id.
 * Ambil subscription dari DB, lalu batch send.
 * Fire-and-forget — tidak perlu await.
 */
export async function sendWebPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (userIds.length === 0) return
  ensureInit()
  if (!_initialized) return

  try {
    const { supabase } = await import('./supabase.js')
    const { data: users } = await supabase
      .from('users')
      .select('id, push_subscription')
      .in('id', userIds)
      .not('push_subscription', 'is', null)

    const sends = (users ?? [])
      .filter((u: any) => u.push_subscription?.endpoint)
      .map((u: any) => sendWebPush(u.push_subscription as PushSubscription, payload))

    await Promise.allSettled(sends)
  } catch (err) {
    console.error('[webpush] sendWebPushToUsers error:', (err as Error)?.message)
  }
}

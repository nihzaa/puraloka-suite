/**
 * Frontend Web Push utility for Puraloka Suite.
 *
 * - Panggil subscribeToPush() setelah login sukses untuk register browser.
 * - Panggil unsubscribeFromPush() saat logout.
 *
 * VAPID public key harus di-set di apps/web/.env.local:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your_vapid_public_key>
 */

import { api } from './api'

// ── Helper: convert VAPID base64 key ke Uint8Array ───────────────────────────

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i)
  }
  return output.buffer as ArrayBuffer
}

// ── Register Service Worker + subscribe ──────────────────────────────────────

/**
 * Minta izin notifikasi, daftarkan Service Worker, lalu POST subscription ke API.
 * Safe to call multiple times — idempotent jika sudah subscribed.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.warn('[webpush] NEXT_PUBLIC_VAPID_PUBLIC_KEY tidak di-set — push disabled')
    return false
  }

  try {
    // 1. Minta izin
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    // 2. Daftar service worker
    //
    // Sejak Task 3 (app-shell cache), `lib/register-sw.ts` sudah mendaftarkan
    // '/sw.js' di scope '/' lebih dulu lewat root layout — SEBELUM fungsi ini
    // sempat dipanggil (yang butuh opt-in user). Baris di bawah TETAP aman
    // dibiarkan tanpa mengecek registrasi yang ada lebih dulu:
    // `ServiceWorkerContainer.register()` (MDN) idempoten untuk URL+scope yang
    // sama — browser mencocokkan registrasi yang sudah ada alih-alih membuat
    // duplikat, dan Promise-nya resolve dengan `ServiceWorkerRegistration`
    // yang SAMA (bukan instance baru). Tak ada registrasi ganda, tak ada
    // race, tak ada re-download sw.js kalau isinya tak berubah.
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    // 3. Subscribe ke push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    // 4. Kirim ke API
    const subJson = subscription.toJSON()
    await api.post('/api/v1/notifications/subscribe', {
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh,
        auth:   subJson.keys?.auth,
      },
    })

    return true
  } catch (err) {
    console.error('[webpush] subscribeToPush error:', err)
    return false
  }
}

/**
 * Unsubscribe dari Web Push dan hapus dari API.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      await subscription.unsubscribe()
    }

    await api.delete('/api/v1/notifications/subscribe').catch(() => {})
  } catch (err) {
    console.error('[webpush] unsubscribeFromPush error:', err)
  }
}

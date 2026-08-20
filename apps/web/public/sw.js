// Puraloka Suite — Service Worker: push notifications + app-shell cache
// Version: 2.0.0 (app-shell caching ditambahkan — push notification TIDAK diubah)

const CACHE_NAME = 'puraloka-shell-v1'
// Hanya app-shell (route Next.js menangani asetnya sendiri lewat build
// hash) — TIDAK ada data API di sini. Offline penuh (cache data
// transaksional) sengaja TIDAK dibangun — risiko data basi/konflik,
// keputusan founder di spec 2026-08-20-portal-pm-lengkap-design.md §4.
const SHELL_URLS = ['/pm-portal', '/login']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Hanya navigasi (buka halaman), BUKAN request API — panggilan
  // /api/v1/* harus tetap live-fail dengan pesan jelas, bukan diam-diam
  // menyajikan data cache basi.
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || caches.match('/pm-portal'))
    )
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Puraloka Suite', message: event.data ? event.data.text() : '' }
  }

  const title   = data.title   ?? 'Puraloka Suite'
  const options = {
    body:    data.message    ?? '',
    icon:    '/icon-192.png',
    badge:   '/icon-72.png',
    tag:     data.notification_id ?? 'puraloka-notif',
    renotify: true,
    data:    { url: data.action_url ?? '/dashboard' },
    actions: data.actions ?? [],
    vibrate: [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url ?? '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Jika ada tab yang sudah buka app — fokus ke sana dan navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(targetUrl)
          return
        }
      }
      // Tidak ada tab yang buka — buka tab baru
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

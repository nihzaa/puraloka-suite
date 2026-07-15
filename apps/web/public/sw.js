// Puraloka Suite — Service Worker for Web Push Notifications
// Version: 1.0.0

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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

// Puraloka Suite — Service Worker: push notifications + app-shell cache
// Version: 2.0.0 (app-shell caching ditambahkan — push notification TIDAK diubah)

const CACHE_NAME = 'puraloka-shell-v1'
// Hanya app-shell (route Next.js menangani asetnya sendiri lewat build
// hash) — TIDAK ada data API di sini. Offline penuh (cache data
// transaksional) sengaja TIDAK dibangun — risiko data basi/konflik,
// keputusan founder di spec 2026-08-20-portal-pm-lengkap-design.md §4.
//
// `/pm-portal` SENGAJA TIDAK di sini (bukan lupa). Registrasi service
// worker sekarang selalu-aktif (Task 3, 2026-08-20) — install bisa
// terjadi SEBELUM user login, dan `/pm-portal` di keadaan itu dialihkan
// middleware.ts ke /login dengan status 307. `cache.addAll` mengikuti
// redirect secara transparan lalu menyimpan BODY HASIL AKHIR (halaman
// login) di bawah KEY `/pm-portal` — pengunjung pertama yang belum
// sempat login lalu offline akan disajikan shell login yang menyamar
// sebagai shell portal PM. `/login` sendiri aman diprecache di sini
// karena tak pernah redirect. `/pm-portal` di-cache RUNTIME sebagai
// gantinya lewat listener `fetch` di bawah — satu-satunya momen ia bisa
// bernilai 200 asli adalah sesudah user benar-benar login.
const SHELL_URLS = ['/login']

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
    fetch(event.request)
      .then((response) => {
        // Simpan HANYA respons sukses non-redirect di bawah key request
        // ASLI (mis. buka /pm-portal sesudah login → status 200 →
        // cache.put mengisi key '/pm-portal' dengan shell yang benar).
        // `response.redirected` menandai fetch ini pernah mengikuti
        // redirect — kalau iya, body-nya BUKAN milik URL yang diminta,
        // jadi jangan ikut ditulis ke key aslinya (persis cacat yang
        // sama dengan cache.addAll di atas, cukup dihindari di titik
        // tulisnya).
        if (response.ok && !response.redirected) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('/login'))
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

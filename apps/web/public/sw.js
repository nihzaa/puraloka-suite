// Puraloka Suite — Service Worker: push notifications + app-shell cache
// Version: 2.0.0 (app-shell caching ditambahkan — push notification TIDAK diubah)

const CACHE_NAME = 'puraloka-shell-v1'
// Hanya app-shell (route Next.js menangani asetnya sendiri lewat build
// hash) — TIDAK ada data API di sini. Offline penuh (cache data
// transaksional) sengaja TIDAK dibangun — risiko data basi/konflik,
// keputusan founder di spec 2026-08-20-portal-pm-lengkap-design.md §4.
//
// TIDAK ADA precache install-time SAMA SEKALI — bukan lupa, dan bukan
// cuma soal `/pm-portal`. Registrasi service worker sekarang
// selalu-aktif (Task 3, 2026-08-20), jadi `install` bisa terjadi kapan
// pun: sebelum login, SESUDAH login, browser/profil baru, atau SW
// re-install karena byte berubah. middleware.ts redirect DUA ARAH
// tergantung status sesi saat itu —
//   belum login + buka /pm-portal → 307 ke /login   (blok isPublic)
//   SUDAH login  + buka /login    → 307 ke home role (blok `token && isPublic`)
// — jadi TIDAK ADA satu pun navigate URL yang aman diprecache tanpa
// syarat di titik `install`: `cache.addAll` mengikuti redirect secara
// transparan dan menyimpan body hasil akhir di bawah key request asli.
// Precache `/login` sendirian sempat dicoba (fix round 1) dan gagal
// dengan cara SIMETRIS: user yang instal SW saat sudah login akan
// menyimpan shell dashboard/pm-portal di bawah key '/login'.
//
// Shell diisi RUNTIME saja lewat listener `fetch` di bawah — satu-
// satunya momen sebuah URL boleh masuk cache adalah sesudah ia
// benar-benar bernilai 200 ASLI (bukan hasil ikut redirect) untuk auth
// state yang SEDANG berlaku. Konsekuensi yang diterima sadar: kunjungan offline
// PERTAMA SEKALI (belum pernah online sama sekali di perangkat itu)
// tidak punya fallback shell apa pun — trade-off yang lebih aman
// daripada menyajikan shell salah tanpa peringatan.
const SHELL_URLS = []

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      SHELL_URLS.length ? cache.addAll(SHELL_URLS) : Promise.resolve()
    )
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
        // Fallback terakhir HANYA `caches.match(event.request)` — TIDAK
        // ada URL "aman" universal untuk fallback kedua lagi. `/login`
        // dulu dipakai di sini (fix round 1) dengan asumsi ia selalu
        // precached tanpa syarat; asumsi itu sendiri yang jadi sumber
        // bug redirect simetris (lihat komentar SHELL_URLS di atas).
        // Sekarang TIDAK ADA url yang diprecache tanpa syarat, jadi
        // fallback kedua ke URL tetap manapun bisa mengulang cacat yang
        // sama untuk arah lain. Kalau `event.request` sendiri tak ada
        // di cache (belum pernah online sama sekali di perangkat ini),
        // ini resolve ke `undefined` dan peramban menampilkan halaman
        // offline bawaannya — bukan crash, dan bukan shell yang salah.
        caches.match(event.request)
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

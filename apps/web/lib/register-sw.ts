/**
 * Registrasi service worker untuk app-shell caching — dipanggil SELALU
 * saat app dibuka (app/layout.tsx), terpisah dari `lib/webpush.ts` yang
 * hanya register saat user opt-in push notification.
 *
 * Sebelumnya sw.js HANYA terdaftar saat subscribeToPush() dipanggil —
 * artinya app-shell cache (Task 3 ini) tak pernah aktif untuk user yang
 * belum menyalakan notifikasi. Fungsi ini memastikan registrasi terjadi
 * dari awal, idempoten (browser tak mendaftar dua kali untuk scope yang
 * sama).
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Kegagalan registrasi TIDAK BOLEH menghalangi app berjalan normal
      // di mode online — PWA installable adalah peningkatan, bukan
      // syarat.
    });
  });
}

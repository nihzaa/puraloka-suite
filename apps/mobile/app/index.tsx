import React from 'react';
import { View } from 'react-native';

/**
 * Rute AKAR `/` — layar diam yang menyerahkan tujuannya ke guard.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebelum berkas ini, `app/` hanya berisi dua grup (`(app)`, `(auth)`) dan
 * `_layout.tsx`. Grup berkurung TIDAK membentuk segmen URL, jadi tak ada
 * satu pun berkas yang menjawab rute `/`.
 *
 * Guard di `_layout.tsx` tetap mengalihkan ke `/kenalan` atau `/login`,
 * tetapi ia berjalan di dalam `useEffect` — sesudah render pertama. Rute
 * akar yang berpenghuni menutup jendela itu: yang tergambar lebih dulu
 * bidang navy, bukan apa pun yang diputuskan router saat tak menemukan
 * apa-apa.
 *
 * ⚠ JANGAN mengklaim berkas ini memperbaiki "Unmatched Route".
 *
 * Founder melaporkan layar itu pada 2026-09-05, dan berkas ini ditulis
 * sebagai perbaikannya. Uji mutasi MENOLAK klaim tersebut: `index.tsx`
 * dihapus, cacatnya TIDAK kembali — Chromium maupun Brave (profil bersih)
 * tetap masuk `/kenalan` dengan benar, dibaca sejak 300ms.
 *
 * Yang sudah diukur dan semuanya HIJAU, jadi bukan penyebabnya:
 *
 *     proses pemegang :8081     satu, Expo yang benar
 *     localhost / 127.0.0.1 / [::1]   ketiganya 200, HTML sama
 *     browser bersih            -> /kenalan
 *     penyimpanan bekas         -> /login
 *     URL rute dalam & karangan -> /kenalan
 *     service worker & cache    nol
 *     JS diblokir               pesan LAIN ("You need to enable JavaScript")
 *     trailing slash/query/hash semuanya -> /kenalan
 *     Brave asli, profil bersih -> /kenalan, nol galat
 *
 * Yang TERSISA sebagai penyebab, dan tak bisa diukur dari sini: profil
 * Brave founder sendiri — ekstensi, Shields per-situs, atau data situs
 * tersimpan.
 *
 * Berkas ini tetap dipertahankan karena rute akar memang layak punya
 * penghuni, bukan karena terbukti menyembuhkan sesuatu. Membiarkan klaim
 * yang tak terbukti berdiri di sini akan membuat sesi berikutnya berhenti
 * mencari penyebab yang sebenarnya.
 *
 * ── Kenapa layar KOSONG, bukan pengalih atau pemuat
 *
 * Tiga bentuk dipertimbangkan:
 *
 *   `<Redirect href="/login" />`  ✗ memaku tujuan, dan tujuannya BERGANTUNG
 *                                   pada tiga keadaan (sesi, perkenalan,
 *                                   font) yang cuma diketahui guard. Dua
 *                                   tempat memutuskan tujuan berarti dua
 *                                   tempat yang bisa berselisih.
 *   pemuat berputar               ✗ `SplashMerek` SUDAH menutupi layar
 *                                   penuh di atas `<Slot/>`. Pemuat kedua
 *                                   di bawahnya tak pernah terlihat, dan
 *                                   menambah kedipan kalau splash lepas
 *                                   lebih dulu.
 *   bidang kosong berwarna        ✓ dipilih
 *
 * Warnanya `#003366` — navy merek, sama dengan latar `SplashMerek`. Kalau
 * ada jendela sepersekian detik antara splash lepas dan pengalihan selesai,
 * yang terlihat bidang navy yang sama, bukan kedipan putih.
 *
 * ⚠ Jangan menambahkan teks, logo, atau animasi di sini. Layar ini
 * dimaksudkan TAK PERNAH terlihat; apa pun yang digambar di atasnya cuma
 * bisa muncul sebagai kedipan.
 */
export default function Akar() {
  return <View style={{ flex: 1, backgroundColor: '#003366' }} />;
}

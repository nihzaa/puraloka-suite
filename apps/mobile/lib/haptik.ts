import { Platform } from 'react-native';

/**
 * Haptik — getaran singkat yang MENEGASKAN sesuatu benar-benar terjadi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-13: `expo-haptics` terpasang sejak 2026-09-12 dan dipakai
 * di SATU berkas — `components/BilahTab.tsx`, untuk perpindahan tab.
 * Lima layar TULIS tak satu pun memakainya:
 *
 *     absensi/input · kasbon/ajukan · progress/input
 *     punch/lapor   · notifications/index
 *
 * ── Kenapa layar TULIS yang paling butuh
 *
 * Ini aplikasi lapangan. Penggunanya memegang HP di bawah matahari, sering
 * bersarung tangan, dan layarnya silau. Pada keadaan itu konfirmasi VISUAL
 * adalah yang paling mudah terlewat — dan tekanan yang tak terasa terjadi
 * akan DIULANG.
 *
 * Bentuk kegagalannya sudah tercatat di repo ini: `audit-tekan-berumpan.mjs`
 * lahir dari 16 `Pressable` telanjang, dan catatannya menyebut akibatnya
 * langsung — *"dua NCR dari satu temuan"*. Umpan balik sentuh menutup celah
 * yang sama dari sisi lain: bukan "tombolnya tertekan", melainkan
 * "kirimannya BERHASIL".
 *
 * ── Kenapa dibungkus, bukan dipanggil langsung
 *
 * Tiap pemanggilan langsung menuntut tiga hal diingat serentak: penjagaan
 * `Platform.OS !== 'web'`, `import()` dinamis, dan `.catch(() => {})`.
 * Yang lupa satu pun TIDAK mendapat galat — ia mendapat layar yang rusak
 * di web, atau kiriman yang gagal karena haptiknya gagal.
 *
 * Kegagalan haptik TIDAK BOLEH PERNAH menggagalkan tindakannya. Getaran
 * adalah hiasan yang berguna; kiriman adalah pekerjaan orang.
 *
 * ── Kenapa TIGA jenis, bukan satu
 *
 * Getaran yang sama untuk berhasil dan gagal tak memberi tahu apa pun yang
 * belum diketahui layar. Yang berguna justru BEDANYA — dan itu bisa terasa
 * tanpa melihat, yang merupakan seluruh alasan memakainya di lapangan.
 */

type Jenis = 'berhasil' | 'gagal' | 'ringan';

/**
 * Getarkan perangkat.
 *
 * Tak pernah `throw`, tak pernah `await`-able secara bermakna — panggil
 * dan lanjutkan. Sengaja TIDAK memulangkan Promise supaya tak ada yang
 * tergoda menunggunya sebelum mengirim data.
 *
 * ⚠ `import()` DINAMIS, bukan impor statis di kepala berkas. `expo-haptics`
 * tak punya implementasi di web, dan impor statis membuat berkas yang
 * memuatnya gagal di `expo export --platform web` — tempat potret layar
 * dibuat (CLAUDE.md §8a.3).
 */
export function getar(jenis: Jenis = 'ringan'): void {
  /* Web tak punya haptik. Keluar lebih awal, bukan gagal diam-diam. */
  if (Platform.OS === 'web') return;

  import('expo-haptics')
    .then((h) => {
      if (jenis === 'berhasil') {
        return h.notificationAsync(h.NotificationFeedbackType.Success);
      }
      if (jenis === 'gagal') {
        return h.notificationAsync(h.NotificationFeedbackType.Error);
      }
      return h.impactAsync(h.ImpactFeedbackStyle.Light);
    })
    /*
      Ditelan DENGAN SENGAJA, dan ini satu-satunya tempat yang boleh.
      Perangkat tanpa motor getar, izin yang ditolak, atau modul yang tak
      termuat semuanya berakhir di sini — dan tak satu pun dari itu alasan
      untuk menggagalkan laporan yang sedang dikirim mandor.
    */
    .catch(() => {});
}

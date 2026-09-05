import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Preferensi sistem "kurangi gerak" — dibaca sekali, lalu diikuti perubahannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HOOK INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `SplashMerek` sudah membaca `isReduceMotionEnabled()` sejak dibuat, dan
 * membacanya dengan benar. Yang tak ada: cara memakainya lagi di tempat
 * kedua tanpa menyalin seluruh blok `useEffect` + `.catch` + state.
 *
 * Animasi kedua di aplikasi ini (transisi antar-layar) lahir hari ini, dan
 * menyalin blok itu berarti dua tempat yang harus diingat bersamaan saat
 * salah satunya diperbaiki. Jadi dipisah lebih dulu.
 *
 * ── Kenapa `null` sebagai keadaan ketiga
 *
 * `false` berarti "sudah dibaca, penggunanya tak minta dikurangi".
 * `null` berarti "BELUM dibaca". Bedanya menentukan: memperlakukan `null`
 * sebagai `false` membuat animasi berjalan sepersekian detik sebelum
 * preferensinya terbaca — persis gerakan yang penggunanya minta jangan ada,
 * dan ia tetap melihatnya setiap kali aplikasi dibuka.
 *
 * Pemanggil yang tak peduli bisa menulis `?? false`; yang peduli menunggu.
 *
 * ── Kegagalan membaca = anggap TIDAK dikurangi
 *
 * Arah jatuhan ini sengaja, dan berlawanan dengan naluri "gagal-tertutup".
 * `isReduceMotionEnabled()` yang menolak bukan berarti penggunanya sensitif
 * gerak — ia berarti kita tak tahu. Menganggapnya `true` mematikan animasi
 * untuk semua orang di perangkat yang API-nya bermasalah, tanpa gejala dan
 * tanpa cara menyalakannya lagi.
 */
export function useKurangiGerak(): boolean | null {
  const [kurangi, setKurangi] = useState<boolean | null>(null);

  useEffect(() => {
    let hidup = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((aktif) => {
        if (hidup) setKurangi(aktif);
      })
      .catch(() => {
        if (hidup) setKurangi(false);
      });

    /*
      Preferensinya bisa BERUBAH saat aplikasi hidup — pengguna membuka
      Pengaturan, menyalakannya, lalu kembali. Membaca sekali saja membuat
      perubahan itu baru berlaku sesudah aplikasi dimatikan paksa.

      `remove()` pada langganan wajib dipanggil; tanpanya tiap pemasangan
      ulang komponen menambah satu pendengar yang tak pernah dilepas.
    */
    const langganan = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (aktif) => {
        if (hidup) setKurangi(aktif);
      },
    );

    return () => {
      hidup = false;
      langganan.remove();
    };
  }, []);

  return kurangi;
}

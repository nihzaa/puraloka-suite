/**
 * PUSH NATIF — mendaftarkan HP supaya ia bisa DIBANGUNKAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI ADA, DAN KENAPA WEB PUSH TAK BISA MENGGANTIKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebelum berkas ini, `app/(app)/notifications/index.tsx` MURNI TARIK: ia
 * memanggil GET /api/v1/notifications saat layarnya dibuka, lalu menunggu
 * pemakainya menarik untuk menyegarkan. Artinya notifikasi hanya sampai
 * kalau orangnya kebetulan membuka aplikasi — dan justru yang mendesak
 * (kasbon menunggu persetujuan, NCR atas namanya) yang paling butuh sampai
 * saat aplikasinya TERTUTUP.
 *
 * Web Push yang sudah ada di `apps/web` tak menjangkau ke sini: ia bekerja
 * lewat service worker peramban, dan React Native tak menjalankan service
 * worker sama sekali. Bukan soal konfigurasi — tak ada VAPID key yang bisa
 * menjembataninya.
 *
 * ── Kenapa pendaftaran terjadi saat LOGIN, bukan saat aplikasi dibuka
 *
 * Token melekat pada PEMASANGAN aplikasi, bukan pada akun. Kalau didaftarkan
 * saat aplikasi dibuka, ia tersimpan atas nama siapa pun yang terakhir login
 * — termasuk sesudah logout. HP proyek yang berpindah tangan lalu mengirim
 * kasbon orang sebelumnya ke pemegang barunya adalah kebocoran, bukan bug
 * tampilan.
 */

/*
  ⚠️ VERSI TERIKAT SDK, dan ini sudah memakan waktu sekali.

  Percobaan pertama memasang `expo-notifications@57` (terbaru di registry).
  Ia terpasang bersih, `pnpm` tak mengeluh — lalu `tsc` menuduh
  `NotificationPermissionsStatus` tak punya `granted`. Sebabnya bukan
  salah ketik: v57 mewarisi `PermissionResponse` dari `expo@54+`, sementara
  project ini memakai `expo@53`. Tipenya tak bisa di-resolve, jadi SELURUH
  bidang warisan lenyap dari permukaan.

  Yang dipasang sekarang mengikuti SDK 53: `expo-notifications@~0.31`,
  `expo-device@~7.1`. Kalau `expo` dinaikkan, keduanya HARUS ikut naik —
  jangan memasang versi terbaru begitu saja.

  Catatan API untuk 0.31: `shouldShowBanner`/`shouldShowList` adalah bidang
  yang benar; `shouldShowAlert` sudah DEPRECATED di versi ini.
*/
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';
import { storage } from './storage';

const KUNCI_TOKEN = 'puraloka_push_token';

/**
 * Bagaimana notifikasi ditampilkan saat aplikasi sedang DIBUKA.
 *
 * Tanpa handler ini, Expo membisukan notifikasi yang datang di foreground —
 * perilaku bawaan yang masuk akal untuk aplikasi hiburan dan salah untuk alat
 * kerja: mandor yang sedang mengisi progres tetap perlu tahu kasbonnya baru
 * disetujui.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Minta izin, ambil token Expo, kirim ke server.
 *
 * Memulangkan token bila berhasil, `null` bila tidak — dan TIDAK melempar.
 * Kegagalan mendaftar push tak boleh menggagalkan login: pengguna yang menolak
 * izin notifikasi tetap harus bisa bekerja.
 */
export async function daftarkanPerangkat(): Promise<string | null> {
  try {
    // Emulator tak punya push service. Dicek lebih dulu supaya galatnya
    // tak terbaca sebagai "izin ditolak" saat pengembangan.
    if (!Device.isDevice) {
      console.warn('[push] bukan perangkat fisik — pendaftaran dilewati');
      return null;
    }

    // Android WAJIB punya channel sebelum notifikasi bisa tampil. Tanpa ini
    // pesannya terkirim, tiketnya "ok", dan tak ada apa pun yang muncul di
    // layar — kegagalan yang tak meninggalkan jejak di mana pun.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Pemberitahuan Puraloka',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#003366',
      });
    }

    /*
      ⚠️ Diperiksa lewat `granted` + `ios.status`, BUKAN lewat `.status`.

      Versi pertama berkas ini menulis `const { status } = await
      getPermissionsAsync()` — pola yang beredar luas di contoh Expo lama, dan
      SALAH untuk expo-notifications 57: `NotificationPermissionsStatus`
      mewarisi `PermissionResponse`, yang tak punya `.status` di permukaan itu.
      Ditangkap `tsc --noEmit`, bukan review.

      `PROVISIONAL` ikut dihitung sah: iOS mengizinkan notifikasi senyap tanpa
      dialog, dan menolaknya di sini berarti membuang izin yang sudah kita
      punya — HP-nya diam padahal sistem membolehkan.
    */
    const sahkan = (p: Notifications.NotificationPermissionsStatus) =>
      p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    let izin = await Notifications.getPermissionsAsync();

    // Minta HANYA bila belum diberikan. Meminta ulang pada pengguna yang sudah
    // menolak tak memunculkan dialog apa pun di iOS — ia hanya memulangkan
    // penolakan yang sama.
    if (!sahkan(izin)) {
      izin = await Notifications.requestPermissionsAsync();
    }

    if (!sahkan(izin)) {
      console.warn('[push] izin notifikasi tidak diberikan');
      return null;
    }

    const hasil = await Notifications.getExpoPushTokenAsync();
    const token = hasil.data;
    if (!token) return null;

    await api.post('/api/v1/notifications/perangkat', {
      token,
      platform: Platform.OS,
      nama_perangkat: Device.modelName ?? undefined,
    });

    // Disimpan supaya logout bisa mencabut token INI secara spesifik —
    // bukan seluruh perangkat milik pengguna. Mencabut semuanya berarti logout
    // di HP kantor membungkam HP lapangan yang masih dipakai.
    await storage.set(KUNCI_TOKEN, token);
    return token;
  } catch (err) {
    // Dicatat, tidak dilempar — lihat alasan di atas.
    console.error('[push] gagal mendaftarkan perangkat:', (err as Error)?.message);
    return null;
  }
}

/**
 * Cabut perangkat ini saat logout.
 *
 * Kalau dilewatkan, notifikasi pengguna LAMA tetap mengalir ke HP ini sampai
 * ada orang lain yang login dan menimpanya lewat upsert. Di HP proyek yang
 * dipegang bergantian, jendela itu bisa berhari-hari.
 */
export async function cabutPerangkat(): Promise<void> {
  try {
    const token = await storage.get(KUNCI_TOKEN);
    if (!token) return;
    await api.delete('/api/v1/notifications/perangkat', { data: { token } });
    await storage.remove(KUNCI_TOKEN);
  } catch (err) {
    // Logout TIDAK boleh gagal karena pencabutan gagal — pengguna yang
    // menyerahkan HP-nya harus tetap bisa keluar dari akunnya. Tokennya akan
    // tertimpa saat orang berikutnya login (upsert atas `token`).
    console.error('[push] gagal mencabut perangkat:', (err as Error)?.message);
  }
}

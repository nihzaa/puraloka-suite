import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * ============================================================================
 * PENYIMPANAN BERLAPIS — rahasia terenkripsi, sisanya biasa
 * ============================================================================
 *
 * Sampai 2026-08-31 seluruh isi disimpan di `AsyncStorage` — termasuk
 * `access_token` dan `refresh_token`. AsyncStorage TIDAK terenkripsi:
 *
 *   · Android  file SQLite biasa di direktori aplikasi. Terbaca oleh perangkat
 *              ter-root, dan ikut terbawa `adb backup` kalau `allowBackup`
 *              belum dimatikan
 *   · iOS      file biasa di sandbox aplikasi, ikut ke backup iTunes/iCloud
 *              yang tak terenkripsi
 *
 * Yang bocor bukan sekadar sesi: `refresh_token` memperpanjang dirinya
 * sendiri, jadi satu kali terbaca berarti akses yang tak kedaluwarsa sampai
 * seseorang mencabutnya — dan tak seorang pun akan tahu untuk mencabutnya.
 *
 * `expo-secure-store` sudah terpasang di `package.json` sejak awal, dan nol
 * berkas memakainya. Ia menyimpan lewat Keychain (iOS) dan Keystore
 * (Android) — terenkripsi perangkat keras di ponsel modern.
 *
 * ── Kenapa TIDAK semuanya dipindah ke SecureStore
 *
 * Dua alasan yang keduanya penting:
 *
 *   1. BATAS UKURAN. SecureStore membatasi ~2 KB per nilai. Antrean offline
 *      (`puraloka_antrean_v1`) memuat laporan progres beserta rujukan foto,
 *      dan bisa jauh melewati itu. Menyimpannya di sana akan GAGAL saat
 *      antreannya panjang — persis ketika ia paling dibutuhkan, yaitu saat
 *      lama tanpa sinyal.
 *
 *   2. KECEPATAN. Tiap baca SecureStore menyentuh Keychain/Keystore. Untuk
 *      token sekali per permintaan itu tak terasa; untuk antrean yang dibaca
 *      berulang saat sinkronisasi, itu menambah jeda yang terlihat.
 *
 * Jadi yang RAHASIA masuk SecureStore, sisanya tetap AsyncStorage. Daftarnya
 * eksplisit di `RAHASIA` — bukan ditebak dari nama kunci, karena kunci baru
 * yang kebetulan tak cocok pola akan diam-diam tersimpan tanpa enkripsi.
 *
 * ── Migrasi dari penyimpanan lama
 *
 * Pengguna yang sudah login menyimpan tokennya di AsyncStorage. `get()`
 * karena itu membaca SecureStore lebih dulu, lalu jatuh ke AsyncStorage —
 * dan begitu ditemukan di sana, ia DIPINDAHKAN. Tanpa pemindahan itu, token
 * lama tetap tergeletak tak terenkripsi selamanya.
 */

/**
 * Kunci yang isinya rahasia. Ditulis eksplisit, bukan dicocokkan pola:
 * kunci baru yang lupa didaftarkan akan tersimpan tanpa enkripsi, dan itu
 * tak mengeluarkan galat apa pun.
 */
const RAHASIA = new Set(['puraloka_token', 'puraloka_refresh']);

/**
 * SecureStore tak tersedia di web dan bisa gagal di perangkat tertentu
 * (Keystore rusak, emulator tanpa layar kunci). Kalau gagal, JANGAN diam:
 * jatuh ke AsyncStorage supaya aplikasi tetap bisa dipakai, tapi keadaan itu
 * harus terlihat — pengguna yang tak bisa login sama sekali akan melapor;
 * token yang diam-diam tak terenkripsi tidak.
 */
let secureRusak = false;

async function secureTersedia(): Promise<boolean> {
  if (secureRusak) return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    secureRusak = true;
    return false;
  }
}

export const storage = {
  async get(key: string): Promise<string | null> {
    if (RAHASIA.has(key) && (await secureTersedia())) {
      try {
        const aman = await SecureStore.getItemAsync(key);
        if (aman !== null) return aman;

        /*
          Belum ada di SecureStore — mungkin sesi lama dari sebelum perubahan
          ini. Pindahkan, lalu hapus jejaknya di penyimpanan biasa.
        */
        const lama = await AsyncStorage.getItem(key);
        if (lama !== null) {
          await SecureStore.setItemAsync(key, lama);
          await AsyncStorage.removeItem(key);
          return lama;
        }
        return null;
      } catch {
        secureRusak = true;
        console.warn(
          `[storage] SecureStore gagal untuk "${key}" — jatuh ke penyimpanan biasa. ` +
            'Token TIDAK terenkripsi di perangkat ini.',
        );
      }
    }
    return AsyncStorage.getItem(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (RAHASIA.has(key) && (await secureTersedia())) {
      try {
        await SecureStore.setItemAsync(key, value);
        /* Bersihkan salinan lama supaya tak ada dua sumber kebenaran. */
        await AsyncStorage.removeItem(key);
        return;
      } catch {
        secureRusak = true;
        console.warn(
          `[storage] SecureStore gagal menulis "${key}" — jatuh ke penyimpanan biasa.`,
        );
      }
    }
    return AsyncStorage.setItem(key, value);
  },

  async remove(key: string): Promise<void> {
    /* Dihapus dari KEDUANYA — sisa di salah satunya berarti logout yang
       tak benar-benar mengeluarkan orang. */
    if (RAHASIA.has(key) && (await secureTersedia())) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        /* Lanjut menghapus yang biasa; kegagalan di sini tak boleh
           menghentikan logout. */
      }
    }
    return AsyncStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    /*
      `AsyncStorage.clear()` TIDAK menyentuh SecureStore. Tanpa baris di
      bawah, logout meninggalkan token terenkripsi yang masih sah — dan
      pengguna berikutnya di perangkat yang sama mewarisi sesinya.
    */
    if (await secureTersedia()) {
      for (const k of RAHASIA) {
        try {
          await SecureStore.deleteItemAsync(k);
        } catch {
          /* diabaikan — kunci yang memang tak ada melempar di sebagian versi */
        }
      }
    }
    return AsyncStorage.clear();
  },
};

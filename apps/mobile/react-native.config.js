/**
 * Memaksa jalur impor autolinking `expo` yang BENAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Build APK kesebelas, kedua belas, dan ketiga belas gagal dengan galat
 * yang sama persis, di tahap perakitan Android:
 *
 *     PackageList.java:16: error: cannot find symbol
 *     import expo.core.ExpoModulesPackage;
 *     Execution failed for task ':app:compileReleaseJavaWithJavac'
 *
 * `PackageList.java` DIHASILKAN oleh tugas `:app:generateAutolinkingPackageList`
 * milik React Native CLI — bukan oleh autolinking Expo, yang menulis berkas
 * lain (`ExpoModulesPackageList.java`).
 *
 * ── Kelasnya ADA, hanya di paket lain
 *
 * Diukur di disk:
 *
 *     expo/android/src/main/java/expo/modules/ExpoModulesPackage.kt
 *       → baris pertama: `package expo.modules`
 *
 *     expo/android/build.gradle
 *       → baris 43: `namespace "expo.core"`
 *
 * Namespace Gradle dan paket Kotlin memang boleh berbeda, dan Expo memakai
 * keduanya dengan sengaja. Yang menentukan impor mana yang ditulis RN CLI
 * adalah `expo/react-native.config.js`:
 *
 *     android: { packageImportPath: 'import expo.modules.ExpoModulesPackage;' }
 *
 * Itu nilai yang BENAR. Ia hanya dipakai kalau `findProjectRootSync()` di
 * berkas itu berhasil; kalau gagal, RN CLI jatuh ke tebakan dari
 * `namespace` — dan tebakannya `expo.core`, yang tak punya kelas itu.
 *
 * ── Kenapa dua perbaikan sebelumnya tak menolong
 *
 * Dua hipotesis diuji dan keduanya SALAH — dicatat supaya tak diulang:
 *
 *   1. `react-native-webview` bercabang dua versi. Nyata, dan sudah dipaku.
 *      Build kedua belas TETAP gagal dengan galat yang sama persis.
 *
 *   2. `@react-three/fiber` di apps/web-publik melahirkan pohon Expo kedua
 *      lewat peer opsional. Juga nyata — diukur rn+react19.2.4 dari 32 jadi
 *      0 sesudah web-publik dipangkas, dan log build ketiga belas
 *      MEMBUKTIKAN pemangkasannya berjalan (58 baris importer dibuang, satu
 *      `expo@53.0.27` saja tersisa di node_modules server). Galatnya TETAP
 *      sama.
 *
 * Keduanya kebersihan yang sah dan tetap dipertahankan. Keduanya bukan
 * penyebabnya.
 *
 * ── Kenapa memaksanya di sini, bukan memperbaiki deteksi akar
 *
 * `findProjectRootSync()` hidup di dalam paket `expo`; memperbaikinya
 * berarti menambal node_modules, yang hilang tiap `pnpm install`.
 *
 * Menyatakannya di sini menjadikannya EKSPLISIT: nilainya tak lagi
 * bergantung pada deteksi yang bisa gagal senyap di lingkungan build yang
 * berbeda. Kalau suatu hari Expo mengubah nama paket Java-nya, build gagal
 * dengan galat yang sama — dan berkas ini tempat pertama yang dilihat.
 *
 * Sumber nilainya bukan tebakan: disalin dari
 * `expo/react-native.config.js` milik Expo 53.0.27 sendiri.
 */
module.exports = {
  dependencies: {
    expo: {
      platforms: {
        android: {
          packageImportPath: 'import expo.modules.ExpoModulesPackage;',
          packageInstance: 'new ExpoModulesPackage()',
        },
      },
    },
  },
};

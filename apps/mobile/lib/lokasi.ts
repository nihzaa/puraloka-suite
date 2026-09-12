import * as Location from 'expo-location';

/**
 * Mengambil koordinat perangkat untuk dilampirkan ke laporan lapangan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rantai geotag di repo ini SUDAH LENGKAP kecuali satu mata rantai
 * terakhir. Diukur 2026-09-12:
 *
 *     basis     `project_photos` punya lintang, bujur, akurasi_m,
 *               sumber_lokasi, lokasi_dicatat_pada          ✅
 *     lib       `lib/geotag.ts` — jarakMeter, nilaiLokasi,
 *               jarakTerbaca, barisGeotag (+ test)          ✅
 *     API       `progress.ts` menerima & MEMVALIDASI rentang
 *               koordinat, menolak yang setengah terisi     ✅
 *     mobile    `expo-location` di NOL berkas               ❌
 *
 *     project_photos : 36 foto · 0 punya koordinat
 *
 * Jadi yang dibangun di sini bukan fitur baru — melainkan mata rantai
 * yang membuat tiga lapisan di atasnya berhenti jadi persiapan.
 *
 * ── Kenapa NOL koordinat tidak boleh menggagalkan kiriman
 *
 * Ini keputusan yang paling menentukan di berkas ini.
 *
 * Mandor melapor dari lokasi yang sinyalnya buruk, kadang di dalam
 * bangunan beton, kadang dengan izin lokasi yang ditolak entah kapan.
 * Kalau ketiadaan koordinat membatalkan laporan, yang hilang adalah
 * LAPORANNYA — dan laporan progres jauh lebih berharga daripada titik
 * koordinatnya.
 *
 * Maka fungsi ini TIDAK PERNAH melempar. Ia memulangkan `null`, dan
 * pemanggilnya mengirim laporan tanpa koordinat. API-nya sudah siap:
 * `progress.ts:156` menolak koordinat yang SETENGAH terisi, tetapi
 * menerima yang kosong sama sekali.
 *
 * ── Kenapa `Balanced`, bukan `Highest`
 *
 * `Highest` menyalakan GPS penuh dan bisa memakan 10-20 detik di bawah
 * kanopi atau di antara gedung — dengan mandor berdiri menunggu tombol
 * "Kirim" merespons. `Balanced` (≈100 m) memakai jaringan + GPS kasar,
 * biasanya di bawah 2 detik.
 *
 * Dan 100 m SUDAH CUKUP untuk pertanyaan yang dijawab geotag di sini:
 * "apakah laporan ini dibuat di lokasi proyek, atau dari rumah?" — bukan
 * "di titik mana persisnya dalam tapak". `lib/geotag.ts` menilai jarak
 * terhadap koordinat proyek, dan ambangnya ratusan meter.
 *
 * ── Kenapa ada batas waktu sendiri
 *
 * `getCurrentPositionAsync` bisa menggantung tanpa batas kalau perangkat
 * tak pernah mendapat fix. Tanpa pagar waktu, tombol "Kirim" membeku dan
 * penggunanya menekan lagi — dua laporan dari satu kejadian, kelas cacat
 * yang sudah tercatat di `audit-tekan-berumpan`.
 */

/** Bentuk yang dikirim ke API. Namanya sama persis dengan kolom basis. */
export interface Koordinat {
  lintang: number;
  bujur: number;
  /** Radius ketidakpastian dalam meter, apa adanya dari perangkat. */
  akurasi_m: number | null;
  /** Selalu `perangkat` dari jalur ini; `exif`/`manual` datang dari jalur lain. */
  sumber_lokasi: 'perangkat';
}

/**
 * Batas waktu menunggu fix.
 *
 * 8 detik: cukup untuk fix jaringan di sinyal lemah, masih di bawah
 * ambang orang menyimpulkan "aplikasinya hang" (~10 detik).
 */
const BATAS_MS = 8_000;

/**
 * Ambil koordinat sekarang. TIDAK PERNAH melempar — `null` berarti
 * "tak ada koordinat", dan pemanggil wajib tetap melanjutkan.
 */
export async function ambilKoordinat(): Promise<Koordinat | null> {
  try {
    /*
      Izin diminta saat DIBUTUHKAN, bukan saat aplikasi dibuka.

      Dialog izin yang muncul di layar pertama, sebelum orang tahu untuk
      apa, adalah dialog yang ditolak. Diminta di sini, ia muncul tepat
      saat mandor menekan "Kirim" pada laporan lapangan — konteksnya
      jelas dengan sendirinya.
    */
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    /*
      Balapan antara fix dan batas waktu. `Promise.race` dipakai, bukan
      opsi timeout bawaan, karena `getCurrentPositionAsync` tak
      menyediakannya di semua platform.
    */
    const posisi = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<null>((selesai) => setTimeout(() => selesai(null), BATAS_MS)),
    ]);

    if (!posisi) return null;

    const { latitude, longitude, accuracy } = posisi.coords;

    /*
      Penjagaan terakhir sebelum dikirim.

      `0, 0` adalah titik di Teluk Guinea, dan ia muncul dari emulator
      yang belum disetel maupun dari perangkat yang gagal fix lalu
      memulangkan nilai bawaan. Mengirimnya berarti menandai laporan
      "ribuan kilometer dari proyek" — kesimpulan yang salah, dan lebih
      buruk daripada tak punya koordinat sama sekali.
    */
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude === 0 && longitude === 0) return null;

    return {
      lintang: latitude,
      bujur: longitude,
      akurasi_m: Number.isFinite(accuracy) ? accuracy : null,
      sumber_lokasi: 'perangkat',
    };
  } catch {
    /*
      Ditelan SENGAJA, dan ini satu-satunya tempat yang boleh.

      Modul lokasi bisa gagal karena perangkat tanpa GPS, layanan lokasi
      dimatikan sistem, atau modul native yang tak terpasang di build web.
      Tak satu pun dari itu boleh menghalangi laporan progres terkirim.
    */
    return null;
  }
}

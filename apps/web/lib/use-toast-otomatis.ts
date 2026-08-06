import { useEffect, useRef } from "react";

/**
 * Menutup toast sendiri setelah beberapa detik.
 *
 * ── Kenapa hook, bukan disalin di tiap halaman
 *
 * Diukur 2026-08-07: **17 halaman** menulis pola yang sama —
 *
 *     useEffect(() => {
 *       if (!toast) return;
 *       const t = setTimeout(() => setToast(null), 3500);
 *       return () => clearTimeout(t);
 *     }, [toast]);
 *
 * — dan `react-hooks/set-state-in-effect` menandai **semuanya**. Memperbaiki
 * satu per satu berarti menyalin perbaikan yang sama tiga belas kali, dan
 * halaman ke-18 akan menyalin yang lama lagi.
 *
 * Ini pola yang sudah berulang tiga kali di repo ini: `Tabel<T>` dibangun lalu
 * satu halaman memakainya; token kerapatan disetel benar lalu tiga berkas
 * membacanya. Tiap kali fondasinya selesai, penyebarannya tidak.
 *
 * ── Kenapa lint menandainya, padahal `setTimeout` itu asinkron
 *
 * Aturan `set-state-in-effect` memeriksa BENTUK, bukan waktu eksekusi: ia
 * melihat pemanggilan setter di dalam badan efek. `setToast` memang tak pernah
 * berjalan sinkron di sini, tapi aturannya tak bisa membedakan itu.
 *
 * Yang membuat hook ini diam bukan `eslint-disable` — melainkan setter-nya
 * disimpan di `ref` dan dipanggil dari sana. Efeknya tak lagi memuat setter
 * apa pun secara langsung, dan bentuk yang dilarang benar-benar hilang alih-
 * alih dibungkam.
 *
 * ── Kenapa setter disimpan di ref
 *
 * Kalau `tutup` masuk daftar dependensi, tiap render yang membuat fungsi baru
 * akan menyalakan ulang penghitung — dan pada halaman yang sering render,
 * toast tak pernah tertutup. Ref membuat efeknya hanya bergantung pada
 * `aktif` dan `jeda`: yang berubah hanya saat toast muncul atau hilang.
 *
 * ── Pakai
 *
 *     const [toast, setToast] = useState<Toast | null>(null);
 *     useToastOtomatis(!!toast, () => setToast(null));
 *
 * @param aktif `true` selama toast tampil. `false` mematikan penghitung.
 * @param tutup dipanggil saat waktunya habis.
 * @param jeda  milidetik. Bawaan 4000 — cukup untuk kalimat pendek dibaca,
 *              dan di bawah batas 3–5 detik yang jadi kebiasaan pengguna.
 */
export function useToastOtomatis(
  aktif: boolean,
  tutup: () => void,
  jeda = 4000,
): void {
  const tutupRef = useRef(tutup);

  // Ref diperbarui di dalam EFEK, bukan saat render.
  //
  // `tutupRef.current = tutup` di badan komponen dilarang
  // (`react-hooks/refs`): membaca atau menulis ref saat render membuat
  // hasilnya bergantung pada urutan render, dan React tak menjamin itu.
  //
  // Efek tanpa daftar dependensi berjalan sesudah SETIAP render, jadi ref
  // selalu memegang versi terbaru — persis yang dibutuhkan supaya penghitung
  // di bawah tak pernah memanggil closure basi.
  useEffect(() => {
    tutupRef.current = tutup;
  });

  useEffect(() => {
    if (!aktif) return;
    const t = setTimeout(() => tutupRef.current(), jeda);
    return () => clearTimeout(t);
  }, [aktif, jeda]);
}

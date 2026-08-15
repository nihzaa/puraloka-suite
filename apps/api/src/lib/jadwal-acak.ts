/**
 * WAKTU SASARAN ACAK — supaya penjadwal tak terasa mesin.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUBAH, DAN YANG SENGAJA TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-14: *"seperti manusia yg random aja dan emang ga tepat
 * seperti yang dijadwalkan"*.
 *
 * `jadwal_tugas` hanya mengenal `harian|mingguan|bulanan` + `jam` HH:MM —
 * persis jam kaku yang ditolak. Tapi menggantinya berarti membuang tiga hal
 * yang sudah terbukti: `harusJalan()`, klaim ATOMIK (`terakhir_jalan` lama
 * ikut di WHERE), dan heartbeat 15 menit yang sudah berjalan.
 *
 * Jadi yang berubah hanya WAKTU SASARANNYA:
 *
 *   `harusJalan()`     tetap memutuskan "periode ini sudah waktunya"
 *   `sasaranBerikut()` memilih SATU waktu acak di dalam jendela periode itu
 *   pemanggil menunggu sampai `now() >= sasaran`
 *
 * Hasilnya sapaan datang 09:12, lalu 14:40, lalu 11:05 — tanpa satu baris pun
 * logika klaim ditulis ulang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SASARANNYA DISIMPAN, BUKAN DIUNDI TIAP TICK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mengundi ulang tiap 15 menit terdengar lebih sederhana dan SALAH: peluangnya
 * menumpuk. Tugas berjendela 10 jam (40 tick) dengan peluang 1/40 tiap tick
 * hampir pasti tertembak dalam beberapa tick pertama — hasilnya justru selalu
 * pagi, yaitu kembali jadi jadwal kaku dengan langkah tambahan.
 *
 * Diundi SEKALI per periode, ia benar-benar tersebar merata.
 */

/**
 * Sumber acak yang bisa disuntik.
 *
 * Bukan demi kerapian: `Math.random()` membuat perilaku ini mustahil diuji,
 * dan yang tak bisa diuji akan dipercaya begitu saja. Test menyuntikkan
 * urutan yang ditentukan supaya "tersebar merata" bisa DIBUKTIKAN, bukan
 * diasumsikan.
 */
export type SumberAcak = () => number

export interface OpsiSasaran {
  /** Awal periode — biasanya `awalPeriode(jadwal, now)` dari `jadwal.ts`. */
  awal: Date
  /** Lebar jendela dalam menit. 0 = tepat di `awal` (perilaku lama). */
  jendelaMenit: number
  acak?: SumberAcak
}

/**
 * Memilih satu waktu di dalam `[awal, awal + jendela)`.
 *
 * Jendela 0 mengembalikan `awal` apa adanya — tugas lama (cek tenggat,
 * retensi) tak berubah perilakunya sama sekali oleh migrasi 391.
 *
 * Dibulatkan ke MENIT, bukan detik: heartbeat-nya tiap 15 menit, jadi presisi
 * detik hanya membuat nilai tersimpan terlihat lebih tepat daripada yang
 * sebenarnya bisa dipenuhi.
 */
export function sasaranBerikut(opsi: OpsiSasaran): Date {
  const jendela = Math.max(0, Math.floor(opsi.jendelaMenit))
  if (jendela === 0) return new Date(opsi.awal)

  const acak = opsi.acak ?? Math.random

  /*
   * Nilai acak DIJINAKKAN sebelum dipakai.
   *
   * `Math.min`/`Math.max` saja tak cukup: keduanya MENERUSKAN NaN, dan
   * `Math.floor(NaN * 600)` menghasilkan NaN yang jadi `Invalid Date` —
   * tersimpan ke basis sebagai null, lalu tugasnya diundi ulang tiap tick
   * selamanya tanpa satu pun galat.
   *
   * Ditemukan test, bukan dengan membaca ulang: kasus `Number.NaN` gagal
   * sementara -1 dan 5 lolos.
   */
  const mentah = acak()
  const bersih = Number.isFinite(mentah) ? mentah : 0
  // Batas atas EKSKLUSIF — sasaran tak pernah jatuh tepat di awal periode
  // berikutnya (yang akan membuatnya terbaca sebagai periode yang salah).
  const geser = Math.floor(Math.min(0.999_999, Math.max(0, bersih)) * jendela)
  return new Date(opsi.awal.getTime() + geser * 60_000)
}

export type AlasanTunda = 'belum-sasaran'

export type KeputusanSasaran =
  | { jalan: true; sasaran: Date }
  | { jalan: false; alasan: AlasanTunda; sasaran: Date }

/**
 * Sudah waktunya menjalankan tugas berjendela?
 *
 * Dipanggil SESUDAH `harusJalan()` menyatakan periodenya tiba. Dua lapis,
 * bukan satu:
 *
 *   `harusJalan()`  periode mana yang berlaku, dan belum dijalankan
 *   fungsi ini      di dalam periode itu, apakah menit acaknya sudah lewat
 *
 * Menyatukannya akan membuat pemilihan acak ikut menentukan "periode mana" —
 * dan tugas yang sasarannya jatuh sesudah tick terakhir hari itu akan
 * terlewat sepenuhnya, diam-diam.
 */
export function sudahWaktunya(
  sasaran: Date | null,
  sekarang: Date,
  opsiJikaBelumAda: OpsiSasaran,
): KeputusanSasaran {
  // Belum punya sasaran untuk periode ini → pilih sekarang. Pemanggil yang
  // menyimpannya; fungsi ini murni.
  const s = sasaran ?? sasaranBerikut(opsiJikaBelumAda)
  if (sekarang.getTime() >= s.getTime()) return { jalan: true, sasaran: s }
  return { jalan: false, alasan: 'belum-sasaran', sasaran: s }
}

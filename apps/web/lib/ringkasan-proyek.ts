/**
 * RINGKASAN PROYEK — agregasi murni untuk dashboard `/proyek`.
 *
 * ── Kenapa berkas terpisah, bukan di dalam `page.tsx`
 *
 * Empat KPI dan satu grafik di halaman `/proyek` semuanya turunan dari SATU
 * respons `/api/v1/projects`. Selama hitungannya tinggal di dalam komponen,
 * ia tak bisa diuji tanpa merender halaman — dan yang paling ingin diuji di
 * sini justru bagian yang paling sunyi kalau salah: batas tanggal.
 *
 * "Telat" yang menghitung hari ini sebagai terlambat, atau "selesai bulan
 * ini" yang ikut menghitung Desember tahun lalu, akan menghasilkan angka
 * yang tampak masuk akal di layar. Tak ada yang akan curiga.
 *
 * ── `hariIni` selalu DISUNTIKKAN, tak pernah dibaca dari `Date.now()`
 *
 * Sama seperti `analisa-keterlambatan.ts` di API. Fungsi yang membaca jam
 * sendiri menghasilkan test yang lulus hari ini dan gagal besok — dan
 * kegagalan itu akan disalahkan pada test-nya, bukan pada kodenya.
 *
 * ── Yang SENGAJA tidak ada di sini
 *
 * Tak ada perhitungan denda, EOT, atau keterlambatan per-milestone. Ketiganya
 * sudah punya rumahnya sendiri di `/api/v1/analisa-keterlambatan`, yang
 * membaca `contract_eot` — data yang TIDAK dikirim `/api/v1/projects`.
 * Menghitung "telat" versi kedua di sini berarti dua angka keterlambatan yang
 * berbeda di aplikasi yang sama, dan yang satu (tanpa EOT) selalu menuduh
 * lebih berat. Karena itu KPI di sini disebut "lewat tenggat", bukan "telat":
 * ia menyatakan fakta tanggal, dan menyerahkan vonisnya ke halaman yang punya
 * bahannya.
 */

/** Bentuk minimum proyek yang dibutuhkan agregasi ini. */
export interface ProyekRingkas {
  id: string;
  name: string;
  status: string;
  progress_pct: number | string;
  contract_value: number | string;
  start_date: string;
  end_date: string;
  actual_end_date: string | null;
}

/** Status yang dianggap "sudah tak berjalan" — tak bisa lewat tenggat lagi. */
const SELESAI_ATAU_BATAL = new Set(["completed", "cancelled"]);

/**
 * Jarak hari dari `hariIni` ke `tanggal`. Positif = masih di depan.
 *
 * Dihitung dari string `YYYY-MM-DD` lewat `Date.UTC`, BUKAN dari
 * `new Date(s).getTime()`. Alasannya bukan kerapian: `new Date("2026-08-07")`
 * ditafsirkan sebagai tengah malam UTC, sementara `new Date()` di WIB
 * berada 7 jam di depannya. Selisih itu cukup untuk membuat proyek yang
 * tenggatnya HARI INI terhitung "lewat 0 hari" di pagi hari dan "lewat 1
 * hari" di sore hari — angka yang berubah sendiri tanpa data berubah.
 */
export function selisihHari(hariIni: string, tanggal: string): number {
  const hari = (s: string) => {
    const [t, b, g] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(t, (b ?? 1) - 1, g ?? 1);
  };
  return Math.round((hari(tanggal) - hari(hariIni)) / 86_400_000);
}

/** Sudah lewat tenggat: masih berjalan DAN tanggal akhirnya sudah lewat. */
export function lewatTenggat(p: ProyekRingkas, hariIni: string): boolean {
  if (SELESAI_ATAU_BATAL.has(p.status)) return false;
  // `< 0`, bukan `<= 0`. Proyek yang tenggatnya HARI INI belum terlambat —
  // ia masih punya sisa hari kerja. Menandainya merah membuat orang belajar
  // mengabaikan warna merah.
  return selisihHari(hariIni, p.end_date) < 0;
}

/** Tenggat dalam `ambang` hari ke depan (termasuk hari ini), belum lewat. */
export function segeraJatuhTempo(p: ProyekRingkas, hariIni: string, ambang = 14): boolean {
  if (SELESAI_ATAU_BATAL.has(p.status)) return false;
  const sisa = selisihHari(hariIni, p.end_date);
  return sisa >= 0 && sisa <= ambang;
}

/** `actual_end_date` jatuh di bulan & tahun yang sama dengan `hariIni`. */
export function selesaiBulanIni(p: ProyekRingkas, hariIni: string): boolean {
  if (!p.actual_end_date) return false;
  // Dibandingkan sebagai teks "YYYY-MM". Membandingkan lewat `getMonth()`
  // memasukkan zona waktu ke perhitungan yang tak membutuhkannya, dan itu
  // membuat proyek yang selesai tanggal 1 bisa terhitung bulan sebelumnya.
  return p.actual_end_date.slice(0, 7) === hariIni.slice(0, 7);
}

/**
 * Progres yang SEHARUSNYA sudah dicapai kalau pekerjaan berjalan rata
 * sepanjang masa kontrak — 0..100.
 *
 * Ini garis lurus, dan konstruksi tidak berjalan lurus (kurva S). Karena itu
 * angkanya dipakai sebagai PEMBANDING KASAR untuk mengurutkan mana yang paling
 * tertinggal, bukan sebagai target yang mengikat. Halaman yang memakainya
 * wajib menyebutnya begitu.
 *
 * `null` bila rentang tanggalnya tak masuk akal (akhir sebelum mulai) —
 * mengembalikan 0 di situ akan membuat proyek cacat-data tampil "tepat
 * jadwal", yaitu persis kesimpulan yang paling berbahaya.
 */
export function progresSeharusnya(p: ProyekRingkas, hariIni: string): number | null {
  const total = selisihHari(p.start_date, p.end_date);
  if (!Number.isFinite(total) || total <= 0) return null;
  const jalan = selisihHari(p.start_date, hariIni);
  if (!Number.isFinite(jalan)) return null;
  return Math.min(100, Math.max(0, (jalan / total) * 100));
}

/** Satu baris "paling tertinggal dari jadwal". */
export interface BarisSelisih {
  id: string;
  name: string;
  nyata: number;
  seharusnya: number;
  /** `nyata - seharusnya`. Negatif = tertinggal. */
  selisih: number;
}

/**
 * Proyek AKTIF yang paling jauh di bawah garis jadwal, terparah lebih dulu.
 *
 * Hanya yang tertinggal (`selisih < 0`) yang masuk. Proyek yang mendahului
 * jadwal tak menuntut tindakan apa pun, dan memasukkannya ke daftar yang
 * judulnya "paling tertinggal" berarti pembacanya harus menyaring dengan
 * mata — pekerjaan yang seharusnya sudah dilakukan kodenya.
 */
export function palingTertinggal(
  proyek: ProyekRingkas[], hariIni: string, batas = 6,
): BarisSelisih[] {
  const hasil: BarisSelisih[] = [];
  for (const p of proyek) {
    if (p.status !== "active") continue;
    const seharusnya = progresSeharusnya(p, hariIni);
    if (seharusnya === null) continue;
    const nyata = Number(p.progress_pct) || 0;
    const selisih = nyata - seharusnya;
    if (selisih >= 0) continue;
    hasil.push({ id: p.id, name: p.name, nyata, seharusnya, selisih });
  }
  return hasil.sort((a, b) => a.selisih - b.selisih).slice(0, batas);
}

/** Keempat KPI §5c, dihitung dari satu respons `/api/v1/projects`. */
export interface RingkasanProyek {
  aktif: number;
  nilaiAktif: number;
  /** Rata-rata `progress_pct` proyek aktif. `null` bila tak ada yang aktif. */
  progresRata: number | null;
  lewatTenggat: number;
  segeraJatuhTempo: number;
  selesaiBulanIni: number;
  total: number;
}

export function ringkasProyek(proyek: ProyekRingkas[], hariIni: string): RingkasanProyek {
  const aktif = proyek.filter((p) => p.status === "active");
  return {
    aktif: aktif.length,
    nilaiAktif: aktif.reduce((s, p) => s + (Number(p.contract_value) || 0), 0),
    // `null`, bukan 0. Nol persen berarti "delapan proyek jalan dan belum
    // satu pun bergerak" — pernyataan yang sangat berbeda dari "tak ada
    // proyek aktif", dan hanya salah satunya menuntut panggilan telepon.
    progresRata: aktif.length === 0
      ? null
      : aktif.reduce((s, p) => s + (Number(p.progress_pct) || 0), 0) / aktif.length,
    lewatTenggat: proyek.filter((p) => lewatTenggat(p, hariIni)).length,
    segeraJatuhTempo: proyek.filter((p) => segeraJatuhTempo(p, hariIni)).length,
    selesaiBulanIni: proyek.filter((p) => selesaiBulanIni(p, hariIni)).length,
    total: proyek.length,
  };
}

/** Tanggal hari ini di WIB sebagai `YYYY-MM-DD`. */
export function hariIniWIB(kini: Date = new Date()): string {
  // WIB = UTC+7, tanpa DST. Menggeser dulu lalu memotong bagian UTC-nya
  // memberi tanggal kalender yang dilihat pengguna di lapangan — bukan
  // tanggal UTC, yang tertinggal 7 jam dan membuat laporan sore hari
  // tercatat di hari sebelumnya.
  return new Date(kini.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

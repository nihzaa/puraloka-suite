/**
 * RINGKASAN ASET — agregasi murni untuk dashboard `/aset`.
 *
 * ── Kenapa berkas terpisah, bukan di dalam `page.tsx`
 *
 * Alasan yang sama dengan `ringkasan-proyek.ts`: yang paling ingin diuji di
 * sini justru bagian yang paling sunyi kalau salah — batas tanggal sewa.
 * "Sewa berakhir bulan ini" yang salah sehari akan menampilkan angka yang
 * tampak masuk akal, dan tak ada yang akan curiga sampai satu alat terlanjur
 * ditagih satu bulan tambahan.
 *
 * ── `hariIni` selalu DISUNTIKKAN
 *
 * Fungsi yang membaca jam sendiri menghasilkan test yang lulus hari ini dan
 * gagal besok — dan kegagalan itu akan disalahkan pada test-nya.
 *
 * ── Yang SENGAJA tidak ada di sini
 *
 * Tak ada utilisasi alat. `/api/v1/assets` tidak mengirimnya; utilisasi hanya
 * ada di `/api/v1/assets/:id/movements`, satu permintaan PER ASET. Menghitung
 * "berapa alat menganggur" dari daftar berarti memanggil endpoint itu sekali
 * untuk tiap baris — dan menyebut hasilnya KPI berarti halaman ini menunggu
 * 40 permintaan sebelum satu angka muncul. Itu bukan penghematan yang layak
 * ditukar dengan halaman yang tak pernah selesai memuat.
 *
 * Status `tersedia` (di gudang) TIDAK dipakai sebagai pengganti "menganggur".
 * Alat yang di gudang seminggu antara dua proyek bukan uang tertidur; alat
 * yang di gudang delapan bulan iya. Daftar ini tak bisa membedakan keduanya,
 * dan menyebut yang pertama "menganggur" adalah tuduhan yang salah.
 */

/** Bentuk minimum aset yang dibutuhkan agregasi ini. */
export interface AsetRingkas {
  id: string;
  name: string;
  ownership: "milik" | "sewa";
  status: string;
  condition: string;
  purchase_price: number | null;
  nilai_buku: number;
  sudah_disusutkan: boolean;
}

/** Bentuk minimum sewa yang dibutuhkan agregasi ini. */
export interface SewaRingkas {
  id: string;
  item_name: string;
  status: string;
  rate: number;
  rate_unit: string;
  start_date: string;
  end_date: string | null;
  biaya_sampai_kini: number;
}

/**
 * Jarak hari dari `hariIni` ke `tanggal`. Positif = masih di depan.
 *
 * Disalin sengaja dari `ringkasan-proyek.ts`, bukan diimpor: mengimpornya
 * membuat dua dashboard yang tak berhubungan saling terikat lewat satu
 * pembantu tanggal, dan perubahan demi salah satunya akan diam-diam mengubah
 * angka di yang lain. Dua belas baris duplikat lebih murah daripada itu.
 *
 * Dihitung dari string `YYYY-MM-DD` lewat `Date.UTC`, BUKAN dari
 * `new Date(s).getTime()` — `new Date("2026-08-07")` adalah tengah malam UTC
 * sementara `new Date()` di WIB tujuh jam di depannya, dan selisih itu cukup
 * untuk membuat sewa yang berakhir HARI INI terhitung berbeda pagi dan sore.
 */
export function selisihHariAset(hariIni: string, tanggal: string): number {
  const hari = (s: string) => {
    const [t, b, g] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(t, (b ?? 1) - 1, g ?? 1);
  };
  return Math.round((hari(tanggal) - hari(hariIni)) / 86_400_000);
}

/** Status sewa yang masih membebani biaya. */
const SEWA_BERJALAN = "berjalan";

/**
 * Sewa berjalan yang tanggal selesainya jatuh dalam `ambang` hari ke depan.
 *
 * `>= 0`: sewa yang berakhir HARI INI tetap masuk — ia justru yang paling
 * menuntut keputusan pagi ini (perpanjang atau kembalikan). Sewa yang
 * tanggalnya sudah LEWAT tapi statusnya masih "berjalan" ditangani terpisah
 * oleh `sewaLewatTanggalSelesai` — dua keadaan yang berbeda, dan
 * mencampurnya akan menyembunyikan yang kedua.
 */
export function sewaJatuhTempo(s: SewaRingkas, hariIni: string, ambang = 30): boolean {
  if (s.status !== SEWA_BERJALAN) return false;
  if (!s.end_date) return false;
  const sisa = selisihHariAset(hariIni, s.end_date);
  return sisa >= 0 && sisa <= ambang;
}

/**
 * Sewa yang statusnya masih "berjalan" padahal tanggal selesainya sudah lewat.
 *
 * Ini bukan sekadar data basi. `biayaSewa` di API menghitung sewa berjalan
 * SAMPAI HARI INI, jadi setiap hari yang lewat menambah biaya pada sewa yang
 * mungkin alatnya sudah lama dikembalikan. Angka "sewa berjalan" di kartu KPI
 * ikut membengkak karenanya — dan yang membengkak diam-diam tak pernah
 * dipertanyakan.
 */
export function sewaLewatTanggalSelesai(s: SewaRingkas, hariIni: string): boolean {
  if (s.status !== SEWA_BERJALAN) return false;
  if (!s.end_date) return false;
  return selisihHariAset(hariIni, s.end_date) < 0;
}

/**
 * Sewa terbuka: berjalan TANPA tanggal selesai.
 *
 * Biayanya bertambah tiap hari tanpa batas yang tercatat di mana pun. Bukan
 * kesalahan — sewa harian memang sering dibuka tanpa akhir — tapi ia satu-
 * satunya baris yang tak bisa diperkirakan biayanya, dan itu layak dihitung.
 */
export function sewaTanpaAkhir(s: SewaRingkas): boolean {
  return s.status === SEWA_BERJALAN && !s.end_date;
}

/** Aset yang menuntut tindakan perbaikan: rusak atau sedang dirawat. */
const STATUS_TAK_SIAP = new Set(["rusak", "perawatan"]);

/** Satu baris "sewa yang perlu diputuskan". */
export interface BarisSewaPerhatian {
  id: string;
  nama: string;
  /** Sisa hari ke tanggal selesai. Negatif = sudah lewat. `null` = tanpa akhir. */
  sisaHari: number | null;
  biaya: number;
  tarif: number;
  satuan: string;
}

/**
 * Sewa yang menuntut keputusan, yang paling mendesak lebih dulu.
 *
 * Urutannya: yang sudah lewat tanggal (paling mendesak, biayanya sedang
 * bertambah keliru), lalu yang paling dekat jatuh tempo, lalu yang tanpa
 * akhir. Sewa tanpa akhir ditaruh terakhir dengan sengaja — ia memang
 * disengaja pada sewa harian, jadi menempatkannya di atas akan menenggelamkan
 * yang benar-benar salah.
 */
export function sewaPerluDiputuskan(
  sewa: SewaRingkas[], hariIni: string, batas = 6,
): BarisSewaPerhatian[] {
  const hasil: BarisSewaPerhatian[] = [];
  for (const s of sewa) {
    const lewat = sewaLewatTanggalSelesai(s, hariIni);
    const segera = sewaJatuhTempo(s, hariIni);
    const terbuka = sewaTanpaAkhir(s);
    if (!lewat && !segera && !terbuka) continue;
    hasil.push({
      id: s.id,
      nama: s.item_name,
      sisaHari: s.end_date ? selisihHariAset(hariIni, s.end_date) : null,
      biaya: Number(s.biaya_sampai_kini) || 0,
      tarif: Number(s.rate) || 0,
      satuan: s.rate_unit,
    });
  }
  return hasil
    .sort((a, b) => {
      // `null` (tanpa akhir) selalu di belakang yang punya tanggal.
      if (a.sisaHari === null && b.sisaHari === null) return b.biaya - a.biaya;
      if (a.sisaHari === null) return 1;
      if (b.sisaHari === null) return -1;
      return a.sisaHari - b.sisaHari;
    })
    .slice(0, batas);
}

/** KPI dashboard `/aset`, dihitung dari dua respons yang sudah dimuat. */
export interface RingkasanAset {
  /** Aset milik yang tak siap pakai: rusak atau perawatan. */
  takSiap: number;
  rusak: number;
  perawatan: number;
  /** Aset milik yang sedang di proyek. */
  dipakai: number;
  milik: number;
  /** Nilai buku seluruh aset milik. */
  nilaiBuku: number;
  nilaiPerolehan: number;
  /** Aset milik yang harga perolehannya belum diisi — nilai bukunya tak terhitung. */
  tanpaHargaPerolehan: number;
  /** Aset milik yang belum pernah dicatat penyusutannya. */
  belumDisusutkan: number;

  /** Biaya sewa yang SEDANG berjalan, sampai hari ini. */
  biayaSewaBerjalan: number;
  sewaBerjalan: number;
  /** Sewa berjalan yang berakhir ≤30 hari — perlu diperpanjang atau ditutup. */
  sewaJatuhTempo: number;
  /** Sewa berjalan yang tanggal selesainya sudah LEWAT — biayanya salah bertambah. */
  sewaLewat: number;
  /** Sewa berjalan tanpa tanggal selesai. */
  sewaTerbuka: number;
}

export function ringkasAset(
  aset: AsetRingkas[], sewa: SewaRingkas[], hariIni: string,
): RingkasanAset {
  const milik = aset.filter((a) => a.ownership === "milik");
  const berjalan = sewa.filter((s) => s.status === SEWA_BERJALAN);

  return {
    rusak: milik.filter((a) => a.status === "rusak").length,
    perawatan: milik.filter((a) => a.status === "perawatan").length,
    takSiap: milik.filter((a) => STATUS_TAK_SIAP.has(a.status)).length,
    dipakai: milik.filter((a) => a.status === "dipakai").length,
    milik: milik.length,
    nilaiBuku: milik.reduce((s, a) => s + (Number(a.nilai_buku) || 0), 0),
    nilaiPerolehan: milik.reduce((s, a) => s + (Number(a.purchase_price) || 0), 0),
    // Harga perolehan kosong bukan "gratis": nilai bukunya jadi nol, dan
    // total nilai buku perusahaan ikut terlihat lebih kecil dari kenyataan.
    tanpaHargaPerolehan: milik.filter((a) => a.purchase_price == null).length,
    belumDisusutkan: milik.filter((a) => !a.sudah_disusutkan).length,

    biayaSewaBerjalan: berjalan.reduce((s, r) => s + (Number(r.biaya_sampai_kini) || 0), 0),
    sewaBerjalan: berjalan.length,
    sewaJatuhTempo: sewa.filter((s) => sewaJatuhTempo(s, hariIni)).length,
    sewaLewat: sewa.filter((s) => sewaLewatTanggalSelesai(s, hariIni)).length,
    sewaTerbuka: sewa.filter(sewaTanpaAkhir).length,
  };
}

/** Tanggal hari ini di WIB sebagai `YYYY-MM-DD`. */
export function hariIniWIB(kini: Date = new Date()): string {
  return new Date(kini.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

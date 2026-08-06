/**
 * RINGKASAN LAPANGAN — agregasi murni untuk dashboard `/lapangan`.
 *
 * ── Kenapa isinya jauh lebih sedikit daripada yang diusulkan §5c
 *
 * ARAH-VISUAL-2026 §5c mengusulkan empat KPI untuk menu Lapangan — RFI
 * terbuka · punch belum tutup · instruksi belum konfirmasi · NCR aktif —
 * dan menyatakan "tiap angka di sini sudah ada API-nya". Diukur 2026-08-07,
 * pernyataan itu TIDAK BENAR untuk tiga dari empatnya.
 *
 * Keenam modul lapangan hanya dilayani lewat rute BERSARANG per-proyek:
 *
 *     GET /api/v1/projects/:projectId/rfis
 *     GET /api/v1/projects/:projectId/punch-items
 *     GET /api/v1/projects/:projectId/ncr
 *     GET /api/v1/projects/:projectId/submittals
 *     GET /api/v1/projects/:projectId/inspections
 *     GET /api/v1/projects/:projectId/field-instructions
 *
 * Tak satu pun punya bentuk lintas-proyek. Menghitung "RFI terbuka" untuk
 * seluruh perusahaan berarti memanggil endpoint itu sekali PER PROYEK lalu
 * menjumlahkannya di peramban — N permintaan untuk N proyek, di halaman yang
 * dibuka paling sering. Dua puluh proyek berarti dua puluh serangan ke DB
 * setiap kali seseorang membuka menu, dan angkanya tetap salah begitu ada
 * proyek yang gagal dimuat: kegagalan sebagian akan tampil sebagai angka
 * yang lebih kecil, bukan sebagai galat. Itu bentuk kesalahan terburuk —
 * yang menenangkan.
 *
 * Jadi ketiganya DIHILANGKAN, bukan diperkirakan.
 *
 * ── Yang tersisa, dan kenapa ia sah
 *
 * `GET /api/v1/dashboard/fokus` SUDAH meringkas lintas-proyek di sisi server
 * (satu query per tabel, disaring `db.projectIds()`), dan dua angka di
 * `rincian`-nya milik domain lapangan:
 *
 *     instruksi_belum_dikonfirmasi   instruksi lisan/telepon > 24 jam
 *     klaim_lewat_batas              (milik /kontrak, bukan di sini)
 *
 * Hanya yang pertama dipakai di sini. Ia BUKAN "instruksi belum konfirmasi"
 * sebagaimana diminta §5c — ia lebih sempit dalam dua hal, dan berkas ini
 * menolak menyamarkan bedanya: lihat `KETERBATASAN_INSTRUKSI`.
 */

/** Bentuk minimum proyek yang dibutuhkan agregasi ini. */
export interface ProyekLapangan {
  id: string;
  name: string;
  status: string;
  progress_pct: number | string;
  end_date: string;
}

/** Bagian `rincian` dari `GET /api/v1/dashboard/fokus` yang dipakai di sini. */
export interface RincianFokus {
  instruksi_belum_dikonfirmasi: number;
}

/**
 * Apa yang TIDAK diperhitungkan angka "instruksi menunggu bukti".
 *
 * Ditulis sebagai konstanta, bukan komentar, karena ia HARUS muncul di layar.
 * KPI yang menuduh tanpa menyebut batasnya adalah cara tercepat membuat orang
 * berdebat dengan aplikasi alih-alih dengan kenyataan.
 */
export const KETERBATASAN_INSTRUKSI =
  "Hanya instruksi lisan/telepon yang lewat 24 jam. Instruksi tertulis, " +
  "WhatsApp, dan hasil rapat tidak dihitung — batasnya lebih longgar.";

/** Status proyek yang dianggap "sudah tak berjalan". */
const SELESAI_ATAU_BATAL = new Set(["completed", "cancelled"]);

const angka = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Jarak hari dari `hariIni` ke `tanggal`. Positif = masih di depan. */
export function selisihHari(hariIni: string, tanggal: string): number {
  const hari = (s: string) => {
    const [t, b, g] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(t, b - 1, g) / 86_400_000;
  };
  return hari(tanggal) - hari(hariIni);
}

/** Tanggal hari ini di WIB sebagai `YYYY-MM-DD`. */
export function hariIniWIB(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Satu proyek berjalan, siap ditelusuri ke modul lapangannya. */
export interface ProyekBerjalan {
  id: string;
  name: string;
  serapan: number;
  /** Negatif = sudah lewat tanggal selesai kontraknya. */
  sisaHari: number;
}

export interface RingkasanLapangan {
  /** Proyek berjalan — di sinilah pekerjaan lapangan terjadi. */
  proyekBerjalan: number;
  /** Instruksi lisan/telepon > 24 jam yang belum dikonfirmasi. */
  instruksiMenungguBukti: number;
  /** Proyek berjalan yang sudah lewat tanggal selesai kontraknya. */
  lewatTenggat: number;
  /** Daftar proyek berjalan, yang paling dekat tenggatnya di atas. */
  daftar: ProyekBerjalan[];
}

/**
 * Hitung angka dashboard `/lapangan` dari dua respons yang sudah ada:
 * `GET /api/v1/projects` dan `GET /api/v1/dashboard/fokus`.
 *
 * `fokus` boleh `null` — endpoint itu gagal KERAS bila salah satu querynya
 * galat (disengaja, lihat `routes/v1/dashboard.ts`). Saat itu terjadi,
 * kartunya harus MENGHILANG, bukan menampilkan nol: "0 menunggu" terbaca
 * sebagai "tidak ada yang perlu saya kerjakan", dan itu kebohongan yang
 * menenangkan.
 */
export function ringkasLapangan(
  proyek: ProyekLapangan[],
  fokus: RincianFokus | null,
  hariIni: string,
): RingkasanLapangan {
  const berjalan = proyek.filter((p) => !SELESAI_ATAU_BATAL.has(p.status));

  const daftar: ProyekBerjalan[] = berjalan
    .map((p) => ({
      id: p.id,
      name: p.name,
      serapan: angka(p.progress_pct),
      sisaHari: p.end_date ? selisihHari(hariIni, p.end_date) : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.sisaHari - b.sisaHari);

  return {
    proyekBerjalan: berjalan.length,
    instruksiMenungguBukti: fokus?.instruksi_belum_dikonfirmasi ?? 0,
    // "Lewat tenggat", BUKAN "telat" — persis alasan yang sama seperti di
    // `ringkasan-proyek.ts`: EOT yang sudah disetujui memaafkan keterlambatan
    // secara kontrak, dan `contract_eot` tidak dikirim `/api/v1/projects`.
    lewatTenggat: daftar.filter(
      (p) => p.sisaHari < 0 && p.sisaHari !== Number.MAX_SAFE_INTEGER,
    ).length,
    daftar,
  };
}

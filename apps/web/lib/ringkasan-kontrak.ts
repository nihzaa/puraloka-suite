/**
 * RINGKASAN KONTRAK — agregasi murni untuk dashboard `/kontrak`.
 *
 * ── Kenapa berkas terpisah, bukan di dalam `page.tsx`
 *
 * Sama seperti `ringkasan-proyek.ts`: selama hitungannya tinggal di dalam
 * komponen, ia tak bisa diuji tanpa merender halaman. Dan yang paling ingin
 * diuji di sini justru bagian yang paling sunyi kalau salah — ambang hari
 * "mau habis". Jaminan yang kadaluarsa HARI INI harus terhitung sebagai
 * sudah lewat, bukan sebagai "masih 0 hari lagi": yang pertama menuntut
 * telepon ke bank pagi ini, yang kedua terbaca seperti masih ada waktu.
 *
 * ── `hariIni` selalu DISUNTIKKAN
 *
 * Fungsi yang membaca `Date.now()` sendiri menghasilkan test yang lulus hari
 * ini dan gagal besok — dan kegagalan itu akan disalahkan pada test-nya.
 *
 * ── Yang SENGAJA tidak ada di sini
 *
 * Tak ada hitungan EOT dan tak ada hitungan klaim. Keduanya bukan keputusan
 * gaya: `contract_eot` dan `contract_claims` HANYA dilayani lewat rute
 * bersarang per-proyek (`/api/v1/projects/:id/eot`, `/api/v1/projects/:id/
 * claims`). Tidak ada endpoint agregat lintas-proyek untuk keduanya, dan
 * mengumpulkannya di klien berarti N permintaan untuk N proyek — satu
 * halaman ringkasan yang menembak DB sebanyak jumlah proyek. Alasan lengkap
 * dan apa yang dibutuhkan untuk menghidupkannya ada di `app/(dashboard)/
 * kontrak/page.tsx`.
 */

/** Satu baris jaminan, sebagaimana dikirim `GET /api/v1/bonds`. */
export interface BarisJaminan {
  id: string;
  project_id: string | null;
  bond_type: string;
  bond_number: string | null;
  issuer: string | null;
  amount: number | string;
  issued_date: string;
  expiry_date: string;
  status: string;
}

/** Bentuk minimum proyek yang dibutuhkan agregasi ini. */
export interface ProyekKontrak {
  id: string;
  name: string;
  status: string;
  contract_value: number | string;
}

/**
 * Ringkasan register asuransi — sudah DIHITUNG DI API
 * (`lib/register-asuransi.ts`), jadi di sini ia hanya dibaca.
 *
 * Sengaja tidak dihitung ulang di klien: dua tempat yang menghitung
 * "kadaluarsa" dengan definisi masing-masing akan berbeda suatu hari, dan
 * yang berbeda diam-diam adalah yang paling lama tak ketahuan.
 */
export interface RingkasAsuransi {
  jumlah_aktif: number;
  jumlah_kadaluarsa: number;
  jumlah_segera_berakhir: number;
  jumlah_ada_celah: number;
  proyek_tanpa_polis: Array<{ project_id: string; project_name: string }>;
  total_nilai_pertanggungan: number;
}

/** Status proyek yang dianggap "sudah tak berjalan". */
const SELESAI_ATAU_BATAL = new Set(["completed", "cancelled"]);

/** Jenis jaminan → label Indonesia. Sesuai CHECK di `contract_bonds`. */
export const LABEL_JAMINAN: Record<string, string> = {
  penawaran: "Penawaran",
  pelaksanaan: "Pelaksanaan",
  uang_muka: "Uang Muka",
  pemeliharaan: "Pemeliharaan",
};

/**
 * Jarak hari dari `hariIni` ke `tanggal`. Positif = masih di depan.
 *
 * Dihitung dari string `YYYY-MM-DD` lewat `Date.UTC`, BUKAN dari
 * `new Date(s).getTime()`. `new Date("2026-08-07")` ditafsirkan sebagai
 * tengah malam UTC, sementara `new Date()` di WIB berada 7 jam di depannya.
 * Selisih itu cukup untuk membuat jaminan yang habis HARI INI terbaca
 * "0 hari lagi" di pagi hari dan "lewat 1 hari" di sore hari — angka yang
 * berubah sendiri tanpa datanya berubah.
 */
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

const angka = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Satu jaminan yang menuntut tindakan, beserta sisa harinya. */
export interface JaminanMendesak extends BarisJaminan {
  /** Negatif = sudah lewat tanggal habisnya. */
  sisaHari: number;
  namaProyek: string;
}

export interface RingkasanKontrak {
  /** Proyek berjalan — status bukan completed/cancelled. */
  kontrakAktif: number;
  /** Nilai kontrak proyek aktif, rupiah. */
  nilaiKontrakAktif: number;
  /** Jaminan `aktif` yang habis dalam <= `ambangHari`, TERMASUK yang lewat. */
  jaminanMauHabis: number;
  /** Bagian dari `jaminanMauHabis` yang tanggalnya SUDAH lewat. */
  jaminanLewat: number;
  /** Polis asuransi kadaluarsa + yang segera berakhir. */
  asuransiPerluTindakan: number;
  /** Daftar jaminan mendesak, paling genting di atas. */
  daftarMendesak: JaminanMendesak[];
  /** Sebaran jaminan aktif per jenis — untuk grafik. */
  perJenis: Array<{ jenis: string; label: string; jumlah: number; nilai: number }>;
}

/**
 * Hitung seluruh angka dashboard `/kontrak` dari dua respons yang sudah ada.
 *
 * `ambangHari` = 30 secara baku: memperbarui jaminan bank butuh surat,
 * tanda tangan, dan antrean bank. Diberi tahu tiga hari sebelumnya sama
 * saja dengan tidak diberi tahu.
 */
export function ringkasKontrak(
  proyek: ProyekKontrak[],
  jaminan: BarisJaminan[],
  asuransi: RingkasAsuransi | null,
  hariIni: string,
  ambangHari = 30,
): RingkasanKontrak {
  const aktif = proyek.filter((p) => !SELESAI_ATAU_BATAL.has(p.status));
  const namaProyek = new Map(proyek.map((p) => [p.id, p.name]));

  // Hanya jaminan berstatus `aktif` yang bisa "mau habis". Yang sudah
  // dilepas (`dilepas`) atau dicairkan tak menuntut apa pun lagi —
  // menghitungnya membuat angka mendesak yang tak bisa dikosongkan siapa pun.
  const mendesak: JaminanMendesak[] = [];
  for (const j of jaminan) {
    if (j.status !== "aktif") continue;
    const sisaHari = selisihHari(hariIni, j.expiry_date);
    if (sisaHari > ambangHari) continue;
    mendesak.push({
      ...j,
      sisaHari,
      namaProyek: (j.project_id && namaProyek.get(j.project_id)) || "Tanpa proyek",
    });
  }
  mendesak.sort((a, b) => a.sisaHari - b.sisaHari);

  // Sebaran per jenis dihitung dari SELURUH jaminan aktif, bukan hanya yang
  // mendesak: pertanyaan yang dijawab grafiknya adalah "jenis mana yang
  // paling banyak menahan uang", dan itu butuh seluruh populasinya.
  const ember = new Map<string, { jumlah: number; nilai: number }>();
  for (const j of jaminan) {
    if (j.status !== "aktif") continue;
    const e = ember.get(j.bond_type) ?? { jumlah: 0, nilai: 0 };
    e.jumlah += 1;
    e.nilai += angka(j.amount);
    ember.set(j.bond_type, e);
  }

  return {
    kontrakAktif: aktif.length,
    nilaiKontrakAktif: aktif.reduce((s, p) => s + angka(p.contract_value), 0),
    jaminanMauHabis: mendesak.length,
    jaminanLewat: mendesak.filter((j) => j.sisaHari < 0).length,
    asuransiPerluTindakan: asuransi
      ? asuransi.jumlah_kadaluarsa + asuransi.jumlah_segera_berakhir
      : 0,
    daftarMendesak: mendesak,
    perJenis: [...ember.entries()]
      .map(([jenis, e]) => ({
        jenis,
        label: LABEL_JAMINAN[jenis] ?? jenis,
        jumlah: e.jumlah,
        nilai: e.nilai,
      }))
      .sort((a, b) => b.nilai - a.nilai),
  };
}

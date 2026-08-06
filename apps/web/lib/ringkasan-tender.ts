/**
 * RINGKASAN TENDER — agregasi murni untuk dashboard `/tender`.
 *
 * ── Kenapa ini kecil, dan kenapa itu disengaja
 *
 * `/api/v1/bids` SUDAH mengirim `meta` lengkap (backlog, pipeline, win rate,
 * selisih harga) yang dihitung `apps/api/src/lib/bid-backlog.ts` — sudah
 * teruji di sisi API. Menghitung ulang keempatnya di web berarti dua sumber
 * untuk angka yang sama, dan saat keduanya menyimpang tak ada yang tahu mana
 * yang benar.
 *
 * Karena itu berkas ini TIDAK menyentuh keempat angka itu. Ia hanya menambah
 * yang `meta` memang tak punya, karena `meta` sengaja tak sadar waktu:
 * berapa LAMA sebuah penawaran menggantung.
 *
 * ── Kenapa umur penawaran layak dihitung
 *
 * "12 tender menunggu keputusan" tak menuntut tindakan apa pun — menunggu
 * memang pekerjaan tender. Yang menuntut tindakan adalah "3 di antaranya
 * diajukan lebih dari 60 hari lalu": tender yang menggantung selama itu
 * biasanya sudah diputuskan tanpa kita diberi tahu, dan selama statusnya
 * tetap "diajukan", nilainya ikut menggelembungkan pipeline yang dipakai
 * memutuskan sanggup-tidaknya mengambil kerja baru.
 *
 * ── `hariIni` selalu DISUNTIKKAN
 *
 * Sama seperti `ringkasan-proyek.ts`. Fungsi yang membaca jam sendiri
 * menghasilkan test yang lulus hari ini dan gagal besok.
 */

/** Bentuk minimum tender yang dibutuhkan agregasi ini. */
export interface TenderRingkas {
  id: string;
  title: string;
  status: string;
  bid_value: number | null;
  submitted_at: string | null;
  decided_at: string | null;
}

/** Status yang berarti "sudah diajukan, menunggu jawaban". */
const STATUS_DIAJUKAN = "diajukan";

/** Jarak hari — lihat catatan zona waktu di `ringkasan-aset.ts`. */
export function selisihHariTender(hariIni: string, tanggal: string): number {
  const hari = (s: string) => {
    const [t, b, g] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(t, (b ?? 1) - 1, g ?? 1);
  };
  return Math.round((hari(tanggal) - hari(hariIni)) / 86_400_000);
}

/**
 * Umur penawaran dalam hari sejak diajukan. `null` bila belum/tak diajukan.
 *
 * Positif = sudah berapa lama menggantung.
 */
export function umurPenawaran(b: TenderRingkas, hariIni: string): number | null {
  if (b.status !== STATUS_DIAJUKAN) return null;
  if (!b.submitted_at) return null;
  // `0 - x`, bukan `-x`. Negasi unary atas nol menghasilkan `-0`, dan `-0`
  // tidak lolos `Object.is(0)` — tapi yang lebih penting, ia dirender sebagai
  // "-0 hari" di kartu. Ditangkap test, bukan oleh mata di layar.
  const umur = 0 - selisihHariTender(hariIni, b.submitted_at);
  // Tanggal pengajuan di MASA DEPAN berarti salah input. Mengembalikan angka
  // negatif akan membuatnya lolos setiap ambang dan tak pernah terlihat;
  // `null` menyatakan "tak bisa dihitung" dengan jujur.
  return umur < 0 ? null : umur;
}

/** Satu baris tender yang menggantung. */
export interface BarisMenggantung {
  id: string;
  judul: string;
  umurHari: number;
  nilai: number | null;
}

/**
 * Penawaran yang menggantung lebih lama dari `ambang` hari, terlama dulu.
 *
 * Hanya status `diajukan` yang masuk. `prospek` dan `go` sengaja TIDAK:
 * keduanya belum diajukan ke siapa pun, jadi tak ada yang sedang ditunggu —
 * memasukkannya berarti menagih jawaban atas surat yang belum dikirim.
 */
export function penawaranMenggantung(
  bids: TenderRingkas[], hariIni: string, ambang = 45, batas = 6,
): BarisMenggantung[] {
  const hasil: BarisMenggantung[] = [];
  for (const b of bids) {
    const umur = umurPenawaran(b, hariIni);
    if (umur === null || umur < ambang) continue;
    hasil.push({
      id: b.id,
      judul: b.title,
      umurHari: umur,
      nilai: b.bid_value == null ? null : Number(b.bid_value) || 0,
    });
  }
  return hasil.sort((a, b) => b.umurHari - a.umurHari).slice(0, batas);
}

/** Yang ditambahkan web di atas `meta` dari API. */
export interface RingkasanTender {
  /** Penawaran berstatus `diajukan` yang punya tanggal pengajuan. */
  diajukan: number;
  /** Di antaranya, yang menggantung lebih dari ambang. */
  menggantung: number;
  /** Nilai penawaran yang menggantung — bagian pipeline yang paling rapuh. */
  nilaiMenggantung: number;
  /** Umur penawaran tertua yang masih menunggu. `null` bila tak ada. */
  umurTertua: number | null;
  /**
   * Tender `diajukan` TANPA `submitted_at`.
   *
   * Umurnya tak bisa dihitung sama sekali, jadi ia tak pernah masuk hitungan
   * "menggantung" — dan itu justru membuatnya berbahaya: ia tak terlihat di
   * angka mana pun. Dihitung terpisah supaya kartunya bisa mengaku.
   */
  tanpaTanggalAju: number;
}

export function ringkasTender(
  bids: TenderRingkas[], hariIni: string, ambang = 45,
): RingkasanTender {
  const diajukan = bids.filter((b) => b.status === STATUS_DIAJUKAN);
  const umur = diajukan
    .map((b) => ({ b, u: umurPenawaran(b, hariIni) }))
    .filter((x): x is { b: TenderRingkas; u: number } => x.u !== null);
  const lewat = umur.filter((x) => x.u >= ambang);

  return {
    diajukan: diajukan.length,
    menggantung: lewat.length,
    nilaiMenggantung: lewat.reduce((s, x) => s + (Number(x.b.bid_value) || 0), 0),
    umurTertua: umur.length === 0 ? null : Math.max(...umur.map((x) => x.u)),
    tanpaTanggalAju: diajukan.length - umur.length,
  };
}

/** Tanggal hari ini di WIB sebagai `YYYY-MM-DD`. */
export function hariIniWIB(kini: Date = new Date()): string {
  return new Date(kini.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

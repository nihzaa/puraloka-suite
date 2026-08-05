/**
 * MARGIN TEPERCAYA — memisahkan "untung besar" dari "biaya belum dicatat".
 *
 * ── Kenapa perlu
 *
 * Halaman profitabilitas menampilkan delapan proyek bermargin **100%**
 * dan total **94,1%**, semuanya hijau dengan keterangan "sehat ≥20%".
 *
 * Angkanya benar secara aritmetika — diperiksa ke database: nol baris
 * `project_expenses` untuk seluruh proyek aktif. Revenue ada, HPP nol,
 * jadi margin 100%. Rumusnya tidak salah.
 *
 * Yang salah adalah KESIMPULANNYA. Margin kotor 100% di konstruksi tidak
 * mungkin: tak ada proyek yang jadi tanpa upah, material, dan alat.
 * Angka itu bukan kabar baik — ia tanda bahwa biayanya belum masuk
 * sistem. Menampilkannya hijau bersama proyek yang benar-benar sehat
 * membuat keduanya tak terbedakan, dan keputusan (mana proyek yang
 * layak diulang, mana yang perlu ditinjau) diambil dari angka fiksi.
 *
 * Ini kelas yang sama dengan saldo minus yang tampil hijau di /kas:
 * hitungan yang benar, kesimpulan visual yang menyesatkan.
 *
 * ── Ambang 95%
 *
 * Bukan 100% persis. Proyek yang biayanya baru tercatat sebagian —
 * misal satu kasbon kecil dari total pekerjaan — akan menghasilkan 99,7%
 * dan sama tak dipercayanya. Ambang 95% menangkap keduanya.
 *
 * Batas bawah 0 sengaja TIDAK dianggap mencurigakan: margin nol atau
 * negatif adalah keadaan nyata yang memang terjadi, dan menandainya
 * sebagai "data tak lengkap" akan menyembunyikan proyek yang benar-benar
 * merugi — persis kebalikan dari yang dibutuhkan.
 */

/** Di atas ini, margin kotor tak masuk akal untuk pekerjaan konstruksi. */
export const AMBANG_MARGIN_MUSTAHIL = 95;

export type KeandalanMargin = "wajar" | "tanpa-biaya" | "biaya-tak-lengkap";

/**
 * @param marginPct  margin kotor dalam persen
 * @param totalHpp   total harga pokok yang tercatat untuk proyek ini
 */
export function keandalanMargin(marginPct: number, totalHpp: number): KeandalanMargin {
  // Tak ada biaya sama sekali — paling jelas, dan paling sering.
  if (totalHpp === 0 && marginPct > 0) return "tanpa-biaya";
  // Ada biaya, tapi terlalu kecil untuk pekerjaan sebesar itu.
  if (marginPct >= AMBANG_MARGIN_MUSTAHIL) return "biaya-tak-lengkap";
  return "wajar";
}

/** `true` bila angkanya tak boleh dipakai mengambil keputusan apa pun. */
export function marginPerluDicurigai(marginPct: number, totalHpp: number): boolean {
  return keandalanMargin(marginPct, totalHpp) !== "wajar";
}

/**
 * Penjelasan singkat untuk ditampilkan di samping angkanya.
 *
 * Menyebut TINDAKANNYA, bukan cuma menyatakan keraguan: "biaya belum
 * dicatat" memberi tahu apa yang harus dilakukan, sementara "data tidak
 * andal" hanya membuat orang bingung harus ke mana.
 */
export function alasanMarginRagu(keandalan: KeandalanMargin): string | null {
  if (keandalan === "tanpa-biaya") {
    return "Belum ada biaya tercatat — margin ini belum bisa dipakai menilai untung-rugi.";
  }
  if (keandalan === "biaya-tak-lengkap") {
    return "Biaya tercatat jauh lebih kecil daripada nilai pekerjaan — kemungkinan belum lengkap.";
  }
  return null;
}

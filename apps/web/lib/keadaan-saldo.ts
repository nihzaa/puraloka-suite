/**
 * KEADAAN SALDO KAS — minus, tipis, atau wajar.
 *
 * ── Kenapa fungsi terpisah, bukan ungkapan sebaris di JSX
 *
 * Versi sebelumnya ditulis langsung di dalam komponen kartu:
 *
 *     const low = acc.type === "petty_cash" && acc.balance < 500_000;
 *     ...color: low ? C.yellow : acc.balance < 0 ? C.red : C.text
 *
 * Cabang merahnya MATI. Setiap saldo negatif juga memenuhi `< 500_000`,
 * jadi `low` selalu menang lebih dulu dan `balance < 0` tak pernah
 * tercapai. Akibatnya di data nyata kas kecil bersaldo −Rp 213.695.000
 * tampil KUNING dengan label "Saldo rendah" — sama persis dengan kas
 * bersaldo Rp 400.000.
 *
 * Bug ini bertahan karena tak ada yang bisa mengujinya: ia terkubur di
 * dalam ungkapan JSX bersyarat tiga tingkat. Diangkat ke sini supaya
 * bisa dikunci test, dan supaya kartu KPI dengan kartu akun tak bisa
 * menyimpulkan hal berbeda dari angka yang sama.
 *
 * ── Kenapa minus ≠ tipis
 *
 * "Tipis" berarti perlu diisi ulang — pekerjaan rutin bendahara.
 * "Minus" berarti pengeluaran yang tercatat melebihi uang yang pernah
 * masuk. Saldo kas fisik tak bisa negatif, jadi minus SELALU berarti
 * salah satu dari: setoran belum dicatat, atau ada pengeluaran yang
 * salah dibebankan ke akun ini. Keduanya harus ditelusuri, bukan
 * ditenangkan dengan warna kuning.
 */

export type KeadaanSaldo = "minus" | "tipis" | "wajar";

/** Di bawah ini kas kecil dianggap perlu diisi ulang. */
export const AMBANG_TIPIS = 500_000;

/**
 * @param saldo   nominal saldo akun
 * @param jenis   tipe akun; hanya `petty_cash` yang punya ambang "tipis",
 *                karena hanya kas kecil yang diisi ulang berkala. Kas
 *                utama bersaldo kecil itu wajar menjelang penagihan.
 */
export function keadaanSaldo(saldo: number, jenis: string): KeadaanSaldo {
  // Diperiksa LEBIH DULU dan tanpa syarat jenis: saldo negatif adalah
  // kejanggalan pembukuan pada akun apa pun, bukan cuma kas kecil.
  if (saldo < 0) return "minus";
  if (jenis === "petty_cash" && saldo < AMBANG_TIPIS) return "tipis";
  return "wajar";
}

/**
 * Label yang ditampilkan di samping angka.
 *
 * WCAG 1.4.1 — warna saja tak boleh jadi satu-satunya pembawa makna.
 * Kas kecil paling sering dibaca di HP di lapangan, di bawah sinar
 * matahari, tempat beda kuning dan merah praktis hilang.
 *
 * `null` untuk keadaan wajar: label "Saldo wajar" di setiap baris hanya
 * menambah kebisingan dan justru melemahkan dua label yang penting.
 */
export function labelSaldo(keadaan: KeadaanSaldo): string | null {
  if (keadaan === "minus") return "Saldo minus";
  if (keadaan === "tipis") return "Saldo rendah";
  return null;
}

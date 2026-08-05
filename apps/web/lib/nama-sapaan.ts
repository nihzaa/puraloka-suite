/**
 * NAMA SAPAAN — potongan nama yang benar untuk menyapa seseorang.
 *
 * ── Kenapa `split(" ")[0]` salah di sini
 *
 * Portal mandor menyapa dengan `user.name.split(" ")[0]`. Diukur ke basis
 * dev, bukan ditaksir:
 *
 *   "Pak Budi Santoso"    → "Pak"
 *   "Pak Hendra Wijaya"   → "Pak"
 *   "Pak Slamet"          → "Pak"
 *   "Pak Suryo Wibowo"    → "Pak"
 *   "Pak Wahyu Prasetyo"  → "Pak"
 *   "Wardianto"           → "Wardianto"
 *
 * Lima dari enam mandor disapa "Halo, Pak" — sapaan yang identik untuk
 * semua orang, di layar pertama yang mereka buka setiap hari. Nama
 * Indonesia lazim ditulis dengan sapaan di depan, dan di aplikasi
 * konstruksi itu bukan kasus tepi: itu bentuk yang paling umum.
 *
 * ── Yang dikerjakan fungsi ini
 *
 * Sapaan di depan dipertahankan lalu digabung dengan nama sesudahnya —
 * "Pak Budi", bukan "Pak" dan bukan "Budi". Membuang sapaannya justru
 * terasa kurang hormat dalam konteks ini; yang salah adalah membuang
 * NAMANYA.
 *
 * Nama tanpa sapaan tetap dipotong ke kata pertama seperti sebelumnya —
 * "Wardianto Susilo" → "Wardianto".
 */

/**
 * Sapaan yang lazim mendahului nama.
 *
 * Sengaja pendek dan huruf kecil semua — dicocokkan setelah `toLowerCase()`.
 * Daftar yang terlalu panjang mulai menangkap nama sungguhan (mis. "Haji"
 * adalah nama orang bagi sebagian orang), dan salah potong pada nama
 * lebih buruk daripada sapaan yang ikut terbawa.
 */
const SAPAAN = new Set([
  "pak", "bu", "bapak", "ibu", "mas", "mbak", "kak",
  "h.", "hj.", "drs.", "ir.", "dr.",
]);

/**
 * Nama panggilan untuk sapaan di layar.
 *
 * @param nama nama lengkap seperti tersimpan di basis
 * @returns potongan yang pantas disapa, atau string kosong bila tak ada nama
 */
export function namaSapaan(nama: string | null | undefined): string {
  const bersih = (nama ?? "").trim().replace(/\s+/g, " ");
  if (!bersih) return "";

  const kata = bersih.split(" ");
  const pertama = kata[0];

  // Bukan sapaan → perilaku lama, kata pertama saja.
  if (!SAPAAN.has(pertama.toLowerCase())) return pertama;

  // Sapaan tanpa nama sesudahnya ("Pak" saja) — kembalikan apa adanya
  // daripada string kosong; layar yang menyapa "Halo, " lebih buruk.
  if (kata.length === 1) return pertama;

  return `${pertama} ${kata[1]}`;
}

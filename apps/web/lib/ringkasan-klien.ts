/**
 * RINGKASAN KLIEN — agregasi murni untuk dashboard `/klien`.
 *
 * ── Kenapa berkas ini kecil, dan kenapa itu jujur
 *
 * `/api/v1/clients` mengirim satu baris `clients` per klien dan tidak lebih:
 * nama, kontak, tipe, aktif/nonaktif, tanggal dibuat. Tak ada nilai kontrak,
 * jumlah proyek, atau piutang. Agregasi yang bisa dibangun di atasnya karena
 * itu terbatas — dan daftar KPI yang jujur lebih pendek daripada daftar KPI
 * yang diinginkan.
 *
 * Yang TIDAK dilakukan di sini: menghitung "klien terbesar" atau "klien tanpa
 * proyek" dengan memanggil `/clients/:id` sekali per baris. Itu N permintaan
 * untuk satu angka, dan angka yang datang setelah 200 permintaan bukan
 * ringkasan — ia halaman yang tak pernah selesai memuat.
 *
 * ── Kenapa kelengkapan kontak, bukan cacah tipe
 *
 * "Berapa klien perusahaan" sudah terbaca dari tombol saringan. Yang tak
 * terbaca dari mana pun tanpa membuka satu per satu adalah BERAPA yang datanya
 * belum lengkap — dan itu satu-satunya angka di respons ini yang menuntut
 * tindakan, karena kekurangannya selalu ketahuan pada saat paling buruk: saat
 * invoice atau faktur pajaknya harus keluar.
 */

/** Bentuk minimum klien yang dibutuhkan agregasi ini. */
export interface KlienRingkas {
  id: string;
  contact_person: string;
  company_name: string | null;
  phone: string;
  email: string | null;
  npwp: string | null;
  id_number: string | null;
  client_type: "perorangan" | "perusahaan";
  is_active: boolean;
}

/** Sebuah medan dianggap terisi bila bukan null dan bukan spasi belaka. */
const terisi = (v: string | null): boolean => (v ?? "").trim() !== "";

/**
 * Identitas pajak yang RELEVAN menurut tipe kliennya.
 *
 * Perusahaan diperiksa NPWP-nya, perorangan NIK-nya. Memeriksa keduanya untuk
 * semua orang akan menuduh setiap klien perorangan tak lengkap karena tak
 * punya NPWP — dan tuduhan yang selalu muncul akan diabaikan, termasuk saat
 * ia benar.
 */
export function identitasPajakTerisi(k: KlienRingkas): boolean {
  return k.client_type === "perusahaan" ? terisi(k.npwp) : terisi(k.id_number);
}

/** Apa saja yang kurang dari satu klien. Kosong = lengkap. */
export function medanKurang(k: KlienRingkas): string[] {
  const kurang: string[] = [];
  if (!terisi(k.email)) kurang.push("email");
  if (!identitasPajakTerisi(k)) kurang.push(k.client_type === "perusahaan" ? "NPWP" : "NIK");
  // Telepon diperiksa juga meski API mewajibkannya saat membuat: baris lama
  // (sebelum validasi itu ada) dan impor massal bisa menembusnya, dan klien
  // tanpa telepon adalah klien yang tak bisa dihubungi sama sekali.
  if (!terisi(k.phone)) kurang.push("telepon");
  return kurang;
}

/**
 * Klien AKTIF yang datanya belum lengkap.
 *
 * Hanya yang aktif. Klien nonaktif sudah tak dipakai untuk apa pun, dan
 * menagih kelengkapan datanya berarti membuat angka yang tak pernah bisa
 * mencapai nol — angka seperti itu berhenti dibaca.
 */
export function klienTakLengkap(klien: KlienRingkas[]): KlienRingkas[] {
  return klien.filter((k) => k.is_active && medanKurang(k).length > 0);
}

/** KPI dashboard `/klien`, seluruhnya dari satu respons `/api/v1/clients`. */
export interface RingkasanKlien {
  total: number;
  aktif: number;
  nonaktif: number;
  perorangan: number;
  perusahaan: number;
  /** Klien aktif yang setidaknya satu medan kontak/identitasnya kosong. */
  takLengkap: number;
  /** Klien aktif tanpa email — tak bisa dikirimi invoice tanpa mengetik ulang. */
  tanpaEmail: number;
  /** Klien aktif tanpa NPWP (perusahaan) atau NIK (perorangan). */
  tanpaIdentitasPajak: number;
}

export function ringkasKlien(klien: KlienRingkas[]): RingkasanKlien {
  const aktif = klien.filter((k) => k.is_active);
  return {
    total: klien.length,
    aktif: aktif.length,
    nonaktif: klien.length - aktif.length,
    perorangan: klien.filter((k) => k.client_type === "perorangan").length,
    perusahaan: klien.filter((k) => k.client_type === "perusahaan").length,
    takLengkap: klienTakLengkap(klien).length,
    tanpaEmail: aktif.filter((k) => !terisi(k.email)).length,
    tanpaIdentitasPajak: aktif.filter((k) => !identitasPajakTerisi(k)).length,
  };
}

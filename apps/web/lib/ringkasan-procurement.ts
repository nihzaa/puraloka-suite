/**
 * RINGKASAN PROCUREMENT — agregasi murni untuk dashboard `/procurement`.
 *
 * ── Kenapa berkas terpisah, bukan di dalam `page.tsx`
 *
 * Sama alasannya dengan `ringkasan-proyek.ts`: yang paling ingin diuji di
 * sini justru bagian yang paling sunyi kalau salah — batas tanggal janji
 * kirim. "Terlambat kirim" yang menghitung PO yang janjinya HARI INI sebagai
 * terlambat akan menghasilkan angka yang tampak masuk akal di layar, dan
 * tak ada yang akan curiga.
 *
 * ── `hariIni` selalu DISUNTIKKAN, tak pernah dibaca dari `Date.now()`
 *
 * Fungsi yang membaca jam sendiri menghasilkan test yang lulus hari ini dan
 * gagal besok — dan kegagalan itu akan disalahkan pada test-nya, bukan pada
 * kodenya. `hariIniWIB` diimpor ulang dari `ringkasan-proyek.ts`; dua definisi
 * "hari ini" di satu aplikasi adalah dua tanggal yang bisa berbeda.
 *
 * ── Yang SENGAJA tidak dihitung di sini
 *
 * Tak ada penilaian vendor ("supplier X sering telat"). Menghitungnya butuh
 * pembanding antara `expected_delivery_date` dan tanggal penerimaan NYATA
 * per-item, dan `/purchase-orders` hanya mengirim janjinya, bukan realisasi
 * per-tanggal. Angka yang menuduh vendor tanpa bahan lengkap adalah tuduhan
 * yang tak bisa dibantah — dan sekali dicetak di rapat, ia jadi fakta.
 *
 * Tak ada pula "nilai PO bulan ini" versi hitungan sendiri. Angka itu sudah
 * dikirim `/api/v1/procurement/dashboard` (`po_value_this_month`), dihitung
 * di server dari `order_date >= awal bulan`. Menghitung ulang di klien
 * memberi aplikasi dua angka bernama sama dengan cakupan berbeda — daftar PO
 * dibatasi 200 baris teratas, jadi versi klien akan selalu lebih kecil pada
 * perusahaan yang ramai, tanpa satu pun tanda bahwa ia terpotong.
 */

import { selisihHari } from "./ringkasan-proyek";

/** Bentuk minimum Purchase Order yang dibutuhkan agregasi ini. */
export interface PoRingkasan {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  total_amount: number | string;
  supplier?: { id?: string; name?: string } | null;
}

/**
 * Status PO yang sudah SELESAI perjalanannya — tak menunggu apa pun lagi.
 *
 * `fully_received` berarti barangnya sudah masuk seluruhnya; `cancelled`
 * berarti pesanannya tak ada lagi. Keduanya tak boleh ikut terhitung
 * "terbuka", karena PO yang tuntas Januari lalu akan menumpuk selamanya di
 * angka yang seharusnya menyatakan beban hari ini.
 */
const PO_SELESAI = new Set(["fully_received", "cancelled"]);

/**
 * Status PO yang barangnya SEDANG DITUNGGU.
 *
 * `draft` sengaja TIDAK termasuk: PO draft belum dikirim ke supplier sama
 * sekali, jadi tak ada yang sedang menunggu di jalan — yang menunggu justru
 * orang di kantor yang belum menekan "Kirim". Menggabung keduanya membuat
 * angka "menunggu terima" menuduh supplier atas kelambatan sendiri.
 */
const PO_MENUNGGU_BARANG = new Set(["sent", "confirmed", "partially_received"]);

/** PO yang masih berjalan — belum diterima penuh dan belum dibatalkan. */
export function poTerbuka(po: PoRingkasan): boolean {
  return !PO_SELESAI.has(po.status);
}

/** PO yang barangnya sedang ditunggu tiba. */
export function poMenungguTerima(po: PoRingkasan): boolean {
  return PO_MENUNGGU_BARANG.has(po.status);
}

/**
 * PO yang barangnya ditunggu DAN tanggal janji kirimnya sudah lewat.
 *
 * `< 0`, bukan `<= 0`. PO yang dijanjikan tiba HARI INI belum melewati
 * janjinya — barangnya masih bisa datang sore ini. Menandainya merah
 * mengajari orang mengabaikan warna merah, dan setelah itu yang benar-benar
 * telat ikut terlewat.
 *
 * PO tanpa `expected_delivery_date` TIDAK pernah terhitung lewat janji: tak
 * ada janji yang bisa dilanggar. Angkanya lebih kecil dari kenyataan, dan itu
 * disengaja — halaman yang memakainya wajib menyebut berapa PO yang tak
 * punya tanggal janji, supaya kekurangan itu terlihat alih-alih tersembunyi.
 */
export function poLewatJanjiKirim(po: PoRingkasan, hariIni: string): boolean {
  if (!poMenungguTerima(po)) return false;
  if (!po.expected_delivery_date) return false;
  return selisihHari(hariIni, po.expected_delivery_date) < 0;
}

/** PO ditunggu yang janji kirimnya jatuh dalam `ambang` hari ke depan. */
export function poSegeraTiba(po: PoRingkasan, hariIni: string, ambang = 7): boolean {
  if (!poMenungguTerima(po)) return false;
  if (!po.expected_delivery_date) return false;
  const sisa = selisihHari(hariIni, po.expected_delivery_date);
  return sisa >= 0 && sisa <= ambang;
}

/** Satu baris "paling lama menunggu barang". */
export interface BarisTunggu {
  id: string;
  po_number: string;
  supplier: string;
  /** Hari sejak tanggal janji kirim terlewati. Selalu > 0. */
  hariLewat: number;
  nilai: number;
}

/**
 * PO yang paling lama melewati janji kirimnya, terparah lebih dulu.
 *
 * Hanya yang sudah LEWAT janji yang masuk. PO yang barangnya belum jatuh
 * tempo tak menuntut tindakan apa pun, dan memasukkannya ke daftar yang
 * judulnya "paling lama menunggu" berarti pembacanya harus menyaring dengan
 * mata — pekerjaan yang seharusnya sudah dilakukan kodenya.
 */
export function palingLamaMenunggu(
  pos: PoRingkasan[], hariIni: string, batas = 6,
): BarisTunggu[] {
  const hasil: BarisTunggu[] = [];
  for (const po of pos) {
    if (!poLewatJanjiKirim(po, hariIni)) continue;
    hasil.push({
      id: po.id,
      po_number: po.po_number,
      supplier: po.supplier?.name ?? "—",
      hariLewat: -selisihHari(hariIni, po.expected_delivery_date as string),
      nilai: Number(po.total_amount) || 0,
    });
  }
  return hasil.sort((a, b) => b.hariLewat - a.hariLewat).slice(0, batas);
}

/** Keempat KPI §5c beserta angka pendukungnya, dari satu respons PO. */
export interface RingkasanPo {
  terbuka: number;
  /** Nilai total PO terbuka — komitmen yang belum tuntas. */
  nilaiTerbuka: number;
  menungguTerima: number;
  lewatJanjiKirim: number;
  segeraTiba: number;
  /**
   * PO menunggu yang TAK punya `expected_delivery_date`.
   *
   * Diangkat jadi angka tersendiri, bukan disembunyikan: ia yang menjelaskan
   * kenapa "lewat janji kirim" bisa lebih kecil dari yang dirasakan orang di
   * lapangan. PO tanpa tanggal janji tak pernah bisa terhitung terlambat.
   */
  tanpaTanggalJanji: number;
  total: number;
}

export function ringkasPo(pos: PoRingkasan[], hariIni: string): RingkasanPo {
  const terbuka = pos.filter(poTerbuka);
  const menunggu = pos.filter(poMenungguTerima);
  return {
    terbuka: terbuka.length,
    nilaiTerbuka: terbuka.reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
    menungguTerima: menunggu.length,
    lewatJanjiKirim: pos.filter((p) => poLewatJanjiKirim(p, hariIni)).length,
    segeraTiba: pos.filter((p) => poSegeraTiba(p, hariIni)).length,
    tanpaTanggalJanji: menunggu.filter((p) => !p.expected_delivery_date).length,
    total: pos.length,
  };
}

/** Satu baris pada grafik konsentrasi belanja per vendor. */
export interface BarisVendor {
  id: string;
  nama: string;
  nilai: number;
  jumlahPo: number;
  /** Bagian dari total belanja PO terbuka, 0..100. */
  persen: number;
}

/**
 * Vendor dengan komitmen PO terbuka terbesar, beserta porsinya.
 *
 * ── Pertanyaan yang dijawab, dan kenapa daftar tak bisa menjawabnya
 *
 * "Berapa banyak uang pengadaan yang bergantung pada satu vendor?"
 * Daftar PO mengurutkan per PO, bukan per vendor — untuk menjawabnya orang
 * harus menjumlahkan beberapa PO milik vendor yang sama, lalu membaginya
 * dengan total. Itu pekerjaan kalkulator, dan karena itu tak pernah
 * dilakukan sampai ada masalah.
 *
 * Yang dihitung hanya PO TERBUKA: risiko ketergantungan adalah soal uang yang
 * BELUM tuntas. PO yang barangnya sudah masuk penuh tak lagi menyandera
 * siapa pun, dan memasukkannya membuat vendor yang sudah lama selesai
 * menutupi vendor yang sedang memegang pesanan besar hari ini.
 */
export function konsentrasiVendor(
  pos: PoRingkasan[], batas = 6,
): BarisVendor[] {
  const perVendor = new Map<string, BarisVendor>();
  let total = 0;

  for (const po of pos) {
    if (!poTerbuka(po)) continue;
    const nilai = Number(po.total_amount) || 0;
    // PO tanpa supplier tetap ikut TOTAL tapi dikelompokkan terpisah.
    // Membuangnya diam-diam membuat persentase vendor lain tampak lebih
    // besar dari sebenarnya — persis arah kesalahan yang berbahaya di angka
    // yang tugasnya memperingatkan soal ketergantungan.
    const id = po.supplier?.id ?? "tanpa-vendor";
    const nama = po.supplier?.name ?? "Tanpa vendor";
    const ada = perVendor.get(id);
    if (ada) {
      ada.nilai += nilai;
      ada.jumlahPo += 1;
    } else {
      perVendor.set(id, { id, nama, nilai, jumlahPo: 1, persen: 0 });
    }
    total += nilai;
  }

  return [...perVendor.values()]
    .map((v) => ({ ...v, persen: total > 0 ? (v.nilai / total) * 100 : 0 }))
    .sort((a, b) => b.nilai - a.nilai)
    .slice(0, batas);
}

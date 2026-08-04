"use client";

// ============================================================================
// F4-3 — jembatan antara antrean offline dan halaman lapangan.
//
// Kelima jalur tulis lapangan punya bentuk yang persis sama:
//
//     try { await api.post(url, payload); toast("berhasil"); refresh(); }
//     catch (e) { toast(pesanGalat(e)); }
//
// Menyalin logika antrean ke masing-masing berarti lima kesempatan untuk
// salah — dan yang paling mudah salah adalah menampilkan "berhasil" untuk
// kiriman yang justru DITOLAK server, atau menampilkan "tersimpan" untuk
// kiriman yang penyimpanannya penuh dan sebenarnya HILANG.
//
// Fungsi ini memusatkan penerjemahan empat hasil `kirimAtauAntre` menjadi
// satu pesan yang jujur, sehingga halaman hanya perlu tahu: berhasil-atau-
// tidak, dan pesan apa yang ditampilkan.
// ============================================================================

import { kirimAtauAntre } from "@/lib/antrean-offline";

export interface HasilKirim {
  /**
   * `true` bila kiriman AMAN — entah sudah sampai di server, atau tersimpan
   * di antrean dan pasti terkirim nanti. Halaman boleh menutup modal dan
   * mengosongkan form.
   *
   * `false` berarti kirimannya TIDAK tersimpan di mana pun. Form wajib
   * dibiarkan terisi supaya isinya tidak hilang.
   */
  aman: boolean;
  /** `true` hanya bila server benar-benar sudah menerima — layak me-refresh. */
  terkirim: boolean;
  pesan: string;
  /**
   * Isi respons server — HANYA terisi saat `terkirim` bernilai `true`.
   *
   * Sengaja `unknown`: halaman yang membutuhkannya harus menyempitkan tipenya
   * sendiri, dan lebih penting lagi harus lebih dulu memeriksa `terkirim`.
   * Kiriman yang baru DIANTRE belum punya id dari server, dan memakainya
   * seolah ada menghasilkan `undefined` yang menjalar diam-diam.
   */
  data?: unknown;
}

function pesanGalat(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } } };
  return err?.response?.data?.error ?? fallback;
}

/**
 * Kirim data lapangan lewat antrean offline, dengan pesan yang jujur.
 *
 * @param sukses   pesan saat server menerima
 * @param gagal    pesan cadangan bila server menolak tanpa menyebut alasan
 */
export async function kirimLapangan(
  metode: "POST" | "PATCH" | "PUT",
  url: string,
  payload: unknown,
  sukses: string,
  gagal: string,
): Promise<HasilKirim> {
  const h = await kirimAtauAntre(metode, url, payload);

  if (h.status === "terkirim") {
    return { aman: true, terkirim: true, pesan: sukses, data: h.data };
  }

  if (h.status === "diantre") {
    return {
      aman: true,
      terkirim: false,
      pesan: "Tak ada sinyal — tersimpan di perangkat, terkirim otomatis saat sinyal kembali",
    };
  }

  if (h.status === "penuh") {
    // Jujur bahwa kirimannya hilang. Pesan "tersimpan" untuk sesuatu yang
    // tidak tersimpan jauh lebih merugikan daripada galat yang jelas.
    return {
      aman: false,
      terkirim: false,
      pesan: "Penyimpanan perangkat penuh — data TIDAK tersimpan. Cari sinyal lalu ulangi.",
    };
  }

  // `ditolak` — server menjawab dengan galat. Bukan soal sinyal; mengulangnya
  // tak akan menolong, jadi alasan dari server yang ditampilkan.
  return { aman: false, terkirim: false, pesan: pesanGalat(h.galat, gagal) };
}

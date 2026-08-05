"use client";

/**
 * LOKASI PERANGKAT — mengambil koordinat GPS saat foto diunggah (INTI #8).
 *
 * ── Kenapa hook, bukan dipanggil langsung
 *
 * `navigator.geolocation` punya tiga keadaan yang harus ditangani berbeda,
 * dan menuliskannya ulang di tiap tempat unggah berarti tiga peluang salah:
 *
 *   izin ditolak     → jangan tanya lagi, jangan halangi unggahan
 *   sinyal tak ada   → tunggu sebentar, lalu menyerah dengan anggun
 *   akurasi buruk    → tetap dipakai, TAPI angkanya ikut dikirim
 *
 * ── Yang paling dijaga
 *
 * **Kegagalan lokasi TIDAK BOLEH menghalangi unggahan foto.** Sinyal GPS
 * hilang di basement, gudang berdinding beton, dan daerah terpencil — persis
 * tempat yang paling perlu didokumentasikan. Foto tanpa koordinat tetap
 * berguna; foto yang tak pernah terunggah tidak.
 *
 * **Izin diminta saat DIBUTUHKAN, bukan saat halaman dibuka.** Permintaan
 * izin yang muncul tanpa konteks hampir selalu ditolak, dan penolakan itu
 * menetap — merusak fitur untuk selamanya di perangkat itu.
 */

import { useCallback, useRef, useState } from "react";

export interface Lokasi {
  lintang: number;
  bujur: number;
  /** Radius ketidakpastian dalam meter, dari perangkat. */
  akurasi_m: number | null;
  sumber_lokasi: "perangkat";
}

export type StatusLokasi =
  | "idle"
  | "meminta"
  | "dapat"
  | "ditolak"       // pemakai menolak izin
  | "tak-tersedia"  // perangkat/peramban tak punya GPS
  | "gagal";        // sinyal tak ketemu dalam batas waktu

export interface HasilLokasi {
  status: StatusLokasi;
  lokasi: Lokasi | null;
  /** Kalimat siap tampil — bukan kode galat yang harus diterjemahkan UI. */
  pesan: string | null;
  /** Meminta lokasi. Selalu resolve; tak pernah throw. */
  minta: () => Promise<Lokasi | null>;
  reset: () => void;
}

/**
 * Batas waktu 12 detik.
 *
 * GPS dingin (belum pernah dipakai sejak perangkat menyala) butuh 5–10 detik
 * di ruang terbuka. Batas 5 detik yang lazim dipakai akan gagal justru pada
 * pemakaian pertama — dan orang menyimpulkan fiturnya rusak.
 *
 * Lebih dari 15 detik terasa menggantung, dan orang akan menutup halaman.
 */
const BATAS_MS = 12_000;

export function useLokasiPerangkat(): HasilLokasi {
  const [status, setStatus] = useState<StatusLokasi>("idle");
  const [lokasi, setLokasi] = useState<Lokasi | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  // Menahan permintaan ganda: menekan tombol dua kali tak boleh membuka dua
  // dialog izin, dan browser sebagian menganggapnya penyalahgunaan.
  const berjalan = useRef(false);

  const minta = useCallback(async (): Promise<Lokasi | null> => {
    if (berjalan.current) return lokasi;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("tak-tersedia");
      setPesan("Perangkat ini tak mendukung penentuan lokasi.");
      return null;
    }

    berjalan.current = true;
    setStatus("meminta");
    setPesan(null);

    return new Promise<Lokasi | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const l: Lokasi = {
            lintang: pos.coords.latitude,
            bujur: pos.coords.longitude,
            // `accuracy` selalu ada menurut spesifikasi, tapi beberapa
            // peramban lama memulangkan NaN. Disaring di sini supaya API
            // tak menerima nilai yang tak bisa dibandingkan.
            akurasi_m: Number.isFinite(pos.coords.accuracy)
              ? Math.round(pos.coords.accuracy)
              : null,
            sumber_lokasi: "perangkat",
          };
          setLokasi(l);
          setStatus("dapat");
          setPesan(null);
          berjalan.current = false;
          resolve(l);
        },
        (err) => {
          berjalan.current = false;
          // Pesan dibedakan karena TINDAKAN pemakainya berbeda:
          // izin ditolak butuh membuka pengaturan; sinyal hilang cukup
          // pindah ke tempat terbuka.
          if (err.code === err.PERMISSION_DENIED) {
            setStatus("ditolak");
            setPesan("Izin lokasi ditolak. Foto tetap bisa diunggah, tanpa koordinat.");
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setStatus("gagal");
            setPesan("Sinyal GPS tak ditemukan. Coba di tempat lebih terbuka.");
          } else {
            setStatus("gagal");
            setPesan("Lokasi tak didapat dalam 12 detik. Foto tetap bisa diunggah.");
          }
          resolve(null);
        },
        {
          // `enableHighAccuracy` memakai GPS sungguhan, bukan perkiraan dari
          // menara seluler. Lebih lambat dan lebih boros baterai — dan itu
          // pertukaran yang benar di sini: koordinat yang meleset 2 km tak
          // membuktikan apa pun tentang lokasi proyek.
          enableHighAccuracy: true,
          timeout: BATAS_MS,
          // `maximumAge: 0` — jangan pakai posisi lama dari cache. Foto yang
          // diambil sekarang dengan koordinat setengah jam lalu adalah bukti
          // yang menyesatkan.
          maximumAge: 0,
        },
      );
    });
  }, [lokasi]);

  const reset = useCallback(() => {
    setStatus("idle");
    setLokasi(null);
    setPesan(null);
    berjalan.current = false;
  }, []);

  return { status, lokasi, pesan, minta, reset };
}

// Koordinat perangkat saat memotret — mata rantai geotag yang hilang.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-08. Rantai geotag lengkap KECUALI satu mata:
//
//   lib/geotag.ts (haversine, ber-test)          ✅
//   penjaga CI `uji-invarian-geotag.mjs`         ✅
//   rute unggah menulis lintang/bujur/akurasi    ✅  (progress.ts:150)
//   UI membaca & menampilkan penanda lokasi      ✅  (penanda-lokasi.tsx)
//   ADA YANG MEMINTA KOORDINAT DARI PERANGKAT    ❌
//
// Hasilnya: **0 dari 36 foto punya geotag.** Nol kode aplikasi memanggil
// `getCurrentPosition` — seluruh kecocokan grep berasal dari `node_modules`.
//
// Pola yang sama untuk KEEMPAT kalinya dalam dua hari (`rfq.po_id`, endpoint
// penawaran, `rfq.mr_id`, `sumber_change_order_id`): tiap bagian ada dan
// ber-test sendiri-sendiri, hanya sambungannya yang tidak — dan ia lolos
// justru karena tiap bagiannya ber-test.
//
// Penjaga `audit-kolom-tak-tersambung.mjs` yang dibangun pagi ini TIDAK
// menangkap yang ini: ia hanya memeriksa `*_id` di body request. `lintang`
// bukan `*_id`. Batas itu disengaja (versi luasnya menghasilkan 64 temuan
// yang tak terpakai), dan konsekuensinya ini.
//
// ── Kenapa GAGAL adalah keadaan normal, bukan galat
//
// Mandor bisa menolak izin lokasi, berada di dalam gedung tanpa sinyal GPS,
// atau memakai perangkat lama tanpa geolokasi. Ketiganya WAJAR.
//
// Karena itu modul ini **tidak pernah melempar**. Foto tanpa geotag tetap
// berguna; foto yang gagal terunggah tidak. Prioritas itu sama dengan yang
// sudah dipakai jalur unggah (`progress.ts`: "SIMPAN FOTONYA, buang
// koordinatnya").

/**
 * Alasan kegagalan, dalam bahasa yang bisa ditampilkan apa adanya.
 *
 * Dibedakan satu sama lain karena tindakannya berbeda: izin yang ditolak
 * bisa diberikan lagi lewat pengaturan peramban, sedangkan perangkat tanpa
 * geolokasi tak bisa diapa-apakan. Pesan generik "gagal ambil lokasi"
 * membuat orang mencoba hal yang sia-sia.
 */
export const ALASAN_GAGAL = {
  ditolak: "Izin lokasi ditolak — foto tetap terkirim tanpa titik lokasi",
  takTersedia: "Lokasi tak terbaca (sinyal GPS lemah) — foto tetap terkirim",
  waktuHabis: "Lokasi terlalu lama dijawab — foto tetap terkirim tanpa titik",
  takDidukung: "Perangkat ini tak punya lokasi — foto tetap terkirim",
  takMasukAkal: "Lokasi yang dilaporkan perangkat tak masuk akal — diabaikan",
} as const;

export type AlasanGagal = (typeof ALASAN_GAGAL)[keyof typeof ALASAN_GAGAL];

export interface HasilLokasi {
  lintang: number | null;
  bujur: number | null;
  /** Radius ketidakpastian, meter. `null` = perangkat tak melaporkannya. */
  akurasi_m: number | null;
  /** Selalu 'perangkat' di sini — modul ini hanya punya satu sumber. */
  sumber_lokasi: "perangkat";
  /** `null` = berhasil. Berisi kalimat siap tampil bila gagal. */
  gagal: AlasanGagal | null;
}

const KOSONG = (gagal: AlasanGagal): HasilLokasi => ({
  lintang: null, bujur: null, akurasi_m: null, sumber_lokasi: "perangkat", gagal,
});

/** Koordinat yang mungkin ada di bumi — dan bukan NaN. */
function masukAkal(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

export interface OpsiLokasi {
  /**
   * Batas waktu KITA sendiri, milidetik.
   *
   * `getCurrentPosition` punya opsi `timeout`, tapi tak semua peramban
   * menghormatinya — dan perangkat yang menggantung tanpa memanggil callback
   * mana pun membuat unggahan menunggu selamanya. Batas ini yang menjamin
   * promise-nya selalu selesai.
   *
   * 8 detik: cukup untuk GPS dingin di lapangan terbuka, tak cukup lama
   * untuk membuat orang mengira aplikasinya menggantung.
   */
  batasMs?: number;
}

/**
 * Ambil koordinat perangkat. TIDAK PERNAH melempar, TIDAK PERNAH menggantung.
 *
 * INVARIAN yang diuji (`lokasi-perangkat.test.ts`):
 *  - izin ditolak / posisi tak ada / waktu habis → hasil kosong beralasan
 *  - perangkat tanpa geolokasi → hasil kosong, bukan lemparan
 *  - koordinat di luar jangkauan atau NaN → dibuang di sini, tak dikirim
 *  - perangkat yang menggantung → dibatasi waktu sendiri
 *  - akurasi yang tak dilaporkan → null, bukan nol ("tepat sempurna")
 */
export function ambilLokasi(opsi: OpsiLokasi = {}): Promise<HasilLokasi> {
  const batasMs = opsi.batasMs ?? 8000;

  const geo =
    typeof navigator !== "undefined"
      ? (navigator as Navigator).geolocation
      : undefined;
  if (!geo?.getCurrentPosition) {
    return Promise.resolve(KOSONG(ALASAN_GAGAL.takDidukung));
  }

  return new Promise<HasilLokasi>((selesai) => {
    // `sudah` menjaga agar batas waktu dan jawaban perangkat tak sama-sama
    // menyelesaikan promise — yang kedua akan diabaikan React, tapi
    // membiarkannya berarti kode ini bergantung pada perilaku itu.
    let sudah = false;
    const jawab = (h: HasilLokasi) => {
      if (sudah) return;
      sudah = true;
      clearTimeout(pengatur);
      selesai(h);
    };

    const pengatur = setTimeout(() => jawab(KOSONG(ALASAN_GAGAL.waktuHabis)), batasMs);

    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords ?? {};
        if (!masukAkal(latitude, longitude)) {
          jawab(KOSONG(ALASAN_GAGAL.takMasukAkal));
          return;
        }
        jawab({
          lintang: latitude,
          bujur: longitude,
          // Nol akurasi berarti "tepat sempurna" — klaim yang tak pernah
          // benar. Yang tak dilaporkan tetap null.
          akurasi_m:
            typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0
              ? accuracy
              : null,
          sumber_lokasi: "perangkat",
          gagal: null,
        });
      },
      (err) => {
        const kode = (err as GeolocationPositionError | undefined)?.code;
        jawab(KOSONG(
          kode === 1 ? ALASAN_GAGAL.ditolak
          : kode === 2 ? ALASAN_GAGAL.takTersedia
          : kode === 3 ? ALASAN_GAGAL.waktuHabis
          // Kode yang tak dikenal diperlakukan sebagai "tak tersedia":
          // ia menyatakan keadaan tanpa mengklaim tahu sebabnya.
          : ALASAN_GAGAL.takTersedia,
        ));
      },
      {
        // Akurasi tinggi memang lebih lambat dan lebih boros baterai, tapi
        // ini bukti lokasi kerja — 2 km meleset membuat seluruh catatannya
        // tak berguna dalam sengketa.
        enableHighAccuracy: true,
        timeout: batasMs,
        // Lokasi lama boleh dipakai kalau baru saja diambil: mandor yang
        // memotret lima foto berturut-turut tak perlu lima kali penguncian
        // GPS. Satu menit cukup dekat untuk satu titik kerja yang sama.
        maximumAge: 60_000,
      },
    );
  });
}

import { describe, it, expect, vi } from "vitest";
import { ambilLokasi, ALASAN_GAGAL } from "./lokasi-perangkat";

/**
 * Mengambil koordinat perangkat saat memotret.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08 — rantai geotag lengkap KECUALI satu mata:
 *
 *   lib/geotag.ts (haversine, ber-test)          ✅
 *   penjaga CI `uji-invarian-geotag.mjs`         ✅
 *   rute unggah menulis lintang/bujur/akurasi    ✅
 *   UI membaca & menampilkan penanda lokasi      ✅
 *   ADA YANG MEMINTA KOORDINAT DARI PERANGKAT    ❌
 *
 * Hasilnya: **0 dari 36 foto punya geotag.** Nol kode aplikasi memanggil
 * `getCurrentPosition` — seluruh kecocokan grep berasal dari `node_modules`.
 *
 * Pola yang sama untuk keempat kalinya dalam dua hari (po_id, endpoint
 * penawaran, mr_id, sumber_change_order_id): tiap bagian ada dan ber-test
 * sendiri-sendiri, hanya sambungannya yang tidak.
 *
 * ── Kenapa GAGAL adalah keadaan normal, bukan galat
 *
 * Mandor bisa menolak izin lokasi, berada di dalam gedung tanpa sinyal GPS,
 * atau memakai perangkat tanpa geolokasi. Ketiganya **wajar**, dan tak satu
 * pun boleh membatalkan unggahan foto.
 *
 * Foto tanpa geotag tetap berguna. Foto yang gagal terunggah tidak.
 */

const mockGeo = (impl: unknown) => {
  vi.stubGlobal("navigator", { geolocation: impl });
};

describe("ambilLokasi — jalur berhasil", () => {
  it("mengembalikan koordinat perangkat", async () => {
    mockGeo({
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: -6.9024, longitude: 107.6186, accuracy: 12 } }),
    });
    const h = await ambilLokasi();
    expect(h.lintang).toBe(-6.9024);
    expect(h.bujur).toBe(107.6186);
    expect(h.akurasi_m).toBe(12);
    expect(h.gagal).toBeNull();
  });

  // Server memakainya sebagai bawaan, tapi klien yang TAHU sumbernya harus
  // menyatakannya — menebak di server melemahkan bukti tanpa alasan.
  it("menyatakan sumbernya 'perangkat'", async () => {
    mockGeo({
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 0, longitude: 0, accuracy: 5 } }),
    });
    expect((await ambilLokasi()).sumber_lokasi).toBe("perangkat");
  });

  // Akurasi yang tak dilaporkan perangkat ≠ akurasi nol. Nol berarti
  // "tepat sempurna", dan itu klaim yang tak pernah benar.
  it("akurasi yang tak dilaporkan jadi null, bukan nol", async () => {
    mockGeo({
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 1, longitude: 2 } }),
    });
    expect((await ambilLokasi()).akurasi_m).toBeNull();
  });
});

describe("ambilLokasi — gagal TIDAK boleh melempar", () => {
  // INVARIAN INTI. Kalau modul ini melempar, satu `await` yang lupa
  // dibungkus try akan membatalkan unggahan foto — dan foto tanpa geotag
  // jauh lebih berguna daripada foto yang tak terunggah.
  it("izin ditolak → hasil tanpa koordinat, bukan lemparan", async () => {
    mockGeo({
      getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) =>
        err({ code: 1, message: "User denied Geolocation" }),
    });
    const h = await ambilLokasi();
    expect(h.lintang).toBeNull();
    expect(h.gagal).toBe(ALASAN_GAGAL.ditolak);
  });

  it("posisi tak tersedia → alasan yang membedakannya dari penolakan", async () => {
    mockGeo({
      getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) =>
        err({ code: 2, message: "Position unavailable" }),
    });
    expect((await ambilLokasi()).gagal).toBe(ALASAN_GAGAL.takTersedia);
  });

  it("waktu habis → alasannya sendiri", async () => {
    mockGeo({
      getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) =>
        err({ code: 3, message: "Timeout" }),
    });
    expect((await ambilLokasi()).gagal).toBe(ALASAN_GAGAL.waktuHabis);
  });

  // Perangkat lama, atau peramban tanpa API geolokasi sama sekali.
  it("perangkat tanpa geolokasi → hasil kosong, bukan lemparan", async () => {
    vi.stubGlobal("navigator", {});
    const h = await ambilLokasi();
    expect(h.lintang).toBeNull();
    expect(h.gagal).toBe(ALASAN_GAGAL.takDidukung);
  });

  // Perangkat yang melaporkan koordinat di luar jangkauan bumi. Server juga
  // menolaknya (constraint migrasi 190), tapi mengirim yang jelas salah
  // membuat log server penuh peringatan untuk hal yang bisa dicegah di sini.
  it("koordinat di luar jangkauan dibuang, bukan dikirim", async () => {
    mockGeo({
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 999, longitude: 0, accuracy: 5 } }),
    });
    const h = await ambilLokasi();
    expect(h.lintang).toBeNull();
    expect(h.gagal).toBe(ALASAN_GAGAL.takMasukAkal);
  });

  it("koordinat NaN dibuang", async () => {
    mockGeo({
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: NaN, longitude: 107, accuracy: 5 } }),
    });
    expect((await ambilLokasi()).lintang).toBeNull();
  });

  // Perangkat yang menggantung: `getCurrentPosition` tak pernah memanggil
  // callback mana pun. Tanpa batas waktu SENDIRI, unggahan menunggu selamanya.
  it("perangkat yang menggantung dibatasi waktu", async () => {
    mockGeo({ getCurrentPosition: () => { /* tak pernah menjawab */ } });
    const h = await ambilLokasi({ batasMs: 30 });
    expect(h.lintang).toBeNull();
    expect(h.gagal).toBe(ALASAN_GAGAL.waktuHabis);
  });
});

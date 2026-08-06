import { describe, it, expect } from "vitest";
import {
  hariIniWIB, ringkasAset, selisihHariAset, sewaJatuhTempo,
  sewaLewatTanggalSelesai, sewaPerluDiputuskan, sewaTanpaAkhir,
  type AsetRingkas, type SewaRingkas,
} from "./ringkasan-aset";

const aset = (p: Partial<AsetRingkas> = {}): AsetRingkas => ({
  id: "a1", name: "Molen", ownership: "milik", status: "tersedia",
  condition: "baik", purchase_price: 10_000_000, nilai_buku: 8_000_000,
  sudah_disusutkan: true,
  ...p,
});

const sewa = (p: Partial<SewaRingkas> = {}): SewaRingkas => ({
  id: "s1", item_name: "Excavator", status: "berjalan",
  rate: 1_000_000, rate_unit: "hari",
  start_date: "2026-07-01", end_date: "2026-09-01",
  biaya_sampai_kini: 5_000_000,
  ...p,
});

describe("selisihHariAset — tanpa zona waktu", () => {
  it("menghitung jarak hari yang lurus", () => {
    expect(selisihHariAset("2026-08-07", "2026-08-14")).toBe(7);
    expect(selisihHariAset("2026-08-14", "2026-08-07")).toBe(-7);
    expect(selisihHariAset("2026-08-07", "2026-08-07")).toBe(0);
  });

  it("melintasi batas bulan dan tahun", () => {
    expect(selisihHariAset("2026-12-31", "2027-01-01")).toBe(1);
    expect(selisihHariAset("2026-02-28", "2026-03-01")).toBe(1);
    expect(selisihHariAset("2024-02-28", "2024-03-01")).toBe(2);
  });

  it("mengabaikan bagian jam pada timestamp", () => {
    expect(selisihHariAset("2026-08-07", "2026-08-08T23:59:59Z")).toBe(1);
  });
});

describe("sewaJatuhTempo — batas yang paling mudah salah", () => {
  it("berakhir HARI INI tetap dihitung jatuh tempo", () => {
    // Sewa yang berakhir hari ini justru yang paling menuntut keputusan pagi
    // ini: perpanjang atau kembalikan. Mengeluarkannya dari hitungan membuat
    // alat terlanjur tersewa satu satuan tambahan tanpa ada yang memutuskan.
    expect(
      sewaJatuhTempo(sewa({ end_date: "2026-08-07" }), "2026-08-07"),
      "sewa yang berakhir hari ini tak terhitung jatuh tempo",
    ).toBe(true);
  });

  it("tepat di ambang 30 hari masuk, 31 hari tidak", () => {
    expect(sewaJatuhTempo(sewa({ end_date: "2026-09-06" }), "2026-08-07")).toBe(true);
    expect(sewaJatuhTempo(sewa({ end_date: "2026-09-07" }), "2026-08-07")).toBe(false);
  });

  it("yang sudah lewat tanggal BUKAN jatuh tempo — ia keadaan lain", () => {
    // Dua keadaan berbeda dengan tindakan berbeda. Mencampurnya menyembunyikan
    // yang kedua, dan yang kedua itulah yang biayanya sedang salah bertambah.
    expect(sewaJatuhTempo(sewa({ end_date: "2026-08-06" }), "2026-08-07")).toBe(false);
    expect(sewaLewatTanggalSelesai(sewa({ end_date: "2026-08-06" }), "2026-08-07")).toBe(true);
  });

  it("sewa selesai/batal tak pernah jatuh tempo meski tanggalnya dekat", () => {
    expect(sewaJatuhTempo(sewa({ status: "selesai", end_date: "2026-08-08" }), "2026-08-07")).toBe(false);
    expect(sewaJatuhTempo(sewa({ status: "batal", end_date: "2026-08-08" }), "2026-08-07")).toBe(false);
  });

  it("sewa tanpa tanggal selesai bukan jatuh tempo, tapi terbuka", () => {
    expect(sewaJatuhTempo(sewa({ end_date: null }), "2026-08-07")).toBe(false);
    expect(sewaTanpaAkhir(sewa({ end_date: null }))).toBe(true);
  });
});

describe("sewaLewatTanggalSelesai", () => {
  it("berakhir hari ini BELUM lewat", () => {
    expect(sewaLewatTanggalSelesai(sewa({ end_date: "2026-08-07" }), "2026-08-07")).toBe(false);
  });

  it("sewa yang sudah ditutup tak pernah lewat, seberapa lama pun", () => {
    // Kalau statusnya tak diperiksa, setiap sewa lama yang sudah beres akan
    // terhitung "lewat" selamanya, dan angkanya bertambah tiap sewa yang tuntas.
    expect(sewaLewatTanggalSelesai(sewa({ status: "selesai", end_date: "2020-01-01" }), "2026-08-07")).toBe(false);
  });

  it("sewa terbuka tak pernah lewat — tak ada tanggal untuk dilewati", () => {
    expect(sewaLewatTanggalSelesai(sewa({ end_date: null }), "2026-08-07")).toBe(false);
  });
});

describe("sewaPerluDiputuskan — urutan mendesak", () => {
  it("yang sudah lewat tanggal muncul sebelum yang baru akan jatuh tempo", () => {
    const hasil = sewaPerluDiputuskan([
      sewa({ id: "dekat", end_date: "2026-08-20" }),
      sewa({ id: "lewat", end_date: "2026-07-20" }),
    ], "2026-08-07");
    expect(hasil.map((h) => h.id)).toEqual(["lewat", "dekat"]);
    expect(hasil[0].sisaHari).toBe(-18);
  });

  it("sewa tanpa akhir selalu di belakang yang punya tanggal", () => {
    // Sewa harian memang lazim dibuka tanpa akhir. Menaruhnya di atas akan
    // menenggelamkan sewa yang benar-benar salah.
    const hasil = sewaPerluDiputuskan([
      sewa({ id: "terbuka", end_date: null }),
      sewa({ id: "lewat", end_date: "2026-07-20" }),
    ], "2026-08-07");
    expect(hasil.map((h) => h.id)).toEqual(["lewat", "terbuka"]);
    expect(hasil[1].sisaHari).toBeNull();
  });

  it("dua sewa tanpa akhir diurut menurut biaya terbesar", () => {
    const hasil = sewaPerluDiputuskan([
      sewa({ id: "kecil", end_date: null, biaya_sampai_kini: 1_000_000 }),
      sewa({ id: "besar", end_date: null, biaya_sampai_kini: 9_000_000 }),
    ], "2026-08-07");
    expect(hasil.map((h) => h.id)).toEqual(["besar", "kecil"]);
  });

  it("sewa yang tenang tidak masuk daftar sama sekali", () => {
    // Berakhir 6 bulan lagi: tak ada yang perlu diputuskan hari ini.
    expect(sewaPerluDiputuskan([sewa({ end_date: "2027-02-01" })], "2026-08-07")).toEqual([]);
  });

  it("menghormati batas jumlah baris", () => {
    const banyak = Array.from({ length: 20 }, (_, i) =>
      sewa({ id: `s${i}`, end_date: "2026-08-10" }));
    expect(sewaPerluDiputuskan(banyak, "2026-08-07", 6)).toHaveLength(6);
  });
});

describe("ringkasAset", () => {
  it("hanya menghitung aset MILIK untuk nilai buku", () => {
    // Aset sewa muncul di respons yang sama. Menjumlahkan nilai bukunya berarti
    // mencatat barang orang lain sebagai harta perusahaan.
    const r = ringkasAset([
      aset({ id: "m", ownership: "milik", nilai_buku: 5_000_000 }),
      aset({ id: "s", ownership: "sewa", nilai_buku: 99_000_000 }),
    ], [], "2026-08-07");
    expect(r.nilaiBuku).toBe(5_000_000);
    expect(r.milik).toBe(1);
  });

  it("memisahkan rusak dari perawatan, dan menjumlahkannya ke takSiap", () => {
    const r = ringkasAset([
      aset({ id: "1", status: "rusak" }),
      aset({ id: "2", status: "perawatan" }),
      aset({ id: "3", status: "dipakai" }),
      aset({ id: "4", status: "tersedia" }),
    ], [], "2026-08-07");
    expect(r.rusak).toBe(1);
    expect(r.perawatan).toBe(1);
    expect(r.takSiap).toBe(2);
    expect(r.dipakai).toBe(1);
  });

  it("menghitung aset tanpa harga perolehan — bukan menganggapnya nol", () => {
    // Harga kosong membuat nilai bukunya nol, dan total perusahaan terlihat
    // lebih kecil dari kenyataan. Angka itu harus bisa disebut kartunya.
    const r = ringkasAset([
      aset({ id: "1", purchase_price: null, nilai_buku: 0 }),
      aset({ id: "2", purchase_price: 10_000_000 }),
    ], [], "2026-08-07");
    expect(r.tanpaHargaPerolehan).toBe(1);
  });

  it("biaya sewa berjalan hanya dari yang berstatus berjalan", () => {
    const r = ringkasAset([], [
      sewa({ id: "1", status: "berjalan", biaya_sampai_kini: 3_000_000 }),
      sewa({ id: "2", status: "selesai", biaya_sampai_kini: 50_000_000 }),
    ], "2026-08-07");
    expect(r.biayaSewaBerjalan).toBe(3_000_000);
    expect(r.sewaBerjalan).toBe(1);
  });

  it("daftar kosong menghasilkan nol di semua angka, bukan NaN", () => {
    const r = ringkasAset([], [], "2026-08-07");
    expect(r.nilaiBuku).toBe(0);
    expect(r.biayaSewaBerjalan).toBe(0);
    expect(r.takSiap).toBe(0);
    expect(Number.isNaN(r.nilaiBuku)).toBe(false);
  });

  it("nilai yang datang sebagai teks tetap terjumlah sebagai angka", () => {
    // Numeric Postgres kadang tiba sebagai string lewat JSON.
    const r = ringkasAset(
      [aset({ nilai_buku: "2500000" as unknown as number })], [], "2026-08-07");
    expect(r.nilaiBuku).toBe(2_500_000);
  });
});

describe("hariIniWIB", () => {
  it("memberi tanggal kalender WIB, bukan UTC", () => {
    // 2026-08-07 20:00 UTC = 2026-08-08 03:00 WIB. Memakai tanggal UTC di sini
    // membuat catatan sore hari tercatat di hari sebelumnya.
    expect(hariIniWIB(new Date("2026-08-07T20:00:00Z"))).toBe("2026-08-08");
    expect(hariIniWIB(new Date("2026-08-07T10:00:00Z"))).toBe("2026-08-07");
  });
});

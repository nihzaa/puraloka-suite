import { describe, it, expect } from "vitest";
import {
  hariIniWIB, penawaranMenggantung, ringkasTender, selisihHariTender,
  umurPenawaran, type TenderRingkas,
} from "./ringkasan-tender";

const bid = (p: Partial<TenderRingkas> = {}): TenderRingkas => ({
  id: "b1", title: "Tender Gedung A", status: "diajukan",
  bid_value: 1_000_000_000, submitted_at: "2026-06-01", decided_at: null,
  ...p,
});

describe("selisihHariTender", () => {
  it("menghitung jarak hari yang lurus", () => {
    expect(selisihHariTender("2026-08-07", "2026-08-14")).toBe(7);
    expect(selisihHariTender("2026-08-14", "2026-08-07")).toBe(-7);
  });

  it("mengabaikan bagian jam pada timestamp", () => {
    // `submitted_at` datang sebagai timestamptz dari API, bukan tanggal polos.
    expect(selisihHariTender("2026-08-07", "2026-08-08T23:59:59Z")).toBe(1);
  });
});

describe("umurPenawaran", () => {
  it("menghitung umur sejak diajukan", () => {
    expect(umurPenawaran(bid({ submitted_at: "2026-07-08" }), "2026-08-07")).toBe(30);
  });

  it("diajukan HARI INI berumur nol, bukan null", () => {
    // Nol berarti "baru saja diajukan" — pernyataan yang berbeda dari
    // "tak bisa dihitung", dan hanya yang kedua yang pantas disembunyikan.
    expect(umurPenawaran(bid({ submitted_at: "2026-08-07" }), "2026-08-07")).toBe(0);
  });

  it("hanya status `diajukan` yang punya umur", () => {
    // prospek & go belum dikirim ke siapa pun — tak ada jawaban yang ditunggu.
    for (const s of ["prospek", "go", "no_go", "menang", "kalah", "batal"]) {
      expect(umurPenawaran(bid({ status: s }), "2026-08-07"), s).toBeNull();
    }
  });

  it("tanpa tanggal pengajuan = null, bukan nol", () => {
    expect(umurPenawaran(bid({ submitted_at: null }), "2026-08-07")).toBeNull();
  });

  it("tanggal pengajuan di masa depan = null, bukan angka negatif", () => {
    // Salah input. Angka negatif akan lolos setiap ambang "lebih dari N hari"
    // dan barisnya tak pernah terlihat oleh siapa pun.
    expect(umurPenawaran(bid({ submitted_at: "2026-09-01" }), "2026-08-07")).toBeNull();
  });
});

describe("penawaranMenggantung", () => {
  it("mengurutkan yang paling lama menggantung lebih dulu", () => {
    const hasil = penawaranMenggantung([
      bid({ id: "baru", submitted_at: "2026-06-15" }),
      bid({ id: "lama", submitted_at: "2026-01-10" }),
    ], "2026-08-07");
    expect(hasil.map((h) => h.id)).toEqual(["lama", "baru"]);
  });

  it("tepat di ambang masuk, sehari di bawahnya tidak", () => {
    const tepat = penawaranMenggantung([bid({ submitted_at: "2026-06-23" })], "2026-08-07", 45);
    expect(tepat).toHaveLength(1);
    expect(tepat[0].umurHari).toBe(45);

    const kurang = penawaranMenggantung([bid({ submitted_at: "2026-06-24" })], "2026-08-07", 45);
    expect(kurang).toHaveLength(0);
  });

  it("tender yang sudah diputuskan tak pernah menggantung", () => {
    // Menang/kalah bulan lalu bukan penawaran yang sedang ditunggu.
    const hasil = penawaranMenggantung([
      bid({ status: "menang", submitted_at: "2025-01-01" }),
      bid({ status: "kalah", submitted_at: "2025-01-01" }),
    ], "2026-08-07");
    expect(hasil).toEqual([]);
  });

  it("nilai penawaran kosong tetap ditampilkan sebagai null, bukan nol", () => {
    // "Rp 0" akan terbaca sebagai penawaran tanpa nilai, padahal nilainya
    // hanya belum diisi — dua hal yang berbeda.
    const hasil = penawaranMenggantung([bid({ bid_value: null })], "2026-08-07");
    expect(hasil[0].nilai).toBeNull();
  });

  it("menghormati batas jumlah baris", () => {
    const banyak = Array.from({ length: 20 }, (_, i) =>
      bid({ id: `b${i}`, submitted_at: "2026-01-01" }));
    expect(penawaranMenggantung(banyak, "2026-08-07", 45, 6)).toHaveLength(6);
  });
});

describe("ringkasTender", () => {
  it("memisahkan yang menggantung dari total diajukan", () => {
    const r = ringkasTender([
      bid({ id: "1", submitted_at: "2026-01-01" }),   // 218 hari
      bid({ id: "2", submitted_at: "2026-08-01" }),   // 6 hari
      bid({ id: "3", status: "menang" }),
    ], "2026-08-07", 45);
    expect(r.diajukan).toBe(2);
    expect(r.menggantung).toBe(1);
    expect(r.umurTertua).toBe(218);
  });

  it("menjumlahkan nilai HANYA dari yang menggantung", () => {
    const r = ringkasTender([
      bid({ id: "1", submitted_at: "2026-01-01", bid_value: 500_000_000 }),
      bid({ id: "2", submitted_at: "2026-08-06", bid_value: 900_000_000 }),
    ], "2026-08-07", 45);
    expect(r.nilaiMenggantung).toBe(500_000_000);
  });

  it("menghitung tender diajukan yang tanggal ajunya kosong", () => {
    // Umurnya tak terhitung, jadi ia tak pernah masuk "menggantung" — dan
    // justru karena itu ia harus punya angkanya sendiri, bukan hilang senyap.
    const r = ringkasTender([
      bid({ id: "1", submitted_at: null }),
      bid({ id: "2", submitted_at: "2026-08-01" }),
    ], "2026-08-07");
    expect(r.diajukan).toBe(2);
    expect(r.tanpaTanggalAju).toBe(1);
  });

  it("umurTertua null bila tak ada satu pun penawaran menunggu", () => {
    // `null`, bukan 0 — "tak ada yang menunggu" sangat berbeda dari
    // "ada yang baru saja diajukan hari ini".
    const r = ringkasTender([bid({ status: "menang" })], "2026-08-07");
    expect(r.umurTertua).toBeNull();
    expect(r.diajukan).toBe(0);
  });

  it("daftar kosong tak menghasilkan NaN", () => {
    const r = ringkasTender([], "2026-08-07");
    expect(r.nilaiMenggantung).toBe(0);
    expect(r.umurTertua).toBeNull();
    expect(Number.isNaN(r.nilaiMenggantung)).toBe(false);
  });
});

describe("hariIniWIB", () => {
  it("memberi tanggal kalender WIB, bukan UTC", () => {
    expect(hariIniWIB(new Date("2026-08-07T20:00:00Z"))).toBe("2026-08-08");
  });
});

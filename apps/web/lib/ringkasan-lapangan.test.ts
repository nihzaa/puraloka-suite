import { describe, expect, it } from "vitest";
import {
  hariIniWIB,
  ringkasLapangan,
  selisihHari,
  type ProyekLapangan,
} from "./ringkasan-lapangan";

const HARI_INI = "2026-08-07";

function proyek(p: Partial<ProyekLapangan> = {}): ProyekLapangan {
  return {
    id: "p1",
    name: "Proyek Satu",
    status: "active",
    progress_pct: 40,
    end_date: "2026-12-31",
    ...p,
  };
}

describe("selisihHari", () => {
  it("nol untuk tanggal yang sama", () => {
    expect(selisihHari(HARI_INI, HARI_INI)).toBe(0);
  });

  it("negatif untuk tanggal yang sudah lewat", () => {
    expect(selisihHari(HARI_INI, "2026-08-05")).toBe(-2);
  });

  it("menyeberangi batas tahun dengan benar", () => {
    expect(selisihHari("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("hariIniWIB", () => {
  it("menghasilkan format YYYY-MM-DD", () => {
    expect(hariIniWIB()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ringkasLapangan — proyek berjalan", () => {
  it("menghitung hanya proyek yang belum selesai/batal", () => {
    const r = ringkasLapangan(
      [
        proyek({ id: "a", status: "active" }),
        proyek({ id: "b", status: "on_hold" }),
        proyek({ id: "c", status: "completed" }),
        proyek({ id: "d", status: "cancelled" }),
      ],
      null,
      HARI_INI,
    );
    expect(r.proyekBerjalan).toBe(2);
    expect(r.daftar).toHaveLength(2);
  });

  it("nol untuk daftar kosong", () => {
    const r = ringkasLapangan([], null, HARI_INI);
    expect(r.proyekBerjalan).toBe(0);
    expect(r.lewatTenggat).toBe(0);
    expect(r.daftar).toHaveLength(0);
  });

  it("membaca progress_pct bertipe string (numeric dari Postgres)", () => {
    const r = ringkasLapangan([proyek({ progress_pct: "62.5" })], null, HARI_INI);
    expect(r.daftar[0].serapan).toBe(62.5);
  });

  it("memperlakukan progress_pct tak terbaca sebagai nol, bukan NaN", () => {
    const r = ringkasLapangan([proyek({ progress_pct: "entah" })], null, HARI_INI);
    expect(r.daftar[0].serapan).toBe(0);
  });
});

describe("ringkasLapangan — lewat tenggat", () => {
  it("menghitung proyek berjalan yang tanggal selesainya sudah lewat", () => {
    const r = ringkasLapangan(
      [
        proyek({ id: "a", end_date: "2026-08-01" }),
        proyek({ id: "b", end_date: "2026-12-31" }),
      ],
      null,
      HARI_INI,
    );
    expect(r.lewatTenggat).toBe(1);
  });

  it("proyek yang tenggatnya TEPAT hari ini belum terhitung lewat", () => {
    // Hari terakhir masih hari kerja penuh. Menuduhnya terlambat pagi ini
    // adalah tuduhan yang belum bisa dibuktikan.
    const r = ringkasLapangan([proyek({ end_date: HARI_INI })], null, HARI_INI);
    expect(r.lewatTenggat).toBe(0);
    expect(r.daftar[0].sisaHari).toBe(0);
  });

  it("TIDAK menghitung proyek selesai walau tanggalnya sudah lewat", () => {
    const r = ringkasLapangan(
      [proyek({ status: "completed", end_date: "2020-01-01" })],
      null,
      HARI_INI,
    );
    expect(r.lewatTenggat).toBe(0);
  });

  it("proyek tanpa tanggal selesai tidak dituduh lewat tenggat", () => {
    const r = ringkasLapangan([proyek({ end_date: "" })], null, HARI_INI);
    expect(r.lewatTenggat).toBe(0);
    expect(r.proyekBerjalan).toBe(1);
  });

  it("mengurutkan yang tenggatnya paling dekat di atas", () => {
    const r = ringkasLapangan(
      [
        proyek({ id: "a", end_date: "2026-12-31" }),
        proyek({ id: "b", end_date: "2026-08-01" }),
        proyek({ id: "c", end_date: "2026-09-15" }),
      ],
      null,
      HARI_INI,
    );
    expect(r.daftar.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("proyek tanpa tanggal selesai jatuh ke urutan paling bawah", () => {
    const r = ringkasLapangan(
      [
        proyek({ id: "tanpa", end_date: "" }),
        proyek({ id: "ada", end_date: "2026-12-31" }),
      ],
      null,
      HARI_INI,
    );
    expect(r.daftar.map((p) => p.id)).toEqual(["ada", "tanpa"]);
  });
});

describe("ringkasLapangan — instruksi menunggu bukti", () => {
  it("meneruskan angka dari rincian fokus apa adanya", () => {
    const r = ringkasLapangan(
      [proyek()],
      { instruksi_belum_dikonfirmasi: 4 },
      HARI_INI,
    );
    expect(r.instruksiMenungguBukti).toBe(4);
  });

  it("nol saat fokus tak tersedia — pemanggil yang menyembunyikan kartunya", () => {
    // Fungsi ini tak bisa membedakan "benar-benar nol" dari "gagal dimuat";
    // itu tugas pemanggil, yang memegang `null`-nya. Yang dijamin di sini:
    // ia tak pernah melempar dan tak pernah mengarang angka.
    const r = ringkasLapangan([proyek()], null, HARI_INI);
    expect(r.instruksiMenungguBukti).toBe(0);
  });

  it("nol yang sah tetap nol", () => {
    const r = ringkasLapangan(
      [proyek()],
      { instruksi_belum_dikonfirmasi: 0 },
      HARI_INI,
    );
    expect(r.instruksiMenungguBukti).toBe(0);
  });
});

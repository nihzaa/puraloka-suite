import { describe, it, expect } from "vitest";
import {
  hariIniWIB, lewatTenggat, palingTertinggal, progresSeharusnya,
  ringkasProyek, segeraJatuhTempo, selesaiBulanIni, selisihHari,
  type ProyekRingkas,
} from "./ringkasan-proyek";

/** Proyek contoh — hanya field yang diminta tipe, sisanya diisi per-test. */
const buat = (p: Partial<ProyekRingkas> = {}): ProyekRingkas => ({
  id: "p1", name: "Proyek", status: "active",
  progress_pct: 0, contract_value: 0,
  start_date: "2026-01-01", end_date: "2026-12-31", actual_end_date: null,
  ...p,
});

describe("selisihHari — tanpa zona waktu", () => {
  it("menghitung jarak hari yang lurus", () => {
    expect(selisihHari("2026-08-07", "2026-08-14")).toBe(7);
    expect(selisihHari("2026-08-14", "2026-08-07")).toBe(-7);
    expect(selisihHari("2026-08-07", "2026-08-07")).toBe(0);
  });

  it("melintasi batas bulan dan tahun", () => {
    expect(selisihHari("2026-12-31", "2027-01-01")).toBe(1);
    expect(selisihHari("2026-02-28", "2026-03-01")).toBe(1); // 2026 bukan kabisat
    expect(selisihHari("2024-02-28", "2024-03-01")).toBe(2); // 2024 kabisat
  });

  it("mengabaikan bagian jam pada timestamp", () => {
    // `actual_end_date` kadang datang sebagai timestamp penuh dari API.
    expect(selisihHari("2026-08-07", "2026-08-08T23:59:59Z")).toBe(1);
  });
});

describe("lewatTenggat — tenggat HARI INI belum terlambat", () => {
  it("kemarin = lewat", () => {
    expect(lewatTenggat(buat({ end_date: "2026-08-06" }), "2026-08-07")).toBe(true);
  });

  it("hari ini = BELUM lewat", () => {
    // Batas yang paling mudah salah. Proyek yang tenggatnya hari ini masih
    // punya sisa jam kerja; menandainya merah mengajari orang mengabaikan
    // warna merah, dan setelah itu yang benar-benar telat ikut terlewat.
    expect(
      lewatTenggat(buat({ end_date: "2026-08-07" }), "2026-08-07"),
      "proyek yang tenggatnya hari ini ditandai terlambat",
    ).toBe(false);
  });

  it("besok = belum lewat", () => {
    expect(lewatTenggat(buat({ end_date: "2026-08-08" }), "2026-08-07")).toBe(false);
  });

  it("yang sudah selesai atau batal tak pernah lewat tenggat", () => {
    // Proyek selesai November 2025 dengan end_date Oktober 2025 akan
    // terhitung "telat" selamanya kalau statusnya tak diperiksa — dan
    // angkanya bertambah tiap kali ada proyek yang tuntas.
    expect(lewatTenggat(buat({ end_date: "2020-01-01", status: "completed" }), "2026-08-07")).toBe(false);
    expect(lewatTenggat(buat({ end_date: "2020-01-01", status: "cancelled" }), "2026-08-07")).toBe(false);
  });

  it("draft dan on_hold yang lewat tenggat TETAP dihitung", () => {
    // Sengaja: proyek yang ditunda melewati tenggatnya adalah persis
    // keadaan yang menuntut keputusan — bukan yang boleh disembunyikan.
    expect(lewatTenggat(buat({ end_date: "2020-01-01", status: "on_hold" }), "2026-08-07")).toBe(true);
    expect(lewatTenggat(buat({ end_date: "2020-01-01", status: "draft" }), "2026-08-07")).toBe(true);
  });
});

describe("segeraJatuhTempo — jendela 14 hari, batasnya inklusif", () => {
  it("hari ini termasuk", () => {
    expect(segeraJatuhTempo(buat({ end_date: "2026-08-07" }), "2026-08-07")).toBe(true);
  });

  it("hari ke-14 termasuk, hari ke-15 tidak", () => {
    expect(segeraJatuhTempo(buat({ end_date: "2026-08-21" }), "2026-08-07")).toBe(true);
    expect(segeraJatuhTempo(buat({ end_date: "2026-08-22" }), "2026-08-07")).toBe(false);
  });

  it("yang SUDAH lewat tidak dihitung dua kali", () => {
    // Kalau `sisa >= 0` dilepas, proyek yang telat 60 hari akan muncul di
    // KPI "lewat tenggat" DAN di peringatan "segera jatuh tempo" — dua
    // angka untuk satu proyek, dan totalnya tak pernah cocok.
    expect(segeraJatuhTempo(buat({ end_date: "2026-08-06" }), "2026-08-07")).toBe(false);
  });

  it("yang sudah selesai tak pernah segera jatuh tempo", () => {
    expect(segeraJatuhTempo(buat({ end_date: "2026-08-10", status: "completed" }), "2026-08-07")).toBe(false);
  });
});

describe("selesaiBulanIni", () => {
  it("bulan & tahun sama = ya", () => {
    expect(selesaiBulanIni(buat({ actual_end_date: "2026-08-01" }), "2026-08-07")).toBe(true);
    expect(selesaiBulanIni(buat({ actual_end_date: "2026-08-31" }), "2026-08-07")).toBe(true);
  });

  it("bulan lalu = tidak", () => {
    expect(selesaiBulanIni(buat({ actual_end_date: "2026-07-31" }), "2026-08-07")).toBe(false);
  });

  it("bulan yang sama tapi TAHUN LALU = tidak", () => {
    // Kalau hanya bulannya yang dibandingkan, Agustus 2025 ikut terhitung —
    // dan KPI "selesai bulan ini" jadi angka yang tak pernah turun.
    expect(
      selesaiBulanIni(buat({ actual_end_date: "2025-08-15" }), "2026-08-07"),
      "proyek selesai Agustus tahun lalu ikut terhitung bulan ini",
    ).toBe(false);
  });

  it("belum selesai = tidak", () => {
    expect(selesaiBulanIni(buat({ actual_end_date: null }), "2026-08-07")).toBe(false);
  });
});

describe("progresSeharusnya — garis jadwal lurus", () => {
  it("tepat separuh masa kontrak = 50%", () => {
    expect(
      progresSeharusnya(buat({ start_date: "2026-01-01", end_date: "2026-01-11" }), "2026-01-06"),
    ).toBeCloseTo(50, 5);
  });

  it("sebelum mulai dijepit ke 0, setelah tenggat dijepit ke 100", () => {
    const p = buat({ start_date: "2026-06-01", end_date: "2026-06-30" });
    expect(progresSeharusnya(p, "2026-05-01")).toBe(0);
    expect(progresSeharusnya(p, "2026-12-01")).toBe(100);
  });

  it("rentang tanggal mustahil = null, BUKAN 0", () => {
    // Nol berarti "belum waktunya mengerjakan apa pun" — proyek dengan
    // tanggal kacau akan tampil tepat jadwal, yaitu kesimpulan yang paling
    // berbahaya dari data yang paling tak bisa dipercaya.
    expect(
      progresSeharusnya(buat({ start_date: "2026-06-30", end_date: "2026-06-01" }), "2026-06-15"),
      "proyek dengan tanggal akhir sebelum tanggal mulai dianggap tepat jadwal",
    ).toBeNull();
    expect(progresSeharusnya(buat({ start_date: "2026-06-01", end_date: "2026-06-01" }), "2026-06-01")).toBeNull();
  });
});

describe("palingTertinggal", () => {
  const hariIni = "2026-07-01"; // separuh masa kontrak setahun penuh

  it("mengurutkan yang paling parah lebih dulu", () => {
    const hasil = palingTertinggal([
      buat({ id: "a", name: "A", progress_pct: 40 }),
      buat({ id: "b", name: "B", progress_pct: 10 }),
      buat({ id: "c", name: "C", progress_pct: 25 }),
    ], hariIni);
    expect(hasil.map((h) => h.id)).toEqual(["b", "c", "a"]);
  });

  it("yang mendahului jadwal TIDAK masuk daftar", () => {
    const hasil = palingTertinggal([
      buat({ id: "cepat", progress_pct: 95 }),
      buat({ id: "lambat", progress_pct: 5 }),
    ], hariIni);
    expect(hasil.map((h) => h.id)).toEqual(["lambat"]);
  });

  it("hanya proyek aktif", () => {
    const hasil = palingTertinggal([
      buat({ id: "draft", status: "draft", progress_pct: 0 }),
      buat({ id: "tunda", status: "on_hold", progress_pct: 0 }),
      buat({ id: "aktif", status: "active", progress_pct: 0 }),
    ], hariIni);
    expect(hasil.map((h) => h.id)).toEqual(["aktif"]);
  });

  it("proyek bertanggal kacau dilewati, tak dianggap tertinggal 100%", () => {
    const hasil = palingTertinggal([
      buat({ id: "kacau", start_date: "2026-12-31", end_date: "2026-01-01", progress_pct: 0 }),
    ], hariIni);
    expect(hasil).toEqual([]);
  });

  it("dipotong sesuai batas", () => {
    const banyak = Array.from({ length: 10 }, (_, i) =>
      buat({ id: `p${i}`, progress_pct: i }));
    expect(palingTertinggal(banyak, hariIni, 3)).toHaveLength(3);
  });
});

describe("ringkasProyek — keempat KPI §5c", () => {
  const hariIni = "2026-08-07";
  const daftar: ProyekRingkas[] = [
    buat({ id: "1", status: "active", progress_pct: 60, contract_value: 1_000_000_000, end_date: "2026-12-31" }),
    buat({ id: "2", status: "active", progress_pct: 20, contract_value: 500_000_000, end_date: "2026-08-01" }),   // lewat
    buat({ id: "3", status: "active", progress_pct: 10, contract_value: 250_000_000, end_date: "2026-08-15" }),   // segera
    buat({ id: "4", status: "completed", progress_pct: 100, contract_value: 700_000_000, actual_end_date: "2026-08-03" }),
    buat({ id: "5", status: "completed", progress_pct: 100, contract_value: 300_000_000, actual_end_date: "2026-06-20" }),
    buat({ id: "6", status: "on_hold", progress_pct: 5, contract_value: 100_000_000, end_date: "2026-01-01" }),   // lewat
  ];

  it("aktif hanya menghitung status active", () => {
    expect(ringkasProyek(daftar, hariIni).aktif).toBe(3);
  });

  it("nilai kontrak dijumlahkan HANYA dari yang aktif", () => {
    expect(ringkasProyek(daftar, hariIni).nilaiAktif).toBe(1_750_000_000);
  });

  it("progres rata-rata dari yang aktif saja", () => {
    // Kalau yang selesai (100%) ikut, rata-ratanya melompat ke 49,2% dan
    // proyek yang macet tertutup oleh proyek yang sudah tuntas.
    expect(ringkasProyek(daftar, hariIni).progresRata).toBeCloseTo(30, 5);
  });

  it("progres rata-rata `null` saat tak ada proyek aktif", () => {
    const hasil = ringkasProyek([buat({ status: "completed", actual_end_date: "2026-08-01" })], hariIni);
    expect(hasil.progresRata, "'0%' terbaca sebagai proyek jalan tapi tak bergerak").toBeNull();
  });

  it("lewat tenggat mencakup on_hold, bukan hanya active", () => {
    expect(ringkasProyek(daftar, hariIni).lewatTenggat).toBe(2);
  });

  it("segera jatuh tempo terpisah dari yang sudah lewat", () => {
    expect(ringkasProyek(daftar, hariIni).segeraJatuhTempo).toBe(1);
  });

  it("selesai bulan ini hanya yang actual_end_date-nya bulan berjalan", () => {
    expect(ringkasProyek(daftar, hariIni).selesaiBulanIni).toBe(1);
  });

  it("daftar kosong tidak meledak", () => {
    expect(ringkasProyek([], hariIni)).toEqual({
      aktif: 0, nilaiAktif: 0, progresRata: null,
      lewatTenggat: 0, segeraJatuhTempo: 0, selesaiBulanIni: 0, total: 0,
    });
  });

  it("nilai yang datang sebagai string (numeric PostgREST) tetap dijumlah", () => {
    // Kolom `numeric` Postgres dikirim sebagai STRING oleh PostgREST supaya
    // presisinya tak hilang. `s + "500"` menghasilkan penggabungan teks,
    // dan totalnya jadi angka raksasa yang tak masuk akal — tanpa galat.
    const hasil = ringkasProyek([
      buat({ status: "active", contract_value: "500000000", progress_pct: "40" }),
      buat({ status: "active", contract_value: "250000000", progress_pct: "60" }),
    ], hariIni);
    expect(hasil.nilaiAktif).toBe(750_000_000);
    expect(hasil.progresRata).toBeCloseTo(50, 5);
  });
});

describe("hariIniWIB", () => {
  it("sore hari di WIB masih tanggal yang sama, bukan mundur ke UTC", () => {
    // 2026-08-07 18:00 WIB = 2026-08-07 11:00 UTC — keduanya tanggal 7.
    expect(hariIniWIB(new Date("2026-08-07T11:00:00Z"))).toBe("2026-08-07");
  });

  it("lewat tengah malam WIB sudah tanggal berikutnya meski UTC belum", () => {
    // 2026-08-08 00:30 WIB = 2026-08-07 17:30 UTC. Pengguna di lapangan
    // melihat tanggal 8; memakai UTC mentah akan mencatatnya tanggal 7.
    expect(
      hariIniWIB(new Date("2026-08-07T17:30:00Z")),
      "tengah malam WIB masih tercatat sebagai hari sebelumnya",
    ).toBe("2026-08-08");
  });
});

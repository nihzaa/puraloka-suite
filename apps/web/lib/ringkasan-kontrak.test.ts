import { describe, expect, it } from "vitest";
import {
  hariIniWIB,
  ringkasKontrak,
  selisihHari,
  type BarisJaminan,
  type ProyekKontrak,
  type RingkasAsuransi,
} from "./ringkasan-kontrak";

const HARI_INI = "2026-08-07";

function jaminan(p: Partial<BarisJaminan> = {}): BarisJaminan {
  return {
    id: "j1",
    project_id: "p1",
    bond_type: "pelaksanaan",
    bond_number: "BG-001",
    issuer: "Bank X",
    amount: 1_000_000,
    issued_date: "2026-01-01",
    expiry_date: "2027-01-01",
    status: "aktif",
    ...p,
  };
}

function proyek(p: Partial<ProyekKontrak> = {}): ProyekKontrak {
  return { id: "p1", name: "Proyek Satu", status: "active", contract_value: 100, ...p };
}

const ASURANSI_KOSONG: RingkasAsuransi = {
  jumlah_aktif: 0,
  jumlah_kadaluarsa: 0,
  jumlah_segera_berakhir: 0,
  jumlah_ada_celah: 0,
  proyek_tanpa_polis: [],
  total_nilai_pertanggungan: 0,
};

describe("selisihHari", () => {
  it("nol untuk tanggal yang sama", () => {
    expect(selisihHari(HARI_INI, HARI_INI)).toBe(0);
  });

  it("positif untuk tanggal di depan", () => {
    expect(selisihHari(HARI_INI, "2026-08-10")).toBe(3);
  });

  it("negatif untuk tanggal yang sudah lewat", () => {
    expect(selisihHari(HARI_INI, "2026-08-01")).toBe(-6);
  });

  it("menyeberangi batas bulan dengan benar", () => {
    expect(selisihHari("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("menyeberangi batas tahun dengan benar", () => {
    expect(selisihHari("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("memperhitungkan tahun kabisat", () => {
    // 2028 kabisat: 29 Februari ada.
    expect(selisihHari("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("mengabaikan bagian waktu pada timestamp", () => {
    expect(selisihHari(HARI_INI, "2026-08-10T23:59:59Z")).toBe(3);
  });
});

describe("hariIniWIB", () => {
  it("menghasilkan format YYYY-MM-DD", () => {
    expect(hariIniWIB()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ringkasKontrak — kontrak aktif", () => {
  it("menghitung hanya proyek yang belum selesai/batal", () => {
    const r = ringkasKontrak(
      [
        proyek({ id: "a", status: "active" }),
        proyek({ id: "b", status: "on_hold" }),
        proyek({ id: "c", status: "completed" }),
        proyek({ id: "d", status: "cancelled" }),
      ],
      [],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.kontrakAktif).toBe(2);
  });

  it("menjumlahkan nilai kontrak proyek aktif saja", () => {
    const r = ringkasKontrak(
      [
        proyek({ id: "a", status: "active", contract_value: 500 }),
        proyek({ id: "b", status: "completed", contract_value: 900 }),
      ],
      [],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.nilaiKontrakAktif).toBe(500);
  });

  it("menerima contract_value bertipe string (numeric dari Postgres)", () => {
    const r = ringkasKontrak(
      [proyek({ contract_value: "1250.50" })],
      [],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.nilaiKontrakAktif).toBe(1250.5);
  });

  it("memperlakukan contract_value tak terbaca sebagai nol, bukan NaN", () => {
    const r = ringkasKontrak(
      [proyek({ contract_value: "entah" })],
      [],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.nilaiKontrakAktif).toBe(0);
  });

  it("nol untuk daftar proyek kosong", () => {
    const r = ringkasKontrak([], [], ASURANSI_KOSONG, HARI_INI);
    expect(r.kontrakAktif).toBe(0);
    expect(r.nilaiKontrakAktif).toBe(0);
  });
});

describe("ringkasKontrak — jaminan mau habis", () => {
  it("menghitung jaminan yang habis dalam ambang hari", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: "2026-08-20" })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.jaminanMauHabis).toBe(1);
    expect(r.jaminanLewat).toBe(0);
  });

  it("TIDAK menghitung jaminan yang masih jauh dari ambang", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: "2026-12-01" })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.jaminanMauHabis).toBe(0);
  });

  it("jaminan yang habis TEPAT hari ini terhitung mendesak, bukan aman", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: HARI_INI })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.jaminanMauHabis).toBe(1);
    // Sisa hari 0 — belum lewat, tapi sudah tak boleh ditunda.
    expect(r.jaminanLewat).toBe(0);
    expect(r.daftarMendesak[0].sisaHari).toBe(0);
  });

  it("jaminan yang SUDAH lewat ikut terhitung dan ditandai lewat", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: "2026-08-01" })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.jaminanMauHabis).toBe(1);
    expect(r.jaminanLewat).toBe(1);
    expect(r.daftarMendesak[0].sisaHari).toBe(-6);
  });

  it("batas ambang tepat 30 hari termasuk, 31 hari tidak", () => {
    const tepat = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: "2026-09-06" })], // +30
      ASURANSI_KOSONG,
      HARI_INI,
    );
    const lewat = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: "2026-09-07" })], // +31
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(tepat.jaminanMauHabis).toBe(1);
    expect(lewat.jaminanMauHabis).toBe(0);
  });

  it("menghormati ambangHari yang diberikan", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: "2026-08-20" })], // +13
      ASURANSI_KOSONG,
      HARI_INI,
      7,
    );
    expect(r.jaminanMauHabis).toBe(0);
  });

  it("MENGABAIKAN jaminan yang statusnya bukan aktif", () => {
    // Jaminan yang sudah dilepas tak menuntut apa pun — menghitungnya
    // membuat angka mendesak yang tak bisa dikosongkan siapa pun.
    const r = ringkasKontrak(
      [proyek()],
      [
        jaminan({ id: "a", expiry_date: "2026-08-01", status: "dilepas" }),
        jaminan({ id: "b", expiry_date: "2026-08-01", status: "dicairkan" }),
      ],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.jaminanMauHabis).toBe(0);
    expect(r.daftarMendesak).toHaveLength(0);
  });

  it("mengurutkan yang paling genting di atas", () => {
    const r = ringkasKontrak(
      [proyek()],
      [
        jaminan({ id: "a", expiry_date: "2026-08-20" }), // +13
        jaminan({ id: "b", expiry_date: "2026-08-01" }), // -6
        jaminan({ id: "c", expiry_date: "2026-08-10" }), // +3
      ],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.daftarMendesak.map((j) => j.id)).toEqual(["b", "c", "a"]);
  });

  it("melampirkan nama proyek pada jaminan mendesak", () => {
    const r = ringkasKontrak(
      [proyek({ id: "p9", name: "Gedung Serbaguna" })],
      [jaminan({ project_id: "p9", expiry_date: "2026-08-10" })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.daftarMendesak[0].namaProyek).toBe("Gedung Serbaguna");
  });

  it("jaminan tanpa proyek (milik tender) diberi label, bukan dibuang", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ project_id: null, expiry_date: "2026-08-10" })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.daftarMendesak[0].namaProyek).toBe("Tanpa proyek");
  });

  it("jaminan yang menunjuk proyek tak dikenal tidak menghilang", () => {
    // Proyek selesai tak selalu ikut terkirim; jaminannya tetap harus tampil.
    const r = ringkasKontrak(
      [proyek({ id: "p1" })],
      [jaminan({ project_id: "hantu", expiry_date: "2026-08-10" })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.daftarMendesak).toHaveLength(1);
    expect(r.daftarMendesak[0].namaProyek).toBe("Tanpa proyek");
  });
});

describe("ringkasKontrak — sebaran per jenis", () => {
  it("mengelompokkan jaminan aktif per jenis dan menjumlahkan nilainya", () => {
    const r = ringkasKontrak(
      [proyek()],
      [
        jaminan({ id: "a", bond_type: "pelaksanaan", amount: 100 }),
        jaminan({ id: "b", bond_type: "pelaksanaan", amount: 200 }),
        jaminan({ id: "c", bond_type: "uang_muka", amount: 500 }),
      ],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    // Diurutkan menurun berdasar nilai.
    expect(r.perJenis).toEqual([
      { jenis: "uang_muka", label: "Uang Muka", jumlah: 1, nilai: 500 },
      { jenis: "pelaksanaan", label: "Pelaksanaan", jumlah: 2, nilai: 300 },
    ]);
  });

  it("mengabaikan jaminan tak aktif dalam sebaran", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ status: "dilepas", bond_type: "pemeliharaan" })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.perJenis).toHaveLength(0);
  });

  it("menyertakan jaminan yang belum mendesak dalam sebaran", () => {
    // Sebaran menjawab pertanyaan berbeda dari daftar mendesak: ia butuh
    // SELURUH populasi jaminan aktif, bukan hanya yang genting.
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ expiry_date: "2028-01-01", amount: 750 })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.jaminanMauHabis).toBe(0);
    expect(r.perJenis).toEqual([
      { jenis: "pelaksanaan", label: "Pelaksanaan", jumlah: 1, nilai: 750 },
    ]);
  });

  it("meneruskan jenis tak dikenal apa adanya, bukan membuangnya", () => {
    const r = ringkasKontrak(
      [proyek()],
      [jaminan({ bond_type: "jenis_baru", amount: 10 })],
      ASURANSI_KOSONG,
      HARI_INI,
    );
    expect(r.perJenis[0].label).toBe("jenis_baru");
  });
});

describe("ringkasKontrak — asuransi", () => {
  it("menjumlahkan polis kadaluarsa dan yang segera berakhir", () => {
    const r = ringkasKontrak([proyek()], [], {
      ...ASURANSI_KOSONG,
      jumlah_kadaluarsa: 2,
      jumlah_segera_berakhir: 3,
    }, HARI_INI);
    expect(r.asuransiPerluTindakan).toBe(5);
  });

  it("nol bila ringkasan asuransi tak tersedia", () => {
    const r = ringkasKontrak([proyek()], [], null, HARI_INI);
    expect(r.asuransiPerluTindakan).toBe(0);
  });
});

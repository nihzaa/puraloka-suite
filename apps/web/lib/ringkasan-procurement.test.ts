import { describe, it, expect } from "vitest";
import {
  konsentrasiVendor, palingLamaMenunggu, poLewatJanjiKirim, poMenungguTerima,
  poSegeraTiba, poTerbuka, ringkasPo, type PoRingkasan,
} from "./ringkasan-procurement";

/** PO contoh — hanya field yang diminta tipe, sisanya diisi per-test. */
const buat = (p: Partial<PoRingkasan> = {}): PoRingkasan => ({
  id: "po1", po_number: "PO-001", status: "confirmed",
  order_date: "2026-08-01", expected_delivery_date: "2026-08-10",
  total_amount: 0, supplier: { id: "s1", name: "Toko A" },
  ...p,
});

describe("poTerbuka — yang sudah tuntas tak menumpuk selamanya", () => {
  it("draft, terkirim, dikonfirmasi, dan sebagian terima = terbuka", () => {
    for (const status of ["draft", "sent", "confirmed", "partially_received"]) {
      expect(poTerbuka(buat({ status })), `status ${status}`).toBe(true);
    }
  });

  it("diterima penuh dan dibatalkan = TIDAK terbuka", () => {
    // PO yang tuntas Januari lalu akan menumpuk selamanya di angka yang
    // seharusnya menyatakan beban hari ini.
    expect(poTerbuka(buat({ status: "fully_received" }))).toBe(false);
    expect(poTerbuka(buat({ status: "cancelled" }))).toBe(false);
  });
});

describe("poMenungguTerima — draft bukan barang yang sedang di jalan", () => {
  it("draft TIDAK menunggu terima", () => {
    // PO draft belum dikirim ke supplier sama sekali. Yang menunggu adalah
    // orang di kantor yang belum menekan "Kirim", bukan barangnya.
    expect(poMenungguTerima(buat({ status: "draft" }))).toBe(false);
  });

  it("terkirim, dikonfirmasi, dan sebagian terima = menunggu barang", () => {
    for (const status of ["sent", "confirmed", "partially_received"]) {
      expect(poMenungguTerima(buat({ status })), `status ${status}`).toBe(true);
    }
  });

  it("yang sudah tuntas tak menunggu apa pun", () => {
    expect(poMenungguTerima(buat({ status: "fully_received" }))).toBe(false);
    expect(poMenungguTerima(buat({ status: "cancelled" }))).toBe(false);
  });
});

describe("poLewatJanjiKirim — batas tanggal yang paling sunyi kalau salah", () => {
  it("janji kemarin = lewat", () => {
    expect(poLewatJanjiKirim(buat({ expected_delivery_date: "2026-08-06" }), "2026-08-07")).toBe(true);
  });

  it("janji HARI INI = BELUM lewat", () => {
    // Barangnya masih bisa datang sore ini. Menandainya merah mengajari
    // orang mengabaikan warna merah, dan setelah itu yang benar-benar telat
    // ikut terlewat.
    expect(
      poLewatJanjiKirim(buat({ expected_delivery_date: "2026-08-07" }), "2026-08-07"),
      "PO yang dijanjikan tiba hari ini ditandai terlambat",
    ).toBe(false);
  });

  it("janji besok = belum lewat", () => {
    expect(poLewatJanjiKirim(buat({ expected_delivery_date: "2026-08-08" }), "2026-08-07")).toBe(false);
  });

  it("tanpa tanggal janji tak pernah lewat janji", () => {
    // Tak ada janji yang bisa dilanggar. Angkanya lebih kecil dari kenyataan,
    // dan halaman yang memakainya wajib menyebutkan kekurangan itu.
    expect(poLewatJanjiKirim(buat({ expected_delivery_date: null }), "2026-08-07")).toBe(false);
  });

  it("PO yang sudah diterima penuh tak lewat janji meski tanggalnya lampau", () => {
    // Kalau statusnya tak diperiksa, tiap PO yang tuntas menambah angka
    // "terlambat" selamanya — persis pola cacat yang sama dengan proyek
    // selesai yang terhitung telat.
    expect(poLewatJanjiKirim(
      buat({ status: "fully_received", expected_delivery_date: "2020-01-01" }), "2026-08-07",
    )).toBe(false);
    expect(poLewatJanjiKirim(
      buat({ status: "cancelled", expected_delivery_date: "2020-01-01" }), "2026-08-07",
    )).toBe(false);
  });

  it("PO draft tak lewat janji — ia belum dikirim ke siapa pun", () => {
    expect(poLewatJanjiKirim(
      buat({ status: "draft", expected_delivery_date: "2020-01-01" }), "2026-08-07",
    )).toBe(false);
  });
});

describe("poSegeraTiba — jendela yang belum lewat", () => {
  it("hari ini termasuk segera tiba", () => {
    expect(poSegeraTiba(buat({ expected_delivery_date: "2026-08-07" }), "2026-08-07")).toBe(true);
  });

  it("tepat di ambang (7 hari) masih termasuk", () => {
    expect(poSegeraTiba(buat({ expected_delivery_date: "2026-08-14" }), "2026-08-07")).toBe(true);
  });

  it("satu hari di luar ambang tidak termasuk", () => {
    expect(poSegeraTiba(buat({ expected_delivery_date: "2026-08-15" }), "2026-08-07")).toBe(false);
  });

  it("yang sudah lewat BUKAN 'segera tiba' — dua angka tak boleh tumpang tindih", () => {
    // Kalau PO yang telat ikut terhitung "segera tiba", penjumlahan dua
    // kartu KPI melebihi jumlah PO yang sebenarnya menunggu.
    expect(poSegeraTiba(buat({ expected_delivery_date: "2026-08-06" }), "2026-08-07")).toBe(false);
  });
});

describe("ringkasPo — keempat KPI dari satu respons", () => {
  const pos = [
    buat({ id: "a", status: "confirmed", expected_delivery_date: "2026-08-01", total_amount: 1000 }),
    buat({ id: "b", status: "sent", expected_delivery_date: "2026-08-10", total_amount: 2000 }),
    buat({ id: "c", status: "draft", expected_delivery_date: null, total_amount: 500 }),
    buat({ id: "d", status: "fully_received", expected_delivery_date: "2026-07-01", total_amount: 9000 }),
    buat({ id: "e", status: "cancelled", expected_delivery_date: "2026-07-01", total_amount: 7000 }),
    buat({ id: "f", status: "partially_received", expected_delivery_date: null, total_amount: 300 }),
  ];
  const r = ringkasPo(pos, "2026-08-07");

  it("terbuka mengecualikan yang diterima penuh dan dibatalkan", () => {
    expect(r.terbuka).toBe(4); // a, b, c, f
  });

  it("nilai terbuka menjumlahkan HANYA yang terbuka", () => {
    // 9000 dan 7000 harus absen — kalau ikut, angka komitmen membengkak
    // lebih dari empat kali lipat tanpa satu pun tanda.
    expect(r.nilaiTerbuka).toBe(1000 + 2000 + 500 + 300);
  });

  it("menunggu terima mengecualikan draft", () => {
    expect(r.menungguTerima).toBe(3); // a, b, f
  });

  it("lewat janji kirim hanya menghitung yang punya tanggal dan sudah lewat", () => {
    expect(r.lewatJanjiKirim).toBe(1); // a
  });

  it("segera tiba tak tumpang tindih dengan yang lewat", () => {
    expect(r.segeraTiba).toBe(1); // b
  });

  it("PO menunggu tanpa tanggal janji dihitung terpisah, bukan disembunyikan", () => {
    expect(r.tanpaTanggalJanji).toBe(1); // f — draft (c) tak ikut, ia tak menunggu
  });

  it("nilai berupa string dari API tetap terjumlah sebagai angka", () => {
    // Postgres `numeric` datang sebagai string lewat JSON. Tanpa `Number()`,
    // penjumlahan berubah jadi perangkaian teks dan totalnya jadi omong kosong.
    const s = ringkasPo([buat({ total_amount: "1500" }), buat({ id: "x", total_amount: "2500" })], "2026-08-07");
    expect(s.nilaiTerbuka).toBe(4000);
  });

  it("daftar kosong tak meledak", () => {
    const k = ringkasPo([], "2026-08-07");
    expect(k).toEqual({
      terbuka: 0, nilaiTerbuka: 0, menungguTerima: 0,
      lewatJanjiKirim: 0, segeraTiba: 0, tanpaTanggalJanji: 0, total: 0,
    });
  });
});

describe("palingLamaMenunggu — terparah lebih dulu", () => {
  it("mengurutkan menurut lama keterlambatan, bukan urutan masuk", () => {
    const baris = palingLamaMenunggu([
      buat({ id: "a", po_number: "PO-A", expected_delivery_date: "2026-08-05" }),
      buat({ id: "b", po_number: "PO-B", expected_delivery_date: "2026-07-08" }),
      buat({ id: "c", po_number: "PO-C", expected_delivery_date: "2026-08-06" }),
    ], "2026-08-07");
    expect(baris.map(b => b.po_number)).toEqual(["PO-B", "PO-A", "PO-C"]);
    expect(baris[0].hariLewat).toBe(30);
    expect(baris[2].hariLewat).toBe(1);
  });

  it("yang belum lewat janji TIDAK masuk daftar", () => {
    // Daftar berjudul "paling lama menunggu" yang memuat PO tepat waktu
    // memaksa pembacanya menyaring dengan mata.
    expect(palingLamaMenunggu([
      buat({ expected_delivery_date: "2026-08-20" }),
      buat({ id: "z", expected_delivery_date: null }),
    ], "2026-08-07")).toEqual([]);
  });

  it("menghormati batas jumlah baris", () => {
    const banyak = Array.from({ length: 10 }, (_, i) =>
      buat({ id: `p${i}`, po_number: `PO-${i}`, expected_delivery_date: "2026-08-01" }));
    expect(palingLamaMenunggu(banyak, "2026-08-07")).toHaveLength(6);
    expect(palingLamaMenunggu(banyak, "2026-08-07", 3)).toHaveLength(3);
  });

  it("supplier tanpa nama tak menghasilkan 'undefined' di layar", () => {
    const baris = palingLamaMenunggu(
      [buat({ supplier: null, expected_delivery_date: "2026-08-01" })], "2026-08-07");
    expect(baris[0].supplier).toBe("—");
  });
});

describe("konsentrasiVendor — porsi belanja yang tak terbaca dari daftar", () => {
  it("menjumlahkan beberapa PO milik vendor yang sama", () => {
    // Nilainya sengaja TIDAK dibuat seri: urutan dua vendor bernilai sama
    // tak dijamin oleh fungsinya, dan test yang menuntutnya menguji detail
    // implementasi `Array.sort`, bukan perilaku yang dijanjikan.
    const baris = konsentrasiVendor([
      buat({ id: "a", total_amount: 300, supplier: { id: "s1", name: "Toko A" } }),
      buat({ id: "b", total_amount: 200, supplier: { id: "s1", name: "Toko A" } }),
      buat({ id: "c", total_amount: 750, supplier: { id: "s2", name: "Toko B" } }),
    ]);
    expect(baris).toHaveLength(2);
    // Toko B terbesar → paling atas. Toko A: 300+200 digabung jadi satu baris.
    expect(baris[0]).toMatchObject({ nama: "Toko B", nilai: 750, jumlahPo: 1, persen: 60 });
    expect(baris[1]).toMatchObject({ nama: "Toko A", nilai: 500, jumlahPo: 2, persen: 40 });
  });

  it("hanya PO terbuka yang dihitung", () => {
    // Vendor yang pesanannya sudah tuntas tak menyandera siapa pun, dan
    // memasukkannya menutupi vendor yang memegang pesanan besar hari ini.
    const baris = konsentrasiVendor([
      buat({ id: "a", status: "fully_received", total_amount: 9000, supplier: { id: "s1", name: "Toko A" } }),
      buat({ id: "b", status: "cancelled", total_amount: 8000, supplier: { id: "s1", name: "Toko A" } }),
      buat({ id: "c", status: "confirmed", total_amount: 100, supplier: { id: "s2", name: "Toko B" } }),
    ]);
    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({ nama: "Toko B", nilai: 100, persen: 100 });
  });

  it("PO tanpa vendor tetap masuk total, bukan dibuang diam-diam", () => {
    // Membuangnya membuat persentase vendor lain tampak lebih besar dari
    // sebenarnya — arah kesalahan yang berbahaya pada angka yang tugasnya
    // memperingatkan soal ketergantungan.
    const baris = konsentrasiVendor([
      buat({ id: "a", total_amount: 500, supplier: { id: "s1", name: "Toko A" } }),
      buat({ id: "b", total_amount: 500, supplier: null }),
    ]);
    expect(baris).toHaveLength(2);
    expect(baris[0].persen).toBe(50);
    expect(baris.find(b => b.id === "tanpa-vendor")?.nama).toBe("Tanpa vendor");
  });

  it("total nol tak menghasilkan NaN persen", () => {
    // Pembagian dengan nol memberi NaN, dan "NaN%" di layar dashboard
    // membuat seluruh kartu kehilangan kredibilitasnya.
    const baris = konsentrasiVendor([buat({ total_amount: 0 })]);
    expect(baris[0].persen).toBe(0);
    expect(Number.isNaN(baris[0].persen)).toBe(false);
  });

  it("daftar kosong menghasilkan daftar kosong", () => {
    expect(konsentrasiVendor([])).toEqual([]);
  });
});

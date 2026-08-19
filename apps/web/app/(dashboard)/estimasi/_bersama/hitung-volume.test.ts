import { describe, it, expect } from "vitest";
import { hitung } from "./hitung-volume";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PRATINJAU VOLUME DI KLIEN — wajib sepakat dengan server
 *
 * Fungsi ini menghitung ULANG apa yang `apps/api/src/lib/takeoff-sektor.ts`
 * hitung, supaya orang melihat akibat ketikannya sebelum menekan apa pun.
 * Karena itu ia bisa MENYIMPANG — dan simpangannya tak menimbulkan galat: layar
 * menampilkan satu angka, yang tersimpan angka lain, dan tak ada yang tahu
 * sampai seseorang membandingkan keduanya.
 *
 * Angka pembanding di bawah SAMA PERSIS dengan yang dikunci
 * `takeoff-sektor.test.ts` di sisi API. Kalau salah satunya diubah tanpa yang
 * lain, blok ini merah.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const D = {
  panjang: "", lebar: "", tinggi: "", kemiringan: "", cacah: "",
  jumlah: "1", faktor: "1",
};

/** Ambil hasil, gagalkan test bila yang keluar justru galat. */
function volume(sektor: string, d: Partial<typeof D>, bukaan: Parameters<typeof hitung>[2] = []) {
  const h = hitung(sektor, { ...D, ...d }, bukaan);
  if ("galat" in h) throw new Error(`tak disangka galat: ${h.galat}`);
  return h;
}

describe("dinding — bukaan dikurangkan", () => {
  it("dinding polos = p × t", () => {
    expect(volume("dinding", { panjang: "4", tinggi: "3" }).volume).toBe(12);
  });

  it("bukaan dikurangi: 12 − 3,33 = 8,67 m²", () => {
    /*
      Angka yang sama dengan sisi API. Pintu 0,9×2,1 = 1,89 dan jendela
      1,2×1,2 = 1,44 pada dinding 4×3 m — selisih 28% dari luasnya.
    */
    const h = volume("dinding", { panjang: "4", tinggi: "3" }, [
      { nama: "P1", lebar: "0.9", tinggi: "2.1", jumlah: "1" },
      { nama: "J1", lebar: "1.2", tinggi: "1.2", jumlah: "1" },
    ]);
    expect(h.volume).toBeCloseTo(8.67, 4);
    expect(h.rincian).toMatch(/P1/);
    expect(h.rincian).toMatch(/J1/);
  });

  it("MENOLAK bukaan yang lebih besar daripada dindingnya", () => {
    const h = hitung("dinding", { ...D, panjang: "1", tinggi: "1" },
      [{ nama: "X", lebar: "4", tinggi: "3", jumlah: "1" }]);
    expect(h).toHaveProperty("galat");
  });

  it("memperingatkan saat tak ada bukaan sama sekali", () => {
    expect(volume("dinding", { panjang: "4", tinggi: "3" }).catatan.join(" "))
      .toMatch(/tidak ada bukaan/i);
  });

  it("baris bukaan yang belum lengkap DIABAIKAN, bukan bikin galat", () => {
    /*
      Orang menekan "Tambah bukaan" lalu mengetik — di antara dua ketukan itu
      barisnya kosong. Menggagalkan seluruh hitungan di sana membuat angkanya
      berkedip hilang setiap kali orang menambah baris.
    */
    const h = volume("dinding", { panjang: "4", tinggi: "3" }, [
      { nama: "", lebar: "", tinggi: "", jumlah: "1" },
    ]);
    expect(h.volume).toBe(12);
  });
});

describe("atap — luas miring", () => {
  it("100 m² denah pada 30° = 115,47 m²", () => {
    const h = volume("atap", { panjang: "10", lebar: "10", kemiringan: "30" });
    expect(h.volume).toBeCloseTo(115.4701, 3);
    expect(h.rincian).toMatch(/cos 30/);
  });

  it("rincian menyebut 30, bukan 3", () => {
    /*
      Cacat yang pernah terjadi di sisi API: helper pemotong nol trailing
      memakan nol yang bermakna, jadi rincian berbunyi "÷ cos 3°". Volumenya
      benar; kalimat penjelasnya yang berbohong — dan pembacanya memeriksa
      hitungan yang tak pernah dilakukan.
    */
    expect(volume("atap", { panjang: "10", lebar: "10", kemiringan: "30" }).rincian)
      .not.toMatch(/cos 3°/);
  });

  it("datar (0°) sama dengan denah, dan memperingatkan", () => {
    const h = volume("atap", { panjang: "10", lebar: "10" });
    expect(h.volume).toBe(100);
    expect(h.catatan.join(" ")).toMatch(/datar/i);
  });

  it("menolak kemiringan di atas 60°", () => {
    expect(hitung("atap", { ...D, panjang: "10", lebar: "10", kemiringan: "89" }, []))
      .toHaveProperty("galat");
  });
});

describe("kusen & pipa", () => {
  it("kusen 0,9 × 2,1 = keliling 6 m", () => {
    expect(volume("kusen", { lebar: "0.9", tinggi: "2.1" }).volume).toBe(6);
  });

  it("empat kusen = 24 m", () => {
    expect(volume("kusen", { lebar: "0.9", tinggi: "2.1", jumlah: "4" }).volume).toBe(24);
  });

  it("pipa memakai panjang apa adanya", () => {
    const h = volume("mep_pipa", { panjang: "18.5" });
    expect(h.volume).toBe(18.5);
    expect(h.satuan).toBe("m");
  });
});

describe("cacah — sanitair & titik MEP", () => {
  it("cacah dipakai apa adanya", () => {
    const h = volume("sanitair", { cacah: "3" });
    expect(h.volume).toBe(3);
    expect(h.satuan).toBe("unit");
  });

  it("titik MEP bersatuan titik", () => {
    expect(volume("mep_titik", { cacah: "24" }).satuan).toBe("titik");
  });

  it("menolak cacah kosong — bukan menganggapnya nol", () => {
    expect(hitung("sanitair", D, [])).toHaveProperty("galat");
  });
});

describe("luas datar & metode generik", () => {
  it("plafon = p × l", () => {
    expect(volume("plafon", { panjang: "4", lebar: "3" }).volume).toBe(12);
  });

  it("lantai dengan faktor potongan tepi", () => {
    expect(volume("lantai", { panjang: "4", lebar: "3", faktor: "1.05" }).volume)
      .toBeCloseTo(12.6, 4);
  });

  it("tanpa sektor: satu dimensi = m, dua = m², tiga = m³", () => {
    /*
      Metode generik migrasi 431 dipertahankan apa adanya — layar ini tidak
      boleh memaksa orang memilih sektor untuk pekerjaan yang memang tak
      punya sektor (galian, urugan).
    */
    expect(volume("", { panjang: "4" }).satuan).toBe("m");
    expect(volume("", { panjang: "4", lebar: "3" }).satuan).toBe("m²");
    expect(volume("", { panjang: "4", lebar: "3", tinggi: "2" }).satuan).toBe("m³");
    expect(volume("", { panjang: "4", lebar: "3", tinggi: "2" }).volume).toBe(24);
  });
});

describe("penjagaan masukan", () => {
  it("menolak faktor di atas 10", () => {
    expect(hitung("plafon", { ...D, panjang: "4", lebar: "3", faktor: "11" }, []))
      .toHaveProperty("galat");
  });

  it("menolak jumlah nol", () => {
    expect(hitung("plafon", { ...D, panjang: "4", lebar: "3", jumlah: "0" }, []))
      .toHaveProperty("galat");
  });

  it("dimensi kosong DIBEDAKAN dari nol", () => {
    /*
      Isian yang belum diisi bukan "nol meter". Menganggapnya nol menghasilkan
      volume 0 yang lolos diam-diam dan hilang di dalam total.
    */
    expect(hitung("plafon", { ...D, panjang: "4" }, [])).toHaveProperty("galat");
  });
});

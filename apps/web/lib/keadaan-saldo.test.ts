import { describe, it, expect } from "vitest";
import { keadaanSaldo, labelSaldo, AMBANG_TIPIS } from "./keadaan-saldo";

describe("keadaanSaldo — minus tak boleh tersamar jadi 'tipis'", () => {
  it("saldo negatif besar = minus, BUKAN tipis", () => {
    // Ini regresi yang sesungguhnya terjadi: kas kecil di data nyata
    // bersaldo −Rp 213.695.000 tampil kuning "Saldo rendah", karena
    // `low = balance < 500_000` juga benar untuk setiap angka negatif
    // dan cabang merahnya tak pernah tercapai.
    expect(
      keadaanSaldo(-213_695_000, "petty_cash"),
      "saldo minus ratusan juta terbaca sebagai 'perlu diisi ulang' — " +
      "itu menyembunyikan kejanggalan pembukuan di balik peringatan rutin",
    ).toBe("minus");
  });

  it("saldo minus kecil pun tetap minus", () => {
    expect(keadaanSaldo(-1, "petty_cash")).toBe("minus");
  });

  it("minus berlaku untuk SEMUA jenis akun, bukan cuma kas kecil", () => {
    // Saldo kas fisik tak bisa negatif. Kas utama yang minus sama
    // janggalnya, dan sebelumnya sama sekali tak ditandai.
    expect(keadaanSaldo(-5_000_000, "main_cash")).toBe("minus");
    expect(keadaanSaldo(-5_000_000, "collector")).toBe("minus");
  });

  it("nol bukan minus", () => {
    // Batas yang mudah salah: `<= 0` akan menandai akun baru yang belum
    // pernah diisi sebagai kejanggalan pembukuan.
    expect(keadaanSaldo(0, "petty_cash")).toBe("tipis");
    expect(keadaanSaldo(0, "main_cash")).toBe("wajar");
  });
});

describe("keadaanSaldo — ambang tipis", () => {
  it("kas kecil di bawah ambang = tipis", () => {
    expect(keadaanSaldo(AMBANG_TIPIS - 1, "petty_cash")).toBe("tipis");
  });

  it("tepat di ambang sudah wajar", () => {
    expect(keadaanSaldo(AMBANG_TIPIS, "petty_cash")).toBe("wajar");
  });

  it("hanya kas kecil yang punya ambang tipis", () => {
    // Kas utama bersaldo kecil itu wajar menjelang penagihan; menandainya
    // membuat peringatan jadi kebisingan yang diabaikan.
    expect(keadaanSaldo(100_000, "main_cash")).toBe("wajar");
    expect(keadaanSaldo(100_000, "collector")).toBe("wajar");
  });
});

describe("labelSaldo — teks, bukan cuma warna (WCAG 1.4.1)", () => {
  it("minus dan tipis punya teks yang berbeda", () => {
    expect(labelSaldo("minus")).toBe("Saldo minus");
    expect(labelSaldo("tipis")).toBe("Saldo rendah");
  });

  it("keadaan wajar tak berlabel", () => {
    // Label di setiap baris melemahkan dua label yang benar-benar penting.
    expect(labelSaldo("wajar")).toBeNull();
  });
});

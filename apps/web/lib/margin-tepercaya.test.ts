import { describe, it, expect } from "vitest";
import {
  keandalanMargin, marginPerluDicurigai, alasanMarginRagu, AMBANG_MARGIN_MUSTAHIL,
} from "./margin-tepercaya";

describe("keandalanMargin — 100% bukan kabar baik, itu data hilang", () => {
  it("margin 100% tanpa biaya = tanpa-biaya", () => {
    // Keadaan nyata saat ini: nol baris project_expenses di seluruh
    // proyek aktif, jadi delapan proyek tampil 100% hijau "sehat".
    // Margin kotor 100% mustahil di konstruksi — tak ada pekerjaan yang
    // jadi tanpa upah, material, dan alat.
    expect(
      keandalanMargin(100, 0),
      "margin 100% ditampilkan sebagai proyek paling sehat, padahal ia " +
      "menandakan biayanya belum masuk sistem",
    ).toBe("tanpa-biaya");
  });

  it("margin tinggi dengan biaya kecil = biaya-tak-lengkap", () => {
    // Satu kasbon kecil dari total pekerjaan besar: 99,7% — sama tak
    // dipercayanya dengan 100%, tapi tak tertangkap kalau ambangnya
    // dipatok tepat 100.
    expect(keandalanMargin(99.7, 500_000)).toBe("biaya-tak-lengkap");
  });

  it("margin sehat yang wajar tetap wajar", () => {
    expect(keandalanMargin(61.1, 91_000_000)).toBe("wajar");
    expect(keandalanMargin(20, 80_000_000)).toBe("wajar");
  });

  it("tepat di ambang sudah dicurigai", () => {
    expect(keandalanMargin(AMBANG_MARGIN_MUSTAHIL, 1_000_000)).toBe("biaya-tak-lengkap");
    expect(keandalanMargin(AMBANG_MARGIN_MUSTAHIL - 0.1, 1_000_000)).toBe("wajar");
  });
});

describe("keandalanMargin — kerugian nyata JANGAN disembunyikan", () => {
  it("margin negatif tanpa biaya tetap wajar, bukan dicurigai", () => {
    // Batas yang mudah salah. Kalau `totalHpp === 0` saja dijadikan
    // syarat, proyek merugi akan ditandai "data tak lengkap" dan
    // kerugiannya tersembunyi — persis kebalikan dari yang dibutuhkan.
    expect(keandalanMargin(-15, 0)).toBe("wajar");
  });

  it("margin nol tidak dicurigai", () => {
    expect(keandalanMargin(0, 0)).toBe("wajar");
  });

  it("proyek merugi dengan biaya tercatat jelas wajar", () => {
    expect(marginPerluDicurigai(-30, 200_000_000)).toBe(false);
  });
});

describe("alasanMarginRagu — menyebut tindakannya, bukan cuma keraguan", () => {
  it("dua keadaan ragu punya penjelasan berbeda", () => {
    expect(alasanMarginRagu("tanpa-biaya")).toMatch(/belum ada biaya/i);
    expect(alasanMarginRagu("biaya-tak-lengkap")).toMatch(/belum lengkap/i);
  });

  it("keadaan wajar tak berpenjelasan", () => {
    expect(alasanMarginRagu("wajar")).toBeNull();
  });
});

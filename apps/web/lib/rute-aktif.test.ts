import { describe, it, expect } from "vitest";
import { rutenyaAktif, rutenyaAktifPersis, rutenyaAktifPenuh } from "./rute-aktif";

describe("rutenyaAktif", () => {
  it("cocok saat rutenya sama persis", () => {
    expect(rutenyaAktif("/proyek", "/proyek")).toBe(true);
  });

  it("cocok saat pathname adalah ANAK dari href", () => {
    expect(rutenyaAktif("/proyek/abc-123", "/proyek")).toBe(true);
    expect(rutenyaAktif("/pengaturan/roles", "/pengaturan")).toBe(true);
  });

  // ── Inilah alasan berkas ini ada ─────────────────────────────────────────
  //
  // `startsWith` mentah menjawab `true` untuk ketiga kasus di bawah, dan itu
  // membuat dua item menyala bersamaan — yang menyala bukan yang dibuka.
  it("TIDAK cocok untuk saudara yang berawalan sama", () => {
    expect(rutenyaAktif("/proyeksi-kas", "/proyek")).toBe(false);
    expect(rutenyaAktif("/pengaturan/situs-lama", "/pengaturan/situs")).toBe(false);
    expect(rutenyaAktif("/kas-kecil", "/kas")).toBe(false);
  });

  it("membedakan di batas SEGMEN, bukan batas karakter", () => {
    // Bukti eksplisit bahwa startsWith mentah akan salah di sini.
    expect("/proyeksi-kas".startsWith("/proyek")).toBe(true);
    expect(rutenyaAktif("/proyeksi-kas", "/proyek")).toBe(false);
  });

  it("href kosong tak pernah aktif", () => {
    expect(rutenyaAktif("/proyek", "")).toBe(false);
  });

  it("href berakhiran garis miring tidak menghasilkan '//'", () => {
    expect(rutenyaAktif("/proyek/abc", "/proyek/")).toBe(true);
    expect(rutenyaAktif("/proyeksi", "/proyek/")).toBe(false);
  });

  it("rute akar tidak menyalakan segalanya lewat jalur 'anak'", () => {
    // "/" + "/" = "//", dan tak ada pathname yang diawali "//".
    expect(rutenyaAktif("/dashboard", "/")).toBe(false);
    expect(rutenyaAktif("/", "/")).toBe(true);
  });
});

describe("rutenyaAktifPersis", () => {
  it("hanya cocok sama persis — induk tak menyala saat anaknya dibuka", () => {
    expect(rutenyaAktifPersis("/pengaturan", "/pengaturan")).toBe(true);
    expect(rutenyaAktifPersis("/pengaturan/roles", "/pengaturan")).toBe(false);
  });
});

describe("rutenyaAktifPenuh", () => {
  const q = (s: string) => new URLSearchParams(s);

  it("membedakan dua sub-menu di halaman yang sama", () => {
    // Inilah alasan fungsi ini ada: keduanya menunjuk /dokumen/kendali,
    // dan hanya query yang membedakannya.
    expect(rutenyaAktifPenuh("/dokumen/kendali", q("bagian=notulen"),
      "/dokumen/kendali?bagian=notulen")).toBe(true);
    expect(rutenyaAktifPenuh("/dokumen/kendali", q("bagian=notulen"),
      "/dokumen/kendali?bagian=transmittal")).toBe(false);
  });

  it("menu tanpa query TIDAK menyala saat URL punya query", () => {
    // Kalau tidak, "Kendali Dokumen" menyala di keempat tabnya sekaligus.
    expect(rutenyaAktifPenuh("/dokumen/kendali", q("bagian=notulen"),
      "/dokumen/kendali")).toBe(false);
  });

  it("menu tanpa query menyala saat URL juga tanpa query", () => {
    expect(rutenyaAktifPenuh("/proyek", null, "/proyek")).toBe(true);
    expect(rutenyaAktifPenuh("/proyek", q(""), "/proyek")).toBe(true);
  });

  it("jalur berbeda tak pernah cocok meski query sama", () => {
    expect(rutenyaAktifPenuh("/kepatuhan", q("bagian=notulen"),
      "/dokumen/kendali?bagian=notulen")).toBe(false);
  });

  it("urutan parameter tak berpengaruh", () => {
    expect(rutenyaAktifPenuh("/x", q("b=2&a=1"), "/x?a=1&b=2")).toBe(true);
  });

  it("parameter tambahan di URL tak membatalkan kecocokan", () => {
    // `?bagian=notulen&proyek=abc` tetap menyalakan menu Notulen — parameter
    // lain adalah keadaan halaman, bukan penentu menu.
    expect(rutenyaAktifPenuh("/dokumen/kendali", q("bagian=notulen&proyek=abc"),
      "/dokumen/kendali?bagian=notulen")).toBe(true);
  });
});

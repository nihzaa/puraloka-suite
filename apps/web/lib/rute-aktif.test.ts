import { describe, it, expect } from "vitest";
import { rutenyaAktif, rutenyaAktifPersis } from "./rute-aktif";

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

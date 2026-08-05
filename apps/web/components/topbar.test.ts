import { describe, it, expect } from "vitest";
import { getPageTitle } from "./topbar";

describe("breadcrumb — tak boleh berbohong soal di mana pemakai berada", () => {
  it("halaman tak terdaftar TIDAK jatuh ke 'Dashboard'", () => {
    // Regresi yang sesungguhnya: fungsi ini diakhiri `return "Dashboard"`,
    // sementara petanya memuat 14 entri untuk 60 halaman. Akibatnya 32
    // halaman menampilkan "Dashboard" — dan karena itu nama halaman yang
    // sah, tak ada yang mengenalinya sebagai kerusakan.
    expect(
      getPageTitle("/halaman-yang-belum-terdaftar"),
      "cadangan 'Dashboard' membuat lebih dari separuh halaman berbohong " +
      "soal lokasi pemakai — dan berbohong dengan meyakinkan",
    ).not.toBe("Dashboard");
  });

  it("halaman tak terdaftar memakai nama rutenya sendiri", () => {
    expect(getPageTitle("/uji-gulir")).toBe("Uji Gulir");
    expect(getPageTitle("/mutu/ncr")).toBe("Mutu (QA/QC)");
  });
});

describe("breadcrumb — pencocokan berhenti di batas segmen", () => {
  it("portal mandor BUKAN 'Mandor'", () => {
    expect(getPageTitle("/mandor-portal")).toBe("Portal Mandor");
    expect(getPageTitle("/mandor-portal/penagihan")).toBe("Portal Mandor");
  });

  it("awalan yang bukan segmen utuh TIDAK boleh cocok", () => {
    // Ini yang benar-benar menjaga batas segmen.
    //
    // Dua test di atas tidak menjaganya: "/mandor-portal" terdaftar
    // sendiri dan berada lebih awal di daftar, jadi ia menang sebelum
    // "/mandor" sempat diperiksa. Saya menemukan itu lewat uji mutasi —
    // mengganti `startsWith(prefix + "/")` jadi `startsWith(prefix)`
    // polos tetap membuat keduanya hijau.
    //
    // "/kasbon" tidak terdaftar, jadi satu-satunya yang bisa membuatnya
    // berlabel "Kas" adalah pencocokan awalan tanpa batas segmen.
    expect(
      getPageTitle("/kasbon"),
      "'/kasbon' bukan bagian dari '/kas' — pencocokan awalan tanpa " +
      "garis miring membuat rute yang kebetulan berawalan sama tercaplok",
    ).toBe("Kasbon");
    expect(getPageTitle("/tenderisasi")).toBe("Tenderisasi");
  });

  it("halaman mandor internal tetap 'Mandor'", () => {
    expect(getPageTitle("/mandor")).toBe("Mandor");
    expect(getPageTitle("/mandor/retensi")).toBe("Mandor");
  });

  it("portal klien dan portal PM terpisah", () => {
    expect(getPageTitle("/portal")).toBe("Portal Klien");
    expect(getPageTitle("/portal/profil")).toBe("Portal Klien");
    expect(getPageTitle("/pm-portal/keuangan")).toBe("Portal PM");
  });
});

describe("breadcrumb — halaman yang dulu salah kini benar", () => {
  it.each([
    ["/piutang", "Piutang"],
    ["/akuntansi", "Akuntansi"],
    ["/aset", "Alat & Aset"],
    ["/estimasi", "Estimasi & RAB"],
    ["/tender", "Tender"],
    ["/lapangan/inspeksi", "Operasi Lapangan"],
    ["/lapangan/punch-list", "Operasi Lapangan"],
    ["/kontrak/rfi", "Kontrak"],
  ])("%s → %s", (rute, harapan) => {
    expect(getPageTitle(rute)).toBe(harapan);
  });
});

describe("breadcrumb — akar", () => {
  it("akar bukan 'Dashboard'", () => {
    // "/" mengalihkan ke dashboard, tapi selama pengalihan berlangsung
    // breadcrumb tak boleh mengklaim sudah sampai.
    expect(getPageTitle("/")).toBe("Beranda");
  });
});

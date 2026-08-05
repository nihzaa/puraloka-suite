import { describe, it, expect } from "vitest";
import {
  hitungHref, pilihWakil, belumPunyaHalaman, skorKecocokan,
  type SimpulMenu,
} from "./menu-berbagi-href";

/** Bentuk yang mendekati menu sungguhan: banyak anak berbagi satu href. */
const MENU: SimpulMenu[] = [
  {
    key: "prakon", label: "Pra-Konstruksi", href: null,
    children: [
      { key: "crm-bidbond", label: "Jaminan Penawaran", href: "/proyek" },
      { key: "wbs", label: "WBS Proyek", href: "/proyek" },
    ],
  },
  {
    key: "kontrak", label: "Kontrak", href: null,
    children: [
      { key: "kt-register", label: "Register Kontrak", href: "/proyek" },
      { key: "kt-co", label: "Change Order", href: "/proyek" },
    ],
  },
  { key: "kas", label: "Kas & Pengeluaran", href: "/kas" },
];

describe("hitungHref — berapa item memakai href yang sama", () => {
  it("menghitung lintas grup, bukan per grup", () => {
    // Percobaan kedua saya menghitung per-grup, dan itu memperbaiki
    // /estimasi tapi menyisakan empat item menyala di /proyek — masing-
    // masing satu-satunya pemakai /proyek DI GRUPNYA.
    expect(hitungHref(MENU).get("/proyek")).toBe(4);
  });

  it("href yang dipakai sekali tetap satu", () => {
    expect(hitungHref(MENU).get("/kas")).toBe(1);
  });
});

describe("pilihWakil — perwakilan dipilih dari kecocokan label", () => {
  it("bukan item pertama yang ditemui", () => {
    // "Jaminan Penawaran" ada lebih dulu di urutan menu, tapi "WBS
    // Proyek" jauh lebih menyiratkan halaman Proyek.
    expect(
      pilihWakil(MENU).get("/proyek"),
      "perwakilan yang bernama tak berkaitan sama membingungkannya " +
      "dengan tak ada penanda posisi",
    ).toBe("wbs");
  });

  it("stabil terhadap urutan menu", () => {
    // Perwakilan tak boleh berpindah cuma karena sort_order diubah.
    const dibalik: SimpulMenu[] = [...MENU].reverse();
    expect(pilihWakil(dibalik).get("/proyek")).toBe("wbs");
  });
});

describe("belumPunyaHalaman — mana yang diredupkan", () => {
  const jumlah = hitungHref(MENU);
  const wakil = pilihWakil(MENU);

  it("item berbagi href yang BUKAN perwakilan → diredupkan", () => {
    expect(belumPunyaHalaman("/proyek", "crm-bidbond", jumlah, wakil)).toBe(true);
    expect(belumPunyaHalaman("/proyek", "kt-co", jumlah, wakil)).toBe(true);
  });

  it("perwakilan TIDAK diredupkan", () => {
    // Kalau perwakilan ikut diredupkan, /proyek menampilkan NOL item
    // tersorot — lebih buruk daripada 23 menyala, karena setidaknya
    // yang 23 memberi tahu grup mana yang sedang dibuka.
    expect(
      belumPunyaHalaman("/proyek", "wbs", jumlah, wakil),
      "meredupkan perwakilan menghapus penanda posisi sepenuhnya",
    ).toBe(false);
  });

  it("halaman sungguhan tak pernah diredupkan", () => {
    expect(belumPunyaHalaman("/kas", "kas", jumlah, wakil)).toBe(false);
  });

  it("href kosong atau '#' bukan urusan fungsi ini", () => {
    expect(belumPunyaHalaman(null, "x", jumlah, wakil)).toBe(false);
    expect(belumPunyaHalaman("#", "x", jumlah, wakil)).toBe(false);
  });
});

describe("skorKecocokan", () => {
  it("cocok persis menang", () => {
    expect(skorKecocokan("Proyek", "/proyek")).toBe(3);
  });

  it("berawalan sama di atas sekadar memuat", () => {
    expect(skorKecocokan("Proyek Aktif", "/proyek")).toBeGreaterThan(
      skorKecocokan("Daftar proyek lama", "/proyek"),
    );
  });

  it("tak berkaitan = 0", () => {
    expect(skorKecocokan("Jaminan Penawaran", "/proyek")).toBe(0);
  });
});

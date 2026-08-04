import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// F4-3 — kejujuran pesan jalur lapangan.
//
// Yang diuji di sini BUKAN jaringannya (itu di `antrean-offline.test.ts`),
// melainkan penerjemahan empat hasil menjadi dua keputusan yang dilihat
// mandor:
//
//   `aman`     — boleh menutup modal dan mengosongkan form?
//   `terkirim` — perlu me-refresh daftar dari server?
//
// Salah menerjemahkannya menghasilkan dua kegagalan yang sama-sama senyap:
//
//   aman=true saat kiriman HILANG   → form dikosongkan, isian mandor lenyap
//                                      dan ia mengira sudah tersimpan.
//   terkirim=true saat baru DIANTRE → daftar di-refresh dari server, kiriman
//                                      barusan tak muncul, mandor mengirim
//                                      ulang → dobel.
// ============================================================================

type Status = "terkirim" | "ditolak" | "diantre" | "penuh";
let hasilBerikut: { status: Status; galat?: unknown; data?: unknown } = { status: "terkirim" };

vi.mock("@/lib/antrean-offline", () => ({
  kirimAtauAntre: vi.fn(async () => hasilBerikut),
}));

const { kirimLapangan } = await import("./kirim-lapangan");

const panggil = () =>
  kirimLapangan("POST", "/api/v1/x", { a: 1 }, "Berhasil disimpan", "Gagal menyimpan");

beforeEach(() => {
  hasilBerikut = { status: "terkirim" };
});

describe("terkirim — server menerima", () => {
  it("aman, terkirim, memakai pesan sukses halaman", async () => {
    const h = await panggil();
    expect(h.aman).toBe(true);
    expect(h.terkirim).toBe(true);
    expect(h.pesan).toBe("Berhasil disimpan");
  });

  it("meneruskan respons server — halaman butuh id hasil kiriman", async () => {
    hasilBerikut = { status: "terkirim", data: { data: { id: "log-1" } } };
    const h = await panggil();

    expect(h.data,
      "respons server dibuang — halaman progress tak bisa melampirkan foto " +
      "ke log yang baru dibuat karena id-nya hilang").toEqual({ data: { id: "log-1" } });
  });
});

describe("diantre — tersimpan di perangkat, belum sampai server", () => {
  it("aman TAPI tidak terkirim", async () => {
    hasilBerikut = { status: "diantre" };
    const h = await panggil();

    expect(h.aman, "form tidak dikosongkan padahal kiriman AMAN di antrean — " +
      "mandor mengetik ulang sesuatu yang sudah tersimpan").toBe(true);
    expect(h.terkirim,
      "daftar di-refresh dari server padahal kiriman belum sampai — kiriman " +
      "barusan tak muncul, mandor mengirim ulang, dan jadinya DOBEL").toBe(false);
  });

  it("pesannya menyebut sinyal, BUKAN 'berhasil'", async () => {
    hasilBerikut = { status: "diantre" };
    const h = await panggil();

    expect(h.pesan).not.toBe("Berhasil disimpan");
    expect(h.pesan.toLowerCase(),
      "pesan tak menyebut sinyal — mandor mengira sudah sampai di kantor").toContain("sinyal");
  });

  it("TIDAK membawa `data` — belum ada id dari server", async () => {
    // Bahkan bila lapis bawah keliru menyertakannya, `data` harus tetap
    // kosong: kiriman yang baru diantre belum pernah dilihat server, jadi
    // id apa pun di sini adalah kebohongan yang menjalar ke pemakainya.
    hasilBerikut = { status: "diantre", data: { data: { id: "palsu" } } };
    const h = await panggil();

    expect(h.data,
      "hasil DIANTRE membawa id — halaman memakainya seolah log sudah ada, " +
      "lalu melampirkan foto ke id yang tak pernah dibuat").toBeUndefined();
  });
});

describe("penuh — kiriman TIDAK tersimpan di mana pun", () => {
  it("TIDAK aman: form wajib dibiarkan terisi", async () => {
    hasilBerikut = { status: "penuh" };
    const h = await panggil();

    expect(h.aman,
      "penyimpanan penuh dilaporkan aman — modal ditutup, form dikosongkan, " +
      "dan isian mandor HILANG tanpa tersimpan di mana pun").toBe(false);
    expect(h.terkirim).toBe(false);
    expect(h.pesan.toUpperCase()).toContain("TIDAK TERSIMPAN");
  });
});

describe("ditolak — server menjawab dengan galat", () => {
  it("memakai alasan dari server bila ada", async () => {
    hasilBerikut = {
      status: "ditolak",
      galat: { response: { data: { error: "Saldo kasbon melebihi batas" } } },
    };
    const h = await panggil();

    expect(h.aman).toBe(false);
    expect(h.pesan,
      "alasan server dibuang dan diganti pesan umum — mandor tak tahu apa " +
      "yang harus diperbaiki dan mencoba lagi dengan isian yang sama").toBe("Saldo kasbon melebihi batas");
  });

  it("jatuh ke pesan cadangan bila server tak menyebut alasan", async () => {
    hasilBerikut = { status: "ditolak", galat: new Error("boom") };
    const h = await panggil();
    expect(h.pesan).toBe("Gagal menyimpan");
  });

  it("galat tanpa bentuk apa pun tidak melempar", async () => {
    hasilBerikut = { status: "ditolak", galat: undefined };
    const h = await panggil();
    expect(h.pesan).toBe("Gagal menyimpan");
    expect(h.aman).toBe(false);
  });
});

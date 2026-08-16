import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// F4-2 — jaminan lapis data: DEDUP, CACHE, INVALIDASI, ISOLASI COMPANY.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KEEMPATNYA DIUJI, DAN YANG PALING PENTING DI ANTARANYA
// ══════════════════════════════════════════════════════════════════════════
//
// Tiga yang pertama adalah janji kinerja: kalau rusak, aplikasi jadi lambat.
// Yang KEEMPAT beda kelasnya — kalau rusak, satu tenant melihat data tenant
// lain.
//
// Isolasi company diuji paling keras justru karena hari ini ia TAK PERNAH
// TERBUKTI SALAH: `company-switcher.tsx:90` memanggil `window.location.reload()`
// yang membuang seluruh modul, jadi cache apa pun ikut hilang.
//
// Ketergantungan itu rapuh dan tak tertulis di mana pun. Siapa pun yang kelak
// mengubah switcher jadi transisi tanpa reload — hal yang wajar diinginkan —
// akan menghidupkan kebocoran tanpa satu pun galat. Test ini yang membuat
// perubahan itu MERAH, bukan senyap.
// ============================================================================

const panggilan: string[] = [];
let balasan: Record<string, unknown> = {};
let tundaMs = 0;

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(async (url: string) => {
      panggilan.push(url);
      if (tundaMs) await new Promise((r) => setTimeout(r, tundaMs));
      return { data: balasan[url] ?? { ok: true } };
    }),
  },
}));

const { ambilData, invalidasi, buangCacheCompanyLain, _resetCache } =
  await import("./data-cache");

function setCompany(id: string) {
  localStorage.setItem("puraloka_company_id", id);
}

beforeEach(() => {
  panggilan.length = 0;
  balasan = {};
  tundaMs = 0;
  _resetCache();
  localStorage.clear();
});

describe("cache — permintaan kedua tak menyentuh jaringan", () => {
  it("dua panggilan berurutan = SATU request", async () => {
    setCompany("A");
    await ambilData("/api/v1/units");
    await ambilData("/api/v1/units");
    expect(panggilan.length,
      "cache tak bekerja — tiap navigasi mengambil ulang semuanya, dan di " +
      "lapangan dengan sinyal buruk itu terasa seperti aplikasi rusak").toBe(1);
  });

  it("`paksa` melewati cache", async () => {
    setCompany("A");
    await ambilData("/api/v1/units");
    await ambilData("/api/v1/units", { paksa: true });
    expect(panggilan.length).toBe(2);
  });

  it("cache kedaluwarsa diambil ulang", async () => {
    setCompany("A");
    await ambilData("/api/v1/units", { segar: 0 });
    await ambilData("/api/v1/units", { segar: 0 });
    expect(panggilan.length).toBe(2);
  });
});

describe("dedup — dua komponen serentak, satu request", () => {
  it("permintaan bersamaan berbagi promise yang SAMA", async () => {
    setCompany("A");
    tundaMs = 20;
    // Meniru dua komponen di layar yang sama meminta data identik. Tanpa dedup
    // ini dua perjalanan bolak-balik untuk jawaban yang persis sama.
    const [a, b] = await Promise.all([
      ambilData("/api/v1/units"),
      ambilData("/api/v1/units"),
    ]);
    expect(panggilan.length,
      "dedup tak bekerja — komponen yang butuh data sama mengirim request " +
      "masing-masing").toBe(1);
    expect(a).toBe(b);   // objek yang SAMA, bukan sekadar setara
  });

  it("url berbeda tetap dua request", async () => {
    setCompany("A");
    await Promise.all([
      ambilData("/api/v1/units"),
      ambilData("/api/v1/work-categories"),
    ]);
    expect(panggilan.length,
      "dedup terlalu agresif — menyatukan permintaan yang berbeda").toBe(2);
  });
});

describe("invalidasi — data yang berubah tak boleh tertinggal", () => {
  it("invalidasi berawalan membuang yang cocok saja", async () => {
    setCompany("A");
    await ambilData("/api/v1/units");
    await ambilData("/api/v1/work-categories");
    panggilan.length = 0;

    invalidasi("/api/v1/units");

    await ambilData("/api/v1/units");           // dibuang → ambil ulang
    await ambilData("/api/v1/work-categories"); // masih segar → dari cache
    expect(panggilan,
      "invalidasi berawalan salah sasaran").toEqual(["/api/v1/units"]);
  });

  it("invalidasi tanpa argumen membuang semua", async () => {
    setCompany("A");
    await ambilData("/api/v1/units");
    await ambilData("/api/v1/work-categories");
    panggilan.length = 0;

    invalidasi();

    await ambilData("/api/v1/units");
    await ambilData("/api/v1/work-categories");
    expect(panggilan.length).toBe(2);
  });
});

describe("ISOLASI COMPANY — yang paling penting", () => {
  it("data company A TIDAK dipakai ulang oleh company B", async () => {
    balasan["/api/v1/units"] = { units: ["milik-A"] };
    setCompany("A");
    const a = await ambilData<{ units: string[] }>("/api/v1/units");
    expect(a.units).toEqual(["milik-A"]);

    // Pindah tenant TANPA reload — inilah yang akan terjadi bila company
    // switcher kelak diubah jadi transisi mulus.
    balasan["/api/v1/units"] = { units: ["milik-B"] };
    setCompany("B");
    const b = await ambilData<{ units: string[] }>("/api/v1/units");

    expect(b.units,
      "company B menerima data company A dari cache — kebocoran lintas-tenant " +
      "yang tak menimbulkan galat sama sekali").toEqual(["milik-B"]);
    expect(panggilan.length,
      "cache tak berkunci company").toBe(2);
  });

  it("kembali ke A memakai cache A, bukan mengambil ulang", async () => {
    setCompany("A");
    await ambilData("/api/v1/units");
    setCompany("B");
    await ambilData("/api/v1/units");
    panggilan.length = 0;

    setCompany("A");
    await ambilData("/api/v1/units");
    expect(panggilan.length,
      "cache per-company hilang saat berpindah — bolak-balik antar PT jadi " +
      "mengambil ulang terus").toBe(0);
  });

  it("buangCacheCompanyLain menyisakan HANYA milik company aktif", async () => {
    setCompany("A");
    await ambilData("/api/v1/units");
    setCompany("B");
    await ambilData("/api/v1/units");

    // Masih di B — buang milik selain B.
    buangCacheCompanyLain();
    panggilan.length = 0;

    await ambilData("/api/v1/units");        // B masih ada
    expect(panggilan.length).toBe(0);

    setCompany("A");
    await ambilData("/api/v1/units");        // A sudah dibuang
    expect(panggilan.length,
      "cache company lain tak terbuang").toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// KEBOCORAN IDENTITAS SAAT URL BERGANTI — kelas kelima, ditemukan 2026-08-16
// ══════════════════════════════════════════════════════════════════════════
//
// Bentuk pertama `useData` menyimpan `data` sebagai state LEPAS dan tidak
// mengosongkannya saat `url` berganti: ia menaikkan `memuat`, lalu menimpa
// `data` sesudah jawaban baru tiba. Di antara keduanya, `data` masih berisi
// jawaban untuk URL SEBELUMNYA.
//
// Untuk halaman ber-saringan itu tak berbahaya. Untuk rute `[id]` itu berarti
// `/mandor/A` → `/mandor/B` menampilkan profil A di bawah URL B.
//
// Ditemukan saat memindahkan `mandor/[id]` (kode lamanya punya pelacakan
// `dimuat !== id` justru untuk mencegah ini), lalu TERULANG di
// `proyek/[id]/baseline` — yang responsnya bahkan tak memuat id proyeknya,
// jadi pemanggil tak punya apa pun untuk dicocokkan.
//
// Diuji di lapisan `useData`, bukan di halaman: memperbaikinya di tiap halaman
// berarti mengulang pertahanan yang sama di puluhan tempat, dan satu yang lupa
// cukup untuk memperlihatkan data pihak lain.
describe("useData — data terikat ke URL-nya", () => {
  it("data untuk URL LAMA tidak dikembalikan di bawah URL BARU", async () => {
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { useData } = await import("./data-cache");

    balasan = { "/api/v1/mandor/A": { nama: "Andi" },
                "/api/v1/mandor/B": { nama: "Budi" } };

    const { result, rerender } = renderHook(
      ({ u }: { u: string }) => useData<{ nama: string }>(u),
      { initialProps: { u: "/api/v1/mandor/A" } },
    );
    await waitFor(() => expect(result.current.data?.nama).toBe("Andi"));

    /*
      Jawaban B sengaja DITUNDA supaya jendela bahayanya benar-benar terbuka.
      Tanpa tunda, jawaban baru tiba di tick yang sama dan cacatnya tak
      pernah terlihat — test yang hijau untuk alasan yang salah.
    */
    tundaMs = 50;
    rerender({ u: "/api/v1/mandor/B" });

    // INI baris yang merah pada bentuk lama: `data` masih berisi Andi.
    expect(result.current.data,
      "data URL lama bocor ke URL baru").toBeNull();

    await waitFor(() => expect(result.current.data?.nama).toBe("Budi"));
    tundaMs = 0;
  });

  it("kembali ke URL yang sudah di-cache tetap langsung terisi", async () => {
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { useData } = await import("./data-cache");

    balasan = { "/api/v1/x/1": { n: 1 }, "/api/v1/x/2": { n: 2 } };

    const { result, rerender } = renderHook(
      ({ u }: { u: string }) => useData<{ n: number }>(u),
      { initialProps: { u: "/api/v1/x/1" } },
    );
    await waitFor(() => expect(result.current.data?.n).toBe(1));
    rerender({ u: "/api/v1/x/2" });
    await waitFor(() => expect(result.current.data?.n).toBe(2));

    // Balik ke 1: masih segar di cache, jadi terisi tanpa permintaan baru.
    panggilan.length = 0;
    rerender({ u: "/api/v1/x/1" });
    await waitFor(() => expect(result.current.data?.n).toBe(1));
    expect(panggilan.length, "cache tak terpakai saat kembali").toBe(0);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// F4-3 — jaminan antrean offline jalur lapangan.
//
// ══════════════════════════════════════════════════════════════════════════
// EMPAT JAMINAN, DAN KENAPA MASING-MASING PENTING
// ══════════════════════════════════════════════════════════════════════════
//
//   TERSIMPAN  — kalau hilang, mandor mengetik ulang laporan upah 30 tukang.
//   TAK GANDA  — kalau ganda, kasbon terbayar dua kali. Ini soal uang.
//   BERURUTAN  — laporan minggu ke-2 tak boleh mendahului minggu ke-1.
//   BERKUNCI COMPANY — antrean PT A tak boleh terkirim saat berada di PT B.
//
// ── Pembeda yang paling mudah salah
//
// Galat JARINGAN diantre; galat SERVER tidak. 400 "nominal wajib diisi" tak
// akan pernah berhasil berapa kali pun diulang — mengantrekannya berarti
// mandor menunggu sesuatu yang takkan datang, dan antreannya tersumbat
// selamanya oleh kiriman yang mustahil lolos.
// ============================================================================

type Panggilan = { method: string; url: string; headers?: Record<string, string> };
const panggilan: Panggilan[] = [];

type Status = number | null | "ok";

/** null = jaringan putus (tanpa `response`). Angka = server menjawab. */
let statusBerikut: Status = "ok";

/**
 * Bila diisi, tiap panggilan mengambil status BERIKUTNYA dari daftar ini.
 *
 * Dipakai untuk skenario yang butuh perilaku berbeda per panggilan — tanpa
 * mengganti `mockImplementation`, yang bocor ke test berikutnya.
 */
let urutanStatus: Status[] = [];

vi.mock("@/lib/api", () => ({
  api: {
    request: vi.fn(async (cfg: Panggilan) => {
      panggilan.push(cfg);
      const s: Status = urutanStatus.length ? urutanStatus.shift()! : statusBerikut;
      if (s === "ok") return { data: { ok: true } };
      if (s === null) {
        // Meniru axios saat jaringan putus: TANPA properti `response`.
        throw new Error("Network Error");
      }
      throw Object.assign(new Error("HTTP"), { response: { status: s } });
    }),
  },
}));

const {
  kirimAtauAntre, sinkronkan, antreanAktif, bacaAntrean, buang, _reset,
} = await import("./antrean-offline");

function setCompany(id: string) {
  localStorage.setItem("puraloka_company_id", id);
}

beforeEach(() => {
  panggilan.length = 0;
  statusBerikut = "ok";
  urutanStatus = [];
  localStorage.clear();
  _reset();
});

describe("TERSIMPAN — kiriman tak hilang saat sinyal putus", () => {
  it("gagal jaringan → masuk antrean", async () => {
    setCompany("A");
    statusBerikut = null;

    const h = await kirimAtauAntre("POST", "/api/v1/kasbons", { jumlah: 500000 });

    expect(h.status).toBe("diantre");
    expect(antreanAktif(),
      "kiriman HILANG saat sinyal putus — mandor harus mengetik ulang").toHaveLength(1);
    expect(antreanAktif()[0].payload).toEqual({ jumlah: 500000 });
  });

  it("berhasil → TIDAK masuk antrean", async () => {
    setCompany("A");
    const h = await kirimAtauAntre("POST", "/api/v1/kasbons", { jumlah: 1 });
    expect(h.status).toBe("terkirim");
    expect(antreanAktif()).toHaveLength(0);
  });

  it("antrean bertahan lintas pembacaan (localStorage, bukan memori)", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/kasbons", { jumlah: 7 });

    // Membaca ulang dari penyimpanan — meniru aplikasi dibuka kembali.
    expect(bacaAntrean(),
      "antrean hanya hidup di memori — tertutupnya aplikasi menghapusnya").toHaveLength(1);
  });
});

describe("SERVER MENOLAK ≠ SINYAL PUTUS", () => {
  it("galat 400 TIDAK diantre — mengulangnya tak akan menolong", async () => {
    setCompany("A");
    statusBerikut = 400;

    const h = await kirimAtauAntre("POST", "/api/v1/kasbons", { jumlah: null });

    expect(h.status,
      "galat server dilaporkan sebagai terkirim/diantre — halaman akan " +
      "menampilkan 'berhasil' untuk kiriman yang ditolak").toBe("ditolak");
    expect(antreanAktif(),
      "kiriman yang MUSTAHIL lolos masuk antrean dan menyumbatnya selamanya").toHaveLength(0);
  });

  it("galat 403 juga tidak diantre", async () => {
    setCompany("A");
    statusBerikut = 403;
    const h = await kirimAtauAntre("POST", "/api/v1/kasbons", {});
    expect(h.status).toBe("ditolak");
    expect(antreanAktif()).toHaveLength(0);
  });
});

describe("TAK GANDA — Idempotency-Key lahir sekali", () => {
  it("kunci yang SAMA dipakai ulang saat sinkron", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/kasbons", { jumlah: 9 });
    const kunciAwal = antreanAktif()[0].kunciIdem;
    panggilan.length = 0;

    statusBerikut = "ok";
    await sinkronkan();

    expect(panggilan[0]?.headers?.["Idempotency-Key"],
      "kunci idempotensi berubah saat dikirim ulang — server tak bisa " +
      "mengenali bahwa ini kiriman yang SAMA, dan kasbon terbayar dua kali").toBe(kunciAwal);
  });

  it("dua kiriman berbeda punya kunci berbeda", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/kasbons", { jumlah: 1 });
    await kirimAtauAntre("POST", "/api/v1/kasbons", { jumlah: 2 });

    const [a, b] = antreanAktif();
    expect(a.kunciIdem,
      "dua kiriman berbagi kunci — yang kedua akan dianggap ulangan yang " +
      "pertama dan TIDAK PERNAH tersimpan").not.toBe(b.kunciIdem);
  });
});

describe("BERURUTAN — dan berhenti saat sinyal masih putus", () => {
  it("dikirim sesuai urutan dibuat", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/a", { n: 1 });
    await kirimAtauAntre("POST", "/api/v1/b", { n: 2 });
    await kirimAtauAntre("POST", "/api/v1/c", { n: 3 });
    panggilan.length = 0;

    statusBerikut = "ok";
    await sinkronkan();

    expect(panggilan.map((p) => p.url),
      "urutan kiriman berubah — laporan minggu ke-2 bisa mendahului ke-1")
      .toEqual(["/api/v1/a", "/api/v1/b", "/api/v1/c"]);
  });

  it("berhenti pada kegagalan jaringan pertama, tak membakar sisanya", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/a", {});
    await kirimAtauAntre("POST", "/api/v1/b", {});
    await kirimAtauAntre("POST", "/api/v1/c", {});
    panggilan.length = 0;

    // Sinyal masih putus.
    const h = await sinkronkan();

    expect(panggilan.length,
      "seluruh antrean dicoba padahal sinyal masih putus — hanya menaikkan " +
      "hitungan percobaan tanpa guna").toBe(1);
    expect(h.tersisa).toBe(3);
  });

  it("kiriman yang DITOLAK server dibuang, sisanya lanjut", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/tolak", {});
    await kirimAtauAntre("POST", "/api/v1/terima", {});

    // ⚠️ Perilaku per-panggilan diatur lewat `urutanStatus`, BUKAN dengan
    // mengganti `mockImplementation`.
    //
    // Percobaan pertama memakai mockImplementation dan mock-nya BOCOR ke tiga
    // test berikutnya — mereka gagal dengan galat yang sama sekali tak
    // berhubungan ("Cannot read properties of undefined"), dan sebabnya jauh
    // dari gejalanya. Mock yang diganti di tengah berkas harus dipulihkan,
    // dan cara paling aman adalah tak menggantinya sama sekali.
    urutanStatus = [400, "ok"];

    const h = await sinkronkan();

    expect(h.gagal, "kiriman yang ditolak server tak dibuang — ia menyumbat " +
      "antrean selamanya").toBe(1);
    expect(h.terkirim).toBe(1);
    expect(antreanAktif()).toHaveLength(0);
  });
});

describe("BERKUNCI COMPANY", () => {
  it("antrean PT A tidak terkirim saat berada di PT B", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/kasbons", { milik: "A" });

    setCompany("B");
    panggilan.length = 0;
    statusBerikut = "ok";
    const h = await sinkronkan();

    expect(panggilan.length,
      "kiriman PT A dikirim saat pengguna berada di PT B — data masuk ke " +
      "perusahaan yang salah").toBe(0);
    expect(h.terkirim).toBe(0);

    // Kembali ke A — barulah terkirim.
    setCompany("A");
    await sinkronkan();
    expect(panggilan.length).toBe(1);
  });

  it("antreanAktif hanya menampilkan milik company aktif", async () => {
    statusBerikut = null;
    setCompany("A");
    await kirimAtauAntre("POST", "/api/v1/x", {});
    setCompany("B");
    await kirimAtauAntre("POST", "/api/v1/y", {});

    expect(antreanAktif()).toHaveLength(1);
    expect(bacaAntrean(), "antrean company lain ikut terhapus").toHaveLength(2);
  });
});

describe("pembatalan manual", () => {
  it("buang() menghapus satu kiriman", async () => {
    setCompany("A");
    statusBerikut = null;
    await kirimAtauAntre("POST", "/api/v1/a", {});
    await kirimAtauAntre("POST", "/api/v1/b", {});

    buang(antreanAktif()[0].id);
    expect(antreanAktif()).toHaveLength(1);
    expect(antreanAktif()[0].url).toBe("/api/v1/b");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  antrekan, bacaAntrean, antreanCompany, buang, tautkanKeLog, sinkronkan,
  berlangganan, _reset, BATAS_FOTO, BATAS_PERCOBAAN,
  type FotoAntre,
} from "./antrean-foto";

// ════════════════════════════════════════════════════════════════════════════
// TIRUAN IndexedDB — ditulis di sini, pola & alasannya sama dengan
// `cache-baca.test.ts`: yang dipakai cuma getAll/put/delete/clear pada satu
// object store, dan menambah dependensi untuk itu berarti menambah rantai
// pasok yang harus diaudit selamanya demi permukaan yang muat di 50 baris.
//
// Tiruan ini SENGAJA tak lengkap. Kalau `antrean-foto.ts` kelak memakai index
// atau rentang kunci, test akan gagal keras di sini — dan itu sinyal untuk
// memasang pustaka sungguhan, bukan menambal tiruan ini.
// ════════════════════════════════════════════════════════════════════════════

type PermintaanTiruan = {
  result: unknown;
  onsuccess?: () => void;
  onerror?: () => void;
};

function jadikanPermintaan(hasil: unknown): PermintaanTiruan {
  const p: PermintaanTiruan = { result: hasil };
  queueMicrotask(() => p.onsuccess?.());
  return p;
}

class TokoTiruan {
  isi = new Map<string, FotoAntre>();
  put(r: FotoAntre) { this.isi.set(r.id, r); return jadikanPermintaan(undefined); }
  getAll() { return jadikanPermintaan([...this.isi.values()]); }
  delete(id: string) { this.isi.delete(id); return jadikanPermintaan(undefined); }
  clear() { this.isi.clear(); return jadikanPermintaan(undefined); }
}

let toko: TokoTiruan;
/** Bila `true`, `transaction()` melempar — menguji jalur gagal-simpan. */
let trxGagal = false;

function pasangIndexedDbTiruan() {
  toko = new TokoTiruan();
  trxGagal = false;

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => toko,
    close: () => {},
    transaction: () => {
      if (trxGagal) throw new Error("transaksi ditolak");
      return {
        objectStore: () => toko,
        onabort: undefined as (() => void) | undefined,
      };
    },
  };

  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open: () => {
      const p = {
        result: db,
        onupgradeneeded: undefined as (() => void) | undefined,
        onsuccess: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
        onblocked: undefined as (() => void) | undefined,
      };
      queueMicrotask(() => p.onsuccess?.());
      return p;
    },
  };
}

/** Blob kecil — isinya tak penting, yang diuji adalah ia BERTAHAN apa adanya. */
const gambar = (isi = "xx") => new Blob([isi], { type: "image/jpeg" });

const isiSah = (o: Partial<Parameters<typeof antrekan>[0]> = {}) => ({
  company: "PT-A",
  projectId: "p1",
  logId: "log1" as string | null,
  file: gambar(),
  namaBerkas: "progres.jpg",
  keterangan: "Pengecoran kolom lt.2",
  ...o,
});

beforeEach(() => { pasangIndexedDbTiruan(); });
afterEach(async () => { await _reset(); });

describe("mengantrekan foto", () => {
  it("foto tersimpan beserta blob-nya", async () => {
    const h = await antrekan(isiSah());
    expect(h.ok).toBe(true);

    const antrean = await bacaAntrean();
    expect(antrean).toHaveLength(1);
    // Blob disimpan APA ADANYA — bukan base64. Konversi base64 membengkakkan
    // ~33% dan satu foto ponsel saja sudah melampaui kuota localStorage.
    expect(antrean[0].blob).toBeInstanceOf(Blob);
    expect(antrean[0].keterangan).toBe("Pengecoran kolom lt.2");
    expect(antrean[0].percobaan).toBe(0);
  });

  it("tanpa company ditolak — antrean PT A tak boleh terkirim di PT B", async () => {
    const h = await antrekan(isiSah({ company: "" }));
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.sebab).toMatch(/perusahaan/i);
    expect(await bacaAntrean()).toHaveLength(0);
  });

  it("tanpa proyek ditolak", async () => {
    const h = await antrekan(isiSah({ projectId: "" }));
    expect(h.ok).toBe(false);
  });

  it("gagal SIMPAN dikatakan apa adanya, bukan disamarkan 'tertunda'", async () => {
    // Bedanya menentukan: kalau disamarkan, mandor menutup aplikasi mengira
    // fotonya aman — padahal ia benar-benar hilang.
    trxGagal = true;
    const h = await antrekan(isiSah());
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.sebab).toMatch(/gagal disimpan/i);
  });

  it("antrean PENUH ditolak dengan sebab yang bisa ditindaklanjuti", async () => {
    for (let i = 0; i < BATAS_FOTO; i++) {
      await antrekan(isiSah({ keterangan: `foto ${i}` }));
    }
    const h = await antrekan(isiSah());
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.sebab).toMatch(/penuh/i);
      expect(h.sebab, "sebab tak memberitahu apa yang harus dilakukan")
        .toMatch(/jaringan/i);
    }
  });

  it("terurut terlama lebih dulu", async () => {
    await antrekan(isiSah({ keterangan: "pertama" }));
    await new Promise((r) => setTimeout(r, 2));
    await antrekan(isiSah({ keterangan: "kedua" }));

    const a = await bacaAntrean();
    expect(a[0].keterangan).toBe("pertama");
  });

  it("pendengar dikabari saat antrean berubah", async () => {
    let n = 0;
    const lepas = berlangganan(() => { n++; });
    await antrekan(isiSah());
    expect(n).toBe(1);
    lepas();
    await antrekan(isiSah());
    expect(n, "pendengar masih dipanggil sesudah dilepas").toBe(1);
  });
});

describe("saringan company", () => {
  it("antrean satu company tak memuat milik company lain", async () => {
    await antrekan(isiSah({ company: "PT-A" }));
    await antrekan(isiSah({ company: "PT-B" }));

    expect(await antreanCompany("PT-A")).toHaveLength(1);
    expect((await antreanCompany("PT-A"))[0].company).toBe("PT-A");
  });
});

describe("menautkan foto yatim ke lognya", () => {
  it("foto ber-logId null menunggu, lalu tertaut", async () => {
    await antrekan(isiSah({ logId: null }));
    await antrekan(isiSah({ logId: null }));

    const n = await tautkanKeLog("PT-A", "p1", "log-baru");
    expect(n).toBe(2);

    const a = await bacaAntrean();
    expect(a.every((f) => f.logId === "log-baru")).toBe(true);
  });

  it("yang SUDAH punya log tidak ditimpa", async () => {
    await antrekan(isiSah({ logId: "log-lama" }));
    await tautkanKeLog("PT-A", "p1", "log-baru");

    const a = await bacaAntrean();
    expect(a[0].logId, "log yang sudah benar ikut ditimpa").toBe("log-lama");
  });

  it("proyek LAIN tidak ikut tertaut", async () => {
    await antrekan(isiSah({ projectId: "p2", logId: null }));
    const n = await tautkanKeLog("PT-A", "p1", "log-baru");
    expect(n).toBe(0);
    expect((await bacaAntrean())[0].logId).toBeNull();
  });
});

describe("sinkronisasi", () => {
  it("foto terkirim dibuang dari antrean", async () => {
    await antrekan(isiSah());
    const h = await sinkronkan("PT-A", async () => { /* berhasil */ });

    expect(h.terkirim).toBe(1);
    expect(await bacaAntrean()).toHaveLength(0);
  });

  it("foto yang lognya BELUM ada dilewati, bukan dicoba", async () => {
    // Mencobanya menghasilkan galat FK yang membingungkan, dan menaikkan
    // penghitung percobaan untuk kegagalan yang bukan salahnya.
    await antrekan(isiSah({ logId: null }));
    let dicoba = 0;
    const h = await sinkronkan("PT-A", async () => { dicoba++; });

    expect(h.menunggu).toBe(1);
    expect(dicoba, "foto tanpa log ikut dicoba unggah").toBe(0);
    expect((await bacaAntrean())[0].percobaan).toBe(0);
  });

  it("BERHENTI di kegagalan pertama — sinyal mati bukan alasan menguras baterai", async () => {
    await antrekan(isiSah({ keterangan: "a" }));
    await new Promise((r) => setTimeout(r, 2));
    await antrekan(isiSah({ keterangan: "b" }));

    let dicoba = 0;
    const h = await sinkronkan("PT-A", async () => {
      dicoba++;
      throw new Error("jaringan mati");
    });

    expect(dicoba, "seluruh antrean dicoba padahal sinyalnya mati").toBe(1);
    expect(h.gagal).toBe(1);
    expect(h.terkirim).toBe(0);
  });

  it("kegagalan menaikkan percobaan dan MENYIMPAN sebabnya", async () => {
    await antrekan(isiSah());
    await sinkronkan("PT-A", async () => { throw new Error("413 terlalu besar"); });

    const a = await bacaAntrean();
    expect(a[0].percobaan).toBe(1);
    // Sebab disimpan, bukan ditelan: "gagal" tanpa keterangan tak memberitahu
    // mandor apakah ia harus menunggu sinyal atau memperkecil fotonya.
    expect(a[0].galatTerakhir).toMatch(/413/);
  });

  it("foto TETAP ada sesudah gagal — itu seluruh gunanya", async () => {
    await antrekan(isiSah());
    await sinkronkan("PT-A", async () => { throw new Error("mati"); });
    expect(await bacaAntrean(), "foto hilang sesudah unggah gagal").toHaveLength(1);
  });

  it("yang melampaui BATAS_PERCOBAAN dilewati, tidak dicoba lagi selamanya", async () => {
    await antrekan(isiSah());
    for (let i = 0; i < BATAS_PERCOBAAN; i++) {
      await sinkronkan("PT-A", async () => { throw new Error("mati"); });
    }

    let dicoba = 0;
    const h = await sinkronkan("PT-A", async () => { dicoba++; });
    expect(h.menyerah).toBe(1);
    expect(dicoba, "foto yang sudah menyerah masih dicoba").toBe(0);
    // Tetap TERSIMPAN — menyerah bukan berarti dibuang. Mandor masih bisa
    // melihatnya dan memutuskan sendiri.
    expect(await bacaAntrean()).toHaveLength(1);
  });

  it("company LAIN tak ikut terkirim", async () => {
    await antrekan(isiSah({ company: "PT-B" }));
    const h = await sinkronkan("PT-A", async () => { /* berhasil */ });
    expect(h.terkirim).toBe(0);
    expect(await bacaAntrean(), "foto PT-B ikut terkirim saat sinkron PT-A").toHaveLength(1);
  });

  it("antrean kosong menghasilkan nol, tidak melempar", async () => {
    const h = await sinkronkan("PT-A", async () => { /* tak terpanggil */ });
    expect(h).toEqual({ terkirim: 0, gagal: 0, menyerah: 0, menunggu: 0 });
  });
});

describe("membuang", () => {
  it("foto bisa dibuang manual", async () => {
    const h = await antrekan(isiSah());
    if (!h.ok) throw new Error("fixture tak terbentuk");
    await buang(h.id);
    expect(await bacaAntrean()).toHaveLength(0);
  });
});

describe("IndexedDB tak tersedia", () => {
  it("tidak melempar — antrean lapisan tambahan, bukan syarat", async () => {
    // Peramban lama & mode privat tertentu sah tak punya IndexedDB. Yang
    // salah adalah membuat aplikasi berhenti bekerja karenanya.
    delete (globalThis as { indexedDB?: unknown }).indexedDB;

    expect(await bacaAntrean()).toEqual([]);
    const h = await antrekan(isiSah());
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.sebab).toMatch(/gagal disimpan/i);
  });
});

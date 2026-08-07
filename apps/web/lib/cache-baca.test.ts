import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  simpanJawaban, ambilJawaban, bersihkanCompany, bacaDenganCache,
  usiaMenit, labelUsia, AMBANG_BASI_MENIT,
} from "./cache-baca";

// ════════════════════════════════════════════════════════════════════════════
// TIRUAN IndexedDB — ditulis di sini, BUKAN lewat `fake-indexeddb`.
// ════════════════════════════════════════════════════════════════════════════
//
// Yang diuji cuma tiga operasi (put/get/cursor-delete) pada satu object store.
// Menambah dependensi 6.2.5 untuk itu berarti menambah rantai pasok yang
// harus diaudit dan dirawat selamanya, demi permukaan yang muat di 60 baris.
//
// Tiruan ini SENGAJA tak lengkap: ia tak mendukung index, rentang kunci, atau
// transaksi bersarang. Kalau `cache-baca.ts` kelak memakainya, test akan gagal
// keras di sini — dan itu sinyal untuk memasang pustaka sungguhan, bukan
// menambal tiruan ini sampai jadi setengah-IndexedDB.

type Rekam = { kunci: string; company: string; url: string; data: unknown; diambil: number };

class TokoTiruan {
  isi = new Map<string, Rekam>();
  put(r: Rekam) { this.isi.set(r.kunci, r); return jadikanPermintaan(undefined); }
  get(k: string) { return jadikanPermintaan(this.isi.get(k)); }
  openCursor() {
    const daftar = [...this.isi.values()];
    const p = jadikanPermintaan(undefined) as PermintaanTiruan;
    let i = 0;
    const maju = () => {
      if (i >= daftar.length) { p.result = null; p.onsuccess?.(); return; }
      const nilai = daftar[i++];
      p.result = {
        value: nilai,
        delete: () => this.isi.delete(nilai.kunci),
        continue: () => queueMicrotask(maju),
      };
      p.onsuccess?.();
    };
    queueMicrotask(maju);
    return p;
  }
}

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

let toko: TokoTiruan;
/** Bila `true`, `transaction()` melempar — menguji jalur gagal-tulis. */
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
      const trx = {
        objectStore: () => toko,
        oncomplete: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
      };
      // `oncomplete` dijadwalkan DUA microtask sesudahnya supaya operasi
      // put/get sempat menyelesaikan `onsuccess`-nya lebih dulu — persis
      // urutan IndexedDB sungguhan.
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => trx.oncomplete?.())));
      return trx;
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

function lepasIndexedDb() {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
}

describe("cache-baca — penyimpanan", () => {
  beforeEach(() => pasangIndexedDbTiruan());
  afterEach(() => lepasIndexedDb());

  it("menyimpan lalu membaca kembali jawaban", async () => {
    const ok = await simpanJawaban("pt-a", "/api/v1/material", { total: 3 });
    expect(ok).toBe(true);

    const r = await ambilJawaban<{ total: number }>("pt-a", "/api/v1/material");
    expect(r?.data.total).toBe(3);
    expect(r?.company).toBe("pt-a");
    expect(typeof r?.diambil).toBe("number");
  });

  // ── Jaminan #3: berkunci company ────────────────────────────────────────
  it("cache PT A TIDAK terbaca dari PT B", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { rahasia: "milik A" });

    // URL-nya sama persis — yang membedakan hanya company-nya.
    const dariB = await ambilJawaban("pt-b", "/api/v1/material");
    expect(dariB).toBeNull();
  });

  it("URL berbeda disimpan terpisah", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { jenis: "material" });
    await simpanJawaban("pt-a", "/api/v1/inspeksi", { jenis: "inspeksi" });

    const m = await ambilJawaban<{ jenis: string }>("pt-a", "/api/v1/material");
    const i = await ambilJawaban<{ jenis: string }>("pt-a", "/api/v1/inspeksi");
    expect(m?.data.jenis).toBe("material");
    expect(i?.data.jenis).toBe("inspeksi");
  });

  it("menyimpan ulang URL yang sama MENIMPA, tak menumpuk", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { versi: 1 });
    await simpanJawaban("pt-a", "/api/v1/material", { versi: 2 });

    const r = await ambilJawaban<{ versi: number }>("pt-a", "/api/v1/material");
    expect(r?.data.versi).toBe(2);
    expect(toko.isi.size).toBe(1);
  });

  it("membersihkan cache satu company tak menyentuh company lain", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { x: 1 });
    await simpanJawaban("pt-a", "/api/v1/inspeksi", { x: 2 });
    await simpanJawaban("pt-b", "/api/v1/material", { x: 3 });

    const dibuang = await bersihkanCompany("pt-a");
    expect(dibuang).toBe(2);
    expect(await ambilJawaban("pt-a", "/api/v1/material")).toBeNull();
    expect(await ambilJawaban("pt-b", "/api/v1/material")).not.toBeNull();
  });
});

describe("cache-baca — saat IndexedDB tak tersedia", () => {
  beforeEach(() => lepasIndexedDb());

  // Peramban lama, mode privat tertentu, dan lingkungan test tanpa polyfill
  // semuanya sah. Yang salah adalah membuat aplikasi berhenti bekerja karena
  // cache-nya tak bisa dibuka — cache lapisan tambahan, bukan syarat.
  it("menyimpan mengembalikan false, TIDAK melempar", async () => {
    await expect(simpanJawaban("pt-a", "/x", { a: 1 })).resolves.toBe(false);
  });

  it("membaca mengembalikan null, TIDAK melempar", async () => {
    await expect(ambilJawaban("pt-a", "/x")).resolves.toBeNull();
  });

  it("bacaDenganCache tetap mengembalikan data dari jaringan", async () => {
    const h = await bacaDenganCache("pt-a", "/x", async () => ({ ok: true }));
    expect(h.data).toEqual({ ok: true });
    expect(h.dariCache).toBe(false);
  });

  it("jaringan gagal DAN cache tak tersedia → galat dilempar apa adanya", async () => {
    // Bukan mengembalikan data kosong: layar harus menampilkan pesan galat
    // yang sesungguhnya, bukan "tak ada data" yang menyesatkan.
    await expect(
      bacaDenganCache("pt-a", "/x", async () => { throw new Error("jaringan putus"); }),
    ).rejects.toThrow("jaringan putus");
  });
});

describe("bacaDenganCache", () => {
  beforeEach(() => pasangIndexedDbTiruan());
  afterEach(() => lepasIndexedDb());

  it("JARINGAN DULU — cache tak dipakai saat jaringan berhasil", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { sumber: "cache lama" });

    const h = await bacaDenganCache("pt-a", "/api/v1/material",
      async () => ({ sumber: "jaringan segar" }));

    // Cache-first akan menampilkan data lama meski sinyalnya bagus — dan di
    // modul yang menentukan tindakan hari ini, itu lebih berbahaya daripada
    // menunggu sebentar.
    expect(h.data).toEqual({ sumber: "jaringan segar" });
    expect(h.dariCache).toBe(false);
    expect(h.usiaMenit).toBeNull();
  });

  it("jaringan GAGAL → jatuh ke cache, dan ditandai `dariCache`", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { total: 7 });

    const h = await bacaDenganCache<{ total: number }>("pt-a", "/api/v1/material",
      async () => { throw new Error("offline"); });

    expect(h.data.total).toBe(7);
    expect(h.dariCache).toBe(true);
    expect(h.diambil).not.toBeNull();
  });

  // ── Jaminan #4: basi ditandai, TIDAK dibuang ────────────────────────────
  it("cache melewati ambang usia TETAP ditampilkan, ditandai basi", async () => {
    expect(AMBANG_BASI_MENIT).toBe(60);
    await simpanJawaban("pt-a", "/api/v1/material", { total: 5 });

    // Dua jam sesudah disimpan.
    const duaJam = Date.now() + 120 * 60_000;
    const h = await bacaDenganCache<{ total: number }>("pt-a", "/api/v1/material",
      async () => { throw new Error("offline"); }, duaJam);

    // Menghapusnya akan mengembalikan layar kosong yang justru dihindari.
    expect(h.data.total).toBe(5);
    expect(h.basi).toBe(true);
    expect(h.usiaMenit).toBeGreaterThanOrEqual(120);
  });

  it("cache masih segar TIDAK ditandai basi", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { total: 5 });

    const setengahJam = Date.now() + 30 * 60_000;
    const h = await bacaDenganCache("pt-a", "/api/v1/material",
      async () => { throw new Error("offline"); }, setengahJam);

    expect(h.basi).toBe(false);
    expect(h.usiaMenit).toBeGreaterThanOrEqual(30);
  });

  it("cache milik company LAIN tak dipakai saat jaringan gagal", async () => {
    await simpanJawaban("pt-a", "/api/v1/material", { rahasia: "milik A" });

    // PT B offline dan tak punya cache sendiri: harus melempar, BUKAN
    // menampilkan data PT A.
    await expect(
      bacaDenganCache("pt-b", "/api/v1/material",
        async () => { throw new Error("offline"); }),
    ).rejects.toThrow("offline");
  });

  it("gagal MENULIS cache tak membatalkan pembacaan yang berhasil", async () => {
    const h = await bacaDenganCache("pt-a", "/api/v1/material", async () => {
      trxGagal = true;   // transaksi tulis akan melempar
      return { ok: true };
    });

    // Jawaban sudah di tangan; kegagalan menulis cache tak boleh membuangnya.
    expect(h.data).toEqual({ ok: true });
    expect(h.dariCache).toBe(false);
  });

  it("pengambil dipanggil TEPAT SEKALI", async () => {
    const pengambil = vi.fn(async () => ({ a: 1 }));
    await bacaDenganCache("pt-a", "/x", pengambil);
    expect(pengambil).toHaveBeenCalledTimes(1);
  });
});

describe("usiaMenit & labelUsia", () => {
  it("usia dibulatkan ke BAWAH", () => {
    const t = 1_000_000_000_000;
    expect(usiaMenit(t, t)).toBe(0);
    expect(usiaMenit(t, t + 59_000)).toBe(0);
    expect(usiaMenit(t, t + 60_000)).toBe(1);
    expect(usiaMenit(t, t + 119_000)).toBe(1);
  });

  it("usia NEGATIF (jam perangkat mundur) jadi 0, bukan angka negatif", () => {
    // Jam ponsel lapangan sering salah. "-45 menit lalu" tak berarti apa pun
    // bagi yang membacanya.
    const t = 1_000_000_000_000;
    expect(usiaMenit(t, t - 3_000_000)).toBe(0);
  });

  it("label terbaca manusia", () => {
    expect(labelUsia(null)).toBe("");
    expect(labelUsia(0)).toBe("baru saja");
    expect(labelUsia(45)).toBe("45 menit lalu");
    expect(labelUsia(90)).toBe("1 jam lalu");
    expect(labelUsia(60 * 26)).toBe("1 hari lalu");
  });
});

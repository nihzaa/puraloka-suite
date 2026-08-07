"use client";

// ============================================================================
// CACHE BACA OFFLINE — sisi BACA dari F4-3 (TUNDA kelompok G).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `antrean-offline.ts` menutup jalur TULIS: kiriman tersimpan dan terkirim
// ulang saat sinyal kembali. Yang belum: **membaca**.
//
// Mandor yang membuka permintaan material di lokasi tanpa sinyal melihat
// layar kosong — bukan karena tak ada datanya, melainkan karena datanya ada
// di server yang tak bisa dihubungi. Ia lalu menebak nomor MR dari ingatan,
// atau menunda pekerjaannya sampai kembali ke tempat bersinyal.
//
// ── Yang dijamin cache ini
//
//   1. TERBACA — jawaban terakhir tersimpan, dan dipakai saat jaringan gagal.
//   2. BERTANGGAL — setiap jawaban membawa waktu pengambilannya, dan layar
//      WAJIB menampilkannya. Data lama yang tak ditandai lebih berbahaya
//      daripada layar kosong: yang membacanya mengira sedang melihat keadaan
//      hari ini.
//   3. BERKUNCI COMPANY — cache milik PT A tak pernah terbaca di PT B, sama
//      seperti antrean tulis.
//   4. BERKEDALUWARSA — di atas ambang usia, cache TETAP ditampilkan tapi
//      ditandai "sudah lama". Menghapusnya diam-diam akan mengembalikan
//      layar kosong yang justru dihindari.
//
// ── Kenapa IndexedDB, bukan localStorage
//
// `antrean-offline.ts` memilih localStorage dengan alasan tertulis: kirimannya
// JSON kecil dan sinkron itu menguntungkan. Sisi BACA berbeda — daftar
// material bisa ratusan baris, dan checklist inspeksi membawa item beserta
// riwayatnya. Batas ~5 MB localStorage akan tercapai, dan menulis sebesar itu
// secara sinkron membekukan antarmuka di ponsel lama yang justru banyak
// dipakai di lapangan.
//
// Batas itu sudah dinyatakan di `antrean-offline.ts` ("IndexedDB baru perlu
// bila kelak foto ikut diantre"); di sini alasannya volume baca, bukan foto.
//
// ── Bedanya dengan `data-cache.ts` (F4-2)
//
// Keduanya "cache", dan namanya mirip — tapi menjawab masalah berbeda:
//
//   data-cache.ts  → `Map` DI MEMORI. Dedup request, cache lintas navigasi,
//                    invalidasi. HILANG saat tab ditutup.
//   cache-baca.ts  → IndexedDB DI DISK. Bertahan saat aplikasi ditutup dan
//                    baterai habis — itu satu-satunya yang berguna saat
//                    mandor membuka aplikasi lagi di lokasi tanpa sinyal.
//
// Diperiksa langsung, bukan diasumsikan: `data-cache.ts:49` memakai
// `new Map()`. Yang satu tak menggantikan yang lain.
// ============================================================================

const NAMA_DB = "puraloka_cache_baca";
const VERSI_DB = 1;
const TOKO = "jawaban";

/** Di atas usia ini, cache ditandai "sudah lama" — TIDAK dihapus. */
export const AMBANG_BASI_MENIT = 60;

export interface JawabanTersimpan<T = unknown> {
  /** Kunci gabungan: `company::url`. */
  kunci: string;
  company: string;
  url: string;
  data: T;
  /** Kapan jawaban ini diambil dari server (epoch ms). */
  diambil: number;
}

export interface HasilBaca<T> {
  data: T;
  /** `true` bila data berasal dari cache, bukan dari jaringan. */
  dariCache: boolean;
  /** Kapan data ini diambil dari server. `null` bila baru saja. */
  diambil: number | null;
  /** Usia data dalam menit. `null` bila baru saja diambil. */
  usiaMenit: number | null;
  /** `true` bila usianya melewati ambang — ditampilkan, tapi ditandai. */
  basi: boolean;
}

/**
 * Buka basis. `null` bila IndexedDB tak tersedia.
 *
 * Tak tersedia BUKAN kegagalan: peramban lama, mode privat tertentu, dan
 * lingkungan test tanpa polyfill semuanya sah. Yang salah adalah membuat
 * aplikasi berhenti bekerja karena cache-nya tak bisa dibuka — cache adalah
 * lapisan tambahan, bukan syarat.
 */
function bukaDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);

    let selesai = false;
    const beres = (v: IDBDatabase | null) => {
      if (!selesai) { selesai = true; resolve(v); }
    };

    let permintaan: IDBOpenDBRequest;
    try {
      permintaan = indexedDB.open(NAMA_DB, VERSI_DB);
    } catch {
      return beres(null);
    }

    permintaan.onupgradeneeded = () => {
      const db = permintaan.result;
      if (!db.objectStoreNames.contains(TOKO)) {
        db.createObjectStore(TOKO, { keyPath: "kunci" });
      }
    };
    permintaan.onsuccess = () => beres(permintaan.result);
    permintaan.onerror = () => beres(null);
    // `blocked` terjadi bila tab lain memegang versi lama. Jangan menggantung
    // selamanya — lebih baik berjalan tanpa cache daripada layar membeku.
    permintaan.onblocked = () => beres(null);
  });
}

const kunciDari = (company: string, url: string) => `${company}::${url}`;

/** Simpan jawaban. Gagal menyimpan TIDAK dilempar — cache lapisan tambahan. */
export async function simpanJawaban(
  company: string,
  url: string,
  data: unknown,
): Promise<boolean> {
  const db = await bukaDb();
  if (!db) return false;

  return new Promise((resolve) => {
    let trx: IDBTransaction;
    try {
      trx = db.transaction(TOKO, "readwrite");
    } catch {
      db.close();
      return resolve(false);
    }

    const rekam: JawabanTersimpan = {
      kunci: kunciDari(company, url),
      company, url, data, diambil: Date.now(),
    };

    try {
      trx.objectStore(TOKO).put(rekam);
    } catch {
      db.close();
      return resolve(false);
    }

    trx.oncomplete = () => { db.close(); resolve(true); };
    trx.onerror = () => { db.close(); resolve(false); };
    trx.onabort = () => { db.close(); resolve(false); };
  });
}

/** Ambil jawaban tersimpan. `null` bila tak ada. */
export async function ambilJawaban<T>(
  company: string,
  url: string,
): Promise<JawabanTersimpan<T> | null> {
  const db = await bukaDb();
  if (!db) return null;

  return new Promise((resolve) => {
    let trx: IDBTransaction;
    try {
      trx = db.transaction(TOKO, "readonly");
    } catch {
      db.close();
      return resolve(null);
    }

    let hasil: JawabanTersimpan<T> | null = null;
    try {
      const p = trx.objectStore(TOKO).get(kunciDari(company, url));
      p.onsuccess = () => {
        const r = p.result as JawabanTersimpan<T> | undefined;
        // Kunci gabungan sudah memuat company, tapi diperiksa ULANG di sini.
        // Kalau kelak formatnya berubah, pemeriksaan ini yang mencegah data
        // PT A terbaca di PT B — bukan asumsi bahwa kuncinya selalu benar.
        hasil = r && r.company === company ? r : null;
      };
    } catch {
      db.close();
      return resolve(null);
    }

    trx.oncomplete = () => { db.close(); resolve(hasil); };
    trx.onerror = () => { db.close(); resolve(null); };
    trx.onabort = () => { db.close(); resolve(null); };
  });
}

/** Buang seluruh cache milik satu company (dipakai saat berpindah tenant). */
export async function bersihkanCompany(company: string): Promise<number> {
  const db = await bukaDb();
  if (!db) return 0;

  return new Promise((resolve) => {
    let trx: IDBTransaction;
    try {
      trx = db.transaction(TOKO, "readwrite");
    } catch {
      db.close();
      return resolve(0);
    }

    let dibuang = 0;
    try {
      const toko = trx.objectStore(TOKO);
      const kursor = toko.openCursor();
      kursor.onsuccess = () => {
        const k = kursor.result;
        if (!k) return;
        const r = k.value as JawabanTersimpan;
        if (r.company === company) { k.delete(); dibuang++; }
        k.continue();
      };
    } catch {
      db.close();
      return resolve(0);
    }

    trx.oncomplete = () => { db.close(); resolve(dibuang); };
    trx.onerror = () => { db.close(); resolve(0); };
    trx.onabort = () => { db.close(); resolve(0); };
  });
}

/** Usia jawaban dalam menit, dibulatkan ke bawah. */
export function usiaMenit(diambil: number, sekarang = Date.now()): number {
  return Math.max(0, Math.floor((sekarang - diambil) / 60_000));
}

/**
 * Ambil data lewat jaringan; kalau gagal, pakai cache.
 *
 * @param pengambil fungsi yang memanggil jaringan. Melempar bila gagal.
 *
 * Urutannya JARINGAN DULU, bukan cache dulu.
 *
 * Cache-first akan menampilkan data lama meski sinyalnya bagus — dan di
 * modul yang menentukan tindakan hari ini (material apa yang dipesan,
 * checklist mana yang gagal), data lama yang terlihat baru lebih berbahaya
 * daripada menunggu sebentar.
 */
export async function bacaDenganCache<T>(
  company: string,
  url: string,
  pengambil: () => Promise<T>,
  sekarang = Date.now(),
): Promise<HasilBaca<T>> {
  try {
    const data = await pengambil();
    // Menyimpan TIDAK ditunggu-gagalkan: jawaban sudah di tangan, dan
    // kegagalan menulis cache tak boleh membatalkan pembacaan yang berhasil.
    void simpanJawaban(company, url, data);
    return { data, dariCache: false, diambil: null, usiaMenit: null, basi: false };
  } catch (e) {
    const tersimpan = await ambilJawaban<T>(company, url);
    if (!tersimpan) throw e;

    const usia = usiaMenit(tersimpan.diambil, sekarang);
    return {
      data: tersimpan.data,
      dariCache: true,
      diambil: tersimpan.diambil,
      usiaMenit: usia,
      // Basi TIDAK berarti dibuang — ia tetap ditampilkan, ditandai lebih
      // keras. Menghapusnya mengembalikan layar kosong yang justru dihindari.
      basi: usia >= AMBANG_BASI_MENIT,
    };
  }
}

/** Kalimat siap-tampil untuk menandai data dari cache. */
export function labelUsia(usia: number | null): string {
  if (usia == null) return "";
  if (usia < 1) return "baru saja";
  if (usia < 60) return `${usia} menit lalu`;
  const jam = Math.floor(usia / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

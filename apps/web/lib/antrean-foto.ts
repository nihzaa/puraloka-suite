"use client";

// ============================================================================
// ANTREAN FOTO OFFLINE — foto lapangan yang tak hilang saat aplikasi ditutup.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `antrean-offline.ts` menyelamatkan TEKS laporan lapangan, dan menulis
// batasnya sendiri di header:
//
//     "IndexedDB baru perlu bila kelak foto ikut diantre."
//
// Ini berkas itu.
//
// ── Yang hilang hari ini, diukur 2026-08-13
//
// `mandor-portal/progress/page.tsx` sudah menangani kegagalan foto dengan
// baik: laporan tetap tersimpan meski fotonya gagal, dan ada tombol coba-lagi.
// Tetapi daftar foto yang gagal hidup di `useState` (`page.tsx:52`) — nol
// localStorage, nol IndexedDB.
//
// Artinya: mandor mengirim laporan di lokasi tanpa sinyal, teksnya selamat
// lewat antrean, fotonya gagal dan masuk daftar coba-lagi. Lalu ia menutup
// aplikasi — atau baterainya habis, atau ponselnya membunuh tab di latar,
// yang justru lumrah pada ponsel lama yang banyak dipakai di lapangan.
//
// Foto itu LENYAP. Yang tersisa laporan tanpa bukti visual, dan pekerjaan
// memotret ulang yang sudah tak mungkin: betonnya sudah tertutup, bekistingnya
// sudah dibuka.
//
// ── Kenapa IndexedDB, bukan localStorage
//
// localStorage hanya menyimpan string dan berbatas ~5 MB. Satu foto ponsel
// 3–5 MB; dikonversi ke base64 ia membengkak ~33% dan satu foto saja sudah
// melampaui kuotanya. IndexedDB menyimpan `Blob` apa adanya, tanpa konversi,
// dengan kuota ratusan MB.
//
// ── Kenapa antrean TERPISAH dari `antrean-offline.ts`
//
// Bukan karena rapi, melainkan karena bentuk kegagalannya berbeda:
//
//   • Teks: kecil, cepat, dan urutannya MENGIKAT (laporan minggu ke-2 tak
//     boleh mendahului minggu ke-1).
//   • Foto: besar, lambat, dan urutannya TIDAK mengikat — foto ke-5 boleh
//     naik lebih dulu daripada foto ke-1 tanpa satu pun akibat.
//
// Menggabungkan keduanya berarti satu foto 5 MB yang lambat menahan seluruh
// laporan teks di belakangnya. Itu justru kebalikan dari yang dibutuhkan
// lapangan.
//
// ── Yang TIDAK dijamin
//
// Antrean ini tak menjamin fotonya SAMPAI. Ia menjamin fotonya tak HILANG,
// dan bisa dicoba lagi kapan pun — termasuk sesudah aplikasi dibuka kembali
// esok hari.
// ============================================================================

const NAMA_DB = "puraloka_antrean_foto";
const VERSI_DB = 1;
const TOKO = "foto";

/**
 * Batas jumlah foto tertahan. Bukan batas byte: kuota IndexedDB berbeda-beda
 * antar-peramban dan tak bisa ditanyakan dengan andal, sementara jumlah bisa.
 *
 * 50 foto ≈ laporan seminggu penuh untuk satu mandor. Di atas itu, yang
 * TERTUA ditolak masuk — bukan yang terbaru: foto hari ini masih bisa
 * dipotret ulang, foto minggu lalu tidak.
 */
export const BATAS_FOTO = 50;

/** Percobaan sebelum sebuah foto ditandai butuh perhatian manusia. */
export const BATAS_PERCOBAAN = 5;

export interface FotoAntre {
  id: string;
  /** Proyek pemilik foto — antrean PT A tak boleh terkirim saat di PT B. */
  company: string;
  projectId: string;
  /**
   * Log progres tujuannya. `null` berarti lognya sendiri belum terkirim
   * (masih di antrean teks), jadi fotonya menunggu — menautkannya ke log
   * yang belum ada akan menghasilkan galat FK yang membingungkan.
   */
  logId: string | null;
  blob: Blob;
  namaBerkas: string;
  keterangan: string;
  dibuat: number;
  percobaan: number;
  galatTerakhir: string | null;
}

type Pendengar = () => void;
const pendengar = new Set<Pendengar>();

/** Berlangganan perubahan antrean. Mengembalikan fungsi pembatal. */
export function berlangganan(f: Pendengar): () => void {
  pendengar.add(f);
  return () => pendengar.delete(f);
}

const kabari = () => { for (const f of pendengar) { try { f(); } catch { /* pendengar tak boleh menjatuhkan antrean */ } } };

/**
 * Buka basis. `null` bila IndexedDB tak tersedia.
 *
 * Tak tersedia BUKAN kegagalan — peramban lama, mode privat, dan lingkungan
 * test tanpa polyfill semuanya sah. Yang salah adalah membuat aplikasi
 * berhenti bekerja karena antreannya tak bisa dibuka. Pola dan alasannya sama
 * dengan `cache-baca.ts`.
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
        db.createObjectStore(TOKO, { keyPath: "id" });
      }
    };
    permintaan.onsuccess = () => beres(permintaan.result);
    permintaan.onerror = () => beres(null);
    // `blocked` terjadi bila tab lain memegang versi lama. Jangan menggantung
    // selamanya — lebih baik berjalan tanpa antrean daripada layar membeku.
    permintaan.onblocked = () => beres(null);
  });
}

function jalankan<T>(
  mode: IDBTransactionMode,
  f: (toko: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    void bukaDb().then((db) => {
      if (!db) return resolve(null);
      try {
        const tx = db.transaction(TOKO, mode);
        const req = f(tx.objectStore(TOKO));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Company yang sedang aktif.
 *
 * Sumbernya SAMA dengan `antrean-offline.ts` — satu kunci localStorage, bukan
 * dua tempat yang bisa berselisih. Antrean foto PT A yang terkirim saat
 * pengguna berada di PT B akan menempel ke proyek yang salah.
 */
export function companyAktif(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("puraloka_company_id") ?? "";
}

const idBaru = () =>
  `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

/** Seluruh foto tertahan, terlama lebih dulu. */
export async function bacaAntrean(): Promise<FotoAntre[]> {
  const semua = await jalankan<FotoAntre[]>("readonly", (t) => t.getAll() as IDBRequest<FotoAntre[]>);
  return (semua ?? []).sort((a, b) => a.dibuat - b.dibuat);
}

/** Foto tertahan milik satu company saja. */
export async function antreanCompany(company: string): Promise<FotoAntre[]> {
  return (await bacaAntrean()).filter((f) => f.company === company);
}

export type HasilAntre =
  | { ok: true; id: string }
  | { ok: false; sebab: string };

/**
 * Antrekan sebuah foto.
 *
 * Dipanggil SETELAH unggahan langsung gagal, bukan sebagai pengganti. Sinyal
 * yang baik harus tetap mengunggah seketika — mengantre lebih dulu membuat
 * foto tertunda tanpa alasan dan mandor menutup aplikasi mengira sudah
 * terkirim.
 */
export async function antrekan(masukan: {
  company: string;
  projectId: string;
  logId: string | null;
  file: File | Blob;
  namaBerkas?: string;
  keterangan?: string;
}): Promise<HasilAntre> {
  if (!masukan.company) {
    return { ok: false, sebab: "Foto tak bisa diantre tanpa perusahaan aktif." };
  }
  if (!masukan.projectId) {
    return { ok: false, sebab: "Foto tak bisa diantre tanpa proyek." };
  }

  const sekarang = await bacaAntrean();
  if (sekarang.length >= BATAS_FOTO) {
    return {
      ok: false,
      sebab: `Antrean foto penuh (${BATAS_FOTO}). Sambungkan ke jaringan supaya `
        + "yang tertahan terkirim lebih dulu.",
    };
  }

  const item: FotoAntre = {
    id: idBaru(),
    company: masukan.company,
    projectId: masukan.projectId,
    logId: masukan.logId,
    blob: masukan.file,
    namaBerkas: masukan.namaBerkas
      ?? (masukan.file instanceof File ? masukan.file.name : "foto.jpg"),
    keterangan: masukan.keterangan ?? "",
    dibuat: Date.now(),
    percobaan: 0,
    galatTerakhir: null,
  };

  const hasil = await jalankan("readwrite", (t) => t.put(item));
  if (hasil === null) {
    // Bedanya penting: gagal MENYIMPAN berarti fotonya benar-benar hilang,
    // dan itu harus dikatakan apa adanya — bukan disamarkan jadi "tertunda".
    return {
      ok: false,
      sebab: "Foto gagal disimpan di perangkat ini. Jangan tutup halaman — coba unggah lagi.",
    };
  }

  kabari();
  return { ok: true, id: item.id };
}

/** Buang satu foto dari antrean (terkirim, atau dibatalkan pengguna). */
export async function buang(id: string): Promise<void> {
  await jalankan("readwrite", (t) => t.delete(id));
  kabari();
}

/**
 * Tautkan foto-foto yatim ke lognya, sesudah lognya berhasil terkirim.
 *
 * Foto berlogId `null` menunggu inilah. Tanpa langkah ini ia tertahan
 * selamanya: percobaan unggahnya akan selalu gagal karena tak tahu harus
 * menempel ke mana.
 */
export async function tautkanKeLog(
  company: string, projectId: string, logId: string,
): Promise<number> {
  const yatim = (await bacaAntrean()).filter(
    (f) => f.company === company && f.projectId === projectId && f.logId === null,
  );
  for (const f of yatim) {
    await jalankan("readwrite", (t) => t.put({ ...f, logId }));
  }
  if (yatim.length > 0) kabari();
  return yatim.length;
}

export interface HasilSync {
  terkirim: number;
  gagal: number;
  /** Foto yang sudah melampaui BATAS_PERCOBAAN — butuh perhatian manusia. */
  menyerah: number;
  /** Foto yang lognya belum ada, jadi belum bisa dicoba. */
  menunggu: number;
}

/**
 * Kirim ulang foto tertahan milik satu company.
 *
 * `unggah` disuntikkan, bukan diimpor: berkas ini tak boleh tahu bentuk API
 * unggahan. Itu membuatnya bisa diuji tanpa jaringan sama sekali, dan membuat
 * jalur unggah bisa berubah tanpa menyentuh antrean.
 *
 * BERHENTI di kegagalan pertama yang bukan-fatal. Sinyal yang mati membuat
 * foto ke-2 sampai ke-50 gagal dengan sebab yang sama — mencobanya semua
 * hanya menghabiskan baterai dan kuota untuk kesimpulan yang sudah diketahui
 * di foto pertama.
 */
export async function sinkronkan(
  company: string,
  unggah: (f: FotoAntre) => Promise<void>,
): Promise<HasilSync> {
  const hasil: HasilSync = { terkirim: 0, gagal: 0, menyerah: 0, menunggu: 0 };
  const antrean = await antreanCompany(company);

  for (const f of antrean) {
    if (f.logId === null) { hasil.menunggu++; continue; }

    if (f.percobaan >= BATAS_PERCOBAAN) { hasil.menyerah++; continue; }

    try {
      await unggah(f);
      await jalankan("readwrite", (t) => t.delete(f.id));
      hasil.terkirim++;
    } catch (e) {
      const pesan = e instanceof Error ? e.message : "Gagal mengunggah";
      await jalankan("readwrite", (t) => t.put({
        ...f, percobaan: f.percobaan + 1, galatTerakhir: pesan,
      }));
      hasil.gagal++;
      break;
    }
  }

  if (hasil.terkirim > 0 || hasil.gagal > 0) kabari();
  return hasil;
}

/** Kosongkan antrean — dipakai test dan saat berganti perusahaan. */
export async function _reset(): Promise<void> {
  await jalankan("readwrite", (t) => t.clear());
  kabari();
}

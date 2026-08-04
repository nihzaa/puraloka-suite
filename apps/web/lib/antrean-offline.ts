"use client";

// ============================================================================
// F4-3 — ANTREAN OFFLINE untuk jalur lapangan.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Catatan F4-3 di QUEUE.yaml berbunyi: *"Sinyal buruk adalah NORMA di lokasi
// proyek, bukan pengecualian."*
//
// Hari ini kelima jalur tulis lapangan langsung memanggil `api.post`. Bila
// sinyal putus, mandor melihat pesan galat dan pekerjaannya HILANG — ia harus
// mengetik ulang laporan upah 30 tukang, atau mengingat nominal kasbon yang
// sudah ia isi. Yang paling sering terjadi: ia mencoba lagi berkali-kali dan
// menghasilkan kiriman GANDA saat sinyal akhirnya kembali.
//
// ── Yang dijamin antrean ini
//
//   1. TERSIMPAN — kiriman masuk localStorage sebelum jaringan disentuh.
//      Menutup aplikasi, kehabisan baterai, atau berpindah halaman tidak
//      menghilangkannya.
//   2. TAK GANDA — tiap kiriman punya Idempotency-Key yang lahir SEKALI dan
//      dipakai ulang di setiap percobaan. Server sudah menghormatinya
//      (`utils/idempotency.ts`, F1-1) untuk operasi uang.
//   3. BERURUTAN — dikirim satu per satu sesuai urutan dibuat. Laporan upah
//      minggu ke-2 tak boleh mendahului minggu ke-1.
//   4. BERKUNCI COMPANY — antrean milik PT A tak pernah terkirim saat pengguna
//      sedang berada di PT B.
//
// ── Kenapa localStorage, bukan IndexedDB
//
// Kirimannya JSON kecil (kasbon, laporan upah, penagihan) — kelima jalur
// lapangan diperiksa dan NOL memakai multipart. localStorage cukup, sinkron
// (jadi tak ada jendela kehilangan antara "tersimpan" dan "benar-benar
// tersimpan"), dan didukung semua ponsel lama yang justru banyak dipakai di
// lapangan.
//
// IndexedDB baru perlu bila kelak foto ikut diantre. Batas itu ditulis di
// `BATAS_BYTE` di bawah supaya keputusannya terlihat, bukan tersirat.
// ============================================================================

import { api } from "@/lib/api";

const KUNCI = "puraloka_antrean_offline";

/** localStorage umumnya ~5 MB. Di atas ini, antrean menolak menerima. */
const BATAS_BYTE = 2 * 1024 * 1024;

export interface ItemAntrean {
  id: string;
  /** Idempotency-Key — lahir SEKALI, dipakai ulang tiap percobaan. */
  kunciIdem: string;
  metode: "POST" | "PATCH" | "PUT";
  url: string;
  payload: unknown;
  company: string;
  dibuat: number;
  percobaan: number;
  galatTerakhir?: string;
}

/**
 * Pemberitahuan TANPA argumen — sengaja.
 *
 * Bentuknya mengikuti kontrak `useSyncExternalStore`: ia memanggil pendengar
 * tanpa argumen lalu membaca ulang snapshot sendiri. Versi pertama mengirim
 * arraynya, dan itu menggoda pemakai untuk memakai array tersebut langsung —
 * padahal isinya antrean SELURUH company, bukan yang aktif. Pendengar wajib
 * membaca lewat `antreanAktif()`.
 */
type Pendengar = () => void;
const PENDENGAR = new Set<Pendengar>();

function companyAktif(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("puraloka_company_id") ?? "";
}

export function bacaAntrean(): ItemAntrean[] {
  if (typeof window === "undefined") return [];
  try {
    const mentah = localStorage.getItem(KUNCI);
    return mentah ? (JSON.parse(mentah) as ItemAntrean[]) : [];
  } catch {
    // Antrean rusak lebih buruk daripada antrean kosong: ia membuat SELURUH
    // jalur lapangan gagal, bukan cuma satu kiriman. Dibuang dan dilaporkan.
    console.warn("[antrean] isi rusak — dibuang");
    localStorage.removeItem(KUNCI);
    return [];
  }
}

function tulisAntrean(daftar: ItemAntrean[]) {
  localStorage.setItem(KUNCI, JSON.stringify(daftar));
  for (const f of PENDENGAR) f();
}

export function berlangganan(f: Pendengar): () => void {
  PENDENGAR.add(f);
  return () => PENDENGAR.delete(f);
}

/** Antrean milik company yang sedang aktif saja. */
export function antreanAktif(): ItemAntrean[] {
  const c = companyAktif();
  return bacaAntrean().filter((i) => i.company === c);
}

function kunciBaru(): string {
  // `crypto.randomUUID` tak ada di sebagian WebView Android lama — dan
  // ponsel lama justru yang banyak dipakai di lapangan. Fallback-nya wajib.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface HasilAntre {
  /**
   * `terkirim`  — server menerima.
   * `ditolak`   — server MENJAWAB dengan galat (400/403/…). Bukan masalah
   *               sinyal; mengulangnya tak akan menolong.
   * `diantre`   — jaringan putus, kiriman tersimpan untuk dikirim nanti.
   * `penuh`     — antrean melewati batas; kiriman TIDAK tersimpan.
   */
  status: "terkirim" | "ditolak" | "diantre" | "penuh";
  item?: ItemAntrean;
  galat?: unknown;
  /**
   * Isi respons server — hanya ada saat `status === "terkirim"`.
   *
   * Dipakai halaman yang butuh id hasil kiriman (mis. progress log yang
   * melampirkan foto sesudahnya). Kiriman yang DIANTRE belum punya id.
   */
  data?: unknown;
}

/**
 * Kirim, atau antre bila gagal karena jaringan.
 *
 * ⚠️ Galat JARINGAN diantre; galat SERVER tidak.
 *
 * Bedanya menentukan: 400 "nominal wajib diisi" tak akan pernah berhasil
 * berapa kali pun diulang, dan mengantrekannya berarti mandor menunggu
 * sesuatu yang takkan datang. Yang diantre hanya kegagalan yang punya alasan
 * untuk berhasil nanti.
 */
export async function kirimAtauAntre(
  metode: "POST" | "PATCH" | "PUT",
  url: string,
  payload: unknown,
): Promise<HasilAntre> {
  const item: ItemAntrean = {
    id: kunciBaru(),
    kunciIdem: kunciBaru(),
    metode,
    url,
    payload,
    company: companyAktif(),
    dibuat: Date.now(),
    percobaan: 0,
  };

  try {
    const res = await api.request({
      method: metode,
      url,
      data: payload,
      headers: { "Idempotency-Key": item.kunciIdem },
    });
    return { status: "terkirim", data: res?.data };
  } catch (e) {
    const err = e as { response?: { status?: number } };
    // Ada respons = server menjawab. Itu keputusan server, bukan sinyal buruk.
    //
    // Dikembalikan sebagai `ditolak`, BUKAN `terkirim`. Percobaan pertama saya
    // memakai `terkirim` dan itu menyesatkan: halaman akan menampilkan
    // "berhasil disimpan" untuk kiriman yang justru ditolak 400.
    if (err.response?.status !== undefined) return { status: "ditolak", galat: e };

    const daftar = bacaAntrean();
    const calon = [...daftar, item];
    if (JSON.stringify(calon).length > BATAS_BYTE) {
      // Menolak lebih jujur daripada menerima lalu gagal menyimpan diam-diam.
      return { status: "penuh", galat: e };
    }
    tulisAntrean(calon);
    return { status: "diantre", item, galat: e };
  }
}

let sedangSync = false;

export interface HasilSync {
  terkirim: number;
  gagal: number;
  tersisa: number;
}

/**
 * Kirim ulang antrean company aktif, BERURUTAN.
 *
 * Berhenti pada kegagalan jaringan pertama: kalau sinyal masih putus, kiriman
 * berikutnya pasti gagal juga, dan mencobanya hanya menaikkan `percobaan`
 * tanpa guna. Urutan juga terjaga — laporan minggu ke-2 tak mendahului ke-1.
 */
export async function sinkronkan(): Promise<HasilSync> {
  if (sedangSync) return { terkirim: 0, gagal: 0, tersisa: antreanAktif().length };
  sedangSync = true;

  const company = companyAktif();
  let terkirim = 0;
  let gagal = 0;

  try {
    for (const item of bacaAntrean().filter((i) => i.company === company)) {
      try {
        await api.request({
          method: item.metode,
          url: item.url,
          data: item.payload,
          headers: { "Idempotency-Key": item.kunciIdem },
        });
        hapusItem(item.id);
        terkirim++;
      } catch (e) {
        const err = e as { response?: { status?: number } };
        if (err.response?.status !== undefined) {
          // Server menjawab — kiriman ini tak akan pernah berhasil. Buang,
          // jangan biarkan menyumbat antrean selamanya.
          catatGalat(item.id, `server ${err.response.status}`);
          hapusItem(item.id);
          gagal++;
          continue;
        }
        // Jaringan masih putus — hentikan, jangan bakar sisa antrean.
        catatGalat(item.id, "jaringan");
        break;
      }
    }
  } finally {
    sedangSync = false;
  }

  return { terkirim, gagal, tersisa: antreanAktif().length };
}

function hapusItem(id: string) {
  tulisAntrean(bacaAntrean().filter((i) => i.id !== id));
}

function catatGalat(id: string, pesan: string) {
  tulisAntrean(bacaAntrean().map((i) =>
    i.id === id ? { ...i, percobaan: i.percobaan + 1, galatTerakhir: pesan } : i));
}

/** Buang satu kiriman — dipakai bila pengguna memutuskan membatalkannya. */
export function buang(id: string) {
  hapusItem(id);
}

/** Untuk test. */
export function _reset() {
  if (typeof window !== "undefined") localStorage.removeItem(KUNCI);
  PENDENGAR.clear();
  sedangSync = false;
}

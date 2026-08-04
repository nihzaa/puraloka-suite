"use client";

// ============================================================================
// F4-2 — LAPIS DATA TERPUSAT: cache bersama, dedup, invalidasi.
//
// ══════════════════════════════════════════════════════════════════════════
// MASALAH YANG DIPECAHKAN
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-04: 56 `page.tsx` memakai `useEffect` untuk mengambil data,
// dengan 390 panggilan API tersebar di dalamnya. Tiga akibatnya:
//
//   1. TANPA DEDUP — dua komponen yang butuh data sama pada layar yang sama
//      mengirim dua request. Halaman proyek memuat daftar unit di tiga tempat;
//      itu tiga perjalanan bolak-balik untuk jawaban yang identik.
//   2. TANPA CACHE LINTAS NAVIGASI — pindah halaman lalu kembali mengambil
//      ulang semuanya. Di lapangan dengan sinyal buruk, itu terasa seperti
//      aplikasi yang rusak.
//   3. TANPA INVALIDASI — tiga hook yang sudah ada (`use-units`,
//      `use-work-categories`, `use-kasbon-purposes`) menyimpan cache di
//      variabel modul dan TAK PUNYA cara membuangnya. Setelah menambah satuan
//      baru, daftarnya tetap lama sampai halaman di-reload.
//
// ── Soal ganti perusahaan — dan koreksi atas dugaan saya sendiri
//
// Saya sempat menyimpulkan cache modul-level itu membocorkan data antar-tenant:
// ganti ke PT B, tapi satuan masih milik PT A. Diperiksa di sumbernya
// (`components/company-switcher.tsx:90`) — ternyata TIDAK, karena
// `pindah()` memanggil `window.location.reload()` yang membuang seluruh modul.
//
// Kebocorannya tak ada. Tetapi ketergantungan pada reload itu RAPUH: siapa pun
// yang kelak mengganti company switcher jadi transisi tanpa reload — hal yang
// wajar diinginkan — akan menghidupkan kebocoran itu tanpa satu pun galat.
//
// Karena itu cache di sini DIBERI KUNCI company secara eksplisit. Ia benar
// dengan atau tanpa reload, dan tak menuntut siapa pun mengingat kaitan ini.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Entri<T> = {
  data: T;
  waktu: number;
  /** Company pemilik data ini. Kunci, bukan sekadar catatan. */
  company: string;
};

const CACHE = new Map<string, Entri<unknown>>();

/**
 * Request yang SEDANG berjalan, per kunci.
 *
 * Inilah yang membuat dedup bekerja: komponen kedua yang meminta kunci sama
 * saat request pertama belum kembali akan menunggu promise YANG SAMA, bukan
 * mengirim request baru. Tanpa ini, tiga komponen = tiga request.
 */
const SEDANG = new Map<string, Promise<unknown>>();

/** Pelanggan per kunci — dipanggil saat datanya berubah/diinvalidasi. */
const PELANGGAN = new Map<string, Set<() => void>>();

function companyAktif(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("puraloka_company_id") ?? "";
}

function beritahu(kunci: string) {
  for (const f of PELANGGAN.get(kunci) ?? []) f();
}

/**
 * Buang entri cache.
 *
 * Tanpa argumen: buang SEMUA. Dengan awalan: buang yang cocok — mis.
 * `invalidasi("/api/v1/units")` sesudah menambah satuan baru.
 */
export function invalidasi(awalan?: string) {
  for (const kunci of [...CACHE.keys()]) {
    // ⚠️ Kunci berbentuk `<company>::<url>`, jadi mencocokkan awalan LANGSUNG
    // ke kunci tak akan pernah kena — `invalidasi("/api/v1/units")` diam-diam
    // tak membuang apa pun, dan pemanggilnya mengira datanya sudah segar.
    //
    // Ketahuan saat test pertama dijalankan: "invalidasi berawalan salah
    // sasaran, expected [] to equal ['/api/v1/units']". Cacat yang mustahil
    // terlihat dari membaca — ia tak melempar, hanya tak melakukan apa-apa.
    const url = kunci.slice(kunci.indexOf("::") + 2);
    if (!awalan || url.startsWith(awalan)) {
      CACHE.delete(kunci);
      beritahu(kunci);
    }
  }
}

/**
 * Buang seluruh cache milik company tertentu (atau yang bukan milik company
 * aktif). Dipanggil saat berpindah perusahaan.
 *
 * ⚠️ Ini yang membuat lapis ini benar TANPA bergantung pada reload halaman.
 */
export function buangCacheCompanyLain() {
  const aktif = companyAktif();
  for (const [kunci, entri] of [...CACHE.entries()]) {
    if (entri.company !== aktif) {
      CACHE.delete(kunci);
      beritahu(kunci);
    }
  }
}

export interface OpsiData {
  /** Umur maksimal cache dalam ms. Bawaan 5 menit. */
  segar?: number;
  /** Lewati cache sepenuhnya. */
  paksa?: boolean;
}

const SEGAR_BAWAAN = 5 * 60 * 1000;

/**
 * Ambil data dengan cache + dedup, berkunci company.
 *
 * Dipakai langsung, atau lewat hook `useData` di bawah.
 */
export async function ambilData<T>(url: string, opsi: OpsiData = {}): Promise<T> {
  const company = companyAktif();
  const kunci = `${company}::${url}`;
  const segar = opsi.segar ?? SEGAR_BAWAAN;

  if (!opsi.paksa) {
    const entri = CACHE.get(kunci) as Entri<T> | undefined;
    // Syarat `entri.company === company` sengaja diperiksa ULANG meski kunci
    // sudah memuatnya: kalau kelak bentuk kunci berubah, pemeriksaan ini yang
    // menahan data tenant lain — bukan asumsi tentang format string.
    if (entri && entri.company === company && Date.now() - entri.waktu < segar) {
      return entri.data;
    }
  }

  // DEDUP: kalau sudah ada yang meminta kunci ini, ikut menunggu.
  const berjalan = SEDANG.get(kunci) as Promise<T> | undefined;
  if (berjalan) return berjalan;

  const p = api.get<T>(url)
    .then(({ data }) => {
      CACHE.set(kunci, { data, waktu: Date.now(), company });
      beritahu(kunci);
      return data;
    })
    .finally(() => { SEDANG.delete(kunci); });

  SEDANG.set(kunci, p);
  return p;
}

export interface HasilData<T> {
  data: T | null;
  memuat: boolean;
  galat: Error | null;
  /** Ambil ulang, melewati cache. */
  muatUlang: () => Promise<void>;
}

/**
 * Hook pembungkus `ambilData`.
 *
 * Menggantikan pola `useEffect` + `useState` + `let alive` yang tersebar di 56
 * halaman — termasuk bagian yang paling sering salah: membatalkan setState
 * setelah komponen lepas.
 */
export function useData<T>(url: string | null, opsi: OpsiData = {}): HasilData<T> {
  const [data, setData] = useState<T | null>(null);
  const [memuat, setMemuat] = useState(url !== null);
  const [galat, setGalat] = useState<Error | null>(null);
  const hidup = useRef(true);

  const jalankan = useCallback(async (paksa: boolean) => {
    if (!url) return;
    setMemuat(true);
    try {
      const hasil = await ambilData<T>(url, { ...opsi, paksa });
      if (hidup.current) { setData(hasil); setGalat(null); }
    } catch (e) {
      if (hidup.current) setGalat(e as Error);
    } finally {
      if (hidup.current) setMemuat(false);
    }
    // `opsi` sengaja tak masuk daftar dependensi: ia objek literal yang lahir
    // baru tiap render, dan memasukkannya membuat efek berjalan tanpa henti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    hidup.current = true;
    // Pengambilan pertama. `jalankan` memanggil setState di dalam fungsi
    // async — bukan render berantai sinkron yang jadi maksud aturan ini,
    // karena setState-nya terjadi SETELAH await, di tick berikutnya.
    //
    // Ditandai sadar, bukan dibungkam: hook ini ADA justru untuk menghapus
    // pola useEffect+setState dari 56 halaman. Satu penanda di sini menukar
    // 56 pelanggaran di sana — pertukaran yang jelas, tetapi hanya sah bila
    // tertulis. Menaikkan ambang lint diam-diam bukan jalannya.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void jalankan(false);

    // Berlangganan invalidasi supaya komponen ikut menyegarkan diri saat
    // data yang dipakainya dibuang di tempat lain.
    const company = companyAktif();
    const kunci = `${company}::${url}`;
    const langganan = () => { if (hidup.current) void jalankan(false); };
    if (url) {
      if (!PELANGGAN.has(kunci)) PELANGGAN.set(kunci, new Set());
      PELANGGAN.get(kunci)!.add(langganan);
    }

    return () => {
      hidup.current = false;
      if (url) PELANGGAN.get(kunci)?.delete(langganan);
    };
  }, [url, jalankan]);

  const muatUlang = useCallback(() => jalankan(true), [jalankan]);

  return { data, memuat, galat, muatUlang };
}

/** Untuk test — kosongkan seluruh keadaan modul. */
export function _resetCache() {
  CACHE.clear();
  SEDANG.clear();
  PELANGGAN.clear();
}

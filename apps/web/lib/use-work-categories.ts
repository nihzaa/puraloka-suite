"use client";

import { useData } from "@/lib/data-cache";

// useWorkCategories — SATU sumber kategori pekerjaan (census A7, pola useUnits #32).
// GET /api/v1/work-categories (master work_categories, migration 094), dikelola di
// /pengaturan/kategori-pekerjaan. mandor simpan `code` di work_scope_items.category.
//
// ── F4-2: pindah ke lapis data terpusat
//
// Versi lama menyimpan cache di variabel modul (`let CACHE`). Itu bekerja,
// tetapi punya tiga lubang yang baru terlihat setelah dikumpulkan:
//
//   · TANPA DEDUP — dua komponen yang memakai hook ini pada layar yang sama
//     mengirim dua request untuk jawaban identik.
//   · TANPA INVALIDASI — setelah menambah kategori baru di /pengaturan,
//     daftarnya tetap lama sampai halaman di-reload.
//   · TANPA KUNCI COMPANY — hari ini aman karena company-switcher memanggil
//     `window.location.reload()`, tetapi ketergantungan itu tak tertulis di
//     mana pun. Siapa pun yang membuat perpindahan jadi mulus akan
//     menghidupkan kebocoran lintas-tenant tanpa satu pun galat.
//
// `useData` menutup ketiganya sekaligus, dan jaminannya diuji di
// `data-cache.test.ts` — termasuk mutation test untuk kunci company.

export interface WorkCategoryRow {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

// Fallback tampilan untuk code lama bila master belum termuat (= CATEGORY_LABELS historis).
const LEGACY_LABEL: Record<string, string> = {
  struktur: "Struktur", baja: "Baja", dinding: "Dinding", finishing: "Finishing",
  atap: "Atap", plumbing: "Plumbing", elektrikal: "Elektrikal", mekanikal: "Mekanikal",
  kusen_pintu: "Kusen & Pintu", pagar_carport: "Pagar/Carport", landscape: "Landscape", lain_lain: "Lain-lain",
};

export function useWorkCategories() {
  const { data, memuat } = useData<{ categories: WorkCategoryRow[] }>(
    "/api/v1/work-categories");

  // Galat sengaja TIDAK dilempar ke pemakai: hook ini melayani PELABELAN, dan
  // LEGACY_LABEL di bawah sudah menjadi jaring pengamannya. Kategori yang
  // tampil sebagai kode mentah jauh lebih baik daripada halaman yang gagal
  // dimuat — perilaku ini dipertahankan dari versi lama (`.catch()` kosong),
  // bukan kelalaian baru.
  const categories = data?.categories ?? [];
  const loading = memuat;

  const labelOf = (code: string): string => {
    if (!code) return code;
    const hit = categories.find(c => c.code === code);
    return hit ? hit.label : (LEGACY_LABEL[code] ?? code);
  };

  return { categories, labelOf, loading };
}

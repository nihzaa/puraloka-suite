"use client";

import { useData } from "@/lib/data-cache";

// useKasbonPurposes — SATU sumber tujuan kasbon (census A4, pola useUnits/useWorkCategories).
// GET /api/v1/kasbon-purposes (master kasbon_purposes, migration 096), dikelola di
// /pengaturan/kasbon-purposes. kasbons.purpose menyimpan `code`.

export interface KasbonPurposeRow {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

// Fallback tampilan untuk code lama bila master belum termuat (= purposeLabel historis).
const LEGACY_LABEL: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan", pembelian_alat: "Pembelian Alat",
  operasional: "Operasional", lain_lain: "Lain-lain",
};

export function useKasbonPurposes() {
  // F4-2 — lewat lapis data terpusat: dedup, invalidasi, dan kunci company.
  // Cache modul-level yang lama tak punya ketiganya; alasan lengkapnya di
  // `use-work-categories.ts`.
  //
  // Galat sengaja tak dilempar ke pemakai: LEGACY_LABEL di atas adalah jaring
  // pengamannya, dan kode mentah yang tampil jauh lebih baik daripada halaman
  // yang gagal dimuat. Perilaku ini dipertahankan dari versi lama.
  const { data, memuat } = useData<{ purposes: KasbonPurposeRow[] }>(
    "/api/v1/kasbon-purposes");
  const purposes = data?.purposes ?? [];
  const loading = memuat;

  const labelOf = (code: string): string => {
    if (!code) return code;
    const hit = purposes.find(p => p.code === code);
    return hit ? hit.label : (LEGACY_LABEL[code] ?? code);
  };

  return { purposes, labelOf, loading };
}

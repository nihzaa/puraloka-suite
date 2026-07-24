"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// useWorkCategories — SATU sumber kategori pekerjaan (census A7, pola useUnits #32).
// GET /api/v1/work-categories (master work_categories, migration 094), dikelola di
// /pengaturan/kategori-pekerjaan. mandor simpan `code` di work_scope_items.category.

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

let CACHE: WorkCategoryRow[] | null = null;

export function useWorkCategories() {
  const [categories, setCategories] = useState<WorkCategoryRow[]>(CACHE ?? []);
  const [loading, setLoading] = useState(CACHE === null);

  useEffect(() => {
    let alive = true;
    api.get<{ categories: WorkCategoryRow[] }>("/api/v1/work-categories")
      .then(({ data }) => { if (!alive) return; CACHE = data.categories ?? []; setCategories(CACHE); })
      .catch(() => { /* fallback legacy */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const labelOf = (code: string): string => {
    if (!code) return code;
    const hit = categories.find(c => c.code === code);
    return hit ? hit.label : (LEGACY_LABEL[code] ?? code);
  };

  return { categories, labelOf, loading };
}

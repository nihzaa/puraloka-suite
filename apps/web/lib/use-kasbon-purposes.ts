"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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

let CACHE: KasbonPurposeRow[] | null = null;

export function useKasbonPurposes() {
  const [purposes, setPurposes] = useState<KasbonPurposeRow[]>(CACHE ?? []);
  const [loading, setLoading] = useState(CACHE === null);

  useEffect(() => {
    let alive = true;
    api.get<{ purposes: KasbonPurposeRow[] }>("/api/v1/kasbon-purposes")
      .then(({ data }) => { if (!alive) return; CACHE = data.purposes ?? []; setPurposes(CACHE); })
      .catch(() => { /* fallback legacy */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const labelOf = (code: string): string => {
    if (!code) return code;
    const hit = purposes.find(p => p.code === code);
    return hit ? hit.label : (LEGACY_LABEL[code] ?? code);
  };

  return { purposes, labelOf, loading };
}

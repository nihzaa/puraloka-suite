"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// useUnits — SATU sumber satuan (unit of measure) untuk seluruh UI.
// Menggantikan dua daftar hardcode divergen (procurement UNITS + mandor UNITS_GROUPED).
// Data dari GET /api/v1/units (master `units`, migration 090), dikelola di /pengaturan/satuan.
//
// Konvensi nilai tersimpan berbeda per domain (behavior-preserving, nol migrasi data):
//   • mandor      → simpan `code`   (unitOptionsByCode / grouped)
//   • procurement → simpan `symbol` (unitSymbols)
// symbolOf(value) menampilkan simbol untuk NILAI apa pun (code atau symbol) + fallback legacy.
// ─────────────────────────────────────────────────────────────────────────────

export interface UnitRow {
  code: string;
  symbol: string;
  label: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

// Label + urutan kategori untuk optgroup (tampilan mandor).
const CATEGORY_LABEL: Record<string, string> = {
  area: "Area", length: "Panjang", volume: "Volume", weight: "Berat",
  count: "Unit/Buah", set: "Set/Lot", time: "Waktu",
};
const CATEGORY_ORDER = ["area", "length", "volume", "weight", "count", "set", "time"];

// Fallback tampilan untuk kode lama bila master belum termuat / kode dihapus dari master.
// Sama dengan UNIT_LABELS historis mandor — menjamin display existing data tak pernah kosong.
const LEGACY_SYMBOL: Record<string, string> = {
  m2: "m²", m3: "m³", m: "m", m_linear: "m'", kg: "kg", ton: "ton",
  unit: "unit", buah: "buah", titik: "titik", batang: "batang",
  lembar: "lembar", set: "set", ls: "ls", hari: "hari", minggu: "minggu",
};

export interface UnitGroup {
  category: string;
  label: string;
  items: UnitRow[];
}

export interface UseUnits {
  units: UnitRow[];
  grouped: UnitGroup[];
  /** Tampilkan simbol untuk nilai tersimpan apa pun (code ATAU symbol) + fallback legacy → raw. */
  symbolOf: (value: string) => string;
  loading: boolean;
}

let CACHE: UnitRow[] | null = null; // cache modul: hindari fetch berulang antar komponen.

export function useUnits(): UseUnits {
  const [units, setUnits] = useState<UnitRow[]>(CACHE ?? []);
  const [loading, setLoading] = useState(CACHE === null);

  useEffect(() => {
    let alive = true;
    api.get<{ units: UnitRow[] }>("/api/v1/units")
      .then(({ data }) => {
        if (!alive) return;
        CACHE = data.units ?? [];
        setUnits(CACHE);
      })
      .catch(() => { /* biarkan cache/kosong; caller punya fallback legacy */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const grouped: UnitGroup[] = CATEGORY_ORDER
    .map(cat => ({
      category: cat,
      label: CATEGORY_LABEL[cat] ?? cat,
      items: units.filter(u => u.category === cat),
    }))
    .filter(g => g.items.length > 0);

  // Resolver: cocokkan nilai ke code ATAU symbol (kedua konvensi domain) → simbol.
  const symbolOf = (value: string): string => {
    if (!value) return value;
    const byCode = units.find(u => u.code === value);
    if (byCode) return byCode.symbol;
    const bySymbol = units.find(u => u.symbol === value);
    if (bySymbol) return bySymbol.symbol;
    return LEGACY_SYMBOL[value] ?? value;
  };

  return { units, grouped, symbolOf, loading };
}

"use client";

// ============================================================================
// Klien — Portal PM (Task 41, Tahap 7). READ-ONLY.
//
// `GET /api/v1/clients` HANYA bergerbang `authenticate` (nol
// `requirePermission`) — dikonfirmasi baca langsung `routes/v1/clients.ts`.
// PM PUNYA `clients:view` tapi TIDAK `clients:manage` (dikonfirmasi query
// live `role_permissions` untuk KEDUA baris role `pm`) — POST/PATCH/
// toggle-active semuanya bergerbang `clients:manage`, jadi halaman ini TIDAK
// PUNYA tombol tambah/edit/nonaktifkan sama sekali, berbeda dari `/klien` web
// yang membuka form untuk admin.
//
// `medanKurang` (lib/ringkasan-klien.ts, sudah ada dari halaman web `/klien`)
// dipakai apa adanya — `KlienPM` di sini superset field yang dibutuhkan
// `KlienRingkas`, jadi cocok secara struktural tanpa mapping tambahan.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, Search, AlertCircle } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespDaftarKlien, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";
import { medanKurang } from "@/lib/ringkasan-klien";

type FilterTipe = "all" | "perorangan" | "perusahaan";

export default function PmKlienPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTipe>("all");

  const { data, memuat, galat } = useData<RespDaftarKlien>("/api/v1/clients");

  const tersaring = useMemo(() => {
    let hasil = data?.clients ?? [];
    if (filter !== "all") hasil = hasil.filter((c) => c.client_type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      hasil = hasil.filter(
        (c) => c.contact_person.toLowerCase().includes(q)
          || (c.company_name ?? "").toLowerCase().includes(q),
      );
    }
    return hasil;
  }, [data, filter, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Klien
      </h1>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", minHeight: 44 }}>
        <Search size={16} color="var(--text-secondary)" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama/perusahaan…"
          aria-label="Cari klien"
          style={{ flex: 1, border: "none", outline: "none", fontSize: 14, background: "transparent", color: "var(--text-primary)" }}
        />
      </div>

      <SegmentedTab
        opsi={[
          { value: "all", label: "Semua" },
          { value: "perorangan", label: "Perorangan" },
          { value: "perusahaan", label: "Perusahaan" },
        ]}
        aktif={filter}
        onUbah={(v) => setFilter(v as FilterTipe)}
      />

      {memuat && <SkeletonCard tinggi={120} />}
      {!memuat && galat && (
        <EmptyState icon={AlertCircle} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba lagi.")} />
      )}
      {!memuat && !galat && tersaring.length === 0 && (
        <EmptyState icon={Users} judul="Tidak ada klien" deskripsi="Belum ada klien yang cocok dengan pencarian ini." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tersaring.map((c) => {
          const kurang = medanKurang(c);
          return (
            <Link
              key={c.id}
              href={`/pm-portal/klien/${c.id}`}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {c.company_name ?? c.contact_person}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {c.contact_person} · {c.phone}
                </div>
                {kurang.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--on-warning-bg)", marginTop: 2 }}>
                    Data kurang: {kurang.join(", ")}
                  </div>
                )}
              </div>
              {!c.is_active && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 }}>
                  Nonaktif
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

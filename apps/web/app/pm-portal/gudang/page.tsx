"use client";

// ============================================================================
// Gudang & Material — ikhtisar. Portal PM (Task 25 Step 2).
//
// Data LINTAS-PROYEK milik company (bukan per-proyek seperti sebagian besar
// halaman portal PM lain) — mengikuti bentuk `GET /api/v1/gudang/ikhtisar`
// (`gudang-ikhtisar.ts`), yang memang dirancang menjawab pertanyaan level
// perusahaan: alat menganggur vs bekerja, alat pulang memburuk, proyek
// selesai tapi material belum ditarik, nilai buku aset. Gerbang `gudang:view`
// — PM punya (diseed migrasi 238, mengikuti role yang sudah punya
// assets:view/assets:manage).
// ============================================================================

import { Warehouse, AlertTriangle, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge from "@/components/portal/StatusBadge";
import type { RespGudangIkhtisar, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

function fmtRupiah(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function KartuKpi({ label, nilai }: { label: string; nilai: string | number }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 45%", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginTop: 2 }}>{nilai}</div>
    </div>
  );
}

export default function PmGudangPage() {
  const { data, memuat, galat } = useData<RespGudangIkhtisar>("/api/v1/gudang/ikhtisar");

  if (memuat) return <SkeletonCard tinggi={220} />;
  if (galat || !data) {
    return <EmptyState icon={Warehouse} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <KepalaPortal judul="Gudang & Material" />
        <Link href="/pm-portal/gudang/lokasi" style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", textDecoration: "none" }}>Kelola Lokasi</Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <KartuKpi label="Total Aset" nilai={data.kpi.total_aset} />
        <KartuKpi label="Perlu Perhatian" nilai={data.kpi.perlu_perhatian} />
        <KartuKpi label="Nilai Buku" nilai={fmtRupiah(data.kpi.nilai_buku)} />
        <KartuKpi label="Proyek Belum Ditarik" nilai={data.kpi.proyek_belum_ditarik} />
      </div>

      {data.belum_ditarik.length > 0 && (
        <div style={{ padding: 14, borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color="var(--on-warning-bg)" aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>Proyek selesai, material belum ditarik</span>
          </div>
          {data.belum_ditarik.map((b, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--on-warning-bg)" }}>{b.proyek}: {b.jenis} jenis material, {b.qty} unit</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Lokasi Gudang</div>
      {data.gudang.length === 0 && <EmptyState icon={Warehouse} judul="Belum ada gudang" deskripsi="Tambahkan lokasi gudang pertama." />}
      {data.gudang.map((g) => (
        <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.kode} · {g.nama}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{g.jumlah_aset} aset · {g.jenis_material} jenis material</div>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Pergerakan Terakhir</div>
      {data.pergerakan.length === 0 && <EmptyState icon={TrendingDown} judul="Belum ada pergerakan" deskripsi="Perpindahan aset akan tercatat di sini." />}
      {data.pergerakan.slice(0, 8).map((m) => (
        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
          <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{m.dari ?? "—"} → {m.ke ?? "—"}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.hari_lalu != null ? `${m.hari_lalu}h lalu` : "—"}</span>
            {m.memburuk && <StatusBadge status="rejected" label="Memburuk" />}
          </div>
        </div>
      ))}
    </div>
  );
}

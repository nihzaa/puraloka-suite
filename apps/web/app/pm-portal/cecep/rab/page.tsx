"use client";

// ============================================================================
// RAB — dashbor daftar per proyek (Tahap 3, Task 19).
//
// Satu baris per VERSI estimasi (bukan per proyek): membandingkan dua
// penawaran untuk proyek yang sama adalah pekerjaan nyata di modul ini
// (`scenarios`), jadi baris dikelompokkan per `project_id` di klien — pola
// spec rombak §3c yang sudah disetujui founder untuk versi web, dipakai
// ulang di sini karena masalah yang dipecahkannya sama persis: orang gagal
// MENEMUKAN KEMBALI RAB yang sudah ada.
//
// Bentuk `BarisRabDaftar`/`RespRabDaftar` diverifikasi PERSIS ke
// `apps/api/src/routes/v1/estimate-versions.ts:251-336` (Task 19,
// independen dari brief) — `total_amount: null` TETAP "—", bukan Rp 0.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Search } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespRabDaftar, BarisRabDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Masih disusun",
  under_review: "Diajukan",
  approved: "Disetujui",
  frozen: "Dibekukan",
  superseded: "Tergantikan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral",
  under_review: "pending",
  approved: "approved",
  frozen: "info",
  superseded: "netral",
};
const FILTER_OPSI = [
  { value: "semua", label: "Semua" },
  { value: "draft", label: "Draf" },
  { value: "under_review", label: "Diajukan" },
  { value: "approved", label: "Disetujui" },
];

export default function PmRabDaftarPage() {
  const [filter, setFilter] = useState("semua");
  const [cari, setCari] = useState("");
  const { data, memuat, galat: galatMuat } = useData<RespRabDaftar>("/api/v1/estimate-versions?limit=200");
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat daftar RAB.") : null;

  const tersaring = useMemo(() => {
    let baris = data?.data ?? [];
    if (filter !== "semua") baris = baris.filter((b) => b.status === filter);
    if (cari.trim()) {
      const q = cari.trim().toLowerCase();
      baris = baris.filter((b) => (b.project_name ?? "").toLowerCase().includes(q));
    }
    return baris;
  }, [data, filter, cari]);

  const perProyek = useMemo(() => {
    const m = new Map<string, { nama: string; baris: BarisRabDaftar[] }>();
    for (const b of tersaring) {
      const key = b.project_id ?? "tanpa-proyek";
      const entry = m.get(key) ?? { nama: b.project_name ?? "Tanpa proyek", baris: [] };
      entry.baris.push(b);
      m.set(key, entry);
    }
    return [...m.entries()];
  }, [tersaring]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="RAB" />

      <div style={{ position: "relative" }}>
        <Search
          size={16}
          color="var(--text-secondary)"
          aria-hidden="true"
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama proyek…"
          aria-label="Cari RAB berdasarkan proyek"
          style={{
            width: "100%",
            minHeight: 44,
            padding: "0 12px 0 36px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            fontSize: 14,
            background: "var(--surface)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <SegmentedTab opsi={FILTER_OPSI} aktif={filter} onUbah={setFilter} />

      {memuat && <SkeletonCard tinggi={140} />}
      {galat && (
        <EmptyState icon={FileSpreadsheet} judul="Gagal memuat" deskripsi={galat} />
      )}
      {!memuat && !galat && perProyek.length === 0 && (
        <EmptyState
          icon={FileSpreadsheet}
          judul="Tidak ada RAB"
          deskripsi={cari || filter !== "semua" ? "Tak ada yang cocok dengan filter ini." : "Belum ada RAB tersusun."}
        />
      )}

      {perProyek.map(([projectId, { nama, baris }]) => (
        <div key={projectId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{nama}</div>
          {baris.map((b) => (
            <Link
              key={b.id}
              href={`/pm-portal/cecep/rab/${b.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "var(--pad-kartu)",
                borderRadius: "var(--portal-radius-card)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {b.scenario_name ?? "Utama"} · revisi {b.version_number}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {b.edition_code ?? "edisi belum dipilih"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(b.total_amount)}</div>
                <StatusBadge status={VARIAN_STATUS[b.status] ?? "netral"} label={LABEL_STATUS[b.status] ?? b.status} />
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

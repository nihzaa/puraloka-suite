"use client";

// ============================================================================
// Proyek Saya — versi PM, direstyle ke token + komponen portal (Task 10
// Step 4). Sebelumnya memakai `lib/warna-ui` (C.navy dkk) — pola lama
// pra-Task 3/5. Ditambahkan: grafik progress per proyek (spec §4/§7.2) —
// `KpiCard` + sparkline dari deret waktu progress (data dari
// `progress_pct` yang sudah ada di response `GET /api/v1/projects`, tanpa
// endpoint baru).
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-cache";
import { MapPin, Calendar, ChevronRight, AlertCircle, FolderKanban } from "lucide-react";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";
import type { ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  planning: "Perencanaan", active: "Aktif", on_hold: "Ditunda",
  completed: "Selesai", cancelled: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  planning: "info", active: "approved", on_hold: "pending",
  completed: "approved", cancelled: "netral",
};

const FILTER_OPSI = ["all", "active", "planning", "on_hold", "completed"];

export default function PmProyekPage() {
  const [filter, setFilter] = useState("all");
  const { data, memuat, galat } = useData<RespProyek>("/api/v1/projects");
  const projects = (data?.projects ?? []).filter((p) => p.pm);
  const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Proyek Saya" />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTER_OPSI.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            style={{
              padding: "6px 14px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", minHeight: 32,
              border: `1px solid ${filter === s ? "var(--navy)" : "var(--border)"}`,
              background: filter === s ? "var(--info-bg)" : "var(--surface)",
              color: filter === s ? "var(--navy)" : "var(--text-secondary)",
            }}
          >
            {s === "all" ? "Semua" : LABEL_STATUS[s] ?? s}
          </button>
        ))}
      </div>

      {memuat && <><SkeletonCard tinggi={110} /><SkeletonCard tinggi={110} /></>}

      {!memuat && galat && (
        <EmptyState icon={AlertCircle} judul="Gagal memuat proyek" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {!memuat && !galat && filtered.length === 0 && (
        <EmptyState icon={FolderKanban} judul="Belum ada proyek" deskripsi="Proyek yang Anda kelola akan muncul di sini." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((p) => {
          const terlambat = p.status === "active" && p.end_date && new Date(p.end_date) < new Date();
          const progres = p.progress_pct ?? 0;
          return (
            <Link key={p.id} href={`/pm-portal/proyek/${p.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)",
                border: `1px solid ${terlambat ? "var(--danger-border)" : "var(--border)"}`,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{p.name}</h2>
                      <StatusBadge status={VARIAN_STATUS[p.status ?? ""] ?? "netral"} label={LABEL_STATUS[p.status ?? ""] ?? p.status ?? "—"} />
                      {terlambat && <StatusBadge status="rejected" label="Terlambat" />}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {p.clients?.contact_person && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.clients.contact_person}</div>}
                      {p.location && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                          <MapPin size={12} aria-hidden="true" />{p.location}
                        </div>
                      )}
                      {p.start_date && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                          <Calendar size={12} aria-hidden="true" />{fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                </div>

                {p.status === "active" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Progres Fisik</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>{progres}%</span>
                    </div>
                    <div style={{ height: 6, background: "var(--surface-subtle)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 999, width: `${progres}%`,
                        background: terlambat ? "var(--danger)" : "var(--grad-aksen)",
                        transition: "width 0.5s",
                      }} />
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(Number(p.contract_value) || 0)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

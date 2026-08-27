"use client";

// ============================================================================
// Proyek — Portal Admin/Direktur (Task 7). COMPANY-WIDE tanpa saringan
// kepemilikan — beda dari `pm-portal/proyek/page.tsx` yang menyaring
// `.filter((p) => p.pm)` (riset Task 6: `GET /api/v1/projects` TIDAK
// menyempitkan apa pun untuk role selain `client`; PM Portal menyaring di
// klien, bukan endpoint). Admin melihat SELURUH proyek tenant, termasuk
// yang belum ditugaskan PM-nya — admin adalah pihak yang menugaskan.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { MapPin, Calendar, ChevronRight, AlertCircle, FolderKanban } from "lucide-react";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";
import type { ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS: Record<string, string> = {
  planning: "Perencanaan", active: "Aktif", on_hold: "Ditunda",
  completed: "Selesai", cancelled: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  planning: "info", active: "approved", on_hold: "pending",
  completed: "approved", cancelled: "netral",
};
const FILTER_OPSI = ["all", "active", "planning", "on_hold", "completed"];

export default function AdminProyekPage() {
  const [filter, setFilter] = useState("all");
  const { data, memuat, galat } = useData<RespProyek>("/api/v1/projects");
  // TANPA `.filter((p) => p.pm)` — company-wide sungguhan, lihat komentar berkas.
  const projects = data?.projects ?? [];
  const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Proyek" />

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
        <EmptyState icon={FolderKanban} judul="Belum ada proyek" deskripsi="Proyek perusahaan akan muncul di sini." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((p) => {
          const terlambat = p.status === "active" && p.end_date && new Date(p.end_date) < new Date();
          const progres = p.progress_pct ?? 0;
          return (
            <Link key={p.id} href={`/admin-portal/proyek/${p.id}`} style={{ textDecoration: "none" }}>
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
                      {/* Beda dari PM: admin butuh tahu proyek BELUM berpenanggung jawab — sinyal yang tak relevan buat PM sendiri. */}
                      {!p.pm && <StatusBadge status="pending" label="Belum ada PM" />}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {p.pm?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>PM: {p.pm.name}</div>}
                      {p.clients?.contact_person && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.clients.contact_person}</div>}
                      {p.location && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                          <MapPin size={12} aria-hidden="true" />{p.location}
                        </div>
                      )}
                      {p.start_date && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                          <Calendar size={12} aria-hidden="true" />{formatTanggal(p.start_date)} – {formatTanggal(p.end_date)}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                </div>

                {p.status === "active" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Serapan Anggaran</span>
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
                  {formatRupiah(p.contract_value ?? 0)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

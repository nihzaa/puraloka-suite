"use client";

// ============================================================================
// Beranda Portal Klien — Task 11, direstyle total dari `lib/warna-ui` (C.*)
// ke token + komponen portal.
//
// Diperkaya dari draf plan (yang cuma 2 KPI + list teks datar — "terlalu
// longgar" persis keluhan founder di ARAH-VISUAL-2026.md §1a) mengikuti
// pola BAKU tiga lapis di dokumen itu §5b: KEADAAN (KPI) → POLA (grafik
// perbandingan) → DETAIL (kartu proyek, bukan baris teks polos).
//
// Endpoint sama persis dengan pm-portal (`GET /api/v1/projects`) — scope
// klien otomatis di server (`projects.ts:34-43`, filter `client_id`),
// jadi tak perlu filter `.pm` di sini seperti versi PM.
// ============================================================================

import Link from "next/link";
import { FolderKanban, TrendingUp, AlertTriangle, ChevronRight, MapPin, Calendar } from "lucide-react";
import { useData } from "@/lib/data-cache";
import KpiCard from "@/components/portal/KpiCard";
import KepalaPortal from "@/components/portal/KepalaPortal";
import MiniChart from "@/components/portal/MiniChart";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";
import type { GalatApi } from "./_bersama/tipe";
import { pesanGalat } from "./_bersama/tipe";

interface ProyekKlien {
  id: string;
  name: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  progress_pct?: number | null;
  contract_value?: number | string | null;
}
interface RespProyek { total: number; projects: ProyekKlien[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined): string {
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

export default function PortalKlienBerandaPage() {
  const { data, memuat, galat } = useData<RespProyek>("/api/v1/projects");
  const proyek = data?.projects ?? [];
  const aktif = proyek.filter((p) => p.status === "active");
  const telat = aktif.filter((p) => p.end_date && new Date(p.end_date) < new Date());
  const nilaiTotal = proyek.reduce((s, p) => s + (Number(p.contract_value) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Proyek Saya" />

      {/* LAPIS 1 — KEADAAN: empat KPI, bukan dua */}
      {memuat ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SkeletonCard tinggi={90} /><SkeletonCard tinggi={90} />
          <SkeletonCard tinggi={90} /><SkeletonCard tinggi={90} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard label="Proyek Aktif" nilai={String(aktif.length)} icon={FolderKanban} />
          <KpiCard label="Total Proyek" nilai={String(proyek.length)} icon={FolderKanban} />
          <KpiCard label="Nilai Kontrak" nilai={fmtRupiah(nilaiTotal)} icon={TrendingUp} />
          <KpiCard label="Perlu Perhatian" nilai={String(telat.length)} icon={AlertTriangle} />
        </div>
      )}

      {!memuat && galat && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat proyek" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {/* LAPIS 2 — POLA: grafik perbandingan progres antar-proyek */}
      {!memuat && !galat && aktif.length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", border: "1px solid var(--border)", padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
            Progres Proyek Aktif
          </div>
          <MiniChart
            tipe="bar"
            tinggi={110}
            data={aktif.map((p) => ({ label: p.name, value: p.progress_pct ?? 0 }))}
          />
        </div>
      )}

      {!memuat && !galat && proyek.length === 0 && (
        <EmptyState icon={FolderKanban} judul="Belum ada proyek" deskripsi="Proyek Anda akan muncul di sini begitu kontrak berjalan." />
      )}

      {/* LAPIS 3 — DETAIL: kartu proyek informatif, bukan baris teks datar */}
      {!memuat && !galat && proyek.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {proyek.map((p) => {
            const terlambat = p.status === "active" && p.end_date && new Date(p.end_date) < new Date();
            const progres = p.progress_pct ?? 0;
            return (
              <Link key={p.id} href={`/portal/proyek/${p.id}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)",
                  border: `1px solid ${terlambat ? "var(--danger-border)" : "var(--border)"}`,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{p.name}</span>
                        <StatusBadge status={VARIAN_STATUS[p.status ?? ""] ?? "netral"} label={LABEL_STATUS[p.status ?? ""] ?? p.status ?? "—"} />
                        {terlambat && <StatusBadge status="rejected" label="Terlambat" />}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                        {p.location && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                            <MapPin size={12} aria-hidden="true" />{p.location}
                          </span>
                        )}
                        {p.start_date && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                            <Calendar size={12} aria-hidden="true" />{fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                          </span>
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
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

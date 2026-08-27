"use client";

// ============================================================================
// Template WBS — Master Data CECEP (Tahap 3, Task 18), READ-ONLY.
//
// PM punya `cecep:cbs:view` TAPI TIDAK `cecep:cbs:manage` — halaman ini
// sengaja tanpa tombol "Terapkan" (aksi destruktif — menolak proyek ber-RAB,
// tak cocok jadi aksi mobile satu ketuk tanpa konteks penuh).
//
// Bentuk `TemplateWbsRingkas`/`RespTemplateWbsList` diverifikasi PERSIS ke
// `apps/api/src/routes/v1/template-wbs.ts:33-77` (GET /api/v1/template-wbs)
// + `apps/api/src/lib/template-wbs.ts:36,203-211` (`StatusTemplate`,
// `RingkasTemplate`) — dua kali (brief + verifikasi ulang independen Task
// 18). Kunci respons `template` (BUKAN `data`), status
// "draft"|"active"|"superseded" (BUKAN "draft"|"published"|"archived").
// ============================================================================

import { GitBranch } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespTemplateWbsList, TemplateWbsRingkas, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = { draft: "Draf", active: "Aktif", superseded: "Tergantikan" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "netral", active: "approved", superseded: "rejected" };

export default function PmTemplateWbsPage() {
  const { data, memuat, galat } = useData<RespTemplateWbsList>("/api/v1/template-wbs");
  const daftar = data?.template ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div>
        <KepalaPortal judul="Template WBS" />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Kerangka pekerjaan siap pakai. Menerapkan template ke proyek hanya
          tersedia di web — aksi ini menolak proyek yang sudah punya RAB.
        </p>
      </div>

      {memuat && <SkeletonCard tinggi={64} />}
      {galat && (
        <EmptyState icon={GitBranch} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />
      )}
      {!memuat && !galat && daftar.length === 0 && (
        <EmptyState icon={GitBranch} judul="Belum ada template" deskripsi="Template WBS belum dibuat." />
      )}

      {daftar.map((t: TemplateWbsRingkas) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--gap-grid)", padding: "var(--pad-kartu)", borderRadius: "var(--portal-radius-card)", background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {t.code} · {t.name}
              {t.milik_bersama && (
                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: "var(--text-secondary)" }}>· Katalog bersama</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Versi {t.version_number} · {t.jumlahNode} baris struktur
            </div>
          </div>
          <StatusBadge status={VARIAN_STATUS[t.status] ?? "netral"} label={LABEL_STATUS[t.status] ?? t.status} />
        </div>
      ))}
    </div>
  );
}

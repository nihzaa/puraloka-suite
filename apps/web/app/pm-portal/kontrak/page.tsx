"use client";

// ============================================================================
// Kontrak — versi PM, BACA SAJA.
//
// Tak ada tabel/endpoint `contracts` terpisah — nilai kontrak, model, pajak,
// retensi, dan denda adalah KOLOM LANGSUNG di `projects` (diverifikasi:
// dicatat di `KontrakRingkas` — `pm-portal/_bersama/tipe.ts`). Halaman ini
// karena itu tak punya endpoint sendiri, hanya membaca subset field dari
// `GET /api/v1/projects` yang sudah dipakai halaman lain.
// ============================================================================

import { useMemo, useState } from "react";
import { Landmark } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { ProyekPM } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmtPersen(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v}%`;
}

const LABEL_MODEL: Record<string, string> = {
  lump_sum: "Lump Sum", unit_price: "Harga Satuan", cost_plus: "Cost Plus",
};
const LABEL_PAJAK: Record<string, string> = {
  pph_final: "PPh Final 2%", ppn: "PPN 11%", tanpa_pajak: "Tanpa Pajak",
};

export default function PmKontrakPage() {
  const [proyekId, setProyekId] = useState("");
  const { data, memuat } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (data?.projects ?? []).filter((p) => p.pm), [data]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";
  const proyek = daftarProyek.find((p) => p.id === proyekAktif);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Kontrak" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {memuat && <SkeletonCard tinggi={200} />}
      {!memuat && !proyek && <EmptyState icon={Landmark} judul="Pilih proyek" deskripsi="Ringkasan kontrak tercatat per proyek." />}

      {!memuat && proyek && (
        <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Nilai Kontrak</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{fmtRupiah(proyek.contract_value)}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Model Kontrak</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {(proyek.contract_model && LABEL_MODEL[proyek.contract_model]) ?? proyek.contract_model ?? "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Skema Pajak</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {(proyek.tax_scheme && LABEL_PAJAK[proyek.tax_scheme]) ?? proyek.tax_scheme ?? "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Retensi</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {fmtPersen(proyek.retention_pct)}{proyek.retention_amount ? ` (${fmtRupiah(proyek.retention_amount)})` : ""}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Komisi</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{fmtPersen(proyek.commission_pct)}</div>
            </div>
          </div>

          {proyek.penalty_enabled && (
            <div style={{ padding: 12, borderRadius: 12, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-danger-bg)", marginBottom: 4 }}>Denda Keterlambatan</div>
              <div style={{ fontSize: 12, color: "var(--on-danger-bg)" }}>
                {fmtPersen(proyek.penalty_rate_per_day)}/hari
                {proyek.penalty_cap_pct ? `, maksimum ${fmtPersen(proyek.penalty_cap_pct)}` : ""}
                {proyek.penalty_grace_days ? ` · masa tenggang ${proyek.penalty_grace_days} hari` : ""}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <span>Mulai: {proyek.start_date ?? "—"}</span>
            <span>Selesai: {proyek.end_date ?? "—"}</span>
          </div>

          {proyek.clients?.contact_person && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Klien: {proyek.clients.contact_person}{proyek.clients.phone ? ` · ${proyek.clients.phone}` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

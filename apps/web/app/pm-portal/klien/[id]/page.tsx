"use client";

// ============================================================================
// Detail Klien — Portal PM (Task 41, Tahap 7). READ-ONLY.
//
// `GET /api/v1/clients/:id` (bentuk PERSIS `routes/v1/clients.ts:41-98`):
// kontak klien, daftar proyek ringkas (`projects` subset kolom), dan
// ringkasan invoice DIHITUNG SERVER (total/outstanding/overdue/paid, dari
// tabel `invoices` seluruh proyek klien ini) — bukan kolom tersimpan.
//
// Sama seperti halaman list: tak ada tombol edit/nonaktifkan (PM tak punya
// `clients:manage`).
// ============================================================================

import { useParams } from "next/navigation";
import { Users, AlertCircle, Building2, Landmark } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah as fmtRupiah } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespDetailKlien, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

export default function PmKlienDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, memuat, galat } = useData<RespDetailKlien>(id ? `/api/v1/clients/${id}` : null);

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat) {
    return (
      <EmptyState icon={AlertCircle} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />
    );
  }
  if (!data) {
    return (
      <EmptyState icon={Users} judul="Klien tidak ditemukan" deskripsi="Klien ini mungkin sudah dihapus." />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {data.client.company_name ?? data.client.contact_person}
      </h1>

      <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Building2 size={16} color="var(--text-secondary)" aria-hidden="true" />
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{data.client.contact_person}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {data.client.phone}{data.client.email ? ` · ${data.client.email}` : ""}
        </div>
        {data.client.address && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{data.client.address}</div>
        )}
        {!data.client.is_active && (
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 6 }}>Nonaktif</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Proyek</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{data.summary.total_projects}</div>
        </div>
        <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Nilai Kontrak</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{fmtRupiah(data.summary.total_contract_value)}</div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Landmark size={16} color="var(--navy)" aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Ringkasan Invoice</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>Terbayar</span>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.summary.invoice_paid)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>Belum Terbayar</span>
          <span style={{ fontWeight: 600, color: data.summary.invoice_outstanding > 0 ? "var(--on-warning-bg)" : "var(--text-primary)" }}>
            {fmtRupiah(data.summary.invoice_outstanding)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>Lewat Tempo</span>
          <span style={{ fontWeight: 600, color: data.summary.invoice_overdue > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {fmtRupiah(data.summary.invoice_overdue)}
          </span>
        </div>
      </div>

      {data.projects.length === 0 && (
        <EmptyState icon={Users} judul="Belum ada proyek" deskripsi="Klien ini belum punya proyek tercatat." />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.projects.map((p) => (
          <div
            key={p.id}
            style={{ display: "flex", justifyContent: "space-between", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}
          >
            <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{p.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.progress_pct ?? 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

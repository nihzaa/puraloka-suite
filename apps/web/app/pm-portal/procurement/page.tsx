"use client";

// ============================================================================
// Procurement — versi PM, ringkasan Material Request & Purchase Order.
//
// Modul procurement penuh (buat MR/PO, kelola supplier, konfirmasi terima
// barang) adalah alur admin/tim procurement — di luar 4 sub-modul yang
// diminta Task 10 (K3/Punch/Inspeksi/Submittal). Halaman ini memberi PM
// PANDANGAN status procurement proyeknya, BACA SAJA.
//
// Kedua endpoint hanya `authenticate` (bukan requirePermission khusus) —
// scope tenant + proyek otomatis lewat `proyekBolehDibaca(request, project_id)`
// (diverifikasi ke `procurement.ts:274`, `:871`).
// ============================================================================

import { useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useData } from "@/lib/data-cache";
import SegmentedTab from "@/components/portal/SegmentedTab";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

interface MaterialRequest {
  id: string; mr_number: string | null; status: string | null;
  request_date: string | null; needed_date: string | null;
  requested_by: { id: string; name: string } | null;
}
interface RespMr { material_requests: MaterialRequest[] }

interface PurchaseOrder {
  id: string; po_number: string | null; status: string | null;
  order_date: string | null; expected_delivery_date: string | null;
  total_amount: number | string | null;
  supplier: { id: string; name: string; phone: string | null } | null;
}
interface RespPo { purchase_orders: PurchaseOrder[] }

const LABEL_MR: Record<string, string> = {
  draft: "Draft", diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak", selesai: "Selesai",
};
const VARIAN_MR: Record<string, VarianStatus> = {
  draft: "netral", diajukan: "pending", disetujui: "approved", ditolak: "rejected", selesai: "approved",
};

const LABEL_PO: Record<string, string> = {
  draft: "Draft", sent: "Terkirim", partial: "Sebagian Diterima", received: "Diterima", cancelled: "Dibatalkan",
};
const VARIAN_PO: Record<string, VarianStatus> = {
  draft: "netral", sent: "pending", partial: "pending", received: "approved", cancelled: "rejected",
};

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmProcurementPage() {
  const [tab, setTab] = useState<"mr" | "po">("mr");
  const [proyekId, setProyekId] = useState("");

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlMr = proyekAktif ? `/api/v1/procurement/material-requests?project_id=${proyekAktif}` : null;
  const { data: dataMr, memuat: memuatMr, galat: galatMr } = useData<RespMr>(tab === "mr" ? urlMr : null);

  const urlPo = proyekAktif ? `/api/v1/procurement/purchase-orders?project_id=${proyekAktif}` : null;
  const { data: dataPo, memuat: memuatPo, galat: galatPo } = useData<RespPo>(tab === "po" ? urlPo : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Procurement
      </h1>

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

      <SegmentedTab
        opsi={[{ value: "mr", label: "Material Request" }, { value: "po", label: "Purchase Order" }]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {!proyekAktif && <EmptyState icon={ShoppingCart} judul="Pilih proyek" deskripsi="Procurement tercatat per proyek." />}

      {proyekAktif && tab === "mr" && (
        <>
          {memuatMr && <SkeletonCard tinggi={80} />}
          {galatMr && <EmptyState icon={ShoppingCart} judul="Gagal memuat MR" deskripsi={pesanGalat(galatMr as GalatApi, "Coba muat ulang.")} />}
          {!memuatMr && !galatMr && (dataMr?.material_requests?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Material Request" deskripsi="Permintaan material proyek ini akan muncul di sini." />
          )}
          {!memuatMr && (dataMr?.material_requests ?? []).map((mr) => (
            <div key={mr.id} style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{mr.mr_number ?? "MR"}</span>
                <StatusBadge status={VARIAN_MR[mr.status ?? ""] ?? "netral"} label={LABEL_MR[mr.status ?? ""] ?? mr.status ?? "—"} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {mr.request_date ?? "—"}{mr.needed_date ? ` · dibutuhkan ${mr.needed_date}` : ""}
              </div>
              {mr.requested_by?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Diminta: {mr.requested_by.name}</div>}
            </div>
          ))}
        </>
      )}

      {proyekAktif && tab === "po" && (
        <>
          {memuatPo && <SkeletonCard tinggi={80} />}
          {galatPo && <EmptyState icon={ShoppingCart} judul="Gagal memuat PO" deskripsi={pesanGalat(galatPo as GalatApi, "Coba muat ulang.")} />}
          {!memuatPo && !galatPo && (dataPo?.purchase_orders?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Purchase Order" deskripsi="PO ke supplier untuk proyek ini akan muncul di sini." />
          )}
          {!memuatPo && (dataPo?.purchase_orders ?? []).map((po) => (
            <div key={po.id} style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{po.po_number ?? "PO"}</span>
                <StatusBadge status={VARIAN_PO[po.status ?? ""] ?? "netral"} label={LABEL_PO[po.status ?? ""] ?? po.status ?? "—"} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {po.supplier?.name ?? "—"} · {fmtRupiah(po.total_amount)}
              </div>
              {po.expected_delivery_date && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Estimasi kirim: {po.expected_delivery_date}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

"use client";

// ============================================================================
// Detail Material Request — Portal PM (Task 24 Step 3).
//
// Approve/reject TIDAK ada di halaman ini secara sengaja — MR berstatus
// `submitted` diarahkan lewat banner ke `/pm-portal/approval` (Task 24
// Step 5 menambahkan `material_request` ke inbox terpusat). Endpoint
// approve (`PATCH .../approve`) memang bisa dipanggil siapa saja yang lolos
// `evaluateEntityApproval` — diukur LIVE 2026-08-21: rantai `material_request`
// hanya SATU langkah, `required_permission = procurement:mr:manage`, dan PM
// memegangnya. Tapi keputusan produk (Step 5 brief) tetap satu pintu approval
// di inbox, bukan tombol duplikat di sini — supaya SoD (pengaju tak boleh
// setujui sendiri) dan pesan "naik level" hanya hidup di SATU tempat.
// ============================================================================

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespMrDetail, RespQuotaCheck, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
  partially_ordered: "Sebagian Dipesan", fully_ordered: "Selesai Dipesan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected",
  partially_ordered: "info", fully_ordered: "approved",
};

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmMrDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const url = `/api/v1/procurement/material-requests/${id}`;
  const { data, memuat, galat } = useData<RespMrDetail>(url);
  const mr = data?.material_request;

  const [cekKuota, setCekKuota] = useState(false);
  const { data: dataKuota, memuat: memuatKuota } = useData<RespQuotaCheck>(cekKuota ? `/api/v1/procurement/material-requests/${id}/quota-check` : null);

  // Galat AKSI (submit) terpisah dari `galat` (galat MUAT di atas) — dua
  // state berbeda untuk dua kegagalan berbeda (CLAUDE.md, penjaga
  // `uji-galat-muat-terpisah.mjs`): jaringan putus saat memuat halaman tak
  // boleh tertimpa senyap oleh percobaan submit.
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  async function ajukan() {
    setMengirim(true); setGalatAksi(null);
    try {
      await api.patch(`/api/v1/procurement/material-requests/${id}/submit`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengajukan MR"));
    } finally { setMengirim(false); }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !mr) {
    return <EmptyState icon={ClipboardList} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "MR tidak ditemukan.")} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{mr.mr_number ?? "MR"}</h1>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{mr.project?.name ?? "—"}</div>
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Status</span>
          <StatusBadge status={VARIAN_STATUS[mr.status] ?? "netral"} label={LABEL_STATUS[mr.status] ?? mr.status} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Diminta {mr.requested_by?.name ?? "—"}{mr.needed_date ? ` · dibutuhkan ${mr.needed_date}` : ""}
        </div>
        {mr.notes && <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{mr.notes}</div>}
      </div>

      {mr.status === "submitted" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14, background: "var(--info-bg)" }}>
          <ArrowRight size={18} color="var(--on-info-bg)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--on-info-bg)" }}>
            MR ini menunggu persetujuan. Setujui/tolak dari{" "}
            <Link href="/pm-portal/approval" style={{ color: "var(--on-info-bg)", fontWeight: 700 }}>halaman Approval</Link>.
          </div>
        </div>
      )}

      {galatAksi && <div role="alert" style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}>{galatAksi}</div>}

      {mr.status === "draft" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setCekKuota(true)}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={16} aria-hidden="true" /> Cek Kuota RAB
          </button>
          <button type="button" onClick={ajukan} disabled={mengirim || mr.items.length === 0}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mengajukan…" : "Ajukan"}
          </button>
        </div>
      )}

      {cekKuota && (
        <div style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          {memuatKuota && <SkeletonCard tinggi={60} />}
          {dataKuota && dataKuota.lolos && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success)" }}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Semua item dalam batas kuota RAB.</span>
            </div>
          )}
          {dataKuota && !dataKuota.lolos && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>Melebihi kuota RAB</div>
              {/* Field PERSIS dari `BarisPelanggaran` backend (koreksi review
                  2026-08-21) — TIDAK ADA field `sisa`; yang ada `total` (sudah
                  dipesan + diminta sekarang) dibandingkan `rab_quantity`
                  (batas), dan `kelebihan` = selisihnya. */}
              {dataKuota.pelanggaran.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {p.material_name}: diminta {p.diminta} {p.unit ?? ""} (total dipesan {p.total} dari kuota {p.rab_quantity} {p.unit ?? ""})
                  — kelebihan {p.kelebihan} {p.unit ?? ""}
                </div>
              ))}
              {dataKuota.tanpa_kuota.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {dataKuota.tanpa_kuota.length} material diminta tanpa baris kuota RAB — tak diblokir, tapi belum terpantau.
                </div>
              )}
              {!dataKuota.bisa_override && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Anda tidak punya wewenang melampaui kuota RAB — kurangi volume atau minta admin.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item ({mr.items.length})</div>
      {mr.items.map((it) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{it.material?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Diminta {it.qty_requested} {it.unit}{it.qty_ordered != null ? ` · dipesan ${it.qty_ordered}` : ""}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(Number(it.unit_price_est ?? 0) * Number(it.qty_requested))}</div>
        </div>
      ))}
    </div>
  );
}

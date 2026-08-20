"use client";

// ============================================================================
// Keuangan — Kasbon, versi PM, direstyle ke token portal (Task 10 Step 4).
// Logika (fetch, approve/reject, toast) TIDAK berubah — hanya `C.*` diganti
// token CSS, dan tombol aksi disabled memakai swap warna solid (bukan
// opacity).
// ============================================================================

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import EmptyState from "@/components/portal/EmptyState";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak", settled: "Lunas",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  pending: "pending", approved: "approved", rejected: "rejected", settled: "netral",
};

const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
  pembelian_alat: "Beli Alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

const FILTER_OPSI = ["all", "pending", "approved", "rejected", "settled"];

export default function PmKeuanganPage() {
  const [filter, setFilter] = useState("all");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const { data, memuat: loading, muatUlang } = useData<{ kasbons: any[] }>("/api/v1/finance/kasbons");
  const kasbons = data?.kasbons ?? [];
  const loadData = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  async function handleAction(id: string, action: "approved" | "rejected") {
    setActioningId(id);
    try {
      await api.patch(`/api/v1/kasbons/${id}/status`, { status: action });
      showToast(action === "approved" ? "Kasbon disetujui" : "Kasbon ditolak");
      await loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? "Gagal", false);
    } finally {
      setActioningId(null);
    }
  }

  const filtered = filter === "all" ? kasbons : kasbons.filter((k) => k.status === filter);
  const pendingCount = kasbons.filter((k) => k.status === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Keuangan — Kasbon
      </h1>

      {!loading && pendingCount > 0 && (
        <div role="status" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} color="var(--on-warning-bg)" aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--on-warning-bg)" }}>{pendingCount} kasbon menunggu persetujuan Anda</span>
        </div>
      )}

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

      {loading && <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Memuat kasbon…</div>}
      {!loading && filtered.length === 0 && (
        <EmptyState icon={AlertCircle} judul="Tidak ada kasbon" deskripsi="Kasbon dengan status ini belum ada." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((k) => {
          const isPending = k.status === "pending";
          const aksiNonaktif = actioningId === k.id;
          return (
            <div key={k.id} style={{ background: "var(--surface)", borderRadius: 16, padding: 16, border: `1px solid ${isPending ? "var(--warning-border)" : "var(--border)"}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmt(k.amount)}</span>
                    <StatusBadge status={VARIAN_STATUS[k.status ?? ""] ?? "netral"} label={LABEL_STATUS[k.status ?? ""] ?? k.status ?? "—"} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {k.work_scopes?.mandor_assignments?.mandor?.name ?? "Mandor"} · {k.work_scopes?.scope_name ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {k.work_scopes?.mandor_assignments?.projects?.name ?? "—"} · {fmtDate(k.kasbon_date)}
                  </div>
                  {k.notes && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>{k.notes}</div>}
                  {PURPOSE_LABEL[k.purpose] && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Keperluan: {PURPOSE_LABEL[k.purpose]}</div>}
                </div>
                {isPending && (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleAction(k.id, "rejected")}
                      disabled={aksiNonaktif}
                      style={aksiNonaktif ? {
                        display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8,
                        border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "var(--text-muted)",
                        cursor: "default", fontSize: 12, fontWeight: 600,
                      } : {
                        display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8,
                        border: "1px solid var(--danger-border)", background: "var(--surface)", color: "var(--danger)",
                        cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <XCircle size={14} aria-hidden="true" /> Tolak
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(k.id, "approved")}
                      disabled={aksiNonaktif}
                      style={aksiNonaktif ? {
                        display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8,
                        border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "var(--text-muted)",
                        cursor: "default", fontSize: 12, fontWeight: 600,
                      } : {
                        display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8,
                        border: "none", background: "var(--success)", color: "var(--on-success-bg)",
                        cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <CheckCircle size={14} aria-hidden="true" /> Setuju
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && typeof window !== "undefined" && createPortal(
        <div role="status" style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000,
          padding: "12px 20px", borderRadius: 12,
          background: toast.ok ? "var(--success)" : "var(--danger)",
          color: toast.ok ? "var(--on-success-bg)" : "var(--on-danger-bg)",
          fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
        }}>
          {toast.msg}
        </div>,
        document.body
      )}
    </div>
  );
}

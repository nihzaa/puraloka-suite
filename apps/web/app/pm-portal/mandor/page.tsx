"use client";

// ============================================================================
// Mandor & Laporan Upah — versi PM, direstyle ke token portal (Task 10
// Step 4). Logika (fetch, approve/reject, expand/collapse, toast) TIDAK
// berubah — hanya `C.*` (lib/warna-ui, pola pra-Task 3/5) diganti token CSS,
// dan tombol aksi disabled memakai swap warna solid (bukan opacity), sesuai
// aturan mengikat CLAUDE.md soal kontras.
// ============================================================================

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { CheckCircle, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Tabel } from "@/components/dasar";
import EmptyState from "@/components/portal/EmptyState";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";

/** Satu baris upah pekerja di dalam laporan mingguan. */
interface WageItem {
  id: string;
  worker?: { name?: string } | null;
  days_worked?: number | null;
  daily_rate: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Draft", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak", paid: "Dibayar",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected", paid: "approved",
};

export default function PmMandorPage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const { data: dataSummary, memuat: memuatSummary, galat: galatSummary, muatUlang: muatUlangSummary } =
    useData<{ summary: any[] }>("/api/v1/mandor/summary");
  const { data: dataReports, memuat: memuatReports, galat: galatReports, muatUlang: muatUlangReports } =
    useData<{ reports: any[] }>("/api/v1/mandor/wage-reports");

  const loading = memuatSummary || memuatReports;
  const galatMuat = galatSummary ?? galatReports;
  const summary = dataSummary?.summary ?? [];
  const reports = dataReports?.reports ?? [];

  const loadData = useCallback(async () => {
    await Promise.all([muatUlangSummary(), muatUlangReports()]);
  }, [muatUlangSummary, muatUlangReports]);

  async function handleWageAction(id: string, action: "approved" | "rejected") {
    setActioningId(id);
    try {
      await api.patch(`/api/v1/mandor/wage-reports/${id}/status`, { status: action });
      showToast(action === "approved" ? "Laporan disetujui" : "Laporan ditolak");
      await loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? "Gagal", false);
    } finally {
      setActioningId(null);
    }
  }

  const pendingReports = reports.filter((r) => r.status === "submitted");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Mandor &amp; Laporan Upah
      </h1>

      {!loading && galatMuat && (
        <div role="alert" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "var(--on-danger-bg)" }}>
          Gagal memuat data mandor/laporan upah. Coba muat ulang halaman.
        </div>
      )}

      {!loading && summary.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Ringkasan Mandor</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {summary.map((m) => (
              <div key={m.mandor_id} style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{m.mandor_name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Scope aktif</span>
                  <span style={{ color: "var(--navy)", fontWeight: 600 }}>{m.active_scopes ?? 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Kasbon aktif</span>
                  <span style={{ color: m.pending_kasbons > 0 ? "var(--warning)" : "var(--text-secondary)", fontWeight: 600 }}>{m.pending_kasbons ?? 0}</span>
                </div>
                {m.total_kasbon_amount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>Total kasbon</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmt(m.total_kasbon_amount)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && pendingReports.length > 0 && (
        <div role="status" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} color="var(--on-warning-bg)" aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--on-warning-bg)" }}>{pendingReports.length} laporan upah menunggu persetujuan</span>
        </div>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Laporan Upah Mingguan</h2>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>Memuat laporan…</div>}
        {!loading && reports.length === 0 && (
          <EmptyState icon={AlertCircle} judul="Belum ada laporan upah" deskripsi="Laporan upah mingguan mandor akan muncul di sini." />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reports.map((r) => {
            const isOpen = expanded[r.id] ?? false;
            const isPending = r.status === "submitted";
            const aksiNonaktif = actioningId === r.id;
            return (
              <div key={r.id} style={{ background: "var(--surface)", borderRadius: 14, border: `1px solid ${isPending ? "var(--warning-border)" : "var(--border)"}`, overflow: "hidden" }}>
                <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                    style={{ flex: 1, cursor: "pointer", background: "none", border: "none", font: "inherit", color: "inherit", textAlign: "left", padding: 0 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtDate(r.week_start)} – {fmtDate(r.week_end)}</span>
                      <StatusBadge status={VARIAN_STATUS[r.status ?? ""] ?? "netral"} label={LABEL_STATUS[r.status ?? ""] ?? r.status ?? "—"} />
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
                      {r.assignment?.mandor?.name ?? "—"} · {r.assignment?.project?.name ?? "—"} · <strong style={{ color: "var(--navy)" }}>{fmt(r.total_amount ?? 0)}</strong>
                    </span>
                  </button>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {isPending && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleWageAction(r.id, "rejected")}
                          disabled={aksiNonaktif}
                          style={aksiNonaktif ? {
                            display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8,
                            border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "var(--text-muted)",
                            cursor: "default", fontSize: 11, fontWeight: 600,
                          } : {
                            display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8,
                            border: "1px solid var(--danger-border)", background: "var(--surface)", color: "var(--danger)",
                            cursor: "pointer", fontSize: 11, fontWeight: 600,
                          }}
                        >
                          <XCircle size={13} aria-hidden="true" /> Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWageAction(r.id, "approved")}
                          disabled={aksiNonaktif}
                          style={aksiNonaktif ? {
                            display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8,
                            border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "var(--text-muted)",
                            cursor: "default", fontSize: 11, fontWeight: 600,
                          } : {
                            display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8,
                            border: "none", background: "var(--success)", color: "var(--on-success-bg)",
                            cursor: "pointer", fontSize: 11, fontWeight: 600,
                          }}
                        >
                          <CheckCircle size={13} aria-hidden="true" /> Setuju
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={isOpen ? "Tutup rincian" : "Buka rincian"}
                      onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4, display: "flex" }}
                    >
                      {isOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                {isOpen && (r.wage_items ?? []).length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: 14 }}>
                    <Tabel<WageItem>
                      berpermukaan
                      caption="Rincian upah per pekerja pada laporan ini: jumlah hari kerja, upah per hari, dan total yang diterima masing-masing."
                      data={r.wage_items as WageItem[]}
                      kunciBaris={(wi) => wi.id}
                      kolom={[
                        { kunci: "pekerja", judul: "Pekerja", kepalaBaris: true, render: (wi) => wi.worker?.name ?? "—" },
                        { kunci: "hari", judul: "Hari", rata: "kanan", render: (wi) => wi.days_worked ?? 1 },
                        { kunci: "rate", judul: "Rate", rata: "kanan", render: (wi) => fmt(wi.daily_rate) },
                        { kunci: "total", judul: "Total", rata: "kanan", render: (wi) => fmt(wi.daily_rate * (wi.days_worked ?? 1)) },
                      ]}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

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

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { Tabel } from "@/components/dasar";

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

const REPORT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: C.mid,    bg: "var(--surface-hover)"   },
  submitted: { label: "Diajukan",  color: C.yellow, bg: C.yellowBg  },
  approved:  { label: "Disetujui", color: C.green,  bg: C.greenBg   },
  rejected:  { label: "Ditolak",   color: C.red,    bg: C.redBg     },
  paid:      { label: "Dibayar",   color: C.navy,   bg: C.navyLight },
};

export default function PMMandorPage() {
  const [summary, setSummary] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function loadData() {
    return Promise.all([
      api.get("/api/v1/mandor/summary"),
      api.get("/api/v1/mandor/wage-reports"),
    ]).then(([sRes, rRes]) => {
      setSummary(sRes.data?.summary ?? []);
      setReports(rRes.data?.reports ?? []);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function handleWageAction(id: string, action: "approved" | "rejected") {
    setActioningId(id);
    try {
      await api.patch(`/api/v1/mandor/wage-reports/${id}/status`, { status: action });
      showToast(action === "approved" ? "Laporan disetujui" : "Laporan ditolak");
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? "Gagal", false);
    } finally {
      setActioningId(null);
    }
  }

  const pendingReports = reports.filter((r) => r.status === "submitted");

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 20px" }}>Mandor & Laporan Upah</h1>

      {/* Mandor summary */}
      {!loading && summary.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 12px" }}>Ringkasan Mandor</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {summary.map((m) => (
              <div key={m.mandor_id} style={{ background: C.surface, borderRadius: 10, padding: "12px 16px", border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{m.mandor_name}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: C.mid }}>Scope aktif</span>
                    <span style={{ color: C.navy, fontWeight: 600 }}>{m.active_scopes ?? 0}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: C.mid }}>Kasbon aktif</span>
                    <span style={{ color: m.pending_kasbons > 0 ? C.yellow : C.mid, fontWeight: 600 }}>{m.pending_kasbons ?? 0}</span>
                  </div>
                  {m.total_kasbon_amount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: C.mid }}>Total kasbon</span>
                      <span style={{ color: C.text, fontWeight: 600 }}>{fmt(m.total_kasbon_amount)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending wage reports alert */}
      {!loading && pendingReports.length > 0 && (
        <div style={{ background: C.yellowBg, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} color={C.yellow} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.yellow }}>{pendingReports.length} laporan upah menunggu persetujuan</span>
        </div>
      )}

      {/* Wage reports */}
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 12px" }}>Laporan Upah Mingguan</h2>
        {loading && <div style={{ textAlign: "center", padding: 40, color: C.mid }}>Memuat laporan...</div>}
        {!loading && reports.length === 0 && (
          <div style={{ background: C.surface, borderRadius: 10, padding: 40, border: `1px solid ${C.border}`, textAlign: "center" }}>
            <AlertCircle size={28} color={C.muted} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: C.mid }}>Belum ada laporan upah</div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reports.map((r) => {
            const meta = REPORT_STATUS[r.status] ?? REPORT_STATUS.draft;
            const isOpen = expanded[r.id] ?? false;
            const isPending = r.status === "submitted";
            return (
              <div key={r.id} style={{ background: C.surface, borderRadius: 10, border: `1px solid ${isPending ? C.yellow + "40" : C.border}`, overflow: "hidden", boxShadow: "var(--naik-1)" }}>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  {/* `<button>`, bukan `<div onClick>`: ini pemicu buka-tutup
                      rincian laporan upah. Sebagai div, pemakai keyboard tak
                      bisa membukanya sama sekali — rinciannya jadi tak
                      terjangkau, bukan sekadar tak nyaman. `aria-expanded`
                      memberi tahu pembaca layar keadaannya sekarang. */}
                  <button
                    type="button"
                    aria-expanded={!!expanded[r.id]}
                    onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                    style={{
                      flex: 1, cursor: "pointer", background: "none", border: "none",
                      font: "inherit", color: "inherit", textAlign: "left", padding: 0,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(r.week_start)} – {fmtDate(r.week_end)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>{meta.label}</span>
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: C.mid }}>
                      {r.assignment?.mandor?.name ?? "—"} · {r.assignment?.project?.name ?? "—"} · <strong style={{ color: C.navy }}>{fmt(r.total_amount ?? 0)}</strong>
                    </span>
                  </button>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {isPending && (
                      <>
                        <button onClick={() => handleWageAction(r.id, "rejected")} disabled={actioningId === r.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.red}`, background: "var(--surface)", color: C.red, cursor: "pointer", fontSize: 11, fontWeight: 600, opacity: actioningId === r.id ? 0.6 : 1 }}>
                          <XCircle size={13} /> Tolak
                        </button>
                        <button onClick={() => handleWageAction(r.id, "approved")} disabled={actioningId === r.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", cursor: "pointer", fontSize: 11, fontWeight: 600, opacity: actioningId === r.id ? 0.6 : 1 }}>
                          <CheckCircle size={13} /> Setuju
                        </button>
                      </>
                    )}
                    <button onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))} style={{ background: "none", border: "none", cursor: "pointer", color: C.mid, padding: 4 }}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>
                {isOpen && (r.wage_items ?? []).length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px" }}>
                    {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption,
                        scope="row", tabular-nums, dan overflow-x dijamin
                        komponen. Pembungkus overflow-x adalah tambahan nyata
                        di sini: versi mentahnya tak punya, jadi tabel empat
                        kolom ini mendorong seluruh halaman ke samping pada
                        layar ponsel — dan halaman PM-portal memang dibuka
                        dari HP. */}
                    <Tabel<WageItem>
                      caption="Rincian upah per pekerja pada laporan ini: jumlah hari kerja, upah per hari, dan total yang diterima masing-masing."
                      data={r.wage_items as WageItem[]}
                      kunciBaris={(wi) => wi.id}
                      kolom={[
                        { kunci: "pekerja", judul: "Pekerja", kepalaBaris: true,
                          render: (wi) => wi.worker?.name ?? "—" },
                        { kunci: "hari", judul: "Hari", rata: "kanan",
                          render: (wi) => wi.days_worked ?? 1 },
                        { kunci: "rate", judul: "Rate", rata: "kanan",
                          render: (wi) => fmt(wi.daily_rate) },
                        { kunci: "total", judul: "Total", rata: "kanan",
                          render: (wi) => fmt(wi.daily_rate * (wi.days_worked ?? 1)) },
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
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000, padding: "12px 20px", borderRadius: 10, background: toast.ok ? "var(--success)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 500, boxShadow: "var(--naik-2)", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>,
        document.body
      )}
    </div>
  );
}

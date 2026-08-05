"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

import { C } from "@/lib/warna-ui";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Menunggu",  color: C.yellow, bg: C.yellowBg },
  approved: { label: "Disetujui", color: C.green,  bg: C.greenBg  },
  rejected: { label: "Ditolak",   color: C.red,    bg: C.redBg    },
  settled:  { label: "Lunas",     color: C.mid,    bg: "var(--surface-hover)"  },
};

const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
  pembelian_alat: "Beli Alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

export default function PMKeuanganPage() {
  const [kasbons, setKasbons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function loadData() {
    return api.get("/api/v1/finance/kasbons").then((res) => {
      setKasbons(res.data?.kasbons ?? []);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function handleAction(id: string, action: "approved" | "rejected") {
    setActioningId(id);
    try {
      await api.patch(`/api/v1/kasbons/${id}/status`, { status: action });
      showToast(action === "approved" ? "Kasbon disetujui" : "Kasbon ditolak");
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? "Gagal", false);
    } finally {
      setActioningId(null);
    }
  }

  const filtered = filter === "all" ? kasbons : kasbons.filter((k) => k.status === filter);
  const pendingCount = kasbons.filter((k) => k.status === "pending").length;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 16px" }}>Keuangan — Kasbon</h1>

      {!loading && pendingCount > 0 && (
        <div style={{ background: C.yellowBg, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} color={C.yellow} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.yellow }}>{pendingCount} kasbon menunggu persetujuan Anda</span>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "pending", "approved", "rejected", "settled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1px solid ${filter === s ? C.navy : C.border}`, background: filter === s ? C.navyLight : "var(--surface)", color: filter === s ? C.navy : C.mid }}
          >
            {s === "all" ? "Semua" : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat kasbon...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 10, padding: 40, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <AlertCircle size={28} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: C.mid }}>Tidak ada kasbon</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((k) => {
          const meta = STATUS_META[k.status] ?? STATUS_META.pending;
          const isPending = k.status === "pending";
          return (
            <div key={k.id} style={{ background: C.surface, borderRadius: 10, padding: "16px 20px", border: `1px solid ${isPending ? C.yellow + "40" : C.border}`, boxShadow: "var(--naik-1)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmt(k.amount)}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.mid }}>
                    {k.work_scopes?.mandor_assignments?.mandor?.name ?? "Mandor"} · {k.work_scopes?.scope_name ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: C.mid }}>
                    {k.work_scopes?.mandor_assignments?.projects?.name ?? "—"} · {fmtDate(k.kasbon_date)}
                  </div>
                  {k.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>{k.notes}</div>}
                  {PURPOSE_LABEL[k.purpose] && <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>Keperluan: {PURPOSE_LABEL[k.purpose]}</div>}
                </div>
                {isPending && (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleAction(k.id, "rejected")}
                      disabled={actioningId === k.id}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.red}`, background: "var(--surface)", color: C.red, cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: actioningId === k.id ? 0.6 : 1 }}
                    >
                      <XCircle size={14} />
                      Tolak
                    </button>
                    <button
                      onClick={() => handleAction(k.id, "approved")}
                      disabled={actioningId === k.id}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: actioningId === k.id ? 0.6 : 1 }}
                    >
                      <CheckCircle size={14} />
                      Setuju
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && typeof window !== "undefined" && createPortal(
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000, padding: "12px 20px", borderRadius: 10, background: toast.ok ? "var(--success)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 500, boxShadow: "var(--naik-2)", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>,
        document.body
      )}
    </div>
  );
}

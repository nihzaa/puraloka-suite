"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Wallet, FileText, TrendingUp, CheckCircle } from "lucide-react";

import { C } from "@/lib/warna-ui";

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

type PaymentItem = {
  id: string;
  type: "upah" | "progress" | "settlement";
  amount: number;
  date: string | null;
  label: string;
  scopeName: string;
  projectName: string;
  status: string;
};

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  upah:       { label: "Upah Harian",  icon: <FileText size={14} />,    color: C.navy,   bg: C.navyLight },
  progress:   { label: "Progress %",   icon: <TrendingUp size={14} />,  color: C.green,  bg: C.greenBg   },
  settlement: { label: "Settlement",   icon: <CheckCircle size={14} />, color: C.purple, bg: C.purpleBg  },
};

const FILTER_OPTIONS = [
  { value: "all",        label: "Semua" },
  { value: "upah",       label: "Upah Harian" },
  { value: "progress",   label: "Progress %" },
  { value: "settlement", label: "Settlement" },
] as const;

export default function RiwayatPembayaranPage() {
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upah" | "progress" | "settlement">("all");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [wRes, pRes, bRes] = await Promise.all([
        api.get("/api/v1/mandor/wage-reports"),
        api.get("/api/v1/mandor/progress-payments"),
        api.get("/api/v1/mandor/borongan-settlements").catch(() => ({ data: { settlements: [] } })),
      ]);

      const combined: PaymentItem[] = [];

      // Laporan upah yang sudah dibayar
      const reports: any[] = wRes.data?.reports ?? [];
      for (const r of reports) {
        if (r.status === "paid" || r.status === "approved") {
          combined.push({
            id: `upah_${r.id}`,
            type: "upah",
            amount: r.net_amount ?? 0,
            date: r.paid_at ?? r.week_end,
            label: `Minggu ${fmtDate(r.week_start)} – ${fmtDate(r.week_end)}`,
            scopeName: r.scope?.scope_name ?? "—",
            projectName: r.project?.name ?? "—",
            status: r.status,
          });
        }
      }

      // Progress payments yang sudah disetujui
      const progressPayments: any[] = pRes.data?.payments ?? [];
      for (const p of progressPayments) {
        if (p.status === "approved") {
          combined.push({
            id: `progress_${p.id}`,
            type: "progress",
            amount: p.gross_payment ?? 0,
            date: p.updated_at ?? p.created_at,
            label: `Progress ${p.pct_done}%`,
            scopeName: p.work_scope?.scope_name ?? "—",
            projectName: p.project?.name ?? p.work_scope?.project?.name ?? "—",
            status: p.status,
          });
        }
      }

      // Settlement borongan
      const settlements: any[] = bRes.data?.settlements ?? [];
      for (const s of settlements) {
        combined.push({
          id: `settlement_${s.id}`,
          type: "settlement",
          amount: s.net_payment ?? 0,
          date: s.created_at,
          label: "Settlement Borongan",
          scopeName: s.work_scope?.scope_name ?? "—",
          projectName: s.work_scope?.project?.name ?? "—",
          status: "settled",
        });
      }

      // Urutkan terbaru dulu
      combined.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });

      setItems(combined);
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);
  const totalReceived = filtered.reduce((s, i) => s + i.amount, 0);

  // Group by month
  const byMonth: Record<string, PaymentItem[]> = {};
  filtered.forEach((item) => {
    const key = item.date
      ? new Date(item.date).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
      : "Tanggal tidak diketahui";
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(item);
  });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Riwayat Pembayaran</h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>Semua pembayaran yang telah diterima</p>
      </div>

      {/* Summary card */}
      {!loading && items.length > 0 && (
        <div style={{
          background: `linear-gradient(135deg, ${C.navy} 0%, var(--aksen-terang) 100%)`,
          borderRadius: 14, padding: "18px 22px", marginBottom: 20, color: "var(--surface)",
        }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
            Total Diterima {filter === "all" ? "Semua" : TYPE_META[filter]?.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtRp(totalReceived)}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{filtered.length} transaksi</div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTER_OPTIONS.map((opt) => (
          <button key={opt.value} onClick={() => setFilter(opt.value)} style={{
            padding: "6px 14px", borderRadius: 20,
            border: `1px solid ${filter === opt.value ? C.navy : C.border}`,
            background: filter === opt.value ? C.navyLight : "var(--surface)",
            color: filter === opt.value ? C.navy : C.mid,
            fontSize: 12, fontWeight: filter === opt.value ? 600 : 400, cursor: "pointer",
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat riwayat...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{
          background: C.surface, borderRadius: 12, padding: 60, border: `1px solid ${C.border}`,
          textAlign: "center",
        }}>
          <Wallet size={36} color={C.muted} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Belum ada riwayat pembayaran</div>
          <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
            {filter === "all"
              ? "Pembayaran yang sudah diproses akan muncul di sini"
              : `Belum ada pembayaran tipe "${TYPE_META[filter]?.label}"`}
          </div>
        </div>
      )}

      {/* Timeline per bulan */}
      {!loading && Object.keys(byMonth).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {Object.entries(byMonth).map(([month, monthItems]) => {
            const monthTotal = monthItems.reduce((s, i) => s + i.amount, 0);
            return (
              <div key={month}>
                {/* Month header */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: 8, padding: "0 4px",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{month}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>{fmtRp(monthTotal)}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {monthItems.map((item) => {
                    const meta = TYPE_META[item.type];
                    return (
                      <div key={item.id} style={{
                        background: C.surface, borderRadius: 12, padding: "14px 16px",
                        border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        display: "flex", alignItems: "center", gap: 14,
                      }}>
                        {/* Type icon */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: meta.bg, color: meta.color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {meta.icon}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.scopeName}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 20,
                              color: meta.color, background: meta.bg,
                            }}>
                              {meta.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: C.mid }}>
                            {item.projectName} · {item.label}
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{fmtDate(item.date)}</div>
                        </div>

                        {/* Amount */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtRp(item.amount)}</div>
                          <div style={{ fontSize: 10, color: C.green, fontWeight: 500, marginTop: 2 }}>Diterima</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

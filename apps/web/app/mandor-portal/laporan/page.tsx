"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

import { C } from "@/lib/warna-ui";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: C.mid,    bg: "var(--surface-hover)"  },
  submitted: { label: "Diajukan",  color: C.yellow, bg: C.yellowBg },
  approved:  { label: "Disetujui", color: C.green,  bg: C.greenBg  },
  rejected:  { label: "Ditolak",   color: C.red,    bg: C.redBg    },
  paid:      { label: "Dibayar",   color: C.navy,   bg: C.navyLight},
};

export default function MandorLaporanPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get("/api/v1/mandor/wage-reports").then((res) => {
      setReports(res.data?.reports ?? []);
    }).finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat laporan upah...</div>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 20px" }}>Laporan Upah Mingguan</h1>

      {reports.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 12, padding: 48, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <AlertCircle size={32} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, color: C.mid }}>Belum ada laporan upah</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reports.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.draft;
          const isOpen = expanded[r.id] ?? false;
          const items: any[] = r.wage_items ?? [];
          const totalWage = items.reduce((s, i) => s + (i.daily_rate * (i.days_worked ?? 1)), 0) || r.total_amount;

          return (
            <div key={r.id} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              {/* Header row */}
              <button
                onClick={() => toggle(r.id)}
                style={{ width: "100%", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                      {fmtDate(r.week_start)} – {fmtDate(r.week_end)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, flexWrap: "wrap" }}>
                    <span>{r.assignment?.project?.name ?? "—"}</span>
                    <span style={{ fontWeight: 600, color: C.navy }}>{fmt(r.total_amount ?? totalWage)}</span>
                    {items.length > 0 && <span>{items.length} pekerja</span>}
                  </div>
                </div>
                {isOpen ? <ChevronUp size={18} color={C.mid} /> : <ChevronDown size={18} color={C.mid} />}
              </button>

              {/* Detail */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px 20px" }}>
                  {r.notes && (
                    <p style={{ fontSize: 13, color: C.mid, margin: "0 0 14px", fontStyle: "italic" }}>{r.notes}</p>
                  )}

                  {items.length > 0 ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--surface-hover)" }}>
                            <th style={{ padding: "6px 10px", textAlign: "left", color: C.mid, fontWeight: 600 }}>Pekerja</th>
                            <th style={{ padding: "6px 10px", textAlign: "right", color: C.mid, fontWeight: 600 }}>Hari Kerja</th>
                            <th style={{ padding: "6px 10px", textAlign: "right", color: C.mid, fontWeight: 600 }}>Rate/Hari</th>
                            <th style={{ padding: "6px 10px", textAlign: "right", color: C.mid, fontWeight: 600 }}>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={{ padding: "8px 10px", color: C.text }}>{item.worker?.name ?? "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", color: C.mid }}>{item.days_worked ?? 1}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", color: C.mid }}>{fmt(item.daily_rate)}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", color: C.text, fontWeight: 600 }}>{fmt(item.daily_rate * (item.days_worked ?? 1))}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: `2px solid ${C.border}`, background: "var(--surface-subtle)" }}>
                            <td colSpan={3} style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: C.text }}>Total</td>
                            <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: C.navy, fontSize: 13 }}>{fmt(r.total_amount ?? totalWage)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: C.mid, textAlign: "center", padding: "12px 0" }}>
                      Total upah: <strong style={{ color: C.navy }}>{fmt(r.total_amount ?? 0)}</strong>
                    </div>
                  )}

                  {r.status === "rejected" && r.notes && (
                    <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.red}20` }}>
                      <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Alasan ditolak:</div>
                      <div style={{ fontSize: 13, color: C.red, marginTop: 2 }}>{r.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

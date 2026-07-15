"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ChevronDown, ChevronUp, AlertCircle, TrendingUp } from "lucide-react";
import Link from "next/link";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
};

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}
function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const SCOPE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: "Aktif",   color: C.green,  bg: C.greenBg  },
  completed: { label: "Selesai", color: C.mid,    bg: "var(--surface-hover)"  },
  on_hold:   { label: "Ditunda", color: C.yellow, bg: C.yellowBg },
  cancelled: { label: "Batal",   color: C.red,    bg: C.redBg    },
};

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: C.border, borderRadius: height, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: height, background: color, width: `${Math.min(100, pct)}%`, transition: "width 0.5s" }} />
    </div>
  );
}

export default function MandorScopePage() {
  const [scopes, setScopes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Coba endpoint my-scopes dulu, fallback ke assignments jika belum ada
    api.get("/api/v1/mandor/my-scopes").then((res) => {
      const list = res.data?.scopes ?? [];
      setScopes(list);
      // Auto-expand scope aktif
      const init: Record<string, boolean> = {};
      list.forEach((s: any) => { if (s.status === "active") init[s.id] = true; });
      setExpanded(init);
    }).catch(() => {
      // Fallback: ambil dari assignments
      api.get("/api/v1/mandor/assignments").then((r) => {
        const asgns = r.data?.assignments ?? [];
        const allScopes = asgns.flatMap((a: any) =>
          (a.work_scopes ?? []).map((s: any) => ({ ...s, project: a.project, assignment_id: a.id, contract_value: s.borongan_value ?? 0, total_kasbon: 0, total_progress_paid: 0, financial_pct: 0, settlement: null }))
        );
        setScopes(allScopes);
        const init: Record<string, boolean> = {};
        allScopes.forEach((s: any) => { if (s.status === "active") init[s.id] = true; });
        setExpanded(init);
      });
    }).finally(() => setLoading(false));
  }, []);

  // Buat tampilan per proyek dengan grouping
  const byProject: Record<string, { projectName: string; scopes: any[] }> = {};
  scopes.forEach((s) => {
    const pid = s.project?.id ?? "unknown";
    if (!byProject[pid]) byProject[pid] = { projectName: s.project?.name ?? "Proyek", scopes: [] };
    byProject[pid].scopes.push(s);
  });

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat scope pekerjaan...</div>;

  if (scopes.length === 0) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", padding: 60 }}>
        <AlertCircle size={36} color={C.muted} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Belum ada scope pekerjaan</div>
        <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>Hubungi admin atau PM untuk penugasan</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 20px" }}>Scope & Progress</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.entries(byProject).map(([pid, { projectName, scopes: projectScopes }]) => {
          const activeCount = projectScopes.filter((s) => s.status === "active").length;
          const groupKey = `group_${pid}`;
          const isGroupOpen = expanded[groupKey] !== false;

          return (
            <div key={pid} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              {/* Project header */}
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [groupKey]: !isGroupOpen }))}
                style={{
                  width: "100%", padding: "16px 20px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{projectName}</div>
                  <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>
                    {projectScopes.length} scope · {activeCount} aktif
                  </div>
                </div>
                {isGroupOpen ? <ChevronUp size={18} color={C.mid} /> : <ChevronDown size={18} color={C.mid} />}
              </button>

              {isGroupOpen && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {projectScopes.map((scope, idx) => {
                    const meta = SCOPE_STATUS[scope.status] ?? SCOPE_STATUS.active;
                    const physicalPct = scope.progress_pct_done ?? 0;
                    const contractValue = scope.contract_value ?? 0;
                    const financialPct = scope.financial_pct ?? 0;
                    const isBorongan = scope.payment_system === "borongan";
                    const isProgressPct = scope.payment_system === "progress_pct";
                    const isExpanded = expanded[scope.id] ?? false;

                    return (
                      <div key={scope.id} style={{
                        borderBottom: idx < projectScopes.length - 1 ? `1px solid ${C.border}` : "none",
                      }}>
                        {/* Scope header — clickable untuk expand items */}
                        <div
                          style={{
                            padding: "16px 20px",
                            background: scope.status === "active" ? "#FAFCFF" : "transparent",
                            cursor: "pointer",
                          }}
                          onClick={() => setExpanded((prev) => ({ ...prev, [scope.id]: !isExpanded }))}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{scope.scope_name}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                                  {meta.label}
                                </span>
                                <span style={{ fontSize: 11, color: C.mid, background: "var(--surface-hover)", padding: "2px 8px", borderRadius: 20 }}>
                                  {({"harian":"Harian","borongan":"Borongan","progress_pct":"Progress %"} as Record<string,string>)[scope.payment_system] ?? scope.payment_system}
                                </span>
                              </div>
                              {contractValue > 0 && (
                                <div style={{ fontSize: 12, color: C.mid }}>Nilai Kontrak: {fmtRp(contractValue)}</div>
                              )}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 22, fontWeight: 700, color: C.navy }}>{physicalPct}%</div>
                              <div style={{ fontSize: 10, color: C.mid }}>fisik</div>
                            </div>
                          </div>

                          {/* Progress bars berdasarkan payment_system */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {/* Semua tipe: progress fisik */}
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: C.mid }}>Progress Fisik</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{physicalPct}%</span>
                              </div>
                              <ProgressBar pct={physicalPct} color={C.navy} />
                            </div>

                            {/* Borongan: juga tampilkan progress finansial */}
                            {isBorongan && contractValue > 0 && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ fontSize: 11, color: C.mid }}>Kasbon / Kontrak</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: C.yellow }}>
                                    {fmtRp(scope.total_kasbon ?? 0)} / {fmtRp(contractValue)} ({financialPct}%)
                                  </span>
                                </div>
                                <ProgressBar pct={financialPct} color={C.yellow} height={4} />
                              </div>
                            )}

                            {/* Progress% : progress dari pembayaran */}
                            {isProgressPct && contractValue > 0 && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ fontSize: 11, color: C.mid }}>Sudah Dibayar</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>
                                    {fmtRp(scope.total_progress_paid ?? 0)} ({Math.min(100, Math.round(((scope.total_progress_paid ?? 0) / contractValue) * 100))}%)
                                  </span>
                                </div>
                                <ProgressBar pct={Math.min(100, ((scope.total_progress_paid ?? 0) / contractValue) * 100)} color={C.green} height={4} />
                              </div>
                            )}
                          </div>

                          {/* Settlement badge jika sudah ada */}
                          {scope.settlement && (
                            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: C.greenBg, border: `1px solid ${C.green}20`, display: "flex", alignItems: "center", gap: 8 }}>
                              <TrendingUp size={14} color={C.green} />
                              <span style={{ fontSize: 12, color: C.green, fontWeight: 500 }}>
                                Settlement selesai · {fmtRp(scope.settlement.net_payment ?? 0)} dibayarkan
                              </span>
                            </div>
                          )}

                          {/* CTA buttons untuk borongan (jika progress >= 90%) */}
                          {isBorongan && physicalPct >= 90 && !scope.settlement && scope.status === "active" && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 11, color: C.yellow, fontWeight: 500 }}>
                                ⚡ Progress {physicalPct}% — bisa ajukan settlement ke admin
                              </div>
                            </div>
                          )}

                          {/* CTA untuk progress% */}
                          {isProgressPct && scope.status === "active" && (
                            <Link href="/mandor-portal/penagihan" onClick={(e) => e.stopPropagation()} style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              marginTop: 10, padding: "6px 12px", borderRadius: 7,
                              border: `1px solid ${C.navy}`, background: C.navyLight,
                              color: C.navy, fontSize: 12, fontWeight: 600, textDecoration: "none",
                            }}>
                              Ajukan Penagihan →
                            </Link>
                          )}
                        </div>

                        {/* Items detail — expand/collapse */}
                        {isExpanded && (
                          <ScopeItemsDetail scopeId={scope.id} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScopeItemsDetail({ scopeId }: { scopeId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/mandor/work-scopes/${scopeId}`).then((res) => {
      setItems(res.data?.items ?? []);
    }).finally(() => setLoading(false));
  }, [scopeId]);

  if (loading) return <div style={{ padding: "12px 20px", color: C.mid, fontSize: 12 }}>Memuat rincian...</div>;
  if (items.length === 0) return <div style={{ padding: "12px 20px", color: C.muted, fontSize: 12 }}>Belum ada item pekerjaan</div>;

  return (
    <div style={{ padding: "0 20px 16px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--surface-subtle)" }}>
            {["Item Pekerjaan", "Sat", "Target", "Realisasi", "%"].map((h) => (
              <th key={h} style={{ padding: "6px 10px", textAlign: h === "Item Pekerjaan" ? "left" : "right", color: C.mid, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const pct = item.volume > 0 ? Math.round((item.volume_done / item.volume) * 100) : 0;
            return (
              <tr key={item.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 10px", color: C.text }}>{item.item_name}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: C.mid }}>{item.unit}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: C.mid }}>{fmt(item.volume ?? 0)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: pct >= 100 ? C.green : C.text }}>{fmt(item.volume_done ?? 0)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: pct >= 100 ? C.green : C.navy }}>{pct}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

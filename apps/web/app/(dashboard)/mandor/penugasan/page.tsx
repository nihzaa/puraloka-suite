"use client";

/**
 * PENUGASAN — mandor mana mengerjakan scope apa, di proyek mana.
 *
 * Dulu tab `penugasan` di `mandor/page.tsx` (baris 1126–1290). Entitas yang
 * dilihat di sini BERBEDA dari laporan upah — penugasan, bukan tagihan — jadi
 * menurut ARAH-VISUAL §6a ia memang halaman, bukan sudut pandang lain atas
 * data yang sama.
 *
 * Perilakunya dipertahankan: pencarian, pencairan borongan, tambah scope,
 * rincian item, dan tautan ke profil mandor.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { dapatDitekan } from "@/lib/dapat-ditekan";
import { HardHat, Plus, ChevronRight, RefreshCw, Search, Phone } from "lucide-react";
import { C } from "@/lib/warna-ui";
import {
  type Assignment, type ScopeDetail, type CashAccount,
  type MandorUser, type SettlementModalState,
  fmt, fmtDate, getPaymentSystemBadge, getProgressColor, toWaLink,
  kartu as card,
} from "../_bersama/tipe";
import {
  AddAssignmentModal, AddScopeModal, ScopeDetailModal,
  AddScopeItemModal, SettlementBoronganModal,
} from "../_bersama/komponen";

export default function PenugasanPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mandorList, setMandorList] = useState<MandorUser[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [showAddScope, setShowAddScope] = useState<string | null>(null);
  const [showScopeItems, setShowScopeItems] = useState<string | null>(null);
  const [showAddScopeItem, setShowAddScopeItem] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<ScopeDetail | null>(null);
  const [loadingScope, setLoadingScope] = useState(false);
  const [settlementModal, setSettlementModal] = useState<SettlementModalState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [asgRes, mandorRes, cashRes] = await Promise.all([
        api.get<{ assignments: Assignment[] }>("/api/v1/mandor/assignments"),
        api.get<{ mandors: MandorUser[] }>("/api/v1/mandor/list").catch(() => ({ data: { mandors: [] } })),
        api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts").catch(() => ({ data: { accounts: [] } })),
      ]);
      setAssignments(asgRes.data.assignments);
      setMandorList(mandorRes.data.mandors ?? []);
      setCashAccounts((cashRes.data.accounts ?? []).filter((a: CashAccount) => a.is_active));
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: memanggil `setLoading(true)`
  // di badan efek memicu render berantai (`react-hooks/set-state-in-effect`).
  // Pola yang sama dipakai `mandor/retensi` dan sudah lolos ratchet lint.
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function loadScopeDetail(scopeId: string) {
    setLoadingScope(true);
    try {
      const r = await api.get<ScopeDetail>(`/api/v1/mandor/work-scopes/${scopeId}`);
      setSelectedScope(r.data);
    } catch { /* silent */ } finally { setLoadingScope(false); }
  }

  const tersaring = assignments.filter(a => !search ||
    a.mandor?.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.project?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian, cacat yang sama yang sudah ditambal di modul Keuangan.
    <div style={{
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)" }}>
          <Search size={13} color={C.muted} />
          <input aria-label="Cari penugasan" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari mandor / proyek..." style={{ border: "none", outline: "none", fontSize: 13, width: 180, color: C.text, background: "transparent" }} />
        </div>
        <span style={{ fontSize: 12, color: C.muted }}>{tersaring.length} penugasan</span>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mid }}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button onClick={() => setShowAddAssignment(true)} style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Assign Mandor
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {tersaring.length === 0 ? (
            <div style={{ ...card, padding: 48, textAlign: "center", color: C.muted }}>
              <HardHat size={32} color={C.border} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Belum ada mandor yang di-assign</div>
              <div style={{ fontSize: 12 }}>Klik &quot;Assign Mandor&quot; untuk menugaskan mandor ke proyek</div>
            </div>
          ) : tersaring.map(asg => {
            const totalNilai = asg.work_scopes.reduce((s, sc) => s + Number(sc.borongan_value ?? 0), 0);
            return (
              <div key={asg.id} style={card}>
                {/* Kepala penugasan */}
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <HardHat size={20} color={C.navy} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      {...dapatDitekan(
                        asg.mandor?.id ? () => router.push(`/mandor/${asg.mandor!.id}`) : null,
                        `Lihat profil ${asg.mandor?.name ?? "mandor"}`,
                      )}
                      style={{ fontSize: 15, fontWeight: 700, color: C.navy, cursor: asg.mandor?.id ? "pointer" : "default", display: "inline-block" }}
                      title={asg.mandor?.id ? "Lihat profil mandor" : undefined}>
                      {asg.mandor?.name ?? "—"}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {asg.project?.name ?? "—"}
                      {asg.mandor?.phone && toWaLink(asg.mandor.phone) && (
                        <a href={toWaLink(asg.mandor.phone)!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ marginLeft: 8, color: C.green, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 2 }}>
                          <Phone size={10} /> {asg.mandor.phone}
                        </a>
                      )}
                      <span style={{ marginLeft: 8 }}>· Ditugaskan {fmtDate(asg.assigned_at)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {totalNilai > 0 && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{fmt(totalNilai)}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>total nilai</div>
                      </div>
                    )}
                    <button
                      onClick={() => setShowAddScope(asg.id)}
                      style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.navy}`, background: "var(--surface)", color: C.navy, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <Plus size={12} /> Tambah Scope
                    </button>
                  </div>
                </div>

                {/* Scope pekerjaan */}
                {asg.work_scopes.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                    Belum ada scope pekerjaan — klik &quot;Tambah Scope&quot;
                  </div>
                ) : (
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {asg.work_scopes.map(sc => {
                      const pctColor = getProgressColor(sc.progress_pct_done);
                      const isBorongan = sc.payment_system === "borongan";
                      const isProgressPct = sc.payment_system === "progress_pct";
                      const contractValue = sc.contract_value ?? sc.borongan_value ?? 0;
                      return (
                        <div key={sc.id} style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface-subtle)", padding: "12px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{sc.scope_name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: sc.status === "active" ? C.greenBg : "var(--surface-hover)", color: sc.status === "active" ? C.green : C.mid, border: `1px solid ${sc.status === "active" ? C.greenBorder : C.border}` }}>
                                {sc.status === "active" ? "Aktif" : sc.status === "completed" ? "Selesai" : sc.status}
                              </span>
                              {(() => { const b = getPaymentSystemBadge(sc.payment_system); return (
                                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 10, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 600 }}>{b.label}</span>
                              ); })()}
                              {contractValue > 0 && (
                                <span style={{ fontSize: 10, color: C.mid }}>{fmt(contractValue)}</span>
                              )}
                              {sc.settlement && (
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: C.greenBg, color: C.green, border: `1px solid ${C.greenBorder}` }}>
                                  ✓ Settled
                                </span>
                              )}
                            </div>
                            {/* Progress fisik */}
                            <div style={{ marginBottom: isBorongan || isProgressPct ? 5 : 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: C.muted }}>Progress Fisik</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: pctColor }}>{sc.progress_pct_done.toFixed(0)}%</span>
                              </div>
                              <div style={{ height: 5, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 0, background: pctColor, width: `${sc.progress_pct_done}%` }} />
                              </div>
                            </div>
                            {/* Borongan: bar kasbon / kontrak */}
                            {isBorongan && contractValue > 0 && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, color: C.muted }}>Kasbon / Kontrak</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: C.yellow }}>
                                    {fmt(sc.total_kasbon ?? 0)} / {fmt(contractValue)} ({sc.financial_pct ?? 0}%)
                                  </span>
                                </div>
                                <div style={{ height: 4, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 0, background: C.yellow, width: `${sc.financial_pct ?? 0}%` }} />
                                </div>
                              </div>
                            )}
                            {/* Progress%: bar sudah dibayar */}
                            {isProgressPct && contractValue > 0 && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, color: C.muted }}>Sudah Dibayar</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: C.green }}>
                                    {fmt(sc.total_progress_paid ?? 0)} ({sc.paid_pct ?? 0}%)
                                  </span>
                                </div>
                                <div style={{ height: 4, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 0, background: C.green, width: `${sc.paid_pct ?? 0}%` }} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            {sc.payment_system === "borongan" && sc.status === "active" && (
                              <button
                                onClick={() => {
                                  setSettlementModal({
                                    scopeId: sc.id,
                                    scopeName: sc.scope_name,
                                    mandorName: asg.mandor?.name ?? "—",
                                    projectName: asg.project?.name ?? "—",
                                    boronganValue: sc.borongan_value ?? 0,
                                    totalKasbon: 0,
                                  });
                                }}
                                style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.green}`, background: C.greenBg, color: C.green, cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                Cairkan
                              </button>
                            )}
                            <button
                              onClick={() => { setShowScopeItems(sc.id); loadScopeDetail(sc.id); }}
                              style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                              Rincian <ChevronRight size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddAssignment && (
        <AddAssignmentModal
          mandors={mandorList}
          onClose={() => setShowAddAssignment(false)}
          onSuccess={() => { setShowAddAssignment(false); load(); }}
        />
      )}
      {showAddScope && (
        <AddScopeModal
          assignmentId={showAddScope}
          onClose={() => setShowAddScope(null)}
          onSuccess={() => { setShowAddScope(null); load(); }}
        />
      )}
      {showScopeItems && (
        <ScopeDetailModal
          data={selectedScope}
          loading={loadingScope}
          onClose={() => { setShowScopeItems(null); setSelectedScope(null); }}
          onRefresh={() => showScopeItems ? loadScopeDetail(showScopeItems) : undefined}
          onAddItem={() => setShowAddScopeItem(showScopeItems)}
        />
      )}
      {showAddScopeItem && (
        <AddScopeItemModal
          scopeId={showAddScopeItem}
          onClose={() => setShowAddScopeItem(null)}
          onSuccess={() => {
            setShowAddScopeItem(null);
            if (showScopeItems) loadScopeDetail(showScopeItems);
          }}
        />
      )}
      {settlementModal && (
        <SettlementBoronganModal
          data={settlementModal}
          cashAccounts={cashAccounts}
          onClose={() => setSettlementModal(null)}
          onSuccess={() => { setSettlementModal(null); load(); }}
        />
      )}
    </div>
  );
}

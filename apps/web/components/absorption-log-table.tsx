"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

interface AbsorptionEntry {
  id: string;
  rab_item_id: string;
  week_start: string;
  week_number: number;
  material_pct: number;
  upah_pct: number;
  alat_pct: number;
  other_pct: number;
  notes: string | null;
  logged_at: string;
  updated_at: string;
  logged_by_user: { id: string; name: string } | null;
  rab_items: { id: string; name: string; level: string; total_price: number | null; weight_pct: number } | null;
}

interface WeekGroup {
  weekStart: string;
  weekLabel: string;
  entries: AbsorptionEntry[];
  totalPct: number;
}

interface Props {
  projectId: string;
  refreshKey?: number;
  canEdit?: boolean;
  onAddClick?: () => void;
  onDeleted?: () => void;
}

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", red: "var(--danger)", yellow: "var(--warning)",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtWeekRange(iso: string) {
  const monday = new Date(iso);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${monday.toLocaleDateString("id-ID", opts)} – ${sunday.toLocaleDateString("id-ID", opts)}`;
}

export function AbsorptionLogTable({ projectId, refreshKey, canEdit, onAddClick, onDeleted }: Props) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<AbsorptionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: AbsorptionEntry[] }>(
        `/api/v1/projects/${projectId}/absorption`
      );
      setEntries(res.data.data ?? []);
      // Auto-expand week paling baru
      const first = (res.data.data ?? [])[0];
      if (first) setExpandedWeeks(new Set([first.week_start]));
    } catch {
      setError("Gagal memuat riwayat serapan");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshKey) load(); }, [refreshKey, load]);

  async function handleDelete(id: string) {
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await api.delete(`/api/v1/projects/${projectId}/absorption/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
      showToast("success", "Entri serapan berhasil dihapus");
      onDeleted?.();
    } catch {
      setError("Gagal menghapus entri");
      showToast("error", "Gagal menghapus entri serapan");
    } finally {
      setDeleting(null);
    }
  }

  function toggleWeek(weekStart: string) {
    setExpandedWeeks(prev => {
      const n = new Set(prev);
      if (n.has(weekStart)) n.delete(weekStart); else n.add(weekStart);
      return n;
    });
  }

  // Group by week_start descending
  const weekMap = new Map<string, AbsorptionEntry[]>();
  for (const e of entries) {
    const list = weekMap.get(e.week_start) ?? [];
    list.push(e);
    weekMap.set(e.week_start, list);
  }
  const weeks: WeekGroup[] = Array.from(weekMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, es]) => ({
      weekStart,
      weekLabel: fmtWeekRange(weekStart),
      entries: es,
      // Rata-rata serapan per entry minggu ini (bukan sum yang tidak bermakna)
      totalPct: es.length > 0
        ? es.reduce((s, e) => s + e.material_pct + e.upah_pct + e.alat_pct + e.other_pct, 0) / es.length
        : 0,
    }));

  const totalEntries = entries.length;
  const uniqueItems = new Set(entries.map(e => e.rab_item_id)).size;

  return (
    <div className="rise rise-3" style={{
      background: "var(--surface)", borderRadius: 14,
      border: `1px solid var(--border)`,
      boxShadow: "var(--shadow-sm)",
      marginBottom: 20, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px",
        borderBottom: collapsed ? "none" : `1px solid var(--border)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg,#EA580C,#F97316)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ color: "#fff", fontSize: 16 }}>₿</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Riwayat Serapan Dana</div>
            {!collapsed && (
              <div style={{ fontSize: 11, color: C.muted }}>
                {loading ? "Memuat..." : totalEntries === 0 ? "Belum ada data" : `${totalEntries} entri · ${uniqueItems} item · ${weeks.length} minggu`}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!collapsed && canEdit && (
            <button onClick={onAddClick} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: "linear-gradient(135deg,#EA580C,#F97316)", color: "#fff",
              border: "none", cursor: "pointer",
            }}>
              <Plus size={13} />
              Tambah Entri
            </button>
          )}
          {!collapsed && !loading && (
            <button aria-label="Muat ulang log serapan" onClick={load} style={{
              display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: 8,
              border: `1px solid var(--border)`, background: "transparent", cursor: "pointer", color: C.mid,
            }}>
              <RefreshCw size={13} />
            </button>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 12px", borderRadius: 8, border: `1px solid var(--border)`,
            background: "var(--surface-subtle)", cursor: "pointer", fontSize: 12, color: C.mid,
          }}>
            {collapsed ? "Tampilkan" : "Sembunyikan"}
            <ChevronDown size={13} style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s" }} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div>
          {error && (
            <div style={{ padding: "10px 20px", background: "var(--danger-bg)", color: C.red, fontSize: 12 }}>
              {error}
              <button onClick={() => setError(null)} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: C.red }}>×</button>
            </div>
          )}

          {loading && (
            <div style={{ padding: "32px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
              Memuat riwayat serapan...
            </div>
          )}

          {!loading && weeks.length === 0 && (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
                Belum ada data serapan dana. Klik tombol di atas atau isi langsung di kolom Serapan% di tabel RAB.
              </div>
              {canEdit && (
                <button onClick={onAddClick} style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "linear-gradient(135deg,#EA580C,#F97316)", color: "#fff",
                  border: "none", cursor: "pointer",
                }}>
                  + Tambah Entri Pertama
                </button>
              )}
            </div>
          )}

          {!loading && weeks.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              {/* Column header */}
              <div style={{
                display: "grid", gridTemplateColumns: "28px 1fr 80px 72px 72px 72px 72px 80px 110px 36px",
                gap: 6, padding: "8px 16px",
                background: "var(--surface-hover)", borderBottom: `1px solid var(--border)`,
                fontSize: 10, fontWeight: 700, color: C.muted,
              }}>
                <div />
                <div>Item Pekerjaan</div>
                <div style={{ textAlign: "right" }}>Minggu ke</div>
                <div style={{ textAlign: "right" }}>Material</div>
                <div style={{ textAlign: "right" }}>Upah</div>
                <div style={{ textAlign: "right" }}>Alat</div>
                <div style={{ textAlign: "right" }}>Lain</div>
                <div style={{ textAlign: "right" }}>Total %</div>
                <div>Dicatat oleh</div>
                <div />
              </div>

              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {weeks.map(week => {
                  const isOpen = expandedWeeks.has(week.weekStart);
                  return (
                    <div key={week.weekStart}>
                      {/* Week group header */}
                      <div
                        onClick={() => toggleWeek(week.weekStart)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "28px 1fr 80px 72px 72px 72px 72px 80px 110px 36px",
                          gap: 6, padding: "10px 16px",
                          background: "var(--navy-light)",
                          borderBottom: `1px solid var(--border)`,
                          cursor: "pointer", alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isOpen
                            ? <ChevronDown size={13} color={C.navy} />
                            : <ChevronRight size={13} color={C.navy} />}
                        </div>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>
                            {week.weekLabel}
                          </span>
                          <span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>
                            {week.entries.length} item
                          </span>
                        </div>
                        <div />
                        <div /><div /><div /><div />
                        <div style={{ textAlign: "right" }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: week.totalPct > 0 ? "#EA580C" : C.muted,
                          }}>
                            {week.totalPct.toFixed(1)}%
                          </span>
                          <div style={{ fontSize: 9, color: C.muted }}>rata-rata/item</div>
                        </div>
                        <div /><div />
                      </div>

                      {/* Entry rows */}
                      {isOpen && week.entries.map(entry => {
                        const total = entry.material_pct + entry.upah_pct + entry.alat_pct + entry.other_pct;
                        return (
                          <div key={entry.id} style={{
                            display: "grid",
                            gridTemplateColumns: "28px 1fr 80px 72px 72px 72px 72px 80px 110px 36px",
                            gap: 6, padding: "8px 16px",
                            background: "var(--surface)",
                            borderBottom: `1px solid var(--border)`,
                            alignItems: "center",
                            fontSize: 12,
                          }}>
                            <div />
                            <div>
                              <div style={{ fontWeight: 500, color: C.text }}>
                                {entry.rab_items?.name ?? "—"}
                              </div>
                              {entry.notes && (
                                <div style={{ fontSize: 10, color: C.muted }}>{entry.notes}</div>
                              )}
                            </div>
                            <div style={{ textAlign: "right", color: C.mid, fontSize: 11 }}>
                              M{entry.week_number}
                            </div>
                            <div style={{ textAlign: "right", color: "#3B82F6" }}>
                              {entry.material_pct > 0 ? `${entry.material_pct}%` : <span style={{ color: C.muted }}>—</span>}
                            </div>
                            <div style={{ textAlign: "right", color: "#10B981" }}>
                              {entry.upah_pct > 0 ? `${entry.upah_pct}%` : <span style={{ color: C.muted }}>—</span>}
                            </div>
                            <div style={{ textAlign: "right", color: "#F59E0B" }}>
                              {entry.alat_pct > 0 ? `${entry.alat_pct}%` : <span style={{ color: C.muted }}>—</span>}
                            </div>
                            <div style={{ textAlign: "right", color: "#8B5CF6" }}>
                              {entry.other_pct > 0 ? `${entry.other_pct}%` : <span style={{ color: C.muted }}>—</span>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{
                                fontWeight: 700, color: "#EA580C",
                                background: "#FFF7ED", borderRadius: 4,
                                padding: "2px 6px", fontSize: 11,
                              }}>
                                {total.toFixed(1)}%
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: C.muted }}>
                              {entry.logged_by_user?.name ?? "—"}
                              <div style={{ fontSize: 9 }}>{fmtDate(entry.logged_at)}</div>
                            </div>
                            <div style={{ position: "relative" }}>
                              {canEdit && confirmDelete !== entry.id && (
                                <button aria-label="Hapus entri"
                                  onClick={() => setConfirmDelete(entry.id)}
                                  disabled={deleting === entry.id}
                                  style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    padding: 4, color: C.muted, opacity: deleting === entry.id ? 0.4 : 1,
                                    borderRadius: 4,
                                  }}
                                  title="Hapus entri"
                                >
                                  {deleting === entry.id ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />}
                                </button>
                              )}
                              {canEdit && confirmDelete === entry.id && (
                                <div style={{
                                  position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                                  display: "flex", alignItems: "center", gap: 4, zIndex: 10,
                                  background: "var(--surface)", border: "1px solid var(--danger-border)",
                                  borderRadius: 8, padding: "3px 6px", boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                                  whiteSpace: "nowrap",
                                }}>
                                  <AlertCircle size={11} style={{ color: C.red }} />
                                  <span style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>Hapus?</span>
                                  <button
                                    onClick={() => handleDelete(entry.id)}
                                    style={{
                                      padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                                      background: C.red, color: "#fff", border: "none", cursor: "pointer",
                                    }}
                                  >Ya</button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    style={{
                                      padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                                      background: "var(--surface-hover)", color: C.mid, border: "1px solid var(--border)", cursor: "pointer",
                                    }}
                                  >Batal</button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Footer total */}
              <div style={{
                display: "grid", gridTemplateColumns: "28px 1fr 80px 72px 72px 72px 72px 80px 110px 36px",
                gap: 6, padding: "10px 16px",
                borderTop: `2px solid var(--border)`,
                background: "var(--bg)",
                fontSize: 12, fontWeight: 700, color: C.text,
              }}>
                <div /><div>Total</div>
                <div /><div /><div /><div /><div />
                <div style={{ textAlign: "right", color: "#EA580C" }}>
                  {entries.reduce((s, e) => s + e.material_pct + e.upah_pct + e.alat_pct + e.other_pct, 0).toFixed(1)}%
                </div>
                <div /><div />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

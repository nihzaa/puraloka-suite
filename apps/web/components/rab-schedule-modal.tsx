"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, CalendarDays, Save, ChevronDown, Clock } from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RabItem {
  id: string;
  name: string;
  level: string;
  total_price: number | null;
  weight_pct: number;
}

interface ScheduleRow {
  id?: string;
  week_start: string;
  week_number: number;
  material_pct: number;
  upah_pct: number;
  alat_pct: number;
  other_pct: number;
  notes: string;
  isNew?: boolean;
  isDirty?: boolean;
}

interface AbsorptionRow {
  id?: string;
  week_start: string;
  week_number: number;
  material_pct: number;
  upah_pct: number;
  alat_pct: number;
  other_pct: number;
  notes: string;
  logged_by_user?: { name: string } | null;
  logged_at?: string;
  isNew?: boolean;
  isDirty?: boolean;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", surface: "var(--surface)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  orange: "#EA580C", orangeBg: "#FFF7ED",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
  return fmt(n);
};

// Hitung Senin dari tanggal manapun
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// Format "Minggu ke-N (DD Mon YYYY)"
function fmtWeekLabel(weekStart: string, weekNum: number): string {
  const d = new Date(weekStart);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `M${weekNum} · ${d.toLocaleDateString("id-ID", opts)} – ${end.toLocaleDateString("id-ID", { ...opts, year: "numeric" })}`;
}

// Generate array minggu dari proyek start_date sampai end_date
function generateWeeks(startDate: string, endDate: string): Array<{ week_start: string; week_number: number }> {
  const weeks: Array<{ week_start: string; week_number: number }> = [];
  const start = getMondayOf(new Date(startDate));
  const end = new Date(endDate);
  const current = new Date(start);
  let num = 1;
  while (current <= end) {
    weeks.push({
      week_start: current.toISOString().split("T")[0],
      week_number: num,
    });
    current.setDate(current.getDate() + 7);
    num++;
  }
  return weeks;
}

// ─── Komponen input sel ────────────────────────────────────────────────────────

function PctInput({
  value, onChange, color,
}: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <input
        type="number" min="0" max="100" step="1"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={e => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        style={{
          width: 48, padding: "4px 5px", fontSize: 12, textAlign: "right",
          border: `1.5px solid ${color}33`, borderRadius: 5,
          color: C.text, background: "var(--surface)", outline: "none",
          fontWeight: 500,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = color; }}
        onBlur={e => { e.currentTarget.style.borderColor = `${color}33`; }}
      />
      <span style={{ fontSize: 10, color: C.muted }}>%</span>
    </div>
  );
}

// ─── Total bar (validasi 100%) ─────────────────────────────────────────────────

function TotalBar({ mat, upah, alat, other }: { mat: number; upah: number; alat: number; other: number }) {
  const total = mat + upah + alat + other;
  const ok = total === 0 || (total >= 99.9 && total <= 100.1);
  const color = total === 0 ? C.muted : ok ? C.green : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, height: 4, background: "var(--surface-hover)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, total)}%`, background: color, borderRadius: 2, transition: "width 0.2s" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 30, textAlign: "right" }}>
        {total > 0 ? `${total.toFixed(0)}%` : "—"}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Jadwal Rencana Serapan
// ═══════════════════════════════════════════════════════════════════════════════

interface ScheduleModalProps {
  projectId: string;
  projectStart: string;
  projectEnd: string;
  onClose: () => void;
}

export function RabScheduleModal({ projectId, projectStart, projectEnd, onClose }: ScheduleModalProps) {
  const [items, setItems] = useState<RabItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RabItem | null>(null);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const allWeeks = generateWeeks(projectStart, projectEnd);

  // Load item RAB (hanya level item)
  useEffect(() => {
    api.get<{ data: RabItem[] }>(`/api/v1/projects/${projectId}/rab`)
      .then(r => {
        const leafItems = (r.data.data ?? []).filter(it => it.level === "item" && (it.total_price ?? 0) > 0);
        setItems(leafItems);
      })
      .finally(() => setLoadingItems(false));
  }, [projectId]);

  // Load jadwal untuk item yang dipilih
  const loadRows = useCallback(async (itemId: string) => {
    setLoadingRows(true);
    try {
      const r = await api.get<{ data: ScheduleRow[] }>(`/api/v1/projects/${projectId}/rab-schedule/${itemId}`);
      setRows(r.data.data ?? []);
    } finally {
      setLoadingRows(false);
    }
  }, [projectId]);

  function selectItem(item: RabItem) {
    setSelectedItem(item);
    loadRows(item.id);
  }

  // Hitung total % untuk item ini (semua minggu)
  const grandTotal = rows.reduce((s, r) => s + r.material_pct + r.upah_pct + r.alat_pct + r.other_pct, 0);

  // Tambah baris baru (pilih minggu yang belum ada)
  function addRow() {
    const usedWeeks = new Set(rows.map(r => r.week_start));
    const nextWeek = allWeeks.find(w => !usedWeeks.has(w.week_start));
    if (!nextWeek) return;
    setRows(prev => [...prev, {
      week_start: nextWeek.week_start,
      week_number: nextWeek.week_number,
      material_pct: 0, upah_pct: 0, alat_pct: 0, other_pct: 0,
      notes: "", isNew: true, isDirty: true,
    }]);
  }

  function updateRow(idx: number, field: keyof ScheduleRow, value: number | string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, isDirty: true } : r));
  }

  function changeWeek(idx: number, weekStart: string) {
    const week = allWeeks.find(w => w.week_start === weekStart);
    if (!week) return;
    setRows(prev => prev.map((r, i) => i === idx
      ? { ...r, week_start: weekStart, week_number: week.week_number, isDirty: true }
      : r));
  }

  async function saveRow(idx: number) {
    if (!selectedItem) return;
    const row = rows[idx];
    const key = `${idx}`;
    setSaving(key);
    try {
      await api.post(`/api/v1/projects/${projectId}/rab-schedule`, {
        rab_item_id: selectedItem.id,
        week_start: row.week_start,
        material_pct: row.material_pct,
        upah_pct: row.upah_pct,
        alat_pct: row.alat_pct,
        other_pct: row.other_pct,
        notes: row.notes || null,
      });
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, isNew: false, isDirty: false } : r));
      setToast({ type: "success", msg: "Jadwal disimpan" });
      setTimeout(() => setToast(null), 2500);
      // Reload untuk dapat id dari server
      loadRows(selectedItem.id);
    } catch {
      setToast({ type: "error", msg: "Gagal menyimpan jadwal" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(null);
    }
  }

  async function deleteRow(idx: number) {
    const row = rows[idx];
    if (row.isNew) {
      setRows(prev => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!row.id) return;
    setDeleting(row.id);
    try {
      await api.delete(`/api/v1/projects/${projectId}/rab-schedule/${row.id}`);
      setRows(prev => prev.filter((_, i) => i !== idx));
      setToast({ type: "success", msg: "Baris dihapus" });
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast({ type: "error", msg: "Gagal menghapus" });
    } finally {
      setDeleting(null);
    }
  }

  const usedWeeks = new Set(rows.map(r => r.week_start));
  const availableWeeks = allWeeks.filter(w => !usedWeeks.has(w.week_start));

  const modal = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 760, height: "100dvh", background: C.surface,
        display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #003366, #0066CC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CalendarDays size={18} color="var(--surface)" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "var(--font-display)" }}>
                  Jadwal Rencana Serapan Dana
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>Per item RAB, per komponen, per minggu</div>
              </div>
            </div>
            <button aria-label="Tutup dialog jadwal RAB" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.muted }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Pilih item RAB */}
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Pilih Item Pekerjaan
            </div>
            {loadingItems ? (
              <div style={{ color: C.muted, fontSize: 13 }}>Memuat...</div>
            ) : (
              <div style={{ position: "relative" }}>
                <select
                  value={selectedItem?.id ?? ""}
                  onChange={e => {
                    const item = items.find(it => it.id === e.target.value);
                    if (item) selectItem(item);
                  }}
                  style={{
                    width: "100%", padding: "9px 32px 9px 12px", fontSize: 13,
                    border: `1.5px solid ${selectedItem ? C.navy : C.border}`,
                    borderRadius: 8, color: C.text, background: "var(--surface)",
                    appearance: "none", cursor: "pointer", outline: "none",
                  }}
                >
                  <option value="">— Pilih item pekerjaan —</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.name} {it.total_price ? `· ${fmtCompact(it.total_price)}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.mid }} />
              </div>
            )}

            {/* Info item terpilih */}
            {selectedItem && (
              <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
                <div style={{ flex: 1, background: C.navyLight, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.mid }}>Nilai Item</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
                    {selectedItem.total_price ? fmt(selectedItem.total_price) : "—"}
                  </div>
                </div>
                <div style={{ flex: 1, background: "var(--success-bg)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.mid }}>Total Dijadwalkan</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: grandTotal > 100.1 ? C.red : grandTotal >= 99.9 ? C.green : C.yellow }}>
                    {grandTotal.toFixed(1)}% {grandTotal >= 99.9 && grandTotal <= 100.1 ? "✓ Lengkap" : grandTotal > 100.1 ? "⚠ Melebihi 100%" : "dari 100%"}
                  </div>
                </div>
                <div style={{ flex: 1, background: "var(--bg)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.mid }}>Sisa Dijadwalkan</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {Math.max(0, 100 - grandTotal).toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tabel jadwal */}
          {selectedItem && (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {loadingRows ? (
                <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13 }}>Memuat jadwal...</div>
              ) : (
                <>
                  {/* Legend komponen */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    {[
                      { label: "Material", color: "#3B82F6" },
                      { label: "Upah", color: "#10B981" },
                      { label: "Alat", color: "#F59E0B" },
                      { label: "Lain-lain", color: "#8B5CF6" },
                    ].map(c => (
                      <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                        <span style={{ fontSize: 10, color: C.mid }}>{c.label}</span>
                      </div>
                    ))}
                    <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>
                      Total per baris harus = 100%
                    </span>
                  </div>

                  {/* Header tabel */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 56px 56px 56px 56px 80px 80px 36px",
                    gap: 8, padding: "6px 10px", background: "var(--bg)",
                    borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}`,
                  }}>
                    {["Minggu", "Material", "Upah", "Alat", "Lain", "Total", "", ""].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 600, color: C.mid, textAlign: i > 0 ? "center" : "left" }}>{h}</div>
                    ))}
                  </div>

                  {/* Baris data */}
                  {rows.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>
                      Belum ada jadwal. Klik "+ Tambah Minggu" untuk mulai.
                    </div>
                  )}

                  {rows.map((row, idx) => {
                    const rowTotal = row.material_pct + row.upah_pct + row.alat_pct + row.other_pct;
                    const rowOk = rowTotal === 0 || (rowTotal >= 99.9 && rowTotal <= 100.1);
                    return (
                      <div key={idx} style={{
                        display: "grid", gridTemplateColumns: "1fr 56px 56px 56px 56px 80px 80px 36px",
                        gap: 8, padding: "8px 10px", alignItems: "center",
                        background: row.isDirty ? "#FAFBFF" : "var(--surface)",
                        borderRadius: 8, marginBottom: 4,
                        border: `1px solid ${row.isDirty ? "var(--info-border)" : C.border}`,
                      }}>
                        {/* Pilih minggu */}
                        <div style={{ position: "relative" }}>
                          <select
                            value={row.week_start}
                            onChange={e => changeWeek(idx, e.target.value)}
                            style={{
                              width: "100%", padding: "4px 22px 4px 8px", fontSize: 11,
                              border: `1px solid ${C.border}`, borderRadius: 6,
                              color: C.text, background: "var(--surface)", appearance: "none", cursor: "pointer",
                            }}
                          >
                            <option value={row.week_start}>{fmtWeekLabel(row.week_start, row.week_number)}</option>
                            {allWeeks
                              .filter(w => !usedWeeks.has(w.week_start) || w.week_start === row.week_start)
                              .map(w => (
                                <option key={w.week_start} value={w.week_start}>
                                  {fmtWeekLabel(w.week_start, w.week_number)}
                                </option>
                              ))}
                          </select>
                          <ChevronDown size={10} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.mid }} />
                        </div>

                        {/* Input komponen */}
                        <PctInput value={row.material_pct} onChange={v => updateRow(idx, "material_pct", v)} color="#3B82F6" />
                        <PctInput value={row.upah_pct} onChange={v => updateRow(idx, "upah_pct", v)} color="#10B981" />
                        <PctInput value={row.alat_pct} onChange={v => updateRow(idx, "alat_pct", v)} color="#F59E0B" />
                        <PctInput value={row.other_pct} onChange={v => updateRow(idx, "other_pct", v)} color="#8B5CF6" />

                        {/* Total bar */}
                        <TotalBar mat={row.material_pct} upah={row.upah_pct} alat={row.alat_pct} other={row.other_pct} />

                        {/* Tombol simpan */}
                        {row.isDirty ? (
                          <button
                            onClick={() => saveRow(idx)}
                            disabled={saving === `${idx}`}
                            style={{
                              padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: C.navy, color: "var(--surface)", border: "none", cursor: "pointer",
                              opacity: saving === `${idx}` ? 0.6 : 1,
                              display: "flex", alignItems: "center", gap: 3,
                            }}
                          >
                            <Save size={11} />
                            {saving === `${idx}` ? "..." : "Simpan"}
                          </button>
                        ) : (
                          <div style={{ fontSize: 10, color: C.green, textAlign: "center" }}>✓ Tersimpan</div>
                        )}

                        {/* Tombol hapus */}
                        <button aria-label="Hapus baris jadwal"
                          onClick={() => deleteRow(idx)}
                          disabled={deleting === row.id}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.muted, opacity: deleting === row.id ? 0.4 : 1 }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Tombol tambah baris */}
                  {availableWeeks.length > 0 && (
                    <button
                      onClick={addRow}
                      style={{
                        marginTop: 8, width: "100%", padding: "9px 0",
                        border: `1.5px dashed ${C.border}`, borderRadius: 8,
                        background: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        color: C.mid, fontSize: 12, fontWeight: 500,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}
                    >
                      <Plus size={14} />
                      Tambah Minggu ({availableWeeks.length} minggu tersisa)
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {!selectedItem && !loadingItems && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
              Pilih item pekerjaan di atas untuk mulai mengatur jadwal
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: toast.type === "success" ? C.green : C.red, color: "var(--surface)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Update Serapan Dana (input mingguan)
// ═══════════════════════════════════════════════════════════════════════════════

interface AbsorptionModalProps {
  projectId: string;
  projectStart: string;
  projectEnd: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function AbsorptionLogModal({ projectId, projectStart, projectEnd, onClose, onSaved }: AbsorptionModalProps) {
  const [items, setItems] = useState<RabItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RabItem | null>(null);
  const [rows, setRows] = useState<AbsorptionRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const allWeeks = generateWeeks(projectStart, projectEnd);
  // Hanya tampilkan minggu yang sudah lewat atau minggu ini
  const today = new Date();
  const pastWeeks = allWeeks.filter(w => new Date(w.week_start) <= today);

  useEffect(() => {
    api.get<{ data: RabItem[] }>(`/api/v1/projects/${projectId}/rab`)
      .then(r => {
        const leafItems = (r.data.data ?? []).filter(it => it.level === "item" && (it.total_price ?? 0) > 0);
        setItems(leafItems);
      })
      .finally(() => setLoadingItems(false));
  }, [projectId]);

  const loadRows = useCallback(async (itemId: string) => {
    setLoadingRows(true);
    try {
      const r = await api.get<{ data: AbsorptionRow[] }>(`/api/v1/projects/${projectId}/absorption/${itemId}`);
      setRows(r.data.data ?? []);
    } finally {
      setLoadingRows(false);
    }
  }, [projectId]);

  function selectItem(item: RabItem) {
    setSelectedItem(item);
    loadRows(item.id);
  }

  const grandTotal = rows.reduce((s, r) => s + r.material_pct + r.upah_pct + r.alat_pct + r.other_pct, 0);

  function addRow() {
    const usedWeeks = new Set(rows.map(r => r.week_start));
    // Default ke minggu ini atau minggu terakhir yang tersedia
    const nextWeek = [...pastWeeks].reverse().find(w => !usedWeeks.has(w.week_start));
    if (!nextWeek) return;
    setRows(prev => [...prev, {
      week_start: nextWeek.week_start,
      week_number: nextWeek.week_number,
      material_pct: 0, upah_pct: 0, alat_pct: 0, other_pct: 0,
      notes: "", isNew: true, isDirty: true,
    }]);
  }

  function updateRow(idx: number, field: keyof AbsorptionRow, value: number | string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, isDirty: true } : r));
  }

  function changeWeek(idx: number, weekStart: string) {
    const week = allWeeks.find(w => w.week_start === weekStart);
    if (!week) return;
    setRows(prev => prev.map((r, i) => i === idx
      ? { ...r, week_start: weekStart, week_number: week.week_number, isDirty: true }
      : r));
  }

  async function saveRow(idx: number) {
    if (!selectedItem) return;
    const row = rows[idx];
    const key = `${idx}`;
    setSaving(key);
    try {
      await api.post(`/api/v1/projects/${projectId}/absorption`, {
        rab_item_id: selectedItem.id,
        week_start: row.week_start,
        material_pct: row.material_pct,
        upah_pct: row.upah_pct,
        alat_pct: row.alat_pct,
        other_pct: row.other_pct,
        notes: row.notes || null,
      });
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, isNew: false, isDirty: false } : r));
      setToast({ type: "success", msg: "Serapan disimpan" });
      setTimeout(() => setToast(null), 2500);
      loadRows(selectedItem.id);
      onSaved?.();
    } catch {
      setToast({ type: "error", msg: "Gagal menyimpan" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(null);
    }
  }

  async function deleteRow(idx: number) {
    const row = rows[idx];
    if (row.isNew) { setRows(prev => prev.filter((_, i) => i !== idx)); return; }
    if (!row.id) return;
    setDeleting(row.id);
    try {
      await api.delete(`/api/v1/projects/${projectId}/absorption/${row.id}`);
      setRows(prev => prev.filter((_, i) => i !== idx));
      setToast({ type: "success", msg: "Baris dihapus" });
      setTimeout(() => setToast(null), 2000);
      onSaved?.();
    } catch {
      setToast({ type: "error", msg: "Gagal menghapus" });
    } finally {
      setDeleting(null);
    }
  }

  const usedWeeks = new Set(rows.map(r => r.week_start));
  const availablePastWeeks = pastWeeks.filter(w => !usedWeeks.has(w.week_start));

  const modal = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 760, height: "100dvh", background: C.surface,
        display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #EA580C, #F97316)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Clock size={18} color="var(--surface)" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "var(--font-display)" }}>
                  Update Serapan Dana
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>Input realisasi serapan per item per minggu · history tersimpan</div>
              </div>
            </div>
            <button aria-label="Tutup dialog serapan" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.muted }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Pilih item */}
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Pilih Item Pekerjaan
            </div>
            {loadingItems ? (
              <div style={{ color: C.muted, fontSize: 13 }}>Memuat...</div>
            ) : (
              <div style={{ position: "relative" }}>
                <select
                  value={selectedItem?.id ?? ""}
                  onChange={e => {
                    const item = items.find(it => it.id === e.target.value);
                    if (item) selectItem(item);
                  }}
                  style={{
                    width: "100%", padding: "9px 32px 9px 12px", fontSize: 13,
                    border: `1.5px solid ${selectedItem ? C.orange : C.border}`,
                    borderRadius: 8, color: C.text, background: "var(--surface)",
                    appearance: "none", cursor: "pointer", outline: "none",
                  }}
                >
                  <option value="">— Pilih item pekerjaan —</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.name} {it.total_price ? `· ${fmtCompact(it.total_price)}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.mid }} />
              </div>
            )}

            {selectedItem && (
              <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
                <div style={{ flex: 1, background: C.orangeBg, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.mid }}>Nilai Item</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>
                    {selectedItem.total_price ? fmt(selectedItem.total_price) : "—"}
                  </div>
                </div>
                <div style={{ flex: 1, background: "var(--success-bg)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.mid }}>Total Terserap</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: grandTotal >= 100 ? C.green : C.orange }}>
                    {grandTotal.toFixed(1)}%
                  </div>
                </div>
                <div style={{ flex: 1, background: "var(--bg)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.mid }}>Sisa Belum Terserap</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {Math.max(0, 100 - grandTotal).toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tabel serapan */}
          {selectedItem && (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {loadingRows ? (
                <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13 }}>Memuat data...</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                    {[
                      { label: "Material", color: "#3B82F6" },
                      { label: "Upah", color: "#10B981" },
                      { label: "Alat", color: "#F59E0B" },
                      { label: "Lain-lain", color: "#8B5CF6" },
                    ].map(c => (
                      <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                        <span style={{ fontSize: 10, color: C.mid }}>{c.label}</span>
                      </div>
                    ))}
                    <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>
                      Minggu berjalan & yang sudah lewat
                    </span>
                  </div>

                  {/* Header */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 56px 56px 56px 56px 80px 80px 36px",
                    gap: 8, padding: "6px 10px", background: "var(--bg)",
                    borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}`,
                  }}>
                    {["Minggu", "Material", "Upah", "Alat", "Lain", "Total", "", ""].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 600, color: C.mid, textAlign: i > 0 ? "center" : "left" }}>{h}</div>
                    ))}
                  </div>

                  {rows.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>
                      Belum ada data serapan. Klik "+ Update Minggu" untuk mulai.
                    </div>
                  )}

                  {rows.map((row, idx) => (
                    <div key={idx} style={{
                      display: "grid", gridTemplateColumns: "1fr 56px 56px 56px 56px 80px 80px 36px",
                      gap: 8, padding: "8px 10px", alignItems: "center",
                      background: row.isDirty ? "var(--warning-bg)" : "var(--surface)",
                      borderRadius: 8, marginBottom: 4,
                      border: `1px solid ${row.isDirty ? "var(--warning-border)" : C.border}`,
                    }}>
                      <div style={{ position: "relative" }}>
                        <select
                          value={row.week_start}
                          onChange={e => changeWeek(idx, e.target.value)}
                          style={{
                            width: "100%", padding: "4px 22px 4px 8px", fontSize: 11,
                            border: `1px solid ${C.border}`, borderRadius: 6,
                            color: C.text, background: "var(--surface)", appearance: "none", cursor: "pointer",
                          }}
                        >
                          <option value={row.week_start}>{fmtWeekLabel(row.week_start, row.week_number)}</option>
                          {pastWeeks
                            .filter(w => !usedWeeks.has(w.week_start) || w.week_start === row.week_start)
                            .map(w => (
                              <option key={w.week_start} value={w.week_start}>
                                {fmtWeekLabel(w.week_start, w.week_number)}
                              </option>
                            ))}
                        </select>
                        <ChevronDown size={10} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.mid }} />
                      </div>

                      <PctInput value={row.material_pct} onChange={v => updateRow(idx, "material_pct", v)} color="#3B82F6" />
                      <PctInput value={row.upah_pct} onChange={v => updateRow(idx, "upah_pct", v)} color="#10B981" />
                      <PctInput value={row.alat_pct} onChange={v => updateRow(idx, "alat_pct", v)} color="#F59E0B" />
                      <PctInput value={row.other_pct} onChange={v => updateRow(idx, "other_pct", v)} color="#8B5CF6" />

                      <TotalBar mat={row.material_pct} upah={row.upah_pct} alat={row.alat_pct} other={row.other_pct} />

                      {row.isDirty ? (
                        <button
                          onClick={() => saveRow(idx)}
                          disabled={saving === `${idx}`}
                          style={{
                            padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: C.orange, color: "var(--surface)", border: "none", cursor: "pointer",
                            opacity: saving === `${idx}` ? 0.6 : 1,
                            display: "flex", alignItems: "center", gap: 3,
                          }}
                        >
                          <Save size={11} />
                          {saving === `${idx}` ? "..." : "Simpan"}
                        </button>
                      ) : (
                        <div style={{ fontSize: 10, color: C.green, textAlign: "center" }}>
                          {row.logged_by_user?.name ? (
                            <span title={row.logged_at}>{row.logged_by_user.name.split(" ")[0]}</span>
                          ) : "✓"}
                        </div>
                      )}

                      <button aria-label="Hapus baris serapan"
                        onClick={() => deleteRow(idx)}
                        disabled={deleting === row.id}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.muted, opacity: deleting === row.id ? 0.4 : 1 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  {availablePastWeeks.length > 0 && (
                    <button
                      onClick={addRow}
                      style={{
                        marginTop: 8, width: "100%", padding: "9px 0",
                        border: `1.5px dashed ${C.border}`, borderRadius: 8,
                        background: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        color: C.mid, fontSize: 12, fontWeight: 500,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.orange; e.currentTarget.style.color = C.orange; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}
                    >
                      <Plus size={14} />
                      + Tambah Entri ({availablePastWeeks.length} minggu belum diisi)
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {!selectedItem && !loadingItems && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
              Pilih item pekerjaan di atas untuk mulai mengisi serapan
            </div>
          )}
        </div>

        {toast && (
          <div style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: toast.type === "success" ? C.green : C.red, color: "var(--surface)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

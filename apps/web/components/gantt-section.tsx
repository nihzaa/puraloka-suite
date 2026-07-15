"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar, ChevronDown, ChevronRight, Settings2,
  AlertTriangle, Info, Loader2, Link2, X, Check,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DepRule {
  item_id: string;
  threshold_pct: number | null;
  label: string | null;
}

export interface GanttTask {
  id: string;
  no_urut: string | null;
  uraian: string;
  level: 1 | 2 | 3;
  parent_id: string | null;
  sort_order: number;
  progress_pct: number;
  weight_pct: number;
  planned_start: string | null;
  planned_end: string | null;
  dep_rules: DepRule[];          // structured dependency rules with threshold_pct
  dependencies: string[];        // flat id array, derived from dep_rules
  actual_start: string | null;
  actual_end: string | null;     // earned completion: first time pct >= 100%
  execution_end: string | null;  // last activity log (audit only, not used for schedule)
  actual_pct: number | null;
}

interface DependencyWarning {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  message: string;
  severity: "warning" | "danger";
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)", border: "var(--border)",
  bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

const fmtDateShort = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

// ─── Warning detection ────────────────────────────────────────────────────────

function detectWarnings(tasks: GanttTask[]): DependencyWarning[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const warnings: DependencyWarning[] = [];

  for (const task of tasks) {
    if (!task.planned_start || task.dep_rules.length === 0) continue;

    for (const rule of task.dep_rules) {
      const dep = taskMap.get(rule.item_id);
      if (!dep) continue;

      if (rule.threshold_pct != null) {
        // Threshold-based warning: dep harus sudah mencapai threshold_pct sebelum task mulai
        const depPct = dep.actual_pct ?? dep.progress_pct ?? 0;
        if (depPct < rule.threshold_pct) {
          const label = rule.label ? ` (${rule.label})` : "";
          warnings.push({
            fromId: rule.item_id,
            toId: task.id,
            fromName: dep.uraian,
            toName: task.uraian,
            severity: depPct < rule.threshold_pct * 0.5 ? "danger" : "warning",
            message: `"${task.uraian}" butuh "${dep.uraian}" ≥${rule.threshold_pct}%${label}, saat ini baru ${depPct.toFixed(0)}%`,
          });
        }
      } else {
        // Date-based advisory: warn jika task mulai sebelum dep planned_end
        if (!dep.planned_end) continue;
        const diff = daysBetween(dep.planned_end, task.planned_start);
        if (diff < 0) {
          const overlap = Math.abs(diff);
          warnings.push({
            fromId: rule.item_id,
            toId: task.id,
            fromName: dep.uraian,
            toName: task.uraian,
            severity: overlap > 14 ? "danger" : "warning",
            message: `"${task.uraian}" dimulai ${overlap} hari sebelum "${dep.uraian}" selesai (${fmtDate(dep.planned_end)})`,
          });
        }
      }
    }
  }

  return warnings;
}

// ─── Edit Date Modal ──────────────────────────────────────────────────────────

function EditDateModal({
  task,
  allTasks,
  projectId,
  onClose,
  onSaved,
}: {
  task: GanttTask;
  allTasks: GanttTask[];
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plannedStart, setPlannedStart] = useState(task.planned_start?.slice(0, 10) ?? "");
  const [plannedEnd, setPlannedEnd] = useState(task.planned_end?.slice(0, 10) ?? "");
  const [depRules, setDepRules] = useState<DepRule[]>(task.dep_rules ?? []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // All tasks at same level (excluding self) are candidates
  const candidateDeps = allTasks.filter(t => t.id !== task.id && t.level === task.level);

  function isChecked(id: string) {
    return depRules.some(r => r.item_id === id);
  }

  function getRule(id: string): DepRule | undefined {
    return depRules.find(r => r.item_id === id);
  }

  function toggleDep(id: string) {
    setDepRules(prev => {
      if (prev.some(r => r.item_id === id)) {
        return prev.filter(r => r.item_id !== id);
      }
      return [...prev, { item_id: id, threshold_pct: null, label: null }];
    });
  }

  function setThreshold(id: string, pct: number | null) {
    setDepRules(prev => prev.map(r => r.item_id === id ? { ...r, threshold_pct: pct } : r));
  }

  function setLabel(id: string, label: string) {
    setDepRules(prev => prev.map(r => r.item_id === id ? { ...r, label: label || null } : r));
  }

  async function handleSave() {
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
      setErr("Tanggal selesai tidak boleh sebelum tanggal mulai");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await api.patch(`/api/v1/projects/${projectId}/rab/${task.id}/gantt`, {
        planned_start: plannedStart || null,
        planned_end: plannedEnd || null,
        dep_rules: depRules,
      });
      onSaved();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyimpan";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  const inpStyle: React.CSSProperties = {
    width: "100%", padding: "8px 11px", fontSize: 13, borderRadius: 8,
    border: "1px solid #E5E7EB", outline: "none", boxSizing: "border-box",
    background: "var(--surface)", color: C.text, fontFamily: "inherit",
  };

  const smallInp: React.CSSProperties = {
    padding: "4px 8px", fontSize: 12, borderRadius: 6,
    border: "1px solid #E5E7EB", outline: "none", boxSizing: "border-box",
    background: "var(--surface)", color: C.text, fontFamily: "inherit",
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 24px 20px", width: "min(560px, 94vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Edit Timeline</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.mid }}>
            {task.no_urut ? `${task.no_urut}. ` : ""}{task.uraian}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Mulai Rencana</label>
            <input type="date" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} style={inpStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Selesai Rencana</label>
            <input type="date" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} style={inpStyle} />
          </div>
        </div>

        {/* Aktual info (read-only) */}
        {(task.actual_start || task.actual_end) && (
          <div style={{ background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.blue }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Tanggal Aktual (dari progress log — read only)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div>Mulai aktual: <strong>{fmtDate(task.actual_start)}</strong></div>
              {task.actual_end
                ? <div>✅ Selesai earned: <strong>{fmtDate(task.actual_end)}</strong> <span style={{ color: "#93C5FD", fontSize: 11 }}>(pertama kali 100%)</span></div>
                : <div style={{ color: "#93C5FD" }}>⏳ Masih berlangsung</div>
              }
              {task.execution_end && task.actual_end && task.execution_end !== task.actual_end && (
                <div style={{ fontSize: 11, color: "#93C5FD" }}>
                  Aktivitas terakhir: {fmtDate(task.execution_end)} (untuk audit, tidak mempengaruhi schedule)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Soft dependencies with threshold */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Dependency (soft — advisory only)
          </label>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, display: "flex", gap: 4, alignItems: "flex-start" }}>
            <Info size={11} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Dependency hanya memberi warning, bukan blocker. Centang item, lalu opsional isi threshold % (contoh: 80 = warning jika dependency belum ≥80% saat pekerjaan ini dimulai).</span>
          </div>
          {candidateDeps.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Tidak ada item lain di level yang sama</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {candidateDeps.map(t => {
                const checked = isChecked(t.id);
                const rule = getRule(t.id);
                return (
                  <div key={t.id} style={{ borderRadius: 8, border: `1px solid ${checked ? C.navy : "var(--border)"}`, background: checked ? C.navyLight : "transparent", overflow: "hidden" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDep(t.id)}
                        style={{ accentColor: C.navy, flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 12, color: C.text, flex: 1 }}>
                        {t.no_urut ? `${t.no_urut}. ` : ""}{t.uraian}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
                        s/d {fmtDateShort(t.planned_end)}
                      </span>
                    </label>
                    {checked && rule && (
                      <div style={{ padding: "0 10px 9px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: C.mid, whiteSpace: "nowrap" }}>Threshold %</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="number"
                            min={0} max={100} step={5}
                            placeholder="kosong = date-based"
                            value={rule.threshold_pct ?? ""}
                            onChange={e => {
                              const v = e.target.value;
                              setThreshold(t.id, v === "" ? null : Math.min(100, Math.max(0, Number(v))));
                            }}
                            style={{ ...smallInp, width: 130 }}
                          />
                          {rule.threshold_pct != null && (
                            <span style={{ fontSize: 11, color: C.mid }}>% progress dep harus tercapai</span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: C.mid }}>Label</span>
                        <input
                          type="text"
                          placeholder="mis. Pedestal siap erection"
                          value={rule.label ?? ""}
                          onChange={e => setLabel(t.id, e.target.value)}
                          style={{ ...smallInp, width: "100%" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {err && (
          <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", fontSize: 13, borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--surface)", cursor: "pointer", color: C.mid }}>
            Batal
          </button>
          <button onClick={handleSave} disabled={loading}
            style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Custom Gantt Bar renderer ────────────────────────────────────────────────

interface GanttBarProps {
  task: GanttTask;
  minDate: Date;
  maxDate: Date;
  totalDays: number;
  dayWidth: number;
  warnings: DependencyWarning[];
  taskMap: Map<string, GanttTask>;
  onEdit: (task: GanttTask) => void;
  canEdit: boolean;
}

function GanttBar({ task, minDate, totalDays, dayWidth, warnings, taskMap, onEdit, canEdit }: GanttBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const hasWarning = warnings.some(w => w.toId === task.id || w.fromId === task.id);
  const hasDanger = warnings.some(w => (w.toId === task.id || w.fromId === task.id) && w.severity === "danger");

  function dateToOffset(d: string | null): number | null {
    if (!d) return null;
    return daysBetween(minDate.toISOString().slice(0, 10), d);
  }

  function toLeft(d: string | null): number | null {
    const off = dateToOffset(d);
    return off !== null ? off * dayWidth : null;
  }

  function toPct(d: string | null): number | null {
    const off = dateToOffset(d);
    return off !== null ? (off / totalDays) * 100 : null;
  }

  const barHeight = task.level === 1 ? 16 : task.level === 2 ? 14 : 12;
  const barMarginTop = task.level === 1 ? 6 : task.level === 2 ? 7 : 8;

  // Planned bar
  const planLeft = task.planned_start ? toPct(task.planned_start) : null;
  const planRight = task.planned_end ? 100 - (toPct(task.planned_end) ?? 0) - (dayWidth / (totalDays * dayWidth) * 100) : null;
  const hasPlan = planLeft !== null && planRight !== null;

  // Actual bar
  const actLeft = task.actual_start ? toPct(task.actual_start) : null;
  const actRight = task.actual_end
    ? 100 - (toPct(task.actual_end) ?? 0) - (dayWidth / (totalDays * dayWidth) * 100)
    : actLeft !== null
      ? 100 - (toPct(new Date().toISOString().slice(0, 10)) ?? 0) - (dayWidth / (totalDays * dayWidth) * 100)
      : null;
  const hasAct = actLeft !== null && actRight !== null;

  const progressWidth = task.actual_pct ?? task.progress_pct;

  const depNames = task.dependencies.map(id => taskMap.get(id)?.uraian ?? id);
  const myWarnings = warnings.filter(w => w.toId === task.id);

  return (
    <div
      style={{ position: "relative", height: 32, width: "100%" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Planned bar (dashed outline) */}
      {hasPlan && (
        <div style={{
          position: "absolute",
          left: `${planLeft}%`,
          right: `${planRight}%`,
          top: barMarginTop,
          height: barHeight,
          borderRadius: 4,
          border: `2px dashed ${task.level === 1 ? C.navy : task.level === 2 ? "#4B5563" : "var(--text-muted)"}`,
          background: task.level === 1 ? "var(--navy-light)" : task.level === 2 ? "var(--surface-hover)" : "#FAFAFA",
          opacity: 0.8,
          pointerEvents: "none",
        }} />
      )}

      {/* Actual bar (solid) */}
      {hasAct && (
        <div style={{
          position: "absolute",
          left: `${actLeft}%`,
          right: `${actRight}%`,
          top: barMarginTop + (hasPlan ? 4 : 0),
          height: barHeight - (hasPlan ? 4 : 0),
          borderRadius: 4,
          background: hasDanger ? C.red : hasWarning
            ? C.yellow
            : task.level === 1 ? C.navy : task.level === 2 ? "#4B5563" : C.blue,
          overflow: "hidden",
          minWidth: 4,
        }}>
          {/* Progress fill */}
          <div style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(100, progressWidth)}%`,
            background: "rgba(255,255,255,0.25)",
            transition: "width 0.4s ease",
          }} />
          {/* Progress % label */}
          {progressWidth > 15 && (
            <span style={{
              position: "absolute",
              left: 6,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--surface)",
              letterSpacing: "0.03em",
              pointerEvents: "none",
            }}>
              {Math.round(progressWidth)}%
            </span>
          )}
        </div>
      )}

      {/* Warning icon */}
      {hasWarning && (
        <div style={{
          position: "absolute",
          right: 2,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 2,
        }}>
          <AlertTriangle size={10} color={hasDanger ? C.red : C.yellow} />
        </div>
      )}

      {/* Edit button on hover */}
      {canEdit && (
        <button
          onClick={() => onEdit(task)}
          style={{
            position: "absolute",
            right: 18,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            opacity: 0,
            color: C.mid,
            transition: "opacity 0.15s",
          }}
          className="gantt-edit-btn"
        >
          <Settings2 size={10} />
        </button>
      )}

      {/* Tooltip */}
      {showTooltip && (hasPlan || hasAct || task.dependencies.length > 0) && (
        <div
          ref={tooltipRef}
          style={{
            position: "absolute",
            top: 34,
            left: "10%",
            zIndex: 100,
            background: "#1F2937",
            color: "var(--surface-subtle)",
            borderRadius: 8,
            padding: "10px 13px",
            fontSize: 11,
            lineHeight: 1.6,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        >
          {hasPlan && (
            <div>📅 Rencana: {fmtDate(task.planned_start)} → {fmtDate(task.planned_end)}</div>
          )}
          {hasAct && (
            <div>🔵 Aktual mulai: {fmtDate(task.actual_start)}</div>
          )}
          {task.actual_end && (
            <div>✅ Selesai (earned): {fmtDate(task.actual_end)}</div>
          )}
          {!task.actual_end && task.actual_start && (
            <div style={{ color: "#6EE7B7" }}>⏳ Masih berlangsung</div>
          )}
          {task.execution_end && task.actual_end && task.execution_end !== task.actual_end && (
            <div style={{ color: "var(--text-muted)", fontSize: 10 }}>📋 Aktivitas terakhir: {fmtDate(task.execution_end)}</div>
          )}
          {progressWidth > 0 && (
            <div>📊 Progress: {Math.round(progressWidth)}%</div>
          )}
          {depNames.length > 0 && (
            <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 4 }}>
              🔗 Dependency: {depNames.join(", ")}
            </div>
          )}
          {myWarnings.map((w, i) => (
            <div key={i} style={{ marginTop: 4, color: w.severity === "danger" ? "#FCA5A5" : "var(--warning-border)" }}>
              ⚠ {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dependency arrows (SVG overlay) ─────────────────────────────────────────

function DependencyArrows({
  tasks,
  warnings,
  rowHeight,
  dayWidth,
  minDate,
  totalDays,
  width,
}: {
  tasks: GanttTask[];
  warnings: DependencyWarning[];
  rowHeight: number;
  dayWidth: number;
  minDate: Date;
  totalDays: number;
  width: number;
}) {
  const taskIndexMap = new Map(tasks.map((t, i) => [t.id, i]));

  function toX(dateStr: string | null): number {
    if (!dateStr) return -1;
    const off = daysBetween(minDate.toISOString().slice(0, 10), dateStr);
    return (off / totalDays) * width;
  }

  const arrows: JSX.Element[] = [];

  for (const task of tasks) {
    if (!task.planned_start || task.dependencies.length === 0) continue;
    const toIdx = taskIndexMap.get(task.id);
    if (toIdx === undefined) continue;

    const toY = toIdx * rowHeight + rowHeight / 2;
    const toX_val = toX(task.planned_start);

    for (const depId of task.dependencies) {
      const dep = tasks.find(t => t.id === depId);
      if (!dep?.planned_end) continue;

      const fromIdx = taskIndexMap.get(depId);
      if (fromIdx === undefined) continue;

      const fromY = fromIdx * rowHeight + rowHeight / 2;
      const fromX = toX(dep.planned_end);

      const isWarning = warnings.some(w => w.fromId === depId && w.toId === task.id);
      const isDanger = warnings.some(w => w.fromId === depId && w.toId === task.id && w.severity === "danger");
      const color = isDanger ? C.red : isWarning ? C.yellow : "var(--text-muted)";

      if (fromX < 0 || toX_val < 0) continue;

      const midX = (fromX + toX_val) / 2;
      const arrowKey = `${depId}-${task.id}`;

      arrows.push(
        <g key={arrowKey}>
          <path
            d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX_val} ${toY}`}
            fill="none"
            stroke={color}
            strokeWidth={isWarning ? 1.5 : 1}
            strokeDasharray={isWarning ? "4,3" : "none"}
            opacity={0.65}
          />
          {/* Arrowhead */}
          <polygon
            points={`${toX_val},${toY} ${toX_val - 6},${toY - 3} ${toX_val - 6},${toY + 3}`}
            fill={color}
            opacity={0.65}
          />
        </g>
      );
    }
  }

  return (
    <svg
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}
      width={width}
      height={tasks.length * rowHeight}
    >
      <defs>
        <filter id="arrow-glow">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {arrows}
    </svg>
  );
}

// ─── Today line ───────────────────────────────────────────────────────────────

function TodayLine({ minDate, totalDays, height }: { minDate: Date; totalDays: number; height: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const off = daysBetween(minDate.toISOString().slice(0, 10), today);
  if (off < 0 || off > totalDays) return null;
  const pct = (off / totalDays) * 100;
  return (
    <div style={{
      position: "absolute",
      left: `${pct}%`,
      top: 0,
      bottom: 0,
      width: 2,
      background: C.red,
      opacity: 0.7,
      pointerEvents: "none",
      zIndex: 5,
    }}>
      <div style={{ position: "absolute", top: 0, left: -18, fontSize: 9, fontWeight: 700, color: C.red, whiteSpace: "nowrap", background: "var(--surface)", padding: "1px 3px", borderRadius: 3 }}>
        Hari ini
      </div>
    </div>
  );
}

// ─── Timeline header ──────────────────────────────────────────────────────────

function TimelineHeader({ minDate, totalDays, viewMode }: { minDate: Date; totalDays: number; viewMode: "week" | "month" }) {
  const cols: { label: string; widthPct: number }[] = [];

  if (viewMode === "month") {
    let cur = new Date(minDate);
    cur.setDate(1);
    while (cur <= new Date(minDate.getTime() + totalDays * 86400000)) {
      const label = cur.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
      const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
      cols.push({ label, widthPct: (daysInMonth / totalDays) * 100 });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  } else {
    // Week view — show week number
    let cur = new Date(minDate);
    while (cur <= new Date(minDate.getTime() + totalDays * 86400000)) {
      const weekLabel = `W${Math.ceil(cur.getDate() / 7)} ${cur.toLocaleDateString("id-ID", { month: "short" })}`;
      cols.push({ label: weekLabel, widthPct: (7 / totalDays) * 100 });
      cur = new Date(cur.getTime() + 7 * 86400000);
    }
  }

  return (
    <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", background: "var(--surface-subtle)" }}>
      {cols.map((col, i) => (
        <div key={i} style={{
          flex: `0 0 ${col.widthPct}%`,
          padding: "6px 4px",
          fontSize: 10,
          fontWeight: 600,
          color: C.mid,
          textAlign: "center",
          borderRight: "1px solid #F3F4F6",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {col.label}
        </div>
      ))}
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export interface GanttSectionProps {
  projectId: string;
  userRole?: string;
  projectStart?: string | null;
  projectEnd?: string | null;
}

export function GanttSection({ projectId, userRole, projectStart, projectEnd }: GanttSectionProps) {
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [showWarnings, setShowWarnings] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(600);

  const canEdit = userRole === "admin" || userRole === "pm";

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/projects/${projectId}/rab/gantt`);
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (!chartRef.current) return;
    const ro = new ResizeObserver(entries => {
      setChartWidth(entries[0].contentRect.width);
    });
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute date range
  const allDates = tasks.flatMap(t => [t.planned_start, t.planned_end, t.actual_start, t.actual_end].filter(Boolean) as string[]);
  if (projectStart) allDates.push(projectStart);
  if (projectEnd) allDates.push(projectEnd);

  const minDateStr = allDates.length > 0
    ? allDates.reduce((a, b) => a < b ? a : b)
    : new Date().toISOString().slice(0, 10);
  const maxDateStr = allDates.length > 0
    ? allDates.reduce((a, b) => a > b ? a : b)
    : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  // Pad 14 days each side
  const minDate = new Date(new Date(minDateStr).getTime() - 14 * 86400000);
  const maxDate = new Date(new Date(maxDateStr).getTime() + 14 * 86400000);
  const totalDays = Math.max(30, daysBetween(minDate.toISOString().slice(0, 10), maxDate.toISOString().slice(0, 10)));
  const dayWidth = chartWidth / totalDays;

  const warnings = detectWarnings(tasks);
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // Filter visible tasks (collapse logic)
  const visibleTasks = tasks.filter(t => {
    if (!t.parent_id) return true;
    // Check if any ancestor is collapsed
    let pid: string | null = t.parent_id;
    while (pid) {
      if (collapsed.has(pid)) return false;
      pid = taskMap.get(pid)?.parent_id ?? null;
    }
    return true;
  });

  const tasksWithDates = tasks.filter(t => t.planned_start || t.actual_start);
  const ROW_HEIGHT = 32;

  // Style to show edit button on row hover
  const ganttStyle = `
    .gantt-row:hover .gantt-edit-btn { opacity: 1 !important; }
  `;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <Loader2 size={20} style={{ color: C.mid }} className="animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Calendar size={16} style={{ color: C.navy }} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Gantt Chart</h3>
        </div>
        <div style={{ textAlign: "center", padding: "32px 16px", color: C.muted }}>
          <Calendar size={28} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 500 }}>RAB belum diupload</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Upload RAB Excel untuk memulai perencanaan timeline</div>
        </div>
      </div>
    );
  }

  if (tasksWithDates.length === 0) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={16} style={{ color: C.navy }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Gantt Chart</h3>
          </div>
        </div>
        <div style={{ textAlign: "center", padding: "32px 16px", color: C.muted }}>
          <Calendar size={28} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 500 }}>Belum ada tanggal rencana</div>
          {canEdit && (
            <div style={{ fontSize: 12, marginTop: 4 }}>Klik tombol edit di setiap item RAB untuk mengisi tanggal mulai dan selesai</div>
          )}
        </div>
        {/* Still show table so user can set dates */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid #E5E7EB" }}>
                {["No", "Uraian Pekerjaan", "Bobot %", "Progress %", "Mulai Rencana", "Selesai Rencana", canEdit ? "Edit" : ""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: C.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.slice(0, 30).map(t => (
                <tr key={t.id} className="gantt-row" style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "7px 10px", color: C.muted, fontWeight: 600, fontSize: 11 }}>{t.no_urut ?? ""}</td>
                  <td style={{ padding: "7px 10px", color: C.text, paddingLeft: t.level === 2 ? 24 : t.level === 3 ? 40 : 10 }}>{t.uraian}</td>
                  <td style={{ padding: "7px 10px", color: C.mid }}>{t.weight_pct > 0 ? `${t.weight_pct.toFixed(2)}%` : "—"}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 48, height: 4, background: "var(--border)", borderRadius: 2 }}>
                        <div style={{ width: `${Math.min(100, t.progress_pct)}%`, height: "100%", background: C.navy, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.mid }}>{t.progress_pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "7px 10px", color: t.planned_start ? C.text : C.muted }}>{fmtDate(t.planned_start)}</td>
                  <td style={{ padding: "7px 10px", color: t.planned_end ? C.text : C.muted }}>{fmtDate(t.planned_end)}</td>
                  {canEdit && (
                    <td style={{ padding: "7px 10px" }}>
                      <button onClick={() => setEditingTask(t)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.mid, padding: 4 }}>
                        <Settings2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editingTask && (
          <EditDateModal
            task={editingTask}
            allTasks={tasks}
            projectId={projectId}
            onClose={() => setEditingTask(null)}
            onSaved={() => { setEditingTask(null); fetchTasks(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <style>{ganttStyle}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={16} style={{ color: C.navy }} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Gantt Chart</h3>
          <span style={{ fontSize: 12, color: C.muted }}>{tasksWithDates.length} item terjadwal</span>
          {warnings.length > 0 && showWarnings && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: C.yellowBg, color: C.yellow, border: `1px solid ${C.yellowBorder}` }}>
              <AlertTriangle size={11} /> {warnings.length} potensi overlap
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {warnings.length > 0 && (
            <button
              onClick={() => setShowWarnings(w => !w)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${C.yellowBorder}`, background: showWarnings ? C.yellowBg : "var(--surface)", color: C.yellow, cursor: "pointer" }}
            >
              <AlertTriangle size={11} /> {showWarnings ? "Sembunyikan" : "Tampilkan"} Warning
            </button>
          )}
          <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden" }}>
            {(["month", "week"] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: viewMode === mode ? C.navy : "var(--surface)", color: viewMode === mode ? "var(--surface)" : C.mid }}>
                {mode === "month" ? "Bulan" : "Minggu"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Warning list */}
      {showWarnings && warnings.length > 0 && (
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 12px", borderRadius: 8, fontSize: 12,
              background: w.severity === "danger" ? C.redBg : C.yellowBg,
              border: `1px solid ${w.severity === "danger" ? C.redBorder : C.yellowBorder}`,
              color: w.severity === "danger" ? C.red : C.yellow,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{w.message}</div>
              <div style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
                {w.severity === "danger" ? "KRITIS" : "PERHATIAN"}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.muted, paddingLeft: 4 }}>
            <Info size={10} style={{ display: "inline", marginRight: 3 }} />
            Warning bersifat advisory — PM dapat mengabaikan jika pekerjaan memang paralel
          </div>
        </div>
      )}

      {/* Gantt body */}
      <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>

          {/* Left panel: WBS tree */}
          <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid #E5E7EB", background: "#FAFAFA" }}>
            {/* Header */}
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #E5E7EB", background: "var(--surface-subtle)", height: 33, display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Uraian Pekerjaan</span>
            </div>
            {/* Rows */}
            {visibleTasks.map(task => {
              const hasChildren = tasks.some(t => t.parent_id === task.id);
              const isCollapsed = collapsed.has(task.id);
              return (
                <div
                  key={task.id}
                  className="gantt-row"
                  style={{
                    height: ROW_HEIGHT,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 8px 0 " + (task.level === 1 ? "8px" : task.level === 2 ? "20px" : "32px"),
                    borderBottom: "1px solid #F3F4F6",
                    gap: 4,
                    background: task.level === 1 ? "var(--surface-hover)" : "#FAFAFA",
                  }}
                >
                  {hasChildren ? (
                    <button
                      onClick={() => setCollapsed(s => {
                        const next = new Set(s);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      })}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: C.mid, flexShrink: 0 }}
                    >
                      {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </button>
                  ) : (
                    <span style={{ width: 12, flexShrink: 0 }} />
                  )}
                  <span style={{
                    fontSize: task.level === 1 ? 11 : 11,
                    fontWeight: task.level === 1 ? 700 : task.level === 2 ? 600 : 400,
                    color: task.level === 1 ? C.navy : C.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}>
                    {task.no_urut ? `${task.no_urut}. ` : ""}{task.uraian}
                  </span>
                  {task.dependencies.length > 0 && (
                    <Link2 size={9} color={C.muted} style={{ flexShrink: 0 }} />
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setEditingTask(task)}
                      className="gantt-edit-btn"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: C.mid, opacity: 0, flexShrink: 0 }}
                    >
                      <Settings2 size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right panel: Gantt bars */}
          <div style={{ flex: 1, overflowX: "auto" }}>
            <div ref={chartRef} style={{ minWidth: 400, position: "relative" }}>
              {/* Timeline header */}
              <TimelineHeader minDate={minDate} totalDays={totalDays} viewMode={viewMode} />

              {/* Bar rows + SVG arrows */}
              <div style={{ position: "relative" }}>
                <DependencyArrows
                  tasks={visibleTasks}
                  warnings={warnings}
                  rowHeight={ROW_HEIGHT}
                  dayWidth={dayWidth}
                  minDate={minDate}
                  totalDays={totalDays}
                  width={chartWidth}
                />
                <TodayLine minDate={minDate} totalDays={totalDays} height={visibleTasks.length * ROW_HEIGHT} />

                {visibleTasks.map(task => (
                  <div
                    key={task.id}
                    className="gantt-row"
                    style={{
                      height: ROW_HEIGHT,
                      borderBottom: "1px solid #F3F4F6",
                      position: "relative",
                      background: task.level === 1 ? "var(--surface-subtle)" : "var(--surface)",
                    }}
                  >
                    <GanttBar
                      task={task}
                      minDate={minDate}
                      maxDate={maxDate}
                      totalDays={totalDays}
                      dayWidth={dayWidth}
                      warnings={showWarnings ? warnings : []}
                      taskMap={taskMap}
                      onEdit={setEditingTask}
                      canEdit={canEdit}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid #E5E7EB", background: "var(--surface-subtle)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Legenda:</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.mid }}>
            <div style={{ width: 24, height: 8, border: `2px dashed ${C.navy}`, borderRadius: 2, background: "var(--navy-light)" }} />
            Rencana
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.mid }}>
            <div style={{ width: 24, height: 8, background: C.navy, borderRadius: 2 }} />
            Aktual
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.mid }}>
            <div style={{ width: 24, height: 8, background: C.yellow, borderRadius: 2 }} />
            Warning
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.mid }}>
            <div style={{ width: 2, height: 16, background: C.red, borderRadius: 1 }} />
            Hari ini
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.mid }}>
            <Link2 size={11} color={C.muted} />
            Ada dependency
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editingTask && (
        <EditDateModal
          task={editingTask}
          allTasks={tasks}
          projectId={projectId}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); fetchTasks(); }}
        />
      )}
    </div>
  );
}

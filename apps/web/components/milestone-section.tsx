"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flag, Plus, Check, MoreHorizontal, Pencil, Trash2, Loader2, CalendarDays } from "lucide-react";
import { getMilestones, updateMilestone, deleteMilestone } from "@/lib/api";
import type { Milestone } from "@/lib/api";
import { MilestoneModal } from "@/components/milestone-modal";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MilestoneSectionProps {
  projectId: string;
  userRole?: string;
}

// ─── Status logic ─────────────────────────────────────────────────────────────

type MilestoneStatusKey = "selesai" | "terlambat" | "berlangsung" | "menunggu";

interface StatusConfig {
  label: string;
  bg: string;
  color: string;
  dot: string;
}

const STATUS_CONFIG: Record<MilestoneStatusKey, StatusConfig> = {
  selesai:     { label: "Selesai",     bg: "#dcfce7", color: "var(--success)", dot: "#16a34a" },
  terlambat:   { label: "Terlambat",   bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
  berlangsung: { label: "Berlangsung", bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  menunggu:    { label: "Menunggu",    bg: "#f8fafc", color: "#64748b", dot: "#94a3b8" },
};

function getMilestoneStatus(m: Milestone): MilestoneStatusKey {
  if (m.completed_at) return "selesai";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(m.target_date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)  return "terlambat";
  if (diffDays <= 14) return "berlangsung";
  return "menunggu";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MilestoneSection({ projectId, userRole }: MilestoneSectionProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<Milestone | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const mounted = useRef(false);

  const canEdit = userRole === "admin" || userRole === "pm";

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMilestones(projectId);
      if (mounted.current) setMilestones(res.data);
    } catch {
      // silent — empty state shown
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    mounted.current = true;
    fetchAll();
    return () => { mounted.current = false; };
  }, [fetchAll]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openMenuId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleToggle(m: Milestone) {
    if (!canEdit || togglingId) return;
    setTogglingId(m.id);
    const wasSelesai = Boolean(m.completed_at);
    const patch = wasSelesai
      ? { completed_at: null as string | null, status: "pending" }
      : { completed_at: new Date().toISOString().split("T")[0], status: "completed" };

    // Optimistic update
    setMilestones(prev =>
      prev.map(x => x.id === m.id ? { ...x, ...patch } : x)
    );

    try {
      const res = await updateMilestone(projectId, m.id, patch);
      if (mounted.current) {
        setMilestones(prev => prev.map(x => x.id === m.id ? res.data : x));
      }
    } catch {
      // Revert on error
      if (mounted.current) {
        setMilestones(prev => prev.map(x => x.id === m.id ? m : x));
      }
    } finally {
      if (mounted.current) setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteId || deleting) return;
    setDeleting(true);
    try {
      await deleteMilestone(projectId, deleteId);
      if (mounted.current) {
        setMilestones(prev => prev.filter(m => m.id !== deleteId));
        setDeleteId(null);
      }
    } catch {
      // keep dialog open on error
    } finally {
      if (mounted.current) setDeleting(false);
    }
  }

  function handleSuccessCreate(m: Milestone) {
    setMilestones(prev => {
      const updated = [...prev, m].sort((a, b) =>
        new Date(a.target_date).getTime() - new Date(b.target_date).getTime()
      );
      return updated;
    });
  }

  function handleSuccessEdit(m: Milestone) {
    setMilestones(prev =>
      prev.map(x => x.id === m.id ? m : x).sort((a, b) =>
        new Date(a.target_date).getTime() - new Date(b.target_date).getTime()
      )
    );
    setEditTarget(null);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const done  = milestones.filter(m => Boolean(m.completed_at)).length;
  const total = milestones.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        padding: 24,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 20,
        }}>
          <h2 style={{
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600,
            color: "var(--text-primary)", margin: 0,
          }}>
            <span style={{ width: 3, height: 16, background: "var(--navy)", borderRadius: 2, flexShrink: 0 }} />
            <Flag size={16} style={{ color: "var(--navy)" }} />
            Milestone
            {total > 0 && !loading && (
              <span style={{
                fontSize: 11, fontWeight: 600, color: "var(--navy)",
                background: "var(--navy-light)", padding: "2px 8px", borderRadius: 99,
              }}>
                {done}/{total} selesai
              </span>
            )}
          </h2>

          {canEdit && (
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, border: "none",
                background: "var(--navy)", color: "#ffffff",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "background 0.15s", flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#002244"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--navy)"; }}
            >
              <Plus size={14} />
              Tambah
            </button>
          )}
        </div>

        {/* Progress bar summary */}
        {total > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Progres milestone</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)" }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99,
                width: `${pct}%`,
                background: pct === 100 ? "#10b981" : "var(--navy)",
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 56, borderRadius: 12,
                background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.4s infinite",
              }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && milestones.length === 0 && (
          <div style={{
            padding: "40px 16px", textAlign: "center",
            border: "1.5px dashed #e2e8f0", borderRadius: 12,
            background: "#fafafa",
          }}>
            <CalendarDays size={32} style={{ color: "#cbd5e1", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "#64748b", margin: "0 0 4px" }}>
              Belum ada milestone
            </p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {canEdit ? 'Klik "Tambah" untuk menetapkan target pencapaian' : "Milestone akan ditampilkan di sini"}
            </p>
          </div>
        )}

        {/* Milestone list */}
        {!loading && milestones.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {milestones.map(m => {
              const statusKey = getMilestoneStatus(m);
              const cfg = STATUS_CONFIG[statusKey];
              const isSelesai = statusKey === "selesai";
              const isToggling = togglingId === m.id;

              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "12px 14px", borderRadius: 12,
                    border: "1px solid",
                    borderColor: isSelesai ? "#bbf7d0" : "#f1f5f9",
                    background: isSelesai ? "#f0fdf4" : "#fafafa",
                    transition: "background 0.2s, border-color 0.2s",
                  }}
                >
                  {/* Checkbox circle */}
                  <button aria-label={isSelesai ? "Tandai belum selesai" : "Tandai selesai"}
                    type="button"
                    onClick={() => handleToggle(m)}
                    disabled={!canEdit || Boolean(togglingId)}
                    title={isSelesai ? "Tandai belum selesai" : "Tandai selesai"}
                    style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      border: `2px solid ${isSelesai ? "#16a34a" : "#cbd5e1"}`,
                      background: isSelesai ? "#16a34a" : "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: canEdit ? "pointer" : "default",
                      transition: "background 0.2s, border-color 0.2s",
                    }}
                  >
                    {isToggling
                      ? <Loader2 size={11} style={{ color: isSelesai ? "white" : "#94a3b8", animation: "spin 0.8s linear infinite" }} />
                      : isSelesai
                        ? <Check size={12} color="white" strokeWidth={3} />
                        : null
                    }
                  </button>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: isSelesai ? "var(--success)" : "#0f172a",
                      margin: "0 0 4px",
                      textDecoration: isSelesai ? "line-through" : "none",
                      opacity: isSelesai ? 0.75 : 1,
                    }}>
                      {m.title}
                    </p>
                    {m.description && (
                      <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px", lineHeight: 1.5 }}>
                        {m.description}
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* Status badge */}
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                        background: cfg.bg, color: cfg.color,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                        {cfg.label}
                      </span>
                      {/* Target date */}
                      <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                        <CalendarDays size={11} />
                        {fmtDate(m.target_date)}
                      </span>
                      {/* Completed date */}
                      {m.completed_at && (
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          · selesai {fmtDate(m.completed_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ⋯ menu */}
                  {canEdit && (
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === m.id ? null : m.id);
                        }}
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: "none",
                          background: "transparent", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#94a3b8", transition: "background 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {openMenuId === m.id && (
                        <div
                          style={{
                            position: "absolute", top: "100%", right: 0, zIndex: 100,
                            marginTop: 4, minWidth: 140,
                            background: "white", borderRadius: 10,
                            border: "1px solid #e2e8f0",
                            boxShadow: "0 8px 24px -4px rgba(0,0,0,0.12)",
                            overflow: "hidden",
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => { setEditTarget(m); setModalOpen(true); setOpenMenuId(null); }}
                            style={{
                              width: "100%", padding: "9px 14px", border: "none",
                              background: "none", textAlign: "left", cursor: "pointer",
                              fontSize: 13, color: "#374151",
                              display: "flex", alignItems: "center", gap: 8,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                          >
                            <Pencil size={13} style={{ color: "var(--text-secondary)" }} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDeleteId(m.id); setOpenMenuId(null); }}
                            style={{
                              width: "100%", padding: "9px 14px", border: "none",
                              background: "none", textAlign: "left", cursor: "pointer",
                              fontSize: 13, color: "#b91c1c",
                              display: "flex", alignItems: "center", gap: 8,
                              borderTop: "1px solid #f3f4f6",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                          >
                            <Trash2 size={13} />
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      <MilestoneModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        projectId={projectId}
        milestone={editTarget}
        onSuccess={editTarget ? handleSuccessEdit : handleSuccessCreate}
      />

      {/* Delete confirm */}
      {deleteId && (() => {
        const m = milestones.find(x => x.id === deleteId);
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1050,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(15,23,42,0.55)",
              backdropFilter: "blur(6px)",
            }} onClick={() => !deleting && setDeleteId(null)} />
            <div style={{
              position: "relative", width: "100%", maxWidth: 420,
              background: "white", borderRadius: 18, overflow: "hidden",
              boxShadow: "0 24px 64px -12px rgba(0,0,0,0.22)",
            }}>
              <div style={{ height: 4, background: "linear-gradient(90deg, #dc2626, #ef4444)" }} />
              <div style={{ padding: "24px 24px 20px" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: "#fef2f2",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
                }}>
                  <Trash2 size={20} style={{ color: "#dc2626" }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", margin: "0 0 8px" }}>
                  Hapus Milestone?
                </h3>
                <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
                  Milestone <strong style={{ color: "#0f172a" }}>{m?.title}</strong> akan dihapus secara permanen.
                </p>
              </div>
              <div style={{
                padding: "0 24px 20px", display: "flex", justifyContent: "flex-end", gap: 8,
              }}>
                <button
                  onClick={() => setDeleteId(null)}
                  disabled={deleting}
                  style={{
                    padding: "8px 16px", borderRadius: 10, border: "1px solid #e2e8f0",
                    background: "white", fontSize: 13, fontWeight: 500, color: "#475569", cursor: "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: "8px 20px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600,
                    background: deleting ? "#fca5a5" : "#dc2626", color: "white",
                    cursor: deleting ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    minWidth: 100, justifyContent: "center",
                  }}
                >
                  {deleting
                    ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Menghapus…</>
                    : <><Trash2 size={13} /> Hapus</>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}

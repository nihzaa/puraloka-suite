"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flag, Plus, Check, MoreHorizontal, Pencil, Trash2, Loader2, CalendarDays } from "lucide-react";
import { getMilestones, updateMilestone, deleteMilestone } from "@/lib/api";
import type { Milestone } from "@/lib/api";
import { MilestoneModal } from "@/components/milestone-modal";
import { useTutupEsc } from "@/lib/use-tutup-esc";

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
  selesai:     { label: "Selesai",     bg: "var(--success-bg)", color: "var(--success)", dot: "var(--success)" },
  terlambat:   { label: "Terlambat",   bg: "var(--danger-bg)", color: "var(--danger)", dot: "var(--danger)" },
  berlangsung: { label: "Berlangsung", bg: "var(--info-bg)", color: "var(--info)", dot: "var(--info)" },
  menunggu:    { label: "Menunggu",    bg: "var(--surface-subtle)", color: "var(--text-muted)", dot: "var(--text-muted)" },
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

  // WCAG 2.1.2 "No Keyboard Trap". Modal konfirmasi hapus di bawah hanya bisa
  // ditutup dengan mengklik latarnya — pemakai keyboard TERJEBAK: modal
  // terbuka, Tab berputar di dalamnya, dan satu-satunya jalan keluar adalah
  // mengambil tetikus.
  //
  // Dipasang di sini, bukan di dalam blok modalnya: modal itu dirender dari
  // IIFE, dan hook tak boleh dipanggil dari sana.
  //
  // `null` saat sedang menghapus — menutup modal di tengah permintaan
  // membuat orang tak tahu apakah penghapusannya jadi atau tidak.
  useTutupEsc(deleteId && !deleting ? () => setDeleteId(null) : null);

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
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "var(--naik-1)",
        padding: 24,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 20,
        }}>
          <h2 style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600,
            color: "var(--text-primary)", margin: 0,
          }}>
            <span style={{ width: 3, height: 16, background: "var(--navy)", borderRadius: 0, flexShrink: 0 }} />
            <Flag size={16} style={{ color: "var(--navy)" }} />
            Milestone
            {total > 0 && !loading && (
              <span style={{
                fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--navy)",
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
                padding: "8px 12px", borderRadius: 10, border: "none",
                background: "var(--grad-aksen)", color: "var(--surface)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "background 0.15s", flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
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
            <div style={{ height: 6, background: "var(--surface-hover)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99,
                width: `${pct}%`,
                background: pct === 100 ? "var(--success)" : "var(--navy)",
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 56, borderRadius: 10,
                background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)",
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
            border: "1.5px dashed #e2e8f0", borderRadius: 10,
            background: "var(--surface-subtle)",
          }}>
            <CalendarDays size={32} style={{ color: "var(--data-diam)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", margin: "0 0 4px" }}>
              Belum ada milestone
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
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
                    padding: "12px 12px", borderRadius: 10,
                    border: "1px solid",
                    borderColor: isSelesai ? "var(--success-border)" : "var(--surface-hover)",
                    background: isSelesai ? "var(--success-bg)" : "var(--surface-subtle)",
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
                      border: `2px solid ${isSelesai ? "var(--success)" : "var(--data-diam)"}`,
                      // `var(--surface)`, BUKAN `"white"` dipaku: di mode gelap
                      // putih literal membuat kotak centang yang BELUM selesai
                      // jadi bulatan terang menyala di antara UI gelap — lebih
                      // menonjol daripada yang sudah selesai, kebalikan dari
                      // maksudnya.
                      background: isSelesai ? "var(--success)" : "var(--surface)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: canEdit ? "pointer" : "default",
                      transition: "background 0.2s, border-color 0.2s",
                    }}
                  >
                    {isToggling
                      ? <Loader2 size={11} style={{ color: isSelesai ? "white" : "var(--text-muted)", animation: "spin 0.8s linear infinite" }} />
                      : isSelesai
                        ? <Check size={12} color="white" strokeWidth={3} />
                        : null
                    }
                  </button>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: isSelesai ? "var(--success)" : "var(--text-primary)",
                      margin: "0 0 4px",
                      // TANPA `opacity`: coretan sudah menandai "selesai", dan
                      // warna `--success` sendiri lolos 5,02:1. `opacity: 0.75`
                      // menjatuhkannya di bawah ambang — kelas cacat yang sama
                      // muncul EMPAT kali di sesi ini (sidebar, lencana EVM,
                      // kartu finansial, garis "Hari ini"), dan tak satu pun
                      // terlihat oleh pemindai statis.
                      textDecoration: isSelesai ? "line-through" : "none",
                    }}>
                      {m.title}
                    </p>
                    {m.description && (
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px", lineHeight: 1.5 }}>
                        {m.description}
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* Status badge */}
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: "var(--t-kecil)", fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                        background: cfg.bg, color: cfg.color,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                        {cfg.label}
                      </span>
                      {/* Target date */}
                      <span style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                        <CalendarDays size={11} />
                        {fmtDate(m.target_date)}
                      </span>
                      {/* Completed date */}
                      {m.completed_at && (
                        <span style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>
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
                        aria-label="Menu aksi milestone"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === m.id ? null : m.id);
                        }}
                        style={{
                          width: 28, height: 28, borderRadius: 6, border: "none",
                          background: "transparent", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--text-muted)", transition: "background 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {openMenuId === m.id && (
                        <div
                          style={{
                            position: "absolute", top: "100%", right: 0, zIndex: 100,
                            marginTop: 4, minWidth: 140,
                            background: "var(--surface)", borderRadius: 10,
                            border: "1px solid var(--border)",
                            boxShadow: "var(--naik-2)",
                            overflow: "hidden",
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => { setEditTarget(m); setModalOpen(true); setOpenMenuId(null); }}
                            style={{
                              width: "100%", padding: "8px 12px", border: "none",
                              background: "none", textAlign: "left", cursor: "pointer",
                              fontSize: 13, color: "var(--text-secondary)",
                              display: "flex", alignItems: "center", gap: 8,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-subtle)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                          >
                            <Pencil size={13} style={{ color: "var(--text-secondary)" }} />
                            Edit
                          </button>
                          <button aria-label="Hapus milestone"
                            type="button"
                            onClick={() => { setDeleteId(m.id); setOpenMenuId(null); }}
                            style={{
                              width: "100%", padding: "8px 12px", border: "none",
                              background: "none", textAlign: "left", cursor: "pointer",
                              fontSize: 13, color: "var(--danger)",
                              display: "flex", alignItems: "center", gap: 8,
                              borderTop: "1px solid var(--surface-hover)",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; }}
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
            padding: "var(--pad-kartu-lega)",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(15,23,42,0.55)",
              backdropFilter: "blur(6px)",
            }} onClick={() => !deleting && setDeleteId(null)} />
            <div style={{
              position: "relative", width: "100%", maxWidth: 420,
              background: "var(--surface)", borderRadius: 18, overflow: "hidden",
              boxShadow: "var(--naik-3)",
            }}>
              <div style={{ height: 4, background: "linear-gradient(90deg, var(--danger), var(--danger))" }} />
              <div style={{ padding: "24px 24px 20px" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: "var(--danger-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
                }}>
                  <Trash2 size={20} style={{ color: "var(--danger)" }} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
                  Hapus Milestone?
                </h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                  Milestone <strong style={{ color: "var(--text-primary)" }}>{m?.title}</strong> akan dihapus secara permanen.
                </p>
              </div>
              <div style={{
                padding: "0 24px 20px", display: "flex", justifyContent: "flex-end", gap: 8,
              }}>
                <button
                  onClick={() => setDeleteId(null)}
                  disabled={deleting}
                  style={{
                    padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)",
                    background: "var(--surface)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", cursor: "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: "8px 20px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600,
                    background: deleting ? "#fca5a5" : "var(--danger)", color: "white",
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

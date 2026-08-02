"use client";

import { useEffect, useReducer, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import {
  HardHat, Plus, Trash2, X, ChevronDown, ChevronRight,
  Wrench, Calendar, Banknote, CreditCard,
} from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  orange: "#C2410C", orangeBg: "#FFF7ED",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const PAYMENT_SYSTEM_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  harian:       { label: "Harian",     color: C.navy,   bg: C.navyLight },
  borongan:     { label: "Borongan",   color: C.green,  bg: C.greenBg },
  progress_pct: { label: "Progress %", color: "#7C3AED", bg: "#F5F3FF" },
};

export interface KasbonItem {
  id: string;
  amount: number;
  status: string;
  kasbon_date: string;
  purpose: string;
  notes: string | null;
}

export interface WorkScope {
  id: string; scope_name: string; description: string | null;
  payment_system: "harian" | "borongan" | "progress_pct";
  borongan_value: number | null; progress_pct_done: number;
  status: string; start_date: string | null; end_date: string | null;
  kasbons?: KasbonItem[];
}

export interface MandorAssignment {
  id: string; status: string; assigned_at: string; notes: string | null;
  mandor: { id: string; name: string; phone: string | null } | null;
  assigner: { id: string; name: string } | null;
  work_scopes: WorkScope[];
}

interface MandorUser {
  id: string; name: string; phone: string | null;
}

function useMounted() {
  const [mounted, dispatch] = useReducer(() => true, false);
  useEffect(() => { dispatch(); }, []);
  return mounted;
}

// Compact dual progress bar: progress fisik (navy) + kasbon (orange)
function ScopeBars({ scope, scopeTotal }: { scope: WorkScope; scopeTotal: number }) {
  const kasbons = scope.kasbons ?? [];
  const kasbonActive = kasbons
    .filter(k => k.status === "approved" || k.status === "pending")
    .reduce((s, k) => s + Number(k.amount), 0);
  const progressPct = Math.min(100, scope.progress_pct_done ?? 0);

  // Kasbon bar: ratio vs borongan_value (if available), else show as amount
  const hasValue = !!scope.borongan_value && Number(scope.borongan_value) > 0;
  const kasbonPct = hasValue ? Math.min(100, (kasbonActive / Number(scope.borongan_value)) * 100) : null;

  if (progressPct === 0 && kasbonActive === 0) return null;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {progressPct > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.mid, marginBottom: 2 }}>
            <span>Progress Fisik</span>
            <span style={{ fontWeight: 600 }}>{progressPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${progressPct}%`,
              background: C.navy,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}
      {kasbonActive > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.mid, marginBottom: 2 }}>
            <span>Kasbon Beredar</span>
            <span style={{ fontWeight: 600, color: C.orange }}>
              {fmt(kasbonActive)}
              {kasbonPct !== null && ` (${kasbonPct.toFixed(0)}% nilai)`}
            </span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: kasbonPct !== null ? `${kasbonPct}%` : "100%",
              background: C.orange,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export function MandorSection({
  projectId,
  assignments,
  scopelessKasbons = [],
  canEdit,
  onRefresh,
}: {
  projectId: string;
  assignments: MandorAssignment[];
  scopelessKasbons?: KasbonItem[];
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [addScopeFor, setAddScopeFor] = useState<MandorAssignment | null>(null);
  const [deletingScopeId, setDeletingScopeId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Project-level kasbon summary
  const allScopes = assignments.flatMap(a => a.work_scopes ?? []);
  const scopeKasbonTotal = allScopes.flatMap(ws => ws.kasbons ?? [])
    .filter(k => k.status === "approved" || k.status === "pending")
    .reduce((s, k) => s + Number(k.amount), 0);
  const scopelessKasbonTotal = scopelessKasbons
    .filter(k => k.status === "approved" || k.status === "pending")
    .reduce((s, k) => s + Number(k.amount), 0);
  const totalKasbon = scopeKasbonTotal + scopelessKasbonTotal;

  async function handleDeactivate(assignmentId: string) {
    if (!confirm("Nonaktifkan penugasan mandor ini?")) return;
    setDeactivatingId(assignmentId);
    try {
      await api.patch(`/api/v1/mandor/assignments/${assignmentId}`, { status: "inactive" });
      onRefresh();
    } catch { /* silent */ } finally { setDeactivatingId(null); }
  }

  async function handleDeleteScope(scopeId: string) {
    if (!confirm("Hapus scope pekerjaan ini? Tidak bisa dibatalkan.")) return;
    setDeletingScopeId(scopeId);
    try {
      await api.delete(`/api/v1/mandor/work-scopes/${scopeId}`);
      onRefresh();
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? "Gagal hapus scope";
      alert(msg);
    } finally { setDeletingScopeId(null); }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
          <span style={{ width: 3, height: 16, background: C.navy, borderRadius: 2, flexShrink: 0 }} />
          Mandor & Scope Pekerjaan
        </h2>
        {canEdit && (
          <button
            onClick={() => setShowAssignModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={13} /> Assign Mandor
          </button>
        )}
      </div>

      {/* Project-level kasbon summary bar */}
      {totalKasbon > 0 && (
        <div style={{
          marginBottom: 16, padding: "12px 16px",
          background: C.orangeBg, border: `1px solid #FED7AA`,
          borderRadius: 10, display: "flex", alignItems: "center", gap: 12,
        }}>
          <CreditCard size={16} color={C.orange} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.orange, marginBottom: 4 }}>
              Total Kasbon Beredar di Proyek Ini: {fmt(totalKasbon)}
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.mid, flexWrap: "wrap" }}>
              {scopeKasbonTotal > 0 && <span>Per scope: {fmt(scopeKasbonTotal)}</span>}
              {scopelessKasbonTotal > 0 && <span>Umum (tanpa scope): {fmt(scopelessKasbonTotal)}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {assignments.length === 0 && (
        <div style={{ padding: "40px 24px", textAlign: "center", border: `2px dashed ${C.border}`, borderRadius: 12, color: C.muted }}>
          <HardHat size={32} color={C.border} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Belum ada mandor di-assign</div>
          {canEdit && <div style={{ fontSize: 12 }}>Klik "Assign Mandor" untuk menambahkan</div>}
        </div>
      )}

      {/* Assignment cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {assignments.map(asgn => {
          const isExpanded = expandedIds.has(asgn.id);
          const scopes = asgn.work_scopes ?? [];
          const mandorKasbon = scopes.flatMap(ws => ws.kasbons ?? [])
            .filter(k => k.status === "approved" || k.status === "pending")
            .reduce((s, k) => s + Number(k.amount), 0);
          return (
            <div key={asgn.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "var(--surface)", overflow: "hidden" }}>
              {/* Assignment header */}
              <div
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()   // Spasi jangan menggulir daftar mandor
                    toggleExpand(asgn.id)
                  }
                }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", background: isExpanded ? C.navyLight : "var(--surface)", transition: "background 0.15s" }}
                onClick={() => toggleExpand(asgn.id)}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, background: isExpanded ? C.navy : C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                  <HardHat size={18} color={isExpanded ? "var(--surface)" : C.navy} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{asgn.mandor?.name ?? "—"}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {asgn.mandor?.phone && <span>{asgn.mandor.phone} · </span>}
                    <span>Assign: {new Date(asgn.assigned_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span> · {scopes.length} scope</span>
                    {mandorKasbon > 0 && (
                      <span style={{ color: C.orange }}> · Kasbon: {fmt(mandorKasbon)}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {canEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeactivate(asgn.id); }}
                      disabled={deactivatingId === asgn.id}
                      style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      Nonaktifkan
                    </button>
                  )}
                  {isExpanded ? <ChevronDown size={16} color={C.mid} /> : <ChevronRight size={16} color={C.mid} />}
                </div>
              </div>

              {/* Scopes */}
              {isExpanded && (
                <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${C.border}` }}>
                  {/* Scope list */}
                  {scopes.length === 0 ? (
                    <div style={{ padding: "20px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
                      Belum ada scope pekerjaan
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
                      {scopes.map(scope => {
                        const ps = PAYMENT_SYSTEM_LABEL[scope.payment_system] ?? { label: scope.payment_system, color: C.mid, bg: "var(--surface-hover)" };
                        const scopeKasbon = (scope.kasbons ?? [])
                          .filter(k => k.status === "approved" || k.status === "pending")
                          .reduce((s, k) => s + Number(k.amount), 0);
                        return (
                          <div key={scope.id} style={{ padding: "12px 14px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: ps.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <Wrench size={15} color={ps.color} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{scope.scope_name}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: ps.bg, color: ps.color }}>{ps.label}</span>
                                  {scope.status !== "active" && (
                                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--surface-hover)", color: C.muted }}>{scope.status}</span>
                                  )}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 12, color: C.muted }}>
                                  {scope.borongan_value && (
                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <Banknote size={11} /> {fmt(scope.borongan_value)}
                                    </span>
                                  )}
                                  {scope.start_date && (
                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <Calendar size={11} /> {new Date(scope.start_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                      {scope.end_date && ` – ${new Date(scope.end_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`}
                                    </span>
                                  )}
                                  {scopeKasbon > 0 && (
                                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: C.orange }}>
                                      <CreditCard size={11} /> {fmt(scopeKasbon)}
                                    </span>
                                  )}
                                </div>
                                {scope.description && (
                                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{scope.description}</div>
                                )}
                                {/* Double progress bars */}
                                <ScopeBars scope={scope} scopeTotal={Number(scope.borongan_value ?? 0)} />
                              </div>
                              {canEdit && (
                                <button aria-label="Hapus scope"
                                  onClick={() => handleDeleteScope(scope.id)}
                                  disabled={deletingScopeId === scope.id}
                                  style={{ padding: 5, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.muted, flexShrink: 0 }}
                                  title="Hapus scope"
                                  onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = C.redBg; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "transparent"; }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add scope button */}
                  {canEdit && (
                    <button
                      onClick={() => setAddScopeFor(asgn)}
                      style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1px dashed ${C.navy}`, background: "transparent", color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%", justifyContent: "center" }}
                    >
                      <Plus size={13} /> Tambah Scope Pekerjaan
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showAssignModal && (
        <AssignMandorModal
          projectId={projectId}
          existingMandorIds={assignments.map(a => a.mandor?.id ?? "")}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => { setShowAssignModal(false); onRefresh(); }}
        />
      )}
      {addScopeFor && (
        <AddScopeModal
          assignment={addScopeFor}
          projectId={projectId}
          onClose={() => setAddScopeFor(null)}
          onSuccess={() => { setAddScopeFor(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Modal: Assign Mandor ─────────────────────────────────────────────────────
function AssignMandorModal({ projectId, existingMandorIds, onClose, onSuccess }: {
  projectId: string;
  existingMandorIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [mandors, setMandors] = useState<MandorUser[]>([]);
  const [mandorId, setMandorId] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedAt, setAssignedAt] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ users: MandorUser[] }>("/api/v1/users?role=mandor")
      .then(r => setMandors(r.data.users.filter(u => !existingMandorIds.includes(u.id))))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!mandorId) { setError("Pilih mandor terlebih dahulu"); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/mandor/assignments", {
        project_id: projectId,
        mandor_id: mandorId,
        notes: notes || undefined,
        assigned_at: assignedAt,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal assign mandor");
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: 440, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Assign Mandor</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>Tambah mandor ke proyek ini</p>
          </div>
          <button aria-label="Tutup form assign mandor" onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label htmlFor="mandor-id" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Mandor <span style={{ color: C.red }}>*</span></label>
            <select id="mandor-id" aria-label="Pilih mandor" value={mandorId} onChange={e => setMandorId(e.target.value)} style={inputStyle}>
              <option value="">-- Pilih mandor --</option>
              {mandors.map(m => <option key={m.id} value={m.id}>{m.name}{m.phone ? ` (${m.phone})` : ""}</option>)}
            </select>
            {mandors.length === 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Semua mandor sudah di-assign ke proyek ini</div>}
          </div>
          <div>
            <label htmlFor="assigned-at" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tanggal Assign</label>
            <input id="assigned-at" type="date" value={assignedAt} onChange={e => setAssignedAt(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="notes" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Catatan (opsional)</label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Catatan untuk mandor ini..." style={{ ...inputStyle, resize: "none" }} />
          </div>
          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading || mandors.length === 0} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (loading || mandors.length === 0) ? 0.7 : 1 }}>
              {loading ? "Menyimpan..." : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah Scope Pekerjaan ────────────────────────────────────────────

interface RabCategory {
  id: string;
  category_code: string | null;
  name: string;
  level: string;
  total_price: number | null;
  weight_pct: number;
}

function AddScopeModal({ assignment, projectId: projectIdProp, onClose, onSuccess }: {
  assignment: MandorAssignment;
  projectId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [scopeName, setScopeName] = useState("");
  const [description, setDescription] = useState("");
  const [paymentSystem, setPaymentSystem] = useState<"harian" | "borongan" | "progress_pct">("harian");
  const [boronganValue, setBoronganValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // RAB kategori untuk dropdown opsional
  const [rabCategories, setRabCategories] = useState<RabCategory[]>([]);
  const [rabCategoryId, setRabCategoryId] = useState("");

  // Load RAB kategori jika projectId tersedia
  useEffect(() => {
    if (!projectIdProp) return;
    api.get<{ data: RabCategory[] }>(`/api/v1/projects/${projectIdProp}/rab/categories`)
      .then(res => setRabCategories(res.data.data ?? []))
      .catch(() => {/* no RAB — opsional, non-fatal */});
  }, [projectIdProp]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!scopeName.trim()) { setError("Nama scope wajib diisi"); return; }
    if (paymentSystem !== "harian" && !boronganValue) { setError("Nilai borongan wajib diisi untuk sistem ini"); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/mandor/work-scopes", {
        assignment_id: assignment.id,
        scope_name: scopeName.trim(),
        description: description || undefined,
        payment_system: paymentSystem,
        borongan_value: boronganValue ? parseFloat(boronganValue) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        rab_category_id: rabCategoryId || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal tambah scope");
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  const psOptions: Array<{ value: "harian" | "borongan" | "progress_pct"; label: string; desc: string }> = [
    { value: "harian",       label: "Harian",     desc: "Bayar per hari kerja" },
    { value: "borongan",     label: "Borongan",   desc: "Bayar setelah selesai" },
    { value: "progress_pct", label: "Progress %", desc: "Bayar per % progress" },
  ];

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Tambah Scope Pekerjaan</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>Mandor: {assignment.mandor?.name}</p>
          </div>
          <button aria-label="Tutup form tambah scope pekerjaan" onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label htmlFor="scope-name" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Nama Scope <span style={{ color: C.red }}>*</span></label>
            <input id="scope-name" value={scopeName} onChange={e => setScopeName(e.target.value)} placeholder="Contoh: Pekerjaan Struktur, Pemasangan Dinding..." style={inputStyle} />
          </div>

          <div>
            <span id="sistem-pembayaran" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 8 }}>Sistem Pembayaran <span style={{ color: C.red }}>*</span></span>
            <div role="group" aria-labelledby="sistem-pembayaran" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {psOptions.map(opt => (
                <button
                  key={opt.value} type="button"
                  onClick={() => setPaymentSystem(opt.value)}
                  style={{
                    padding: "10px 8px", borderRadius: 10, border: `2px solid`,
                    borderColor: paymentSystem === opt.value ? C.navy : C.border,
                    background: paymentSystem === opt.value ? C.navyLight : "var(--surface)",
                    cursor: "pointer", textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: paymentSystem === opt.value ? C.navy : C.text }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {paymentSystem !== "harian" && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
                Nilai {paymentSystem === "borongan" ? "Borongan" : "Total Pekerjaan"} <span style={{ color: C.red }}>*</span>
              </label>
              <input type="number" value={boronganValue} onChange={e => setBoronganValue(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="start-date" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tanggal Mulai</label>
              <input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="end-date" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tanggal Selesai</label>
              <input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Opsional: Kaitkan ke sub-kategori RAB */}
          {rabCategories.length > 0 && (
            <div>
              <label htmlFor="rab-category-id" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
                Kaitkan ke Sub-Kategori RAB <span style={{ fontSize: 11, color: C.muted }}>(opsional)</span>
              </label>
              <select id="rab-category-id" aria-label="Kaitkan ke sub-kategori RAB" value={rabCategoryId} onChange={e => setRabCategoryId(e.target.value)} style={inputStyle}>
                <option value="">— Tidak dikaitkan (isi scope manual)</option>
                {rabCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.category_code ? `${cat.category_code}. ` : ""}{cat.name}
                    {cat.total_price ? ` — ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(cat.total_price)}` : ""}
                    {` (bobot ${cat.weight_pct.toFixed(2)}%)`}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Mengaitkan scope mandor ke kategori RAB membantu tracking progress dan budget.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="description" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Deskripsi (opsional)</label>
            <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Detail pekerjaan..." style={{ ...inputStyle, resize: "none" }} />
          </div>

          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Menyimpan..." : "Simpan Scope"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

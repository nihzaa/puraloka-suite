"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
};

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:  { label: "Menunggu",  color: C.yellow, bg: C.yellowBg, icon: <Clock size={14} /> },
  approved: { label: "Disetujui", color: C.green,  bg: C.greenBg,  icon: <CheckCircle size={14} /> },
  rejected: { label: "Ditolak",   color: C.red,    bg: C.redBg,    icon: <XCircle size={14} /> },
  settled:  { label: "Lunas",     color: C.mid,    bg: "var(--surface-hover)",  icon: <CheckCircle size={14} /> },
};

const PURPOSE_OPTIONS = [
  { value: "gaji_tukang", label: "Gaji Tukang" },
  { value: "uang_makan", label: "Uang Makan" },
  { value: "pembelian_alat", label: "Pembelian Alat" },
  { value: "operasional", label: "Operasional" },
  { value: "lain_lain", label: "Lain-lain" },
];

const FUND_OPTIONS = [
  { value: "owner_advance", label: "Uang Muka Pemilik" },
  { value: "client_fund", label: "Dana Klien" },
];

interface ProjectOption { id: string; name: string; }
interface ScopeOption { id: string; scope_name: string; project_id: string; }

export default function MandorKasbonPage() {
  const [kasbons, setKasbons] = useState<any[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");

  const initForm = {
    project_id: "",
    work_scope_id: "",
    amount: "",
    purpose: "gaji_tukang",
    fund_source: "owner_advance",
    notes: "",
    kasbon_date: new Date().toISOString().split("T")[0],
  };
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function loadData() {
    return Promise.all([
      api.get("/api/v1/kasbons"),
      api.get("/api/v1/mandor/scopes"),
    ]).then(([kRes, sRes]) => {
      setKasbons(kRes.data?.kasbons ?? []);

      // Build unique project list from scopes
      const scopeList: any[] = sRes.data?.scopes ?? [];
      setScopes(scopeList.map((s: any) => ({
        id: s.id,
        scope_name: s.scope_name,
        project_id: s.assignment?.project?.id ?? "",
      })));
      const projectMap = new Map<string, ProjectOption>();
      for (const s of scopeList) {
        const p = s.assignment?.project;
        if (p?.id && !projectMap.has(p.id)) {
          projectMap.set(p.id, { id: p.id, name: p.name });
        }
      }
      setProjects(Array.from(projectMap.values()));
    }).finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  // Scopes filtered by selected project
  const filteredScopes = form.project_id
    ? scopes.filter(s => s.project_id === form.project_id)
    : scopes;

  // Reset scope when project changes
  function handleProjectChange(projectId: string) {
    setForm(f => ({ ...f, project_id: projectId, work_scope_id: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project_id && !form.work_scope_id) return;
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    try {
      await api.post("/api/v1/kasbons", {
        project_id: form.project_id || undefined,
        work_scope_id: form.work_scope_id || undefined,
        amount: Number(form.amount),
        purpose: form.purpose,
        fund_source: form.fund_source,
        notes: form.notes || undefined,
        kasbon_date: form.kasbon_date,
      });
      showToast("Kasbon berhasil diajukan");
      setShowModal(false);
      setForm(initForm);
      loadData();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? "Gagal mengajukan kasbon", false);
    } finally {
      setSaving(false);
    }
  }

  const filtered = filter === "all" ? kasbons : kasbons.filter((k) => k.status === filter);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Kasbon</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: C.navy, color: "var(--surface)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          <Plus size={15} />
          Ajukan Kasbon
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "pending", "approved", "rejected", "settled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer",
              border: `1px solid ${filter === s ? C.navy : C.border}`,
              background: filter === s ? C.navyLight : "var(--surface)",
              color: filter === s ? C.navy : C.mid,
            }}
          >
            {s === "all" ? "Semua" : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat kasbon...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 12, padding: 48, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <AlertCircle size={32} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, color: C.mid }}>Belum ada kasbon</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((k) => {
          const meta = STATUS_META[k.status] ?? STATUS_META.pending;
          const scopeName = k.work_scopes?.scope_name;
          const projectName = k.project?.name;
          const context = scopeName ? `${scopeName}${projectName ? ` · ${projectName}` : ""}` : (projectName ?? "Umum");
          return (
            <div key={k.id} style={{
              background: C.surface, borderRadius: 12, padding: "16px 20px",
              border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmt(k.amount)}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.mid }}>
                    {context} · {fmtDate(k.kasbon_date)}
                  </div>
                  {k.notes && (
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>{k.notes}</div>
                  )}
                  {k.status === "rejected" && k.approver && (
                    <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>Ditolak oleh {k.approver.name}</div>
                  )}
                  {k.status === "approved" && k.approver && (
                    <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>Disetujui oleh {k.approver.name}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Ajukan Kasbon */}
      {showModal && typeof window !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowModal(false)} />
          <div style={{ position: "relative", background: C.surface, borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", zIndex: 1, marginTop: 24 }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Ajukan Kasbon</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.mid }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Proyek — required */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>
                  Proyek <span style={{ color: C.red }}>*</span>
                </label>
                <select aria-label="Proyek"
                  value={form.project_id}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  required
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)", boxSizing: "border-box" }}
                >
                  <option value="">Pilih proyek...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Scope Pekerjaan — opsional */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 4 }}>
                  Scope Pekerjaan
                  <span style={{ fontSize: 11, fontWeight: 400, color: C.muted, marginLeft: 6 }}>(opsional)</span>
                </label>
                <p style={{ fontSize: 11, color: C.muted, margin: "0 0 6px" }}>
                  Kosongkan jika kasbon bersifat umum dan tidak terikat scope tertentu.
                </p>
                <select aria-label="Pilih lingkup pekerjaan"
                  value={form.work_scope_id}
                  onChange={(e) => setForm((f) => ({ ...f, work_scope_id: e.target.value }))}
                  disabled={!form.project_id}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1px solid ${C.border}`, fontSize: 13, color: C.text,
                    background: form.project_id ? "var(--surface)" : C.bg, boxSizing: "border-box",
                    opacity: form.project_id ? 1 : 0.6,
                  }}
                >
                  <option value="">— Kasbon umum (tidak terikat scope) —</option>
                  {filteredScopes.map((s) => (
                    <option key={s.id} value={s.id}>{s.scope_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Jumlah (Rp) *</label>
                <input
                  type="number" min="1" placeholder="Contoh: 500000"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Keperluan</label>
                <select aria-label="Tujuan kasbon"
                  value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)" }}
                >
                  {PURPOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Sumber Dana</label>
                <select aria-label="Sumber dana kasbon"
                  value={form.fund_source}
                  onChange={(e) => setForm((f) => ({ ...f, fund_source: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)" }}
                >
                  {FUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal</label>
                <input aria-label="Tanggal"
                  type="date"
                  value={form.kasbon_date}
                  onChange={(e) => setForm((f) => ({ ...f, kasbon_date: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan (opsional)</label>
                <textarea
                  placeholder="Keterangan tambahan..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>
                  Batal
                </button>
                <button type="submit" disabled={saving || !form.project_id} style={{ padding: "9px 20px", borderRadius: 8, background: C.navy, color: "var(--surface)", border: "none", cursor: (saving || !form.project_id) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: (saving || !form.project_id) ? 0.7 : 1 }}>
                  {saving ? "Mengajukan..." : "Ajukan Kasbon"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && typeof window !== "undefined" && createPortal(
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000, padding: "12px 20px", borderRadius: 10, background: toast.ok ? "var(--success)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>,
        document.body
      )}
    </div>
  );
}

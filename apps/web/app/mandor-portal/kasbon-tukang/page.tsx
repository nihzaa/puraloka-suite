"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CreditCard, Plus, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

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

const PURPOSE_LABELS: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
  pembelian_alat: "Beli Alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

export default function KasbonTukangPage() {
  const [kasbons, setKasbons] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form
  const [form, setForm] = useState({
    worker_id: "", project_id: "", scope_id: "",
    amount: "", purpose: "gaji_tukang", kasbon_date: "", notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [kRes, wRes, aRes] = await Promise.all([
        api.get("/api/v1/mandor/worker-kasbons"),
        api.get("/api/v1/mandor/workers"),
        api.get("/api/v1/mandor/assignments"),
      ]);
      setKasbons(kRes.data?.kasbons ?? []);
      setWorkers(wRes.data?.workers ?? []);
      setAssignments(aRes.data?.assignments ?? []);
    } finally {
      setLoading(false);
    }
  }

  const scopesForProject = assignments
    .find((a) => a.project?.id === form.project_id)
    ?.work_scopes ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.worker_id || !form.project_id || !form.amount) {
      setToast({ msg: "Worker, proyek, dan jumlah wajib diisi", ok: false });
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/v1/mandor/worker-kasbons", {
        worker_id: form.worker_id,
        project_id: form.project_id,
        scope_id: form.scope_id || undefined,
        amount: Number(form.amount),
        purpose: form.purpose,
        kasbon_date: form.kasbon_date || undefined,
        notes: form.notes || undefined,
      });
      setToast({ msg: "Kasbon tukang berhasil diajukan", ok: true });
      setShowModal(false);
      setForm({ worker_id: "", project_id: "", scope_id: "", amount: "", purpose: "gaji_tukang", kasbon_date: "", notes: "" });
      await loadData();
    } catch (err: any) {
      setToast({ msg: err.response?.data?.error ?? "Gagal mengajukan kasbon", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  const pending = kasbons.filter((k) => !k.is_settled).length;
  const totalOutstanding = kasbons
    .filter((k) => !k.is_settled)
    .reduce((s, k) => s + (Number(k.amount) - Number(k.amount_settled ?? 0)), 0);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 72, right: 20, zIndex: 999,
          background: toast.ok ? C.greenBg : C.redBg, border: `1px solid ${toast.ok ? C.green : C.red}`,
          color: toast.ok ? C.green : C.red, padding: "12px 20px", borderRadius: 10, fontSize: 14,
          fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", cursor: "pointer",
        }} onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Kasbon Tukang</h1>
          <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>Ajukan kasbon untuk tukang di bawah Anda</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
          border: "none", background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          <Plus size={15} /> Ajukan Kasbon
        </button>
      </div>

      {/* KPI */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.mid, fontWeight: 500, marginBottom: 6 }}>Kasbon Aktif</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.yellow }}>{pending}</div>
          </div>
          <div style={{ background: C.surface, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.mid, fontWeight: 500, marginBottom: 6 }}>Total Outstanding</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.red }}>{fmt(totalOutstanding)}</div>
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: 40, color: C.mid }}>Memuat...</div>}

      {!loading && kasbons.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 12, padding: 40, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <CreditCard size={28} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, color: C.mid }}>Belum ada kasbon tukang</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {kasbons.map((k) => (
          <div key={k.id} style={{
            background: C.surface, borderRadius: 12, padding: "14px 16px",
            border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{k.worker?.name ?? "—"}</div>
                <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>
                  {PURPOSE_LABELS[k.purpose] ?? k.purpose} · {k.project?.name ?? "—"} · {fmtDate(k.kasbon_date)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmt(k.amount)}</div>
                <div style={{ fontSize: 11, color: k.is_settled ? C.green : C.yellow, fontWeight: 500, marginTop: 2 }}>
                  {k.is_settled ? "✓ Lunas" : `Sisa ${fmt(Number(k.amount) - Number(k.amount_settled ?? 0))}`}
                </div>
              </div>
            </div>
            {k.amount_settled > 0 && !k.is_settled && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4, background: C.green,
                    width: `${Math.min(100, (Number(k.amount_settled) / Number(k.amount)) * 100)}%`,
                  }} />
                </div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 3 }}>
                  Dicicil {fmt(k.amount_settled)} dari {fmt(k.amount)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Ajukan */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{
            background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480,
            boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 20px" }}>Ajukan Kasbon Tukang</h2>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Tukang *</label>
                <select value={form.worker_id} onChange={(e) => setForm((f) => ({ ...f, worker_id: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
                  <option value="">Pilih tukang...</option>
                  {workers.filter((w) => w.is_active).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Proyek *</label>
                <select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, scope_id: "" }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
                  <option value="">Pilih proyek...</option>
                  {assignments.map((a) => (
                    <option key={a.project?.id} value={a.project?.id}>{a.project?.name}</option>
                  ))}
                </select>
              </div>
              {scopesForProject.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Scope (opsional)</label>
                  <select value={form.scope_id} onChange={(e) => setForm((f) => ({ ...f, scope_id: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
                    <option value="">Semua scope</option>
                    {scopesForProject.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.scope_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Jumlah (Rp) *</label>
                  <input type="number" min="1" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Tanggal</label>
                  <input type="date" value={form.kasbon_date} onChange={(e) => setForm((f) => ({ ...f, kasbon_date: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Tujuan</label>
                <select value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
                  {Object.entries(PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Catatan</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Opsional"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, resize: "none" }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`,
                  background: "var(--surface)", color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Batal</button>
                <button type="submit" disabled={submitting} style={{
                  flex: 2, padding: "10px", borderRadius: 10, border: "none",
                  background: submitting ? C.mid : C.navy, color: "var(--surface)",
                  fontSize: 13, fontWeight: 600, cursor: submitting ? "wait" : "pointer",
                }}>{submitting ? "Mengajukan..." : "Ajukan Kasbon"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

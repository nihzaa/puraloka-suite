"use client";

import { useCallback, useMemo, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { useData } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { type Kasbon } from "../_bersama/tipe";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

import { C } from "@/lib/warna-ui";

/** `Kasbon` bersama tak punya `approver` — hanya dipakai di halaman ini. */
interface KasbonDenganApprover extends Kasbon {
  approver?: { name: string } | null;
}

/** Bentuk `/api/v1/mandor/scopes` — beda dari `LingkupKerja` (my-scopes). */
interface ScopeApi {
  id: string;
  scope_name: string;
  assignment?: { project?: { id: string; name: string } | null } | null;
}

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
  const [showModal, setShowModal] = useState(false);
  // Modal di portal ini tak punya prop `onClose` — ia dikendalikan state
  // lokal — sehingga penjaga `modal-esc-ratchet` tak menjangkaunya, dan
  // kelima modal portal mandor menjebak pemakai keyboard tanpa terdeteksi.
  // Penjaganya ikut diperluas; ini perbaikan kodenya.
  useTutupEsc(showModal ? () => setShowModal(false) : null);
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

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua GET diam-diam (kasbon + scopes) diganti `useData`. TIDAK ada cache
    offline di jalur BACA halaman ini — `kirimLapangan` di bawah HANYA
    membungkus jalur TULIS (pengajuan kasbon), dan tidak disentuh.
  */
  const { data: dataKasbon, memuat: memuatKasbon, galat: galatMuatKasbon, muatUlang: muatUlangKasbon } =
    useData<{ kasbons: KasbonDenganApprover[] }>("/api/v1/kasbons");
  const { data: dataScopes, memuat: memuatScopes, galat: galatMuatScopes, muatUlang: muatUlangScopes } =
    useData<{ scopes: ScopeApi[] }>("/api/v1/mandor/scopes");

  const loading = memuatKasbon || memuatScopes;
  const galatMuat = galatMuatKasbon ?? galatMuatScopes;

  // Diturunkan, bukan disalin.
  const kasbons = dataKasbon?.kasbons ?? [];
  // `scopeList` sendiri dibungkus `useMemo`: turunan array yang masuk sebagai
  // dependensi `useMemo`/`useCallback` lain butuh referensi stabil, kalau
  // tidak setiap render membuat array baru dan menembus ratchet
  // `exhaustive-deps` (lihat catatan F4-2 jebakan #3 di CLAUDE.md).
  const scopeList: ScopeApi[] = useMemo(() => dataScopes?.scopes ?? [], [dataScopes]);
  const scopes: ScopeOption[] = useMemo(() => scopeList.map((s) => ({
    id: s.id,
    scope_name: s.scope_name,
    project_id: s.assignment?.project?.id ?? "",
  })), [scopeList]);
  const projects: ProjectOption[] = useMemo(() => {
    const projectMap = new Map<string, ProjectOption>();
    for (const s of scopeList) {
      const p = s.assignment?.project;
      if (p?.id && !projectMap.has(p.id)) {
        projectMap.set(p.id, { id: p.id, name: p.name });
      }
    }
    return Array.from(projectMap.values());
  }, [scopeList]);

  const loadData = useCallback(async () => {
    await Promise.all([muatUlangKasbon(), muatUlangScopes()]);
  }, [muatUlangKasbon, muatUlangScopes]);

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
      // F4-3 — lewat antrean offline. Sinyal buruk adalah NORMA di lokasi
      // proyek: tanpa ini, kasbon yang gagal terkirim HILANG dan mandor
      // mengetik ulang, atau mencoba berkali-kali sampai terkirim ganda.
      const hasil = await kirimLapangan("POST", "/api/v1/kasbons", {
        project_id: form.project_id || undefined,
        work_scope_id: form.work_scope_id || undefined,
        amount: Number(form.amount),
        purpose: form.purpose,
        fund_source: form.fund_source,
        notes: form.notes || undefined,
        kasbon_date: form.kasbon_date,
      }, "Kasbon berhasil diajukan", "Gagal mengajukan kasbon");

      showToast(hasil.pesan, hasil.aman);
      // Form hanya dikosongkan bila kirimannya AMAN — kalau tidak, isinya
      // hilang dan mandor harus mengetik ulang dari nol.
      if (!hasil.aman) return;
      setShowModal(false);
      setForm(initForm);
      if (hasil.terkirim) void loadData();
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
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, background: "var(--grad-aksen)", color: "var(--surface)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
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
              padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer",
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

      {!loading && galatMuat && (
        <div role="alert" style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.red }}>
          Gagal memuat kasbon. Coba muat ulang halaman.
        </div>
      )}

      {!loading && !galatMuat && filtered.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 10, padding: 48, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <AlertCircle size={32} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: C.mid }}>Belum ada kasbon</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((k) => {
          const meta = STATUS_META[k.status ?? ""] ?? STATUS_META.pending;
          const scopeName = k.work_scopes?.scope_name;
          const projectName = k.project?.name;
          const context = scopeName ? `${scopeName}${projectName ? ` · ${projectName}` : ""}` : (projectName ?? "Umum");
          return (
            <div key={k.id} style={{
              background: C.surface, borderRadius: 10, padding: "16px 20px",
              border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmt(Number(k.amount))}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.mid }}>
                    {context} · {fmtDate(k.kasbon_date ?? null)}
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
          <div style={{ position: "relative", background: C.surface, borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "var(--naik-3)", zIndex: 1, marginTop: 24 }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Ajukan Kasbon</h2>
              <button aria-label="Tutup dialog kasbon" onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.mid }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Proyek — required */}
              <div>
                <label htmlFor="project-id" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>
                  Proyek <span style={{ color: C.red }}>*</span>
                </label>
                <select id="project-id" aria-label="Proyek"
                  value={form.project_id}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)", boxSizing: "border-box" }}
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
                    width: "100%", padding: "8px 12px", borderRadius: 6,
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
                <label htmlFor="amount" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Jumlah (Rp) *</label>
                <input id="amount"
                  type="number" min="1" placeholder="Contoh: 500000"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label htmlFor="purpose" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Keperluan</label>
                <select id="purpose" aria-label="Tujuan kasbon"
                  value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)" }}
                >
                  {PURPOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="fund-source" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Sumber Dana</label>
                <select id="fund-source" aria-label="Sumber dana kasbon"
                  value={form.fund_source}
                  onChange={(e) => setForm((f) => ({ ...f, fund_source: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)" }}
                >
                  {FUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="kasbon-date" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal</label>
                <input id="kasbon-date" aria-label="Tanggal"
                  type="date"
                  value={form.kasbon_date}
                  onChange={(e) => setForm((f) => ({ ...f, kasbon_date: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label htmlFor="notes" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan (opsional)</label>
                <textarea id="notes"
                  placeholder="Keterangan tambahan..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>
                  Batal
                </button>
                <button type="submit" disabled={saving || !form.project_id} style={{ padding: "8px 20px", borderRadius: 6, background: "var(--grad-aksen)", color: "var(--surface)", border: "none", cursor: (saving || !form.project_id) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: (saving || !form.project_id) ? 0.7 : 1 }}>
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
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000, padding: "12px 20px", borderRadius: 10, background: toast.ok ? "var(--success)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 500, boxShadow: "var(--naik-2)", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>,
        document.body
      )}
    </div>
  );
}

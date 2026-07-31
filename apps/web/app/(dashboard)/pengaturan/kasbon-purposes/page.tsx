"use client";

import { useEffect, useReducer, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Coins, Plus, Check, X, AlertTriangle, Save, EyeOff, Eye } from "lucide-react";
import type { KasbonPurposeRow } from "@/lib/use-kasbon-purposes";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
};
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid #E5E7EB", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", background: "var(--surface)", color: C.text, boxSizing: "border-box", fontFamily: "inherit" };

function hasPerm(key: string): boolean {
  try { const raw = localStorage.getItem("puraloka_permissions"); return raw ? (JSON.parse(raw) as string[]).includes(key) : false; } catch { return false; }
}

export default function KasbonPurposesPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Content />;
}

function Content() {
  const canManage = hasPerm("kasbon_purposes:manage");
  const [rows, setRows] = useState<KasbonPurposeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ purposes: KasbonPurposeRow[] }>("/api/v1/kasbon-purposes", { params: { all: true } });
      setRows(data.purposes ?? []);
    } catch { setToast({ type: "error", msg: "Gagal memuat tujuan kasbon" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-form)", margin: "0 auto" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 24, zIndex: 9999, background: toast.type === "success" ? C.greenBg : C.redBg, border: `1px solid ${toast.type === "success" ? C.greenBorder : C.redBorder}`, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: 13, color: toast.type === "success" ? C.green : C.red }}>
          {toast.type === "success" ? <Check size={14} /> : <AlertTriangle size={14} />}{toast.msg}
        </div>
      )}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Coins size={19} color={C.navy} />
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: C.text, margin: 0 }}>Tujuan Kasbon</h1>
          <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>Sumber tunggal tujuan pengajuan kasbon. Ubah di sini, berlaku di semua form kasbon.</p>
        </div>
      </div>

      {!canManage && (
        <div style={{ marginBottom: 20, padding: "10px 14px", borderRadius: 8, background: "var(--warning-bg)", border: "1px solid #FDE68A", fontSize: 12, color: C.mid }}>
          Anda dapat melihat daftar, tetapi hanya pengguna dengan izin <strong>Kelola Tujuan Kasbon</strong> yang bisa mengubahnya.
        </div>
      )}

      {canManage && <AddCard existing={rows} onDone={() => { load(); setToast({ type: "success", msg: "Tujuan ditambahkan" }); }} onError={(m) => setToast({ type: "error", msg: m })} />}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 14 }}>Memuat...</div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 70px 90px", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <div>Kode</div><div>Nama</div><div>Urutan</div><div style={{ textAlign: "right" }}>Status</div>
          </div>
          {rows.map(r => (
            <RowItem key={r.code} row={r} canManage={canManage}
              onSaved={() => { load(); setToast({ type: "success", msg: `"${r.code}" disimpan` }); }}
              onError={(m) => setToast({ type: "error", msg: m })} />
          ))}
          {rows.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Belum ada tujuan.</div>}
        </div>
      )}
    </div>
  );
}

function AddCard({ existing, onDone, onError }: { existing: KasbonPurposeRow[]; onDone: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const normalized = code.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const dup = existing.some(r => r.code === normalized);

  async function submit() {
    if (!normalized) { onError("Kode wajib (huruf/angka)"); return; }
    if (!label.trim()) { onError("Nama wajib diisi"); return; }
    if (dup) { onError(`Kode "${normalized}" sudah ada`); return; }
    setSaving(true);
    try {
      await api.post("/api/v1/kasbon-purposes", { code: normalized, label: label.trim(), sort_order: 0 });
      setCode(""); setLabel(""); setOpen(false); onDone();
    } catch (err) { onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menambah"); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", marginBottom: 18, borderRadius: 9, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <Plus size={15} /> Tambah Tujuan
      </button>
    );
  }
  return (
    <div style={{ ...card, marginBottom: 18, padding: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 12, alignItems: "end" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Kode (unik)</label>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="cth: transport" style={inputStyle} />
          {code && <div style={{ fontSize: 11, color: dup ? C.red : C.muted, marginTop: 3 }}>disimpan sebagai <code>{normalized || "—"}</code>{dup && " (sudah ada)"}</div>}
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Nama</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="cth: Transport / Ongkos Kirim" style={inputStyle} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={submit} disabled={saving || dup} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: saving || dup ? "#94A3B8" : C.navy, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving || dup ? "not-allowed" : "pointer" }}>
          <Save size={14} /> {saving ? "Menyimpan..." : "Simpan"}
        </button>
        <button onClick={() => setOpen(false)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
      </div>
    </div>
  );
}

function RowItem({ row, canManage, onSaved, onError }: { row: KasbonPurposeRow; canManage: boolean; onSaved: () => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [sortOrder, setSortOrder] = useState(String(row.sort_order));
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try { await api.patch(`/api/v1/kasbon-purposes/${encodeURIComponent(row.code)}`, body); setEditing(false); onSaved(); }
    catch (err) { onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "160px 1fr 70px 90px", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center", fontSize: 13, opacity: row.is_active ? 1 : 0.55 };

  if (editing) {
    return (
      <div style={{ ...rowStyle, gridTemplateColumns: "160px 1fr 70px auto" }}>
        <code style={{ fontSize: 12, color: C.muted }}>{row.code}</code>
        <input value={label} onChange={e => setLabel(e.target.value)} style={inputStyle} />
        <input value={sortOrder} onChange={e => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button aria-label="Simpan" onClick={() => patch({ label, sort_order: Number(sortOrder) || 0 })} disabled={busy} title="Simpan" style={{ padding: 7, borderRadius: 7, border: "none", background: C.green, color: "#fff", cursor: "pointer" }}><Check size={14} /></button>
          <button aria-label="Batal" onClick={() => { setEditing(false); setLabel(row.label); setSortOrder(String(row.sort_order)); }} title="Batal" style={{ padding: 7, borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, cursor: "pointer" }}><X size={14} /></button>
        </div>
      </div>
    );
  }
  return (
    <div style={rowStyle}>
      <code style={{ fontSize: 12, color: C.mid, background: "var(--surface-subtle)", padding: "2px 7px", borderRadius: 6, justifySelf: "start" }}>{row.code}</code>
      <span style={{ color: C.text, fontWeight: 500 }}>{row.label}{!row.is_active && <span style={{ marginLeft: 8, fontSize: 11, color: C.red }}>(nonaktif)</span>}</span>
      <span style={{ color: C.muted }}>{row.sort_order}</span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        {canManage ? (
          <>
            <button aria-label="Edit" onClick={() => setEditing(true)} title="Edit" style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>Edit</button>
            <button onClick={() => patch({ is_active: !row.is_active })} disabled={busy} title={row.is_active ? "Nonaktifkan" : "Aktifkan"} style={{ padding: 6, borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: row.is_active ? C.mid : C.green, cursor: "pointer" }}>
              {row.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </>
        ) : <span style={{ fontSize: 11, color: row.is_active ? C.green : C.muted }}>{row.is_active ? "Aktif" : "Nonaktif"}</span>}
      </div>
    </div>
  );
}

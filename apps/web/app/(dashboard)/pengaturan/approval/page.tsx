"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { api } from "@/lib/api";
import { GitBranch, Plus, Trash2, Check, X, AlertTriangle, Info } from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  amber: "var(--warning)", amberBg: "var(--warning-bg)",
};
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", background: "var(--surface)", color: C.text, boxSizing: "border-box", fontFamily: "inherit" };

interface Step { id: string; level: number; required_permission: string; min_amount: number | string | null; label: string | null }
interface Chain { id: string; entity_type: string; label: string; is_active: boolean; approval_steps: Step[] }
interface Permission { key: string; label?: string; module?: string }

const fmtRp = (n: number) => new Intl.NumberFormat("id-ID").format(n);

function hasPerm(key: string): boolean {
  try { const raw = localStorage.getItem("puraloka_permissions"); return raw ? (JSON.parse(raw) as string[]).includes(key) : false; } catch { return false; }
}

export default function ApprovalPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Content />;
}

function Content() {
  const canManage = hasPerm("approval:chains:manage");
  const [chains, setChains] = useState<Chain[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api.get<{ chains: Chain[] }>("/api/v1/approval-chains"),
        api.get<{ permissions: Permission[] }>("/api/v1/permissions").catch(() => ({ data: { permissions: [] } })),
      ]);
      setChains(c.data.chains ?? []);
      setPerms(p.data.permissions ?? []);
    } catch { setToast({ type: "err", msg: "Gagal memuat rantai approval" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const err = (e: unknown, fallback: string) =>
    setToast({ type: "err", msg: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback });

  async function toggleChain(entity: string, next: boolean) {
    try { await api.patch(`/api/v1/approval-chains/${entity}`, { is_active: next }); await load();
      setToast({ type: "ok", msg: next ? "Rantai diaktifkan" : "Rantai dinonaktifkan" });
    } catch (e) { err(e, "Gagal mengubah rantai"); }
  }
  async function addStep(entity: string, permission: string, minAmount: string) {
    try {
      await api.post(`/api/v1/approval-chains/${entity}/steps`, {
        required_permission: permission,
        min_amount: minAmount.trim() === "" ? null : Number(minAmount.replace(/\D/g, "")),
      });
      await load(); setToast({ type: "ok", msg: "Level ditambahkan" });
    } catch (e) { err(e, "Gagal menambah level"); }
  }
  async function patchStep(id: string, body: Record<string, unknown>) {
    try { await api.patch(`/api/v1/approval-steps/${id}`, body); await load(); setToast({ type: "ok", msg: "Level disimpan" }); }
    catch (e) { err(e, "Gagal menyimpan level"); }
  }
  async function delStep(id: string) {
    try { await api.delete(`/api/v1/approval-steps/${id}`); await load(); setToast({ type: "ok", msg: "Level dihapus" }); }
    catch (e) { err(e, "Gagal menghapus level"); }
  }

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-form)", margin: "0 auto" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 24, zIndex: 9999, maxWidth: 420, background: toast.type === "ok" ? C.greenBg : C.redBg, border: `1px solid ${toast.type === "ok" ? C.greenBorder : C.redBorder}`, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "flex-start", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: 13, color: toast.type === "ok" ? C.green : C.red }}>
          {toast.type === "ok" ? <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GitBranch size={19} color={C.navy} />
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: C.text, margin: 0 }}>Rantai Approval</h1>
          <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>Atur berapa level persetujuan tiap modul dan siapa yang berhak — tanpa deploy.</p>
        </div>
      </div>

      <div style={{ ...card, display: "flex", gap: 10, padding: "12px 16px", marginBottom: 18, background: C.navyLight, borderColor: "var(--navy-light)" }}>
        <Info size={16} color={C.navy} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
          <b>Satu level = perilaku standar</b> (satu orang berwenang menyetujui, langsung selesai). Tambah level untuk membuat persetujuan berjenjang.
          <br />Siapa yang berhak ditentukan lewat <b>permission</b>, bukan nama role — atur role mana yang memegangnya di <b>Pengaturan → Role</b>. Jadi role baru (mis. Direktur) bisa dijadikan approver tanpa ubah kode.
          <br /><b>Ambang nominal</b> membuat level hanya berlaku bila nilai transaksi ≥ angka itu (mis. level 2 hanya untuk di atas Rp 50.000.000).
        </div>
      </div>

      {!canManage && (
        <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 8, background: C.amberBg, border: "1px solid var(--warning-border)", fontSize: 12.5, color: C.mid }}>
          Anda bisa melihat konfigurasi, tetapi mengubahnya butuh izin <b>Kelola Rantai Approval</b>.
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 14 }}>Memuat…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {chains.map(ch => (
            <ChainCard key={ch.id} chain={ch} perms={perms} canManage={canManage}
              onToggle={toggleChain} onAdd={addStep} onPatch={patchStep} onDelete={delStep} />
          ))}
          {chains.length === 0 && <div style={{ ...card, padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Belum ada rantai approval.</div>}
        </div>
      )}
    </div>
  );
}

function ChainCard({ chain, perms, canManage, onToggle, onAdd, onPatch, onDelete }: {
  chain: Chain; perms: Permission[]; canManage: boolean;
  onToggle: (e: string, v: boolean) => void;
  onAdd: (e: string, p: string, m: string) => void;
  onPatch: (id: string, b: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newPerm, setNewPerm] = useState("");
  const [newMin, setNewMin] = useState("");
  const steps = chain.approval_steps ?? [];
  const tiered = steps.length > 1;

  return (
    <div style={{ ...card, overflow: "hidden", opacity: chain.is_active ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{chain.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: tiered ? C.navy : C.muted, background: tiered ? C.navyLight : "var(--surface-subtle)", padding: "2px 8px", borderRadius: 5 }}>
              {tiered ? `${steps.length} level` : "1 level"}
            </span>
          </div>
          <code style={{ fontSize: 11, color: C.muted }}>{chain.entity_type}</code>
        </div>
        {canManage && (
          <button aria-label={chain.is_active ? "Nonaktifkan rantai" : "Aktifkan rantai"} onClick={() => onToggle(chain.entity_type, !chain.is_active)}
            aria-pressed={chain.is_active}
            title={chain.is_active ? "Nonaktifkan rantai" : "Aktifkan rantai"}
            style={{ position: "relative", width: 46, height: 26, borderRadius: 13, border: "none", flexShrink: 0, background: chain.is_active ? C.green : C.border, cursor: "pointer", transition: "background .2s" }}>
            <span style={{ position: "absolute", top: 3, left: chain.is_active ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
          </button>
        )}
      </div>

      <div style={{ padding: "14px 20px" }}>
        {steps.map((s, i) => (
          <StepRow key={s.id} step={s} perms={perms} canManage={canManage} isLast={steps.length === 1}
            connector={i < steps.length - 1} onPatch={onPatch} onDelete={onDelete} />
        ))}

        {canManage && (adding ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "var(--surface-subtle)", border: `1px dashed ${C.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 10 }}>
              <div>
                <label htmlFor="new-perm" style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Siapa yang berhak (permission)</label>
                <select id="new-perm" aria-label="Permission yang berhak menyetujui langkah ini" value={newPerm} onChange={e => setNewPerm(e.target.value)} style={input}>
                  <option value="">— pilih permission —</option>
                  {perms.map(p => <option key={p.key} value={p.key}>{p.label ? `${p.label} (${p.key})` : p.key}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="new-min" style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Ambang nominal (opsional)</label>
                <input id="new-min" value={newMin} onChange={e => setNewMin(e.target.value)} placeholder="mis. 50000000" style={input} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button disabled={!newPerm} onClick={() => { onAdd(chain.entity_type, newPerm, newMin); setAdding(false); setNewPerm(""); setNewMin(""); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: newPerm ? C.navy : "var(--text-muted)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: newPerm ? "pointer" : "not-allowed" }}>
                Tambah level
              </button>
              <button onClick={() => { setAdding(false); setNewPerm(""); setNewMin(""); }}
                style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={14} /> Tambah level
          </button>
        ))}
      </div>
    </div>
  );
}

function StepRow({ step, perms, canManage, isLast, connector, onPatch, onDelete }: {
  step: Step; perms: Permission[]; canManage: boolean; isLast: boolean; connector: boolean;
  onPatch: (id: string, b: Record<string, unknown>) => void; onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [perm, setPerm] = useState(step.required_permission);
  const [min, setMin] = useState(step.min_amount === null ? "" : String(step.min_amount));
  const minNum = step.min_amount === null ? null : Number(step.min_amount);

  return (
    <div style={{ position: "relative", paddingLeft: 34, paddingBottom: connector ? 14 : 0 }}>
      <div style={{ position: "absolute", left: 0, top: 2, width: 24, height: 24, borderRadius: "50%", background: C.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{step.level}</div>
      {connector && <div style={{ position: "absolute", left: 11, top: 26, bottom: 0, width: 2, background: C.border }} />}

      {editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr auto", gap: 8, alignItems: "end" }}>
          <select aria-label="Ubah permission langkah approval" value={perm} onChange={e => setPerm(e.target.value)} style={input}>
            {perms.map(p => <option key={p.key} value={p.key}>{p.label ? `${p.label} (${p.key})` : p.key}</option>)}
          </select>
          <input value={min} onChange={e => setMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="ambang (kosong = selalu)" style={input} />
          <div style={{ display: "flex", gap: 6 }}>
            <button aria-label="Simpan" onClick={() => { onPatch(step.id, { required_permission: perm, min_amount: min.trim() === "" ? null : Number(min) }); setEditing(false); }}
              title="Simpan" style={{ padding: 7, borderRadius: 7, border: "none", background: C.green, color: "#fff", cursor: "pointer" }}><Check size={14} /></button>
            <button aria-label="Batal" onClick={() => { setEditing(false); setPerm(step.required_permission); setMin(step.min_amount === null ? "" : String(step.min_amount)); }}
              title="Batal" style={{ padding: 7, borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, cursor: "pointer" }}><X size={14} /></button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
              {perms.find(p => p.key === step.required_permission)?.label ?? step.required_permission}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              <code>{step.required_permission}</code>
              {minNum !== null && <> · berlaku bila nilai ≥ <b>Rp {fmtRp(minNum)}</b></>}
              {minNum === null && <> · selalu berlaku</>}
            </div>
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button aria-label={isLast ? "Tidak bisa dihapus — rantai harus punya minimal 1 level" : "Hapus level"} onClick={() => setEditing(true)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>Ubah</button>
              <button aria-label={isLast ? "Tidak bisa dihapus — rantai harus punya minimal 1 level" : "Hapus level"} onClick={() => onDelete(step.id)} disabled={isLast}
                title={isLast ? "Tidak bisa dihapus — rantai harus punya minimal 1 level" : "Hapus level"}
                style={{ padding: 6, borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: isLast ? C.muted : C.red, cursor: isLast ? "not-allowed" : "pointer", opacity: isLast ? 0.5 : 1 }}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

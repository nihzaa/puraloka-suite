"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { useData } from "@/lib/data-cache";
import { GitBranch, Plus, Trash2, Check, X, AlertTriangle, Info } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { Kosong } from "@/components/ui-dasar";
import { Pilihan } from "@/components/pilihan";

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--naik-1)" };
const input: React.CSSProperties = { width: "100%", padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", background: "var(--surface)", color: C.text, boxSizing: "border-box", fontFamily: "inherit" };

interface Step { id: string; level: number; required_permission: string; min_amount: number | string | null; max_amount: number | string | null; label: string | null }
interface Chain { id: string; entity_type: string; label: string; is_active: boolean; approval_steps: Step[] }
interface Permission { key: string; label?: string; module?: string }

const fmtRp = (n: number) => new Intl.NumberFormat("id-ID").format(n);



export default function Content() {
  const canManage = useIzin("approval:chains:manage");
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua endpoint independen → dua `useData`, menggantikan `Promise.all`
    manual. Kegagalan `permissions` sengaja tak menjatuhkan seluruh halaman
    (perilaku lama: `.catch(() => ({ data: { permissions: [] } }))`) — cukup
    daftar kosong, karena halaman tetap berguna melihat rantai tanpa daftar
    permission untuk menambah level baru.
  */
  const { data: dataChains, memuat: memuatChains, galat: galatChains, muatUlang: muatUlangChains } =
    useData<{ chains: Chain[] }>("/api/v1/approval-chains");
  const { data: dataPerms } = useData<{ permissions: Permission[] }>("/api/v1/permissions");
  const loading = memuatChains;
  const load = async () => { await muatUlangChains(); };
  const chains = dataChains?.chains ?? [];
  const perms = dataPerms?.permissions ?? [];

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const err = (e: unknown, fallback: string) =>
    setToast({ type: "err", msg: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback });

  async function toggleChain(entity: string, next: boolean) {
    try { await api.patch(`/api/v1/approval-chains/${entity}`, { is_active: next }); await load();
      setToast({ type: "ok", msg: next ? "Rantai diaktifkan" : "Rantai dinonaktifkan" });
    } catch (e) { err(e, "Gagal mengubah rantai"); }
  }
  async function addStep(entity: string, permission: string, minAmount: string, maxAmount: string) {
    try {
      await api.post(`/api/v1/approval-chains/${entity}/steps`, {
        required_permission: permission,
        min_amount: minAmount.trim() === "" ? null : Number(minAmount.replace(/\D/g, "")),
        max_amount: maxAmount.trim() === "" ? null : Number(maxAmount.replace(/\D/g, "")),
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
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 24, zIndex: 9999, maxWidth: 420, background: toast.type === "ok" ? C.greenBg : C.redBg, border: `1px solid ${toast.type === "ok" ? C.greenBorder : C.redBorder}`, borderRadius: 10, padding: "8px 16px", display: "flex", alignItems: "flex-start", gap: 8, boxShadow: "var(--naik-2)", fontSize: 13, color: toast.type === "ok" ? C.green : C.red }}>
          {toast.type === "ok" ? <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
        judul="Rantai Approval"
        keterangan="Atur berapa level persetujuan tiap modul dan siapa yang berhak — tanpa deploy."
        ikon={<GitBranch size={19} />}
      />
      </div>

      <div style={{ ...card, display: "flex", gap: 8, padding: "12px 16px", marginBottom: 18, background: C.navyLight, borderColor: "var(--navy-light)" }}>
        <Info size={16} color={C.navy} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
          <b>Satu level = perilaku standar</b> (satu orang berwenang menyetujui, langsung selesai). Tambah level untuk membuat persetujuan berjenjang.
          <br />Siapa yang berhak ditentukan lewat <b>permission</b>, bukan nama role — atur role mana yang memegangnya di <b>Pengaturan → Role</b>. Jadi role baru (mis. Direktur) bisa dijadikan approver tanpa ubah kode.
          <br /><b>Lantai</b> membuat level hanya berlaku bila nilai transaksi ≥ angka itu (mis. level 2 hanya untuk di atas Rp 50.000.000).
          <br /><b>Plafon</b> kebalikannya — level hanya berlaku bila nilai ≤ angka itu. Inilah yang membuat <b>fast-track</b> mungkin: PO kecil cukup satu tanda tangan, PO besar melewati level itu dan naik ke jenjang berikutnya. Dikosongkan = tanpa batas atas.
        </div>
      </div>

      {!canManage && (
        <div style={{ marginBottom: 18, padding: "8px 12px", borderRadius: 6, background: C.amberBg, border: "1px solid var(--warning-border)", fontSize: 12, color: C.mid }}>
          Anda bisa melihat konfigurasi, tetapi mengubahnya butuh izin <b>Kelola Rantai Approval</b>.
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 13 }}>Memuat…</div>
      ) : galatChains ? (
        // Galat MUAT dipisah dari `toast` (dipakai untuk galat AKSI ubah
        // rantai/level) — satu state untuk keduanya membuat gagal menyimpan
        // menghapus pesan gagal memuat.
        <div role="alert" style={{ ...card, padding: 40, textAlign: "center", color: C.red, fontSize: 13 }}>
          Gagal memuat rantai approval.{" "}
          <button onClick={() => void load()} style={{ color: C.navy, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
            Coba lagi.
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          {chains.map(ch => (
            <ChainCard key={ch.id} chain={ch} perms={perms} canManage={canManage}
              onToggle={toggleChain} onAdd={addStep} onPatch={patchStep} onDelete={delStep} />
          ))}
          {chains.length === 0 && (
            <Kosong
              judul="Belum ada rantai approval"
              sebab="Tanpa rantai, persetujuan langsung jatuh ke pemilik. Susun urutannya di sini kalau ada yang harus menyetujui lebih dulu — mis. PM sebelum direktur."
            />
          )}
        </div>
      )}
    </div>
  );
}

function ChainCard({ chain, perms, canManage, onToggle, onAdd, onPatch, onDelete }: {
  chain: Chain; perms: Permission[]; canManage: boolean;
  onToggle: (e: string, v: boolean) => void;
  onAdd: (e: string, p: string, m: string, x: string) => void;
  onPatch: (id: string, b: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newPerm, setNewPerm] = useState("");
  const [newMin, setNewMin] = useState("");
  const [newMax, setNewMax] = useState("");
  const steps = chain.approval_steps ?? [];
  const tiered = steps.length > 1;

  return (
    <div style={{ ...card, overflow: "hidden", opacity: chain.is_active ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{chain.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: tiered ? C.navy : C.muted, background: tiered ? C.navyLight : "var(--surface-subtle)", padding: "2px 8px", borderRadius: 6 }}>
              {tiered ? `${steps.length} level` : "1 level"}
            </span>
          </div>
          <code style={{ fontSize: 11, color: C.muted }}>{chain.entity_type}</code>
        </div>
        {canManage && (
          <button aria-label={chain.is_active ? "Nonaktifkan rantai" : "Aktifkan rantai"} onClick={() => onToggle(chain.entity_type, !chain.is_active)}
            aria-pressed={chain.is_active}
            title={chain.is_active ? "Nonaktifkan rantai" : "Aktifkan rantai"}
            style={{ position: "relative", width: 46, height: 26, borderRadius: 14, border: "none", flexShrink: 0, background: chain.is_active ? C.green : C.border, cursor: "pointer", transition: "background .2s" }}>
            <span style={{ position: "absolute", top: 3, left: chain.is_active ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "var(--surface)", transition: "left .2s", boxShadow: "var(--naik-1)" }} />
          </button>
        )}
      </div>

      <div style={{ padding: "12px 20px" }}>
        {steps.map((s, i) => (
          <StepRow key={s.id} step={s} perms={perms} canManage={canManage} isLast={steps.length === 1}
            connector={i < steps.length - 1} onPatch={onPatch} onDelete={onDelete} />
        ))}

        {canManage && (adding ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "var(--surface-subtle)", border: `1px dashed ${C.border}` }}>
            {/*
              id di-scope ke `entity_type`. Sebelumnya "new-perm"/"new-min"
              dipaku, dan halaman ini merender SATU form per rantai — jadi id
              yang sama muncul berkali-kali di satu dokumen. `htmlFor` lalu
              menunjuk field milik rantai lain: pembaca layar menyebut label
              yang salah, dan mengklik label memindahkan fokus ke kartu lain.
            */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 8 }}>
              <div>
                <label htmlFor={`new-perm-${chain.entity_type}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Siapa yang berhak (permission)</label>
                <Pilihan id={`new-perm-${chain.entity_type}`} aria-label="Permission yang berhak menyetujui langkah ini" value={newPerm} onChange={e => setNewPerm(e.target.value)} style={input}>
                  <option value="">— pilih permission —</option>
                  {perms.map(p => <option key={p.key} value={p.key}>{p.label ? `${p.label} (${p.key})` : p.key}</option>)}
                </Pilihan>
              </div>
              <div>
                <label htmlFor={`new-min-${chain.entity_type}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Lantai — berlaku bila ≥ (opsional)</label>
                <input id={`new-min-${chain.entity_type}`} inputMode="numeric" value={newMin} onChange={e => setNewMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="mis. 50000000" style={input} />
              </div>
              <div>
                <label htmlFor={`new-max-${chain.entity_type}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Plafon — berlaku bila ≤ (opsional)</label>
                <input id={`new-max-${chain.entity_type}`} inputMode="numeric" value={newMax} onChange={e => setNewMax(e.target.value.replace(/[^0-9]/g, ""))} placeholder="mis. 5000000" style={input} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button disabled={!newPerm} onClick={() => { onAdd(chain.entity_type, newPerm, newMin, newMax); setAdding(false); setNewPerm(""); setNewMin(""); setNewMax(""); }}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: newPerm ? C.navy : "var(--text-muted)", color: C.onNavy, fontSize: 13, fontWeight: 600, cursor: newPerm ? "pointer" : "not-allowed" }}>
                Tambah level
              </button>
              <button onClick={() => { setAdding(false); setNewPerm(""); setNewMin(""); setNewMax(""); }}
                style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
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
  const [max, setMax] = useState(step.max_amount == null ? "" : String(step.max_amount));
  const minNum = step.min_amount === null ? null : Number(step.min_amount);
  const maxNum = step.max_amount == null ? null : Number(step.max_amount);

  // Plafon di bawah lantai = langkah yang tak pernah berlaku. Basis menolaknya
  // (CHECK migrasi 356) dan API juga, tapi tombol Simpan dimatikan lebih dulu
  // supaya orang tahu SEBELUM menekan — bukan lewat toast merah sesudahnya.
  const rentangSalah = min.trim() !== "" && max.trim() !== "" && Number(max) < Number(min);

  return (
    <div style={{ position: "relative", paddingLeft: 34, paddingBottom: connector ? 14 : 0 }}>
      <div style={{ position: "absolute", left: 0, top: 2, width: 24, height: 24, borderRadius: "50%", background: C.navy, color: C.onNavy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{step.level}</div>
      {connector && <div style={{ position: "absolute", left: 11, top: 26, bottom: 0, width: 2, background: C.border }} />}

      {editing ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <Pilihan aria-label="Ubah permission langkah approval" value={perm} onChange={e => setPerm(e.target.value)} style={input}>
              {perms.map(p => <option key={p.key} value={p.key}>{p.label ? `${p.label} (${p.key})` : p.key}</option>)}
            </Pilihan>
            <input aria-label="Lantai — langkah berlaku bila nilai lebih besar atau sama dengan ini" inputMode="numeric"
              value={min} onChange={e => setMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="lantai (kosong = selalu)" style={input} />
            <input aria-label="Plafon — langkah berlaku bila nilai lebih kecil atau sama dengan ini" inputMode="numeric"
              value={max} onChange={e => setMax(e.target.value.replace(/[^0-9]/g, ""))} placeholder="plafon (kosong = tanpa batas)"
              style={{ ...input, borderColor: rentangSalah ? C.red : C.border }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button aria-label="Simpan" disabled={rentangSalah}
                onClick={() => { onPatch(step.id, { required_permission: perm, min_amount: min.trim() === "" ? null : Number(min), max_amount: max.trim() === "" ? null : Number(max) }); setEditing(false); }}
                title={rentangSalah ? "Plafon tidak boleh di bawah lantai" : "Simpan"}
                style={{ padding: 6, borderRadius: 6, border: "none", background: rentangSalah ? "var(--text-muted)" : C.green, color: "#fff", cursor: rentangSalah ? "not-allowed" : "pointer" }}><Check size={14} /></button>
              <button aria-label="Batal" onClick={() => { setEditing(false); setPerm(step.required_permission); setMin(step.min_amount === null ? "" : String(step.min_amount)); setMax(step.max_amount == null ? "" : String(step.max_amount)); }}
                title="Batal" style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, cursor: "pointer" }}><X size={14} /></button>
            </div>
          </div>
          {rentangSalah && (
            <div role="alert" style={{ marginTop: 6, fontSize: 11, color: C.red, display: "flex", alignItems: "center", gap: 5 }}>
              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
              Plafon di bawah lantai — langkah ini tak akan pernah berlaku untuk nilai apa pun.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
              {perms.find(p => p.key === step.required_permission)?.label ?? step.required_permission}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              <code>{step.required_permission}</code>
              {/*
                EMPAT kombinasi, dan keempatnya harus terbaca berbeda. Menulis
                hanya lantai (bentuk lama) membuat langkah berplafon terlihat
                "selalu berlaku" — padahal justru ia yang melewatkan nilai besar
                ke level berikutnya. Itu bacaan yang persis terbalik dari
                perilakunya.
              */}
              {minNum !== null && maxNum !== null && <> · berlaku bila <b>Rp {fmtRp(minNum)}</b> ≤ nilai ≤ <b>Rp {fmtRp(maxNum)}</b></>}
              {minNum !== null && maxNum === null && <> · berlaku bila nilai ≥ <b>Rp {fmtRp(minNum)}</b></>}
              {minNum === null && maxNum !== null && <> · berlaku bila nilai ≤ <b>Rp {fmtRp(maxNum)}</b> <span style={{ color: C.mid }}>(fast-track)</span></>}
              {minNum === null && maxNum === null && <> · selalu berlaku</>}
            </div>
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button aria-label={isLast ? "Tidak bisa dihapus — rantai harus punya minimal 1 level" : "Hapus level"} onClick={() => setEditing(true)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>Ubah</button>
              <button aria-label={isLast ? "Tidak bisa dihapus — rantai harus punya minimal 1 level" : "Hapus level"} onClick={() => onDelete(step.id)} disabled={isLast}
                title={isLast ? "Tidak bisa dihapus — rantai harus punya minimal 1 level" : "Hapus level"}
                style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: isLast ? C.muted : C.red, cursor: isLast ? "not-allowed" : "pointer", opacity: isLast ? 0.5 : 1 }}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

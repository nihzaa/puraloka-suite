"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { KepalaHalaman } from "@/components/dasar";
import { api } from "@/lib/api";
import { BellRing, Plus, Trash2, Info, ShieldCheck, UserCog, Users, HardHat } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";

const input: React.CSSProperties = { padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", background: "var(--surface)", color: C.text, boxSizing: "border-box", fontFamily: "inherit" };

type TargetType = "role" | "permission" | "project_pm" | "project_mandors";
interface Target { id: string; target_type: TargetType; role_name: string | null; permission_key: string | null }
interface Rule { id: string; event_type: string; label: string; description: string | null; is_active: boolean; notification_rule_targets: Target[] }
interface Permission { key: string; label?: string; module?: string }
interface Role { name: string; label?: string }

const TARGET_META: Record<TargetType, { icon: typeof Users; text: string; hint: string }> = {
  role:            { icon: Users,      text: "Peran",          hint: "Semua pengguna aktif dengan peran ini" },
  permission:      { icon: ShieldCheck, text: "Kapabilitas",   hint: "Siapa pun yang memegang kapabilitas ini — ikut berubah saat Anda mengatur peran" },
  project_pm:      { icon: UserCog,    text: "PM proyek",      hint: "Project manager dari proyek yang bersangkutan" },
  project_mandors: { icon: HardHat,    text: "Mandor proyek",  hint: "Mandor dengan penugasan aktif di proyek tersebut" },
};

function hasPerm(key: string): boolean {
  try { const raw = localStorage.getItem("puraloka_permissions"); return raw ? (JSON.parse(raw) as string[]).includes(key) : false; } catch { return false; }
}

export default function NotifikasiPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Content />;
}

function Content() {
  const canManage = hasPerm("notifications:rules:manage");
  const [rules, setRules] = useState<Rule[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, p, ro] = await Promise.all([
        api.get<{ rules: Rule[] }>("/api/v1/notification-rules"),
        api.get<{ permissions: Permission[] }>("/api/v1/permissions").catch(() => ({ data: { permissions: [] } })),
        api.get<{ roles: Role[] }>("/api/v1/roles").catch(() => ({ data: { roles: [] } })),
      ]);
      setRules(r.data.rules ?? []);
      setPerms(p.data.permissions ?? []);
      setRoles(ro.data.roles ?? []);
    } catch { setToast({ type: "err", msg: "Gagal memuat aturan notifikasi" }); }
    finally { setLoading(false); }
  }, []);
  // `queueMicrotask`, bukan panggilan langsung: `load()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  // Menunda satu microtask memindahkannya keluar dari fase render tanpa
  // menambah jeda yang terlihat.
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const err = (e: unknown, fallback: string) =>
    setToast({ type: "err", msg: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback });

  const toggle = async (rule: Rule) => {
    try {
      await api.patch(`/api/v1/notification-rules/${rule.event_type}`, { is_active: !rule.is_active });
      setToast({ type: "ok", msg: `"${rule.label}" ${rule.is_active ? "dinonaktifkan" : "diaktifkan"}` });
      load();
    } catch (e) { err(e, "Gagal mengubah status aturan"); }
  };

  const addTarget = async (rule: Rule, body: Record<string, unknown>) => {
    try {
      await api.post(`/api/v1/notification-rules/${rule.event_type}/targets`, body);
      setToast({ type: "ok", msg: "Penerima ditambahkan" });
      load();
    } catch (e) { err(e, "Gagal menambah penerima"); }
  };

  const removeTarget = async (id: string) => {
    try {
      await api.delete(`/api/v1/notification-rule-targets/${id}`);
      setToast({ type: "ok", msg: "Penerima dihapus" });
      load();
    } catch (e) { err(e, "Gagal menghapus penerima"); }
  };

  if (loading) return <div style={{ padding: 24, color: C.mid }}>Memuat…</div>;

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-form)", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <BellRing size={22} color={C.navy} />
        <KepalaHalaman judul="Aturan Notifikasi" /></div>
      <p style={{ color: C.mid, fontSize: 13, margin: "0 0 20px" }}>
        Tentukan siapa yang dikabari untuk setiap jenis kejadian. Perubahan langsung berlaku — tidak perlu rilis ulang.
      </p>

      <div style={{ ...GAYA_KARTU, padding: "12px 12px", marginBottom: 20, display: "flex", gap: 8, alignItems: "flex-start", background: C.navyLight }}>
        <Info size={16} color={C.navy} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
          Menargetkan <strong>kapabilitas</strong> biasanya lebih tahan lama daripada <strong>peran</strong>: saat
          Anda memberi seseorang wewenang menyetujui, notifikasinya ikut tanpa perlu diatur ulang di sini.
        </div>
      </div>

      {!canManage && (
        <div style={{ ...GAYA_KARTU, padding: "8px 12px", marginBottom: 16, background: C.amberBg, fontSize: 13, color: C.text }}>
          Anda dapat melihat aturan ini, tetapi tidak dapat mengubahnya.
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {rules.map(rule => (
          <RuleCard
            key={rule.id} rule={rule} roles={roles} perms={perms} canManage={canManage}
            onToggle={() => toggle(rule)}
            onAdd={body => addTarget(rule, body)}
            onRemove={removeTarget}
          />
        ))}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, padding: "12px 16px", borderRadius: 10, fontSize: 13,
          background: toast.type === "ok" ? C.greenBg : C.redBg,
          color: toast.type === "ok" ? C.green : C.red,
          border: `1px solid ${toast.type === "ok" ? C.green : C.red}`, maxWidth: 420, lineHeight: 1.5,
        }}>{toast.msg}</div>
      )}
    </div>
  );
}

function RuleCard({ rule, roles, perms, canManage, onToggle, onAdd, onRemove }: {
  rule: Rule; roles: Role[]; perms: Permission[]; canManage: boolean;
  onToggle: () => void; onAdd: (body: Record<string, unknown>) => void; onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<TargetType>("role");
  const [value, setValue] = useState("");

  const targets = rule.notification_rule_targets ?? [];
  const submit = () => {
    if (type === "role") onAdd({ target_type: "role", role_name: value });
    else if (type === "permission") onAdd({ target_type: "permission", permission_key: value });
    else onAdd({ target_type: type });
    setAdding(false); setValue("");
  };
  const needsValue = type === "role" || type === "permission";

  return (
    <div style={{ ...GAYA_KARTU, padding: 16, opacity: rule.is_active ? 1 : 0.62 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{rule.label}</div>
          {rule.description && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{rule.description}</div>}
        </div>
        <button
          onClick={onToggle} disabled={!canManage}
          style={{
            ...input, width: "auto", cursor: canManage ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600,
            background: rule.is_active ? C.greenBg : "var(--surface)",
            color: rule.is_active ? C.green : C.muted,
            borderColor: rule.is_active ? C.green : C.border, whiteSpace: "nowrap",
          }}
        >{rule.is_active ? "Aktif" : "Nonaktif"}</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {targets.length === 0 && (
          <div style={{ fontSize: 12, color: rule.is_active ? C.red : C.muted }}>
            {rule.is_active
              ? "Belum ada penerima — notifikasi ini tidak akan sampai ke siapa pun."
              : "Tidak ada penerima (aturan nonaktif)."}
          </div>
        )}
        {targets.map(t => {
          const meta = TARGET_META[t.target_type];
          const Icon = meta.icon;
          const label = t.target_type === "role" ? t.role_name
            : t.target_type === "permission" ? t.permission_key
            : meta.text;
          return (
            <span key={t.id} title={meta.hint} style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px",
              border: `1px solid ${C.border}`, borderRadius: 999, fontSize: 12, color: C.text,
              background: "var(--surface)",
            }}>
              <Icon size={13} color={C.navy} />
              <span style={{ color: C.muted }}>{meta.text}:</span> {label}
              {canManage && (
                <button aria-label="Hapus penerima" onClick={() => onRemove(t.id)} title="Hapus penerima"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 2, display: "flex" }}>
                  <Trash2 size={13} color={C.red} />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {canManage && (adding ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
          <select aria-label="Jenis" value={type} onChange={e => { setType(e.target.value as TargetType); setValue(""); }} style={{ ...input, width: 150 }}>
            {(Object.keys(TARGET_META) as TargetType[]).map(k => (
              <option key={k} value={k}>{TARGET_META[k].text}</option>
            ))}
          </select>
          {needsValue && (
            <select aria-label={type === "role" ? "Peran penerima notifikasi" : "Kapabilitas penerima notifikasi"} value={value} onChange={e => setValue(e.target.value)} style={{ ...input, minWidth: 240 }}>
              <option value="">Pilih {type === "role" ? "peran" : "kapabilitas"}…</option>
              {type === "role"
                ? roles.map(r => <option key={r.name} value={r.name}>{r.label ?? r.name}</option>)
                : perms.map(p => <option key={p.key} value={p.key}>{p.label ? `${p.label} — ${p.key}` : p.key}</option>)}
            </select>
          )}
          <button onClick={submit} disabled={needsValue && !value}
            style={{ ...input, width: "auto", cursor: needsValue && !value ? "not-allowed" : "pointer", background: C.navy, color: C.onNavy, borderColor: C.navy, fontWeight: 600 }}>
            Tambah
          </button>
          <button onClick={() => { setAdding(false); setValue(""); }}
            style={{ ...input, width: "auto", cursor: "pointer", color: C.mid }}>Batal</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ ...input, width: "auto", marginTop: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, color: C.navy, fontWeight: 600 }}>
          <Plus size={14} /> Tambah penerima
        </button>
      ))}
    </div>
  );
}

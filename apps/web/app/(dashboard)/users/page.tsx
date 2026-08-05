"use client";

import { useEffect, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { api, getStoredUser } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import {
  Users, Plus, Search, UserCheck, UserX, Edit2, X,
  HardHat, Briefcase, ShieldCheck, User, Phone, Mail,
  
} from "lucide-react";

import { C } from "@/lib/warna-ui";

const ROLES = [
  { key: "admin",  label: "Administrator", icon: ShieldCheck, color: C.purple, bg: C.purpleBg, border: C.purpleBorder },
  { key: "pm",     label: "Project Manager", icon: Briefcase,  color: C.blue,   bg: C.blueBg,   border: C.blueBorder },
  { key: "mandor", label: "Mandor",          icon: HardHat,    color: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  { key: "client", label: "Klien",           icon: User,       color: C.mid,    bg: "var(--surface-hover)",  border: C.border },
] as const;

type RoleKey = "admin" | "pm" | "mandor" | "client";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleKey;
  is_active: boolean;
  created_at: string;
}

function useMount() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function roleInfo(role: RoleKey) {
  return ROLES.find(r => r.key === role) ?? ROLES[3];
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<RoleKey | "all">("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);

  useEffect(() => { setCurrentUser(getStoredUser()); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ users: UserRecord[] }>("/api/v1/users?all=true");
      setUsers(r.data.users);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(user: UserRecord) {
    try {
      await api.patch(`/api/v1/users/${user.id}/toggle-active`, {});
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    } catch (err: unknown) {
      // Kegagalan ini SEBELUMNYA ditelan, sementara baris di atas tetap
      // membalik tampilan lokal. Akibatnya daftar menunjukkan user
      // "nonaktif" padahal server menolak perubahannya — dan orang itu masih
      // bisa masuk. Menonaktifkan akun adalah tindakan keamanan; ia tak boleh
      // gagal tanpa suara.
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal mengubah status user");
    }
  }

  const filtered = users.filter(u => {
    if (filterRole !== "all" && u.role !== filterRole) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? "").includes(q);
    }
    return true;
  });

  const counts = ROLES.map(r => ({ ...r, count: users.filter(u => u.role === r.key).length }));
  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.
  const isAdmin = useIzin("users:manage");

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-form)", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: "-0.3px" }}>User Management</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>Kelola akun pengguna aplikasi Puraloka Suite</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Tambah User
          </button>
        )}
      </div>

      {/* Role summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {counts.map(r => {
          const Icon = r.icon;
          return (
            <button key={r.key} onClick={() => setFilterRole(filterRole === r.key ? "all" : r.key)}
              style={{ padding: "12px 16px", borderRadius: 10, border: `2px solid ${filterRole === r.key ? r.color : C.border}`, background: filterRole === r.key ? r.bg : "var(--surface)", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon size={14} color={r.color} />
                <span style={{ fontSize: 11, fontWeight: 600, color: r.color }}>{r.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{r.count}</div>
            </button>
          );
        })}
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} color={C.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, email, atau telepon..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" }} />
        </div>
        {filterRole !== "all" && (
          <button onClick={() => setFilterRole("all")} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 12, color: C.mid, display: "flex", alignItems: "center", gap: 6 }}>
            <X size={12} /> Reset filter
          </button>
        )}
      </div>

      {/* User list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
          <Users size={32} color={C.border} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600 }}>Tidak ada user ditemukan</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
          {filtered.map((u, i) => {
            const ri = roleInfo(u.role);
            const Icon = ri.icon;
            const isSelf = u.id === currentUser?.id;
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", opacity: u.is_active ? 1 : 0.55 }}>
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: ri.bg, border: `1.5px solid ${ri.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: ri.color }}>{u.name[0].toUpperCase()}</span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.name}</span>
                    {isSelf && <span style={{ fontSize: 10, padding: "0px 6px", borderRadius: 6, background: C.navyLight, color: C.navy, fontWeight: 600 }}>Anda</span>}
                    {!u.is_active && <span style={{ fontSize: 10, padding: "0px 6px", borderRadius: 6, background: C.redBg, color: C.red, fontWeight: 600 }}>Nonaktif</span>}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                      <Mail size={11} color={C.muted} /> {u.email}
                    </span>
                    {u.phone && (
                      <span style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                        <Phone size={11} color={C.muted} /> {u.phone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Role badge */}
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 20, background: ri.bg, border: `1px solid ${ri.border}` }}>
                  <Icon size={11} color={ri.color} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: ri.color }}>{ri.label}</span>
                </div>

                {/* Actions */}
                {isAdmin && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditUser(u)}
                      style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 12, color: C.mid, display: "flex", alignItems: "center", gap: 4 }}>
                      <Edit2 size={12} /> Edit
                    </button>
                    {!isSelf && (
                      <button onClick={() => toggleActive(u)}
                        style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${u.is_active ? C.redBorder : C.greenBorder}`, background: u.is_active ? C.redBg : C.greenBg, cursor: "pointer", fontSize: 12, color: u.is_active ? C.red : C.green, display: "flex", alignItems: "center", gap: 4 }}>
                        {u.is_active ? <><UserX size={12} /> Nonaktifkan</> : <><UserCheck size={12} /> Aktifkan</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); load(); }} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSuccess={() => { setEditUser(null); load(); }} />}
    </div>
  );
}

// ─── Modal: Tambah User Baru ──────────────────────────────────────────────────
function AddUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useMount();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<RoleKey>("mandor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) { setError("Nama, email, dan password wajib diisi"); return; }
    if (password.length < 8) { setError("Password minimal 8 karakter"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/api/v1/auth/register", { name, email, password, phone: phone || undefined, role });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal mendaftarkan user");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, boxShadow: "var(--naik-3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Tambah User Baru</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>User akan langsung bisa login setelah dibuat</p>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label htmlFor="name" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nama Lengkap</label>
            <input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="cth: Budi Santoso" style={inputStyle} required />
          </div>
          <div>
            <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} required />
          </div>
          <div>
            <label htmlFor="password" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 karakter" style={inputStyle} required />
          </div>
          <div>
            <label htmlFor="phone" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>No. Telepon (opsional)</label>
            <input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812-xxxx-xxxx" style={inputStyle} />
          </div>
          <div>
            <span id="role" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 8 }}>Role</span>
            <div role="group" aria-labelledby="role" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ROLES.map(r => {
                const Icon = r.icon;
                const active = role === r.key;
                return (
                  <button key={r.key} type="button" onClick={() => setRole(r.key)}
                    style={{ padding: "8px 12px", borderRadius: 6, border: `2px solid ${active ? r.color : C.border}`, background: active ? r.bg : "var(--surface)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon size={14} color={active ? r.color : C.muted} />
                    <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? r.color : C.mid }}>{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Mendaftarkan..." : "Buat Akun"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Edit Data User ────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSuccess }: { user: UserRecord; onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useMount();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState<RoleKey>(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) { setError("Nama wajib diisi"); return; }
    setLoading(true); setError("");
    try {
      await api.patch(`/api/v1/users/${user.id}`, { name, phone: phone || undefined, role });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal menyimpan perubahan");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 440, boxShadow: "var(--naik-3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Edit Data User</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>{user.email}</p>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label htmlFor="name-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nama Lengkap</label>
            <input id="name-2" value={name} onChange={e => setName(e.target.value)} style={inputStyle} required />
          </div>
          <div>
            <label htmlFor="phone-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>No. Telepon</label>
            <input id="phone-2" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812-xxxx-xxxx" style={inputStyle} />
          </div>
          <div>
            <span id="role-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 8 }}>Role</span>
            <div role="group" aria-labelledby="role-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ROLES.map(r => {
                const Icon = r.icon;
                const active = role === r.key;
                return (
                  <button key={r.key} type="button" onClick={() => setRole(r.key)}
                    style={{ padding: "8px 12px", borderRadius: 6, border: `2px solid ${active ? r.color : C.border}`, background: active ? r.bg : "var(--surface)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon size={14} color={active ? r.color : C.muted} />
                    <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? r.color : C.mid }}>{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}


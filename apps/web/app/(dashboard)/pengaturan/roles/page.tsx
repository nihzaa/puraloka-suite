"use client";

import { useEffect, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { KepalaHalaman } from "@/components/dasar";
import { dapatDitekan } from "@/lib/dapat-ditekan";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Users,
  Lock,
} from "lucide-react";

// ─── Design tokens ─────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";


// ─── Types ─────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  label: string;
  description: string | null;
  is_builtin: boolean;
  portal: string;
  color: string;
  sort_order: number;
  permission_count?: number;
  user_count?: number;
}

interface Permission {
  id: string;
  key: string;
  module: string;
  label: string;
  description: string | null;
}

interface PermissionGroup {
  module: string;
  permissions: Permission[];
}

// ─── Module display names ──────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  projects: "Proyek",
  finance: "Keuangan",
  cash: "Kas",
  mandor: "Mandor",
  procurement: "Pengadaan",
  reports: "Laporan",
  users: "User",
  clients: "Klien",
  settings: "Pengaturan",
  notifications: "Notifikasi",
  milestones: "Milestone",
  documents: "Dokumen",
};

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <RolesContent />;
}

function RolesContent() {
  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.
  const canManage = useIzin("users:roles:manage");

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionGroup[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [dirtyPerms, setDirtyPerms] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);

  // Collapsed modules
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  /**
   * Pilih role pertama begitu daftarnya datang.
   *
   * Tanpa ini panel kanan menampilkan "Pilih role untuk melihat
   * permission" — kotak kosong setinggi 250px di sebelah daftar yang
   * SUDAH berisi lima role. Layar terbuka dalam keadaan tak menampilkan
   * apa pun, padahal tak ada satu pun keputusan yang perlu diambil
   * pemakai lebih dulu.
   *
   * Pola yang sama sudah dipakai di `/mutu/ncr` untuk pemilih proyek.
   *
   * `queueMicrotask` memindahkan set-state ke luar badan efek —
   * `selectRole` menyetel tiga state sekaligus, dan memanggilnya sinkron
   * di sini memicu render berantai (`react-hooks/set-state-in-effect`).
   */
  useEffect(() => {
    if (selectedRole || roles.length === 0) return;
    const pertama = roles[0];
    queueMicrotask(() => { void selectRole(pertama); });
    // `selectRole` sengaja di luar deps — ia didefinisikan ulang tiap
    // render, jadi memasukkannya membuat efek ini berjalan tanpa henti.
    // Yang benar-benar menentukan kapan efek ini jalan adalah `roles`
    // (baru datang) dan `selectedRole` (masih kosong), dan keduanya ada.
  }, [roles, selectedRole]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadRoles() {
    try {
      const { data } = await api.get<{ roles: Role[] }>("/api/v1/roles");
      setRoles(data.roles);
    } catch {
      setToast({ type: "error", msg: "Gagal memuat daftar role" });
    }
  }

  async function loadPermissions() {
    try {
      const { data } = await api.get<{ permissions: Permission[]; grouped: Record<string, Permission[]> }>("/api/v1/permissions");
      // Convert the grouped object into an ordered array
      const groups: PermissionGroup[] = Object.entries(data.grouped).map(([module, perms]) => ({
        module,
        permissions: perms,
      }));
      setPermissions(groups);
      // Semua modul TERLIPAT saat pertama dibuka.
      //
      // Administrator punya 114 permission di 30-an modul. Terbuka
      // semua, halaman jadi 18.732px — orang harus menggulir sepuluh
      // layar untuk tahu modul apa saja yang ada, dan tak pernah
      // melihat ringkasannya. Terlipat, seluruh daftar modul muat dalam
      // satu layar, dan yang perlu diperiksa dibuka satu per satu.
      setCollapsedModules(new Set(groups.map((g) => g.module)));
    } catch {
      setToast({ type: "error", msg: "Gagal memuat daftar permission" });
    }
  }

  async function selectRole(role: Role) {
    setSelectedRole(role);
    setIsDirty(false);
    setLoadingPerms(true);
    try {
      const { data } = await api.get<{ permissions: Permission[] }>(`/api/v1/roles/${role.id}/permissions`);
      const ids = new Set(data.permissions.map(p => p.id));
      setRolePerms(ids);
      setDirtyPerms(new Set(ids));
    } catch {
      setToast({ type: "error", msg: "Gagal memuat permission role" });
    } finally {
      setLoadingPerms(false);
    }
  }

  function togglePerm(permId: string) {
    if (!canManage) return;
    setDirtyPerms(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
    setIsDirty(true);
  }

  function toggleAllInModule(module: string, allPermIds: string[]) {
    if (!canManage) return;
    const allSelected = allPermIds.every(id => dirtyPerms.has(id));
    setDirtyPerms(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allPermIds.forEach(id => next.delete(id));
      } else {
        allPermIds.forEach(id => next.add(id));
      }
      return next;
    });
    setIsDirty(true);
  }

  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await api.put(`/api/v1/roles/${selectedRole.id}/permissions`, {
        permission_ids: Array.from(dirtyPerms),
      });
      setRolePerms(new Set(dirtyPerms));
      setIsDirty(false);
      setToast({ type: "success", msg: `Permission role "${selectedRole.label}" berhasil disimpan` });
      // Refresh role list to update permission_count
      loadRoles();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "error", msg: msg ?? "Gagal menyimpan permission" });
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setDirtyPerms(new Set(rolePerms));
    setIsDirty(false);
  }

  function toggleModuleCollapse(module: string) {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: toast.type === "success" ? C.greenBg : C.redBg,
          border: `1px solid ${toast.type === "success" ? C.greenBorder : C.redBorder}`,
          borderRadius: 10, padding: "8px 16px",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "var(--naik-2)", fontSize: 13,
          color: toast.type === "success" ? C.green : C.red,
        }}>
          {toast.type === "success" ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <KepalaHalaman judul="Role & Akses" keterangan="Kelola role pengguna dan permission akses ke setiap modul" />
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 10, border: "none",
              background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus size={15} /> Tambah Role
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

        {/* Left: Role list */}
        <div style={GAYA_KARTU}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Semua Role</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{roles.length} role terdaftar</div>
          </div>
          <div style={{ padding: "8px 0" }}>
            {roles.map(role => {
              const isSelected = selectedRole?.id === role.id;
              // Pembungkus baris SENGAJA tidak lagi `role="button"`.
              // Ia memuat tombol Edit dan Hapus, dan tombol di dalam tombol
              // adalah `nested-interactive` — axe menandainya serious, dan
              // pembaca layar tak selalu mengumumkan yang di dalam. Peran
              // tombol dipindahkan ke blok teksnya saja (di bawah), jadi
              // tombol aksi berada DI LUAR area yang dapat ditekan.
              return (
                <div
                  key={role.id}
                  style={{
                    padding: "8px 16px",
                    cursor: "pointer",
                    background: isSelected ? C.navyLight : "transparent",
                    borderLeft: isSelected ? `3px solid ${C.navy}` : "3px solid transparent",
                    transition: "all 0.12s",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-subtle)"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  {/* Color dot */}
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: role.color, flexShrink: 0 }} />
                  <div
                    {...dapatDitekan(() => selectRole(role), `Pilih role ${role.label ?? role.name}`)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? C.navy : C.text, display: "flex", alignItems: "center", gap: 6 }}>
                      {role.label}
                      {role.is_builtin && (
                        <span style={{ fontSize: 10, padding: "0px 6px", borderRadius: 6, background: "var(--surface-hover)", color: C.muted, fontWeight: 500 }}>
                          bawaan
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Shield size={10} /> {role.permission_count ?? 0} permission
                      </span>
                      {role.user_count !== undefined && (
                        <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <Users size={10} /> {role.user_count} user
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Action buttons */}
                  {canManage && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button aria-label="Edit role"
                        title="Edit role"
                        onClick={() => setEditRole(role)}
                        style={{ padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.muted, display: "flex" }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.navyLight; }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "transparent"; }}
                      >
                        <Pencil size={12} />
                      </button>
                      {!role.is_builtin && (
                        <button aria-label="Hapus role"
                          title="Hapus role"
                          onClick={() => setDeleteRole(role)}
                          style={{ padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.muted, display: "flex" }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = C.redBg; }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "transparent"; }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Permission matrix */}
        {selectedRole ? (
          <div style={GAYA_KARTU}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: selectedRole.color }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selectedRole.label}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {dirtyPerms.size} dari {permissions.reduce((a, g) => a + g.permissions.length, 0)} permission aktif
                    {selectedRole.is_builtin && " · role bawaan"}
                  </div>
                </div>
              </div>
              {isDirty && canManage && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={discardChanges}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    <X size={13} /> Batal
                  </button>
                  <button
                    onClick={savePermissions}
                    disabled={saving}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, border: "none", background: saving ? "var(--text-muted)" : C.navy, color: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
                  >
                    <Check size={13} /> {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              )}
            </div>

            {/* Permission matrix */}
            {loadingPerms ? (
              <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 13 }}>Memuat permission...</div>
            ) : (
              <div style={{ padding: "8px 0 16px" }}>
                {permissions.map(group => {
                  const allIds = group.permissions.map(p => p.id);
                  const allSelected = allIds.every(id => dirtyPerms.has(id));
                  const someSelected = allIds.some(id => dirtyPerms.has(id));
                  const isCollapsed = collapsedModules.has(group.module);

                  return (
                    <div key={group.module} style={{ borderBottom: `1px solid ${C.border}` }}>
                      {/* Module header */}
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 20px", cursor: "pointer",
                          background: "var(--surface-subtle)",
                        }}
                      >
                        <button
                          onClick={() => toggleModuleCollapse(group.module)}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, flex: 1, textAlign: "left" }}
                        >
                          {isCollapsed ? <ChevronRight size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {MODULE_LABELS[group.module] ?? group.module}
                          </span>
                          <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>
                            ({allIds.filter(id => dirtyPerms.has(id)).length}/{allIds.length})
                          </span>
                        </button>
                        {canManage && (
                          <button
                            onClick={() => toggleAllInModule(group.module, allIds)}
                            style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 6,
                              border: `1px solid ${allSelected ? C.navy : C.border}`,
                              background: allSelected ? C.navyLight : "var(--surface)",
                              color: allSelected ? C.navy : C.mid,
                              cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
                            }}
                          >
                            {allSelected ? "Hapus semua" : someSelected ? "Pilih semua" : "Pilih semua"}
                          </button>
                        )}
                      </div>

                      {/* Permission items */}
                      {!isCollapsed && (
                        <div style={{ padding: "4px 20px 8px" }}>
                          {group.permissions.map(perm => {
                            const checked = dirtyPerms.has(perm.id);
                            return (
                              <div
                                key={perm.id}
                                {...dapatDitekan(
                                  canManage ? () => togglePerm(perm.id) : null,
                                  `${dirtyPerms.has(perm.id) ? "Cabut" : "Berikan"} permission ${perm.key}`,
                                )}
                                style={{
                                  display: "flex", alignItems: "flex-start", gap: 8,
                                  padding: "6px 8px", borderRadius: 6, marginBottom: 2,
                                  cursor: canManage ? "pointer" : "default",
                                  background: checked ? "var(--info-bg)" : "transparent",
                                  transition: "background 0.1s",
                                }}
                                onMouseEnter={e => { if (canManage && !checked) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-subtle)"; }}
                                onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                              >
                                {/* Checkbox */}
                                <div style={{
                                  width: 17, height: 17, borderRadius: 6, flexShrink: 0, marginTop: 1,
                                  border: `2px solid ${checked ? C.navy : C.border}`,
                                  background: checked ? C.navy : "var(--surface)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  transition: "all 0.1s",
                                }}>
                                  {checked && <Check size={10} color="var(--surface)" strokeWidth={3} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: checked ? C.navy : C.text }}>
                                    {perm.label}
                                  </div>
                                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1, fontFamily: "monospace" }}>
                                    {perm.key}
                                  </div>
                                  {perm.description && (
                                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                      {perm.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...GAYA_KARTU, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: C.muted }}>
            <Lock size={32} color={C.border} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: C.mid }}>Pilih role untuk melihat permission</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Klik salah satu role di sebelah kiri</div>
          </div>
        )}
      </div>

      {/* Add / Edit Role Modal */}
      {(showAddModal || editRole) && (
        <RoleFormModal
          role={editRole}
          roles={roles}
          onClose={() => { setShowAddModal(false); setEditRole(null); }}
          onSaved={() => { setShowAddModal(false); setEditRole(null); loadRoles(); }}
          setToast={setToast}
        />
      )}

      {/* Delete confirmation */}
      {deleteRole && (
        <DeleteRoleModal
          role={deleteRole}
          onClose={() => setDeleteRole(null)}
          onDeleted={() => {
            setDeleteRole(null);
            if (selectedRole?.id === deleteRole.id) { setSelectedRole(null); setRolePerms(new Set()); setDirtyPerms(new Set()); }
            loadRoles();
            setToast({ type: "success", msg: `Role "${deleteRole.label}" berhasil dihapus` });
          }}
          setToast={setToast}
        />
      )}
    </div>
  );
}

// ─── Role Form Modal (Add / Edit) ──────────────────────────────────────────────

const ROLE_COLORS = [
  "var(--aksen)", "var(--info)", "var(--warning)", "var(--text-secondary)",
  "#059669", "var(--danger)", "var(--data-2)", "var(--aksen)",
  "var(--warning)", "#0F766E", "#BE185D", "var(--text-secondary)",
];

function RoleFormModal({ role, roles, onClose, onSaved, setToast }: {
  role: Role | null;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
  setToast: (t: { type: "success" | "error"; msg: string }) => void;
}) {
  useTutupEsc(onClose);
  const isEdit = !!role;
  const [name, setName] = useState(role?.name ?? "");
  const [label, setLabel] = useState(role?.label ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? ROLE_COLORS[0]);
  const [copyFrom, setCopyFrom] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setToast({ type: "error", msg: "Label role wajib diisi" }); return; }
    if (!isEdit && !name.trim()) { setToast({ type: "error", msg: "Nama role wajib diisi" }); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/v1/roles/${role!.id}`, { label: label.trim(), description: description.trim() || null, color });
        setToast({ type: "success", msg: `Role "${label}" berhasil diupdate` });
      } else {
        const payload: Record<string, unknown> = {
          name: name.trim(),
          label: label.trim(),
          description: description.trim() || null,
          color,
        };
        if (copyFrom) payload.copy_from = copyFrom;
        await api.post("/api/v1/roles", payload);
        setToast({ type: "success", msg: `Role "${label}" berhasil dibuat` });
      }
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "error", msg: msg ?? "Gagal menyimpan role" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: 440, boxShadow: "var(--naik-3)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{isEdit ? "Edit Role" : "Tambah Role Baru"}</div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.muted, display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {/* Name (create only) */}
          {!isEdit && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="name" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
                Nama Role (slug) <span style={{ color: C.red }}>*</span>
              </label>
              <input id="name"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                placeholder="kasir, logistik, direktur"
                disabled={isEdit}
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
              />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Hanya huruf kecil, angka, dan tanda hubung. Tidak bisa diubah setelah dibuat.</div>
            </div>
          )}

          {/* Label */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="label" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
              Label Tampilan <span style={{ color: C.red }}>*</span>
            </label>
            <input id="label"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Kasir, Logistik, Direktur Utama"
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="description" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Deskripsi</label>
            <input id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opsional — jelaskan tanggung jawab role ini"
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Color */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8 }}>Warna</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ROLE_COLORS.map(c => (
                <div
                  key={c}
                  {...dapatDitekan(() => setColor(c), `Pilih warna ${c}`)}
                  style={{
                    width: 26, height: 26, borderRadius: "50%", background: c,
                    cursor: "pointer", border: `3px solid ${color === c ? C.text : "transparent"}`,
                    outline: color === c ? `2px solid ${c}` : "none",
                    outlineOffset: 2,
                    transition: "all 0.1s",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Copy from (create only) */}
          {!isEdit && (
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="copy-from" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Salin Permission dari Role</label>
              <select id="copy-from"
                aria-label="Salin permission dari role lain"
                value={copyFrom}
                onChange={e => setCopyFrom(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--surface)" }}
              >
                <option value="">— Mulai kosong —</option>
                {roles.map(r => (
                  <option key={r.id} value={r.name}>{r.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Semua permission dari role tersebut akan disalin ke role baru ini.</div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose}
              style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Batal
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: saving ? "var(--text-muted)" : C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Role Modal ─────────────────────────────────────────────────────────

function DeleteRoleModal({ role, onClose, onDeleted, setToast }: {
  role: Role;
  onClose: () => void;
  onDeleted: () => void;
  setToast: (t: { type: "success" | "error"; msg: string }) => void;
}) {
  useTutupEsc(onClose);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/v1/roles/${role.id}`);
      onDeleted();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "error", msg: msg ?? "Gagal menghapus role" });
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: 400, padding: 28, boxShadow: "var(--naik-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.redBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={18} color={C.red} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Hapus Role</div>
        </div>
        <p style={{ fontSize: 13, color: C.mid, marginBottom: 8 }}>
          Yakin ingin menghapus role <strong style={{ color: C.text }}>{role.label}</strong>?
        </p>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 24, padding: "8px 12px", background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 6 }}>
          Semua permission role ini akan ikut terhapus. User yang masih memiliki role ini tidak otomatis dipindahkan.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Batal
          </button>
          <button onClick={handleDelete} disabled={deleting}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: deleting ? "var(--text-muted)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer" }}>
            {deleting ? "Menghapus..." : "Hapus Role"}
          </button>
        </div>
      </div>
    </div>
  );
}

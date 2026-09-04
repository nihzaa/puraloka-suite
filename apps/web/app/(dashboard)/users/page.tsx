"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { api, getStoredUser } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import {
  Users, Plus, Search, UserCheck, UserX, Edit2, X,
  HardHat, Briefcase, ShieldCheck, User, Phone, Mail, UserCog } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { Kosong } from "@/components/ui-dasar";
import { kabari } from "@/components/tanya";

/*
  ── ROLE DIBACA DARI BASIS, BUKAN DIPAKU DI SINI (2026-08-29)

  Sebelumnya berkas ini memaku empat role: admin, pm, mandor, client.
  Diukur di basis hari itu: perusahaan punya DUA PULUH SATU role, lengkap
  dengan label Indonesia, warna, portal, dan urutannya masing-masing —
  estimator, manajer keuangan, kasir, penagihan, staf pengadaan, logistik,
  QA/QC, K3, QHSE, HRD, payroll, auditor internal, direktur, dan seterusnya.

  Tujuh belas di antaranya TAK BISA dipilih dari layar ini, walau izinnya
  sudah dikurasi di basis. Founder menanyakannya: "role yg lengkap untuk staff
  kantor kok gaada".

  Selain menyembunyikan role yang ada, daftar yang dipaku juga melanggar
  mandat config-first: role adalah data konfigurasi per-tenant (ADR-004), dan
  role baru yang dibuat lewat Matriks Izin harus langsung bisa dipakai di sini
  tanpa menyentuh kode.

  `/api/v1/roles` sudah menyelesaikan bagian yang sulit — ia memilih SATU baris
  per nama (salinan tenant menang atas template) dan berhalaman. Yang kurang
  cuma pemakaiannya.
*/
interface RoleRecord {
  id: string;
  name: string;
  label: string | null;
  color: string | null;
  portal: string | null;
  sort_order: number | null;
}

type RoleKey = string;

/* Ikon dipetakan dari nama role. Yang tak dikenal memakai ikon netral —
   role baru buatan tenant tetap tampil, tak jatuh ke layar kosong. */
const IKON_ROLE: Record<string, typeof ShieldCheck> = {
  admin: ShieldCheck,
  direktur: ShieldCheck,
  pm: Briefcase,
  project_manager_senior: Briefcase,
  site_manager: HardHat,
  mandor: HardHat,
  client: User,
};

/* Pengelompokan untuk pemilih role. Dua puluh satu tombol dalam satu grid
   tak bisa dipindai mata; dikelompokkan, ia terbaca seperti struktur
   organisasi. Role yang tak terdaftar di sini masuk "Lainnya" — jadi role
   baru tetap muncul, bukan hilang diam-diam. */
const GRUP_ROLE: { judul: string; anggota: string[] }[] = [
  { judul: "Pimpinan & Sistem", anggota: ["direktur", "admin"] },
  { judul: "Proyek & Lapangan", anggota: ["pm", "project_manager_senior", "site_manager", "mandor"] },
  { judul: "Teknik & Estimasi", anggota: ["estimator", "qaqc"] },
  { judul: "K3 & Mutu", anggota: ["qhse_manager", "k3_officer"] },
  { judul: "Keuangan", anggota: ["manajer_keuangan", "akuntan", "kasir", "penagihan"] },
  { judul: "Pengadaan & Logistik", anggota: ["procurement_officer", "logistik"] },
  { judul: "SDM", anggota: ["hrd", "payroll_officer"] },
  { judul: "Legal & Audit", anggota: ["kontrak_admin", "auditor_internal"] },
  { judul: "Eksternal", anggota: ["client"] },
];

interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleKey;
  is_active: boolean;
  created_at: string;
}


/* Tampilan satu role. Kalau namanya tak ada di daftar basis (mis. user lama
   yang rolenya sudah dihapus), ia tetap TAMPIL apa adanya — bukan diam-diam
   ditampilkan sebagai "Klien", yang pernah terjadi karena fallback ROLES[3]
   dan membuat orang salah baca siapa punya akses apa. */
/*
  ⚠ Warna dari basis (`roles.color`) SENGAJA tidak dipakai langsung.

  Nilainya hex mentah (mis. `#D97706` untuk mandor, `#6B7280` untuk sebagian
  besar role) dan dipakai untuk label 11px di atas permukaan terang. Diukur
  axe-core 2026-08-29: 9 pelanggaran `color-contrast` [serious] — teks yang
  tak terbaca oleh pengguna berpenglihatan rendah, dan repo ini punya banyak
  pengguna berperangkat lama.

  Token `--warning`/`--info`/dst. sudah dikurasi untuk kontras di mode terang
  DAN gelap; hex di basis tidak. Jadi warna basis dipetakan ke token, dan yang
  tak dikenali jatuh ke `C.text` — gelap, terbaca, tak pernah melanggar.

  Konsekuensinya disengaja: mengubah `color` sebuah role di basis tidak
  mengubah warna di layar ini. Yang diatur dari basis adalah role dan izinnya;
  kontras teks bukan hal yang boleh dikonfigurasi menjadi tak terbaca.
*/
const WARNA_ROLE: Record<string, string> = {
  admin: C.purple,
  direktur: C.purple,
  pm: C.blue,
  project_manager_senior: C.blue,
  site_manager: C.text,
  mandor: C.text,
  client: C.text,
};

function roleInfo(role: RoleKey, daftar: RoleRecord[]) {
  const r = daftar.find(x => x.name === role);
  return {
    key: role,
    label: r?.label ?? role,
    icon: IKON_ROLE[role] ?? User,
    color: WARNA_ROLE[role] ?? C.text,
    bg: "var(--surface-hover)",
    border: C.border,
  };
}

export default function UsersPage() {
  const [filterRole, setFilterRole] = useState<RoleKey | "all">("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);

  useEffect(() => { setCurrentUser(getStoredUser()); }, []);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useState+useEffect+queueMicrotask. Mutasi lokal
    optimistik pada `toggleActive` diganti `load()` (muatUlang): `useData`
    tak mengekspos setter mentah, dan `toggleActive` di sini SUDAH menunggu
    hasil server sebelum mengubah tampilan (bukan optimistik murni) — jadi
    menggantinya dengan refetch tak mengubah perilaku yang terlihat.
  */
  const { data, memuat: loading, muatUlang } = useData<{ users: UserRecord[] }>("/api/v1/users?all=true");
  /*
    Dibungkus useMemo — DIPERBAIKI 2026-08-31, bukan dibungkam.

    `?? []` membuat array BARU tiap render, jadi `useMemo` di bawah menerima
    dependensi yang selalu berbeda dan TAK PERNAH menahan hasilnya. Perhitungan
    di dalamnya berjalan ulang pada setiap render, termasuk render yang tak ada
    hubungannya dengan data ini.

    Jadi peringatan `exhaustive-deps` di sini menunjuk pemborosan yang nyata,
    bukan sekadar kerewelan aturan. Membungkus sumbernya membuat rujukannya
    stabil selama datanya sama, dan `useMemo` di bawah kembali bekerja.

    Perilakunya tidak berubah: nilai yang dihasilkan sama persis.
  */
  const users = useMemo(() => data?.users ?? [], [data?.users]);

  // Daftar role dari BASIS. `/api/v1/roles` sudah memilih satu baris per nama
  // (salinan tenant menang atas template) dan berhalaman — lihat catatan di
  // atas berkas ini.
  const { data: dataRole } = useData<{ roles: RoleRecord[] }>("/api/v1/roles");
  const semuaRole = useMemo(
    () => (dataRole?.roles ?? []).slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
    [dataRole],
  );
  const load = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  async function toggleActive(user: UserRecord) {
    try {
      await api.patch(`/api/v1/users/${user.id}/toggle-active`, {});
      await load();
    } catch (err: unknown) {
      // Kegagalan ini SEBELUMNYA ditelan, sementara baris di atas tetap
      // membalik tampilan lokal. Akibatnya daftar menunjukkan user
      // "nonaktif" padahal server menolak perubahannya — dan orang itu masih
      // bisa masuk. Menonaktifkan akun adalah tindakan keamanan; ia tak boleh
      // gagal tanpa suara.
      void kabari("Tidak berhasil", (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal mengubah status user");
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

  /*
    Kartu ringkasan hanya untuk role yang BENAR-BENAR dipakai — plus role yang
    sedang disaring, supaya saringannya tak lenyap saat hasilnya nol.

    Menampilkan 21 kartu berarti mayoritasnya "0", dan angka nol yang berjejer
    menenggelamkan yang bermakna. Yang lengkap ada di Matriks Izin; halaman ini
    menjawab "siapa saja yang ada", bukan "role apa saja yang mungkin".
  */
  const counts = useMemo(() => {
    return semuaRole
      .map(r => ({
        ...roleInfo(r.name, semuaRole),
        count: users.filter(u => u.role === r.name).length,
      }))
      .filter(r => r.count > 0 || filterRole === r.key);
  }, [semuaRole, users, filterRole]);
  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.
  const isAdmin = useIzin("users:manage");

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <KepalaHalaman
        judul="User Management"
        keterangan="Kelola akun pengguna aplikasi Puraloka Suite"
        ikon={<UserCog size={19} />}
        aksi={
          isAdmin ? (
            <button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <Plus size={14} /> Tambah User
            </button>
          ) : undefined
        }
      />

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
          {/* Padding kiri 32px memberi ruang untuk ikon kaca pembesar di
              atasnya — itu satu-satunya alasan kotak ini menyimpang dari
              `GAYA_ISIAN`, dan sisanya tetap dari kosakata bersama. */}
          <input className="isian-fokus" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, email, atau telepon..."
            style={{ ...GAYA_ISIAN, padding: "8px 12px 8px 32px" }} />
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
          <Kosong
            judul="Tidak ada pengguna yang cocok"
            sebab="Ubah kata pencarian atau saringan perannya. Pengguna baru ditambahkan lewat tombol Undang."
          />
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
          {filtered.map((u, i) => {
            const ri = roleInfo(u.role, semuaRole);
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
      {showAdd && <AddUserModal daftarRole={semuaRole} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); load(); }} />}
      {editUser && <EditUserModal user={editUser} daftarRole={semuaRole} onClose={() => setEditUser(null)} onSuccess={() => { setEditUser(null); load(); }} />}
    </div>
  );
}

/* ─── Pemilih role ────────────────────────────────────────────────────────────

   Dikelompokkan, bukan grid rata. Dua puluh satu tombol sejajar tak bisa
   dipindai mata; dikelompokkan menurut fungsi, ia terbaca seperti struktur
   organisasi dan orang menemukan "Kasir" tanpa membaca dua puluh nama lain.

   Role yang tak terdaftar di GRUP_ROLE jatuh ke "Lainnya" — jadi role baru
   yang dibuat lewat Matriks Izin TETAP MUNCUL, bukan hilang diam-diam. Itu
   syaratnya supaya daftar ini benar-benar config-first, bukan sekadar daftar
   panjang yang tetap harus disunting di kode.
*/
function PemilihRole({
  daftar, nilai, onPilih, idLabel = "role",
}: {
  daftar: RoleRecord[];
  nilai: RoleKey;
  onPilih: (r: RoleKey) => void;
  idLabel?: string;
}) {
  const kelompok = useMemo(() => {
    const sisa = new Set(daftar.map(r => r.name));
    const hasil: { judul: string; anggota: RoleRecord[] }[] = [];
    for (const g of GRUP_ROLE) {
      const anggota = g.anggota
        .map(n => daftar.find(r => r.name === n))
        .filter((r): r is RoleRecord => r != null);
      for (const a of anggota) sisa.delete(a.name);
      if (anggota.length) hasil.push({ judul: g.judul, anggota });
    }
    const lainnya = daftar.filter(r => sisa.has(r.name));
    if (lainnya.length) hasil.push({ judul: "Lainnya", anggota: lainnya });
    return hasil;
  }, [daftar]);

  if (!daftar.length) {
    // Bukan grid kosong tanpa keterangan: daftar role datang dari jaringan,
    // dan "belum termuat" berbeda dari "tak ada role".
    return (
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Memuat daftar role…</p>
    );
  }

  return (
    /*
      Pembungkus + selubung gradien di tepi bawah.

      Daftar ini SELALU lebih tinggi dari kotaknya (21 role), jadi baris
      terakhir yang terlihat pasti terpotong. Tanpa penanda, potongan itu
      terbaca seperti CACAT RENDER — bukan seperti "masih ada di bawah".
      Gradien membuatnya terbaca sebagai gulir, dan `pointerEvents: none`
      menjaga tombol di baliknya tetap bisa diklik.
    */
    <div style={{ position: "relative" }}>
    <div
      role="group"
      aria-labelledby={idLabel}
      style={{
        maxHeight: 260, overflowY: "auto",
        border: `1px solid ${C.border}`, borderRadius: 8,
        padding: "8px 8px 14px",
      }}
    >
      {kelompok.map(g => (
        <div key={g.judul} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            {g.judul}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {g.anggota.map(r => {
              const info = roleInfo(r.name, daftar);
              const Icon = info.icon;
              const active = nilai === r.name;
              return (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => onPilih(r.name)}
                  aria-pressed={active}
                  style={{
                    padding: "7px 10px", borderRadius: 6,
                    border: `2px solid ${active ? info.color : C.border}`,
                    background: active ? info.bg : "var(--surface)",
                    cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", gap: 7,
                    // Tinggi seragam: tanpa ini baris yang labelnya dua baris
                    // ("Manajer Lapangan / Pelaksana") membuat tetangganya
                    // ikut meninggi dan gridnya terlihat rusak.
                    minHeight: 40,
                  }}
                >
                  <Icon size={13} color={active ? info.color : C.muted} />
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? info.color : C.mid }}>
                    {info.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
    <div
      aria-hidden="true"
      style={{
        position: "absolute", left: 1, right: 1, bottom: 1, height: 24,
        borderRadius: "0 0 8px 8px",
        background: "linear-gradient(to bottom, transparent, var(--surface))",
        pointerEvents: "none",
      }}
    />
    </div>
  );
}

// ─── Modal: Tambah User Baru ──────────────────────────────────────────────────
function AddUserModal({ daftarRole, onClose, onSuccess }: { daftarRole: RoleRecord[]; onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useTerpasang();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<RoleKey>("mandor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  
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
            <input className="isian-fokus" id="name" value={name} onChange={e => setName(e.target.value)} placeholder="cth: Budi Santoso" style={GAYA_ISIAN} required />
          </div>
          <div>
            <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Email</label>
            <input className="isian-fokus" id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={GAYA_ISIAN} required />
          </div>
          <div>
            <label htmlFor="password" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Password</label>
            <input className="isian-fokus" id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 karakter" style={GAYA_ISIAN} required />
          </div>
          <div>
            <label htmlFor="phone" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>No. Telepon (opsional)</label>
            <input className="isian-fokus" id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812-xxxx-xxxx" style={GAYA_ISIAN} />
          </div>
          <div>
            <span id="role" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 8 }}>Role</span>
            <PemilihRole daftar={daftarRole} nilai={role} onPilih={setRole} />
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
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
function EditUserModal({ user, daftarRole, onClose, onSuccess }: { user: UserRecord; daftarRole: RoleRecord[]; onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useTerpasang();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState<RoleKey>(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


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
            <input className="isian-fokus" id="name-2" value={name} onChange={e => setName(e.target.value)} style={GAYA_ISIAN} required />
          </div>
          <div>
            <label htmlFor="phone-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>No. Telepon</label>
            <input className="isian-fokus" id="phone-2" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812-xxxx-xxxx" style={GAYA_ISIAN} />
          </div>
          <div>
            <span id="role-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 8 }}>Role</span>
            <PemilihRole daftar={daftarRole} nilai={role} onPilih={setRole} idLabel="role-2" />
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}


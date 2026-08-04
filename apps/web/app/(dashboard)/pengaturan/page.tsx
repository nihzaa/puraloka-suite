"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { api, hasPermission } from "@/lib/api";
import { Building2, CreditCard, Upload, Save, X, Check, AlertTriangle } from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyProfile {
  id?: string;
  company_name: string;
  tagline: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
  website: string;
  npwp: string;
  logo_url: string | null;
  bank_name: string;
  bank_account: string;
  bank_account_name: string;
  invoice_prefix: string;
  invoice_notes: string;
  signature_name: string;
}

const DEFAULTS: CompanyProfile = {
  company_name: "Puraloka Persada",
  tagline: "",
  address: "",
  city: "Bandung",
  postal_code: "",
  phone: "",
  email: "",
  website: "",
  npwp: "",
  logo_url: null,
  bank_name: "",
  bank_account: "",
  bank_account_name: "",
  invoice_prefix: "INV",
  invoice_notes: "",
  signature_name: "",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function PengaturanPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <PengaturanContent />;
}

function PengaturanContent() {
  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.
  const isAdmin = hasPermission("settings:manage");

  const [profile, setProfile] = useState<CompanyProfile>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Logo upload
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadProfile() {
    setLoading(true);
    try {
      const { data } = await api.get<{ company: CompanyProfile }>("/api/v1/settings/company");
      const raw = data.company as unknown as Record<string, unknown>;
      const normalized = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, v === null ? "" : v])
      ) as unknown as CompanyProfile;
      const merged = { ...DEFAULTS, ...normalized, logo_url: raw.logo_url as string | null };
      setProfile(merged);
      if (merged.logo_url) setLogoPreview(merged.logo_url);
    } catch {
      // Silently fail, keep defaults
    } finally {
      setLoading(false);
    }
  }

  function setField(key: keyof CompanyProfile, value: string) {
    setProfile(p => ({ ...p, [key]: value }));
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setToast({ type: "error", msg: "Logo maksimal 2MB" }); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setToast({ type: "error", msg: "Format logo harus JPEG, PNG, atau WebP" }); return;
    }

    // Preview
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);

    try {
      const fd = new FormData();
      fd.append("logo", file);
      const { data } = await api.post<{ logo_url: string }>("/api/v1/settings/company/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoPreview(data.logo_url);
      setProfile(p => ({ ...p, logo_url: data.logo_url }));
      setToast({ type: "success", msg: "Logo berhasil diupload" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "error", msg: msg ?? "Gagal upload logo" });
      setLogoPreview(profile.logo_url);
    } finally {
      setLogoUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.company_name.trim()) { setToast({ type: "error", msg: "Nama perusahaan wajib diisi" }); return; }
    setSaving(true);
    try {
      await api.put("/api/v1/settings/company", profile);
      setToast({ type: "success", msg: "Pengaturan berhasil disimpan" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "error", msg: msg ?? "Gagal menyimpan pengaturan" });
    } finally {
      setSaving(false);
    }
  }

  const initials = profile.company_name
    ? profile.company_name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "PP";

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-form)", margin: "0 auto" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: toast.type === "success" ? C.greenBg : C.redBg,
          border: `1px solid ${toast.type === "success" ? C.greenBorder : C.redBorder}`,
          borderRadius: 10, padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: 13,
          color: toast.type === "success" ? C.green : C.red,
        }}>
          {toast.type === "success" ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Pengaturan
        </h1>
        <p style={{ fontSize: 13, color: C.mid }}>
          Konfigurasi profil perusahaan, info pembayaran, dan format invoice
        </p>
        {!isAdmin && (
          <div style={{ marginTop: 10, padding: "8px 14px", borderRadius: 8, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 12, color: C.mid }}>
            Hanya admin yang dapat mengubah pengaturan perusahaan.
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: C.muted, fontSize: 14 }}>Memuat...</div>
      ) : (
        <form onSubmit={handleSave}>
          {/* ── Card 1: Identitas Perusahaan ── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Building2 size={16} color={C.navy} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Identitas Perusahaan</div>
                <div style={{ fontSize: 12, color: C.muted }}>Logo, nama, alamat, dan kontak perusahaan</div>
              </div>
            </div>

            <div style={{ padding: 24 }}>
              {/* Logo upload */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 10 }}>Logo Perusahaan</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {/* Preview area */}
                  <div
                    role="button"
                    tabIndex={isAdmin ? 0 : -1}
                    aria-disabled={!isAdmin}
                    onClick={() => isAdmin && fileRef.current?.click()}
                    onKeyDown={e => {
                      if (isAdmin && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault()   // Spasi jangan menggulir halaman
                        fileRef.current?.click()
                      }
                    }}
                    style={{
                      width: 96, height: 72, borderRadius: 10,
                      border: `2px dashed ${isAdmin ? C.navy : C.border}`,
                      background: C.navyLight,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: isAdmin ? "pointer" : "default",
                      overflow: "hidden", flexShrink: 0,
                      position: "relative",
                    }}>
                    {logoUploading && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.navy }}>
                        Uploading...
                      </div>
                    )}
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
                    ) : (
                      <span style={{ fontSize: 22, fontWeight: 800, color: C.navy, letterSpacing: "-1px" }}>{initials}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                      {logoPreview ? "Logo sudah diupload" : "Belum ada logo"}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                      JPEG, PNG, atau WebP. Maksimal 2MB.
                    </div>
                    {isAdmin && (
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={logoUploading}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.navy}`, background: logoUploading ? "var(--surface-hover)" : C.navyLight, color: C.navy, fontSize: 12, fontWeight: 600, cursor: logoUploading ? "not-allowed" : "pointer" }}>
                        <Upload size={13} /> {logoUploading ? "Uploading..." : "Pilih File"}
                      </button>
                    )}
                    {logoPreview && isAdmin && (
                      <button type="button" onClick={() => { setLogoPreview(null); setField("logo_url", ""); }}
                        style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                        <X size={12} /> Hapus
                      </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleLogoChange} />
                  </div>
                </div>
              </div>

              {/* Form fields grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Nama Perusahaan" required value={profile.company_name} onChange={v => setField("company_name", v)} disabled={!isAdmin} span={2} />
                <Field label="Tagline / Slogan" value={profile.tagline} onChange={v => setField("tagline", v)} disabled={!isAdmin} span={2} placeholder="Mis: Membangun Kepercayaan, Mewujudkan Impian" />
                <Field label="Alamat Lengkap" value={profile.address} onChange={v => setField("address", v)} disabled={!isAdmin} span={2} textarea rows={2} placeholder="Jl. Contoh No. 123, Kelurahan, Kecamatan" />
                <Field label="Kota" value={profile.city} onChange={v => setField("city", v)} disabled={!isAdmin} />
                <Field label="Kode Pos" value={profile.postal_code} onChange={v => setField("postal_code", v)} disabled={!isAdmin} />
                <Field label="Nomor Telepon" value={profile.phone} onChange={v => setField("phone", v)} disabled={!isAdmin} placeholder="+62 22 xxxxxxxx" />
                <Field label="Email" value={profile.email} onChange={v => setField("email", v)} disabled={!isAdmin} placeholder="info@puraloka.com" />
                <Field label="Website" value={profile.website} onChange={v => setField("website", v)} disabled={!isAdmin} placeholder="https://puraloka.com" />
                <Field label="NPWP" value={profile.npwp} onChange={v => setField("npwp", v)} disabled={!isAdmin} placeholder="XX.XXX.XXX.X-XXX.XXX" />
              </div>
            </div>
          </div>

          {/* ── Card 2: Pembayaran & Invoice ── */}
          <div style={{ ...card, marginBottom: 24 }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CreditCard size={16} color={C.green} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Info Pembayaran & Invoice</div>
                <div style={{ fontSize: 12, color: C.muted }}>Rekening tujuan dan konfigurasi invoice PDF</div>
              </div>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Nama Bank" value={profile.bank_name} onChange={v => setField("bank_name", v)} disabled={!isAdmin} placeholder="BCA / Mandiri / BRI" />
                <Field label="Nomor Rekening" value={profile.bank_account} onChange={v => setField("bank_account", v)} disabled={!isAdmin} placeholder="1234567890" />
                <Field label="Nama Pemilik Rekening" value={profile.bank_account_name} onChange={v => setField("bank_account_name", v)} disabled={!isAdmin} span={2} placeholder="PT Puraloka Persada" />

                <div style={{ gridColumn: "span 1" }}>
                  <label htmlFor="profile" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
                    Prefix Nomor Invoice
                  </label>
                  <input id="profile"
                    type="text" value={profile.invoice_prefix} onChange={e => setField("invoice_prefix", e.target.value)}
                    disabled={!isAdmin} maxLength={20}
                    style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", background: isAdmin ? "var(--surface)" : "var(--surface-subtle)", color: C.text, boxSizing: "border-box" }}
                    placeholder="INV"
                  />
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    Format: {profile.invoice_prefix || "INV"}/2026/06/001
                  </div>
                </div>

                <Field label="Nama Penandatangan" value={profile.signature_name} onChange={v => setField("signature_name", v)} disabled={!isAdmin} placeholder="Nizar Zulkarnain" />
                <Field label="Catatan Footer Invoice" value={profile.invoice_notes} onChange={v => setField("invoice_notes", v)} disabled={!isAdmin} span={2} textarea rows={2} placeholder="Mis: Pembayaran melebihi jatuh tempo dikenakan denda 2%/bulan" />
              </div>
            </div>
          </div>

          {/* Save button */}
          {isAdmin && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" disabled={saving}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "11px 24px", borderRadius: 9, border: "none",
                  background: saving ? "#94A3B8" : C.navy, color: "var(--surface)",
                  fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                }}>
                <Save size={15} />
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, value, onChange, disabled, required, span, textarea, rows, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; required?: boolean; span?: number;
  textarea?: boolean; rows?: number; placeholder?: string;
}) {
  const style: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid var(--border)", borderRadius: 8,
    fontSize: 13, outline: "none",
    background: disabled ? "var(--surface-subtle)" : "var(--surface)",
    color: "var(--text-primary)", resize: textarea ? "vertical" : undefined,
    boxSizing: "border-box", fontFamily: "inherit",
  };
  // `<label>` tanpa `htmlFor` hanya terlihat seperti label — pembaca layar
  // tak menghubungkannya ke field, jadi ia menyebut "kotak teks" tanpa nama.
  // Terdeteksi axe (`label` ×3 di halaman ini). `useId` dipakai, bukan
  // menurunkan `id` dari `label`, karena label boleh mengandung spasi/karakter
  // apa pun dan boleh muncul dua kali di satu halaman.
  const id = useId();
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label htmlFor={id} style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
        {label} {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </label>
      {textarea ? (
        <textarea id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} rows={rows ?? 2} placeholder={placeholder} style={style} />
      ) : (
        <input id={id} type="text" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} required={required} placeholder={placeholder} style={style} />
      )}
    </div>
  );
}

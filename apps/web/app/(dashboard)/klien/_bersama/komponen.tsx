"use client";

/**
 * KLIEN — tipe bersama, modal sunting, dan panel detail.
 *
 * ── Kenapa dipecah dari `page.tsx`
 *
 * Halaman ini melewati 800 baris setelah lapis ringkasan (UI-2-3) ditambahkan.
 * Yang dipindahkan ke sini adalah bagian yang paling tidak berhubungan dengan
 * tugas halaman utamanya: dua dialog yang berdiri sendiri, masing-masing
 * dengan state, pemuatan data, dan formulirnya sendiri. Yang tinggal di
 * `page.tsx` adalah ringkasan, saringan, dan daftar — satu alur baca.
 *
 * Pemecahannya SALIN-PERSIS, bukan tulis-ulang: keduanya dipindahkan apa
 * adanya supaya tak ada perilaku yang berubah diam-diam saat memindahkannya.
 *
 * ── `useTutupEsc` ikut pindah, dan itu bukan detail sepele
 *
 * Kedua dialog memanggilnya di baris pertama badan komponennya. Repo ini
 * pernah kehilangan panggilan itu persis saat memecah halaman — komentarnya
 * ikut, pemanggilannya tidak — dan `modal-esc-ratchet.mjs` (lantai 0) ada
 * karena kejadian itu. Jangan menghapusnya saat menyunting berkas ini.
 */

import { useEffect, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Plus, Building2, User, Phone, Mail, MapPin, Edit2, X, FileText,
  MessageCircle, ExternalLink,
} from "lucide-react";

import { api } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";

export interface Client {
  id: string;
  contact_person: string;
  company_name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  npwp: string | null;
  id_number: string | null;
  client_type: "perorangan" | "perusahaan";
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ClientProject {
  id: string;
  name: string;
  status: string;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  progress_pct?: number;
}

export interface ClientDetail extends Client {
  projects: ClientProject[];
  summary: {
    total_projects: number;
    total_contract_value: number;
    invoice_total: number;
    invoice_outstanding: number;
    invoice_overdue: number;
    invoice_paid: number;
  };
}


function fmtCurrency(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  planning:  { color: C.mid,    bg: "var(--surface-hover)", label: "Perencanaan" },
  active:    { color: C.green,  bg: C.greenBg, label: "Aktif" },
  on_hold:   { color: C.yellow, bg: "var(--warning-bg)", label: "Ditahan" },
  completed: { color: "var(--info)", bg: "var(--info-bg)", label: "Selesai" },
  cancelled: { color: C.red,   bg: C.redBg,   label: "Dibatalkan" },
};

export function ClientModal({
  client, onClose, onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved: (c: Client) => void;
}) {
  useTutupEsc(onClose);
  const [form, setForm] = useState({
    contact_person: client?.contact_person ?? "",
    phone: client?.phone ?? "",
    company_name: client?.company_name ?? "",
    email: client?.email ?? "",
    address: client?.address ?? "",
    npwp: client?.npwp ?? "",
    id_number: client?.id_number ?? "",
    client_type: client?.client_type ?? "perorangan",
    notes: client?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mounted = useTerpasang();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contact_person.trim()) { setError("Nama kontak wajib diisi"); return; }
    if (!form.phone.trim()) { setError("Nomor telepon wajib diisi"); return; }
    setSaving(true);
    setError("");
    try {
      const payload = {
        contact_person: form.contact_person.trim(),
        phone: form.phone.trim(),
        company_name: form.company_name.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        npwp: form.npwp.trim() || null,
        id_number: form.id_number.trim() || null,
        client_type: form.client_type,
        notes: form.notes.trim() || null,
      };
      let res: { data: { client: Client } };
      if (client) {
        res = await api.patch(`/api/v1/clients/${client.id}`, payload);
      } else {
        res = await api.post("/api/v1/clients", payload);
      }
      onSaved(res.data.client);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 6,
    border: `1px solid ${C.border}`, fontSize: 13, color: C.text,
    background: "var(--surface)", outline: "none",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 5 };

  if (!mounted) return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 540, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "var(--naik-3)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: C.text }}>
            {client ? "Edit Klien" : "Tambah Klien"}
          </h2>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.mid, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Tipe klien */}
          <div>
            <span id="tipe-klien" style={labelStyle}>Tipe Klien</span>
            <div role="group" aria-labelledby="tipe-klien" style={{ display: "flex", gap: 8 }}>
              {(["perorangan", "perusahaan"] as const).map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, client_type: t }))}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 6, border: `1.5px solid ${form.client_type === t ? C.navy : C.border}`,
                    background: form.client_type === t ? C.navyLight : "var(--surface)",
                    color: form.client_type === t ? C.navy : C.mid, fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  {t === "perorangan" ? "Perorangan" : "Perusahaan"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="contact-person" style={labelStyle}>Nama Kontak <span style={{ color: C.red }}>*</span></label>
              <input id="contact-person" value={form.contact_person} onChange={set("contact_person")} required style={inputStyle} placeholder="Nama lengkap" />
            </div>
            {form.client_type === "perusahaan" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="company-name" style={labelStyle}>Nama Perusahaan</label>
                <input id="company-name" value={form.company_name} onChange={set("company_name")} style={inputStyle} placeholder="CV / PT / UD ..." />
              </div>
            )}
            <div>
              <label htmlFor="phone" style={labelStyle}>No. Telepon <span style={{ color: C.red }}>*</span></label>
              <input id="phone" value={form.phone} onChange={set("phone")} required style={inputStyle} placeholder="08xx..." />
            </div>
            <div>
              <label htmlFor="email" style={labelStyle}>Email</label>
              <input id="email" type="email" value={form.email} onChange={set("email")} style={inputStyle} placeholder="email@..." />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="address" style={labelStyle}>Alamat</label>
              <input id="address" value={form.address} onChange={set("address")} style={inputStyle} placeholder="Jl. ..." />
            </div>
            <div>
              <label style={labelStyle}>{form.client_type === "perusahaan" ? "NPWP" : "NIK"}</label>
              <input
                value={form.client_type === "perusahaan" ? form.npwp : form.id_number}
                onChange={set(form.client_type === "perusahaan" ? "npwp" : "id_number")}
                style={inputStyle}
                placeholder={form.client_type === "perusahaan" ? "00.000.000.0-000.000" : "16 digit NIK"}
              />
            </div>
            <div>
              <label htmlFor="notes" style={labelStyle}>Catatan</label>
              <input id="notes" value={form.notes} onChange={set("notes")} style={inputStyle} placeholder="Opsional..." />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: C.red, background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 6, padding: "8px 12px" }}>
              {error}
            </div>
          )}
        </form>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer", color: C.mid }}>
            Batal
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: saving ? "#4D7AB5" : C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Menyimpan..." : client ? "Simpan Perubahan" : "Tambah Klien"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : "62" + digits;
  return `https://wa.me/${normalized}`;
}

export function DetailPanel({ clientId, onClose, onEdit, onCreateProject }: {
  clientId: string;
  onClose: () => void;
  onEdit: () => void;
  onCreateProject: () => void;
}) {
  useTutupEsc(onClose);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useTerpasang();

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api.get<{ client: Client; projects: ClientProject[]; summary: ClientDetail["summary"] }>(`/api/v1/clients/${clientId}`)
      .then(r => setDetail({ ...r.data.client, projects: r.data.projects, summary: r.data.summary }))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (!mounted) return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 440, height: "100%", background: "var(--surface)", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: C.text }}>Detail Klien</h2>
          <div style={{ display: "flex", gap: 4 }}>
            <button aria-label="Edit klien"
              onClick={onEdit}
              title="Edit klien"
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: `1px solid ${C.border}`, background: "var(--surface)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500, color: C.mid }}
              onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.borderColor = C.navy; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.mid; e.currentTarget.style.borderColor = C.border; }}
            >
              <Edit2 size={12} /> Edit
            </button>
            <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.mid, borderRadius: 6 }}><X size={16} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Memuat...</div>
          ) : detail ? (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>

              {/* Avatar + info dasar */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {detail.client_type === "perusahaan" ? <Building2 size={22} color={C.navy} /> : <User size={22} color={C.navy} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 2 }}>{detail.contact_person}</div>
                  {detail.company_name && <div style={{ fontSize: 12, color: C.mid, marginBottom: 4 }}>{detail.company_name}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: detail.client_type === "perusahaan" ? "var(--info-bg)" : C.greenBg, color: detail.client_type === "perusahaan" ? "var(--info)" : C.green, fontWeight: 500 }}>
                      {detail.client_type === "perusahaan" ? "Perusahaan" : "Perorangan"}
                    </span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: detail.is_active ? C.greenBg : "var(--surface-hover)", color: detail.is_active ? C.green : C.muted, fontWeight: 500 }}>
                      {detail.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Kontak — dengan WA + email link */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Telepon + WA */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text }}>
                    <Phone size={14} style={{ color: C.muted, flexShrink: 0 }} />
                    <span>{detail.phone}</span>
                  </div>
                  <a
                    href={waLink(detail.phone)}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, background: "var(--success-bg)", color: "var(--success)", fontSize: 11, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}
                  >
                    <MessageCircle size={11} /> WhatsApp
                  </a>
                </div>
                {/* Email */}
                {detail.email && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, minWidth: 0 }}>
                      <Mail size={14} style={{ color: C.muted, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.email}</span>
                    </div>
                    <a
                      href={`mailto:${detail.email}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, background: "var(--info-bg)", color: "var(--info)", fontSize: 11, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}
                    >
                      <ExternalLink size={11} /> Email
                    </a>
                  </div>
                )}
                {/* Alamat */}
                {detail.address && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: C.mid }}>
                    <MapPin size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ lineHeight: 1.5 }}>{detail.address}</span>
                  </div>
                )}
                {/* NIK / NPWP */}
                {(detail.npwp || detail.id_number) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.mid }}>
                    <FileText size={14} style={{ flexShrink: 0 }} />
                    <span>{detail.npwp ? `NPWP: ${detail.npwp}` : `NIK: ${detail.id_number}`}</span>
                  </div>
                )}
                {/* Notes */}
                {detail.notes && (
                  <div style={{ marginTop: 4, padding: "8px 12px", background: "var(--surface-subtle)", borderRadius: 6, fontSize: 12, color: C.mid, lineHeight: 1.5, borderLeft: `3px solid ${C.border}` }}>
                    {detail.notes}
                  </div>
                )}
              </div>

              {/* Summary KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Total Proyek", value: String(detail.summary.total_projects), color: C.navy },
                  { label: "Nilai Kontrak", value: fmtCurrency(detail.summary.total_contract_value), color: C.text },
                ].map(s => (
                  <div key={s.label} style={{ background: C.bg, borderRadius: 10, padding: "12px 12px", border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Invoice summary */}
              {(detail.summary.invoice_total > 0) && (
                <div style={{ background: C.bg, borderRadius: 10, padding: "12px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Ringkasan Invoice</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: C.mid }}>Total tagihan</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmtCurrency(detail.summary.invoice_total)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: C.mid }}>Sudah dibayar</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>{fmtCurrency(detail.summary.invoice_paid)}</span>
                    </div>
                    {detail.summary.invoice_outstanding > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: detail.summary.invoice_overdue > 0 ? C.redBg : C.yellowBg, borderRadius: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 12, color: detail.summary.invoice_overdue > 0 ? C.red : C.yellow, fontWeight: 500 }}>
                          {detail.summary.invoice_overdue > 0 ? "⚠ Overdue" : "Belum lunas"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: detail.summary.invoice_overdue > 0 ? C.red : C.yellow }}>
                          {fmtCurrency(detail.summary.invoice_outstanding)}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Progres bayar */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 5, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min((detail.summary.invoice_paid / detail.summary.invoice_total) * 100, 100)}%`,
                        background: C.green, borderRadius: 99,
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                      {Math.round((detail.summary.invoice_paid / detail.summary.invoice_total) * 100)}% terbayar
                    </div>
                  </div>
                </div>
              )}

              {/* Proyek */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Proyek Terkait
                  </div>
                  <button
                    onClick={onCreateProject}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: C.onNavy, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    <Plus size={11} /> Buat Proyek
                  </button>
                </div>
                {detail.projects.length === 0 ? (
                  <div style={{ fontSize: 13, color: C.muted, padding: "16px 0", textAlign: "center" }}>
                    Belum ada proyek untuk klien ini
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detail.projects.map(p => {
                      const s = STATUS_COLORS[p.status] ?? STATUS_COLORS.planning;
                      const pct = (p as ClientProject & { progress_pct?: number }).progress_pct ?? 0;
                      return (
                        // `<Link>`: bisa difokus, ditekan Enter, dibuka di tab
                        // baru, dan tautannya bisa disalin — semuanya hilang
                        // kalau navigasi ditulis sebagai `onClick` pada `<div>`.
                        <Link
                          key={p.id}
                          href={`/proyek/${p.id}`}
                          style={{ padding: "12px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", transition: "box-shadow 0.12s" }}
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,51,102,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                              {p.contract_value && (
                                <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{fmtCurrency(Number(p.contract_value))}</div>
                              )}
                            </div>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.color, fontWeight: 500, flexShrink: 0 }}>
                              {s.label}
                            </span>
                          </div>
                          {p.status === "active" && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginBottom: 3 }}>
                                <span>Progress</span>
                                <span style={{ fontWeight: 600, color: C.navy }}>{pct}%</span>
                              </div>
                              <div style={{ height: 4, background: "var(--surface-hover)", borderRadius: 99, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: C.navy, borderRadius: 99 }} />
                              </div>
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div style={{ padding: 24, color: C.red, fontSize: 13 }}>Klien tidak ditemukan</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

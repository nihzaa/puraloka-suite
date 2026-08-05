"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Search, Building2, User, Phone, Mail,
  MapPin, Edit2, X, ChevronRight, FolderKanban,
  ToggleLeft, ToggleRight, FileText, MessageCircle, ExternalLink,
} from "lucide-react";

import { C } from "@/lib/warna-ui";

interface Client {
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

interface ClientProject {
  id: string;
  name: string;
  status: string;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  progress_pct?: number;
}

interface ClientDetail extends Client {
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

function useMount() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
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

function ClientModal({
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
  const mounted = useMount();

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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
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

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : "62" + digits;
  return `https://wa.me/${normalized}`;
}

function DetailPanel({ clientId, onClose, onEdit, onCreateProject }: {
  clientId: string;
  onClose: () => void;
  onEdit: () => void;
  onCreateProject: () => void;
}) {
  useTutupEsc(onClose);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useMount();

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
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

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
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: "none", background: C.navy, color: C.onNavy, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
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

export default function KlienPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "perorangan" | "perusahaan">("all");
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);


  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ clients: Client[] }>("/api/v1/clients?all=true");
      setClients(r.data.clients);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(client: Client) {
    setTogglingId(client.id);
    try {
      await api.patch(`/api/v1/clients/${client.id}/toggle-active`, {});
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, is_active: !c.is_active } : c));
    } finally { setTogglingId(null); }
  }

  function onSaved(c: Client) {
    setClients(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next; }
      return [c, ...prev];
    });
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.contact_person.toLowerCase().includes(q) || (c.company_name ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || c.phone.includes(q);
    const matchType = filterType === "all" || c.client_type === filterType;
    return matchSearch && matchType;
  });

  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.
  const isAdmin = useIzin("clients:manage");

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Klien
          </h1>
          <p style={{ fontSize: 13, color: C.mid }}>
            {clients.filter(c => c.is_active).length} klien aktif · {clients.length} total
          </p>
        </div>
        <button
          onClick={() => { setEditClient(null); setShowModal(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={15} /> Tambah Klien
        </button>
      </div>

      {/* KPI strip */}
      {!loading && clients.length > 0 && (() => {
        const active = clients.filter(c => c.is_active).length;
        const perorangan = clients.filter(c => c.client_type === "perorangan").length;
        const perusahaan = clients.filter(c => c.client_type === "perusahaan").length;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Klien Aktif", value: String(active), sub: `dari ${clients.length} total`, color: C.navy },
              { label: "Perorangan", value: String(perorangan), sub: "tipe perorangan", color: C.text },
              { label: "Perusahaan", value: String(perusahaan), sub: "tipe badan usaha", color: C.text },
              { label: "Nonaktif", value: String(clients.length - active), sub: "diarsipkan", color: clients.length - active > 0 ? C.muted : C.green },
            ].map(k => (
              <div key={k.label} style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", boxShadow: "var(--naik-1)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.color, lineHeight: 1, fontFamily: "var(--font-display)" }}>{k.value}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, email, telepon..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none" }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "perorangan", "perusahaan"] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${filterType === t ? C.navy : C.border}`, background: filterType === t ? C.navyLight : "var(--surface)", color: filterType === t ? C.navy : C.mid, fontSize: 12, fontWeight: filterType === t ? 600 : 400, cursor: "pointer" }}>
              {t === "all" ? "Semua" : t === "perorangan" ? "Perorangan" : "Perusahaan"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Memuat data klien...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
            <Users size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>Tidak ada klien ditemukan</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <caption className="sr-only">Daftar klien: nama, kontak, tipe, dan status kerja sama.</caption>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                {["Klien", "Kontak", "Tipe", "Status", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Nama */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {c.client_type === "perusahaan" ? <Building2 size={15} color={C.navy} /> : <User size={15} color={C.navy} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.contact_person}</div>
                        {c.company_name && <div style={{ fontSize: 11, color: C.mid }}>{c.company_name}</div>}
                        {c.notes && (
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.notes}>
                            {c.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Kontak */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, color: C.text }}>{c.phone}</span>
                      <a
                        href={waLink(c.phone)}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="Hubungi via WhatsApp"
                        style={{ color: "var(--success)", lineHeight: 0 }}
                      >
                        <MessageCircle size={13} />
                      </a>
                    </div>
                    {c.email && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: C.mid }}>{c.email}</span>
                        <a
                          href={`mailto:${c.email}`}
                          onClick={e => e.stopPropagation()}
                          title="Kirim email"
                          style={{ color: "var(--info)", lineHeight: 0 }}
                        >
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                  </td>
                  {/* Tipe */}
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: c.client_type === "perusahaan" ? "var(--info-bg)" : "var(--success-bg)", color: c.client_type === "perusahaan" ? "var(--info)" : C.green, fontWeight: 500 }}>
                      {c.client_type === "perusahaan" ? "Perusahaan" : "Perorangan"}
                    </span>
                  </td>
                  {/* Status */}
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: c.is_active ? C.greenBg : "var(--surface-hover)", color: c.is_active ? C.green : C.mid, fontWeight: 500 }}>
                      {c.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  {/* Actions */}
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                      <button aria-label="Lihat proyek"
                        onClick={() => setDetailId(c.id)}
                        title="Lihat proyek"
                        style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.muted, borderRadius: 6, display: "flex" }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.navyLight; }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
                      >
                        <FolderKanban size={14} />
                      </button>
                      <button aria-label="Edit"
                        onClick={() => { setEditClient(c); setShowModal(true); }}
                        title="Edit"
                        style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.muted, borderRadius: 6, display: "flex" }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.navyLight; }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
                      >
                        <Edit2 size={14} />
                      </button>
                      {isAdmin && (
                        <button aria-label={c.is_active ? "Nonaktifkan" : "Aktifkan"}
                          onClick={() => toggleActive(c)}
                          disabled={togglingId === c.id}
                          title={c.is_active ? "Nonaktifkan" : "Aktifkan"}
                          style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: c.is_active ? C.green : C.muted, borderRadius: 6, display: "flex", opacity: togglingId === c.id ? 0.5 : 1 }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                        >
                          {c.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      )}
                      {/* Namanya menyertakan nama klien, bukan sekadar "Lihat
                          detail": tombol ini berulang di setiap baris, dan
                          pembaca layar yang menelusuri tombol satu per satu
                          akan mendengar "lihat detail" sepuluh kali tanpa tahu
                          detail SIAPA. */}
                      <button
                        aria-label={`Lihat detail ${c.company_name ?? c.contact_person}`}
                        onClick={() => setDetailId(c.id)}
                        style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.muted, borderRadius: 6, display: "flex" }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.navy; }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSaved={onSaved}
        />
      )}
      {detailId && (
        <DetailPanel
          clientId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const c = clients.find(x => x.id === detailId);
            if (c) { setEditClient(c); setShowModal(true); }
          }}
          onCreateProject={() => {
            setDetailId(null);
            router.push(`/proyek?new=1&client_id=${detailId}`);
          }}
        />
      )}
    </div>
  );
}

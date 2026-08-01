"use client";

import { useEffect, useState, useCallback } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { api, hasPermission } from "@/lib/api";
import { useUnits } from "@/lib/use-units";
import { createPortal } from "react-dom";
import {
  Package, Truck, ClipboardList, ShoppingCart, CheckSquare,
  FileText, AlertTriangle, Plus, X, Check, Search,
  Building2, Phone, MapPin, RefreshCw, BarChart3, Download,
  CreditCard, TrendingDown, Receipt, Send, History,
} from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)", bg: "var(--bg)",
  surface: "var(--surface)", border: "var(--border)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  success: "#15803D", successBg: "#DCFCE7",
  warning: "var(--warning)", warningBg: "#FEF3C7",
  danger: "var(--danger)", dangerBg: "var(--danger-bg)",
  info: "var(--info)", infoBg: "#DBEAFE",
};

const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

type Tab = "suppliers" | "materials" | "requests" | "purchase-orders" | "goods-receipts" | "invoices" | "stocks" | "laporan";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "suppliers",       label: "Supplier",       icon: Building2 },
  { key: "materials",       label: "Material",        icon: Package },
  { key: "requests",        label: "Material Request",icon: ClipboardList },
  { key: "purchase-orders", label: "Purchase Order",  icon: ShoppingCart },
  { key: "goods-receipts",  label: "Penerimaan",      icon: Truck },
  { key: "invoices",        label: "Hutang Supplier", icon: FileText },
  { key: "stocks",          label: "Stok",            icon: CheckSquare },
  { key: "laporan",         label: "Laporan",         icon: BarChart3 },
];

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  draft:              { label: "Draft",         color: C.mid,     bg: "var(--surface-hover)" },
  submitted:          { label: "Diajukan",      color: C.warning, bg: C.warningBg },
  approved:           { label: "Disetujui",     color: C.success, bg: C.successBg },
  rejected:           { label: "Ditolak",       color: C.danger,  bg: C.dangerBg },
  partially_ordered:  { label: "Sebagian PO",   color: C.info,    bg: C.infoBg },
  fully_ordered:      { label: "Sudah PO",      color: C.success, bg: C.successBg },
  sent:               { label: "Terkirim",      color: C.info,    bg: C.infoBg },
  confirmed:          { label: "Dikonfirmasi",  color: C.success, bg: C.successBg },
  partially_received: { label: "Sebagian",      color: C.warning, bg: C.warningBg },
  fully_received:     { label: "Lunas Terima",  color: C.success, bg: C.successBg },
  cancelled:          { label: "Dibatalkan",    color: C.danger,  bg: C.dangerBg },
  unpaid:             { label: "Belum Bayar",   color: C.danger,  bg: C.dangerBg },
  partial:            { label: "Sebagian",      color: C.warning, bg: C.warningBg },
  paid:               { label: "Lunas",         color: C.success, bg: C.successBg },
};

function Badge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, color: C.mid, bg: "var(--surface-hover)" };
  return (
    <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function Card({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, ...style }} onClick={onClick}>
      {children}
    </div>
  );
}

// ── Modal Shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useTutupEsc(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div style={{ position: "relative", background: C.surface, borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: C.surface, zIndex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{title}</span>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.mid, padding: 4, borderRadius: 6 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>{label}</label>
      <input {...props} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, color: C.text, boxSizing: "border-box", outline: "none", background: props.disabled ? C.bg : C.surface, ...props.style }} />
    </div>
  );
}

function Select({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>{label}</label>
      <select {...props} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, color: C.text, boxSizing: "border-box", background: C.surface }}>
        {children}
      </select>
    </div>
  );
}

function Btn({ children, variant = "primary", loading, ...props }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary:   { background: C.navy,    color: "var(--surface)",   border: "none" },
    secondary: { background: C.surface, color: C.text,   border: `1px solid ${C.border}` },
    danger:    { background: C.dangerBg,color: C.danger, border: `1px solid ${C.danger}` },
  };
  return (
    <button disabled={loading || props.disabled} {...props} style={{ ...styles[variant], padding: "9px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: loading || props.disabled ? "not-allowed" : "pointer", opacity: loading || props.disabled ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6, ...props.style }}>
      {loading ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}{children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════════
function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | "detail" | "edit" | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const blankForm = { name: "", contact_person: "", phone: "", email: "", address: "", city: "", payment_terms: "cod", notes: "" };
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get("/api/v1/procurement/suppliers").catch(() => null);
    setSuppliers(res?.data?.suppliers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const save = async () => {
    if (!form.name) return;
    setSaving(true); setSaveError("");
    try {
      if (modal === "edit" && selected?.supplier?.id) {
        await api.patch(`/api/v1/procurement/suppliers/${selected.supplier.id}`, form);
      } else {
        await api.post("/api/v1/procurement/suppliers", form);
      }
      setModal(null); setForm(blankForm); load();
    } catch (e: any) {
      setSaveError(e?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setSaving(false); }
  };

  const openDetail = async (s: any) => {
    const res = await api.get(`/api/v1/procurement/suppliers/${s.id}`).catch(() => null);
    setSelected(res?.data ?? s);
    setModal("detail");
  };

  const openEdit = (detail: any) => {
    const sup = detail?.supplier ?? detail;
    setForm({ name: sup.name ?? "", contact_person: sup.contact_person ?? "", phone: sup.phone ?? "", email: sup.email ?? "", address: sup.address ?? "", city: sup.city ?? "", payment_terms: sup.payment_terms ?? "cod", notes: sup.notes ?? "" });
    setModal("edit");
  };

  const PAYMENT_TERMS = [
    { value: "cod", label: "COD — Bayar saat terima" },
    { value: "prepaid", label: "Prepaid — Bayar sebelum kirim" },
    { value: "net_7", label: "Net 7 hari" },
    { value: "net_14", label: "Net 14 hari" },
    { value: "net_30", label: "Net 30 hari" },
    { value: "open_account", label: "Open Account — Hutang bebas" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari supplier..." style={{ paddingLeft: 32, padding: "9px 12px 9px 32px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }} />
        </div>
        <Btn onClick={() => setModal("add")}><Plus size={14} /> Tambah Supplier</Btn>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Belum ada supplier</div>}
          {filtered.map(s => (
            <Card key={s.id} style={{ cursor: "pointer" }} onClick={() => openDetail(s)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {s.contact_person && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{s.contact_person}</span>}
                    {s.phone && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>{s.phone}</span>}
                    {s.city && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{s.city}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: C.muted }}>{PAYMENT_TERMS.find(t => t.value === s.payment_terms)?.label ?? s.payment_terms}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "edit" ? "Edit Supplier" : "Tambah Supplier"} onClose={() => { setModal(null); setSaveError(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {saveError && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>{saveError}</div>}
            <Input label="Nama Toko / Perusahaan *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Toko Bangunan Maju" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Nama PIC" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              <Input label="No. HP / WA" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08xxx" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" />
              <Input label="Kota" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <Input label="Alamat" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            <Select label="Syarat Pembayaran" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}>
              {PAYMENT_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Input label="Catatan" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => { setModal(null); setSaveError(""); }}>Batal</Btn>
              <Btn loading={saving} onClick={save}>Simpan</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal === "detail" && selected && (
        <Modal title={selected.supplier?.name ?? "Detail Supplier"} onClose={() => { setModal(null); setSelected(null); }} width={640}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Btn variant="secondary" onClick={() => openEdit(selected)} style={{ fontSize: 12 }}>Edit Data Supplier</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              {selected.supplier?.phone && <div><span style={{ color: C.muted }}>HP/WA: </span>{selected.supplier.phone}</div>}
              {selected.supplier?.email && <div><span style={{ color: C.muted }}>Email: </span>{selected.supplier.email}</div>}
              {selected.supplier?.city && <div><span style={{ color: C.muted }}>Kota: </span>{selected.supplier.city}</div>}
              {selected.supplier?.payment_terms && <div><span style={{ color: C.muted }}>Syarat: </span>{selected.supplier.payment_terms}</div>}
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Hutang Belum Lunas</div>
              {(selected.invoices ?? []).filter((i: any) => i.status !== "paid").length === 0
                ? <div style={{ fontSize: 13, color: C.muted }}>Tidak ada hutang outstanding</div>
                : (selected.invoices ?? []).filter((i: any) => i.status !== "paid").map((inv: any) => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div>{inv.description ?? inv.invoice_number ?? "Invoice"}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>{fmtDate(inv.invoice_date)}{inv.due_date ? ` · Jatuh tempo: ${fmtDate(inv.due_date)}` : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: C.danger, fontWeight: 600 }}>{fmt(inv.amount_due)}</div>
                      <Badge status={inv.status} />
                    </div>
                  </div>
                ))
              }
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Riwayat Pembayaran</div>
              {(selected.payments ?? []).length === 0
                ? <div style={{ fontSize: 13, color: C.muted }}>Belum ada pembayaran</div>
                : (selected.payments ?? []).map((p: any) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div>{fmtDate(p.payment_date)} · {p.payment_method}</div>
                      {p.notes && <div style={{ color: C.muted, fontSize: 11 }}>{p.notes}</div>}
                    </div>
                    <div style={{ color: C.success, fontWeight: 600 }}>{fmt(p.amount)}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: MATERIALS
// ═══════════════════════════════════════════════════════════════════════════════
function MaterialsTab() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "sak", category_id: "", unit_price: "", min_stock: "", description: "" });

  const { units } = useUnits(); // sumber tunggal satuan (master `units`); procurement simpan symbol

  const load = useCallback(async () => {
    setLoading(true);
    const [matRes, catRes] = await Promise.all([
      api.get("/api/v1/procurement/materials", { params: { is_active: true } }).catch(() => null),
      api.get("/api/v1/procurement/material-categories").catch(() => null),
    ]);
    setMaterials(matRes?.data?.materials ?? []);
    setCategories(catRes?.data?.categories ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    (!catFilter || m.category?.id === catFilter)
  );

  const save = async () => {
    if (!form.name || !form.unit) return;
    setSaving(true);
    await api.post("/api/v1/procurement/materials", { ...form, unit_price: Number(form.unit_price) || 0, min_stock: Number(form.min_stock) || 0, category_id: form.category_id || null }).catch(() => null);
    setSaving(false);
    setModal(false);
    setForm({ name: "", unit: "sak", category_id: "", unit_price: "", min_stock: "", description: "" });
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari material..." style={{ paddingLeft: 32, padding: "9px 12px 9px 32px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }} />
        </div>
        <select aria-label="Saring kategori material" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, minWidth: 160 }}>
          <option value="">Semua Kategori</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Btn onClick={() => setModal(true)}><Plus size={14} /> Tambah Material</Btn>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {["Nama Material", "Kategori", "Satuan", "Harga Ref.", "Stok Min."].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 48, color: C.muted }}>Belum ada material</td></tr>
              ) : filtered.map(m => (
                <tr key={m.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 500, color: C.text }}>{m.name}</td>
                  <td style={{ padding: "10px 14px", color: C.mid }}>{m.category?.name ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: C.mid }}>{m.unit}</td>
                  <td style={{ padding: "10px 14px", color: C.text }}>{m.unit_price ? fmt(m.unit_price) : "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {m.min_stock > 0
                      ? <span style={{ fontSize: 12, fontWeight: 600, color: C.warning }}>{m.min_stock} {m.unit}</span>
                      : <span style={{ color: C.muted, fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title="Tambah Material" onClose={() => setModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="Nama Material *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Semen Portland 50kg" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Select label="Satuan *" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {units.map(u => <option key={u.code} value={u.symbol}>{u.symbol}</option>)}
              </Select>
              <Select label="Kategori" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">— Pilih Kategori —</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Harga Referensi (Rp)" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} type="number" placeholder="0" />
              <Input label="Stok Minimum (reorder alert)" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} type="number" placeholder="0" />
            </div>
            <Input label="Deskripsi" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => setModal(false)}>Batal</Btn>
              <Btn loading={saving} onClick={save}>Simpan</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: MATERIAL REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════
function MaterialRequestsTab() {
  const [mrs, setMrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailMr, setDetailMr] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get("/api/v1/procurement/material-requests", { params: statusFilter ? { status: statusFilter } : {} }).catch(() => null);
    setMrs(res?.data?.material_requests ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const submit = async (id: string) => {
    setSubmitting(id);
    await api.patch(`/api/v1/procurement/material-requests/${id}/submit`).catch(() => null);
    setSubmitting(null); load();
  };

  const approve = async (id: string) => {
    setApprovingId(id);
    await api.patch(`/api/v1/procurement/material-requests/${id}/approve`, { action: "approve" }).catch(() => null);
    setApprovingId(null); load();
  };

  const reject = async () => {
    if (!rejectId) return;
    setApprovingId(rejectId);
    await api.patch(`/api/v1/procurement/material-requests/${rejectId}/approve`, { action: "reject", rejection_notes: rejectNotes }).catch(() => null);
    setApprovingId(null); setRejectId(null); setRejectNotes(""); load();
  };

  const openDetail = async (mr: any) => {
    const res = await api.get(`/api/v1/procurement/material-requests/${mr.id}`).catch(() => null);
    setDetailMr(res?.data?.material_request ?? mr);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <select aria-label="Saring status Supplier" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}>
          <option value="">Semua Status</option>
          {["draft","submitted","approved","rejected","partially_ordered","fully_ordered"].map(s => (
            <option key={s} value={s}>{STATUS_BADGE[s]?.label ?? s}</option>
          ))}
        </select>
        <Btn onClick={() => setShowCreate(true)}><Plus size={14} /> Buat Material Request</Btn>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mrs.length === 0 && <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Belum ada Material Request</div>}
          {mrs.map(mr => (
            <Card key={mr.id} style={{ cursor: "pointer" }} onClick={() => openDetail(mr)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: C.navy }}>{mr.mr_number}</span>
                    <Badge status={mr.status} />
                  </div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                    {mr.project?.name} · {mr.requested_by?.name} · {fmtDate(mr.request_date)}
                  </div>
                  {mr.needed_date && <div style={{ fontSize: 12, color: C.warning }}>Dibutuhkan: {fmtDate(mr.needed_date)}</div>}
                  {mr.rejection_notes && <div style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>Alasan ditolak: {mr.rejection_notes}</div>}
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(mr.items ?? []).map((item: any) => (
                      <span key={item.id} style={{ fontSize: 11, padding: "2px 8px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, color: C.mid }}>
                        {item.material?.name} {item.qty_requested} {item.unit}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                  {mr.status === "draft" && (
                    <Btn loading={submitting === mr.id} onClick={() => submit(mr.id)}>Submit</Btn>
                  )}
                  {mr.status === "submitted" && hasPermission("procurement:mr:manage") && (
                    <>
                      <Btn loading={approvingId === mr.id} onClick={() => approve(mr.id)} style={{ background: C.successBg, color: C.success, border: `1px solid ${C.success}` }}>
                        <Check size={14} /> Setujui
                      </Btn>
                      <Btn loading={approvingId === mr.id} variant="danger" onClick={() => { setRejectId(mr.id); setRejectNotes(""); }}>
                        <X size={14} /> Tolak
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateMrModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); load(); }} />}

      {detailMr && (
        <Modal title={`Detail ${detailMr.mr_number}`} onClose={() => setDetailMr(null)} width={640}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: C.muted }}>Proyek: </span>{detailMr.project?.name ?? "—"}</div>
              <div><span style={{ color: C.muted }}>Diminta oleh: </span>{detailMr.requested_by?.name ?? "—"}</div>
              <div><span style={{ color: C.muted }}>Tanggal: </span>{fmtDate(detailMr.request_date)}</div>
              <div><span style={{ color: C.muted }}>Dibutuhkan: </span>{detailMr.needed_date ? fmtDate(detailMr.needed_date) : "—"}</div>
              {detailMr.approved_by_user && <div><span style={{ color: C.muted }}>Disetujui oleh: </span>{detailMr.approved_by_user?.name}</div>}
              {detailMr.approved_at && <div><span style={{ color: C.muted }}>Tgl Setuju: </span>{fmtDate(detailMr.approved_at)}</div>}
            </div>
            {detailMr.rejection_notes && (
              <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>
                <strong>Alasan ditolak:</strong> {detailMr.rejection_notes}
              </div>
            )}
            {detailMr.notes && <div style={{ fontSize: 13, color: C.mid }}><strong>Catatan:</strong> {detailMr.notes}</div>}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Daftar Material</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      {["Material", "Qty Diminta", "Satuan", "Harga Est.", "Catatan"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.mid, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(detailMr.items ?? []).map((item: any) => (
                      <tr key={item.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "9px 12px", fontWeight: 500 }}>{item.material?.name}</td>
                        <td style={{ padding: "9px 12px" }}>{item.qty_requested}</td>
                        <td style={{ padding: "9px 12px", color: C.mid }}>{item.unit}</td>
                        <td style={{ padding: "9px 12px" }}>{item.unit_price_est ? fmt(item.unit_price_est) : "—"}</td>
                        <td style={{ padding: "9px 12px", color: C.mid, fontSize: 12 }}>{item.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {rejectId && (
        <Modal title="Tolak Material Request" onClose={() => setRejectId(null)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: C.mid }}>Berikan alasan penolakan agar requester dapat merevisi MR.</div>
            <div>
              <label htmlFor="reject-notes" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Alasan Penolakan (opsional)</label>
              <textarea id="reject-notes" value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, resize: "vertical", boxSizing: "border-box" }} placeholder="cth: Kuantitas berlebihan, perlu revisi..." />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setRejectId(null)}>Batal</Btn>
              <Btn variant="danger" loading={approvingId === rejectId} onClick={reject}><X size={14} /> Konfirmasi Tolak</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateMrModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [form, setForm] = useState({ project_id: "", needed_date: "", notes: "" });
  const [items, setItems] = useState([{ material_id: "", qty: "", unit: "", unit_price_est: "", notes: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { units } = useUnits(); // sumber tunggal satuan (master `units`); procurement simpan symbol

  useEffect(() => {
    Promise.all([
      api.get("/api/v1/projects").catch(() => null),
      api.get("/api/v1/procurement/materials", { params: { is_active: true } }).catch(() => null),
    ]).then(([pRes, mRes]) => {
      setProjects(pRes?.data?.projects ?? []);
      setMaterials(mRes?.data?.materials ?? []);
    });
  }, []);

  const addItem = () => setItems(i => [...i, { material_id: "", qty: "", unit: "", unit_price_est: "", notes: "" }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, j) => j !== idx));
  const updateItem = (idx: number, field: string, val: string) => setItems(i => i.map((it, j) => j === idx ? { ...it, [field]: val } : it));

  const handleMaterialSelect = (idx: number, materialId: string) => {
    const mat = materials.find(m => m.id === materialId);
    updateItem(idx, "material_id", materialId);
    if (mat) {
      setItems(prev => prev.map((it, j) => j === idx ? { ...it, material_id: materialId, unit: mat.unit, unit_price_est: mat.unit_price ? String(mat.unit_price) : "" } : it));
    }
  };

  const handleSubmit = async () => {
    if (!form.project_id) { setError("Pilih proyek terlebih dahulu"); return; }
    const validItems = items.filter(i => i.material_id && Number(i.qty) > 0 && i.unit);
    if (validItems.length === 0) { setError("Tambahkan minimal 1 item material yang valid"); return; }
    setSaving(true); setError("");
    try {
      const res = await api.post("/api/v1/procurement/material-requests", {
        project_id: form.project_id,
        needed_date: form.needed_date || null,
        notes: form.notes || null,
      });
      const mrId = res.data?.material_request?.id;
      if (mrId) {
        await Promise.all(validItems.map(item =>
          api.post(`/api/v1/procurement/material-requests/${mrId}/items`, {
            material_id: item.material_id,
            qty_requested: Number(item.qty),
            unit: item.unit,
            unit_price_est: item.unit_price_est ? Number(item.unit_price_est) : null,
            notes: item.notes || null,
          }).catch(() => null)
        ));
      }
      onSuccess();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Gagal membuat MR");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Buat Material Request" onClose={onClose} width={700}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Select label="Proyek *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
            <option value="">— Pilih Proyek —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input label="Dibutuhkan Sebelum" value={form.needed_date} onChange={e => setForm(f => ({ ...f, needed_date: e.target.value }))} type="date" />
        </div>
        <Input label="Catatan" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Keterangan tambahan..." />

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Daftar Material *</span>
            <Btn variant="secondary" onClick={addItem} style={{ fontSize: 12 }}><Plus size={12} /> Tambah Item</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ background: C.bg, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <div>
                    <label htmlFor="item" style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Material *</label>
                    <select id="item" aria-label="Material" value={item.material_id} onChange={e => handleMaterialSelect(idx, e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surface }}>
                      <option value="">— Pilih —</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="item-2" style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Qty *</label>
                    <input id="item-2" type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} placeholder="0" />
                  </div>
                  <div>
                    <label htmlFor="item-3" style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Satuan *</label>
                    <select id="item-3" aria-label="Satuan" value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surface }}>
                      <option value="">—</option>
                      {units.map(u => <option key={u.code} value={u.symbol}>{u.symbol}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="item-4" style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Harga Est. (Rp)</label>
                    <input id="item-4" type="number" value={item.unit_price_est} onChange={e => updateItem(idx, "unit_price_est", e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} placeholder="0" />
                  </div>
                  <button aria-label="Tutup dialog" onClick={() => removeItem(idx)} disabled={items.length <= 1} style={{ background: "none", border: "none", cursor: items.length <= 1 ? "not-allowed" : "pointer", color: C.danger, padding: 4, opacity: items.length <= 1 ? 0.3 : 1 }}>
                    <X size={16} />
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <input value={item.notes} onChange={e => updateItem(idx, "notes", e.target.value)} placeholder="Catatan item (opsional)..." style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, boxSizing: "border-box" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn loading={saving} onClick={handleSubmit}>Buat Material Request</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════════
// ── Tipe & helper untuk pengiriman PO (Modul 9b) ────────────────────────────
interface PoRingkas {
  id: string;
  po_number: string;
  supplier?: { name?: string; phone?: string | null } | null;
}
interface PesanKirimPo {
  po_number: string;
  pesan: string;
  /** null bila nomor supplier tak sah — tombol WA WAJIB disembunyikan. */
  wa_url: string | null;
  email_tujuan: string | null;
  sudah_dikirim: { whatsapp_at: string | null; email_at: string | null };
}
interface LogKirimPo {
  id: string;
  channel: string;
  recipient: string | null;
  status: string;
  sent_at: string;
  sender?: { name?: string } | null;
}

/** Pesan error dari axios tanpa `any` — bentuknya dipersempit, bukan dipercaya. */
function pesanError(e: unknown, bawaan: string): string {
  const r = (e as { response?: { data?: { error?: string } } })?.response;
  return r?.data?.error ?? bawaan;
}

// ── Modul 9b (ROADMAP #12) — kirim PO ke vendor, dengan jejak ────────────────
//
// Versi lama: satu `<a href="wa.me/...">` yang merakit teks di UI dan tak
// memanggil server sama sekali. Akibatnya `whatsapp_sent_at` terisi pada NOL
// dari 4 PO — pertanyaan "PO ini sudah dikirim belum, kapan, ke siapa" tak
// punya jawaban selain ingatan orang.
//
// Sekarang: pratinjau pesan (disusun server, memuat rincian item) → buka
// WhatsApp → catat pengiriman. Pratinjau bukan hiasan: teks ini keluar ke pihak
// ketiga, dan yang mengirim berhak melihatnya sebelum terkirim.
function KirimPoModal({ po, onClose, onSuccess }: { po: PoRingkas; onClose: () => void; onSuccess: () => void }) {
  const [data, setData] = useState<PesanKirimPo | null>(null);
  const [riwayat, setRiwayat] = useState<LogKirimPo[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [mengirim, setMengirim] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let batal = false;
    void Promise.all([
      api.get<PesanKirimPo>(`/api/v1/procurement/purchase-orders/${po.id}/delivery-message`),
      api.get<{ data: LogKirimPo[] }>(`/api/v1/procurement/purchase-orders/${po.id}/delivery-log`),
    ])
      .then(([m, l]) => {
        if (batal) return;
        setData(m.data); setRiwayat(l.data.data ?? []);
      })
      .catch((e: unknown) => { if (!batal) setErr(pesanError(e, "Gagal memuat pesan")); })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [po.id]);

  async function kirim(channel: "whatsapp" | "email" | "manual") {
    setMengirim(true); setErr("");
    try {
      // WhatsApp dibuka LEBIH DULU, pencatatan menyusul. Kalau urutannya
      // dibalik dan pembukaan gagal (popup diblokir), jejaknya sudah terlanjur
      // mengklaim terkirim.
      if (channel === "whatsapp" && data?.wa_url) window.open(data.wa_url, "_blank", "noopener");
      await api.post(`/api/v1/procurement/purchase-orders/${po.id}/delivery-log`, {
        channel,
        recipient: channel === "email" ? data?.email_tujuan : po.supplier?.phone,
      });
      onSuccess();
    } catch (e: unknown) {
      setErr(pesanError(e, "Gagal mencatat pengiriman"));
    } finally { setMengirim(false); }
  }

  return (
    <Modal title={`Kirim ${po.po_number} ke Vendor`} onClose={onClose} width={620}>
      {memuat && <div style={{ padding: 20, fontSize: 13, color: "#6B7280" }}>Memuat pesan…</div>}
      {err && (
        <div role="alert" style={{ padding: "10px 12px", background: "#FEE2E2", color: "#B91C1C",
          borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{err}</div>
      )}

      {data && !memuat && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6 }}>
            Pratinjau pesan
          </div>
          <pre style={{ margin: 0, padding: 12, background: "#F8F9FA", border: "1px solid #E5E7EB",
            borderRadius: 8, fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
            fontFamily: "inherit", maxHeight: 260, overflowY: "auto" }}>
            {data.pesan}
          </pre>

          {data.sudah_dikirim?.whatsapp_at && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#B45309" }}>
              Sudah pernah dikirim via WhatsApp pada{" "}
              {new Date(data.sudah_dikirim.whatsapp_at).toLocaleString("id-ID")}. Mengirim
              ulang akan menambah catatan baru, bukan menimpa yang lama.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {/* Tombol WA disembunyikan kalau nomornya tak sah — tautan ke nomor
                ngawur lebih buruk daripada tombol yang tak muncul. */}
            {data.wa_url ? (
              <Btn onClick={() => void kirim("whatsapp")} loading={mengirim}>
                <Send size={14} /> Buka WhatsApp &amp; catat
              </Btn>
            ) : (
              <span style={{ fontSize: 12, color: "#B91C1C" }}>
                Nomor telepon supplier tidak valid — perbaiki di menu Supplier.
              </span>
            )}
            <Btn variant="secondary" onClick={() => void kirim("manual")} loading={mengirim}>
              Catat sudah dikirim manual
            </Btn>
          </div>

          {riwayat.length > 0 && (
            <div style={{ marginTop: 18, borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                fontWeight: 600, color: "#6B7280", marginBottom: 8 }}>
                <History size={13} /> Riwayat pengiriman ({riwayat.length})
              </div>
              {riwayat.map((r) => (
                <div key={r.id} style={{ fontSize: 12, color: "#111827", padding: "5px 0",
                  borderBottom: "1px solid #F3F4F6" }}>
                  <strong>{r.channel}</strong> · {new Date(r.sent_at).toLocaleString("id-ID")}
                  {r.sender?.name && ` · oleh ${r.sender.name}`}
                  {r.recipient && <span style={{ color: "#6B7280" }}> · {r.recipient}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function PurchaseOrdersTab() {
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailPo, setDetailPo] = useState<any>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [kirimPo, setKirimPo] = useState<PoRingkas | null>(null);
  const canManage = hasPermission("procurement:po:manage");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get("/api/v1/procurement/purchase-orders", { params: statusFilter ? { status: statusFilter } : {} }).catch(() => null);
    setPos(res?.data?.purchase_orders ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/api/v1/procurement/purchase-orders/${id}/status`, { status }).catch(() => null);
    load();
  };

  const openDetail = async (po: any) => {
    const res = await api.get(`/api/v1/procurement/purchase-orders/${po.id}`).catch(() => null);
    setDetailPo(res?.data?.purchase_order ?? po);
  };

  const cancelPo = async () => {
    if (!cancelId) return;
    setCancelling(true);
    await api.patch(`/api/v1/procurement/purchase-orders/${cancelId}/cancel`, { notes: cancelNotes }).catch(() => null);
    setCancelling(false); setCancelId(null); setCancelNotes(""); load();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <select aria-label="Saring status Material Request" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}>
          <option value="">Semua Status</option>
          {["draft","sent","confirmed","partially_received","fully_received","cancelled"].map(s => (
            <option key={s} value={s}>{STATUS_BADGE[s]?.label ?? s}</option>
          ))}
        </select>
        {canManage && <Btn onClick={() => setShowCreate(true)}><Plus size={14} /> Buat Purchase Order</Btn>}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pos.length === 0 && <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Belum ada Purchase Order</div>}
          {pos.map(po => (
            <Card key={po.id} style={{ cursor: "pointer" }} onClick={() => openDetail(po)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: C.navy }}>{po.po_number}</span>
                    <Badge status={po.status} />
                  </div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                    {po.supplier?.name} · {po.project?.name} · {fmtDate(po.order_date)}
                  </div>
                  {po.expected_delivery_date && (
                    <div style={{ fontSize: 12, color: C.mid }}>Estimasi tiba: {fmtDate(po.expected_delivery_date)}</div>
                  )}
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: C.text }}>{fmt(po.total_amount)}</div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(po.items ?? []).map((item: any) => (
                      <span key={item.id} style={{ fontSize: 11, padding: "2px 8px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, color: C.mid }}>
                        {item.material?.name} {item.qty_ordered}{item.unit} × {fmt(item.unit_price)}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                  {po.status === "draft" && canManage && (
                    <Btn onClick={() => updateStatus(po.id, "sent")} style={{ fontSize: 12 }}>
                      <Truck size={13} /> Kirim ke Supplier
                    </Btn>
                  )}
                  {po.status === "sent" && canManage && (
                    <Btn onClick={() => updateStatus(po.id, "confirmed")} style={{ background: C.successBg, color: C.success, border: `1px solid ${C.success}`, fontSize: 12 }}>
                      <Check size={13} /> Supplier Konfirmasi
                    </Btn>
                  )}
                  {["draft","sent"].includes(po.status) && canManage && (
                    <Btn variant="danger" onClick={() => { setCancelId(po.id); setCancelNotes(""); }} style={{ fontSize: 12 }}>
                      <X size={13} /> Batalkan
                    </Btn>
                  )}
                  {/* Modul 9b: pesan disusun di SERVER (lib/pesan-po.ts) — memuat
                      rincian item, bukan cuma total — dan pengirimannya DICATAT.
                      Versi lama merakit teks di sini dan tak meninggalkan jejak:
                      "PO ini sudah dikirim belum?" tak punya jawaban. */}
                  {po.supplier?.phone && canManage && (
                    <Btn variant="secondary" onClick={() => setKirimPo(po)} style={{ fontSize: 12 }}>
                      <Send size={13} /> Kirim ke Vendor
                    </Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreatePoModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); load(); }} />}
      {kirimPo && <KirimPoModal po={kirimPo} onClose={() => setKirimPo(null)} onSuccess={() => { setKirimPo(null); load(); }} />}

      {detailPo && (
        <Modal title={`Detail ${detailPo.po_number}`} onClose={() => setDetailPo(null)} width={680}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: C.muted }}>Supplier: </span><strong>{detailPo.supplier?.name}</strong></div>
              <div><span style={{ color: C.muted }}>Proyek: </span>{detailPo.project?.name}</div>
              <div><span style={{ color: C.muted }}>Tgl Order: </span>{fmtDate(detailPo.order_date)}</div>
              <div><span style={{ color: C.muted }}>Est. Tiba: </span>{detailPo.expected_delivery_date ? fmtDate(detailPo.expected_delivery_date) : "—"}</div>
              <div><span style={{ color: C.muted }}>Syarat Bayar: </span>{detailPo.payment_terms}</div>
              <div><span style={{ color: C.muted }}>Dibuat oleh: </span>{detailPo.created_by?.name}</div>
              {detailPo.mr && <div><span style={{ color: C.muted }}>Dari MR: </span>{detailPo.mr.mr_number}</div>}
            </div>
            {detailPo.delivery_address && <div style={{ fontSize: 13 }}><span style={{ color: C.muted }}>Alamat kirim: </span>{detailPo.delivery_address}</div>}
            {detailPo.notes && <div style={{ fontSize: 13 }}><span style={{ color: C.muted }}>Catatan: </span>{detailPo.notes}</div>}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Daftar Item</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      {["Material", "Qty Order", "Diterima", "Satuan", "Harga/Unit", "Total"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: h === "Total" || h === "Harga/Unit" ? "right" : "left", fontWeight: 600, color: C.mid, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(detailPo.items ?? []).map((item: any) => (
                      <tr key={item.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "9px 12px", fontWeight: 500 }}>{item.material?.name}</td>
                        <td style={{ padding: "9px 12px" }}>{item.qty_ordered}</td>
                        <td style={{ padding: "9px 12px", color: item.qty_received >= item.qty_ordered ? C.success : C.warning }}>{item.qty_received}</td>
                        <td style={{ padding: "9px 12px", color: C.mid }}>{item.unit}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmt(item.unit_price)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600 }}>{fmt(item.total_price)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
                      <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Total PO</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, textAlign: "right", color: C.navy }}>{fmt(detailPo.total_amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {cancelId && (
        <Modal title="Batalkan Purchase Order" onClose={() => setCancelId(null)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>
              PO yang dibatalkan tidak bisa diaktifkan kembali. MR terkait akan dikembalikan ke status Approved.
            </div>
            <Input label="Alasan Pembatalan (opsional)" value={cancelNotes} onChange={e => setCancelNotes(e.target.value)} placeholder="cth: Supplier tidak tersedia..." />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setCancelId(null)}>Batal</Btn>
              <Btn variant="danger" loading={cancelling} onClick={cancelPo}>Konfirmasi Batalkan PO</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreatePoModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [approvedMrs, setApprovedMrs] = useState<any[]>([]);
  const [form, setForm] = useState({ project_id: "", supplier_id: "", mr_id: "", expected_delivery_date: "", delivery_address: "", payment_terms: "", notes: "" });
  const [items, setItems] = useState([{ material_id: "", qty: "", unit: "", unit_price: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { units } = useUnits(); // sumber tunggal satuan (master `units`); procurement simpan symbol

  useEffect(() => {
    Promise.all([
      api.get("/api/v1/projects").catch(() => null),
      api.get("/api/v1/procurement/suppliers").catch(() => null),
      api.get("/api/v1/procurement/materials", { params: { is_active: true } }).catch(() => null),
      api.get("/api/v1/procurement/material-requests", { params: { status: "approved" } }).catch(() => null),
    ]).then(([pRes, sRes, mRes, mrRes]) => {
      setProjects(pRes?.data?.projects ?? []);
      setSuppliers(sRes?.data?.suppliers ?? []);
      setMaterials(mRes?.data?.materials ?? []);
      setApprovedMrs(mrRes?.data?.material_requests ?? []);
    });
  }, []);

  const loadFromMr = (mrId: string) => {
    const mr = approvedMrs.find(m => m.id === mrId);
    if (!mr) return;
    setForm(f => ({ ...f, mr_id: mrId, project_id: mr.project?.id ?? f.project_id }));
    if (mr.items?.length > 0) {
      setItems(mr.items.map((i: any) => ({
        material_id: i.material?.id ?? "",
        qty: String(i.qty_requested),
        unit: i.unit,
        unit_price: i.unit_price_est ? String(i.unit_price_est) : "",
      })));
    }
  };

  const addItem = () => setItems(i => [...i, { material_id: "", qty: "", unit: "", unit_price: "" }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, j) => j !== idx));
  const updateItem = (idx: number, field: string, val: string) => setItems(i => i.map((it, j) => j === idx ? { ...it, [field]: val } : it));
  const total = items.reduce((s, i) => s + (Number(i.qty) * Number(i.unit_price)), 0);

  const handleSubmit = async () => {
    if (!form.project_id || !form.supplier_id) { setError("Proyek dan Supplier wajib diisi"); return; }
    const validItems = items.filter(i => i.material_id && Number(i.qty) > 0 && i.unit && Number(i.unit_price) >= 0);
    if (validItems.length === 0) { setError("Tambahkan minimal 1 item PO yang valid"); return; }
    setSaving(true); setError("");
    try {
      await api.post("/api/v1/procurement/purchase-orders", {
        project_id: form.project_id,
        supplier_id: form.supplier_id,
        mr_id: form.mr_id || null,
        expected_delivery_date: form.expected_delivery_date || null,
        delivery_address: form.delivery_address || null,
        payment_terms: form.payment_terms || null,
        notes: form.notes || null,
        items: validItems.map(i => ({ material_id: i.material_id, qty_ordered: Number(i.qty), unit: i.unit, unit_price: Number(i.unit_price) })),
      });
      onSuccess();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Gagal membuat PO");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Buat Purchase Order" onClose={onClose} width={720}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>{error}</div>}

        {approvedMrs.length > 0 && (
          <div style={{ background: C.infoBg, border: `1px solid ${C.info}`, borderRadius: 8, padding: "10px 14px" }}>
            <label htmlFor="form" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.info, marginBottom: 6 }}>BUAT DARI MR (Opsional) — Item akan terisi otomatis</label>
            <select id="form" aria-label="Pilih Material Request" value={form.mr_id} onChange={e => { setForm(f => ({ ...f, mr_id: e.target.value })); if (e.target.value) loadFromMr(e.target.value); }} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surface }}>
              <option value="">— Buat PO manual tanpa MR —</option>
              {approvedMrs.map(m => <option key={m.id} value={m.id}>{m.mr_number} — {m.project?.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Select label="Proyek *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
            <option value="">— Pilih Proyek —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select label="Supplier *" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
            <option value="">— Pilih Supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Estimasi Tiba" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} type="date" />
          <Input label="Syarat Pembayaran" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} placeholder="cth: NET 14, COD..." />
        </div>
        <Input label="Alamat Pengiriman" value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))} placeholder="Sama dengan lokasi proyek jika kosong" />
        <Input label="Catatan" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Item PO *</span>
            <Btn variant="secondary" onClick={addItem} style={{ fontSize: 12 }}><Plus size={12} /> Tambah Item</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ background: C.bg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Material *</label>
                    <select aria-label="Material" value={item.material_id} onChange={e => { updateItem(idx, "material_id", e.target.value); const mat = materials.find(m => m.id === e.target.value); if (mat) setItems(prev => prev.map((it, j) => j === idx ? { ...it, material_id: e.target.value, unit: mat.unit, unit_price: mat.unit_price ? String(mat.unit_price) : "" } : it)); }} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surface }}>
                      <option value="">— Pilih —</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="item-5" style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Qty *</label>
                    <input id="item-5" type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label htmlFor="item-6" style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Satuan *</label>
                    <select id="item-6" aria-label="Satuan" value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surface }}>
                      <option value="">—</option>
                      {units.map(u => <option key={u.code} value={u.symbol}>{u.symbol}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="item-7" style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.mid, marginBottom: 4 }}>Harga/Unit (Rp) *</label>
                    <input id="item-7" type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                  <button aria-label="Tutup dialog" onClick={() => removeItem(idx)} disabled={items.length <= 1} style={{ background: "none", border: "none", cursor: items.length <= 1 ? "not-allowed" : "pointer", color: C.danger, padding: 4, opacity: items.length <= 1 ? 0.3 : 1 }}>
                    <X size={16} />
                  </button>
                </div>
                {item.qty && item.unit_price && (
                  <div style={{ textAlign: "right", fontSize: 12, color: C.mid, marginTop: 6 }}>
                    Subtotal: <strong>{fmt(Number(item.qty) * Number(item.unit_price))}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
          {total > 0 && (
            <div style={{ textAlign: "right", marginTop: 12, fontSize: 15, fontWeight: 700, color: C.navy }}>
              Total PO: {fmt(total)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn loading={saving} onClick={handleSubmit}>Buat Purchase Order</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: GOODS RECEIPTS
// ═══════════════════════════════════════════════════════════════════════════════
function GoodsReceiptsTab() {
  const [grs, setGrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const canManage = hasPermission("procurement:po:manage");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get("/api/v1/procurement/goods-receipts", { params: statusFilter ? { status: statusFilter } : {} }).catch(() => null);
    setGrs(res?.data?.goods_receipts ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const confirm = async (id: string) => {
    setConfirming(id);
    await api.patch(`/api/v1/procurement/goods-receipts/${id}/confirm`).catch(() => null);
    setConfirming(null); load();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <select aria-label="Saring status Purchase Order" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}>
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Dikonfirmasi</option>
        </select>
        {canManage && <Btn onClick={() => setShowCreate(true)}><Plus size={14} /> Catat Penerimaan</Btn>}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {grs.length === 0 && <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Belum ada penerimaan barang</div>}
          {grs.map(gr => (
            <Card key={gr.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: C.navy }}>{gr.gr_number}</span>
                    <Badge status={gr.status} />
                  </div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                    {gr.supplier?.name} · {gr.project?.name} · {fmtDate(gr.receipt_date)}
                  </div>
                  <div style={{ fontSize: 12, color: C.mid }}>dari PO: {gr.po?.po_number}</div>
                  {gr.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>Catatan: {gr.notes}</div>}
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(gr.items ?? []).map((item: any) => (
                      <span key={item.id} style={{ fontSize: 11, padding: "2px 8px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, color: C.mid }}>
                        {item.material?.name} {item.qty_received} {item.unit}
                      </span>
                    ))}
                  </div>
                </div>
                {gr.status === "draft" && canManage && (
                  <Btn loading={confirming === gr.id} onClick={() => confirm(gr.id)} style={{ background: C.successBg, color: C.success, border: `1px solid ${C.success}` }}>
                    <Check size={14} /> Konfirmasi Terima
                  </Btn>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateGrModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateGrModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [confirmedPos, setConfirmedPos] = useState<any[]>([]);
  const [selectedPo, setSelectedPo] = useState<any>(null);
  const [form, setForm] = useState({ po_id: "", receipt_date: new Date().toISOString().split("T")[0], notes: "" });
  const [items, setItems] = useState<Array<{ po_item_id: string; material_name: string; unit: string; qty_ordered: number; qty_received: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/v1/procurement/purchase-orders", { params: { status: "confirmed" } }).then(r => {
      setConfirmedPos(r.data?.purchase_orders ?? []);
    }).catch(() => null);
  }, []);

  const loadPoItems = async (poId: string) => {
    const res = await api.get(`/api/v1/procurement/purchase-orders/${poId}`).catch(() => null);
    const po = res?.data?.purchase_order;
    if (!po) return;
    setSelectedPo(po);
    setItems((po.items ?? []).map((i: any) => ({
      po_item_id: i.id,
      material_name: i.material?.name ?? "—",
      unit: i.unit,
      qty_ordered: Number(i.qty_ordered),
      qty_received: String(i.qty_ordered - (i.qty_received ?? 0)),
    })));
  };

  const handlePoChange = (poId: string) => {
    setForm(f => ({ ...f, po_id: poId }));
    if (poId) loadPoItems(poId);
    else { setSelectedPo(null); setItems([]); }
  };

  const handleSubmit = async () => {
    if (!form.po_id) { setError("Pilih Purchase Order terlebih dahulu"); return; }
    const validItems = items.filter(i => Number(i.qty_received) > 0);
    if (validItems.length === 0) { setError("Masukkan qty barang yang diterima"); return; }
    setSaving(true); setError("");
    try {
      await api.post("/api/v1/procurement/goods-receipts", {
        po_id: form.po_id,
        receipt_date: form.receipt_date,
        notes: form.notes || null,
        items: validItems.map(i => ({ po_item_id: i.po_item_id, qty_received: Number(i.qty_received) })),
      });
      onSuccess();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Gagal mencatat penerimaan");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Catat Penerimaan Barang (GR)" onClose={onClose} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Select label="Purchase Order (Confirmed) *" value={form.po_id} onChange={e => handlePoChange(e.target.value)}>
            <option value="">— Pilih PO —</option>
            {confirmedPos.map(po => <option key={po.id} value={po.id}>{po.po_number} — {po.supplier?.name}</option>)}
          </Select>
          <Input label="Tanggal Terima *" value={form.receipt_date} onChange={e => setForm(f => ({ ...f, receipt_date: e.target.value }))} type="date" />
        </div>

        {selectedPo && (
          <div style={{ fontSize: 12, color: C.mid, background: C.bg, borderRadius: 8, padding: "8px 12px" }}>
            Proyek: <strong>{selectedPo.project?.name}</strong> · Supplier: <strong>{selectedPo.supplier?.name}</strong>
          </div>
        )}

        {items.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Qty Barang Diterima</div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.mid, fontSize: 11 }}>Material</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: C.mid, fontSize: 11 }}>Qty Pesan</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: C.mid, fontSize: 11 }}>Qty Diterima</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.mid, fontSize: 11 }}>Satuan</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.po_item_id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "9px 12px", fontWeight: 500 }}>{item.material_name}</td>
                      <td style={{ padding: "9px 12px", textAlign: "center", color: C.mid }}>{item.qty_ordered}</td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        <input
                          type="number" min="0" max={item.qty_ordered} value={item.qty_received}
                          onChange={e => setItems(prev => prev.map((it, j) => j === idx ? { ...it, qty_received: e.target.value } : it))}
                          style={{ width: 80, textAlign: "center", padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13 }}
                        />
                      </td>
                      <td style={{ padding: "9px 12px", color: C.mid }}>{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Input label="Catatan Penerimaan" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="cth: Barang dalam kondisi baik, ada kekurangan..." />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn loading={saving} onClick={handleSubmit} disabled={!form.po_id || items.length === 0}>Simpan Penerimaan</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: HUTANG SUPPLIER (Supplier Invoices)
// ═══════════════════════════════════════════════════════════════════════════════
function SupplierInvoicesTab() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [dueSoon, setDueSoon] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [payModal, setPayModal] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "transfer", reference_number: "", notes: "", cash_account_id: "" });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [summary, setSummary] = useState({ total_outstanding: 0, overdue_count: 0 });
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [invRes, alertRes, cashRes] = await Promise.all([
      api.get("/api/v1/procurement/supplier-invoices", { params: statusFilter ? { status: statusFilter } : {} }).catch(() => null),
      api.get("/api/v1/procurement/supplier-invoices/overdue").catch(() => null),
      api.get("/api/v1/cash/accounts").catch(() => null),
    ]);
    setInvoices(invRes?.data?.supplier_invoices ?? []);
    setSummary(invRes?.data?.summary ?? { total_outstanding: 0, overdue_count: 0 });
    setOverdue(alertRes?.data?.overdue ?? []);
    setDueSoon(alertRes?.data?.due_soon ?? []);
    // Exclude petty_cash — tidak wajar untuk bayar supplier
    const allAccounts: any[] = cashRes?.data?.cash_accounts ?? [];
    setCashAccounts(allAccounts.filter((a: any) => a.type !== "petty_cash"));
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const pay = async () => {
    if (!payModal || !payForm.amount) return;
    setPayError("");
    setPaying(true);
    try {
      await api.post("/api/v1/procurement/supplier-payments", {
        supplier_id: payModal.supplier?.id,
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        reference_number: payForm.reference_number || null,
        notes: payForm.notes || null,
        cash_account_id: payForm.cash_account_id || null,
      });
      setPayModal(null);
      setPayForm({ amount: "", payment_method: "transfer", reference_number: "", notes: "", cash_account_id: "" });
      load();
    } catch (err: any) {
      setPayError(err?.response?.data?.error ?? "Gagal menyimpan pembayaran");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      {/* Alert overdue */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {overdue.length > 0 && (
            <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <AlertTriangle size={16} color={C.danger} />
              <span style={{ color: C.danger, fontWeight: 600 }}>{overdue.length} tagihan supplier sudah JATUH TEMPO</span>
            </div>
          )}
          {dueSoon.length > 0 && (
            <div style={{ background: C.warningBg, border: `1px solid ${C.warning}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <AlertTriangle size={16} color={C.warning} />
              <span style={{ color: C.warning, fontWeight: 600 }}>{dueSoon.length} tagihan jatuh tempo dalam 3 hari</span>
            </div>
          )}
        </div>
      )}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Card style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>TOTAL HUTANG</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.danger }}>{fmt(summary.total_outstanding)}</div>
        </Card>
        <Card style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>JATUH TEMPO</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: overdue.length > 0 ? C.danger : C.text }}>{summary.overdue_count}</div>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select aria-label="Saring status Penerimaan barang" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}>
          <option value="">Semua Status</option>
          {["unpaid","partial","paid"].map(s => <option key={s} value={s}>{STATUS_BADGE[s]?.label}</option>)}
        </select>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.length === 0 && <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Tidak ada tagihan</div>}
          {invoices.map(inv => (
            <Card key={inv.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, color: C.text }}>{inv.supplier?.name}</span>
                    <Badge status={inv.status} />
                    {inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== "paid" && (
                      <span style={{ fontSize: 11, color: C.danger, fontWeight: 600 }}>OVERDUE</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                    {inv.description ?? inv.invoice_number ?? "Invoice"} · {fmtDate(inv.invoice_date)}
                    {inv.due_date && ` · Jatuh tempo: ${fmtDate(inv.due_date)}`}
                  </div>
                  {inv.project?.name && <div style={{ fontSize: 12, color: C.mid }}>Proyek: {inv.project.name}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: C.mid }}>Total: {fmt(inv.total_amount)}</div>
                  <div style={{ fontSize: 13, color: C.mid }}>Dibayar: {fmt(inv.amount_paid)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: inv.status === "paid" ? C.success : C.danger }}>{fmt(inv.amount_due)}</div>
                  {inv.status !== "paid" && (
                    <Btn style={{ marginTop: 6, fontSize: 12 }} onClick={() => { setPayModal(inv); setPayForm(f => ({ ...f, amount: String(inv.amount_due) })); }}>
                      Bayar
                    </Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {payModal && (
        <Modal title={`Bayar Hutang — ${payModal.supplier?.name}`} onClose={() => { setPayModal(null); setPayError(""); }}>
          <div style={{ fontSize: 13, color: C.mid, marginBottom: 16 }}>
            Sisa hutang: <strong style={{ color: C.danger }}>{fmt(payModal.amount_due)}</strong>
            <br />Pembayaran akan dialokasikan otomatis (FIFO) ke bon terlama.
          </div>
          {payError && (
            <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger, marginBottom: 12 }}>
              {payError}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="Jumlah Dibayar (Rp) *" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} type="number" />
            <Select label="Metode Pembayaran" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
              <option value="transfer">Transfer Bank</option>
              <option value="cash">Tunai</option>
              <option value="check">Cek / Giro</option>
            </Select>
            <Select
              label="Sumber Kas (opsional)"
              value={payForm.cash_account_id}
              onChange={e => setPayForm(f => ({ ...f, cash_account_id: e.target.value }))}
            >
              <option value="">— Catat tanpa potong kas —</option>
              {cashAccounts.map((a: any) => {
                const insufficient = payForm.amount && Number(a.balance) < Number(payForm.amount);
                return (
                  <option key={a.id} value={a.id} disabled={!!insufficient}>
                    {a.name} — {fmt(Number(a.balance ?? 0))}{insufficient ? " (saldo kurang)" : ""}
                  </option>
                );
              })}
            </Select>
            {payForm.cash_account_id && (
              <div style={{ fontSize: 12, color: C.info, background: C.infoBg, borderRadius: 6, padding: "8px 12px" }}>
                Saldo akun akan berkurang otomatis setelah pembayaran disimpan.
              </div>
            )}
            <Input label="No. Referensi / Bukti Transfer" value={payForm.reference_number} onChange={e => setPayForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="Opsional" />
            <Input label="Catatan" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => { setPayModal(null); setPayError(""); }}>Batal</Btn>
              <Btn loading={paying} onClick={pay}>Konfirmasi Bayar</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Movement type config ─────────────────────────────────────────────────────
const MOVEMENT_CONFIG: Record<string, { label: string; color: string; bg: string; sign: string }> = {
  goods_receipt: { label: "Masuk (GR)",    color: "#15803D", bg: "#DCFCE7", sign: "+" },
  usage:         { label: "Pemakaian",     color: "var(--danger)", bg: "var(--danger-bg)", sign: "−" },
  return:        { label: "Return",        color: "var(--info)", bg: "#DBEAFE", sign: "+" },
  adjustment:    { label: "Adjustment",    color: "var(--warning)", bg: "#FEF3C7", sign: "±" },
  transfer_in:   { label: "Transfer Masuk",color: "#15803D", bg: "#DCFCE7", sign: "+" },
  transfer_out:  { label: "Transfer Keluar",color: "#7C3AED", bg: "#F5F3FF", sign: "−" },
};

// TAB: STOK
// ═══════════════════════════════════════════════════════════════════════════════
function StocksTab() {
  // Stock usage & opname: API menuntut `procurement:view` (lihat
  // procurement.ts POST /stocks/usage & /stocks/opname). Sebelumnya UI
  // mengecek `role === admin|pm|mandor` — role kustom `direktur` yang punya
  // 7 permission procurement TIDAK melihat tombolnya (ADR-004).
  const canEdit = hasPermission("procurement:view");
  const canOpname = hasPermission("procurement:view");

  const [stocks, setStocks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");

  // Log mutasi
  const [movements, setMovements] = useState<any[]>([]);
  const [logProject, setLogProject] = useState("");
  const [loadingLog, setLoadingLog] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Modals
  const [showUsage, setShowUsage] = useState(false);
  const [showOpname, setShowOpname] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [stockRes, projRes] = await Promise.all([
      api.get("/api/v1/procurement/stocks", { params: projectFilter ? { project_id: projectFilter } : {} }).catch(() => null),
      api.get("/api/v1/projects").catch(() => null),
    ]);
    setStocks(stockRes?.data?.stocks ?? []);
    setProjects(projRes?.data?.projects ?? []);
    setLoading(false);
  }, [projectFilter]);

  useEffect(() => { load(); }, [load]);

  async function loadLog(projectId: string) {
    if (!projectId) return;
    setLoadingLog(true);
    const r = await api.get(`/api/v1/procurement/stocks/${projectId}/movements`, { params: { limit: 200 } }).catch(() => null);
    setMovements(r?.data?.movements ?? []);
    setLoadingLog(false);
  }

  useEffect(() => { if (showLog && logProject) loadLog(logProject); }, [showLog, logProject]);

  const filtered = stocks.filter(s => s.material?.name.toLowerCase().includes(search.toLowerCase()));
  const lowStockItems = filtered.filter(s => {
    const min = Number(s.material?.min_stock ?? 0);
    return min > 0 && Number(s.qty_on_hand) < min;
  });

  return (
    <div>
      {lowStockItems.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertTriangle size={16} color={C.danger} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.danger }}>⚠ {lowStockItems.length} material di bawah stok minimum</div>
            <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>
              {lowStockItems.slice(0, 5).map(s => `${s.material?.name} (${s.qty_on_hand}/${s.material?.min_stock} ${s.material?.unit})`).join(" · ")}
              {lowStockItems.length > 5 && ` dan ${lowStockItems.length - 5} lainnya`}
            </div>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari material..."
            style={{ paddingLeft: 32, padding: "9px 12px 9px 32px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }} />
        </div>
        <select aria-label="Saring proyek" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, minWidth: 200 }}>
          <option value="">Semua Proyek</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {canEdit && (
            <Btn onClick={() => setShowUsage(true)}>
              <Plus size={14} /> Catat Pemakaian
            </Btn>
          )}
          {canOpname && (
            <Btn variant="secondary" onClick={() => setShowOpname(true)}>
              Opname Stok
            </Btn>
          )}
          <Btn variant="secondary" onClick={() => setShowLog(v => !v)}>
            {showLog ? "Sembunyikan Log" : "Lihat Log Mutasi"}
          </Btn>
        </div>
      </div>

      {/* Tabel stok */}
      {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {["Material", "Kategori", "Proyek", "Stok di Tangan", "Stok Min", "Reserved", "Terakhir Update"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 48, color: C.muted }}>Belum ada data stok</td></tr>
              ) : filtered.map(s => {
                const minStock = Number(s.material?.min_stock ?? 0);
                const isLow = minStock > 0 && Number(s.qty_on_hand) < minStock;
                return (
                <tr key={s.id} style={{ borderTop: `1px solid ${C.border}`, background: isLow ? "#FFF5F5" : undefined }}>
                  <td style={{ padding: "10px 14px", fontWeight: 500, color: C.text }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {s.material?.name}
                      {isLow && <span style={{ fontSize: 10, padding: "1px 6px", background: C.dangerBg, color: C.danger, borderRadius: 99, fontWeight: 700, border: `1px solid ${C.danger}` }}>REORDER</span>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", color: C.mid }}>{s.material?.category?.name ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: C.mid }}>{s.project?.name}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: isLow ? C.danger : Number(s.qty_on_hand) <= 0 ? C.danger : C.text }}>
                    {s.qty_on_hand} {s.material?.unit}
                  </td>
                  <td style={{ padding: "10px 14px", color: minStock > 0 ? C.mid : C.muted, fontSize: 12 }}>
                    {minStock > 0 ? `${minStock} ${s.material?.unit}` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", color: C.mid }}>{s.qty_reserved} {s.material?.unit}</td>
                  <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{fmtDate(s.last_updated_at)}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Arus Keluar-Masuk */}
      {showLog && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Log Arus Material</span>
            <select aria-label="Saring proyek pada log mutasi" value={logProject} onChange={e => setLogProject(e.target.value)}
              style={{ padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}>
              <option value="">— Pilih Proyek —</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {logProject && <Btn variant="secondary" onClick={() => loadLog(logProject)}><RefreshCw size={13} /></Btn>}
          </div>

          {!logProject ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>Pilih proyek untuk melihat log mutasi stok</div>
          ) : loadingLog ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: C.muted }}>Memuat log...</div>
          ) : movements.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>Belum ada riwayat mutasi</div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {["Waktu", "Tipe", "Material", "Qty", "Sebelum", "Sesudah", "Sumber", "Dicatat oleh"].map(h => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m: any) => {
                    const cfg = MOVEMENT_CONFIG[m.movement_type] ?? { label: m.movement_type, color: C.mid, bg: "var(--surface-hover)", sign: "" };
                    const isOut = ["usage", "transfer_out"].includes(m.movement_type);
                    return (
                      <tr key={m.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "9px 12px", color: C.muted, fontSize: 12, whiteSpace: "nowrap" }}>
                          {new Date(m.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, whiteSpace: "nowrap" }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", fontWeight: 500, color: C.text }}>{m.material?.name}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: isOut ? C.danger : "#15803D", whiteSpace: "nowrap" }}>
                          {cfg.sign}{Math.abs(Number(m.qty))} {m.material?.unit}
                        </td>
                        <td style={{ padding: "9px 12px", color: C.mid }}>{m.qty_before} {m.material?.unit}</td>
                        <td style={{ padding: "9px 12px", color: C.mid }}>{m.qty_after} {m.material?.unit}</td>
                        <td style={{ padding: "9px 12px", color: C.muted, fontSize: 12 }}>
                          {m.reference_type === "opname" ? "Opname" : m.reference_type === "manual" ? "Manual" : "GR"}
                        </td>
                        <td style={{ padding: "9px 12px", color: C.mid, fontSize: 12 }}>{m.created_by?.name ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Catat Pemakaian */}
      {showUsage && (
        <UsageModal
          projects={projects}
          stocks={stocks}
          onClose={() => setShowUsage(false)}
          onSuccess={() => { setShowUsage(false); load(); if (showLog && logProject) loadLog(logProject); }}
        />
      )}

      {/* Modal Opname Stok */}
      {showOpname && (
        <OpnameModal
          projects={projects}
          onClose={() => setShowOpname(false)}
          onSuccess={() => { setShowOpname(false); load(); if (showLog && logProject) loadLog(logProject); }}
        />
      )}
    </div>
  );
}

// ── Modal: Catat Pemakaian ────────────────────────────────────────────────────
function UsageModal({ projects, stocks, onClose, onSuccess }: {
  projects: any[]; stocks: any[];
  onClose: () => void; onSuccess: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [movementType, setMovementType] = useState("usage");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Material tersedia di proyek yang dipilih
  const projectStocks = stocks.filter(s => s.project?.id === projectId || (!projectId && true));
  const selectedStock = projectStocks.find(s => s.material?.id === materialId);

  async function handleSubmit() {
    setError("");
    if (!projectId || !materialId || !qty) { setError("Semua field wajib diisi"); return; }
    setSaving(true);
    try {
      await api.post("/api/v1/procurement/stocks/usage", {
        project_id: projectId, material_id: materialId,
        qty: Number(qty), movement_type: movementType, notes: notes || null,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Catat Pemakaian Material" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: "var(--danger-bg)", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>{error}</div>}

        <Select label="Proyek *" value={projectId} onChange={e => { setProjectId(e.target.value); setMaterialId(""); }}>
          <option value="">— Pilih Proyek —</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        <Select label="Material *" value={materialId} onChange={e => setMaterialId(e.target.value)} disabled={!projectId}>
          <option value="">— Pilih Material —</option>
          {projectStocks.map((s: any) => (
            <option key={s.material?.id} value={s.material?.id}>
              {s.material?.name} — stok: {s.qty_on_hand} {s.material?.unit}
            </option>
          ))}
        </Select>

        {selectedStock && (
          <div style={{ fontSize: 12, color: C.mid, background: C.bg, borderRadius: 8, padding: "8px 12px" }}>
            Stok saat ini: <strong style={{ color: C.text }}>{selectedStock.qty_on_hand} {selectedStock.material?.unit}</strong>
          </div>
        )}

        <Select label="Jenis" value={movementType} onChange={e => setMovementType(e.target.value)}>
          <option value="usage">Pemakaian (stok berkurang)</option>
          <option value="return">Return / Dikembalikan (stok bertambah)</option>
          <option value="adjustment">Adjustment manual (set stok ke nilai baru)</option>
        </Select>

        <Input
          label={movementType === "adjustment" ? "Stok Baru (nilai absolut) *" : "Jumlah *"}
          value={qty} onChange={e => setQty(e.target.value)} type="number"
          placeholder={movementType === "adjustment" ? "Masukkan stok aktual sekarang" : ""}
        />
        <Input label="Catatan" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional — misal: cor kolom K-1" />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Opname Stok ────────────────────────────────────────────────────────
function OpnameModal({ projects, onClose, onSuccess }: {
  projects: any[];
  onClose: () => void; onSuccess: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  async function loadProjectStocks(pid: string) {
    if (!pid) return;
    setLoadingItems(true);
    const r = await api.get("/api/v1/procurement/stocks", { params: { project_id: pid } }).catch(() => null);
    const stocks: any[] = r?.data?.stocks ?? [];
    setItems(stocks.map(s => ({
      material_id: s.material?.id,
      material_name: s.material?.name,
      unit: s.material?.unit,
      qty_system: Number(s.qty_on_hand),
      qty_actual: String(s.qty_on_hand), // default = stok sistem
    })));
    setLoadingItems(false);
  }

  useEffect(() => { loadProjectStocks(projectId); }, [projectId]);

  async function handleSubmit() {
    setError("");
    if (!projectId || items.length === 0) { setError("Pilih proyek terlebih dahulu"); return; }
    setSaving(true);
    try {
      const r = await api.post("/api/v1/procurement/stocks/opname", {
        project_id: projectId,
        notes: notes || null,
        items: items.map(i => ({ material_id: i.material_id, qty_actual: Number(i.qty_actual) })),
      });
      setResult(r.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Gagal menyimpan opname");
    } finally { setSaving(false); }
  }

  if (result) {
    return (
      <Modal title="Opname Selesai" onClose={onSuccess} width={440}>
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 8 }}>Opname berhasil disimpan</div>
          <div style={{ fontSize: 13, color: C.mid, marginBottom: 16 }}>Dilakukan oleh: <strong>{result.opname_by}</strong></div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 13 }}>
            <div style={{ background: C.bg, borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{result.total_items_checked}</div>
              <div style={{ color: C.mid }}>Item diperiksa</div>
            </div>
            <div style={{ background: "#FEF3C7", borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.warning }}>{result.items_with_adjustment}</div>
              <div style={{ color: C.mid }}>Ada selisih</div>
            </div>
            <div style={{ background: "#DCFCE7", borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.success }}>{result.items_unchanged}</div>
              <div style={{ color: C.mid }}>Sesuai</div>
            </div>
          </div>
          <Btn onClick={onSuccess} style={{ marginTop: 20 }}>Tutup</Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Opname Stok" onClose={onClose} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ background: "var(--danger-bg)", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.danger }}>{error}</div>}

        <Select label="Proyek *" value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">— Pilih Proyek —</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        <Input label="Catatan Opname" value={notes} onChange={e => setNotes(e.target.value)} placeholder="cth: Opname Minggu 2 Juni 2026" />

        {projectId && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 4 }}>Input Stok Fisik Aktual</div>
            {loadingItems ? (
              <div style={{ textAlign: "center", padding: 24, color: C.muted }}>Memuat daftar material...</div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13 }}>Belum ada stok di proyek ini</div>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase" }}>Material</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase" }}>Stok Sistem</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase" }}>Stok Fisik Aktual</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase" }}>Selisih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const selisih = Number(item.qty_actual) - item.qty_system;
                      return (
                        <tr key={item.material_id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ padding: "9px 12px", fontWeight: 500, color: C.text }}>{item.material_name}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: C.mid }}>{item.qty_system} {item.unit}</td>
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            <input
                              type="number" value={item.qty_actual}
                              onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty_actual: e.target.value } : it))}
                              style={{ width: 90, textAlign: "center", padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13 }}
                            />
                            <span style={{ marginLeft: 4, color: C.muted, fontSize: 12 }}>{item.unit}</span>
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: selisih < 0 ? C.danger : selisih > 0 ? C.success : C.muted }}>
                            {selisih === 0 ? "—" : `${selisih > 0 ? "+" : ""}${selisih} ${item.unit}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn onClick={handleSubmit} disabled={saving || !projectId || items.length === 0}>
            {saving ? "Menyimpan..." : "Simpan Opname"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// TAB: LAPORAN PENGADAAN
// ═══════════════════════════════════════════════════════════════════════════════
function LaporanPengadaanTab() {
  const [subTab, setSubTab] = useState<"rekap" | "aging">("rekap");
  const [purchases, setPurchases] = useState<any>({ purchase_orders: [], summary: null });
  const [aging, setAging] = useState<any>({ invoices: [], buckets: null, total: 0 });
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [filters, setFilters] = useState({ from: "", to: "", project_id: "", supplier_id: "" });

  useEffect(() => {
    Promise.all([
      api.get("/api/v1/projects").catch(() => null),
      api.get("/api/v1/procurement/suppliers").catch(() => null),
    ]).then(([pRes, sRes]) => {
      setProjects(pRes?.data?.projects ?? []);
      setSuppliers(sRes?.data?.suppliers ?? []);
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (subTab === "rekap") {
      const p: Record<string, string> = {};
      if (filters.from) p.from = filters.from;
      if (filters.to) p.to = filters.to;
      if (filters.project_id) p.project_id = filters.project_id;
      if (filters.supplier_id) p.supplier_id = filters.supplier_id;
      const res = await api.get("/api/v1/procurement/reports/purchases", { params: p }).catch(() => null);
      setPurchases(res?.data ?? { purchase_orders: [], summary: null });
    } else {
      const res = await api.get("/api/v1/procurement/reports/aging").catch(() => null);
      setAging(res?.data ?? { invoices: [], buckets: null, total: 0 });
    }
    setLoading(false);
  }, [subTab, filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    if (subTab === "rekap") {
      const rows = (purchases.purchase_orders ?? []).map((po: any) => ({
        "No. PO": po.po_number,
        "Tanggal": po.order_date,
        "Supplier": po.supplier?.name ?? "",
        "Proyek": po.project?.name ?? "",
        "Status": STATUS_BADGE[po.status]?.label ?? po.status,
        "Total (Rp)": Number(po.total_amount),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Pembelian");
      if (purchases.summary?.by_supplier?.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(purchases.summary.by_supplier.map((s: any) => ({ "Supplier": s.name, "Jumlah PO": s.count, "Total (Rp)": s.total })));
        XLSX.utils.book_append_sheet(wb, ws2, "Per Supplier");
      }
      XLSX.writeFile(wb, `rekap-pembelian-${new Date().toISOString().slice(0,10)}.xlsx`);
    } else {
      const rows = (aging.invoices ?? []).map((inv: any) => ({
        "No. Invoice": inv.invoice_number ?? "—",
        "Supplier": inv.supplier?.name ?? "",
        "Proyek": inv.project?.name ?? "",
        "Tgl Invoice": inv.invoice_date,
        "Jatuh Tempo": inv.due_date ?? "—",
        "Total (Rp)": Number(inv.total_amount),
        "Terbayar (Rp)": Number(inv.amount_paid),
        "Sisa (Rp)": Number(inv.amount_due),
        "Hari Terlambat": inv.days_overdue,
        "Bucket": inv.bucket,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Aging Hutang");
      XLSX.writeFile(wb, `aging-hutang-supplier-${new Date().toISOString().slice(0,10)}.xlsx`);
    }
  };

  return (
    <div>
      {/* Sub-tab */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {([["rekap", "Rekap Pembelian"], ["aging", "Aging Hutang"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)} style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: subTab === key ? 600 : 400,
            background: subTab === key ? C.navy : C.surface, color: subTab === key ? "#fff" : C.mid,
            border: `1px solid ${subTab === key ? C.navy : C.border}`, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      {subTab === "rekap" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Input label="" type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} style={{ width: 150 }} />
            <span style={{ fontSize: 13, color: C.mid, paddingTop: 4 }}>s/d</span>
            <Input label="" type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} style={{ width: 150 }} />
            <select aria-label="Supplier" value={filters.supplier_id} onChange={e => setFilters(f => ({ ...f, supplier_id: e.target.value }))} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, minWidth: 160 }}>
              <option value="">Semua Supplier</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select aria-label="Proyek" value={filters.project_id} onChange={e => setFilters(f => ({ ...f, project_id: e.target.value }))} style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, minWidth: 160 }}>
              <option value="">Semua Proyek</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <Btn variant="secondary" onClick={loadData}><RefreshCw size={13} /> Refresh</Btn>
              <Btn variant="secondary" onClick={exportExcel}><Download size={13} /> Export Excel</Btn>
            </div>
          </div>

          {/* KPI summary */}
          {purchases.summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total PO", value: purchases.summary.total_pos, color: C.navy },
                { label: "Total Nilai", value: fmt(purchases.summary.total_value), color: C.text },
              ].map(k => (
                <div key={k.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: C.mid, marginBottom: 4 }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Per supplier breakdown */}
          {purchases.summary?.by_supplier?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top Supplier</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {purchases.summary.by_supplier.slice(0, 8).map((s: any) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <div style={{ display: "flex", gap: 16, color: C.mid }}>
                      <span>{s.count} PO</span>
                      <span style={{ fontWeight: 600, color: C.text }}>{fmt(s.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PO list */}
          {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {["No. PO", "Tanggal", "Supplier", "Proyek", "Status", "Total"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: h === "Total" ? "right" : "left", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(purchases.purchase_orders ?? []).length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 48, color: C.muted }}>Tidak ada data</td></tr>
                  ) : (purchases.purchase_orders ?? []).map((po: any) => (
                    <tr key={po.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: C.navy }}>{po.po_number}</td>
                      <td style={{ padding: "10px 14px", color: C.mid }}>{fmtDate(po.order_date)}</td>
                      <td style={{ padding: "10px 14px" }}>{po.supplier?.name}</td>
                      <td style={{ padding: "10px 14px", color: C.mid }}>{po.project?.name}</td>
                      <td style={{ padding: "10px 14px" }}><Badge status={po.status} /></td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{fmt(po.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subTab === "aging" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, gap: 8 }}>
            <Btn variant="secondary" onClick={loadData}><RefreshCw size={13} /> Refresh</Btn>
            <Btn variant="secondary" onClick={exportExcel}><Download size={13} /> Export Excel</Btn>
          </div>

          {/* Buckets summary */}
          {aging.buckets && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Belum Jatuh Tempo", key: "current", color: C.success, bg: C.successBg },
                { label: "1–30 Hari", key: "days_1_30", color: C.warning, bg: C.warningBg },
                { label: "31–60 Hari", key: "days_31_60", color: "#B45309", bg: "#FEF3C7" },
                { label: "61–90 Hari", key: "days_61_90", color: "#EA580C", bg: "#FFF7ED" },
                { label: "> 90 Hari", key: "over_90", color: C.danger, bg: C.dangerBg },
              ].map(b => (
                <div key={b.key} style={{ background: b.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.mid, marginBottom: 6 }}>{b.label.toUpperCase()}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: b.color }}>{fmt(aging.buckets[b.key])}</div>
                </div>
              ))}
            </div>
          )}

          {loading ? <div style={{ textAlign: "center", padding: 48, color: C.muted }}>Memuat...</div> : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {["Supplier", "Proyek", "Tgl Invoice", "Jatuh Tempo", "Hari Terlambat", "Total", "Terbayar", "Sisa"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: ["Total","Terbayar","Sisa"].includes(h) ? "right" : "left", fontWeight: 600, color: C.mid, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(aging.invoices ?? []).length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 48, color: C.muted }}>Tidak ada hutang outstanding</td></tr>
                  ) : (aging.invoices ?? []).map((inv: any) => (
                    <tr key={inv.id} style={{ borderTop: `1px solid ${C.border}`, background: inv.bucket === "over_90" ? "#FFF5F5" : inv.bucket === "days_61_90" ? "#FFF7ED" : undefined }}>
                      <td style={{ padding: "10px 14px", fontWeight: 500 }}>{inv.supplier?.name}</td>
                      <td style={{ padding: "10px 14px", color: C.mid }}>{inv.project?.name ?? "—"}</td>
                      <td style={{ padding: "10px 14px", color: C.mid }}>{fmtDate(inv.invoice_date)}</td>
                      <td style={{ padding: "10px 14px", color: inv.days_overdue > 0 ? C.danger : C.mid }}>{inv.due_date ? fmtDate(inv.due_date) : "—"}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {inv.days_overdue > 0
                          ? <span style={{ fontSize: 12, fontWeight: 700, color: C.danger }}>+{inv.days_overdue} hari</span>
                          : <span style={{ color: C.muted, fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmt(inv.total_amount)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: C.success }}>{fmt(inv.amount_paid)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: C.danger }}>{fmt(inv.amount_due)}</td>
                    </tr>
                  ))}
                  {(aging.invoices ?? []).length > 0 && (
                    <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
                      <td colSpan={7} style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>Total Hutang</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, textAlign: "right", color: C.danger }}>{fmt(aging.total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ROOT PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ProcurementKpiBar() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/api/v1/procurement/dashboard")
      .then(r => setKpi(r.data))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const cards = kpi ? [
    {
      icon: <ClipboardList size={17} />,
      label: "MR Butuh Approval",
      value: String(kpi.mr_pending_approval),
      sub: kpi.mr_pending_approval > 0 ? "menunggu persetujuan" : "semua sudah diproses",
      accent: kpi.mr_pending_approval > 0 ? C.warning : C.success,
    },
    {
      icon: <Receipt size={17} />,
      label: "Hutang Jatuh Tempo",
      value: String(kpi.overdue_invoices),
      sub: kpi.overdue_invoices > 0 ? fmt(kpi.overdue_amount) : "tidak ada tunggakan",
      accent: kpi.overdue_invoices > 0 ? C.danger : C.success,
    },
    {
      icon: <CreditCard size={17} />,
      label: "Total Hutang Supplier",
      value: fmtShort(kpi.total_outstanding),
      sub: "outstanding saat ini",
      accent: C.text,
      prefix: kpi.total_outstanding > 0 ? "Rp" : undefined,
    },
    {
      icon: <ShoppingCart size={17} />,
      label: "PO Bulan Ini",
      value: String(kpi.po_this_month),
      sub: fmt(kpi.po_value_this_month),
      accent: C.navy,
    },
    {
      icon: <TrendingDown size={17} />,
      label: "Stok Hampir Habis",
      value: String(kpi.low_stock_count),
      sub: kpi.low_stock_count > 0 ? "item di bawah minimum" : "semua stok aman",
      accent: kpi.low_stock_count > 0 ? C.danger : C.success,
    },
  ] : [];

  if (!loading && !kpi) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 28 }}>
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              background: "var(--surface)", border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "20px 22px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ height: 10, width: 90, borderRadius: 4, background: "var(--surface-hover)", animation: "shimmer 1.5s ease-in-out infinite" }} />
                <div style={{ height: 17, width: 17, borderRadius: 4, background: "var(--surface-hover)", animation: "shimmer 1.5s ease-in-out infinite" }} />
              </div>
              <div style={{ height: 28, width: 60, borderRadius: 6, background: "var(--surface-hover)", animation: "shimmer 1.5s ease-in-out infinite", marginBottom: 8 }} />
              <div style={{ height: 10, width: 110, borderRadius: 4, background: "var(--surface-hover)", animation: "shimmer 1.5s ease-in-out infinite" }} />
            </div>
          ))
        : cards.map(c => (
            <div
              key={c.label}
              style={{
                background: "var(--surface)", border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "20px 22px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex", flexDirection: "column", gap: 6,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,51,102,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "var(--text-muted)", textTransform: "uppercase" }}>{c.label}</span>
                <span style={{ color: "rgba(0,51,102,0.2)" }}>{c.icon}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                {c.prefix && <span style={{ fontSize: 14, fontWeight: 700, color: c.accent, lineHeight: 1 }}>{c.prefix}</span>}
                <span style={{ fontSize: 28, fontWeight: 800, color: c.accent, lineHeight: 1, fontFamily: "var(--font-display)" }}>{c.value}</span>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.sub}</span>
            </div>
          ))
      }
    </div>
  );
}

function fmtShort(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".0", "")} M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")} jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} rb`;
  return String(n);
}

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<Tab>("suppliers");

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }
      `}</style>
      <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Procurement & Inventory</h1>
          <p style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>Kelola supplier, material, PO, penerimaan barang, dan hutang supplier</p>
        </div>
        <ProcurementKpiBar />

        {/* Tab Bar */}
        <div style={{ display: "flex", gap: 2, borderBottom: `2px solid ${C.border}`, marginBottom: 24, overflowX: "auto" }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
                fontWeight: active ? 600 : 400, fontSize: 13,
                color: active ? C.navy : C.mid,
                borderBottom: active ? `2px solid ${C.navy}` : "2px solid transparent",
                marginBottom: -2, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              }}>
                <Icon size={14} />{tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "suppliers"       && <SuppliersTab />}
        {activeTab === "materials"       && <MaterialsTab />}
        {activeTab === "requests"        && <MaterialRequestsTab />}
        {activeTab === "purchase-orders" && <PurchaseOrdersTab />}
        {activeTab === "goods-receipts"  && <GoodsReceiptsTab />}
        {activeTab === "invoices"        && <SupplierInvoicesTab />}
        {activeTab === "stocks"          && <StocksTab />}
        {activeTab === "laporan"         && <LaporanPengadaanTab />}
      </div>
    </>
  );
}

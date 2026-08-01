"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, ChevronDown, ChevronUp, Trash2, Pencil,
  CheckCircle2, XCircle, Send, AlertCircle, Loader2,
  FileText, TrendingUp, TrendingDown,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RabItemRef {
  id: string;
  name: string;
  category_code: string | null;
  level: string;
}

interface ChangeOrderItem {
  id: string;
  change_order_id: string;
  item_type: "kerja_tambah" | "kerja_kurang" | "perubahan_volume" | "perubahan_spec";
  description: string;
  amount_delta: number;
  rab_item_id: string | null;
  unit: string | null;
  volume_delta: number | null;
  unit_price: number | null;
  notes: string | null;
  sort_order: number;
  rab_item: RabItemRef | null;
}

interface ChangeOrder {
  id: string;
  project_id: string;
  co_number: string;
  title: string;
  description: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  billing_mode: "include_termin" | "separate_co" | "final_account" | null;
  total_amount_delta: number;
  baseline_contract_value: number | null;
  baseline_rab_total: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  creator: { id: string; name: string } | null;
  approver: { id: string; name: string } | null;
  items: ChangeOrderItem[];
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)", border: "var(--border)",
  bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
};

// ─── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.abs(n));

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const fmtDelta = (n: number) => {
  const prefix = n >= 0 ? "+" : "-";
  return `${prefix}${fmt(n)}`;
};

// ─── Status badge ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",     color: C.muted,   bg: "var(--surface-subtle)",  border: C.border },
  submitted: { label: "Menunggu",  color: "var(--info)", bg: "var(--info-bg)",  border: "var(--info-border)" },
  approved:  { label: "Disetujui", color: C.green,   bg: C.greenBg,  border: C.greenBorder },
  rejected:  { label: "Ditolak",   color: C.red,     bg: C.redBg,    border: C.redBorder },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  );
}

// ─── Item type badge ──────────────────────────────────────────────────────────

const ITEM_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  kerja_tambah:     { label: "+ Kerja Tambah",    color: C.green,   bg: C.greenBg },
  kerja_kurang:     { label: "− Kerja Kurang",    color: C.red,     bg: C.redBg },
  perubahan_volume: { label: "~ Perubahan Volume", color: "var(--info)", bg: "var(--info-bg)" },
  perubahan_spec:   { label: "~ Perubahan Spec",   color: C.yellow,  bg: C.yellowBg },
};

function ItemTypeBadge({ type }: { type: string }) {
  const meta = ITEM_TYPE_META[type] ?? { label: type, color: C.mid, bg: "var(--surface-subtle)" };
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg,
    }}>
      {meta.label}
    </span>
  );
}

// ─── Change Order Item Form ─────────────────────────────────────────────────────

interface ItemFormState {
  item_type: string;
  description: string;
  amount_delta: string;
  unit: string;
  volume_delta: string;
  unit_price: string;
  notes: string;
  rab_item_id: string;
}

const EMPTY_ITEM: ItemFormState = {
  item_type: "kerja_tambah",
  description: "",
  amount_delta: "",
  unit: "",
  volume_delta: "",
  unit_price: "",
  notes: "",
  rab_item_id: "",
};

function ItemForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  loading,
  submitLabel,
}: {
  value: ItemFormState;
  onChange: (v: ItemFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading: boolean;
  submitLabel: string;
}) {
  const set = (k: keyof ItemFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

  const inpStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 7,
    border: "1px solid #E5E7EB", outline: "none", boxSizing: "border-box",
    background: "var(--surface)", color: C.text, fontFamily: "inherit",
  };

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px", background: "#FAFAFA", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="value" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Tipe</label>
          <select id="value" aria-label="Tipe item change order" value={value.item_type} onChange={set("item_type")} style={inpStyle}>
            <option value="kerja_tambah">Kerja Tambah</option>
            <option value="kerja_kurang">Kerja Kurang</option>
            <option value="perubahan_volume">Perubahan Volume</option>
            <option value="perubahan_spec">Perubahan Spec</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="value-6" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Delta Biaya (Rp)</label>
          <input id="value-6"
            type="number" value={value.amount_delta} onChange={set("amount_delta")}
            placeholder={value.item_type === "kerja_tambah" ? "mis. 5000000" : "mis. -2000000"}
            style={inpStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label htmlFor="value-7" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Deskripsi Pekerjaan *</label>
        <input id="value-7"
          type="text" value={value.description} onChange={set("description")}
          placeholder="mis. Tambah pondasi pile cap 3x3m..."
          style={inpStyle}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="value-2" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Satuan</label>
          <input id="value-2" type="text" value={value.unit} onChange={set("unit")} placeholder="m², m³, ls..." style={inpStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="value-3" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Delta Volume</label>
          <input id="value-3" type="number" value={value.volume_delta} onChange={set("volume_delta")} placeholder="mis. 12.5" style={inpStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="value-4" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Harga Satuan</label>
          <input id="value-4" type="number" value={value.unit_price} onChange={set("unit_price")} placeholder="Rp/satuan" style={inpStyle} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label htmlFor="value-5" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Catatan</label>
        <textarea id="value-5" value={value.notes} onChange={set("notes")} placeholder="Catatan tambahan..." rows={2}
          style={{ ...inpStyle, resize: "vertical" }} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} disabled={loading}
          style={{ padding: "7px 16px", fontSize: 13, fontWeight: 500, borderRadius: 7, border: "1px solid #E5E7EB", background: "var(--surface)", cursor: "pointer", color: C.mid }}>
          Batal
        </button>
        <button onClick={onSubmit} disabled={loading}
          style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Menyimpan..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Change Order Card ─────────────────────────────────────────────────────────

function ChangeOrderCard({
  co,
  userRole,
  onRefresh,
}: {
  co: ChangeOrder;
  userRole?: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canManage = userRole === "admin" || userRole === "pm";
  const isDraft = co.status === "draft";
  const isSubmitted = co.status === "submitted";
  const isAdmin = userRole === "admin";

  const deltaPositive = co.total_amount_delta >= 0;

  async function handleAddItem() {
    if (!itemForm.description.trim()) { setErr("Deskripsi wajib diisi"); return; }
    if (!itemForm.amount_delta) { setErr("Delta biaya wajib diisi"); return; }
    setErr(null);
    setLoadingAction("add-item");
    try {
      await api.post(`/api/v1/change-orders/${co.id}/items`, {
        item_type:    itemForm.item_type,
        description:  itemForm.description.trim(),
        amount_delta: parseFloat(itemForm.amount_delta),
        unit:         itemForm.unit || undefined,
        volume_delta: itemForm.volume_delta ? parseFloat(itemForm.volume_delta) : undefined,
        unit_price:   itemForm.unit_price ? parseFloat(itemForm.unit_price) : undefined,
        notes:        itemForm.notes || undefined,
      });
      setItemForm(EMPTY_ITEM);
      setAddingItem(false);
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menambah item";
      setErr(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleUpdateItem(itemId: string) {
    if (!itemForm.description.trim()) { setErr("Deskripsi wajib diisi"); return; }
    if (!itemForm.amount_delta) { setErr("Delta biaya wajib diisi"); return; }
    setErr(null);
    setLoadingAction("edit-item");
    try {
      await api.put(`/api/v1/change-orders/${co.id}/items/${itemId}`, {
        item_type:    itemForm.item_type,
        description:  itemForm.description.trim(),
        amount_delta: parseFloat(itemForm.amount_delta),
        unit:         itemForm.unit || undefined,
        volume_delta: itemForm.volume_delta ? parseFloat(itemForm.volume_delta) : undefined,
        unit_price:   itemForm.unit_price ? parseFloat(itemForm.unit_price) : undefined,
        notes:        itemForm.notes || undefined,
      });
      setEditingItemId(null);
      setItemForm(EMPTY_ITEM);
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal memperbarui item";
      setErr(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Hapus item ini?")) return;
    setLoadingAction(`del-${itemId}`);
    try {
      await api.delete(`/api/v1/change-orders/${co.id}/items/${itemId}`);
      onRefresh();
    } catch {
      setErr("Gagal menghapus item");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSubmit() {
    if (!confirm(`Submit "${co.co_number}" untuk persetujuan admin?`)) return;
    setLoadingAction("submit");
    try {
      await api.patch(`/api/v1/change-orders/${co.id}/submit`);
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal submit";
      setErr(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleApprove() {
    if (!confirm(`Setujui "${co.co_number}"? Ini akan mengubah nilai kontrak proyek.`)) return;
    setLoadingAction("approve");
    try {
      await api.patch(`/api/v1/change-orders/${co.id}/approve`);
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal approve";
      setErr(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleReject() {
    setLoadingAction("reject");
    try {
      await api.patch(`/api/v1/change-orders/${co.id}/reject`, { reason: rejectReason });
      setShowRejectInput(false);
      setRejectReason("");
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal reject";
      setErr(msg);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
      {/* Header */}
      <div
        style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <FileText size={15} style={{ color: C.mid, flexShrink: 0 }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{co.co_number}</span>
              <StatusBadge status={co.status} />
            </div>
            <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>{co.title}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: deltaPositive ? C.green : C.red,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {deltaPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {fmtDelta(co.total_amount_delta)}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{co.items?.length ?? 0} item</div>
          </div>
          {expanded ? <ChevronUp size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: "1px solid #F3F4F6", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Meta row */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, color: C.mid }}>
            {co.creator && <span>Dibuat oleh <strong style={{ color: C.text }}>{co.creator.name}</strong></span>}
            <span>{fmtDate(co.created_at)}</span>
            {co.billing_mode && (
              <span style={{ padding: "1px 8px", borderRadius: 4, background: "var(--surface-hover)", color: C.mid, fontSize: 11 }}>
                {{ include_termin: "Termasuk Termin", separate_co: "CO Tersendiri", final_account: "Final Account" }[co.billing_mode]}
              </span>
            )}
          </div>

          {co.description && (
            <p style={{ fontSize: 13, color: C.mid, margin: 0, lineHeight: 1.5 }}>{co.description}</p>
          )}

          {/* Approved notice */}
          {co.status === "approved" && co.baseline_contract_value !== null && (
            <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
              <div style={{ color: C.green, fontWeight: 600, marginBottom: 4 }}>
                <CheckCircle2 size={12} style={{ display: "inline", marginRight: 4 }} />
                Disetujui oleh {co.approver?.name ?? "Admin"} — {co.approved_at ? fmtDate(co.approved_at) : ""}
              </div>
              <div style={{ color: C.mid }}>
                Nilai kontrak: {fmt(co.baseline_contract_value)} → {fmt(co.baseline_contract_value + co.total_amount_delta)}
              </div>
            </div>
          )}

          {/* Rejected notice */}
          {co.status === "rejected" && (
            <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
              <div style={{ color: C.red, fontWeight: 600, marginBottom: 4 }}>
                <XCircle size={12} style={{ display: "inline", marginRight: 4 }} />
                Ditolak — {co.rejected_at ? fmtDate(co.rejected_at) : ""}
              </div>
              {co.rejected_reason && <div style={{ color: C.mid }}>{co.rejected_reason}</div>}
            </div>
          )}

          {/* Items table */}
          {(co.items?.length ?? 0) > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--surface-subtle)" }}>
                  {["Tipe", "Deskripsi", "Satuan", "Vol Δ", "Harga Sat.", "Delta Biaya", ...(isDraft ? [""] : [])].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Delta Biaya" ? "right" : "left", fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: C.muted, borderBottom: "1px solid #E5E7EB" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {co.items.map(item => (
                  editingItemId === item.id ? (
                    <tr key={item.id}>
                      <td colSpan={isDraft ? 7 : 6} style={{ padding: "10px 0" }}>
                        <ItemForm
                          value={itemForm}
                          onChange={setItemForm}
                          onSubmit={() => handleUpdateItem(item.id)}
                          onCancel={() => { setEditingItemId(null); setItemForm(EMPTY_ITEM); }}
                          loading={loadingAction === "edit-item"}
                          submitLabel="Simpan"
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 10px" }}>
                        <ItemTypeBadge type={item.item_type} />
                      </td>
                      <td style={{ padding: "10px 10px", color: C.text }}>
                        <div>{item.description}</div>
                        {item.rab_item && (
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>RAB: {item.rab_item.name}</div>
                        )}
                        {item.notes && <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>{item.notes}</div>}
                      </td>
                      <td style={{ padding: "10px 10px", color: C.mid }}>{item.unit ?? "—"}</td>
                      <td style={{ padding: "10px 10px", color: C.mid }}>{item.volume_delta ?? "—"}</td>
                      <td style={{ padding: "10px 10px", color: C.mid }}>
                        {item.unit_price ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(item.unit_price) : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 600, color: item.amount_delta >= 0 ? C.green : C.red }}>
                        {fmtDelta(item.amount_delta)}
                      </td>
                      {isDraft && canManage && (
                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button aria-label="Sunting item change order"
                              onClick={() => { setEditingItemId(item.id); setItemForm({ item_type: item.item_type, description: item.description, amount_delta: String(item.amount_delta), unit: item.unit ?? "", volume_delta: item.volume_delta != null ? String(item.volume_delta) : "", unit_price: item.unit_price != null ? String(item.unit_price) : "", notes: item.notes ?? "", rab_item_id: item.rab_item_id ?? "" }); }}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.mid }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={loadingAction === `del-${item.id}`}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.red }}
                            >
                              {loadingAction === `del-${item.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface-subtle)" }}>
                  <td colSpan={isDraft ? 5 : 4} />
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, textTransform: "uppercase" }}>Total Delta</div>
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700, fontSize: 14, color: deltaPositive ? C.green : C.red }}>
                    {fmtDelta(co.total_amount_delta)}
                  </td>
                  {isDraft && <td />}
                </tr>
              </tfoot>
            </table>
          )}

          {/* Error */}
          {err && (
            <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red, display: "flex", gap: 6, alignItems: "center" }}>
              <AlertCircle size={12} /> {err}
            </div>
          )}

          {/* Add item form */}
          {addingItem && isDraft && canManage && (
            <ItemForm
              value={itemForm}
              onChange={setItemForm}
              onSubmit={handleAddItem}
              onCancel={() => { setAddingItem(false); setItemForm(EMPTY_ITEM); setErr(null); }}
              loading={loadingAction === "add-item"}
              submitLabel="Tambah Item"
            />
          )}

          {/* Reject reason input */}
          {showRejectInput && isAdmin && isSubmitted && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Alasan penolakan (opsional)..."
                style={{ flex: 1, padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "1px solid #E5E7EB", fontFamily: "inherit" }}
              />
              <button
                onClick={handleReject}
                disabled={loadingAction === "reject"}
                style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: C.red, color: "var(--surface)", cursor: loadingAction ? "default" : "pointer" }}
              >
                {loadingAction === "reject" ? "Menolak..." : "Tolak"}
              </button>
              <button onClick={() => setShowRejectInput(false)} style={{ padding: "8px 14px", fontSize: 13, borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--surface)", cursor: "pointer", color: C.mid }}>
                Batal
              </button>
            </div>
          )}

          {/* Action buttons */}
          {canManage && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {isDraft && (
                <>
                  {!addingItem && (
                    <button
                      onClick={() => { setAddingItem(true); setErr(null); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, cursor: "pointer" }}
                    >
                      <Plus size={13} /> Tambah Item
                    </button>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={loadingAction === "submit" || (co.items?.length ?? 0) === 0}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: loadingAction ? "default" : "pointer", opacity: (co.items?.length ?? 0) === 0 ? 0.5 : 1 }}
                  >
                    <Send size={13} /> {loadingAction === "submit" ? "Submitting..." : "Submit untuk Approval"}
                  </button>
                </>
              )}

              {isSubmitted && isAdmin && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={!!loadingAction}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none", background: C.green, color: "var(--surface)", cursor: loadingAction ? "default" : "pointer" }}
                  >
                    <CheckCircle2 size={13} /> {loadingAction === "approve" ? "Menyetujui..." : "Setujui"}
                  </button>
                  {!showRejectInput && (
                    <button
                      onClick={() => setShowRejectInput(true)}
                      disabled={!!loadingAction}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, cursor: "pointer" }}
                    >
                      <XCircle size={13} /> Tolak
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create CO Modal ───────────────────────────────────────────────────────────

function CreateCoModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [billingMode, setBillingMode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim()) { setErr("Judul wajib diisi"); return; }
    setErr(null);
    setLoading(true);
    try {
      await api.post(`/api/v1/projects/${projectId}/change-orders`, {
        title: title.trim(),
        description: description.trim() || undefined,
        billing_mode: billingMode || undefined,
      });
      onCreated();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal membuat change order";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  const inpStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 8,
    border: "1px solid #E5E7EB", outline: "none", boxSizing: "border-box",
    background: "var(--surface)", color: C.text, fontFamily: "inherit",
  };

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
  };

  const modal: React.CSSProperties = {
    background: "var(--surface)", borderRadius: 16, padding: "28px 28px 24px",
    width: "min(480px, 92vw)", maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    display: "flex", flexDirection: "column", gap: 16,
  };

  return createPortal(
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Buat Change Order</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.mid }}>Dokumen perubahan lingkup atau nilai kontrak proyek</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="title" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Judul CO *</label>
          <input id="title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="mis. Penambahan struktur lantai 3" style={inpStyle} autoFocus />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="description" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Deskripsi</label>
          <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Latar belakang dan alasan perubahan..." rows={3}
            style={{ ...inpStyle, resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="billing-mode" style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase" }}>Mode Penagihan</label>
          <select id="billing-mode" aria-label="Mode penagihan change order" value={billingMode} onChange={e => setBillingMode(e.target.value)} style={inpStyle}>
            <option value="">— Belum ditentukan —</option>
            <option value="include_termin">Termasuk dalam Termin</option>
            <option value="separate_co">Tagihan CO Tersendiri</option>
            <option value="final_account">Final Account Settlement</option>
          </select>
        </div>

        {err && (
          <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.red }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", fontSize: 14, fontWeight: 500, borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--surface)", cursor: "pointer", color: C.mid }}>
            Batal
          </button>
          <button onClick={handleCreate} disabled={loading}
            style={{ padding: "9px 20px", fontSize: 14, fontWeight: 600, borderRadius: 8, border: "none", background: C.navy, color: "var(--surface)", cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Membuat..." : "Buat Change Order"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Section ──────────────────────────────────────────────────────────────

export interface ChangeOrderSectionProps {
  projectId: string;
  userRole?: string;
  contractValue?: number;
}

export function ChangeOrderSection({ projectId, userRole, contractValue }: ChangeOrderSectionProps) {
  const [cos, setCos] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const canManage = userRole === "admin" || userRole === "pm";

  const fetchCos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/v1/projects/${projectId}/change-orders`);
      setCos(data.data ?? []);
    } catch {
      setCos([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCos();
  }, [fetchCos]);

  // Aggregate stats
  const totalApproved = cos.filter(c => c.status === "approved").reduce((s, c) => s + c.total_amount_delta, 0);
  const pendingCount = cos.filter(c => c.status === "submitted").length;

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Change Order</h3>
          {cos.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              {pendingCount > 0 && (
                <span style={{ fontSize: 12, color: "var(--info)", background: "var(--info-bg)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                  {pendingCount} menunggu persetujuan
                </span>
              )}
              {totalApproved !== 0 && (
                <span style={{ fontSize: 12, color: totalApproved >= 0 ? C.green : C.red, fontWeight: 600 }}>
                  Net approved: {fmtDelta(totalApproved)}
                  {contractValue ? ` (kontrak: ${fmt(contractValue + totalApproved)})` : ""}
                </span>
              )}
            </div>
          )}
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, cursor: "pointer" }}
          >
            <Plus size={14} /> Buat Change Order
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Loader2 size={20} style={{ color: C.mid }} className="animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && cos.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 16px", color: C.muted }}>
          <FileText size={28} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 500 }}>Belum ada change order</div>
          {canManage && (
            <div style={{ fontSize: 12, marginTop: 4 }}>Buat change order untuk melacak perubahan lingkup atau nilai kontrak</div>
          )}
        </div>
      )}

      {/* CO list */}
      {!loading && cos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cos.map(co => (
            <ChangeOrderCard
              key={co.id}
              co={co}
              userRole={userRole}
              onRefresh={fetchCos}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateCoModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchCos(); }}
        />
      )}
    </div>
  );
}

"use client";

/**
 * MODAL — buat Material Request.
 *
 * Di `_bersama/` karena dipanggil dari dua tempat: halaman Permintaan, dan
 * (nanti) tombol pintas mana pun yang ingin membuat MR tanpa berpindah rute.
 */

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { useUnits } from "@/lib/use-units";
import { Btn, Input, KotakGalat, Modal, Select, pesanError } from "./ui";

interface Proyek { id: string; name: string }
interface Material { id: string; name: string; unit: string; unit_price?: number | null }

interface BarisItem {
  material_id: string;
  qty: string;
  unit: string;
  unit_price_est: string;
  notes: string;
}

const BARIS_KOSONG: BarisItem = { material_id: "", qty: "", unit: "", unit_price_est: "", notes: "" };

export function CreateMrModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [projects, setProjects] = useState<Proyek[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [form, setForm] = useState({ project_id: "", needed_date: "", notes: "" });
  const [items, setItems] = useState<BarisItem[]>([{ ...BARIS_KOSONG }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { units } = useUnits(); // sumber tunggal satuan (master `units`)

  useEffect(() => {
    void Promise.all([
      api.get<{ projects: Proyek[] }>("/api/v1/projects").catch(() => null),
      api.get<{ materials: Material[] }>("/api/v1/procurement/materials", { params: { is_active: true } }).catch(() => null),
    ]).then(([pRes, mRes]) => {
      setProjects(pRes?.data?.projects ?? []);
      setMaterials(mRes?.data?.materials ?? []);
    });
  }, []);

  const addItem = () => setItems(i => [...i, { ...BARIS_KOSONG }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, j) => j !== idx));
  const updateItem = (idx: number, field: keyof BarisItem, val: string) =>
    setItems(i => i.map((it, j) => j === idx ? { ...it, [field]: val } : it));

  const handleMaterialSelect = (idx: number, materialId: string) => {
    const mat = materials.find(m => m.id === materialId);
    setItems(prev => prev.map((it, j) => j === idx
      ? {
        ...it, material_id: materialId,
        unit: mat?.unit ?? it.unit,
        unit_price_est: mat?.unit_price ? String(mat.unit_price) : it.unit_price_est,
      }
      : it));
  };

  const handleSubmit = async () => {
    if (!form.project_id) { setError("Pilih proyek terlebih dahulu"); return; }
    const validItems = items.filter(i => i.material_id && Number(i.qty) > 0 && i.unit);
    if (validItems.length === 0) { setError("Tambahkan minimal 1 item material yang valid"); return; }
    setSaving(true); setError("");
    try {
      // Header + item dikirim dalam SATU request: endpoint menyisipkan keduanya
      // (material_requests lalu material_request_items) di alur yang sama.
      // Pola lama — POST header dulu, item menyusul satu per satu — selalu
      // ditolak 400 `project_id dan items wajib diisi` karena `items` tak pernah
      // ikut di body, dan kalaupun lolos, kegagalan POST item tertelan senyap
      // sehingga menyisakan MR draft tanpa item.
      await api.post("/api/v1/procurement/material-requests", {
        project_id: form.project_id,
        needed_date: form.needed_date || null,
        notes: form.notes || null,
        items: validItems.map(item => ({
          material_id: item.material_id,
          qty_requested: Number(item.qty),
          unit: item.unit,
          unit_price_est: item.unit_price_est ? Number(item.unit_price_est) : null,
          notes: item.notes || null,
        })),
      });
      onSuccess();
    } catch (e: unknown) {
      setError(pesanError(e, "Gagal membuat MR"));
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Buat Material Request" onClose={onClose} width={700}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <KotakGalat pesan={error} />}
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
            <Btn variant="secondary" onClick={addItem} style={{ fontSize: 12 }}>
              <Plus size={12} aria-hidden="true" /> Tambah Item
            </Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ background: C.bg, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <Select label="Material *" value={item.material_id} onChange={e => handleMaterialSelect(idx, e.target.value)}>
                    <option value="">— Pilih —</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </Select>
                  <Input label="Qty *" type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} placeholder="0" />
                  <Select label="Satuan *" value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)}>
                    <option value="">—</option>
                    {units.map(u => <option key={u.code} value={u.symbol}>{u.symbol}</option>)}
                  </Select>
                  <Input label="Harga Est. (Rp)" type="number" value={item.unit_price_est} onChange={e => updateItem(idx, "unit_price_est", e.target.value)} placeholder="0" />
                  {/* Label menyebut BARIS keberapa: sembilan tombol "Hapus item"
                      yang bunyinya identik tak bisa dibedakan pembaca layar. */}
                  <button
                    aria-label={`Hapus item baris ${idx + 1}`}
                    onClick={() => removeItem(idx)} disabled={items.length <= 1}
                    style={{ background: "none", border: "none", cursor: items.length <= 1 ? "not-allowed" : "pointer", color: C.danger, padding: 4, opacity: items.length <= 1 ? 0.3 : 1 }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <input
                    value={item.notes} onChange={e => updateItem(idx, "notes", e.target.value)}
                    aria-label={`Catatan item baris ${idx + 1}`} placeholder="Catatan item (opsional)..."
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, boxSizing: "border-box", background: C.surface, color: C.text }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn loading={saving} onClick={() => void handleSubmit()}>Buat Material Request</Btn>
        </div>
      </div>
    </Modal>
  );
}

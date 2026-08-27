"use client";

/**
 * PROCUREMENT — PENERIMAAN BARANG (Goods Receipt).
 *
 * Dipindahkan dari tab `goods-receipts`. Alur dipertahankan: saring status,
 * konfirmasi terima, dan pencatatan penerimaan baru dari PO yang sudah
 * dikonfirmasi supplier.
 *
 * Tabel HTML mentah di modal pencatatan diganti `<Tabel>`.
 */

import { useCallback, useState } from "react";
import { Check, Plus } from "lucide-react";

import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import {
  Badge, Btn, Card, Input, KotakGalat, Memuat, Modal, Select,
  fmtDate, pesanError,
} from "../_bersama/ui";

interface GoodsReceipt {
  id: string;
  gr_number: string;
  status: string;
  receipt_date: string;
  notes?: string | null;
  supplier?: { name?: string } | null;
  project?: { name?: string } | null;
  po?: { po_number?: string } | null;
  items?: Array<{ id: string; qty_received: number; unit: string; material?: { name?: string } | null }>;
}

export default function PenerimaanPage() {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const canManage = useIzin("procurement:po:manage");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useEffect+useState+tundaSatuTick. Saringan status
    masuk sebagai bagian dari URL.
  */
  const { data, memuat: loading, muatUlang } = useData<{ goods_receipts: GoodsReceipt[] }>(
    `/api/v1/procurement/goods-receipts${statusFilter ? `?status=${statusFilter}` : ""}`,
  );
  const load = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  // Diturunkan, bukan disalin.
  const grs = data?.goods_receipts ?? [];

  const confirm = async (id: string) => {
    setConfirming(id);
    await api.patch(`/api/v1/procurement/goods-receipts/${id}/confirm`).catch(() => null);
    setConfirming(null); void load();
  };

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <select
          aria-label="Saring status penerimaan barang" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "var(--pad-tombol)", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface, color: C.text }}
        >
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Dikonfirmasi</option>
        </select>
        {canManage && <Btn onClick={() => setShowCreate(true)}><Plus size={14} aria-hidden="true" /> Catat Penerimaan</Btn>}
      </div>

      {loading ? <Memuat /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {grs.length === 0 && (
            <Kosong
              judul={statusFilter ? "Tak ada penerimaan dengan status itu" : "Belum ada penerimaan barang"}
              sebab={statusFilter
                ? `Saringan status "${statusFilter === "draft" ? "Draft" : "Dikonfirmasi"}" tak menyisakan satu pun. Pilih "Semua Status" untuk melihat keseluruhannya.`
                : "Goods Receipt dicatat saat barang tiba di lokasi. Ia dicocokkan dengan PO dan tagihan supplier — tiga sisi yang harus sama sebelum pembayaran boleh jalan."}
            />
          )}
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
                    {(gr.items ?? []).map(item => (
                      <span key={item.id} style={{ fontSize: 11, padding: "2px 8px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, color: C.mid }}>
                        {item.material?.name} {item.qty_received} {item.unit}
                      </span>
                    ))}
                  </div>
                </div>
                {gr.status === "draft" && canManage && (
                  <Btn loading={confirming === gr.id} onClick={() => void confirm(gr.id)} style={{ background: C.successBg, color: C.success, border: `1px solid ${C.success}` }}>
                    <Check size={14} aria-hidden="true" /> Konfirmasi Terima
                  </Btn>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateGrModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); void load(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL — catat penerimaan
// ═══════════════════════════════════════════════════════════════════════════

interface PoTerkonfirmasi {
  id: string;
  po_number: string;
  supplier?: { name?: string } | null;
  project?: { name?: string } | null;
  items?: Array<{ id: string; qty_ordered: number; qty_received?: number; unit: string; material?: { name?: string } | null }>;
}

interface BarisTerima {
  po_item_id: string;
  material_name: string;
  unit: string;
  qty_ordered: number;
  qty_received: string;
}

function CreateGrModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [selectedPo, setSelectedPo] = useState<PoTerkonfirmasi | null>(null);
  const [form, setForm] = useState({
    po_id: "", receipt_date: new Date().toISOString().split("T")[0], notes: "",
  });
  const [items, setItems] = useState<BarisTerima[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16 — sama kunci cache dengan
  // saringan "confirmed" di halaman lain yang memuat URL ini.
  const { data: dataConfirmedPos } =
    useData<{ purchase_orders: PoTerkonfirmasi[] }>("/api/v1/procurement/purchase-orders?status=confirmed");
  const confirmedPos = dataConfirmedPos?.purchase_orders ?? [];

  const loadPoItems = async (poId: string) => {
    const res = await api.get<{ purchase_order: PoTerkonfirmasi }>(
      `/api/v1/procurement/purchase-orders/${poId}`,
    ).catch(() => null);
    const po = res?.data?.purchase_order;
    if (!po) return;
    setSelectedPo(po);
    setItems((po.items ?? []).map(i => ({
      po_item_id: i.id,
      material_name: i.material?.name ?? "—",
      unit: i.unit,
      qty_ordered: Number(i.qty_ordered),
      // Bawaan = SISA yang belum diterima, bukan seluruh jumlah pesanan.
      // Kalau bawaannya jumlah penuh, penerimaan kedua atas PO yang sama akan
      // mencatat lebih banyak dari yang dipesan tanpa ada yang menyadarinya.
      qty_received: String(Number(i.qty_ordered) - Number(i.qty_received ?? 0)),
    })));
  };

  const handlePoChange = (poId: string) => {
    setForm(f => ({ ...f, po_id: poId }));
    if (poId) void loadPoItems(poId);
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
    } catch (e: unknown) {
      setError(pesanError(e, "Gagal mencatat penerimaan"));
    } finally { setSaving(false); }
  };

  const kolom: Kolom<BarisTerima>[] = [
    { kunci: "material", judul: "Material", kepalaBaris: true, render: i => i.material_name },
    { kunci: "pesan", judul: "Qty Pesan", rata: "kanan", render: i => <span style={{ color: C.mid }}>{i.qty_ordered}</span> },
    {
      kunci: "terima", judul: "Qty Diterima", rata: "tengah",
      render: (i) => {
        const idx = items.findIndex(x => x.po_item_id === i.po_item_id);
        return (
          <input
            type="number" min="0" max={i.qty_ordered} value={i.qty_received}
            aria-label={`Jumlah diterima untuk ${i.material_name}`}
            onChange={e => setItems(prev => prev.map((it, j) => j === idx ? { ...it, qty_received: e.target.value } : it))}
            style={{ width: 80, textAlign: "center", padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface, color: C.text }}
          />
        );
      },
    },
    { kunci: "unit", judul: "Satuan", render: i => <span style={{ color: C.mid }}>{i.unit}</span> },
  ];

  return (
    <Modal title="Catat Penerimaan Barang (GR)" onClose={onClose} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <KotakGalat pesan={error} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Select label="Purchase Order (Confirmed) *" value={form.po_id} onChange={e => handlePoChange(e.target.value)}>
            <option value="">— Pilih PO —</option>
            {confirmedPos.map(po => <option key={po.id} value={po.id}>{po.po_number} — {po.supplier?.name}</option>)}
          </Select>
          <Input label="Tanggal Terima *" value={form.receipt_date} onChange={e => setForm(f => ({ ...f, receipt_date: e.target.value }))} type="date" />
        </div>

        {selectedPo && (
          <div style={{ fontSize: 12, color: C.mid, background: C.bg, borderRadius: 6, padding: "8px 12px" }}>
            Proyek: <strong>{selectedPo.project?.name}</strong> · Supplier: <strong>{selectedPo.supplier?.name}</strong>
          </div>
        )}

        {items.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Qty Barang Diterima</div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Tabel              berpermukaan
                kolom={kolom}
                data={items}
                kunciBaris={i => i.po_item_id}
                caption="Jumlah barang yang diterima per item dalam penerimaan ini, dicocokkan dengan Purchase Order-nya. Bawaan tiap baris adalah sisa yang belum diterima."
              />
            </div>
          </div>
        )}

        <Input label="Catatan Penerimaan" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="cth: Barang dalam kondisi baik, ada kekurangan..." />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn loading={saving} onClick={() => void handleSubmit()} disabled={!form.po_id || items.length === 0}>
            Simpan Penerimaan
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

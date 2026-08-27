"use client";

/**
 * PROCUREMENT — PURCHASE ORDER.
 *
 * Dipindahkan dari tab `purchase-orders`. Seluruh alur dipertahankan: saring
 * status, kirim ke supplier, konfirmasi supplier, batalkan (dengan alasan dan
 * peringatan bahwa MR-nya dikembalikan), detail, dan kirim PO ke vendor
 * berjejak (Modul 9b).
 *
 * Tabel HTML mentah di modal detail diganti `<Tabel>`, termasuk baris totalnya
 * yang kini duduk di `<tfoot>` alih-alih sebagai baris data terakhir ber-
 * `colSpan` — bedanya bukan kosmetik, catatannya ada di `dasar.tsx`.
 */

import { useCallback, useState } from "react";
import { Check, Plus, Send, Truck, X } from "lucide-react";

import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom, type SelTotal } from "@/components/dasar";
import { Badge, Btn, Card, Input, Memuat, Modal, STATUS_BADGE, fmt, fmtDate } from "../_bersama/ui";
import { CreatePoModal, KirimPoModal } from "../_bersama/modal-po";
import type { PoRingkas, PurchaseOrder } from "../_bersama/tipe";

/** Item PO pada modal detail — `/purchase-orders/:id` mengirim lebih lengkap. */
interface ItemPo {
  id: string;
  qty_ordered: number;
  qty_received: number;
  unit: string;
  unit_price: number;
  total_price: number;
  material?: { id?: string; name?: string } | null;
}

interface DetailPo extends PurchaseOrder {
  delivery_address?: string | null;
  notes?: string | null;
  mr?: { id?: string; mr_number?: string } | null;
  items?: ItemPo[];
}

const STATUS_PO = ["draft", "sent", "confirmed", "partially_received", "fully_received", "cancelled"];

export default function PesananPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailPo, setDetailPo] = useState<DetailPo | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [kirimPo, setKirimPo] = useState<PoRingkas | null>(null);
  const canManage = useIzin("procurement:po:manage");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan pasangan useEffect+useState+tundaSatuTick. Saringan
    status masuk sebagai bagian dari URL — kunci cache berubah otomatis saat
    saringannya berubah, dan `useData` memuat ulang sendiri.
  */
  const { data, memuat: loading, muatUlang } = useData<{ purchase_orders: PurchaseOrder[] }>(
    `/api/v1/procurement/purchase-orders${statusFilter ? `?status=${statusFilter}` : ""}`,
  );
  const load = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  // Diturunkan, bukan disalin.
  const pos = data?.purchase_orders ?? [];

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/api/v1/procurement/purchase-orders/${id}/status`, { status }).catch(() => null);
    void load();
  };

  const openDetail = async (po: PurchaseOrder) => {
    const res = await api.get<{ purchase_order: DetailPo }>(
      `/api/v1/procurement/purchase-orders/${po.id}`,
    ).catch(() => null);
    setDetailPo(res?.data?.purchase_order ?? po);
  };

  const cancelPo = async () => {
    if (!cancelId) return;
    setCancelling(true);
    await api.patch(`/api/v1/procurement/purchase-orders/${cancelId}/cancel`, { notes: cancelNotes }).catch(() => null);
    setCancelling(false); setCancelId(null); setCancelNotes(""); void load();
  };

  const kolomItem: Kolom<ItemPo>[] = [
    { kunci: "material", judul: "Material", kepalaBaris: true, render: i => i.material?.name ?? "—" },
    { kunci: "qty", judul: "Qty Order", rata: "kanan", render: i => i.qty_ordered },
    {
      kunci: "terima", judul: "Diterima", rata: "kanan",
      // Warna SAJA tak cukup (WCAG 1.4.1) — angka diterima yang kurang juga
      // ditandai teks "kurang N", supaya terbaca tanpa membedakan warna.
      render: i => (
        <span style={{ color: i.qty_received >= i.qty_ordered ? C.success : C.warning }}>
          {i.qty_received}
          {i.qty_received < i.qty_ordered && (
            <span style={{ fontSize: 11, marginLeft: 4 }}>(kurang {i.qty_ordered - i.qty_received})</span>
          )}
        </span>
      ),
    },
    { kunci: "unit", judul: "Satuan", render: i => <span style={{ color: C.mid }}>{i.unit}</span> },
    { kunci: "harga", judul: "Harga/Unit", rata: "kanan", render: i => fmt(i.unit_price) },
    { kunci: "total", judul: "Total", rata: "kanan", render: i => <strong>{fmt(i.total_price)}</strong> },
  ];

  const totalPo: SelTotal[] = detailPo ? [
    { kunci: "label", isi: "Total PO", rata: "kanan", rentang: 5 },
    { kunci: "nilai", isi: <span style={{ color: C.navy }}>{fmt(Number(detailPo.total_amount))}</span>, rata: "kanan" },
  ] : [];

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <select
          aria-label="Saring status Purchase Order" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "var(--pad-tombol)", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface, color: C.text }}
        >
          <option value="">Semua Status</option>
          {STATUS_PO.map(s => <option key={s} value={s}>{STATUS_BADGE[s]?.label ?? s}</option>)}
        </select>
        {canManage && <Btn onClick={() => setShowCreate(true)}><Plus size={14} aria-hidden="true" /> Buat Purchase Order</Btn>}
      </div>

      {loading ? <Memuat /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pos.length === 0 && (
            <Kosong
              judul={statusFilter ? "Tak ada PO dengan status itu" : "Belum ada Purchase Order"}
              sebab={statusFilter
                ? `Saringan status "${STATUS_BADGE[statusFilter]?.label ?? statusFilter}" tak menyisakan satu pun. Pilih "Semua Status" untuk melihat keseluruhannya.`
                : "PO terbit dari Material Request yang sudah disetujui. Ia yang mengikat harga dan jumlah ke supplier — penerimaan barang nanti dicocokkan ke sini."}
            />
          )}
          {pos.map(po => (
            // Kartu TIDAK lagi ber-`onClick` — ia berisi tombol aksi, dan
            // kontrol di dalam kontrol membuat pembaca layar mengumumkan
            // keduanya bertumpuk (`nested-interactive`, WCAG 4.1.2). Pemicu
            // detail dipindah ke nomor PO.
            <Card key={po.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void openDetail(po)}
                      style={{
                        fontWeight: 700, color: C.navy, background: "none", border: "none",
                        padding: 0, font: "inherit", cursor: "pointer", textAlign: "left",
                        textDecoration: "underline", textUnderlineOffset: 3,
                      }}
                    >
                      {po.po_number}
                      <span className="sr-only"> — buka rincian pesanan</span>
                    </button>
                    <Badge status={po.status} />
                  </div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                    {po.supplier?.name} · {po.project?.name} · {fmtDate(po.order_date)}
                  </div>
                  {po.expected_delivery_date && (
                    <div style={{ fontSize: 12, color: C.mid }}>Estimasi tiba: {fmtDate(po.expected_delivery_date)}</div>
                  )}
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: C.text }}>{fmt(Number(po.total_amount))}</div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(po.items ?? []).map(item => (
                      <span key={item.id} style={{ fontSize: 11, padding: "2px 8px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, color: C.mid }}>
                        {item.material?.name} {item.qty_ordered}{item.unit} × {fmt(item.unit_price)}
                      </span>
                    ))}
                  </div>
                </div>
                {/* `stopPropagation` dihapus bersama `onClick` kartu. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {po.status === "draft" && canManage && (
                    <Btn onClick={() => void updateStatus(po.id, "sent")} style={{ fontSize: 12 }}>
                      <Truck size={13} aria-hidden="true" /> Kirim ke Supplier
                    </Btn>
                  )}
                  {po.status === "sent" && canManage && (
                    <Btn onClick={() => void updateStatus(po.id, "confirmed")} style={{ background: C.successBg, color: C.success, border: `1px solid ${C.success}`, fontSize: 12 }}>
                      <Check size={13} aria-hidden="true" /> Supplier Konfirmasi
                    </Btn>
                  )}
                  {["draft", "sent"].includes(po.status) && canManage && (
                    <Btn variant="danger" onClick={() => { setCancelId(po.id); setCancelNotes(""); }} style={{ fontSize: 12 }}>
                      <X size={13} aria-hidden="true" /> Batalkan
                    </Btn>
                  )}
                  {/* Modul 9b: pesan disusun di SERVER (lib/pesan-po.ts) — memuat
                      rincian item, bukan cuma total — dan pengirimannya DICATAT.
                      Versi lama merakit teks di sini dan tak meninggalkan jejak:
                      "PO ini sudah dikirim belum?" tak punya jawaban. */}
                  {po.supplier?.phone && canManage && (
                    <Btn variant="secondary" onClick={() => setKirimPo(po)} style={{ fontSize: 12 }}>
                      <Send size={13} aria-hidden="true" /> Kirim ke Vendor
                    </Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreatePoModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); void load(); }} />}
      {kirimPo && <KirimPoModal po={kirimPo} onClose={() => setKirimPo(null)} onSuccess={() => { setKirimPo(null); void load(); }} />}

      {detailPo && (
        <Modal title={`Detail ${detailPo.po_number}`} onClose={() => setDetailPo(null)} width={680}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: C.muted }}>Supplier: </span><strong>{detailPo.supplier?.name}</strong></div>
              <div><span style={{ color: C.muted }}>Proyek: </span>{detailPo.project?.name}</div>
              <div><span style={{ color: C.muted }}>Tgl Order: </span>{fmtDate(detailPo.order_date)}</div>
              <div><span style={{ color: C.muted }}>Est. Tiba: </span>{detailPo.expected_delivery_date ? fmtDate(detailPo.expected_delivery_date) : "—"}</div>
              <div><span style={{ color: C.muted }}>Syarat Bayar: </span>{detailPo.payment_terms ?? "—"}</div>
              <div><span style={{ color: C.muted }}>Dibuat oleh: </span>{detailPo.created_by?.name}</div>
              {detailPo.mr && <div><span style={{ color: C.muted }}>Dari MR: </span>{detailPo.mr.mr_number}</div>}
            </div>
            {detailPo.delivery_address && <div style={{ fontSize: 13 }}><span style={{ color: C.muted }}>Alamat kirim: </span>{detailPo.delivery_address}</div>}
            {detailPo.notes && <div style={{ fontSize: 13 }}><span style={{ color: C.muted }}>Catatan: </span>{detailPo.notes}</div>}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Daftar Item</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <Tabel              berpermukaan
                  kolom={kolomItem}
                  data={detailPo.items ?? []}
                  kunciBaris={i => i.id}
                  caption="Item dalam Purchase Order ini beserta jumlah yang sudah diterima. Selisih Qty Order dan Diterima menunjukkan yang masih ditunggu."
                  total={(detailPo.items ?? []).length > 0 ? totalPo : undefined}
                  kosong={<Kosong judul="PO ini tak punya item" sebab="PO tanpa item tak bisa diterima barangnya karena tak ada yang dicocokkan. Ini biasanya sisa dari pembuatan yang gagal di tengah jalan." />}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {cancelId && (
        <Modal title="Batalkan Purchase Order" onClose={() => setCancelId(null)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, color: C.danger }}>
              PO yang dibatalkan tidak bisa diaktifkan kembali. MR terkait akan dikembalikan ke status Approved.
            </div>
            <Input label="Alasan Pembatalan (opsional)" value={cancelNotes} onChange={e => setCancelNotes(e.target.value)} placeholder="cth: Supplier tidak tersedia..." />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setCancelId(null)}>Batal</Btn>
              <Btn variant="danger" loading={cancelling} onClick={() => void cancelPo()}>Konfirmasi Batalkan PO</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

"use client";

// ============================================================================
// Procurement — Portal PM (Task 24, tulis ulang penuh).
//
// Versi SEBELUMNYA (sebelum task ini) murni baca — tak punya satu tombol
// buat pun, walau permission PM (`procurement:mr:manage` +
// `procurement:po:manage`, PENUH — diverifikasi live 2026-08-21, Task 23
// Step 1) sudah mengizinkan create MR/PO sejak awal. Halaman ini menambah:
//
//   - Tab GR (Penerimaan) — sebelumnya cuma MR/PO.
//   - Tombol "+ Buat" per tab MR/PO, buka BottomSheet form.
//   - Kartu MR/PO jadi TAUTAN ke halaman detail baru (mr/[id], po/[id]).
//
// ── Kenapa tombol create SELALU tampil, tanpa gerbang `hasPermission`
//
// Portal PM tak punya endpoint "my permissions" terverifikasi (dicek: tak
// ada di riset Task 5/11/17) dan PM Task 23 Step 1 memegang `mr:manage` +
// `po:manage` PENUH (bukan sebagian) — konsisten pola Task 12/19 yang tidak
// menyembunyikan tombol create berdasarkan tebakan, hanya menyembunyikan
// aksi yang PM TERBUKTI tak punya (override kuota, approve — dua itu memang
// dialihkan ke halaman Approval, lihat mr/[id] dan po/[id]).
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Plus, X } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type {
  ProyekPM, GalatApi, RespMrDaftar, RespPoDaftar, RespGrDaftar,
  RespMaterialDaftar, RespSupplierDaftar, MaterialRingkas,
} from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek { projects: ProyekPM[] }

const LABEL_MR: Record<string, string> = {
  draft: "Draf", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
  partially_ordered: "Sebagian Dipesan", fully_ordered: "Selesai Dipesan",
};
const VARIAN_MR: Record<string, VarianStatus> = {
  draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected",
  partially_ordered: "info", fully_ordered: "approved",
};
const LABEL_PO: Record<string, string> = {
  draft: "Draf", sent: "Terkirim", confirmed: "Dikonfirmasi", cancelled: "Dibatalkan",
};
const VARIAN_PO: Record<string, VarianStatus> = {
  draft: "netral", sent: "pending", confirmed: "approved", cancelled: "rejected",
};
const LABEL_GR: Record<string, string> = { draft: "Draf", confirmed: "Dikonfirmasi" };
const VARIAN_GR: Record<string, VarianStatus> = { draft: "pending", confirmed: "approved" };

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmProcurementPage() {
  const [tab, setTab] = useState<"mr" | "po" | "gr">("mr");
  const [proyekId, setProyekId] = useState("");
  const [sheetMr, setSheetMr] = useState(false);
  const [sheetPo, setSheetPo] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlMr = proyekAktif ? `/api/v1/procurement/material-requests?project_id=${proyekAktif}` : null;
  const { data: dataMr, memuat: memuatMr, galat: galatMr } = useData<RespMrDaftar>(tab === "mr" ? urlMr : null);

  const urlPo = proyekAktif ? `/api/v1/procurement/purchase-orders?project_id=${proyekAktif}` : null;
  const { data: dataPo, memuat: memuatPo, galat: galatPo } = useData<RespPoDaftar>(tab === "po" ? urlPo : null);

  const urlGr = proyekAktif ? `/api/v1/procurement/goods-receipts?project_id=${proyekAktif}` : null;
  const { data: dataGr, memuat: memuatGr, galat: galatGr } = useData<RespGrDaftar>(tab === "gr" ? urlGr : null);

  const { data: dataMaterial } = useData<RespMaterialDaftar>(sheetMr ? "/api/v1/procurement/materials?limit=200" : null);
  const { data: dataSupplier } = useData<RespSupplierDaftar>(sheetPo ? "/api/v1/procurement/suppliers?limit=200" : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <KepalaPortal judul="Procurement" />
        {proyekAktif && tab === "mr" && (
          <button type="button" onClick={() => setSheetMr(true)} aria-label="Buat Material Request baru"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Plus size={16} aria-hidden="true" /> MR
          </button>
        )}
        {proyekAktif && tab === "po" && (
          <button type="button" onClick={() => setSheetPo(true)} aria-label="Buat Purchase Order baru"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Plus size={16} aria-hidden="true" /> PO
          </button>
        )}
      </div>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </label>
      )}

      <SegmentedTab
        opsi={[{ value: "mr", label: "Material Request" }, { value: "po", label: "Purchase Order" }, { value: "gr", label: "Penerimaan" }]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {!proyekAktif && <EmptyState icon={ShoppingCart} judul="Pilih proyek" deskripsi="Procurement tercatat per proyek." />}

      {proyekAktif && tab === "mr" && (
        <>
          {memuatMr && <SkeletonCard tinggi={80} />}
          {galatMr && <EmptyState icon={ShoppingCart} judul="Gagal memuat MR" deskripsi={pesanGalat(galatMr as GalatApi, "Coba muat ulang.")} />}
          {!memuatMr && !galatMr && (dataMr?.material_requests?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Material Request" deskripsi="Buat permintaan material pertama untuk proyek ini." />
          )}
          {!memuatMr && (dataMr?.material_requests ?? []).map((mr) => (
            <Link key={mr.id} href={`/pm-portal/procurement/mr/${mr.id}`}
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{mr.mr_number ?? "MR"}</span>
                <StatusBadge status={VARIAN_MR[mr.status] ?? "netral"} label={LABEL_MR[mr.status] ?? mr.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {mr.request_date ?? "—"}{mr.needed_date ? ` · dibutuhkan ${mr.needed_date}` : ""} · {mr.items.length} item
              </div>
              {mr.requested_by?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Diminta: {mr.requested_by.name}</div>}
            </Link>
          ))}
        </>
      )}

      {proyekAktif && tab === "po" && (
        <>
          {memuatPo && <SkeletonCard tinggi={80} />}
          {galatPo && <EmptyState icon={ShoppingCart} judul="Gagal memuat PO" deskripsi={pesanGalat(galatPo as GalatApi, "Coba muat ulang.")} />}
          {!memuatPo && !galatPo && (dataPo?.purchase_orders?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Purchase Order" deskripsi="PO ke supplier untuk proyek ini akan muncul di sini." />
          )}
          {!memuatPo && (dataPo?.purchase_orders ?? []).map((po) => (
            <Link key={po.id} href={`/pm-portal/procurement/po/${po.id}`}
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{po.po_number ?? "PO"}</span>
                <StatusBadge status={VARIAN_PO[po.status] ?? "netral"} label={LABEL_PO[po.status] ?? po.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{po.supplier?.name ?? "—"} · {fmtRupiah(po.total_amount)}</div>
              {po.expected_delivery_date && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Estimasi kirim: {po.expected_delivery_date}</div>}
            </Link>
          ))}
        </>
      )}

      {proyekAktif && tab === "gr" && (
        <>
          {memuatGr && <SkeletonCard tinggi={80} />}
          {galatGr && <EmptyState icon={ShoppingCart} judul="Gagal memuat penerimaan" deskripsi={pesanGalat(galatGr as GalatApi, "Coba muat ulang.")} />}
          {!memuatGr && !galatGr && (dataGr?.goods_receipts?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada penerimaan barang" deskripsi="Penerimaan dibuat dari halaman detail PO." />
          )}
          {!memuatGr && (dataGr?.goods_receipts ?? []).map((gr) => (
            <div key={gr.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{gr.gr_number ?? "GR"}</span>
                <StatusBadge status={VARIAN_GR[gr.status] ?? "netral"} label={LABEL_GR[gr.status] ?? gr.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {gr.supplier?.name ?? "—"} · PO {gr.po?.po_number ?? "—"} · {gr.receipt_date ?? "—"}
              </div>
            </div>
          ))}
        </>
      )}

      <SheetBuatMr terbuka={sheetMr} onTutup={() => setSheetMr(false)} proyekId={proyekAktif} material={dataMaterial?.materials ?? []} />
      <SheetBuatPo terbuka={sheetPo} onTutup={() => setSheetPo(false)} proyekId={proyekAktif} supplier={dataSupplier?.suppliers ?? []} />
    </div>
  );
}

interface BarisItemForm { material_id: string; qty: string; unit: string }

function SheetBuatMr({ terbuka, onTutup, proyekId, material }: { terbuka: boolean; onTutup: () => void; proyekId: string; material: MaterialRingkas[] }) {
  const [neededDate, setNeededDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<BarisItemForm[]>([{ material_id: "", qty: "", unit: "" }]);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function tambahBaris() { setItems((p) => [...p, { material_id: "", qty: "", unit: "" }]); }
  function hapusBaris(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function ubahBaris(i: number, patch: Partial<BarisItemForm>) {
    setItems((p) => p.map((b, idx) => {
      if (idx !== i) return b;
      const next = { ...b, ...patch };
      if (patch.material_id) {
        const m = material.find((x) => x.id === patch.material_id);
        if (m) next.unit = m.unit;
      }
      return next;
    }));
  }

  async function simpan() {
    const valid = items.filter((it) => it.material_id && Number(it.qty) > 0);
    if (valid.length === 0) { setGalat("Isi minimal satu item dengan qty > 0."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/material-requests", {
        project_id: proyekId,
        needed_date: neededDate || undefined,
        notes: notes.trim() || undefined,
        items: valid.map((it) => ({ material_id: it.material_id, qty_requested: Number(it.qty), unit: it.unit })),
      });
      invalidasi(`/api/v1/procurement/material-requests?project_id=${proyekId}`);
      setItems([{ material_id: "", qty: "", unit: "" }]); setNeededDate(""); setNotes(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat MR"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Material Request Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tanggal dibutuhkan
          <input type="date" value={neededDate} onChange={(e) => setNeededDate(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "var(--surface-subtle)" }}>
            <Pilihan value={it.material_id} onChange={(e) => ubahBaris(i, { material_id: e.target.value })}
              aria-label={`Material item ${i + 1}`}
              style={{ minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
              <option value="">Pilih material…</option>
              {material.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </Pilihan>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => ubahBaris(i, { qty: e.target.value })}
                placeholder="Qty" aria-label={`Kuantitas item ${i + 1}`}
                style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              {items.length > 1 && (
                <button type="button" onClick={() => hapusBaris(i)} aria-label={`Hapus item ${i + 1}`}
                  style={{ minHeight: 44, minWidth: 44, borderRadius: 10, background: "transparent", border: "1px solid var(--border)", cursor: "pointer" }}>
                  <X size={16} color="var(--danger)" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={tambahBaris}
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px dashed var(--border)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>
          + Tambah item
        </button>

        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Catatan
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan sebagai draf"}
        </button>
      </div>
    </BottomSheet>
  );
}

function SheetBuatPo({ terbuka, onTutup, proyekId, supplier }: { terbuka: boolean; onTutup: () => void; proyekId: string; supplier: { id: string; name: string }[] }) {
  const [supplierId, setSupplierId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{ material_id: string; qty: string; unit: string; harga: string }>>([{ material_id: "", qty: "", unit: "", harga: "" }]);
  const { data: dataMaterial } = useData<RespMaterialDaftar>(terbuka ? "/api/v1/procurement/materials?limit=200" : null);
  const material = dataMaterial?.materials ?? [];
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function tambahBaris() { setItems((p) => [...p, { material_id: "", qty: "", unit: "", harga: "" }]); }
  function hapusBaris(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function ubahBaris(i: number, patch: Partial<{ material_id: string; qty: string; unit: string; harga: string }>) {
    setItems((p) => p.map((b, idx) => {
      if (idx !== i) return b;
      const next = { ...b, ...patch };
      if (patch.material_id) {
        const m = material.find((x) => x.id === patch.material_id);
        if (m) { next.unit = m.unit; next.harga = String(m.unit_price ?? ""); }
      }
      return next;
    }));
  }

  async function simpan() {
    if (!supplierId) { setGalat("Pilih supplier."); return; }
    const valid = items.filter((it) => it.material_id && Number(it.qty) > 0 && Number(it.harga) >= 0);
    if (valid.length === 0) { setGalat("Isi minimal satu item dengan qty dan harga."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/purchase-orders", {
        project_id: proyekId, supplier_id: supplierId,
        expected_delivery_date: deliveryDate || undefined,
        notes: notes.trim() || undefined,
        items: valid.map((it) => ({ material_id: it.material_id, qty_ordered: Number(it.qty), unit: it.unit, unit_price: Number(it.harga) })),
      });
      invalidasi(`/api/v1/procurement/purchase-orders?project_id=${proyekId}`);
      setItems([{ material_id: "", qty: "", unit: "", harga: "" }]); setSupplierId(""); setDeliveryDate(""); setNotes(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat PO"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Purchase Order Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Supplier
          <Pilihan value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih supplier…</option>
            {supplier.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Pilihan>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Estimasi kirim
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "var(--surface-subtle)" }}>
            <Pilihan value={it.material_id} onChange={(e) => ubahBaris(i, { material_id: e.target.value })}
              aria-label={`Material item ${i + 1}`}
              style={{ minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
              <option value="">Pilih material…</option>
              {material.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </Pilihan>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => ubahBaris(i, { qty: e.target.value })}
                placeholder="Qty" aria-label={`Kuantitas item ${i + 1}`}
                style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              <input type="number" min="0" step="1" value={it.harga} onChange={(e) => ubahBaris(i, { harga: e.target.value })}
                placeholder="Harga satuan" aria-label={`Harga satuan item ${i + 1}`}
                style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              {items.length > 1 && (
                <button type="button" onClick={() => hapusBaris(i)} aria-label={`Hapus item ${i + 1}`}
                  style={{ minHeight: 44, minWidth: 44, borderRadius: 10, background: "transparent", border: "1px solid var(--border)", cursor: "pointer" }}>
                  <X size={16} color="var(--danger)" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={tambahBaris}
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px dashed var(--border)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>
          + Tambah item
        </button>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan sebagai draf"}
        </button>
      </div>
    </BottomSheet>
  );
}

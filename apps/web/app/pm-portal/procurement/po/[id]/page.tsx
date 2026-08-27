"use client";

// ============================================================================
// Detail Purchase Order — Portal PM (Task 24 Step 4).
//
// `PATCH .../status {status:'sent'}` TIDAK ada sebagai tombol terpisah di
// sini — endpoint itu SENDIRI sudah menjalankan `evaluateEntityApproval`
// untuk entityType `purchase_order` (`procurement.ts:1023-1101`), jadi tombol
// "Kirim ke Vendor" di bawah MEMANGGIL endpoint itu langsung. Diukur LIVE
// 2026-08-21: rantai `purchase_order` juga cuma SATU langkah,
// `required_permission = procurement:po:manage`, PM memegangnya — jadi pada
// seed longgar saat ini PO draft PM sendiri langsung lolos ke `sent` dalam
// satu klik. Kalau rantainya diperketat lewat Pengaturan → Approval kelak
// (level >1 atau permission lain), respons `pending_next_level` di bawah
// yang menahannya — bukan gerbang UI statis yang bisa basi begitu konfigurasi
// approval berubah tanpa kode ini disentuh.
//
// TIDAK ADA endpoint "tolak approval PO" yang aman secara semantik (lihat
// approval/page.tsx) — kalau `pending_next_level` muncul, halaman ini hanya
// menampilkan pesan "naik level", sama seperti pola inbox terpusat.
// ============================================================================

import { useState } from "react";
import { useParams } from "next/navigation";
import { Truck, Send, PackagePlus, ArrowUpCircle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespPoDetail, RespPesanPo, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = { draft: "Draf", sent: "Terkirim", confirmed: "Dikonfirmasi", cancelled: "Dibatalkan" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "netral", sent: "pending", confirmed: "approved", cancelled: "rejected" };

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

interface RespStatus { purchase_order?: unknown; pending_next_level?: boolean; message?: string }

export default function PmPoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const url = `/api/v1/procurement/purchase-orders/${id}`;
  const { data, memuat, galat } = useData<RespPoDetail>(url);
  const po = data?.purchase_order;

  // Galat AKSI terpisah dari `galat` (galat MUAT) — pola sama mr/[id].
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [naikLevel, setNaikLevel] = useState<string | null>(null);
  const [sheetGr, setSheetGr] = useState(false);

  async function kirimKeVendor() {
    setMengirim(true); setGalatAksi(null); setNaikLevel(null);
    try {
      const res = await api.patch<RespStatus>(`/api/v1/procurement/purchase-orders/${id}/status`, { status: "sent" });
      if (res.data?.pending_next_level) {
        setNaikLevel(res.data.message ?? "Naik ke level berikutnya — belum terkirim ke vendor.");
        invalidasi(url);
        return;
      }
      // Baru sesudah status benar-benar `sent` — susun & buka pesan WA.
      const pesan = await api.get<RespPesanPo>(`/api/v1/procurement/purchase-orders/${id}/delivery-message`);
      if (pesan.data.wa_url) window.open(pesan.data.wa_url, "_blank", "noopener,noreferrer");
      await api.post(`/api/v1/procurement/purchase-orders/${id}/delivery-log`, { channel: "whatsapp" });
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengirim PO"));
    } finally { setMengirim(false); }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !po) {
    return <EmptyState icon={Truck} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "PO tidak ditemukan.")} />;
  }

  const adaSisaTerima = po.items.some((it) => Number(it.qty_received ?? 0) < Number(it.qty_ordered));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{po.po_number ?? "PO"}</h1>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{po.project?.name ?? "—"} · {po.supplier?.name ?? "—"}</div>
      </div>

      <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Status</span>
          <StatusBadge status={VARIAN_STATUS[po.status] ?? "netral"} label={LABEL_STATUS[po.status] ?? po.status} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(po.total_amount)}</div>
        {po.mr && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Dari MR {po.mr.mr_number}</div>}
      </div>

      {galatAksi && <div role="alert" style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}>{galatAksi}</div>}
      {naikLevel && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14, background: "var(--info-bg)" }}>
          <ArrowUpCircle size={18} color="var(--on-info-bg)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "var(--on-info-bg)" }}>{naikLevel}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {po.status === "draft" && (
          <button type="button" onClick={kirimKeVendor} disabled={mengirim}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: mengirim ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Send size={16} aria-hidden="true" /> {mengirim ? "Mengirim…" : "Kirim ke Vendor"}
          </button>
        )}
        {(po.status === "sent" || po.status === "confirmed") && adaSisaTerima && (
          <button type="button" onClick={() => setSheetGr(true)}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <PackagePlus size={16} aria-hidden="true" /> Buat Penerimaan
          </button>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item ({po.items.length})</div>
      {po.items.map((it) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{it.material?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {it.qty_ordered} {it.unit} · diterima {it.qty_received ?? 0}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(it.total_price)}</div>
        </div>
      ))}

      <SheetBuatGr terbuka={sheetGr} onTutup={() => setSheetGr(false)} po={po} onSukses={() => invalidasi(url)} />
    </div>
  );
}

function SheetBuatGr({ terbuka, onTutup, po, onSukses }: { terbuka: boolean; onTutup: () => void; po: NonNullable<RespPoDetail["purchase_order"]>; onSukses: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [suratJalan, setSuratJalan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // ── Kenapa create LANGSUNG diikuti confirm, bukan tombol terpisah ─────────
  //
  // `POST /goods-receipts` HANYA membuat baris berstatus `draft` — trigger
  // `sync_po_receipt_status` yang benar-benar menambah `qty_received` PO,
  // menambah stok, dan membuat `supplier_invoices` HANYA berjalan saat GR
  // berstatus `confirmed` (`db/migrations/041_procurement_workflow.sql:186`,
  // `AFTER UPDATE ... WHEN NEW.status='confirmed'`), lewat endpoint TERPISAH
  // `PATCH /goods-receipts/:id/confirm`.
  //
  // Tanpa memanggil endpoint kedua ini, "Simpan Penerimaan" terlihat sukses
  // di UI tapi TAK BEREFEK NYATA: GR selamanya `draft`, `adaSisaTerima` di
  // halaman PO tetap true selamanya, stok tak pernah bertambah, tagihan
  // supplier tak pernah terbentuk — silent failure, bukan sekadar bug kecil.
  //
  // Dipilih memanggil `confirm` LANGSUNG sesudah `create` sukses (bukan
  // tombol "Konfirmasi" terpisah) karena:
  //   1. `confirm` tak butuh input tambahan apa pun (body kosong, hanya id
  //      dari URL) — tak ada data baru yang perlu diisi PM di antara kedua
  //      langkah, jadi tahap draft terpisah tak menambah nilai di alur ini.
  //   2. Permission-nya SAMA (`procurement:po:manage`) dengan yang dipakai
  //      create GR — PM yang boleh membuat GR otomatis boleh mengonfirmasinya.
  //   3. Qty yang diinput PM di form ini sudah final dari sudut pandang
  //      mobile (tak ada langkah "cek dulu oleh orang lain" yang tersirat di
  //      brief atau backend) — draft terpisah di sini hanya berguna sebagai
  //      antar-request race guard (dua GR draft utk PO sama, backend
  //      memvalidasi ulang over-receipt persis untuk itu saat confirm), bukan
  //      sebagai jeda tinjau bagi manusia.
  // Kalau `confirm` gagal SESUDAH `create` sukses, GR tetap tersimpan
  // (draft) — galat dilaporkan eksplisit dan TIDAK diklaim sebagai sukses,
  // supaya PM tahu perlu mencoba konfirmasi ulang (bukan gagal senyap ke
  // arah sebaliknya: GR ada tapi dikira sudah "beres").
  async function simpan() {
    const items = po.items
      .map((it) => ({ po_item_id: it.id, qty_received: Number(qty[it.id] ?? 0), sisa: Number(it.qty_ordered) - Number(it.qty_received ?? 0) }))
      .filter((it) => it.qty_received > 0);
    if (items.length === 0) { setGalat("Isi qty diterima minimal satu item."); return; }
    const lebih = items.find((it) => it.qty_received > it.sisa);
    if (lebih) { setGalat(`Qty diterima melebihi sisa PO (sisa ${lebih.sisa}).`); return; }

    setMengirim(true); setGalat(null);
    let grId: string | null = null;
    try {
      const res = await api.post<{ goods_receipt: { id: string; gr_number: string } }>(
        "/api/v1/procurement/goods-receipts",
        {
          po_id: po.id, receipt_date: tanggal, delivery_note_number: suratJalan.trim() || undefined,
          items: items.map((it) => ({ po_item_id: it.po_item_id, qty_received: it.qty_received })),
        },
      );
      grId = res.data.goods_receipt.id;

      // Langkah kedua WAJIB — lihat catatan di atas fungsi ini. Galat di sini
      // dilempar ulang lewat catch bawah dengan pesan yang menyebut GR SUDAH
      // tersimpan (bukan pesan generik "gagal membuat penerimaan").
      await api.patch(`/api/v1/procurement/goods-receipts/${grId}/confirm`);

      invalidasi(`/api/v1/procurement/goods-receipts?project_id=${po.project?.id}`);
      onSukses(); setQty({}); setSuratJalan(""); onTutup();
    } catch (e) {
      setGalat(
        grId
          ? `Penerimaan tersimpan (belum terkonfirmasi) tapi konfirmasi gagal: ${pesanGalat(e as GalatApi, "coba lagi")}. Stok & tagihan supplier BELUM terbentuk — buka lagi sheet ini atau hubungi admin untuk mengonfirmasi GR ini secara manual.`
          : pesanGalat(e as GalatApi, "Gagal membuat penerimaan"),
      );
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Buat Penerimaan Barang">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tanggal terima
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nomor surat jalan
          <input type="text" value={suratJalan} onChange={(e) => setSuratJalan(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        {po.items.map((it) => {
          const sisa = Number(it.qty_ordered) - Number(it.qty_received ?? 0);
          if (sisa <= 0) return null;
          return (
            <label key={it.id} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {it.material?.name ?? "—"} (sisa {sisa} {it.unit})
              <input type="number" min="0" max={sisa} step="0.01" value={qty[it.id] ?? ""} onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
            </label>
          );
        })}

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan Penerimaan"}
        </button>
      </div>
    </BottomSheet>
  );
}

"use client";

// ============================================================================
// DETAIL PURCHASE ORDER — Portal Admin/Direktur (Tahap 4, Task 21 Step 5)
//
// Tiga hal yang bisa dikerjakan di sini: melihat rincian PO, mengirimkannya
// ke supplier lewat WhatsApp, dan mencatat penerimaan barang (GR).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TOMBOL WA BISA HILANG — DAN ITU DISENGAJA
// ══════════════════════════════════════════════════════════════════════════
//
// `wa_url` dipulangkan NULL saat nomor telepon supplier tak sah. Komentar di
// `procurement.ts` menuliskan aturannya sendiri: *"UI WAJIB menyembunyikan
// tombolnya, bukan memasang tautan ke nomor ngawur."*
//
// Memasang tautan ke nomor cacat bukan sekadar tak berguna — ia membuka
// percakapan WhatsApp ke nomor ORANG LAIN yang kebetulan cocok, membawa
// rincian harga dan alamat proyek. Karena itu saat `wa_url` null, yang
// tampil adalah penjelasan + pesan yang bisa disalin manual.
//
// ══════════════════════════════════════════════════════════════════════════
// PENERIMAAN BARANG (GR) — kontrak diverifikasi ke kode
// ══════════════════════════════════════════════════════════════════════════
//
// `POST /goods-receipts` menuntut `po_id` + `items[]` dengan `po_item_id`
// (procurement.ts:1168-1174) — BUKAN `material_id`. Memakai material_id akan
// ditolak 400, dan halaman ini akan terlihat rusak tanpa sebab yang jelas.
//
// Jumlah diterima diisi otomatis dengan SISA yang belum diterima
// (`qty_ordered − qty_received`), karena itu yang benar di hampir semua
// pengiriman. Tetap bisa disunting: kiriman sebagian adalah kejadian normal.
// ============================================================================

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PackageCheck, MessageCircle, ArrowLeft, Copy } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { formatRupiah } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespPoDetail, RespPesanPo, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", sent: "Terkirim", confirmed: "Dikonfirmasi", cancelled: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", sent: "pending", confirmed: "approved", cancelled: "rejected",
};

export default function AdminPoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const url = `/api/v1/procurement/purchase-orders/${id}`;
  const { data, memuat, galat } = useData<RespPoDetail>(url);
  const po = data?.purchase_order;

  const bolehKelolaPo = useIzin("procurement:po:manage");

  const [sheetKirim, setSheetKirim] = useState(false);
  const [sheetGr, setSheetGr] = useState(false);

  const { data: dataPesan } =
    useData<RespPesanPo>(sheetKirim ? `${url}/delivery-message` : null);

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={90} />
        <SkeletonCard tinggi={140} />
      </div>
    );
  }

  if (galat || !po) {
    return (
      <EmptyState
        icon={PackageCheck}
        judul="Purchase Order tidak ditemukan"
        deskripsi={galat ? pesanGalat(galat as GalatApi, "Coba muat ulang.") : "PO ini mungkin sudah dihapus."}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Link href="/admin-portal/procurement" style={tautanKembali}>
        <ArrowLeft size={16} aria-hidden="true" /> Procurement
      </Link>

      <div style={kepala}>
        <h1 style={{
        fontSize: "var(--t-judul)", fontWeight: 700,
        color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em",
      }}>
          {po.po_number ?? "Purchase Order"}
        </h1>
        <StatusBadge
          status={VARIAN_STATUS[po.status] ?? "netral"}
          label={LABEL_STATUS[po.status] ?? po.status}
        />
      </div>

      <div style={kartu}>
        <Baris label="Proyek" nilai={po.project?.name ?? "—"} />
        <Baris label="Supplier" nilai={po.supplier?.name ?? "—"} />
        <Baris label="Nilai" nilai={formatRupiah(po.total_amount)} />
        <Baris label="Estimasi kirim" nilai={po.expected_delivery_date ?? "—"} />
        {po.mr?.mr_number && <Baris label="Dari MR" nilai={po.mr.mr_number} />}
      </div>

      <div style={kartu}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Item ({po.items.length})
        </div>
        {po.items.map((it) => {
          const dipesan = Number(it.qty_ordered);
          const diterima = Number(it.qty_received ?? 0);
          return (
            <div key={it.id} style={barisItem}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                  {it.material?.name ?? "Material"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {dipesan} {it.unit} × {formatRupiah(it.unit_price)}
                  {diterima > 0 ? ` · diterima ${diterima}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {formatRupiah(it.total_price)}
              </div>
            </div>
          );
        })}
      </div>

      {bolehKelolaPo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" onClick={() => setSheetKirim(true)} style={tombolSekunder}>
            <MessageCircle size={16} aria-hidden="true" /> Kirim ke supplier
          </button>
          <button type="button" onClick={() => setSheetGr(true)} style={tombolSekunder}>
            <PackageCheck size={16} aria-hidden="true" /> Catat penerimaan barang
          </button>
        </div>
      )}

      {sheetKirim && (
        <SheetKirim
          pesan={dataPesan}
          tutup={() => setSheetKirim(false)}
        />
      )}
      {sheetGr && (
        <SheetGr
          poId={id}
          items={po.items}
          tutup={() => setSheetGr(false)}
          selesai={() => {
            setSheetGr(false);
            invalidasi(url);
            invalidasi("/api/v1/procurement/goods-receipts");
          }}
        />
      )}
    </div>
  );
}

/* ── Kirim PO ke supplier ──────────────────────────────────────────────── */
function SheetKirim({ pesan, tutup }: { pesan: RespPesanPo | null | undefined; tutup: () => void }) {
  const [tersalin, setTersalin] = useState(false);

  async function salin() {
    if (!pesan) return;
    try {
      await navigator.clipboard.writeText(pesan.pesan);
      setTersalin(true);
    } catch {
      // Clipboard bisa ditolak peramban (izin, konteks tak aman). Teksnya
      // tetap terlihat di layar, jadi pengguna masih bisa menyalin manual —
      // yang tak boleh terjadi adalah mengaku "tersalin" padahal tidak.
      setTersalin(false);
    }
  }

  return (
    <BottomSheet terbuka judul="Kirim PO ke supplier" onTutup={tutup}>
      {!pesan ? (
        <SkeletonCard tinggi={120} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <pre style={kotakPesan}>{pesan.pesan}</pre>

          {pesan.sudah_dikirim.whatsapp_at && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Sudah pernah dikirim lewat WhatsApp: {pesan.sudah_dikirim.whatsapp_at}
            </div>
          )}

          {/*
            Tombol WA HANYA saat `wa_url` ada. Saat null, yang tampil
            penjelasan + salin manual — bukan tautan ke nomor ngawur.
          */}
          {pesan.wa_url ? (
            <a href={pesan.wa_url} target="_blank" rel="noopener noreferrer" style={tombolWa}>
              <MessageCircle size={16} aria-hidden="true" /> Buka WhatsApp
            </a>
          ) : (
            <div style={kotakPeringatan} role="alert">
              Nomor WhatsApp supplier belum diisi atau tak sah. Lengkapi nomor
              di data supplier, atau salin pesan di atas dan kirim manual.
            </div>
          )}

          <button type="button" onClick={salin} style={tombolSekunder}>
            <Copy size={16} aria-hidden="true" /> {tersalin ? "Tersalin" : "Salin pesan"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/* ── Catat penerimaan barang ───────────────────────────────────────────── */
function SheetGr({
  poId, items, tutup, selesai,
}: {
  poId: string;
  items: NonNullable<RespPoDetail["purchase_order"]>["items"];
  tutup: () => void;
  selesai: () => void;
}) {
  /*
    Diisi otomatis dengan SISA yang belum diterima — itu nilai yang benar di
    hampir semua pengiriman. Tetap bisa disunting: kiriman sebagian normal.
  */
  const awal = useMemo(() => {
    const p: Record<string, string> = {};
    for (const it of items) {
      const sisa = Number(it.qty_ordered) - Number(it.qty_received ?? 0);
      p[it.id] = sisa > 0 ? String(sisa) : "0";
    }
    return p;
  }, [items]);

  const [qty, setQty] = useState<Record<string, string>>(awal);
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [suratJalan, setSuratJalan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const terisi = items.filter((it) => Number(qty[it.id]) > 0);
  const bisa = terisi.length > 0;

  async function simpan() {
    if (!bisa) return;
    setKirim(true);
    setGalat(null);
    try {
      await api.post("/api/v1/procurement/goods-receipts", {
        po_id: poId,
        receipt_date: tanggal || undefined,
        delivery_note_number: suratJalan.trim() || undefined,
        // `po_item_id`, BUKAN `material_id` — procurement.ts:1172.
        items: terisi.map((it) => ({ po_item_id: it.id, qty_received: Number(qty[it.id]) })),
      });
      selesai();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal mencatat penerimaan barang."));
    } finally {
      setKirim(false);
    }
  }

  return (
    <BottomSheet terbuka judul="Catat penerimaan barang" onTutup={tutup}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelKecil}>Tanggal terima</span>
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={isian} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelKecil}>Nomor surat jalan (opsional)</span>
          <input type="text" value={suratJalan} onChange={(e) => setSuratJalan(e.target.value)} style={isian} />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={labelKecil}>Jumlah diterima</span>
          {items.map((it) => {
            const sisa = Number(it.qty_ordered) - Number(it.qty_received ?? 0);
            return (
              <div key={it.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
                  {it.material?.name ?? "Material"}{" "}
                  <span style={{ color: "var(--text-secondary)" }}>(sisa {sisa} {it.unit})</span>
                </span>
                <input
                  type="number" min={0} step="any" inputMode="decimal"
                  aria-label={`Jumlah diterima ${it.material?.name ?? "material"}`}
                  value={qty[it.id] ?? ""}
                  onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                  style={isian}
                />
              </div>
            );
          })}
        </div>

        {galat && <div role="alert" style={kotakGalat}>{galat}</div>}

        <button
          type="button" onClick={simpan} disabled={!bisa || kirim}
          style={{
            ...tombolSimpan,
            background: !bisa || kirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
            color: !bisa || kirim ? "var(--text-muted)" : "var(--on-navy)",
          }}
        >
          {kirim ? "Menyimpan…" : `Catat penerimaan (${terisi.length} item)`}
        </button>
      </div>
    </BottomSheet>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", textAlign: "right" }}>{nilai}</span>
    </div>
  );
}

const kepala: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
};
const kartu: React.CSSProperties = {
  padding: 14, borderRadius: 14,
  background: "var(--surface)",
  border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
  boxShadow: "var(--naik-1)",
};
const barisItem: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)",
};
const tautanKembali: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
  fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none",
};
const labelKecil: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
};
const isian: React.CSSProperties = {
  minHeight: 44, padding: "0 12px", borderRadius: 12,
  border: "1px solid var(--border)", fontSize: 14,
  background: "var(--surface)", color: "var(--text-primary)",
};
const tombolSekunder: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  width: "100%", minHeight: 44, borderRadius: 12,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text-primary)", fontSize: 13, fontWeight: 600,
  cursor: "pointer", textDecoration: "none",
};
const tombolWa: React.CSSProperties = {
  ...tombolSekunder, background: "var(--grad-aksen)",
  color: "var(--on-navy)", border: "none", fontWeight: 700,
};
const tombolSimpan: React.CSSProperties = {
  width: "100%", minHeight: 44, borderRadius: 12,
  border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
};
const kotakPesan: React.CSSProperties = {
  margin: 0, padding: 12, borderRadius: 12,
  background: "var(--surface-subtle)", color: "var(--text-primary)",
  fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
  fontFamily: "inherit", maxHeight: 220, overflowY: "auto",
};
const kotakPeringatan: React.CSSProperties = {
  padding: 12, borderRadius: 12,
  background: "var(--warning-bg)", color: "var(--on-warning-bg)",
  fontSize: 12, lineHeight: 1.5,
};
const kotakGalat: React.CSSProperties = {
  padding: 12, borderRadius: 12,
  background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 13,
};

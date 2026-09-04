"use client";

// ============================================================================
// Transfer Antar Proyek — Portal PM (Task 25 Step 5).
//
// Daftar transfer (asal → tujuan) + tombol "Transfer Baru": proyek asal/
// tujuan berbeda, material dari stok asal (bukan seluruh katalog), qty ≤
// stok asal — validasi klien MERINGANKAN saja, backend tetap memvalidasi
// ulang (400 kalau stok tak cukup, `transfer-stok.ts` L163-170).
//
// PM punya `procurement:material:manage` (bukan `procurement:view` yang
// dipakai `stocks/usage` — endpoint ini SENGAJA tidak meniru cacat gerbang
// itu, lihat komentar `transfer-stok.ts` L92-102: memindahkan material
// antar proyek adalah tindakan MENGELOLA material, bukan sekadar melihatnya).
// ============================================================================

import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespTransferDaftar, RespStokDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek { projects: ProyekPM[] }

export default function PmTransferPage() {
  const { data, memuat, galat } = useData<RespTransferDaftar>("/api/v1/transfer-stok?limit=100");
  const [sheetBuka, setSheetBuka] = useState(false);
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <KepalaPortal judul="Transfer Antar Proyek" />
        <button type="button" onClick={() => setSheetBuka(true)}
          style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} aria-hidden="true" /> Transfer
        </button>
      </div>

      {memuat && <SkeletonCard tinggi={70} />}
      {galat && <EmptyState icon={ArrowLeftRight} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && (data?.transfers.length ?? 0) === 0 && (
        <EmptyState icon={ArrowLeftRight} judul="Belum ada transfer" deskripsi="Perpindahan material antar proyek akan tercatat di sini." />
      )}

      {(data?.transfers ?? []).map((t) => (
        <div key={t.id} style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{t.material?.name ?? "—"} · {t.qty} {t.material?.unit ?? ""}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.asal?.name ?? "—"} → {t.tujuan?.name ?? "—"} · {t.tanggal}</div>
          {t.alasan && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.alasan}</div>}
        </div>
      ))}

      <SheetTransferBaru terbuka={sheetBuka} onTutup={() => setSheetBuka(false)} proyek={daftarProyek} />
    </div>
  );
}

function SheetTransferBaru({ terbuka, onTutup, proyek }: { terbuka: boolean; onTutup: () => void; proyek: ProyekPM[] }) {
  const [asalId, setAsalId] = useState("");
  const [tujuanId, setTujuanId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const { data: dataStokAsal } = useData<RespStokDaftar>(asalId ? `/api/v1/procurement/stocks?project_id=${asalId}` : null);

  async function simpan() {
    if (!asalId || !tujuanId) { setGalat("Pilih proyek asal dan tujuan."); return; }
    if (asalId === tujuanId) { setGalat("Proyek asal dan tujuan tidak boleh sama."); return; }
    if (!materialId || !(Number(qty) > 0)) { setGalat("Pilih material dan isi qty > 0."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/transfer-stok", { project_asal_id: asalId, project_tujuan_id: tujuanId, material_id: materialId, qty: Number(qty), alasan: alasan.trim() || undefined });
      invalidasi("/api/v1/transfer-stok?limit=100");
      setAsalId(""); setTujuanId(""); setMaterialId(""); setQty(""); setAlasan(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat transfer"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Transfer Material">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Dari proyek
          <Pilihan value={asalId} onChange={(e) => { setAsalId(e.target.value); setMaterialId(""); }}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih…</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Ke proyek
          <Pilihan value={tujuanId} onChange={(e) => setTujuanId(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih…</option>
            {proyek.filter((p) => p.id !== asalId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Material
          <Pilihan value={materialId} onChange={(e) => setMaterialId(e.target.value)} disabled={!asalId}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">{asalId ? "Pilih material…" : "Pilih proyek asal dulu"}</option>
            {(dataStokAsal?.stocks ?? []).map((s) => <option key={s.id} value={s.material?.id}>{s.material?.name} (tersedia {s.qty_on_hand})</option>)}
          </Pilihan>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Qty
          <input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Alasan
          <input type="text" value={alasan} onChange={(e) => setAlasan(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Kirim Transfer"}
        </button>
      </div>
    </BottomSheet>
  );
}

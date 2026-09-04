"use client";

// ============================================================================
// Register Aset & Alat — Portal PM (Task 40, Tahap 7).
//
// KPI ringkas (total, nilai buku, perawatan) + SegmentedTab (Register / Sewa
// / Perawatan Mendesak) + tombol "+ Aset" (BottomSheet form tambah cepat).
//
// PM PUNYA `assets:view` + `assets:manage` PENUH (migrasi 149 men-seed ke
// role yang scope-nya sudah setara `cash:manage` — dikonfirmasi
// `apps/api/src/routes/v1/assets.ts` header komentar berkas). Tak ada SoD di
// modul ini seperti opname/backcharge — seluruh tombol tulis di sini boleh
// tampil.
//
// Dua state galat level-halaman TERPISAH per tab (pelajaran Tahap 2-7): tab
// aktif mana pun yang gagal MUAT tampil sebagai EmptyState pada tab itu
// sendiri — gagal muat "Sewa" tak menghapus data "Register" yang mungkin
// sudah sempat tampil sebelumnya, dan galat form Tambah Aset (aksi) terpisah
// dari ketiganya (`galatForm`, hanya muncul di dalam BottomSheet).
//
// `?tab=sewa` dibaca dari URL supaya entri navigasi `as-sewa`
// (`PETA_HREF_PORTAL`, `kategori/[key]/page.tsx`) mendarat LANGSUNG di tab
// Sewa, bukan menuntut satu tap lagi — `useSearchParams` memaksa render
// sisi klien, jadi dibungkus <Suspense> (pelajaran Task 29, pola sama
// `mutu/rencana/[id]/page.tsx`).
// ============================================================================

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Truck, Plus, AlertTriangle, Wrench } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { formatRupiah as fmtRupiah } from "@/lib/format";
import Link from "next/link";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespDaftarAset, RespDaftarSewa, RespAlatOperasional, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";
const VARIAN_STATUS: Record<string, VarianStatus> = {
  tersedia: "approved", dipakai: "info", perawatan: "pending", dilepas: "netral",
};
const LABEL_STATUS: Record<string, string> = {
  tersedia: "Tersedia", dipakai: "Dipakai", perawatan: "Perawatan", dilepas: "Dilepas",
};

type Tab = "register" | "sewa" | "mendesak";

export default function PmAsetPage() {
  return (
    <Suspense fallback={<SkeletonCard tinggi={120} />}>
      <IsiAsetPage />
    </Suspense>
  );
}

function IsiAsetPage() {
  const searchParams = useSearchParams();
  const tabAwal = searchParams.get("tab") === "sewa" ? "sewa" : "register";
  const [tab, setTab] = useState<Tab>(tabAwal);
  const [sheetBaru, setSheetBaru] = useState(false);
  const [form, setForm] = useState({ asset_code: "", name: "", category: "alat_berat", ownership: "milik" as "milik" | "sewa" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataAset, memuat: memuatAset, galat: galatAset } =
    useData<RespDaftarAset>(tab === "register" ? "/api/v1/assets" : null);
  const { data: dataSewa, memuat: memuatSewa, galat: galatSewa } =
    useData<RespDaftarSewa>(tab === "sewa" ? "/api/v1/asset-rentals" : null);
  const { data: dataOps, memuat: memuatOps, galat: galatOps } =
    useData<RespAlatOperasional>(tab === "mendesak" ? "/api/v1/alat-operasional" : null);

  const mendesak = useMemo(
    () => (dataOps?.alat ?? []).filter((a) => a.palingMendesak && (a.palingMendesak.jatuhTempo.status === "jatuh_tempo" || a.palingMendesak.jatuhTempo.status === "segera")),
    [dataOps],
  );

  async function buatAset() {
    if (!form.asset_code.trim() || !form.name.trim()) {
      setGalatForm("Kode dan nama aset wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/assets", form);
      setSheetBaru(false);
      setForm({ asset_code: "", name: "", category: "alat_berat", ownership: "milik" });
      invalidasi("/api/v1/assets");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan aset"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <KepalaPortal judul="Alat & Aset" />
        <button type="button" onClick={() => { setSheetBaru(true); setGalatForm(null); }}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40 }}>
          <Plus size={16} aria-hidden="true" /> Aset
        </button>
      </div>

      {dataAset && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Total</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{dataAset.meta.total}</div>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Nilai Buku</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{fmtRupiah(dataAset.meta.nilai_buku)}</div>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Perawatan</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--on-warning-bg)" }}>{dataAset.meta.perawatan}</div>
          </div>
        </div>
      )}

      <SegmentedTab
        opsi={[
          { value: "register", label: "Register" },
          { value: "sewa", label: "Sewa" },
          { value: "mendesak", label: "Perawatan" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as Tab)}
      />

      {tab === "register" && (
        <>
          {memuatAset && <SkeletonCard tinggi={120} />}
          {!memuatAset && galatAset && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat register aset" deskripsi={pesanGalat(galatAset as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatAset && !galatAset && (dataAset?.data.length ?? 0) === 0 && (
            <EmptyState icon={Truck} judul="Belum ada aset" deskripsi="Register alat perusahaan akan muncul di sini." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(dataAset?.data ?? []).map((a) => (
              <Link key={a.id} href={`/pm-portal/aset/${a.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", textDecoration: "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.asset_code} · {a.ownership === "milik" ? "Milik" : "Sewa"}</div>
                </div>
                <StatusBadge status={VARIAN_STATUS[a.status] ?? "netral"} label={LABEL_STATUS[a.status] ?? a.status} />
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === "sewa" && (
        <>
          {memuatSewa && <SkeletonCard tinggi={100} />}
          {!memuatSewa && galatSewa && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat data sewa" deskripsi={pesanGalat(galatSewa as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatSewa && !galatSewa && (dataSewa?.data.length ?? 0) === 0 && (
            <EmptyState icon={Truck} judul="Belum ada sewa" deskripsi="Alat yang disewa akan muncul di sini." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(dataSewa?.data ?? []).map((s) => (
              <div key={s.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{s.item_name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtRupiah(s.biaya_sampai_kini)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {fmtRupiah(s.rate)}/{s.rate_unit} · sejak {s.start_date}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "mendesak" && (
        <>
          {memuatOps && <SkeletonCard tinggi={100} />}
          {!memuatOps && galatOps && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat data operasional" deskripsi={pesanGalat(galatOps as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatOps && !galatOps && mendesak.length === 0 && (
            <EmptyState icon={Wrench} judul="Tidak ada yang mendesak" deskripsi="Semua jadwal perawatan masih aman." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mendesak.map((a) => (
              <Link key={a.id} href={`/pm-portal/aset/${a.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: 12, background: "var(--surface)", border: `1px solid ${a.palingMendesak!.jatuhTempo.status === "jatuh_tempo" ? "var(--danger-border)" : "var(--warning-border)"}`, textDecoration: "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.palingMendesak!.nama}</div>
                </div>
                <StatusBadge status={a.palingMendesak!.jatuhTempo.status === "jatuh_tempo" ? "rejected" : "pending"}
                  label={a.palingMendesak!.jatuhTempo.status === "jatuh_tempo" ? "Jatuh Tempo" : "Segera"} />
              </Link>
            ))}
          </div>
        </>
      )}

      <BottomSheet terbuka={sheetBaru} onTutup={() => setSheetBaru(false)} judul="Tambah Aset">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kode Aset *</span>
            <input value={form.asset_code} onChange={(e) => setForm((f) => ({ ...f, asset_code: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nama *</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kepemilikan</span>
            <Pilihan value={form.ownership} onChange={(e) => setForm((f) => ({ ...f, ownership: e.target.value as "milik" | "sewa" }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="milik">Milik</option>
              <option value="sewa">Sewa</option>
            </Pilihan>
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void buatAset()} disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
            }}>
            {mengirim ? "Menyimpan…" : "Simpan Aset"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

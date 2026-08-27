"use client";

// ============================================================================
// Rekonsiliasi Material — Portal PM (Task 25 Step 6).
//
// Per proyek (pemilih proyek). Membandingkan kebutuhan teoritis RAB dengan
// pembelian, pemakaian, sisa gudang, transfer antar proyek, dan material dari
// klien — LIMA status (`wajar`/`susut_tinggi`/`lebih_beli`/`belum_lengkap`/
// `belum_dibeli`), BUKAN biner baik/buruk (lihat komentar
// `lib/rekonsiliasi-material.ts`: `belum_dibeli` bukan `wajar` — keduanya
// "tak ada masalah" secara visual tapi beda makna; menyamakannya membuat
// baris RAB yang belum digarap terbaca "sudah diperiksa dan beres").
//
// Read-only SENGAJA — modul ini tanpa tombol tulis apa pun. Komentar route
// backend: "angka yang bisa disunting berhenti menjadi bukti pada saat
// pertama seseorang menyuntingnya — dan yang paling berkepentingan
// menyuntingnya adalah orang yang angkanya sedang menuduh."
// ============================================================================

import { useMemo, useState } from "react";
import { Scale, AlertTriangle } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { ProyekPM, RespRekonsiliasi, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS: Record<string, string> = {
  wajar: "Wajar", susut_tinggi: "Susut Tinggi", lebih_beli: "Lebih Beli",
  belum_lengkap: "Belum Lengkap", belum_dibeli: "Belum Ada Transaksi",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  wajar: "approved", susut_tinggi: "rejected", lebih_beli: "rejected",
  belum_lengkap: "pending", belum_dibeli: "netral",
};

export default function PmRekonsiliasiPage() {
  const [proyekId, setProyekId] = useState("");
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/rekonsiliasi-material` : null;
  const { data, memuat, galat } = useData<RespRekonsiliasi>(url);

  const bermasalah = useMemo(() =>
    (data?.baris ?? []).filter((b) => b.status === "susut_tinggi" || b.status === "lebih_beli" || b.status === "belum_lengkap"),
  [data]);
  const lainnya = useMemo(() =>
    (data?.baris ?? []).filter((b) => b.status === "wajar" || b.status === "belum_dibeli"),
  [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Rekonsiliasi Material</h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Scale} judul="Pilih proyek" deskripsi="Rekonsiliasi dihitung per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={100} />}
      {proyekAktif && galat && <EmptyState icon={Scale} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {data && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <div style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 45%", minWidth: 130 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Susut Keseluruhan</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{data.susut_pct_keseluruhan != null ? `${data.susut_pct_keseluruhan}%` : "—"}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 45%", minWidth: 130 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Bermasalah</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--danger)" }}>{data.jumlah_susut_tinggi + data.jumlah_lebih_beli}</div>
            </div>
          </div>

          {data.gr_belum_dikonfirmasi > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, background: "var(--warning-bg)" }}>
              <AlertTriangle size={16} color="var(--on-warning-bg)" aria-hidden="true" />
              <span style={{ fontSize: 12, color: "var(--on-warning-bg)" }}>{data.gr_belum_dikonfirmasi} penerimaan belum dikonfirmasi — belum ikut terhitung.</span>
            </div>
          )}

          {bermasalah.length > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>Perlu Perhatian</div>}
          {bermasalah.map((b) => (
            <div key={b.material_id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{b.material_name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Dibeli {b.dibeli} · Dipakai {b.dipakai} · Sisa {b.sisa}{b.susut_pct != null ? ` · Susut ${b.susut_pct}%` : ""}</div>
              </div>
              <StatusBadge status={VARIAN_STATUS[b.status]} label={LABEL_STATUS[b.status]} />
            </div>
          ))}

          {lainnya.length > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginTop: 4 }}>Lainnya</div>}
          {lainnya.map((b) => (
            <div key={b.material_id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
              <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{b.material_name}</div>
              <StatusBadge status={VARIAN_STATUS[b.status]} label={LABEL_STATUS[b.status]} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

"use client";

// ============================================================================
// Submittal — versi PM (kelola/keputusan), bukan versi mandor (ajukan).
//
// Keputusan submittal TIDAK lewat `requirePermission` biasa — ia lewat
// rantai approval (`canParticipateInChain`), diverifikasi ke
// `apps/api/src/routes/v1/submittal.ts:427-439`, POST /submittals/:id/keputusan
// dengan preHandler HANYA `authenticate`. Pola & endpoint keputusan ini SAMA
// PERSIS dengan yang sudah dipakai `pm-portal/approval/page.tsx` (Task 9) —
// body `{ keputusan: "disetujui" | "ditolak", alasan? }`.
//
// List submittal (bukan keputusannya) tetap butuh `submittal:view` biasa.
// Endpoint: GET  /api/v1/projects/:projectId/submittals
//           POST /api/v1/submittals/:id/keputusan
// ============================================================================

import { useMemo, useState } from "react";
import { FileStack } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { Submittal, ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }
interface RespSubmittal { data: Submittal[] }

const LABEL_STATUS: Record<string, string> = {
  draft: "Draft", diajukan: "Diajukan", disetujui: "Disetujui",
  ditolak: "Ditolak", revisi: "Perlu Revisi",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", diajukan: "pending", disetujui: "approved",
  ditolak: "rejected", revisi: "pending",
};

export default function PmSubmittalPage() {
  const [proyekId, setProyekId] = useState("");
  const [filter, setFilter] = useState<"diajukan" | "semua">("diajukan");
  const [dipilih, setDipilih] = useState<Submittal | null>(null);
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlSubmittal = proyekAktif
    ? `/api/v1/projects/${proyekAktif}/submittals${filter === "diajukan" ? "?status=diajukan" : ""}`
    : null;
  const { data, memuat, galat } = useData<RespSubmittal>(urlSubmittal);

  async function putuskan(keputusan: "disetujui" | "ditolak") {
    if (!dipilih) return;
    if (keputusan === "ditolak" && alasan.trim().length === 0) {
      setGalatForm("Alasan penolakan wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/submittals/${dipilih.id}/keputusan`, {
        keputusan, alasan: alasan.trim() || undefined,
      });
      setDipilih(null);
      setAlasan("");
      invalidasi(urlSubmittal ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal memutuskan submittal"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Submittal
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[{ value: "diajukan", label: "Perlu Keputusan" }, { value: "semua", label: "Semua" }]}
        aktif={filter}
        onUbah={(v) => setFilter(v as typeof filter)}
      />

      {!proyekAktif && <EmptyState icon={FileStack} judul="Pilih proyek" deskripsi="Submittal tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={90} />}
      {proyekAktif && galat && (
        <EmptyState icon={FileStack} judul="Gagal memuat submittal" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}
      {proyekAktif && !memuat && !galat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={FileStack}
          judul={filter === "diajukan" ? "Tidak ada yang perlu diputuskan" : "Belum ada submittal"}
          deskripsi={filter === "diajukan" ? "Submittal yang menunggu keputusan Anda akan muncul di sini." : "Material/shop drawing yang diajukan akan muncul di sini."}
        />
      )}
      {proyekAktif && !memuat && (data?.data ?? []).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => item.status === "diajukan" && (() => { setDipilih(item); setAlasan(""); setGalatForm(null); })()}
          disabled={item.status !== "diajukan"}
          style={{
            textAlign: "left", padding: 16, borderRadius: 16, background: "var(--surface)",
            border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
            cursor: item.status === "diajukan" ? "pointer" : "default",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.judul ?? item.nomor}</span>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {item.nomor ?? "—"}{item.jenis ? ` · ${item.jenis}` : ""}{item.revisi ? ` · Rev.${item.revisi}` : ""}
              </div>
            </div>
            <StatusBadge status={VARIAN_STATUS[item.status ?? ""] ?? "netral"} label={LABEL_STATUS[item.status ?? ""] ?? item.status ?? "—"} />
          </div>
          {item.pengaju?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Diajukan: {item.pengaju.name}</div>}
          {item.menghentikan_pekerjaan && (
            <StatusBadge status="rejected" label="Menghentikan pekerjaan" />
          )}
        </button>
      ))}

      <BottomSheet terbuka={!!dipilih} onTutup={() => setDipilih(null)} judul="Putuskan Submittal">
        {dipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{dipilih.judul ?? dipilih.nomor}</div>
            {dipilih.spesifikasi && (
              <div style={{ fontSize: 13, color: "var(--text-primary)", padding: 12, borderRadius: 12, background: "var(--surface-subtle)" }}>
                {dipilih.spesifikasi}
              </div>
            )}

            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Alasan / catatan (wajib bila menolak)
              <textarea
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={3}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }}
              />
            </label>

            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => putuskan("ditolak")} disabled={mengirim} style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                Tolak
              </button>
              <button type="button" onClick={() => putuskan("disetujui")} disabled={mengirim} style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                {mengirim ? "Memproses…" : "Setujui"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

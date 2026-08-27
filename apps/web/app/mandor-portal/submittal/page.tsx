"use client";

// ============================================================================
// Submittal Register — pengajuan material/shop drawing untuk disetujui.
//
// Endpoint NYATA (diverifikasi ke apps/api/src/routes/v1/submittal.ts):
//   GET/POST /api/v1/projects/:projectId/submittals
//
// Membuat pengajuan lewat POST membuatnya berstatus `draft`. Endpoint
// `PATCH /:id/status` (mengajukan draft → diajukan) dan keputusan lewat
// rantai approval TIDAK dipakai di sini — di luar scope form lapangan
// sederhana ini (brief Step 3 hanya minta "form ajukan material/shop
// drawing"). POST-nya sendiri membuat baris; PM/admin yang melanjutkan
// pengajuan ke status `diajukan` dari portal PM.
// ============================================================================

import { useMemo, useState } from "react";
import { FileStack, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { Penugasan, Submittal, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespAssignments { assignments: Penugasan[] }
interface RespSubmittal {
  data: Submittal[]
  meta: { menunggu: number; memblokir: number; pernah_direvisi: number }
}

const JENIS_SUBMITTAL: Array<{ value: string; label: string }> = [
  { value: "contoh_material", label: "Contoh material" },
  { value: "shop_drawing", label: "Shop drawing" },
  { value: "data_teknis", label: "Data teknis" },
  { value: "hasil_uji", label: "Hasil uji" },
  { value: "metode_kerja", label: "Metode kerja" },
];
const LABEL_JENIS: Record<string, string> = Object.fromEntries(
  JENIS_SUBMITTAL.map((j) => [j.value, j.label]),
);

/** Status: draft/diajukan/disetujui/disetujui_catatan/ditolak/dibatalkan. */
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral",
  diajukan: "pending",
  disetujui: "approved",
  disetujui_catatan: "approved",
  ditolak: "rejected",
  dibatalkan: "netral",
};
const LABEL_STATUS: Record<string, string> = {
  draft: "Draft",
  diajukan: "Diajukan",
  disetujui: "Disetujui",
  disetujui_catatan: "Disetujui dengan catatan",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};

export default function SubmittalPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [judul, setJudul] = useState("");
  const [jenis, setJenis] = useState("contoh_material");
  const [spesifikasi, setSpesifikasi] = useState("");
  const [referensiSpek, setReferensiSpek] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataAsg } = useData<RespAssignments>("/api/v1/mandor/assignments");
  const daftarProyek = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of dataAsg?.assignments ?? []) {
      if (a.project?.id) map.set(a.project.id, a.project.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [dataAsg]);

  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlSubmittal = proyekAktif ? `/api/v1/projects/${proyekAktif}/submittals` : null;
  const { data, memuat, galat } = useData<RespSubmittal>(urlSubmittal);

  async function submitPengajuan() {
    if (!proyekAktif) {
      setGalatForm("Pilih proyek terlebih dahulu.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    const hasil = await kirimLapangan(
      "POST",
      `/api/v1/projects/${proyekAktif}/submittals`,
      {
        judul: judul.trim(),
        jenis,
        spesifikasi: spesifikasi.trim() || undefined,
        referensi_spek: referensiSpek.trim() || undefined,
      },
      "Pengajuan dibuat",
      "Gagal membuat pengajuan",
    );
    setMengirim(false);
    if (!hasil.aman) {
      setGalatForm(hasil.pesan);
      return;
    }
    setSheetTerbuka(false);
    setJudul("");
    setJenis("contoh_material");
    setSpesifikasi("");
    setReferensiSpek("");
    invalidasi(`/api/v1/projects/${proyekAktif}/submittals`);
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
            style={{
              minHeight: 44, padding: "0 12px", borderRadius: 12,
              border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
              color: "var(--text-primary)",
            }}
          >
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      {data?.meta && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {data.meta.menunggu} menunggu keputusan
          {data.meta.memblokir > 0 ? ` · ${data.meta.memblokir} menghalangi pekerjaan` : ""}
        </div>
      )}

      <button
        onClick={() => setSheetTerbuka(true)}
        disabled={!proyekAktif}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: 14, borderRadius: "var(--portal-radius-pill)",
          background: "var(--grad-merek)", color: "var(--on-navy)",
          border: "none", fontSize: 14, fontWeight: 700,
          cursor: proyekAktif ? "pointer" : "default",
          opacity: proyekAktif ? 1 : 0.5,
        }}
      >
        <Plus size={18} aria-hidden="true" /> Ajukan Submittal
      </button>

      {!proyekAktif && (
        <EmptyState
          icon={FileStack}
          judul="Pilih proyek"
          deskripsi="Submittal tercatat per proyek — pilih proyek untuk melihat pengajuannya."
        />
      )}
      {proyekAktif && memuat && <SkeletonCard tinggi={90} />}
      {proyekAktif && galat && (
        <EmptyState
          icon={FileStack}
          judul="Gagal memuat submittal"
          deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}
      {proyekAktif && !memuat && !galat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={FileStack}
          judul="Belum ada pengajuan submittal"
          deskripsi="Pengajuan contoh material, shop drawing, atau metode kerja yang Anda ajukan akan muncul di sini beserta keputusan konsultan."
        />
      )}
      {proyekAktif && !memuat && (data?.data ?? []).map((item) => (
        <div
          key={item.id}
          style={{
            padding: 16, borderRadius: 16, background: "var(--surface)",
            border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.nomor ?? "—"}</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {item.judul ?? "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {LABEL_JENIS[item.jenis ?? ""] ?? item.jenis ?? "—"}
                {item.revisi && item.revisi > 0 ? ` · Revisi ${item.revisi}` : ""}
              </div>
            </div>
            <StatusBadge
              status={VARIAN_STATUS[item.status ?? ""] ?? "netral"}
              label={LABEL_STATUS[item.status ?? ""] ?? item.status ?? "—"}
            />
          </div>
          {item.catatan_reviewer && (
            <div style={{
              fontSize: 12,
              color: item.status === "ditolak" ? "var(--on-danger-bg)" : "var(--on-info-bg)",
              background: item.status === "ditolak" ? "var(--danger-bg)" : "var(--info-bg)",
              padding: "6px 10px", borderRadius: 8,
            }}>
              Catatan reviewer: {item.catatan_reviewer}
            </div>
          )}
          {item.hari_menunggu != null && item.status === "diajukan" && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Menunggu {item.hari_menunggu} hari
            </div>
          )}
        </div>
      ))}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Ajukan Submittal">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Judul pengajuan
            <input
              type="text"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="mis. Contoh keramik lantai 60x60"
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jenis
            <select
              value={jenis}
              onChange={(e) => setJenis(e.target.value)}
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            >
              {JENIS_SUBMITTAL.map((j) => (
                <option key={j.value} value={j.value}>{j.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Referensi spesifikasi (opsional)
            <input
              type="text"
              value={referensiSpek}
              onChange={(e) => setReferensiSpek(e.target.value)}
              placeholder="mis. RKS Bab 4 pasal 2"
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Spesifikasi (opsional)
            <textarea
              value={spesifikasi}
              onChange={(e) => setSpesifikasi(e.target.value)}
              rows={3}
              style={{
                width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
              }}
            />
          </label>

          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <button
            onClick={submitPengajuan}
            disabled={mengirim || !judul.trim()}
            style={{
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
              opacity: mengirim || !judul.trim() ? 0.5 : 1,
            }}
          >
            {mengirim ? "Mengirim…" : "Ajukan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

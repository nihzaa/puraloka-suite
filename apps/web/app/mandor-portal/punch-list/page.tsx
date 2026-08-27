"use client";

// ============================================================================
// Punch List — daftar temuan cacat/kekurangan pekerjaan per proyek.
//
// Endpoint NYATA (diverifikasi ke apps/api/src/routes/v1/punch-list.ts):
//   GET/POST /api/v1/projects/:projectId/punch-items   (bukan flat
//   `/api/v1/punch-items` seperti pola K3 — modul ini SELALU project-scoped,
//   tak punya versi lintas-proyek).
//
// Mandor punya `punch:manage` (mencatat + menugaskan), TAPI TIDAK
// `punch:verify` — menutup temuan (status → `ditutup`) ditolak API 403 untuk
// mandor. Form di sini karena itu hanya mencatat temuan baru; tak ada tombol
// "tutup"/"verifikasi".
// ============================================================================

import { useMemo, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { Penugasan, PunchItem, Tukang, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespAssignments { assignments: Penugasan[] }
interface RespPunch { data: PunchItem[]; meta: { belum_selesai: number; total: number } }
interface RespWorkers { workers: Tukang[] }

/** Status: terbuka/dikerjakan/menunggu_cek/ditutup/ditolak. */
const VARIAN_STATUS: Record<string, VarianStatus> = {
  terbuka: "pending",
  dikerjakan: "pending",
  menunggu_cek: "pending",
  ditutup: "approved",
  ditolak: "rejected",
};

const LABEL_STATUS: Record<string, string> = {
  terbuka: "Terbuka",
  dikerjakan: "Dikerjakan",
  menunggu_cek: "Menunggu cek",
  ditutup: "Ditutup",
  ditolak: "Ditolak",
};

const LABEL_SEVERITY: Record<string, string> = {
  ringan: "Ringan",
  sedang: "Sedang",
  berat: "Berat",
  kritis: "Kritis",
};

const FILTER_STATUS = [
  { value: "semua", label: "Semua" },
  { value: "terbuka", label: "Terbuka" },
  { value: "dikerjakan", label: "Dikerjakan" },
  { value: "ditutup", label: "Ditutup" },
];

export default function PunchListPage() {
  const [proyekId, setProyekId] = useState("");
  const [filter, setFilter] = useState("semua");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [severity, setSeverity] = useState("sedang");
  const [ditugaskanKe, setDitugaskanKe] = useState("");
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

  const urlPunch = proyekAktif
    ? `/api/v1/projects/${proyekAktif}/punch-items${filter !== "semua" ? `?status=${filter}` : ""}`
    : null;
  const { data, memuat, galat } = useData<RespPunch>(urlPunch);

  const { data: dataWorkers } = useData<RespWorkers>(
    sheetTerbuka ? "/api/v1/mandor/workers" : null,
  );

  async function submitTemuan() {
    if (!proyekAktif) {
      setGalatForm("Pilih proyek terlebih dahulu.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    const hasil = await kirimLapangan(
      "POST",
      `/api/v1/projects/${proyekAktif}/punch-items`,
      {
        judul: judul.trim(),
        deskripsi: deskripsi.trim() || undefined,
        lokasi: lokasi.trim() || undefined,
        severity,
        ditugaskan_ke: ditugaskanKe || undefined,
      },
      "Temuan dicatat",
      "Gagal mencatat temuan",
    );
    setMengirim(false);
    if (!hasil.aman) {
      setGalatForm(hasil.pesan);
      return;
    }
    setSheetTerbuka(false);
    setJudul("");
    setDeskripsi("");
    setLokasi("");
    setSeverity("sedang");
    setDitugaskanKe("");
    invalidasi(`/api/v1/projects/${proyekAktif}/punch-items`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Punch List" />

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

      <SegmentedTab opsi={FILTER_STATUS} aktif={filter} onUbah={setFilter} />

      {data?.meta && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {data.meta.belum_selesai} belum selesai dari {data.meta.total} temuan
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
        <Plus size={18} aria-hidden="true" /> Catat Temuan
      </button>

      {!proyekAktif && (
        <EmptyState
          icon={ClipboardCheck}
          judul="Pilih proyek"
          deskripsi="Punch list tercatat per proyek — pilih proyek untuk melihat temuannya."
        />
      )}
      {proyekAktif && memuat && <SkeletonCard tinggi={90} />}
      {proyekAktif && galat && (
        <EmptyState
          icon={ClipboardCheck}
          judul="Gagal memuat punch list"
          deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}
      {proyekAktif && !memuat && !galat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          judul="Belum ada temuan"
          deskripsi="Temuan cacat atau kekurangan pekerjaan yang Anda catat akan muncul di sini beserta status perbaikannya."
        />
      )}
      {proyekAktif && !memuat && (data?.data ?? []).map((item) => (
        <div
          key={item.id}
          style={{
            padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)",
            border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.nomor ?? "—"}</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {item.judul ?? "—"}
              </div>
              {item.lokasi && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.lokasi}</div>
              )}
            </div>
            <StatusBadge
              status={VARIAN_STATUS[item.status ?? ""] ?? "netral"}
              label={LABEL_STATUS[item.status ?? ""] ?? item.status ?? "—"}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {item.severity && (
              <StatusBadge
                status={item.severity === "kritis" || item.severity === "berat" ? "rejected" : "info"}
                label={LABEL_SEVERITY[item.severity] ?? item.severity}
              />
            )}
            {item.petugas?.name && (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Ditugaskan: {item.petugas.name}</span>
            )}
          </div>
          {item.deskripsi && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.deskripsi}</div>
          )}
          {item.status === "ditolak" && item.alasan_penolakan && (
            <div style={{ fontSize: 12, color: "var(--on-danger-bg)", background: "var(--danger-bg)", padding: "6px 10px", borderRadius: 8 }}>
              Alasan ditolak: {item.alasan_penolakan}
            </div>
          )}
        </div>
      ))}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Catat Temuan Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Judul temuan
            <input
              type="text"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="mis. Keramik retak di lantai 2"
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Lokasi
            <input
              type="text"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tingkat keparahan
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            >
              <option value="ringan">Ringan</option>
              <option value="sedang">Sedang</option>
              <option value="berat">Berat</option>
              <option value="kritis">Kritis</option>
            </select>
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tugaskan ke tukang (opsional)
            <select
              value={ditugaskanKe}
              onChange={(e) => setDitugaskanKe(e.target.value)}
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            >
              <option value="">— Belum ditentukan —</option>
              {(dataWorkers?.workers ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Deskripsi (opsional)
            <textarea
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              rows={3}
              style={{
                width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
              }}
            />
          </label>

          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <button
            onClick={submitTemuan}
            disabled={mengirim || !judul.trim()}
            style={{
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
              opacity: mengirim || !judul.trim() ? 0.5 : 1,
            }}
          >
            {mengirim ? "Mengirim…" : "Catat Temuan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

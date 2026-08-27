"use client";

// ============================================================================
// Punch List — versi PM (verifikasi), bukan versi mandor (lapor/kerjakan).
//
// PM lihat SEMUA temuan proyek (bukan cuma yang dia laporkan) dan berperan
// sebagai VERIFIKATOR: menutup (`punch:verify`, terpisah dari `punch:manage`
// — diverifikasi ke `apps/api/src/routes/v1/punch-list.ts:316-336`) atau
// menolak hasil perbaikan. Transisi yang PM lakukan dari halaman ini hanya
// dari status `menunggu_cek`:
//   menunggu_cek -> ditutup   (butuh punch:verify, DAN bukan penemu/pelaksana)
//   menunggu_cek -> ditolak   (butuh alasan_penolakan, balik ke `dikerjakan`)
// Endpoint: GET /api/v1/projects/:projectId/punch-items?status=menunggu_cek
//           PATCH /api/v1/punch-items/:id/status
// ============================================================================

import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { PunchItem, ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }
interface RespPunch { data: PunchItem[] }

const LABEL_STATUS: Record<string, string> = {
  terbuka: "Terbuka",
  dikerjakan: "Dikerjakan",
  menunggu_cek: "Menunggu Verifikasi",
  ditutup: "Ditutup",
  ditolak: "Ditolak",
};

const VARIAN_STATUS: Record<string, VarianStatus> = {
  terbuka: "netral",
  dikerjakan: "pending",
  menunggu_cek: "pending",
  ditutup: "approved",
  ditolak: "rejected",
};

export default function PmPunchListPage() {
  const [proyekId, setProyekId] = useState("");
  const [filter, setFilter] = useState<"menunggu_cek" | "semua">("menunggu_cek");
  const [dipilih, setDipilih] = useState<PunchItem | null>(null);
  const [alasanTolak, setAlasanTolak] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlPunch = proyekAktif
    ? `/api/v1/projects/${proyekAktif}/punch-items${filter === "menunggu_cek" ? "?status=menunggu_cek" : ""}`
    : null;
  const { data, memuat, galat } = useData<RespPunch>(urlPunch);

  function bukaAksi(item: PunchItem) {
    setDipilih(item);
    setAlasanTolak("");
    setGalatForm(null);
  }

  async function ubahStatus(status: "ditutup" | "ditolak") {
    if (!dipilih) return;
    if (status === "ditolak" && alasanTolak.trim().length === 0) {
      setGalatForm("Alasan penolakan wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/punch-items/${dipilih.id}/status`, {
        status,
        ...(status === "ditolak" ? { alasan_penolakan: alasanTolak.trim() } : {}),
      });
      setDipilih(null);
      invalidasi(urlPunch ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, `Gagal ${status === "ditutup" ? "menutup" : "menolak"} temuan`));
    } finally {
      setMengirim(false);
    }
  }

  const isPelaksanaSendiri = dipilih?.ditugaskan_ke != null; // penanda visual saja — gerbang sebenarnya di backend

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Punch List" />

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
        opsi={[
          { value: "menunggu_cek", label: "Perlu Verifikasi" },
          { value: "semua", label: "Semua" },
        ]}
        aktif={filter}
        onUbah={(v) => setFilter(v as typeof filter)}
      />

      {!proyekAktif && <EmptyState icon={ClipboardCheck} judul="Pilih proyek" deskripsi="Temuan punch list tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={90} />}
      {proyekAktif && galat && (
        <EmptyState icon={ClipboardCheck} judul="Gagal memuat temuan" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}
      {proyekAktif && !memuat && !galat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          judul={filter === "menunggu_cek" ? "Tidak ada yang perlu diverifikasi" : "Belum ada temuan"}
          deskripsi={filter === "menunggu_cek" ? "Temuan yang sudah diperbaiki dan menunggu verifikasi Anda akan muncul di sini." : "Temuan cacat/kekurangan pekerjaan akan muncul di sini."}
        />
      )}
      {proyekAktif && !memuat && (data?.data ?? []).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => item.status === "menunggu_cek" && bukaAksi(item)}
          disabled={item.status !== "menunggu_cek"}
          style={{
            textAlign: "left", padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)",
            border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
            cursor: item.status === "menunggu_cek" ? "pointer" : "default",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.judul ?? item.nomor ?? "Temuan"}</span>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {item.nomor ?? "—"}{item.lokasi ? ` · ${item.lokasi}` : ""}
              </div>
            </div>
            <StatusBadge status={VARIAN_STATUS[item.status ?? ""] ?? "netral"} label={LABEL_STATUS[item.status ?? ""] ?? item.status ?? "—"} />
          </div>
          {item.deskripsi && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.deskripsi}</div>}
          {item.petugas?.name && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Dikerjakan: {item.petugas.name}</div>
          )}
        </button>
      ))}

      <BottomSheet terbuka={!!dipilih} onTutup={() => setDipilih(null)} judul="Verifikasi Temuan">
        {dipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{dipilih.judul ?? dipilih.nomor}</div>
            {dipilih.deskripsi && (
              <div style={{ fontSize: 13, color: "var(--text-primary)", padding: 12, borderRadius: 12, background: "var(--surface-subtle)" }}>
                {dipilih.deskripsi}
              </div>
            )}
            {dipilih.petugas?.name && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Pelaksana perbaikan: {dipilih.petugas.name}</div>
            )}

            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Alasan penolakan (wajib bila menolak)
              <textarea
                value={alasanTolak}
                onChange={(e) => setAlasanTolak(e.target.value)}
                rows={3}
                placeholder="Kenapa perbaikan ini belum diterima?"
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }}
              />
            </label>

            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => ubahStatus("ditolak")}
                disabled={mengirim}
                style={{
                  flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                  background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)",
                  fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
                }}
              >
                Tolak
              </button>
              <button
                type="button"
                onClick={() => ubahStatus("ditutup")}
                disabled={mengirim}
                style={{
                  flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                  background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
                  fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
                }}
              >
                {mengirim ? "Memproses…" : "Verifikasi & Tutup"}
              </button>
            </div>
            {isPelaksanaSendiri && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Catatan: penutupan ditolak server bila Anda adalah pelaksana yang ditugaskan pada temuan ini.
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

"use client";

// ============================================================================
// NCR (Non-Conformance Report) — register lengkap, versi PM.
//
// PM py SELURUH capability (Task 27 Step 1, diverifikasi ulang Task 29 dari
// `apps/api/src/routes/v1/ncr.ts`): ncr:view, ncr:manage, ncr:disposisi,
// ncr:verify — TIDAK ADA yang disembunyikan berdasar permission (beda dari
// procurement Task 24 yang menyembunyikan override-kuota). Yang tetap dijaga
// UI: pelapor tak boleh menutup NCR-nya sendiri (SoD, ditegakkan backend
// `ncr.ts` PATCH `/status`) — diperiksa di halaman DETAIL (`[id]/page.tsx`),
// bukan di sini.
//
// Endpoint: GET  /api/v1/projects/:projectId/ncr?status=&severity=
//           POST /api/v1/projects/:projectId/ncr
//
// Lingkup Task 29: form buat NCR di bawah TIDAK menyertakan alur "dari
// kandidat inspeksi gagal" (`GET /ncr/kandidat`) — itu alur SEKUNDER
// (mengusulkan, bukan wajib) yang menuntut daftar inspeksi terpisah + state
// penautan (`inspection_request_id`) di form yang sama. Ditunda ke iterasi
// berikutnya (bukan diam-diam dilewati) — tipe respons (`RespKandidatNcr`,
// `_bersama/tipe.ts`) sudah disiapkan supaya perluasannya tak perlu riset
// ulang field.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileWarning, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { NcrItem, RespNcrDaftar, ProyekPM, GalatApi, RespIkhtisarMutu } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS: Record<string, string> = {
  terbuka: "Terbuka", disposisi: "Disposisi", perbaikan: "Perbaikan",
  verifikasi: "Verifikasi", ditutup: "Ditutup", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  terbuka: "netral", disposisi: "pending", perbaikan: "pending",
  verifikasi: "pending", ditutup: "approved", dibatalkan: "rejected",
};
const LABEL_SEVERITY: Record<string, string> = { minor: "Minor", major: "Major", kritis: "Kritis" };
const VARIAN_SEVERITY: Record<string, VarianStatus> = { minor: "netral", major: "pending", kritis: "rejected" };

export default function PmNcrPage() {
  const [proyekId, setProyekId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"belum_selesai" | "semua">("belum_selesai");
  const [sheetBuat, setSheetBuat] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlNcr = proyekAktif ? `/api/v1/projects/${proyekAktif}/ncr` : null;
  const { data, memuat, galat } = useData<RespNcrDaftar>(urlNcr);
  const { data: dataIkhtisar } = useData<RespIkhtisarMutu>("/api/v1/mutu/ikhtisar");

  const daftarTampil = (data?.data ?? []).filter(
    (n) => filterStatus === "semua" || (n.status !== "ditutup" && n.status !== "dibatalkan"),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <KepalaPortal judul="NCR" />
        {proyekAktif && (
          <button type="button" onClick={() => setSheetBuat(true)} aria-label="Catat ketidaksesuaian baru"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={16} aria-hidden="true" /> NCR
          </button>
        )}
      </div>

      {dataIkhtisar && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 14, background: "var(--surface-subtle)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{dataIkhtisar.ncr.terbuka}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>NCR terbuka</div>
          </div>
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 14, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--on-danger-bg)" }}>{dataIkhtisar.ncr.berat}</div>
            <div style={{ fontSize: 11, color: "var(--on-danger-bg)" }}>Berat/major</div>
          </div>
        </div>
      )}

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[{ value: "belum_selesai", label: "Belum Selesai" }, { value: "semua", label: "Semua" }]}
        aktif={filterStatus}
        onUbah={(v) => setFilterStatus(v as typeof filterStatus)}
      />

      {!proyekAktif && <EmptyState icon={FileWarning} judul="Pilih proyek" deskripsi="NCR tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={90} />}
      {proyekAktif && galat && <EmptyState icon={FileWarning} judul="Gagal memuat NCR" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {proyekAktif && !memuat && !galat && daftarTampil.length === 0 && (
        <EmptyState icon={FileWarning} judul={filterStatus === "belum_selesai" ? "Tidak ada NCR terbuka" : "Belum ada NCR"} deskripsi="Ketidaksesuaian pekerjaan terhadap spesifikasi akan tercatat di sini." />
      )}
      {proyekAktif && !memuat && daftarTampil.map((n: NcrItem) => (
        <Link key={n.id} href={`/pm-portal/mutu/ncr/${n.id}?proyek=${proyekAktif}`}
          style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{n.nomor}</span>
              <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{n.judul}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <StatusBadge status={VARIAN_STATUS[n.status] ?? "netral"} label={LABEL_STATUS[n.status] ?? n.status} />
              <StatusBadge status={VARIAN_SEVERITY[n.severity] ?? "netral"} label={LABEL_SEVERITY[n.severity] ?? n.severity} />
            </div>
          </div>
          {n.lokasi && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{n.lokasi}</div>}
          {n.petugas?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Ditugaskan: {n.petugas.name}</div>}
        </Link>
      ))}

      <SheetBuatNcr terbuka={sheetBuat} onTutup={() => setSheetBuat(false)} proyekId={proyekAktif} urlList={urlNcr} />
    </div>
  );
}

function SheetBuatNcr({ terbuka, onTutup, proyekId, urlList }: { terbuka: boolean; onTutup: () => void; proyekId: string; urlList: string | null }) {
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [severity, setSeverity] = useState<"minor" | "major" | "kritis">("minor");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!judul.trim()) { setGalat("Judul wajib diisi."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${proyekId}/ncr`, {
        judul: judul.trim(), deskripsi: deskripsi.trim() || undefined,
        lokasi: lokasi.trim() || undefined, severity,
      });
      if (urlList) invalidasi(urlList);
      setJudul(""); setDeskripsi(""); setLokasi(""); setSeverity("minor"); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal mencatat NCR"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Catat Ketidaksesuaian Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Judul
          <input value={judul} onChange={(e) => setJudul(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Deskripsi
          <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={3}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Lokasi
          <input value={lokasi} onChange={(e) => setLokasi(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Tingkat keparahan</span>
          <SegmentedTab
            opsi={[{ value: "minor", label: "Minor" }, { value: "major", label: "Major" }, { value: "kritis", label: "Kritis" }]}
            aktif={severity}
            onUbah={(v) => setSeverity(v as typeof severity)}
          />
        </div>
        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Catat NCR"}
        </button>
      </div>
    </BottomSheet>
  );
}

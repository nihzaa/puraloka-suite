"use client";

// ============================================================================
// Rencana Mutu Proyek — list. Persetujuan RMP TIDAK bisa ditombol dari
// halaman ini (Task 27 Temuan #1) — PM py `ncr:manage` (buat+ajukan) TAPI
// TIDAK py `mutu:rmp:approve` (hanya admin/direktur, diverifikasi LIVE
// migrasi 280 Task 30 Step 8: nol baris `role_permissions` untuk pm).
// Tombol "Ajukan" tetap ada (halaman DETAIL, `[id]/page.tsx`); tombol
// "Setujui" TIDAK ADA di mana pun di portal PM — itu tugas inbox approval
// terpusat (`pm-portal/approval/page.tsx`, Task 30 Step 6), dan PM tetap
// tak bisa mengeksekusinya di sana karena `canParticipateInChain` backend
// sudah menyaring baris `rencana_mutu` keluar dari inbox PM (dibuktikan
// live: rantai persetujuannya satu langkah, syaratnya `mutu:rmp:approve`,
// dan PM nol baris untuk permission itu).
//
// Endpoint: GET  /api/v1/projects/:projectId/rencana-mutu
//           POST /api/v1/projects/:projectId/rencana-mutu
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RencanaMutu, RespRencanaMutuDaftar, ProyekPM, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS: Record<string, string> = {
  draf: "Draf", diajukan: "Diajukan", disetujui: "Disetujui", kedaluwarsa: "Kedaluwarsa",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draf: "netral", diajukan: "pending", disetujui: "approved", kedaluwarsa: "rejected",
};

export default function PmRencanaMutuPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetBuat, setSheetBuat] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlRmp = proyekAktif ? `/api/v1/projects/${proyekAktif}/rencana-mutu` : null;
  const { data, memuat, galat } = useData<RespRencanaMutuDaftar>(urlRmp);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Rencana Mutu Proyek</h1>
        {proyekAktif && (
          <button type="button" onClick={() => setSheetBuat(true)} aria-label="Buat rencana mutu baru"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={16} aria-hidden="true" /> RMP
          </button>
        )}
      </div>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={BadgeCheck} judul="Pilih proyek" deskripsi="Rencana mutu tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={80} />}
      {proyekAktif && galat && <EmptyState icon={BadgeCheck} judul="Gagal memuat rencana mutu" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {proyekAktif && !memuat && !galat && (data?.rencana?.length ?? 0) === 0 && (
        <EmptyState icon={BadgeCheck} judul="Belum ada rencana mutu" deskripsi="Dokumen mutu yang disepakati di awal proyek akan muncul di sini." />
      )}
      {proyekAktif && !memuat && (data?.rencana ?? []).map((r: RencanaMutu) => (
        <Link key={r.id} href={`/pm-portal/mutu/rencana/${r.id}?proyek=${proyekAktif}`}
          style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{r.nomor}</span>
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{r.judul} · Rev.{r.revisi}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[r.status] ?? "netral"} label={LABEL_STATUS[r.status] ?? r.status} />
          </div>
          {r.pj?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>PJ: {r.pj.name}</div>}
        </Link>
      ))}

      <SheetBuatRmp terbuka={sheetBuat} onTutup={() => setSheetBuat(false)} proyekId={proyekAktif} urlList={urlRmp} />
    </div>
  );
}

function SheetBuatRmp({ terbuka, onTutup, proyekId, urlList }: { terbuka: boolean; onTutup: () => void; proyekId: string; urlList: string | null }) {
  const [nomor, setNomor] = useState("");
  const [judul, setJudul] = useState("");
  const [standarAcuan, setStandarAcuan] = useState("");
  const [sasaranMutu, setSasaranMutu] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!nomor.trim() || !judul.trim()) { setGalat("Nomor dan judul wajib diisi."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${proyekId}/rencana-mutu`, {
        nomor: nomor.trim(), judul: judul.trim(),
        standar_acuan: standarAcuan.trim() || undefined, sasaran_mutu: sasaranMutu.trim() || undefined,
      });
      if (urlList) invalidasi(urlList);
      setNomor(""); setJudul(""); setStandarAcuan(""); setSasaranMutu(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat rencana mutu"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Rencana Mutu Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nomor dokumen
          <input value={nomor} onChange={(e) => setNomor(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Judul
          <input value={judul} onChange={(e) => setJudul(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Standar acuan
          <input value={standarAcuan} onChange={(e) => setStandarAcuan(e.target.value)} placeholder="mis. SNI, ISO 9001"
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Sasaran mutu
          <textarea value={sasaranMutu} onChange={(e) => setSasaranMutu(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Buat Rencana Mutu"}
        </button>
      </div>
    </BottomSheet>
  );
}

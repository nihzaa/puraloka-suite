"use client";

// ============================================================================
// Dokumen Proyek — versi PM.
//
// Diverifikasi ke `apps/api/src/routes/v1/documents.ts`: TIDAK ADA endpoint
// lintas-proyek. Hanya `GET /api/v1/projects/:projectId/documents` — jadi
// pemilih proyek WAJIB, bukan opsional seperti modul lain yang punya
// alternatif lintas-proyek.
// ============================================================================

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { DokumenProyek, ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }
interface RespDokumen { data: DokumenProyek[] }

export default function PmDokumenPage() {
  const [proyekId, setProyekId] = useState("");
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlDokumen = proyekAktif ? `/api/v1/projects/${proyekAktif}/documents` : null;
  const { data, memuat, galat } = useData<RespDokumen>(urlDokumen);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Dokumen Proyek
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

      {!proyekAktif && <EmptyState icon={FileText} judul="Pilih proyek" deskripsi="Dokumen (kontrak, SPK, gambar kerja) tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={70} />}
      {proyekAktif && galat && (
        <EmptyState icon={FileText} judul="Gagal memuat dokumen" deskripsi={pesanGalat(galat as GalatApi, "Coba lagi.")} />
      )}
      {proyekAktif && !memuat && !galat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={FileText} judul="Belum ada dokumen" deskripsi="Dokumen kontrak/SPK proyek ini akan muncul di sini." />
      )}
      {proyekAktif && !memuat && (data?.data ?? []).map((doc) => (
        <a
          key={doc.id}
          href={doc.file_url ?? "#"}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: 14,
            borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <FileText size={20} color="var(--navy)" aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{doc.title ?? "Dokumen"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {doc.doc_type ?? "—"}{doc.revisi ? ` · Rev.${doc.revisi}` : ""}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

"use client";

// ============================================================================
// Analisa Keterlambatan — Portal Admin/Direktur (Task 11, Tahap 2).
// COMPANY-WIDE: `GET /api/v1/analisa-keterlambatan` TANPA `project_id` sudah
// lintas seluruh proyek tenant (`analisa-keterlambatan.ts`, riset Task 6) —
// PM Portal SUDAH memakainya company-wide by default (proyekId kosong =
// "Semua proyek"). Salinan HAMPIR langsung dari
// `pm-portal/kontrak-lengkap/keterlambatan/page.tsx`, hanya beda kepala
// berkas + daftar proyek tanpa filter `.pm` (lihat di bawah) + format
// tanggal/rupiah lewat `@/lib/format` (BUKAN `Intl`/`toLocaleDateString`
// langsung seperti sumber PM — pola wajib repo ini, lihat `lib/format.ts`).
//
// GET /api/v1/analisa-keterlambatan?project_id=  — projects:view, READ-ONLY.
//
// Kenapa read-only (komentar route asli, apps/api/src/routes/v1/
// analisa-keterlambatan.ts): "Angka yang bisa disunting berhenti jadi
// dasar apa pun — dan yang paling berkepentingan menyuntingnya adalah
// pihak yang sedang dituduh terlambat." Tidak ada tombol tulis di
// halaman ini sama sekali.
// ============================================================================

import { useState } from "react";
import { AlarmClock } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { ProyekPM, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek { projects: ProyekPM[] }

/** Bentuk `BarisAnalisa`, `apps/api/src/lib/analisa-keterlambatan.ts:75-105`. */
interface BarisAnalisa {
  milestone_id: string;
  project_id: string;
  project_name: string;
  title: string;
  target_date: string;
  completed_at: string | null;
  telat_kotor: number;
  eot_hari: number;
  telat_efektif: number;
  status: "tepat_waktu" | "belum_jatuh_tempo" | "selesai_terlambat" | "berjalan_terlambat" | "dimaafkan_eot";
  estimasi_paparan: number | null;
  kena_cap: boolean;
  masih_bertambah: boolean;
}

/** Bentuk `HasilAnalisa`, `apps/api/src/lib/analisa-keterlambatan.ts:107-125`. */
interface RespAnalisaKeterlambatan {
  baris: BarisAnalisa[];
  jumlah_selesai_terlambat: number;
  jumlah_berjalan_terlambat: number;
  jumlah_dimaafkan_eot: number;
  jumlah_tepat_waktu: number;
  jumlah_belum_jatuh_tempo: number;
  telat_terparah: number;
  total_estimasi_paparan: number;
  jumlah_proyek_denda_mati: number;
}

const LABEL_STATUS: Record<string, string> = {
  tepat_waktu: "Tepat Waktu", belum_jatuh_tempo: "Belum Jatuh Tempo",
  selesai_terlambat: "Selesai Terlambat", berjalan_terlambat: "Berjalan Terlambat", dimaafkan_eot: "Dimaafkan EOT",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  tepat_waktu: "approved", belum_jatuh_tempo: "netral",
  selesai_terlambat: "rejected", berjalan_terlambat: "rejected", dimaafkan_eot: "info",
};

export default function AdminAnalisaKeterlambatanPage() {
  const [proyekId, setProyekId] = useState("");
  // Company-wide — TANPA filter `.pm`, beda dari versi PM (pola Task 7/9/10).
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = dataProyek?.projects ?? [];

  const url = proyekId ? `/api/v1/analisa-keterlambatan?project_id=${proyekId}` : "/api/v1/analisa-keterlambatan";
  const { data, memuat, galat } = useData<RespAnalisaKeterlambatan>(url);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Analisa Keterlambatan" />

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
        <Pilihan
          value={proyekId}
          onChange={(e) => setProyekId(e.target.value)}
          style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        >
          <option value="">Semua proyek</option>
          {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Pilihan>
      </label>

      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={AlarmClock} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Berjalan Terlambat", value: String(data.jumlah_berjalan_terlambat), warna: "var(--danger)" },
            { label: "Telat Terparah (hari)", value: String(data.telat_terparah), warna: "var(--warning)" },
            { label: "Estimasi Paparan", value: formatRupiah(data.total_estimasi_paparan), warna: "var(--navy)" },
          ].map((k) => (
            <div key={k.label} style={{ flex: "1 1 30%", padding: "var(--pad-kartu)", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.warna }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k.label}</div>
            </div>
          ))}
          {/* Rp0 tak boleh terbaca "tak ada risiko" — sebagian proyek dendanya memang mati (lib analisa-keterlambatan.ts). Dinyatakan, bukan disembunyikan. */}
          {data.jumlah_proyek_denda_mati > 0 && (
            <div style={{ flex: "1 1 100%", fontSize: 11, color: "var(--text-secondary)" }}>
              {data.jumlah_proyek_denda_mati} proyek punya milestone telat tapi dendanya tidak aktif — estimasi paparan di atas TIDAK mencakupnya.
            </div>
          )}
        </div>
      )}

      {!memuat && (data?.baris?.length ?? 0) === 0 && (
        <EmptyState icon={AlarmClock} judul="Tidak ada keterlambatan" deskripsi="Seluruh milestone tepat waktu atau belum jatuh tempo." />
      )}

      {!memuat && data?.baris.map((b) => (
        <div key={b.milestone_id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{b.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{b.project_name}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[b.status] ?? "netral"} label={LABEL_STATUS[b.status] ?? b.status} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Target: {formatTanggal(b.target_date)}{b.completed_at && ` · Selesai: ${formatTanggal(b.completed_at)}`}
          </div>
          {b.telat_efektif > 0 && (
            <div style={{ fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>
              Telat {b.telat_efektif} hari{b.masih_bertambah ? " (masih berjalan)" : ""}
              {b.telat_kotor !== b.telat_efektif && ` · kotor ${b.telat_kotor} hari, EOT ${b.eot_hari} hari`}
            </div>
          )}
          {b.estimasi_paparan !== null && (
            <div style={{ fontSize: 13, color: "var(--warning)" }}>
              Estimasi paparan: {formatRupiah(b.estimasi_paparan)}{b.kena_cap ? " (menyentuh batas)" : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

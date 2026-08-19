"use client";

// ============================================================================
// Laporan Upah Mingguan — daftar ringkas ekspansif (accordion), read-only.
//
// Restyle F7d (2026-08-20): warna-ui → token CSS, badge status → StatusBadge,
// kosong/loading → EmptyState/SkeletonCard. Halaman ini hanya baca — beda
// dari `laporan-upah/page.tsx` yang juga punya form kirim laporan baru.
// ============================================================================

import { useState } from "react";
import { useData } from "@/lib/data-cache";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Tabel } from "@/components/dasar";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import { type LaporanUpah, type GalatApi, pesanGalat } from "../_bersama/tipe";

/** Satu baris upah pekerja di dalam laporan mingguan. */
interface WageItem {
  id: string;
  worker?: { name?: string } | null;
  days_worked?: number | null;
  daily_rate: number;
}

/** Bentuk lengkap satu laporan, dengan item upah — `LaporanUpah` bersama
 *  tak menyertakan `wage_items`/`total_amount`/`notes` karena hanya
 *  dipakai di sini.
 *
 *  `notes` (catatan mandor saat mengirim) dan `review_notes` (alasan
 *  reviewer) adalah DUA KOLOM BERBEDA — dikonfirmasi ke `mandor.ts`
 *  (`notes` diisi di POST baris 1386, `review_notes` diisi di PATCH
 *  status baris 1477). Versi sebelumnya memakai `r.notes` (lewat `any`)
 *  untuk kedua tempat, termasuk sebagai "alasan ditolak" — salah field,
 *  karena `notes` adalah catatan MANDOR sendiri, bukan alasan penolakan
 *  reviewer. Diperbaiki di sini. */
interface LaporanDenganItem extends LaporanUpah {
  wage_items?: WageItem[];
  total_amount?: number | null;
  notes?: string | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral",
  submitted: "pending",
  approved: "approved",
  rejected: "rejected",
  paid: "approved",
};

const LABEL_STATUS: Record<string, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  approved: "Disetujui",
  rejected: "Ditolak",
  paid: "Dibayar",
};

export default function MandorLaporanPage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16 — halaman ini
  // hanya baca, tak ada tulis lapangan, jadi tak ada cache offline yang
  // perlu dipertahankan.
  const { data, memuat: loading, galat: galatMuat } = useData<{ reports: LaporanDenganItem[] }>("/api/v1/mandor/wage-reports");
  const reports = data?.reports ?? [];

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Laporan Upah Mingguan
      </h1>

      {loading && (
        <>
          <SkeletonCard tinggi={80} />
          <SkeletonCard tinggi={80} />
        </>
      )}

      {!loading && galatMuat && (
        <EmptyState
          icon={AlertCircle}
          judul="Gagal memuat laporan upah"
          deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {!loading && !galatMuat && reports.length === 0 && (
        <EmptyState
          icon={AlertCircle}
          judul="Belum ada laporan upah"
          deskripsi="Laporan upah mingguan yang sudah dikirim akan muncul di sini, lengkap dengan rincian per pekerja."
        />
      )}

      {!loading && !galatMuat && reports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reports.map((r) => {
            const isOpen = expanded[r.id] ?? false;
            const items: WageItem[] = r.wage_items ?? [];
            const totalWage = items.reduce((s, i) => s + (i.daily_rate * (i.days_worked ?? 1)), 0) || Number(r.total_amount ?? 0);

            return (
              <div
                key={r.id}
                style={{
                  background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-expanded={isOpen}
                  style={{
                    width: "100%", minHeight: 44, padding: 16, display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 8, background: "none", border: "none",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                        {fmtDate(r.week_start ?? null)} – {fmtDate(r.week_end ?? null)}
                      </span>
                      <StatusBadge
                        status={VARIAN_STATUS[r.status ?? ""] ?? "netral"}
                        label={LABEL_STATUS[r.status ?? ""] ?? (r.status ?? "—")}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                      <span>{r.assignment?.project?.name ?? "—"}</span>
                      <span style={{ fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(Number(r.total_amount ?? totalWage))}
                      </span>
                      {items.length > 0 && <span>{items.length} pekerja</span>}
                    </div>
                  </div>
                  {isOpen
                    ? <ChevronUp size={18} color="var(--text-secondary)" aria-hidden="true" />
                    : <ChevronDown size={18} color="var(--text-secondary)" aria-hidden="true" />}
                </button>

                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: 16 }}>
                    {r.notes && (
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px", fontStyle: "italic" }}>
                        {r.notes}
                      </p>
                    )}

                    {items.length > 0 ? (
                      /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption,
                         scope="row", tabular-nums, dan overflow-x sekarang
                         dijamin komponen — empat hal yang tabel mentah harus
                         ingat sendiri, dan yang riwayat repo ini tunjukkan
                         TIDAK diingat. Baris totalnya pindah ke <tfoot>: di
                         <tbody> ia terbaca sebagai data biasa. */
                      <Tabel<WageItem>
                        berpermukaan
                        caption="Rincian upah per pekerja untuk laporan minggu ini: hari kerja, upah harian, dan jumlah yang diterima masing-masing."
                        data={items}
                        kunciBaris={(i) => i.id}
                        kolom={[
                          { kunci: "pekerja", judul: "Pekerja", kepalaBaris: true,
                            render: (i) => i.worker?.name ?? "—" },
                          { kunci: "hari", judul: "Hari Kerja", rata: "kanan",
                            render: (i) => i.days_worked ?? 1 },
                          { kunci: "rate", judul: "Rate/Hari", rata: "kanan",
                            render: (i) => fmt(i.daily_rate) },
                          { kunci: "subtotal", judul: "Subtotal", rata: "kanan",
                            render: (i) => fmt(i.daily_rate * (i.days_worked ?? 1)) },
                        ]}
                        total={[
                          { kunci: "label", isi: "Total", rata: "kanan", rentang: 3 },
                          { kunci: "nilai", isi: fmt(Number(r.total_amount ?? totalWage)), rata: "kanan" },
                        ]}
                      />
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", padding: "12px 0" }}>
                        Total upah:{" "}
                        <strong style={{ color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(Number(r.total_amount ?? 0))}
                        </strong>
                      </div>
                    )}

                    {r.status === "rejected" && r.review_notes && (
                      <div
                        style={{
                          marginTop: 12, padding: "8px 12px", borderRadius: 10,
                          background: "var(--danger-bg)", border: "1px solid var(--danger)",
                        }}
                      >
                        <div style={{ fontSize: 12, color: "var(--on-danger-bg)", fontWeight: 700 }}>Alasan ditolak:</div>
                        <div style={{ fontSize: 13, color: "var(--on-danger-bg)", marginTop: 2 }}>{r.review_notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

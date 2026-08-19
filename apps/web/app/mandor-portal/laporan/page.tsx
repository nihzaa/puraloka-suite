"use client";

// ============================================================================
// Laporan Upah Mingguan — daftar ringkas ekspansif (accordion), read-only.
//
// Restyle F7d (2026-08-20): warna-ui → token CSS, badge status → StatusBadge,
// kosong/loading → EmptyState/SkeletonCard. Halaman ini hanya baca — beda
// dari `laporan-upah/page.tsx` yang juga punya form kirim laporan baru.
//
// ⚠️ Bug pre-existing ditemukan Fix Round 1 (2026-08-20): versi restyle
// pertama masih memakai `wage_items`/`total_amount` untuk total & rincian
// per-pekerja — field itu TAK PERNAH dikirim `GET /api/v1/mandor/wage-reports`
// (diverifikasi `SELECT` di `apps/api/src/routes/v1/mandor.ts` baris
// 1236-1246: `id, week_start, week_end, status, subtotal, total_deduction,
// net_amount, notes, submitted_at, reviewed_at, review_notes, paid_at,
// created_at, assignment(...), scope(...), reviewer(...)` — tak ada
// `wage_items` maupun `total_amount`). Akibatnya `items` selalu `[]` dan
// total SELALU jatuh ke "Rp 0". Bug ini ADA SEBELUM restyle (di kode lama
// yang dibaca `any`), bukan diperkenalkan oleh restyle — tapi halaman ini
// sedang disentuh, jadi diperbaiki di sisi UI: dipakai `net_amount` (field
// yang MEMANG dikirim, dan dipakai identik di `laporan-upah/page.tsx`).
// Tabel per-pekerja (`<Tabel>` dari `@/components/dasar`) DIBUANG —
// menampilkan tabel yang selalu kosong bukan tampilan, itu ilusi data yang
// tidak ada. Diganti ringkasan subtotal/potongan/bersih, tiga angka yang
// API BENAR-BENAR mengirimnya.
// ============================================================================

import { useState } from "react";
import { useData } from "@/lib/data-cache";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import { type LaporanUpah, type GalatApi, pesanGalat } from "../_bersama/tipe";

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
  const { data, memuat: loading, galat: galatMuat } = useData<{ reports: LaporanUpah[] }>("/api/v1/mandor/wage-reports");
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
        // `role="alert"` — hilang sempat saat pindah ke EmptyState (Fix
        // Round 1). Dipasang di wadah pembungkus; lihat catatan yang sama
        // di `pembayaran/page.tsx`.
        <div role="alert">
          <EmptyState
            icon={AlertCircle}
            judul="Gagal memuat laporan upah"
            deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
          />
        </div>
      )}

      {!loading && !galatMuat && reports.length === 0 && (
        <EmptyState
          icon={AlertCircle}
          judul="Belum ada laporan upah"
          deskripsi="Laporan upah mingguan yang sudah dikirim akan muncul di sini, lengkap dengan status review dan rincian potongannya."
        />
      )}

      {!loading && !galatMuat && reports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reports.map((r) => {
            const isOpen = expanded[r.id] ?? false;
            const netAmount = Number(r.net_amount ?? 0);

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
                        {fmt(netAmount)}
                      </span>
                      <span>{r.scope?.scope_name ?? "—"}</span>
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

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "var(--text-secondary)" }}>Subtotal</span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(Number(r.subtotal ?? 0))}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "var(--text-secondary)" }}>Potongan</span>
                        <span style={{ fontWeight: 600, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                          −{fmt(Number(r.total_deduction ?? 0))}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex", justifyContent: "space-between", fontSize: 13,
                          borderTop: "1px solid var(--border)", paddingTop: 8,
                        }}
                      >
                        <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>Bersih Diterima</span>
                        <span style={{ fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(netAmount)}
                        </span>
                      </div>
                    </div>

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

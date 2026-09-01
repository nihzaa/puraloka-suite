"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, ClipboardList, Briefcase, TrendingUp, ChevronRight } from "lucide-react";
import { useData } from "@/lib/data-cache";
import KpiCard from "@/components/portal/KpiCard";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { Penugasan, Kasbon, LaporanUpah, GalatApi } from "./_bersama/tipe";
import { pesanGalat } from "./_bersama/tipe";

// ============================================================================
// Beranda mandor-portal — ringkasan KPI + scope aktif + kasbon terbaru +
// peringatan laporan upah menunggu.
//
// Endpoint yang dipakai di sini SUDAH DIVERIFIKASI ke
// `apps/api/src/routes/v1/mandor.ts` dan `apps/api/src/routes/v1/kasbons.ts`
// — bukan ditebak dari nama. Dua dugaan di brief task ini SALAH:
//
//   Brief menduga                         Nyata
//   ─────────────────────────────────────  ──────────────────────────────────
//   GET /api/v1/mandor/kasbon?status=…     GET /api/v1/kasbons?status=… (kunci
//                                           respons `kasbons`, bukan `data`;
//                                           tak ada route `/mandor/kasbon`
//                                           singular sama sekali)
//   GET /api/v1/mandor/laporan-upah?…      GET /api/v1/mandor/wage-reports?
//                                           status=… (kunci respons `reports`,
//                                           bukan `data`; status pending mandor
//                                           bernama `submitted`, bukan `pending`)
//
// Halaman lama (`page.tsx` versi sebelum rombak ini) sudah memakai endpoint
// yang benar di atas, jadi ini bukan riset baru — hanya dikonfirmasi ulang
// sebelum tulis ulang render-nya.
//
// ── Kenapa beranda ditambah dua daftar (temuan verifikasi visual 2026-08-19)
//
// Versi sebelumnya berhenti di 2 KPI + banner kondisional: pada akun berisi
// data, sisa ~70% layar (viewport 390x844) kosong tanpa apa pun yang
// menggantikan empty state yang sudah hilang. Ditambahkan DUA daftar dari
// data yang SUDAH diambil di halaman ini (tak ada endpoint baru):
//
//   1. Scope kerja aktif  — dari `dataAssign` yang sudah di-fetch untuk KPI
//   2. Kasbon terbaru     — dari `dataKasbon` yang sudah di-fetch untuk KPI
//                           (di-fetch TANPA filter status supaya daftar
//                           "terbaru" tak kosong begitu tak ada yang pending)
//
// `MiniChart` (tren kasbon per bulan) DIPERTIMBANGKAN dan DILEPAS: kasbon
// mandor pada data uji jumlahnya kecil (biasanya <10 baris terbaru), dan
// nilai per-bulan yang dihitung dari potongan sekecil itu (bukan seluruh
// riwayat — endpoint ini tak mengirim itu) lebih menyesatkan daripada
// membantu. Daftar konkret (nominal + status per baris) lebih berguna bagi
// mandor daripada tren abstrak dari data yang tak lengkap.
// ============================================================================

interface RespAssignments { assignments: Penugasan[] }
interface RespKasbon { kasbons: Kasbon[] }
interface RespUpah { reports: LaporanUpah[] }

const VARIAN_STATUS_KASBON: Record<string, VarianStatus> = {
  pending: "pending",
  approved: "approved",
  settled: "approved",
  rejected: "rejected",
};

const LABEL_STATUS_KASBON: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  settled: "Lunas",
  rejected: "Ditolak",
};

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function MandorBerandaPage() {
  const { data: dataAssign, memuat: memuatAssign, galat: galatAssign } =
    useData<RespAssignments>("/api/v1/mandor/assignments");
  // Tanpa filter status — dipakai baik untuk KPI "Kasbon Pending" (dihitung
  // di klien) maupun daftar "kasbon terbaru" di bawah. Satu fetch, dua
  // kebutuhan: memfilter status di server akan butuh dua request terpisah
  // untuk dua tampilan yang sama-sama perlu di halaman ini.
  const { data: dataKasbon, memuat: memuatKasbon, galat: galatKasbon } =
    useData<RespKasbon>("/api/v1/kasbons");
  const { data: dataUpah, memuat: memuatUpah } =
    useData<RespUpah>("/api/v1/mandor/wage-reports?status=submitted");

  const scopes = useMemo(
    () => (dataAssign?.assignments ?? []).flatMap((a) =>
      (a.work_scopes ?? []).map((s) => ({ ...s, projectName: a.project?.name ?? null }))),
    [dataAssign],
  );
  const scopeAktif = useMemo(
    () => scopes.filter((s) => s.status === "active" || s.status === "aktif"),
    [scopes],
  );
  const semuaKasbon = dataKasbon?.kasbons ?? [];
  const kasbonPending = semuaKasbon.filter((k) => (k.status ?? "pending") === "pending").length;
  const kasbonTerbaru = semuaKasbon.slice(0, 5);
  const upahMenunggu = dataUpah?.reports?.length ?? 0;

  const memuat = memuatAssign || memuatKasbon || memuatUpah;

  if (galatAssign) {
    return (
      <EmptyState
        icon={Briefcase}
        judul="Gagal memuat data"
        deskripsi={pesanGalat(galatAssign as GalatApi, "Coba lagi beberapa saat.")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Beranda" />

      {memuat ? (
        <>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard label="Scope Aktif" nilai={String(scopeAktif.length)} icon={Briefcase} />
          <KpiCard label="Kasbon Pending" nilai={String(kasbonPending)} icon={Wallet} />
        </div>
      )}

      {!memuat && upahMenunggu > 0 && (
        <Link
          href="/mandor-portal/laporan-upah"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu-lega)",
            borderRadius: "var(--portal-radius-card)", background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)", textDecoration: "none",
          }}
        >
          <ClipboardList size={20} color="var(--on-warning-bg)" aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>
            {upahMenunggu} laporan upah menunggu review
          </span>
        </Link>
      )}

      {!memuat && scopes.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          judul="Belum ada penugasan"
          deskripsi="Scope kerja yang ditugaskan ke Anda akan muncul di sini."
        />
      )}

      {/* Scope kerja aktif — mandor perlu tahu ia sedang mengerjakan apa */}
      {!memuat && scopes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              Scope Kerja Aktif
            </span>
            <Link
              href="/mandor-portal/scope"
              style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600, color: "var(--navy)", textDecoration: "none" }}
            >
              Lihat semua <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {scopeAktif.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: "8px 4px" }}>
              Tidak ada scope berstatus aktif saat ini.
            </div>
          )}

          {scopeAktif.slice(0, 4).map((s) => {
            const pct = s.progress_pct_done ?? 0;
            return (
              <Link
                key={s.id}
                href="/mandor-portal/scope"
                style={{
                  padding: 14, borderRadius: 16, background: "var(--surface)",
                  border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
                  textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      {s.scope_name}
                    </div>
                    {s.projectName && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        {s.projectName}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", flexShrink: 0 }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--jalur-progres)", borderRadius: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%", borderRadius: 6, width: `${Math.min(100, Math.max(0, pct))}%`,
                      background: "var(--grad-aksen)", transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Kasbon terbaru — daftar yang paling sering dicek mandor */}
      {!memuat && !galatKasbon && kasbonTerbaru.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              Kasbon Terbaru
            </span>
            <Link
              href="/mandor-portal/kasbon"
              style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600, color: "var(--navy)", textDecoration: "none" }}
            >
              Lihat semua <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {kasbonTerbaru.map((k) => (
            <div
              key={k.id}
              style={{
                padding: 12, borderRadius: 14, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", justifyContent: "space-between",
                alignItems: "center", gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  {fmtRp(Number(k.amount ?? 0))}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {k.purpose ?? k.work_scopes?.scope_name ?? "—"}
                </div>
              </div>
              <StatusBadge
                status={VARIAN_STATUS_KASBON[k.status ?? "pending"] ?? "netral"}
                label={LABEL_STATUS_KASBON[k.status ?? "pending"] ?? (k.status ?? "—")}
              />
            </div>
          ))}
        </div>
      )}

      {!memuat && galatKasbon && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: "8px 4px" }}>
          Kasbon terbaru tidak bisa dimuat saat ini — {pesanGalat(galatKasbon as GalatApi, "coba lagi nanti.")}
        </div>
      )}
    </div>
  );
}

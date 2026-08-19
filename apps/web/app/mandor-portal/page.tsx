"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, ClipboardList, Briefcase, TrendingUp } from "lucide-react";
import { useData } from "@/lib/data-cache";
import KpiCard from "@/components/portal/KpiCard";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";
import type { Penugasan, Kasbon, LaporanUpah, GalatApi } from "./_bersama/tipe";
import { pesanGalat } from "./_bersama/tipe";

// ============================================================================
// Beranda mandor-portal — ringkasan KPI + banner laporan upah menunggu.
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
// ============================================================================

interface RespAssignments { assignments: Penugasan[] }
interface RespKasbon { kasbons: Kasbon[] }
interface RespUpah { reports: LaporanUpah[] }

export default function MandorBerandaPage() {
  const { data: dataAssign, memuat: memuatAssign, galat: galatAssign } =
    useData<RespAssignments>("/api/v1/mandor/assignments");
  const { data: dataKasbon, memuat: memuatKasbon } =
    useData<RespKasbon>("/api/v1/kasbons?status=pending");
  const { data: dataUpah, memuat: memuatUpah } =
    useData<RespUpah>("/api/v1/mandor/wage-reports?status=submitted");

  const scopes = useMemo(
    () => (dataAssign?.assignments ?? []).flatMap((a) => a.work_scopes ?? []),
    [dataAssign],
  );
  const scopeAktif = scopes.filter((s) => s.status === "active" || s.status === "aktif").length;
  const kasbonPending = dataKasbon?.kasbons?.length ?? 0;
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {memuat ? (
        <>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard label="Scope Aktif" nilai={String(scopeAktif)} icon={Briefcase} />
          <KpiCard label="Kasbon Pending" nilai={String(kasbonPending)} icon={Wallet} />
        </div>
      )}

      {!memuat && upahMenunggu > 0 && (
        <Link
          href="/mandor-portal/laporan-upah"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: 16,
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
    </div>
  );
}

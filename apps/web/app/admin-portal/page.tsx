"use client";

// ============================================================================
// Beranda Portal Admin/Direktur (Task 3) — Dashboard Eksekutif company-wide.
//
// Menggantikan placeholder Task 1. Pola KpiCard 2 kolom sama seperti
// `pm-portal/page.tsx`, tapi 4 kartu (bukan 2) — admin butuh lebih banyak
// angka company-wide sekaligus: proyek aktif, nilai kontrak, invoice belum
// lunas, kasbon beredar.
// ============================================================================

import Link from "next/link";
import { getStoredUser } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { formatRupiahSingkat } from "@/lib/format";
import { namaSapaan } from "@/lib/nama-sapaan";
import {
  Inbox, Building2, TrendingUp, FileText, Coins,
  ChevronRight, AlertTriangle,
} from "lucide-react";
import KpiCard from "@/components/portal/KpiCard";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { DashboardEksekutif, DashboardFokus, DashboardDeret, ResponsInbox, GalatApi } from "./_bersama/tipe";
import { pesanGalat } from "./_bersama/tipe";

export default function AdminPortalBeranda() {
  const user = getStoredUser();

  // Default 30 hari — portal dibuka di HP untuk cek cepat, bukan analisis
  // mendalam (beda dari default web `last_3_months`, dibuka di desktop).
  const { data, memuat, galat } =
    useData<DashboardEksekutif>("/api/v1/dashboard?period=last_30_days");
  const { data: fokus } = useData<DashboardFokus>("/api/v1/dashboard/fokus");
  const { data: inbox } = useData<ResponsInbox>("/api/v1/approval/inbox");
  // Sparkline KPI — pelengkap, kegagalannya TAK BOLEH menjatuhkan KPI utama
  // (pola sama `(dashboard)/dashboard/page.tsx`, `galat` dari hook ini
  // sengaja tak dibaca). Array bisa `[]` — KpiCard sudah menangani panjang
  // < 2 dengan tak merender sparkline (lihat `KpiCard.tsx` syarat
  // `sparklineData.length > 1`).
  const { data: deret } = useData<DashboardDeret>("/api/v1/dashboard/deret");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{
        fontSize: "var(--t-judul)", fontWeight: 700,
        color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em",
      }}>
        Halo, {namaSapaan(user?.name)}
      </h1>

      {!memuat && galat && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: 14,
            borderRadius: "var(--portal-radius-card)", background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
          }}
        >
          <AlertTriangle size={18} color="var(--on-danger-bg)" aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--on-danger-bg)" }}>
            {pesanGalat(galat as GalatApi, "Gagal memuat ringkasan. Pastikan API server berjalan.")}
          </span>
        </div>
      )}

      {memuat ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard
            label="Proyek Aktif"
            nilai={String(data?.kpis.active_projects ?? 0)}
            icon={Building2}
            sparklineData={deret?.deret.proyek_aktif}
          />
          <KpiCard
            label="Nilai Kontrak"
            nilai={formatRupiahSingkat(data?.kpis.total_contract_value ?? 0)}
            icon={TrendingUp}
            sparklineData={deret?.deret.nilai_kontrak}
          />
          <KpiCard
            label="Invoice Belum Lunas"
            nilai={formatRupiahSingkat(data?.kpis.invoice_outstanding ?? 0)}
            icon={FileText}
            sparklineData={deret?.deret.invoice_belum_lunas}
          />
          <KpiCard
            label="Kasbon Beredar"
            nilai={formatRupiahSingkat(data?.kpis.kasbon_active_total ?? 0)}
            icon={Coins}
            sparklineData={deret?.deret.kasbon}
          />
        </div>
      )}

      {!memuat && (inbox?.total ?? 0) > 0 && (
        <Link
          href="/admin-portal/inbox"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-card)", background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)", textDecoration: "none", minHeight: 44,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Inbox size={20} color="var(--on-warning-bg)" aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>
              {inbox?.total} pengajuan menunggu keputusan Anda
            </span>
          </div>
          <ChevronRight size={18} color="var(--on-warning-bg)" aria-hidden="true" />
        </Link>
      )}

      {!memuat && (fokus?.lewat ?? 0) > 0 && (
        <Link
          href={fokus!.tautan}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-card)", background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)", textDecoration: "none", minHeight: 44,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={20} color="var(--on-danger-bg)" aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-danger-bg)" }}>
              {fokus!.lewat} hal sudah lewat tenggat
            </span>
          </div>
          <ChevronRight size={18} color="var(--on-danger-bg)" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

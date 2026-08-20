"use client";

// ============================================================================
// Beranda Portal PM (Task 9) — KPI-first, sesuai pola mandor-portal.
//
// Grafik progress proyek + target vs realisasi (spec §4/§7.2) SENGAJA tidak
// ditambahkan di sini — itu masuk `/pm-portal/proyek` (Task 10). Beranda
// tetap ringkas: dua KPI + pintasan ke approval (modul paling berdampak).
// ============================================================================

import Link from "next/link";
import { getStoredUser } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Inbox, FolderKanban, ChevronRight, AlertTriangle } from "lucide-react";
import KpiCard from "@/components/portal/KpiCard";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";
import { namaSapaan } from "@/lib/nama-sapaan";
import type { ResponsInbox, ProyekPM, GalatApi } from "./_bersama/tipe";
import { pesanGalat } from "./_bersama/tipe";

interface RespProjects { projects: ProyekPM[] }

export default function PmBerandaPage() {
  const user = getStoredUser();
  const { data: inbox, memuat: memuatInbox, galat: galatInbox } =
    useData<ResponsInbox>("/api/v1/approval/inbox");
  const { data: proyekResp, memuat: memuatProyek, galat: galatProyek } =
    useData<RespProjects>("/api/v1/projects");

  const proyekSaya = (proyekResp?.projects ?? []).filter((p) => p.status === "active");
  const memuat = memuatInbox || memuatProyek;
  const galatMuat = galatInbox ?? galatProyek;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Halo, {namaSapaan(user?.name)}
      </h1>

      {!memuat && galatMuat && (
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
            {pesanGalat(galatMuat as GalatApi, "Sebagian ringkasan gagal dimuat.")}
          </span>
        </div>
      )}

      {memuat ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard label="Menunggu Approval" nilai={String(inbox?.total ?? 0)} icon={Inbox} />
          <KpiCard label="Proyek Aktif" nilai={String(proyekSaya.length)} icon={FolderKanban} />
        </div>
      )}

      {!memuat && (inbox?.total ?? 0) > 0 && (
        <Link
          href="/pm-portal/approval"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 16,
            borderRadius: "var(--portal-radius-card)", background: "var(--warning-bg)",
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

      {!memuat && !galatMuat && proyekSaya.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          judul="Belum ada proyek aktif"
          deskripsi="Proyek yang Anda kelola akan muncul di sini."
        />
      )}

      {!memuat && proyekSaya.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              Proyek Saya
            </span>
            <Link
              href="/pm-portal/proyek"
              style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600, color: "var(--navy)", textDecoration: "none" }}
            >
              Lihat semua <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {proyekSaya.slice(0, 4).map((p) => (
            <Link
              key={p.id}
              href={`/pm-portal/proyek/${p.id}`}
              style={{
                padding: 14, borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
                textDecoration: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {p.progress_pct ?? 0}%
                </span>
              </div>
              <div style={{ height: 6, background: "var(--surface-subtle)", borderRadius: 6, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%", borderRadius: 6,
                    width: `${Math.min(100, Math.max(0, p.progress_pct ?? 0))}%`,
                    background: "var(--grad-aksen)", transition: "width 0.3s ease",
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

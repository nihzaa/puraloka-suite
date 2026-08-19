"use client";

// ============================================================================
// StatusBadge — lencana status ber-ikon untuk portal mobile.
//
// Tiap varian punya IKON berbeda, bukan cuma warna berbeda (WCAG
// "use-of-color" / color-not-only) — penting di sini karena pengguna portal
// (mandor/PM/klien lapangan) mencakup buta warna dan perangkat layar redup
// di bawah sinar matahari, dua kondisi yang sama-sama membuat pembedaan
// warna-saja gagal.
//
// Warna teks pending/approved/rejected/info memakai token `--on-*-bg`
// (BUKAN `--warning`/`--success`/`--danger`/`--info` polos). Alasannya
// tertulis di globals.css (sekitar baris 120-137): token biasa itu dibuat
// untuk teks di atas PUTIH, sedangkan lencana ini menaruh teks di atas
// latar yang SUDAH berwarna (--warning-bg dkk.) — kombinasi itu butuh nada
// yang lebih pekat lagi untuk tetap lolos 4,5:1. `--on-*-bg` adalah token
// yang memang dibuat untuk kasus ini, sudah terukur (6,84–8,01:1 di mode
// terang) dan punya varian mode gelap sendiri (blok `.dark`, ~baris
// 697-700) — jangan kembalikan ke `--warning` dkk., itu akan mengulang
// cacat kontras yang sudah diperbaiki.
// ============================================================================

import { Clock, CheckCircle2, XCircle, Info, Circle, type LucideIcon } from "lucide-react";

export type VarianStatus = "pending" | "approved" | "rejected" | "info" | "netral";

export interface StatusBadgeProps {
  status: VarianStatus;
  label: string;
}

const KONFIG: Record<VarianStatus, { warna: string; bg: string; icon: LucideIcon }> = {
  pending: { warna: "var(--on-warning-bg)", bg: "var(--warning-bg)", icon: Clock },
  approved: { warna: "var(--on-success-bg)", bg: "var(--success-bg)", icon: CheckCircle2 },
  rejected: { warna: "var(--on-danger-bg)", bg: "var(--danger-bg)", icon: XCircle },
  info: { warna: "var(--on-info-bg)", bg: "var(--info-bg)", icon: Info },
  // --text-secondary di atas --surface-subtle: diukur manual (bukan token
  // --on-*-bg, sebab keduanya sudah dirancang untuk pasangan netral) —
  // 5,99:1 (terang) dan 6,17:1 (gelap), lolos 4,5:1 di kedua mode. Biarkan.
  netral: { warna: "var(--text-secondary)", bg: "var(--surface-subtle)", icon: Circle },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const { warna, bg, icon: Icon } = KONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: "var(--portal-radius-pill)",
        background: bg,
        color: warna,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.4,
      }}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

"use client";

// ============================================================================
// StatusBadge — lencana status ber-ikon untuk portal mobile.
//
// Tiap varian punya IKON berbeda, bukan cuma warna berbeda (WCAG
// "use-of-color" / color-not-only) — penting di sini karena pengguna portal
// (mandor/PM/klien lapangan) mencakup buta warna dan perangkat layar redup
// di bawah sinar matahari, dua kondisi yang sama-sama membuat pembedaan
// warna-saja gagal.
// ============================================================================

import { Clock, CheckCircle2, XCircle, Info, Circle, type LucideIcon } from "lucide-react";

export type VarianStatus = "pending" | "approved" | "rejected" | "info" | "netral";

export interface StatusBadgeProps {
  status: VarianStatus;
  label: string;
}

const KONFIG: Record<VarianStatus, { warna: string; bg: string; icon: LucideIcon }> = {
  pending: { warna: "var(--warning)", bg: "var(--warning-bg)", icon: Clock },
  approved: { warna: "var(--success)", bg: "var(--success-bg)", icon: CheckCircle2 },
  rejected: { warna: "var(--danger)", bg: "var(--danger-bg)", icon: XCircle },
  info: { warna: "var(--info)", bg: "var(--info-bg)", icon: Info },
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

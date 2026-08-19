"use client";

// ============================================================================
// ActionCard — kartu aksi cepat (grid ikon+label) untuk beranda portal.
//
// Badge notifikasi memakai pasangan `--danger-bg` + `--danger` (bukan
// `--danger` solid + putih) — pola yang sama dipakai `components/ui/badge.tsx`
// di seluruh aplikasi. Solid `--danger` + teks putih literal gagal kontras
// AA di mode gelap (~2,4:1, token dark-mode `--danger` sengaja dibuat terang
// supaya terbaca DI ATAS latar, bukan sebagai latar teks putih).
// ============================================================================

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface ActionCardProps {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Angka notifikasi, mis. jumlah pending. */
  badge?: number;
}

export default function ActionCard({ href, label, icon: Icon, badge }: ActionCardProps) {
  return (
    <Link
      href={href}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "16px 8px",
        borderRadius: 16,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        textDecoration: "none",
        minHeight: 88,
      }}
    >
      {badge !== undefined && badge > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            minWidth: 18,
            height: 18,
            borderRadius: "var(--portal-radius-pill)",
            background: "var(--danger-bg)",
            color: "var(--danger)",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            border: "1px solid var(--danger-border)",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: "var(--navy-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={22} color="var(--navy)" aria-hidden="true" />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          textAlign: "center",
        }}
      >
        {label}
        {badge !== undefined && badge > 0 && (
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
            {" "}({badge > 99 ? "lebih dari 99" : badge} notifikasi)
          </span>
        )}
      </span>
    </Link>
  );
}

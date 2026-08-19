"use client";

import type { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon: LucideIcon;
  judul: string;
  deskripsi: string;
  aksi?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon: Icon, judul, deskripsi, aksi }: EmptyStateProps) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--portal-radius-pill)",
          background: "var(--navy-light)",
          margin: "0 auto 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={28} color="var(--navy)" aria-hidden="true" />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
        {judul}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: aksi ? 16 : 0,
        }}
      >
        {deskripsi}
      </div>
      {aksi && (
        <button
          type="button"
          onClick={aksi.onClick}
          style={{
            minHeight: 44,
            padding: "10px 20px",
            borderRadius: "var(--portal-radius-pill)",
            background: "var(--navy)",
            color: "var(--on-navy)",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {aksi.label}
        </button>
      )}
    </div>
  );
}

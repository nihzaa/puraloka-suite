"use client";

export interface SegmentedTabProps {
  opsi: Array<{ value: string; label: string }>;
  aktif: string;
  onUbah: (value: string) => void;
}

export default function SegmentedTab({ opsi, aktif, onUbah }: SegmentedTabProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 2,
        padding: 4,
        background: "var(--surface-subtle)",
        borderRadius: "var(--portal-radius-pill)",
      }}
    >
      {opsi.map((o) => {
        const isAktif = o.value === aktif;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={isAktif}
            onClick={() => onUbah(o.value)}
            style={{
              flex: 1,
              minHeight: 44,
              padding: "8px 12px",
              borderRadius: "var(--portal-radius-pill)",
              border: "none",
              cursor: "pointer",
              background: isAktif ? "var(--navy)" : "transparent",
              color: isAktif ? "var(--on-navy)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: isAktif ? 700 : 500,
              transition: "background 150ms ease, color 150ms ease",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

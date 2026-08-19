"use client";

// ============================================================================
// SkeletonCard — placeholder shimmer saat data portal masih dimuat.
//
// className="portal-skeleton" dipakai globals.css untuk menyasar rule
// prefers-reduced-motion HANYA ke elemen skeleton portal — lihat catatan
// penyempitan selector di akhir globals.css.
// ============================================================================

export default function SkeletonCard({ tinggi = 100 }: { tinggi?: number }) {
  return (
    <div
      aria-hidden="true"
      className="portal-skeleton"
      style={{
        height: tinggi,
        borderRadius: "var(--portal-radius-card)",
        background:
          "linear-gradient(90deg, var(--surface-subtle) 25%, var(--surface-hover) 50%, var(--surface-subtle) 75%)",
        backgroundSize: "200% 100%",
        animation: "portal-skeleton-shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}

"use client";

// ============================================================================
// BottomSheet — modal geser-dari-bawah untuk portal mobile.
//
// Tiga jalan menutup (checklist a11y "escape-routes"/"modal-escape"): tombol
// X ber-aria-label, klik scrim, tombol Escape. Body scroll dikunci selama
// terbuka dan dikembalikan saat tertutup/unmount.
// ============================================================================

import { useEffect } from "react";
import { X } from "lucide-react";

export interface BottomSheetProps {
  terbuka: boolean;
  onTutup: () => void;
  judul: string;
  children: React.ReactNode;
}

export default function BottomSheet({ terbuka, onTutup, judul, children }: BottomSheetProps) {
  useEffect(() => {
    if (!terbuka) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }

    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [terbuka, onTutup]);

  if (!terbuka) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={judul}
      style={{ position: "fixed", inset: 0, zIndex: 100 }}
    >
      <div
        onClick={onTutup}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "rgba(0,15,30,0.5)" }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "88dvh",
          overflowY: "auto",
          background: "var(--surface)",
          borderRadius: "20px 20px 0 0",
          padding: "12px 20px max(env(safe-area-inset-bottom), 20px)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "var(--border)",
            margin: "4px auto 16px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            {judul}
          </h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--portal-radius-pill)",
              border: "none",
              background: "var(--surface-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

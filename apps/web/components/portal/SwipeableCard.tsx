"use client";

// ============================================================================
// SwipeableCard — kartu list dengan swipe-to-action (approve/reject,
// tutup/tolak). Dipakai di seluruh Portal PM untuk kartu approval/
// verifikasi, mulai Tahap 1.
//
// Gesture adalah PERCEPATAN, bukan satu-satunya cara — tombol tetap
// disediakan pemanggil sebagai children (pola sudah ada di
// pm-portal/approval, pm-portal/punch-list dst). Komponen ini HANYA
// menambah lapisan swipe di atasnya, tidak menggantikan tombol yang
// sudah ada di tiap halaman.
//
// prefers-reduced-motion: swipe gesture dimatikan sepenuhnya. Browser yang
// mendeteksi preferensi motion-reduce akan render kartu polos tanpa drag
// interaktif — tombol children (disediakan pemanggil) tetap menjadi satu-satunya
// jalur aksi. Ini terpenuhi per spec (gesture opsional, bukan wajib).
// ============================================================================

import { useRef, useState } from "react";
import { SWIPE_THRESHOLD_PX, EASING_MOVE, DURASI_MOVE_MS } from "@/lib/motion";

export interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  labelKanan?: string;
  labelKiri?: string;
  /** Default: var(--success-bg) */
  warnaKanan?: string;
  /** Default: var(--danger-bg) */
  warnaKiri?: string;
  /** Matikan swipe (mis. kartu yang aksinya sudah tak berlaku) — tombol children tetap tampil. */
  nonaktif?: boolean;
}

export default function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  labelKanan = "Setujui",
  labelKiri = "Tolak",
  warnaKanan = "var(--success-bg)",
  warnaKiri = "var(--danger-bg)",
  nonaktif = false,
}: SwipeableCardProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [prefersReduced] = useState(() =>
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const mulaiX = useRef(0);

  if (nonaktif || prefersReduced) {
    // Reduced motion ATAU dinonaktifkan pemanggil: render kartu polos,
    // swipe tak aktif — tombol children (disediakan pemanggil) tetap
    // satu-satunya jalur aksi. Ini BUKAN kehilangan fungsi, karena
    // gesture selalu opsional (§3c spec).
    return <div>{children}</div>;
  }

  function mulai(clientX: number, e: React.PointerEvent) {
    mulaiX.current = clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function gerak(clientX: number) {
    if (!dragging) return;
    setDx(clientX - mulaiX.current);
  }
  function lepas() {
    setDragging(false);
    if (dx > SWIPE_THRESHOLD_PX && onSwipeRight) {
      onSwipeRight();
    } else if (dx < -SWIPE_THRESHOLD_PX && onSwipeLeft) {
      onSwipeLeft();
    }
    setDx(0);
  }

  const progresKanan = Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD_PX));
  const progresKiri = Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD_PX));

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}>
      {onSwipeRight && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            paddingLeft: 20, background: warnaKanan, opacity: progresKanan,
            fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
          }}
        >
          {labelKanan}
        </div>
      )}
      {onSwipeLeft && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "flex-end", paddingRight: 20, background: warnaKiri,
            opacity: progresKiri, fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
          }}
        >
          {labelKiri}
        </div>
      )}
      <div
        onPointerDown={(e) => mulai(e.clientX, e)}
        onPointerMove={(e) => gerak(e.clientX)}
        onPointerUp={lepas}
        onPointerCancel={lepas}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : `transform ${DURASI_MOVE_MS}ms ${EASING_MOVE}`,
          touchAction: "pan-y",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

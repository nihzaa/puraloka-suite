"use client";

/**
 * KERANGKA KECIL BERSAMA — modul Estimasi.
 *
 * Modal, label, dan dua gaya tombol yang dipakai lintas layar. Disalin dari
 * berkas 4.070 baris yang dibongkar; satu-satunya perubahan yang disengaja
 * adalah padding memakai token, bukan angka dipaku (`uji-tabel-seragam`
 * memakai ratchet — menyalin angka lama akan menaikkannya).
 */

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";

export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  useTutupEsc(onClose);
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(17,24,39,.45)",
        zIndex: 60, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "var(--pad-kartu-lega)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: "var(--radius-md)",
          width: "100%", maxWidth: 560, maxHeight: "88vh", overflow: "auto",
          boxShadow: "var(--naik-3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
          position: "sticky", top: 0, background: C.surface, zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            {title}
          </h2>
          <button
            aria-label="Tutup"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "var(--pad-modal)" }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export const label = (t: string) => (
  <label style={{
    display: "block", fontSize: 11, fontWeight: 600,
    color: C.mid, margin: "10px 0 4px",
  }}>{t}</label>
);

export const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "var(--grad-aksen)", color: C.onNavy, border: "none",
  borderRadius: "var(--radius-dense)", padding: "var(--pad-tombol)",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

/**
 * Pil status mentah dari basis (`draft`, `locked`, `active`, …).
 *
 * Sengaja menampilkan istilah aslinya: di layar RAP ia berdampingan dengan
 * data teknis lain, dan menerjemahkannya di sini akan membuat status yang
 * dibaca operator berbeda dari status yang tersimpan — persis kebingungan
 * yang mahal saat menelusuri kenapa sebuah pagu tak bisa diubah.
 */
export function StatusBadge({ s }: { s: string }) {
  const peta: Record<string, [string, string]> = {
    draft: [C.mid, C.bg],
    under_review: [C.yellow, C.yellowBg],
    approved: [C.green, C.greenBg],
    frozen: [C.navy, C.bg],
    superseded: [C.muted, C.bg],
    verified: [C.yellow, C.yellowBg],
    active: [C.green, C.greenBg],
    expired: [C.muted, C.bg],
    locked: [C.navy, C.bg],
  };
  const [fg, bg] = peta[s] ?? [C.mid, C.bg];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: fg, background: bg,
      border: `1px solid ${C.border}`, borderRadius: "var(--radius-pill)",
      padding: "var(--pad-lencana)",
    }}>{s}</span>
  );
}

export const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: C.surface, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: "var(--radius-dense)", padding: "var(--pad-tombol-kcl)",
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

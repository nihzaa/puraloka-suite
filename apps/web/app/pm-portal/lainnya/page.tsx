"use client";

// ============================================================================
// Halaman "Lainnya" PM — grid modul lengkap. Bottom nav (PortalShell) hanya
// mengurasi 4 item + tombol Lainnya; sisanya dipindah ke sini — pola sama
// dengan `mandor-portal/lainnya/page.tsx`.
//
// ⚠️ `<h1>` di bawah WAJIB ada, sekalipun tampak mubazir. Penjaga
// `uji-judul-halaman-ada.mjs` bisa lolos keliru karena menerima judul dari
// layout leluhur — jangan bergantung padanya (lihat catatan yang sama di
// `mandor-portal/lainnya/page.tsx`).
// ============================================================================

import {
  ShieldAlert, ClipboardCheck, FileQuestion, FileStack, FileText,
  Calendar, Landmark, ShoppingCart, HardHat, UserSquare2, Banknote, Ruler,
} from "lucide-react";
import ActionCard from "@/components/portal/ActionCard";

const ITEMS = [
  { href: "/pm-portal/k3", label: "K3", icon: ShieldAlert },
  { href: "/pm-portal/punch-list", label: "Punch List", icon: ClipboardCheck },
  { href: "/pm-portal/inspeksi-rfi", label: "Inspeksi & RFI", icon: FileQuestion },
  { href: "/pm-portal/submittal", label: "Submittal", icon: FileStack },
  { href: "/pm-portal/dokumen", label: "Dokumen", icon: FileText },
  { href: "/pm-portal/jadwal", label: "Jadwal & Baseline", icon: Calendar },
  { href: "/pm-portal/kontrak", label: "Kontrak", icon: Landmark },
  { href: "/pm-portal/procurement", label: "Procurement", icon: ShoppingCart },
  { href: "/pm-portal/mandor", label: "Mandor", icon: HardHat },
  // Tahap 1, Task 6 — kelompok Mandor & Subkon bagian 1.
  { href: "/pm-portal/mandor-lengkap/penugasan", label: "Penugasan Mandor", icon: UserSquare2 },
  { href: "/pm-portal/mandor-lengkap/kasbon", label: "Kasbon Tukang", icon: Banknote },
  { href: "/pm-portal/mandor-lengkap/opname", label: "Opname Bersama", icon: Ruler },
];

export default function PmLainnyaPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "var(--text-primary)",
          letterSpacing: "-0.01em",
          margin: 0,
        }}
      >
        Menu Lainnya
      </h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {ITEMS.map((item) => (
          <ActionCard key={item.href} {...item} />
        ))}
      </div>
    </div>
  );
}

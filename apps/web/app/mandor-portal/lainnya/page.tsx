"use client";

import {
  BarChart2, ClipboardList, Users, CreditCard, Receipt, HardHat,
  ShieldAlert, ClipboardCheck, FileQuestion, FileStack, Landmark,
} from "lucide-react";
import { useData } from "@/lib/data-cache";
import ActionCard from "@/components/portal/ActionCard";
import type { Penugasan } from "../_bersama/tipe";

// ============================================================================
// Halaman "Lainnya" mandor — grid modul lengkap. Bottom nav (PortalShell)
// hanya mengurasi 4 item + tombol Lainnya; sisanya (termasuk item kondisional
// payment_system yang dulu ada di bottom nav) dipindah ke sini.
//
// ⚠️ `<h1>` di bawah TIDAK boleh dihapus, sekalipun tampak mubazir di layar.
//
// Penjaga `uji-judul-halaman-ada.mjs` menerima judul dari `layout.tsx`
// LELUHUR — dan `mandor-portal/layout.tsx` memang memuat teks berjudul, jadi
// penjaga menyatakan halaman ini HIJAU meski ia tak punya `<h1>` sama sekali.
// Diukur 2026-08-20 lewat sapuan peramban 17 rute: halaman ini satu-satunya
// yang memulangkan `jml_h1: 0`. Penjaganya benar untuk kasus umum (judul dari
// layout grup memang sah), tapi buta untuk kasus ini.
//
// Pembaca layar menavigasi dengan melompati heading; halaman tanpa `<h1>`
// membuat pengguna mendarat tanpa tahu ia ada di mana.
// ============================================================================

interface RespAssignments { assignments: Penugasan[] }

export default function MandorLainnyaPage() {
  const { data } = useData<RespAssignments>("/api/v1/mandor/assignments");

  const allScopes = (data?.assignments ?? []).flatMap((a) => a.work_scopes ?? []);
  const hasHarian = allScopes.some((s) => s.payment_system === "harian");
  const hasProgressPct = allScopes.some((s) => s.payment_system === "progress_pct");

  const items = [
    hasHarian && { href: "/mandor-portal/laporan-upah", label: "Laporan Upah", icon: ClipboardList },
    hasProgressPct && { href: "/mandor-portal/penagihan", label: "Penagihan", icon: Receipt },
    { href: "/mandor-portal/kasbon-tukang", label: "Kasbon Tukang", icon: CreditCard },
    { href: "/mandor-portal/tukang", label: "Daftar Tukang", icon: Users },
    { href: "/mandor-portal/pembayaran", label: "Riwayat Bayar", icon: Landmark },
    { href: "/mandor-portal/rekapitulasi", label: "Rekapitulasi", icon: BarChart2 },
    { href: "/mandor-portal/k3", label: "K3 Lapangan", icon: ShieldAlert },
    { href: "/mandor-portal/punch-list", label: "Punch List", icon: ClipboardCheck },
    { href: "/mandor-portal/inspeksi-rfi", label: "Inspeksi & RFI", icon: FileQuestion },
    { href: "/mandor-portal/submittal", label: "Submittal", icon: FileStack },
    { href: "/mandor-portal/jadwal", label: "Jadwal Proyek", icon: HardHat },
  ].filter((x): x is { href: string; label: string; icon: typeof ClipboardList } => Boolean(x));

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
        {items.map((item) => (
          <ActionCard key={item.href} {...item} />
        ))}
      </div>
    </div>
  );
}

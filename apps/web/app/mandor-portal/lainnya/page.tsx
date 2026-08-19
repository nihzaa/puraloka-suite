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
// Lima link terakhir (K3, Punch List, Inspeksi & RFI, Submittal, Jadwal
// Proyek) menunjuk ke rute yang BELUM DIBUAT — dibangun Task 7. Link 404
// sementara itu disengaja, bukan bug — sudah diputuskan di brief task ini.
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {items.map((item) => (
        <ActionCard key={item.href} {...item} />
      ))}
    </div>
  );
}

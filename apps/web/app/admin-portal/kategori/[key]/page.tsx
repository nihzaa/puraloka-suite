"use client";

// ============================================================================
// Detail Kategori — Portal Admin/Direktur. Tahap 0 (Task 1). Menampilkan
// daftar modul (ItemMenu) di dalam satu kategori, hanya yang status 'hidup'
// (§1 spec — modul belum hidup dilewati, bukan ditampilkan sebagai
// coming-soon). Struktur PERSIS `pm-portal/kategori/[key]/page.tsx`.
// ============================================================================

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PETA_MENU } from "@/lib/peta-menu";
import EmptyState from "@/components/portal/EmptyState";
import { Folder } from "lucide-react";

/**
 * Peta href web (key `ItemMenu` di `lib/peta-menu.ts`) ke href portal
 * Admin/Direktur — DIISI PROGRESIF tiap Task menambah halaman baru. Item
 * yang key-nya TAK ADA di sini masih ditampilkan (status hidup di web),
 * tapi tautannya ke path web asli sebagai fallback sampai versi portalnya
 * dibangun — pola persis `PETA_HREF_PORTAL` di pm-portal.
 *
 * Tahap 1 (Task 3-4): bi-eksekutif (Dashboard Eksekutif, grup g-laporan) →
 * Beranda admin-portal sendiri (Task 3 mengganti placeholder Task 1 di
 * halaman itu, BUKAN halaman terpisah — href yang sama dengan Beranda).
 * sy-inbox-approval (Menunggu Persetujuan, grup g-sistem) → halaman inbox
 * Task 4. Grup `g-laporan`/`g-sistem` diaktifkan PENUH di
 * `admin-portal-kategori.ts` (level grup) — item lain kedua grup itu yang
 * key-nya TAK ADA di bawah ini (bi-proyek, bi-biaya, sys-impor, sy-audit,
 * dst) sengaja jatuh ke fallback `it.href` web, pola sama persis pm-portal.
 *
 * Tahap 2 (Task 7-11, diaktifkan Task 12): grup `g-kontrak`/`g-jadwal`
 * (Kontrak & Perencanaan). 8 dari 12 item g-kontrak dan 4 dari 11 item
 * g-jadwal punya halaman admin-portal sungguhan (diverifikasi ke
 * `find apps/web/app/admin-portal -name page.tsx`, bukan ditebak dari
 * brief) — didaftarkan di bawah. Sisanya (kt-termin/kt-retensi/kt-rfi/
 * kt-subkon; jd-wbs/jd-gantt/jd-kurva-s/jd-lookahead/jd-milestone/jd-evm)
 * di luar scope Tahap 2, jatuh ke fallback `it.href` web — perilaku
 * disengaja, sama seperti item Tahap 1 yang belum dibangun.
 */
const PETA_HREF_PORTAL: Record<string, string> = {
  "bi-eksekutif": "/admin-portal",
  "sy-inbox-approval": "/admin-portal/inbox",
  // Tahap 2 — Kontrak (g-kontrak)
  "kt-register": "/admin-portal/kontrak/register",
  "kt-asuransi": "/admin-portal/kontrak/asuransi",
  "kt-co": "/admin-portal/kontrak/change-order",
  "kt-eot": "/admin-portal/kontrak/eot-ld-bond",
  "kt-ld": "/admin-portal/kontrak/eot-ld-bond",
  "kt-bond": "/admin-portal/kontrak/eot-ld-bond",
  "kt-claims": "/admin-portal/kontrak/klaim",
  "kt-surat": "/admin-portal/kontrak/surat",
  // Tahap 2 — Perencanaan (g-jadwal). Keempat key di bawah menunjuk SATU
  // halaman ber-SegmentedTab 4-arah (Task 11) — pola identik web sendiri
  // (jd-cpm/jd-histogram/jd-method semua `/jadwal` dengan query berbeda
  // di peta-menu.ts baris 144/146/151).
  "jd-cpm": "/admin-portal/jadwal",
  "jd-histogram": "/admin-portal/jadwal",
  "jd-method": "/admin-portal/jadwal",
  "jd-baseline": "/admin-portal/jadwal",
  "jd-delay": "/admin-portal/jadwal/keterlambatan",
  // Tahap berikutnya menambah baris di sini, sesuai key ItemMenu.
};

/**
 * Modul portal admin yang sudah ada tapi key `ItemMenu`-nya tinggal di grup
 * PETA_MENU yang BELUM aktif di `kategoriUntukAdmin()` — pola persis
 * `EKSTRA_PORTAL` di pm-portal. Tahap 0: kosong, tak ada halaman ekstra.
 */
const EKSTRA_PORTAL: Record<string, { key: string; label: string; href: string; icon: LucideIcon }[]> = {};

export default function AdminKategoriPage() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const grup = PETA_MENU.find((g) => g.key === key);

  if (!grup) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Kembali
        </button>
        <EmptyState icon={Folder} judul="Kategori tidak ditemukan" deskripsi="Kategori ini mungkin sudah dipindahkan." />
      </div>
    );
  }

  const itemHidup = grup.items.filter((it) => it.status === "hidup");
  const ekstra = EKSTRA_PORTAL[grup.key] ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}
      >
        <ChevronLeft size={16} aria-hidden="true" /> Kembali
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {grup.label}
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {itemHidup.map((it) => (
          <Link
            key={it.key}
            href={PETA_HREF_PORTAL[it.key] ?? it.href ?? "#"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: 16, borderRadius: 14, background: "var(--surface)",
              border: "1px solid var(--border)", textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{it.label}</span>
            <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
          </Link>
        ))}
        {ekstra.map((it) => {
          const EkstraIkon = it.icon;
          return (
            <Link
              key={it.key}
              href={it.href}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: 16, borderRadius: 14, background: "var(--surface)",
                border: "1px solid var(--border)", textDecoration: "none",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                <EkstraIkon size={16} color="var(--text-muted)" aria-hidden="true" />
                {it.label}
              </span>
              <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

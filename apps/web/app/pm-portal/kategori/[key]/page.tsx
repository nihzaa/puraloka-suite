"use client";

// ============================================================================
// Detail Kategori — Portal PM. Task 9. Menampilkan daftar modul (ItemMenu) di
// dalam satu kategori, hanya yang status 'hidup' (§1 spec — modul belum
// hidup dilewati, bukan ditampilkan sebagai coming-soon).
// ============================================================================

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Building2, ShieldAlert,
  FileText, Calendar, Landmark, ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PETA_MENU } from "@/lib/peta-menu";
import EmptyState from "@/components/portal/EmptyState";
import { Folder } from "lucide-react";

/**
 * Peta href web (`/mandor/spk`, dst — key `ItemMenu` di `lib/peta-menu.ts`)
 * ke href portal PM (`/pm-portal/mandor-lengkap/spk`) — DIISI PROGRESIF tiap
 * Task menambah halaman baru. Item yang key-nya TAK ADA di sini masih
 * ditampilkan (status hidup di web), tapi tautannya ke path web asli sebagai
 * fallback sampai versi portalnya dibangun — BUKAN disembunyikan
 * (menyembunyikan modul yang PM tahu ada tapi belum bisa dibuka dari HP
 * lebih membingungkan daripada menautkannya ke web, meski itu bukan
 * pengalaman ideal, sampai tahap yang relevan selesai).
 *
 * Baris di bawah = SEMUA halaman portal PM yang sudah dibangun Task 6-8 dan
 * PUNYA key `ItemMenu` di grup `g-subkon`/`g-lapangan` (dikonfirmasi baca
 * ulang `lib/peta-menu.ts` + daftar direktori `app/pm-portal/`), bukan hanya
 * delapan contoh awal di draf plan sebelum riset Task 5 mengoreksinya:
 *   Task 6 — sk-paket (penugasan), sk-kasbon (kasbon), sk-opname (opname)
 *   Task 7 — sk-wo (spk), sk-tender (tender), sk-retensi (retensi),
 *            sk-backcharge (backcharge)
 *   Task 8 — sk-mandor (tukang)
 *   sk-settlement (mandor/upah settlement) dan tiga modul g-lapangan
 *   (lp-punch/lp-rfi/lp-submittal) dibangun SEBELUM plan Portal PM Lengkap
 *   ini, di sesi lain — tetap dipetakan di sini supaya tak jadi yatim
 *   sesudah grid datar diganti navigasi kategori.
 *   Mitra (Task 8) TIDAK di sini — key PETA_MENU-nya `md-subkon` tinggal di
 *   grup g-master (lihat EKSTRA_PORTAL di bawah untuk alasannya).
 */
const PETA_HREF_PORTAL: Record<string, string> = {
  "sk-paket": "/pm-portal/mandor-lengkap/penugasan",
  "sk-wo": "/pm-portal/mandor-lengkap/spk",
  "sk-tender": "/pm-portal/mandor-lengkap/tender",
  "sk-retensi": "/pm-portal/mandor-lengkap/retensi",
  "sk-backcharge": "/pm-portal/mandor-lengkap/backcharge",
  "sk-mandor": "/pm-portal/mandor-lengkap/tukang",
  "sk-kasbon": "/pm-portal/mandor-lengkap/kasbon",
  "sk-opname": "/pm-portal/mandor-lengkap/opname",
  "sk-settlement": "/pm-portal/mandor",
  "lp-punch": "/pm-portal/punch-list",
  "lp-rfi": "/pm-portal/inspeksi-rfi",
  "lp-submittal": "/pm-portal/submittal",
  // Tahap berikutnya menambah baris di sini, sesuai key ItemMenu.
};

/**
 * Modul portal PM yang SUDAH ADA tapi key `ItemMenu`-nya tinggal di grup
 * PETA_MENU yang BELUM aktif di `kategoriUntukPm()` (Tahap 1 hanya g-subkon
 * + g-lapangan): Mitra (`md-subkon`, grup g-master), K3 (`hse-inspeksi`,
 * grup g-hse), Dokumen/Jadwal/Kontrak/Procurement (halaman agregat lintas-
 * modul di portal PM, tak dipetakan satu-ke-satu ke satu key PETA_MENU —
 * lihat komentar tiap halamannya di `app/pm-portal/{dokumen,jadwal,kontrak,
 * procurement}/page.tsx`). Tanpa baris ini, keenamnya jadi TAK TERJANGKAU
 * dari navigasi kategori — persis cacat yang ingin dihindari Task 9
 * ("halaman yang sudah ada jangan sampai jadi tak terjangkau setelah
 * struktur navigasi diganti"). Ditempel ke "Operasi Lapangan"/"Mandor &
 * Subkon" karena itulah tempat PM mencarinya sehari-hari di lapangan — sama
 * seperti `lainnya/page.tsx` versi lama yang menaruh semuanya berdampingan
 * di satu grid. TIDAK mengubah `PETA_MENU`/`KATEGORI_AKTIF` — ekstensi
 * lokal ke halaman ini saja, dan TIDAK dimaksudkan permanen: begitu grup
 * g-hse/g-kontrak/g-procurement diaktifkan di tahap berikutnya, baris yang
 * relevan pindah dari sini ke PETA_HREF_PORTAL/KATEGORI_AKTIF yang semestinya.
 */
const EKSTRA_PORTAL: Record<string, { key: string; label: string; href: string; icon: LucideIcon }[]> = {
  "g-subkon": [
    { key: "md-subkon", label: "Mitra", href: "/pm-portal/mandor-lengkap/mitra", icon: Building2 },
  ],
  "g-lapangan": [
    { key: "hse-inspeksi", label: "K3", href: "/pm-portal/k3", icon: ShieldAlert },
    { key: "px-dokumen", label: "Dokumen", href: "/pm-portal/dokumen", icon: FileText },
    { key: "px-jadwal", label: "Jadwal & Baseline", href: "/pm-portal/jadwal", icon: Calendar },
    { key: "px-kontrak", label: "Kontrak", href: "/pm-portal/kontrak", icon: Landmark },
    { key: "px-procurement", label: "Procurement", href: "/pm-portal/procurement", icon: ShoppingCart },
  ],
};

export default function PmKategoriPage() {
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

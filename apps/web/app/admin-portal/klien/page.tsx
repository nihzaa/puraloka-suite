"use client";

// ============================================================================
// DAFTAR KLIEN — Portal Admin/Direktur (Tahap 6)
//
// ══════════════════════════════════════════════════════════════════════════
// PENYARING AKTIF DINYATAKAN, BUKAN DIAM-DIAM
// ══════════════════════════════════════════════════════════════════════════
//
// `GET /api/v1/clients` TANPA `?all=1` hanya memulangkan klien AKTIF
// (`clients.ts` — `q.eq('is_active', true)`). Halaman yang tak menyatakan itu
// membuat orang menyimpulkan klien nonaktifnya HILANG dari sistem, lalu
// membuat ulang data yang sudah ada.
//
// Karena itu penyaringnya terlihat, bawaannya "Aktif", dan jumlah yang
// disembunyikan disebutkan begitu "Semua" dipilih.
//
// ── Kenapa halaman ini belum dipetakan ke key menu
//
// Key-nya `md-klien`, dan ia ada di grup `g-master` — grup TAHAP 7, bukan 6
// (diverifikasi ke `peta-menu.ts:92`). Mengaktifkan `g-master` sekarang
// berarti seluruh item lainnya (Users, Roles, Master data) tampil menunjuk
// href web sementara grupnya hampir kosong.
//
// Jadi halaman ini dijangkau lewat tautan di badan halaman Tender — pola yang
// sama dengan `kontrak/asuransi` (Tahap 2) yang juga tak punya entri sendiri.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Phone, Mail } from "lucide-react";
import { useData } from "@/lib/data-cache";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespKlien, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

const LABEL_JENIS: Record<string, string> = {
  perorangan: "Perorangan", perusahaan: "Perusahaan",
  pemerintah: "Pemerintah", bumn: "BUMN",
};

export default function AdminKlienPage() {
  const [tampil, setTampil] = useState<"aktif" | "semua">("aktif");

  /*
    Dua URL BERBEDA, bukan satu URL yang disaring di klien.

    Server-lah yang menyaring `is_active`, jadi memuat "aktif" lalu menyaring
    lagi di klien tak akan pernah memunculkan yang nonaktif. `?all=1` adalah
    satu-satunya cara mendapatkannya.
  */
  const { data, memuat, galat } =
    useData<RespKlien>(tampil === "semua" ? "/api/v1/clients?all=1" : "/api/v1/clients");

  const klien = useMemo(() => data?.clients ?? [], [data]);
  const nonaktif = klien.filter((k) => !k.is_active).length;

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={70} />
        <SkeletonCard tinggi={120} />
      </div>
    );
  }

  if (galat) {
    return (
      <EmptyState
        icon={Building2}
        judul="Gagal memuat daftar klien"
        deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Daftar Klien" />

      <SegmentedTab
        opsi={[
          { value: "aktif", label: "Aktif" },
          { value: "semua", label: "Semua" },
        ]}
        aktif={tampil}
        onUbah={(v) => setTampil(v as "aktif" | "semua")}
      />

      {/*
        Penyaringnya DINYATAKAN. Tanpa ini, orang menyimpulkan klien
        nonaktifnya hilang dari sistem lalu membuat ulang data yang sudah ada.
      */}
      <p style={{ ...metaKecil, margin: 0 }}>
        {tampil === "aktif"
          ? `${klien.length} klien aktif. Pilih "Semua" untuk melihat yang nonaktif juga.`
          : `${klien.length} klien${nonaktif > 0 ? ` · ${nonaktif} nonaktif` : ""}.`}
      </p>

      {klien.length === 0 ? (
        <EmptyState
          icon={Building2}
          judul={tampil === "aktif" ? "Belum ada klien aktif" : "Belum ada klien"}
          deskripsi="Klien didaftarkan lewat modul Master Data."
        />
      ) : (
        klien.map((k) => (
          <article key={k.id} style={{ ...kartu, opacity: undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  {k.company_name || k.contact_person || "Tanpa nama"}
                </h2>
                {k.company_name && k.contact_person && (
                  <div style={metaKecil}>{k.contact_person}</div>
                )}
              </div>
              {/*
                Nonaktif ditandai dengan PIL berwarna, bukan `opacity` —
                ARAH-VISUAL menegaskan: swap warna solid, tak pernah opacity,
                karena opacity membuat teks gagal kontras WCAG.
              */}
              {!k.is_active && (
                <span style={pilNonaktif}>Nonaktif</span>
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
              {k.phone && <Kontak ikon={Phone} teks={k.phone} />}
              {k.email && <Kontak ikon={Mail} teks={k.email} />}
            </div>

            <div style={{ ...metaKecil, marginTop: 8 }}>
              {k.client_type && `${LABEL_JENIS[k.client_type] ?? k.client_type}`}
              {k.npwp && ` · NPWP ${k.npwp}`}
            </div>

            {k.address && <div style={{ ...metaKecil, marginTop: 4 }}>{k.address}</div>}
          </article>
        ))
      )}

      <p style={{ ...metaKecil, margin: 0, lineHeight: 1.5 }}>
        Tender subkontraktor ada di{" "}
        <Link href="/admin-portal/tender" style={{ color: "var(--navy)", fontWeight: 600 }}>
          Tender Subkon
        </Link>.
      </p>
    </div>
  );
}

function Kontak({ ikon: Ikon, teks }: { ikon: typeof Phone; teks: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, ...metaKecil }}>
      <Ikon size={12} aria-hidden="true" />
      {teks}
    </span>
  );
}

const kartu: React.CSSProperties = {
  padding: 14, borderRadius: 14,
  background: "var(--surface)",
  border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
  boxShadow: "var(--naik-1)",
};
const metaKecil: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};
const pilNonaktif: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "3px 8px",
  borderRadius: "var(--portal-radius-pill)", flexShrink: 0,
  background: "var(--surface-subtle)", color: "var(--text-muted)",
};

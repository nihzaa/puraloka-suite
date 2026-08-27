"use client";

// ============================================================================
// Halaman index "Kategori" (Lainnya) — Portal Admin/Direktur. Tahap 0
// (Task 1). Pola PERSIS `pm-portal/lainnya/page.tsx`: grid kategori yang
// membuka `/admin-portal/kategori/[key]` (dibangun di Task 1 juga).
//
// Tahap 0: `kategoriUntukAdmin()` memulangkan array kosong (belum ada modul
// portal admin dibangun) — halaman ini akan tampil kosong sampai Tahap 1
// mengisi `KATEGORI_AKTIF`. Bukan cacat, pola sengaja sama pm-portal saat
// baru dimulai.
//
// ⚠️ `<h1>` WAJIB ada, sekalipun tampak mubazir — penjaga
// `uji-judul-halaman-ada.mjs` bisa lolos keliru kalau hanya mengandalkan
// judul dari layout leluhur (catatan sama di pm-portal/lainnya/page.tsx).
// ============================================================================

import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { kategoriUntukAdmin } from "@/lib/admin-portal-kategori";
import EmptyState from "@/components/portal/EmptyState";

export default function AdminKategoriIndexPage() {
  const kategori = kategoriUntukAdmin();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "var(--text-primary)",
          letterSpacing: "-0.01em",
          margin: 0,
        }}
      >
        Lainnya
      </h1>
      {kategori.length === 0 ? (
        <EmptyState
          icon={Folder}
          judul="Belum ada kategori"
          deskripsi="Modul portal admin akan ditambah bertahap di tahap berikutnya."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {kategori.map((g) => {
            const Ikon = (Icons as unknown as Record<string, LucideIcon>)[g.icon] ?? Folder;
            return (
              <Link
                key={g.key}
                href={`/admin-portal/kategori/${g.key}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "var(--pad-kartu-lega)",
                  borderRadius: 16,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "var(--info-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ikon size={20} color="var(--navy)" aria-hidden="true" />
                </div>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                  {g.label}
                </span>
                <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

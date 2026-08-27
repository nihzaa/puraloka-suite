"use client";

// ============================================================================
// Halaman "Lainnya" PM — Task 9: grid ikon datar (bentuk lama, Task 6-8)
// diganti navigasi berkategori. Tiap kartu kategori membuka
// /pm-portal/kategori/[key] (Task 9 juga) yang mendaftar modul di dalamnya —
// pola sama dengan Primavera/Odoo: menu = tempat kerja terorganisir, bukan
// daftar fitur datar yang makin panjang tiap tahap menambah modul.
//
// ⚠️ `<h1>` di bawah WAJIB ada, sekalipun tampak mubazir. Penjaga
// `uji-judul-halaman-ada.mjs` bisa lolos keliru karena menerima judul dari
// layout leluhur — jangan bergantung padanya (lihat catatan yang sama di
// `mandor-portal/lainnya/page.tsx`).
// ============================================================================

import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { kategoriUntukPm } from "@/lib/pm-portal-kategori";

export default function PmLainnyaPage() {
  const kategori = kategoriUntukPm();

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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {kategori.map((g) => {
          const Ikon = (Icons as unknown as Record<string, LucideIcon>)[g.icon] ?? Folder;
          return (
            <Link
              key={g.key}
              href={`/pm-portal/kategori/${g.key}`}
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
    </div>
  );
}

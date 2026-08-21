"use client";

// ============================================================================
// Beranda Portal Admin — Tahap 0 (Task 1): PLACEHOLDER RINGKAS.
//
// Bukti route+layout berfungsi, murni. Diperkaya jadi dashboard eksekutif
// sungguhan di Tahap 1 (lihat Task 2 — riset dulu, lalu Task 3 membangun).
// JANGAN membangun konten dashboard di sini.
// ============================================================================

import Link from "next/link";

export default function AdminPortalBeranda() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Portal Admin
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
        Modul akan ditambah bertahap. Dashboard eksekutif menyusul di tahap
        berikutnya.
      </p>
      <Link
        href="/admin-portal/kategori"
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          padding: "10px 20px",
          borderRadius: "var(--portal-radius-pill)",
          background: "var(--navy)",
          color: "var(--on-navy)",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Lihat semua kategori
      </Link>
    </div>
  );
}

"use client";

/**
 * LAYAR KOSONG YANG MENJELASKAN — komponen bersama SELURUH dashboard.
 *
 * ⚠ Dipindah dari `estimasi/_bersama/` ke sini pada 2026-08-19. Ia lahir di
 * modul Estimasi, tetapi penjaga `uji-layar-kosong-menjelaskan.mjs` berlaku
 * SELURUH dashboard — jadi halaman modul lain yang menyatakan dirinya kosong
 * wajib memakainya juga, dan mengimpornya dari `estimasi/_bersama` akan
 * menautkan modul yang tak berhubungan. Ditemukan saat membangun
 * `/mandor/mitra`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16 lewat sesi ber-login: tab "Material & RAP" merender
 * HALAMAN PUTIH. Bukan pesan "belum ada data" — benar-benar kosong, cuma
 * satu dropdown proyek dan ruang putih di bawahnya.
 *
 * Yang membuatnya mahal bukan kekosongannya, melainkan kekosongan yang TIDAK
 * MENJELASKAN DIRI. Pengguna tak punya cara tahu bahwa RAP butuh RAB terkunci
 * lebih dulu; layar itu terbaca sebagai "fitur belum jadi" atau "aplikasinya
 * rusak". Padahal endpoint-nya sehat dan menjawab 200 — yang kosong memang
 * datanya, dan itu keadaan yang SAH.
 *
 * ── Tiga hal yang WAJIB ada (spec §5)
 *
 *   1. APA ini          — satu kalimat bahasa lapangan, bukan istilah DB
 *   2. KENAPA kosong    — prasyarat yang belum terpenuhi
 *   3. TOMBOL ke sana   — jalan keluar, bukan jalan buntu
 *
 * Komponen ini membuat ketiganya WAJIB lewat tipe: `apa`, `kenapa`, dan
 * `aksi` bukan opsional. Layar kosong tanpa jalan keluar tak bisa ditulis
 * tanpa sengaja melawan tipenya.
 *
 * Ditegakkan juga oleh penjaga `uji-layar-kosong-menjelaskan.mjs`.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { C } from "@/lib/warna-ui";

export function LayarKosong({
  judul,
  apa,
  kenapa,
  aksi,
  ikon,
}: {
  /** Judul singkat — "Belum ada RAP untuk proyek ini". */
  judul: string;
  /** APA benda ini, satu kalimat bahasa lapangan. WAJIB. */
  apa: ReactNode;
  /** KENAPA layar ini kosong — prasyarat yang belum terpenuhi. WAJIB. */
  kenapa: ReactNode;
  /** Jalan keluarnya. WAJIB — layar kosong tanpa aksi adalah jalan buntu. */
  aksi: { label: string; href: string } | { label: string; onKlik: () => void };
  ikon?: ReactNode;
}) {
  const isiTombol = (
    <>
      {aksi.label}
      <span aria-hidden="true">→</span>
    </>
  );

  const gayaTombol: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "var(--pad-tombol)",
    borderRadius: "var(--radius-dense)",
    background: C.aksen,
    color: C.onAksen,
    border: `1px solid ${C.aksen}`,
    fontSize: "var(--teks-label)",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    textDecoration: "none",
  };

  return (
    <div
      style={{
        border: `1.5px dashed var(--border-strong)`,
        borderRadius: "var(--radius-md)",
        background: C.subtle,
        padding: "34px 26px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {ikon && (
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-sm)",
            background: "var(--aksen-lembut)",
            color: C.aksen,
            display: "grid",
            placeItems: "center",
            marginBottom: 13,
          }}
        >
          {ikon}
        </span>
      )}

      <h2
        style={{
          fontFamily: "var(--font-display), sans-serif",
          fontSize: 15,
          fontWeight: 700,
          color: C.text,
          marginBottom: 6,
          letterSpacing: "-.01em",
        }}
      >
        {judul}
      </h2>

      <p
        style={{
          fontSize: "var(--teks-label)",
          color: C.mid,
          lineHeight: 1.6,
          maxWidth: "48ch",
          marginBottom: 15,
        }}
      >
        {apa} {kenapa}
      </p>

      {"href" in aksi ? (
        <Link href={aksi.href} style={gayaTombol}>
          {isiTombol}
        </Link>
      ) : (
        <button type="button" onClick={aksi.onKlik} style={gayaTombol}>
          {isiTombol}
        </button>
      )}
    </div>
  );
}

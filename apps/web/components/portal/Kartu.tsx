"use client";

// ============================================================================
// KARTU PORTAL — permukaan bersama untuk seluruh halaman portal.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI ADA — DUA CACAT YANG SAYA ULANG DI 12 HALAMAN
// ══════════════════════════════════════════════════════════════════════════
//
// 1. KARTU HANTU. Tiap halaman portal yang saya tulis memakai
//    `border: 1px solid var(--border)` TANPA elevasi sama sekali. Sistem
//    desain ini sudah punya `--naik-1/2/3` (offset + blur, lengkap dengan
//    inset highlight untuk mode gelap) sejak lama, dan tak satu pun terpakai.
//
//    Aturan yang dilanggar: elevasi dinyatakan SEKALI — border ATAU bayangan,
//    bukan keduanya, dan bukan tak keduanya. Border 1px tanpa bayangan
//    menghasilkan permukaan yang rata seperti tabel HTML 2005; border 1px DI
//    BAWAH bayangan lebar menghasilkan "kartu hantu" yang terlihat dua kali
//    digambar.
//
//    Di sini: bayangan `--naik-1` sebagai penyata kedalaman, DITAMBAH garis
//    rambut yang nyaris tak terlihat (`color-mix` 40% dari border) semata
//    untuk memisahkan permukaan dari latar pada mode terang — bukan sebagai
//    pembatas. Pada mode gelap, `--naik-*` sudah membawa inset highlight-nya
//    sendiri.
//
// 2. NOL GERAK. Token `--gerak-kurva` (`cubic-bezier(0.16, 1, 0.3, 1)` —
//    ease-out eksponensial) sudah ada dan tak pernah dipakai di portal.
//    Kartu yang bisa diketuk tapi tak memberi umpan balik apa pun terasa
//    seperti gambar, bukan kontrol.
//
//    Gerakannya SATU: naik 1px + bayangan menguat, 220ms. Bukan skala, bukan
//    warna berubah — satu isyarat yang cukup, karena kartu bisa berjejer
//    belasan dan gerakan yang lebih besar membuat halaman gelisah.
//
// ⚠ `prefers-reduced-motion` dihormati lewat blok global di `globals.css`
//    (`animation: none !important`), tetapi transisi transform tetap perlu
//    dimatikan — ditangani `@media` di bawah komponen ini.
// ============================================================================

import type { CSSProperties, ReactNode } from "react";

export interface KartuProps {
  children: ReactNode;
  /** Kartu yang bisa diketuk — menambah umpan balik hover & fokus. */
  interaktif?: boolean;
  /** Naikkan kedalaman untuk permukaan yang memimpin halaman (KPI utama). */
  menonjol?: boolean;
  style?: CSSProperties;
  /** Elemen HTML yang dipakai — `article`/`section` untuk semantik yang benar. */
  sebagai?: "div" | "article" | "section";
}

export default function Kartu({
  children, interaktif, menonjol, style, sebagai = "div",
}: KartuProps) {
  const Tag = sebagai;
  return (
    <Tag
      className={interaktif ? "kartu-portal kartu-portal--interaktif" : "kartu-portal"}
      style={{
        // Elevasi DINYATAKAN SEKALI: bayangan. Garis rambut di bawah hanya
        // pemisah permukaan, bukan pembatas kedua.
        boxShadow: menonjol ? "var(--naik-2)" : "var(--naik-1)",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

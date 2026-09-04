"use client";

/**
 * GRUP SAAT SIDEBAR CIUT — satu ikon, sub-menu lewat flyout.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DIPERBAIKI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-12, sidebar yang diciutkan merender SELURUH ANAK sebagai ikon
 * 16px berjajar vertikal. Diukur: **128 dari 147 ikon adalah `Dot`**, dan
 * hanya **7 bentuk unik** di seluruh sidebar.
 *
 * Hasilnya deretan titik identik setinggi layar — nol informasi. Founder
 * menyebutnya "aneh icon iconnya", dan itu penilaian yang tepat: 64px yang
 * disandera untuk menampilkan sesuatu yang tak bisa dibedakan lebih buruk
 * daripada tidak menampilkan apa-apa.
 *
 * Sebabnya bukan kelalaian. `sidebar.tsx` menulisnya sendiri:
 *
 *     Sub-menu SENGAJA seragam: 202 ikon berbeda justru menghapus fungsi ikon
 *     sebagai penanda — saat semuanya bergambar, tak ada yang menonjol.
 *
 * Alasan itu BENAR untuk keadaan terbuka, tempat LABEL yang bekerja dan ikon
 * hanya penanda ritme. Ia runtuh saat diciutkan, karena labelnya hilang dan
 * yang tersisa cuma penanda ritme.
 *
 * ── Yang dilakukan sekarang
 *
 * Ciut menampilkan **ikon GRUP saja** (19 ikon, semuanya berbeda dan sudah
 * dipilih bermakna sejak migrasi 153). Sub-menunya muncul sebagai flyout di
 * sebelah kanan saat disentuh tetikus atau fokus papan tik.
 *
 * Ini pola yang dipakai Linear, Notion, dan GitHub untuk alasan yang sama:
 * navigasi dalam yang tak muat di kolom sempit tetap terjangkau tanpa memaksa
 * setiap daun punya ikon sendiri.
 *
 * ── Kenapa flyout menunda menutup
 *
 * Jarak antara ikon (64px) dan panelnya menyisakan celah beberapa piksel.
 * Tanpa jeda, menggerakkan tetikus ke arah panel menutupnya di tengah jalan —
 * dan pengguna menyimpulkan menunya rusak. Jeda 120ms cukup untuk melintas,
 * cukup singkat untuk tak terasa lengket.
 *
 * ── Papan tik
 *
 * Flyout terbuka pada `focus` dan tertutup pada `blur` yang keluar dari
 * pohonnya, jadi ia bisa dijelajahi dengan Tab tanpa tetikus sama sekali.
 * Esc menutupnya dan mengembalikan fokus ke ikon pemicunya — tanpa itu, fokus
 * terbuang ke awal dokumen dan pemakai papan tik kehilangan tempatnya.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface AnakCiut {
  key: string;
  label: string;
  href: string | null;
  /** Halaman belum ada / masih sebagian — diredupkan, bukan disembunyikan. */
  redup?: boolean;
  aktif: boolean;
}

export function GrupCiut({
  label,
  ikon,
  aktif,
  anak,
  gayaIkon,
}: {
  label: string;
  ikon: React.ReactNode;
  /** Salah satu anaknya sedang dibuka. */
  aktif: boolean;
  anak: AnakCiut[];
  gayaIkon: React.CSSProperties;
}) {
  const [buka, setBuka] = useState(false);
  const wadahRef = useRef<HTMLDivElement>(null);
  const pemicuRef = useRef<HTMLButtonElement>(null);
  const jedaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const batalJeda = useCallback(() => {
    if (jedaRef.current) {
      clearTimeout(jedaRef.current);
      jedaRef.current = null;
    }
  }, []);

  const tutupTertunda = useCallback(() => {
    batalJeda();
    // 120ms — lihat catatan "Kenapa flyout menunda menutup" di kepala berkas.
    jedaRef.current = setTimeout(() => setBuka(false), 120);
  }, [batalJeda]);

  useEffect(() => batalJeda, [batalJeda]);

  useEffect(() => {
    if (!buka) return;
    function padaTekan(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setBuka(false);
      // Fokus KEMBALI ke pemicu. Tanpa ini fokus terbuang ke awal dokumen,
      // dan pemakai papan tik harus menekan Tab belasan kali untuk kembali.
      pemicuRef.current?.focus();
    }
    document.addEventListener("keydown", padaTekan);
    return () => document.removeEventListener("keydown", padaTekan);
  }, [buka]);

  return (
    <div
      ref={wadahRef}
      style={{ position: "relative" }}
      onMouseEnter={() => { batalJeda(); setBuka(true); }}
      onMouseLeave={tutupTertunda}
      onFocus={() => { batalJeda(); setBuka(true); }}
      onBlur={(e) => {
        // Fokus yang pindah KE DALAM flyout bukan alasan menutup.
        if (!wadahRef.current?.contains(e.relatedTarget as Node)) setBuka(false);
      }}
    >
      <button
        ref={pemicuRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={buka}
        aria-label={`${label} — ${anak.length} halaman`}
        title={label}
        style={{
          ...gayaIkon,
          position: "relative",
          background: aktif ? "var(--navy-light)" : "transparent",
          color: aktif ? "var(--navy)" : "var(--text-secondary)",
        }}
      >
        {ikon}
        {/*
          Penanda "grup ini aktif" saat diciutkan: garis tipis di tepi kiri.
          Warna latar saja tak cukup terbaca pada layar berkontras rendah —
          dan sidebar dipakai sepanjang hari di layar laptop kantor yang
          jarang dikalibrasi.
        */}
        {aktif && (
          <span
            aria-hidden
            style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
              width: 3, height: 18, borderRadius: "0 2px 2px 0",
              background: "var(--navy)",
            }}
          />
        )}
      </button>

      {buka && (
        <div
          role="menu"
          aria-label={label}
          style={{
            position: "absolute", left: "100%", top: 0, zIndex: 60,
            // 6px jarak dari ikon: cukup untuk terbaca sebagai lapisan
            // terpisah, cukup rapat supaya tetikus tak keluar saat melintas.
            marginLeft: 6, minWidth: 220, maxWidth: 280,
            padding: "6px 0",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--naik-3)",
            maxHeight: "min(70vh, 520px)", overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "6px 12px 8px", fontSize: "var(--t-mikro)", fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: "var(--text-muted)", whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>

          {anak.map((a) => (
            <Link
              key={a.key}
              href={a.href ?? "#"}
              role="menuitem"
              onClick={() => setBuka(false)}
              style={{
                display: "block", padding: "7px 12px",
                fontSize: 12.5, lineHeight: 1.45,
                color: a.aktif
                  ? "var(--navy)"
                  : a.redup
                    ? "var(--text-muted)"
                    : "var(--text-secondary)",
                fontWeight: a.aktif ? 600 : 400,
                background: a.aktif ? "var(--navy-light)" : "transparent",
                textDecoration: "none",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
              onMouseEnter={(e) => {
                if (!a.aktif) e.currentTarget.style.background = "var(--surface-hover)";
              }}
              onMouseLeave={(e) => {
                if (!a.aktif) e.currentTarget.style.background = "transparent";
              }}
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

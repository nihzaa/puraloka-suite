"use client";

/**
 * NAV BAGIAN — navigasi antar-halaman dalam satu modul, menggantikan tab.
 *
 * ── Kenapa rute, bukan tab (R-012, diratifikasi founder 2026-08-04)
 *
 * Halaman Keuangan memuat 3.449 baris dalam enam tab; Mandor 3.667. Yang
 * rusak dari itu bukan cuma ukuran berkasnya:
 *
 *   • **Tab tak ada di URL.** Muat ulang halaman → kembali ke Overview.
 *     Tab tak bisa dikirim ke rekan ("lihat yang di tab Kasbon" harus
 *     disertai instruksi klik). Tombol Kembali peramban melompati seluruh
 *     modul, bukan ke tab sebelumnya.
 *   • **Semua tab dimuat sebagai satu bundel.** Membuka Overview tetap
 *     mengunduh kode enam tab.
 *   • **Judul tab peramban sama untuk keenamnya** — lima tab terbuka
 *     bertuliskan "Keuangan" semua.
 *
 * Rute nyata memperbaiki keempatnya sekaligus, dan Next.js memberi
 * pemecahan kode per rute tanpa diminta.
 *
 * ── Kenapa tampilannya tetap seperti tab
 *
 * Perpindahan sadar: orang yang hafal letak "Kasbon" tak perlu belajar
 * ulang. Yang berubah adalah URL-nya ikut berpindah — itu peningkatan yang
 * tak perlu dijelaskan, cukup dirasakan saat tombol Kembali bekerja.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface Bagian {
  /** Path lengkap, mis. "/keuangan/invoice". */
  href: string;
  label: string;
  /** Angka di sebelah label — mis. jumlah yang menunggu keputusan.
   *  Kosongkan kalau nol: lencana "0" menambah kebisingan tanpa menambah
   *  informasi. */
  jumlah?: number;
  /** Tandai lencana sebagai mendesak (merah), bukan sekadar hitungan. */
  mendesak?: boolean;
}

export function NavBagian({ bagian }: { bagian: Bagian[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bagian modul"
      style={{
        display: "flex", gap: 2, alignItems: "center",
        borderBottom: "1px solid var(--border)",
        overflowX: "auto", scrollbarWidth: "thin",
      }}
    >
      {bagian.map((b) => {
        // Cocok PERSIS untuk akar modul, awalan untuk sisanya — kalau tidak,
        // "/keuangan" akan selalu aktif bersama anak-anaknya.
        const akarModul = b.href.split("/").filter(Boolean).length === 1;
        const aktif = akarModul ? pathname === b.href : pathname.startsWith(b.href);

        return (
          <Link
            key={b.href}
            href={b.href}
            // `aria-current="page"` bukan hiasan: tanpa itu, pemakai pembaca
            // layar tak tahu bagian mana yang sedang terbuka — warna dan
            // garis bawah tak terbaca sama sekali.
            aria-current={aktif ? "page" : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", fontSize: 13,
              fontWeight: aktif ? 600 : 500,
              color: aktif ? "var(--aksen)" : "var(--text-secondary)",
              borderBottom: `2px solid ${aktif ? "var(--aksen)" : "transparent"}`,
              marginBottom: -1,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "color 120ms ease",
            }}
          >
            {b.label}
            {b.jumlah != null && b.jumlah > 0 && (
              <span
                style={{
                  fontSize: 11, fontWeight: 700, lineHeight: 1,
                  padding: "2px 6px", borderRadius: 99,
                  fontVariantNumeric: "tabular-nums",
                  background: b.mendesak ? "var(--danger-bg)" : "var(--surface-hover)",
                  color: b.mendesak ? "var(--on-danger-bg)" : "var(--text-secondary)",
                  border: `1px solid ${b.mendesak ? "var(--danger-border)" : "var(--border)"}`,
                }}
              >
                {b.jumlah}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

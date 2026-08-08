"use client";

/**
 * BUAT CEPAT — tombol "+" di topbar, seperti "Quick Create" referensi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DAFTARNYA DISARING PERMISSION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi menampilkan satu tombol "Quick Create" untuk semua orang. Di ERP
 * multi-tenant itu tak bisa: mandor tak boleh membuat proyek, dan menawarkan
 * "Proyek baru" kepadanya berarti dua klik menuju halaman yang tombol
 * tambahnya memang tak ada di sana.
 *
 * Penyaringnya `lib/buat-cepat.ts` (9 test), termasuk satu test yang
 * MEMERIKSA TIAP `href` KE DISK — cacat "menu menuju 404" sudah pernah
 * terjadi di rail beranda dan tak boleh terulang lewat pintu baru.
 *
 * ── Kenapa `<Link>`, bukan modal
 *
 * Pembuatan di aplikasi ini terjadi lewat modal DI ATAS halaman daftar. Menu
 * ini mengantar ke halaman itu; membangun modal kedua di topbar berarti dua
 * jalur untuk pekerjaan yang sama — dan dua tempat yang harus diperbaiki
 * setiap kali formulirnya berubah.
 *
 * ── Menutup dengan Esc dan klik-luar
 *
 * Wajib, bukan pemanis: menu yang hanya bisa ditutup dengan mengklik tombolnya
 * lagi menjebak pemakai keyboard. `modal-esc-ratchet` menjaga aturan ini untuk
 * dialog, dan tak ada alasan menu berperilaku berbeda.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus, Building2, FileText, Wallet, Coins, ShoppingCart, Users,
} from "lucide-react";
import { hasPermission } from "@/lib/api";
import { saringAksi, type AksiBuat } from "@/lib/buat-cepat";

const IKON = { Building2, FileText, Wallet, Coins, ShoppingCart, Users } as const;

export function BuatCepat() {
  const [buka, setBuka] = useState(false);
  const [aksi, setAksi] = useState<AksiBuat[]>([]);
  const bungkus = useRef<HTMLDivElement>(null);

  /*
   * Permission dibaca di efek, bukan saat render.
   *
   * `hasPermission()` membaca localStorage — tak ada di server. Memanggilnya
   * langsung di badan komponen membuat hasil render server berbeda dari klien,
   * dan React membuang seluruh pohonnya dengan galat hidrasi.
   */
  useEffect(() => {
    setAksi(saringAksi(hasPermission));
  }, []);

  useEffect(() => {
    if (!buka) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBuka(false);
    }
    function onKlik(e: MouseEvent) {
      if (!bungkus.current?.contains(e.target as Node)) setBuka(false);
    }
    window.addEventListener("keydown", onKey);
    // `mousedown`, bukan `click`: dengan `click`, menekan tautan di dalam menu
    // kadang menutup menu sebelum navigasi terjadi.
    document.addEventListener("mousedown", onKlik);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onKlik);
    };
  }, [buka]);

  // Tak punya izin membuat apa pun = tak ada tombol. Tombol yang membuka menu
  // kosong lebih membingungkan daripada tak ada tombol sama sekali.
  if (aksi.length === 0) return null;

  return (
    <div ref={bungkus} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setBuka((b) => !b)}
        aria-haspopup="menu"
        aria-expanded={buka}
        /* Label teks lepas di layar sempit, jadi aria-label wajib — sama
           alasannya dengan tombol Cari di sebelahnya. */
        aria-label="Buat baru"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 34, padding: "0 12px",
          borderRadius: 6, border: "1px solid transparent",
          /*
            `--on-navy`, BUKAN `--on-merek`. Keduanya putih di mode terang,
            jadi salah pilih tak terlihat sama sekali di sana — dan itulah
            yang saya lakukan.

            Di mode gelap `--navy` berbalik jadi biru TERANG: putih di atasnya
            cuma 2,72:1 (axe: serious), sementara `--on-navy` yang ikut
            berbalik jadi teks gelap memberi 6,72:1. `--on-merek` sengaja
            TIDAK berbalik — ia untuk gradasi merek yang tetap gelap di kedua
            mode.

            Nilai heksanya sengaja TIDAK ditulis di sini: `hex-ratchet` tak
            bisa membedakan hex di komentar dari hex di kode, dan komentar
            saya sendiri sudah dua kali memerahkannya. Nilainya ada di
            `globals.css`, satu-satunya tempat yang benar untuk mencarinya.
          */
          background: "var(--navy)", color: "var(--on-navy)",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          transition: "filter 150ms ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.12)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
      >
        <Plus size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span className="e11-sembunyi-sempit" style={{ whiteSpace: "nowrap" }}>Buat</span>
      </button>

      {buka && (
        <div
          role="menu"
          aria-label="Buat baru"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            minWidth: 208, padding: 4, zIndex: 50,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--rad-sedang)",
            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
          }}
        >
          {aksi.map((a) => {
            const Ikon = IKON[a.ikon];
            return (
              <Link
                key={a.href}
                href={a.href}
                role="menuitem"
                onClick={() => setBuka(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: "var(--rad-kecil)",
                  fontSize: 13, color: "var(--text-primary)",
                  textDecoration: "none", transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span aria-hidden="true" style={{
                  display: "grid", placeItems: "center", flexShrink: 0,
                  width: 24, height: 24, borderRadius: "var(--rad-kecil)",
                  background: "var(--navy-light)", color: "var(--navy)",
                }}>
                  <Ikon size={13} />
                </span>
                {a.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

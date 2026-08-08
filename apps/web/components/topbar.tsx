"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Command } from "lucide-react";
import { NotificationPanel } from "@/components/notification-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { CompanySwitcher } from "@/components/company-switcher";
import { BuatCepat } from "@/components/buat-cepat";

/**
 * Rute → nama yang ditampilkan di breadcrumb.
 *
 * Pencocokannya `pathname === prefix || pathname.startsWith(prefix + "/")`
 * — dengan garis miring. Itu membuat "/mandor" TIDAK cocok dengan
 * "/mandor-portal", jadi urutan entri di sini tidak menentukan.
 *
 * (Saya sempat menulis komentar bahwa "/mandor-portal" harus di atas
 * "/mandor". Itu keliru — uji mutasi yang menukar urutannya tetap
 * hijau, dan setelah dibaca ulang memang tak ada bedanya. Yang menjaga
 * batas segmen adalah garis miring di pencocokan, bukan urutan.
 * Kalau pencocokannya nanti diubah jadi `startsWith(prefix)` polos,
 * urutan langsung jadi penting — dan test `topbar.test.ts` akan merah.)
 */
const breadcrumbMap: Array<[string, string]> = [
  ["/mandor-portal", "Portal Mandor"],
  ["/pm-portal",     "Portal PM"],
  ["/portal",        "Portal Klien"],
  ["/dashboard",     "Dashboard"],
  ["/proyek",        "Proyek"],
  ["/keuangan",      "Keuangan"],
  ["/kas",           "Kas"],
  ["/piutang",       "Piutang"],
  ["/mandor",        "Mandor"],
  ["/laporan",       "Laporan"],
  ["/klien",         "Klien"],
  ["/procurement",   "Pengadaan"],
  ["/estimasi",      "Estimasi & RAB"],
  ["/akuntansi",     "Akuntansi"],
  ["/aset",          "Alat & Aset"],
  ["/lapangan",      "Operasi Lapangan"],
  ["/kontrak",       "Kontrak"],
  ["/mutu",          "Mutu (QA/QC)"],
  ["/tender",        "Tender"],
  ["/users",         "User"],
  ["/audit",         "Audit Trail"],
  ["/kalender",      "Kalender"],
  ["/sistem",        "Sistem"],
  ["/notifications", "Notifikasi"],
  ["/pengaturan",    "Pengaturan"],
];

/**
 * Nama halaman untuk breadcrumb.
 *
 * ── Kenapa cadangannya BUKAN "Dashboard"
 *
 * Sampai 2026-08-05 fungsi ini diakhiri `return "Dashboard"`. Petanya
 * memuat 14 entri untuk 60 halaman, jadi **32 halaman — lebih dari
 * separuh — menampilkan "Dashboard"** di breadcrumb. Termasuk seluruh
 * portal mandor dan portal klien: mandor yang membuka penagihannya
 * sendiri melihat tulisan "Puraloka Suite / Dashboard".
 *
 * Itu lebih buruk daripada breadcrumb yang tak ada. Breadcrumb kosong
 * cuma tak menolong; breadcrumb yang salah secara aktif membohongi orang
 * tentang di mana ia berada — dan karena selalu menyebut nama halaman
 * yang sah, tak ada yang menyadarinya sebagai kerusakan.
 *
 * Cadangannya sekarang menurunkan nama dari rutenya sendiri. Halaman
 * baru yang belum terdaftar akan tampil apa adanya ("Uji Gulir") —
 * terlihat mentah, dan itu memang tujuannya: yang mentah menuntut
 * diperbaiki, yang berbohong tidak.
 */
export function getPageTitle(pathname: string): string {
  for (const [prefix, label] of breadcrumbMap) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return label;
  }
  const potongan = pathname.split("/").filter(Boolean)[0];
  if (!potongan) return "Beranda";
  return potongan
    .split("-")
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(" ");
}

export function Topbar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const [unreadCount, setUnreadCount] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleCountChange = useCallback((count: number) => setUnreadCount(count), []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          // Ikut lebar layar, sama seperti padding halaman. Dulu 24px mati:
          // di layar 360px topbar sendirian menyumbang 176px overflow.
          padding: "0 clamp(12px, 3vw, 24px)",
          gap: 8,
          flexShrink: 0,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 1px 0 var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Breadcrumb + perusahaan aktif.
            Switcher ditaruh di KIRI bersama breadcrumb, bukan di antara tombol
            aksi di kanan: perusahaan aktif adalah KONTEKS halaman ini — sekelas
            dengan "sedang di halaman apa" — bukan sesuatu yang dilakukan.
            Ia menampilkan diri hanya bila user punya lebih dari satu perusahaan. */}
        {/* `minWidth: 0` WAJIB: anak flex menolak menyusut di bawah lebar
            alami isinya (min-width:auto), jadi breadcrumb panjang mendorong
            seluruh topbar melebar dan memaksa scroll horizontal SEHALAMAN —
            gejalanya tampak seperti "halamannya kelebaran", padahal
            penyebabnya di sini. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          {/* "Puraloka Suite /" dilepas di layar sempit — nama aplikasi tak
              memberi informasi apa pun kepada orang yang SUDAH ada di
              dalamnya, sementara nama halaman memberi. Yang dikorbankan
              adalah yang paling sedikit gunanya, bukan yang paling mudah. */}
          <span className="e11-sembunyi-sempit" style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Puraloka Suite</span>
          <span className="e11-sembunyi-sempit" style={{ fontSize: 13, color: "var(--border-strong)" }}>/</span>
          <span style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
            // Judul panjang dipotong dengan elipsis, bukan mendorong layout.
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
          }}>{title}</span>
          <div style={{ marginLeft: 10, flexShrink: 0 }}>
            <CompanySwitcher />
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {/* Search trigger — looks like an input bar */}
          <button
            onClick={() => setPaletteOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              height: 34, padding: "0 10px 0 12px",
              borderRadius: 6,
              background: "var(--surface-subtle)",
              border: "1px solid var(--border)",
              cursor: "pointer", color: "var(--text-muted)",
              fontSize: 13, transition: "all 0.15s",
              // Dulu `minWidth: 180` mati — penyumbang overflow terbesar di
              // topbar. Di layar sempit tombol ini menciut jadi ikon saja
              // (label "Cari..." + hint Ctrl-K disembunyikan lewat CSS), jadi
              // fungsinya tetap ada dan target sentuhnya tetap ≥34px.
              minWidth: 0,
            }}
            // Label teksnya lepas di layar sempit (lihat span di bawah), jadi
            // aria-label WAJIB — tanpa itu pembaca layar hanya menemukan tombol
            // tanpa nama. Ia juga tetap benar di layar lebar, karena isinya
            // sama dengan label yang terlihat.
            aria-label="Cari (Ctrl+K)"
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "var(--navy)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span className="e11-sembunyi-sempit" style={{ flex: 1, whiteSpace: "nowrap" }}>Cari...</span>
            <kbd className="e11-sembunyi-sempit" style={{
              display: "flex", alignItems: "center", gap: 2,
              padding: "0px 4px", borderRadius: 6,
              background: "var(--surface)", border: "1px solid var(--border)",
              fontSize: 10, color: "var(--text-muted)", flexShrink: 0,
            }}>
              <Command size={9} /> K
            </kbd>
          </button>

          {/*
            "Buat" ditaruh SESUDAH pencarian dan SEBELUM tema/notifikasi.
            Referensi menaruh Quick Create paling kiri di gugus kanan, dan
            urutan itu benar: mencari & membuat adalah aksi yang dituju
            sengaja, sementara tema dan lonceng adalah kontrol sekunder.

            Ia menyembunyikan dirinya sendiri kalau pemakai tak berhak
            membuat apa pun — lihat `BuatCepat`.
          */}
          <BuatCepat />
          <ThemeToggle />
          <NotificationPanel
            unreadCount={unreadCount}
            onCountChange={handleCountChange}
          />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

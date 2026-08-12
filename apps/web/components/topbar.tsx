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
  // "Mutu & K3", bukan "Mutu (QA/QC)". Nama kedua itu milik GRUP SIDEBAR
  // `g-qaqc` — yang sejak migrasi 323 bernama "Rencana & Uji Mutu" dan isinya
  // rencana mutu, uji material, audit. Halaman `/mutu` sendiri adalah ikhtisar
  // grup "Mutu & K3" (NCR, kepatuhan, insiden).
  //
  // Breadcrumb yang menyebut nama grup LAIN membuat orang mengira ia salah
  // klik — dan tampak jelas di tangkapan layar founder: judul halaman
  // "Mutu & K3", breadcrumb "Mutu (QA/QC)".
  ["/mutu",          "Mutu & K3"],
  ["/tender",        "Tender"],
  ["/users",         "User"],
  ["/audit",         "Audit Trail"],
  ["/kalender",      "Kalender"],
  ["/sistem",        "Sistem"],
  ["/notifications", "Notifikasi"],
  ["/pengaturan",    "Pengaturan"],
  // Tanpa entri ini, breadcrumb menebak dari URL dan menampilkan
  // "Approval Inbox" — bahasa Inggris di aplikasi yang seluruhnya
  // berbahasa Indonesia. Ketahuan lewat tangkap-layar, bukan lewat kode.
  ["/approval-inbox", "Menunggu Persetujuan"],
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

          {/*
            PENCARIAN DI KIRI — diputuskan founder 2026-08-08 dari perbandingan
            berdampingan, mengikuti referensi yang menaruhnya lebar dekat logo.

            Sebelumnya ia di gugus kanan dan MENCIUT jadi ikon. Konsekuensinya:
            fungsi yang paling sering dipakai justru jadi sasaran paling kecil.
            Di kiri ia punya ruang untuk melebar, dan `maxWidth` menjaganya
            tidak menelan breadcrumb di layar sedang.

            Breadcrumb TIDAK dibuang meski referensi tak punya: ia menjawab
            "saya di mana" pada aplikasi 105 halaman — referensi hanya punya
            belasan, jadi ketiadaannya di sana bukan bukti ia tak berguna.
          */}
          <div style={{ marginLeft: 12, flex: 1, minWidth: 0, maxWidth: 420 }}>
            <TombolCari onClick={() => setPaletteOpen(true)} />
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
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

/**
 * Tombol pencarian — tampil seperti kolom input, padahal membuka palet.
 *
 * Dipisah jadi komponen saat ia dipindah ke kiri (2026-08-08): di tempat
 * barunya ia MELEBAR mengisi ruang, bukan lagi menciut jadi ikon di kanan.
 *
 * `width: 100%` di sini, `maxWidth` diatur pembungkusnya. Pembagian itu
 * disengaja: tombolnya tak perlu tahu berapa ruang yang tersedia, dan
 * pembungkusnya tak perlu tahu isi tombol.
 */
function TombolCari({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", height: 34, padding: "0 10px 0 12px",
        borderRadius: 8,
        background: "var(--surface-subtle)",
        border: "1px solid var(--border)",
        cursor: "pointer", color: "var(--text-muted)",
        fontSize: 13, transition: "all 0.15s",
        // `minWidth: 0` tetap wajib walau kini melebar: tanpa itu anak flex
        // menolak menyusut di bawah lebar alami isinya, dan di layar sedang
        // ia mendorong breadcrumb keluar — cacat yang sama seperti dulu,
        // hanya arahnya terbalik.
        minWidth: 0,
      }}
      // Label teksnya lepas di layar sempit (span di bawah), jadi aria-label
      // WAJIB — tanpa itu pembaca layar hanya menemukan tombol tanpa nama.
      aria-label="Cari (Ctrl+K)"
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--navy)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      <Search size={13} style={{ flexShrink: 0 }} />
      {/*
        Placeholder deskriptif seperti referensi ("Search projects, sites,
        contractors...") — bukan "Cari..." yang tak memberi tahu apa yang
        bisa dicari. Di layar sempit ia lepas dan ikonnya tetap cukup.
      */}
      <span className="e11-sembunyi-sempit" style={{
        flex: 1, minWidth: 0, textAlign: "left", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
      }}>
        Cari proyek, invoice, mandor, dokumen...
      </span>
      <kbd className="e11-sembunyi-sempit" style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "0px 4px", borderRadius: 6,
        background: "var(--surface)", border: "1px solid var(--border)",
        fontSize: 10, color: "var(--text-muted)", flexShrink: 0,
      }}>
        <Command size={9} /> K
      </kbd>
    </button>
  );
}

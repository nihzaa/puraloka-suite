"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Command } from "lucide-react";
import { NotificationPanel } from "@/components/notification-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { CompanySwitcher } from "@/components/company-switcher";
import { BuatCepat } from "@/components/buat-cepat";
import { RemahHalaman } from "@/components/remah-halaman";

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
  ["/dashboard",     "Beranda"],
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
  ["/aset",          "Aset & Alat"],
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
  ["/users",         "Pengguna"],
  ["/audit",         "Audit Log"],
  ["/kalender",      "Kalender"],
  ["/sistem",        "Sistem"],
  ["/notifications", "Notifikasi"],
  ["/pengaturan",    "Pengaturan"],
  // Tanpa entri ini, breadcrumb menebak dari URL dan menampilkan
  // "Approval Inbox" — bahasa Inggris di aplikasi yang seluruhnya
  // berbahasa Indonesia. Ketahuan lewat tangkap-layar, bukan lewat kode.
  ["/approval-inbox", "Menunggu Persetujuan"],

  // ── Sebelas modul yang sebelumnya JATUH KE TEBAKAN URL ────────────────
  //
  // Diukur 2026-08-12: `/sdm/timesheet` menampilkan **"Sdm"** di breadcrumb.
  // Cadangan yang menurunkan nama dari rute memang sengaja terlihat mentah
  // ("yang mentah menuntut diperbaiki, yang berbohong tidak" — lihat komentar
  // `getPageTitle`), dan ini penagihan janji itu.
  //
  // Namanya diambil dari label GRUP SIDEBAR di `menu_items`, bukan dikarang:
  // orang yang mengklik grup "SDM & Payroll" harus membaca kata yang sama di
  // breadcrumb, atau ia mengira mendarat di tempat lain.
  ["/sdm",           "SDM & Payroll"],
  ["/gudang",        "Gudang & Material"],
  ["/dokumen",       "Dokumen"],
  ["/jadwal",        "Perencanaan & Jadwal"],
  ["/kepatuhan",     "Risiko & Kepatuhan"],
  ["/risiko",        "Risiko & Kepatuhan"],
  ["/k3",            "K3 & Lingkungan"],
  ["/master",        "Master Data"],
  ["/otomasi",       "AI & Otomasi"],
  // Dua rute alat, bukan modul bisnis — tak punya grup sidebar. Diberi nama
  // apa adanya supaya tak muncul sebagai "M" (satu huruf) di breadcrumb.
  ["/peta-modul",    "Peta Modul"],
  ["/m",             "Pintasan"],
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
          {/*
            Label MODUL — hasil pencocokan prefix, jadi seluruh `/keuangan/*`
            menghasilkan "Keuangan". Warnanya diredupkan karena ia kini
            tingkat TENGAH, bukan akhir: yang tebal adalah tempat orang
            berada sekarang, bukan lorong yang dilewatinya.
          */}
          <span style={{
            fontSize: 13, fontWeight: 500, color: "var(--text-secondary)",
            // Judul panjang dipotong dengan elipsis, bukan mendorong layout.
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
          }}>{title}</span>

          {/*
            Tingkat terakhir: nama HALAMAN dari `menu_items`.

            Tanpa ini `/keuangan/kasbon` berhenti di "Keuangan" — breadcrumb
            yang tak pernah menyebut halaman yang sedang dibuka. Diukur
            2026-08-12, itu berlaku untuk seluruh sub-halaman.

            Ia menampilkan diri HANYA bila labelnya berbeda dari modul, jadi
            halaman ikhtisar tidak berbunyi "Keuangan / Keuangan".
          */}
          <RemahHalaman modul={title} />
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
          {/*
            `maxWidth` 560, bukan 420.

            Diukur 2026-08-12 pada 1600px: pencarian berakhir di x=1052 dan
            gugus kanan mulai di x=1420 — **368px kosong** di tengah topbar,
            sementara kolom pencariannya sendiri dibatasi 420px.

            Ruang kosong itu bukan napas; ia jarak yang harus dilintasi mata
            antara dua gugus yang sama-sama padat. Batas tetap ada supaya di
            layar sangat lebar kolomnya tak jadi selokan panjang, tapi 420
            terlalu ketat untuk layar kantor yang lazim di sini.
          */}
          <div style={{ marginLeft: 12, flex: 1, minWidth: 0, maxWidth: 560 }}>
            <TombolCari onClick={() => setPaletteOpen(true)} />
          </div>
        </div>

        {/*
          Gugus kanan. `gap: 8` bukan 4: lencana "99+" pada lonceng meluber
          keluar kotak ikonnya, dan dengan jarak 4px ia memotong tepi tombol
          tema di sebelahnya — terlihat seperti kerusakan render, bukan
          keputusan. Diukur dari tangkapan layar, bukan dari kode.
        */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
        // 38px, setinggi tombol "Buat"/tema/lonceng di gugus kanan.
        //
        // Topbar sempat memuat dua tinggi (34 dan 36) dan tiga radius. Pada
        // bar setinggi 56px, unsur 34px menyisakan 11px di atas-bawah dan
        // unsur 38px menyisakan 9 — selisih yang tak terbaca sebagai angka
        // tapi membuat barisnya tampak tak duduk pada satu garis.
        width: "100%", height: 38, padding: "0 10px 0 12px",
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

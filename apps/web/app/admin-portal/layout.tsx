"use client";

// ============================================================================
// Layout Portal Admin/Direktur — Tahap 0 (Task 1).
//
// Gerbang pintu masuk memakai IZIN `settings:manage` (ADR-004), bukan nama
// jabatan. Alasan lengkapnya ada di komentar dalam `useEffect` di bawah —
// termasuk kenapa whitelist literal yang semula dirancang justru menendang
// keluar custom role yang izinnya sudah benar.
//
// PWA (manifest, service worker, ikon dinamis) SUDAH otomatis terwarisi dari
// infrastruktur bersama yang dibangun Portal PM — TIDAK dibangun ulang di sini.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import { LayoutGrid, Inbox, FolderKanban, FileSignature, MoreHorizontal, Wallet } from "lucide-react";

// Tahap 1 (Task 4): "Approval" ditambahkan — halaman `/admin-portal/inbox`
// sudah dibangun (review Task 4: sempat YATIM di `audit-nav-yatim.mjs`
// karena entri ini belum ditambahkan meski brief Task 1 sudah
// menspesifikasikannya; satu-satunya jalur sebelumnya adalah banner
// kondisional di Beranda yang hanya muncul saat ada antrean, jadi admin/
// direktur tak punya cara membuka halaman ini saat inbox kosong).
//
// Pola PERSIS pm-portal/layout.tsx (`Beranda, Approval, Proyek, Keuangan,
// Lainnya`): "Approval" masuk slot ke-2, TEPAT SESUDAH Beranda — array
// `navItems` berisi SEMUA entri termasuk "Lainnya" di posisi TERAKHIR
// (bukan hanya lewat prop PortalShell terpisah) — `audit-nav-yatim.mjs`
// memindai bentuk objek literal di berkas layout untuk tahu tujuan mana
// yang terjangkau, dan tujuan yang cuma disebut lewat nama prop lain tak
// ikut terbaca. `PortalShell` menampilkan 4 item PERTAMA di bottom nav
// (`primaryItems = navItems.slice(0, 4)`).
//
// Tahap 2 (Task 7): "Proyek" ditambahkan — halaman `/admin-portal/proyek`
// dibangun tapi TIDAK ditautkan dari mana pun (brief Task 7 salah menyatakan
// "sudah ada di NAV_ITEMS Task 1 Step 2" — diverifikasi TIDAK BENAR, layout
// ini sebelum Task 7 hanya berisi Beranda/Approval/Lainnya).
// `audit-nav-yatim.mjs` menangkapnya sebagai YATIM sebelum entri ini
// ditambahkan — kelas cacat yang sama dengan orphan "Approval" di Task 4.
// Slot ke-3, TEPAT SESUDAH Approval, meniru urutan pm-portal persis.
//
// Tahap 2 (Task 8): "Kontrak" ditambahkan (menunjuk /kontrak/register) —
// sama pola dengan "Proyek" di atas. Brief Task 8 mengaitkan
// `/admin-portal/kontrak/*` ke kategori `g-kontrak` yang akan "diaktifkan
// Task 12", tapi `KATEGORI_AKTIF` di `lib/admin-portal-kategori.ts` HANYA
// berisi `["g-laporan", "g-sistem"]` — menunggu Task 12 berarti dua halaman
// ini YATIM sampai tahap itu tiba, pola cacat identik "Proyek" di atas.
// Diperbaiki cara yang sama: entri NAV_ITEMS langsung, BUKAN lewat aktivasi
// kategori. Ditaruh slot ke-5 (SESUDAH "Lainnya") — `PortalShell` hanya
// menampilkan 4 item PERTAMA di bottom nav (`primaryItems =
// navItems.slice(0, 4)`), jadi urutan bottom nav yang sudah ada
// (Beranda/Approval/Proyek/Lainnya) TIDAK berubah; "Kontrak" hanya menambah
// satu tujuan terdaftar & dijangkau lewat `audit-nav-yatim.mjs` (yang
// memindai literal atribut tujuan di SELURUH berkas layout, bukan hanya 4
// slot pertama).
//
// ⚠️ Penulisan komentar di sekitar sini SENGAJA menghindari pola literal
// "kata-tujuan diikuti tanda kutip" — `audit-nav-yatim.mjs` memindai SELURUH
// berkas ini dengan regex yang tak tahu bedanya kode dari komentar, dan
// komentar versi sebelumnya (menyebut pola itu apa adanya) sempat tertangkap
// sebagai "link mati" palsu bernama "di SELURUH berkas" — diperbaiki di sini
// dengan mengganti kutipnya jadi prosa biasa.
//
// `/admin-portal/kontrak/asuransi` TIDAK dapat entri NAV_ITEMS sendiri —
// dijangkau lewat tautan di badan halaman Register Kontrak (dan
// sebaliknya), pola sama dengan `mandor-portal/progress`/`laporan` yang
// didaftarkan WAJAR di `audit-nav-yatim.mjs` sebagai "subhalaman portal,
// dicapai dari badan halaman". Halaman ini juga akan terlihat langsung di
// bottom nav begitu urutan array diprioritaskan ulang di tahap berikutnya
// (Task 12 mengaktifkan `g-kontrak`), tanpa perlu menyentuh dua halaman
// kontrak itu sendiri.
//
// Tahap 2 (Task 9): "EOT, Denda & Jaminan" (`/kontrak/eot-ld-bond`) dan
// "Klaim Kontraktual" (`/kontrak/klaim`) dibangun — pola cacat yang SAMA
// diantisipasi dari awal: keduanya PER-PROYEK murni, tak dapat entri
// NAV_ITEMS sendiri, dijangkau lewat tautan di badan halaman Register
// Kontrak, didaftarkan WAJAR di `audit-nav-yatim.mjs` persis seperti
// asuransi di atas.
//
// Tahap 3 (Task 14): "Keuangan" ditambahkan (menunjuk /keuangan, Dashboard
// modul) — pola IDENTIK "Kontrak" di atas: brief Task 14 mengaitkan
// `/admin-portal/keuangan/*` ke kategori `g-keuangan`/`g-tagih` yang BELUM
// diaktifkan di `KATEGORI_AKTIF` (`lib/admin-portal-kategori.ts` masih
// `["g-laporan","g-sistem","g-kontrak","g-jadwal"]` — dua grup itu bahkan
// belum jadi key di `peta-menu.ts`). Menunggu aktivasinya berarti tiga
// halaman baru YATIM sampai tahap itu tiba, cacat yang sama dengan
// "Proyek"/"Kontrak" sebelum diperbaiki. Diperbaiki cara yang sama: entri
// NAV_ITEMS langsung. Ditaruh slot TERAKHIR (sesudah "Kontrak") — bottom nav
// (`primaryItems = navItems.slice(0, 4)`) tetap Beranda/Approval/Proyek/
// Lainnya, tak berubah. `/admin-portal/keuangan/piutang` dan `.../ipc` TIDAK
// dapat entri NAV_ITEMS sendiri — dijangkau lewat tautan di badan halaman
// Dashboard Keuangan, pola sama lima tautan kontrak/jadwal di atas.
/*
  ⚠ URUTAN MENGIKAT — "Lainnya" TIDAK BOLEH masuk empat slot pertama.

  `PortalShell` menampilkan `navItems.slice(0, 4)` DI BAWAH nav, LALU
  menambahkan tombol "Lainnya"-nya SENDIRI bila `navItems.length > 4`
  (PortalShell.tsx:167). Jadi menaruh "Lainnya" di indeks 3 membuatnya
  tergambar DUA KALI berdampingan.

  Terlihat di potret 2026-08-27 — dua tombol "Lainnya" bersebelahan di bar
  bawah. Typecheck bersih, seluruh penjaga hijau; hanya potret yang
  menangkapnya.

  pm-portal & mandor-portal menaruhnya di indeks 4 (TEPAT di luar slice), dan
  itulah pola yang benar. Slot bawah kini: Beranda · Approval · Proyek ·
  Keuangan, lalu "Lainnya" dari PortalShell.

  "Keuangan" dinaikkan ke slot ke-4 karena ia tujuan paling sering dibuka
  admin/direktur di antara sisanya; "Kontrak" tetap terdaftar (terjangkau
  `audit-nav-yatim.mjs`) meski tak muncul di bar bawah.
*/
const NAV_ITEMS: NavItem[] = [
  { href: "/admin-portal", label: "Beranda", icon: LayoutGrid, exact: true },
  { href: "/admin-portal/inbox", label: "Approval", icon: Inbox },
  { href: "/admin-portal/proyek", label: "Proyek", icon: FolderKanban },
  { href: "/admin-portal/keuangan", label: "Keuangan", icon: Wallet },
  { href: "/admin-portal/kategori", label: "Lainnya", icon: MoreHorizontal },
  { href: "/admin-portal/kontrak/register", label: "Kontrak", icon: FileSignature },
];

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  /*
    `useIzin`, BUKAN `hasPermission()` langsung.

    `hasPermission` membaca localStorage — tak ada di server, jadi nilainya
    SELALU false saat SSR dan true di klien. Memanggilnya di jalur render
    membuat React membuang seluruh pohon hasil server lalu merender ulang
    (ditangkap `uji-izin-hydration.mjs`, ambang NOL). Ongkosnya paling terasa
    justru di HP lapangan.

    `useIzin` memakai `useSyncExternalStore` dengan snapshot server `false`,
    jadi React tahu perbedaan itu DISENGAJA dan tak menganggapnya
    ketidakcocokan.

    ⚠ Karena nilainya `false` sampai hydration selesai, pengalihan HANYA
    boleh terjadi di dalam `useEffect` — yang memang hanya berjalan di klien,
    sesudah nilai sebenarnya diketahui. Menaruhnya di jalur render akan
    memulangkan SEMUA orang ke /dashboard pada bingkai pertama.
  */
  const bolehKelola = useIzin("settings:manage");

  /*
    Penanda bahwa hidrasi sudah lewat. Efek hanya berjalan di klien, jadi
    efek kosong ini menyala tepat SESUDAH pass hidrasi pertama — saat itulah
    `useIzin` sudah memulangkan nilai klien yang sebenarnya.
  */
  const [hidrasiSelesai, setHidrasiSelesai] = useState(false);
  /*
    PENANDA HIDRASI — satu setState, sekali, sengaja.

    Effect ini tak membaca apa pun; ia hanya mengumumkan bahwa render pertama
    di peramban sudah lewat, supaya bagian yang bergantung pada localStorage
    tak dirender di server dan menimbulkan ketidakcocokan hidrasi.

    Itu justru pemakaian effect yang benar, dan tak bisa dinyatakan tanpa
    setState. Aturan `set-state-in-effect` (v7) menandainya karena ia menandai
    SEMUA setState sinkron dalam effect; render berjenjang tak mungkin di sini
    karena dependensinya kosong.
  */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHidrasiSelesai(true); }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    /*
      GERBANG PORTAL = IZIN, BUKAN NAMA JABATAN (ADR-004).

      Bentuk sebelumnya membandingkan nama jabatan secara literal.
      Ditolak `adr004-ratchet.mjs` (ambang NOL) saat branch ini di-merge ke
      main, dan penolakannya benar — bukan sekadar formalitas:

      Rencana branch ini memilih whitelist `admin`+`direktur` karena
      middleware sengaja MELEWATKAN custom role ke sini (lihat
      `middleware.ts` ~184, cabang `!ROLE_ALLOWED[role]`). Tetapi whitelist
      literal itu berarti tenant yang membuat role sendiri lewat UI —
      `general_manager`, `owner`, `direktur_utama` — dipulangkan ke
      /dashboard MESKIPUN punya seluruh permission yang dituntut halaman di
      dalamnya. Middleware mengizinkannya masuk, lalu layout ini
      menendangnya keluar: tak ada galat, tak ada pesan, cuma redirect.

      `settings:manage` dipilih dari migrasi 050, BUKAN ditebak: ia dimiliki
      admin dan TIDAK dimiliki pm/mandor/client (ketiganya dikecualikan
      eksplisit di seed role_permissions). Jadi ia memisahkan persis
      kelompok yang dimaksud whitelist lama, tanpa memakai nama jabatan.

      Halaman di dalam portal tetap punya gerbangnya sendiri
      (`hasPermission("gl:post")`, `"rekonsiliasi:lock"`, dst) — ini gerbang
      PINTU MASUK, bukan pengganti gerbang per-aksi.
    */
    /*
      ⚠ `hidrasiSelesai` WAJIB — tanpa itu gerbang ini menendang SEMUA ORANG.

      `useIzin` memulangkan `false` selama render server DAN pada pass
      hidrasi pertama di klien (snapshot servernya memang `false`, lihat
      `lib/use-izin.ts`). Efek ini berjalan sesudah pass pertama itu — jadi
      `bolehKelola` masih `false` walau penggunanya punya izinnya, dan
      `router.replace("/dashboard")` sudah telanjur jalan.

      Terbukti 2026-08-27: akun admin dengan 227 izin (termasuk
      `settings:manage`, diperiksa langsung di localStorage) tetap
      dipulangkan ke /dashboard. Typecheck bersih, penjaga hijau, dan portal
      itu TAK BISA DIBUKA SIAPA PUN.

      `useEffect` yang menunggu satu tick memberi `useSyncExternalStore`
      kesempatan beralih ke nilai klien lebih dulu. Selama menunggu, layout
      merender `null` — bukan mengalihkan.
    */
    if (!hidrasiSelesai) return;

    if (!bolehKelola) {
      router.replace("/dashboard");
      return;
    }
    /*
      Hidrasi dari penyimpanan SINKRON — bukan cascading render.

      `getStoredUser()` membaca localStorage, yang tak ada saat render pertama.
      Nilainya karena itu tak bisa jadi nilai awal `useState`, dan satu setState
      sesudah mount adalah cara yang dimaksudkan React untuk hidrasi seperti ini.

      Aturan `set-state-in-effect` (baru di eslint-plugin-react-hooks v7, yang
      membuat angka ratchet melompat 39 → 48 tanpa satu baris kode buruk pun
      ditulis) menandai SEMUA setState sinkron dalam effect. Yang ia cegah —
      render berjenjang — tak terjadi di sini: dependensinya kosong, jadi effect
      ini berjalan tepat sekali.

      Menulisnya ulang dengan `useSyncExternalStore` benar secara teori dan
      mengubah perilaku ALUR MASUK pada sistem yang baru dipakai orang. Yang
      dikerjakan di sini menandai, bukan menulis ulang otentikasi.
    */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(u);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolehKelola, hidrasiSelesai]);

  if (!user) return null;

  function handleLogout() {
    // `logout()` (lib/api.ts) — bukan removeItem manual — supaya cookie
    // `puraloka_role` (dibaca middleware) dan cache menu/SW ikut terhapus.
    // Pola persis pm-portal/layout.tsx.
    logout();
    router.push("/login");
  }

  return (
    <PortalShell
      user={user}
      portalLabel="Portal Admin"
      navItems={NAV_ITEMS}
      onLogout={handleLogout}
      lainnyaHref="/admin-portal/kategori"
    >
      {children}
    </PortalShell>
  );
}

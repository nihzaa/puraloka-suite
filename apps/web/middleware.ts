import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/auth/callback",
  // `/uji-gulir` hanya di luar produksi — halaman uji `useVirtualList` yang
  // butuh viewport & scroll sungguhan (lihat `e2e/gulir-virtual.spec.ts`).
  // Halamannya sendiri juga merender `null` saat produksi; dua lapis, karena
  // yang dijaga di sini adalah rute yang bisa ter-build tanpa sengaja.
  ...(process.env.NODE_ENV === "production" ? [] : ["/uji-gulir"]),
];

// Routes that each role is allowed to access (prefix match)
const ROLE_HOME: Record<string, string> = {
  client: "/portal",
  mandor: "/mandor-portal",
  // `/pm-portal`, BUKAN `/dashboard`. PM tak diizinkan masuk `/dashboard`
  // (lihat ROLE_ALLOWED di bawah), jadi memakainya sebagai home membuat setiap
  // redirect ditolak lagi dan berulang tanpa akhir — ERR_TOO_MANY_REDIRECTS,
  // layar kosong. Ditemukan lewat uji browser 2026-08-02.
  //
  // Diperbaiki dengan menurunkan home ke halaman yang MEMANG haknya, bukan
  // dengan menambahkan `/dashboard` ke izinnya: `routes/v1/dashboard.ts` tak
  // menyaring apa pun per-role, jadi membukanya untuk PM berarti memberi angka
  // keuangan seluruh perusahaan — memperluas hak, bukan memulihkan.
  pm: "/pm-portal",
  admin: "/dashboard",
};

const ROLE_ALLOWED: Record<string, string[]> = {
  client:  ["/portal", "/verify"],
  // mandor bisa akses /pm-portal juga — guard di layout PM akan verifikasi apakah dia memang PM di proyek
  mandor:  ["/mandor-portal", "/pm-portal", "/proyek", "/verify"],
  // `/m` = halaman peta menu (`/m/<key>`). Satu rute untuk 100+ menu yang
  // belum punya halamannya sendiri — mendaftarkannya satu per satu di sini
  // akan jadi daftar 100 baris yang pasti ketinggalan saat menu bertambah.
  pm:      ["/pm-portal", "/proyek", "/verify", "/estimasi", "/tender", "/piutang", "/aset", "/m"],
  admin:   ["/dashboard", "/proyek", "/keuangan", "/akuntansi", "/mandor", "/laporan", "/notifications", "/kas", "/users", "/klien", "/procurement", "/pengaturan", "/kalender", "/audit", "/sistem", "/estimasi", "/tender", "/piutang", "/aset", "/m"],
};

/**
 * Cocokkan `pathname` dengan prefiks rute, DI BATAS SEGMEN.
 *
 * `startsWith` biasa membocorkan izin ke rute yang namanya kebetulan mirip:
 * `/proyek` cocok dengan `/proyeksi-kas`, sehingga mandor bisa membukanya
 * tanpa ada yang pernah menambahkannya ke daftar izin. Ditemukan lewat uji
 * browser 2026-08-02 — dan "Proyeksi Kas" memang sudah antre di roadmap #10,
 * jadi ini bukan skenario karangan.
 *
 * Yang cocok: prefiks itu sendiri (`/proyek`) dan anaknya (`/proyek/123`).
 * Yang tidak: saudara yang sekadar berawalan sama (`/proyeksi-kas`).
 */
function cocokRute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Home tiap role WAJIB termasuk dalam izinnya sendiri. Kalau tidak, redirect
// "kembali ke home" mengarah ke halaman yang juga ditolak — dan middleware
// mengarahkan ulang selamanya sampai browser menyerah dengan
// ERR_TOO_MANY_REDIRECTS: layar kosong, tanpa pesan apa pun.
//
// Persis itu yang terjadi pada `pm` sampai 2026-08-02 (home `/dashboard`, tapi
// `/dashboard` tak ada di daftar izinnya). Ditulis sebagai kode, bukan sebagai
// catatan, supaya daftar izin berikutnya tak bisa salah tanpa ketahuan.
for (const [role, home] of Object.entries(ROLE_HOME)) {
  const izin = ROLE_ALLOWED[role];
  if (izin && !izin.some((p) => cocokRute(home, p))) {
    throw new Error(
      `ROLE_ALLOWED["${role}"] tak memuat home-nya sendiri ("${home}") — ` +
        `setiap redirect ke home akan ditolak lagi dan berulang tanpa akhir.`,
    );
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("puraloka_token")?.value;
  const role = request.cookies.get("puraloka_role")?.value;
  const isPublic = PUBLIC_ROUTES.some((r) => cocokRute(pathname, r));

  // Belum login → redirect login
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Sudah login + akses public route → redirect ke home role
  if (token && isPublic) {
    const home = role ? (ROLE_HOME[role] ?? "/dashboard") : "/dashboard";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Sudah login, punya role info → cek akses
  // Custom role (tidak ada di ROLE_ALLOWED) → selalu diizinkan ke /dashboard
  if (token && role && ROLE_ALLOWED[role]) {
    const allowed = ROLE_ALLOWED[role];
    const hasAccess = allowed.some((prefix) => cocokRute(pathname, prefix)) || pathname === "/";
    if (!hasAccess) {
      const home = ROLE_HOME[role] ?? "/dashboard";
      return NextResponse.redirect(new URL(home, request.url));
    }
  } else if (token && role && !ROLE_ALLOWED[role]) {
    // Custom role: akses bebas ke /dashboard dan /proyek, blokir portal khusus role lain
    const blockedPrefixes = ["/portal", "/mandor-portal", "/pm-portal"];
    if (blockedPrefixes.some((p) => cocokRute(pathname, p))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
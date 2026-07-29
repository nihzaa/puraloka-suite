import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/auth/callback"];

// Routes that each role is allowed to access (prefix match)
const ROLE_HOME: Record<string, string> = {
  client: "/portal",
  mandor: "/mandor-portal",
  pm: "/dashboard",
  admin: "/dashboard",
};

const ROLE_ALLOWED: Record<string, string[]> = {
  client:  ["/portal", "/verify"],
  // mandor bisa akses /pm-portal juga — guard di layout PM akan verifikasi apakah dia memang PM di proyek
  mandor:  ["/mandor-portal", "/pm-portal", "/proyek", "/verify"],
  pm:      ["/pm-portal", "/proyek", "/verify", "/estimasi"],
  admin:   ["/dashboard", "/proyek", "/keuangan", "/mandor", "/laporan", "/notifications", "/kas", "/users", "/klien", "/procurement", "/pengaturan", "/kalender", "/audit", "/sistem", "/estimasi"],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("puraloka_token")?.value;
  const role = request.cookies.get("puraloka_role")?.value;
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

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
    const hasAccess = allowed.some((prefix) => pathname.startsWith(prefix)) || pathname === "/";
    if (!hasAccess) {
      const home = ROLE_HOME[role] ?? "/dashboard";
      return NextResponse.redirect(new URL(home, request.url));
    }
  } else if (token && role && !ROLE_ALLOWED[role]) {
    // Custom role: akses bebas ke /dashboard dan /proyek, blokir portal khusus role lain
    const blockedPrefixes = ["/portal", "/mandor-portal", "/pm-portal"];
    if (blockedPrefixes.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ambil token dari cookie
  const token = request.cookies.get("puraloka_token")?.value;

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  // Belum login dan akses halaman protected → redirect login
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Sudah login dan akses login → redirect dashboard
  if (token && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
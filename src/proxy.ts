import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, getPin, isValidToken } from "@/lib/auth";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/ping", // usado pelo cron; só devolve uma contagem
  "/_next/",
  "/icons/",
];
const PUBLIC_FILES = new Set([
  "/manifest.json",
  "/sw.js",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
]);

export async function proxy(request: NextRequest) {
  if (!getPin()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_FILES.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (await isValidToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

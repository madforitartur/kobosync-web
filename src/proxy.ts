import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ID, AUTH_COOKIE, USER_HEADER, getPin, verifySessionToken } from "@/lib/auth";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/ping", // usado pelo cron; só devolve uma contagem
  "/receber", // página aberta no browser do Kobo (sem PIN)
  "/api/receber/new",
  "/api/receber/poll",
  "/api/receber/dl", // protegido por código + segredo da sessão
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

/** Reencaminha o pedido com o id do utilizador (sempre definido aqui; nunca vindo do cliente). */
function pass(request: NextRequest, uid: string | null) {
  const headers = new Headers(request.headers);
  headers.delete(USER_HEADER);
  if (uid) headers.set(USER_HEADER, uid);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  if (!getPin()) return pass(request, ADMIN_ID); // sem APP_PIN: app aberta, um só utilizador

  const { pathname } = request.nextUrl;
  const uid = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (PUBLIC_FILES.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return pass(request, uid);
  }
  if (uid) return pass(request, uid);

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

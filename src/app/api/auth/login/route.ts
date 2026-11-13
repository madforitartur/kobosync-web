import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, getPin, safeEqual, tokenFor } from "@/lib/auth";

export const runtime = "nodejs";

// Limite simples de tentativas por IP (em memória: suficiente para uso pessoal)
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;

export async function POST(request: Request) {
  const pin = getPin();
  if (!pin) return NextResponse.json({ ok: true, protected: false });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && now - entry.first < WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Demasiadas tentativas. Tenta daqui a alguns minutos." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const given = typeof body.pin === "string" ? body.pin.trim() : "";

  if (!given || !safeEqual(given, pin)) {
    const fresh = !entry || now - entry.first >= WINDOW_MS;
    attempts.set(ip, { count: fresh ? 1 : entry.count + 1, first: fresh ? now : entry.first });
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "PIN incorreto." }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await tokenFor(pin), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}

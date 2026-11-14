import { NextResponse } from "next/server";
import { ADMIN_ID, AUTH_COOKIE, AUTH_MAX_AGE, createSessionToken, getPin, safeEqual } from "@/lib/auth";
import { clearFailures, getUser, lockedFor, recordFailure, verifyPin } from "@/lib/firebase/users";

export const runtime = "nodejs";

// Limite por IP (em memória) além do bloqueio por perfil guardado no Firestore
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 20;

export async function POST(request: Request) {
  const appPin = getPin();
  if (!appPin) return NextResponse.json({ ok: true, protected: false });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && now - entry.first < WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Demasiadas tentativas. Tenta daqui a alguns minutos." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { uid?: unknown; pin?: unknown };
  const uid = typeof body.uid === "string" && body.uid ? body.uid : ADMIN_ID;
  const given = typeof body.pin === "string" ? body.pin.trim() : "";

  const user = await getUser(uid).catch(() => null);
  if (!user) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  const wait = await lockedFor(uid);
  if (wait > 0) {
    return NextResponse.json({ error: `Perfil bloqueado por tentativas falhadas. Tenta daqui a ${Math.ceil(wait / 60_000)} min.` }, { status: 429 });
  }

  const ok = uid === ADMIN_ID ? !!given && safeEqual(given, appPin) : !!given && verifyPin(given, user.pinHash);
  if (!ok) {
    const fresh = !entry || now - entry.first >= WINDOW_MS;
    attempts.set(ip, { count: fresh ? 1 : entry.count + 1, first: fresh ? now : entry.first });
    await recordFailure(uid).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "PIN incorreto." }, { status: 401 });
  }

  attempts.delete(ip);
  await clearFailures(uid);
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
  res.cookies.set(AUTH_COOKIE, await createSessionToken(uid), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}

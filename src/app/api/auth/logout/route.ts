import { NextResponse } from "next/server";
import { AUTH_COOKIE, USER_HEADER } from "@/lib/auth";
import { logActivity } from "@/lib/firebase/activity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const uid = request.headers.get(USER_HEADER);
  if (uid) await logActivity({ uid, type: "logout" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

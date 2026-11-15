import { NextRequest, NextResponse } from "next/server";
import { getSession, touchSession } from "@/lib/firebase/kobo-sessions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const code = q.get("code") ?? "";
  const secret = q.get("secret") ?? "";
  const s = await getSession(code, secret);
  if (!s) return NextResponse.json({ expired: true, files: [] }, { headers: { "Cache-Control": "no-store" } });
  void touchSession(code, s);
  const files = s.files.map((f, i) => ({
    title: f.title,
    filename: f.filename,
    url: `/api/receber/dl?code=${encodeURIComponent(code)}&secret=${encodeURIComponent(secret)}&i=${i}`,
  }));
  return NextResponse.json({ expired: false, files }, { headers: { "Cache-Control": "no-store" } });
}

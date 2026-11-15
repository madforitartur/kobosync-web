import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { currentUserId } from "@/lib/session";
import { deviceFrom, listActivity, logActivity } from "@/lib/firebase/activity";

export const runtime = "nodejs";

/** Pesquisas feitas pelo utilizador (a app envia-as depois de ele parar de escrever). */
export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const q = String(b?.q ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ ok: true });
  const scope = b?.scope === "reader" ? "no livro" : "biblioteca";
  await logActivity(
    { uid: await currentUserId(), type: "search", detail: q, title: b?.scope === "reader" ? String(b?.title ?? "").slice(0, 120) || undefined : undefined, bookId: b?.scope === "reader" ? String(b?.bookId ?? "").slice(0, 60) || undefined : undefined, device: `${scope} · ${deviceFrom(request.headers.get("user-agent"))}` },
    30_000,
  );
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const limit = Number(request.nextUrl.searchParams.get("limit")) || 500;
  return NextResponse.json({ events: await listActivity(limit) }, { headers: { "Cache-Control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/firebase/kobo-sessions";

export const runtime = "nodejs";

// Limite simples por IP (melhor esforço, por instância) para não encher a base de dados.
const hits = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "x";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 30) return NextResponse.json({ error: "Demasiados pedidos" }, { status: 429 });
  hits.set(ip, [...recent, now]);
  try {
    const { code, secret } = await createSession();
    return NextResponse.json({ code, secret }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

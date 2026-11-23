import { NextResponse, type NextRequest } from "next/server";
import { syncLibrary } from "@/services/sync-library";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Chamado pelo cron da Vercel (envia "Authorization: Bearer $CRON_SECRET"). Sem CRON_SECRET fica desativado. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não definido." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const r = await syncLibrary();
    return NextResponse.json({ ok: true, newBooks: r.newBooks, newPdfs: r.newPdfs, found: r.found });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

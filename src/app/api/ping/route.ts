/**
 * GET /api/ping
 * Mantém o projecto Supabase activo com uma query leve.
 * Chamado automaticamente pelo Vercel Cron (vercel.json) a cada 3 dias.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServiceClient();
    // Query mínima — conta 1 livro para acordar o projecto
    const { count } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .limit(1);
    return NextResponse.json({
      ok:   true,
      ts:   new Date().toISOString(),
      books: count ?? 0,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

/**
 * GET /api/ping
 * Health-check simples ao Firestore. Ao contrário do Supabase gratuito,
 * o Firestore não "pausa" por inactividade — este endpoint fica sobretudo
 * para diagnóstico rápido e para o cron do vercel.json continuar a funcionar.
 */
import { NextResponse } from "next/server";
import { countBooks } from "@/lib/firebase/books";

export const runtime = "nodejs";

export async function GET() {
  try {
    const total = await countBooks();
    return NextResponse.json({
      ok: true,
      ts: new Date().toISOString(),
      books: total,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

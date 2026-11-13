/**
 * GET /api/ping
 * Health-check simples ao Firestore (diagnóstico e cron do vercel.json).
 * Público de propósito: só devolve uma contagem.
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

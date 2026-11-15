import { NextResponse } from "next/server";
import { getAllBooksCached } from "@/lib/firebase/books";

export const runtime = "nodejs";

/** Quantos livros ainda não têm capa extraída (para o sync automático em segundo plano). */
export async function GET() {
  try {
    const all = await getAllBooksCached();
    const pending = all.filter((b) => !b.cover_url && !b.cover_missing && b.drive_file_id).length;
    return NextResponse.json(
      { total: all.length, pending, withCover: all.filter((b) => b.cover_url).length, noCoverInEpub: all.filter((b) => b.cover_missing).length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

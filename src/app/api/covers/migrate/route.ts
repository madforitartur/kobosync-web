/**
 * POST /api/covers/migrate
 * Manutenção: volta a dar uma oportunidade aos livros marcados como "sem capa"
 * (cover_failed), para o próximo "Sincronizar capas" os tentar de novo.
 * GET devolve apenas estatísticas.
 */
import { NextResponse } from "next/server";
import { getAllBooksCached, patchBooks } from "@/lib/firebase/books";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const books = await getAllBooksCached(true);
  const failed = books.filter((b) => b.cover_failed && !b.cover_url);

  await patchBooks(failed.map((b) => ({ id: b.id, cover_failed: false })));

  return NextResponse.json({
    fixed: failed.length,
    skipped: books.length - failed.length,
    clearedExpired: 0,
    stats: {
      withCover: books.filter((b) => b.cover_url).length,
      withoutCover: books.filter((b) => !b.cover_url).length,
      failed: 0,
    },
  });
}

export async function GET() {
  const books = await getAllBooksCached();
  return NextResponse.json({
    total: books.length,
    withGoodUrl: books.filter((b) => b.cover_url).length,
    noCover: books.filter((b) => !b.cover_url).length,
  });
}

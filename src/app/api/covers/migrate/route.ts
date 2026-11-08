/**
 * POST /api/covers/migrate
 * Manutenção: limpa o cover_url de livros cuja capa já não existe na
 * colecção "covers" do Firestore, para o sync de capas os voltar a processar.
 * GET devolve apenas estatísticas.
 */
import { NextResponse } from "next/server";
import { getAllBooksCached, updateBookCover } from "@/lib/firebase/books";
import { listCoverIds } from "@/lib/firebase/covers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const [books, coverIds] = await Promise.all([getAllBooksCached(true), listCoverIds()]);
  const orphans = books.filter((b) => b.cover_url && !coverIds.has(b.id));

  for (const book of orphans) {
    await updateBookCover(book.id, { cover_url: null });
  }

  const refreshed = await getAllBooksCached(true);
  return NextResponse.json({
    fixed: 0,
    skipped: books.length - orphans.length,
    clearedExpired: orphans.length,
    stats: {
      withCover: refreshed.filter((b) => b.cover_url).length,
      withoutCover: refreshed.filter((b) => !b.cover_url).length,
      failed: refreshed.filter((b) => b.cover_failed).length,
    },
  });
}

export async function GET() {
  const books = await getAllBooksCached();
  const withCover = books.filter((b) => b.cover_url).length;
  const noCover = books.filter((b) => !b.cover_url).length;
  return NextResponse.json({
    total: books.length,
    withGoodUrl: withCover,
    noCover,
    recommendation:
      noCover > 0 ? `${noCover} livros sem capa — usa "Sincronizar capas".` : "OK — todos os livros têm capa.",
  });
}

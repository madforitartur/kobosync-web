/**
 * POST /api/covers/migrate
 *
 * Com capas alojadas no Google Drive (links "anyone with the link"), os
 * URLs não expiram como acontecia com signed URLs do Supabase Storage.
 * Esta rota faz, por isso, uma verificação de manutenção: confirma que
 * cada capa gravada continua acessível no Drive e limpa as que já não
 * respondem (ficheiro apagado/permissão revogada), para que o sync de
 * capas as volte a processar.
 */
import { NextResponse } from "next/server";
import { getAllBooksCached, updateBookCover } from "@/lib/firebase/books";

export const runtime = "nodejs";
export const maxDuration = 60;

async function isCoverReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST() {
  const books = await getAllBooksCached();
  const withCover = books.filter((b) => b.cover_url);

  let clearedExpired = 0;
  const CONCURRENCY = 8;

  for (let i = 0; i < withCover.length; i += CONCURRENCY) {
    const chunk = withCover.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (book) => {
        const ok = await isCoverReachable(book.cover_url!);
        if (!ok) {
          await updateBookCover(book.id, { cover_url: null, cover_drive_file_id: null });
          clearedExpired++;
        }
      }),
    );
  }

  const refreshed = await getAllBooksCached(true);
  const withCoverCount = refreshed.filter((b) => b.cover_url).length;
  const noCoverCount = refreshed.filter((b) => !b.cover_url).length;

  return NextResponse.json({
    fixed: 0,
    skipped: withCover.length - clearedExpired,
    clearedExpired,
    stats: {
      withCover: withCoverCount,
      withoutCover: noCoverCount,
      failed: 0,
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
      noCover > 0
        ? `${noCover} livros ainda sem capa — usa "Sincronizar capas".`
        : "OK — todos os livros têm capa.",
  });
}

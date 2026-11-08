/**
 * POST /api/covers/sync-all
 *
 * Processa UM lote de capas dentro de um orçamento de tempo (cabe no limite
 * de 60s da Vercel) e devolve quantas faltam. É o browser que volta a chamar
 * este endpoint até remaining === 0. Sem estado em segundo plano: se a página
 * fechar, basta clicar de novo e continua de onde ficou.
 *
 * Cada EPUB é descarregado do Google Drive (só leitura), a capa é extraída,
 * comprimida e guardada no Firestore (colecção "covers").
 */
import { NextResponse } from "next/server";
import {
  listBooksWithoutCover,
  countBooksWithoutCover,
  updateBookCover,
  markCoverFailed,
} from "@/lib/firebase/books";
import { storeCoverForBook } from "@/lib/cover-extractor";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONCURRENCY = 4;
const TIME_BUDGET_MS = 35_000; // não começa novos grupos depois disto

export async function POST() {
  const started = Date.now();
  let success = 0;
  let failed = 0;
  const errors: Array<{ bookId: string; title?: string; reason: string }> = [];

  try {
    const pending = await listBooksWithoutCover(undefined, true);

    for (let i = 0; i < pending.length && Date.now() - started < TIME_BUDGET_MS; i += CONCURRENCY) {
      const chunk = pending.slice(i, i + CONCURRENCY);

      await Promise.all(
        chunk.map(async (book) => {
          try {
            const result = await storeCoverForBook(
              book.drive_file_id!,
              book.id,
              (id) => downloadFromDriveWithConfig(id),
            );

            if (!result) {
              await markCoverFailed(book.id);
              failed++;
              errors.push({ bookId: book.id, title: book.title, reason: "Sem capa no EPUB" });
              return;
            }

            await updateBookCover(book.id, { cover_url: result.url });
            success++;
          } catch (err) {
            failed++;
            errors.push({ bookId: book.id, title: book.title, reason: String(err) });
          }
        }),
      );
    }

    const remaining = await countBooksWithoutCover(true);

    return NextResponse.json({
      success,
      failed,
      processed: success + failed,
      remaining,
      done: remaining === 0,
      errors: errors.slice(-5),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro no sync de capas" },
      { status: 500 },
    );
  }
}

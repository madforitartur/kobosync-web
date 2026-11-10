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
import { listBooksWithoutCover, patchBooks, type BookPatch } from "@/lib/firebase/books";
import { storeCoverForBook } from "@/lib/cover-extractor";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONCURRENCY = 4;
const TIME_BUDGET_MS = 35_000; // não começa novos grupos depois disto

export async function POST(request: Request) {
  const started = Date.now();
  let success = 0;
  let missing = 0; // EPUB sem imagem de capa (definitivo)
  const failedIds: string[] = []; // erros temporários (Drive, rede): tentam-se mais tarde
  const errors: Array<{ bookId: string; title?: string; reason: string }> = [];

  try {
    // O browser envia os livros que já falharam nesta sessão, para não os repetir em ciclo
    const body = await request.json().catch(() => ({}));
    const skip = new Set<string>(Array.isArray(body?.skip) ? body.skip : []);

    const pending = (await listBooksWithoutCover(undefined, true)).filter((b) => !skip.has(b.id));

    for (let i = 0; i < pending.length && Date.now() - started < TIME_BUDGET_MS; i += CONCURRENCY) {
      const chunk = pending.slice(i, i + CONCURRENCY);
      const patches: BookPatch[] = [];

      await Promise.all(
        chunk.map(async (book) => {
          try {
            const result = await storeCoverForBook(
              book.drive_file_id!,
              book.id,
              (id) => downloadFromDriveWithConfig(id),
            );

            if (!result) {
              patches.push({ id: book.id, cover_missing: true });
              missing++;
              return;
            }

            patches.push({ id: book.id, cover_url: result.url, cover_missing: false, cover_failed: false });
            success++;
          } catch (err) {
            // Erro temporário: NÃO marca o livro, para voltar a ser tentado
            failedIds.push(book.id);
            errors.push({ bookId: book.id, title: book.title, reason: String(err) });
          }
        }),
      );

      // 1 escrita por grupo (agrupada por chunk) em vez de 1 por livro
      await patchBooks(patches);
    }

    const remaining = Math.max(0, pending.length - success - missing - failedIds.length);

    return NextResponse.json({
      success,
      missing,
      failed: failedIds.length,
      failedIds,
      processed: success + missing + failedIds.length,
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

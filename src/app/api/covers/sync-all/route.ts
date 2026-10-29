/**
 * POST /api/covers/sync-all
 *
 * Responde IMEDIATAMENTE ao cliente com o estado inicial.
 * O processamento corre em background no servidor usando after() do
 * Next.js — cada batch chama o próximo até não haver mais livros.
 *
 * As capas extraídas são enviadas para o Google Drive (conta das capas,
 * configurável separadamente) e apenas o link fica gravado no Firestore.
 *
 * Estado guardado em Firestore: colecção "sync_state", documento "covers".
 * O cliente pode consultar GET /api/covers/progress para acompanhar.
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  listBooksWithoutCover,
  countBooksWithoutCover,
  updateBookCover,
} from "@/lib/firebase/books";
import { getSyncState, startSyncState, finishSyncState, bumpSyncProgress } from "@/lib/firebase/sync-state";
import { uploadCoverForBook } from "@/lib/cover-extractor";
import { downloadPartialWithConfig } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 8; // livros por iteração
const CONCURRENCY = 4; // paralelo por iteração
const PARTIAL_MB = 1.5; // MB a descarregar por EPUB inicialmente

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

async function processBatch() {
  const books = await listBooksWithoutCover(BATCH);

  if (books.length === 0) {
    await finishSyncState("covers");
    console.log("[Covers] Sync concluído.");
    return;
  }

  let batchSuccess = 0;
  let batchFailed = 0;
  const errors: Array<{ bookId: string; title?: string; reason: string }> = [];

  for (let i = 0; i < books.length; i += CONCURRENCY) {
    const chunk = books.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (book) => {
        try {
          if (!book.drive_file_id) {
            batchFailed++;
            return;
          }
          const bytes = Math.round(PARTIAL_MB * 1024 * 1024);
          const result = await uploadCoverForBook(
            book.drive_file_id,
            book.id,
            (id) => downloadPartialWithConfig(id, bytes),
          );

          if (!result) {
            batchFailed++;
            errors.push({ bookId: book.id, title: book.title, reason: "Sem capa no EPUB" });
            return;
          }

          await updateBookCover(book.id, {
            cover_url: result.url,
            cover_drive_file_id: result.fileId,
          });
          batchSuccess++;
        } catch (err) {
          batchFailed++;
          errors.push({ bookId: book.id, title: book.title, reason: String(err) });
        }
      }),
    );
  }

  await bumpSyncProgress(
    "covers",
    { processed: books.length, success: batchSuccess, failed: batchFailed },
    errors,
  );

  console.log(`[Covers] Batch: +${batchSuccess} ok, +${batchFailed} fail. A continuar…`);

  // Agenda o próximo batch chamando este mesmo endpoint
  await fetch(`${BASE_URL}/api/covers/sync-all`, {
    method: "POST",
    headers: { "x-internal-worker": "1" },
  }).catch((err) => console.error("[Covers] Erro ao agendar próximo batch:", err));
}

export async function POST(req: NextRequest) {
  const isWorker = req.headers.get("x-internal-worker") === "1";

  if (isWorker) {
    after(processBatch());
    return NextResponse.json({ ok: true });
  }

  const state = await getSyncState("covers");
  if (state?.running) {
    return NextResponse.json({ message: "Já está a correr", state });
  }

  const total = await countBooksWithoutCover();

  if (!total) {
    return NextResponse.json({ message: "Todas as capas já estão sincronizadas." });
  }

  await startSyncState("covers", total);
  after(processBatch());

  return NextResponse.json({
    message: `A sincronizar ${total} capas em background…`,
    total,
    running: true,
  });
}

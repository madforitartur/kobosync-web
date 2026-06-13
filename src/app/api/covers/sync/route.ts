import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadFromDrive } from "@/lib/google-drive";
import {
  uploadCoverForBook,
  extractCoverFromEpub,
} from "@/lib/cover-extractor";

export const runtime = "nodejs";
export const maxDuration = 600; // 10 minutos por batch

/**
 * POST /api/covers/sync
 *
 * Body:
 *   {
 *     mode?: "all" | "missing" | "single",  // default: "missing"
 *     limit?: number,                         // default: 50
 *     bookIds?: string[],                     // para mode: "single"
 *     batchSize?: number,                     // livros por batch, default: 20
 *     concurrentBatches?: number,             // batches em paralelo, default: 3
 *   }
 *
 * Modos:
 *   - "missing": processa apenas livros sem cover_path (recomendado)
 *   - "all": reprocessa TODOS os livros (útil para reinicializar)
 *   - "single": processa apenas os bookIds fornecidos
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode: "all" | "missing" | "single" = body?.mode ?? "missing";
    const limit: number = body?.limit ?? 50;
    const bookIds: string[] | undefined = body?.bookIds;
    const batchSize: number = body?.batchSize ?? 20;
    const concurrentBatches: number = body?.concurrentBatches ?? 3;

    const supabase = createServiceClient();

    // Buscar livros conforme o modo
    let query = supabase
      .from("books")
      .select("id, drive_file_id, epub_url, cover_path, cover_url, modified_at");

    if (mode === "single" && bookIds && bookIds.length > 0) {
      query = query.in("id", bookIds);
    } else if (mode === "missing") {
      query = query.or("cover_path.is.null,cover_url.is.null");
    }
    // mode === "all" → sem filtro

    query = query.limit(limit);
    const { data: books, error } = await query;
    if (error) throw error;

    if (!books || books.length === 0) {
      return NextResponse.json({
        message: "No books to process",
        mode,
        processed: 0,
      });
    }

    // Processar em batches paralelos
    const results = {
      mode,
      total: books.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ bookId: string; reason: string }>,
    };

    // Dividir em batches
    const batches: typeof books[] = [];
    for (let i = 0; i < books.length; i += batchSize) {
      batches.push(books.slice(i, i + batchSize));
    }

    // Processar batches com concorrência limitada
    for (let i = 0; i < batches.length; i += concurrentBatches) {
      const currentBatches = batches.slice(i, i + concurrentBatches);
      const batchResults = await Promise.allSettled(
        currentBatches.map((batch) => processBatch(batch, supabase)),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.success += result.value.success;
          results.failed += result.value.failed;
          results.skipped += result.value.skipped;
          results.errors.push(...result.value.errors);
        } else {
          results.failed += currentBatches[0]?.length ?? 0;
          results.errors.push({
            bookId: "unknown",
            reason: result.reason?.message ?? "Batch failed",
          });
        }
      }

      // Log de progresso
      console.log(
        `[Cover Sync] Processed ${Math.min(i + concurrentBatches, batches.length)}/${batches.length} batches`,
      );
    }

    return NextResponse.json({
      message: "Cover sync complete",
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}

async function processBatch(
  books: Array<{
    id: string;
    drive_file_id: string | null;
    epub_url: string | null;
    cover_path: string | null;
    cover_url: string | null;
  }>,
  supabase: ReturnType<typeof createServiceClient>,
) {
  const result = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [] as Array<{ bookId: string; reason: string }>,
  };

  for (const book of books) {
    try {
      // Pular se já tem capa (a menos que seja modo "all")
      if (book.cover_path && book.cover_url) {
        result.skipped++;
        continue;
      }

      if (!book.drive_file_id && !book.epub_url) {
        result.skipped++;
        result.errors.push({
          bookId: book.id,
          reason: "No drive_file_id or epub_url",
        });
        continue;
      }

      let coverUrl: string | null = null;
      let coverPath: string | null = null;

      if (book.drive_file_id) {
        const uploadResult = await uploadCoverForBook(
          book.drive_file_id,
          book.id,
          downloadFromDrive,
        );
        if (uploadResult) {
          coverUrl = uploadResult.url;
          coverPath = uploadResult.path;
        }
      } else if (book.epub_url) {
        const response = await fetch(book.epub_url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const cover = await extractCoverFromEpub(buffer);
          if (cover) {
            const ext =
              cover.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
            coverPath = `covers/${book.id}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from("covers")
              .upload(coverPath, cover.data, {
                contentType: cover.mimeType,
                upsert: true,
              });

            if (!uploadError) {
              const { data: signedData } = await supabase.storage
                .from("covers")
                .createSignedUrl(coverPath, 60 * 60 * 24 * 30);
              if (signedData?.signedUrl) {
                coverUrl = signedData.signedUrl;
              }
            }
          }
        }
      }

      if (coverUrl && coverPath) {
        const { error: updateError } = await supabase
          .from("books")
          .update({ cover_url: coverUrl, cover_path: coverPath })
          .eq("id", book.id);

        if (updateError) {
          result.failed++;
          result.errors.push({
            bookId: book.id,
            reason: `Update failed: ${updateError.message}`,
          });
        } else {
          result.success++;
        }
      } else {
        result.failed++;
        result.errors.push({
          bookId: book.id,
          reason: "No cover found in EPUB",
        });
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        bookId: book.id,
        reason: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  return result;
}

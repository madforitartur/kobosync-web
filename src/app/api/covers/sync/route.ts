import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import { uploadCoverForBook, extractCoverFromEpub } from "@/lib/cover-extractor";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const supabase = createServiceClient();

  const { data: state } = await supabase
    .from("cover_sync_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (state?.running) {
    return NextResponse.json({
      message: "Sync ja em curso",
      state,
    });
  }

  const { count: totalBooks } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .or("cover_path.is.null,cover_url.is.null");

  if (!totalBooks || totalBooks === 0) {
    return NextResponse.json({ message: "Nenhum livro sem capa" });
  }

  await supabase.from("cover_sync_state").upsert({
    id: 1,
    running: true,
    started_at: new Date().toISOString(),
    finished_at: null,
    total_books: totalBooks,
    processed: 0,
    success: 0,
    failed: 0,
    current_batch: 0,
    total_batches: Math.ceil(totalBooks / 100),
    errors: [],
  });

  runBackgroundSync().catch((err) => {
    console.error("[Cover Sync] Background error:", err);
  });

  return NextResponse.json({ message: "Sync iniciado", totalBooks });
}

async function runBackgroundSync() {
  const supabase = createServiceClient();
  const BATCH_SIZE = 50;

  let offset = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;

    const { data: books, error } = await supabase
      .from("books")
      .select("id, title, drive_file_id, epub_url")
      .or("cover_path.is.null,cover_url.is.null")
      .order("title")
      .range(offset, offset + BATCH_SIZE - 1);

    if (error || !books || books.length === 0) break;

    const result = await processBatch(books);

    await supabase.rpc("update_sync_progress", {
      p_processed: books.length,
      p_success: result.success,
      p_failed: result.failed,
      p_errors: result.errors,
      p_batch: batchNum,
    });

    console.log(
      `[Cover Sync] Batch ${batchNum} - Success: ${result.success}, Failed: ${result.failed}`,
    );

    offset += BATCH_SIZE;
    if (books.length < BATCH_SIZE) break;
  }

  await supabase
    .from("cover_sync_state")
    .update({
      running: false,
      finished_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

async function processBatch(books: any[]) {
  const result = { success: 0, failed: 0, errors: [] as any[] };

  for (let i = 0; i < books.length; i += 3) {
    const chunk = books.slice(i, i + 3);
    const results = await Promise.allSettled(chunk.map(processBook));

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled" && (results[j] as PromiseFulfilledResult<boolean>).value) {
        result.success++;
      } else {
        result.failed++;
        result.errors.push({
          bookId: chunk[j].id,
          title: chunk[j].title,
          reason:
            results[j].status === "rejected"
              ? String((results[j] as PromiseRejectedResult).reason)
              : "No cover",
        });
      }
    }
  }

  return result;
}

async function processBook(book: any): Promise<boolean> {
  const supabase = createServiceClient();
  try {
    let coverUrl: string | null = null;
    let coverPath: string | null = null;

    if (book.drive_file_id) {
      const r = await uploadCoverForBook(
        book.drive_file_id,
        book.id,
        downloadFromDriveWithConfig,
      );
      if (r) {
        coverUrl = r.url;
        coverPath = r.path;
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
          const { error: upErr } = await supabase.storage
            .from("covers")
            .upload(coverPath, cover.data, {
              contentType: cover.mimeType,
              upsert: true,
            });
          if (!upErr) {
            const { data: sd } = await supabase.storage
              .from("covers")
              .createSignedUrl(coverPath, 60 * 60 * 24 * 30);
            if (sd?.signedUrl) coverUrl = sd.signedUrl;
          }
        }
      }
    }

    if (coverUrl && coverPath) {
      await supabase
        .from("books")
        .update({ cover_url: coverUrl, cover_path: coverPath })
        .eq("id", book.id);
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

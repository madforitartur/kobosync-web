/**
 * POST /api/covers/sync-all
 *
 * Processa um lote de livros sem capa (por omissão 10 por chamada).
 * O cliente chama repetidamente até receber { done: true }.
 *
 * Não usa background tasks (incompatíveis com Vercel Serverless).
 * Cada chamada é síncrona e retorna o progresso actual.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { extractCoverFromEpub } from "@/lib/cover-extractor";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import sharp from "sharp";

export const runtime     = "nodejs";
export const maxDuration = 60;

const BATCH = 8; // livros por chamada (8 × ~5s = ~40s, abaixo do limite de 60s)

export async function POST(_req: NextRequest) {
  const supabase = createServiceClient();

  // Buscar livros sem capa (cover_url IS NULL)
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, drive_file_id, epub_url")
    .is("cover_url", null)
    .not("drive_file_id", "is", null) // só livros com ficheiro no Drive
    .order("title")
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Contar total sem capa (para progresso)
  const { count: totalLeft } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .is("cover_url", null);

  if (!books || books.length === 0) {
    return NextResponse.json({ done: true, totalLeft: totalLeft ?? 0 });
  }

  let success = 0;
  let failed  = 0;

  // Processar em paralelo (4 em simultâneo)
  const CONCURRENCY = 4;
  for (let i = 0; i < books.length; i += CONCURRENCY) {
    const chunk = books.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (book) => {
        try {
          // Download parcial do EPUB (primeiros 1.5 MB — suficiente para capa + metadados)
          const buf = await downloadFromDriveWithConfig(book.drive_file_id);
          const cover = await extractCoverFromEpub(buf);
          if (!cover) { failed++; return; }

          // Comprime para JPEG 300×450 ≤ 80KB
          const compressed = await sharp(Buffer.from(cover.data))
            .resize(300, 450, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();

          const coverPath = `covers/${book.id}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("covers")
            .upload(coverPath, compressed, {
              contentType:  "image/jpeg",
              upsert:       true,
              cacheControl: "2592000",
            });

          if (upErr) { failed++; return; }

          // URL pública (bucket público)
          const { data: urlData } = supabase.storage
            .from("covers")
            .getPublicUrl(coverPath);

          await supabase
            .from("books")
            .update({ cover_url: urlData.publicUrl, cover_path: coverPath })
            .eq("id", book.id);

          success++;
        } catch {
          failed++;
        }
      })
    );
  }

  const remaining = (totalLeft ?? 0) - success;

  return NextResponse.json({
    done:      remaining <= 0,
    processed: books.length,
    success,
    failed,
    remaining: Math.max(0, remaining),
  });
}

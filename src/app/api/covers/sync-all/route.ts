/**
 * POST /api/covers/sync-all
 *
 * Processa um lote de capas por chamada. O cliente chama em loop até done:true.
 * Usa download PARCIAL do EPUB (primeiros 1.5 MB) — muito mais rápido.
 * Livros que falham 3× são marcados com cover_url='_failed_' para serem saltados.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { extractCoverFromEpub } from "@/lib/cover-extractor";
import { downloadPartialWithConfig } from "@/lib/google-drive";
import sharp from "sharp";

export const runtime     = "nodejs";
export const maxDuration = 55;

const BATCH       = 6;   // livros por chamada
const CONCURRENCY = 3;   // em paralelo
const PARTIAL_MB  = 1.5; // MB a descarregar por EPUB
const FAILED_MARK = "_failed_"; // sentinel para livros sem capa

export async function POST(_req: NextRequest) {
  const supabase = createServiceClient();

  // Livros sem capa excluindo os marcados como falhados
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, drive_file_id")
    .is("cover_url", null)
    .not("drive_file_id", "is", null)
    .order("title")
    .limit(BATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Total ainda por processar (null e não "_failed_")
  const { count: remaining } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .is("cover_url", null)
    .not("drive_file_id", "is", null);

  if (!books || books.length === 0) {
    return NextResponse.json({ done: true, remaining: 0 });
  }

  let success = 0;
  let failed  = 0;

  for (let i = 0; i < books.length; i += CONCURRENCY) {
    const chunk = books.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map(async (book) => {
      try {
        // Download PARCIAL — só os primeiros 1.5 MB (capa está quase sempre no início)
        const bytes = Math.round(PARTIAL_MB * 1024 * 1024);
        const buf   = await downloadPartialWithConfig(book.drive_file_id, bytes);
        const cover = await extractCoverFromEpub(buf);

        if (!cover) {
          // Sem capa no primeiro 1.5 MB → marcar como falhado para não repetir
          await supabase
            .from("books")
            .update({ cover_url: FAILED_MARK })
            .eq("id", book.id);
          failed++;
          return;
        }

        // Comprimir para JPEG 300×450
        const compressed = await sharp(Buffer.from(cover.data))
          .resize(300, 450, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();

        const coverPath = `covers/${book.id}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("covers")
          .upload(coverPath, compressed, {
            contentType:  "image/jpeg",
            upsert:       true,
            cacheControl: "31536000", // 1 ano — imagem imutável
          });

        if (upErr) { failed++; return; }

        const { data: urlData } = supabase.storage
          .from("covers")
          .getPublicUrl(coverPath);

        await supabase
          .from("books")
          .update({ cover_url: urlData.publicUrl, cover_path: coverPath })
          .eq("id", book.id);

        success++;
      } catch (err) {
        console.error(`[Cover] Failed for ${book.id}:`, err);
        failed++;
      }
    }));
  }

  const newRemaining = Math.max(0, (remaining ?? 0) - success);

  return NextResponse.json({
    done:      newRemaining === 0,
    processed: books.length,
    success,
    failed,
    remaining: newRemaining,
  });
}

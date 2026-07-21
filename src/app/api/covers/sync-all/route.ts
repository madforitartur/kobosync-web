/**
 * POST /api/covers/sync-all
 *
 * Responde IMEDIATAMENTE ao cliente com o estado inicial.
 * O processamento corre em background no servidor usando waitUntil()
 * do Vercel — cada batch chama o próximo até não haver mais livros.
 *
 * Estado guardado na tabela cover_sync_state (id=1) do Supabase.
 * O cliente pode consultar GET /api/covers/progress para acompanhar.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { extractCoverFromEpub } from "@/lib/cover-extractor";
import { downloadPartialWithConfig } from "@/lib/google-drive";
import sharp from "sharp";
import { after } from "next/server";

export const runtime     = "nodejs";
export const maxDuration = 60;

const BATCH       = 8;    // livros por iteração
const CONCURRENCY = 4;    // paralelo por iteração
const PARTIAL_MB  = 1.5;  // MB a descarregar por EPUB
const FAILED_MARK = "_failed_";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL
  ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

// ── Processar um batch e agendar o próximo ──
async function processBatch() {
  const supabase = createServiceClient();

  // Verificar se ainda há livros a processar
  const { data: books, error } = await supabase
    .from("books")
    .select("id, drive_file_id")
    .is("cover_url", null)
    .not("drive_file_id", "is", null)
    .order("title")
    .limit(BATCH);

  if (error || !books || books.length === 0) {
    // Concluído — actualizar estado
    await supabase.from("cover_sync_state").upsert({
      id: 1, running: false, finished_at: new Date().toISOString(),
    });
    console.log("[Covers] Sync concluído.");
    return;
  }

  let batchSuccess = 0;
  let batchFailed  = 0;

  // Processar em paralelo
  for (let i = 0; i < books.length; i += CONCURRENCY) {
    const chunk = books.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map(async (book) => {
      try {
        const bytes = Math.round(PARTIAL_MB * 1024 * 1024);
        const buf   = await downloadPartialWithConfig(book.drive_file_id, bytes);
        const cover = await extractCoverFromEpub(buf);

        if (!cover) {
          await supabase.from("books").update({ cover_url: FAILED_MARK }).eq("id", book.id);
          batchFailed++;
          return;
        }

        const compressed = await sharp(Buffer.from(cover.data))
          .resize(300, 450, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();

        const coverPath = `covers/${book.id}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("covers")
          .upload(coverPath, compressed, {
            contentType: "image/jpeg", upsert: true, cacheControl: "31536000",
          });

        if (upErr) { batchFailed++; return; }

        const { data: urlData } = supabase.storage.from("covers").getPublicUrl(coverPath);
        await supabase.from("books")
          .update({ cover_url: urlData.publicUrl, cover_path: coverPath })
          .eq("id", book.id);

        batchSuccess++;
      } catch {
        batchFailed++;
      }
    }));
  }

  // Actualizar progresso na BD
  await supabase.rpc("update_sync_progress", {
    p_processed: books.length,
    p_success:   batchSuccess,
    p_failed:    batchFailed,
    p_errors:    [],
    p_batch:     0,
  }).maybeSingle(); // ignora erro se RPC não existir

  // Alternativa sem RPC (mais robusto):
  const { data: state } = await supabase
    .from("cover_sync_state")
    .select("processed, success, failed")
    .eq("id", 1)
    .single();

  if (state) {
    await supabase.from("cover_sync_state").update({
      processed:  (state.processed ?? 0) + books.length,
      success:    (state.success   ?? 0) + batchSuccess,
      failed:     (state.failed    ?? 0) + batchFailed,
    }).eq("id", 1);
  }

  console.log(`[Covers] Batch: +${batchSuccess} ok, +${batchFailed} fail. A continuar…`);

  // Agendar próximo batch — chama este mesmo endpoint
  // Usa fetch sem await para não bloquear (o after() do Next.js garante que corre)
  await fetch(`${BASE_URL}/api/covers/sync-all`, {
    method: "POST",
    headers: { "x-internal-worker": "1" },
  }).catch((err) => console.error("[Covers] Erro ao agendar próximo batch:", err));
}

export async function POST(req: NextRequest) {
  const supabase     = createServiceClient();
  const isWorker     = req.headers.get("x-internal-worker") === "1";

  if (isWorker) {
    // Chamada interna do worker — processa e responde rapidamente
    // O next batch é agendado DENTRO de processBatch()
    after(processBatch());
    return NextResponse.json({ ok: true });
  }

  // ── Chamada inicial do utilizador ──

  // Verificar se já está a correr
  const { data: state } = await supabase
    .from("cover_sync_state")
    .select("running")
    .eq("id", 1)
    .maybeSingle();

  if (state?.running) {
    return NextResponse.json({ message: "Já está a correr", state });
  }

  // Contar livros sem capa
  const { count: total } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .is("cover_url", null)
    .not("drive_file_id", "is", null);

  if (!total || total === 0) {
    return NextResponse.json({ message: "Todas as capas já estão sincronizadas." });
  }

  // Inicializar estado
  await supabase.from("cover_sync_state").upsert({
    id:          1,
    running:     true,
    started_at:  new Date().toISOString(),
    finished_at: null,
    total_books: total,
    processed:   0,
    success:     0,
    failed:      0,
    errors:      [],
  });

  // Iniciar o processamento em background com after()
  after(processBatch());

  return NextResponse.json({
    message:    `A sincronizar ${total} capas em background…`,
    total,
    running:    true,
  });
}

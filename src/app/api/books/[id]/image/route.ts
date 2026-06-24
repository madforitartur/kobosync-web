/**
 * GET /api/books/[id]/image?path=OEBPS%2Fimages%2Fcover.jpg
 *
 * Serve uma imagem inline do EPUB directamente do Google Drive,
 * sem guardar nada no Supabase. Cache de 7 dias no browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import JSZip from "jszip";

export const runtime   = "nodejs";
export const maxDuration = 30;

// Cache em memória simples para EPUBs já abertos nesta instância
// (evita re-descarregar o mesmo EPUB para imagens diferentes do mesmo capítulo)
const epubCache = new Map<string, { zip: JSZip; ts: number }>();
const EPUB_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getZip(bookId: string, supabase: ReturnType<typeof import("@/lib/supabase/server").createServiceClient>): Promise<JSZip | null> {
  const cached = epubCache.get(bookId);
  if (cached && Date.now() - cached.ts < EPUB_CACHE_TTL) return cached.zip;

  const { data: book } = await supabase
    .from("books")
    .select("epub_url, drive_file_id")
    .eq("id", bookId)
    .single();

  if (!book) return null;

  let buf: ArrayBuffer | null = null;

  if (book.epub_url) {
    const r = await fetch(book.epub_url);
    if (r.ok) buf = await r.arrayBuffer();
  }
  if (!buf && book.drive_file_id) {
    buf = await downloadFromDriveWithConfig(book.drive_file_id);
  }
  if (!buf) return null;

  const zip = await JSZip.loadAsync(buf);
  epubCache.set(bookId, { zip, ts: Date.now() });

  // Limpa entradas expiradas
  for (const [k, v] of epubCache) {
    if (Date.now() - v.ts > EPUB_CACHE_TTL) epubCache.delete(k);
  }

  return zip;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png",  gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path   = request.nextUrl.searchParams.get("path");

  if (!path) return new NextResponse("Missing path", { status: 400 });

  const supabase = createServiceClient();
  const zip      = await getZip(id, supabase);
  if (!zip) return new NextResponse("Book not found", { status: 404 });

  const file = zip.file(path);
  if (!file) return new NextResponse("Image not found", { status: 404 });

  const data = await file.async("uint8array");
  const ext  = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext] ?? "image/jpeg";

  return new NextResponse(data, {
    status:  200,
    headers: {
      "Content-Type":  mime,
      "Cache-Control": "public, max-age=604800, immutable", // 7 dias
      "Content-Length": String(data.length),
    },
  });
}

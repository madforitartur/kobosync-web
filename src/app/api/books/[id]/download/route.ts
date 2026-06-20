import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: book, error } = await supabase
      .from("books")
      .select("title, epub_path, epub_url, drive_file_id")
      .eq("id", id)
      .single();

    if (error || !book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    let buffer: ArrayBuffer | null = null;

    // 1. epub_path no Supabase Storage — URL renovada pelo servidor (nunca expira no pedido)
    if (book.epub_path) {
      const { data: signed } = await supabase.storage
        .from("epubs")
        .createSignedUrl(book.epub_path, 300);
      if (signed?.signedUrl) {
        const res = await fetch(signed.signedUrl);
        if (res.ok) buffer = await res.arrayBuffer();
      }
    }

    // 2. epub_url pública (fallback)
    if (!buffer && book.epub_url) {
      const res = await fetch(book.epub_url);
      if (res.ok) buffer = await res.arrayBuffer();
    }

    // 3. Google Drive (último recurso)
    if (!buffer && book.drive_file_id) {
      buffer = await downloadFromDriveWithConfig(book.drive_file_id);
    }

    if (!buffer || buffer.byteLength < 100) {
      return NextResponse.json({ error: "EPUB nao disponivel" }, { status: 404 });
    }

    const safeTitle = (book.title ?? "livro")
      .replace(/^#?\d+[\s._\-]+/, "")
      .replace(/#\d+\s*/g, "")
      .replace(/_/g, " ")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s{2,}/g, " ")
      .trim() || "livro";

    const filename = encodeURIComponent(`${safeTitle}.epub`);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/epub+zip",
        "Content-Length":      String(buffer.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (err) {
    console.error("[download]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 500 },
    );
  }
}

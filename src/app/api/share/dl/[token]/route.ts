import { NextRequest, NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/auth";
import { getBookById } from "@/lib/firebase/books";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Descarrega um livro através de um link de partilha assinado (sem login, só esse livro, com validade). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = await verifyShareToken(token);
  if (!id) return new NextResponse("Link inválido ou expirado.", { status: 410 });
  const book = await getBookById(id).catch(() => null);
  if (!book?.drive_file_id) return new NextResponse("Livro não encontrado.", { status: 404 });
  const buffer = await downloadFromDriveWithConfig(book.drive_file_id).catch(() => null);
  if (!buffer || buffer.byteLength < 100) return new NextResponse("Livro não disponível.", { status: 404 });
  const name = (book.title ?? "livro").replace(/^#?\d+[\s._\-]+/, "").replace(/_/g, " ").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s{2,}/g, " ").trim() || "livro";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.epub`)}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

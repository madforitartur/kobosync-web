import { NextRequest, NextResponse } from "next/server";
import { listBooksByIds } from "@/lib/firebase/books";
import { addFiles, getSession, normalizeCode } from "@/lib/firebase/kobo-sessions";
import { epubFilename } from "@/lib/book-file";

export const runtime = "nodejs";

/** Chamada pela app (protegida por PIN): envia os livros selecionados para o código do Kobo. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const code = normalizeCode(body?.code);
  const ids: unknown = body?.ids;
  if (code.length !== 4) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every((x) => typeof x === "string"))
    return NextResponse.json({ error: "Seleção inválida (máx. 100 livros)" }, { status: 400 });

  if (!(await getSession(code))) return NextResponse.json({ error: "Código não encontrado ou expirado. Confirma o código no ecrã do Kobo." }, { status: 404 });

  const books = await listBooksByIds(ids as string[]);
  const res = await addFiles(code, books.filter((b) => b.drive_file_id || b.epub_url).map((b) => ({ id: b.id, title: b.title, filename: epubFilename(b.title) })));
  if (!res) return NextResponse.json({ error: "Código expirado" }, { status: 404 });
  return NextResponse.json({ ...res, sentIds: books.map((b) => b.id) });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/firebase/kobo-sessions";
import { loadEpubById } from "@/lib/book-file";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const s = await getSession(q.get("code") ?? "", q.get("secret") ?? "");
  const file = s?.files[Number(q.get("i"))];
  if (!s || !file) return NextResponse.json({ error: "Link expirado" }, { status: 404 });

  const found = await loadEpubById(file.id);
  if (!found) return NextResponse.json({ error: "EPUB não disponível" }, { status: 404 });
  const { buffer } = found;

  // Em streaming: evita o limite de ~4,5 MB das respostas "completas" na Vercel.
  const bytes = new Uint8Array(buffer);
  const CHUNK = 256 * 1024;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (let o = 0; o < bytes.length; o += CHUNK) ctrl.enqueue(bytes.subarray(o, o + CHUNK));
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="livro.epub"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

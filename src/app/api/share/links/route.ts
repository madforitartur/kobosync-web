import { NextRequest, NextResponse } from "next/server";
import { SHARE_LINK_DAYS, createShareToken } from "@/lib/auth";
import { getBookById } from "@/lib/firebase/books";
import { track } from "@/lib/firebase/activity";
import { currentUserId } from "@/lib/session";

export const runtime = "nodejs";

/** Cria links temporários (para enviar por WhatsApp, e-mail, …) dos livros indicados. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  if (!ids.length) return NextResponse.json({ error: "Sem livros" }, { status: 400 });
  const origin = request.nextUrl.origin;
  const links: { id: string; title: string; url: string }[] = [];
  for (const id of ids) {
    const book = await getBookById(id).catch(() => null);
    const token = book ? await createShareToken(id) : null;
    if (book && token) links.push({ id, title: book.title ?? "Livro", url: `${origin}/api/share/dl/${token}` });
  }
  if (links.length) track({ uid: await currentUserId(), type: "share", detail: `${links.length} link${links.length !== 1 ? "s" : ""}: ${links.slice(0, 5).map((l) => l.title).join("; ")}${links.length > 5 ? "…" : ""}` });
  return NextResponse.json({ links, days: SHARE_LINK_DAYS });
}

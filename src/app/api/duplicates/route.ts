import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getServerConfig } from "@/lib/env";
import { getAllBooksCached, patchBooks, type BookPatch } from "@/lib/firebase/books";
import { folderLabels } from "@/lib/firebase/drive-folders";
import { bestOf, findDuplicateGroups, isPending } from "@/lib/duplicates";
import type { Book } from "@/types/library";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

const slim = (b: Book, labels: Map<string, string>) => ({
  id: b.id, title: b.title, author: b.author, filesize: b.filesize, created_at: b.created_at,
  cover_url: b.cover_url, hidden: !!b.hidden, dup_ok: !!b.dup_ok,
  folder: b.drive_root ? labels.get(b.drive_root) ?? "Pasta removida" : null,
});

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const all = await getAllBooksCached(true);
  const labels = await folderLabels(getServerConfig().googleDriveFolderId);
  const groups = findDuplicateGroups(all).filter(isPending).map((g) => ({ key: g.key, books: g.books.map((b) => slim(b, labels)) }));
  const hidden = all.filter((b) => b.hidden).map((b) => slim(b, labels));
  return NextResponse.json({ groups, hidden, total: all.length }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 2000) : [];
  const action = body?.action;

  let patches: BookPatch[] = [];
  if (action === "hide") patches = ids.map((id) => ({ id, hidden: true }));
  else if (action === "unhide") patches = ids.map((id) => ({ id, hidden: false, dup_ok: true })); // reposto = decisão de manter
  else if (action === "keep") patches = ids.map((id) => ({ id, dup_ok: true }));
  else if (action === "auto") {
    const all = await getAllBooksCached(true);
    for (const g of findDuplicateGroups(all).filter(isPending)) {
      const keep = bestOf(g.books.filter((b) => !b.hidden));
      for (const b of g.books) if (!b.hidden && b.id !== keep.id) patches.push({ id: b.id, hidden: true });
    }
  } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  await patchBooks(patches);
  return NextResponse.json({ changed: patches.length }, { headers: NO_STORE });
}

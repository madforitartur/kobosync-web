import { NextRequest, NextResponse } from "next/server";
import { queryBooks, type BookQuery, type SortKey } from "@/lib/firebase/books";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;
const MAX_IDS = 3000;
const SORTS: SortKey[] = ["title", "author", "recent", "series", "size", "relevance"];

type Params = {
  q?: unknown;
  sort?: unknown;
  author?: unknown;
  series?: unknown;
  language?: unknown;
  page?: unknown;
  limit?: unknown;
  ids?: unknown;
  exclude?: unknown;
  idsOnly?: unknown;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const idList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_IDS) : undefined;

async function handle(p: Params) {
  const page = Math.max(1, Number(p.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(p.limit) || DEFAULT_LIMIT));
  const sort = SORTS.find((s) => s === p.sort);

  const query: BookQuery = {
    q: str(p.q),
    sort,
    author: str(p.author),
    series: str(p.series),
    language: str(p.language),
    ids: idList(p.ids),
    exclude: idList(p.exclude),
    from: (page - 1) * limit,
    to: (page - 1) * limit + limit - 1,
  };

  if (p.idsOnly === true) {
    const { books } = await queryBooks({ ...query, from: undefined, to: undefined });
    return NextResponse.json({ ids: books.map((b) => b.id) });
  }

  const { books, total } = await queryBooks(query);
  return NextResponse.json(
    { books, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) },
    // Cache só no browser do utilizador (a resposta depende da sessão com PIN)
    { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    return await handle({
      q: sp.get("q"), sort: sp.get("sort"), author: sp.get("author"), series: sp.get("series"),
      language: sp.get("language"), page: sp.get("page"), limit: sp.get("limit"),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load library" }, { status: 500 });
  }
}

/** Mesmos filtros, mas com listas de ids (coleções, "a ler", "por ler"…) no corpo. */
export async function POST(request: NextRequest) {
  try {
    return await handle((await request.json().catch(() => ({}))) as Params);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load library" }, { status: 500 });
  }
}

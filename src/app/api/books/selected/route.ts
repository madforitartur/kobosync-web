import { NextRequest, NextResponse } from "next/server";
import { listBooksByIds } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_IDS = 500; // Limite de segurança

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;

    // Validação rigorosa
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }
    if (ids.length === 0) {
      return NextResponse.json({ books: [], total: 0 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Too many ids (max ${MAX_IDS})` },
        { status: 400 },
      );
    }
    if (!ids.every((id) => typeof id === "string" && id.length > 0)) {
      return NextResponse.json({ error: "ids must be non-empty strings" }, { status: 400 });
    }

    const books = await listBooksByIds(ids as string[]);

    return NextResponse.json({
      books,
      total: books.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load selected books" },
      { status: 500 },
    );
  }
}

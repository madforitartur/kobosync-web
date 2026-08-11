import { NextRequest, NextResponse } from "next/server";
import { listBooks, countBooks } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("q")?.trim() || undefined;

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT),
    );

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const [books, total] = await Promise.all([
      listBooks(search, { from, to }),
      countBooks(search),
    ]);

    return NextResponse.json({
      books,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unable to load library";
    // Detectar Supabase pausado
    const isPaused = msg.includes("502") || msg.includes("503")
      || msg.includes("fetch failed") || msg.includes("ECONNREFUSED")
      || msg.includes("invalid_grant") || msg.includes("project_not_found");
    return NextResponse.json(
      {
        error: isPaused
          ? "Base de dados pausada. Acede a supabase.com/dashboard e clica em 'Restore project'."
          : msg,
      },
      { status: 500 },
    );
  }
}

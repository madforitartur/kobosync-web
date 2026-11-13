import { NextResponse } from "next/server";
import { getFacets } from "@/lib/firebase/books";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getFacets(), {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load facets" }, { status: 500 });
  }
}

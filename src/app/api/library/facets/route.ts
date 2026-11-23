import { NextResponse } from "next/server";
import { getFacets } from "@/lib/firebase/books";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const fmt = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "epub";
    return NextResponse.json(await getFacets(fmt), {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load facets" }, { status: 500 });
  }
}

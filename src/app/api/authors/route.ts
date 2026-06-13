import { NextResponse } from "next/server";
import { listAuthors } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const authors = await listAuthors();
    return NextResponse.json({ authors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load authors" },
      { status: 500 },
    );
  }
}

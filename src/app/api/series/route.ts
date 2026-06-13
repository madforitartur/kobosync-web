import { NextResponse } from "next/server";
import { listSeries } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const series = await listSeries();
    return NextResponse.json({ series });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load series" },
      { status: 500 },
    );
  }
}

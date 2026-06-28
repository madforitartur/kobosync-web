import { NextResponse } from "next/server";
import { syncLibrary } from "@/services/sync-library";

export const runtime     = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncLibrary();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}

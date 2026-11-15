import { requireAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
import { syncLibrary } from "@/services/sync-library";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
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

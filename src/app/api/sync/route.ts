import { requireAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
import { track } from "@/lib/firebase/activity";
import { currentUserId } from "@/lib/session";
import { syncLibrary } from "@/services/sync-library";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const result = await syncLibrary();
    track({ uid: await currentUserId(), type: "admin", detail: `Sincronização manual: ${result.newBooks} EPUB e ${result.newPdfs} PDF novos` });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}

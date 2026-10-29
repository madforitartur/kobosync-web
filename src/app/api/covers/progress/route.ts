import { NextResponse } from "next/server";
import { getSyncState } from "@/lib/firebase/sync-state";

export const runtime = "nodejs";

export async function GET() {
  const state = await getSyncState("covers");

  if (!state) {
    return NextResponse.json({ running: false });
  }

  const progressPct =
    state.total_books > 0 ? Math.round((state.processed / state.total_books) * 100) : 0;

  const elapsedSec = state.started_at
    ? Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000)
    : 0;

  let etaSec: number | null = null;
  if (state.processed > 0 && state.running && elapsedSec > 0) {
    const rate = state.processed / elapsedSec;
    const remaining = state.total_books - state.processed;
    etaSec = rate > 0 ? Math.round(remaining / rate) : null;
  }

  return NextResponse.json({
    running: state.running,
    progress: {
      total: state.total_books,
      processed: state.processed,
      success: state.success,
      failed: state.failed,
      percent: progressPct,
      currentBatch: state.current_batch,
      totalBatches: state.total_batches,
      elapsedSec,
      etaSec,
    },
    errors: (state.errors ?? []).slice(-20),
  });
}

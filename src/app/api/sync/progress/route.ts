/**
 * GET /api/sync/progress
 * Devolve o estado actual do sync de livros (doc "books" em sync_state).
 */
import { NextResponse } from "next/server";
import { getSyncState } from "@/lib/firebase/sync-state";

export const runtime = "nodejs";

export async function GET() {
  const state = await getSyncState("books");

  if (!state) {
    return NextResponse.json({ running: false, started: false });
  }

  const elapsed = state.started_at
    ? Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000)
    : 0;

  return NextResponse.json({
    running: state.running,
    started: !!state.started_at,
    found: state.total_books ?? 0,
    newBooks: state.success ?? 0,
    processed: state.processed ?? 0,
    failed: state.failed ?? 0,
    elapsedSec: elapsed,
    finishedAt: state.finished_at ?? null,
    errors: (state.errors ?? []).slice(-5),
  });
}

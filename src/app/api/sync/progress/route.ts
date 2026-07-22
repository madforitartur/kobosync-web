/**
 * GET /api/sync/progress
 * Devolve o estado actual do sync de livros (id=2 na tabela cover_sync_state).
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SYNC_STATE_ID = 2;

export async function GET() {
  const supabase = createServiceClient();

  const { data: state } = await supabase
    .from("cover_sync_state")
    .select("*")
    .eq("id", SYNC_STATE_ID)
    .maybeSingle();

  if (!state) {
    return NextResponse.json({ running: false, started: false });
  }

  const elapsed = state.started_at
    ? Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000)
    : 0;

  return NextResponse.json({
    running:    state.running,
    started:    !!state.started_at,
    found:      state.total_books  ?? 0,
    newBooks:   state.success      ?? 0,
    processed:  state.processed    ?? 0,
    failed:     state.failed       ?? 0,
    elapsedSec: elapsed,
    finishedAt: state.finished_at  ?? null,
    errors:     (state.errors ?? []).slice(-5),
  });
}

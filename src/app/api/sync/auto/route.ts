import { NextResponse } from "next/server";
import { claimAutoSync } from "@/lib/firebase/auto-sync";
import { syncLibrary } from "@/services/sync-library";

export const runtime = "nodejs";
export const maxDuration = 300;

const MIN_GAP = 10 * 60_000;

/** Verificação automática das pastas do Drive: qualquer utilizador com sessão a pode pedir, mas só corre de 10 em 10 minutos. */
export async function POST() {
  try {
    if (!(await claimAutoSync(MIN_GAP))) return NextResponse.json({ ran: false });
    const r = await syncLibrary();
    return NextResponse.json({ ran: true, newBooks: r.newBooks, found: r.found });
  } catch (e) {
    return NextResponse.json({ ran: false, error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

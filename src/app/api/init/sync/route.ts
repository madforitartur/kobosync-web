import { requireAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/covers/sync-all`,
      {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      },
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, note: "Iniciado em background" });
  }
}

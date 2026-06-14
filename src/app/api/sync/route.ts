import { NextResponse } from "next/server";
import { syncLibrary } from "@/services/sync-library";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncLibrary();

    // Disparar cover sync em background apos sync de livros
    if (result.processed > 0 || result.inserted > 0) {
      fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/covers/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "missing", limit: 50 }),
        }
      ).catch((err) => {
        console.error("[Sync] Cover auto-sync failed:", err);
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
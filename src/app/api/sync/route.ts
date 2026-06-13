import { NextResponse } from "next/server";
import { syncLibrary } from "@/services/sync-library";

export const runtime = "nodejs";
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
    // NOVO: Disparar cover sync em background após sync de livros
    if (result.processed > 0 || result.added > 0) {
      // Chamar cover sync para os livros NOVOS (sem capa)
      // Não esperamos — corre em paralelo
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/covers/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "missing", limit: 50 }),
      }).catch((err) => {
        console.error("[Sync] Cover auto-sync failed:", err);
      });
    }

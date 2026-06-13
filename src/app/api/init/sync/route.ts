import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Apenas corre o sync se houver livros sem capa
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/covers/sync-all`,
      {
        method: "POST",
        // Vercel timeout = 10s, então isto é só para iniciar
        signal: AbortSignal.timeout(5000),
      },
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, note: "Iniciado em background" });
  }
}

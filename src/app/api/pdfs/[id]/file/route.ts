import { NextRequest, NextResponse } from "next/server";
import { findPdf } from "@/lib/pdf-library";
import { openDriveStream } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

/** PDF em stream (sem limite de tamanho). Só para ficheiros das pastas de PDF configuradas. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hit = await findPdf(id).catch(() => null);
  if (!hit) return new NextResponse("PDF não encontrado.", { status: 404 });
  const res = await openDriveStream(id);
  if (!res.ok || !res.body) return new NextResponse("Não foi possível obter o PDF.", { status: 502 });
  const headers: Record<string, string> = { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" };
  const len = res.headers.get("content-length");
  if (len) headers["Content-Length"] = len;
  return new NextResponse(res.body, { headers });
}

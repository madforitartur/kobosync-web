import { NextRequest, NextResponse } from "next/server";
import { findPdf } from "@/lib/pdf-library";
import { fetchDriveThumbnail } from "@/lib/google-drive";

export const runtime = "nodejs";

/** Miniatura da primeira página (gerada pelo Drive). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hit = await findPdf(id).catch(() => null);
  if (!hit?.thumb) return new NextResponse(null, { status: 404 });
  const res = await fetchDriveThumbnail(hit.thumb).catch(() => null);
  if (!res?.ok || !res.body) return new NextResponse(null, { status: 404 });
  return new NextResponse(res.body, { headers: { "Content-Type": res.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=86400" } });
}

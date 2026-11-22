import { NextRequest, NextResponse } from "next/server";
import { listPdfs } from "@/lib/pdf-library";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { entries } = await listPdfs(request.nextUrl.searchParams.get("refresh") === "1");
    return NextResponse.json({ pdfs: entries }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

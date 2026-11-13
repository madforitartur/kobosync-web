import { NextRequest, NextResponse } from "next/server";
import { getCover } from "@/lib/firebase/covers";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cover = await getCover(id);
    if (!cover) return new NextResponse("Cover not found", { status: 404 });

    // O URL leva ?v=<timestamp>, por isso pode ser cacheado "para sempre":
    // se a capa mudar, o URL muda.
    return new NextResponse(new Uint8Array(cover.data), {
      status: 200,
      headers: {
        "Content-Type": cover.mime,
        "Content-Length": String(cover.data.length),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Error", { status: 500 });
  }
}

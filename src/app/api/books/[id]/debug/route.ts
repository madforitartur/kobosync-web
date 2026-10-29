import { NextRequest, NextResponse } from "next/server";
import { getBookById } from "@/lib/firebase/books";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const book = await getBookById(id);

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    let arrayBuffer: ArrayBuffer;

    if (book.epub_url) {
      const response = await fetch(book.epub_url);
      if (!response.ok) {
        return NextResponse.json({ error: `Failed: ${response.status}` }, { status: 502 });
      }
      arrayBuffer = await response.arrayBuffer();
    } else if (book.drive_file_id) {
      arrayBuffer = await downloadFromDriveWithConfig(book.drive_file_id);
    } else {
      return NextResponse.json({ error: "No source" }, { status: 404 });
    }

    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerXml = await zip.file("META-INF/container.xml")?.async("text");
    let opfPath: string | null = null;
    if (containerXml) {
      const match = containerXml.match(/full-path="([^"]+)"/);
      if (match) opfPath = match[1];
    }

    if (!opfPath) {
      return NextResponse.json({ error: "No OPF" }, { status: 422 });
    }

    const opfContent = await zip.file(opfPath)?.async("text");

    return NextResponse.json({
      title: book.title,
      opfPath,
      opfFullLength: opfContent?.length ?? 0,
      opfContent,
      tocNcx: (await zip.file("OEBPS/toc.ncx")?.async("text")) ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}

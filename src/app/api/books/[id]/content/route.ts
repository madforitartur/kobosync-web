import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { logActivity } from "@/lib/firebase/activity";
import { getBookById } from "@/lib/firebase/books";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import JSZip from "jszip";
import { cleanHtml, extractTitle, parseManifest, parseSpine } from "@/lib/epub-html";

export const runtime = "nodejs";
export const maxDuration = 60;

type Chapter = { id: string; title: string; html: string };

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

    await logActivity({ uid: await currentUserId(), type: "read", bookId: id, title: book.title ?? undefined }, 20 * 60_000);

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

    // Verificar ZIP
    const first4 = new Uint8Array(arrayBuffer.slice(0, 4));
    if (!(first4[0] === 0x50 && first4[1] === 0x4b)) {
      const head = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(0, 300))).toLowerCase();
      if (head.includes("<html") || head.includes("google")) {
        return NextResponse.json(
          { error: "Downloaded HTML, not EPUB. File is private or blocked." },
          { status: 422 },
        );
      }
      return NextResponse.json({ error: "Not a valid EPUB" }, { status: 422 });
    }

    const zip = await JSZip.loadAsync(arrayBuffer);

    // Encontrar OPF
    const containerXml = await zip.file("META-INF/container.xml")?.async("text");
    let opfPath: string | null = null;
    if (containerXml) {
      const match = containerXml.match(/full-path="([^"]+)"/);
      if (match) opfPath = match[1];
    }
    if (!opfPath) {
      for (const name of Object.keys(zip.files)) {
        if (name.endsWith(".opf")) { opfPath = name; break; }
      }
    }
    if (!opfPath) {
      return NextResponse.json({ error: "No OPF found" }, { status: 422 });
    }

    const opfContent = await zip.file(opfPath)?.async("text");
    if (!opfContent) {
      return NextResponse.json({ error: "OPF not readable" }, { status: 422 });
    }

    const opfDir = opfPath.includes("/")
      ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
      : "";

    // Mapa de imagens: caminho no ZIP → data URL base64
    // Pré-carrega todas as imagens do EPUB uma única vez
    const imageMap = buildImageMap(zip, opfDir, id);

    const manifest = parseManifest(opfContent);
    let spine = parseSpine(opfContent, manifest);

    if (spine.length === 0) {
      spine = Object.keys(zip.files)
        .filter((name) => /\.(x?html?)$/i.test(name) && !name.includes("META-INF"))
        .filter((name) => !name.endsWith(".css") && !name.endsWith(".xpgt"))
        .sort();
    }

    if (spine.length === 0) {
      return NextResponse.json({ error: "No HTML content found in EPUB" }, { status: 422 });
    }

    const chapters: Chapter[] = [];
    for (let i = 0; i < spine.length; i++) {
      const href = spine[i];
      const fullPath = opfDir + href;
      const file = zip.file(fullPath);
      if (!file) continue;

      try {
        const html = await file.async("text");
        // Diretório do capítulo para resolver src relativos
        const chapterDir = fullPath.includes("/")
          ? fullPath.substring(0, fullPath.lastIndexOf("/") + 1)
          : opfDir;
        const cleaned = cleanHtml(html, chapterDir, imageMap);
        const title = extractTitle(cleaned) || `Capítulo ${i + 1}`;
        chapters.push({ id: `c${i + 1}`, title, html: cleaned });
      } catch {
        // skip capítulo inválido
      }
    }

    if (chapters.length === 0) {
      return NextResponse.json({ error: "Could not load any chapters" }, { status: 422 });
    }

    return NextResponse.json({ title: book.title, chapters });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Constrói um Map de caminhos de imagem → URL do endpoint /api/books/[id]/image.
 * Não converte para base64 — serve as imagens via HTTP com cache de 7 dias.
 * Resultado: resposta JSON muito mais pequena e rápida.
 */
function buildImageMap(
  zip: JSZip,
  opfDir: string,
  bookId: string,
): Map<string, string> {
  const map = new Map<string, string>();

  const IMAGE_EXTS = new Set(["jpg","jpeg","png","gif","webp","svg","bmp"]);

  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (!IMAGE_EXTS.has(ext)) continue;

    // URL que o browser irá buscar: /api/books/[id]/image?path=OEBPS/images/x.jpg
    const url = `/api/books/${bookId}/image?path=${encodeURIComponent(name)}`;

    map.set(name, url);
    if (name.startsWith(opfDir)) {
      map.set(name.slice(opfDir.length), url);
    }
    const basename = name.split("/").pop()!;
    if (!map.has(basename)) map.set(basename, url);
  }

  return map;
}


import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;

type Chapter = {
  id: string;
  title: string;
  html: string;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: book, error } = await supabase
      .from("books")
      .select("epub_url, drive_file_id, title")
      .eq("id", id)
      .single();

    if (error || !book) {
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

    const manifest = parseManifest(opfContent);
    let spine = parseSpine(opfContent, manifest);

    if (spine.length === 0) {
      spine = Object.keys(zip.files)
        .filter((name) => /\.(x?html?)$/i.test(name) && !name.includes("META-INF"))
        .filter((name) => !name.endsWith(".css") && !name.endsWith(".xpgt"))
        .filter((name) => !name.includes("docimages/"))
        .sort();
    }

    if (spine.length === 0) {
      return NextResponse.json(
        { error: "No HTML content found in EPUB" },
        { status: 422 },
      );
    }

    const chapters: Chapter[] = [];
    for (let i = 0; i < spine.length; i += 1) {
      const href = spine[i];
      const fullPath = opfDir + href;
      const file = zip.file(fullPath);
      if (!file) continue;

      try {
        const html = await file.async("text");
        const cleaned = cleanHtml(html);
        const title = extractTitle(cleaned) || `Capítulo ${i + 1}`;
        chapters.push({ id: `c${i + 1}`, title, html: cleaned });
      } catch {
        // skip
      }
    }

    if (chapters.length === 0) {
      return NextResponse.json({ error: "Could not load any chapters" }, { status: 422 });
    }

    return NextResponse.json({
      title: book.title,
      chapters,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}

// ================== HELPERS ==================

function parseManifest(opfContent: string): Map<string, string> {
  const manifest = new Map<string, string>();
  const itemRegex = /<item\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(opfContent)) !== null) {
    const attrs = match[1];
    const idMatch = attrs.match(/\bid\s*=\s*"([^"]+)"/i);
    const hrefMatch = attrs.match(/\bhref\s*=\s*"([^"]+)"/i);
    if (idMatch && hrefMatch) {
      manifest.set(idMatch[1], hrefMatch[1]);
    }
  }
  return manifest;
}

function parseSpine(
  opfContent: string,
  manifest: Map<string, string>,
): string[] {
  const result: string[] = [];
  const spineMatch = opfContent.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
  if (!spineMatch) return result;

  const spineContent = spineMatch[1];
  const itemrefRegex = /<itemref\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemrefRegex.exec(spineContent)) !== null) {
    const attrs = match[1];
    const idrefMatch =
      attrs.match(/\bidref\s*=\s*"([^"]+)"/i) ??
      attrs.match(/\bidref\s*=\s*'([^']+)'/i) ??
      attrs.match(/\bidref\s*=\s*([^\s>]+)/i);

    if (idrefMatch) {
      const id = idrefMatch[1];
      const href = manifest.get(id);
      result.push(href ?? id);
    }
  }

  return result;
}

function extractTitle(html: string): string | null {
  const titleMatch =
    html.match(/<title>([^<]+)<\/title>/i) ??
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ??
    html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  return titleMatch?.[1]?.trim() || null;
}

/**
 * Limpa o HTML do EPUB para renderização linear no leitor.
 * Remove scripts, estilos embutidos e propriedades CSS inline que causam
 * layouts de duas colunas, floats, posicionamento absoluto, etc.
 */
function cleanHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = bodyMatch?.[1] ?? html;

  // 1. Remove blocos de script, style e comentários HTML
  content = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 2. Filtra atributos style="" inline:
  //    Remove propriedades de layout (float, column, position, width, height, margin fixo)
  //    Mantém apenas formatação de texto segura
  const SAFE_CSS_PROP = /^(font-(style|weight|variant|size)|text-(decoration|align|indent|transform)|color|line-height|letter-spacing|vertical-align|margin-(left|right)|padding-(left|right)|font-family)$/i;

  content = content.replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_full: string, val: string) => {
    const kept = val
      .split(/\s*;\s*/)
      .map((r) => r.trim())
      .filter((rule) => {
        if (!rule) return false;
        const prop = rule.split(":")[0]?.trim() ?? "";
        return SAFE_CSS_PROP.test(prop);
      })
      .join("; ");
    return kept ? `style="${kept}"` : "";
  });

  // Idem para aspas simples
  content = content.replace(/\bstyle\s*=\s*'([^']*)'/gi, (_full: string, val: string) => {
    const kept = val
      .split(/\s*;\s*/)
      .map((r) => r.trim())
      .filter((rule) => {
        if (!rule) return false;
        const prop = rule.split(":")[0]?.trim() ?? "";
        return SAFE_CSS_PROP.test(prop);
      })
      .join("; ");
    return kept ? `style="${kept}"` : "";
  });

  // 3. Filtra classes CSS do EPUB que activam layouts de coluna/float
  content = content.replace(/\bclass\s*=\s*"([^"]*)"/gi, (_full: string, classes: string) => {
    const filtered = classes
      .split(/\s+/)
      .filter((c) => c && !/^(col\d*|float|frame|page(-break)?|layout|two|multi|dual|sidebar|aside|calibre_col)/i.test(c))
      .join(" ")
      .trim();
    return filtered ? `class="${filtered}"` : "";
  });

  return content;
}

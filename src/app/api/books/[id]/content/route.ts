import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;

type Chapter = { id: string; title: string; html: string };

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

    // Mapa de imagens: caminho no ZIP → data URL base64
    // Pré-carrega todas as imagens do EPUB uma única vez
    const imageMap = await buildImageMap(zip, opfDir);

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

function parseManifest(opfContent: string): Map<string, string> {
  const manifest = new Map<string, string>();
  const re = /<item\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(opfContent)) !== null) {
    const id   = m[1].match(/\bid\s*=\s*"([^"]+)"/i)?.[1];
    const href = m[1].match(/\bhref\s*=\s*"([^"]+)"/i)?.[1];
    if (id && href) manifest.set(id, href);
  }
  return manifest;
}

function parseSpine(opfContent: string, manifest: Map<string, string>): string[] {
  const result: string[] = [];
  const spineMatch = opfContent.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
  if (!spineMatch) return result;
  const re = /<itemref\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spineMatch[1])) !== null) {
    const idref =
      m[1].match(/\bidref\s*=\s*"([^"]+)"/i)?.[1] ??
      m[1].match(/\bidref\s*=\s*'([^']+)'/i)?.[1];
    if (idref) {
      result.push(manifest.get(idref) ?? idref);
    }
  }
  return result;
}

function extractTitle(html: string): string | null {
  return (
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ??
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ??
    html.match(/<h2[^>]*>([^<]+)<\/h2>/i)?.[1]?.trim() ??
    null
  );
}

/**
 * Constrói um Map de caminhos de imagem (relativos ao opfDir) → data URL base64.
 * Apenas imagens com tipos MIME conhecidos e tamanho ≤ 3 MB são incluídas.
 */
async function buildImageMap(
  zip: JSZip,
  opfDir: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB por imagem

  const IMAGE_MIME: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png",  gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml",
    bmp: "image/bmp",
  };

  await Promise.all(
    Object.entries(zip.files).map(async ([name, file]) => {
      if (file.dir) return;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const mime = IMAGE_MIME[ext];
      if (!mime) return;

      try {
        const data = await file.async("uint8array");
        if (data.length > MAX_IMAGE_BYTES) return; // ignora imagens demasiado grandes

        // Converte para base64
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < data.length; i += chunk) {
          binary += String.fromCharCode(...data.slice(i, i + chunk));
        }
        const b64 = btoa(binary);
        const dataUrl = `data:${mime};base64,${b64}`;

        // Guarda por caminho completo e por caminho relativo ao opfDir
        map.set(name, dataUrl);
        if (name.startsWith(opfDir)) {
          map.set(name.slice(opfDir.length), dataUrl);
        }
        // Guarda também só pelo nome do ficheiro (fallback)
        const basename = name.split("/").pop()!;
        if (!map.has(basename)) map.set(basename, dataUrl);
      } catch {
        // ignora imagem inválida
      }
    }),
  );

  return map;
}

/** Resolve um src relativo a partir do directório do capítulo */
function resolveImageSrc(src: string, chapterDir: string, imageMap: Map<string, string>): string {
  if (src.startsWith("data:") || src.startsWith("http")) return src;

  // Remove fragment e query
  const cleanSrc = src.split("?")[0].split("#")[0];

  // Tentativas de resolução: caminho completo → relativo ao capítulo → basename
  const candidates = [
    chapterDir + cleanSrc,
    cleanSrc,
    cleanSrc.replace(/^\.\//, ""),
    cleanSrc.replace(/^\.\.\//, ""),
    cleanSrc.split("/").pop() ?? cleanSrc,
  ];

  for (const c of candidates) {
    const found = imageMap.get(c);
    if (found) return found;
  }

  // Não encontrou — deixa o src original (o browser mostrará imagem quebrada)
  return src;
}

/**
 * Limpa e prepara o HTML de um capítulo EPUB:
 * - Remove scripts, estilos em bloco, comentários
 * - Filtra propriedades CSS inline perigosas (layout, colunas, etc.)
 * - Converte src de <img> para data URLs base64
 */
function cleanHtml(
  html: string,
  chapterDir: string,
  imageMap: Map<string, string>,
): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = bodyMatch?.[1] ?? html;

  // 1. Remove scripts, estilos e comentários
  content = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 2. Substitui src das imagens por data URLs (inline, sem pedidos externos)
  content = content.replace(
    /<img\b([^>]*?)>/gi,
    (_full: string, attrs: string) => {
      // Extrai src
      const srcMatch = attrs.match(/\bsrc\s*=\s*"([^"]*?)"/i)
        ?? attrs.match(/\bsrc\s*=\s*'([^']*?)'/i);

      if (!srcMatch) return `<img${attrs}>`;

      const originalSrc = srcMatch[1];
      const resolvedSrc = resolveImageSrc(originalSrc, chapterDir, imageMap);

      // Remove src original e adiciona o resolvido; mantém alt, width, height
      const cleanedAttrs = attrs
        .replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
        .replace(/\bstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, "") // remove style para não forçar dimensões
        .trim();

      // Extrai alt para acessibilidade
      const alt = attrs.match(/\balt\s*=\s*"([^"]*)"/i)?.[1]
        ?? attrs.match(/\balt\s*=\s*'([^']*)'/i)?.[1]
        ?? "";

      return `<img src="${resolvedSrc}" alt="${alt}" loading="lazy" style="max-width:100%;height:auto;display:block;margin:0.75em auto;" ${cleanedAttrs}>`;
    },
  );

  // 3. Filtra style inline — mantém apenas formatação de texto segura
  // Nota: text-decoration excluído intencionalmente — EPUBs usam underline em blocos de texto
  const SAFE = /^(font-(style|weight|variant|size|family)|text-(align|indent|transform)|color|line-height|letter-spacing|vertical-align|margin-(left|right)|padding-(left|right))$/i;

  const filterStyle = (val: string) => {
    const kept = val.split(/\s*;\s*/).map(r => r.trim()).filter(rule => {
      if (!rule) return false;
      return SAFE.test(rule.split(":")[0]?.trim() ?? "");
    }).join("; ");
    return kept;
  };

  content = content.replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_f, v) => {
    const k = filterStyle(v); return k ? `style="${k}"` : "";
  });
  content = content.replace(/\bstyle\s*=\s*'([^']*)'/gi, (_f, v) => {
    const k = filterStyle(v); return k ? `style="${k}"` : "";
  });

  // 4. Filtra classes que activam layouts de coluna/float
  content = content.replace(/\bclass\s*=\s*"([^"]*)"/gi, (_f, classes: string) => {
    const filtered = classes.split(/\s+/)
      .filter(c => c && !/^(col\d*|float|frame|page(-break)?|layout|two|multi|dual|sidebar|aside|calibre_col)/i.test(c))
      .join(" ").trim();
    return filtered ? `class="${filtered}"` : "";
  });

  return content;
}

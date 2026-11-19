/** Funções partilhadas (servidor e browser) para transformar o HTML de um EPUB em capítulos legíveis. */

export function parseManifest(opfContent: string): Map<string, string> {
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

export function parseSpine(opfContent: string, manifest: Map<string, string>): string[] {
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

export function extractTitle(html: string): string | null {
  return (
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ??
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ??
    html.match(/<h2[^>]*>([^<]+)<\/h2>/i)?.[1]?.trim() ??
    null
  );
}

/** Resolve um src relativo a partir do directório do capítulo */
export function resolveImageSrc(src: string, chapterDir: string, imageMap: Map<string, string>): string {
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
export function cleanHtml(
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
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(iframe|object|embed|form|link|meta|base)\b[\s\S]*?(?:<\/\1>|\/?>)/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\b(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');

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

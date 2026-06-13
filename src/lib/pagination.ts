/**
 * Paginação inteligente de HTML por blocos.
 * Corta em fronteiras de bloco (parágrafo, heading) para não partir conteúdo.
 */

type Block = {
  type: "open" | "close" | "self-closing" | "text" | "comment";
  tag: string;
  content: string;
  textContent: string;
};

/**
 * Divide o HTML em blocos lógicos (parágrafos, headings, listas, etc.)
 * Preserva a estrutura e retorna cada bloco como string HTML completa.
 */
export function splitIntoBlocks(html: string): string[] {
  if (!html.trim()) return [];

  // Wrap em container para parsing correto
  const wrapped = `<div id="root">${html}</div>`;

  // Se estamos no browser, usa o DOM (mais preciso)
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    return splitWithDOM(wrapped);
  }

  // Fallback no servidor: regex simples
  return splitWithRegex(html);
}

function splitWithDOM(wrapped: string): string[] {
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("root");
  if (!root) return [];

  const blocks: string[] = [];
  for (const child of Array.from(root.children)) {
    blocks.push(child.outerHTML);
  }
  return blocks;
}

function splitWithRegex(html: string): string[] {
  // Regex para encontrar tags de bloco comuns no EPUB
  const blockTags =
    "p|h[1-6]|div|blockquote|pre|ul|ol|li|table|tr|hr|figure|section|article|aside|header|footer|nav";
  const regex = new RegExp(`<(${blockTags})\\b[^>]*>([\\s\\S]*?)<\\/\\1>|<((${blockTags})\\b[^>]*\\/?)>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  const seen = new Set<number>();

  while ((match = regex.exec(html)) !== null) {
    if (!seen.has(match.index)) {
      seen.add(match.index);
      blocks.push(match[0]);
    }
  }

  // Se não encontrou nada, devolve o html todo como 1 bloco
  if (blocks.length === 0) blocks.push(html);
  return blocks;
}

/**
 * Junta blocos em páginas até atingir o `maxChars` por página.
 * Se um bloco sozinho excede o limite, ainda assim é colocado (página fica maior).
 */
export function paginateByChars(html: string, maxChars: number): string[] {
  const blocks = splitIntoBlocks(html);
  if (blocks.length === 0) return [html];

  const pages: string[] = [];
  let currentPage = "";
  let currentLength = 0;

  for (const block of blocks) {
    const blockLength = block.length;

    // Se adicionar este bloco ultrapassa o limite E já temos conteúdo
    if (currentLength + blockLength > maxChars && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = block;
      currentLength = blockLength;
    } else {
      currentPage += block;
      currentLength += blockLength;
    }
  }

  // Última página
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [html];
}

/**
 * Junta o HTML de vários capítulos consecutivos para o leitor.
 */
/**
 * Junta o HTML de vários capítulos consecutivos para o leitor.
 */
export function combineChapters(
  chapters: Array<{ title: string; html: string }>,
): string {
  return chapters
    .map((c) => {
      const html = c.html.trim();
      const hasBlockTag = /^<(p|h[1-6]|div|blockquote|pre|ul|ol|table|figure|section|article)/i.test(html);
      const body = hasBlockTag ? html : `<p>${html}</p>`;
      const hasTitle = /<h[1-6][^>]*>.*?<\/h[1-6]>/i.test(html);
      const titleHtml = hasTitle ? "" : `<h1>${escapeHtml(c.title)}</h1>`;
      return titleHtml + body;
    })
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

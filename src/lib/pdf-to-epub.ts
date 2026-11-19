/**
 * Converte um PDF (com texto) num EPUB, tudo no browser: o ficheiro nunca sai do aparelho.
 *
 * Como funciona: lê o texto de cada página com o pdf.js, junta as linhas em parágrafos,
 * deteta títulos (letra maior), apaga cabeçalhos/rodapés e números de página repetidos,
 * junta palavras partidas com hífen, parte em capítulos (índice do PDF, títulos ou blocos de
 * páginas) e empacota um EPUB 3 (com índice EPUB 2 para os Kobo). A capa é a 1.ª página.
 * Não faz OCR (PDFs digitalizados) nem leva imagens/tabelas para o EPUB.
 */
import JSZip from "jszip";

export type PdfMeta = { title: string; author: string; pages: number; hasText: boolean };
export type ConvertOptions = { title: string; author: string; language: string; cover: boolean };
export type ConvertResult = { blob: Blob; chapters: number; pages: number; words: number; warnings: string[] };
export type Progress = (done: number, total: number, label: string) => void;

type Line = { y: number; x: number; xEnd: number; size: number; text: string };
type Block = { kind: "p" | "h1" | "h2"; text: string; page: number };
type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

async function open(buf: ArrayBuffer): Promise<PdfDoc> {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useSystemFonts: true }).promise;
}

// ── texto ────────────────────────────────────────────────────────────────────
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

async function pageLines(page: import("pdfjs-dist").PDFPageProxy): Promise<{ lines: Line[]; w: number; h: number }> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  type It = { s: string; x: number; y: number; w: number; size: number };
  const items: It[] = [];
  for (const raw of tc.items) {
    const it = raw as { str?: string; transform?: number[]; width?: number };
    if (!it.str || !it.transform || !it.str.trim()) continue;
    const [a, b, , , e, f] = it.transform;
    items.push({ s: it.str, x: e, y: f, w: it.width ?? 0, size: Math.hypot(a, b) || 10 });
  }
  items.sort((p, q) => q.y - p.y || p.x - q.x);
  const rows: It[][] = [];
  for (const it of items) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= 0.4 * Math.max(it.size, r[0].size));
    if (row) row.push(it); else rows.push([it]);
  }
  const lines: Line[] = rows.map((r) => {
    r.sort((p, q) => p.x - q.x);
    let text = "";
    let end = r[0].x;
    for (const it of r) {
      if (text && it.x - end > 0.18 * it.size && !text.endsWith(" ") && !it.s.startsWith(" ")) text += " ";
      text += it.s;
      end = it.x + it.w;
    }
    return { y: r[0].y, x: r[0].x, xEnd: end, size: Math.max(...r.map((i) => i.size)), text: clean(text) };
  }).filter((l) => l.text);
  lines.sort((p, q) => q.y - p.y);
  return { lines, w: vp.width, h: vp.height };
}

const ENDS = /[.!?…:;"”»)\]]$/;
const CHAPTER_RE = /^(cap[ií]tulo|chapter|parte|part|livro|book|pr[oó]logo|prologue|ep[ií]logo|epilogue|introdu[cç][aã]o|introduction|pref[aá]cio|preface)\b/i;
const PAGE_NO = /^(?:p[aá]g(?:ina)?\.?\s*)?(?:\d{1,4}|[ivxlc]{1,6})(?:\s*(?:\/|de|of)\s*\d{1,4})?$/i;

function join(prev: string, next: string): string {
  if (/[A-Za-zÀ-ÿ]-$/.test(prev) && /^[a-zà-ÿ]/.test(next)) return prev.slice(0, -1) + next; // palavra partida com hífen
  return `${prev} ${next}`;
}

export async function readPdfMeta(buf: ArrayBuffer): Promise<PdfMeta> {
  const doc = await open(buf);
  try {
    const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as { Title?: string; Author?: string };
    let chars = 0;
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      chars += tc.items.reduce((n, it) => n + ((it as { str?: string }).str?.length ?? 0), 0);
    }
    return { title: clean(info.Title ?? ""), author: clean(info.Author ?? ""), pages: doc.numPages, hasText: chars > 40 };
  } finally {
    void doc.destroy();
  }
}

// ── conversão ────────────────────────────────────────────────────────────────
export async function convertPdfToEpub(buf: ArrayBuffer, opts: ConvertOptions, onProgress?: Progress): Promise<ConvertResult> {
  const doc = await open(buf);
  const warnings: string[] = [];
  try {
    const n = doc.numPages;
    const pages: { lines: Line[]; w: number; h: number }[] = [];
    for (let i = 1; i <= n; i++) {
      onProgress?.(i - 1, n + 2, `A ler a página ${i} de ${n}`);
      pages.push(await pageLines(await doc.getPage(i)));
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0)); // deixa o ecrã respirar
    }

    const totalChars = pages.reduce((s, p) => s + p.lines.reduce((m, l) => m + l.text.length, 0), 0);
    if (totalChars < Math.max(80, n * 15)) throw new Error("Este PDF parece ser digitalizado (só imagens), sem texto que se possa converter. Seria preciso OCR.");

    // tamanho de letra do corpo = o mais frequente (por nº de carateres)
    const hist = new Map<number, number>();
    for (const p of pages) for (const l of p.lines) { const k = Math.round(l.size * 2) / 2; hist.set(k, (hist.get(k) ?? 0) + l.text.length); }
    const body = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // cabeçalhos e rodapés: linhas nas margens (topo/fundo) que se repetem em muitas páginas
    const key = (l: Line) => l.text.toLowerCase().replace(/\d+/g, "#");
    const margin = (p: { h: number }, l: Line) => l.y > p.h * 0.92 || l.y < p.h * 0.08;
    const seen = new Map<string, number>();
    for (const p of pages) for (const k of new Set(p.lines.filter((l) => margin(p, l)).map(key))) seen.set(k, (seen.get(k) ?? 0) + 1);
    const repeats = (k: string) => (seen.get(k) ?? 0) >= Math.max(3, Math.ceil(n * 0.25));
    for (const p of pages) p.lines = p.lines.filter((l) => !(margin(p, l) && (PAGE_NO.test(l.text) || repeats(key(l)))));

    // linhas → blocos (parágrafos e títulos)
    const blocks: Block[] = [];
    pages.forEach((p, pi) => {
      const ls = p.lines;
      if (!ls.length) return;
      const bodyLines = ls.filter((l) => Math.abs(l.size - body) < 0.8);
      const left = pct((bodyLines.length ? bodyLines : ls).map((l) => l.x), 0.15);
      const right = pct((bodyLines.length ? bodyLines : ls).map((l) => l.xEnd), 0.85);
      const gaps = ls.slice(1).map((l, i) => ls[i].y - l.y).filter((g) => g > 0);
      const typical = median(gaps) || body * 1.3;
      let cur: Block | null = null;
      let prev: Line | null = null;
      for (const l of ls) {
        const heading = l.size >= body * 1.18 && l.text.length <= 140 && !/[.]$/.test(l.text) ? (l.size >= body * 1.55 ? "h1" : "h2") : CHAPTER_RE.test(l.text) && l.text.length <= 60 && l.size >= body * 0.98 && Math.abs(l.x - left) > body ? "h2" : null;
        if (heading) {
          if (cur && cur.kind === heading && prev && prev.y - l.y < l.size * 2.2) cur.text = `${cur.text} ${l.text}`;
          else { cur = { kind: heading, text: l.text, page: pi }; blocks.push(cur); }
        } else {
          const gapBig = prev ? prev.y - l.y > typical * 1.45 : true;
          const indent = prev ? l.x - left > body * 0.9 && (ENDS.test(prev.text) || prev.xEnd < right - body * 3) : false;
          const shortEnd = prev ? prev.xEnd < right - (right - left) * 0.2 && ENDS.test(prev.text) : false;
          if (!cur || cur.kind !== "p" || gapBig || indent || shortEnd) { cur = { kind: "p", text: l.text, page: pi }; blocks.push(cur); }
          else cur.text = join(cur.text, l.text);
        }
        prev = l;
      }
    });
    // parágrafo cortado pela mudança de página
    const merged: Block[] = [];
    for (const b of blocks) {
      const last = merged[merged.length - 1];
      if (last && b.kind === "p" && last.kind === "p" && b.page === last.page + 1 && !ENDS.test(last.text) && /^[a-zà-ÿ0-9(]/.test(b.text)) last.text = join(last.text, b.text);
      else merged.push({ ...b });
    }

    // capítulos
    onProgress?.(n, n + 2, "A organizar capítulos");
    type Chap = { title: string; blocks: Block[] };
    let chapters: Chap[] = [];
    const outline = await outlineStarts(doc).catch(() => []);
    if (outline.length >= 2) {
      const starts = outline.map((o, i) => ({ ...o, end: outline[i + 1]?.page ?? n }));
      const first = outline[0].page;
      if (first > 0 && merged.some((b) => b.page < first)) chapters.push({ title: "Início", blocks: merged.filter((b) => b.page < first) });
      for (const s of starts) {
        const bl = merged.filter((b) => b.page >= s.page && b.page < s.end);
        const t = s.title.toLowerCase();
        if (bl[0] && bl[0].kind !== "p" && (bl[0].text.toLowerCase().includes(t) || t.includes(bl[0].text.toLowerCase()))) bl.shift();
        chapters.push({ title: s.title, blocks: bl });
      }
    } else {
      const isStart = (b: Block) => b.kind === "h1" || (b.kind === "h2" && CHAPTER_RE.test(b.text));
      let cur: Chap | null = null;
      for (const b of merged) {
        if (isStart(b)) { cur = { title: b.text, blocks: [] }; chapters.push(cur); }
        else { if (!cur) { cur = { title: "Início", blocks: [] }; chapters.push(cur); } cur.blocks.push(b); }
      }
      if (chapters.length < 2) {
        chapters = [];
        const per = n <= 14 ? n : 10;
        for (let s = 0; s < n; s += per) chapters.push({ title: n <= 14 ? opts.title || "Texto" : `Páginas ${s + 1}–${Math.min(n, s + per)}`, blocks: merged.filter((b) => b.page >= s && b.page < s + per) });
        warnings.push("Não encontrei capítulos no PDF; dividi por blocos de páginas.");
      }
    }
    chapters = chapters.filter((c) => c.blocks.length || c.title);
    const words = merged.reduce((w, b) => w + b.text.split(/\s+/).length, 0);

    let cover: Blob | null = null;
    if (opts.cover) {
      onProgress?.(n + 1, n + 2, "A criar a capa");
      cover = await renderCover(doc).catch(() => { warnings.push("Não consegui criar a capa."); return null; });
    }
    onProgress?.(n + 1, n + 2, "A montar o EPUB");
    const blob = await buildEpub(chapters, opts, cover);
    onProgress?.(n + 2, n + 2, "Concluído");
    return { blob, chapters: chapters.length, pages: n, words, warnings };
  } finally {
    void doc.destroy();
  }
}

async function outlineStarts(doc: PdfDoc): Promise<{ title: string; page: number }[]> {
  const out = await doc.getOutline();
  if (!out?.length) return [];
  const res: { title: string; page: number }[] = [];
  for (const it of out) {
    try {
      const dest = typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest;
      if (!dest) continue;
      const ref = dest[0];
      const page = typeof ref === "number" ? ref : await doc.getPageIndex(ref);
      const title = clean(it.title ?? "");
      if (title && !res.some((r) => r.page === page)) res.push({ title, page });
    } catch { /* destino inválido: ignora */ }
  }
  return res.sort((a, b) => a.page - b.page);
}

async function renderCover(doc: PdfDoc): Promise<Blob> {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(2, 1000 / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/jpeg", 0.85));
}

// ── EPUB ─────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const XHTML = (title: string, body: string, lang: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(lang)}" xml:lang="${esc(lang)}">\n<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n${body}\n</body>\n</html>\n`;

const CSS = `body { line-height: 1.5; margin: 0 4%; }
h1 { font-size: 1.6em; margin: 2em 0 1em; text-align: center; line-height: 1.2; page-break-after: avoid; }
h2 { font-size: 1.2em; margin: 1.6em 0 0.6em; page-break-after: avoid; }
p { margin: 0; text-indent: 1.4em; text-align: justify; }
h1 + p, h2 + p { text-indent: 0; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; max-height: 100%; }
`;

async function buildEpub(chapters: { title: string; blocks: Block[] }[], o: ConvertOptions, cover: Blob | null): Promise<Blob> {
  const lang = o.language || "pt";
  const title = o.title.trim() || "Sem título";
  const author = o.author.trim();
  const id = `urn:uuid:${uuid()}`;
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`);
  zip.file("OEBPS/style.css", CSS);

  const files = chapters.map((c, i) => {
    const name = `ch${String(i + 1).padStart(3, "0")}.xhtml`;
    const body = `<section epub:type="chapter"><h1>${esc(c.title)}</h1>\n` + c.blocks.map((b) => (b.kind === "p" ? `<p>${esc(b.text)}</p>` : `<h2>${esc(b.text)}</h2>`)).join("\n") + `\n</section>`;
    zip.file(`OEBPS/${name}`, XHTML(c.title, body, lang));
    return { name, title: c.title, id: `ch${i + 1}` };
  });

  if (cover) {
    zip.file("OEBPS/cover.jpg", cover);
    zip.file("OEBPS/cover.xhtml", XHTML(title, `<div class="cover"><img src="cover.jpg" alt="${esc(title)}"/></div>`, lang));
  }
  zip.file("OEBPS/nav.xhtml", XHTML("Índice", `<nav epub:type="toc" id="toc"><h1>Índice</h1><ol>${files.map((f) => `<li><a href="${f.name}">${esc(f.title)}</a></li>`).join("")}</ol></nav>`, lang));
  zip.file("OEBPS/toc.ncx", `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(id)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${esc(title)}</text></docTitle><navMap>${files.map((f, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(f.title)}</text></navLabel><content src="${f.name}"/></navPoint>`).join("")}</navMap></ncx>\n`);

  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    ...(cover ? [`<item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>`, `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`] : []),
    ...files.map((f) => `<item id="${f.id}" href="${f.name}" media-type="application/xhtml+xml"/>`),
  ].join("\n    ");
  const spine = [...(cover ? [`<itemref idref="cover" linear="no"/>`] : []), ...files.map((f) => `<itemref idref="${f.id}"/>`)].join("\n    ");
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${esc(id)}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    ${author ? `<dc:creator>${esc(author)}</dc:creator>` : ""}
    <dc:language>${esc(lang)}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
    ${cover ? `<meta name="cover" content="cover-img"/>` : ""}
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine toc="ncx">
    ${spine}
  </spine>
</package>
`);
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
}

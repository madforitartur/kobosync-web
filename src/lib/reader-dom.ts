/**
 * Utilitários de DOM do leitor: posições de texto (para destaques e pesquisa).
 * O "texto do livro" é a concatenação de todos os nós de texto dentro de `root`.
 */
import { HL_COLORS, type Highlight } from "./reader-annotations";

type Seg = { node: Text; start: number; end: number };

function segments(root: HTMLElement): Seg[] {
  const out: Seg[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n as Text).data.length;
    out.push({ node: n as Text, start: pos, end: pos + len });
    pos += len;
  }
  return out;
}

export function bookText(root: HTMLElement): string {
  return root.textContent ?? "";
}

function offsetOf(segs: Seg[], node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const s = segs.find((x) => x.node === node);
    return s ? s.start + offset : null;
  }
  // nó de elemento: usa o filho na posição indicada
  const child = node.childNodes[offset];
  if (child) {
    const first = segs.find((x) => child === x.node || child.contains(x.node));
    return first ? first.start : null;
  }
  const last = [...segs].reverse().find((x) => node.contains(x.node));
  return last ? last.end : null;
}

export function offsetsFromRange(root: HTMLElement, range: Range): { start: number; end: number } | null {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const segs = segments(root);
  const start = offsetOf(segs, range.startContainer, range.startOffset);
  const end = offsetOf(segs, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

export function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const segs = segments(root);
  const a = segs.find((s) => start >= s.start && start < s.end) ?? null;
  const b = segs.find((s) => end > s.start && end <= s.end) ?? null;
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, start - a.start);
  r.setEnd(b.node, end - b.start);
  return r;
}

export function clearMarks(root: HTMLElement, className: string): void {
  root.querySelectorAll(`mark.${className}`).forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  });
  root.normalize();
}

/** Embrulha [start,end) em <mark>, um por nó de texto abrangido. */
function wrap(root: HTMLElement, start: number, end: number, className: string, attrs: Record<string, string>) {
  const segs = segments(root).filter((s) => s.end > start && s.start < end);
  // do fim para o princípio, para não invalidar os nós anteriores
  for (const s of segs.reverse()) {
    const a = Math.max(start, s.start) - s.start;
    const b = Math.min(end, s.end) - s.start;
    if (b <= a) continue;
    const r = document.createRange();
    r.setStart(s.node, a);
    r.setEnd(s.node, b);
    const mark = document.createElement("mark");
    mark.className = className;
    for (const [k, v] of Object.entries(attrs)) mark.setAttribute(k, v);
    try {
      r.surroundContents(mark);
    } catch {
      /* intervalo inválido: ignora */
    }
  }
}

export function applyHighlights(root: HTMLElement, list: Highlight[]): void {
  clearMarks(root, "kb-hl");
  for (const h of [...list].sort((x, y) => x.start - y.start)) {
    wrap(root, h.start, h.end, "kb-hl", {
      "data-hl": h.id,
      style: `background:${HL_COLORS[h.color].bg};color:inherit;border-radius:2px;`,
      ...(h.note ? { title: h.note } : {}),
    });
  }
}

/** Marca temporária (resultado de pesquisa). */
export function flashRange(root: HTMLElement, start: number, end: number, ms = 2500): void {
  clearMarks(root, "kb-flash");
  wrap(root, start, end, "kb-flash", { style: "background:rgba(251,146,60,.55);color:inherit;border-radius:2px;" });
  window.setTimeout(() => clearMarks(root, "kb-flash"), ms);
}

// ── Pesquisa insensível a acentos e maiúsculas ─────────────────────────────

export type Folded = { text: string; map: number[] };

export function fold(text: string): Folded {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = text[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (let k = 0; k < f.length; k++) {
      out += f[k];
      map.push(i);
    }
  }
  return { text: out, map };
}

export type Hit = { start: number; end: number };

export function findAll(folded: Folded, term: string, limit = 200): Hit[] {
  const needle = fold(term.trim()).text;
  if (needle.length < 2) return [];
  const hits: Hit[] = [];
  let from = 0;
  while (hits.length < limit) {
    const i = folded.text.indexOf(needle, from);
    if (i < 0) break;
    hits.push({ start: folded.map[i], end: folded.map[i + needle.length - 1] + 1 });
    from = i + needle.length;
  }
  return hits;
}

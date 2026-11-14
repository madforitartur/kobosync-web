/**
 * Geometria real das linhas do leitor.
 *
 * Em vez de avançar um número fixo de píxeis (que acumula erro e corta/repete
 * linhas conforme fonte, largura, ecrã e imagens), medimos as linhas de texto
 * reais e alinhamos cada página ao topo de uma linha. Também ancoramos a
 * posição num offset de caracteres, que é igual em qualquer dispositivo.
 */
import { offsetsFromRange, rangeFromOffsets } from "./reader-dom";

export type Line = { top: number; bottom: number };

export const TOP_MARGIN = 12; // folga acima da primeira linha da página
export const BOTTOM_SAFE = 44; // zona inferior reservada (rodapé/progresso)

/** Linhas (em coordenadas de scroll), ordenadas e sem duplicados. */
export function measureLines(el: HTMLElement, root: HTMLElement): Line[] {
  const base = el.getBoundingClientRect().top - el.scrollTop;
  const rects: Line[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n as Text).data.trim()) continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) {
      if (r.height < 2) continue;
      rects.push({ top: r.top - base, bottom: r.bottom - base });
    }
  }
  root.querySelectorAll("img, svg, hr").forEach((im) => {
    const r = im.getBoundingClientRect();
    if (r.height >= 2) rects.push({ top: r.top - base, bottom: r.bottom - base });
  });
  rects.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const lines: Line[] = [];
  for (const r of rects) {
    const last = lines[lines.length - 1];
    if (last && r.top < last.top + (last.bottom - last.top) * 0.5) {
      last.bottom = Math.max(last.bottom, r.bottom); // mesma linha
    } else lines.push({ ...r });
  }
  return lines;
}

/** Nova scrollTop para avançar/recuar uma página, alinhada a linhas inteiras. */
export function pageTarget(lines: Line[], scrollTop: number, H: number, maxScroll: number, dir: "next" | "prev"): number {
  const usable = H - BOTTOM_SAFE;
  let target: number;
  if (dir === "next") {
    const l = lines.find((x) => x.bottom > scrollTop + usable);
    target = l ? l.top - TOP_MARGIN : scrollTop + usable;
    if (target <= scrollTop + 4) target = scrollTop + H - 40;
  } else {
    const i = lines.findIndex((x) => x.top >= scrollTop + TOP_MARGIN - 4);
    const prev = i > 0 ? lines[i - 1] : null;
    if (!prev) target = scrollTop - usable;
    else {
      const a = lines.find((x) => x.top >= prev.bottom - usable + TOP_MARGIN);
      target = a ? a.top - TOP_MARGIN : scrollTop - usable;
    }
    if (target >= scrollTop - 4) target = scrollTop - (H - 40);
  }
  return Math.max(0, Math.min(maxScroll, Math.round(target)));
}

/** Offset de caracteres da primeira linha visível (âncora independente do ecrã). */
export function anchorOffset(el: HTMLElement, root: HTMLElement, lines: Line[]): number | null {
  const l = lines.find((x) => x.top >= el.scrollTop + TOP_MARGIN - 4) ?? lines[lines.length - 1];
  if (!l) return null;
  const er = el.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  const y = er.top - el.scrollTop + (l.top + l.bottom) / 2;
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  for (const x of [rr.left + 4, rr.left + rr.width / 2]) {
    let node: Node | null = null;
    let off = 0;
    const cr = doc.caretRangeFromPoint?.(x, y);
    if (cr) { node = cr.startContainer; off = cr.startOffset; }
    else {
      const cp = doc.caretPositionFromPoint?.(x, y);
      if (cp) { node = cp.offsetNode; off = cp.offset; }
    }
    if (!node || !root.contains(node) || node.nodeType !== Node.TEXT_NODE) continue;
    const r = document.createRange();
    r.setStart(node, off);
    r.setEnd(node, Math.min((node as Text).data.length, off + 1));
    const o = offsetsFromRange(root, r);
    if (o) return o.start;
  }
  return null;
}

/** scrollTop que coloca o offset de caracteres no topo da página. */
export function scrollTopForOffset(el: HTMLElement, root: HTMLElement, offset: number): number | null {
  const r = rangeFromOffsets(root, offset, offset + 1);
  if (!r) return null;
  const rect = r.getBoundingClientRect();
  if (!rect.height) return null;
  return Math.max(0, Math.round(rect.top - el.getBoundingClientRect().top + el.scrollTop - TOP_MARGIN));
}

/**
 * Modo "Livro" (desktop): duas páginas abertas lado a lado.
 *
 * O texto corre em colunas CSS (uma coluna = uma página). O contentor avança
 * sempre uma "dupla" de cada vez (scrollLeft múltiplo da largura do livro), por
 * isso nunca há linhas cortadas. A posição é guardada pelo offset de caracteres
 * (igual ao modo normal), logo a leitura continua noutro aparelho ou modo.
 */
import { offsetsFromRange, rangeFromOffsets } from "./reader-dom";
import type { TextWidth } from "./reader-settings";

export type BookGeo = {
  PW: number; // largura de cada página
  PH: number; // altura da página
  padX: number; // margem lateral do texto
  padTop: number;
  padBottom: number;
  TW: number; // largura do texto (uma coluna)
  TH: number; // altura do texto
  G: number; // espaço entre colunas (= margens internas de duas páginas)
  W: number; // largura da dupla (2 páginas)
};

const MAX_PW: Record<TextWidth, number> = { narrow: 500, normal: 580, wide: 660 };

/** Desktop suficientemente grande para mostrar duas páginas. */
export const canShowBook = (vw: number, vh: number) => vw >= 960 && vh >= 560;

export function computeGeo(vw: number, vh: number, width: TextWidth): BookGeo {
  const PH = Math.round(Math.max(420, Math.min(vh - 72, 900)));
  const PW = Math.round(Math.max(300, Math.min((vw - 120) / 2, MAX_PW[width], PH * 0.8)));
  const padX = Math.round(Math.max(28, Math.min(PW * 0.1, 56)));
  const padTop = 40;
  const padBottom = 56;
  const TW = PW - 2 * padX;
  return { PW, PH, padX, padTop, padBottom, TW, TH: PH - padTop - padBottom, G: 2 * padX, W: 2 * PW };
}

/** Número de colunas (páginas) e de duplas, medido a partir da largura total do conteúdo. */
export function bookPages(root: HTMLElement, g: BookGeo): { cols: number; spreads: number } {
  const cols = Math.max(1, Math.round((root.scrollWidth + g.G) / (g.TW + g.G)));
  return { cols, spreads: Math.max(1, Math.ceil(cols / 2)) };
}

export const spreadIndex = (el: HTMLElement, g: BookGeo) => Math.round(el.scrollLeft / g.W);

/** Coluna (índice absoluto) onde está o caráter `o` (ou o primeiro seguinte que tenha caixa). */
function columnOf(el: HTMLElement, root: HTMLElement, g: BookGeo, o: number, len: number): number | null {
  const base = el.getBoundingClientRect().left;
  for (let k = o; k < Math.min(len, o + 60); k++) {
    const r = rangeFromOffsets(root, k, k + 1);
    const rc = r?.getClientRects()[0];
    if (rc && (rc.width || rc.height)) return Math.floor((rc.left - base + el.scrollLeft - g.padX + 2) / (g.TW + g.G));
  }
  return null;
}

/**
 * Offset de caracteres do primeiro texto de uma coluna da dupla atual (0 = esquerda, 1 = direita).
 * Procura por bissecção: a coluna de cada caráter cresce com o offset.
 */
export function columnStartOffset(el: HTMLElement, root: HTMLElement, g: BookGeo, side: 0 | 1): number | null {
  const len = root.textContent?.length ?? 0;
  if (len === 0) return null;
  const target = 2 * spreadIndex(el, g) + side;
  let lo = 0;
  let hi = len; // invariante: colunas de [0,lo) < target ≤ colunas a partir de hi
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const c = columnOf(el, root, g, mid, len);
    if (c === null || c >= target) hi = mid; else lo = mid + 1;
  }
  if (lo >= len) return null;
  return columnOf(el, root, g, lo, len) === target ? lo : null;
}

/** Offset do início da página esquerda da dupla atual (âncora da posição de leitura). */
export const anchorOffsetBook = (el: HTMLElement, root: HTMLElement, g: BookGeo) =>
  columnStartOffset(el, root, g, 0) ?? columnStartOffset(el, root, g, 1);

/** Dupla (e scrollLeft) onde está um offset de caracteres. */
export function scrollLeftForOffset(el: HTMLElement, root: HTMLElement, g: BookGeo, offset: number): number | null {
  const r = rangeFromOffsets(root, offset, offset + 1);
  if (!r) return null;
  const rect = r.getClientRects()[0] ?? r.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  return scrollLeftForX(el, g, rect.left);
}

/** scrollLeft da dupla que contém a coordenada x (em px do ecrã). */
export function scrollLeftForX(el: HTMLElement, g: BookGeo, clientX: number): number {
  const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - g.padX;
  const col = Math.max(0, Math.floor((x + 2) / (g.TW + g.G)));
  return Math.floor(col / 2) * g.W;
}

/** CSS (variáveis) para o texto em colunas. */
export const BOOK_CSS = `
.rdr.kb-book .kb-text { column-fill: auto; }
.rdr.kb-book .kb-text img { max-height: var(--kb-th); max-width: 100%; width: auto; object-fit: contain; break-inside: avoid; }
.rdr.kb-book .kb-text h1, .rdr.kb-book .kb-text h2, .rdr.kb-book .kb-text h3 { break-after: avoid; }
.rdr.kb-book .kb-text p { orphans: 2; widows: 2; }
.rdr.kb-book .kb-text section[data-ch]:not(:first-child) { break-before: column; }
.kb-face * { max-width: 100%; }
.kb-face > .kb-page > * > :first-child, .kb-face .kb-page > :first-child { margin-top: 0 !important; }
.kb-face.kb-cont .kb-page p:first-of-type { text-indent: 0 !important; }
`;

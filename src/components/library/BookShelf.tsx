"use client";

import { Children, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SHELF_THEMES, type ThemeId, shelfThemeById } from "@/lib/shelf-theme";

type Props = { children: ReactNode; bookWidth: number; gap?: number; themeId: ThemeId; onTheme: (id: ThemeId) => void };


const colorCache = new Map<string, string>();

/** Cor média (mais peso às cores vivas) de uma imagem; "r,g,b". */
function averageColor(img: HTMLImageElement): string | null {
  try {
    const c = document.createElement("canvas");
    c.width = 12; c.height = 18;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 12, 18);
    const d = ctx.getImageData(0, 0, 12, 18).data;
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const wt = 0.15 + (mx - mn) / 255; // cores vivas pesam mais
      r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
    }
    return `${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)}`;
  } catch {
    return null;
  }
}

/** Cor da lombada: a da capa (imagem real ou capa gerada). */
function useSpineColor(cell: React.RefObject<HTMLDivElement | null>) {
  const [rgb, setRgb] = useState<string | null>(null);
  useEffect(() => {
    const el = cell.current;
    if (!el) return;
    let off: (() => void) | undefined;
    const find = () => {
      off?.();
      const img = el.querySelector("img");
      if (img) {
        const key = img.currentSrc || img.src;
        const hit = colorCache.get(key);
        if (hit) return setRgb(hit);
        const done = () => { const c = averageColor(img); if (c) { colorCache.set(key, c); setRgb(c); } };
        if (img.complete && img.naturalWidth) done();
        else { img.addEventListener("load", done, { once: true }); off = () => img.removeEventListener("load", done); }
        return;
      }
      const gen = el.querySelector<HTMLElement>('[role="img"]');
      if (gen) {
        const m = [...getComputedStyle(gen).backgroundImage.matchAll(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)];
        if (m.length) {
          const avg = [1, 2, 3].map((k) => Math.round(m.reduce((n, x) => n + Number(x[k]), 0) / m.length));
          setRgb(avg.join(","));
        }
      }
    };
    find();
    const mo = new MutationObserver(find);
    mo.observe(el, { childList: true, subtree: true });
    return () => { mo.disconnect(); off?.(); };
  }, [cell]);
  return rgb;
}

function ShelfBook({ width, depth, children }: { width: number; depth: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const rgb = useSpineColor(ref);
  const style = { width, "--d": `${depth}px`, "--sc": rgb ?? "48,40,36" } as CSSProperties;
  return (
    <div ref={ref} className="kb-shelf-book" style={style}>
      <div className="kb-3d">
        <i className="kb-spine" aria-hidden />
        <i className="kb-pages" aria-hidden />
        {children}
      </div>
    </div>
  );
}

/**
 * Estante: os livros (em 3D) ficam em pé, encostados à parede, e pousam em tábuas de madeira.
 * O número de livros por prateleira ajusta-se à largura disponível.
 */
export function BookShelf({ children, bookWidth, gap = 16, themeId, onTheme }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const theme = shelfThemeById(themeId);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const items = Children.toArray(children);
  const perRow = Math.max(1, Math.floor((width + gap) / (bookWidth + gap)));
  const rows = useMemo(() => {
    const out: ReactNode[][] = [];
    for (let i = 0; i < items.length; i += perRow) out.push(items.slice(i, i + perRow));
    return out;
  }, [items, perRow]);

  const vars = {
    "--w1": theme.wall[0], "--w2": theme.wall[1],
    "--p1": theme.plank[0], "--p2": theme.plank[1], "--p3": theme.plank[2], "--pt": theme.top,
  } as CSSProperties;

  return (
    <div>
      <div role="group" aria-label="Madeira da estante" className="mb-2 flex items-center justify-end gap-1.5 text-xs text-on-surface-variant">
        <span className="mr-1 font-semibold">Madeira</span>
        {SHELF_THEMES.map((t) => (
          <button key={t.id} onClick={() => onTheme(t.id)} aria-label={`Madeira ${t.name}`} aria-pressed={t.id === theme.id} title={t.name}
            className={`h-5 w-5 rounded-full border-2 ${t.id === theme.id ? "border-primary ring-2 ring-primary/30" : "border-outline-variant"}`} style={{ background: t.swatch }} />
        ))}
      </div>
      <div ref={ref} data-testid="shelf" data-theme-id={theme.id} style={vars} className="kb-shelf overflow-hidden rounded-2xl px-4 pb-2 pt-3 sm:px-6">
        <style>{SHELF_CSS}</style>
        {rows.map((row, r) => (
          <div key={r} className="kb-shelf-row">
            <div className="flex items-end" style={{ gap: gap + 6 }}>
              {row.map((c, i) => {
                const depth = 22; // espessura da lombada (px)
                return <ShelfBook key={i} width={bookWidth} depth={depth}>{c}</ShelfBook>;
              })}
            </div>
            <div className="kb-plank" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}

const SHELF_CSS = `
.kb-shelf {
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(255,214,150,.16), transparent 60%),
    repeating-linear-gradient(90deg, rgba(0,0,0,.10) 0 2px, transparent 2px 64px),
    linear-gradient(180deg, var(--w1), var(--w2));
  box-shadow: inset 0 0 40px rgba(0,0,0,.55), inset 0 2px 0 rgba(255,255,255,.05);
}
.kb-shelf-row { position: relative; padding-top: 46px; } /* espaço para o livro selecionado subir */
.kb-shelf-row > .flex { position: relative; z-index: 1; padding: 0 10px; min-height: 120px; margin-bottom: -3px; } /* o livro pousa ligeiramente atrás da tábua */
.kb-plank {
  position: relative; z-index: 2; height: 18px; margin: 0 -24px;
  background:
    repeating-linear-gradient(90deg, rgba(60,30,10,.18) 0 1px, transparent 1px 9px),
    linear-gradient(180deg, var(--p1) 0%, var(--p2) 35%, var(--p3) 100%);
  border-top: 2px solid var(--pt);
  box-shadow: 0 10px 14px -4px rgba(0,0,0,.6), inset 0 -3px 0 rgba(0,0,0,.25);
}

/* Livro em 3D: capa à frente, lombada (na cor da capa) à esquerda e folhas à direita */
.kb-shelf-book { perspective: 900px; perspective-origin: 50% 100%; position: relative; } /* base do livro fica sempre na tábua */
.kb-shelf-book::before { /* sombra projetada na parede, atrás do livro */
  content: ""; position: absolute; z-index: -1; left: 14%; right: -16%; top: 4%; bottom: 2px;
  background: rgba(0,0,0,.55); filter: blur(9px); border-radius: 4px; transform: translate(10px, 2px);
  transition: transform .25s ease, opacity .25s ease, filter .25s ease; opacity: .8;
}
.kb-shelf-book::after { /* sombra no tabuleiro, fica no sítio quando o livro levanta */
  content: ""; position: absolute; left: 4%; right: -26%; bottom: -4px; height: 14px; z-index: -1;
  background: radial-gradient(closest-side, rgba(0,0,0,.7), transparent); filter: blur(2px);
  transition: opacity .25s ease, transform .25s ease;
}
.kb-3d {
  position: relative; transform-style: preserve-3d; transform-origin: 50% 100%;
  transform: rotateY(22deg); transition: transform .25s ease;
}
.kb-shelf-book:hover .kb-3d, .kb-shelf-book:focus-within .kb-3d { transform: translateY(-5px) rotateY(8deg); }
/* selecionado: levanta da base, a sombra do tabuleiro fica visível por baixo */
.kb-shelf-book:has([data-selected="true"]) .kb-3d { transform: translateY(-18px) rotateY(8deg); }
.kb-shelf-book:has([data-selected="true"])::before { transform: translate(12px, 9px); opacity: .6; filter: blur(10px); }
.kb-shelf-book:has([data-selected="true"])::after { opacity: .95; transform: scale(1.08); }
.kb-3d > :not(i) { box-shadow: inset 2px 0 3px rgba(255,255,255,.18), inset -2px 0 4px rgba(0,0,0,.25); border-radius: 4px 6px 6px 4px / 4px 6px 6px 4px; }
.kb-spine, .kb-pages { position: absolute; top: 0; bottom: 0; width: var(--d); display: block; }
.kb-spine {
  left: 0; transform-origin: left center; transform: rotateY(90deg); border-radius: 4px;
  background:
    linear-gradient(90deg, rgba(0,0,0,.38), rgba(255,255,255,.16) 40%, rgba(0,0,0,.34)), /* sombreado de superfície arredondada */
    linear-gradient(180deg, rgb(var(--sc)), color-mix(in srgb, rgb(var(--sc)) 72%, black));
}
.kb-spine::before, .kb-spine::after { /* filetes decorativos da lombada */
  content: ""; position: absolute; left: 0; right: 0; height: 2px; background: rgba(255,255,255,.35);
}
.kb-spine::before { top: 12%; } .kb-spine::after { bottom: 12%; }
.kb-pages {
  right: 0; transform-origin: right center; transform: rotateY(-90deg);
  background:
    repeating-linear-gradient(0deg, rgba(120,100,70,.35) 0 1px, transparent 1px 3px),
    linear-gradient(90deg, #efe6d2, #d9cdb4);
  margin: 3px 0;
}
@media (prefers-reduced-motion: reduce) { .kb-3d, .kb-shelf-book::before, .kb-shelf-book::after { transition: none; } }
`;

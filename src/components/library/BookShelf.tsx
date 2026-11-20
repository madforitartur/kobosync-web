"use client";

import { Children, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useStored } from "@/hooks/useStored";

type Props = { children: ReactNode; bookWidth: number; gap?: number };

/** Madeiras disponíveis (cores da parede de fundo, da tábua e do realce). */
export const SHELF_THEMES = [
  { id: "carvalho", name: "Carvalho", wall: ["#8a6a4b", "#6b4f37"], plank: ["#e3b982", "#c99a5f", "#a07040"], top: "#f3d3a2", swatch: "#d9ab72" },
  { id: "nogueira", name: "Nogueira", wall: ["#4a3427", "#35251b"], plank: ["#c58f55", "#a8743f", "#7a4f27"], top: "#e0b27c", swatch: "#8a5a30" },
  { id: "mogno", name: "Mogno", wall: ["#4a1f1a", "#2f130f"], plank: ["#a2492f", "#7f3322", "#55210f"], top: "#c9704f", swatch: "#7f3322" },
  { id: "ebano", name: "Ébano", wall: ["#26262b", "#141417"], plank: ["#4a4a52", "#35353b", "#1d1d21"], top: "#6a6a74", swatch: "#2a2a2f" },
] as const;
type ThemeId = (typeof SHELF_THEMES)[number]["id"];

/**
 * Estante: os livros (em 3D) ficam em pé, encostados à parede, e pousam em tábuas de madeira.
 * O número de livros por prateleira ajusta-se à largura disponível.
 */
export function BookShelf({ children, bookWidth, gap = 16 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [themeId, setThemeId] = useStored<ThemeId>("kobosync:shelf-theme", "nogueira");
  const theme = SHELF_THEMES.find((t) => t.id === themeId) ?? SHELF_THEMES[1];

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
          <button key={t.id} onClick={() => setThemeId(t.id)} aria-label={`Madeira ${t.name}`} aria-pressed={t.id === theme.id} title={t.name}
            className={`h-5 w-5 rounded-full border-2 ${t.id === theme.id ? "border-primary ring-2 ring-primary/30" : "border-outline-variant"}`} style={{ background: t.swatch }} />
        ))}
      </div>
      <div ref={ref} data-testid="shelf" data-theme-id={theme.id} style={vars} className="kb-shelf overflow-hidden rounded-2xl px-4 pb-2 pt-3 sm:px-6">
        <style>{SHELF_CSS}</style>
        {rows.map((row, r) => (
          <div key={r} className="kb-shelf-row">
            <div className="flex items-end" style={{ gap: gap + 6 }}>
              {row.map((c, i) => {
                const depth = 14 + ((r * 7 + i * 5) % 5) * 3; // espessura diferente por livro (14–26px)
                return (
                  <div key={i} className="kb-shelf-book" style={{ width: bookWidth, ["--d" as string]: `${depth}px` }}>
                    <div className="kb-3d">
                      <i className="kb-spine" aria-hidden />
                      <i className="kb-pages" aria-hidden />
                      {c}
                    </div>
                  </div>
                );
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
.kb-shelf-row { position: relative; padding-top: 26px; }
.kb-shelf-row > .flex { position: relative; z-index: 1; padding: 0 10px; min-height: 120px; }
.kb-plank {
  position: relative; z-index: 2; height: 18px; margin: 0 -24px;
  background:
    repeating-linear-gradient(90deg, rgba(60,30,10,.18) 0 1px, transparent 1px 9px),
    linear-gradient(180deg, var(--p1) 0%, var(--p2) 35%, var(--p3) 100%);
  border-top: 2px solid var(--pt);
  box-shadow: 0 10px 14px -4px rgba(0,0,0,.6), inset 0 -3px 0 rgba(0,0,0,.25);
}

/* Livro em 3D: capa à frente, lombada à esquerda e folhas à direita */
.kb-shelf-book { perspective: 700px; position: relative; }
.kb-shelf-book::after { /* sombra no tabuleiro */
  content: ""; position: absolute; left: 6%; right: -22%; bottom: -3px; height: 12px; z-index: -1;
  background: radial-gradient(closest-side, rgba(0,0,0,.6), transparent); filter: blur(2px);
}
.kb-3d {
  position: relative; transform-style: preserve-3d; transform-origin: 50% 100%;
  transform: rotateY(26deg); transition: transform .25s ease;
}
.kb-shelf-book:hover .kb-3d, .kb-shelf-book:focus-within .kb-3d { transform: translateY(-8px) rotateY(10deg); }
.kb-3d > :not(i) { box-shadow: inset 2px 0 3px rgba(255,255,255,.18), inset -2px 0 4px rgba(0,0,0,.25); border-radius: 2px 4px 4px 2px; }
.kb-spine, .kb-pages { position: absolute; top: 0; bottom: 0; width: var(--d); display: block; }
.kb-spine {
  left: 0; transform-origin: left center; transform: rotateY(90deg);
  background:
    linear-gradient(90deg, rgba(255,255,255,.18), rgba(0,0,0,.35)),
    linear-gradient(180deg, #2a2420, #1b1714);
  border-top: 3px solid rgba(255,215,130,.45); border-bottom: 3px solid rgba(255,215,130,.45);
}
.kb-pages {
  right: 0; transform-origin: right center; transform: rotateY(-90deg);
  background:
    repeating-linear-gradient(0deg, rgba(120,100,70,.35) 0 1px, transparent 1px 3px),
    linear-gradient(90deg, #efe6d2, #d9cdb4);
  margin: 3px 0;
}
@media (prefers-reduced-motion: reduce) { .kb-3d { transition: none; } }
`;

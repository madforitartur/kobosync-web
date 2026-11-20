"use client";

import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = { children: ReactNode; bookWidth: number; gap?: number };

/**
 * Estante: os livros ficam em pé, encostados à parede, e pousam em tábuas de madeira.
 * O número de livros por prateleira ajusta-se à largura disponível.
 */
export function BookShelf({ children, bookWidth, gap = 16 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
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

  return (
    <div ref={ref} data-testid="shelf" className="kb-shelf overflow-hidden rounded-2xl px-4 pb-2 pt-3 sm:px-6">
      <style>{SHELF_CSS}</style>
      {rows.map((row, r) => (
        <div key={r} className="kb-shelf-row">
          <div className="flex items-end" style={{ gap }}>
            {row.map((c, i) => (
              <div key={i} className="kb-shelf-book" style={{ width: bookWidth }}>{c}</div>
            ))}
          </div>
          <div className="kb-plank" aria-hidden />
        </div>
      ))}
    </div>
  );
}

const SHELF_CSS = `
.kb-shelf {
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(255,214,150,.14), transparent 60%),
    repeating-linear-gradient(90deg, rgba(0,0,0,.10) 0 2px, transparent 2px 64px),
    linear-gradient(180deg, #4a3427, #35251b);
  box-shadow: inset 0 0 40px rgba(0,0,0,.55), inset 0 2px 0 rgba(255,255,255,.05);
}
.kb-shelf-row { position: relative; padding-top: 26px; }
.kb-shelf-row > .flex { position: relative; z-index: 1; padding: 0 6px; min-height: 120px; }
.kb-plank {
  position: relative; z-index: 2; height: 18px; margin: 0 -24px;
  background:
    repeating-linear-gradient(90deg, rgba(60,30,10,.18) 0 1px, transparent 1px 9px),
    linear-gradient(180deg, #c58f55 0%, #a8743f 35%, #7a4f27 100%);
  border-top: 2px solid #e0b27c;
  box-shadow: 0 10px 14px -4px rgba(0,0,0,.6), inset 0 -3px 0 rgba(0,0,0,.25);
}
.kb-shelf-book { transform-origin: bottom center; transition: transform .18s ease; }
.kb-shelf-book > * { filter: drop-shadow(4px 6px 5px rgba(0,0,0,.55)); }
.kb-shelf-book:hover { transform: translateY(-8px) rotate(-1.2deg); }
.kb-shelf-book:nth-child(3n+2) { margin-bottom: 0; }
@media (prefers-reduced-motion: reduce) { .kb-shelf-book { transition: none; } .kb-shelf-book:hover { transform: none; } }
`;

"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  variant?: "mobile" | "desktop";
};

const RADIUS = 2; // páginas mostradas antes e depois da actual

/**
 * Janela de páginas à volta da actual: 2 antes + actual + 2 depois.
 * Junto ao início/fim a janela desliza para continuar a mostrar 5 números.
 */
export function pageWindow(page: number, total: number, radius = RADIUS): number[] {
  const size = radius * 2 + 1;
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(1, Math.min(page - radius, total - size + 1));
  return Array.from({ length: size }, (_, i) => start + i);
}

function GoToPage({
  page,
  totalPages,
  onChange,
  rounded,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  rounded: string;
}) {
  const [value, setValue] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    onChange(Math.min(totalPages, Math.max(1, n)));
    setValue("");
    (document.activeElement as HTMLElement | null)?.blur();
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 text-xs text-on-surface-variant">
      <label htmlFor="goto-page" className="font-bold uppercase tracking-wider text-outline">
        Ir para
      </label>
      <input
        id="goto-page"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={`Número da página (1 a ${totalPages})`}
        placeholder={String(page)}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, String(totalPages).length))}
        className={`h-9 w-16 border border-outline-variant bg-transparent text-center text-sm font-bold text-on-surface outline-none placeholder:font-normal placeholder:text-outline focus:border-primary ${rounded}`}
      />
      <span className="whitespace-nowrap">/ {totalPages}</span>
      <button
        type="submit"
        disabled={!value}
        className={`h-9 bg-primary px-4 text-xs font-bold text-on-primary transition disabled:opacity-30 ${rounded}`}
      >
        Ir
      </button>
    </form>
  );
}

export function Pagination({ page, totalPages, onChange, variant = "desktop" }: PaginationProps) {
  if (totalPages <= 1) return null;

  const numbers = pageWindow(page, totalPages);
  const isMobile = variant === "mobile";

  const shape = isMobile ? "rounded-full" : "rounded";
  const base = `flex h-9 w-9 shrink-0 items-center justify-center border text-xs font-bold transition ${shape}`;
  const idle = "border-outline-variant text-on-surface-variant hover:bg-surface-container";
  const active = "border-primary bg-primary text-on-primary";

  const numberButton = (n: number) => (
    <button
      key={n}
      onClick={() => onChange(n)}
      aria-label={`Página ${n}`}
      aria-current={n === page ? "page" : undefined}
      className={`${base} ${n === page ? active : idle}`}
    >
      {n}
    </button>
  );

  const arrow = (dir: "prev" | "next") => {
    const target = dir === "prev" ? page - 1 : page + 1;
    const disabled = dir === "prev" ? page === 1 : page === totalPages;
    return (
      <button
        onClick={() => onChange(target)}
        disabled={disabled}
        aria-label={dir === "prev" ? "Página anterior" : "Página seguinte"}
        className={`${base} ${idle} disabled:opacity-30`}
      >
        {dir === "prev" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    );
  };

  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const ellipsis = (key: string) => (
    <span key={key} className="flex h-9 w-6 items-center justify-center text-on-surface-variant" aria-hidden>
      …
    </span>
  );

  // Desktop: mostra também a primeira e a última página
  const desktopNumbers = (
    <>
      {first > 1 && numberButton(1)}
      {first > 2 && ellipsis("e-start")}
      {numbers.map(numberButton)}
      {last < totalPages - 1 && ellipsis("e-end")}
      {last < totalPages && numberButton(totalPages)}
    </>
  );

  if (isMobile) {
    return (
      <nav aria-label="Paginação" className="mt-6 flex flex-col items-center gap-4">
        <div className="flex items-center justify-center gap-1.5">
          {arrow("prev")}
          {numbers.map(numberButton)}
          {arrow("next")}
        </div>
        <GoToPage page={page} totalPages={totalPages} onChange={onChange} rounded={shape} />
      </nav>
    );
  }

  return (
    <nav
      aria-label="Paginação"
      className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant pt-6"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-outline">
        Página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-1">
        {arrow("prev")}
        {desktopNumbers}
        {arrow("next")}
      </div>
      <GoToPage page={page} totalPages={totalPages} onChange={onChange} rounded={shape} />
    </nav>
  );
}

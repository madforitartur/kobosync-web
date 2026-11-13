"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { BookCover } from "@/components/BookCover";
import { cleanBookTitle } from "@/lib/book-title";
import type { Book } from "@/types/library";

export type BookCardProps = {
  book: Book;
  selected: boolean;
  progress?: number;
  sentToKobo?: boolean;
  finished?: boolean;
  /** modo compacto (telemóvel) */
  compact: boolean;
  variant: "grid" | "list";
  selectMode?: boolean;
  onActivate: (book: Book, e: React.MouseEvent | React.KeyboardEvent) => void;
};

function BookCardBase({ book, selected, progress, sentToKobo, finished, compact, variant, selectMode, onActivate }: BookCardProps) {
  const title = cleanBookTitle(book.title);
  const label = selectMode ? `${selected ? "Desselecionar" : "Selecionar"} ${title}` : `Opções de ${title}`;

  const handlers = {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    "aria-pressed": selectMode ? selected : undefined,
    onClick: (e: React.MouseEvent) => onActivate(book, e),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onActivate(book, e);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(book, e);
      }
    },
  };

  const cover = (
    <BookCover coverUrl={book.cover_url} title={title} isSelected={selected} progress={progress} sentToKobo={sentToKobo} finished={finished} />
  );

  if (variant === "list") {
    return (
      <div
        {...handlers}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
          selected ? "border-primary bg-surface-container-low" : "border-outline-variant"
        }`}
      >
        <div className={compact ? "w-12 shrink-0" : "w-14 shrink-0"}>{cover}</div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold leading-tight text-primary">{title}</p>
          <p className="mt-0.5 truncate text-sm text-on-surface-variant">{book.author ?? "Autor desconhecido"}</p>
          <p className="mt-0.5 truncate text-xs text-outline">
            {[book.series ? `${book.series}${book.series_index ? ` #${book.series_index}` : ""}` : null,
              progress !== undefined && progress > 0 ? (finished ? "Lido" : `${Math.round(progress * 100)}% lido`) : null]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      {...handlers}
      whileTap={compact ? { scale: 0.95 } : undefined}
      transition={{ duration: 0.15 }}
      className="group cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      {cover}
      {compact ? (
        <>
          <div className="mt-1.5 min-h-[2.2rem]">
            <p className="line-clamp-2 text-[11px] font-bold leading-tight text-primary">{title}</p>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10px] text-on-surface-variant">{book.author ?? "–"}</p>
        </>
      ) : (
        <>
          <div className="mt-3 h-[2.8rem] overflow-hidden">
            <h3 className="line-clamp-2 font-display-lg text-[17px] font-bold leading-[1.4] text-primary">{title}</h3>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-on-surface-variant">{book.author ?? "Autor desconhecido"}</p>
        </>
      )}
    </motion.div>
  );
}

export const BookCard = memo(BookCardBase);

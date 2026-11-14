"use client";

import { useEffect, useMemo, useState } from "react";
import { BookMarked, X } from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { cleanBookTitle } from "@/lib/book-title";
import type { ReadingEntry } from "@/lib/reading-progress";
import type { Book } from "@/types/library";

type ReadingListProps = {
  entries: ReadingEntry[];
  onOpen: (bookId: string) => void;
  onRemove: (bookId: string) => void;
};

function timeAgo(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

export function ReadingList({ entries, onOpen, onRemove }: ReadingListProps) {
  // Dados guardados no dispositivo aparecem logo; em segundo plano vamos buscar
  // os dados actuais (ex.: capas que só foram sincronizadas depois de começar a ler).
  const [fresh, setFresh] = useState<Record<string, Book>>({});
  const idsKey = useMemo(() => entries.map((e) => e.id).join(","), [entries]);

  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/books/selected", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: idsKey.split(",") }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const map: Record<string, Book> = {};
        for (const book of (data.books ?? []) as Book[]) map[book.id] = book;
        setFresh(map);
      } catch {
        // offline: continua a usar os dados guardados
      }
    })();
    return () => controller.abort();
  }, [idsKey]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookMarked className="mb-4 text-outline" size={44} strokeWidth={1.4} />
        <p className="font-bold text-on-surface-variant">Ainda não estás a ler nada</p>
        <p className="mt-2 max-w-xs text-sm text-outline">
          Abre um livro com “Ler agora” e ele aparece aqui, pronto para continuares de onde paraste.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const book = fresh[entry.id];
        const title = cleanBookTitle(book?.title ?? entry.title);
        const author = book?.author ?? entry.author;
        const cover = book?.cover_url ?? entry.cover_url;
        const pct = Math.max(1, Math.round(entry.ratio * 100));

        return (
          <li
            key={entry.id}
            className="flex gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3"
          >
            <button
              onClick={() => onOpen(entry.id)}
              className="flex min-w-0 flex-1 gap-3 text-left"
              aria-label={`Continuar a ler ${title}`}
            >
              <div className="w-16 shrink-0">
                <BookCover coverUrl={cover} title={title} author={author} />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="line-clamp-2 font-bold leading-snug text-primary">{title}</p>
                <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                  {author ?? "Autor desconhecido"}
                </p>
                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-outline">
                  {pct}% lido · {timeAgo(entry.updatedAt)}
                </p>
              </div>
            </button>
            <button
              onClick={() => onRemove(entry.id)}
              aria-label={`Tirar ${title} da lista de leitura`}
              className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-outline transition hover:bg-surface-container"
            >
              <X size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

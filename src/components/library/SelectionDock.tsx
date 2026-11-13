"use client";

import { FolderPlus, Trash2, Usb, X } from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { cleanBookTitle } from "@/lib/book-title";
import type { Book } from "@/types/library";

type Props = {
  books: Book[];
  count: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  onKobo: () => void;
  onCollection: () => void;
};

/** Painel lateral (PC) com a seleção sempre à vista. */
export function SelectionDock({ books, count, onRemove, onClear, onKobo, onCollection }: Props) {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-l border-outline-variant bg-background xl:flex" aria-label="Seleção">
      <div className="border-b border-outline-variant px-4 py-4">
        <h2 className="font-display-lg text-lg font-bold text-primary">Seleção</h2>
        <p className="text-xs text-on-surface-variant" aria-live="polite">{count} {count === 1 ? "livro" : "livros"} para enviar</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {books.map((b) => (
          <li key={b.id} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-surface-container-low">
            <div className="w-9 shrink-0"><BookCover coverUrl={b.cover_url} title={cleanBookTitle(b.title)} /></div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-bold leading-tight text-primary">{cleanBookTitle(b.title)}</p>
              <p className="truncate text-[11px] text-on-surface-variant">{b.author ?? "–"}</p>
            </div>
            <button onClick={() => onRemove(b.id)} aria-label={`Remover ${cleanBookTitle(b.title)} da seleção`} className="flex h-7 w-7 items-center justify-center rounded-full text-outline hover:bg-surface-container"><X size={14} /></button>
          </li>
        ))}
        {count > books.length && <li className="px-2 py-1 text-center text-[11px] text-outline">+ {count - books.length} outros</li>}
      </ul>
      <div className="space-y-2 border-t border-outline-variant p-3">
        <button onClick={onKobo} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary"><Usb size={16} /> Enviar para o Kobo</button>
        <div className="flex gap-2">
          <button onClick={onCollection} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-outline-variant px-3 py-2 text-xs font-bold"><FolderPlus size={14} /> Guardar coleção</button>
          <button onClick={onClear} aria-label="Limpar seleção" className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant text-error"><Trash2 size={14} /></button>
        </div>
      </div>
    </aside>
  );
}

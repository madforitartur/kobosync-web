"use client";

import { CheckCheck, FolderPlus, Trash2, Usb } from "lucide-react";

type Props = {
  count: number;
  pageCount: number;
  allOnPage: boolean;
  onSelectPage: () => void;
  onSelectAllResults?: () => void;
  totalResults?: number;
  onClear: () => void;
  onKobo: () => void;
  onCollection: () => void;
};

/** Barra de ações da seleção (modo "Selecionar" e separador Seleção). */
export function SelectionBar({ count, pageCount, allOnPage, onSelectPage, onSelectAllResults, totalResults, onClear, onKobo, onCollection }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-surface-container-low px-3 py-2.5" role="toolbar" aria-label="Ações da seleção">
      <span className="mr-1 text-sm font-bold text-primary" aria-live="polite">{count} {count === 1 ? "selecionado" : "selecionados"}</span>
      <button onClick={onSelectPage} className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-bold">
        <CheckCheck size={14} /> {allOnPage ? "Desmarcar página" : `Página (${pageCount})`}
      </button>
      {onSelectAllResults && totalResults !== undefined && totalResults > pageCount && (
        <button onClick={onSelectAllResults} className="rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-bold">
          Todos os {totalResults} resultados
        </button>
      )}
      <span className="flex-1" />
      <button onClick={onCollection} disabled={count === 0} className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-bold disabled:opacity-40">
        <FolderPlus size={14} /> Coleção
      </button>
      <button onClick={onKobo} disabled={count === 0} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary disabled:opacity-40">
        <Usb size={14} /> Kobo
      </button>
      <button onClick={onClear} disabled={count === 0} aria-label="Limpar seleção" className="flex h-8 w-8 items-center justify-center rounded-lg text-error disabled:opacity-40">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

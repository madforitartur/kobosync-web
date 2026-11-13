"use client";

import { ArrowDownAZ, LayoutGrid, List, SlidersHorizontal, X, CheckSquare } from "lucide-react";
import { SORT_OPTIONS, STATUS_OPTIONS, activeFilterCount, type Filters, type SortKey } from "@/lib/library-types";
import type { Collection } from "@/hooks/useCollections";

export type ViewMode = "grid" | "list";

type Props = {
  touch: boolean;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onOpenFilters: () => void;
  viewMode: ViewMode;
  onViewMode: (v: ViewMode) => void;
  density: number;
  onDensity: (n: number) => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  hasQuery: boolean;
  collections: Collection[];
};

export function Toolbar({ touch, sort, onSort, filters, onFilters, onOpenFilters, viewMode, onViewMode, density, onDensity, selectMode, onToggleSelectMode, hasQuery, collections }: Props) {
  const count = activeFilterCount(filters);
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filters.author) chips.push({ key: "a", label: `Autor: ${filters.author}`, clear: () => onFilters({ ...filters, author: undefined }) });
  if (filters.series) chips.push({ key: "s", label: `Série: ${filters.series}`, clear: () => onFilters({ ...filters, series: undefined }) });
  if (filters.language) chips.push({ key: "l", label: `Idioma: ${filters.language.toUpperCase()}`, clear: () => onFilters({ ...filters, language: undefined }) });
  if (filters.collectionId) {
    const c = collections.find((x) => x.id === filters.collectionId);
    chips.push({ key: "c", label: `Coleção: ${c?.name ?? "?"}`, clear: () => onFilters({ ...filters, collectionId: undefined }) });
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
        <div role="group" aria-label="Estado de leitura" className="flex shrink-0 rounded-full border border-outline-variant p-0.5">
          {STATUS_OPTIONS.map((o) => (
            <button key={o.id} onClick={() => onFilters({ ...filters, status: o.id })} aria-pressed={filters.status === o.id}
              className={`rounded-full px-3 py-1 text-xs font-bold ${filters.status === o.id ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>
              {o.label}
            </button>
          ))}
        </div>

        <label className="relative flex shrink-0 items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface-variant">
          <ArrowDownAZ size={14} />
          <span className="sr-only">Ordenar por</span>
          <select value={sort === "relevance" ? "title" : sort} onChange={(e) => onSort(e.target.value as SortKey)} className="cursor-pointer bg-transparent pr-1 outline-none">
            {hasQuery && <option value="relevance">Relevância</option>}
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>

        <button onClick={onOpenFilters} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${count ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"}`}>
          <SlidersHorizontal size={14} /> Filtros{count ? ` (${count})` : ""}
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!touch && viewMode === "grid" && (
            <input type="range" min={0} max={2} step={1} value={density} onChange={(e) => onDensity(Number(e.target.value))} aria-label="Tamanho das capas" className="w-20 accent-primary" />
          )}
          <button onClick={() => onViewMode(viewMode === "grid" ? "list" : "grid")} aria-label={viewMode === "grid" ? "Ver em lista" : "Ver em grelha"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant">
            {viewMode === "grid" ? <List size={15} /> : <LayoutGrid size={15} />}
          </button>
          <button onClick={onToggleSelectMode} aria-pressed={selectMode} aria-label="Modo de seleção"
            className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${selectMode ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant"}`}>
            <CheckSquare size={14} /> Selecionar
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.key} onClick={c.clear} className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-on-surface">
              {c.label} <X size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

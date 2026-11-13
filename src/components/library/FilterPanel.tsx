"use client";

import { Modal } from "./Modal";
import { EMPTY_FILTERS, LANGUAGE_NAMES, STATUS_OPTIONS, type Filters } from "@/lib/library-types";
import type { Group } from "@/hooks/useFacets";
import type { Collection } from "@/hooks/useCollections";

type Props = {
  open: boolean;
  onClose: () => void;
  touch: boolean;
  filters: Filters;
  onChange: (f: Filters) => void;
  authors: Group[];
  series: Group[];
  languages: Group[];
  collections: Collection[];
};

const fieldClass = "w-full rounded-lg border border-outline-variant bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

export function FilterPanel({ open, onClose, touch, filters, onChange, authors, series, languages, collections }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <Modal
      open={open} onClose={onClose} touch={touch} title="Filtros"
      footer={
        <div className="flex gap-2">
          <button onClick={() => onChange(EMPTY_FILTERS)} className="flex-1 rounded-lg border border-outline-variant px-4 py-2.5 text-sm font-bold">Limpar</button>
          <button onClick={onClose} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary">Ver resultados</button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-outline">Estado de leitura</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((o) => (
              <button key={o.id} onClick={() => set({ status: o.id })} aria-pressed={filters.status === o.id}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${filters.status === o.id ? "border-primary bg-primary text-on-primary" : "border-outline-variant"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-outline">Autor</span>
          <input list="filter-authors" className={fieldClass} placeholder="Escreve para procurar…" value={filters.author ?? ""}
            onChange={(e) => set({ author: e.target.value || undefined })} />
          <datalist id="filter-authors">{authors.map((a) => <option key={a.name} value={a.name}>{a.count}</option>)}</datalist>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-outline">Série</span>
          <input list="filter-series" className={fieldClass} placeholder="Escreve para procurar…" value={filters.series ?? ""}
            onChange={(e) => set({ series: e.target.value || undefined })} />
          <datalist id="filter-series">{series.map((s) => <option key={s.name} value={s.name}>{s.count}</option>)}</datalist>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-outline">Idioma</span>
          <select className={fieldClass} value={filters.language ?? ""} onChange={(e) => set({ language: e.target.value || undefined })}>
            <option value="">Todos</option>
            {languages.map((l) => <option key={l.name} value={l.name}>{LANGUAGE_NAMES[l.name] ?? l.name.toUpperCase()} ({l.count})</option>)}
          </select>
        </label>

        {collections.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-outline">Coleção</span>
            <select className={fieldClass} value={filters.collectionId ?? ""} onChange={(e) => set({ collectionId: e.target.value || undefined })}>
              <option value="">Todas</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.bookIds.length})</option>)}
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}

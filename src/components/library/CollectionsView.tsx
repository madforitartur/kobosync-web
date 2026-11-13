"use client";

import { useState } from "react";
import { FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import type { Collection } from "@/hooks/useCollections";

type Props = {
  collections: Collection[];
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

export function CollectionsView({ collections, onOpen, onCreate, onRename, onDelete }: Props) {
  const [name, setName] = useState("");

  return (
    <div>
      <form className="mb-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name); setName(""); } }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da nova coleção (ex.: Para o Kobo)"
          className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        <button type="submit" disabled={!name.trim()} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-40">
          <Plus size={16} /> Criar
        </button>
      </form>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <FolderOpen size={44} strokeWidth={1.4} className="mb-3 text-outline" />
          <p className="font-bold text-on-surface-variant">Ainda não tens coleções</p>
          <p className="mt-1 max-w-xs text-sm text-outline">Agrupa livros como “Favoritos” ou “Para as férias” e filtra a biblioteca por eles.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {collections.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-outline-variant p-3">
              <button onClick={() => onOpen(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <FolderOpen size={20} className="shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-primary">{c.name}</span>
                  <span className="text-xs text-on-surface-variant">{c.bookIds.length} {c.bookIds.length === 1 ? "livro" : "livros"}</span>
                </span>
              </button>
              <button aria-label={`Renomear ${c.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
                onClick={() => { const n = window.prompt("Novo nome da coleção:", c.name); if (n) onRename(c.id, n); }}>
                <Pencil size={16} />
              </button>
              <button aria-label={`Apagar ${c.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-error hover:bg-surface-container"
                onClick={() => { if (window.confirm(`Apagar a coleção “${c.name}”? Os livros não são apagados.`)) onDelete(c.id); }}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

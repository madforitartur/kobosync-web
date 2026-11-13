"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Modal } from "./Modal";
import type { Collection } from "@/hooks/useCollections";

type Props = {
  open: boolean;
  onClose: () => void;
  touch: boolean;
  /** livros a adicionar/remover (1 ou vários) */
  bookIds: string[];
  collections: Collection[];
  onAdd: (collectionId: string, ids: string[]) => void;
  onRemove: (collectionId: string, ids: string[]) => void;
  onCreate: (name: string, ids: string[]) => void;
};

export function CollectionPicker({ open, onClose, touch, bookIds, collections, onAdd, onRemove, onCreate }: Props) {
  const [name, setName] = useState("");
  const single = bookIds.length === 1;

  const state = (c: Collection) => {
    const inCount = bookIds.filter((id) => c.bookIds.includes(id)).length;
    return inCount === bookIds.length ? "all" : inCount > 0 ? "some" : "none";
  };

  return (
    <Modal open={open} onClose={onClose} touch={touch} title={single ? "Adicionar à coleção" : `Coleção (${bookIds.length} livros)`}>
      <ul className="space-y-1.5">
        {collections.length === 0 && <li className="py-2 text-sm text-outline">Ainda não tens coleções. Cria a primeira abaixo.</li>}
        {collections.map((c) => {
          const st = state(c);
          return (
            <li key={c.id}>
              <button
                onClick={() => (st === "all" ? onRemove(c.id, bookIds) : onAdd(c.id, bookIds))}
                className="flex w-full items-center gap-3 rounded-lg border border-outline-variant px-3 py-3 text-left hover:bg-surface-container-low"
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded border ${st === "none" ? "border-outline" : "border-primary bg-primary text-on-primary"}`}>
                  {st === "all" && <Check size={14} />}
                  {st === "some" && <span className="h-0.5 w-3 bg-on-primary" />}
                </span>
                <span className="flex-1 truncate font-semibold text-on-surface">{c.name}</span>
                <span className="text-xs text-outline">{c.bookIds.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name, bookIds);
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nova coleção…"
          className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button type="submit" disabled={!name.trim()} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-40">
          <Plus size={16} /> Criar
        </button>
      </form>
    </Modal>
  );
}

"use client";

import { useCallback } from "react";
import { useStored } from "./useStored";

export type Collection = { id: string; name: string; bookIds: string[]; updatedAt: number };

/** Coleções pessoais (ex.: "Para o Kobo", "Favoritos"). */
export function useCollections() {
  const [collections, setCollections] = useStored<Collection[]>("kobosync:collections", [], "collections");

  const create = useCallback(
    (name: string, bookIds: string[] = []) => {
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      setCollections((cur) => [...cur, { id, name: name.trim() || "Nova coleção", bookIds, updatedAt: Date.now() }]);
      return id;
    },
    [setCollections],
  );
  const rename = useCallback(
    (id: string, name: string) =>
      setCollections((cur) => cur.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name, updatedAt: Date.now() } : c))),
    [setCollections],
  );
  const remove = useCallback((id: string) => setCollections((cur) => cur.filter((c) => c.id !== id)), [setCollections]);
  const addBooks = useCallback(
    (id: string, ids: string[]) =>
      setCollections((cur) =>
        cur.map((c) =>
          c.id === id ? { ...c, bookIds: [...c.bookIds, ...ids.filter((b) => !c.bookIds.includes(b))], updatedAt: Date.now() } : c,
        ),
      ),
    [setCollections],
  );
  const removeBooks = useCallback(
    (id: string, ids: string[]) =>
      setCollections((cur) =>
        cur.map((c) => (c.id === id ? { ...c, bookIds: c.bookIds.filter((b) => !ids.includes(b)), updatedAt: Date.now() } : c)),
      ),
    [setCollections],
  );

  return { collections, create, rename, remove, addBooks, removeBooks };
}

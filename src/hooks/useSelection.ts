"use client";

import { useCallback, useMemo } from "react";
import { useStored } from "./useStored";

/** Seleção de livros (para enviar ao Kobo): persistida e sincronizada entre dispositivos. */
export function useSelection(kind: "epub" | "pdf" = "epub") {
  // A seleção de PDFs é separada (e só local): serve para os converter em EPUB
  const [list, setList] = useStored<string[]>(kind === "pdf" ? "kobosync:selection-pdf" : "kobosync:selection", [], kind === "pdf" ? undefined : "selection");
  const ids = useMemo(() => new Set(list), [list]);

  const toggle = useCallback(
    (id: string) => setList((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    [setList],
  );
  const add = useCallback(
    (more: string[]) => setList((cur) => [...cur, ...more.filter((id) => !cur.includes(id))]),
    [setList],
  );
  const remove = useCallback((more: string[]) => setList((cur) => cur.filter((id) => !more.includes(id))), [setList]);
  const clear = useCallback(() => setList([]), [setList]);
  const set = useCallback((next: string[]) => setList(next), [setList]);

  return { ids, list, toggle, add, remove, clear, set };
}

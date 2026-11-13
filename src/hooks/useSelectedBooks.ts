"use client";

import { useEffect, useState } from "react";
import type { Book } from "@/types/library";

const CHUNK = 400; // o servidor aceita até 500 ids por pedido

async function fetchByIds(ids: string[], signal?: AbortSignal): Promise<Book[]> {
  const out: Book[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await fetch("/api/books/selected", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(i, i + CHUNK) }),
      signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro");
    out.push(...(data.books as Book[]));
  }
  return out;
}

/** Dados completos dos livros selecionados (pela ordem da seleção). */
export function useSelectedBooks(list: string[], enabled: boolean, reloadKey: number) {
  const [books, setBooks] = useState<Book[]>([]);
  const key = list.join(",");

  useEffect(() => {
    if (!enabled) return;
    if (list.length === 0) { setBooks([]); return; }
    const c = new AbortController();
    const t = window.setTimeout(() => {
      fetchByIds(list, c.signal)
        .then((found) => {
          const byId = new Map(found.map((b) => [b.id, b]));
          setBooks(list.map((id) => byId.get(id)).filter((b): b is Book => !!b));
        })
        .catch(() => {});
    }, 300);
    return () => { c.abort(); window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, reloadKey]);

  return books;
}

"use client";

import { useEffect, useState } from "react";
import type { Book } from "@/types/library";
import type { Filters, SortKey } from "@/lib/library-types";

type Args = {
  q: string;
  sort: SortKey;
  filters: Filters;
  page: number;
  limit: number;
  /** restringe a estes ids (seleção, coleção…) */
  onlyIds?: string[] | null;
  /** ids com progresso, para os filtros de estado */
  progress: Record<string, number>;
  finishedRatio: number;
  reloadKey: number;
  enabled: boolean;
};

function scopeOf(a: Args): { ids?: string[]; exclude?: string[]; empty: boolean } {
  let ids: string[] | undefined = a.onlyIds ?? undefined;
  let exclude: string[] | undefined;
  const entries = Object.entries(a.progress);
  if (a.filters.status === "reading") {
    const set = entries.filter(([, r]) => r < a.finishedRatio).map(([id]) => id);
    ids = ids ? ids.filter((i) => set.includes(i)) : set;
  } else if (a.filters.status === "finished") {
    const set = entries.filter(([, r]) => r >= a.finishedRatio).map(([id]) => id);
    ids = ids ? ids.filter((i) => set.includes(i)) : set;
  } else if (a.filters.status === "unread") {
    exclude = entries.map(([id]) => id);
  }
  return { ids, exclude, empty: !!ids && ids.length === 0 };
}

export function useBooksQuery(a: Args) {
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chaves estáveis para não refazer o pedido por mudanças irrelevantes
  const statusKey =
    a.filters.status === "all"
      ? ""
      : `${a.filters.status}:${Object.keys(a.progress).length}:${Object.values(a.progress).filter((r) => r >= a.finishedRatio).length}`;
  const onlyKey = a.onlyIds ? a.onlyIds.join(",") : null;

  useEffect(() => {
    if (!a.enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { ids, exclude } = scopeOf(a);
        if (scopeOf(a).empty) {
          setBooks([]); setTotal(0); setTotalPages(1);
          return;
        }

        const base = {
          q: a.q.trim() || undefined,
          sort: a.sort,
          author: a.filters.author,
          series: a.filters.series,
          language: a.filters.language,
          page: a.page,
          limit: a.limit,
        };

        let res: Response;
        if (ids || exclude) {
          res = await fetch("/api/books", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...base, ids, exclude }),
            signal: controller.signal,
          });
        } else {
          const p = new URLSearchParams();
          for (const [k, v] of Object.entries(base)) if (v !== undefined) p.set(k, String(v));
          res = await fetch(`/api/books?${p.toString()}`, { signal: controller.signal });
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro ao carregar biblioteca.");
        setBooks(data.books ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Erro ao carregar biblioteca.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.enabled, a.q, a.sort, a.filters.author, a.filters.series, a.filters.language, a.filters.status, statusKey, onlyKey, a.page, a.limit, a.reloadKey]);

  /** Todos os ids dos resultados atuais (para "selecionar todos os resultados"). */
  async function fetchAllIds(): Promise<string[]> {
    const { ids, exclude, empty } = scopeOf(a);
    if (empty) return [];
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: a.q.trim() || undefined, author: a.filters.author, series: a.filters.series,
        language: a.filters.language, ids, exclude, idsOnly: true,
      }),
    });
    const data = await res.json();
    return res.ok ? (data.ids as string[]) : [];
  }

  return { books, total, totalPages, loading, error, fetchAllIds };
}

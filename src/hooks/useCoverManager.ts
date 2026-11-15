"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "@/types/library";

type SyncResponse = {
  success?: number;
  missing?: number;
  failedIds?: string[];
  covers?: Record<string, string>;
  missingIds?: string[];
  remaining?: number;
  done?: boolean;
  processed?: number;
  error?: string;
};

export type CoverState = {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  error: string | null;
};

const needsCover = (b: Book) => !b.cover_url && !b.cover_missing && !!b.drive_file_id;

/**
 * Garante que os livros têm capa:
 * - `ensure(books)`: prioridade — extrai já as capas dos livros que estão no ecrã (ex.: saltar para a página 80);
 * - `start()`: em segundo plano, percorre toda a biblioteca até não faltar nenhuma.
 * As capas novas chegam por `overrides`, sem recarregar a lista.
 */
export function useCoverManager() {
  const [state, setState] = useState<CoverState>({ running: false, done: 0, total: 0, failed: 0, error: null });
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const missing = useRef(new Set<string>()); // EPUB sem imagem de capa
  const failed = useRef(new Set<string>()); // erros temporários desta sessão
  const inflight = useRef(new Set<string>()); // pedidos prioritários a decorrer
  const running = useRef(false);
  const stopped = useRef(false);

  const call = useCallback(async (body: Record<string, unknown>): Promise<SyncResponse> => {
    const res = await fetch("/api/covers/sync-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as SyncResponse;
    if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    if (data.covers && Object.keys(data.covers).length) setOverrides((cur) => ({ ...cur, ...data.covers }));
    (data.missingIds ?? []).forEach((id) => missing.current.add(id));
    (data.failedIds ?? []).forEach((id) => failed.current.add(id));
    return data;
  }, []);

  /** Prioridade: capas dos livros visíveis. */
  const ensure = useCallback(async (books: Book[]) => {
    const ids = books
      .filter((b) => needsCover(b) && !missing.current.has(b.id) && !failed.current.has(b.id) && !inflight.current.has(b.id))
      .map((b) => b.id)
      .slice(0, 40);
    if (ids.length === 0) return;
    ids.forEach((id) => inflight.current.add(id));
    try {
      for (let pass = 0; pass < 3; pass++) {
        const left = ids.filter((id) => !missing.current.has(id) && !failed.current.has(id));
        // as que já receberam capa saem do ciclo (o servidor ignora as que já têm)
        const data = await call({ ids: left, budgetMs: 30_000 });
        if (data.done || (data.remaining ?? 0) === 0 || (data.processed ?? 0) === 0) break;
      }
    } catch {
      /* o sync em segundo plano continua a tentar */
    } finally {
      ids.forEach((id) => inflight.current.delete(id));
    }
  }, [call]);

  const stop = useCallback(() => {
    stopped.current = true;
  }, []);

  /** Percorre toda a biblioteca em segundo plano. */
  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    stopped.current = false;
    failed.current.clear();
    setState({ running: true, done: 0, total: 0, failed: 0, error: null });

    try {
      const st = await fetch("/api/covers/status", { cache: "no-store" }).then((r) => r.json());
      const total: number = st.pending ?? 0;
      if (!total) { setState((s) => ({ ...s, running: false })); return; }
      setState((s) => ({ ...s, total }));

      let done = 0;
      let idle = 0;
      while (!stopped.current) {
        const data = await call({ skip: [...failed.current, ...inflight.current] });
        done += (data.success ?? 0) + (data.missing ?? 0);
        setState((s) => ({ ...s, done, failed: failed.current.size }));
        if (data.done || (data.remaining ?? 0) === 0) break;
        idle = (data.processed ?? 0) === 0 ? idle + 1 : 0;
        if (idle >= 3) throw new Error("O sincronizador de capas deixou de progredir.");
      }
      setState((s) => ({ ...s, running: false }));
    } catch (e) {
      setState((s) => ({ ...s, running: false, error: e instanceof Error ? e.message : "Erro nas capas" }));
    } finally {
      running.current = false;
    }
  }, [call]);

  // Arranque automático, uma vez por sessão: se faltarem capas, completa-as sozinho
  useEffect(() => {
    const t = window.setTimeout(() => {
      fetch("/api/covers/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((st) => { if (st && st.pending > 0) start(); })
        .catch(() => {});
    }, 2500);
    return () => window.clearTimeout(t);
  }, [start]);

  return { state, overrides, ensure, start, stop };
}

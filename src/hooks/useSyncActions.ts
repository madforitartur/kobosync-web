"use client";

import { useCallback, useState } from "react";

export type Status = { type: "info" | "success" | "error"; message: string } | null;

/** Sincronização do Drive e das capas (acionada pelo utilizador). */
export function useSyncActions(setStatus: (s: Status) => void, onChanged: () => void) {
  const [syncing, setSyncing] = useState(false);
  const [syncingCovers, setSyncingCovers] = useState(false);

  const syncLibrary = useCallback(async () => {
    setSyncing(true);
    setStatus({ type: "info", message: "A iniciar pesquisa no Google Drive…" });
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sincronização falhou.");
      onChanged();
      setStatus({ type: "success", message: result.message ?? `${result.found ?? 0} livros no Drive.` });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro." });
    } finally {
      setSyncing(false);
    }
  }, [setStatus, onChanged]);

  const syncCovers = useCallback(async () => {
    setSyncingCovers(true);
    setStatus({ type: "info", message: "A iniciar sincronização de capas…" });
    let ok = 0;
    let missing = 0;
    let total: number | null = null;
    let emptyRounds = 0;
    const failedIds = new Set<string>(); // erros temporários desta sessão
    try {
      // Cada chamada processa um lote (~35s) e diz quantas faltam.
      while (true) {
        const res = await fetch("/api/covers/sync-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skip: Array.from(failedIds) }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

        ok += data.success ?? 0;
        missing += data.missing ?? 0;
        for (const id of (data.failedIds ?? []) as string[]) failedIds.add(id);
        if (total === null) total = ok + missing + failedIds.size + (data.remaining ?? 0);

        onChanged();
        setStatus({
          type: "info",
          message: `Capas: ${ok + missing + failedIds.size}/${total} processadas (${ok} ok)… mantém esta página aberta.`,
        });

        if (data.done || (data.remaining ?? 0) === 0) break;
        emptyRounds = (data.processed ?? 0) === 0 ? emptyRounds + 1 : 0;
        if (emptyRounds >= 3) throw new Error("O sync de capas deixou de progredir.");
      }

      const parts = [`${ok} extraídas`];
      if (missing > 0) parts.push(`${missing} sem capa no EPUB`);
      if (failedIds.size > 0) parts.push(`${failedIds.size} com erro temporário: clica em Capas outra vez para tentar de novo`);
      setStatus({ type: failedIds.size > 0 ? "info" : "success", message: `Capas concluídas: ${parts.join(" · ")}.` });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Erro nas capas" });
    } finally {
      setSyncingCovers(false);
      onChanged();
    }
  }, [setStatus, onChanged]);

  const migrateCoverUrls = useCallback(async () => {
    setStatus({ type: "info", message: "A corrigir URLs das capas…" });
    try {
      const res = await fetch("/api/covers/migrate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setStatus({ type: "success", message: `${data.fixed} livros sem capa vão ser tentados de novo. Clica em Sincronizar capas.` });
      onChanged();
    } catch {
      setStatus({ type: "error", message: "Erro ao migrar capas." });
    }
  }, [setStatus, onChanged]);

  return { syncing, syncingCovers, syncLibrary, syncCovers, migrateCoverUrls };
}

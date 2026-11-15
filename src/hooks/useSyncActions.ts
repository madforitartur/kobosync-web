"use client";

import { useCallback, useState } from "react";

export type Status = { type: "info" | "success" | "error"; message: string } | null;

/** Sincronização da lista de livros do Drive (acionada pelo utilizador). */
export function useSyncActions(setStatus: (s: Status) => void, onChanged: () => void) {
  const [syncing, setSyncing] = useState(false);

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

  return { syncing, syncLibrary, migrateCoverUrls };
}

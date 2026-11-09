"use client";

import { useCallback, useEffect, useState } from "react";
import {
  READING_EVENT,
  getReadingList,
  removeFromReadingList,
  type ReadingEntry,
} from "@/lib/reading-progress";

/**
 * Lista de livros em leitura. Actualiza-se sozinha quando o leitor (que abre
 * noutro separador) grava progresso, e quando a janela volta a ficar visível.
 */
export function useReadingList() {
  const [entries, setEntries] = useState<ReadingEntry[]>([]);

  const refresh = useCallback(() => setEntries(getReadingList()), []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(READING_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(READING_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const remove = useCallback(
    (id: string) => {
      removeFromReadingList(id);
      refresh();
    },
    [refresh],
  );

  return { entries, remove, refresh };
}

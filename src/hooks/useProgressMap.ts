"use client";

import { useCallback, useEffect, useState } from "react";
import { FINISHED_RATIO, READING_EVENT, getAllProgress } from "@/lib/reading-progress";

export type ReadStatus = "unread" | "reading" | "finished";

/** Progresso (0–1) de todos os livros com posição guardada. */
export function useProgressMap() {
  const [map, setMap] = useState<Record<string, number>>({});

  const refresh = useCallback(() => setMap(getAllProgress()), []);

  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(READING_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(READING_EVENT, refresh);
    };
  }, [refresh]);

  const statusOf = useCallback(
    (id: string): ReadStatus => {
      const r = map[id];
      if (r === undefined) return "unread";
      return r >= FINISHED_RATIO ? "finished" : "reading";
    },
    [map],
  );

  return { map, statusOf, refresh };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCAL_CHANGE_EVENT, markChanged, readJSON, writeJSON, type Domain } from "@/lib/local-store";

/**
 * Estado persistido em localStorage. Se `domain` for indicado, as alterações
 * são enviadas para a nuvem (cloud-sync) e valores vindos da nuvem atualizam o estado.
 */
export function useStored<T>(key: string, fallback: T, domain?: Domain) {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const load = () => setValue(readJSON<T>(key, fallback));
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) load();
    };
    const onRemote = (e: Event) => {
      if ((e as CustomEvent<{ domain: Domain }>).detail?.domain === domain) load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("kobosync:remote-applied", onRemote);
    window.addEventListener(LOCAL_CHANGE_EVENT, onRemote);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("kobosync:remote-applied", onRemote);
      window.removeEventListener(LOCAL_CHANGE_EVENT, onRemote);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, domain]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = readJSON<T>(key, fallback);
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      writeJSON(key, resolved);
      setValue(resolved);
      if (domain) markChanged(domain);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, domain],
  );

  return [value, update] as const;
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { LOCAL_EVENT, chooseFolder, forgetFolder, getBackend, type BackendState } from "./local-library";

/** Estado do sítio onde os livros offline ficam (pasta escolhida ou armazenamento da app). */
export function useLocalBackend() {
  const [state, setState] = useState<BackendState | null>(null);
  const refresh = useCallback(async (interactive = false) => { const s = await getBackend(interactive).catch(() => ({ status: "unsupported" }) as BackendState); setState(s); return s; }, []);
  useEffect(() => {
    refresh();
    const fn = () => { refresh(); };
    window.addEventListener(LOCAL_EVENT, fn);
    return () => window.removeEventListener(LOCAL_EVENT, fn);
  }, [refresh]);
  return {
    state,
    refresh,
    grant: () => refresh(true),
    pickFolder: async () => { try { await chooseFolder(); } catch (e) { if ((e as Error).name !== "AbortError") throw e; } await refresh(); },
    useAppStorage: async () => { await forgetFolder(); await refresh(); },
  };
}

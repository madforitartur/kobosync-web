"use client";

import { ImageIcon, Loader2, RotateCw, X } from "lucide-react";
import type { CoverState } from "@/hooks/useCoverManager";

type Props = { state: CoverState; onStop: () => void; onRetry: () => void };

/** Faixa discreta com o progresso do sincronizador de capas. */
export function CoversBanner({ state, onStop, onRetry }: Props) {
  if (!state.running && !state.error) return null;
  const pct = state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : 0;

  return (
    <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5">
      {state.error ? (
        <div className="flex items-center gap-2 text-sm">
          <ImageIcon size={16} className="shrink-0 text-error" />
          <span className="min-w-0 flex-1 truncate text-error">Capas: {state.error}</span>
          <button onClick={onRetry} className="flex items-center gap-1 rounded-lg border border-outline-variant px-2.5 py-1 text-xs font-bold"><RotateCw size={12} /> Tentar de novo</button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
            <span className="min-w-0 flex-1 truncate font-semibold text-on-surface">
              A completar capas… {state.done}/{state.total || "?"}
              {state.failed > 0 && <span className="font-normal text-outline"> · {state.failed} com erro temporário</span>}
            </span>
            <button onClick={onStop} aria-label="Parar sincronização de capas" className="flex h-7 w-7 items-center justify-center rounded-full text-outline hover:bg-surface-container"><X size={14} /></button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-container-high">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

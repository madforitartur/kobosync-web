"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Power } from "lucide-react";

/** Botão de fechar a app, com confirmação. As definições e o tema já ficam guardados, por isso reabre como estava. */
export function CloseAppButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function close() {
    setBlocked(false);
    window.close();
    // Se a janela não fechar (o browser só deixa fechar apps instaladas ou janelas abertas pela app), avisa.
    setTimeout(() => setBlocked(true), 500);
  }

  return (
    <>
      <button
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant ${className}`}
        onClick={() => { setBlocked(false); setOpen(true); }}
        aria-label="Fechar a aplicação" title="Fechar a aplicação"
      >
        <Power size={17} />
      </button>
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 px-6" onClick={() => setOpen(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="kb-close-title" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-background p-5 text-on-background shadow-2xl">
            <h2 id="kb-close-title" className="font-display-lg text-xl font-bold text-primary">Fechar a aplicação?</h2>
            <p className="mt-2 text-sm text-on-surface-variant">A tua posição de leitura e as definições ficam guardadas. Ao reabrir, a app volta ao mesmo ponto.</p>
            {blocked && (
              <p role="status" className="mt-3 rounded-lg bg-surface-container p-3 text-xs font-semibold text-on-surface">
                O browser não deixou fechar esta janela automaticamente. Fecha-a nas aplicações recentes do telemóvel (ou fecha o separador).
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold">Cancelar</button>
              <button onClick={close} className="rounded-lg bg-error px-4 py-2 text-sm font-bold text-on-error">Fechar aplicação</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { FolderDown, Loader2, Package } from "lucide-react";
import { Modal } from "./Modal";
import { downloadZip, sendToFolder, supportsFolderPicker, type ExportResult } from "@/lib/kobo-export";
import type { Book } from "@/types/library";

type Props = {
  open: boolean;
  onClose: () => void;
  touch: boolean;
  books: Book[];
  total: number;
  onDone: (result: ExportResult, mode: "folder" | "zip") => void;
};

export function KoboDialog({ open, onClose, touch, books, total, onDone }: Props) {
  const [busy, setBusy] = useState<null | "folder" | "zip">(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState<string | null>(null);
  const folderOk = supportsFolderPicker();
  const partial = books.length < total;

  async function run(mode: "folder" | "zip") {
    setBusy(mode);
    setError(null);
    setProgress([0, books.length]);
    try {
      const fn = mode === "folder" ? sendToFolder : downloadZip;
      const result = await fn(books, (d, t) => setProgress([d, t]));
      onDone(result, mode);
      onClose();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError("Não foi possível concluir o envio.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} touch={touch} title={`Enviar para o Kobo (${total})`}>
      <p className="mb-4 text-sm text-on-surface-variant">
        Escolhe como levar os livros selecionados para o leitor.
        {partial && <> A enviar já {books.length} de {total} (os restantes ainda estão a carregar).</>}
      </p>
      <div className="space-y-3">
        <button disabled={!!busy || !folderOk || books.length === 0} onClick={() => run("folder")}
          className="flex w-full items-start gap-3 rounded-xl border border-outline-variant p-4 text-left hover:bg-surface-container-low disabled:opacity-50">
          <FolderDown size={22} className="mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="block font-bold text-primary">Copiar para a pasta do Kobo</span>
            <span className="text-sm text-on-surface-variant">
              {folderOk ? "Liga o Kobo ao PC por USB e escolhe a pasta do leitor." : "Só disponível no Chrome ou Edge, no computador."}
            </span>
          </span>
        </button>
        <button disabled={!!busy || books.length === 0} onClick={() => run("zip")}
          className="flex w-full items-start gap-3 rounded-xl border border-outline-variant p-4 text-left hover:bg-surface-container-low disabled:opacity-50">
          <Package size={22} className="mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="block font-bold text-primary">Descarregar em ZIP</span>
            <span className="text-sm text-on-surface-variant">Funciona em qualquer dispositivo. Divide em partes de ~120 MB para não encravar o telemóvel.</span>
          </span>
        </button>
      </div>
      {busy && (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary" aria-live="polite">
          <Loader2 size={16} className="animate-spin" /> A preparar {progress[0]}/{progress[1]}… mantém esta janela aberta.
        </p>
      )}
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-error">{error}</p>}
    </Modal>
  );
}

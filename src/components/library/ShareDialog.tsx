"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { Modal } from "./Modal";
import { SHARE_MAX_BYTES, SHARE_MAX_FILES, canShareFiles, downloadZip, prepareShare } from "@/lib/kobo-export";
import type { Book } from "@/types/library";

type Props = { open: boolean; onClose: () => void; touch: boolean; books: Book[]; total: number; onDone: (message: string, type: "success" | "info" | "error") => void };

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

/** Partilha os livros selecionados pelo menu de partilha do sistema (WhatsApp, e-mail, Telegram, …). */
export function ShareDialog({ open, onClose, touch, books, total, onDone }: Props) {
  const [files, setFiles] = useState<File[] | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);
  const shareOk = typeof window !== "undefined" && canShareFiles();
  const list = books.slice(0, SHARE_MAX_FILES);
  const ids = list.map((b) => b.id).join(",");
  const size = files?.reduce((n, f) => n + f.size, 0) ?? 0;
  const tooBig = size > SHARE_MAX_BYTES;

  // Ao abrir, descarrega os ficheiros; a partilha em si precisa de um clique novo do utilizador.
  useEffect(() => {
    if (!open) { run.current++; setFiles(null); setError(null); setFailed(0); return; }
    const my = ++run.current;
    setProgress([0, list.length]);
    prepareShare(list, (d, t) => { if (my === run.current) setProgress([d, t]); })
      .then((r) => { if (my !== run.current) return; setFiles(r.files); setFailed(r.failed.length); if (!r.files.length) setError("Não foi possível obter os livros."); })
      .catch(() => { if (my === run.current) setError("Não foi possível obter os livros."); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ids]); // se a lista de livros acabar de carregar, volta a preparar

  async function share() {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      await navigator.share({ files, title: files.length === 1 ? files[0].name.replace(/\.epub$/i, "") : `${files.length} livros` });
      onDone(`${files.length} livro${files.length !== 1 ? "s" : ""} partilhado${files.length !== 1 ? "s" : ""}.`, "success");
      onClose();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError("A partilha não foi concluída. Tenta com menos livros ou usa o ZIP.");
    } finally {
      setBusy(false);
    }
  }

  async function zip() {
    setBusy(true);
    try { const r = await downloadZip(list, () => {}); onDone(`${r.sent.length} livros incluídos no ZIP.`, "info"); onClose(); }
    catch { setError("Não foi possível criar o ZIP."); }
    finally { setBusy(false); }
  }

  const loading = !files && !error;
  return (
    <Modal open={open} onClose={onClose} title="Partilhar livros" touch={touch}>
      <div className="space-y-4 px-5 pb-5 text-sm">
        <p className="text-on-surface-variant">
          Envia os EPUBs a amigos pelo WhatsApp, e-mail, Telegram ou qualquer outra app. {total} {total === 1 ? "livro selecionado" : "livros selecionados"}.
        </p>
        {total > SHARE_MAX_FILES && <p role="status" className="font-semibold text-primary">Só os primeiros {SHARE_MAX_FILES} livros são partilhados de cada vez.</p>}

        {loading && <p className="flex items-center gap-2 text-on-surface-variant"><Loader2 size={16} className="animate-spin" /> A preparar os livros… {progress[0]}/{progress[1]}</p>}
        {files && files.length > 0 && <p className="font-semibold text-primary">{files.length} livro{files.length !== 1 ? "s" : ""} pronto{files.length !== 1 ? "s" : ""} · {mb(size)}</p>}
        {failed > 0 && <p className="text-xs text-error">{failed} livro{failed !== 1 ? "s" : ""} não {failed !== 1 ? "puderam" : "pôde"} ser obtido{failed !== 1 ? "s" : ""}.</p>}
        {tooBig && <p className="text-xs text-on-surface-variant">Atenção: o WhatsApp limita cada documento a 100 MB; se falhar, partilha menos livros.</p>}
        {error && <p role="alert" className="font-semibold text-error">{error}</p>}

        {shareOk ? (
          <button disabled={!files?.length || busy} onClick={share} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-bold text-on-primary disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} Partilhar (WhatsApp, outras apps)
          </button>
        ) : (
          !loading && <p className="rounded-lg border border-outline-variant p-3 text-xs text-on-surface-variant">Este browser não permite partilhar ficheiros diretamente. Abre a biblioteca no telemóvel (Chrome ou Safari) para usar o WhatsApp, ou descarrega os livros e anexa-os à mensagem.</p>
        )}
        <button disabled={busy || list.length === 0} onClick={zip} className="flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant px-4 py-2.5 font-bold disabled:opacity-50">
          <Download size={16} /> Descarregar em ZIP
        </button>
      </div>
    </Modal>
  );
}

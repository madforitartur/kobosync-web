"use client";

import { useEffect, useState } from "react";
import { Check, Usb } from "lucide-react";
import { GeneratedCover } from "./GeneratedCover";

type BookCoverProps = {
  coverUrl?: string | null;
  title: string;
  author?: string | null;
  isSelected?: boolean;
  /** 0–1: mostra barra de progresso fina (livros em leitura). */
  progress?: number;
  /** Já foi enviado para o Kobo. */
  sentToKobo?: boolean;
  /** Livro terminado. */
  finished?: boolean;
};

const MAX_RETRIES = 2;

/**
 * Capa do livro. Quando `isSelected`, a capa fica a preto e branco, com
 * rebordo à volta e um visto — para distinguir de relance os livros já selecionados.
 */
export function BookCover({ coverUrl, title, author, isSelected = false, progress, sentToKobo, finished }: BookCoverProps) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  // Nova capa (ex.: depois de sincronizar) → volta a tentar do zero
  useEffect(() => {
    setFailed(false);
    setRetry(0);
  }, [coverUrl]);

  function handleError() {
    // Erros temporários do servidor não devem deixar o placeholder para sempre:
    // tenta mais 2 vezes (com pausa crescente) antes de desistir.
    if (retry < MAX_RETRIES) {
      window.setTimeout(() => setRetry((n) => n + 1), 1200 * (retry + 1));
    } else {
      setFailed(true);
    }
  }

  const src = coverUrl
    ? retry > 0
      ? `${coverUrl}${coverUrl.includes("?") ? "&" : "?"}r=${retry}`
      : coverUrl
    : null;

  const frame = `relative aspect-epub w-full overflow-hidden rounded transition ${
    isSelected ? "ring-[3px] ring-primary ring-offset-2 ring-offset-background" : ""
  }`;

  const checkBadge = isSelected && (
    <div className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg ring-2 ring-background">
      <Check size={15} strokeWidth={3} />
    </div>
  );

  const badges = (
    <>
      {finished && (
        <span className="absolute left-1.5 top-1.5 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-on-primary">
          Lido
        </span>
      )}
      {sentToKobo && (
        <span
          title="Já enviado para o Kobo"
          className="absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded bg-secondary/90 text-on-secondary"
        >
          <Usb size={11} />
        </span>
      )}
      {progress !== undefined && progress > 0 && progress < 0.98 && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30" aria-label={`${Math.round(progress * 100)}% lido`}>
          <div className="h-full bg-primary-fixed" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </>
  );

  if (!src || failed) {
    return (
      <div className={frame}>
        <div className={`absolute inset-0 ${isSelected ? "grayscale" : ""}`}>
          <GeneratedCover title={title} author={author} />
        </div>
        {badges}
        {checkBadge}
      </div>
    );
  }

  return (
    <div className={frame}>
      <img
        key={src}
        src={src}
        alt={title}
        loading="lazy"
        onError={handleError}
        className={`h-full w-full object-cover transition ${isSelected ? "grayscale" : ""}`}
      />
      {badges}
      {checkBadge}
    </div>
  );
}

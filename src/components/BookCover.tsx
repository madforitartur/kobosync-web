"use client";

import { useEffect, useState } from "react";
import { Check, BookOpen } from "lucide-react";

type BookCoverProps = {
  coverUrl?: string | null;
  title: string;
  isSelected?: boolean;
};

const MAX_RETRIES = 2;

/**
 * Capa do livro. Quando `isSelected`, a capa fica a preto e branco, com
 * rebordo à volta e um visto — para distinguir de relance os livros já selecionados.
 */
export function BookCover({ coverUrl, title, isSelected = false }: BookCoverProps) {
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

  const initials = title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const frame = `relative aspect-epub w-full overflow-hidden rounded transition ${
    isSelected ? "ring-[3px] ring-primary ring-offset-2 ring-offset-background" : ""
  }`;

  const checkBadge = isSelected && (
    <div className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg ring-2 ring-background">
      <Check size={15} strokeWidth={3} />
    </div>
  );

  if (!src || failed) {
    return (
      <div className={frame}>
        <div
          className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-primary via-primary-container to-tertiary-container p-4 text-on-primary ${
            isSelected ? "grayscale" : ""
          }`}
        >
          <BookOpen size={36} strokeWidth={1.4} className="mb-3 opacity-80" />
          <p className="line-clamp-3 text-center text-sm font-bold leading-tight">
            {initials || title.slice(0, 2).toUpperCase()}
          </p>
        </div>
        {checkBadge}
      </div>
    );
  }

  return (
    <div className={frame}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={title}
        loading="lazy"
        onError={handleError}
        className={`h-full w-full object-cover transition ${isSelected ? "grayscale" : ""}`}
      />
      {checkBadge}
    </div>
  );
}

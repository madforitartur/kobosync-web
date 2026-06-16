"use client";

import { useState } from "react";
import { Check, BookOpen } from "lucide-react";

type BookCoverProps = {
  coverUrl?: string | null;
  title: string;
  isSelected?: boolean;
  selectionClassName?: string;
  checkSize?: number;
};

export function BookCover({
  coverUrl,
  title,
  isSelected = false,
  selectionClassName,
  checkSize = 14,
}: BookCoverProps) {
  // NOVO: se a imagem falhar ao carregar, mostra placeholder
  const [imgError, setImgError] = useState(false);
  const showPlaceholder = !coverUrl || imgError;

  // Iniciais do título para o placeholder
  const initials = title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const defaultSelectionClassName =
    "absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg ring-2 ring-background";

  if (showPlaceholder) {
    return (
      <div className="relative aspect-epub w-full overflow-hidden rounded">
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-primary via-primary-container to-tertiary-container p-4 text-on-primary">
          <BookOpen size={36} strokeWidth={1.4} className="mb-3 opacity-80" />
          <p className="line-clamp-3 text-center text-sm font-bold leading-tight">
            {initials || title.slice(0, 2).toUpperCase()}
          </p>
        </div>
        {isSelected && (
          <div className={selectionClassName || defaultSelectionClassName}>
            <Check size={checkSize} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative aspect-epub w-full overflow-hidden rounded">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl!}
        alt={title}
        loading="lazy"
        onError={() => setImgError(true)}
        className="h-full w-full object-cover"
      />
      {isSelected && (
        <div className={selectionClassName || defaultSelectionClassName}>
          <Check size={checkSize} />
        </div>
      )}
    </div>
  );
}

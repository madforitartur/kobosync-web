"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Check, FolderPlus, Info, X, CheckCheck, RotateCcw, FolderMinus, CloudOff, CloudDownload } from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { cleanBookTitle } from "@/lib/book-title";
import type { Book } from "@/types/library";
import type { ReadStatus } from "@/hooks/useProgressMap";

export type BookMenuState = { book: Book; x: number; y: number } | null;

type Props = {
  state: BookMenuState;
  touch: boolean;
  selected: boolean;
  status: ReadStatus;
  offlineSaved: boolean;
  offlineSupported: boolean;
  onToggleOffline: (b: Book) => void;
  /** quando a vista atual é uma coleção */
  inCollectionName?: string | null;
  onClose: () => void;
  onRead: (b: Book) => void;
  onToggleSelect: (b: Book) => void;
  onDetails: (b: Book) => void;
  onCollections: (b: Book) => void;
  onToggleFinished: (b: Book) => void;
  onRemoveFromCollection?: (b: Book) => void;
};

export function BookMenu({ state, touch, selected, status, offlineSaved, offlineSupported, onToggleOffline, inCollectionName, onClose, onRead, onToggleSelect, onDetails, onCollections, onToggleFinished, onRemoveFromCollection }: Props) {
  const book = state?.book;
  const readLabel = status === "reading" ? "Continuar a ler" : "Ler agora";

  const items = book && (
    <>
      <button onClick={() => onRead(book)} className="flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary">
        <BookOpen size={18} /> {status === "reading" ? readLabel : "Ler agora"}
      </button>
      <button onClick={() => onToggleSelect(book)} className="flex w-full items-center gap-3 rounded-xl border border-outline-variant px-4 py-3 text-sm font-bold text-on-surface hover:bg-surface-container-low">
        <Check size={18} /> {selected ? "Remover da seleção" : "Adicionar à seleção"}
      </button>
      <button onClick={() => onDetails(book)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface hover:bg-surface-container-low">
        <Info size={18} /> Detalhes
      </button>
      <button onClick={() => onCollections(book)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface hover:bg-surface-container-low">
        <FolderPlus size={18} /> Adicionar à coleção…
      </button>
      {inCollectionName && onRemoveFromCollection && (
        <button onClick={() => onRemoveFromCollection(book)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface hover:bg-surface-container-low">
          <FolderMinus size={18} /> Tirar de “{inCollectionName}”
        </button>
      )}
      {offlineSupported && (
        <button onClick={() => onToggleOffline(book)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface hover:bg-surface-container-low">
          {offlineSaved ? <CloudOff size={18} /> : <CloudDownload size={18} />}
          {offlineSaved ? "Remover do offline" : "Guardar para ler offline"}
        </button>
      )}
      <button onClick={() => onToggleFinished(book)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface hover:bg-surface-container-low">
        {status === "finished" ? <RotateCcw size={18} /> : <CheckCheck size={18} />}
        {status === "finished" ? "Marcar como por ler" : "Marcar como lido"}
      </button>
    </>
  );

  return (
    <AnimatePresence>
      {state && book && touch && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[190] bg-black/40" onClick={onClose} />
          <motion.div
            role="dialog" aria-label={`Opções de ${cleanBookTitle(book.title)}`}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[200] rounded-t-2xl bg-background p-4 shadow-2xl"
            style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="w-14 shrink-0"><BookCover coverUrl={book.cover_url} title={cleanBookTitle(book.title)} /></div>
              <div className="min-w-0">
                <p className="truncate font-bold text-primary">{cleanBookTitle(book.title)}</p>
                <p className="truncate text-sm text-on-surface-variant">{book.author ?? "Autor desconhecido"}</p>
              </div>
            </div>
            <div className="space-y-1">
              {items}
              <button onClick={onClose} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-outline"><X size={16} /> Fechar</button>
            </div>
          </motion.div>
        </>
      )}
      {state && book && !touch && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="fixed z-[200] w-64 space-y-0.5 rounded-xl border border-outline-variant bg-background p-2 shadow-2xl"
          style={{ top: Math.max(8, Math.min(state.y, window.innerHeight - 380)), left: Math.max(8, Math.min(state.x, window.innerWidth - 270)) }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          <p className="truncate px-3 pb-1.5 pt-1 text-xs font-bold uppercase tracking-wider text-outline">{cleanBookTitle(book.title)}</p>
          {items}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

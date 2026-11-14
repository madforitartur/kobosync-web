"use client";

import { BookOpen, Check, CheckCheck, CloudDownload, CloudOff, Download, FolderPlus, RotateCcw } from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { Modal } from "./Modal";
import { cleanBookTitle } from "@/lib/book-title";
import { LANGUAGE_NAMES } from "@/lib/library-types";
import type { Book } from "@/types/library";
import type { ReadStatus } from "@/hooks/useProgressMap";

type Props = {
  book: Book | null;
  touch: boolean;
  selected: boolean;
  status: ReadStatus;
  progress?: number;
  sentToKobo: boolean;
  offlineSaved: boolean;
  offlineSupported: boolean;
  onToggleOffline: (b: Book) => void;
  collectionNames: string[];
  onClose: () => void;
  onRead: (b: Book) => void;
  onToggleSelect: (b: Book) => void;
  onCollections: (b: Book) => void;
  onToggleFinished: (b: Book) => void;
  onFilterAuthor: (a: string) => void;
  onFilterSeries: (s: string) => void;
};

const fmtSize = (n: number | null) => (n ? `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB` : null);

export function BookDetail({ book, touch, selected, status, progress, sentToKobo, offlineSaved, offlineSupported, onToggleOffline, collectionNames, onClose, onRead, onToggleSelect, onCollections, onToggleFinished, onFilterAuthor, onFilterSeries }: Props) {
  const rows: Array<[string, React.ReactNode]> = book
    ? [
        ["Autor", book.author ? <button className="text-left font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onFilterAuthor(book.author!)}>{book.author}</button> : null],
        ["Série", book.series ? <button className="text-left font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onFilterSeries(book.series!)}>{book.series}{book.series_index ? ` · #${book.series_index}` : ""}</button> : null],
        ["Editora", book.publisher],
        ["Idioma", book.language ? LANGUAGE_NAMES[book.language.split("-")[0].toLowerCase()] ?? book.language : null],
        ["ISBN", book.isbn],
        ["Tamanho", fmtSize(book.filesize)],
        ["Coleções", collectionNames.length ? collectionNames.join(", ") : null],
        ["Kobo", sentToKobo ? "Já enviado" : null],
      ]
    : [];

  return (
    <Modal open={!!book} onClose={onClose} touch={touch} side title="Detalhes do livro">
      {book && (
        <div>
          <div className="flex gap-4">
            <div className="w-28 shrink-0">
              <BookCover coverUrl={book.cover_url} title={cleanBookTitle(book.title)} author={book.author} isSelected={selected} progress={progress} finished={status === "finished"} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display-lg text-xl font-bold leading-tight text-primary">{cleanBookTitle(book.title)}</h3>
              <p className="mt-1 text-sm text-on-surface-variant">{book.author ?? "Autor desconhecido"}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-outline">
                {status === "finished" ? "Lido" : status === "reading" ? `A ler · ${Math.round((progress ?? 0) * 100)}%` : "Por ler"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button onClick={() => onRead(book)} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-on-primary">
              <BookOpen size={18} /> {status === "reading" ? "Continuar a ler" : "Ler agora"}
            </button>
            <button onClick={() => onToggleSelect(book)} className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5 text-sm font-bold">
              <Check size={16} /> {selected ? "Na seleção" : "Selecionar"}
            </button>
            <button onClick={() => onCollections(book)} className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5 text-sm font-bold">
              <FolderPlus size={16} /> Coleção
            </button>
            <button onClick={() => onToggleFinished(book)} className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5 text-sm font-bold">
              {status === "finished" ? <RotateCcw size={16} /> : <CheckCheck size={16} />}
              {status === "finished" ? "Por ler" : "Marcar lido"}
            </button>
            {offlineSupported && (
              <button onClick={() => onToggleOffline(book)} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5 text-sm font-bold">
                {offlineSaved ? <CloudOff size={16} /> : <CloudDownload size={16} />}
                {offlineSaved ? "Disponível offline · remover" : "Guardar para ler offline"}
              </button>
            )}
            <a href={`/api/books/${book.id}/download`} download className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5 text-sm font-bold">
              <Download size={16} /> EPUB
            </a>
          </div>

          {book.description && (
            <div className="mt-5">
              <h4 className="mb-1.5 text-xs font-black uppercase tracking-widest text-outline">Sinopse</h4>
              <p className="whitespace-pre-line text-sm leading-6 text-on-surface-variant">
                {book.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
              </p>
            </div>
          )}

          <dl className="mt-5 divide-y divide-outline-variant text-sm">
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-4 py-2">
                <dt className="w-20 shrink-0 text-outline">{k}</dt>
                <dd className="min-w-0 break-words text-on-surface">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Modal>
  );
}

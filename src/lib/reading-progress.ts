/**
 * Posição de leitura guardada no browser (localStorage), por livro.
 *
 * - kobosync:reading:<id>   → posição do livro { scrollTop, ratio, timestamp }
 * - kobosync:reading-list   → lista dos livros em leitura (para o separador "Leitura")
 *
 * A posição é guardada como PERCENTAGEM (ratio 0–1) além dos píxeis, porque os
 * píxeis mudam quando o utilizador altera o tamanho da letra ou roda o ecrã.
 * Sincroniza entre aparelhos (cloud-sync): posições e lista são fundidas livro a livro.
 */

import { markChanged } from "./local-store";

const POS_PREFIX = "kobosync:reading:";
const LIST_KEY = "kobosync:reading-list";
const MAX_LIST = 120; // inclui entradas removidas (marcas), para a remoção também se propagar entre aparelhos
const MIN_RATIO_TO_LIST = 0.005; // só entra na lista depois de avançar um pouco
export const FINISHED_RATIO = 0.98;
export const READING_EVENT = "kobosync:reading-changed";

export type BookMeta = {
  title: string;
  author: string | null;
  cover_url: string | null;
};

export type SavedPosition = {
  scrollTop: number;
  ratio: number | null; // livros guardados antes desta versão não têm ratio
  timestamp: number;
  /** Offset de caracteres da primeira linha visível (igual em qualquer ecrã). */
  offset?: number;
  textLen?: number;
};

export type ReadingEntry = BookMeta & {
  id: string;
  ratio: number;
  updatedAt: number;
  finished: boolean;
  /** removido da lista (a marca evita que outro aparelho o volte a trazer) */
  removed?: boolean;
};

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota cheia ou modo privado — ignora
  }
}

function readList(): ReadingEntry[] {
  const list = readJSON<ReadingEntry[]>(LIST_KEY);
  return Array.isArray(list) ? list : [];
}

function notify() {
  try {
    window.dispatchEvent(new Event(READING_EVENT));
  } catch {}
  markChanged("positions");
  markChanged("readingList");
}

export function loadPosition(bookId: string): SavedPosition | null {
  const saved = readJSON<Partial<SavedPosition>>(POS_PREFIX + bookId);
  if (!saved || typeof saved.scrollTop !== "number") return null;
  return {
    scrollTop: saved.scrollTop,
    ratio: typeof saved.ratio === "number" ? saved.ratio : null,
    timestamp: saved.timestamp ?? 0,
    offset: typeof saved.offset === "number" ? saved.offset : undefined,
    textLen: typeof saved.textLen === "number" ? saved.textLen : undefined,
  };
}

export function savePosition(
  bookId: string,
  meta: BookMeta | null,
  scrollTop: number,
  maxScroll: number,
  anchor?: { offset: number; textLen: number } | null,
) {
  const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
  const now = Date.now();

  writeJSON(POS_PREFIX + bookId, { scrollTop, ratio, timestamp: now, ...(anchor ?? {}) });

  const list = readList();
  const existing = list.find((e) => e.id === bookId);

  if (meta && (existing || ratio >= MIN_RATIO_TO_LIST)) {
    const entry: ReadingEntry = {
      id: bookId,
      title: meta.title,
      author: meta.author,
      cover_url: meta.cover_url,
      ratio,
      updatedAt: now,
      finished: ratio >= FINISHED_RATIO,
    };
    const next = [entry, ...list.filter((e) => e.id !== bookId)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_LIST);
    writeJSON(LIST_KEY, next);
  } else if (existing) {
    writeJSON(LIST_KEY, list.map((e) => (e.id === bookId ? { ...e, ratio, updatedAt: now } : e)));
  }

  notify();
}

/** Livros que o utilizador começou e ainda não terminou, do mais recente para o mais antigo. */
export function getReadingList(): ReadingEntry[] {
  return readList()
    .filter((e) => !e.finished && !e.removed)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Tira o livro da lista "Leitura" (a posição guardada mantém-se). */
export function removeFromReadingList(bookId: string) {
  const now = Date.now();
  writeJSON(LIST_KEY, readList().map((e) => (e.id === bookId ? { ...e, removed: true, updatedAt: now } : e)));
  notify();
}

/** Junta duas listas "Leitura" (de aparelhos diferentes): por livro, ganha a entrada mais recente. */
export function mergeReadingLists(a: ReadingEntry[], b: ReadingEntry[]): ReadingEntry[] {
  const byId = new Map<string, ReadingEntry>();
  for (const e of [...a, ...b]) {
    if (!e || typeof e.id !== "string") continue;
    const cur = byId.get(e.id);
    if (!cur || (e.updatedAt ?? 0) > (cur.updatedAt ?? 0)) byId.set(e.id, e);
  }
  return [...byId.values()].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, MAX_LIST);
}

/**
 * Garante que um livro com leitura começada aparece em "Leitura" (por exemplo se os dados do livro
 * só chegaram depois de ele ser aberto). Respeita a remoção feita pelo utilizador depois dessa leitura.
 */
export function ensureListed(bookId: string, meta: BookMeta) {
  const pos = loadPosition(bookId);
  if (!pos || pos.ratio === null || pos.ratio < MIN_RATIO_TO_LIST || pos.ratio >= FINISHED_RATIO) return;
  const list = readList();
  const cur = list.find((e) => e.id === bookId);
  if (cur && (!cur.removed || cur.updatedAt >= pos.timestamp)) return;
  const entry: ReadingEntry = { id: bookId, ...meta, ratio: pos.ratio, updatedAt: pos.timestamp || Date.now(), finished: false };
  writeJSON(LIST_KEY, [entry, ...list.filter((e) => e.id !== bookId)].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LIST));
  notify();
}

/** Apaga a posição guardada e tira o livro da lista. */
export function clearPosition(bookId: string) {
  try {
    localStorage.removeItem(POS_PREFIX + bookId);
  } catch {}
  removeFromReadingList(bookId);
}

/** Progresso (0–1) de todos os livros com posição guardada (para filtros e etiquetas). */
export function getAllProgress(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(POS_PREFIX)) continue;
      const v = readJSON<Partial<SavedPosition>>(k);
      if (v && typeof v.ratio === "number") out[k.slice(POS_PREFIX.length)] = v.ratio;
    }
  } catch {}
  return out;
}

/** Marca o livro como lido (100%) ou por ler (apaga a posição). */
export function setFinished(bookId: string, meta: BookMeta | null, finished: boolean) {
  if (!finished) {
    clearPosition(bookId);
    return;
  }
  const now = Date.now();
  writeJSON(POS_PREFIX + bookId, { scrollTop: 0, ratio: 1, timestamp: now });
  if (meta) {
    const list = readList().filter((e) => e.id !== bookId);
    writeJSON(LIST_KEY, [{ id: bookId, ...meta, ratio: 1, updatedAt: now, finished: true }, ...list].slice(0, MAX_LIST));
  }
  notify();
}

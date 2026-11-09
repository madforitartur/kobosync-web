/**
 * Posição de leitura guardada no browser (localStorage), por livro.
 *
 * - kobosync:reading:<id>   → posição do livro { scrollTop, ratio, timestamp }
 * - kobosync:reading-list   → lista dos livros em leitura (para o separador "Leitura")
 *
 * A posição é guardada como PERCENTAGEM (ratio 0–1) além dos píxeis, porque os
 * píxeis mudam quando o utilizador altera o tamanho da letra ou roda o ecrã.
 * Fica no dispositivo/browser onde se lê (não sincroniza entre aparelhos).
 */

const POS_PREFIX = "kobosync:reading:";
const LIST_KEY = "kobosync:reading-list";
const MAX_LIST = 50;
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
};

export type ReadingEntry = BookMeta & {
  id: string;
  ratio: number;
  updatedAt: number;
  finished: boolean;
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
}

export function loadPosition(bookId: string): SavedPosition | null {
  const saved = readJSON<Partial<SavedPosition>>(POS_PREFIX + bookId);
  if (!saved || typeof saved.scrollTop !== "number") return null;
  return {
    scrollTop: saved.scrollTop,
    ratio: typeof saved.ratio === "number" ? saved.ratio : null,
    timestamp: saved.timestamp ?? 0,
  };
}

export function savePosition(
  bookId: string,
  meta: BookMeta | null,
  scrollTop: number,
  maxScroll: number,
) {
  const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
  const now = Date.now();

  writeJSON(POS_PREFIX + bookId, { scrollTop, ratio, timestamp: now });

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
    .filter((e) => !e.finished)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Tira o livro da lista "Leitura" (a posição guardada mantém-se). */
export function removeFromReadingList(bookId: string) {
  writeJSON(LIST_KEY, readList().filter((e) => e.id !== bookId));
  notify();
}

/** Apaga a posição guardada e tira o livro da lista. */
export function clearPosition(bookId: string) {
  try {
    localStorage.removeItem(POS_PREFIX + bookId);
  } catch {}
  removeFromReadingList(bookId);
}

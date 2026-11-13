import { getDb } from "./admin";
import type { Book } from "@/types/library";

/**
 * MODELO DE DADOS (pensado para o plano gratuito do Firestore: 50k leituras/dia)
 *
 * Em vez de 1 documento por livro (2390 leituras para carregar a biblioteca),
 * os livros ficam agrupados em "chunks" de até 200 livros por documento:
 *
 *   library/c0000  { books: [ {...}, {...}, ... ] }
 *   library/c0001  { books: [ ... ] }
 *
 * Carregar a biblioteca inteira custa ~12 leituras (para 2390 livros).
 * O id de cada livro é o drive_file_id (estável e sem duplicados).
 * As capas ficam noutra colecção ("covers"), 1 documento por livro,
 * lidas só quando o browser pede a imagem.
 */
const COLLECTION = "library";
const CHUNK_SIZE = 200;

type Chunk = { id: string; books: Book[] };

type Loaded = {
  books: Book[]; // ordenados por título
  chunkOf: Map<string, string>; // book id -> id do documento (chunk)
  ts: number;
};

let cache: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateBooksCache() {
  cache = null;
  inflight = null;
}

const chunkName = (n: number) => `c${String(n).padStart(4, "0")}`;

async function loadChunks(): Promise<Chunk[]> {
  const snap = await getDb().collection(COLLECTION).get();
  return snap.docs
    .map((d) => ({ id: d.id, books: ((d.data().books ?? []) as Book[]) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchAll(): Promise<Loaded> {
  const chunks = await loadChunks();
  const chunkOf = new Map<string, string>();
  const books: Book[] = [];
  for (const chunk of chunks) {
    for (const book of chunk.books) {
      chunkOf.set(book.id, chunk.id);
      books.push(book);
    }
  }
  books.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "", "pt", { sensitivity: "base" }));
  return { books, chunkOf, ts: Date.now() };
}

async function getLoaded(forceRefresh = false): Promise<Loaded> {
  if (!forceRefresh && cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache;
  if (!forceRefresh && inflight) return inflight;

  inflight = fetchAll().then((loaded) => {
    cache = loaded;
    inflight = null;
    return loaded;
  });
  return inflight;
}

/** Devolve todos os livros (cache de 60s por instância). */
export async function getAllBooksCached(forceRefresh = false): Promise<Book[]> {
  return (await getLoaded(forceRefresh)).books;
}

// ── Pesquisa (em memória) ──────────────────────────────────────────────────

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normalize = (s: string) => stripAccents(s.toLowerCase().trim());

type Indexed = { haystack: string; words: string[]; title: string; author: string };
const indexCache = new WeakMap<Book, Indexed>();

function indexOf(book: Book): Indexed {
  let idx = indexCache.get(book);
  if (!idx) {
    const haystack = normalize(
      [book.title, book.author, book.series, book.publisher, book.isbn].filter(Boolean).join(" "),
    );
    idx = {
      haystack,
      words: haystack.split(/[^a-z0-9]+/).filter(Boolean),
      title: normalize(book.title ?? ""),
      author: normalize(book.author ?? ""),
    };
    indexCache.set(book, idx);
  }
  return idx;
}

/** Distância de edição limitada (para tolerar 1–2 erros de escrita). */
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

function tokensOf(term: string): string[] {
  return normalize(term).split(/\s+/).filter(Boolean);
}

function matchesTokens(book: Book, tokens: string[], fuzzy: boolean): boolean {
  const idx = indexOf(book);
  return tokens.every((t) => {
    if (idx.haystack.includes(t)) return true;
    if (!fuzzy || t.length < 4) return false;
    const max = t.length >= 7 ? 2 : 1;
    return idx.words.some((w) => withinDistance(t, w, max));
  });
}

function relevance(book: Book, tokens: string[]): number {
  const idx = indexOf(book);
  const phrase = tokens.join(" ");
  if (idx.title === phrase) return 0;
  if (idx.title.startsWith(phrase)) return 1;
  if (tokens.every((t) => idx.title.includes(t))) return 2;
  if (tokens.every((t) => idx.author.includes(t))) return 3;
  return 4;
}

function searchBooks(all: Book[], term?: string): { books: Book[]; tokens: string[] } {
  const tokens = term ? tokensOf(term) : [];
  if (tokens.length === 0) return { books: all, tokens };
  let found = all.filter((b) => matchesTokens(b, tokens, false));
  if (found.length === 0) found = all.filter((b) => matchesTokens(b, tokens, true)); // tolera erros
  return { books: found, tokens };
}

export type SortKey = "title" | "author" | "recent" | "series" | "size" | "relevance";

export type BookQuery = {
  q?: string;
  sort?: SortKey;
  author?: string;
  series?: string;
  language?: string;
  /** só estes ids (ex.: coleção, "a ler") */
  ids?: string[];
  /** exclui estes ids (ex.: "por ler") */
  exclude?: string[];
  from?: number;
  to?: number;
};

const collator = new Intl.Collator("pt", { sensitivity: "base", numeric: true });

function sortBooks(books: Book[], sort: SortKey, tokens: string[]): Book[] {
  const out = [...books];
  switch (sort) {
    case "relevance":
      return out.sort(
        (a, b) => relevance(a, tokens) - relevance(b, tokens) || collator.compare(a.title ?? "", b.title ?? ""),
      );
    case "author":
      return out.sort(
        (a, b) =>
          collator.compare(a.author ?? "\uffff", b.author ?? "\uffff") ||
          collator.compare(a.title ?? "", b.title ?? ""),
      );
    case "recent":
      return out.sort((a, b) =>
        (b.created_at ?? b.modified_at ?? "").localeCompare(a.created_at ?? a.modified_at ?? ""),
      );
    case "series":
      return out.sort((a, b) => {
        const sa = a.series ?? "\uffff";
        const sb = b.series ?? "\uffff";
        return (
          collator.compare(sa, sb) ||
          (a.series_index ?? 1e9) - (b.series_index ?? 1e9) ||
          collator.compare(a.title ?? "", b.title ?? "")
        );
      });
    case "size":
      return out.sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0));
    default:
      return out; // já vem por título
  }
}

export async function queryBooks(query: BookQuery): Promise<{ books: Book[]; total: number }> {
  let list = await getAllBooksCached();
  if (query.ids) {
    const wanted = new Set(query.ids);
    list = list.filter((b) => wanted.has(b.id));
  }
  if (query.exclude?.length) {
    const skip = new Set(query.exclude);
    list = list.filter((b) => !skip.has(b.id));
  }
  if (query.author) list = list.filter((b) => b.author === query.author);
  if (query.series) list = list.filter((b) => b.series === query.series);
  if (query.language) list = list.filter((b) => (b.language ?? "").toLowerCase().startsWith(query.language!.toLowerCase()));

  const { books: searched, tokens } = searchBooks(list, query.q);
  const sort: SortKey = query.sort ?? (tokens.length ? "relevance" : "title");
  const sorted = sortBooks(searched, sort === "relevance" && !tokens.length ? "title" : sort, tokens);

  const total = sorted.length;
  const books =
    query.from !== undefined && query.to !== undefined ? sorted.slice(query.from, query.to + 1) : sorted;
  return { books, total };
}

export async function listBooks(search?: string, options: ListBooksOptions = {}): Promise<Book[]> {
  const { from, to } = options;
  return (await queryBooks({ q: search, from, to })).books;
}

export async function countBooks(search?: string): Promise<number> {
  return (await queryBooks({ q: search })).total;
}

export type ListBooksOptions = { from?: number; to?: number };

export type Group = { name: string; count: number; covers: string[] };

function groupBy(books: Book[], pick: (b: Book) => string | null): Group[] {
  const map = new Map<string, Group>();
  for (const b of books) {
    const name = pick(b);
    if (!name) continue;
    const g = map.get(name) ?? { name, count: 0, covers: [] };
    g.count++;
    if (b.cover_url && g.covers.length < 3) g.covers.push(b.cover_url);
    map.set(name, g);
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
}

export async function getFacets(): Promise<{ authors: Group[]; series: Group[]; languages: Group[] }> {
  const all = await getAllBooksCached();
  return {
    authors: groupBy(all, (b) => b.author),
    series: groupBy(all, (b) => b.series),
    languages: groupBy(all, (b) => (b.language ? b.language.split("-")[0].toLowerCase() : null)),
  };
}

export async function listBooksByIds(ids: string[]): Promise<Book[]> {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  return (await getAllBooksCached()).filter((b) => wanted.has(b.id));
}

export async function getBookById(id: string): Promise<Book | null> {
  const all = await getAllBooksCached();
  return all.find((b) => b.id === id) ?? null;
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b, "pt", { sensitivity: "base" }),
  );
}

export async function listAuthors(): Promise<string[]> {
  return uniqueSorted((await getAllBooksCached()).map((b) => b.author));
}

export async function listSeries(): Promise<string[]> {
  return uniqueSorted((await getAllBooksCached()).map((b) => b.series));
}

// ── Escrita ────────────────────────────────────────────────────────────────

/**
 * Insere apenas os livros cujo drive_file_id ainda não existe.
 * Custo: ~12 leituras + ~12 escritas para toda a biblioteca.
 */
export async function insertNewBooks(
  files: Array<{ id: string; name: string; size?: string; modifiedTime?: string }>,
  basicMetadataFromFilename: (name: string) => { title: string; author: string | null },
): Promise<number> {
  const db = getDb();
  const chunks = await loadChunks();
  const known = new Set(chunks.flatMap((c) => c.books.map((b) => b.id)));

  const now = new Date().toISOString();
  const fresh: Book[] = files
    .filter((f) => !known.has(f.id))
    .map((f) => {
      const meta = basicMetadataFromFilename(f.name);
      return {
        id: f.id,
        drive_file_id: f.id,
        title: meta.title,
        author: meta.author,
        series: null,
        series_index: null,
        language: null,
        publisher: null,
        isbn: null,
        description: null,
        cover_url: null,
        cover_missing: false,
        epub_url: null,
        filesize: f.size ? Number(f.size) : null,
        modified_at: f.modifiedTime ?? null,
        created_at: now,
        updated_at: now,
      };
    });

  if (fresh.length === 0) return 0;

  const touched = new Map<string, Book[]>();
  let last = chunks[chunks.length - 1];
  let nextIndex = chunks.length;
  let queue = [...fresh];

  while (queue.length > 0) {
    if (!last || last.books.length >= CHUNK_SIZE) {
      last = { id: chunkName(nextIndex++), books: [] };
      chunks.push(last);
    }
    const room = CHUNK_SIZE - last.books.length;
    last.books = [...last.books, ...queue.slice(0, room)];
    queue = queue.slice(room);
    touched.set(last.id, last.books);
  }

  const batch = db.batch();
  for (const [id, books] of touched) {
    batch.set(db.collection(COLLECTION).doc(id), { books });
  }
  await batch.commit();

  invalidateBooksCache();
  console.log(`[Sync] Inserted ${fresh.length} new books in ${touched.size} chunk(s)`);
  return fresh.length;
}

export type BookPatch = {
  id: string;
  cover_url?: string | null;
  cover_missing?: boolean;
  cover_failed?: boolean;
};

/**
 * Aplica alterações a vários livros. Agrupa por chunk e faz 1 transacção por
 * chunk (1 leitura + 1 escrita), por isso é barato mesmo com muitos livros.
 */
export async function patchBooks(patches: BookPatch[]): Promise<void> {
  if (patches.length === 0) return;
  const db = getDb();
  const { chunkOf } = await getLoaded();

  const byChunk = new Map<string, Map<string, BookPatch>>();
  for (const patch of patches) {
    const chunkId = chunkOf.get(patch.id);
    if (!chunkId) continue;
    if (!byChunk.has(chunkId)) byChunk.set(chunkId, new Map());
    byChunk.get(chunkId)!.set(patch.id, patch);
  }

  const now = new Date().toISOString();
  for (const [chunkId, group] of byChunk) {
    const ref = db.collection(COLLECTION).doc(chunkId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const books = ((snap.data()?.books ?? []) as Book[]).map((book) => {
        const patch = group.get(book.id);
        if (!patch) return book;
        const next: Book = { ...book, updated_at: now };
        if (patch.cover_url !== undefined) next.cover_url = patch.cover_url;
        if (patch.cover_missing !== undefined) next.cover_missing = patch.cover_missing;
        if (patch.cover_failed !== undefined) next.cover_failed = patch.cover_failed;
        return next;
      });
      tx.set(ref, { books });
    });
  }

  invalidateBooksCache();
}

export async function updateBookCover(id: string, cover: { cover_url: string | null }): Promise<void> {
  await patchBooks([{ id, cover_url: cover.cover_url, cover_missing: false, cover_failed: false }]);
}

export async function markCoverMissing(id: string): Promise<void> {
  await patchBooks([{ id, cover_missing: true }]);
}

/** Livros sem capa e com drive_file_id (candidatos ao sync de capas). */
export async function listBooksWithoutCover(limit?: number, forceRefresh = false): Promise<Book[]> {
  const all = await getAllBooksCached(forceRefresh);
  const filtered = all.filter((b) => !b.cover_url && !b.cover_missing && b.drive_file_id);
  return limit ? filtered.slice(0, limit) : filtered;
}

export async function countBooksWithoutCover(forceRefresh = false): Promise<number> {
  return (await listBooksWithoutCover(undefined, forceRefresh)).length;
}

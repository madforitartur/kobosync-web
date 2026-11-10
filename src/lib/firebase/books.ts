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

function matchesSearch(book: Book, term: string): boolean {
  const needle = normalize(term);
  return [book.title, book.author, book.series, book.publisher, book.isbn].some(
    (field) => field && normalize(field).includes(needle),
  );
}

export type ListBooksOptions = { from?: number; to?: number };

export async function listBooks(search?: string, options: ListBooksOptions = {}): Promise<Book[]> {
  const all = await getAllBooksCached();
  const term = search?.trim();
  const filtered = term ? all.filter((b) => matchesSearch(b, term)) : all;
  if (options.from !== undefined && options.to !== undefined) {
    return filtered.slice(options.from, options.to + 1);
  }
  return filtered;
}

export async function countBooks(search?: string): Promise<number> {
  const all = await getAllBooksCached();
  const term = search?.trim();
  return term ? all.filter((b) => matchesSearch(b, term)).length : all.length;
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

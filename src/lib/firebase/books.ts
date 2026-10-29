import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin";
import type { Book } from "@/types/library";

const COLLECTION = "books";

// ── Cache em memória (por instância serverless) ─────────────────────────────
// O Firestore cobra por leitura de documento; para uma biblioteca pessoal
// (até alguns milhares de livros) é muito mais barato e rápido ler a coleção
// inteira uma vez e filtrar/paginar em memória do que fazer queries repetidas.
let cache: { books: Book[]; ts: number } | null = null;
let inflight: Promise<Book[]> | null = null;
const CACHE_TTL_MS = 15_000;

export function invalidateBooksCache() {
  cache = null;
  inflight = null;
}

function docToBook(doc: FirebaseFirestore.QueryDocumentSnapshot): Book {
  const data = doc.data();
  return {
    id: doc.id,
    drive_file_id: data.drive_file_id ?? null,
    title: data.title ?? "",
    author: data.author ?? null,
    series: data.series ?? null,
    series_index: data.series_index ?? null,
    language: data.language ?? null,
    publisher: data.publisher ?? null,
    isbn: data.isbn ?? null,
    description: data.description ?? null,
    cover_url: data.cover_url ?? null,
    cover_drive_file_id: data.cover_drive_file_id ?? null,
    epub_url: data.epub_url ?? null,
    filesize: data.filesize ?? null,
    modified_at: data.modified_at ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  };
}

async function fetchAllBooks(): Promise<Book[]> {
  const db = getDb();
  const snapshot = await db.collection(COLLECTION).get();
  const books = snapshot.docs.map(docToBook);
  books.sort((a, b) => a.title.localeCompare(b.title, "pt", { sensitivity: "base" }));
  return books;
}

/** Devolve todos os livros, usando cache de curta duração. */
export async function getAllBooksCached(forceRefresh = false): Promise<Book[]> {
  if (!forceRefresh && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.books;
  }
  if (!forceRefresh && inflight) {
    return inflight;
  }

  inflight = fetchAllBooks().then((books) => {
    cache = { books, ts: Date.now() };
    inflight = null;
    return books;
  });

  return inflight;
}

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (s: string) => stripAccents(s.toLowerCase().trim());

function matchesSearch(book: Book, term: string): boolean {
  const needle = normalize(term);
  const haystacks = [book.title, book.author, book.series, book.publisher, book.isbn];
  return haystacks.some((field) => field && normalize(field).includes(needle));
}

export type ListBooksOptions = {
  from?: number;
  to?: number;
};

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
  if (!term) return all.length;
  return all.filter((b) => matchesSearch(b, term)).length;
}

export async function listBooksByIds(ids: string[]): Promise<Book[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const uniqueIds = [...new Set(ids)];

  const CHUNK = 300; // getAll suporta muitos refs, mas mantemos lotes seguros
  const results: Book[] = [];

  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK);
    const refs = chunk.map((id) => db.collection(COLLECTION).doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) {
        results.push(docToBook(snap as FirebaseFirestore.QueryDocumentSnapshot));
      }
    }
  }

  results.sort((a, b) => a.title.localeCompare(b.title, "pt", { sensitivity: "base" }));
  return results;
}

export async function getBookById(id: string): Promise<Book | null> {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return docToBook(snap as FirebaseFirestore.QueryDocumentSnapshot);
}

export async function listAuthors(): Promise<string[]> {
  const all = await getAllBooksCached();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const book of all) {
    if (book.author && !seen.has(book.author)) {
      seen.add(book.author);
      result.push(book.author);
    }
  }
  return result.sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
}

export async function listSeries(): Promise<string[]> {
  const all = await getAllBooksCached();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const book of all) {
    if (book.series && !seen.has(book.series)) {
      seen.add(book.series);
      result.push(book.series);
    }
  }
  return result.sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
}

/**
 * Insere apenas os livros cujo drive_file_id ainda não existe na coleção.
 * Devolve o número de livros novos inseridos.
 */
export async function insertNewBooks(
  files: Array<{ id: string; name: string; size?: string; modifiedTime?: string }>,
  basicMetadataFromFilename: (name: string) => { title: string; author: string | null },
): Promise<number> {
  const db = getDb();
  const existing = await getAllBooksCached(true);
  const knownIds = new Set(existing.map((b) => b.drive_file_id).filter(Boolean));

  const newFiles = files.filter((f) => !knownIds.has(f.id));
  if (newFiles.length === 0) return 0;

  const BATCH = 450; // limite do Firestore é 500 operações por batch
  for (let i = 0; i < newFiles.length; i += BATCH) {
    const chunk = newFiles.slice(i, i + BATCH);
    const batch = db.batch();
    for (const file of chunk) {
      const meta = basicMetadataFromFilename(file.name);
      const ref = db.collection(COLLECTION).doc();
      batch.set(ref, {
        drive_file_id: file.id,
        title: meta.title,
        author: meta.author,
        series: null,
        series_index: null,
        language: null,
        publisher: null,
        isbn: null,
        description: null,
        cover_url: null,
        cover_drive_file_id: null,
        epub_url: null,
        filesize: file.size ? Number(file.size) : null,
        modified_at: file.modifiedTime ?? null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  invalidateBooksCache();
  console.log(`[Sync] Inserted ${newFiles.length} new books`);
  return newFiles.length;
}

export async function updateBookCover(
  id: string,
  cover: { cover_url: string | null; cover_drive_file_id: string | null },
): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).update({
    cover_url: cover.cover_url,
    cover_drive_file_id: cover.cover_drive_file_id,
    updated_at: FieldValue.serverTimestamp(),
  });
  invalidateBooksCache();
}

/** Livros sem capa e com drive_file_id (candidatos ao sync de capas). */
export async function listBooksWithoutCover(limit?: number): Promise<Book[]> {
  const all = await getAllBooksCached();
  const filtered = all.filter((b) => !b.cover_url && b.drive_file_id);
  return limit ? filtered.slice(0, limit) : filtered;
}

export async function countBooksWithoutCover(): Promise<number> {
  const all = await getAllBooksCached();
  return all.filter((b) => !b.cover_url && b.drive_file_id).length;
}

import { getBookById } from "@/lib/firebase/books";
import { downloadFromDriveWithConfig } from "@/lib/google-drive";
import type { Book } from "@/types/library";

/** Nome de ficheiro limpo (sem numeração/underscores nem caracteres proibidos). */
export function epubFilename(title: string | null | undefined): string {
  const safe = (title ?? "livro")
    .replace(/^#?\d+[\s._\-]+/, "")
    .replace(/#\d+\s*/g, "")
    .replace(/_/g, " ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim() || "livro";
  return `${safe}.epub`;
}

/** EPUB de um livro: epub_url pública ou Google Drive (fonte principal). */
export async function loadEpub(book: Book): Promise<ArrayBuffer | null> {
  let buffer: ArrayBuffer | null = null;
  if (book.epub_url) {
    const res = await fetch(book.epub_url);
    if (res.ok) buffer = await res.arrayBuffer();
  }
  if (!buffer && book.drive_file_id) buffer = await downloadFromDriveWithConfig(book.drive_file_id);
  return buffer && buffer.byteLength >= 100 ? buffer : null;
}

export async function loadEpubById(id: string): Promise<{ book: Book; buffer: ArrayBuffer } | null> {
  const book = await getBookById(id);
  if (!book) return null;
  const buffer = await loadEpub(book);
  return buffer ? { book, buffer } : null;
}

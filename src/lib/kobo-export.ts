import JSZip from "jszip";
import { cleanBookTitle } from "./book-title";
import type { Book } from "@/types/library";

/** Nome de ficheiro seguro e único. */
function fileNameFor(book: Book, used: Set<string>): string {
  const base = cleanBookTitle(book.title).replace(/[\/\\:*?"<>|]+/g, "-").trim().slice(0, 120) || "livro";
  let name = `${base}.epub`;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base} (${n++}).epub`;
  used.add(name.toLowerCase());
  return name;
}

async function fetchEpub(book: Book): Promise<Blob> {
  const res = await fetch(`/api/books/${book.id}/download`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size < 100) throw new Error("Ficheiro vazio");
  return blob;
}

export type ExportProgress = (done: number, total: number) => void;
export type ExportResult = { sent: string[]; failed: string[] };

export const supportsFolderPicker = () =>
  typeof window !== "undefined" && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** Copia os EPUB diretamente para a pasta do Kobo (Chrome/Edge no PC). */
export async function sendToFolder(books: Book[], onProgress: ExportProgress): Promise<ExportResult> {
  const picker = (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const dir = await picker.call(window);
  const used = new Set<string>();
  const result: ExportResult = { sent: [], failed: [] };
  let done = 0;
  for (const book of books) {
    try {
      const blob = await fetchEpub(book);
      const handle = await dir.getFileHandle(fileNameFor(book, used), { create: true });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      result.sent.push(book.id);
    } catch {
      result.failed.push(book.id);
    }
    onProgress(++done, books.length);
  }
  return result;
}

const PART_BYTES = 120 * 1024 * 1024; // partes de ~120 MB (seguro para telemóveis)

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Descarrega os livros em um ou mais ZIP (sem compressão: os EPUB já são ZIP). */
export async function downloadZip(books: Book[], onProgress: ExportProgress): Promise<ExportResult> {
  const used = new Set<string>();
  const result: ExportResult = { sent: [], failed: [] };
  let zip = new JSZip();
  let bytes = 0;
  let part = 1;
  let inPart = 0;
  let done = 0;

  const flush = async () => {
    if (inPart === 0) return;
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    triggerDownload(blob, `kobosync-livros-${String(part).padStart(2, "0")}.zip`);
    part++;
    zip = new JSZip();
    bytes = 0;
    inPart = 0;
    await new Promise((r) => setTimeout(r, 400)); // deixa o browser iniciar a descarga
  };

  for (const book of books) {
    try {
      const blob = await fetchEpub(book);
      if (bytes + blob.size > PART_BYTES) await flush();
      zip.file(fileNameFor(book, used), blob);
      bytes += blob.size;
      inPart++;
      result.sent.push(book.id);
    } catch {
      result.failed.push(book.id);
    }
    onProgress(++done, books.length);
  }
  await flush();
  return result;
}

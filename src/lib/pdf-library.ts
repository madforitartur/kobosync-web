import { getServerConfig } from "@/lib/env";
import { listDriveEpubs } from "@/lib/google-drive";
import { pdfFolders } from "@/lib/firebase/drive-folders";

export type PdfEntry = { id: string; title: string; author: string | null; size: number | null; modified: string | null; folder: string; folderName: string; hasThumb: boolean };
type Cached = { at: number; entries: PdfEntry[]; thumbs: Map<string, string> };

let cache: Cached | null = null;
const TTL = 5 * 60_000;

function split(name: string) {
  const base = name.replace(/\.pdf$/i, "").replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
  const i = base.lastIndexOf(" - ");
  return i > 0 ? { title: base.slice(0, i).trim(), author: base.slice(i + 3).trim() || null } : { title: base, author: null };
}

/** PDFs das pastas de Drive marcadas como "PDF" (lista em memória durante 5 minutos). */
export async function listPdfs(force = false): Promise<Cached> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache;
  const folders = await pdfFolders();
  const cfg = getServerConfig();
  const entries: PdfEntry[] = [];
  const thumbs = new Map<string, string>();
  if (folders.length) {
    const { files } = await listDriveEpubs({ clientEmail: cfg.googleClientEmail, privateKey: cfg.googlePrivateKey, sharedDriveId: cfg.googleSharedDriveId, folderId: folders.map((f) => f.id).join(",") }, "pdf");
    const names = new Map(folders.map((f) => [f.id, f.label || f.name || "PDF"]));
    for (const f of files) {
      const m = split(f.name);
      if (f.thumbnailLink) thumbs.set(f.id, f.thumbnailLink);
      entries.push({ id: f.id, ...m, size: f.size ? Number(f.size) : null, modified: f.modifiedTime ?? null, folder: f.root ?? "", folderName: names.get(f.root ?? "") ?? "PDF", hasThumb: !!f.thumbnailLink });
    }
    entries.sort((a, b) => a.title.localeCompare(b.title, "pt"));
  }
  cache = { at: Date.now(), entries, thumbs };
  return cache;
}

/** Só se deixam abrir ficheiros que estão realmente nas pastas de PDF configuradas. */
export async function findPdf(id: string): Promise<{ entry: PdfEntry; thumb?: string } | null> {
  let c = await listPdfs();
  let entry = c.entries.find((e) => e.id === id);
  if (!entry) { c = await listPdfs(true); entry = c.entries.find((e) => e.id === id); }
  return entry ? { entry, thumb: c.thumbs.get(id) } : null;
}

import { getServerConfig } from "@/lib/env";
import { listDriveEpubs } from "@/lib/google-drive";
import { allFolderIds, folderLabels } from "@/lib/firebase/drive-folders";

export type PdfEntry = { id: string; title: string; author: string | null; size: number | null; modified: string | null; folder: string; folderName: string; hasThumb: boolean };
type Cached = { at: number; entries: PdfEntry[]; thumbs: Map<string, string> };

let cache: Cached | null = null;
const TTL = 2 * 60_000;

function split(name: string) {
  const base = name.replace(/\.pdf$/i, "").replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
  const i = base.lastIndexOf(" - ");
  return i > 0 ? { title: base.slice(0, i).trim(), author: base.slice(i + 3).trim() || null } : { title: base, author: null };
}

/** PDFs de todas as pastas monitorizadas (os EPUBs ficam na biblioteca; lista em memória durante 2 minutos). */
export async function listPdfs(force = false): Promise<Cached> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache;
  const cfg = getServerConfig();
  const ids = await allFolderIds(cfg.googleDriveFolderId);
  const entries: PdfEntry[] = [];
  const thumbs = new Map<string, string>();
  {
    const { files } = await listDriveEpubs({ clientEmail: cfg.googleClientEmail, privateKey: cfg.googlePrivateKey, sharedDriveId: cfg.googleSharedDriveId, folderId: ids.join(",") }, "pdf");
    const names = await folderLabels(cfg.googleDriveFolderId);
    for (const f of files) {
      const m = split(f.name);
      if (f.thumbnailLink) thumbs.set(f.id, f.thumbnailLink);
      entries.push({ id: f.id, ...m, size: f.size ? Number(f.size) : null, modified: f.modifiedTime ?? null, folder: f.root ?? "", folderName: names.get(f.root ?? "") ?? "Drive", hasThumb: !!f.thumbnailLink });
    }
    entries.sort((a, b) => a.title.localeCompare(b.title, "pt"));
  }
  cache = { at: Date.now(), entries, thumbs };
  return cache;
}

/** Só se deixam abrir ficheiros que estão realmente nas pastas configuradas. */
export async function findPdf(id: string): Promise<{ entry: PdfEntry; thumb?: string } | null> {
  let c = await listPdfs();
  let entry = c.entries.find((e) => e.id === id);
  if (!entry) { c = await listPdfs(true); entry = c.entries.find((e) => e.id === id); }
  return entry ? { entry, thumb: c.thumbs.get(id) } : null;
}

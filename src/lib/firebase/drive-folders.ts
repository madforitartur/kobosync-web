import { getDb } from "./admin";
import { parseFolderIds } from "../google-drive";

/**
 * Pastas extra do Google Drive, geridas pelo administrador nas Definições.
 * Somam-se às de GOOGLE_DRIVE_FOLDER_ID (variável de ambiente).
 */
export type FolderKind = "epub" | "pdf";
export type StoredFolder = { id: string; name: string; label?: string; kind?: FolderKind; addedAt: number };

const doc = () => getDb().collection("config").doc("drive_folders");

export async function listStoredFolders(): Promise<StoredFolder[]> {
  const snap = await doc().get();
  const f = snap.exists ? (snap.data()?.folders as StoredFolder[] | undefined) : undefined;
  return Array.isArray(f) ? f.filter((x) => x && typeof x.id === "string") : [];
}

export const cleanLabel = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 40) : "");

/** Adiciona uma pasta (ou, se já existir, atualiza o nome que lhe demos). */
export async function addStoredFolder(f: { id: string; name: string; label?: string; kind?: FolderKind }): Promise<StoredFolder[]> {
  const kind: FolderKind = f.kind === "pdf" ? "pdf" : "epub";
  const cur = await listStoredFolders();
  const label = cleanLabel(f.label);
  const at = cur.findIndex((x) => x.id === f.id);
  if (at >= 0) {
    cur[at] = { ...cur[at], ...(label ? { label } : {}), kind };
    await doc().set({ folders: cur });
    return cur;
  }
  if (cur.length >= 20) throw new Error("Máximo de 20 pastas.");
  const next = [...cur, { id: f.id, name: f.name.slice(0, 120), ...(label ? { label } : {}), kind, addedAt: Date.now() }];
  await doc().set({ folders: next });
  return next;
}

export async function removeStoredFolder(id: string): Promise<StoredFolder[]> {
  const next = (await listStoredFolders()).filter((x) => x.id !== id);
  await doc().set({ folders: next });
  return next;
}

/** Todas as pastas a sincronizar: variável de ambiente + as adicionadas nas Definições. */
export async function allFolderIds(envRaw?: string | null): Promise<string[]> {
  const stored = await listStoredFolders().catch(() => []);
  return [...new Set([...parseFolderIds(envRaw), ...stored.filter((s) => s.kind !== "pdf").map((s) => s.id)])];
}

/** Pastas marcadas como PDF (não entram na sincronização de EPUBs). */
export async function pdfFolders(): Promise<StoredFolder[]> {
  return (await listStoredFolders().catch(() => [])).filter((s) => s.kind === "pdf");
}

/** Muda (ou apaga, se vazio) o nome que demos a uma pasta já guardada. */
export async function renameStoredFolder(id: string, label: unknown): Promise<StoredFolder[]> {
  const cur = await listStoredFolders();
  const l = cleanLabel(label);
  const next = cur.map((x) => {
    if (x.id !== id) return x;
    const { label: _old, ...rest } = x;
    void _old;
    return l ? { ...rest, label: l } : rest;
  });
  await doc().set({ folders: next });
  return next;
}

/** Nome a mostrar de cada pasta raiz (id → nome). As da variável de ambiente sem nome chamam-se "Pasta principal". */
export async function folderLabels(envRaw?: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of parseFolderIds(envRaw)) out.set(id, "Pasta principal");
  for (const f of await listStoredFolders().catch(() => [])) out.set(f.id, f.label || f.name || f.id);
  return out;
}

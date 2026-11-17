import { getDb } from "./admin";
import { parseFolderIds } from "../google-drive";

/**
 * Pastas extra do Google Drive, geridas pelo administrador nas Definições.
 * Somam-se às de GOOGLE_DRIVE_FOLDER_ID (variável de ambiente).
 */
export type StoredFolder = { id: string; name: string; addedAt: number };

const doc = () => getDb().collection("config").doc("drive_folders");

export async function listStoredFolders(): Promise<StoredFolder[]> {
  const snap = await doc().get();
  const f = snap.exists ? (snap.data()?.folders as StoredFolder[] | undefined) : undefined;
  return Array.isArray(f) ? f.filter((x) => x && typeof x.id === "string") : [];
}

export async function addStoredFolder(f: { id: string; name: string }): Promise<StoredFolder[]> {
  const cur = await listStoredFolders();
  if (cur.some((x) => x.id === f.id)) return cur;
  if (cur.length >= 20) throw new Error("Máximo de 20 pastas.");
  const next = [...cur, { id: f.id, name: f.name.slice(0, 120), addedAt: Date.now() }];
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
  return [...new Set([...parseFolderIds(envRaw), ...stored.map((s) => s.id)])];
}

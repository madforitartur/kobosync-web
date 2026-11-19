/**
 * Biblioteca offline no aparelho.
 *  • "folder": pasta escolhida pelo utilizador (File System Access API: Chrome/Edge no computador).
 *  • "private": armazenamento privado da app no browser (OPFS), para telemóveis e browsers sem acesso a pastas.
 * Os livros ficam só no aparelho; nada disto passa pelo servidor.
 */
export type LocalEntry = { path: string; name: string; size: number; modified: number };
export type Backend = { kind: "folder" | "private"; label: string; key: string; root: FileSystemDirectoryHandle };
export type BackendState =
  | { status: "ready"; backend: Backend }
  | { status: "needs-permission"; label: string }
  | { status: "unsupported" };

type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  values: () => AsyncIterable<FileSystemHandle>;
};

export const LOCAL_EVENT = "kobosync:local-changed";
export const folderSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;
const opfsSupported = () => typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;

// ── IndexedDB mínimo ─────────────────────────────────────────────────────────
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("kobosync-local", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("handles"); r.result.createObjectStore("meta"); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb<T>(store: "handles" | "meta", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const rq = fn(d.transaction(store, mode).objectStore(store));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
export const getMeta = <T,>(key: string) => idb<T | undefined>("meta", "readonly", (s) => s.get(key)).catch(() => undefined);
export const setMeta = (key: string, v: unknown) => idb("meta", "readwrite", (s) => s.put(v, key)).catch(() => undefined);

// ── escolha da pasta ─────────────────────────────────────────────────────────
async function storedHandle(): Promise<PermHandle | null> {
  try { return ((await idb<FileSystemDirectoryHandle | undefined>("handles", "readonly", (s) => s.get("dir"))) as PermHandle) ?? null; } catch { return null; }
}

/** Abre o seletor de pastas do sistema (só com clique do utilizador). */
export async function chooseFolder(): Promise<void> {
  const pick = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const h = await pick.call(window, { id: "kobosync-livros", mode: "readwrite" });
  await idb("handles", "readwrite", (s) => s.put(h, "dir"));
  window.dispatchEvent(new Event(LOCAL_EVENT));
}
/** Volta ao armazenamento privado da app (esquece a pasta; os ficheiros dela não são tocados). */
export async function forgetFolder(): Promise<void> {
  await idb("handles", "readwrite", (s) => s.delete("dir"));
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/** Estado atual; com `interactive` (dentro de um clique) pede a permissão que falta. */
export async function getBackend(interactive = false): Promise<BackendState> {
  const h = await storedHandle();
  if (h) {
    let perm = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    if (perm !== "granted" && interactive) perm = (await h.requestPermission?.({ mode: "readwrite" })) ?? "denied";
    if (perm === "granted") return { status: "ready", backend: { kind: "folder", label: h.name, key: `dir:${h.name}`, root: h } };
    return { status: "needs-permission", label: h.name };
  }
  if (opfsSupported()) {
    const root = await navigator.storage.getDirectory();
    const books = await root.getDirectoryHandle("livros", { create: true });
    try { await navigator.storage.persist?.(); } catch { /* opcional */ }
    return { status: "ready", backend: { kind: "private", label: "Armazenamento da app", key: "opfs", root: books } };
  }
  return { status: "unsupported" };
}

// ── ficheiros ────────────────────────────────────────────────────────────────
const isEpub = (n: string) => /\.epub$/i.test(n);

export async function listEntries(b: Backend): Promise<LocalEntry[]> {
  const out: LocalEntry[] = [];
  async function walk(dir: PermHandle, prefix: string, depth: number) {
    for await (const h of dir.values()) {
      if (h.kind === "file" && isEpub(h.name)) {
        const f = await (h as FileSystemFileHandle).getFile();
        out.push({ path: prefix + h.name, name: h.name, size: f.size, modified: f.lastModified });
      } else if (h.kind === "directory" && depth < 2 && !h.name.startsWith(".")) {
        await walk(h as PermHandle, `${prefix}${h.name}/`, depth + 1);
      }
    }
  }
  await walk(b.root as PermHandle, "", 0);
  return out.sort((a, c) => a.name.localeCompare(c.name, "pt"));
}

async function dirOf(b: Backend, path: string, create = false): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() as string;
  let dir = b.root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return { dir, name };
}

export async function readLocal(b: Backend, path: string): Promise<File> {
  const { dir, name } = await dirOf(b, path);
  return (await dir.getFileHandle(name)).getFile();
}

const safeName = (n: string) => n.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "livro.epub";

/** Grava um EPUB na raiz da pasta, sem substituir ficheiros que já existam. Devolve o caminho final. */
export async function writeLocal(b: Backend, fileName: string, data: Blob): Promise<string> {
  let name = safeName(fileName);
  if (!isEpub(name)) name += ".epub";
  const base = name.replace(/\.epub$/i, "");
  for (let i = 2; ; i++) {
    try { await b.root.getFileHandle(name); name = `${base} (${i}).epub`; } catch { break; }
  }
  const w = await (await b.root.getFileHandle(name, { create: true })).createWritable();
  await w.write(data);
  await w.close();
  window.dispatchEvent(new Event(LOCAL_EVENT));
  return name;
}

export async function removeLocal(b: Backend, path: string): Promise<void> {
  const { dir, name } = await dirOf(b, path);
  await dir.removeEntry(name);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export const localId = (path: string) => `local:${path}`;
export const readerHref = (path: string) => `/offline/read?f=${encodeURIComponent(path)}`;

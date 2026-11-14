/**
 * Armazenamento local (localStorage) com eventos, para partilhar estado entre
 * componentes, separadores e a sincronização na nuvem.
 */
export type Domain =
  | "positions"
  | "readingList"
  | "settings"
  | "bookmarks"
  | "highlights"
  | "collections"
  | "selection"
  | "koboSent"
  | "darkMode"
  | "viewMode"
  | "density";

export const LOCAL_CHANGE_EVENT = "kobosync:local-changed";
const TS_PREFIX = "kobosync:ts:";

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota cheia ou modo privado — ignora
  }
}

export function getDomainTs(domain: Domain): number {
  return readJSON<number>(TS_PREFIX + domain, 0);
}

export function setDomainTs(domain: Domain, ts: number): void {
  writeJSON(TS_PREFIX + domain, ts);
}

/** Marca um domínio como alterado localmente (o cloud-sync envia-o). */
export function markChanged(domain: Domain): void {
  setDomainTs(domain, Date.now());
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail: { domain } }));
  } catch {}
}

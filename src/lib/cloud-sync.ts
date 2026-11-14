import {
  LOCAL_CHANGE_EVENT,
  getDomainTs,
  markChanged,
  readJSON,
  setDomainTs,
  writeJSON,
  type Domain,
} from "./local-store";
import { SETTINGS_EVENT } from "./reader-settings";
import { READING_EVENT } from "./reading-progress";
import { adoptUser } from "./user-session";

/**
 * Sincroniza dados pessoais entre dispositivos (via /api/userdata → Firestore).
 * Regra: por domínio ganha a alteração mais recente; as posições de leitura são
 * fundidas livro a livro (ganha a mais recente de cada livro).
 */

const POS_PREFIX = "kobosync:reading:";
type Position = { scrollTop: number; ratio: number | null; timestamp: number };

const KEYS: Record<Exclude<Domain, "positions">, string> = {
  readingList: "kobosync:reading-list",
  settings: "kobosync:reader-settings",
  bookmarks: "kobosync:bookmarks",
  highlights: "kobosync:highlights",
  collections: "kobosync:collections",
  selection: "kobosync:selection",
  koboSent: "kobosync:kobo-sent",
  darkMode: "kobosync:dark",
  viewMode: "kobosync:view-mode",
  density: "kobosync:density",
};

export const ALL_DOMAINS: Domain[] = ["positions", ...(Object.keys(KEYS) as Array<keyof typeof KEYS>)];

function collectPositions(): Record<string, Position> {
  const out: Record<string, Position> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(POS_PREFIX)) continue;
      const v = readJSON<Position | null>(k, null);
      if (v && typeof v.scrollTop === "number") out[k.slice(POS_PREFIX.length)] = v;
    }
  } catch {}
  return out;
}

function readDomain(domain: Domain): unknown {
  return domain === "positions" ? collectPositions() : readJSON<unknown>(KEYS[domain], null);
}

function applyDomain(domain: Domain, data: unknown): void {
  if (domain === "positions") {
    const remote = (data ?? {}) as Record<string, Position>;
    const local = collectPositions();
    for (const [id, pos] of Object.entries(remote)) {
      if (!local[id] || (pos.timestamp ?? 0) > (local[id].timestamp ?? 0)) writeJSON(POS_PREFIX + id, pos);
    }
  } else if (data !== null && data !== undefined) {
    writeJSON(KEYS[domain], data);
  }
  try {
    window.dispatchEvent(new Event(READING_EVENT));
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    window.dispatchEvent(new CustomEvent("kobosync:remote-applied", { detail: { domain } }));
  } catch {}
}

async function push(domain: Domain): Promise<void> {
  const res = await fetch("/api/userdata", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, data: readDomain(domain), updatedAt: getDomainTs(domain) || Date.now() }),
  });
  if (!res.ok) throw new Error(`push ${domain}: HTTP ${res.status}`);
}

type Remote = Record<string, { data: unknown; updatedAt: number }>;

async function pull(): Promise<void> {
  const res = await fetch("/api/userdata", { cache: "no-store" });
  if (!res.ok) return;
  const { state } = (await res.json()) as { state: Remote };
  const toPush: Domain[] = [];

  for (const domain of ALL_DOMAINS) {
    const remote = state?.[domain];
    const localTs = getDomainTs(domain);
    if (remote && remote.updatedAt > localTs) {
      applyDomain(domain, remote.data);
      setDomainTs(domain, remote.updatedAt);
      // As posições foram fundidas: se o local tinha livros mais recentes, envia de volta
      if (domain === "positions") toPush.push(domain);
    } else if (localTs > (remote?.updatedAt ?? 0)) {
      toPush.push(domain);
    } else if (!remote && readDomain(domain) && localTs === 0) {
      // Primeira sincronização com dados antigos: marca como alterado para enviar
      const data = readDomain(domain);
      const empty = data === null || (typeof data === "object" && Object.keys(data as object).length === 0);
      if (!empty) {
        setDomainTs(domain, Date.now());
        toPush.push(domain);
      }
    }
  }
  for (const d of toPush) await push(d);
}

/** Sincroniza já (usado antes de mudar de utilizador). */
export async function syncNow(): Promise<void> {
  await pull();
}

/** Garante que os dados locais são do utilizador autenticado; se não forem, recomeça limpo. */
async function ensureUser(): Promise<boolean> {
  try {
    const d = await (await fetch("/api/auth/status", { cache: "no-store" })).json();
    if (d.user?.id && adoptUser(d.user.id)) {
      window.location.reload();
      return false;
    }
  } catch {}
  return true;
}

let started = false;

export function startCloudSync(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const dirty = new Set<Domain>();
  let timer: number | undefined;
  let busy = false;

  const flush = async () => {
    if (busy || dirty.size === 0) return;
    busy = true;
    const batch = [...dirty];
    dirty.clear();
    try {
      for (const d of batch) await push(d);
    } catch {
      batch.forEach((d) => dirty.add(d)); // tenta de novo no próximo ciclo
    } finally {
      busy = false;
    }
  };

  const schedule = (domain: Domain) => {
    dirty.add(domain);
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 5000);
  };

  const onLocal = (e: Event) => schedule((e as CustomEvent<{ domain: Domain }>).detail.domain);
  const onVisible = () => {
    if (document.visibilityState === "visible") pull().catch(() => {});
    else flush();
  };

  window.addEventListener(LOCAL_CHANGE_EVENT, onLocal);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pagehide", flush);
  ensureUser().then((ok) => { if (ok) pull().catch(() => {}); });

  return () => {
    started = false;
    window.removeEventListener(LOCAL_CHANGE_EVENT, onLocal);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pagehide", flush);
  };
}

export { markChanged };

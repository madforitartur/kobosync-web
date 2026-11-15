import { getDb } from "./admin";
import { getUser } from "./users";

/**
 * Registo de atividade (só o administrador o vê). Cada evento é um documento
 * em `activity`; os mais antigos que RETENTION_DAYS são apagados aos poucos.
 */
export type ActivityType = "login" | "login_failed" | "logout" | "read" | "download" | "kobo_send" | "kobo_download" | "search";

export type ActivityEvent = {
  uid: string;
  name: string;
  type: ActivityType;
  ts: number;
  bookId?: string;
  title?: string;
  detail?: string;
  device?: string;
};

const COL = "activity";
const RETENTION_DAYS = 90;
const nameCache = new Map<string, { name: string; until: number }>();
const recent = new Map<string, number>();

async function nameOf(uid: string): Promise<string> {
  const hit = nameCache.get(uid);
  if (hit && hit.until > Date.now()) return hit.name;
  const name = (await getUser(uid).catch(() => null))?.name ?? uid;
  nameCache.set(uid, { name, until: Date.now() + 60_000 });
  return name;
}

/** Aparelho a partir do User-Agent (curto e legível). */
export function deviceFrom(ua: string | null | undefined): string {
  if (!ua) return "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Kobo/i.test(ua) ? "Kobo" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Outro";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}

/** Regista um evento sem nunca falhar o pedido. `dedupeMs` evita repetições (ex.: abrir o mesmo livro). */
export async function logActivity(e: Omit<ActivityEvent, "ts" | "name">, dedupeMs = 0): Promise<void> {
  try {
    if (dedupeMs) {
      const key = `${e.uid}|${e.type}|${e.bookId ?? ""}|${e.detail ?? ""}`;
      if ((recent.get(key) ?? 0) > Date.now() - dedupeMs) return;
      recent.set(key, Date.now());
      if (recent.size > 2000) recent.clear();
    }
    const doc: ActivityEvent = { ...e, name: await nameOf(e.uid), ts: Date.now() };
    for (const k of Object.keys(doc) as (keyof ActivityEvent)[]) if (doc[k] === undefined || doc[k] === "") delete doc[k];
    await getDb().collection(COL).add(doc);
    if (e.type === "login") void purgeOld();
  } catch {
    /* o registo nunca deve estragar a operação principal */
  }
}

async function purgeOld() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    const snap = await getDb().collection(COL).where("ts", "<", cutoff).limit(200).get();
    if (snap.empty) return;
    const batch = getDb().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch {}
}

export async function listActivity(limit = 500): Promise<ActivityEvent[]> {
  const snap = await getDb().collection(COL).orderBy("ts", "desc").limit(Math.min(limit, 1500)).get();
  return snap.docs.map((d) => d.data() as ActivityEvent);
}

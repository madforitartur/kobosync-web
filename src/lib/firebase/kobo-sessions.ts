import { randomBytes } from "crypto";
import { getDb } from "./admin";

/**
 * Sessões de transferência para o e-reader (estilo BookDrop).
 * O Kobo abre /receber e recebe um código curto; a app envia livros para esse
 * código e o Kobo mostra os links de download. Só metadados: os EPUBs saem do
 * Drive no momento do download.
 */
const COL = "kobo_sessions";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I
const TTL_MS = 45 * 60_000;
const MAX_FILES = 100;

export type KoboFile = { id: string; title: string; filename: string };
type Session = { secret: string; createdAt: number; expiresAt: number; files: KoboFile[] };

export const normalizeCode = (c: unknown) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

const newCode = () => Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join("");

async function purgeExpired() {
  const db = getDb();
  const snap = await db.collection(COL).where("expiresAt", "<", Date.now()).limit(50).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function createSession(): Promise<{ code: string; secret: string }> {
  const db = getDb();
  await purgeExpired().catch(() => {});
  const secret = randomBytes(18).toString("base64url");
  for (let i = 0; i < 12; i++) {
    const code = newCode();
    const ref = db.collection(COL).doc(code);
    const now = Date.now();
    const ok = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (cur.exists && (cur.data() as Session).expiresAt > now) return false;
      tx.set(ref, { secret, createdAt: now, expiresAt: now + TTL_MS, files: [] } satisfies Session);
      return true;
    });
    if (ok) return { code, secret };
  }
  throw new Error("Não foi possível gerar um código");
}

export async function getSession(code: string, secret?: string): Promise<Session | null> {
  const c = normalizeCode(code);
  if (c.length !== 4) return null;
  const snap = await getDb().collection(COL).doc(c).get();
  if (!snap.exists) return null;
  const s = snap.data() as Session;
  if (s.expiresAt < Date.now()) return null;
  if (secret !== undefined && s.secret !== secret) return null;
  return s;
}

/** Mantém a sessão viva enquanto o Kobo tem a página aberta. */
export async function touchSession(code: string, s: Session) {
  const now = Date.now();
  if (s.expiresAt - now > TTL_MS - 5 * 60_000) return;
  await getDb().collection(COL).doc(normalizeCode(code)).update({ expiresAt: now + TTL_MS }).catch(() => {});
}

export async function addFiles(code: string, files: KoboFile[]): Promise<{ added: number; total: number } | null> {
  const ref = getDb().collection(COL).doc(normalizeCode(code));
  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const s = snap.data() as Session;
    if (s.expiresAt < Date.now()) return null;
    const have = new Set(s.files.map((f) => f.id));
    const fresh = files.filter((f) => !have.has(f.id));
    const next = [...s.files, ...fresh].slice(0, MAX_FILES);
    tx.update(ref, { files: next, expiresAt: Math.max(s.expiresAt, Date.now() + TTL_MS) });
    return { added: next.length - s.files.length, total: next.length };
  });
}

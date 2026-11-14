import { ADMIN_ID } from "@/lib/auth";
import { getDb } from "./admin";

/**
 * Dados pessoais (posição de leitura, marcadores, destaques, coleções, seleção…)
 * num único documento: userdata/state → 1 leitura / 1 escrita por sincronização.
 * Cada domínio guarda { data, updatedAt } (a mais recente ganha).
 */
export type DomainDoc = { data: unknown; updatedAt: number };
export type UserState = Record<string, DomainDoc>;

export const DOMAINS = [
  "positions",
  "readingList",
  "settings",
  "bookmarks",
  "highlights",
  "collections",
  "selection",
  "koboSent",
  "darkMode",
  "viewMode",
  "density",
] as const;
export type Domain = (typeof DOMAINS)[number];

const MAX_BYTES = 900_000; // limite do Firestore: 1 MiB por documento

/** O administrador mantém o documento que já existia; os outros têm o seu. */
const ref = (uid: string) => (uid === ADMIN_ID ? getDb().collection("userdata").doc("state") : getDb().collection("userdata_u").doc(uid));

export async function readUserState(uid: string): Promise<UserState> {
  const snap = await ref(uid).get();
  return (snap.exists ? (snap.data() as UserState) : {}) ?? {};
}

export async function writeDomain(uid: string, domain: Domain, data: unknown, updatedAt: number): Promise<void> {
  const size = Buffer.byteLength(JSON.stringify(data ?? null));
  if (size > MAX_BYTES) throw new Error(`Dados de "${domain}" demasiado grandes (${size} bytes).`);
  await ref(uid).set({ [domain]: { data, updatedAt } }, { merge: true });
}

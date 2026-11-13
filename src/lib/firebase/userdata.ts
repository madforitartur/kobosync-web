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
] as const;
export type Domain = (typeof DOMAINS)[number];

const MAX_BYTES = 900_000; // limite do Firestore: 1 MiB por documento

const ref = () => getDb().collection("userdata").doc("state");

export async function readUserState(): Promise<UserState> {
  const snap = await ref().get();
  return (snap.exists ? (snap.data() as UserState) : {}) ?? {};
}

export async function writeDomain(domain: Domain, data: unknown, updatedAt: number): Promise<void> {
  const size = Buffer.byteLength(JSON.stringify(data ?? null));
  if (size > MAX_BYTES) throw new Error(`Dados de "${domain}" demasiado grandes (${size} bytes).`);
  await ref().set({ [domain]: { data, updatedAt } }, { merge: true });
}

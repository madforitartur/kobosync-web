import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { ADMIN_ID } from "@/lib/auth";
import { getDb } from "./admin";

/**
 * Perfis de utilizador. O administrador ("admin") usa o APP_PIN e os dados que a
 * app já tinha (userdata/state); os restantes têm PIN próprio (hash scrypt) e
 * dados em userdata_u/{id}. A biblioteca e as capas são partilhadas.
 */
export type PublicUser = { id: string; name: string; role: "admin" | "user"; createdAt: number };
type UserDoc = { name: string; pinHash?: string; createdAt: number };

export const MAX_USERS = 20; // sem contar o administrador
const COL = "users";

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export const validPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4,12}$/.test(pin);
export const cleanName = (n: unknown) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 30);

const toPublic = (id: string, d: UserDoc): PublicUser => ({ id, name: d.name, role: id === ADMIN_ID ? "admin" : "user", createdAt: d.createdAt });

export async function getAdminName(): Promise<string> {
  const snap = await getDb().collection(COL).doc(ADMIN_ID).get();
  return (snap.data() as UserDoc | undefined)?.name ?? "Administrador";
}

export async function listUsers(): Promise<PublicUser[]> {
  const snap = await getDb().collection(COL).get();
  const users = snap.docs.filter((d) => d.id !== ADMIN_ID).map((d) => toPublic(d.id, d.data() as UserDoc));
  users.sort((a, b) => a.createdAt - b.createdAt);
  return [{ id: ADMIN_ID, name: await getAdminName(), role: "admin", createdAt: 0 }, ...users];
}

export async function getUser(id: string): Promise<(PublicUser & { pinHash?: string }) | null> {
  if (id === ADMIN_ID) return { id, name: await getAdminName(), role: "admin", createdAt: 0 };
  const snap = await getDb().collection(COL).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as UserDoc;
  return { ...toPublic(id, d), pinHash: d.pinHash };
}

const cache = new Map<string, number>();
/** Existe (com cache curta): evita uma leitura por pedido. */
export async function userExists(id: string): Promise<boolean> {
  if (id === ADMIN_ID) return true;
  const hit = cache.get(id);
  if (hit && hit > Date.now()) return true;
  const ok = !!(await getUser(id));
  if (ok) cache.set(id, Date.now() + 30_000);
  return ok;
}

export async function createUser(name: string, pin: string): Promise<PublicUser> {
  const users = await listUsers();
  if (users.length - 1 >= MAX_USERS) throw new Error(`Limite de ${MAX_USERS} utilizadores atingido.`);
  if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) throw new Error("Já existe um utilizador com esse nome.");
  const createdAt = Date.now();
  const ref = getDb().collection(COL).doc();
  await ref.set({ name, pinHash: hashPin(pin), createdAt } satisfies UserDoc);
  return toPublic(ref.id, { name, createdAt });
}

export async function updateUser(id: string, patch: { name?: string; pin?: string }): Promise<void> {
  const ref = getDb().collection(COL).doc(id);
  const data: Partial<UserDoc> = {};
  if (patch.name) {
    const others = (await listUsers()).filter((u) => u.id !== id);
    if (others.some((u) => u.name.toLowerCase() === patch.name!.toLowerCase())) throw new Error("Já existe um utilizador com esse nome.");
    data.name = patch.name;
  }
  if (patch.pin) data.pinHash = hashPin(patch.pin);
  if (id === ADMIN_ID) await ref.set({ createdAt: 0, name: patch.name ?? (await getAdminName()) }, { merge: true });
  else await ref.update(data);
  cache.delete(id);
}

export async function deleteUser(id: string): Promise<void> {
  if (id === ADMIN_ID) throw new Error("O administrador não pode ser apagado.");
  const db = getDb();
  await db.collection(COL).doc(id).delete();
  await db.collection("userdata_u").doc(id).delete().catch(() => {});
  await db.collection("authAttempts").doc(id).delete().catch(() => {});
  cache.delete(id);
}

// ── Proteção contra tentativas de PIN (por perfil) ──────────────────────────
const MAX_TRIES = 5;
const LOCK_MS = 10 * 60_000;

export async function lockedFor(id: string): Promise<number> {
  const snap = await getDb().collection("authAttempts").doc(id).get();
  const until = (snap.data() as { lockedUntil?: number } | undefined)?.lockedUntil ?? 0;
  return Math.max(0, until - Date.now());
}

export async function recordFailure(id: string): Promise<void> {
  const ref = getDb().collection("authAttempts").doc(id);
  await getDb().runTransaction(async (tx) => {
    const d = ((await tx.get(ref)).data() ?? {}) as { count?: number; first?: number };
    const fresh = !d.first || Date.now() - d.first > LOCK_MS;
    const count = fresh ? 1 : (d.count ?? 0) + 1;
    tx.set(ref, { count, first: fresh ? Date.now() : d.first, lockedUntil: count >= MAX_TRIES ? Date.now() + LOCK_MS : 0 });
  });
}

export async function clearFailures(id: string): Promise<void> {
  await getDb().collection("authAttempts").doc(id).delete().catch(() => {});
}

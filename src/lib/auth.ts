/**
 * Autenticação multi-utilizador.
 *
 * - APP_PIN (Vercel) é o PIN do administrador (perfil fixo "admin"). Sem APP_PIN
 *   a app fica aberta e tudo corre como administrador (modo de um só utilizador).
 * - Os outros perfis são criados pelo administrador em /definicoes, cada um com o
 *   seu PIN (guardado só como hash no Firestore).
 * - A sessão é um cookie assinado (HMAC-SHA256) com o id do utilizador e a validade;
 *   não precisa de base de dados, por isso funciona no proxy.
 * - AUTH_SECRET (opcional) reforça a assinatura; por omissão usa o APP_PIN.
 * Só Web Crypto: corre no proxy e nas rotas Node.
 */
export const AUTH_COOKIE = "kobosync_session";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 90; // 90 dias
export const ADMIN_ID = "admin";
export const USER_HEADER = "x-user-id";

export function getPin(): string | undefined {
  const pin = process.env.APP_PIN?.trim();
  return pin ? pin : undefined;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(payload: string): Promise<string> {
  const keyMaterial = `kobosync:v2:${process.env.AUTH_SECRET?.trim() ?? ""}:${getPin() ?? ""}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(keyMaterial), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** Comparação em tempo constante (evita ataques de temporização). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(uid: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + AUTH_MAX_AGE;
  const payload = `${uid}.${exp}`;
  return `${payload}.${await sign(payload)}`;
}

/** Devolve o id do utilizador se o cookie for válido e não tiver expirado. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(uid) || !(Number(exp) > Date.now() / 1000)) return null;
  return safeEqual(sig, await sign(`${uid}.${exp}`)) ? uid : null;
}

/**
 * Autenticação simples por PIN único (app pessoal).
 *
 * - Define APP_PIN no Vercel para proteger a app. Sem APP_PIN a app fica aberta
 *   (compatível com o comportamento anterior).
 * - AUTH_SECRET (opcional) reforça o token do cookie; por omissão usa o próprio PIN.
 * - Usa só Web Crypto, por isso funciona no proxy (edge) e nas rotas Node.
 */
export const AUTH_COOKIE = "kobosync_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 90; // 90 dias

export function getPin(): string | undefined {
  const pin = process.env.APP_PIN?.trim();
  return pin ? pin : undefined;
}

export async function tokenFor(pin: string): Promise<string> {
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  const data = new TextEncoder().encode(`kobosync:v1:${pin}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante (evita ataques de temporização). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  const pin = getPin();
  if (!pin) return true; // proteção desligada
  if (!token) return false;
  return safeEqual(token, await tokenFor(pin));
}

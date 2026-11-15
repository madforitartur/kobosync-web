/**
 * Dados locais por utilizador. Como o localStorage é partilhado pelo aparelho,
 * ao mudar de perfil apagamos tudo o que é pessoal (posições, marcadores,
 * seleção, definições…) e o cloud-sync traz os dados do novo perfil.
 */
const CURRENT_KEY = "kobosync:current-user";

export function wipeLocalUserData(): void {
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("kobosync:") && k !== CURRENT_KEY) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

/** Regista o utilizador deste aparelho; devolve true se mudou (e limpou os dados locais). */
export function adoptUser(uid: string): boolean {
  try {
    const prev = localStorage.getItem(CURRENT_KEY);
    if (prev === uid) return false;
    wipeLocalUserData();
    localStorage.setItem(CURRENT_KEY, uid);
    return prev !== null;
  } catch {
    return false;
  }
}

/** Envia o que falta para a nuvem, termina a sessão e limpa os dados locais. */
export async function logoutAndWipe(): Promise<void> {
  try {
    const m = await import("./cloud-sync");
    await Promise.race([m.syncNow(), new Promise((r) => setTimeout(r, 4000))]);
  } catch {}
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  wipeLocalUserData();
  try { localStorage.removeItem(CURRENT_KEY); } catch {}
  window.location.href = "/login";
}

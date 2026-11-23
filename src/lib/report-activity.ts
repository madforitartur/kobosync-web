/** Comunica ao servidor uma ação feita no aparelho (conversão, offline…) para o registo de atividade do administrador. */
export function reportActivity(action: "pdf_convert" | "offline_save" | "read_offline", info: { bookId?: string; title?: string; detail?: string } = {}): void {
  try {
    fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...info }), keepalive: true }).catch(() => {});
  } catch { /* sem registo, mas nunca estraga a ação */ }
}

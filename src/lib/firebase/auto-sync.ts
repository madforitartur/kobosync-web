import { getDb } from "./admin";

const doc = () => getDb().collection("config").doc("auto_sync");

/**
 * Reserva a próxima sincronização automática: devolve true se já passou `minMs` desde a última
 * (e regista logo a hora, para que vários utilizadores a abrir a app ao mesmo tempo só disparem uma).
 */
export async function claimAutoSync(minMs: number): Promise<boolean> {
  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(doc());
    const at = snap.exists ? Number(snap.data()?.at) || 0 : 0;
    if (Date.now() - at < minMs) return false;
    tx.set(doc(), { at: Date.now() });
    return true;
  });
}

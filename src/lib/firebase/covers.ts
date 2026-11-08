import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin";

/**
 * Capas guardadas no Firestore numa coleção SEPARADA ("covers"), um documento
 * por livro (id = id do livro), com o JPEG já comprimido (~15–30 KB).
 *
 * Ficam fora dos documentos "books" para que a leitura da lista de livros
 * continue leve. As capas só são lidas quando o browser as pede, e a rota
 * /api/books/[id]/cover responde com cache longo (o browser/CDN guarda-as).
 */
const COLLECTION = "covers";
const MAX_BYTES = 900 * 1024; // limite do Firestore por documento é 1 MiB

export async function saveCover(bookId: string, data: Buffer, mimeType: string): Promise<void> {
  if (data.length > MAX_BYTES) {
    throw new Error(`Capa demasiado grande (${Math.round(data.length / 1024)} KB)`);
  }
  await getDb().collection(COLLECTION).doc(bookId).set({
    data,
    mime: mimeType,
    size: data.length,
    updated_at: FieldValue.serverTimestamp(),
  });
}

export async function getCover(bookId: string): Promise<{ data: Buffer; mime: string } | null> {
  const snap = await getDb().collection(COLLECTION).doc(bookId).get();
  if (!snap.exists) return null;
  const doc = snap.data()!;
  return { data: Buffer.from(doc.data), mime: doc.mime ?? "image/jpeg" };
}

/** IDs de livros que têm capa guardada (lê só os IDs, sem os bytes). */
export async function listCoverIds(): Promise<Set<string>> {
  const snap = await getDb().collection(COLLECTION).select().get();
  return new Set(snap.docs.map((d) => d.id));
}

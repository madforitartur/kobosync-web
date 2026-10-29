import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin";

const COLLECTION = "sync_state";

export type SyncState = {
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  total_books: number;
  processed: number;
  success: number;
  failed: number;
  current_batch: number;
  total_batches: number;
  errors: Array<{ bookId: string; title?: string; reason: string }>;
};

const EMPTY_STATE: SyncState = {
  running: false,
  started_at: null,
  finished_at: null,
  total_books: 0,
  processed: 0,
  success: 0,
  failed: 0,
  current_batch: 0,
  total_batches: 0,
  errors: [],
};

/** docId: "books" para o sync da biblioteca, "covers" para o sync de capas */
export async function getSyncState(docId: "books" | "covers"): Promise<SyncState | null> {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(docId).get();
  if (!snap.exists) return null;
  return { ...EMPTY_STATE, ...(snap.data() as Partial<SyncState>) };
}

export async function startSyncState(
  docId: "books" | "covers",
  totalBooks: number,
  totalBatches = 0,
): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTION).doc(docId).set({
    running: true,
    started_at: new Date().toISOString(),
    finished_at: null,
    total_books: totalBooks,
    processed: 0,
    success: 0,
    failed: 0,
    current_batch: 0,
    total_batches: totalBatches,
    errors: [],
  });
}

export async function finishSyncState(docId: "books" | "covers"): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTION).doc(docId).set(
    {
      running: false,
      finished_at: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** Incrementa contadores de forma atómica — seguro para escrita concorrente entre batches. */
export async function bumpSyncProgress(
  docId: "books" | "covers",
  delta: { processed?: number; success?: number; failed?: number; currentBatch?: number },
  newErrors: Array<{ bookId: string; title?: string; reason: string }> = [],
): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(docId);

  const update: Record<string, unknown> = {};
  if (delta.processed) update.processed = FieldValue.increment(delta.processed);
  if (delta.success) update.success = FieldValue.increment(delta.success);
  if (delta.failed) update.failed = FieldValue.increment(delta.failed);
  if (delta.currentBatch !== undefined) update.current_batch = delta.currentBatch;
  if (newErrors.length > 0) update.errors = FieldValue.arrayUnion(...newErrors);

  await ref.set(update, { merge: true });
}

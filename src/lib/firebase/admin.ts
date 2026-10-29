import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getServerConfig } from "@/lib/env";

let app: App | null = null;
let db: Firestore | null = null;

function getApp(): App {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  const config = getServerConfig();

  app = initializeApp({
    credential: cert({
      projectId: config.firebaseProjectId,
      clientEmail: config.firebaseClientEmail,
      privateKey: config.firebasePrivateKey,
    }),
  });

  return app;
}

/** Firestore singleton — reutilizado entre pedidos na mesma instância serverless. */
export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getApp());
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

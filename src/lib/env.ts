import { readFileSync } from "node:fs";

const optional = (name: string) => process.env[name]?.trim();

export function requireEnv(name: string) {
  const value = optional(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function readServiceAccountFile(path?: string): {
  client_email?: string;
  private_key?: string;
  project_id?: string;
} | null {
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Configuração da conta de serviço Google usada para LER os EPUBs
 * (a Drive onde está a biblioteca).
 */
function getBooksDriveConfig() {
  const serviceAccount = readServiceAccountFile(optional("GOOGLE_SERVICE_ACCOUNT_JSON_PATH"));

  return {
    clientEmail:
      optional("GOOGLE_CLIENT_EMAIL") ?? serviceAccount?.client_email ?? requireEnv("GOOGLE_CLIENT_EMAIL"),
    privateKey: (
      optional("GOOGLE_PRIVATE_KEY") ?? serviceAccount?.private_key ?? requireEnv("GOOGLE_PRIVATE_KEY")
    ).replace(/\\n/g, "\n"),
    sharedDriveId: optional("GOOGLE_SHARED_DRIVE_ID"),
    folderId: optional("GOOGLE_DRIVE_FOLDER_ID"),
  };
}

/**
 * Configuração da conta de serviço Google (conta DIFERENTE, à escolha)
 * usada para GUARDAR as capas extraídas dos EPUBs.
 * Se não estiver configurada, cai automaticamente na mesma conta dos livros.
 */
function getCoversDriveConfig() {
  const serviceAccount = readServiceAccountFile(optional("GOOGLE_COVERS_SERVICE_ACCOUNT_JSON_PATH"));

  const clientEmail = optional("GOOGLE_COVERS_CLIENT_EMAIL") ?? serviceAccount?.client_email;
  const privateKey = optional("GOOGLE_COVERS_PRIVATE_KEY") ?? serviceAccount?.private_key;
  const folderId = optional("GOOGLE_COVERS_FOLDER_ID");

  if (!clientEmail || !privateKey || !folderId) {
    // Sem configuração dedicada — usa a conta dos livros como fallback.
    const books = getBooksDriveConfig();
    return {
      clientEmail: books.clientEmail,
      privateKey: books.privateKey,
      sharedDriveId: optional("GOOGLE_COVERS_SHARED_DRIVE_ID") ?? books.sharedDriveId,
      folderId: folderId ?? books.folderId,
    };
  }

  return {
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    sharedDriveId: optional("GOOGLE_COVERS_SHARED_DRIVE_ID"),
    folderId,
  };
}

function getFirebaseConfig() {
  const serviceAccount = readServiceAccountFile(optional("FIREBASE_SERVICE_ACCOUNT_JSON_PATH"));

  return {
    projectId:
      optional("FIREBASE_PROJECT_ID") ?? serviceAccount?.project_id ?? requireEnv("FIREBASE_PROJECT_ID"),
    clientEmail:
      optional("FIREBASE_CLIENT_EMAIL") ?? serviceAccount?.client_email ?? requireEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: (
      optional("FIREBASE_PRIVATE_KEY") ?? serviceAccount?.private_key ?? requireEnv("FIREBASE_PRIVATE_KEY")
    ).replace(/\\n/g, "\n"),
  };
}

export function getServerConfig() {
  const books = getBooksDriveConfig();
  const covers = getCoversDriveConfig();
  const firebase = getFirebaseConfig();

  return {
    firebaseProjectId: firebase.projectId,
    firebaseClientEmail: firebase.clientEmail,
    firebasePrivateKey: firebase.privateKey,

    googleClientEmail: books.clientEmail,
    googlePrivateKey: books.privateKey,
    googleSharedDriveId: books.sharedDriveId,
    googleDriveFolderId: books.folderId,

    coversClientEmail: covers.clientEmail,
    coversPrivateKey: covers.privateKey,
    coversSharedDriveId: covers.sharedDriveId,
    coversFolderId: covers.folderId,
  };
}

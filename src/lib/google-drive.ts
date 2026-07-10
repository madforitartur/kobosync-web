const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface ServiceAccountToken {
  access_token: string;
  expires_in:   number;
}

export interface DriveFile {
  id:            string;
  name:          string;
  size?:         string;
  modifiedTime?: string;
  mimeType?:     string;
}

interface ListDriveEpubsParams {
  clientEmail:    string;
  privateKey:     string;
  sharedDriveId?: string;
  folderId?:      string;
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss:   clientEmail,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud:   TOKEN_URL,
    iat:   now,
    exp:   now + 3600,
  })).toString("base64url");

  const unsigned = `${header}.${payload}`;
  const pemContents = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const keyBuffer = Buffer.from(pemContents, "base64");
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );

  const sig = Buffer.from(signature).toString("base64url");
  const jwt = `${unsigned}.${sig}`;

  const tokenRes = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData: ServiceAccountToken = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Drive auth failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

/**
 * Faz uma página de listagem do Drive e devolve ficheiros + nextPageToken.
 */
async function listPage(
  token:       string,
  query:       string,
  sharedDriveId?: string,
  pageToken?:  string,
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q:         query,
    fields:    "nextPageToken,files(id,name,size,modifiedTime,mimeType)",
    pageSize:  "1000",
    ...(sharedDriveId
      ? {
          driveId:                  sharedDriveId,
          includeItemsFromAllDrives:"true",
          supportsAllDrives:        "true",
          corpora:                  "drive",
        }
      : { includeItemsFromAllDrives: "true", supportsAllDrives: "true" }),
    ...(pageToken ? { pageToken } : {}),
  });

  const res  = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return { files: data.files ?? [], nextPageToken: data.nextPageToken };
}

/**
 * Lista todos os EPUBs acessíveis pela service account.
 *
 * Estratégia dupla para máxima cobertura:
 *
 * 1. Pesquisa por MIME type oficial  (application/epub+zip)
 * 2. Pesquisa por nome *.epub        (apanha ficheiros com mimeType=application/octet-stream
 *    ou outros tipos atribuídos automaticamente pelo Drive ao fazer upload via browser)
 *
 * Ambas as pesquisas são feitas com e sem folderId quando este está definido:
 *  - Com folderId: ficheiros directamente na pasta
 *  - Sem folderId mas filtrado pelo folderId via fullText: apanha subpastas
 *    (o Drive não suporta pesquisa recursiva em subpastas via `in parents`,
 *     mas sem filtro de pasta apanha toda a drive partilhada)
 *
 * Deduplicação por id no final.
 */
export async function listDriveEpubs(
  params: ListDriveEpubsParams,
): Promise<{ files: DriveFile[]; token: string }> {
  const { clientEmail, privateKey, sharedDriveId, folderId } = params;
  const token = await getAccessToken(clientEmail, privateKey);

  const allFiles = new Map<string, DriveFile>(); // id → file (dedup)

  // Queries a executar: combinações de MIME type + extensão, com e sem pasta
  // A query sem pasta apanha ficheiros em QUALQUER subpasta da drive partilhada
  const queries: string[] = [];

  const baseQueries = [
    `mimeType='application/epub+zip' and trashed=false`,
    `name contains '.epub' and trashed=false`,
  ];

  if (folderId) {
    // Com pasta: ficheiros directamente na pasta especificada
    for (const bq of baseQueries) {
      queries.push(`${bq} and '${folderId}' in parents`);
    }
    // Sem restrição de pasta: apanha subpastas e outros locais na drive
    for (const bq of baseQueries) {
      queries.push(bq);
    }
  } else {
    for (const bq of baseQueries) {
      queries.push(bq);
    }
  }

  // Executa todas as queries (com paginação)
  for (const query of queries) {
    let pageToken: string | undefined;
    do {
      try {
        const { files, nextPageToken } = await listPage(token, query, sharedDriveId, pageToken);
        for (const f of files) {
          // Só EPUBs reais: nome termina em .epub (case-insensitive)
          if (f.name.toLowerCase().endsWith(".epub") && !allFiles.has(f.id)) {
            allFiles.set(f.id, f);
          }
        }
        pageToken = nextPageToken;
      } catch (err) {
        console.error(`[Drive] Query failed: ${query}`, err);
        break;
      }
    } while (pageToken);
  }

  const files = Array.from(allFiles.values());
  console.log(`[Drive] Found ${files.length} EPUBs (${queries.length} queries)`);
  return { files, token };
}

/** Download completo de um ficheiro do Drive. */
export async function downloadFromDrive(fileId: string, token: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status} ${res.statusText}`);
  return res.arrayBuffer();
}

/** Download parcial (primeiros `bytes`) via HTTP Range request. */
export async function downloadFromDrivePartial(
  fileId: string,
  token:  string,
  bytes:  number,
): Promise<ArrayBuffer> {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${bytes - 1}` } },
  );
  if (res.status === 206 || res.status === 200) return res.arrayBuffer();
  throw new Error(`Drive partial download failed: ${res.status} ${res.statusText}`);
}

/** Download autenticado sem precisar de passar o token externamente. */
export async function downloadFromDriveWithConfig(fileId: string): Promise<ArrayBuffer> {
  const { getServerConfig } = await import("@/lib/env");
  const config = getServerConfig();
  const token  = await getAccessToken(config.googleClientEmail, config.googlePrivateKey);
  return downloadFromDrive(fileId, token);
}

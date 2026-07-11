const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

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
  const now     = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail, scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: TOKEN_URL,   iat: now, exp: now + 3600,
  })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const ck = await crypto.subtle.importKey(
    "pkcs8", Buffer.from(pem, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = Buffer.from(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", ck, new TextEncoder().encode(unsigned))
  ).toString("base64url");
  const jwt = `${unsigned}.${sig}`;
  const res  = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Parâmetros comuns para todas as chamadas à API do Drive
function driveParams(sharedDriveId?: string): Record<string, string> {
  return sharedDriveId
    ? { driveId: sharedDriveId, corpora: "drive", includeItemsFromAllDrives: "true", supportsAllDrives: "true" }
    : { includeItemsFromAllDrives: "true", supportsAllDrives: "true" };
}

/**
 * Lista todos os items (ficheiros ou pastas) dentro de uma pasta, com paginação.
 */
async function listChildren(
  token:         string,
  parentId:      string,
  mimeFilter:    string,  // e.g. "mimeType='application/vnd.google-apps.folder'" ou "mimeType!='...'"
  sharedDriveId?: string,
): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let   pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q:        `'${parentId}' in parents and ${mimeFilter} and trashed=false`,
      fields:   "nextPageToken,files(id,name,size,modifiedTime,mimeType)",
      pageSize: "1000",
      ...driveParams(sharedDriveId),
      ...(pageToken ? { pageToken } : {}),
    });

    const res  = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.error) throw new Error(`Drive API error: ${JSON.stringify(data.error)}`);
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}

/**
 * Lista todos os EPUBs de forma recursiva a partir de uma pasta raiz.
 *
 * Algoritmo BFS:
 * 1. Começa na pasta raiz (folderId)
 * 2. Lista todas as subpastas directas → adiciona à fila
 * 3. Lista todos os ficheiros EPUBs directos → adiciona ao resultado
 * 4. Repete para cada subpasta da fila
 *
 * Desta forma apanha EPUBs em qualquer nível de profundidade (A/autor/livro.epub, etc.)
 */
export async function listDriveEpubs(
  params: ListDriveEpubsParams,
): Promise<{ files: DriveFile[]; token: string }> {
  const { clientEmail, privateKey, sharedDriveId, folderId } = params;
  const token = await getAccessToken(clientEmail, privateKey);

  const allFiles = new Map<string, DriveFile>(); // dedup por id
  const FOLDER_MIME = "application/vnd.google-apps.folder";

  // Fila BFS de pastas a explorar
  const queue: string[] = folderId ? [folderId] : [];

  // Se não tiver folderId configurado, pesquisa global na drive
  if (!folderId) {
    const params2 = new URLSearchParams({
      q:        "name contains '.epub' and trashed=false",
      fields:   "nextPageToken,files(id,name,size,modifiedTime,mimeType)",
      pageSize: "1000",
      ...driveParams(sharedDriveId),
    });
    let pt: string | undefined;
    do {
      const res  = await fetch(`${DRIVE_API}/files?${params2}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      for (const f of (data.files ?? []) as DriveFile[]) {
        if (f.name.toLowerCase().endsWith(".epub")) allFiles.set(f.id, f);
      }
      pt = data.nextPageToken;
      if (pt) params2.set("pageToken", pt);
    } while (pt);

    const files = Array.from(allFiles.values());
    console.log(`[Drive] Global search: ${files.length} EPUBs`);
    return { files, token };
  }

  // BFS recursivo — 1 query por pasta (traz TUDO: subpastas + ficheiros)
  // Reduz de 3 queries/pasta para 1 query/pasta.
  let depth = 0;
  while (queue.length > 0 && depth < 10) {
    const batch = [...queue];
    queue.length = 0;
    depth++;

    // Processa até 20 pastas em paralelo
    for (let i = 0; i < batch.length; i += 20) {
      const chunk = batch.slice(i, i + 20);
      await Promise.all(chunk.map(async (parentId) => {
        try {
          // Uma única query por pasta: traz subpastas E ficheiros EPUB
          const all = await listChildren(
            token, parentId,
            `(mimeType='${FOLDER_MIME}' or mimeType='application/epub+zip' or name contains '.epub')`,
            sharedDriveId,
          );
          for (const item of all) {
            if (item.mimeType === FOLDER_MIME) {
              queue.push(item.id);
            } else if (item.name.toLowerCase().endsWith(".epub") && !allFiles.has(item.id)) {
              allFiles.set(item.id, item);
            }
          }
        } catch (err) {
          console.error(`[Drive] Error listing folder ${parentId}:`, err);
        }
      }));
    }

    console.log(`[Drive] Depth ${depth}: ${batch.length} folders → ${allFiles.size} EPUBs`);
  }

  const files = Array.from(allFiles.values());
  console.log(`[Drive] Total: ${files.length} EPUBs in ${depth} levels`);
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
  fileId: string, token: string, bytes: number,
): Promise<ArrayBuffer> {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${bytes - 1}` } },
  );
  if (res.status === 206 || res.status === 200) return res.arrayBuffer();
  throw new Error(`Drive partial download failed: ${res.status}`);
}

/** Download autenticado sem precisar de passar o token externamente. */
export async function downloadFromDriveWithConfig(fileId: string): Promise<ArrayBuffer> {
  const { getServerConfig } = await import("@/lib/env");
  const config = getServerConfig();
  const token  = await getAccessToken(config.googleClientEmail, config.googlePrivateKey);
  return downloadFromDrive(fileId, token);
}

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface ServiceAccountToken {
  access_token: string;
  expires_in: number;
}

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
}

interface ListDriveEpubsParams {
  clientEmail: string;
  privateKey: string;
  sharedDriveId?: string;
  folderId?: string;
}

// Gera um JWT e obtém um access token para a service account
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
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
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData: ServiceAccountToken = await tokenRes.json();
  return tokenData.access_token;
}

// Lista todos os EPUBs numa pasta do Google Drive
export async function listDriveEpubs(params: ListDriveEpubsParams): Promise<{ files: DriveFile[]; token: string }> {
  const { clientEmail, privateKey, sharedDriveId, folderId } = params;
  const token = await getAccessToken(clientEmail, privateKey);

  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({
      q: `mimeType='application/epub+zip'${folderId ? ` and '${folderId}' in parents` : ""} and trashed=false`,
      fields: "nextPageToken,files(id,name,size,modifiedTime)",
      pageSize: "1000",
      ...(sharedDriveId && {
        driveId: sharedDriveId,
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
        corpora: "drive",
      }),
      ...(pageToken && { pageToken }),
    });

    const res = await fetch(`${DRIVE_API}/files?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { files, token };
}

// Faz download de um ficheiro autenticado via service account
export async function downloadFromDrive(fileId: string, token: string): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Drive download failed: ${res.status} ${res.statusText}`);
  }

  return res.arrayBuffer();
}
// Download autenticado sem precisar de passar o token externamente
export async function downloadFromDriveWithConfig(fileId: string): Promise<ArrayBuffer> {
  const { getServerConfig } = await import("@/lib/env");
  const config = getServerConfig();
  const token = await getAccessToken(config.googleClientEmail, config.googlePrivateKey);
  return downloadFromDrive(fileId, token);
}
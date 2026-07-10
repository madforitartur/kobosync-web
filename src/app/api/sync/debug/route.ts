import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime     = "nodejs";
export const maxDuration = 30;

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function getToken(email: string, key: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: email, scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: TOKEN_URL, iat: now, exp: now + 3600,
    })).toString("base64url");
    const unsigned = `${header}.${payload}`;
    const pem = key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
    const buf = Buffer.from(pem, "base64");
    const ck  = await crypto.subtle.importKey("pkcs8", buf, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", ck, new TextEncoder().encode(unsigned))).toString("base64url");
    const jwt = `${unsigned}.${sig}`;
    const res  = await fetch(TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const data = await res.json();
    if (!data.access_token) return { ok: false, error: `Token error: ${JSON.stringify(data)}` };
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function GET() {
  try {
    const config = getServerConfig();
    const diag: Record<string, unknown> = {};

    // 1. Configuração
    diag.config = {
      hasClientEmail:    !!config.googleClientEmail,
      clientEmailPrefix: config.googleClientEmail?.slice(0, 20) + "...",
      hasPrivateKey:     !!config.googlePrivateKey,
      privateKeyStart:   config.googlePrivateKey?.slice(0, 30),
      sharedDriveId:     config.googleSharedDriveId ?? null,
      folderId:          config.googleDriveFolderId ?? null,
    };

    // 2. Autenticação
    const tokenResult = await getToken(config.googleClientEmail, config.googlePrivateKey);
    if (!tokenResult.ok) {
      return NextResponse.json({ step: "auth_failed", ...diag, authError: tokenResult.error });
    }
    const token = tokenResult.token;
    diag.auth = "OK";

    // 3. Testa acesso à Drive raiz (sem filtros)
    const rootParams = new URLSearchParams({
      q:        "trashed=false",
      fields:   "files(id,name,mimeType)",
      pageSize: "5",
      includeItemsFromAllDrives: "true",
      supportsAllDrives:         "true",
      ...(config.googleSharedDriveId ? {
        driveId: config.googleSharedDriveId,
        corpora:  "drive",
      } : { corpora: "user" }),
    });
    const rootRes  = await fetch(`${DRIVE_API}/files?${rootParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rootData = await rootRes.json();
    diag.rootQuery = {
      status:   rootRes.status,
      total:    rootData.files?.length ?? 0,
      sample:   (rootData.files ?? []).slice(0, 3).map((f: { id: string; name: string; mimeType: string }) => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      error:    rootData.error ?? null,
    };

    // 4. Se tem folderId, testa acesso directo a essa pasta
    if (config.googleDriveFolderId) {
      const folderRes  = await fetch(
        `${DRIVE_API}/files/${config.googleDriveFolderId}?supportsAllDrives=true&fields=id,name,mimeType`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const folderData = await folderRes.json();
      diag.folderCheck = {
        status:   folderRes.status,
        id:       folderData.id,
        name:     folderData.name,
        mimeType: folderData.mimeType,
        error:    folderData.error ?? null,
      };

      // 5. Lista ficheiros directamente dentro da pasta
      const inFolderParams = new URLSearchParams({
        q:        `'${config.googleDriveFolderId}' in parents and trashed=false`,
        fields:   "files(id,name,mimeType)",
        pageSize: "10",
        includeItemsFromAllDrives: "true",
        supportsAllDrives:         "true",
        ...(config.googleSharedDriveId ? { driveId: config.googleSharedDriveId, corpora: "drive" } : {}),
      });
      const inFolderRes  = await fetch(`${DRIVE_API}/files?${inFolderParams}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const inFolderData = await inFolderRes.json();
      diag.folderContents = {
        status: inFolderRes.status,
        total:  inFolderData.files?.length ?? 0,
        files:  (inFolderData.files ?? []).map((f: { id: string; name: string; mimeType: string }) => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
        error:  inFolderData.error ?? null,
      };
    }

    // 6. Pesquisa por .epub sem qualquer filtro de pasta
    const epubParams = new URLSearchParams({
      q:        "name contains '.epub' and trashed=false",
      fields:   "files(id,name,mimeType,size)",
      pageSize: "10",
      includeItemsFromAllDrives: "true",
      supportsAllDrives:         "true",
      ...(config.googleSharedDriveId ? { driveId: config.googleSharedDriveId, corpora: "drive" } : { corpora: "user" }),
    });
    const epubRes  = await fetch(`${DRIVE_API}/files?${epubParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const epubData = await epubRes.json();
    diag.epubQuery = {
      status: epubRes.status,
      total:  epubData.files?.length ?? 0,
      sample: (epubData.files ?? []).slice(0, 5).map((f: { id: string; name: string; mimeType: string }) => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      error:  epubData.error ?? null,
    };

    // 7. Info BD
    const supabase = createServiceClient();
    const { count } = await supabase.from("books").select("*", { count: "exact", head: true });
    diag.dbBooks = count ?? 0;

    return NextResponse.json(diag, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

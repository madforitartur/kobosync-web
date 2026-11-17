import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getServerConfig } from "@/lib/env";
import { getDriveFolderInfo, parseFolderIds } from "@/lib/google-drive";
import { addStoredFolder, listStoredFolders, removeStoredFolder } from "@/lib/firebase/drive-folders";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const cfg = getServerConfig();
  return NextResponse.json(
    { folders: await listStoredFolders(), envFolders: parseFolderIds(cfg.googleDriveFolderId), serviceEmail: cfg.googleClientEmail },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = parseFolderIds(typeof body?.link === "string" ? body.link.slice(0, 500) : "")[0];
  if (!id) return NextResponse.json({ error: "Cola o link da pasta do Google Drive." }, { status: 400 });
  try {
    const cfg = getServerConfig();
    const info = await getDriveFolderInfo(cfg.googleClientEmail, cfg.googlePrivateKey, id);
    const folders = await addStoredFolder(info);
    return NextResponse.json({ folders, added: info }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseFolderIds(request.nextUrl.searchParams.get("id"))[0];
  if (!id) return NextResponse.json({ error: "Pasta inválida." }, { status: 400 });
  return NextResponse.json({ folders: await removeStoredFolder(id) }, { headers: NO_STORE });
}
